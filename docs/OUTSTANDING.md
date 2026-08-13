# Windsage — outstanding / blocked

What still needs a decision or secret from the operator, what already works, and what could not be finished in this pass.

## Still needed from user (action list)

1. **Optional provider tokens** — Synoptic / Tempest / Windfinder / Google Maps geocode stay env-gated. Free sources (Windguru, NDBC, Open-Meteo, location blend) already work without keys. Map/Address search uses OpenStreetMap (Photon) without a Google key; pasted Google Maps links are parsed even without a key.

2. **Paid apex domain (optional)** — `windsage.com` / `windsage.app` are taken. Free branded HTTPS is live at `https://windsage.nimrod.bio/` via Cloudflare Tunnel. Buying a dedicated apex needs budget approval.

**Done recently:** Multi-source follows (WG/NDBC/Open-Meteo/location + tokened sources). Map/address blend. Store wipe-proofing + daily backup cron. Login/register rate limits. Home “right now” glance + trend. Weather-source hiccup banner. Alert good/meh feedback. Google SSO live. Email notify. Shared catalog. Faster first load.

**Also (same pattern, lower priority):** Facebook and Apple SSO are **env-gated** but need a short code pass for start/callback (see SSO-SETUP.md). They stay off until secrets + that wiring land.

**Explicitly out of scope:** SMS / mobile OTP; “who’s out there” social check-ins (review idea — later).

## What works now (brief)

- Guest mode + username/password accounts + multi-device sync + Google SSO
- Multi-provider resolve + spot URL resolve via Wald
- Metric-aware alert limits + per-metric defaults
- Optional gust / wave / wind / direction limits
- Public HTTPS: `https://windsage.nimrod.bio/`
- Tailnet HTTPS: `https://windsage.taild8a1d4.ts.net/`

## Deferred from progress review (not obsolete, not this pass)

- SQLite only if concurrent users become real
- GitHub Action wiring existing check scripts
- Friend “who’s riding” layer
