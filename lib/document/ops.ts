import type { Pose } from "../geometry/pose";
import { newId } from "./defaults";
import type { AssetMeta, Background, BoardSettings, MosaicDocument, Piece, Placement } from "./types";
import { pieceOutline } from "../shapes/outline";

/** An operation the document refuses, with the reason the interface explains to the user. */
export class DocumentError extends Error {
  constructor(
    readonly code: "piece-placed" | "piece-missing" | "placement-missing" | "placement-locked",
    detail: string
  ) {
    super(`${code}: ${detail}`);
    this.name = "DocumentError";
  }
}

export function getPiece(doc: MosaicDocument, id: string): Piece {
  const p = doc.pieces.find((x) => x.id === id);
  if (!p) throw new DocumentError("piece-missing", id);
  return p;
}

export function getPlacement(doc: MosaicDocument, id: string): Placement {
  const p = doc.placements.find((x) => x.id === id);
  if (!p) throw new DocumentError("placement-missing", id);
  return p;
}

export const isPiecePlaced = (doc: MosaicDocument, pieceId: string) => doc.placements.some((p) => p.pieceId === pieceId);

export const placementCount = (doc: MosaicDocument, pieceId: string) => doc.placements.filter((p) => p.pieceId === pieceId).length;

/** Adds a piece. Its outline is built first, so a piece that can't be cut is refused with an `OutlineError`. */
export function addPiece(doc: MosaicDocument, piece: Piece): MosaicDocument {
  pieceOutline(piece);
  return { ...doc, pieces: [...doc.pieces, piece] };
}

/**
 * Replaces a piece. Refused once the piece is on the workboard (placed pieces never change, D002), or with an
 * `OutlineError` if its shape can't make a piece.
 */
export function updatePiece(doc: MosaicDocument, piece: Piece): MosaicDocument {
  getPiece(doc, piece.id);
  if (isPiecePlaced(doc, piece.id)) throw new DocumentError("piece-placed", piece.id);
  // Builds (and caches) the outline: a shape that can't make a piece is refused here, before it reaches the document.
  pieceOutline(piece);
  return { ...doc, pieces: doc.pieces.map((p) => (p.id === piece.id ? piece : p)) };
}

/** An editable copy of a piece, inserted after it. This is how a placed piece gets a variant (D002). */
export function duplicatePiece(doc: MosaicDocument, id: string, name: string, copyId = newId()): { doc: MosaicDocument; id: string } {
  const src = getPiece(doc, id);
  const copy: Piece = structuredClone(src);
  copy.id = copyId;
  copy.name = name;
  const i = doc.pieces.indexOf(src);
  const pieces = [...doc.pieces.slice(0, i + 1), copy, ...doc.pieces.slice(i + 1)];
  return { doc: { ...doc, pieces }, id: copy.id };
}

/** Removes a piece and every placement of it. The interface asks first when it has placements. */
export function deletePiece(doc: MosaicDocument, id: string): MosaicDocument {
  getPiece(doc, id);
  return { ...doc, pieces: doc.pieces.filter((p) => p.id !== id), placements: doc.placements.filter((p) => p.pieceId !== id) };
}

export function renamePiece(doc: MosaicDocument, id: string, name: string): MosaicDocument {
  getPiece(doc, id);
  // The name is a label in the library, not part of the piece's look, so renaming a placed piece is allowed.
  return { ...doc, pieces: doc.pieces.map((p) => (p.id === id ? { ...p, name } : p)) };
}

export function placePiece(doc: MosaicDocument, pieceId: string, pose: Pose, id = newId()): { doc: MosaicDocument; id: string } {
  getPiece(doc, pieceId);
  const placement: Placement = { id, pieceId, pose: { ...pose }, locked: false };
  return { doc: { ...doc, placements: [...doc.placements, placement] }, id: placement.id };
}

/** Moves (and turns) a placement. Locked placements refuse. */
export function movePlacement(doc: MosaicDocument, id: string, pose: Pose): MosaicDocument {
  const pl = getPlacement(doc, id);
  if (pl.locked) throw new DocumentError("placement-locked", id);
  return { ...doc, placements: doc.placements.map((p) => (p.id === id ? { ...p, pose: { ...pose } } : p)) };
}

export function setLocked(doc: MosaicDocument, ids: readonly string[], locked: boolean): MosaicDocument {
  const set = new Set(ids);
  return { ...doc, placements: doc.placements.map((p) => (set.has(p.id) ? { ...p, locked } : p)) };
}

/** Removes placements from the board. Locked ones refuse: unlock first, like moving. */
export function removePlacements(doc: MosaicDocument, ids: readonly string[]): MosaicDocument {
  const set = new Set(ids);
  const locked = doc.placements.find((p) => set.has(p.id) && p.locked);
  if (locked) throw new DocumentError("placement-locked", locked.id);
  return { ...doc, placements: doc.placements.filter((p) => !set.has(p.id)) };
}

export type ZMove = "front" | "back" | "forward" | "backward";

/** Changes drawing order; only meaningful when overlap is allowed. Keeps the selected placements' relative order. */
export function reorderPlacements(doc: MosaicDocument, ids: readonly string[], move: ZMove): MosaicDocument {
  const set = new Set(ids);
  const list = doc.placements.slice();
  if (move === "front") return { ...doc, placements: [...list.filter((p) => !set.has(p.id)), ...list.filter((p) => set.has(p.id))] };
  if (move === "back") return { ...doc, placements: [...list.filter((p) => set.has(p.id)), ...list.filter((p) => !set.has(p.id))] };
  if (move === "forward") {
    for (let i = list.length - 2; i >= 0; i--) {
      if (set.has(list[i].id) && !set.has(list[i + 1].id)) [list[i], list[i + 1]] = [list[i + 1], list[i]];
    }
  } else {
    for (let i = 1; i < list.length; i++) {
      if (set.has(list[i].id) && !set.has(list[i - 1].id)) [list[i], list[i - 1]] = [list[i - 1], list[i]];
    }
  }
  return { ...doc, placements: list };
}

export function setBoard(doc: MosaicDocument, board: Partial<BoardSettings>): MosaicDocument {
  return { ...doc, board: { ...doc.board, ...board } };
}

export function setBackground(doc: MosaicDocument, background: Background): MosaicDocument {
  return { ...doc, background };
}

export function addAsset(doc: MosaicDocument, asset: AssetMeta): MosaicDocument {
  return { ...doc, assets: [...doc.assets, asset] };
}

/** Ids of assets referred to by a piece or the background; everything else is dropped when saving. */
export function usedAssetIds(doc: MosaicDocument): Set<string> {
  const ids = new Set<string>();
  for (const p of doc.pieces) if (p.texture.kind === "image" || p.texture.kind === "pdf") ids.add(p.texture.assetId);
  if (doc.background.kind === "image") ids.add(doc.background.assetId);
  return ids;
}
