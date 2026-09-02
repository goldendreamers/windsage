# Windsage — device agent context

**Start here** when a **local** Cursor agent runs on a real machine (Mac, Linux laptop, another desktop, or a phone Termux environment). That agent can Tailscale/SSH to Wald and use gitignored `.env` files. Cursor **Cloud** agents cannot — they use [`CLOUD_AGENT_CONTEXT.md`](../CLOUD_AGENT_CONTEXT.md) instead.

## Android / Samsung Galaxy S22

A Cloud Agent VM cannot install anything on the S22. **Tailscale Android is already installed and on Wald’s tailnet** — do not reinstall it. You only run the bootstrap **in Termux on the phone**.

1. Install **Termux from F-Droid** if it is not already there. Official: https://f-droid.org/packages/com.termux/ or https://github.com/termux/termux-app/releases — **not** the Play Store listing (abandoned since 2022).
   Samsung / Play Protect often says Termux “might be harmful.” That is a **sideload / old-SDK false positive**, not malware, when the package is `com.termux` from F-Droid or the `termux/termux-app` GitHub release. Tap **More details → Install anyway** only for that source. Do not download Termux APKs from random sites. Leave Play Protect on afterward.
2. Skip Tailscale. S22 tailnet IP (same account as Wald): **`100.124.6.109`**. Wald stays `100.125.98.56`.
3. In Termux:

```bash
pkg update -y
pkg install -y git
git clone https://github.com/goldendreamers/windsage.git
cd windsage
git fetch origin cursor/s22-local-agent-a1e3
git checkout cursor/s22-local-agent-a1e3
bash scripts/s22-termux-bootstrap.sh
```

4. SSH config is the Mac’s `Host wald-mc` / `wald-mc-v6` (see [`docs/ssh-config.wald-mc.example`](ssh-config.wald-mc.example)). Copy the private key `/Users/goldendreamers/.ssh/shaked_waldhomeserver_ed25519` onto the phone at `~/.ssh/shaked_waldhomeserver_ed25519` (`chmod 600`). Copy `/Users/goldendreamers/windsage/.env.smtp` → `~/windsage/.env.smtp`. Never commit those files.
5. Termux `sshd` listens on port **8022**. Termux user is **`u0_a383`**. From the Mac: `ssh -p 8022 u0_a383@100.124.6.109`
6. To **control** Cursor agents from the S22 (supported): Chrome → https://cursor.com/agents → Add to Home screen. A full Cursor CLI worker on Android is unofficial (Termux + Ubuntu proot) and is not required for Windsage deploy/email.

Then continue with sections 2–6 below (SSH `wald-mc`, `.env.smtp`, preflight).

**Never put real passwords, API keys, or private keys in this file or in git.** Copy secrets from an already-working machine. Do not invent them.

Operator: Nimrod. Repo: https://github.com/goldendreamers/windsage  
Live: https://windsage.nimrod.bio/  
Health: https://windsage.nimrod.bio/health  
Tailnet: https://windsage.taild8a1d4.ts.net/

Local copies (canonical Mac clone):

- `file:///Users/goldendreamers/windsage/docs/DEVICE_AGENT_CONTEXT.md`
- `file:///Users/goldendreamers/windsage/CLOUD_AGENT_CONTEXT.md`

---

## What this machine is for

| Job | How |
| --- | --- |
| Product work | Same as any agent: read `CLOUD_AGENT_CONTEXT.md`, `docs/SIMPLE-MODE.md` if present, never wipe `store.json` |
| Deploy | `npm run release:web` (needs SSH `wald-mc`) |
| Notify Nimrod | `scripts/notify-email.sh` (needs repo `.env.smtp`) |
| Native store builds | `npx eas-cli` after `eas login` (optional) |
| Preflight | `scripts/device-agent-preflight.sh` (no secrets printed) |

Canonical Mac clone (source of secrets today): `/Users/goldendreamers/windsage`

| Secret | Lives | Git |
| --- | --- | --- |
| `.env.smtp` | Each device clone (copy from the Mac) | gitignored |
| `~/.ssh/id_ed25519` (or similar) | Each device; pubkey on Wald `authorized_keys` | never in repo |
| `/data/windsage/oauth.env` | Wald only | never copy into the clone |

---

## 1. Clone and Node

```bash
git clone https://github.com/goldendreamers/windsage.git
cd windsage
git fetch origin && git checkout main && git pull
export PATH="$HOME/.local/node/bin:$PATH"
node -v   # want Node 22
```

If Node 22 is missing, install it under `$HOME/.local/node` (same layout the Mac uses) so `npm run release:web` finds it.

Then:

```bash
npm ci
npm run check
```

GitHub: SSH (`git@github.com:goldendreamers/windsage.git`) or `gh auth login`. You need push access to this repo.

---

## 2. Tailscale + SSH to Wald

Wald is the home server. Deploy is `rsync` + `ssh wald-mc`.

| | |
| --- | --- |
| SSH alias | `wald-mc` |
| User | `nimrodw` |
| Tailscale IP | `100.125.98.56` |
| MagicDNS | `waldhomeserver` / `waldhomeserver.taild8a1d4.ts.net` |
| App dir | `/data/windsage/` |
| Store | `/data/windsage/data/store.json` — **never wipe users/stations** |
| systemd | `windsage.service` (user `nimrodw`) |

**Tailscale:** install, log in to the **same tailnet** as Wald, confirm `tailscale status` shows the server.

**SSH config** (`~/.ssh/config`) — keys stay in `~/.ssh/`, never in the repo:

```
Host wald-mc
  HostName 100.125.98.56
  User nimrodw
  IdentityFile ~/.ssh/id_ed25519
  IdentitiesOnly yes
```

Use the same private key the working Mac uses, **or** put this device’s pubkey in `nimrodw`’s `authorized_keys` on Wald.

Prove it:

```bash
ssh wald-mc 'hostname; systemctl is-active windsage; curl -sS http://127.0.0.1:8787/health'
```

If SSH asks for a password or hangs, stop and tell Nimrod (Tailscale off, wrong key, or this host not on the tailnet).

---

## 3. Env files (what, where, do not commit)

Two separate secret bags:

### A. This device — `.env.smtp` (gitignored, repo root)

Used only by `scripts/notify-email.sh`. Template (no secrets): `file:///Users/goldendreamers/windsage/.env.smtp.example` — same relative file in this clone.

**Copy from the working Mac** (do not recreate from memory if you can copy):

`/Users/goldendreamers/windsage/.env.smtp` → `<clone>/.env.smtp`

```bash
# from the new device, if the Mac is on Tailscale and SSH works:
# scp goldendreamers@<mac-tailscale-ip>:/Users/goldendreamers/windsage/.env.smtp .env.smtp
chmod 600 .env.smtp
```

Confirm without printing secrets:

```bash
test -f .env.smtp && echo "smtp env present"
scripts/notify-email.sh "Windsage · done: device agent smtp test" "Ignore — smtp check from a new device."
```

Keys (names only): `WINDSAGE_SMTP_USER`, `WINDSAGE_SMTP_PASS` (Gmail App Password), optional `WINDSAGE_SMTP_HOST/PORT/FROM`, `WINDSAGE_EMAIL_TO` (default `shakedwald@gmail.com`). Or `RESEND_API_KEY` + `WINDSAGE_EMAIL_FROM`.

### B. Wald only — `/data/windsage/oauth.env` (chmod 600, owner `nimrodw`)

Loaded by systemd `EnvironmentFile=-/data/windsage/oauth.env`. Template: [`code/cloud/oauth.env.example`](../code/cloud/oauth.env.example). Full Google steps: [`docs/SSO-SETUP.md`](SSO-SETUP.md).

**Do not copy this file into the git clone.** `npm run release:web` rsyncs `code/cloud/` with `--exclude oauth.env --exclude '*.env' --exclude data`. Secrets on Wald stay put.

Typical keys **already on Wald** (do not paste values into git):

| Key | Why |
| --- | --- |
| `WINDSAGE_PUBLIC_URL` | `https://windsage.nimrod.bio` |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google SSO |
| `SYNOPTIC_TOKEN` | Extra MesoWest stations |
| `RESEND_API_KEY` / `WINDSAGE_EMAIL_FROM` | Optional user-facing mail (if enabled) |
| `WEB_PUSH_VAPID_PUBLIC` / `WEB_PUSH_VAPID_PRIVATE` | Browser Web Push |
| `DISCORD_BOT_TOKEN` / `DISCORD_WEBHOOK_*` | Club Discord alerts — **only if/when wired**; stay on Wald |

Inspect without dumping secrets:

```bash
ssh wald-mc 'sudo -u nimrodw test -f /data/windsage/oauth.env && echo oauth.env ok; curl -sS http://127.0.0.1:8787/health'
```

Health should show `"providers":{"google":true,...}` when Google is configured.

After editing oauth.env on Wald: `sudo systemctl restart windsage`.

---

## 4. Discord bot alerts

**Remember this line** whenever you write a Mac/device deploy prompt (own line, exact text):

```
remember discord bot alerts
```

Facts (do not invent a live bot):

- Phone/PWA alerts today are **Web Push** (VAPID on Wald) and Expo on native. Windsage does **not** email wind alerts.
- Club/channel Discord alerts are a product reminder. There is **no Discord bot implementation on `main`** unless a later commit adds one — check `git grep -i discord` before claiming it is live.
- If Shaked or Nimrod already created a Discord app, tokens belong in Wald `/data/windsage/oauth.env` only (`DISCORD_BOT_TOKEN`, `DISCORD_WEBHOOK_*`). Never copy them into git or into this file.
- If those keys are missing, stop and ask Nimrod. Do not generate fake tokens.

---

## 5. Deploy

```bash
export PATH="$HOME/.local/node/bin:$PATH"
cd /path/to/windsage
npm run check
npm run release:web
```

That exports the Expo web app, snapshots `releases/web/`, prunes old snapshots, rsyncs cloud code → `/data/windsage/` and `dist/` → `/data/windsage/web/`, then restarts `windsage`.

Live check: https://windsage.nimrod.bio/health  
Hard-refresh the PWA (or delete the home-screen icon) after deploy so an old service worker does not keep previous JS.

Export-only (no SSH): `npm run release:web:local`

---

## 6. Rules (same as every Windsage agent)

1. Never wipe `/data/windsage/data/store.json` users/stations.
2. Do not commit `.env`, `.env.smtp`, `oauth.env`, `code/cloud/data/`, or SSH keys.
3. Email via `scripts/notify-email.sh`: blocked → subject `Windsage · ACTION NEEDED:`; finished → subject `Windsage · done:`.
4. Simple vs advanced: [`docs/SIMPLE-MODE.md`](SIMPLE-MODE.md) if that file exists on the branch. New UI is advanced unless it is core to getting a ping.
5. Expo docs: current app is Expo 57 — [`docs/AGENTS.md`](AGENTS.md).
6. When Nimrod asks for a Mac/device deploy prompt, include this exact line:

remember discord bot alerts

7. After a Mac/device prompt is **used**, move **that** item from **Pending** to **Done** in [`docs/MAC_AGENT_PROMPTS.md`](MAC_AGENT_PROMPTS.md). Do not delete unrelated pending work (for example the Wald VAPID / Web Push item).

---

## Preflight (no secrets)

From the clone root:

```bash
export PATH="$HOME/.local/node/bin:$PATH"
bash scripts/device-agent-preflight.sh
```

The script prints ok / missing for git remote, Node 22, `.env.smtp` presence, SSH `wald-mc`, and a live health curl. It never prints file contents or key material.

---

## First-run prompt (paste into the new device agent)

Same text lives under **Pending** in [`docs/MAC_AGENT_PROMPTS.md`](MAC_AGENT_PROMPTS.md) until that bootstrap is used.

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
