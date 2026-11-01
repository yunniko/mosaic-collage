# D008 · A self-crossing cut keeps its largest part, or is refused
Date: 2026-11-01 · Goal: G-001 M2 · Status: active (superseded by: —)
Context: A hand stroke often crosses itself where the end overshoots the start. A figure-eight, on the other hand, is two pieces. Rendering and collision both need one simple polygon.
Decision: `repairOutline` (`lib/shapes/repair.ts`) unions the stroke and keeps its largest part with holes filled. If the dropped parts exceed `MAX_DROPPED_SHARE` (5 %) of that part, the cut is refused with a message. Every outline must also be simple and at least `MIN_PIECE_AREA` (4 mm²); `updatePiece` and `addPiece` enforce this.
Force: judgment — trimming an overshoot is what scissors do; silently discarding half a figure-eight would surprise the user.
Rejected: refusing every crossing (most real strokes overshoot slightly); splitting into several pieces (one stroke, one piece keeps editing simple).
Consequence: The 5 % and 4 mm² values are judgement calls, not measurements; they may be tuned.
Evidence: `tests/unit/cutting.spec.ts`; `tests/e2e/cutboard.spec.ts`.
