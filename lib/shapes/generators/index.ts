import { blob } from "./blob";
import { irregularPolygon } from "./irregular-polygon";
import type { ShapeGenerator } from "./registry";
import { shard } from "./shard";
import { waveStrip } from "./wave-strip";

/** Every shape generator, in the order the cutboard lists them. Add a new algorithm here. */
export const SHAPE_GENERATORS: ShapeGenerator[] = [irregularPolygon, shard, blob, waveStrip];

export function findShapeGenerator(id: string): ShapeGenerator | undefined {
  return SHAPE_GENERATORS.find((g) => g.id === id);
}
