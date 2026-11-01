# Goals — mosaic-collage

### G-001 · Mosaic/collage creator, first complete version — ACTIVE
- **What:** A browser app with two boards drawn as tables. The **cutboard** is where pieces are made:
  their shape, texture, colour, surface relief and edge. The **workboard** is where the finished pieces
  are placed, moved, rotated and locked on a background to build a mosaic. The mosaic is saved and
  loaded as an editable file, and exported to JPG or PNG.
- **Why:** The Owner's new small app (2026-11-01): paper-collage and mosaic composition with realistic
  pieces, without the cost of real material.
- **Acceptance criteria:**
  1. **Shapes.** A piece's shape comes from one of three sources:
     - predefined shapes;
     - generators, each one a plug-in to a registry, so new algorithms are added without touching the rest;
     - a hand cutter with a stabilisation setting, from raw stroke to strongly smoothed.
     Hand-cut outlines that cross themselves are repaired into a valid shape or refused with a message.
  2. **Textures.** A texture is a plain colour, a generated texture (also a registry), or an image or PDF
     page, either from a predefined set or loaded by the user. The texture's offset, scale and rotation
     inside the piece can be set.
  3. **Colour.** Colour is changed through blend modes (multiply, screen, overlay, colour and others)
     and through hue, saturation and lightness adjustments.
  4. **Relief and edges.** Bevel/emboss settings (depth, softness, light direction) and a torn-paper
     edge (roughness, scale, exposed paper fibres) that looks like torn paper, not a jagged outline.
  5. **Fixed pieces.** A piece is a template: it can be placed on the workboard any number of times.
     Once a piece has been placed it cannot be edited; "duplicate as new" makes an editable copy
     (Owner, 2026-11-01).
  6. **Workboard placement.** Pieces are picked from the tray, placed, moved, selected and locked or
     unlocked. A locked piece can be selected but not moved. The workspace has no fixed size: its
     extent comes from the placed pieces.
  7. **Overlap setting.** With overlap allowed, pieces stack and their order can be changed. With
     overlap off, a margin keeps pieces apart: a piece can never be placed or moved closer than the
     margin to another piece.
  8. **Dragging with overlap off.**
     - A dragged piece stops at a neighbour's margin.
     - With auto-rotation on, it turns about the contact point when there is room to turn.
     - Dragging on into free space makes it jump there.
     - While dragging, the mouse wheel (or a second finger on a touch screen) rotates the piece about
       the point where it was grabbed.
  9. **Background.** A colour, a texture, or a picture the user uploads.
  10. **Files.** Save and load an editable file that keeps every piece, asset and setting, and reopens
      identical to what was saved. Export to JPG, and to PNG with the background either included or
      transparent.
  11. Works with mouse and touch in current Chrome, Firefox and Edge. The interface is in English and set
      up for translation (Owner, 2026-11-01).
- **Constraints:**
  - No backend: it runs entirely in the browser, with no server-side code and no accounts (D003). It is
    served as a static site at `mosaic.app.julienika.cz` (Owner, 2026-11-01; D005).
  - Source in a public GitHub repo, `yunniko/mosaic-collage` (Owner, 2026-11-01).
  - Bundled textures and fonts must carry licences that allow use and redistribution, recorded in
    `assets/ATTRIBUTION.md` (VALUES.md → Integrity of work).

**Milestones** (accepted by the Owner 2026-11-01; the only deploy is M6's, to `mosaic.app.julienika.cz` on the Contabo VPS):
- [x] M1 — **Foundation.**
  - Next.js static app with the cutboard and workboard views, both drawn as tables; pan and zoom.
  - The document model: pieces as templates, placements, versioned schema.
  - Predefined shapes with a plain colour.
  - Place, move, select, lock and unlock pieces on the workboard, overlap allowed only.
  - Save and load the editable file.
  - CI: format, lint, unit and e2e.
  - Public GitHub repo `yunniko/mosaic-collage` with the code pushed.
- [ ] M2 — **Shapes.**
  - Generator registry with its first algorithms: irregular polygon, shard/Voronoi cell, organic blob,
    wave-edged strip.
  - Hand cutter with stabilisation.
  - Outline validation and repair.
  - Pieces lock once placed; "duplicate as new".
- [ ] M3 — **No-overlap placement.**
  - Margin offsets and collision against any shape, concave and hand-cut included.
  - Stopping at contact, auto-rotation about the contact point, jumping into free space.
  - Wheel and two-finger rotation about the grab point.
  - Unit tests on the geometry; e2e on the drag behaviour, mouse and touch.
- [ ] M4 — **Textures and colour.**
  - Generated-texture registry (noise, paper fibre, marble, stripes and others).
  - Image and PDF-page textures, predefined and uploaded (pdf.js).
  - Texture offset, scale and rotation; blend modes; HSL adjustment.
  - Bundled textures licence-checked and attributed.
- [ ] M5 — **Relief and torn edges.**
  - Bevel/emboss from the shape's distance field under a movable light.
  - Torn-paper edge: displaced outline and exposed fibre band.
  - Rendered pieces are cached, since pieces never change once placed.
  - A `domain-expert` review of how real torn paper looks, saved in `docs/`.
- [ ] M6 — **Background and export.**
  - Background colour, texture or uploaded picture.
  - JPG export, and PNG export with or without the background, at a chosen resolution.
  - Full QA pass, README and handover final.
  - **Deploy:** a static build served at `https://mosaic.app.julienika.cz` (a container bound to 127.0.0.1,
    an nginx vhost and a TLS certificate through `julai-new-vhost`), checked live.

**Progress log** (newest first):
- 2026-11-01 — **M1 done** (0ff5e1c). Built:
  - the cutboard, with predefined shapes in plain colour;
  - the workboard: tray drag or click to place; move, wheel and two-finger turn, select, lock, z-order, delete;
  - undo and redo;
  - `.mosaic` save and open;
  - CI on GitHub;
  - the public repo `yunniko/mosaic-collage`.

  Lock-once-placed and "duplicate as new" (planned for M2) were built here too.

  Check-in:
  - /simplify: about 20 clean-ups.
  - /code-review: 7 findings, 5 fixed.
  - Exercising the app found a tray-drag wheel turning the piece twice per notch. Fixed, with an e2e check.

  Verified: unit 42/42; e2e 13/13 (chromium 6, firefox 6, tablet touch 1); tsc, eslint, prettier clean;
  next build ok; no console errors while exercising both boards.

  Next: M2, shapes.
- 2026-11-01 — The Owner accepted the plan ("accept the plan; add it to github public repo and once built
  deploy to mosaic.app.julienika.cz"). That adds a public repo (M1) and a deploy (M6); D005 supersedes D003's
  "no deploy". No milestone is marked for review, so the goal runs through all six.
- 2026-11-01 — Goal created from the Owner's description. The Owner answered four questions about
  scope: pieces are templates (D002), placed pieces are locked (D002), the app is local only (D003),
  English and ready for translation (D004). Stack: D001. Plan presented; waiting for the Owner's
  acceptance.
