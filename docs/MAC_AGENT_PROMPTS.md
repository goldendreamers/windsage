# Mac Cursor agent — paste-ready prompts

**Running handoff file.** When you open Cursor on the Mac (`/Users/goldendreamers/windsage`), paste the **next pending** prompt below into a new **local** agent chat (not a cloud agent).

Cloud agents often cannot Tailscale/SSH to Wald or send `notify-email.sh` mail. Anything that needs a live deploy or Mac-local secrets lands here.

**How to maintain:** after a Mac run finishes (or a new cloud task leaves Mac work), edit this file — move the prompt under **Done**, add any new pending prompts at the top of **Pending**.

---

## Pending (newest first)

### 0) Deploy Wald-only wind-alert poller + confirm Mac is not polling

**Why:** Wind alerts must run on Wald `windsage.service`, not a Mac `node server.mjs`. PR for `WINDSAGE_POLL=1` on Wald + poll off by default on laptop clones.

**Paste this entire block into a local Mac Cursor agent:**

```
You are on the Mac at /Users/goldendreamers/windsage with Tailscale to Wald.
Read file:///Users/goldendreamers/windsage/docs/MAC_AGENT_PROMPTS.md and file:///Users/goldendreamers/windsage/CLOUD_AGENT_CONTEXT.md.
Do not wipe store.json / stations. Do not merge to main unless Nimrod asks.

export PATH="$HOME/.local/node/bin:$PATH"
cd /Users/goldendreamers/windsage
git fetch origin cursor/wald-alert-poll-a8a2
git checkout cursor/wald-alert-poll-a8a2
git pull --ff-only origin cursor/wald-alert-poll-a8a2

1) Stop any Mac-local cloud poller (production alerts must not run here):
   pgrep -fl 'node.*server.mjs' || true
   If a local windsage server.mjs is running for production watching, stop it.
   Expo `npm start` / `npm run web` is fine — that is UI, not the poller.

2) Deploy cloud worker to Wald:
   npm run release:web
   # If release:web cannot run, at least:
   rsync -av --delete --exclude data --exclude web --exclude node_modules --exclude oauth.env --exclude scripts \
     /Users/goldendreamers/windsage/code/cloud/ wald-mc:/data/windsage/
   ssh wald-mc 'sudo cp /data/windsage/windsage.service /etc/systemd/system/windsage.service && sudo systemctl daemon-reload && sudo systemctl restart windsage'

3) Prove Wald is the poller:
   ssh wald-mc 'systemctl is-active windsage; grep -E WINDSAGE_POLL /etc/systemd/system/windsage.service /data/windsage/windsage.service; journalctl -u windsage -n 40 --no-pager | tail -40'
   curl -sS https://windsage.nimrod.bio/health | python3 -m json.tool | head -50
   Health must show poll.enabled true. After ~15s, poll.lastPollAt should be non-null.
   journalctl must show "[windsage-cloud] poll=on" and later "[poll] done".

4) Email Nimrod:
   scripts/notify-email.sh "Windsage · done: wind alerts poll on Wald" "windsage.service active; /health poll.enabled true. Mac is not the poller."
   or ACTION NEEDED if systemd/health is wrong.

Update docs/MAC_AGENT_PROMPTS.md (move this to Done with today’s date) after health shows poll.enabled true on https://windsage.nimrod.bio/health.
Prefer absolute file:// and https:// links.
```

### 1) Enable phone Web Push on Wald + release PR #8

**Why:** https://github.com/goldendreamers/windsage/pull/8 is **merged** (`594621e` on `main`). Live https://windsage.nimrod.bio/ still needs VAPID keys (if `webPush` is false) and `npm run release:web`. Windsage does **not** send wind-alert emails.

**Paste this entire block into a local Mac Cursor agent:**

```
You are on the Mac at /Users/goldendreamers/windsage with Tailscale to Wald.
Read file:///Users/goldendreamers/windsage/docs/MAC_AGENT_PROMPTS.md and file:///Users/goldendreamers/windsage/CLOUD_AGENT_CONTEXT.md.
Do not wipe store.json / stations.

https://github.com/goldendreamers/windsage/pull/8 is already MERGED. Do not merge again.

export PATH="$HOME/.local/node/bin:$PATH"
cd /Users/goldendreamers/windsage
git checkout main && git pull --ff-only
git log -5 --oneline

1) Check live health:
   curl -sS https://windsage.nimrod.bio/health | python3 -m json.tool | head -40
   If "webPush" is not true:
     ssh wald-mc 'cd /data/windsage && /usr/bin/npm install --omit=dev --no-fund --no-audit'
     On Mac: npx --yes web-push generate-vapid-keys
     Append WEB_PUSH_VAPID_PUBLIC, WEB_PUSH_VAPID_PRIVATE, and WEB_PUSH_CONTACT=mailto:shakedwald@gmail.com to /data/windsage/oauth.env WITHOUT deleting Google/other keys (chmod 600, owner nimrodw).
     ssh wald-mc 'sudo systemctl restart windsage && sleep 2 && curl -sS http://127.0.0.1:8787/health'
     Confirm health shows "webPush": true.
2) npm run release:web
3) Email Nimrod: Windsage · ACTION NEEDED: Open home-screen Windsage → Account → Send test phone alert
   iPhone must use Safari Add to Home Screen (Chrome iOS cannot push). Lock the phone, then tap the test. Windsage does not send email alerts.

Update docs/MAC_AGENT_PROMPTS.md (move this to Done with today’s date) after VAPID is on and release is live; leave the phone-test as ACTION NEEDED until Nimrod confirms a lock-screen buzz.
Prefer absolute file:// and https:// links.
```

---

## Done

### 2026-08-14 — PR #8 merged on GitHub (cloud agent)

Merged https://github.com/goldendreamers/windsage/pull/8 (`594621e`). Web Push subscribe now syncs to Wald; test-push explains missing VAPID; Account/Download call out Safari-on-iPhone. Wald VAPID + `npm run release:web` still pending (item 1 above).

### 2026-08-13 — Wald release of merged PR #7 (Mac + Tailscale)

Pulled `main` (`9b92cbb`), ran `npm run release:web` to Wald. Live https://windsage.nimrod.bio/ health ok; map-pin Identity has no Spot/Station or editable Source ID, read-only location, Open → Google Maps; Alert column stays at threshold after a check. Store not wiped (4 users). Snapshot `file:///Users/goldendreamers/windsage/releases/web/20260813T132018Z`.

### 2026-08-13 — PR #7 merged on GitHub (cloud agent)

Merged https://github.com/goldendreamers/windsage/pull/7 (`gh pr merge 7 --merge` → `b18a492`). Map-pin Identity UI is on `main`. Catch-up commits (Alert threshold, metric-aware home stats, guest-follow leak, Google Maps geo) were already on `main` before this merge.
