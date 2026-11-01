import type { Mask } from "./image";

const INF = 1e20;

/** One row or column of the squared distance transform (Felzenszwalb & Huttenlocher 2012), in place over `f`. */
function transform1d(f: Float64Array, n: number, d: Float64Array, v: Int32Array, z: Float64Array) {
  let k = 0;
  v[0] = 0;
  z[0] = -INF;
  z[1] = INF;
  for (let q = 1; q < n; q++) {
    let s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    while (s <= z[k]) {
      k--;
      s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    }
    k++;
    v[k] = q;
    z[k] = s;
    z[k + 1] = INF;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k++;
    d[q] = (q - v[k]) * (q - v[k]) + f[v[k]];
  }
  for (let q = 0; q < n; q++) f[q] = d[q];
}

/**
 * Exact Euclidean distance, in pixels, from each pixel to the nearest pixel on the other side of the mask's edge:
 * for a pixel inside (coverage ≥ 0.5) the distance to the outside, and the other way round. The half-pixel offset
 * between pixel centres and the edge is corrected with the coverage of anti-aliased pixels, so the result is the
 * distance to the edge line itself, smooth across it.
 */
export function edgeDistance(mask: Mask, inside: boolean): Float32Array {
  const { width: w, height: h, data } = mask;
  const n = Math.max(w, h);
  const f = new Float64Array(n);
  const d = new Float64Array(n);
  const v = new Int32Array(n);
  const z = new Float64Array(n + 1);
  const grid = new Float64Array(w * h);
  for (let i = 0; i < w * h; i++) grid[i] = data[i] >= 0.5 === inside ? INF : 0;
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) f[y] = grid[y * w + x];
    transform1d(f, h, d, v, z);
    for (let y = 0; y < h; y++) grid[y * w + x] = f[y];
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) f[x] = grid[y * w + x];
    transform1d(f, w, d, v, z);
    for (let x = 0; x < w; x++) grid[y * w + x] = f[x];
  }
  const out = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const m = data[i];
    const isIn = m >= 0.5;
    if (isIn !== inside) continue;
    // Distance from this pixel's centre to the edge line: the centre-to-centre distance less half a pixel, nudged by
    // how much of this pixel the shape covers (an edge pixel at coverage 0.5 sits on the line).
    const edgeOffset = inside ? m - 0.5 : 0.5 - m;
    out[i] = Math.max(0, Math.sqrt(grid[i]) - 1 + edgeOffset);
  }
  return out;
}
