# Mac Cursor agent — paste-ready prompts

**Running handoff file.** When you open Cursor on the Mac (`/Users/goldendreamers/windsage`), paste the **next pending** prompt below into a new **local** agent chat (not a cloud agent).

Cloud agents often cannot Tailscale/SSH to Wald, send `notify-email.sh` mail, or reach Discord unless `discord.com` is on the cloud egress allowlist and `WINDSAGE_DISCORD_UPDATES_WEBHOOK` is a cloud secret. Anything that needs a live deploy or Mac-local secrets lands here.

**How to maintain:** after a Mac run finishes (or a new cloud task leaves Mac work), edit this file — move the prompt under **Done**, add any new pending prompts at the top of **Pending**.

---

## Pending (newest first)

### 0) Discord #windsage-updates webhook for agent change posts

**Why:** Every Windsage agent must post to Discord **windsage updates** after a landed change (`scripts/notify-discord.sh`). The webhook URL is not in this clone.

**Paste this entire block into a local Mac Cursor agent:**

```
You are on the Mac at /Users/goldendreamers/windsage.
Read file:///Users/goldendreamers/windsage/docs/MAC_AGENT_PROMPTS.md and file:///Users/goldendreamers/windsage/.cursor/rules/notify-discord.mdc.

Nimrod (or you, if Discord is open on this Mac) should:

1) Open Discord → channel "windsage updates" → Edit Channel → Integrations → Webhooks → New Webhook.
   Name it "Windsage agent". Copy the webhook URL. Never commit it, never email it.

2) Append to file:///Users/goldendreamers/windsage/.env.smtp (create from .env.smtp.example if needed):
   WINDSAGE_DISCORD_UPDATES_WEBHOOK=https://discord.com/api/webhooks/...

3) Test:
   cd /Users/goldendreamers/windsage
   scripts/notify-discord.sh "Windsage · done: Discord webhook test" "Agent ops posts to #windsage-updates are live."

4) Also add that same env var as a Cursor Cloud Agent secret, and allow egress to discord.com (and discordapp.com) so cloud agents can post.

Update docs/MAC_AGENT_PROMPTS.md (move this to Done) after the test message appears in #windsage-updates.
```

### 1) Deploy Wald-only wind-alert poller + confirm Mac is not polling

**Why:** Wind alerts must run on Wald `windsage.service`, not a Mac `node server.mjs`. PR for `WINDSAGE_POLL=1` on Wald + poll off by default on laptop clones.

**Paste this entire block into a local Mac Cursor agent:**

```
You are on the Mac at /Users/goldendreamers/windsage with Tailscale to Wald.
Read file:///Users/goldendreamers/windsage/docs/MAC_AGENT_PROMPTS.md and file:///Users/goldendreamers/windsage/CLOUD_AGENT_CONTEXT.md.
Do not wipe store.json / stations. Do not merge to main unless Nimrod asks.
Do not copy the repo windsage.service over the live unit if it would change User= away from nimrodw.

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

### 2) Enable phone Web Push on Wald + release PR #8

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

Merged https://github.com/goldendreamers/windsage/pull/8 (`594621e`). Web Push subscribe now syncs to Wald; test-push explains missing VAPID; Account/Download call out Safari-on-iPhone. Wald VAPID + `npm run release:web` still pending (item 2 above).

### 2026-08-13 — Wald release of merged PR #7 (Mac + Tailscale)

Pulled `main` (`9b92cbb`), ran `npm run release:web` to Wald. Live https://windsage.nimrod.bio/ health ok; map-pin Identity has no Spot/Station or editable Source ID, read-only location, Open → Google Maps; Alert column stays at threshold after a check. Store not wiped (4 users). Snapshot `file:///Users/goldendreamers/windsage/releases/web/20260813T132018Z`.

### 2026-08-13 — PR #7 merged on GitHub (cloud agent)

Merged https://github.com/goldendreamers/windsage/pull/7 (`gh pr merge 7 --merge` → `b18a492`). Map-pin Identity UI is on `main`. Catch-up commits (Alert threshold, metric-aware home stats, guest-follow leak, Google Maps geo) were already on `main` before this merge.
