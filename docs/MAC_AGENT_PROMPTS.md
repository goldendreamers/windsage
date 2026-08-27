# Mac Cursor agent — paste-ready prompts

**Running handoff file.** When you open Cursor on the Mac (`/Users/goldendreamers/windsage`), paste the **next pending** prompt below into a new **local** agent chat (not a cloud agent).

Cloud agents often cannot Tailscale/SSH to Wald or send `notify-email.sh` mail. Anything that needs a live deploy or Mac-local secrets lands here.

**How to maintain:** after a Mac run finishes (or a new cloud task leaves Mac work), edit this file — move the prompt under **Done**, add any new pending prompts at the top of **Pending**.

---

## Pending (newest first)

### 2026-08-27 — URGENT: Wald-deploy PR #9 (full branch tip `59a8ced`)

Paste the fenced prompt below into a **local Mac** Cursor agent (not a cloud agent). Live https://windsage.nimrod.bio/ is still the old Wald build. Cloud agents cannot Tailscale/SSH to Wald.

```
You are a local Mac Cursor agent for Windsage. Repo: /Users/goldendreamers/windsage
Operator: Nimrod. Live: https://windsage.nimrod.bio/

Deploy PR #9 branch tip to Wald. Do not merge to main. Do not wipe /data/windsage/data/store.json.

Branch: cursor/cloud-agent-1787128827188-i9kiy
Expect HEAD: 59a8ced  (Show exact wind degrees in advanced mode, compass words in simple.)
PR: https://github.com/goldendreamers/windsage/pull/9

What this deploy ships (all still missing on live):
1. Follow search: full Windguru live directory (~6900), tap Add / Open, More when >12 hits.
2. Stop dropping follows when a shorter list syncs; restore from bak if the store is still short.
3. Install downloads the app instead of how-to steps.
4. Simple mode is quieter (no tiny captions / helper noise).
5. Wind direction: SIMPLE = compass words (south-west). ADVANCED = exact degrees (247°).
6. Map-pin blend: keep the closest accurate live sensors only (not one of every network). Weights use distance, coast vs inland, elevation, wind-axis. Always include a low-weight Open-Meteo pin model for waves. Live sensors beat the model.

Steps:
export PATH="$HOME/.local/node/bin:$PATH"
cd /Users/goldendreamers/windsage
git fetch origin
git checkout cursor/cloud-agent-1787128827188-i9kiy
git pull origin cursor/cloud-agent-1787128827188-i9kiy
git log -1 --oneline
# must show 59a8ced (or newer on this same branch)

npm run release:web
# this exports dist/, snapshots releases/web/, rsyncs code/cloud + web to Wald, restarts windsage

node scripts/build-windguru-station-names.mjs --out public

curl -sS "https://windsage.nimrod.bio/health"
curl -sS "https://windsage.nimrod.bio/v1/catalog/stations?q=haifa&limit=40" | python3 -c "import sys,json; d=json.load(sys.stdin); print('hits',len(d.get('stations')or[]),'total',d.get('total'),'catalog',d.get('catalogSize'))"
# Expect catalog around 6900 and total > 12 for haifa.

ssh wald-mc 'python3 -c "import json;d=json.load(open(\"/data/windsage/data/store.json\"));
print(\"users\",len(d.get(\"users\")or{}), \"follows\", sum(len(u.get(\"stations\")or[]) for u in (d.get(\"users\")or{}).values()))"'
# If follows are still short vs before the drop:
ssh wald-mc 'ls -lt /data/backups/windsage | head'
ssh wald-mc 'node /data/windsage/restore-stations.mjs --live /data/windsage/data --from /data/backups/windsage/STOREFILE.json.gz'
# Then: sudo systemctl restart windsage

Never wipe /data/windsage/data/store.json. Saves that would empty users are refused; do not use clearStations.

After deploy, hard-refresh the phone PWA (or delete the home-screen app and open https://windsage.nimrod.bio/ again) so the old service worker does not keep previous JS.

Verify on live:
- Follow: type haifa / Parkstone — more than 12 hits, Add works.
- Simple mode: quieter UI; Live From pill says south-west (words).
- Advanced mode: Live From pill says 247° (degrees, not words).
- Map pin (advanced): Blend members are the closest accurate sensors + “pin model”, not one of every network.

Email via /Users/goldendreamers/windsage/scripts/notify-email.sh when live shows the new UI.
Subject: Windsage · done: Wald release of PR #9
If blocked (Tailscale, SSH, SMTP, CAPTCHA): subject Windsage · ACTION NEEDED: …
```

---

## Done

### 2026-08-13 — Wald release of merged PR #7 (Mac + Tailscale)

Pulled `main` (`9b92cbb`), ran `npm run release:web` to Wald. Live https://windsage.nimrod.bio/ health ok; map-pin Identity has no Spot/Station or editable Source ID, read-only location, Open → Google Maps; Alert column stays at threshold after a check. Store not wiped (4 users). Snapshot `file:///Users/goldendreamers/windsage/releases/web/20260813T132018Z`.

### 2026-08-13 — PR #7 merged on GitHub (cloud agent)

Merged https://github.com/goldendreamers/windsage/pull/7 (`gh pr merge 7 --merge` → `b18a492`). Map-pin Identity UI is on `main`. Catch-up commits (Alert threshold, metric-aware home stats, guest-follow leak, Google Maps geo) were already on `main` before this merge.
