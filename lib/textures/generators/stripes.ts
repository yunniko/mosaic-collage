import { Noise2D } from "../noise";
import { type TextureGenerator, clamp01 } from "./registry";

/** Parallel stripes across the texture's x axis (turn them with the texture rotation), optionally hand-drawn wobbly. */
export const stripes: TextureGenerator = {
  id: "stripes",
  label: "stripes",
  params: [
    { key: "size", label: "stripePeriod", min: 0.5, max: 100, step: 0.5, default: 6, unit: "mm" },
    { key: "ratio", label: "stripeRatio", min: 5, max: 95, step: 1, default: 50, unit: "percent" },
    { key: "softness", label: "softness", min: 0, max: 100, step: 1, default: 10, unit: "percent" },
    { key: "wobble", label: "wobble", min: 0, max: 100, step: 1, default: 0, unit: "percent" },
  ],
  colors: ["#2d3047", "#f4efe4"],
  field(p, seed) {
    const noise = new Noise2D(seed);
    const duty = p.ratio / 100;
    // The blend width, as a share of the period, on each side of an edge.
    const soft = Math.max(1e-3, (p.softness / 100) * Math.min(duty, 1 - duty));
    const wobble = (p.wobble / 100) * p.size * 0.6;
    return (u, v) => {
      const x = (u + wobble * noise.fbm(v / (p.size * 4), u / (p.size * 4), 3)) / p.size;
      const f = x - Math.floor(x);
      // Signed distance into the stripe [0, duty), in periods: positive inside, negative outside, wrapping the period.
      const d = f < duty ? Math.min(f, duty - f) : -Math.min(f - duty, 1 - f);
      return clamp01(0.5 - d / (2 * soft));
    };
  },
};
