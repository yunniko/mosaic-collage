# D010 · Textures are sampled per pixel in lib/; images and PDF pages are decoded once in the app
Date: 2026-11-01 · Goal: G-001 M4 · Status: active (superseded by: —)
Context: A piece's texture can be plain, generated, an image or a PDF page, with a shift/scale/turn and colour layers over it. Previews, the workboard and the export must show the same pixels (D006).
Decision: `lib/textures/sample.ts` turns a texture into a per-point colour function (about the piece's bounds centre; image textures cover the bounds and tile); `renderPiece` applies the W3C blend modes and HSL shifts from `lib/raster/blend.ts`, while `app/render/texture-images.ts` decodes images and PDF pages (pdf.js, longest side 2048 px) and redraws when each finishes.
Force: judgment — keeps the D006 pure pipeline; the decode step is the only browser-specific part.
Rejected: Canvas 2D `globalCompositeOperation` for blending (the unit tests and export could not share it); keeping whole PDFs rendered at full resolution (memory).
Consequence: A sprite drawn while its image is decoding is not cached; `textureVersion` in the store forces the redraw.
Evidence: `tests/unit/textures.spec.ts`; `tests/e2e/textures.spec.ts`.
