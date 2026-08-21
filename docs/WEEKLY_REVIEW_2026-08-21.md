# Windsage — weekly progress review

**Date:** 2026-08-21  
**Reviewer:** Cursor cloud agent (`https://cursor.com/agents/bc-7e069031-43d6-4aea-b14f-46cea19a5b2b`)  
**GitHub:** `https://github.com/goldendreamers/windsage`  
**Live app:** `https://windsage.nimrod.bio/`  
**Compared against:** `main` at `325b51d` (2026-08-14), open PRs, and the 2026-08-12 external review in `docs/PROGRESS_REVIEW.md`.

**What this is:** a code + git + PR audit of the last ~9 days (the whole product so far). Not a device QA pass. This cloud VM cannot reach `windsage.nimrod.bio` (HTTPS egress is blocked), so live `/health` was **not** verified here.

---

## TL;DR

Windsage went from empty repo to a real friend-group wind-alert PWA in **three days** (12–14 Aug). Since then **`main` has been frozen for a week**. The valuable new work from 19 Aug sits in **draft PR #9** (~69 files) and is **not live**. The single highest-impact operator item is still the same as 14 Aug: **turn on Web Push (VAPID) on Wald and `npm run release:web`**, then confirm a lock-screen test buzz.

| | |
| --- | --- |
| First commit | 2026-08-12 `7e73bc5` |
| Last `main` merge | 2026-08-14 PR #8 `594621e` |
| Last documented Wald deploy | 2026-08-13 (PR #7) — **PR #8 code may not be on Wald** |
| Open drafts | PRs #1, #2, #3, #9, #10 |
| Local smoke on this review | `npm run check` ok; `scripts/check-geo.mjs` ok (live geocode skipped) |

---

## 1. What the product can do today (`main`)

Friend-group **alert tool**, not a forecast map. Wald polls; the phone stays idle until a push.

### Core loop
- Follow spots/stations; cloud polls ~every 10 minutes.
- Alert when a metric stays past a threshold for a hold time (default **avg wind ≥ 15 kt for 20 min**).
- Optional extras: gust spread, wind-direction sector, max wave (on wind alerts), max wind (on wave alerts).
- Metrics: avg wind, gust, temperature, wave height.
- Spots without a live sensor: **forecast for context**, **nearest live station for the alarm**.

### Sources (free vs token-gated)

| Source | On `main` | Needs Wald secret |
| --- | --- | --- |
| Windguru spot / station | yes | no |
| NDBC / NOAA buoys | yes | no |
| Open-Meteo (model “now”) | yes | no |
| Map / address pin (blend nearby stations) | yes | no |
| Synoptic / MesoWest | code ready | `SYNOPTIC_TOKEN` |
| Tempest / WeatherFlow | code ready | `TEMPEST_TOKEN` |
| Windfinder | code ready | `WINDFINDER_API_KEY` |

Map search works **without** a Google Maps key (Maps search URLs → coordinates; Photon / Open-Meteo / Nominatim). Optional `GOOGLE_MAPS_API_KEY` only improves Places autocomplete. Paste path already on `main`: Google / Apple / Waze / OSM / `geo:` / coords.

### Account & sync
- Guest follow list, username/password (`scrypt`), Google SSO (env-gated, documented as live when secrets exist).
- Multi-device sync; signed-in boot uses the cloud list (guest follows do not leak onto another account).
- Shared catalog of follows already used on the server.
- Login/register and resolve endpoints are rate-limited.

### Phone / web
- PWA at `https://windsage.nimrod.bio/` + download/install screen.
- Dual push: **Web Push** (installed PWA) and **Expo** (native / Expo Go).
- Windsage does **not** email wind alerts on `main`. Agent ops mail (`scripts/notify-email.sh`) is a different channel.
- iPhone Web Push only works from **Safari → Add to Home Screen** (not Chrome iOS).

### UX shipped after the 12 Aug review
- Home **“Right now” glance** + trend (closest / holding / going off).
- Alert column shows the **threshold** (`15 kt`), not the live `10.2 kt`.
- Temp/wave cards hide Avg+Gust; wind keeps them.
- Plain alert copy; source-hiccup banner; Good/Meh feedback (signed-in).
- Map-pin Identity: no Windguru Spot/Station controls; Open → Google Maps.

### Reliability on Wald (code on `main`)
- `store.json` in-memory cache + serialized save queue + unique tmp + rolling `.bak`.
- Refuses replacing a non-empty users bag with empty users.
- Recovers from `.bak` if primary looks wiped.
- Daily backup script: `scripts/backup-windsage-store.sh` (14-day retention) — **must actually be installed as cron on Wald**.
- Reading cache (90s), forecast reuse (5 min), poll concurrency 4.
- If a push fails to every device, `notifiedForRun` is rolled back so the next poll retries.

Public HTTPS: `https://windsage.nimrod.bio/`. Tailnet: `https://windsage.taild8a1d4.ts.net/`.

---

## 2. What actually changed this week

The product is **nine days old**. “Last week” is the whole history, in two phases.

### Phase A — 12–14 Aug: build + polish (on `main`)

31 commits. After the 12 Aug research review (`0a18a73` → `HEAD`): **+6.5k / −847** across 62 files.

| Day | What landed |
| --- | --- |
| 12 Aug | Initial app: Expo UI, cloud worker, Windguru follows, web release tooling. Then 1.0.2: PWA install, Web Push scaffolding, spot/station UI, download screen. |
| 13 Aug | Overnight reliability + glance + plain copy. Multi-source follows + map blend. Store wipe-proofing. Rate limits. Alert threshold / metric-aware stats. Guest-follow leak fix. Map search via Google Maps URLs (no key). Map-pin Identity (**PR #7**, Wald-released). |
| 14 Aug | **PR #8**: Web Push subscribe syncs to Wald immediately; SW cache-bust v7; test-push explains missing VAPID vs no subscription; Account/Download call out Safari-on-iPhone. **Merged to GitHub; Wald VAPID + `release:web` still pending.** |

Merged PRs: **#4, #5, #6, #7, #8**.

That week closed most of the 12 Aug “do soon” list: backup script, login rate limits, glance, alert feedback, map pin, Google SSO wiring, Windguru-only SPOF (mitigated by extra free sources).

### Phase B — 14–21 Aug: `main` freeze + a fat draft

No product commits on `main` after `325b51d` (14 Aug 15:03 UTC).

On **19 Aug**, cloud agent `https://cursor.com/agents/bc-d1002ad1-e963-496b-acc8-8d7c4284a92b` built **draft PR #9** (`https://github.com/goldendreamers/windsage/pull/9`):

- **+5,971 / −1,447** across **69 files**
- Still **DRAFT**, unreviewed, **not merged**, **not on Wald**
- Title undersells it: it is a whole product increment, not “Follow search” only

Same day: draft **PR #10** (`https://github.com/goldendreamers/windsage/pull/10`) — cloud `AGENTS.md` only (also already included in #9).

---

## 3. Built but not shipped (PR #9) — treat as *not live*

Do **not** describe these as production features until merge + Wald `npm run release:web`.

| Capability | Notes |
| --- | --- |
| Type-a-name Follow search over Windguru’s live `station_list` | Server-side ranked search, 24h cache, on-disk names file if Windguru is later down. Live sensors only, not forecast spots. |
| Follow PUT no longer replaces the whole bag with a shorter list | Keeps omitted follows unless `removedIds`; boot/login keep local extras; merge from `store.json.bak`. This is a **data-loss fix** and should not stay draft. |
| Quiet “simple mode” | Drops tiny captions / helper noise. |
| Wind direction as compass words | “east”, “south-west” instead of `90°` / `225°`. |
| Install as a real download | SW register on boot for Chrome’s install prompt; iPhone `.mobileconfig` at `/app/windsage.mobileconfig`. |
| Share-follow links, first-time banner, app menu, simpler notify picker | New UI modules. |
| Optional **email copy of wind alerts** via Resend | `code/cloud/lib/alertEmail.mjs`. Contradicts the 14 Aug product rule (“Windsage does not email wind alerts”). Env-gated; decide before merge. |

### PR #9 must not merge as-is

PR #10 already recorded a Metro-breaking ternary in `code/screens/StationDetailScreen.tsx` (~line 291):

```
cond ? null : ( <View/> ) : null
```

That is invalid JS/TS. Merging #9 would break the web bundle.

Other process issues: one 69-file draft mixes search, sync-safety, install, simple-mode, email, and docs; no review comments; Mac Wald prompt was added on the branch, not on `main`.

---

## 4. Stale / overlapping open PRs

| PR | State | Verdict |
| --- | --- | --- |
| [#1](https://github.com/goldendreamers/windsage/pull/1) CONTEXT.md | draft, 13 Aug | Largely superseded — `CLOUD_AGENT_CONTEXT.md` is already on `main`. Close unless it still adds `CONTEXT.md`. |
| [#2](https://github.com/goldendreamers/windsage/pull/2) Facebook + Apple SSO | draft, 13 Aug | Real code (start/callback + HMAC OAuth state + `check-oauth.mjs` + a GitHub Action). **Not on `main`.** `oauth.env.example` on `main` still says Facebook/Apple start/callback are TODO. Keep only if Nimrod wants those buttons. |
| [#3](https://github.com/goldendreamers/windsage/pull/3) paste Google Maps links | draft, 13 Aug | **Superseded.** `code/cloud/lib/providers/mapsUrl.mjs` + `scripts/check-geo.mjs` are already on `main` (via later 13 Aug commits / PR #6). Close. |
| [#9](https://github.com/goldendreamers/windsage/pull/9) Follow directory + more | draft, 19 Aug | Split, fix the ternary, merge the sync-safety + search pieces first. |
| [#10](https://github.com/goldendreamers/windsage/pull/10) AGENTS.md | draft, 19 Aug | Docs-only; overlapping with #9. Merge a cleaned docs PR or close after #9. |

---

## 5. What is still missing

Ranked for a **small friend-group tool**, not a startup.

### Operator (blocks the actual promise: “the phone buzzes”)

1. **VAPID keys on Wald** so `/health` shows `"webPush": true`, then `npm run release:web`, then Safari home-screen → Account → **Send test phone alert** with the phone locked. Exact Mac paste: `docs/MAC_AGENT_PROMPTS.md` item 1. GitHub: `https://github.com/goldendreamers/windsage/pull/8`.
2. Confirm the **14-day store backup cron** is actually installed on Wald (`/data/scripts/backup-windsage-store.sh` → `/data/backups/windsage/`).
3. Optional: Synoptic / Tempest / Windfinder tokens; `GOOGLE_MAPS_API_KEY`; paid apex domain (`windsage.com` / `.app` taken). Free HTTPS is already `https://windsage.nimrod.bio/`.

### Product gaps (not bugs)

| Gap | Status |
| --- | --- |
| Type a station **name** (Parkstone) instead of a Windguru URL/ID | Built in PR #9, not live |
| Follow-list wipe if a short PUT lands | Fixed in PR #9, not live — **still a live risk on `main`** |
| “Who’s out” / riding check-in | Explicitly deferred |
| Side-by-side models (GFS vs ECMWF) | Not started — Windguru still picks the model |
| Native Play / App Store binaries | Documented only (`docs/STORE-PUBLISH.md`); PWA-first is correct |
| Facebook / Apple login | PR #2 only |
| SMS / OTP | Out of scope |

### Engineering maturity

| Gap | Status |
| --- | --- |
| GitHub Actions on `main` | **None** (`.github/` missing). `npm run check` is local only. PR #2 added an Action that never merged. |
| SQLite instead of one JSON file | Deferred until concurrent users are real. Cache + save queue already mitigate the worst races. |
| Automated device QA | Never done in these cloud reviews. |
| Cloud agents cannot smoke live HTTPS | `windsage.nimrod.bio` is not on the egress allow-list, so agents cannot confirm Wald health. |

---

## 6. Problems / quality issues

1. **The differentiator is not proven in production.** Architecture is right (cloud poll → lock-screen push). Until VAPID + a locked-phone test succeed, users may only see Windguru’s own emails and think Windsage is notifying them.
2. **Deploy lag.** Last recorded Wald web snapshot: `file:///Users/goldendreamers/windsage/releases/web/20260813T132018Z`. GitHub `main` is one PR ahead; PR #9 is another week ahead of that.
3. **PR #9 is both the next feature set and a landmine** (invalid ternary, mixed concerns, optional alert-email vs the “no wind emails” rule).
4. **`main` still has the shorter-list sync wipe** that #9 tried to fix. That is a real data-loss bug class (the store already survived empty-users wipes; partial follow lists are the remaining hole).
5. **File size / hold-in-head:** `code/cloud/server.mjs` ~1440 lines, `StationDetailScreen.tsx` ~1301, `AddStationModal.tsx` ~760. Fine for one maintainer today; #9 makes them larger.
6. **OAuth `state` on `main` is still unsigned.** HMAC-signed state exists only on PR #2.
7. **Single home server + home WAN** is still the blast radius. Multi-source weather helps Windguru outages, not Wald being down.
8. **Draft PR pile** will confuse the next agent. Close #1/#3; decide #2; slice #9.

The 12 Aug “Windguru undocumented API is the main risk” item is **weaker now** (NDBC + Open-Meteo + map blend exist) but Windguru is still the default path people will use.

---

## 7. Recommended next moves

Do these in order. Do not start Facebook SSO, store publish, or “who’s out” until 1–3 are done.

1. **Mac + Tailscale (operator):** pending prompt in `docs/MAC_AGENT_PROMPTS.md` — VAPID + `npm run release:web` + locked-phone test. Confirm backup cron.
2. **Rescue the PR #9 data-loss fix + Follow search** onto a small branch: fix the StationDetail ternary, drop or explicitly product-decide alert-email, leave simple-mode / mobileconfig for a follow-up PR.
3. **Close stale drafts** #1 and #3.
4. **Optional later:** wire `npm run check` (+ `check-geo.mjs`) as a GitHub Action; Facebook/Apple only if secrets exist; SQLite only if the friend group actually grows.

---

## 8. Scorecard vs the 12 Aug external review

| 12 Aug recommendation | 21 Aug |
| --- | --- |
| Backup `store.json` | Script + bak + wipe-refuse on `main`; cron still an operator check |
| Login rate limits | Done (`code/cloud/lib/rateLimit.mjs`) |
| Google OAuth | Code on `main`; secrets on Wald (as of last Mac note) |
| Home glance + trend | Done |
| Alert good/meh | Done |
| Map / address discovery | Done on `main` (pin + URL paste). Name search = PR #9 |
| Surface source hiccups | Done (banner) |
| “Who’s out” social | Deferred |
| CI Actions | Not on `main` |
| Leave JSON store | Still JSON, with cache + queue |
| Windguru SPOF | Mitigated, not gone |

---

## What this review did not do

- Did not complete a lock-screen Web Push test (needs VAPID on Wald + a real Safari home-screen install).
- Did not SSH to Wald or read `/data/windsage/data/store.json`.
- Did not merge or “fix forward” PR #9 (out of scope for a review session).

**Follow-up in the same session:** cloud cannot run the phone. Paste-ready Mac prompt is Pending item 0 in `docs/MAC_AGENT_PROMPTS.md`. Helper scripts (`scripts/dev-local.sh`, `.cursor/environment.json`) exist for a local cloud backend only.
