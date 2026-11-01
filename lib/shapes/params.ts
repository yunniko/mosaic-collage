import type { Params } from "../document/types";

/** One adjustable number of a shape, generator or texture, described for both validation and the settings panel. */
export interface ParamSpec {
  key: string;
  /** Message key under `params.` in messages/en.json. */
  label: string;
  min: number;
  max: number;
  step: number;
  default: number;
  /** Shown after the number: "mm", "°", "%" or nothing. */
  unit?: "mm" | "deg" | "percent" | "count";
}

export function defaultParams(specs: readonly ParamSpec[]): Params {
  return Object.fromEntries(specs.map((s) => [s.key, s.default]));
}

/**
 * Every spec'd key present, finite and inside its range; unknown keys dropped. Applied to anything read from a file
 * or a control, so a generator never sees a value it was not written for.
 */
export function sanitizeParams(specs: readonly ParamSpec[], params: Partial<Params> | undefined): Params {
  const out: Params = {};
  for (const s of specs) {
    const v = params?.[s.key];
    out[s.key] = typeof v === "number" && Number.isFinite(v) ? Math.min(s.max, Math.max(s.min, v)) : s.default;
  }
  return out;
}
