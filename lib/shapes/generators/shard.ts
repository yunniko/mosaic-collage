import { type Polygon, clipHalfPlane } from "../../geometry/polygon";
import { range } from "../../random";
import type { ShapeGenerator } from "./registry";

/**
 * A shard: the Voronoi cell of a point among random neighbours, like a tile broken by a hammer. The cell is the part of
 * a square closer to the centre than to every neighbour, so it is always convex.
 */
export const shard: ShapeGenerator = {
  id: "shard",
  label: "shard",
  params: [
    { key: "size", label: "size", min: 6, max: 300, step: 1, default: 40, unit: "mm" },
    { key: "neighbours", label: "neighbours", min: 3, max: 12, step: 1, default: 6, unit: "count" },
    { key: "irregularity", label: "irregularity", min: 0, max: 100, step: 1, default: 50, unit: "percent" },
  ],
  generate({ size, neighbours, irregularity }, rng) {
    const n = Math.round(neighbours);
    const irr = irregularity / 100;
    // A neighbour at distance d bounds the cell at d/2, so neighbours sit about `size` away for a cell `size` across.
    const half = size;
    let cell: Polygon = [
      { x: -half, y: -half },
      { x: half, y: -half },
      { x: half, y: half },
      { x: -half, y: half },
    ];
    const start = range(rng, 0, Math.PI * 2);
    for (let i = 0; i < n; i++) {
      // Angle jitter stays under 40 % of a step, so consecutive neighbours never leave a gap of half a turn.
      const a = start + ((i + range(rng, -0.4, 0.4) * irr) / n) * Math.PI * 2;
      const d = size * (1 + range(rng, -0.5, 0.5) * irr);
      const q = { x: d * Math.cos(a), y: d * Math.sin(a) };
      // Points closer to the centre than to q: p·q <= |q|²/2.
      cell = clipHalfPlane(cell, q, (d * d) / 2);
    }
    return cell;
  },
};
