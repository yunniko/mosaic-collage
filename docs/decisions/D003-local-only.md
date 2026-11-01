# D003 · Local only: no server, no accounts, no deploy in G-001
Date: 2026-11-01 · Goal: G-001 planning · Status: superseded in part (superseded by: D005 — the app is now deployed; still no backend)
Context: The app could be local only or a hosted site on the VPS.
Decision: Everything runs in the browser. Files are saved to and loaded from the user's disk. G-001 includes no deploy.
Force: requirement — the Owner's choice on 2026-11-01.
Rejected: a static deploy on the Contabo VPS (a later goal can add it).
Consequence: Every feature has to work without a backend. Uploaded images and PDFs stay in memory and in the saved file, and nothing is sent anywhere.
Evidence: GOALS.md G-001 progress log, 2026-11-01.
