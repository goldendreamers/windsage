# Mac Cursor agent — paste-ready prompts

**Running handoff file.** When you open Cursor on the Mac (`/Users/goldendreamers/windsage`), paste the **next pending** prompt below into a new **local** agent chat (not a cloud agent).

Cloud agents often cannot Tailscale/SSH to Wald or send `notify-email.sh` mail. Anything that needs a live deploy or Mac-local secrets lands here.

**How to maintain:** after a Mac run finishes (or a new cloud task leaves Mac work), edit this file — move the prompt under **Done**, add any new pending prompts at the top of **Pending**.

---

## Pending (newest first)

### 0) שקד: סשן בחינת המלצות + דוח סופי

פרומפט מוכן: `docs/SHAKED_REVIEW_PROMPT.md`. מסמך לביקורת: `docs/RECOMMENDATIONS_2026-08-21.md`. שקד מדביק את הבלוק בסשן Cursor חדש על `cursor/weekly-progress-review-5b2b` (PR #11).

### 0b) After VAPID: do **not** merge PR #9 as-is

https://github.com/goldendreamers/windsage/pull/9 is a 69-file draft (Follow live-directory search, follow-list merge, simple mode, install download, optional Resend alert-email). `StationDetailScreen.tsx` has a broken ternary (`cond ? null : (JSX) : null`) that breaks the Metro web bundle. Split/fix before merge. Details: `file:///Users/goldendreamers/windsage/docs/WEEKLY_REVIEW_2026-08-21.md`.

### 1) Enable phone Web Push on Wald + release PR #8

**Why:** https://github.com/goldendreamers/windsage/pull/8 is **merged** (`594621e` on `main`). As of 2026-08-21 live [https://windsage.nimrod.bio/health](https://windsage.nimrod.bio/health) already shows **`webPush: true`** (VAPID is on Wald). Remaining: `npm run release:web` if the PWA UI is still the pre-PR-#8 copy, then Nimrod lock-screen test. Windsage does **not** send wind-alert emails.

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

### 2026-08-21 — local phone env (Mac Cursor)

Checkout `file:///Users/nimrod/Documents/AOS_V5/Shaked-WindSage/windsage` on `cursor/weekly-progress-review-5b2b` (`2455593`). Node v24.7.0 / npm 11.5.1 / Expo 57.0.14.

- `npm install` + `npm install --prefix code/cloud` + `npm run check` + `node scripts/check-geo.mjs` ok.
- **Metro left running** against live Wald: [http://127.0.0.1:8081](http://127.0.0.1:8081) · Expo Go [exp://10.0.0.18:8081](exp://10.0.0.18:8081) (Mac LAN `10.0.0.18`). QR: `file:///Users/nimrod/Documents/AOS_V5/Shaked-WindSage/windsage/artifacts/expo_go_qr.png`.
- Live [https://windsage.nimrod.bio/health](https://windsage.nimrod.bio/health) → `ok: true`, **`webPush: true`** (skipped VAPID item 1).
- Optional local cloud [http://127.0.0.1:8787/health](http://127.0.0.1:8787/health). Hello-world: registered `envsetup`, followed Windguru **2259 Freegull Sea Sports**, check returned **8.73 kt** (below 15 kt / 20 min). Local store `file:///Users/nimrod/Documents/AOS_V5/Shaked-WindSage/windsage/code/cloud/data/store.json` — **not** rsynced to Wald.
- Did not merge [PR #9](https://github.com/goldendreamers/windsage/pull/9). Did not run EAS. Tailscale CLI was stopped; same-Wi-Fi Expo Go is enough.
- **Still needed from Nimrod:** iPhone Expo Go → scan `exp://10.0.0.18:8081` (same Wi-Fi).

### 2026-08-14 — PR #8 merged on GitHub (cloud agent)

Merged https://github.com/goldendreamers/windsage/pull/8 (`594621e`). Web Push subscribe now syncs to Wald; test-push explains missing VAPID; Account/Download call out Safari-on-iPhone. Wald VAPID + `npm run release:web` still pending (item 1 above).

### 2026-08-13 — Wald release of merged PR #7 (Mac + Tailscale)

Pulled `main` (`9b92cbb`), ran `npm run release:web` to Wald. Live https://windsage.nimrod.bio/ health ok; map-pin Identity has no Spot/Station or editable Source ID, read-only location, Open → Google Maps; Alert column stays at threshold after a check. Store not wiped (4 users). Snapshot `file:///Users/goldendreamers/windsage/releases/web/20260813T132018Z`.

### 2026-08-13 — PR #7 merged on GitHub (cloud agent)

Merged https://github.com/goldendreamers/windsage/pull/7 (`gh pr merge 7 --merge` → `b18a492`). Map-pin Identity UI is on `main`. Catch-up commits (Alert threshold, metric-aware home stats, guest-follow leak, Google Maps geo) were already on `main` before this merge.
