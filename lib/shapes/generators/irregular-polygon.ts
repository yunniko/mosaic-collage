import type { Polygon } from "../../geometry/polygon";
import { range } from "../../random";
import type { ShapeGenerator } from "./registry";

/**
 * A rough polygon like a cut tessera: corners at increasing angles around the centre, each angle and distance jittered.
 * Increasing angles about one centre make the outline star-shaped, so it never crosses itself.
 */
export const irregularPolygon: ShapeGenerator = {
  id: "irregular-polygon",
  label: "irregularPolygon",
  params: [
    { key: "size", label: "size", min: 6, max: 300, step: 1, default: 40, unit: "mm" },
    { key: "sides", label: "sides", min: 3, max: 16, step: 1, default: 6, unit: "count" },
    { key: "irregularity", label: "irregularity", min: 0, max: 100, step: 1, default: 40, unit: "percent" },
    { key: "spikiness", label: "spikiness", min: 0, max: 100, step: 1, default: 25, unit: "percent" },
  ],
  generate({ size, sides, irregularity, spikiness }, rng) {
    const n = Math.round(sides);
    const irr = irregularity / 100;
    const spike = spikiness / 100;
    // Angular steps vary by up to ±80 % of an even step, then are scaled to close the circle.
    const steps = Array.from({ length: n }, () => 1 + range(rng, -0.8, 0.8) * irr);
    const total = steps.reduce((a, b) => a + b, 0);
    const radius = size / 2;
    const start = range(rng, 0, Math.PI * 2);
    const out: Polygon = [];
    let angle = start;
    for (const s of steps) {
      const r = radius * Math.max(0.2, 1 + range(rng, -0.7, 0.7) * spike);
      out.push({ x: r * Math.cos(angle), y: r * Math.sin(angle) });
      angle += (s / total) * Math.PI * 2;
    }
    return out;
  },
};
