import type { Piece, ShapeSource, TornEdge } from "../document/types";
import { type TornOutline, tearOutline } from "../edges/tear";
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

const shapeCache = new WeakMap<ShapeSource, Polygon>();

/**
 * The cut outline of a shape source, centred on its centroid, in mm. Throws an `OutlineError` if the source can't make
 * a valid piece (a hand cut that splits, an outline that crosses itself or is too small). Cached per shape object, so
 * edits that keep a piece's shape (texture, name) don't rebuild it; shapes are replaced, never mutated.
 */
export function shapeOutline(shape: ShapeSource): Polygon {
  let outline = shapeCache.get(shape);
  if (!outline) {
    outline = normalizeOutline(rawOutline(shape));
    checkOutline(outline);
    shapeCache.set(shape, outline);
  }
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

/** Torn outlines, per shape and then per edge object: a piece edited elsewhere (texture, name) keeps both. */
const tearCache = new WeakMap<ShapeSource, WeakMap<TornEdge, TornOutline | null>>();

/** Throws an `OutlineError` (or `UnknownShapeError`) unless the piece's shape can be cut. Primes the cache. */
export function assertPieceCuts(piece: Piece): void {
  pieceOutline(piece);
}

/** The piece's torn edge (D011), or null when its edge is cut. Throws like `shapeOutline`. */
export function pieceTear(piece: Piece): TornOutline | null {
  let byEdge = tearCache.get(piece.shape);
  if (!byEdge) {
    byEdge = new WeakMap();
    tearCache.set(piece.shape, byEdge);
  }
  let t = byEdge.get(piece.edge);
  if (t === undefined) {
    t = tearOutline(shapeOutline(piece.shape), piece.edge);
    byEdge.set(piece.edge, t);
  }
  return t;
}

/** The piece's final outline: the cut shape with its torn edge applied. This one outline is what is drawn and what collides. */
export function pieceOutline(piece: Piece): Polygon {
  return pieceTear(piece)?.outline ?? shapeOutline(piece.shape);
}
