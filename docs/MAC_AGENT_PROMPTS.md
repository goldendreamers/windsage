# Mac Cursor agent — paste-ready prompts

**Running handoff file.** When you open Cursor on the Mac (`/Users/goldendreamers/windsage`), paste the **Pending** prompt into a new **local** agent chat (not a cloud agent).

Cloud agents cannot Tailscale/SSH to Wald or send `notify-email.sh` mail. Deploy and Mac-local secrets land here.

**How to maintain:** after a Mac run finishes, move the prompt under **Done**. When a new cloud task leaves Mac work, replace **Pending** with one new prompt (do not stack stale deploy recipes).

---

## Pending

### 2026-08-28 — Wald-deploy PR #9 + copy cleanup

Paste everything inside the fence:

```
You are a local Mac Cursor agent for Windsage.
Repo: /Users/goldendreamers/windsage
Operator: Nimrod
Live: https://windsage.nimrod.bio/
PR: https://github.com/goldendreamers/windsage/pull/9
Branch: cursor/cloud-agent-1787128827188-i9kiy

Do not merge to main. Never wipe /data/windsage/data/store.json.

## 1. Pull the branch

export PATH="$HOME/.local/node/bin:$PATH"
cd /Users/goldendreamers/windsage
git fetch origin
git checkout cursor/cloud-agent-1787128827188-i9kiy
git pull origin cursor/cloud-agent-1787128827188-i9kiy
git log -1 --oneline

## 2. Finish two copy/UI items if they are still on live or in this tree

A. Account → Phone alerts: there must be NO “Send test phone alert” button.
   Cloud branch already removed it. If your local tree still has it, delete the button
   (keep the install/battery hints). Commit on this same branch.

B. “Donate * support trans” (or similar) — that wording is too sharp for the app.
   Search the repo AND the live PWA (Menu, Account, footer, privacy, install).
   Replace with a short, calm line, for example:
     Donate — keeps Windsage running
   or just:
     Support Windsage
   Keep any existing donate URL. Do not add a lecture. Commit on this same branch.

## 3. Deploy to Wald

npm run release:web

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

Never wipe /data/windsage/data/store.json. Do not use clearStations.

## 4. Hard-refresh the PWA

Delete the home-screen app or hard-refresh https://windsage.nimrod.bio/ so the old service worker does not keep previous JS.

## 5. Verify on live

- Follow: type haifa / Parkstone — more than 12 hits, Add works.
- Simple mode: quieter UI; Live From pill uses words (south-west).
- Advanced mode: Live From pill uses degrees (247°).
- Map pin (advanced): Blend members are the closest accurate sensors + “pin model”.
- Account: no Send test phone alert button.
- Donate/support line reads as a normal product donate, not “support trans”.

## 6. Email

/Users/goldendreamers/windsage/scripts/notify-email.sh
Done:    Windsage · done: Wald release of PR #9
Blocked: Windsage · ACTION NEEDED: …  (Tailscale, SSH, SMTP, CAPTCHA)
```

---

## Done

*(cleared 2026-08-28 — start a new Done entry after this Mac run)*
