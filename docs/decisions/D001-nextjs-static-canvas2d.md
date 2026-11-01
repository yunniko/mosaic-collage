# D001 · Next.js static export, React, TypeScript, Canvas 2D
Date: 2026-11-01 · Goal: G-001 planning · Status: active (superseded by: —)
Context: The app runs only in the browser and needs fast drawing for many textured, rotated pieces.
Decision: Next.js with static export, React 19 and TypeScript; both boards draw with Canvas 2D; Vitest and Playwright for tests; Prettier from `COMPANY/configs/prettier.json`; pdf.js for PDF textures.
Force: judgment — the stack matches the portfolio (Next.js, React and pdfjs-dist in cross-stitch and others). Canvas 2D is enough because a piece never changes once placed, so each one is drawn once to a cached bitmap and then only moved and rotated.
Rejected: Vite + React (as good, but new to the portfolio); WebGL/Pixi (a GPU library the portfolio does not use, not needed for cached sprites); SVG DOM (slow with many textured pieces and filters).
Consequence: If measured frame times with realistic piece counts are too slow, revisit the renderer and record that in a new decision.
Evidence: GOALS.md G-001; the portfolio's package.json files (2026-11-01).
