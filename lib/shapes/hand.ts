import { type Polygon, perimeter, resampleEven, simplifyPolygon } from "../geometry/polygon";
import type { Vec } from "../geometry/vec";
import type { ParamSpec } from "./params";
import { OutlineError, repairOutline } from "./repair";

/** The hand cutter's one setting: 0 keeps the raw stroke, 100 smooths it strongly. */
export const STABILIZATION: ParamSpec = {
  key: "stabilization",
  label: "stabilization",
  min: 0,
  max: 100,
  step: 1,
  default: 40,
  unit: "percent",
};

/** Smoothing radius (Gaussian sigma) at full stabilisation, in mm along the outline. */
const MAX_SIGMA_MM = 6;
/** Spacing the stroke is resampled to before smoothing, in mm; widened for very long strokes to cap the work. */
const SAMPLE_MM = 0.5;
const MAX_SAMPLES = 4000;
/** Deviation the final outline may have from the smoothed stroke, in mm. */
const SIMPLIFY_MM = 0.05;

/**
 * The outline a hand stroke cuts: the stroke closed back to its start, smoothed by `stabilization` (0–100), simplified,
 * and repaired if it crosses itself (`repairOutline`). Throws an `OutlineError` for a stroke that can't be a piece.
 */
export function cutOutline(stroke: readonly Vec[], stabilization: number): Polygon {
  const pts = dedupe(stroke);
  if (pts.length < 3) throw new OutlineError("too-few-points");
  const len = perimeter(pts);
  const n = Math.min(MAX_SAMPLES, Math.max(3, Math.round(len / SAMPLE_MM)));
  let ring = resampleEven(pts, n);
  const sigma = (Math.min(100, Math.max(0, stabilization)) / 100) * MAX_SIGMA_MM;
  // A smoothing radius past a sixth of the outline would shrink it to a dot rather than smooth it.
  const sigmaSamples = Math.min(sigma, len / 6) / (len / n);
  if (sigmaSamples >= 0.5) ring = gaussianClosed(ring, sigmaSamples);
  return repairOutline(simplifyPolygon(ring, SIMPLIFY_MM));
}

/** Drops points closer than 0.05 mm to the one before, including the end against the start. */
function dedupe(stroke: readonly Vec[]): Vec[] {
  const out: Vec[] = [];
  for (const p of stroke) {
    const last = out[out.length - 1];
    if (!last || Math.hypot(p.x - last.x, p.y - last.y) > 0.05) out.push(p);
  }
  while (out.length > 1 && Math.hypot(out[0].x - out[out.length - 1].x, out[0].y - out[out.length - 1].y) <= 0.05) out.pop();
  return out;
}

/** Circular Gaussian smoothing of an evenly spaced closed ring, `sigma` in samples. */
function gaussianClosed(ring: readonly Vec[], sigma: number): Polygon {
  const n = ring.length;
  const r = Math.min(Math.floor(n / 2), Math.ceil(sigma * 3));
  const w: number[] = [];
  let sum = 0;
  for (let k = -r; k <= r; k++) {
    const v = Math.exp(-(k * k) / (2 * sigma * sigma));
    w.push(v);
    sum += v;
  }
  return ring.map((_, i) => {
    let x = 0;
    let y = 0;
    for (let k = -r; k <= r; k++) {
      const p = ring[(((i + k) % n) + n) % n];
      x += p.x * w[k + r];
      y += p.y * w[k + r];
    }
    return { x: x / sum, y: y / sum };
  });
}
