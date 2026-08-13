# Mac Cursor agent — paste-ready prompts

**Running handoff file.** When you open Cursor on the Mac (`/Users/goldendreamers/windsage`), paste the **next pending** prompt below into a new **local** agent chat (not a cloud agent).

Cloud agents often cannot Tailscale/SSH to Wald or send `notify-email.sh` mail. Anything that needs a live deploy or Mac-local secrets lands here.

**How to maintain:** after a Mac run finishes (or a new cloud task leaves Mac work), edit this file — move the prompt under **Done**, add any new pending prompts at the top of **Pending**.

---

## Pending (newest first)

### 1) Wald release of merged PR #7 (Mac + Tailscale)

**Why:** Cloud agent merged https://github.com/goldendreamers/windsage/pull/7 on 2026-08-13 (`b18a492` on `main`) but has no Tailscale/`wald-mc` SSH. Live https://windsage.nimrod.bio/ still needs `npm run release:web`. One release also ships earlier main work (Alert threshold, metric-aware stats, guest-follow leak fix, Google Maps geo).

**Paste this entire block into a local Mac Cursor agent:**

```
You are on the Mac at /Users/goldendreamers/windsage with Tailscale to Wald.
Read file:///Users/goldendreamers/windsage/docs/MAC_AGENT_PROMPTS.md and file:///Users/goldendreamers/windsage/CLOUD_AGENT_CONTEXT.md.

PR https://github.com/goldendreamers/windsage/pull/7 is already MERGED. Do not merge again.

export PATH="$HOME/.local/node/bin:$PATH"
cd /Users/goldendreamers/windsage
git checkout main && git pull --ff-only
git log -5 --oneline
npm run release:web

Verify:
- curl -sS https://windsage.nimrod.bio/health | python3 -m json.tool | head -40
- Hard-refresh https://windsage.nimrod.bio/
- Open a Map/Address follow → Identity must NOT show Spot/Station or editable Source ID; show read-only location; “Open” goes to Google Maps
- Confirm Alert column stays at threshold after a check (not the live reading)
Do not wipe store.json / stations.

Email via scripts/notify-email.sh:
Subject: Windsage · done: Map-pin edit identity live on Wald
Body: Merged PR #7, released to Wald, verified map-pin Identity UI + health.

Update docs/MAC_AGENT_PROMPTS.md: move Pending #1 to Done with today’s date; commit + push that doc update on main.
Prefer absolute file:// and https:// links in your reply.
```

---

## Done

### 2026-08-13 — PR #7 merged on GitHub (cloud agent)

Merged https://github.com/goldendreamers/windsage/pull/7 (`gh pr merge 7 --merge` → `b18a492`). Map-pin Identity UI is on `main`. Wald deploy + live verify still pending (item 1 above). Catch-up commits (Alert threshold, metric-aware home stats, guest-follow leak, Google Maps geo) were already on `main` before this merge.

<!-- Example:
### 2026-08-13 — Map-pin edit + release
Merged PR #7, `npm run release:web`, verified Identity UI on map pin.
-->
