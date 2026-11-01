import polygonClipping from "polygon-clipping";
import { type Polygon, area, isSimplePolygon } from "../geometry/polygon";
import type { Vec } from "../geometry/vec";

/** The smallest piece the app makes, in mm². Below this an outline is a slip of the hand, not a piece. */
export const MIN_PIECE_AREA = 4;
/**
 * A self-crossing cut is repaired by keeping its largest part, but only when everything else it encloses is under this
 * share of that part: small loops are trimmed away, a real second piece is refused. See D008.
 */
export const MAX_DROPPED_SHARE = 0.05;

export type OutlineProblem = "too-few-points" | "too-small" | "splits" | "not-simple";

/** An outline that can't be a piece. `problem` picks the message the user sees. */
export class OutlineError extends Error {
  constructor(readonly problem: OutlineProblem) {
    super(`Invalid outline: ${problem}`);
    this.name = "OutlineError";
  }
}

/** Throws an `OutlineError` unless the outline is a simple polygon of at least `MIN_PIECE_AREA`. */
export function checkOutline(poly: readonly Vec[]): void {
  if (poly.length < 3) throw new OutlineError("too-few-points");
  if (area(poly) < MIN_PIECE_AREA) throw new OutlineError("too-small");
  if (!isSimplePolygon(poly)) throw new OutlineError("not-simple");
}

/**
 * A simple outline from one that may cross itself. Crossings are resolved by a polygon union; the largest resulting
 * part is kept with its holes filled. If the parts left out add up to more than `MAX_DROPPED_SHARE` of it, the cut is
 * refused instead, because it describes more than one piece.
 */
export function repairOutline(poly: readonly Vec[]): Polygon {
  if (poly.length < 3) throw new OutlineError("too-few-points");
  const parts = polygonClipping.union([[poly.map((p) => [p.x, p.y] as [number, number])]]);
  if (!parts.length) throw new OutlineError("too-small");
  const rings = parts.map((part) => {
    const ring = part[0].slice(0, -1).map(([x, y]) => ({ x, y }));
    return { ring, area: area(ring) };
  });
  rings.sort((a, b) => b.area - a.area);
  const [best, ...rest] = rings;
  const dropped = rest.reduce((s, r) => s + r.area, 0);
  if (dropped > best.area * MAX_DROPPED_SHARE) throw new OutlineError("splits");
  checkOutline(best.ring);
  return best.ring;
}
