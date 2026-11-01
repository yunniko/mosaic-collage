# D005 · Served as a static site at mosaic.app.julienika.cz; code in a public repo
Date: 2026-11-01 · Goal: G-001 · Status: active (superseded by: —)
Context: D003 kept G-001 local only. When the Owner accepted the plan, they asked for a public repo and a deploy.
Decision: The static export is served at `https://mosaic.app.julienika.cz` from the Contabo VPS, and the source is in the public GitHub repo `yunniko/mosaic-collage`. There is still no backend.
Force: requirement — the Owner's instruction on 2026-11-01.
Rejected: staying local only (D003, replaced by this decision).
Consequence: D003's no-backend rule still holds, so user files never leave the browser. The deploy follows `COMPANY/INFRASTRUCTURE_DEPLOY.md`.
Evidence: GOALS.md G-001 progress log, 2026-11-01.
