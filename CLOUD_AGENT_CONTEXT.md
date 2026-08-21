# Windsage — cloud agent context

**Start here** when opening a new Cursor cloud (or any remote) agent session.

## Git

| | |
| --- | --- |
| **GitHub** | https://github.com/goldendreamers/windsage |
| **Clone** | `git clone https://github.com/goldendreamers/windsage.git` |
| **Default branch** | `main` |
| **Local Mac path** (if available) | `/Users/goldendreamers/windsage` |

```bash
cd windsage   # or /Users/goldendreamers/windsage
git fetch origin && git checkout main && git pull
git log -5 --oneline
```

Baseline when this file was written: `325b51d` on `main`  
(*PR #8 merged; Mac still needs VAPID + Wald `release:web`.*)  
Weekly audit: `docs/WEEKLY_REVIEW_2026-08-21.md` (2026-08-21). Draft PR #9 is **not** on `main`.

## What the product is

Friend-group **wind alert PWA**: cloud polls weather sources, evaluates hold-time rules, pushes to phone/browser. Phone stays idle — no local 10‑minute Windguru polling.

- Live app: https://windsage.nimrod.bio/
- Health: https://windsage.nimrod.bio/health
- Tailnet: https://windsage.taild8a1d4.ts.net/
- Operator: Nimrod (principal). Prefer autonomous work; email when blocked or when a step finishes (see rules below).

## Repo map

```
code/app/           Expo entry + App.tsx
code/screens/       Home, StationDetail, Account, Download
code/components/    Cards, AddStationModal, LocationPicker, StatusPanel, …
code/core/          cloud client, alerts, stations, windguru, notifications
code/shared/        types, defaults, providers, glance, theme, assets
code/cloud/         Node server on Wald (server.mjs, lib/*, providers/*)
public/             PWA (sw.js, icons, privacy)
scripts/            release-web.py, notify-email.sh, backup-windsage-store.sh, checks
docs/               OUTSTANDING.md, PROGRESS_REVIEW.md, SSO-SETUP.md, STORE-PUBLISH.md
releases/           local web snapshots / zips (often gitignored)
```

## Architecture (short)

| Layer | Role |
| --- | --- |
| Expo RN (web + native) | UI, follow list, sync, receive push |
| Wald cloud (`windsage.service`) | Poll providers, alert logic, Expo + Web Push |
| Store | `/data/windsage/data/store.json` on Wald — **never wipe users/stations** |

**Providers:** windguru, ndbc, openmeteo, location (map/address blend), plus token-gated synoptic/tempest/windfinder.

**Deploy (from a machine with Tailscale/`wald-mc` SSH):**

```bash
export PATH="$HOME/.local/node/bin:$PATH"
cd /Users/goldendreamers/windsage   # or clone root
npm run release:web                 # export + snapshot + rsync cloud+web + restart
```

`scripts/release-web.py` rsyncs `code/cloud/` → `/data/windsage/` (excludes `data`, `web`, `node_modules`, `oauth.env`, `scripts`) and `dist/` → `/data/windsage/web/`.

## Local phone environment (Mac — not this cloud VM)

The product **is the phone app**. Cloud agents cannot run Expo Go or iPhone Safari. Paste **Pending item 0** from `docs/MAC_AGENT_PROMPTS.md` into a **local** Mac Cursor chat.

On the Mac, after `npm install`:

```bash
# Real phone (Expo Go) against live Wald:
EXPO_PUBLIC_WINDSAGE_URL=https://windsage.nimrod.bio npm start

# Or local cloud + Expo web (no phone):
npm run cloud                 # http://127.0.0.1:8787/health
EXPO_PUBLIC_WINDSAGE_URL=http://127.0.0.1:8787 npm run web
```

Cursor Cloud VMs: `.cursor/environment.json` only starts the **cloud backend** (`scripts/dev-local.sh --cloud`). Do not treat Expo web in the VM as a lock-screen / Expo Go test.

## Mandatory agent rules (repo)

1. After a finished product step: run `npm run release:web` (don’t leave `dist/` stale).
2. Email via `scripts/notify-email.sh` (creds in gitignored `.env.smtp`):
   - Blocked → subject starts with `Windsage · ACTION NEEDED:`
   - Step done → subject starts with `Windsage · done:`
3. Full absolute URLs / `file://` paths in chat.
4. **Never** wipe `store.json` users/stations. Saves refuse empty-users overwrite; use `clearStations: true` only for intentional unfollow-all.
5. Do not commit secrets (`.env`, `oauth.env`, `code/cloud/data/`).
6. Expo docs: see `docs/AGENTS.md` (check current Expo version docs before inventing APIs).

## Recently shipped (know this before “fixing” again)

- Multi-source follows + location map/address blend
- Spot forecast UI; alerts via nearest live station when needed
- Store wipe-proofing (unique tmp, save queue, bak recover, in-memory cache)
- Daily store backup cron on Wald (`/data/scripts/backup-windsage-store.sh` → `/data/backups/windsage/`, 14d)
- Login/register + resolve rate limits; fetch timeouts; GET coalescing; poll concurrency 4
- Home “Right now” glance + trend; source-hiccup banner (≥2s)
- Plain alert copy (e.g. waiting shows `10 kt`, not `Waiting — wind_avg…`)
- Alert Good/Meh feedback (signed-in)
- SW v7; `/health` ETag; debounced persist→cloud sync
- Google SSO live when secrets present on Wald

## Still open / optional

See `docs/OUTSTANDING.md`. Highlights:

- **Operator:** VAPID on Wald + `npm run release:web` + locked-phone Web Push test (PR #8). Confirm store backup cron.
- Draft **PR #9** (Follow name search, follow-list merge, simple mode, …) — fix StationDetail ternary; do not merge the 69-file draft blindly. Optional Resend wind-alert email in that PR contradicts “no user alert emails.”
- Close stale drafts: PR #3 (Maps paste — already on `main`), likely PR #1 (context file).
- Optional tokens: Synoptic / Tempest / Windfinder
- Optional `GOOGLE_MAPS_API_KEY` on Wald (Places autocomplete only — Map search works without it via Maps URLs)
- Optional paid apex domain
- Deferred: “who’s out” social, SQLite, CI Actions

External research notes: `docs/PROGRESS_REVIEW.md` (12 Aug; Windguru-only SPOF is **outdated** — multi-source exists). Newer snapshot: `docs/WEEKLY_REVIEW_2026-08-21.md`.

## Smoke checks

```bash
curl -sS https://windsage.nimrod.bio/health | python3 -m json.tool | head -40
curl -sS -X POST https://windsage.nimrod.bio/v1/stations/resolve \
  -H 'content-type: application/json' -d '{"provider":"windguru","input":"2259"}'
curl -sS -X POST https://windsage.nimrod.bio/v1/stations/resolve \
  -H 'content-type: application/json' -d '{"provider":"ndbc","input":"46026"}'
# If Tailscale SSH works:
ssh wald-mc 'python3 -c "import json;d=json.load(open(\"/data/windsage/data/store.json\"));print(len(d[\"users\"]), sum(len(u.get(\"stations\")or[]) for u in d[\"users\"].values()))"'
find code/cloud -name "*.mjs" -print0 | xargs -0 -n1 node --check
```

## Local zip snapshot (Mac only)

`file:///Users/goldendreamers/windsage/releases/local-zips/windsage-20260812T223104Z.zip`  
(~4.5 MB tree snapshot; not required for cloud agents — use GitHub.)

## Suggested first prompt for a new cloud agent

> Clone https://github.com/goldendreamers/windsage (`main`). Read `CLOUD_AGENT_CONTEXT.md`, `docs/OUTSTANDING.md`, and **`docs/MAC_AGENT_PROMPTS.md`**. Confirm `git log -1` and https://windsage.nimrod.bio/health. Then continue from the user’s task. Do not wipe stations; after product changes run `npm run release:web` if Wald SSH is available, and email via `scripts/notify-email.sh` when done or blocked. If Wald deploy or Mac-only work is left pending, **append an exact paste-ready prompt** to `docs/MAC_AGENT_PROMPTS.md` (Pending section).

## Related docs

| File | Purpose |
| --- | --- |
| `README.md` | Product + ops overview |
| **`docs/MAC_AGENT_PROMPTS.md`** | **Running paste-ready prompts for Mac Cursor (phone env / Wald / Tailscale)** |
| `AGENTS.md` | Cloud vs Mac: local phone env lives on the Mac |
| `docs/OUTSTANDING.md` | Blocked / needed from operator |
| `docs/WEEKLY_REVIEW_2026-08-21.md` | 2026-08-21 progress, gaps, problems |
| `docs/PROGRESS_REVIEW.md` | External review 12 Aug (partially superseded) |
| `docs/SSO-SETUP.md` | Google/Facebook/Apple OAuth |
| `docs/STORE-PUBLISH.md` | Store publish notes (PWA-first) |
| `docs/AGENTS.md` | Expo version doc reminder |
| `.cursor/rules/*.mdc` | Email + web-export rules (local Cursor) |
