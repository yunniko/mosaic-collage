# D016 · The static export is served by an nginx container behind the host's vhost
Date: 2026-11-01 · Goal: G-001 M6 · Status: active (superseded by: —)
Context: D005 puts the site on the shared VPS, where every Company web app runs as a Docker container on a 127.0.0.1 port behind a `julai-new-vhost` nginx vhost.
Decision: `Dockerfile` builds the export with Node 22 and serves `out/` from `nginx:1.29-alpine` with `deploy/nginx.conf`; `docker-compose.yml` binds 127.0.0.1:30300; CI runs the e2e suite against that image.
Force: requirement for the container and 127.0.0.1 binding — `INFRASTRUCTURE.md` and the only vhost tool `claude_remote` may run proxies to a port; judgment for nginx over a Node static server.
Rejected: a plain `root` vhost under `/var/www` (needs root for every redeploy); `npx serve` in a Node image (a heavier runtime for static files).
Consequence: `.mjs` must stay served as JavaScript (pdf.js worker). 30300 was chosen after 30230 was found taken live by an undocumented `privatebin` container.
Evidence: `.github/workflows/ci.yml`; `deploy/nginx.conf`.
