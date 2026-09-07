# Windsage — cloud agent context

**Start here** for a new Cursor cloud (or any remote) agent session.

## Git

| | |
| --- | --- |
| **GitHub** | https://github.com/goldendreamers/windsage |
| **Clone** | `git clone https://github.com/goldendreamers/windsage.git` |
| **Default branch** | `main` |

```bash
cd windsage
git fetch origin && git checkout main && git pull
git log -5 --oneline
```

## What the product is

Friend-group **wind alert PWA**: cloud polls weather sources, evaluates hold-time rules, pushes to phone/browser. Phone stays idle — no local 10‑minute Windguru polling.

- Live app: https://windsage.nimrod.bio/
- Health: https://windsage.nimrod.bio/health

## Repo map

```
code/app/           Expo entry + App.tsx
code/screens/       Home, StationDetail, Account, Download
code/components/    Cards, AddStationModal, LocationPicker, StatusPanel, …
code/core/          cloud client, alerts, stations, windguru, notifications
code/shared/        types, defaults, providers, glance, theme, assets
code/cloud/         Node server (server.mjs, lib/*, providers/*)
public/             PWA (sw.js, icons, privacy)
scripts/            release-web.py, notify-email.sh, notify-discord.sh, backup-windsage-store.sh, checks
docs/               OUTSTANDING.md, SSO-SETUP.md, STORE-PUBLISH.md
```

## Architecture (short)

| Layer | Role |
| --- | --- |
| Expo RN (web + native) | UI, follow list, sync, receive push |
| Cloud (`windsage.service`) | Poll providers, alert logic, Expo + Web Push (`WINDSAGE_POLL=1`). Local `server.mjs` does not poll unless you set that. |
| Store | `$WINDSAGE_DATA/store.json` — **never wipe users/stations** |

**Providers:** windguru, ndbc, openmeteo, location (map/address blend), plus token-gated synoptic/tempest/windfinder.

**Deploy** (from a machine that can SSH to the host): `npm run release:web` with `WINDSAGE_DEPLOY_HOST` set. `scripts/release-web.py` rsyncs `code/cloud/` (excludes `data`, `web`, `node_modules`, `oauth.env`, `scripts`) and `dist/` to the web root.

## Mandatory agent rules (repo)

1. After a finished product step: run `npm run release:web` if deploy SSH is available (don’t leave `dist/` stale).
2. Email via `scripts/notify-email.sh` when `WINDSAGE_EMAIL_TO` / `.env.smtp` is configured:
   - Blocked → subject starts with `Windsage · ACTION NEEDED:`
   - Step done → subject starts with `Windsage · done:`
3. After **any landed change**, post to Discord channel **windsage updates** via `scripts/notify-discord.sh` (webhook `WINDSAGE_DISCORD_UPDATES_WEBHOOK` in `.env.smtp` or `discord-updates.env`). Chat/email is not a substitute. Missing webhook or Discord HTTP failure → ACTION NEEDED email. Cloud VMs also need `discord.com` on the egress allowlist.
4. Full absolute URLs / `file://` paths in chat.
5. **Never** wipe `store.json` users/stations. Saves refuse empty-users overwrite; use `clearStations: true` only for intentional unfollow-all.
6. Do not commit secrets (`.env`, `oauth.env`, `code/cloud/data/`, webhook URLs).
7. Expo docs: see `docs/AGENTS.md` (check current Expo version docs before inventing APIs).

## Smoke checks

```bash
curl -sS https://windsage.nimrod.bio/health | python3 -m json.tool | head -40
curl -sS -X POST https://windsage.nimrod.bio/v1/stations/resolve \
  -H 'content-type: application/json' -d '{"provider":"windguru","input":"2259"}'
find code/cloud -name "*.mjs" -print0 | xargs -0 -n1 node --check
```

## Related docs

| File | Purpose |
| --- | --- |
| `README.md` | Product + self-host overview |
| `docs/OUTSTANDING.md` | Open operator items |
| `docs/SSO-SETUP.md` | Google/Facebook/Apple OAuth |
| `docs/STORE-PUBLISH.md` | Store publish notes (PWA-first) |
| `docs/AGENTS.md` | Expo version doc reminder |
| `.cursor/rules/*.mdc` | Email, Discord updates, and web-export rules (local Cursor) |
