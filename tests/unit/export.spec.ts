import { describe, expect, it } from "vitest";
import { createDocument, defaultPiece, defaultTornEdge } from "@/lib/document/defaults";
import { addPiece, placePiece, usedAssetIds } from "@/lib/document/ops";
import type { MosaicDocument, Piece } from "@/lib/document/types";
import { parseDocument } from "@/lib/document/validate";
import { MAX_EXPORT_PIXELS, exportPlan } from "@/lib/export/plan";
import { polygonBounds } from "@/lib/geometry/polygon";
import { renderBackground } from "@/lib/render/background";
import { pieceShadow } from "@/lib/render/shadow";
import { shapeOutline } from "@/lib/shapes/outline";

const NO_IMAGES = () => undefined;

function withPiece(piece: Piece, x = 0, y = 0): MosaicDocument {
  const doc = addPiece(createDocument(), piece);
  return placePiece(doc, piece.id, { x, y, rotation: 0 }).doc;
}

describe("background", () => {
  it("reads a file from before D014, whose background was a bare colour", () => {
    const old = { ...JSON.parse(JSON.stringify(createDocument())), background: { kind: "color", color: "#123456", padding: 7 } };
    const { doc, warnings } = parseDocument(old);
    expect(doc.background.texture).toEqual({ kind: "plain", color: "#123456" });
    expect(doc.background.padding).toBe(7);
    expect(warnings).toEqual([]);
  });

  it("reads the generated and picture backgrounds from before D014", () => {
    const base = JSON.parse(JSON.stringify(createDocument()));
    const generated = parseDocument({
      ...base,
      background: { kind: "texture", generatorId: "marble", params: {}, colors: ["#112233", "#ddeeff"], seed: 9, padding: 4 },
    });
    expect(generated.doc.background.texture).toMatchObject({ kind: "generated", generatorId: "marble", seed: 9 });
    expect(generated.doc.background.padding).toBe(4);
    const picture = parseDocument({ ...base, background: { kind: "image", assetId: "gone", fit: "tile", padding: 3 } });
    // The picture's bytes are not in this file: it falls back with a warning, as a current one would.
    expect(picture.doc.background.texture.kind).toBe("plain");
    expect(picture.warnings.length).toBe(1);
  });

  it("falls back to the default colour when its picture is missing, and says so", () => {
    const raw = {
      ...JSON.parse(JSON.stringify(createDocument())),
      background: { texture: { kind: "image", assetId: "gone" }, padding: 5 },
    };
    const { doc, warnings } = parseDocument(raw);
    expect(doc.background.texture.kind).toBe("plain");
    expect(warnings.join(" ")).toMatch(/background/);
  });

  it("keeps its picture's asset when the file is saved", () => {
    const doc = createDocument();
    const withImage = { ...doc, background: { ...doc.background, texture: { kind: "pdf" as const, assetId: "a1", page: 2 } } };
    expect([...usedAssetIds(withImage)]).toEqual(["a1"]);
  });

  it("renders a generated texture over the bounds, opaque, at the asked scale", () => {
    const bg = {
      ...createDocument().background,
      texture: { kind: "generated" as const, generatorId: "clouds", params: {}, colors: ["#000000", "#ffffff"], seed: 3 },
    };
    const r = renderBackground(bg, { minX: -10, minY: -5, maxX: 10, maxY: 5 }, 2, NO_IMAGES);
    expect([r.image.width, r.image.height]).toEqual([40, 20]);
    const d = r.image.data;
    let min = 255;
    let max = 0;
    for (let i = 0; i < d.length; i += 4) {
      expect(d[i + 3]).toBe(255);
      min = Math.min(min, d[i]);
      max = Math.max(max, d[i]);
    }
    // A texture, not a flat fill.
    expect(max - min).toBeGreaterThan(40);
  });
});

describe("export plan", () => {
  it("covers the pieces plus the padding, sized by the resolution", () => {
    const piece = defaultPiece(0);
    const doc = withPiece(piece);
    const b = polygonBounds(shapeOutline(piece.shape));
    const plan = exportPlan(doc, 254)!; // 10 px/mm
    const pad = doc.background.padding;
    expect(plan.pxPerMm).toBeCloseTo(10, 9);
    expect(plan.width).toBe(Math.ceil((b.maxX - b.minX + 2 * pad) * 10));
    expect(plan.height).toBe(Math.ceil((b.maxY - b.minY + 2 * pad) * 10));
    expect(plan.tooBig).toBe(false);
  });

  it("reaches past the outline as far as a torn edge's fibres do", () => {
    const flat = defaultPiece(0);
    const torn = { ...flat, edge: { ...defaultTornEdge(4), enabled: true, roughness: 2, fibres: 20 } };
    const plain = exportPlan({ ...withPiece(flat), background: { ...createDocument().background, padding: 0 } }, 254)!;
    const tornPlan = exportPlan({ ...withPiece(torn), background: { ...createDocument().background, padding: 0 } }, 254)!;
    expect(tornPlan.bounds.maxX).toBeGreaterThan(plain.bounds.maxX);
  });

  it("is null with nothing placed, and refuses sizes the browsers cannot draw", () => {
    expect(exportPlan(createDocument(), 300)).toBeNull();
    const doc = withPiece(defaultPiece(0));
    const far = placePiece(doc, doc.pieces[0].id, { x: 5000, y: 5000, rotation: 0 }).doc;
    const plan = exportPlan(far, 600)!;
    expect(plan.width * plan.height).toBeGreaterThan(MAX_EXPORT_PIXELS);
    expect(plan.tooBig).toBe(true);
  });

  it("scales the shadow with the artwork, matching the board at 4 px/mm", () => {
    expect(pieceShadow(0.5, 2).blur).toBe(2 * pieceShadow(0.5).blur);
    expect(pieceShadow(0, 1).alpha).toBe(0);
  });
});
