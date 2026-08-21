# Windsage — agent guide

Start with [`CLOUD_AGENT_CONTEXT.md`](./CLOUD_AGENT_CONTEXT.md) and [`README.md`](./README.md). Expo version notes: [`docs/AGENTS.md`](./docs/AGENTS.md).

## Local phone-app environment

This is an **Expo phone app** (PWA + Expo Go). Cloud agents do **not** set up the phone — they append a paste-ready prompt to [`docs/MAC_AGENT_PROMPTS.md`](./docs/MAC_AGENT_PROMPTS.md).

On this Mac the checkout is `file:///Users/nimrod/Documents/AOS_V5/Shaked-WindSage/windsage` (there is no `/Users/goldendreamers/windsage`). Wald SSH is `waldhomeserver` (`nimrodw@100.125.98.56`), not `wald-mc`. Home LAN is `10.0.0.0/24` — Expo Go can use `exp://<mac-lan-ip>:8081` without Tailscale when the iPhone is on the same Wi-Fi.

```bash
export PATH="$HOME/.local/node/bin:$PATH"
cd /Users/nimrod/Documents/AOS_V5/Shaked-WindSage/windsage
npm install
npm install --prefix code/cloud
EXPO_PUBLIC_WINDSAGE_URL=https://windsage.nimrod.bio npm start   # Metro :8081, Expo Go QR
# optional local API (do not rsync code/cloud/data to Wald):
npm run cloud
EXPO_PUBLIC_WINDSAGE_URL=http://127.0.0.1:8787 npm run web
```

- Cloud data: `code/cloud/data/store.json` (gitignored). Never wipe Wald users/stations.
- Checks: `npm run check`. Also `node scripts/check-geo.mjs`.
- Do not run `npm run release:web` from a cloud VM (needs Tailscale/`waldhomeserver`).

## Cursor Cloud specific instructions

Two processes:

- **Cloud backend** — `code/cloud/server.mjs`, port `8787`, JSON store, optional `web-push`.
- **Expo client** — `npm run web`, port `8081`.

`.cursor/environment.json` installs both package trees and starts the cloud on boot. Start Expo with `npm run web` (or `npm run dev`) when you need the phone UI.

**Egress:** this VM cannot reach `windsage.nimrod.bio`, Windguru, NDBC, or Open-Meteo. Auth, follow, and persist work against the local cloud. Live weather resolve needs those domains on the allow-list (or a real phone against production).
