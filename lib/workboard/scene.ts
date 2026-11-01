import type { MosaicDocument, Placement } from "../document/types";
import { type Bounds, expandBounds, pointInPolygon, polygonBounds, type Polygon, unionBounds } from "../geometry/polygon";
import { transformPolygon } from "../geometry/pose";
import type { Vec } from "../geometry/vec";
import { pieceOutline } from "../shapes/outline";
import { getPiece } from "../document/ops";

export interface PlacedShape {
  outline: Polygon;
  bounds: Bounds;
}

const worldCache = new WeakMap<Placement, PlacedShape>();

/** A placement's outline in board coordinates. Cached per placement object (placements are replaced, not mutated). */
export function placedShape(doc: MosaicDocument, placement: Placement): PlacedShape {
  let s = worldCache.get(placement);
  if (!s) {
    const outline = transformPolygon(pieceOutline(getPiece(doc, placement.pieceId)), placement.pose);
    s = { outline, bounds: polygonBounds(outline) };
    worldCache.set(placement, s);
  }
  return s;
}

/** The topmost placement under a board point, or null. */
export function hitTest(doc: MosaicDocument, p: Vec): Placement | null {
  for (let i = doc.placements.length - 1; i >= 0; i--) {
    const s = placedShape(doc, doc.placements[i]);
    const b = s.bounds;
    if (p.x < b.minX || p.x > b.maxX || p.y < b.minY || p.y > b.maxY) continue;
    if (pointInPolygon(p, s.outline)) return doc.placements[i];
  }
  return null;
}

const contentCache = new WeakMap<MosaicDocument, Map<string, Bounds | null>>();

/** The bounds of every placed piece but `exclude`, or null if there are none. Cached per document object. */
function contentBounds(doc: MosaicDocument, exclude = ""): Bounds | null {
  let byExclude = contentCache.get(doc);
  if (!byExclude) contentCache.set(doc, (byExclude = new Map()));
  if (byExclude.has(exclude)) return byExclude.get(exclude)!;
  let b: Bounds | null = null;
  for (const pl of doc.placements) {
    if (pl.id === exclude) continue;
    const s = placedShape(doc, pl).bounds;
    b = b ? unionBounds(b, s) : s;
  }
  byExclude.set(exclude, b);
  return b;
}

/**
 * The artwork's extent: the placed pieces plus the background's padding. The workspace has no fixed size; this is
 * the area the background covers and the export crops to. Mid-drag, `moving` names the placement in hand (left out,
 * if it is already on the board) and its bounds where it is now (added), so the background follows the piece.
 */
export function artworkBounds(doc: MosaicDocument, moving?: { exclude?: string; bounds: Bounds }): Bounds | null {
  const rest = contentBounds(doc, moving?.exclude);
  const b = moving ? (rest ? unionBounds(rest, moving.bounds) : moving.bounds) : rest;
  return b ? expandBounds(b, doc.background.padding) : null;
}
