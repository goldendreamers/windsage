# Mac Cursor agent — paste-ready prompts

**Running handoff file.** When you open Cursor on the Mac (`/Users/goldendreamers/windsage`), paste the **next pending** prompt below into a new **local** agent chat (not a cloud agent).

Cloud agents often cannot Tailscale/SSH to Wald or send `notify-email.sh` mail. Anything that needs a live deploy or Mac-local secrets lands here.

**How to maintain:** after a Mac run finishes (or a new cloud task leaves Mac work), edit this file — move the prompt under **Done**, add any new pending prompts at the top of **Pending**.

---

## Pending (newest first)

### 2026-08-19 — URGENT: Nimrod cannot see any latest changes (live is stale)

https://windsage.nimrod.bio/ is still the old Wald build. All of PR #9 (full Follow lookup, quieter simple mode, compass-word wind direction, station-loss fix, Install download) exists only on GitHub until you run `npm run release:web` on this Mac. Cloud agents cannot SSH to Wald.

After deploy, hard-refresh the phone (or delete the home-screen app and open https://windsage.nimrod.bio/ again) so the old service worker does not keep the previous JS.

```
cd /Users/goldendreamers/windsage
export PATH="$HOME/.local/node/bin:$PATH"
git fetch origin
git checkout cursor/cloud-agent-1787128827188-i9kiy
git pull origin cursor/cloud-agent-1787128827188-i9kiy
npm run release:web

node scripts/build-windguru-station-names.mjs --out public

curl -sS "https://windsage.nimrod.bio/v1/catalog/stations?q=haifa&limit=40" | python3 -c "import sys,json; d=json.load(sys.stdin); print('hits',len(d.get('stations')or[]),'total',d.get('total'),'catalog',d.get('catalogSize'))"

# Expect catalog around 6900 and total > 12 for haifa. Then open Follow, type a name, confirm More / compass From words / quieter simple mode.

ssh wald-mc 'python3 -c "import json;d=json.load(open(\"/data/windsage/data/store.json\"));
print(\"users\",len(d.get(\"users\")or{}), \"follows\", sum(len(u.get(\"stations\")or[]) for u in (d.get(\"users\")or{}).values()))"'

# If follows are still short vs before the drop:
ssh wald-mc 'ls -lt /data/backups/windsage | head'
ssh wald-mc 'node /data/windsage/restore-stations.mjs --live /data/windsage/data --from /data/backups/windsage/STOREFILE.json.gz'
# Then: sudo systemctl restart windsage

Never wipe /data/windsage/data/store.json.
Email via scripts/notify-email.sh when live shows the new UI.
```

---

## Done

### 2026-08-13 — Wald release of merged PR #7 (Mac + Tailscale)

Pulled `main` (`9b92cbb`), ran `npm run release:web` to Wald. Live https://windsage.nimrod.bio/ health ok; map-pin Identity has no Spot/Station or editable Source ID, read-only location, Open → Google Maps; Alert column stays at threshold after a check. Store not wiped (4 users). Snapshot `file:///Users/goldendreamers/windsage/releases/web/20260813T132018Z`.

### 2026-08-13 — PR #7 merged on GitHub (cloud agent)

Merged https://github.com/goldendreamers/windsage/pull/7 (`gh pr merge 7 --merge` → `b18a492`). Map-pin Identity UI is on `main`. Catch-up commits (Alert threshold, metric-aware home stats, guest-follow leak, Google Maps geo) were already on `main` before this merge.
