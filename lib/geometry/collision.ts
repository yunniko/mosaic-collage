import { type Bounds, boundsOverlap, expandBounds, perimeter, pointInPolygon, polygonBounds, segmentsIntersect } from "./polygon";
import { closestOnSegment, type Vec } from "./vec";

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
  rows: number;
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
  const rows = Math.ceil((bounds.maxY - bounds.minY) / cell) + 1;
  const ix: EdgeIndex = { poly, bounds, reach, cell, cols, rows, grid: new Map(), seen: new Int32Array(n), stamp: 0 };
  for (let i = 0; i < n; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % n];
    const r = cellRange(ix, Math.min(a.x, b.x) - reach, Math.min(a.y, b.y) - reach, Math.max(a.x, b.x) + reach, Math.max(a.y, b.y) + reach);
    for (let y = r.y0; y <= r.y1; y++) {
      for (let x = r.x0; x <= r.x1; x++) {
        const key = y * cols + x;
        const bucket = ix.grid.get(key);
        if (bucket) bucket.push(i);
        else ix.grid.set(key, [i]);
      }
    }
  }
  return ix;
}

/** The grid cells a box covers, clamped to the index. */
function cellRange(ix: EdgeIndex, x0: number, y0: number, x1: number, y1: number) {
  const { bounds: b, cell } = ix;
  return {
    x0: Math.max(0, Math.floor((x0 - b.minX) / cell)),
    y0: Math.max(0, Math.floor((y0 - b.minY) / cell)),
    x1: Math.min(ix.cols - 1, Math.floor((x1 - b.minX) / cell)),
    y1: Math.min(ix.rows - 1, Math.floor((y1 - b.minY) / cell)),
  };
}

/** Indices of the fixed edges that may lie within the index's reach of segment a–b, each once. */
function nearEdges(ix: EdgeIndex, a: Vec, b: Vec): number[] {
  if (++ix.stamp === 0x7fffffff) {
    ix.seen.fill(0);
    ix.stamp = 1;
  }
  const out: number[] = [];
  const r = cellRange(ix, Math.min(a.x, b.x), Math.min(a.y, b.y), Math.max(a.x, b.x), Math.max(a.y, b.y));
  for (let y = r.y0; y <= r.y1; y++) {
    for (let x = r.x0; x <= r.x1; x++) {
      const bucket = ix.grid.get(y * ix.cols + x);
      if (!bucket) continue;
      for (const j of bucket) {
        if (ix.seen[j] === ix.stamp) continue;
        ix.seen[j] = ix.stamp;
        out.push(j);
      }
    }
  }
  return out;
}

/** Squared distance from p to segment a–b, without allocating. */
function pointSegmentDist2(px: number, py: number, a: Vec, b: Vec): number {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const len2 = abx * abx + aby * aby;
  let t = len2 === 0 ? 0 : ((px - a.x) * abx + (py - a.y) * aby) / len2;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const dx = a.x + abx * t - px;
  const dy = a.y + aby * t - py;
  return dx * dx + dy * dy;
}

/** True when segments a–b and c–d come closer than `clearance` (or cross). The hot test of `clashes`. */
function segmentsWithin(a: Vec, b: Vec, c: Vec, d: Vec, clearance: number): boolean {
  // Boxes further apart than the clearance can't be that close.
  if (Math.min(a.x, b.x) - Math.max(c.x, d.x) >= clearance || Math.min(c.x, d.x) - Math.max(a.x, b.x) >= clearance) return false;
  if (Math.min(a.y, b.y) - Math.max(c.y, d.y) >= clearance || Math.min(c.y, d.y) - Math.max(a.y, b.y) >= clearance) return false;
  if (segmentsIntersect(a, b, c, d)) return true;
  const c2 = clearance * clearance;
  return (
    pointSegmentDist2(a.x, a.y, c, d) < c2 ||
    pointSegmentDist2(b.x, b.y, c, d) < c2 ||
    pointSegmentDist2(c.x, c.y, a, b) < c2 ||
    pointSegmentDist2(d.x, d.y, a, b) < c2
  );
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
  // The nearest pair always includes an endpoint of one segment.
  const candidates = [
    { gap: Math.sqrt(pointSegmentDist2(a.x, a.y, c, d)), at: a },
    { gap: Math.sqrt(pointSegmentDist2(b.x, b.y, c, d)), at: b },
    { gap: Math.sqrt(pointSegmentDist2(c.x, c.y, a, b)), at: c },
    { gap: Math.sqrt(pointSegmentDist2(d.x, d.y, a, b)), at: d },
  ];
  let best = candidates[0];
  for (const k of candidates) if (k.gap < best.gap) best = k;
  // From c or d, the reported point is its foot on a–b.
  return best.at === c || best.at === d ? { gap: best.gap, at: closestOnSegment(best.at, a, b).point } : best;
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
    for (const j of nearEdges(fixed, a, b)) {
      const c = f[j];
      const d = f[(j + 1) % m];
      if (clearance > 0 ? segmentsWithin(a, b, c, d, clearance) : segmentsIntersect(a, b, c, d)) return true;
    }
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
    for (const j of nearEdges(fixed, a, b)) {
      const g = segmentGap(a, b, f[j], f[(j + 1) % m]);
      if (g.gap <= fixed.reach && (!best || g.gap < best.gap)) best = g;
    }
  }
  return best;
}
