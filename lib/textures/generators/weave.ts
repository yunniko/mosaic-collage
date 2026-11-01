import { type TextureGenerator, clamp01 } from "./registry";

/** A small integer hash to 0..1, so each thread gets its own slight shade. */
function hash(a: number, b: number, seed: number): number {
  let h = Math.imul(a, 374761393) ^ Math.imul(b, 668265263) ^ Math.imul(seed, 2246822519 | 0);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Plain-weave cloth: warp and weft threads crossing over and under, each rounded across its width. */
export const weave: TextureGenerator = {
  id: "weave",
  label: "weave",
  params: [
    { key: "size", label: "threadWidth", min: 0.2, max: 10, step: 0.1, default: 1, unit: "mm" },
    { key: "irregularity", label: "irregularity", min: 0, max: 100, step: 1, default: 30, unit: "percent" },
  ],
  colors: ["#6f6656", "#cfc5ad", "#efe7d2"],
  field(p, seed) {
    const irr = p.irregularity / 100;
    return (u, v) => {
      const x = u / p.size;
      const y = v / p.size;
      const ix = Math.floor(x);
      const iy = Math.floor(y);
      // In a plain weave the warp (running along y) is on top where column + row is even.
      const warpOnTop = ((ix + iy) & 1) === 0;
      const round = Math.sin(Math.PI * (warpOnTop ? x - ix : y - iy));
      const shade = warpOnTop ? hash(ix, 0, seed) : hash(0, iy, seed + 1);
      return clamp01(0.15 + 0.7 * round + (shade - 0.5) * irr * 0.5 - (warpOnTop ? 0 : 0.08));
    };
  },
};
