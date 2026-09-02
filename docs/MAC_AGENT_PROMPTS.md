# Mac Cursor agent — paste-ready prompts

**Running handoff file.** When you open Cursor on the Mac (`/Users/goldendreamers/windsage`), paste the **next pending** prompt below into a new **local** agent chat (not a cloud agent).

Cloud agents often cannot Tailscale/SSH to Wald or send `notify-email.sh` mail. Anything that needs a live deploy or Mac-local secrets lands here.

**How to maintain:** after a Mac run finishes (or a new cloud task leaves Mac work), edit this file — move the prompt under **Done**, add any new pending prompts at the top of **Pending**.

---

## Pending (newest first)

### 0) Mac local agent: finish S22 (nothing has been done from the Mac yet)

**Why:** Phone already has Termux, Tailscale, `sshd`, and `Host wald-mc` in `~/.ssh/config`. User `u0_a383`. **No key, no `.env.smtp`, no clone from the Mac yet.** Cloud agents cannot reach `100.124.6.109`.

Open a **new local Cursor agent on the Mac** (`/Users/goldendreamers/windsage`), not Cloud. Paste everything inside the fence:

```
You are a LOCAL Windsage agent on goldendreamers's MacBook Air. Operator: Nimrod.

NOTHING has been done from this Mac toward the S22 yet. You must do all Mac-side work. Do not assume scp/ssh to the phone already worked. Do not invent passwords or keys. Never print private key bytes or .env.smtp contents. Never wipe /data/windsage/data/store.json. Do not merge to main.

If this run is a Cursor Cloud VM (hostname often "cursor", or /Users/goldendreamers/windsage missing): STOP. Report hostname and pwd. Do not fake success.

Read:
- file:///Users/goldendreamers/windsage/docs/DEVICE_AGENT_CONTEXT.md
- file:///Users/goldendreamers/windsage/CLOUD_AGENT_CONTEXT.md
- file:///Users/goldendreamers/.ssh/config  (hosts only; do not cat the private key)

Facts (already true on the phone; do not reinstall Tailscale or Termux):
- S22 Tailscale IP: 100.124.6.109
- Termux user: u0_a383
- Termux sshd: port 8022 (process was running)
- Phone ~/.ssh/config already has Host wald-mc and Host wald-mc-v6 pointing at IdentityFile ~/.ssh/shaked_waldhomeserver_ed25519
- Phone does NOT yet have that private key (ls showed only config + empty authorized_keys)
- Wald: Host wald-mc → nimrodw@100.125.98.56
- Wald IPv6 alias: Host wald-mc-v6 → nimrodw@2a06:c701:4909:fc00:428d:5cff:fe48:b9fd
- Mac private key path: /Users/goldendreamers/.ssh/shaked_waldhomeserver_ed25519
- Mac smtp path: /Users/goldendreamers/windsage/.env.smtp

## Do all of this

export PATH="$HOME/.local/node/bin:$PATH"
cd /Users/goldendreamers/windsage

1) Prove this is the Mac:
   hostname; pwd; test -f /Users/goldendreamers/.ssh/shaked_waldhomeserver_ed25519 && echo KEY_YES
   test -f /Users/goldendreamers/windsage/.env.smtp && echo SMTP_YES
   If KEY or SMTP missing: STOP, ACTION NEEDED, do not invent files.

2) Merge into /Users/goldendreamers/.ssh/config if missing (do not delete other hosts):

Host wald-mc
  HostName 100.125.98.56
  User nimrodw
  IdentityFile ~/.ssh/shaked_waldhomeserver_ed25519
  IdentitiesOnly yes

Host wald-mc-v6
  HostName 2a06:c701:4909:fc00:428d:5cff:fe48:b9fd
  User nimrodw
  IdentityFile ~/.ssh/shaked_waldhomeserver_ed25519
  IdentitiesOnly yes

Host s22-termux
  HostName 100.124.6.109
  User u0_a383
  Port 8022
  IdentitiesOnly yes

3) Prove Wald from the Mac:
   ssh -o BatchMode=yes -o ConnectTimeout=8 wald-mc 'hostname; systemctl is-active windsage'
   If this fails: STOP, ACTION NEEDED (Tailscale/key on Mac).

4) Reach the S22 (first time from this Mac):
   ping -c 1 -W 2 100.124.6.109
   ssh -o BatchMode=yes -o ConnectTimeout=8 -p 8022 u0_a383@100.124.6.109 'echo S22_OK; whoami; pgrep sshd'
   Phone authorized_keys was empty, so BatchMode will likely fail until a password or a pubkey is installed.

   If BatchMode fails:
   - Tell Nimrod in chat: Windsage · ACTION NEEDED: in Termux run passwd (if not set), keep Termux open with sshd running.
   - Ask Nimrod to run these in Terminal.app ONCE (he types the Termux password; you do not invent it), then continue:
     ssh-copy-id -p 8022 u0_a383@100.124.6.109
   - Do not loop forever. After he confirms, retry BatchMode.
   - Prefer ssh-copy-id of the Mac's own pubkey into Termux authorized_keys so later scp is passwordless.

5) Copy secrets onto the phone (chmod 600 on the phone; never echo file contents):
   ssh -p 8022 u0_a383@100.124.6.109 'mkdir -p ~/.ssh ~/windsage && chmod 700 ~/.ssh'
   scp -P 8022 /Users/goldendreamers/.ssh/shaked_waldhomeserver_ed25519 u0_a383@100.124.6.109:~/.ssh/shaked_waldhomeserver_ed25519
   scp -P 8022 /Users/goldendreamers/.ssh/shaked_waldhomeserver_ed25519.pub u0_a383@100.124.6.109:~/.ssh/shaked_waldhomeserver_ed25519.pub || true
   scp -P 8022 /Users/goldendreamers/windsage/.env.smtp u0_a383@100.124.6.109:~/windsage/.env.smtp
   ssh -p 8022 u0_a383@100.124.6.109 'chmod 600 ~/.ssh/shaked_waldhomeserver_ed25519 ~/.ssh/config ~/windsage/.env.smtp; ls -l ~/.ssh ~/windsage/.env.smtp'

6) Bootstrap code on the phone via SSH (Termux pkg):
   ssh -p 8022 u0_a383@100.124.6.109 'pkg update -y && pkg install -y git openssh nodejs python curl rsync'
   If ~/windsage is not a git clone yet, clone https://github.com/goldendreamers/windsage.git into ~/windsage (keep .env.smtp).
   ssh -p 8022 u0_a383@100.124.6.109 'test -f ~/.ssh/config && grep -A6 "^Host wald-mc" ~/.ssh/config'
   Ensure IdentitiesOnly yes is present on both Host blocks; append if missing.
   If scripts/s22-termux-bootstrap.sh exists on the clone, you may run it; it must not overwrite the Mac key with a new key. Prefer scripts/install-wald-ssh-config.sh if present (branch cursor/s22-local-agent-a1e3 or main after merge). Fetch that branch if the script is missing:
     cd ~/windsage && git fetch origin cursor/s22-local-agent-a1e3 && git checkout cursor/s22-local-agent-a1e3

7) Prove Wald FROM the phone:
   ssh -p 8022 u0_a383@100.124.6.109 "ssh -o BatchMode=yes -o ConnectTimeout=10 wald-mc 'hostname; systemctl is-active windsage'"

8) Optional smtp test FROM the phone (do not print the env file):
   ssh -p 8022 u0_a383@100.124.6.109 'cd ~/windsage && bash scripts/notify-email.sh "Windsage · done: S22 smtp" "S22 Termux notify-email works."'

9) Email Nimrod from the Mac too:
   bash /Users/goldendreamers/windsage/scripts/notify-email.sh "Windsage · done: S22 local agent from Mac" "Key + .env.smtp copied to u0_a383@100.124.6.109:8022. Phone can ssh wald-mc. Preflight notes in chat."
   If blocked at any required secret/password: subject Windsage · ACTION NEEDED: and stop.

10) Report: Mac hostname, KEY_YES/SMTP_YES, Wald-from-Mac, S22 ping, S22 ssh, files copied (names only), Wald-from-phone, smtp result. Then wait for the next product task.

remember discord bot alerts
```

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
