# D007 · A hand cut stores its raw stroke; the outline is derived
Date: 2026-11-01 · Goal: G-001 M2 · Status: active (superseded by: —)
Context: A hand-cut piece has a stabilisation setting. If only the finished outline were saved, changing the setting after the cut would smooth an already smoothed line, and the original hand movement would be lost.
Decision: The hand `ShapeSource` saves the stroke (mm, rounded to 0.01) plus `stabilization` (0–100). `cutOutline` in `lib/shapes/hand.ts` resamples, smooths with a Gaussian, simplifies and repairs it whenever the outline is built.
Force: judgment — the setting stays adjustable and repeatable; the stroke is the user's actual input.
Rejected: storing only the smoothed outline (the setting becomes one-way); smoothing while drawing (the result would depend on pointer event timing).
Consequence: Changing the smoothing constants changes how saved hand pieces look. Files that stored a finished outline load with stabilisation 0, so their shape is unchanged.
Evidence: `tests/unit/cutting.spec.ts`; `tests/e2e/cutboard.spec.ts`; `lib/shapes/hand.ts`.
