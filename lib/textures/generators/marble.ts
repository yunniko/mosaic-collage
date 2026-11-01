import { Noise2D } from "../noise";
import { type TextureGenerator, sizeParam } from "./registry";

/** Marble: a sine of position bent by turbulence, so its zero crossings become veins. */
export const marble: TextureGenerator = {
  id: "marble",
  label: "marble",
  params: [
    sizeParam(30),
    { key: "turbulence", label: "turbulence", min: 0, max: 10, step: 0.1, default: 4 },
    { key: "sharpness", label: "veinSharpness", min: 1, max: 12, step: 0.5, default: 5 },
  ],
  colors: ["#5a5f66", "#e9e6e0", "#fbfaf7"],
  field(p, seed) {
    const noise = new Noise2D(seed);
    return (u, v) => {
      const x = u / p.size;
      const y = v / p.size;
      const s = Math.sin((x + p.turbulence * 0.25 * noise.fbm(x * 0.7, y * 0.7, 5)) * Math.PI * 2);
      // Near a crossing |s| is small: raised to a small power it stays low only very close to it, a thin vein.
      return Math.abs(s) ** (1 / p.sharpness);
    };
  },
};
