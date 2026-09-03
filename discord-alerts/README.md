# Windsage Alerts (Discord DMs)

A **new Discord application** that DMs you when a followed station alerts. Separate from:

- Windsage Helper (`/ask` `/ruach` `/mod`)
- Website **Continue with Discord** OAuth
- Cursor one-way ops bot

It never reads `/data/windsage/data/store.json`. Cloud keeps the mapping; this process only registers `/link` `/unlink` and talks to `http://127.0.0.1:8787`.

## What members do

1. Sign in on https://windsage.nimrod.bio/ (username or Google — not guest)
2. Join the Windsage Discord server
3. **Menu → Discord alerts** (or Account) → **Get a link code**
4. In any Windsage Discord channel type `/link CODE` (slash command, then the 6-character code)
5. Discord privacy: allow DMs from server members

Unlink: Account → Stop Discord alerts, or `/unlink` in Discord.

## Discord application (new app)

1. https://discord.com/developers/applications → **New Application** → `Windsage Alerts`
2. **Installation** tab — do this **before** turning Public Bot off:
   - **Install Link** dropdown → **None** (not Discord Provided Link, not Custom URL)
   - Click **Save Changes** at the bottom
   - Installation contexts: **Guild Install** on, **User Install** off
   - If Discord still says *“Private application cannot have a default authorisation link”*, you saved Public Bot off while Install Link was still Discord Provided Link. Set Install Link to None, Save, refresh the page, *then* Bot → Public Bot off.
3. Bot → Add Bot. Public Bot **off**. Privileged intents: all **off**
4. OAuth2 → URL Generator: scopes `bot` and `applications.commands` (one-off invite only; not a default link)
5. Bot permissions: View Channel, Send Messages, Embed Links (integer `19456`)
6. Invite into the Windsage guild only. Do **not** turn Bot on the OAuth app or the Helper app.

`https://discord.com/oauth2/authorize?client_id=CLIENT_ID&scope=bot%20applications.commands&permissions=19456`

Paste token + Client ID + Guild ID in Cursor chat (not email). Operator writes env files and restarts.

## Wald

- Linux user `windsagealerts` (no sudo, nologin)
- Files: `/usr/local/windsage-alerts/`
- Unit: `windsage-alerts.service`
- Cloud token copy: `/data/windsage/discord-alert.env` (windsage.service reads this to send the DM)

```bash
/Users/goldendreamers/windsage/scripts/deploy-discord-alerts.sh
```
