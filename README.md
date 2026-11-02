# mosaic-collage

A browser app for making mosaics and paper collages. Pieces are made on the **cutboard**: a shape,
texture, colour, relief and torn edge. They are then placed, rotated and locked on the
**workboard**. Mosaics are saved as editable `.mosaic` files and exported to JPG or PNG.

**State:** the first complete version (G-001) is done and live. What it does:
- cutboard: predefined, generated and hand-cut shapes; plain, generated, bundled paper, image and PDF-page textures
  with blend modes and hue/saturation/lightness; bevel or emboss relief; torn edges;
- workboard: place, move, rotate, lock and order pieces, with overlap on, or off with a margin;
- a background (any texture) behind the artwork, with a padding;
- save and open editable `.mosaic` files; export PNG (with or without the background) or JPG at
  72–600 dpi.

Everything runs in the browser: no server, no accounts. The app is served as a static site at
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

The table, mat and generated textures are made in code. The four bundled paper and card photos are CC0
from ambientCG, listed in `assets/ATTRIBUTION.md`.

More detail is in `HANDOVER.md` and `docs/decisions/`.
