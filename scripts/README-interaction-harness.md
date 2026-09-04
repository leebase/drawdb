# Interaction harness (WIP, 2026-09-03)

`node scripts/interaction-harness.mjs web ./dist` serves `dist/` with an SPA fallback and drives it with Playwright chromium.
`node scripts/interaction-harness.mjs electron .` launches `dist-electron/main.cjs` through Playwright `_electron` (works under WSL2/WSLg with `DISPLAY=:0`).

Status when parked: both launch; the run is blocked by drawDB's startup "Choose a database" modal (pick **Snowflake** then **Confirm** — the harness's generic cancel/Escape does not dismiss it). Next step: click the Snowflake option + Confirm, then click Add Table (`button:has(svg path[d^="M4 2 L20 2"])`) and capture `pageerror`. Purpose: reproduce the Add Table blank-screen crash Lee hit on the branch build; not yet reproduced or bisected. Baseline for bisect: `d654b2d` (pre-branch).
