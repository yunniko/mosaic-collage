# QA review — 2026-11-01 — full

**Mode and scope:** full (no earlier run record). The live site `https://mosaic.app.julienika.cz` was tested at
56af31a, in Chrome through the real UI. The local build was tested with Playwright at 390 px and 1280 px.
Fixes were made in cee8523, redeployed, and re-checked live. There is no domain reference for QA: correctness
here is the app's own spec (`GOALS.md` G-001 criteria). The torn-paper look has its own domain review
(`docs/reviews/2026-11-01-torn-paper-relief-reference.md`).

## Findings

| # | Severity | Finding | Status |
| - | -------- | ------- | ------ |
| 1 | broken input | Number boxes clamped on every keystroke. Width has a 4 mm minimum, so typing "12" read "1" as 4, then appended "2": the result was 42. | Fixed in cee8523, e2e `a number typed digit by digit…` |
| 2 | usability | At phone width (390 px) the side panels pushed both boards off-screen, and the page scrolled sideways. | Fixed in cee8523: below 768 px the board comes first at full width and the panels stack under it. e2e `on a phone-width screen…` |
| 3 | edge-case UX, minor | A `.mosaic` file whose colour is not `#rrggbb` loads with the default `#888888` and gives no warning. Other repairs (an uncuttable shape, a missing picture) do warn. | Open, low priority |

**Finding 1.**
- Repro: on the cutboard, select the Width box, clear it, and type `12`.
- Expected: 12.
- Actual: 42, because the clamp ran before the user had finished typing.
- Now: the box keeps what is typed. A value is applied live while it is in range. On blur or Enter the value is clamped, and an empty box goes back to the current value.

**Finding 2.**
- Evidence: Playwright screenshots at 390×844. Before the fix the document's `scrollWidth` was 548 and the board was off-screen. After it, `scrollWidth` is 390 and the board is at the top.
- Phone use was not an acceptance criterion: criterion 11 names mouse and touch, and tablet is tested. The fix is a layout change only.

## Cases that behaved correctly

**File open** (crafted `.mosaic` zips through the real Open button). Each opened with a message and without a console error:
- corrupt zip, a zip without `mosaic.json`, invalid JSON, a newer schema version;
- `__proto__` keys: no prototype pollution (`({}).polluted` stayed undefined);
- duplicate ids;
- 2001 pieces;
- a width of `"forty"` (default used);
- a width of -40 or 1e9: the shape and the box use the value clamped to 4–400 (`sanitizeParams`), while the raw value stays in a re-saved file until the piece is edited (harmless; noted);
- a pose of 1e12 (kept as is; not checked further).

**Document name.** Path characters and `<script>` are kept as text and sanitised in the download filename. The name is rendered as text, not HTML.

**Export.**
- A real PNG export from the live site, 806×659, with the size it announced.
- The JPG and transparent-PNG paths are covered by e2e.
- The size limit (64 MP) disables the button with a reason; covered by unit tests, not exercised live.

**Undo/redo, lock-once-placed, duplicate-as-new, hand-cut refusal and Esc:** exercised through e2e (54/54) and by hand in Chrome.

**Live deploy.**
- HTTPS 200; security headers present; `.mjs` (the pdf.js worker) served as JavaScript.
- The other sites still returned 200 after both deploys, and only `mosaic-collage-app-1` was recreated.

## UI/UX checklist

- **Task efficiency.** Golden path from landing to export: New piece → Workboard → click the tray item → Export = 4 clicks. The primary actions (New piece, Save, Export) are the accent-coloured buttons.
- **Feedback.**
  - Save, open, export and refusals show a toast.
  - A placed piece's editor says why it is read-only.
  - Disabled buttons (Redo, Export with nothing placed) look disabled.
- **Progress.** Export reports progress from the worker. Large sprites show coarse at once and refine (D012).
- **Colour.**
  - Teal accent on warm paper; body text is dark ink on `#fbf7ef`.
  - Errors are toasts with text, not colour alone.
  - The red overlap marking on the board comes with the "overlapping" behaviour, not a label (minor; noted, not changed).
- **Layout and type.**
  - System fonts and small uppercase section heads; panels are grouped by section.
  - Phone width: fixed (finding 2). Tablet (1194 px) and desktop are fine.

## Coverage statement

Exercised:
- every UI input surface: the number boxes and sliders (boundary, empty and out-of-range typing), selects, colour pickers;
- the document name; file open with malformed and hostile files;
- export at 72 dpi and the default dpi;
- phone and desktop viewports;
- touch through the tablet e2e project.

Not exercised live:
- image and PDF texture uploads with malformed files. The code's error paths are covered by unit tests and an M4 Chrome check, not re-run today.
- export at 600 dpi on a large board (not timed);
- Edge (Chromium-based; Chrome and Firefox were tested);
- a real phone or tablet device. Touch was emulated only.
