import type { PaperKind } from "../document/types";

/** How a kind of paper tears. Values from the domain reference (docs/reviews/2026-11-01-torn-paper-relief-reference.md). */
export interface PaperProperties {
  /** Typical fibre length, mm. A wisp sticks out uniformly 0..length/2. */
  fibreLength: number;
  /** Width of the translucent fuzz just outside the torn line, mm. */
  fuzzWidth: number;
  /** How much the grain steers the tear, 0 (isotropic, handmade) .. 1 (machine-made). */
  grainEffect: number;
}

export const PAPERS: Record<PaperKind, PaperProperties> = {
  copy: { fibreLength: 1, fuzzWidth: 0.15, grainEffect: 1 },
  newsprint: { fibreLength: 1, fuzzWidth: 0.2, grainEffect: 1 },
  cotton: { fibreLength: 3, fuzzWidth: 0.5, grainEffect: 0.3 },
  tissue: { fibreLength: 10, fuzzWidth: 1, grainEffect: 0.5 },
};
