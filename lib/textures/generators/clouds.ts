import { Noise2D } from "../noise";
import { type TextureGenerator, applyContrast, contrastParam, sizeParam } from "./registry";

/** Soft fractal noise: mottled paper, sky, stone wash. */
export const clouds: TextureGenerator = {
  id: "clouds",
  label: "clouds",
  params: [sizeParam(20), { key: "detail", label: "detail", min: 1, max: 8, step: 1, default: 5, unit: "count" }, contrastParam],
  colors: ["#d9cbb0", "#f5efe3"],
  field(p, seed) {
    const noise = new Noise2D(seed);
    const octaves = Math.round(p.detail);
    return (u, v) => applyContrast(0.5 + 0.8 * noise.fbm(u / p.size, v / p.size, octaves), p.contrast);
  },
};
