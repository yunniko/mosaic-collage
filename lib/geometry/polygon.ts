import { type Vec, cross, sub } from "./vec";

/** A closed outline: the last point joins the first. Never repeats the first point at the end. */
export type Polygon = Vec[];

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export const boundsWidth = (b: Bounds) => b.maxX - b.minX;
export const boundsHeight = (b: Bounds) => b.maxY - b.minY;

export function polygonBounds(poly: readonly Vec[]): Bounds {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of poly) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}

export function unionBounds(a: Bounds, b: Bounds): Bounds {
  return { minX: Math.min(a.minX, b.minX), minY: Math.min(a.minY, b.minY), maxX: Math.max(a.maxX, b.maxX), maxY: Math.max(a.maxY, b.maxY) };
}

export function expandBounds(b: Bounds, by: number): Bounds {
  return { minX: b.minX - by, minY: b.minY - by, maxX: b.maxX + by, maxY: b.maxY + by };
}

export function boundsOverlap(a: Bounds, b: Bounds): boolean {
  return a.minX <= b.maxX && b.minX <= a.maxX && a.minY <= b.maxY && b.minY <= a.maxY;
}

/** Signed area: positive when the points run counter-clockwise in a y-up frame. */
export function signedArea(poly: readonly Vec[]): number {
  let a = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    a += poly[j].x * poly[i].y - poly[i].x * poly[j].y;
  }
  return a / 2;
}

export const area = (poly: readonly Vec[]) => Math.abs(signedArea(poly));

/** The area centroid. Falls back to the vertex mean for a degenerate outline. */
export function centroid(poly: readonly Vec[]): Vec {
  let a = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const f = poly[j].x * poly[i].y - poly[i].x * poly[j].y;
    a += f;
    cx += (poly[j].x + poly[i].x) * f;
    cy += (poly[j].y + poly[i].y) * f;
  }
  if (Math.abs(a) < 1e-12) {
    const n = poly.length || 1;
    return { x: poly.reduce((s, p) => s + p.x, 0) / n, y: poly.reduce((s, p) => s + p.y, 0) / n };
  }
  return { x: cx / (3 * a), y: cy / (3 * a) };
}

/** Even-odd point-in-polygon test. */
export function pointInPolygon(p: Vec, poly: readonly Vec[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

export function translatePolygon(poly: readonly Vec[], dx: number, dy: number): Polygon {
  return poly.map((p) => ({ x: p.x + dx, y: p.y + dy }));
}

/** Moves the outline so its area centroid sits at the origin. A piece's local frame is always centred this way. */
export function centerPolygon(poly: readonly Vec[]): Polygon {
  const c = centroid(poly);
  return translatePolygon(poly, -c.x, -c.y);
}

/** Proper intersection of segments a–b and c–d (touching at shared endpoints does not count). */
export function segmentsIntersect(a: Vec, b: Vec, c: Vec, d: Vec): boolean {
  const d1 = cross(sub(b, a), sub(c, a));
  const d2 = cross(sub(b, a), sub(d, a));
  const d3 = cross(sub(d, c), sub(a, c));
  const d4 = cross(sub(d, c), sub(b, c));
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

/** True when no two non-adjacent edges cross. O(n²); outlines are simplified before this is called. */
export function isSimplePolygon(poly: readonly Vec[]): boolean {
  const n = poly.length;
  if (n < 3) return false;
  for (let i = 0; i < n; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % n];
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      if (segmentsIntersect(a, b, poly[j], poly[(j + 1) % n])) return false;
    }
  }
  return true;
}

/** Ramer–Douglas–Peucker simplification of a closed outline, keeping points that deviate more than `tolerance`. */
export function simplifyPolygon(poly: readonly Vec[], tolerance: number): Polygon {
  if (poly.length <= 4 || tolerance <= 0) return poly.slice();
  // Split the ring at its two farthest-apart points (approximated from point 0) so both halves are open polylines.
  let far = 0;
  let farD = -1;
  for (let i = 1; i < poly.length; i++) {
    const d = (poly[i].x - poly[0].x) ** 2 + (poly[i].y - poly[0].y) ** 2;
    if (d > farD) {
      farD = d;
      far = i;
    }
  }
  const first = simplifyOpen(poly.slice(0, far + 1), tolerance);
  const second = simplifyOpen([...poly.slice(far), poly[0]], tolerance);
  const out = [...first.slice(0, -1), ...second.slice(0, -1)];
  return out.length >= 3 ? out : poly.slice();
}

function simplifyOpen(pts: readonly Vec[], tol: number): Vec[] {
  if (pts.length <= 2) return pts.slice();
  const keep = new Uint8Array(pts.length);
  keep[0] = 1;
  keep[pts.length - 1] = 1;
  const stack: [number, number][] = [[0, pts.length - 1]];
  const tol2 = tol * tol;
  while (stack.length) {
    const [s, e] = stack.pop()!;
    let maxD = -1;
    let idx = -1;
    const a = pts[s];
    const b = pts[e];
    const abx = b.x - a.x;
    const aby = b.y - a.y;
    const len2 = abx * abx + aby * aby;
    for (let i = s + 1; i < e; i++) {
      const p = pts[i];
      let d2: number;
      if (len2 === 0) d2 = (p.x - a.x) ** 2 + (p.y - a.y) ** 2;
      else {
        const t = Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.y - a.y) * aby) / len2));
        d2 = (p.x - a.x - abx * t) ** 2 + (p.y - a.y - aby * t) ** 2;
      }
      if (d2 > maxD) {
        maxD = d2;
        idx = i;
      }
    }
    if (maxD > tol2 && idx > 0) {
      keep[idx] = 1;
      stack.push([s, idx], [idx, e]);
    }
  }
  return pts.filter((_, i) => keep[i]);
}

/** Inserts points so no edge is longer than `maxEdge`. Used before displacing an outline. */
export function resamplePolygon(poly: readonly Vec[], maxEdge: number): Polygon {
  const out: Vec[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / maxEdge));
    for (let s = 0; s < steps; s++) out.push({ x: a.x + ((b.x - a.x) * s) / steps, y: a.y + ((b.y - a.y) * s) / steps });
  }
  return out;
}

/** Perimeter length of the closed outline. */
export function perimeter(poly: readonly Vec[]): number {
  let l = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    l += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return l;
}
