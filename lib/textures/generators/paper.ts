import { createRng, mixSeed } from "../../random";
import { Noise2D } from "../noise";
import { type TextureGenerator, applyContrast, clamp01, contrastParam } from "./registry";

/** Directions of the fibre families: three, so no single grain direction shows. */
const FAMILIES = 3;

/**
 * Handmade paper: a mottled sheet with fibres in it. A fibre is a ridge of noise stretched along its direction
 * (narrow across, long along), kept only near its crest, so it reads as a thin wandering strand.
 */
export const paper: TextureGenerator = {
  id: "paper",
  label: "paper",
  params: [
    { key: "size", label: "fibreLength", min: 1, max: 30, step: 0.5, default: 6, unit: "mm" },
    { key: "fibres", label: "fibres", min: 0, max: 100, step: 1, default: 50, unit: "percent" },
    { ...contrastParam, default: 45 },
  ],
  colors: ["#cdbf9f", "#f3ecdc", "#fffaf0"],
  field(p, seed) {
    const base = new Noise2D(seed);
    const rng = createRng(mixSeed(seed, 1));
    const families = Array.from({ length: FAMILIES }, (_, k) => {
      const a = rng() * Math.PI;
      return { cos: Math.cos(a), sin: Math.sin(a), noise: new Noise2D(mixSeed(seed, 2, k)) };
    });
    const length = p.size;
    const width = Math.max(0.15, length * 0.04);
    const amount = p.fibres / 100;
    return (u, v) => {
      const mottle = 0.5 + 0.45 * base.fbm(u / 12, v / 12, 4);
      let fibre = 0;
      for (const f of families) {
        const along = u * f.cos + v * f.sin;
        const across = -u * f.sin + v * f.cos;
        const n = f.noise.sample(along / length, across / width);
        fibre = Math.max(fibre, (1 - Math.min(1, Math.abs(n) * 4)) ** 3);
      }
      // The sheet sits between the lighter stops; a fibre is a darker strand, drawn toward the first stop.
      return applyContrast(clamp01(0.35 + mottle * 0.6 - fibre * amount * 0.7), p.contrast);
    };
  },
};
