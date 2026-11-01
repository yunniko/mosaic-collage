import type { Params } from "../../document/types";
import type { ParamSpec } from "../../shapes/params";

/**
 * A generated texture: a seeded scalar field over the piece's texture plane (millimetres), mapped to colour through
 * the piece's colour stops (`ramp`). Each lives in its own module in this folder and is listed once in `index.ts`;
 * nothing else needs to change to add one. `field` must be deterministic for a given (params, seed): the saved seed is
 * what rebuilds the texture.
 */
export interface TextureGenerator {
  id: string;
  /** Message key under `textures.` */
  label: string;
  params: ParamSpec[];
  /** The colour stops a new texture of this kind starts with, from field value 0 to 1. */
  colors: string[];
  /** Builds the field once; the returned function is called per pixel and returns a value in 0..1. */
  field(params: Params, seed: number): (u: number, v: number) => number;
}

export const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** A feature size in mm, the param most textures share. */
export const sizeParam = (def: number, max = 200): ParamSpec => ({
  key: "size",
  label: "featureSize",
  min: 0.5,
  max,
  step: 0.5,
  default: def,
  unit: "mm",
});

export const contrastParam: ParamSpec = { key: "contrast", label: "contrast", min: 0, max: 100, step: 1, default: 50, unit: "percent" };

/** `t` pushed away from 0.5 by `contrast` (0..100 %; 50 leaves it as is). */
export function applyContrast(t: number, contrast: number): number {
  const k = contrast <= 50 ? contrast / 50 : 1 + ((contrast - 50) / 50) * 3;
  return clamp01(0.5 + (t - 0.5) * k);
}
