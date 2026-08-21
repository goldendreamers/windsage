# Windsage — outstanding / blocked

What still needs a decision or secret from the operator, what already works, and what could not be finished in this pass.

Weekly snapshot (2026-08-21): `docs/WEEKLY_REVIEW_2026-08-21.md`. `main` last moved 2026-08-14 (PR #8). Draft PR #9 has Follow name-search + follow-list wipe fix + other UX — **do not treat as live**; it also has a Metro-breaking ternary in `StationDetailScreen.tsx`.

## Still needed from user (action list)

1. **Local phone-dev session** — this review ran in Cursor Cloud and cannot boot Expo Go. Paste **Pending item 0** from `docs/MAC_AGENT_PROMPTS.md` (`file:///Users/goldendreamers/windsage/docs/MAC_AGENT_PROMPTS.md` after pull) into a **local Mac** Cursor chat.

2. **Phone lock-screen alerts** — Windsage does **not** email wind alerts. The “Email notify” already shipped is **agent ops mail** (`scripts/notify-email.sh`), not a user alert channel. Phone alerts are Web Push on the installed PWA. Need on Wald: `WEB_PUSH_VAPID_PUBLIC` + `WEB_PUSH_VAPID_PRIVATE` in `/data/windsage/oauth.env` so https://windsage.nimrod.bio/health shows `"webPush": true`. On the phone: Safari (not Chrome on iPhone) → Add to Home Screen → Account → **Send test phone alert**. See https://github.com/goldendreamers/windsage/pull/8 and `docs/MAC_AGENT_PROMPTS.md`. Last documented Wald web release is still 2026-08-13 (PR #7) — PR #8 may not be deployed.

3. **Optional provider tokens** — Synoptic / Tempest / Windfinder stay env-gated. Free sources already work. **Map search works without any Google key** (Maps search URL → coordinates; Photon/Open-Meteo fallback). Optional: `GOOGLE_MAPS_API_KEY` on Wald only improves Places autocomplete.

4. **Paid apex domain (optional)** — `windsage.com` / `windsage.app` are taken. Free branded HTTPS is live at `https://windsage.nimrod.bio/` via Cloudflare Tunnel. Buying a dedicated apex needs budget approval.

**Done recently (on `main` / last Wald notes):** Multi-source follows (WG/NDBC/Open-Meteo/location + tokened sources). Map/address blend + Maps URL paste (no Google key). Store wipe-proofing + daily backup cron script. Login/register rate limits. Home “right now” glance + trend. Weather-source hiccup banner. Alert good/meh feedback. Google SSO live. Agent email notify (`notify-email.sh`, not wind alerts). Shared catalog. Faster first load. Map-pin Identity (PR #7) live on Wald. Alert column = threshold not live wind (PRs #4/#5). Guest follows no longer leak onto another account.

**Built but not shipped (draft PR #9, 2026-08-19):** Windguru live-directory name search; follow PUT merge (stop dropping stations); simple mode; compass-word direction; PWA/mobileconfig install download; optional Resend alert-email (product decision needed). Fix StationDetail ternary before any merge.

**Also (same pattern, lower priority):** Facebook and Apple SSO are **env-gated**. Start/callback + HMAC OAuth state exist in draft https://github.com/goldendreamers/windsage/pull/2, not on `main`. They stay off until secrets + that merge land.

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
