import type { ShapeGenerator } from "./registry";

/** Every shape generator, in the order the cutboard lists them. Add a new algorithm here. */
export const SHAPE_GENERATORS: ShapeGenerator[] = [];

export function findShapeGenerator(id: string): ShapeGenerator | undefined {
  return SHAPE_GENERATORS.find((g) => g.id === id);
}
