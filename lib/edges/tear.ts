import type { TornEdge } from "../document/types";
import { type Polygon, perimeter, resamplePolygon, signedArea } from "../geometry/polygon";
import type { Vec } from "../geometry/vec";
import { createRng, mixSeed } from "../random";
import { OutlineError, checkOutline } from "../shapes/repair";
import { PAPERS } from "./paper";

/** Hurst exponent of a torn paper line, measured at about 0.6–0.8 (D011). Each finer octave has 2^-H the amplitude. */
export const HURST = 0.65;
const GAIN = 2 ** -HURST;
/** The finest wiggle the tear line carries, mm; finer detail is the fuzz and the wisps. */
const MIN_WAVELENGTH = 0.2;
/** Most points a torn outline gets; a longer perimeter is sampled more coarsely. */
const MAX_POINTS = 4000;
/** The slow drift of a hand tear, as a multiple of `scale` (the reference gives 3–10×). */
const DRIFT = 5;
/** Correlation length of the band width along the edge, mm (the reference gives 3–10). */
const BAND_CORRELATION = 6;
/** Brings the noise's peaks to about ±1: its RMS before this is about 0.17 (measured on a 40 mm square, seeds 5–6). */
const NOISE_GAIN = 2.4;
/** Times the roughness is halved looking for a tear that does not cross itself, before the cut line is kept. */
const MAX_HALVINGS = 6;

/** A loose fibre outside the tear: a short polyline in the piece's mm frame. */
export interface Wisp {
  points: Vec[];
  alpha: number;
}

/** A torn outline and what the renderer draws along it. Per-vertex arrays run parallel to `outline`. */
export interface TornOutline {
  outline: Polygon;
  /** Outward unit normal at each vertex. */
  normals: Vec[];
  /** How torn each vertex is, 0 (cut) .. 1 (torn); the coverage window ramps between them. */
  torn: Float32Array;
  /** Width of the light band inside the line at each vertex, mm. */
  band: Float32Array;
  wisps: Wisp[];
  /** Translucent fuzz just outside the line, mm. */
  fuzzWidth: number;
  /** The furthest the fuzz or a wisp reaches outside the outline, mm. */
  reach: number;
}

const mod = (a: number, n: number) => ((a % n) + n) % n;
const smoothstep = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

/** A lattice gradient in [-1, 1], from its stream, octave and (wrapped) cell. */
const gradient = (seed: number, octave: number, cell: number) => (mixSeed(seed, octave, cell) / 2 ** 32) * 2 - 1;

/**
 * Periodic 1D gradient noise at `t` lattice cells, repeating every `period` cells, in [-1, 1]. Periodic so the tear
 * closes on itself without a seam where the outline starts.
 */
function periodicNoise(t: number, period: number, seed: number, octave: number): number {
  const i = Math.floor(t);
  const f = t - i;
  const g0 = gradient(seed, octave, mod(i, period));
  const g1 = gradient(seed, octave, mod(i + 1, period));
  const u = f * f * f * (f * (f * 6 - 15) + 10);
  return 2 * (g0 * f * (1 - u) + g1 * (f - 1) * u);
}

/**
 * Self-affine noise along a closed line of length `length`: octaves from `wavelength` down to `finest`, each 2^-H the
 * amplitude of the one before, plus a drift at `DRIFT`× the wavelength. Divided by the octaves' RMS amplitude, so its
 * spread does not shrink as finer octaves are added; scaled so peaks reach about ±1.
 */
function tearNoise(s: number, length: number, wavelength: number, finest: number, seed: number): number {
  let sum = 0;
  let norm = 0;
  const octave = (o: number, wl: number, amp: number) => {
    const period = Math.max(1, Math.round(length / wl));
    sum += amp * periodicNoise((s / length) * period, period, seed, o);
    norm += amp * amp;
  };
  octave(0, wavelength * DRIFT, 1);
  let amp = 1;
  for (let o = 1, wl = wavelength; wl >= finest && o < 16; o++, wl /= 2, amp *= GAIN) octave(o, wl, amp);
  return (NOISE_GAIN * sum) / Math.sqrt(norm);
}

/** A vertex turning more than this is a corner the tear runs into rather than across (radians). */
const CORNER_TURN = Math.PI / 6;

/**
 * 0 at each sharp corner of the line, rising to 1 at `reach` mm of arc away from it. Displacing both sides of a corner
 * inward by more than their distance from it would cross them, so the tear tapers into corners instead.
 */
function cornerTaper(line: readonly Vec[], arc: Float32Array, length: number, reach: number): Float32Array {
  const n = line.length;
  const corner = line.map((p, i) => {
    const a = line[mod(i - 1, n)];
    const b = line[(i + 1) % n];
    const turn = Math.abs(
      Math.atan2((p.x - a.x) * (b.y - p.y) - (p.y - a.y) * (b.x - p.x), (p.x - a.x) * (b.x - p.x) + (p.y - a.y) * (b.y - p.y))
    );
    return turn > CORNER_TURN;
  });
  const taper = new Float32Array(n).fill(1);
  if (!corner.some(Boolean) || reach <= 0) return taper;
  const dist = new Float32Array(n).fill(Infinity);
  // Two laps each way around the ring carry the distance from the last corner past the start.
  for (const dir of [1, -1]) {
    let last = -Infinity;
    for (let k = 0; k < 2 * n; k++) {
      const i = dir > 0 ? k % n : mod(-k, n);
      const s = dir > 0 ? arc[i] + Math.floor(k / n) * length : -arc[i] + Math.ceil(k / n) * length;
      if (corner[i]) last = s;
      dist[i] = Math.min(dist[i], s - last);
    }
  }
  for (let i = 0; i < n; i++) taper[i] = smoothstep(dist[i] / reach);
  return taper;
}

/** Outward unit normals at each vertex: the mean of its two edges' normals. */
function vertexNormals(poly: readonly Vec[]): Vec[] {
  const n = poly.length;
  const sign = signedArea(poly) > 0 ? 1 : -1;
  const edge = (i: number) => {
    const a = poly[i];
    const b = poly[(i + 1) % n];
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    return { x: (sign * (b.y - a.y)) / len, y: (-sign * (b.x - a.x)) / len };
  };
  return poly.map((_, i) => {
    const e0 = edge(mod(i - 1, n));
    const e1 = edge(i);
    const x = e0.x + e1.x;
    const y = e0.y + e1.y;
    const len = Math.hypot(x, y) || 1;
    return { x: x / len, y: y / len };
  });
}

/**
 * How torn each vertex is. With `coverage` 1 the whole outline is torn; below it, one stretch of that share of the
 * perimeter, starting at a seeded place, with smooth ramps so the tear runs out into the cut line.
 */
function coverageWeights(arc: Float32Array, length: number, coverage: number, scale: number, seed: number): Float32Array {
  const w = new Float32Array(arc.length);
  if (coverage >= 1) return w.fill(1);
  if (coverage <= 0) return w;
  const start = createRng(mixSeed(seed, 0xc0))() * length;
  const span = coverage * length;
  const ramp = Math.min(2 * scale, span / 4);
  for (let i = 0; i < arc.length; i++) {
    const u = mod(arc[i] - start, length);
    w[i] = u < span ? smoothstep(u / ramp) * smoothstep((span - u) / ramp) : 0;
  }
  return w;
}

function makeWisps(
  outline: readonly Vec[],
  normals: readonly Vec[],
  torn: Float32Array,
  tornLength: number,
  edge: TornEdge,
  fibreLength: number
): Wisp[] {
  const rng = createRng(mixSeed(edge.seed, 0xf1));
  const count = Math.round((edge.fibres * tornLength) / 10);
  const wisps: Wisp[] = [];
  for (let k = 0, tries = 0; k < count && tries < count * 4; tries++) {
    const i = Math.floor(rng() * outline.length);
    if (rng() >= torn[i]) continue;
    k++;
    const len = (rng() * fibreLength) / 2;
    const alpha = 0.3 + 0.4 * rng();
    let angle = Math.atan2(normals[i].y, normals[i].x) + (rng() - 0.5) * 1.4;
    const bend = (rng() - 0.5) * 0.8;
    if (len < 0.05) continue;
    // Rooted a little inside the line, so the fibre visibly leaves the paper.
    let x = outline[i].x - normals[i].x * 0.05;
    let y = outline[i].y - normals[i].y * 0.05;
    const points: Vec[] = [{ x, y }];
    const steps = 5;
    for (let s = 0; s < steps; s++) {
      x += (Math.cos(angle) * len) / steps;
      y += (Math.sin(angle) * len) / steps;
      angle += bend / steps;
      points.push({ x, y });
    }
    wisps.push({ points, alpha });
  }
  return wisps;
}

/**
 * The torn version of a cut outline (D011), or null when the edge is not torn. The line is displaced along its normals
 * by self-affine noise (H ≈ 0.65), steered by the grain (half as rough along it on machine-made paper). If the result
 * would cross itself the roughness is halved until it does not; a tear never makes an outline that can't be cut.
 */
export function tearOutline(base: readonly Vec[], edge: TornEdge): TornOutline | null {
  if (!edge.enabled || edge.coverage <= 0) return null;
  const paper = PAPERS[edge.paper];
  const length0 = perimeter(base);
  const step = Math.max(Math.min(0.25, edge.scale / 8, MIN_WAVELENGTH / 2), length0 / MAX_POINTS);
  const line = resamplePolygon(base, step);
  const n = line.length;
  const normals = vertexNormals(line);

  const arc = new Float32Array(n);
  for (let i = 1; i < n; i++) arc[i] = arc[i - 1] + Math.hypot(line[i].x - line[i - 1].x, line[i].y - line[i - 1].y);
  const length = arc[n - 1] + Math.hypot(line[0].x - line[n - 1].x, line[0].y - line[n - 1].y);

  const torn = coverageWeights(arc, length, edge.coverage, edge.scale, edge.seed);
  const taper = cornerTaper(line, arc, length, 2 * edge.roughness);
  const grain = (edge.grain * Math.PI) / 180;
  const finest = Math.max(MIN_WAVELENGTH, 2 * step);
  const offset = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const a = line[mod(i - 1, n)];
    const b = line[(i + 1) % n];
    const along = Math.abs(Math.cos(Math.atan2(b.y - a.y, b.x - a.x) - grain));
    const steer = 1 - 0.5 * paper.grainEffect * along;
    offset[i] = torn[i] * taper[i] * steer * tearNoise(arc[i], length, edge.scale, finest, edge.seed);
  }

  let outline: Polygon | null = null;
  for (let h = 0, r = edge.roughness; h <= MAX_HALVINGS && !outline; h++, r /= 2) {
    const candidate = line.map((p, i) => ({ x: p.x + normals[i].x * offset[i] * r, y: p.y + normals[i].y * offset[i] * r }));
    try {
      checkOutline(candidate);
      outline = candidate;
    } catch (e) {
      if (!(e instanceof OutlineError)) throw e;
    }
  }
  // Even the faintest tear crossed itself (a hairline sliver): keep the cut line, still with the band and fibres.
  outline ??= line;

  const band = new Float32Array(n);
  const bandSeed = mixSeed(edge.seed, 0xba);
  const bandPeriod = Math.max(1, Math.round(length / BAND_CORRELATION));
  const finePeriod = Math.max(1, Math.round(length / 1.5));
  let tornLength = 0;
  for (let i = 0; i < n; i++) {
    const t = arc[i] / length;
    const v = periodicNoise(t * bandPeriod, bandPeriod, bandSeed, 0) + 0.4 * periodicNoise(t * finePeriod, finePeriod, bandSeed, 1);
    // Wanders about the average width and may pinch to nothing, as the reference describes.
    band[i] = torn[i] * edge.rimWidth * Math.min(2.5, Math.max(0, 1 + 1.3 * v));
    tornLength += torn[i] * Math.hypot(line[(i + 1) % n].x - line[i].x, line[(i + 1) % n].y - line[i].y);
  }

  const outNormals = outline === line ? normals : vertexNormals(outline);
  const wisps = makeWisps(outline, outNormals, torn, tornLength, edge, paper.fibreLength);
  return {
    outline,
    normals: outNormals,
    torn,
    band,
    wisps,
    fuzzWidth: paper.fuzzWidth,
    reach: Math.max(paper.fuzzWidth, wisps.length ? paper.fibreLength / 2 + 0.1 : 0),
  };
}
