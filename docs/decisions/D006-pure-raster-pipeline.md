# D006 · Pieces render through one pure RGBA pipeline in lib/
Date: 2026-11-01 · Goal: G-001 M1 · Status: active (superseded by: —)
Context: A piece appears on the cutboard, the workboard, thumbnails and in JPG/PNG exports. Its texture, colour layers, relief and torn edge must look identical everywhere and be testable.
Decision: `lib/render/piece.ts` renders a piece to a straight-RGBA buffer with its own polygon rasteriser (`lib/raster/`), free of DOM and canvas APIs. The app only uploads the buffer to a canvas, cached per piece object and power-of-two px/mm step.
Force: judgment — unit-testable output and identical board/export results; Canvas 2D filters and blend modes vary between browsers.
Rejected: drawing pieces with Canvas 2D paths, filters and composite modes (untestable in Vitest, results differ per engine); WebGL shaders (a second rendering stack for a small app).
Consequence: New piece effects (M4 textures, M5 relief and torn edge) are written as pure functions over `RgbaImage`/`Mask`. A sprite is valid as long as its piece object lives, which relies on D002.
Evidence: `tests/unit/raster.spec.ts`; `lib/render/piece.ts`; `app/render/sprites.ts`.
