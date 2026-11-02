# mosaic-collage — Handover
Last verified: 2026-11-02 at f2290f9

A browser app for mosaics and paper collages. Pieces are made on a cutboard and placed on a
workboard. Goal G-001 is in `GOALS.md`. Charter: `E:\CLAUDE\COMPANY\`.

## Current state

G-001 is done and signed off (2026-11-02; archived in `docs/goals-archive.md`). No goal is active.
- Code is public at `https://github.com/yunniko/mosaic-collage`.
- The app is live at `https://mosaic.app.julienika.cz` (see Deploy log).
- CI on GitHub runs format, lint, typecheck and unit, then builds the production nginx image and runs the e2e
  suite against it.

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
  - plain colour; four bundled photographed papers and card (D017); seven generated textures (paper, clouds, marble, wood, granite, weave, stripes) with
    parameters, editable colour stops and "New variation";
  - an uploaded image (PNG, JPEG, WebP, GIF, AVIF, BMP; not SVG) or a PDF page with a page picker, saved
    inside the `.mosaic` file; a file that can't be read gives a message and the fallback colour;
  - texture shift, scale and angle, about the piece's centre;
  - colour layers in order: tints in 16 W3C blend modes with opacity, and hue/saturation/lightness shifts.
- **Relief and torn edges** (cutboard, Relief and Torn edge sections; D011):
  - relief styles bevel, emboss and pillow with size, depth and softness, plus a texture bump; one light
    with angle and altitude, fixed on the board, so turned pieces stay lit from the same side (D013);
  - torn edge: five paper kinds, roughness, coverage, a lighter core band from the paper or a set colour,
    fibres and fuzz outside the line, and "New tear" for another seed.
- **Shared.**
  - Undo and redo. A slider drag counts as one step.
  - Save and open the `.mosaic` file (a zip of `mosaic.json` and `assets/`). Loading validates the file
    and repairs what it can.
- **Background and export** (workboard panel; D014, D015):
  - The background is any texture (plain, generated, image or PDF page) laid over the placed pieces' bounds
    plus a padding in mm.
  - Export: PNG with or without the background, or JPG, at 72–600 dpi. The size is announced before export.
    Exports over 64 MP are refused with the reason. Composition runs in a worker and reports progress.
  - The board's drop shadow is exported at the same look.
- **Layout.** Below 768 px wide the board comes first at full width and the panels stack under it.


Rendering a large sprite no longer stalls a zoom: it is shown coarser at once and refined in a Web Worker
(D012); checked in the browser at maximum zoom with no console errors.

Tests: unit 120/120 (Vitest); e2e 56/56 (Playwright: chromium 27, firefox 27, tablet touch 2), locally and in
CI against the nginx image.
- An export toast could vanish before Firefox's driver looked for it, so the export specs record notices in
  the page.
- Known, untraced: a rare e2e load timeout that passes on a rerun (none in the 2026-11-01 runs).

QA: the full pass of 2026-11-01 is `docs/qa-review/qa-review-2026-11-01-full.md`. Its two real findings are
fixed; one minor finding is open (see Next steps).

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
  - `app/render/sprites.ts` caches each render per piece object, per power-of-two px/mm step and, for a lit
    piece, per 5° turn (D013); renders over its main-thread budget go to `app/render/sprite.worker.ts` (D012).
  - Torn edges (`lib/edges/`) offset the cut outline; `lib/render/edge.ts` paints the band and fibres and
    `lib/render/relief.ts` lights the height field, both inside `renderPiece`.
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
- **Background and export.**
  - `lib/export/plan.ts` sizes the export from the artwork bounds, including the torn edges' reach.
  - `app/export/compose.ts` draws it in `app/export/export.worker.ts`, started by `app/export/run-export.ts`.
  - The drop shadow is `lib/render/shadow.ts`, shared with the board.
  - `app/render/background.ts` renders the board's background, deferring only parameter tweaks.
- **Serving.** `Dockerfile` builds the static export into an nginx image configured by `deploy/nginx.conf`.
  `docker-compose.yml` binds it to `127.0.0.1:30300` (D016). The host's vhost proxies to it.

## Rules in force

- No server code and no accounts: the app runs entirely in the browser (Owner, D003).
- Served as a static site at `mosaic.app.julienika.cz`, source in the public repo `yunniko/mosaic-collage` (Owner, D005).
- A placed piece is never edited; "duplicate as new" makes an editable copy (Owner, D002). The sprite cache
  relies on it.
- The container binds to `127.0.0.1:30300` only, behind the host's TLS vhost (`INFRASTRUCTURE.md`: never
  0.0.0.0; 30230 is taken by another site's container).
- `deploy/nginx.conf` must serve `.mjs` as JavaScript: browsers refuse a module worker of any other type,
  and pdf.js's worker is `.mjs`.
- Interface text goes through next-intl messages, English first (Owner, D004).
- Bundled textures and fonts need a licence allowing redistribution, recorded in assets/ATTRIBUTION.md
  (VALUES.md → Integrity of work).

## Next steps and open questions

- No goal is active; new work starts as G-002 in `GOALS.md`.
- QA finding 3: a file colour not in `#rrggbb` form loads as `#888888` without a warning. Low priority.
- Not yet checked: Edge, a real phone or tablet, and timing a 600 dpi export of a large board.
- Redeploy: `cd /var/www/repositories/mosaic-collage && git pull && docker compose --profile app up -d --build`.
  Then check the site in a browser and confirm the other containers were not recreated.

## Deploy log

| Date | Commit | What changed | How verified |
| ---- | ------ | ------------ | ------------ |
| 2026-11-01 | 56af31a | First deploy: container, vhost and TLS via `julai-new-vhost` | HTTPS 200, headers, `.mjs` type, real PNG export in Chrome, other sites 200 |
| 2026-11-02 | f2290f9 | Bundled paper and card textures | Texture specs against the live URL, 4/4; other sites 200; only this container recreated |
| 2026-11-01 | cee8523 | Number-box and phone-layout fixes from QA | 3 e2e specs × 2 browsers against the live URL, 6/6; other sites 200; only this container recreated |

## Decisions

See `docs/decisions/README.md`.
