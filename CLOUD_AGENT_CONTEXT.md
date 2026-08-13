# Windsage — cloud agent context

**Start here** in every new Cursor cloud agent session. Read this file first, then `docs/OUTSTANDING.md`.

Shared product handoff (same facts, less cloud-ops): [`CONTEXT.md`](./CONTEXT.md)

---

## 0) Boot checklist (do this first)

```bash
cd /workspace   # this cloud VM; Mac path is /Users/goldendreamers/windsage
git fetch origin && git checkout main && git pull --ff-only
git log -5 --oneline
curl -sS https://windsage.nimrod.bio/health | head -c 500; echo
```

| | |
| --- | --- |
| **GitHub** | https://github.com/goldendreamers/windsage |
| **Default branch** | `main` |
| **Live app** | https://windsage.nimrod.bio/ |
| **Health** | https://windsage.nimrod.bio/health |
| **Tailnet** | https://windsage.taild8a1d4.ts.net/ |
| **Operator** | Nimrod (nimrod@mezoo.co) — prefer autonomous work |
| **Baseline** | Run `git log -1 --oneline` after pull (context written against `dbfd02e`+ era) |

If the task needs a PR: branch as `cursor/<descriptive-name>-XXXX` (use the suffix from cloud instructions), commit, push, open draft PR with `ManagePullRequest`.

---

## 1) What the product is

Friend-group **wind alert PWA**: cloud polls weather sources, evaluates hold-time rules, pushes to phone/browser. Phone stays idle — **no** local 10‑minute Windguru polling.

Default rule: average wind **≥ 15 kt for 20 minutes**. Cloud poll ~every **10 minutes** on Wald.

---

## 2) Repo map

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
CONTEXT.md          Shared handoff
CLOUD_AGENT_CONTEXT.md  ← this file
```

---

## 3) Architecture

| Layer | Role |
| --- | --- |
| Expo RN (web + native) | UI, follow list, sync, receive push |
| Wald `windsage.service` | Poll providers, alert logic, Expo + Web Push |
| Store | `/data/windsage/data/store.json` on Wald — **never wipe users/stations** |

**Providers:** `windguru`, `ndbc`, `openmeteo`, `location` (map/address blend), plus token-gated `synoptic` / `tempest` / `windfinder`.

**Wald SSH host:** `wald-mc` → `nimrodw@100.125.98.56` (needs Tailscale). Cloud VMs often **cannot** SSH to Wald — still ship code + PR; deploy with `npm run release:web` only when SSH works.

```bash
# Deploy when Wald SSH is available
export PATH="$HOME/.local/node/bin:$PATH"
npm run release:web
# rsyncs code/cloud → /data/windsage/ (excludes data, web, node_modules, oauth.env, scripts)
# and dist/ → /data/windsage/web/ ; restarts windsage.service
```

---

## 4) Iron rules (non-negotiable)

1. **Never wipe** `store.json` users/stations. Saves refuse empty-users overwrite. Empty `[]` sync only clears with `clearStations: true`.
2. After a finished **product** step: `npm run release:web` when Wald deploy is possible (don’t leave `dist/` stale on a deploy machine).
3. Email via `scripts/notify-email.sh` when `.env.smtp` exists:
   - Blocked → `Windsage · ACTION NEEDED: …`
   - Step done → `Windsage · done: …`
   - Cloud VMs may lack `.env.smtp` — still try; if missing, note in chat (don’t invent secrets).
4. Full absolute URLs / `file://` paths in chat and artifacts.
5. Do **not** commit secrets (`.env`, `oauth.env`, `code/cloud/data/`).
6. Expo: check current docs — `docs/AGENTS.md` (v57).
7. Do **not** ask Nimrod for API keys for Synoptic/Tempest/Windfinder/Maps unless the task is specifically about enabling those — free sources already work.

---

## 5) Already shipped (don’t re-build)

- Multi-source follows + location map/address blend; catalog nickname-first add
- Spot forecast UI; alerts via nearest live when spot has no native sensor
- Store wipe-proofing: unique tmp, save queue, bak recover, in-memory cache, refuse empty overwrite
- Daily backup cron on Wald: `/data/scripts/backup-windsage-store.sh` → `/data/backups/windsage/` (14d)
- Login/register + resolve rate limits; fetch timeouts; GET coalescing; poll concurrency 4; skip hot history
- Home “Right now” glance + trend; source-hiccup banner (≥2s)
- **Plain alert copy** — waiting shows `10 kt`, not `Waiting — wind_avg…`
- Alert Good/Meh feedback (signed-in)
- SW v7; `/health` ETag; debounced persist→cloud sync
- Google SSO when secrets exist on Wald; PWA-first

---

## 6) Still open

See `docs/OUTSTANDING.md`:

- Optional tokens: Synoptic / Tempest / Windfinder / Google Maps geocode
- Optional paid apex domain
- Deferred: “who’s out” social, SQLite, CI Actions

`docs/PROGRESS_REVIEW.md` — **Windguru-only SPOF is outdated** (multi-source exists).

---

## 7) Smoke checks

```bash
curl -sS https://windsage.nimrod.bio/health | python3 -m json.tool | head -40
curl -sS -X POST https://windsage.nimrod.bio/v1/stations/resolve \
  -H 'content-type: application/json' -d '{"provider":"windguru","input":"2259"}'
curl -sS -X POST https://windsage.nimrod.bio/v1/stations/resolve \
  -H 'content-type: application/json' -d '{"provider":"ndbc","input":"46026"}'
find code/cloud -name "*.mjs" -print0 | xargs -0 -n1 node --check

# Only if Tailscale SSH works:
ssh wald-mc 'python3 -c "import json;d=json.load(open(\"/data/windsage/data/store.json\"));print(\"users\",len(d[\"users\"]),\"stations\",sum(len(u.get(\"stations\")or[]) for u in d[\"users\"].values()))"'
```

---

## 8) Paste this as the first user prompt for a new cloud agent

> Read `/workspace/CLOUD_AGENT_CONTEXT.md` and `docs/OUTSTANDING.md`. Run the boot checklist (pull `main`, `git log -1`, curl health). Then do: **\<TASK\>**. Never wipe stations. Prefer autonomous work. After product changes: `npm run release:web` if Wald SSH works; email via `scripts/notify-email.sh` when done or blocked (skip email if no `.env.smtp`). Open a draft PR on a `cursor/…` branch.

---

## 9) Related docs

| File | Purpose |
| --- | --- |
| `CONTEXT.md` | Shared product handoff |
| `README.md` | Product + ops overview |
| `docs/OUTSTANDING.md` | Blocked / needed from operator |
| `docs/PROGRESS_REVIEW.md` | External review (partially superseded) |
| `docs/SSO-SETUP.md` | OAuth setup |
| `docs/STORE-PUBLISH.md` | Store notes (PWA-first) |
| `docs/AGENTS.md` | Expo version reminder |
| `.cursor/rules/*.mdc` | Email + web-export rules |
