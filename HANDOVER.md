# mosaic-collage — Handover
Last verified: 2026-11-01 at 047abf0

A browser app for mosaics and paper collages. Pieces are made on a cutboard and placed on a
workboard. Goal G-001 is in `GOALS.md`. Charter: `E:\CLAUDE\COMPANY\`.

## Current state

- Planning only. G-001 has six proposed milestones and waits for the Owner to accept the plan.
- There is no code, and so no tests yet.

## How things fit together

- Planned design (D001, D002): an immutable piece library plus placements that refer to pieces by ID.
  Both boards draw with Canvas 2D from per-piece cached bitmaps and collision outlines.

## Rules in force

- No server, no accounts, no deploy in G-001 (Owner, D003).
- A placed piece is never edited; "duplicate as new" makes an editable copy (Owner, D002).
- Interface text goes through next-intl messages, English first (Owner, D004).

## Next steps and open questions

- PENDING APPROVAL: the Owner accepts the G-001 milestone plan in `GOALS.md`. M1 starts after that.

## Deploy log

| Date | Commit | What changed | How verified |
| ---- | ------ | ------------ | ------------ |

## Decisions

See `docs/decisions/README.md`.
