# Mac Cursor agent — paste-ready prompts

**Running handoff file.** When you open Cursor on the Mac (`/Users/goldendreamers/windsage`), paste the **next pending** prompt below into a new agent chat.

Cloud agents often cannot Tailscale/SSH to Wald or send `notify-email.sh` mail. Anything that needs a live deploy or Mac-local secrets lands here.

**How to maintain:** after a Mac run finishes (or a new cloud task leaves Mac work), edit this file — move the prompt under **Done**, add any new pending prompts at the top of **Pending**.

---

## Pending (newest first)

### 1) Merge map-pin edit fix + Wald release

**Why:** PR https://github.com/goldendreamers/windsage/pull/7 hides Spot/Station + Source ID when editing map pins; cards/subtitles stop saying `Station #…` for MAP. Live https://windsage.nimrod.bio/ still needs `npm run release:web` from Mac.

**Paste this entire block:**

```
You are on the Mac at /Users/goldendreamers/windsage with Tailscale to Wald.

1. Read docs/MAC_AGENT_PROMPTS.md (this handoff) and CLOUD_AGENT_CONTEXT.md.
2. Merge the open PR for map-pin edit identity:
   - PR: https://github.com/goldendreamers/windsage/pull/7
   - Branch: cursor/map-pin-edit-identity-2055
   Prefer: gh pr merge 7 --merge (or merge via GitHub UI), then:
     export PATH="$HOME/.local/node/bin:$PATH"
     cd /Users/goldendreamers/windsage
     git checkout main && git pull --ff-only
3. Deploy:
     npm run release:web
4. Verify:
     - https://windsage.nimrod.bio/health
     - Hard-refresh the PWA
     - Open a Map/Address follow → Identity must NOT show Spot/Station or editable Source ID; show read-only location; Open goes to Google Maps
5. Email via scripts/notify-email.sh:
     - Subject: Windsage · done: Map-pin edit identity live on Wald
6. Update docs/MAC_AGENT_PROMPTS.md: move this prompt to Done with today’s date; leave any still-pending prompts.
```

### 2) Catch-up release if live is still behind main (pre-PR work)

**Why:** Earlier fixes may already be on `main` but not on Wald if release was skipped: Alert stays threshold (not live reading), metric-aware home stats, guest-follow leak on login, Google Maps geo resolve for map search.

**Paste only if https://windsage.nimrod.bio/ still looks old after checking `git log -1` on Mac vs live behavior:**

```
You are on the Mac at /Users/goldendreamers/windsage with Tailscale to Wald.

export PATH="$HOME/.local/node/bin:$PATH"
cd /Users/goldendreamers/windsage
git checkout main && git pull --ff-only
git log -5 --oneline
npm run release:web

Hard-refresh https://windsage.nimrod.bio/
Confirm: Alert column stays threshold after check; map search resolves via Google; editing a map pin has no Spot/Station (if PR #7 already merged).
Email: Windsage · done: Wald catch-up release
Update docs/MAC_AGENT_PROMPTS.md (mark this Done).
```

---

## Done

_(none yet — Mac agent moves items here)_

<!-- Example:
### 2026-08-13 — Map-pin edit + release
Merged PR #7, `npm run release:web`, verified Identity UI on map pin.
-->
