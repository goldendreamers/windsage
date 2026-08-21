# Mac Cursor agent — paste-ready prompts

**Running handoff file.** When you open Cursor on the Mac (`/Users/goldendreamers/windsage`), paste the **next pending** prompt below into a new **local** agent chat (not a cloud agent).

Cloud agents often cannot Tailscale/SSH to Wald or send `notify-email.sh` mail. Anything that needs a live deploy or Mac-local secrets lands here.

**How to maintain:** after a Mac run finishes (or a new cloud task leaves Mac work), edit this file — move the prompt under **Done**, add any new pending prompts at the top of **Pending**.

---

## Pending (newest first)

### 0) Set up the local **phone** environment (Mac Cursor — not cloud)

**Why:** Windsage is an Expo phone app (PWA + Expo Go). Cloud agents cannot run Expo Go, iPhone Safari, or a device. A 2026-08-21 cloud review asked for a local session to install deps and boot Metro on the Mac at `file:///Users/goldendreamers/windsage`.

**Paste this entire block into a new local Mac Cursor agent:**

```
You are a LOCAL Mac Cursor agent at /Users/goldendreamers/windsage (not a cloud VM). Tailscale to Wald is available.
Windsage is a PHONE app (Expo / PWA). Your job is to build the local phone-dev environment and prove Metro + the cloud API are reachable. Do not wipe store.json / stations on Wald.

Read:
- file:///Users/goldendreamers/windsage/docs/MAC_AGENT_PROMPTS.md
- file:///Users/goldendreamers/windsage/CLOUD_AGENT_CONTEXT.md
- file:///Users/goldendreamers/windsage/AGENTS.md
- file:///Users/goldendreamers/windsage/docs/WEEKLY_REVIEW_2026-08-21.md
Expo APIs: https://docs.expo.dev/versions/v57.0.0/

export PATH="$HOME/.local/node/bin:$PATH"
cd /Users/goldendreamers/windsage

# Prefer the weekly-review branch if it exists (has npm run dev + scripts/dev-local.sh).
# Otherwise stay on main and use npm start / npm run web.
git fetch origin
if git rev-parse --verify origin/cursor/weekly-progress-review-5b2b >/dev/null 2>&1; then
  git checkout cursor/weekly-progress-review-5b2b 2>/dev/null || git checkout -B cursor/weekly-progress-review-5b2b origin/cursor/weekly-progress-review-5b2b
  git pull --ff-only origin cursor/weekly-progress-review-5b2b || true
else
  git checkout main && git pull --ff-only
fi
git log -5 --oneline
node -v && npm -v

1) Install:
   npm install
   npm install --prefix code/cloud
   npm run check
   node scripts/check-geo.mjs || true

2) Phone client against LIVE Wald (this is the real app path):
   EXPO_PUBLIC_WINDSAGE_URL=https://windsage.nimrod.bio npm start
   Leave Metro running. Confirm a QR / exp:// URL in the terminal.
   Ask Nimrod (ACTION NEEDED email) to open Expo Go on the iPhone (Tailscale on) and scan the QR.
   Also confirm https://windsage.nimrod.bio/health in a browser.

3) Optional second path — local cloud (no Wald), phone-shaped web:
   If scripts/dev-local.sh exists: npm run cloud   (http://127.0.0.1:8787/health)
   Then: EXPO_PUBLIC_WINDSAGE_URL=http://127.0.0.1:8787 npm run web
   Open http://127.0.0.1:8081 in a phone-sized window. Local store: file:///Users/goldendreamers/windsage/code/cloud/data/store.json
   Do not rsync this local store to Wald.

4) Do NOT merge https://github.com/goldendreamers/windsage/pull/9 (broken ternary in StationDetailScreen).
   Do NOT run eas build unless Nimrod asked.
   If health."webPush" is false, continue with MAC_AGENT_PROMPTS item 1 (VAPID + npm run release:web) after Metro works.

5) Email:
   - Windsage · done: local phone env — Metro running, how to scan, health JSON webPush true/false
   - or Windsage · ACTION NEEDED: Expo Go scan / VAPID / whatever blocked you
6) Move this prompt to Done in docs/MAC_AGENT_PROMPTS.md with today’s date and the Metro URL.

Prefer absolute file:// and https:// links. Expo docs: v57.
```

### 0b) After VAPID: do **not** merge PR #9 as-is

https://github.com/goldendreamers/windsage/pull/9 is a 69-file draft (Follow live-directory search, follow-list merge, simple mode, install download, optional Resend alert-email). `StationDetailScreen.tsx` has a broken ternary (`cond ? null : (JSX) : null`) that breaks the Metro web bundle. Split/fix before merge. Details: `file:///Users/goldendreamers/windsage/docs/WEEKLY_REVIEW_2026-08-21.md`.

### 1) Enable phone Web Push on Wald + release PR #8

**Why:** https://github.com/goldendreamers/windsage/pull/8 is **merged** (`594621e` on `main`). Live https://windsage.nimrod.bio/ still needs VAPID keys (if `webPush` is false) and `npm run release:web`. Windsage does **not** send wind-alert emails.

**Paste this entire block into a local Mac Cursor agent:**

```
You are on the Mac at /Users/goldendreamers/windsage with Tailscale to Wald.
Read file:///Users/goldendreamers/windsage/docs/MAC_AGENT_PROMPTS.md and file:///Users/goldendreamers/windsage/CLOUD_AGENT_CONTEXT.md.
Do not wipe store.json / stations.

https://github.com/goldendreamers/windsage/pull/8 is already MERGED. Do not merge again.

export PATH="$HOME/.local/node/bin:$PATH"
cd /Users/goldendreamers/windsage
git checkout main && git pull --ff-only
git log -5 --oneline

1) Check live health:
   curl -sS https://windsage.nimrod.bio/health | python3 -m json.tool | head -40
   If "webPush" is not true:
     ssh wald-mc 'cd /data/windsage && /usr/bin/npm install --omit=dev --no-fund --no-audit'
     On Mac: npx --yes web-push generate-vapid-keys
     Append WEB_PUSH_VAPID_PUBLIC, WEB_PUSH_VAPID_PRIVATE, and WEB_PUSH_CONTACT=mailto:shakedwald@gmail.com to /data/windsage/oauth.env WITHOUT deleting Google/other keys (chmod 600, owner nimrodw).
     ssh wald-mc 'sudo systemctl restart windsage && sleep 2 && curl -sS http://127.0.0.1:8787/health'
     Confirm health shows "webPush": true.
2) npm run release:web
3) Email Nimrod: Windsage · ACTION NEEDED: Open home-screen Windsage → Account → Send test phone alert
   iPhone must use Safari Add to Home Screen (Chrome iOS cannot push). Lock the phone, then tap the test. Windsage does not send email alerts.

Update docs/MAC_AGENT_PROMPTS.md (move this to Done with today’s date) after VAPID is on and release is live; leave the phone-test as ACTION NEEDED until Nimrod confirms a lock-screen buzz.
Prefer absolute file:// and https:// links.
```

---

## Done

### 2026-08-14 — PR #8 merged on GitHub (cloud agent)

Merged https://github.com/goldendreamers/windsage/pull/8 (`594621e`). Web Push subscribe now syncs to Wald; test-push explains missing VAPID; Account/Download call out Safari-on-iPhone. Wald VAPID + `npm run release:web` still pending (item 1 above).

### 2026-08-13 — Wald release of merged PR #7 (Mac + Tailscale)

Pulled `main` (`9b92cbb`), ran `npm run release:web` to Wald. Live https://windsage.nimrod.bio/ health ok; map-pin Identity has no Spot/Station or editable Source ID, read-only location, Open → Google Maps; Alert column stays at threshold after a check. Store not wiped (4 users). Snapshot `file:///Users/goldendreamers/windsage/releases/web/20260813T132018Z`.

### 2026-08-13 — PR #7 merged on GitHub (cloud agent)

Merged https://github.com/goldendreamers/windsage/pull/7 (`gh pr merge 7 --merge` → `b18a492`). Map-pin Identity UI is on `main`. Catch-up commits (Alert threshold, metric-aware home stats, guest-follow leak, Google Maps geo) were already on `main` before this merge.
