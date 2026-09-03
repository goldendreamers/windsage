# Windsage

Mobile app that watches [Windguru](https://www.windguru.cz) stations and notifies you when a parameter stays past a threshold long enough.

**Default rule:** average wind **≥ 15 knots for 20 minutes**  
**Cloud poll:** every **10 minutes** on the Wald home server (not on your phone)

## Battery model

| Layer | Role |
| --- | --- |
| Phone | Follow list UI, sync stations, receive Expo push, refresh only on open / pull |
| Wald cloud | Polls Windguru, evaluates hold-time rules, sends pushes |

Local background Windguru polling is **off**. The phone no longer wakes every 10 minutes.

## Cloud (Wald home server)

Same Tailscale host as Minecraft (`ssh wald-mc` → `nimrodw@100.125.98.56`).

| Item | Value |
| --- | --- |
| Service | `windsage.service` |
| Code | `/data/windsage/` |
| Data | `/data/windsage/data/store.json` |
| Public URL | `https://windsage.nimrod.bio/` (Cloudflare Tunnel → Wald `:8787`) |
| Tailnet HTTPS | `https://windsage.taild8a1d4.ts.net/` (Tailscale Serve) |
| IP fallback | `http://100.125.98.56:8787` |
| RAM | ~60MB Node process (`MemoryMax=96M`) |

```bash
ssh wald-mc 'systemctl status windsage --no-pager | head -20'
curl -sS https://windsage.nimrod.bio/health
```

Redeploy from this Mac:

```bash
rsync -av --delete --exclude data \
  "/Users/goldendreamers/windsage/code/cloud/" \
  wald-mc:/data/windsage/
ssh wald-mc 'sudo systemctl restart windsage'
```

## Folder layout

```
windsage/
├── assets/          brand / store / ui images
├── code/
│   ├── app/         entry + root App
│   ├── screens/     Home + station detail
│   ├── components/  reusable UI
│   ├── core/        cloud client, local storage helpers
│   ├── cloud/       Wald worker (zero npm deps)
│   └── shared/      types, defaults, theme
├── scripts/
└── docs/
```

## Use in the browser

Open with HTTPS padlock:

- **https://windsage.nimrod.bio/** (public, Cloudflare)
- **https://windsage.taild8a1d4.ts.net/** (Tailscale on phone/laptop)

Rebuild + redeploy web (versioned snapshot + prune + Wald):

```bash
export PATH="$HOME/.local/node/bin:$PATH"
cd "/Users/goldendreamers/windsage"
npm run release:web
```

Snapshots land in `file:///Users/goldendreamers/windsage/releases/web/`.  
Keep newest **3**, plus versions aged **>1 day and <7 days**; prune the rest.

Local web preview:

```bash
npm run web
```

## Phone (Expo Go)

Phone must be on Tailscale (or same LAN path to `100.125.98.56`).

```bash
export PATH="$HOME/.local/node/bin:$PATH"
cd "/Users/goldendreamers/windsage"
npm start
```

Allow notifications. Follow a station — Wald takes over the watch.


## Agents

- Cloud VM (no Tailscale/SSH): [`CLOUD_AGENT_CONTEXT.md`](CLOUD_AGENT_CONTEXT.md)
- Local machine that can SSH to Wald and hold `.env` files: [`docs/DEVICE_AGENT_CONTEXT.md`](docs/DEVICE_AGENT_CONTEXT.md)

## Notes

- Expo push works best in Expo Go / an EAS build with a real `extra.eas.projectId`.
- Minecraft stack is untouched (`minecraft-mc` / playit / crafty).
