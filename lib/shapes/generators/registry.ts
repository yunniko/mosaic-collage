import type { Params } from "../../document/types";
import type { Polygon } from "../../geometry/polygon";
import type { Rng } from "../../random";
import type { ParamSpec } from "../params";

/**
 * A shape-generation algorithm. Each lives in its own module in this folder and is listed once in `index.ts`;
 * nothing else needs to change to add one. `generate` must be deterministic for a given (params, rng) pair:
 * the saved seed is what rebuilds the piece.
 */
export interface ShapeGenerator {
  id: string;
  /** Message key under `generators.` */
  label: string;
  params: ParamSpec[];
  generate(params: Params, rng: Rng): Polygon;
}
