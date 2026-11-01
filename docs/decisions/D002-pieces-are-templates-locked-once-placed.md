# D002 · Pieces are templates and are locked once placed
Date: 2026-11-01 · Goal: G-001 planning · Status: active (superseded by: —)
Context: A cutboard piece is either a physical item used once or a template placed many times, and editing it after placement can either change placed copies or not.
Decision: A piece is a template that can be placed any number of times. Once placed it cannot be edited; "duplicate as new" makes an editable copy.
Force: requirement — the Owner chose both options when asked on 2026-11-01.
Rejected: one physical item per piece; a counted stack; edits updating every placed copy (that would also break no-overlap layouts); edits creating a new version automatically.
Consequence: Placements refer to an immutable piece by ID, so rendered pieces and collision outlines can be cached for good.
Evidence: GOALS.md G-001 progress log, 2026-11-01.
