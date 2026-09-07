# Windsage

Wind-alert PWA: the cloud polls weather sources and notifies you when a station stays past your threshold long enough.

**Default rule:** average wind **≥ 15 knots for 20 minutes**  
**Cloud poll:** every **10 minutes** on your server (not on the phone)

Live instance: https://windsage.nimrod.bio/

## Battery model

| Layer | Role |
| --- | --- |
| Phone / browser | Follow list, sync, receive push. Refresh on open / pull |
| Cloud | Polls providers, evaluates hold-time rules, sends Expo + Web Push |

Local background Windguru polling is **off**.

## Repo layout

```
windsage/
├── assets/          brand / store / ui images
├── code/
│   ├── app/         entry + root App
│   ├── screens/     Home + station detail
│   ├── components/  reusable UI
│   ├── core/        cloud client, local storage helpers
│   ├── cloud/       Node worker (zero required npm deps)
│   └── shared/      types, defaults, theme
├── public/          PWA assets + privacy policy
├── scripts/
└── docs/
```

## Run locally

```bash
npm install
npm run cloud                 # http://127.0.0.1:8787/health  (if the script exists)
# or:
cd code/cloud && node server.mjs
```

Point the client at that API:

```bash
EXPO_PUBLIC_WINDSAGE_URL=http://127.0.0.1:8787 npm run web
```

Phone (Expo Go) against a deployed cloud:

```bash
EXPO_PUBLIC_WINDSAGE_URL=https://windsage.nimrod.bio npm start
```

## Self-host

1. Copy `code/cloud/oauth.env.example` to `oauth.env` on the server (`chmod 600`). Fill only the secrets you use. Never commit that file.
2. Install `code/cloud/windsage.service` as a systemd unit. Set `User=` / `Group=` to the account that owns the data directory.
3. Data lives in `$WINDSAGE_DATA/store.json` (default `code/cloud/data/` locally, `/data/windsage/data` in the example unit). Do not wipe users/stations.
4. Put a reverse proxy (HTTPS) in front of port `8787`. Set `WINDSAGE_PUBLIC_URL` to that origin.
5. Web Push (lock-screen alerts): generate VAPID keys and set `WEB_PUSH_VAPID_*` in `oauth.env`.

Deploy helpers (`scripts/release-web.py`) rsync the cloud worker and exported web build. Set `WINDSAGE_DEPLOY_HOST` to your SSH host.

## Notes

- Secrets belong in gitignored env files (`.env.smtp`, `oauth.env`, `code/cloud/data/`).
- Expo push works best in Expo Go / an EAS build with a real `extra.eas.projectId`.
- Privacy policy for the live app: https://windsage.nimrod.bio/privacy
