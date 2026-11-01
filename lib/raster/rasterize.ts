import type { Vec } from "../geometry/vec";
import { type Mask, createMask } from "./image";

/** Sub-scanlines per pixel row. Horizontal coverage is exact, so 5 vertical samples give smooth edges at any angle. */
const SUB = 5;

/**
 * Anti-aliased coverage of a polygon (even-odd rule) in pixel coordinates, into a `width` × `height` mask.
 * Each sub-scanline adds the exact horizontal span coverage, so the cost is O(rows × SUB × crossings + pixels).
 */
export function rasterizePolygon(poly: readonly Vec[], width: number, height: number): Mask {
  const mask = createMask(width, height);
  const acc = new Float32Array(width + 2);
  const xs: number[] = [];
  const n = poly.length;
  const w = 1 / SUB;
  for (let row = 0; row < height; row++) {
    acc.fill(0);
    let any = false;
    for (let s = 0; s < SUB; s++) {
      const y = row + (s + 0.5) * w;
      xs.length = 0;
      for (let i = 0, j = n - 1; i < n; j = i++) {
        const a = poly[i];
        const b = poly[j];
        if (a.y > y !== b.y > y) xs.push(a.x + ((y - a.y) * (b.x - a.x)) / (b.y - a.y));
      }
      if (xs.length < 2) continue;
      xs.sort((p, q) => p - q);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const x0 = Math.max(0, xs[k]);
        const x1 = Math.min(width, xs[k + 1]);
        if (x1 <= x0) continue;
        any = true;
        addSpan(acc, x0, x1, w);
      }
    }
    if (!any) continue;
    // `acc` is difference-encoded (see addSpan): its running sum is each pixel's coverage.
    let run = 0;
    const base = row * width;
    for (let x = 0; x < width; x++) {
      run += acc[x];
      const v = run;
      mask.data[base + x] = v > 1 ? 1 : v < 0 ? 0 : v;
    }
  }
  return mask;
}

/**
 * Adds coverage `weight` for the span [x0, x1) to `acc`, in a form whose running sum is the per-pixel coverage:
 * the two partial end pixels get their fraction, the full pixels between them get `weight` through a +/- pair.
 */
function addSpan(acc: Float32Array, x0: number, x1: number, weight: number) {
  const i0 = Math.floor(x0);
  const i1 = Math.floor(x1);
  if (i0 === i1) {
    const c = (x1 - x0) * weight;
    acc[i0] += c;
    acc[i0 + 1] -= c;
    return;
  }
  const first = (i0 + 1 - x0) * weight;
  acc[i0] += first;
  acc[i0 + 1] -= first;
  // Full pixels i0+1 .. i1-1.
  acc[i0 + 1] += weight;
  acc[i1] -= weight;
  const last = (x1 - i1) * weight;
  acc[i1] += last;
  acc[i1 + 1] -= last;
}
