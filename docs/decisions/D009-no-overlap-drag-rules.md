# D009 · With overlap off, a dragged piece stops at contact, swings, or jumps to free space
Date: 2026-11-01 · Goal: G-001 M3 · Status: active (superseded by: —)
Context: With overlap off, a dragged piece must keep the board margin from every other piece, whatever their outlines (concave, hand cut), and the drag must still feel direct.
Decision: `constrainMove` (`lib/workboard/placement.ts`) works in three steps. If the pose under the pointer is free, the piece goes there, which jumps it past obstacles. Otherwise it sweeps toward the pointer and stops just short of contact. With auto-rotate on, it then swings about the contact point toward the pointer. A piece already in a conflict moves freely, and a drop that crowds others moves to the nearest free spot.
Force: judgment — the Owner's brief asks for sticking, auto-rotation and free space; the exact rules are design.
Rejected: sliding along the obstacle (the brief asks for sticking); a physics engine (unpredictable, and heavy for exact polygons).
Consequence: Clearance uses exact outline edges through `lib/geometry/collision.ts`; any new shape source needs no collision code of its own.
Evidence: `tests/unit/placement.spec.ts`; `tests/e2e/workboard.spec.ts`; `tests/e2e/touch.spec.ts`.
