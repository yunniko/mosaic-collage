# D014 · The background is a texture laid over the artwork's bounds plus a padding
Date: 2026-11-01 · Goal: G-001 M6 · Status: active (superseded by: —)
Context: The goal asks for a background behind the mosaic; the board itself is unbounded, so the background needs an extent of its own.
Decision: `Background` holds any `TextureSource` a piece can have, its transform and a padding in mm; it covers the placed pieces' bounds (grown by each torn edge's reach) plus the padding, and that rectangle is also the export's frame.
Force: judgment — one texture model for pieces and background reuses the editor, sampler and file assets; tying the frame to the pieces means an export never crops a piece or ships empty margins.
Rejected: a fixed board size the user sets (an extra step, and pieces placed outside it are lost); colour-only backgrounds (the brief asks for textured ones).
Consequence: the old `{kind:"color"}` background is still read as a plain texture; anything new that measures the artwork uses `contentBounds`, which includes the tear reach.
Evidence: `tests/unit/export.spec.ts`; `tests/e2e/export.spec.ts`.
