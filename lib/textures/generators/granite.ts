import { mixSeed } from "../../random";
import { Noise2D } from "../noise";
import { type TextureGenerator, clamp01, sizeParam } from "./registry";

/** Speckled stone: a mid-tone ground with dark and light grains where two noise fields pass a threshold. */
export const granite: TextureGenerator = {
  id: "granite",
  label: "granite",
  params: [sizeParam(1.5, 20), { key: "density", label: "density", min: 0, max: 100, step: 1, default: 40, unit: "percent" }],
  colors: ["#2b2b2e", "#8d8a86", "#efeae2"],
  field(p, seed) {
    const dark = new Noise2D(seed);
    const light = new Noise2D(mixSeed(seed, 1));
    const ground = new Noise2D(mixSeed(seed, 2));
    // Higher density lowers the threshold, so more of the field counts as a grain.
    const th = 0.55 - (p.density / 100) * 0.45;
    const edge = 0.04;
    return (u, v) => {
      const x = u / p.size;
      const y = v / p.size;
      const d = clamp01((dark.fbm(x, y, 2) - th) / edge);
      const l = clamp01((light.fbm(x + 31.7, y - 12.3, 2) - th) / edge);
      const g = 0.5 + 0.12 * ground.fbm(x / 6, y / 6, 3);
      return clamp01(g - d * g + l * (1 - g));
    };
  },
};
