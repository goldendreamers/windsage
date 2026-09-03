# Windsage — device agent context

**Start here** when a **local** Cursor agent runs on a real machine (Mac, Linux laptop, another desktop). That agent can Tailscale/SSH to Wald and use gitignored `.env` files. Cursor **Cloud** agents cannot — they use [`CLOUD_AGENT_CONTEXT.md`](../CLOUD_AGENT_CONTEXT.md) instead.

**Never put real passwords, API keys, or private keys in this file or in git.** Copy secrets from an already-working machine.

Operator: Nimrod. Repo: https://github.com/goldendreamers/windsage  
Live: https://windsage.nimrod.bio/  
Health: https://windsage.nimrod.bio/health  
Tailnet: https://windsage.taild8a1d4.ts.net/

---

## What this machine is for

| Job | How |
| --- | --- |
| Product work | Same as any agent: read `CLOUD_AGENT_CONTEXT.md`, `docs/SIMPLE-MODE.md`, never wipe `store.json` |
| Deploy | `npm run release:web` (needs SSH `wald-mc`) |
| Notify Nimrod | `scripts/notify-email.sh` (needs repo `.env.smtp`) |
| Native store builds | `npx eas-cli` after `eas login` (optional) |

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
| `RESEND_API_KEY` / `WINDSAGE_EMAIL_FROM` | Quiet/email alerts to the user’s Google address |
| `WEB_PUSH_VAPID_PUBLIC` / `WEB_PUSH_VAPID_PRIVATE` | Browser Web Push |

Inspect without dumping secrets:

```bash
ssh wald-mc 'sudo -u nimrodw test -f /data/windsage/oauth.env && echo oauth.env ok; curl -sS http://127.0.0.1:8787/health'
```

Health should show `"providers":{"google":true,...}` when Google is configured.

After editing oauth.env on Wald: `sudo systemctl restart windsage`.

---

## 4. Deploy

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

## 5. Rules (same as every Windsage agent)

1. Never wipe `/data/windsage/data/store.json` users/stations.
2. Do not commit `.env`, `.env.smtp`, `oauth.env`, `code/cloud/data/`, or SSH keys.
3. Email via `scripts/notify-email.sh`: blocked → subject `Windsage · ACTION NEEDED:`; finished → `Windsage · done:`.
4. Simple vs advanced: [`docs/SIMPLE-MODE.md`](SIMPLE-MODE.md). New UI is advanced unless it is core to getting a ping.
5. Expo docs: current app is Expo 57 — [`docs/AGENTS.md`](AGENTS.md).
6. When Nimrod asks for a Mac/device deploy prompt, include this exact line:

remember discord bot alerts

7. After you give that prompt, clear **Pending** in [`docs/MAC_AGENT_PROMPTS.md`](MAC_AGENT_PROMPTS.md).

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

When bootstrap is green, wait for the next product task. You can npm run release:web.

remember discord bot alerts
```
