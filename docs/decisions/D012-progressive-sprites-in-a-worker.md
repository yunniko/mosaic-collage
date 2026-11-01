# D012 · Large sprites show a coarser step at once and are refined in a Web Worker
Date: 2026-11-01 · Goal: G-001 M5 · Status: active (superseded by: —)
Context: Torn edges and relief cost several passes per pixel; a 40 mm piece at 32 px/mm is about 1.6 M pixels, far too slow to render on the main thread while zooming.
Decision: `app/render/sprites.ts` renders on the main thread only up to 120 000 pixels (about 100 ms); a larger sprite is drawn from the nearest cached or a coarse step and requested from `app/render/sprite.worker.ts`, newest request first, stale ones dropped; `spriteVersion` redraws when it arrives.
Force: judgment — the budget comes from the measured ~1 µs per pixel; the queue order is a tie-break.
Rejected: rendering everything in the worker (thumbnails and small pieces would flicker in); tiling a sprite (more code for no visible gain at these sizes).
Consequence: `renderPiece` must stay free of DOM access so it runs in both places; a worker that fails to load falls back to main-thread rendering one job per task.
Evidence: `tests/unit/textures.spec.ts` (timing); browser check 2026-11-01, no console errors at maximum zoom.
