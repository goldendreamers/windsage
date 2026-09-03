# Mac Cursor agent — paste-ready prompts

**Running handoff file.** Cloud agents put the prompt in chat. Do not stack stale deploy recipes here.

## Pending

### 2026-09-02 — bootstrap a local agent on a new device

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

When bootstrap is green, wait for the next product task. You can npm run release:web.

remember discord bot alerts
```

## Done

- 2026-09-02 — PR #9 tip `89173b5` (alert volume + simple-mode core-only). Prompt given in chat; running queue cleared.
