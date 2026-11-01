# D009 · With overlap off, a dragged piece stops at contact, swings, or jumps to free space
Date: 2026-11-01 · Goal: G-001 M3 · Status: active (superseded by: —)
Context: With overlap off, a dragged piece must keep the board margin from every other piece, whatever their outlines (concave, hand cut), and the drag must still feel direct. A piece already in a conflict moves freely, and a drop that crowds others moves to the nearest free spot.
Decision: `constrainMove` (`lib/workboard/placement.ts`) sends the piece to the pointer when that pose is free (jumping past obstacles), else stops it just short of contact and, with auto-rotate on, swings it about the contact point toward the pointer.
Force: judgment — the Owner's brief asks for sticking, auto-rotation and free space; the exact rules are design.
Rejected: sliding along the obstacle (the brief asks for sticking); a physics engine (unpredictable, and heavy for exact polygons).
Consequence: Clearance uses exact outline edges through `lib/geometry/collision.ts`; any new shape source needs no collision code of its own.
Evidence: `tests/unit/placement.spec.ts`; `tests/e2e/workboard.spec.ts`; `tests/e2e/touch.spec.ts`.
