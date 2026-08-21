# Windsage Discord helper

Separate from website **Continue with Discord** (OAuth callback `https://windsage.nimrod.bio/v1/auth/discord/callback`) and from `windsage.service`.

- Live app: https://windsage.nimrod.bio/
- Plan / ops: [file:///Users/goldendreamers/windsage/docs/DISCORD-HELPER.md](file:///Users/goldendreamers/windsage/docs/DISCORD-HELPER.md)
- This folder deploys to `/usr/local/windsage-helper/` on Wald as user `windsagehelper`

## What it does

- `/ask` in `#ask-windsage` only (no Message Content intent — members do not “type normally” at the bot)
- Frozen FAQ, then “ask a human mod”. No LLM.
- `/ruach` `/laan` `/briut` call https://windsage.nimrod.bio/v1 (same brain as the PWA)
- `/mod` in `#mod-bot` only, mods only, Confirm (second Confirm for delete / kick / ban)

It never binds a port, never reads `/data/windsage`, and must not share a token with the OAuth login app.

## Deploy

```bash
chmod +x /Users/goldendreamers/windsage/scripts/deploy-discord-helper.sh
/Users/goldendreamers/windsage/scripts/deploy-discord-helper.sh
```

Starts only when `/usr/local/windsage-helper/helper.env` has `DISCORD_TOKEN`.

## Discord application (new app — do not turn Bot on the OAuth app)

1. https://discord.com/developers/applications → **New Application** → name `Windsage Helper`
2. Bot → Add Bot. Public Bot **off**. Privileged intents: all **off** (no Message Content)
3. OAuth2 → URL Generator: scopes `bot` and `applications.commands`
4. Bot permissions (no Administrator): View Channel, Send Messages, Embed Links, Attach Files, Read Message History, Add Reactions, Manage Channels, Manage Roles, Kick Members, Ban Members, Moderate Members, Manage Expressions
5. Invite into this guild only. Create `#ask-windsage`, `#mod-bot`, `#rules` if missing. Put the bot role **above** cosmetic roles and **below** mods.
6. Paste token + snowflake IDs into Cursor chat (not email). Operator then writes `helper.env` and re-runs the deploy script.

Permission integer for the invite URL: `1100853922902`

`https://discord.com/oauth2/authorize?client_id=CLIENT_ID&scope=bot%20applications.commands&permissions=1100853922902`

Do **not** put this invite on the website Join Discord button.
