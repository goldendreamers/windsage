# Windsage Discord helper

A bot on **Wald** that answers `/ask` in Discord and lets mods do Discord chores through Confirm buttons. It **cannot** change the Windsage app, user data, or login secrets.

- Live app: https://windsage.nimrod.bio/
- Open source: https://github.com/goldendreamers/windsage
- Code: [file:///Users/goldendreamers/windsage/discord-helper](file:///Users/goldendreamers/windsage/discord-helper)
- This file: [file:///Users/goldendreamers/windsage/docs/DISCORD-HELPER.md](file:///Users/goldendreamers/windsage/docs/DISCORD-HELPER.md)
- Separate (Cursor sees Discord, Discord cannot drive Wald): [file:///Users/goldendreamers/windsage/docs/DISCORD-CURSOR-ONEWAY.md](file:///Users/goldendreamers/windsage/docs/DISCORD-CURSOR-ONEWAY.md)

**Status:** code in repo. Members: `/ask` FAQ tree, `/ruach` `/laan` `/briut` from Windsage `/v1`. Mods: `/mod` Confirm. **No LLM.** Not the website OAuth app. Starts on Wald only when `helper.env` has `DISCORD_TOKEN`.

---

## In one sentence

A bot on **Wald** (always on) that **answers questions** in Discord and lets **mods do Discord chores through the bot**, but **cannot** change the Windsage app, user data, or login secrets.

---

## What members get

People use **`/ask`** in **`#questions`** (or @ the bot there), and **`/ruach` `/laan` `/briut`** anywhere in the guild (they hit https://windsage.nimrod.bio/v1 — no LLM).

- `/ask` with a question → a written card if we have one, otherwise topic buttons
- `/ask` with no question → topic **buttons** (not a dropdown). First tap shows that topic’s answer.
- `@Windsage Helper how do pings work` → same as `/ask`

No AI. Channel: **`#questions`**. Ordinary chat without `/ask` or @ is ignored.

---

## What mods get

Channel: **`#mod-bot`** only. The person must already have a configured mod role. Every action needs **Confirm**. Delete / kick / ban need a **second Confirm**. Success is logged in `#mod-bot`.

- Post the frozen rules file into `#rules`
- Create a text channel (only in categories you allow)
- Rename, set topic, slowmode (not `#rules`, `#ask-windsage`, `#mod-bot`)
- Delete a channel (not those three)
- Add/remove custom emoji (image attached in the command, Discord CDN only)
- Give/take **cosmetic** roles only (never mod/admin)
- Timeout, kick, or ban (not the owner, not the bot, not other mods)

The bot never gets Discord **Administrator**.

---

## What it must never do

- Change https://windsage.nimrod.bio/ or ship `npm run release:web`
- Read or write `/data/windsage/oauth.env` or `/data/windsage/data/store.json`
- Use SSH, restart `windsage.service`, or bind port 8787
- Mix with the existing **Windsage OAuth** Discord app (the one for “Continue with Discord”)
- Put secrets in email or git

---

## Two Discord apps (on purpose)

| App | Job |
| --- | --- |
| Existing Windsage OAuth | Website login. Callback: https://windsage.nimrod.bio/v1/auth/discord/callback |
| New **Windsage Helper** | This bot only. Public bot off. Guild install only. |

A leaked helper token must not be the website login secret.

---

## Where it runs

**Wald**, so the Mac sleeping does not kill the bot.

- Linux user `windsagehelper` (no sudo, no SSH keys, nologin)
- Files in `/usr/local/windsage-helper/` — **not** `/data/windsage/`
- Unit `windsage-helper.service` — **not** `windsage.service`
- systemd: `InaccessiblePaths=/data/windsage`, `MemoryMax=128M`, `Nice=15`, `CPUQuota=10%`, no listening socket
- `store.json` is mode 600 (Windsage user can still read/write; helper user cannot)

Honest leftover: it is still the **same computer** as Windsage (and Minecraft / AOS). A separate VPS would isolate more. A stolen **bot token** still means Discord mod powers (same as a stolen mod account).

---

## Knowledge the bot may use

Copied onto the helper at install (not a live mount of the laptop repo):

- `discord-helper/knowledge/faq.json`
- `discord-helper/knowledge/howto.md` (PWA, follow, pings, Google/Discord **as a user**)
- `discord-helper/knowledge/rules.md`

Left out: Wald host, SSH, Tailscale, `store.json`, API keys, `CLOUD_AGENT_CONTEXT.md`.

---

## What Nimrod still has to provide

Paste **in Cursor chat**, not email:

- Helper bot token (Discord Developer Portal; phone/CAPTCHA) — **new application** `Windsage Helper`
- Application / Client ID, Guild ID, `#ask-windsage`, `#mod-bot`, `#rules` snowflakes
- Mod role IDs, category IDs for new channels, cosmetic role IDs
- LLM API key — **do not set.** Wind answers come from `/v1`.

Redirect URI for **login** stays:

`https://windsage.nimrod.bio/v1/auth/discord/callback`

Do **not** turn Bot on the OAuth app. Do **not** put the bot invite in Join Discord.

Invite (replace CLIENT_ID):

`https://discord.com/oauth2/authorize?client_id=CLIENT_ID&scope=bot%20applications.commands&permissions=1100853922902`

---

## Known tradeoffs

- `/ask` only (no Message Content) so the bot does not read ordinary messages in categories it can manage.
- FAQ/knowledge go stale until you update files on Wald and re-run `scripts/deploy-discord-helper.sh`.

---

## Done looks like (when the token is in helper.env)

- `/ask How do pings work?` in `#ask-windsage` → short FAQ; app unchanged
- `/ask Restart Wald` / “give me Administrator” → refuse
- `/mod post-rules` → Confirm → rules appear in `#rules`
- `sudo -u windsagehelper cat /data/windsage/oauth.env` fails
- Helper crash does not stop `windsage.service`
- https://windsage.nimrod.bio/v1/auth/providers still shows Google/Discord as today
