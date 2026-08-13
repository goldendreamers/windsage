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

SSH to the home server (`wald-mc`), then:

```bash
sudo -u nimrodw tee /data/windsage/oauth.env >/dev/null <<'EOF'
WINDSAGE_PUBLIC_URL=https://windsage.nimrod.bio
GOOGLE_CLIENT_ID=PASTE_CLIENT_ID_HERE
GOOGLE_CLIENT_SECRET=PASTE_CLIENT_SECRET_HERE
EOF
sudo chmod 600 /data/windsage/oauth.env
sudo chown nimrodw:nimrodw /data/windsage/oauth.env
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

## 2. Facebook (app code is ready — needs Meta app secrets)

Env keys:

- `FACEBOOK_APP_ID`
- `FACEBOOK_APP_SECRET`

**Authorized redirect URI** (exact):

- `https://windsage.nimrod.bio/v1/auth/facebook/callback`

**Your steps in Meta:**

1. [developers.facebook.com](https://developers.facebook.com/) → Create app → type **Consumer** / authenticate.
2. Add product **Facebook Login**.
3. Settings → Basic: copy App ID + App Secret.
4. Facebook Login → Settings → Valid OAuth Redirect URIs: add the callback above.
5. Add App ID/Secret to `/data/windsage/oauth.env` and restart `windsage`.

Health should then show `"facebook":true`. **Account → Continue with Facebook** appears only when that flag is on. Native uses the same in-app browser + `windsage://` return as Google.

---

## 3. Apple (app code is ready — needs Apple Developer identifiers + .p8)

Env keys:

- `APPLE_CLIENT_ID` (Services ID)
- `APPLE_TEAM_ID`
- `APPLE_KEY_ID`
- `APPLE_PRIVATE_KEY_PATH` (path to the `.p8` on Wald) **or** `APPLE_PRIVATE_KEY` (PEM with `\n`)

**Return URL** (exact):

- `https://windsage.nimrod.bio/v1/auth/apple/callback`

**Your steps in Apple Developer:**

1. Certificates, Identifiers & Profiles → **Identifiers** → create **Services ID** for Sign in with Apple.
2. Enable Sign in with Apple; configure domain `windsage.nimrod.bio` and the return URL above.
3. Create a **Key** with Sign in with Apple; note Key ID; download `.p8` once.
4. Note Team ID (membership page).
5. Place the `.p8` on Wald (e.g. `/data/windsage/apple-auth-key.p8`, `chmod 600`) and set env; restart.

Health should then show `"apple":true`. **Account → Continue with Apple** appears only when that flag is on. Apple posts the callback (`form_post`); the server then redirects to the app/web return URL.

The server builds Apple's client-secret JWT (ES256) from the `.p8` — no extra npm packages.

---

## Security

- Never commit `oauth.env` or client secrets to git.
- File on Wald: `chmod 600`, owned by `nimrodw`.
- After any change: `sudo systemctl restart windsage`.
