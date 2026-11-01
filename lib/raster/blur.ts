import type { Mask } from "./image";

/** Mean of `v` over the pixels inside the mask within `r` px along one axis: a box blur that ignores the outside. */
function boxPass(v: Float32Array, m: Float32Array, w: number, h: number, r: number, horizontal: boolean): Float32Array<ArrayBuffer> {
  const out = new Float32Array(v.length);
  const lines = horizontal ? h : w;
  const len = horizontal ? w : h;
  const at = (line: number, k: number) => (horizontal ? line * w + k : k * w + line);
  for (let line = 0; line < lines; line++) {
    let sum = 0;
    let count = 0;
    for (let k = 0; k < Math.min(r, len); k++) {
      const i = at(line, k);
      if (m[i] > 0) {
        sum += v[i];
        count++;
      }
    }
    for (let k = 0; k < len; k++) {
      const add = k + r;
      if (add < len && m[at(line, add)] > 0) {
        sum += v[at(line, add)];
        count++;
      }
      const drop = k - r - 1;
      if (drop >= 0 && m[at(line, drop)] > 0) {
        sum -= v[at(line, drop)];
        count--;
      }
      const i = at(line, k);
      out[i] = m[i] > 0 && count > 0 ? sum / count : 0;
    }
  }
  return out;
}

/**
 * `v` smoothed over about `radius` px using only the pixels inside the mask, so the outside never bleeds in. Two box
 * passes each way: close to a Gaussian, and linear in the pixel count whatever the radius. Returns `v` when radius < 1.
 */
export function blurInside(v: Float32Array<ArrayBuffer>, mask: Mask, radius: number): Float32Array<ArrayBuffer> {
  if (radius < 1) return v;
  const { width: w, height: h, data: m } = mask;
  let out = v;
  for (let pass = 0; pass < 2; pass++) {
    out = boxPass(out, m, w, h, radius, true);
    out = boxPass(out, m, w, h, radius, false);
  }
  return out;
}
