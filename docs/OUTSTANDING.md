# Windsage — outstanding / blocked

What still needs a decision or secret from the operator, what already works, and what could not be finished in this pass.

## Still needed from user (action list)

1. **Phone lock-screen alerts** — Windsage does **not** email wind alerts. Phone alerts are Web Push on the installed PWA. Need on the cloud host: `WEB_PUSH_VAPID_PUBLIC` + `WEB_PUSH_VAPID_PRIVATE` in `oauth.env` so https://windsage.nimrod.bio/health shows `"webPush": true`. On the phone: Safari (not Chrome on iPhone) → Add to Home Screen → Account → **Send test phone alert**. See https://github.com/goldendreamers/windsage/pull/8.

2. **Optional provider tokens** — Synoptic / Tempest / Windfinder stay env-gated. Free sources already work. **Map search works without any Google key**. Optional: `GOOGLE_MAPS_API_KEY` only improves Places autocomplete.

3. **Paid apex domain (optional)** — Free branded HTTPS is live at `https://windsage.nimrod.bio/`. Buying a dedicated apex needs budget approval.

**Done recently:** Multi-source follows (WG/NDBC/Open-Meteo/location + tokened sources). Map/address blend. Store wipe-proofing + daily backup cron. Login/register rate limits. Home “right now” glance + trend. Weather-source hiccup banner. Alert good/meh feedback. Google SSO live. Shared catalog. Faster first load. Map-pin Identity (PR #7) live.

**Also (same pattern, lower priority):** Facebook and Apple SSO are **env-gated** but need a short code pass for start/callback (see SSO-SETUP.md).

**Explicitly out of scope:** SMS / mobile OTP; “who’s out there” social check-ins (review idea — later).

## What works now (brief)

- Guest mode + username/password accounts + multi-device sync + Google SSO
- Multi-provider resolve + spot URL resolve via the cloud
- Metric-aware alert limits + per-metric defaults
- Optional gust / wave / wind / direction limits
- Public HTTPS: `https://windsage.nimrod.bio/`

## Deferred from progress review (not obsolete, not this pass)

- SQLite only if concurrent users become real
- GitHub Action wiring existing check scripts
- Friend “who’s riding” layer
