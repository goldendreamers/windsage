# Mac Cursor agent — paste-ready prompts

**Running handoff file.** When you open Cursor on the Mac (`/Users/goldendreamers/windsage`), paste the **next pending** prompt below into a new **local** agent chat (not a cloud agent).

Cloud agents often cannot Tailscale/SSH to Wald or send `notify-email.sh` mail. Anything that needs a live deploy or Mac-local secrets lands here.

**How to maintain:** after a Mac run finishes (or a new cloud task leaves Mac work), edit this file — move the prompt under **Done**, add any new pending prompts at the top of **Pending**.

---

## Pending (newest first)

### 2026-08-19 — Wald release of Follow live-directory search (PR #9)

Cloud agent exported web on this VM but **could not SSH `wald-mc`** (no Tailscale/DNS/rsync/keys) and **could not send notify-email** (no `.env.smtp`). Code is on branch `cursor/cloud-agent-1787128827188-i9kiy` — https://github.com/goldendreamers/windsage/pull/9

Paste this into a **local Mac** Cursor agent:

```
Windsage Wald deploy for Follow name search.

cd /Users/goldendreamers/windsage
export PATH="$HOME/.local/node/bin:$PATH"
git fetch origin
git checkout cursor/cloud-agent-1787128827188-i9kiy
git pull origin cursor/cloud-agent-1787128827188-i9kiy
npm run release:web

Then verify:
curl -sS https://windsage.nimrod.bio/health
curl -sS https://windsage.nimrod.bio/v1/catalog/stations | python3 -c "import json,sys; d=json.load(sys.stdin); print('ok', d.get('ok'), 'n', len(d.get('stations') or []))"
# Expect n around 6900 live Windguru stations, not only previously saved shared follows.

Do not wipe /data/windsage/data/store.json.

Email via scripts/notify-email.sh:
Subject: Windsage · done: Follow search lists all live Windguru names
Body: Live https://windsage.nimrod.bio/ — Follow → type Parkstone (or any live name) → Matching stations pop up → tap Add. Already-followed hits say Open. Catalog is Windguru station_list at runtime (not baked into git). PR https://github.com/goldendreamers/windsage/pull/9
```

---

## Done

### 2026-08-13 — Wald release of merged PR #7 (Mac + Tailscale)

Pulled `main` (`9b92cbb`), ran `npm run release:web` to Wald. Live https://windsage.nimrod.bio/ health ok; map-pin Identity has no Spot/Station or editable Source ID, read-only location, Open → Google Maps; Alert column stays at threshold after a check. Store not wiped (4 users). Snapshot `file:///Users/goldendreamers/windsage/releases/web/20260813T132018Z`.

### 2026-08-13 — PR #7 merged on GitHub (cloud agent)

Merged https://github.com/goldendreamers/windsage/pull/7 (`gh pr merge 7 --merge` → `b18a492`). Map-pin Identity UI is on `main`. Catch-up commits (Alert threshold, metric-aware home stats, guest-follow leak, Google Maps geo) were already on `main` before this merge.
