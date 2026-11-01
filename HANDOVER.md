# mosaic-collage — Handover
Last verified: 2026-11-01 at 5b67718

A browser app for mosaics and paper collages. Pieces are made on a cutboard and placed on a
workboard. Goal G-001 is in `GOALS.md`. Charter: `E:\CLAUDE\COMPANY\`.

## Current state

G-001 milestones M1 (foundation), M2 (shapes), M3 (no-overlap placement) and M4 (textures and colour) are done;
M4's bundled image textures wait on the Owner (see Next steps). Code is public at `https://github.com/yunniko/mosaic-collage`.
CI on GitHub runs format, lint, typecheck, unit, then build and e2e (`npm run test:e2e` builds first, so it
never tests a stale `out/`).

Works, verified in this session:
- **Cutboard.**
  - New, duplicate, rename and delete pieces.
  - Three shape sources, in a plain colour:
    - predefined shapes with parameters;
    - generated shapes (irregular polygon, shard, blob, wavy strip), with "New variation" for a new seed;
    - hand cut: draw one stroke on the mat, with stabilisation 0–100 adjustable afterwards. Esc or Cancel
      leaves cut mode. A stroke that crosses into two pieces, or is too small, is refused with a message.
  - Every outline is checked as it is made: an uncuttable shape never reaches the document. A file whose
    shape can't be cut loads with a rectangle in its place and a warning.
  - The view re-frames when the shape changes kind; tuning parameters keeps the view.
  - Pan and zoom, with the mouse or a pinch.
  - A placed piece is read-only; "duplicate as new" gives an editable copy.
- **Workboard.**
  - Placing: drag a piece from the tray onto the board, or click it to place it at the centre of the view.
  - Moving: drag a placed piece. The wheel turns it while held (15° per notch, 1° with Shift). On touch,
    a second finger turns it about the grab point.
  - Selecting: click to select, Shift to add to the selection.
  - Lock and unlock. A locked piece selects but does not move.
  - Delete; z-order to front, back, forward and backward; rotate by 15°.
  - Panning, pinch zoom, wheel zoom, and fit to view.
  - Keys: Delete, L, Esc, `[` `]`, R.
  - **Overlap off** (board setting, with a margin in mm), for any outline including concave and hand-cut ones:
    - a dragged piece stops at the margin of a neighbour; dragging on to a free spot jumps it there;
    - with "Auto-rotate at contact" on, a stopped piece swings about the contact point toward the pointer;
    - turns (wheel, second finger, R) stop at contact;
    - a drop or tray placement that would crowd a piece moves to the nearest free spot, at the margin;
    - a piece already overlapping when overlap is switched off is drawn red and moves freely until clear.
- **Textures and colour** (cutboard, Texture and Colour layers sections):
  - plain colour; seven generated textures (paper, clouds, marble, wood, granite, weave, stripes) with
    parameters, editable colour stops and "New variation";
  - an uploaded image (PNG, JPEG, WebP, GIF, AVIF, BMP; not SVG) or a PDF page with a page picker, saved
    inside the `.mosaic` file; a file that can't be read gives a message and the fallback colour;
  - texture shift, scale and angle, about the piece's centre;
  - colour layers in order: tints in 16 W3C blend modes with opacity, and hue/saturation/lightness shifts.
- **Shared.**
  - Undo and redo. A slider drag counts as one step.
  - Save and open the `.mosaic` file (a zip of `mosaic.json` and `assets/`). Loading validates the file
    and repairs what it can.
  - The artwork background follows the placed pieces.

Not built yet, as planned in later milestones:
- bundled image textures (waiting on the Owner);
- relief and torn edges;
- background choice and export.

Known limit: a piece renders on the main thread at about 1 µs per pixel (`tests/unit/textures.spec.ts`
timings), so zooming a large piece far in can stall for seconds. Carried into M5.

Tests: unit 92/92 (Vitest); e2e 38/38 (Playwright: chromium 18, firefox 18, tablet touch 2).

## How things fit together

- `lib/` is pure TypeScript and is unit-tested without a DOM. `app/` is the React UI, drawn on Canvas 2D.
- **Document.** `lib/document/` holds the types, ops, validation, the `.mosaic` file format and undo
  history. Every op returns a new document. `app/state/store.ts` is the single store, holding the history
  plus view state; `apply`/`applyCoalesced` make undo steps.
- **Pieces.** Pieces are templates and placements refer to them by ID (D002). A piece's outline comes from
  `lib/shapes/outline.ts`, built from a predefined shape, a generator in `lib/shapes/generators/` (seeded,
  so a seed always gives the same shape) or a hand stroke (`lib/shapes/hand.ts`, D007). Outlines are cached
  per shape object and must pass `checkOutline` in `lib/shapes/repair.ts` (D008).
  To add a generator: a module returning a simple outline for every seed and parameter, registered in
  `lib/shapes/generators/index.ts`, with its labels in `messages/en.json`; `tests/unit/cutting.spec.ts`
  sweeps it automatically.
- **Rendering.**
  - Pieces render to RGBA through `lib/render/piece.ts` (D006).
  - `app/render/sprites.ts` caches each render per piece object and per power-of-two px/mm step.
  - The table and mat surfaces are generated in `app/render/surfaces.ts`.
- **Textures** (D010). `lib/textures/sample.ts` turns a texture into a flat colour, a generated field through a
  colour ramp, or decoded pixels; `lib/raster/blend.ts` holds the blend and HSL maths. Generators are a
  registry in `lib/textures/generators/` like the shape generators. `app/render/texture-images.ts` decodes
  images and PDF pages (pdf.js, loaded on demand) and bumps `textureVersion` in the store when one settles;
  stand-in sprites drawn while decoding are replaced then.
- **Workboard.**
  - `app/workboard/WorkboardCanvas.tsx` holds the gesture state machine.
  - Pieces other than the one in hand are drawn into a cached static layer.
  - `lib/workboard/drag.ts` keeps the grab point under the pointer while the piece turns.
  - A tray drag reaches the board through `app/workboard/incoming.ts`, because the tray owns the pointer.
  - No-overlap rules (D009) live in `lib/workboard/placement.ts`: `constrainMove`/`constrainTurn` for the live
    drag, and `moveFree`/`placeFree`/`turnFree` for every committed move, so no control bypasses the margin.
    Clearance between exact outlines is `lib/geometry/collision.ts` (edges bucketed in a grid per placed
    outline, cached with it).
- **Cut mode.** `cuttingPieceId` in the store, read through `useCutting()`; it ends when the selection
  changes. `app/cutboard/CutboardCanvas.tsx` draws the stroke and applies it on release.
- **Camera.** Camera maths (pan, zoom, pinch, fit) is in `lib/view/camera.ts`, shared by both boards.

## Rules in force

- No server code and no accounts: the app runs entirely in the browser (Owner, D003).
- Served as a static site at `mosaic.app.julienika.cz`, source in the public repo `yunniko/mosaic-collage` (Owner, D005).
- A placed piece is never edited; "duplicate as new" makes an editable copy (Owner, D002). The sprite cache
  relies on it.
- Interface text goes through next-intl messages, English first (Owner, D004).
- Bundled textures and fonts need a licence allowing redistribution, recorded in assets/ATTRIBUTION.md
  (VALUES.md → Integrity of work). There are no bundled assets yet; the file comes with the first one.

## Next steps and open questions

- M5 — Relief and torn edges, per `GOALS.md`; also take sprite rendering off the main thread or cap its
  resolution (the known limit above).
- Then M6, which includes the deploy to `mosaic.app.julienika.cz`.
- BLOCKED: may four CC0 texture zips be downloaded from ambientcg.com for the bundled set? Details in the
  `GOALS.md` progress log. Until then the predefined set is the generated textures.

## Deploy log

| Date | Commit | What changed | How verified |
| ---- | ------ | ------------ | ------------ |

## Decisions

See `docs/decisions/README.md`.
