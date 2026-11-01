import type { Polygon } from "../../geometry/polygon";
import { range } from "../../random";
import type { ShapeGenerator } from "./registry";

/**
 * A strip with wavy long edges, like a band cut with pinking or wave scissors. Each edge is a sine wave with its own
 * random phase and a slightly varied wavelength. The amplitude is capped below half the width, so the two edges never
 * meet and the outline never crosses itself.
 */
export const waveStrip: ShapeGenerator = {
  id: "wave-strip",
  label: "waveStrip",
  params: [
    { key: "length", label: "length", min: 10, max: 400, step: 1, default: 120, unit: "mm" },
    { key: "width", label: "width", min: 4, max: 100, step: 1, default: 20, unit: "mm" },
    { key: "amplitude", label: "amplitude", min: 0, max: 100, step: 1, default: 40, unit: "percent" },
    { key: "wavelength", label: "wavelength", min: 4, max: 200, step: 1, default: 30, unit: "mm" },
  ],
  generate({ length, width, amplitude, wavelength }, rng) {
    // At 100 % each edge swings 45 % of the width, leaving at least a tenth of the width between them.
    const amp = (amplitude / 100) * 0.45 * width;
    const edge = () => ({ phase: range(rng, 0, Math.PI * 2), k: (Math.PI * 2) / (wavelength * range(rng, 0.9, 1.1)) });
    const top = edge();
    const bottom = edge();
    const n = Math.max(2, Math.ceil(length / Math.min(1, wavelength / 12)));
    const out: Polygon = [];
    for (let i = 0; i <= n; i++) {
      const x = (i / n) * length;
      out.push({ x, y: -width / 2 + amp * Math.sin(top.k * x + top.phase) });
    }
    for (let i = n; i >= 0; i--) {
      const x = (i / n) * length;
      out.push({ x, y: width / 2 + amp * Math.sin(bottom.k * x + bottom.phase) });
    }
    return out;
  },
};
