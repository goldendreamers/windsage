# Windsage — context (start here)

Handoff for humans and agents. **Read this before changing the product.**

| | |
| --- | --- |
| **GitHub** | https://github.com/goldendreamers/windsage |
| **Branch** | `main` |
| **Live** | https://windsage.nimrod.bio/ |
| **Health** | https://windsage.nimrod.bio/health |
| **Tailnet** | https://windsage.taild8a1d4.ts.net/ |
| **Operator** | Nimrod — prefer autonomous work; email when blocked or when a step finishes |
| **Baseline** | Confirm with `git log -1 --oneline` (was `a4dac38` / `dbfd02e` when this note was last refreshed) |

```bash
git fetch origin && git checkout main && git pull
git log -5 --oneline
curl -sS https://windsage.nimrod.bio/health | head -c 400; echo
```

---

## Product in one paragraph

Friend-group **wind alert PWA**: cloud (Wald) polls weather sources, evaluates hold-time alert rules, pushes to phone/browser. The phone stays idle — no local 10‑minute polling. Default rule: average wind ≥ 15 kt for 20 minutes.

---

## Repo map

```
code/app/           Expo entry + App.tsx
code/screens/       Home, StationDetail, Account, Download
code/components/    StationCard, AddStationModal, LocationPicker, StatusPanel, …
code/core/          cloud client, alerts, stations, windguru, notifications
code/shared/        types, defaults, providers, glance, theme, assets
code/cloud/         Node server on Wald (server.mjs, lib/*, providers/*)
public/             PWA (sw.js, icons, privacy.html)
scripts/            release-web.py, notify-email.sh, backup-windsage-store.sh, checks
docs/               OUTSTANDING.md, PROGRESS_REVIEW.md, SSO-SETUP.md, STORE-PUBLISH.md, AGENTS.md
CONTEXT.md          ← this file
CLOUD_AGENT_CONTEXT.md  thin pointer here (older links)
```

Local Mac path (when on Nimrod’s machine): `/Users/goldendreamers/windsage`

---

## Architecture

| Layer | Role |
| --- | --- |
| Expo RN (web + native) | UI, follows, sync, receive push |
| Wald `windsage.service` | Poll providers, evaluate alerts, Expo + Web Push |
| Store | `/data/windsage/data/store.json` — **never wipe users/stations** |

**Providers:** `windguru`, `ndbc`, `openmeteo`, `location` (map/address blend), plus token-gated `synoptic` / `tempest` / `windfinder`.

**Deploy** (needs Tailscale / `wald-mc` SSH):

```bash
export PATH="$HOME/.local/node/bin:$PATH"
cd /Users/goldendreamers/windsage   # or this clone root
npm run release:web                 # export + snapshot + rsync cloud+web + restart
```

`scripts/release-web.py` rsyncs `code/cloud/` → `/data/windsage/` (excludes `data`, `web`, `node_modules`, `oauth.env`, `scripts`) and `dist/` → `/data/windsage/web/`.

---

## Iron rules for agents

1. After a finished product step: `npm run release:web` (don’t leave `dist/` stale) when Wald deploy is available.
2. Email via `scripts/notify-email.sh` (creds in gitignored `.env.smtp`):
   - Blocked → subject `Windsage · ACTION NEEDED: …`
   - Step done → subject `Windsage · done: …`
3. Full absolute URLs / `file://` paths in chat and artifacts.
4. **Never wipe** `store.json` users/stations. Saves refuse empty-users overwrite; empty `[]` sync only clears with `clearStations: true`.
5. Do not commit secrets (`.env`, `oauth.env`, `code/cloud/data/`).
6. Expo: check current docs — see `docs/AGENTS.md` (v57).

---

## Already shipped (don’t re-solve blindly)

- Multi-source follows + location map/address blend; catalog nickname-first add
- Spot forecast UI; alerts via nearest live when spot has no sensor
- Store wipe-proofing: unique tmp, save queue, bak recover, in-memory cache, refuse empty overwrite
- Daily backup cron on Wald: `/data/scripts/backup-windsage-store.sh` → `/data/backups/windsage/` (14d)
- Login/register + resolve rate limits; fetch timeouts; GET coalescing; poll concurrency 4; skip hot history fetches
- Home “Right now” glance + trend; source-hiccup banner (≥2s)
- **Plain alert copy** — waiting shows `10 kt`, not `Waiting — wind_avg 10.0 kt (need ≥15 kt)`
- Alert Good/Meh feedback (signed-in)
- SW v7; `/health` ETag; debounced persist→cloud sync
- Google SSO when secrets exist on Wald; PWA-first (stores optional)

---

## Still open

See `docs/OUTSTANDING.md`. Short list:

- Optional tokens: Synoptic / Tempest / Windfinder / Google Maps geocode
- Optional paid apex domain
- Deferred: “who’s out” social, SQLite, CI Actions

`docs/PROGRESS_REVIEW.md` external review — **Windguru-only SPOF is outdated** (multi-source exists).

---

## Smoke checks

```bash
curl -sS https://windsage.nimrod.bio/health | python3 -m json.tool | head -40
curl -sS -X POST https://windsage.nimrod.bio/v1/stations/resolve \
  -H 'content-type: application/json' -d '{"provider":"windguru","input":"2259"}'
curl -sS -X POST https://windsage.nimrod.bio/v1/stations/resolve \
  -H 'content-type: application/json' -d '{"provider":"ndbc","input":"46026"}'
# If Tailscale SSH works:
ssh wald-mc 'python3 -c "import json;d=json.load(open(\"/data/windsage/data/store.json\"));print(\"users\",len(d[\"users\"]),\"stations\",sum(len(u.get(\"stations\")or[]) for u in d[\"users\"].values()))"'
find code/cloud -name "*.mjs" -print0 | xargs -0 -n1 node --check
```

---

## Suggested first prompt (new agent)

> Read `/workspace/CONTEXT.md` (or repo-root `CONTEXT.md`) and `docs/OUTSTANDING.md`. Confirm `git log -1` and https://windsage.nimrod.bio/health. Then do the user’s task. Never wipe stations. After product changes: `npm run release:web` if Wald SSH works; email via `scripts/notify-email.sh` when done or blocked.

---

## Related docs

| File | Purpose |
| --- | --- |
| `README.md` | Product + ops overview |
| `docs/OUTSTANDING.md` | Blocked / needed from operator |
| `docs/PROGRESS_REVIEW.md` | External review (partially superseded) |
| `docs/SSO-SETUP.md` | OAuth setup |
| `docs/STORE-PUBLISH.md` | Store notes (PWA-first) |
| `docs/AGENTS.md` | Expo version reminder |
| `.cursor/rules/*.mdc` | Email + web-export rules |
