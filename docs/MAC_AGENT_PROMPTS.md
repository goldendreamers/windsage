# Mac Cursor agent — paste-ready prompts

**Running handoff file.** When you open Cursor on the Mac (`/Users/goldendreamers/windsage`), paste the **next pending** prompt below into a new **local** agent chat (not a cloud agent).

Cloud agents often cannot Tailscale/SSH to Wald or send `notify-email.sh` mail. Anything that needs a live deploy or Mac-local secrets lands here.

**How to maintain:** after a Mac run finishes (or a new cloud task leaves Mac work), edit this file — move the prompt under **Done**, add any new pending prompts at the top of **Pending**.

---

## Pending (newest first)

### 2026-08-19 — Wald release: full Follow lookup + restore follows (PR #9)

Nimrod could not see all stations when looking them up (Follow search capped at 12, and phones often never loaded the ~6,900-name directory). Also earlier: about half of followed stations were deleted by a short-list sync.

After `npm run release:web`, check lookup on https://windsage.nimrod.bio/ — type a common name (e.g. Haifa / Park). You should see **more than 12** hits when many match, a **“Showing N of M”** line, **Show all M matches**, and directory size around **6,900**. Then if follow count is still short, merge from a daily backup (does not wipe users):

```
cd /Users/goldendreamers/windsage
export PATH="$HOME/.local/node/bin:$PATH"
git fetch origin
git checkout cursor/cloud-agent-1787128827188-i9kiy
git pull origin cursor/cloud-agent-1787128827188-i9kiy
npm run release:web

node scripts/build-windguru-station-names.mjs --out public

# Lookup: live directory search (should be ~6900, not a 12-hit cap)
curl -sS "https://windsage.nimrod.bio/v1/catalog/stations?q=haifa&limit=40" | python3 -c "import sys,json; d=json.load(sys.stdin); print('hits',len(d.get('stations')or[]),'total',d.get('total'),'catalog',d.get('catalogSize'))"

ssh wald-mc 'python3 -c "import json;d=json.load(open(\"/data/windsage/data/store.json\"));
print(\"users\",len(d.get(\"users\")or{}), \"follows\", sum(len(u.get(\"stations\")or[]) for u in (d.get(\"users\")or{}).values()))"'

# If follows are still short, pick a backup from before the drop:
ssh wald-mc 'ls -lt /data/backups/windsage | head'
ssh wald-mc 'node /data/windsage/restore-stations.mjs --live /data/windsage/data --from /data/backups/windsage/STOREFILE.json.gz'
# Then: sudo systemctl restart windsage

Never wipe /data/windsage/data/store.json.

Email via scripts/notify-email.sh when live lookup shows the full directory and follow counts are restored.
```

---

## Done

### 2026-08-13 — Wald release of merged PR #7 (Mac + Tailscale)

Pulled `main` (`9b92cbb`), ran `npm run release:web` to Wald. Live https://windsage.nimrod.bio/ health ok; map-pin Identity has no Spot/Station or editable Source ID, read-only location, Open → Google Maps; Alert column stays at threshold after a check. Store not wiped (4 users). Snapshot `file:///Users/goldendreamers/windsage/releases/web/20260813T132018Z`.

### 2026-08-13 — PR #7 merged on GitHub (cloud agent)

Merged https://github.com/goldendreamers/windsage/pull/7 (`gh pr merge 7 --merge` → `b18a492`). Map-pin Identity UI is on `main`. Catch-up commits (Alert threshold, metric-aware home stats, guest-follow leak, Google Maps geo) were already on `main` before this merge.
