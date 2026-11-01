import type { Polygon } from "../../geometry/polygon";
import { range } from "../../random";
import type { ShapeGenerator } from "./registry";

/**
 * An organic blob: a circle whose radius is modulated by a few low harmonics with random phases. The radius stays
 * positive at every angle, so the outline is star-shaped about the centre and never crosses itself.
 */
export const blob: ShapeGenerator = {
  id: "blob",
  label: "blob",
  params: [
    { key: "size", label: "size", min: 6, max: 300, step: 1, default: 40, unit: "mm" },
    { key: "lobes", label: "lobes", min: 2, max: 8, step: 1, default: 3, unit: "count" },
    { key: "wobble", label: "wobble", min: 0, max: 100, step: 1, default: 40, unit: "percent" },
  ],
  generate({ size, lobes, wobble }, rng) {
    const harmonics: { k: number; amp: number; phase: number }[] = [];
    const top = Math.round(lobes);
    for (let k = 2; k <= top + 1; k++) harmonics.push({ k, amp: range(rng, 0.3, 1) / (k - 1), phase: range(rng, 0, Math.PI * 2) });
    // Scale the harmonics so their worst case takes at most 70 % off the radius at full wobble.
    const worst = harmonics.reduce((s, h) => s + h.amp, 0);
    const scale = worst > 0 ? (0.7 * (wobble / 100)) / worst : 0;
    const radius = size / 2;
    const n = Math.max(48, Math.ceil((Math.PI * size) / 1.5));
    const out: Polygon = [];
    for (let i = 0; i < n; i++) {
      const t = (i / n) * Math.PI * 2;
      let r = 1;
      for (const h of harmonics) r += scale * h.amp * Math.cos(h.k * t + h.phase);
      out.push({ x: radius * r * Math.cos(t), y: radius * r * Math.sin(t) });
    }
    return out;
  },
};
