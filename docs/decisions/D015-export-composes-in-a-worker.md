# D015 · Export composes at full resolution in a worker, with capped size
Date: 2026-11-01 · Goal: G-001 M6 · Status: active (superseded by: —)
Context: A 300 dpi export of a large mosaic is tens of megapixels; composing it on the page would freeze the UI, and browsers refuse canvases past a size limit.
Decision: `app/export/run-export.ts` renders every piece afresh at the export scale with `renderPiece` on an `OffscreenCanvas` in `app/export/export.worker.ts`, falling back to the page when a worker cannot start; the plan is refused above 64 megapixels or 16384 px a side.
Force: requirement that some cap exists — browsers refuse oversized canvases; judgment for the values (desktop Chrome and Firefox draw them, iPad Safari stops near 16.7 MP and reports the failure) and for the worker and for scaling the drop shadow from its look at 4 px/mm, so the export matches the board.
Rejected: upscaling the board's sprites (blurry at print resolution); tiling a larger image (a PNG/JPG encoder in JS, for sizes few users need).
Consequence: export never uses preview sprites or stand-in textures; it waits for every texture to decode.
Evidence: `tests/e2e/export.spec.ts`; `tests/unit/export.spec.ts` ("refuses sizes").
