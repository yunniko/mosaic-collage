# mosaic-collage — Handover
Last verified: 2026-11-01 at 0ff5e1c

A browser app for mosaics and paper collages. Pieces are made on a cutboard and placed on a
workboard. Goal G-001 is in `GOALS.md`. Charter: `E:\CLAUDE\COMPANY\`.

## Current state

G-001 milestone M1 (foundation) is done. Code is public at `https://github.com/yunniko/mosaic-collage`.
CI on GitHub runs format, lint, typecheck, unit, build and e2e.

Works, verified in this session:
- **Cutboard.**
  - New, duplicate, rename and delete pieces.
  - Predefined shapes with parameters, in a plain colour.
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
- **Shared.**
  - Undo and redo. A slider drag counts as one step.
  - Save and open the `.mosaic` file (a zip of `mosaic.json` and `assets/`). Loading validates the file
    and repairs what it can.
  - The artwork background follows the placed pieces.

Not built yet, as planned in later milestones:
- generated and hand-cut shapes;
- textures and colour;
- relief and torn edges;
- no-overlap placement;
- background choice and export.

The UI already shows the overlap and margin settings, but only overlap-allowed behaviour exists.

Tests: unit 42/42 (Vitest); e2e 13/13 (Playwright: chromium 6, firefox 6, tablet touch 1).

## How things fit together

- `lib/` is pure TypeScript and is unit-tested without a DOM. `app/` is the React UI, drawn on Canvas 2D.
- **Document.** `lib/document/` holds the types, ops, validation, the `.mosaic` file format and undo
  history. Every op returns a new document. `app/state/store.ts` is the single store, holding the history
  plus view state; `apply`/`applyCoalesced` make undo steps.
- **Pieces.** Pieces are templates and placements refer to them by ID (D002). A piece's outline comes from
  `lib/shapes/outline.ts`, built from predefined shapes or the generator registry in `lib/shapes/generators/`. The registry is empty until M2.
- **Rendering.**
  - Pieces render to RGBA through `lib/render/piece.ts` (D006).
  - `app/render/sprites.ts` caches each render per piece object and per power-of-two px/mm step.
  - The table and mat surfaces are generated in `app/render/surfaces.ts`.
- **Workboard.**
  - `app/workboard/WorkboardCanvas.tsx` holds the gesture state machine.
  - Pieces other than the one in hand are drawn into a cached static layer.
  - `lib/workboard/drag.ts` keeps the grab point under the pointer while the piece turns.
  - A tray drag reaches the board through `app/workboard/incoming.ts`, because the tray owns the pointer.
- **Camera.** Camera maths (pan, zoom, pinch, fit) is in `lib/view/camera.ts`, shared by both boards.

## Rules in force

- No server code and no accounts: the app runs entirely in the browser (Owner, D003).
- Served as a static site at `mosaic.app.julienika.cz`, source in the public repo `yunniko/mosaic-collage` (Owner, D005).
- A placed piece is never edited; "duplicate as new" makes an editable copy (Owner, D002). The sprite cache
  relies on it.
- Interface text goes through next-intl messages, English first (Owner, D004).
- Bundled textures and fonts need a licence allowing redistribution, recorded in assets/ATTRIBUTION.md
  (VALUES.md → Integrity of work). There are no bundled assets yet; the file is created with the first one, in M4.

## Next steps and open questions

- M2 — Shapes:
  - the generator algorithms (irregular polygon, shard, blob, wave strip);
  - the hand cutter with stabilisation;
  - outline validation and repair.
- Then M3–M6 per `GOALS.md`. M6 includes the deploy to `mosaic.app.julienika.cz`.
- No open questions for the Owner.

## Deploy log

| Date | Commit | What changed | How verified |
| ---- | ------ | ------------ | ------------ |

## Decisions

See `docs/decisions/README.md`.
