# Mac Cursor agent — paste-ready prompts

**Running handoff file.** When you open Cursor on the Mac (`/Users/goldendreamers/windsage`), paste the **next pending** prompt below into a new **local** agent chat (not a cloud agent).

Cloud agents often cannot Tailscale/SSH to Wald or send `notify-email.sh` mail. Anything that needs a live deploy or Mac-local secrets lands here.

**How to maintain:** after a Mac run finishes (or a new cloud task leaves Mac work), edit this file — move the prompt under **Done**, add any new pending prompts at the top of **Pending**.

---

## Pending (newest first)

### 2026-08-19 — Wald release of Follow search + save the ~100 KB live-names file (PR #9)

Cloud agent cannot SSH `wald-mc` or fetch `windguru.cz` (egress). After deploy, Wald must write the names-only live-station file (~101 KB, one name per line).

```
cd /Users/goldendreamers/windsage
export PATH="$HOME/.local/node/bin:$PATH"
git fetch origin
git checkout cursor/cloud-agent-1787128827188-i9kiy
git pull origin cursor/cloud-agent-1787128827188-i9kiy
npm run release:web

# Save the names-only live list (~100 KB) into public/ and the running web dir:
node scripts/build-windguru-station-names.mjs --out public
ls -l public/windguru-live-station-names.txt public/windguru-live-station-names.json public/windguru-live-stations.json
# Expect names.txt around 101 KB (one name per line, ~6,898 named live stations).

curl -sS https://windsage.nimrod.bio/v1/catalog/station-names | python3 -m json.tool | head -40
curl -sS https://windsage.nimrod.bio/v1/catalog/stations | python3 -c "import json,sys; d=json.load(sys.stdin); print('ok', d.get('ok'), 'n', len(d.get('stations') or []))"
# Expect n around 6900.

If public/windguru-live-station-names.txt is ~100 KB, commit and push it on this branch so GitHub has the saved names file:
git add public/windguru-live-station-names.txt public/windguru-live-station-names.unique.txt public/windguru-live-station-names.json public/windguru-live-stations.json public/windguru-live-station-names.meta.json
git commit -m "Save Windguru live station names (~100 KB names-only file)."
git push

Do not wipe /data/windsage/data/store.json.

Email via scripts/notify-email.sh:
Subject: Windsage · done: Follow search + live names file
Body: Live https://windsage.nimrod.bio/ — Follow → type Parkstone → tap Add. Names file https://windsage.nimrod.bio/windguru-live-station-names.txt (~101 KB, one name per line). PR https://github.com/goldendreamers/windsage/pull/9
```

---

## Done

### 2026-08-13 — Wald release of merged PR #7 (Mac + Tailscale)

Pulled `main` (`9b92cbb`), ran `npm run release:web` to Wald. Live https://windsage.nimrod.bio/ health ok; map-pin Identity has no Spot/Station or editable Source ID, read-only location, Open → Google Maps; Alert column stays at threshold after a check. Store not wiped (4 users). Snapshot `file:///Users/goldendreamers/windsage/releases/web/20260813T132018Z`.

### 2026-08-13 — PR #7 merged on GitHub (cloud agent)

Merged https://github.com/goldendreamers/windsage/pull/7 (`gh pr merge 7 --merge` → `b18a492`). Map-pin Identity UI is on `main`. Catch-up commits (Alert threshold, metric-aware home stats, guest-follow leak, Google Maps geo) were already on `main` before this merge.
