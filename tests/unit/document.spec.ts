import { describe, expect, it } from "vitest";
import { createDocument, defaultPiece } from "@/lib/document/defaults";
import { saveMosaicFile, loadMosaicFile } from "@/lib/document/file";
import { commit, createHistory, redo, undo } from "@/lib/document/history";
import {
  DocumentError,
  addPiece,
  deletePiece,
  duplicatePiece,
  movePlacement,
  placePiece,
  removePlacements,
  reorderPlacements,
  setLocked,
  updatePiece,
} from "@/lib/document/ops";
import { InvalidDocumentError, parseDocument } from "@/lib/document/validate";
import type { AssetStore, MosaicDocument } from "@/lib/document/types";

function docWithPlacedPiece() {
  const piece = defaultPiece(0);
  let doc = addPiece(createDocument(), piece);
  const placed = placePiece(doc, piece.id, { x: 10, y: 20, rotation: 0.3 });
  doc = placed.doc;
  return { doc, piece, placementId: placed.id };
}

describe("document operations", () => {
  it("edits a piece that is not placed", () => {
    const piece = defaultPiece(0);
    const doc = addPiece(createDocument(), piece);
    const next = updatePiece(doc, { ...piece, texture: { kind: "plain", color: "#123456" } });
    expect(next.pieces[0].texture).toEqual({ kind: "plain", color: "#123456" });
  });

  it("refuses to edit a placed piece, and a duplicate is editable (D002)", () => {
    const { doc, piece } = docWithPlacedPiece();
    expect(() => updatePiece(doc, { ...piece, name: "x", texture: { kind: "plain", color: "#000000" } })).toThrow(DocumentError);
    const dup = duplicatePiece(doc, piece.id, "Copy");
    expect(dup.doc.pieces).toHaveLength(2);
    const copy = dup.doc.pieces[1];
    expect(copy.id).not.toBe(piece.id);
    expect(() => updatePiece(dup.doc, { ...copy, texture: { kind: "plain", color: "#000000" } })).not.toThrow();
  });

  it("places a template any number of times", () => {
    const { doc, piece } = docWithPlacedPiece();
    const twice = placePiece(doc, piece.id, { x: 0, y: 0, rotation: 0 }).doc;
    expect(twice.placements.filter((p) => p.pieceId === piece.id)).toHaveLength(2);
  });

  it("refuses to move or remove a locked placement, but unlocks", () => {
    const { doc, placementId } = docWithPlacedPiece();
    const locked = setLocked(doc, [placementId], true);
    expect(() => movePlacement(locked, placementId, { x: 0, y: 0, rotation: 0 })).toThrow(DocumentError);
    expect(() => removePlacements(locked, [placementId])).toThrow(DocumentError);
    const unlocked = setLocked(locked, [placementId], false);
    expect(movePlacement(unlocked, placementId, { x: 1, y: 2, rotation: 0 }).placements[0].pose).toEqual({ x: 1, y: 2, rotation: 0 });
  });

  it("deletes a piece with its placements", () => {
    const { doc, piece } = docWithPlacedPiece();
    const next = deletePiece(doc, piece.id);
    expect(next.pieces).toHaveLength(0);
    expect(next.placements).toHaveLength(0);
  });

  it("reorders placements", () => {
    let { doc } = docWithPlacedPiece();
    const pid = doc.pieces[0].id;
    doc = placePiece(doc, pid, { x: 0, y: 0, rotation: 0 }).doc;
    doc = placePiece(doc, pid, { x: 0, y: 0, rotation: 0 }).doc;
    const [a, b, c] = doc.placements.map((p) => p.id);
    expect(reorderPlacements(doc, [a], "front").placements.map((p) => p.id)).toEqual([b, c, a]);
    expect(reorderPlacements(doc, [c], "back").placements.map((p) => p.id)).toEqual([c, a, b]);
    expect(reorderPlacements(doc, [a], "forward").placements.map((p) => p.id)).toEqual([b, a, c]);
    expect(reorderPlacements(doc, [c], "backward").placements.map((p) => p.id)).toEqual([a, c, b]);
  });
});

describe("history", () => {
  it("undoes and redoes", () => {
    let h = createHistory(1);
    h = commit(h, 2);
    h = commit(h, 3);
    h = undo(h);
    expect(h.present).toBe(2);
    h = redo(h);
    expect(h.present).toBe(3);
    h = undo(undo(h));
    h = commit(h, 9);
    expect(h.future).toHaveLength(0);
    expect(h.present).toBe(9);
  });
});

describe("file", () => {
  it("saves and loads a document with an asset, identical", async () => {
    let { doc } = docWithPlacedPiece();
    const piece = { ...defaultPiece(1), texture: { kind: "image" as const, assetId: "asset-1" } };
    doc = addPiece(doc, piece);
    doc = {
      ...doc,
      assets: [
        { id: "asset-1", name: "paper.jpg", mime: "image/jpeg", kind: "image" },
        { id: "unused", name: "x.png", mime: "image/png", kind: "image" },
      ],
    };
    const store: AssetStore = new Map([
      ["asset-1", new Uint8Array([1, 2, 3, 4])],
      ["unused", new Uint8Array([9])],
    ]);
    const bytes = await saveMosaicFile(doc, store);
    const loaded = await loadMosaicFile(bytes);
    expect(loaded.warnings).toEqual([]);
    expect(loaded.doc).toEqual({ ...doc, assets: [doc.assets[0]] });
    expect([...loaded.store.keys()]).toEqual(["asset-1"]);
    expect(Array.from(loaded.store.get("asset-1")!)).toEqual([1, 2, 3, 4]);
  });

  it("refuses something that is not a mosaic file", async () => {
    await expect(loadMosaicFile(new Uint8Array([1, 2, 3]))).rejects.toThrow(InvalidDocumentError);
  });
});

describe("validation", () => {
  it("refuses a newer version", () => {
    expect(() => parseDocument({ version: 99 })).toThrow(InvalidDocumentError);
  });

  it("repairs bad values and drops dangling placements", () => {
    const { doc } = docWithPlacedPiece();
    const raw = JSON.parse(JSON.stringify(doc)) as MosaicDocument & Record<string, unknown>;
    (raw.board as unknown as Record<string, unknown>).margin = -40;
    (raw.pieces[0].texture as unknown as Record<string, unknown>).color = "red; drop table";
    raw.placements.push({ id: "x", pieceId: "missing", pose: { x: 0, y: 0, rotation: 0 }, locked: false });
    const { doc: parsed, warnings } = parseDocument(raw);
    expect(parsed.board.margin).toBe(0);
    expect(parsed.pieces[0].texture).toEqual({ kind: "plain", color: "#888888" });
    expect(parsed.placements).toHaveLength(1);
    expect(warnings.length).toBe(1);
  });

  it("resets a texture whose asset is missing", () => {
    const piece = { ...defaultPiece(0), texture: { kind: "image" as const, assetId: "gone" } };
    const doc = addPiece(createDocument(), piece);
    const { doc: parsed, warnings } = parseDocument(JSON.parse(JSON.stringify(doc)), new Set());
    expect(parsed.pieces[0].texture.kind).toBe("plain");
    expect(warnings).toHaveLength(1);
  });
});
