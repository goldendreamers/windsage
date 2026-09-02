# Windsage — agent guide

Start with the context file that matches where you are running:

| Where | Start file |
| --- | --- |
| Cursor **Cloud** VM (no Tailscale, no gitignored secrets) | [`CLOUD_AGENT_CONTEXT.md`](./CLOUD_AGENT_CONTEXT.md) |
| **Local** machine that can SSH to Wald and hold `.env` files | [`docs/DEVICE_AGENT_CONTEXT.md`](./docs/DEVICE_AGENT_CONTEXT.md) |
| **Samsung S22 / Termux** | [`docs/DEVICE_AGENT_CONTEXT.md`](./docs/DEVICE_AGENT_CONTEXT.md) (Android / S22 section) + `scripts/s22-termux-bootstrap.sh` |

Product overview and ops: [`README.md`](./README.md). Expo version notes: [`docs/AGENTS.md`](./docs/AGENTS.md) (read https://docs.expo.dev/versions/v57.0.0/ before inventing APIs).

## Rules that apply everywhere

- Never wipe `/data/windsage/data/store.json` users/stations.
- Do not commit `.env`, `.env.smtp`, `oauth.env`, `code/cloud/data/`, or SSH keys.
- Email via `scripts/notify-email.sh` when blocked (`Windsage · ACTION NEEDED:`) or when a step finishes (`Windsage · done:`). Cloud VMs often have no `.env.smtp` — say so in chat instead of inventing passwords.
- After a finished product step on a machine that can SSH to Wald: `npm run release:web`.
- When writing a Mac/device deploy prompt, include this exact line:

remember discord bot alerts

Discord club alerts are a product reminder. Do not claim a Discord bot is live unless `git grep -i discord` and Wald health prove it. Tokens stay in `/data/windsage/oauth.env` on Wald.

## Cloud VM note

This cloud environment cannot Tailscale/SSH to Wald and cannot read the Mac’s `.env.smtp`. Local-only work (copy secrets, `wald-mc` deploy, smtp test) belongs in a **local** agent. Paste the first-run block from `docs/DEVICE_AGENT_CONTEXT.md` or **Pending** in [`docs/MAC_AGENT_PROMPTS.md`](./docs/MAC_AGENT_PROMPTS.md).
