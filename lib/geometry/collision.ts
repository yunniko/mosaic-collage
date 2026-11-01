import { type Bounds, boundsOverlap, expandBounds, perimeter, pointInPolygon, polygonBounds, segmentsIntersect } from "./polygon";
import { closestOnSegment, distance, type Vec } from "./vec";

/**
 * A fixed outline prepared for clearance queries: its edges are bucketed in a uniform grid, each edge in every cell
 * within `reach` of it. A query edge then only meets the fixed edges in the cells its own box touches, so testing two
 * outlines of hundreds of points costs about the length of the moving one, whatever the shapes (concave, hand cut).
 */
export interface EdgeIndex {
  poly: readonly Vec[];
  bounds: Bounds;
  /** How far from an edge it is still found: the clearance asked for, plus slack for contact searches. */
  reach: number;
  cell: number;
  cols: number;
  grid: Map<number, number[]>;
  /** Per-edge visit marks, so an edge in several cells is tested once per query edge. */
  seen: Int32Array;
  stamp: number;
}

export function edgeIndex(poly: readonly Vec[], reach: number): EdgeIndex {
  const n = poly.length;
  const bounds = expandBounds(polygonBounds(poly), reach);
  // Cells about one edge long, but never smaller than the reach, so an edge covers a handful of cells.
  const cell = Math.max(perimeter(poly) / n, reach, 0.25);
  const cols = Math.ceil((bounds.maxX - bounds.minX) / cell) + 1;
  const grid = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % n];
    forCells(
      bounds,
      cell,
      cols,
      Math.min(a.x, b.x) - reach,
      Math.min(a.y, b.y) - reach,
      Math.max(a.x, b.x) + reach,
      Math.max(a.y, b.y) + reach,
      (key) => {
        const bucket = grid.get(key);
        if (bucket) bucket.push(i);
        else grid.set(key, [i]);
      }
    );
  }
  return { poly, bounds, reach, cell, cols, grid, seen: new Int32Array(n), stamp: 0 };
}

function forCells(b: Bounds, cell: number, cols: number, x0: number, y0: number, x1: number, y1: number, visit: (key: number) => void) {
  const cx0 = Math.max(0, Math.floor((x0 - b.minX) / cell));
  const cy0 = Math.max(0, Math.floor((y0 - b.minY) / cell));
  const cx1 = Math.min(cols - 1, Math.floor((x1 - b.minX) / cell));
  const cy1 = Math.floor((y1 - b.minY) / cell);
  const rows = Math.ceil((b.maxY - b.minY) / cell);
  for (let y = cy0; y <= Math.min(cy1, rows); y++) for (let x = cx0; x <= cx1; x++) visit(y * cols + x);
}

/** Calls `visit` with each fixed edge that may lie within the index's reach of segment a–b, each edge once. */
function nearEdges(ix: EdgeIndex, a: Vec, b: Vec, visit: (j: number) => boolean | void): boolean {
  const stamp = ++ix.stamp;
  if (stamp === 0x7fffffff) {
    ix.seen.fill(0);
    ix.stamp = 1;
  }
  let stop = false;
  forCells(ix.bounds, ix.cell, ix.cols, Math.min(a.x, b.x), Math.min(a.y, b.y), Math.max(a.x, b.x), Math.max(a.y, b.y), (key) => {
    if (stop) return;
    const bucket = ix.grid.get(key);
    if (!bucket) return;
    for (const j of bucket) {
      if (ix.seen[j] === ix.stamp) continue;
      ix.seen[j] = ix.stamp;
      if (visit(j)) {
        stop = true;
        return;
      }
    }
  });
  return stop;
}

/** The shortest distance between segments a–b and c–d, and the point on a–b where it is reached. */
export function segmentGap(a: Vec, b: Vec, c: Vec, d: Vec): { gap: number; at: Vec } {
  if (segmentsIntersect(a, b, c, d)) {
    // They cross: the crossing point is where they meet.
    const r = { x: b.x - a.x, y: b.y - a.y };
    const s = { x: d.x - c.x, y: d.y - c.y };
    const t = ((c.x - a.x) * s.y - (c.y - a.y) * s.x) / (r.x * s.y - r.y * s.x);
    return { gap: 0, at: { x: a.x + r.x * t, y: a.y + r.y * t } };
  }
  let best = { gap: Infinity, at: a };
  for (const p of [a, b]) {
    const g = distance(p, closestOnSegment(p, c, d).point);
    if (g < best.gap) best = { gap: g, at: p };
  }
  for (const p of [c, d]) {
    const q = closestOnSegment(p, a, b).point;
    const g = distance(p, q);
    if (g < best.gap) best = { gap: g, at: q };
  }
  return best;
}

/**
 * True when outline `moving` comes closer than `clearance` to the indexed outline, or the two overlap (crossing edges,
 * or one inside the other). With clearance 0, touching is allowed and only overlap counts. `clearance` must not exceed
 * the index's reach.
 */
export function clashes(moving: readonly Vec[], movingBounds: Bounds, fixed: EdgeIndex, clearance: number): boolean {
  if (!boundsOverlap(expandBounds(movingBounds, clearance), fixed.bounds)) return false;
  const n = moving.length;
  const f = fixed.poly;
  const m = f.length;
  for (let i = 0; i < n; i++) {
    const a = moving[i];
    const b = moving[(i + 1) % n];
    const hit = nearEdges(fixed, a, b, (j) => {
      const c = f[j];
      const d = f[(j + 1) % m];
      return clearance > 0 ? segmentGap(a, b, c, d).gap < clearance : segmentsIntersect(a, b, c, d);
    });
    if (hit) return true;
  }
  // No edges meet, so either one outline lies wholly inside the other or they are apart; one vertex each tells which.
  return pointInPolygon(moving[0], f) || pointInPolygon(f[0], moving);
}

/**
 * Where `moving` comes nearest the indexed outline, looking only within the index's reach: the gap and the point on
 * `moving` where it is reached. Null when nothing is that close.
 */
export function nearestApproach(moving: readonly Vec[], fixed: EdgeIndex): { gap: number; at: Vec } | null {
  const n = moving.length;
  const f = fixed.poly;
  const m = f.length;
  let best: { gap: number; at: Vec } | null = null;
  for (let i = 0; i < n; i++) {
    const a = moving[i];
    const b = moving[(i + 1) % n];
    nearEdges(fixed, a, b, (j) => {
      const g = segmentGap(a, b, f[j], f[(j + 1) % m]);
      if (g.gap <= fixed.reach && (!best || g.gap < best.gap)) best = g;
    });
  }
  return best;
}
