# D013 · A relief's light stays fixed on the board; lit sprites are cached per 5° turn
Date: 2026-11-01 · Goal: G-001 M5 · Status: active (superseded by: —)
Context: A sprite is rendered in the piece's own frame and rotated on the workboard, so a baked-in light turned with every placed piece and neighbouring pieces were lit from different sides.
Decision: `renderPiece` takes the piece's turn and lights it from `lightAngle − turn`; `app/render/sprites.ts` caches lit pieces per turn rounded to 1/72 of a circle, keeping the four most recently drawn turns; unlit pieces ignore the turn.
Force: judgment — a mosaic reads as one surface under one light; 5° is below what the eye tells apart in a light direction, and four turns bound the memory.
Rejected: lighting at draw time with a canvas filter (cannot reproduce the height-field shading); one sprite per exact angle (unbounded re-renders while rotating).
Consequence: anything that draws a placed lit piece (boards, M6 export) passes its rotation to `getSprite`/`renderPiece`.
Evidence: `tests/unit/edges.spec.ts` ("relief light"); code review of M5, 2026-11-01.
