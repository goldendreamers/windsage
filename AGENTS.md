# Windsage — agent guide

Start with [`CLOUD_AGENT_CONTEXT.md`](./CLOUD_AGENT_CONTEXT.md) and [`README.md`](./README.md) for the product overview, repo map, and mandatory repo rules (never wipe `store.json` users/stations; email via `scripts/notify-email.sh`; check versioned Expo docs). Expo version notes: [`docs/AGENTS.md`](./docs/AGENTS.md).

## Cursor Cloud specific instructions

Two services make up the product; both run locally in the cloud VM with no extra system deps (Node 22 + Python 3 are preinstalled; dependencies come from the update script):

- **Cloud backend** (`code/cloud/server.mjs`) — plain Node HTTP server on port `8787`. Only npm dep is `web-push` (lazy-loaded/optional). Run it from `code/cloud`:
  `WINDSAGE_PORT=8787 WINDSAGE_DATA=./data node server.mjs` — then `curl http://localhost:8787/health`. Persistence is a JSON file (`store.json`) under `WINDSAGE_DATA`; there is no database. `code/cloud/data/` is gitignored.
- **Expo client** (web PWA / native) — Metro dev server on port `8081`: `npm run web` (root). It serves at `http://localhost:8081`. The client's API base comes from `app.json` → `extra.windsageCloudUrl` (defaults to the public prod URL); point it at a local backend with `EXPO_PUBLIC_WINDSAGE_URL=http://localhost:8787`.

Lint / test: `npm run check` (root) runs 8 fixture-based smoke checks (alerts, share, catalog, windguru-names, install, location, synoptic, auth). It needs **no network** and is the de-facto test/lint gate. There is no `tsc` step in the npm scripts; running `npx tsc --noEmit` directly is not part of the workflow.

**Egress caveat (important):** external weather/geo provider domains are **blocked** by the cloud VM's network policy — `www.windguru.cz`, `www.ndbc.noaa.gov`, `*.open-meteo.com`, `nominatim.openstreetmap.org`. As a result, live readings and `POST /v1/stations/resolve` for `windguru`/`ndbc` fail with `{"error":"fetch failed"}`, and the backend logs `windguru directory warmup failed`. The `openmeteo` provider *resolves* offline (it just echoes lat/lon) but its live data fetch still needs egress. Auth, follow/sync, and persistence work fully offline. To test true end-to-end alert firing, request an egress allowlist for those domains.

**Deploy is operator-only:** `npm run release:web` / the `eas:*` scripts require Wald SSH + Tailscale (or EAS credentials) and cannot run in the cloud VM — do not attempt them here.

**Simple vs advanced:** new controls default to advanced unless they are a core “get an alert” action. See `.cursor/rules/simple-vs-advanced.mdc`. When writing a Mac deploy prompt, include the exact line `remember discord bot alerts`.
