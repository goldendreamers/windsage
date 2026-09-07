# Windsage SSO setup (Google / Facebook / Apple)

Username & password already work. SSO buttons turn on only when secrets exist on Wald in `/data/windsage/oauth.env`.

Canonical public URL: **https://windsage.nimrod.bio**

---

## 1. Google (do this first — app code is ready)

### A. Google Cloud Console

1. Open [Google Cloud Console](https://console.cloud.google.com/) and pick/create a project (e.g. `windsage`).
2. **APIs & Services → OAuth consent screen**
   - User type: **External** (unless you have a Google Workspace org).
   - App name: `Windsage`
   - Support email: your email
   - Save. Add yourself as a **Test user** while the app is in Testing.
3. **APIs & Services → Credentials → Create credentials → OAuth client ID**
   - Application type: **Web application**
   - Name: `Windsage web`
   - **Authorized JavaScript origins:**
     - `https://windsage.nimrod.bio`
   - **Authorized redirect URIs** (exact, no trailing slash on path):
     - `https://windsage.nimrod.bio/v1/auth/google/callback`
4. Copy **Client ID** and **Client secret**.

### B. Put secrets on Wald

SSH to the host that runs `windsage.service`, then:

```bash
sudo -u windsage tee /data/windsage/oauth.env >/dev/null <<'EOF'
WINDSAGE_PUBLIC_URL=https://windsage.nimrod.bio
GOOGLE_CLIENT_ID=PASTE_CLIENT_ID_HERE
GOOGLE_CLIENT_SECRET=PASTE_CLIENT_SECRET_HERE
EOF
sudo chmod 600 /data/windsage/oauth.env
sudo chown windsage:windsage /data/windsage/oauth.env
sudo systemctl restart windsage
curl -sS http://127.0.0.1:8787/health
```

Health should show `"providers":{"google":true,...}`.

### C. Verify in the app

**Web:** https://windsage.nimrod.bio/ → **Account** → **Continue with Google**

**iOS / Android (native):** Google sign-in uses an in-app browser session, then returns to the app via the `windsage://` scheme (no extra Google Console redirect URI). Rebuild/reload the native app after this change (`npx expo start` or a new binary). The Google **Web** client redirect stays:

`https://windsage.nimrod.bio/v1/auth/google/callback`

If Google shows `redirect_uri_mismatch`, the Console URI must match that HTTPS callback exactly (not `windsage://`).

---

## 2. Facebook (needs Meta app + a short code pass)

Env keys the server already looks for:

- `FACEBOOK_APP_ID`
- `FACEBOOK_APP_SECRET`

Redirect to register later:

- `https://windsage.nimrod.bio/v1/auth/facebook/callback`

**Your steps in Meta:**

1. [developers.facebook.com](https://developers.facebook.com/) → Create app → type **Consumer** / authenticate.
2. Add product **Facebook Login**.
3. Settings → Basic: copy App ID + App Secret.
4. Facebook Login → Settings → Valid OAuth Redirect URIs: add the callback above.
5. Add App ID/Secret to `/data/windsage/oauth.env` and restart `windsage`.

**Still needed in Windsage code** (not done yet): `/v1/auth/facebook/start` + callback + Account button (same pattern as Google). Say when you have the Meta app and want that wired.

---

## 3. Apple (needs Apple Developer + a short code pass)

Env keys already checked:

- `APPLE_CLIENT_ID` (Services ID)
- `APPLE_TEAM_ID`
- `APPLE_KEY_ID`

(Plus a `.p8` private key file on Wald — not committed.)

Typical return URL:

- `https://windsage.nimrod.bio/v1/auth/apple/callback`

**Your steps in Apple Developer:**

1. Certificates, Identifiers & Profiles → **Identifiers** → create **Services ID** for Sign in with Apple.
2. Enable Sign in with Apple; configure domain `windsage.nimrod.bio` and the return URL above.
3. Create a **Key** with Sign in with Apple; note Key ID; download `.p8` once.
4. Note Team ID (membership page).
5. Place key + env on Wald; restart.

**Still needed in Windsage code:** Apple start/callback (JWT client secret) + UI. Ask when the Apple identifiers/key are ready.

---

## Security

- Never commit `oauth.env` or client secrets to git.
- File on the host: `chmod 600`, owned by the `windsage` service user.
- After any change: `sudo systemctl restart windsage`.
