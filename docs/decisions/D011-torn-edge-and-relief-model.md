# D011 · Torn edges are a fractal offset of the cut line; relief is a lit height field from the edge distance
Date: 2026-11-01 · Goal: G-001 M5 · Status: active (superseded by: —)
Context: Bevel/emboss and torn edges must look like real paper at every zoom and stay inside the pure pipeline (D006).
Decision: `lib/edges/tear.ts` offsets the resampled outline by seeded fractal noise (Hurst 0.65, grain-weighted, tapered into corners, halved until it stops crossing) and adds a core band and fibres from the paper kind; `lib/render/relief.ts` lights a height field from the inside distance, smoothed and capped at slope 0.3.
Force: judgment — the constants come from the domain reference, not from taste; the noise gain and smoothing radii were measured.
Rejected: a decorative stroke or image mask along the edge (not real geometry, breaks overlap checks); Canvas shadow-based bevels (cannot match in unit tests or export).
Consequence: The torn outline is the piece's outline for placement, so any change to the tear changes collisions. Keep `NOISE_GAIN`, `MAX_SLOPE` and the paper table tied to the reference and tests.
Evidence: `docs/reviews/2026-11-01-torn-paper-relief-reference.md`; `tests/unit/edges.spec.ts`; `tests/e2e/relief-edge.spec.ts`.
