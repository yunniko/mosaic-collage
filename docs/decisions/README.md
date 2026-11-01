# Decisions — mosaic-collage

- D001 — Next.js static export, React, TypeScript, Canvas 2D — active
- D002 — Pieces are templates and are locked once placed — active
- D003 — Local only: no server, no accounts, no deploy in G-001 — superseded in part by D005
- D004 — English interface, ready for translation through next-intl — active
- D005 — Served as a static site at mosaic.app.julienika.cz; code in a public repo — active
- D006 — Pieces render through one pure RGBA pipeline in lib/ — active
- D007 — A hand cut stores its raw stroke; the outline is derived — active
- D008 — A self-crossing cut keeps its largest part, or is refused — active
- D009 — With overlap off, a dragged piece stops at contact, swings, or jumps to free space — active
- D010 — Textures are sampled per pixel in lib/; images and PDF pages are decoded once in the app — active
- D011 — Torn edges are a fractal offset of the cut line; relief is a lit height field from the edge distance — active
- D012 — Large sprites show a coarser step at once and are refined in a Web Worker — active
- D013 — A relief's light stays fixed on the board; lit sprites are cached per 5° turn — active
