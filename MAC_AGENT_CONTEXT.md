# Windsage — local Mac/Linux agent (second device)

Use this when opening Cursor on a **laptop that is not** `/Users/goldendreamers/windsage`, but should still SSH to Wald, deploy, and send notify email.

Cursor **Cloud** VMs cannot Tailscale to Wald — use [`CLOUD_AGENT_CONTEXT.md`](./CLOUD_AGENT_CONTEXT.md) there instead.

Operator: **Nimrod**. Live: https://windsage.nimrod.bio/

---

## 0. First boot on the new machine

Do this **before** pasting the agent prompt. Secrets never go in git or email.

1. **Tailscale** — join the same tailnet as Wald. You must reach `100.125.98.56`.
2. **Git** — `git clone https://github.com/goldendreamers/windsage.git` then `cd windsage`.
3. **Node 22** — install Node, then either put it on `PATH` or use:
   `export PATH="$HOME/.local/node/bin:$PATH"`  
   (this Mac keeps Node at `file:///Users/goldendreamers/.local/node/bin`.)
4. **SSH key** — copy the **private** key this Mac uses for `wald-mc` onto the new device (`chmod 600`). Do not generate a new key unless you also add the public half to Wald `~nimrodw/.ssh/authorized_keys`.
5. **SSH config** — `~/.ssh/config`:

```
Host wald-mc
  HostName 100.125.98.56
  User nimrodw
  IdentityFile ~/.ssh/YOUR_KEY_FILENAME
  IdentitiesOnly yes
```

6. **SMTP / Resend for agent email** — copy `.env.smtp` from the goldendreamers Mac into the **clone root** (same place as `package.json`). Template: [`file:///Users/goldendreamers/windsage/.env.smtp.example`](file:///Users/goldendreamers/windsage/.env.smtp.example). Gitignored. Default to: `shakedwald@gmail.com`.
7. Smoke:

```bash
export PATH="$HOME/.local/node/bin:$PATH"
ssh wald-mc 'hostname; systemctl is-active windsage'
curl -sS https://windsage.nimrod.bio/health
# from clone root:
test -f .env.smtp && echo "smtp env present"
```

If `ssh wald-mc` fails: Tailscale off, wrong key, or Wald asleep — stop and email `Windsage · ACTION NEEDED:`.

---

## Product (short)

Friend-group wind-alert **PWA**. Wald polls weather, evaluates hold rules, pushes phone / web-push / email. Phone stays idle.

| | |
| --- | --- |
| Public | https://windsage.nimrod.bio/ |
| Health | https://windsage.nimrod.bio/health |
| Tailnet | https://windsage.taild8a1d4.ts.net/ |
| GitHub | https://github.com/goldendreamers/windsage |
| Default branch | `main` — **do not merge to main unless Nimrod asks** |
| Store | `/data/windsage/data/store.json` — **never wipe** users/stations. Do not use `clearStations` unless they mean unfollow-all. |

Repo map: [`CLOUD_AGENT_CONTEXT.md`](./CLOUD_AGENT_CONTEXT.md). Expo notes: [`docs/AGENTS.md`](./docs/AGENTS.md).

---

## SSH / Wald

Same host as Minecraft. Fallback IP if MagicDNS is down: `nimrodw@100.125.98.56`.

| Item | Path / unit |
| --- | --- |
| App user | `nimrodw` |
| Cloud code | `/data/windsage/` (`server.mjs`) |
| Web PWA | `/data/windsage/web/` |
| Store | `/data/windsage/data/store.json` (mode 600) |
| Daily backups | `/data/backups/windsage/` |
| Restore follows | `node /data/windsage/restore-stations.mjs --live /data/windsage/data --from /data/backups/windsage/STORE.json.gz` then `sudo systemctl restart windsage` |
| systemd | `windsage.service` |
| Helper bot | `windsage-helper.service` — `/usr/local/windsage-helper/` (FAQ `/ask`, not alerts) |
| Alerts bot | `windsage-alerts.service` — `/usr/local/windsage-alerts/` (DMs on station alert; may be inactive until token) |

```bash
ssh wald-mc 'python3 -c "import json;d=json.load(open(\"/data/windsage/data/store.json\")); print(\"users\",len(d.get(\"users\")or{}), \"follows\", sum(len(u.get(\"stations\")or[]) for u in (d.get(\"users\")or{}).values()))"'
```

`sudo` on Wald is passwordless for the usual deploys (`systemctl restart windsage`). Never `tee` overwrite `/data/windsage/oauth.env` (that wipes Google). **Append** new keys only.

---

## Env files — where they live

**Laptop (clone root, gitignored):**

| File | Who needs it | Purpose |
| --- | --- | --- |
| `.env.smtp` | Every local agent | `scripts/notify-email.sh` (SMTP and/or `RESEND_API_KEY`) |
| `discord-cursor.env` / `.env.discord-cursor.local` | Only Cursor↔Discord ops | One-way Cursor bot. **Not** Helper, **not** website OAuth, **not** alert DMs |

Copy those **from the goldendreamers Mac** (AirDrop, USB, `scp` over Tailscale). Never commit. Never paste tokens into GitHub issues or notify email.

**Wald only (do not copy onto the laptop unless you are editing them in place over SSH):**

| File | Purpose |
| --- | --- |
| `/data/windsage/oauth.env` | `GOOGLE_CLIENT_*`, optional `SYNOPTIC_TOKEN`, optional alert-email Resend, `WINDSAGE_PUBLIC_URL` |
| `/data/windsage/discord-alert.env` | `DISCORD_ALERT_BOT_TOKEN` + `DISCORD_ALERT_HOOK_SECRET` (cloud sends DMs) |
| `/usr/local/windsage-helper/helper.env` | Helper bot token (FAQ/mod). Isolated from `oauth.env` |
| `/usr/local/windsage-alerts/alerts.env` | Alerts bot token + same hook secret as `discord-alert.env` |

Templates in git (empty values):

- [`file:///Users/goldendreamers/windsage/.env.smtp.example`](file:///Users/goldendreamers/windsage/.env.smtp.example)
- [`file:///Users/goldendreamers/windsage/code/cloud/oauth.env.example`](file:///Users/goldendreamers/windsage/code/cloud/oauth.env.example)
- [`file:///Users/goldendreamers/windsage/code/cloud/discord-alert.env.example`](file:///Users/goldendreamers/windsage/code/cloud/discord-alert.env.example)
- [`file:///Users/goldendreamers/windsage/discord-alerts/alerts.env.example`](file:///Users/goldendreamers/windsage/discord-alerts/alerts.env.example)

systemd drop-in: `/etc/systemd/system/windsage.service.d/` (`oauth.conf`, `public-url.conf`, `discord-alert.conf`). Prefer a **new** drop-in file over rewriting `oauth.env`.

---

## Discord — three apps (do not mix tokens)

| App | Job |
| --- | --- |
| Website OAuth | Continue with Discord / Google stay in `oauth.env`. Callback `https://windsage.nimrod.bio/v1/auth/discord/callback` if enabled |
| Helper | `/ask` `/ruach` `/mod`. No store.json |
| Alerts | `/link` `/unlink` + cloud DMs on `shouldNotify`. See [`discord-alerts/README.md`](./discord-alerts/README.md) |

Do **not** turn Bot on the OAuth application.

---

## Deploy / test (this class of agent)

```bash
export PATH="$HOME/.local/node/bin:$PATH"
cd /ABSOLUTE/PATH/TO/windsage   # not necessarily /Users/goldendreamers/windsage
npm run check
npm run release:web
```

`npm run release:web` exports the PWA, snapshots `releases/web/`, prunes old snapshots, rsyncs `code/cloud/` → `/data/windsage/` (excludes `data`, `web`, `node_modules`, `oauth.env`, `*.env`, `scripts`) and `dist/` → `/data/windsage/web/`, then `sudo systemctl restart windsage`.

After UI changes: hard-refresh https://windsage.nimrod.bio/ (or delete the home-screen icon) so the service worker is not serving old JS.

Email (mandatory):

```bash
scripts/notify-email.sh "Windsage · done: …" "body"
scripts/notify-email.sh "Windsage · ACTION NEEDED: …" "body"
```

Blocked = credentials, Tailscale, SSH, CAPTCHA, Discord Developer Portal, choice. Chat is not enough.

---

## Hard rules

- Never wipe `/data/windsage/data/store.json`.
- Never commit `.env`, `.env.smtp`, `oauth.env`, bot tokens, `helper.env`, `alerts.env`, `discord-cursor.env`.
- Never merge to `main` unless Nimrod asks.
- Full `https://` or `file://` paths in chat.
- Preferred name in chat: Nimrod.

---

## Paste-ready prompt (new Cursor agent on the other device)

Attach `@MAC_AGENT_CONTEXT.md`. Then paste:

```
You are a local Cursor agent for Windsage on this machine (not a Cursor Cloud VM).

Read first:
- MAC_AGENT_CONTEXT.md
- CLOUD_AGENT_CONTEXT.md
- README.md
- .cursor/rules/notify-email.mdc
- .cursor/rules/web-export-after-update.mdc

Operator: Nimrod
Repo: this clone (cd into it; use absolute paths)
Live: https://windsage.nimrod.bio/

Before any product work:
1. export PATH="$HOME/.local/node/bin:$PATH"
2. Confirm git remote and branch: git status -sb && git log -1 --oneline
3. ssh wald-mc 'hostname; systemctl is-active windsage'
4. test -f .env.smtp || echo "MISSING .env.smtp"
5. curl -sS https://windsage.nimrod.bio/health

If SSH, Tailscale, Node, or .env.smtp is missing: stop. Tell Nimrod in chat and send
Windsage · ACTION NEEDED: via scripts/notify-email.sh. Do not invent secrets.

Rules: do not merge to main unless asked. Never wipe /data/windsage/data/store.json.
Never commit secrets. After a finished product step: npm run check (if code changed),
npm run release:web, hard-refresh note for the PWA, then Windsage · done: email.

Then do the user’s task.
```
