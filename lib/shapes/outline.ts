import type { Piece, ShapeSource } from "../document/types";
import type { Polygon } from "../geometry/polygon";
import { createRng } from "../random";
import { findShapeGenerator } from "./generators";
import { cutOutline } from "./hand";
import { sanitizeParams } from "./params";
import { findPredefinedShape, normalizeOutline } from "./predefined";
import { checkOutline } from "./repair";

export class UnknownShapeError extends Error {
  constructor(kind: string, id: string) {
    super(`Unknown ${kind} "${id}"`);
    this.name = "UnknownShapeError";
  }
}

/**
 * The cut outline of a shape source, centred on its centroid, in mm. Throws an `OutlineError` if the source can't make
 * a valid piece (a hand cut that splits, an outline that crosses itself or is too small).
 */
export function shapeOutline(shape: ShapeSource): Polygon {
  const outline = normalizeOutline(rawOutline(shape));
  checkOutline(outline);
  return outline;
}

function rawOutline(shape: ShapeSource): Polygon {
  switch (shape.kind) {
    case "predefined": {
      const def = findPredefinedShape(shape.shapeId);
      if (!def) throw new UnknownShapeError("shape", shape.shapeId);
      return def.build(sanitizeParams(def.params, shape.params));
    }
    case "generated": {
      const gen = findShapeGenerator(shape.generatorId);
      if (!gen) throw new UnknownShapeError("generator", shape.generatorId);
      return gen.generate(sanitizeParams(gen.params, shape.params), createRng(shape.seed));
    }
    case "hand":
      return cutOutline(shape.points, shape.stabilization);
  }
}

const outlineCache = new WeakMap<Piece, Polygon>();

/**
 * The piece's final outline: the cut shape with its torn edge applied. This one outline is what is drawn and what
 * collides. Cached per piece object; pieces are replaced, never mutated, so the cache cannot go stale.
 */
export function pieceOutline(piece: Piece): Polygon {
  let o = outlineCache.get(piece);
  if (!o) {
    o = shapeOutline(piece.shape);
    outlineCache.set(piece, o);
  }
  return o;
}
