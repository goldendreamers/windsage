# Mac Cursor agent — paste-ready prompts

**Running handoff file.** When you open Cursor on the Mac (`/Users/goldendreamers/windsage`), paste the **next pending** prompt below into a new **local** agent chat (not a cloud agent).

Cloud agents often cannot Tailscale/SSH to Wald or send `notify-email.sh` mail. Anything that needs a live deploy or Mac-local secrets lands here.

**How to maintain:** after a Mac run finishes (or a new cloud task leaves Mac work), edit this file — move the prompt under **Done**, add any new pending prompts at the top of **Pending**.

---

## Pending (newest first)

### 2026-08-19 — Wald release: restore dropped follows + Install download (PR #9)

Nimrod reported about half of his stations were deleted. Cloud PUT used to replace the whole bag whenever the client sent a non-empty shorter list. Fix is on this branch. After `npm run release:web`, if the live count is still short, merge from a daily backup (does not wipe users):

```
cd /Users/goldendreamers/windsage
export PATH="$HOME/.local/node/bin:$PATH"
git fetch origin
git checkout cursor/cloud-agent-1787128827188-i9kiy
git pull origin cursor/cloud-agent-1787128827188-i9kiy
npm run release:web

node scripts/build-windguru-station-names.mjs --out public

ssh wald-mc 'python3 -c "import json;d=json.load(open(\"/data/windsage/data/store.json\"));
print(\"users\",len(d.get(\"users\")or{}), \"follows\", sum(len(u.get(\"stations\")or[]) for u in (d.get(\"users\")or{}).values()))"'

# If follows are still short, pick a backup from before the drop:
ssh wald-mc 'ls -lt /data/backups/windsage | head'
ssh wald-mc 'node /data/windsage/restore-stations.mjs --live /data/windsage/data --from /data/backups/windsage/STOREFILE.json.gz'
# Then: sudo systemctl restart windsage

Never wipe /data/windsage/data/store.json.

Email via scripts/notify-email.sh when live follow counts are restored.
```

---

## Done

### 2026-08-13 — Wald release of merged PR #7 (Mac + Tailscale)

Pulled `main` (`9b92cbb`), ran `npm run release:web` to Wald. Live https://windsage.nimrod.bio/ health ok; map-pin Identity has no Spot/Station or editable Source ID, read-only location, Open → Google Maps; Alert column stays at threshold after a check. Store not wiped (4 users). Snapshot `file:///Users/goldendreamers/windsage/releases/web/20260813T132018Z`.

### 2026-08-13 — PR #7 merged on GitHub (cloud agent)

Merged https://github.com/goldendreamers/windsage/pull/7 (`gh pr merge 7 --merge` → `b18a492`). Map-pin Identity UI is on `main`. Catch-up commits (Alert threshold, metric-aware home stats, guest-follow leak, Google Maps geo) were already on `main` before this merge.
