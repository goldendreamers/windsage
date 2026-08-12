# Windsage — outstanding / blocked

What still needs a decision or secret from the operator, what already works, and what could not be finished in this pass.

## Still needed from user (action list)

1. **Google SSO** — Set `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` on Wald and register the OAuth redirect URI. Password auth works; the app correctly shows Google as not configured until those env vars exist. Exact callback:

   `https://windsage.nimrod.bio/v1/auth/google/callback`

2. **Paid apex domain (optional)** — `windsage.com` / `windsage.app` are taken. Free branded HTTPS is live at `https://windsage.nimrod.bio/` via Cloudflare Tunnel. Buying a dedicated apex (e.g. `windsage.xyz` if still free) needs budget approval.

**Done recently:** Email notify (Resend + Gmail App Password). Tailnet HTTPS padlock at `https://windsage.taild8a1d4.ts.net/` (host renamed from `waldhomeserver` after stale ACME TXT blocked renewal).

**Also (same pattern, lower priority):** Facebook and Apple SSO are implemented but **env-gated** (`FACEBOOK_APP_ID` / `FACEBOOK_APP_SECRET`; `APPLE_CLIENT_ID` / `APPLE_TEAM_ID` / `APPLE_KEY_ID`). They stay disabled until those secrets are supplied — same model as Google.

**Explicitly out of scope:** SMS / mobile OTP (needs an SMS gateway and was not requested for this pass).

## What works now (brief)

- Guest mode + username/password accounts + multi-device sync
- Spot URL resolve via Wald (`910318` → `2259`) — browser Referer issue fixed
- Metric-aware alert limits + per-metric defaults
- Optional gust / wave / wind / direction limits
- Public HTTPS front door: `https://windsage.nimrod.bio/` (Cloudflare Tunnel on existing `nimrod.bio`)
- Tailnet HTTPS: `https://windsage.taild8a1d4.ts.net/` (Tailscale Serve; Funnel off)

## What could not be implemented / blocked

**Google SSO** (and Facebook/Apple) is code-complete and UI-gated; without provider client secrets on Wald the server correctly reports providers as disabled, while username/password continues to work. When wiring Google, use redirect `https://windsage.nimrod.bio/v1/auth/google/callback`. Apex `windsage.com` / `windsage.app` are taken and were not purchased (no paid domain spend). **SMS/mobile OTP** was left out of scope on purpose — it needs a paid SMS gateway and was not part of the agreed surface.
