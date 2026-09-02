# Mac Cursor agent — paste-ready prompts

**Running handoff file.** When you open Cursor on the Mac (`/Users/goldendreamers/windsage`), paste the **next pending** prompt below into a new **local** agent chat (not a cloud agent).

Cloud agents often cannot Tailscale/SSH to Wald or send `notify-email.sh` mail. Anything that needs a live deploy or Mac-local secrets lands here.

**How to maintain:** after a Mac run finishes (or a new cloud task leaves Mac work), edit this file — move the prompt under **Done**, add any new pending prompts at the top of **Pending**.

---

## Pending (newest first)

### 0) Install the local Windsage agent on the Samsung Galaxy S22 (Termux)

**Why:** Cursor Cloud VMs cannot reach the phone. Tailscale is already on the S22 (same account / tailnet as Wald). Remaining: Termux + copied secrets. Script: `file:///Users/goldendreamers/windsage/scripts/s22-termux-bootstrap.sh`

Play Protect / Samsung will often say Termux “might be harmful.” Use only https://f-droid.org/packages/com.termux/ or https://github.com/termux/termux-app/releases (package `com.termux`). Then **More details → Install anyway**. Do not use Play Store Termux. Do not use random APK sites.

On the S22, in Termux (not a Cloud agent):

```
pkg update -y && pkg install -y git
git clone https://github.com/goldendreamers/windsage.git
cd ~/windsage
git fetch origin cursor/s22-local-agent-a1e3
git checkout cursor/s22-local-agent-a1e3
bash scripts/s22-termux-bootstrap.sh
```

Then copy `/Users/goldendreamers/windsage/.env.smtp` onto `~/windsage/.env.smtp`, put the printed pubkey on Wald (or copy the Mac `wald-mc` key), and run `bash scripts/device-agent-preflight.sh`. Tailscale is already connected — do not reinstall it.

remember discord bot alerts

### 0b) Bootstrap a local agent on a new (non-phone) device

**Why:** Cloud VMs cannot read `.env.smtp` or SSH to Wald. A new physical machine needs copied secrets + Tailscale. Context: `file:///Users/goldendreamers/windsage/docs/DEVICE_AGENT_CONTEXT.md` and https://github.com/goldendreamers/windsage/blob/cursor/device-agent-context-a1af/docs/DEVICE_AGENT_CONTEXT.md

Paste everything inside the fence into a **local** agent on the new machine (not a Cursor Cloud agent):

```
You are a local Windsage agent on a new device. Operator: Nimrod.

Read this clone’s docs/DEVICE_AGENT_CONTEXT.md and CLOUD_AGENT_CONTEXT.md
(absolute paths under the clone). Then set this machine up. Do not invent secrets.

## Bootstrap

1. Confirm git remote https://github.com/goldendreamers/windsage, Node 22 on PATH
   (export PATH="$HOME/.local/node/bin:$PATH"), npm ci, npm run check.
2. Tailscale: same tailnet as Wald. SSH: Host wald-mc → nimrodw@100.125.98.56.
   Prove: ssh wald-mc 'hostname; systemctl is-active windsage; curl -sS http://127.0.0.1:8787/health'
3. Copy gitignored secrets from the working Mac — do not commit them:
   - /Users/goldendreamers/windsage/.env.smtp → this clone’s .env.smtp (chmod 600)
   - SSH private key or add this device’s pubkey to nimrodw authorized_keys
   Wald /data/windsage/oauth.env stays on Wald. Never copy it into git.
4. If .env.smtp or SSH is missing, stop and tell Nimrod (ACTION NEEDED). Do not guess passwords.
5. Optional smtp test: scripts/notify-email.sh "Windsage · done: new device smtp" "smtp ok"
6. Do not merge to main. Never wipe /data/windsage/data/store.json.
7. Run bash scripts/device-agent-preflight.sh and report each check.

When bootstrap is green, wait for the next product task. You can npm run release:web.

remember discord bot alerts
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
