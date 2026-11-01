# mosaic-collage

A browser app for making mosaics and paper collages. Pieces are made on the **cutboard**: a shape,
texture, colour, relief and torn edge. They are then placed, rotated and locked on the
**workboard**. Mosaics are saved as editable `.mosaic` files and exported to JPG or PNG.

**State:** goal G-001, milestone M1 done. M1 covers:
- the document model, undo, and save/open;
- predefined shapes in plain colours;
- the workboard with drag, wheel/two-finger rotation, locking and z-order.

Generated and hand-cut shapes, textures, relief, no-overlap physics, backgrounds and export follow in
M2–M6 (`GOALS.md`).

Everything runs in the browser: no server, no accounts. The app will be served as a static site at
`https://mosaic.app.julienika.cz` (D005).

## Run

Requires Node 22+ and npm 11. Use `npx -y npm@11 ci` if your npm is older.

```
npm ci
npm run dev          # http://localhost:3000
npm run build        # static export to out/
npm start            # serve out/
npm test             # Vitest unit + Playwright e2e (run `npx playwright install chromium firefox` once)
```

## Style

- System UI fonts.
- Warm paper panels (`#fbf7ef`) on a dark wood frame.
- Teal accent (`#1f6f6a`).
- The workboard is a generated wood table; the cutboard is a green cutting mat with a 1/10/50 mm grid.

All surfaces are generated in code, so there is nothing third-party to license. Any bundled assets
added later are listed in `assets/ATTRIBUTION.md`.

More detail is in `HANDOVER.md` and `docs/decisions/`.
