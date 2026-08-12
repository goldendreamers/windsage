# Windsage — progress review (external research pass)

> **What this is:** an outside read of the app — code + architecture — done by Nimrod's Claude
> session at his request, as research/advice, not a change to anything in this repo besides this
> file. Take what's useful, ignore the rest — it's your project.
> A nicer-formatted version of the same content exists as a private Claude artifact; ask Nimrod
> if you want that link too. This file is the one that doesn't need anyone to click "Share."

**Date:** 2026-08-12 · **Reviewed:** commit `0a18a73` (6 commits, `7e73bc5` → `0a18a73`, first
commit 13:18, latest 17:50+ the same day) · **Scope:** full read of the cloud backend
(`code/cloud/`), the app core/screens (`code/app`, `code/core`, `code/screens`), the data model
(`code/shared/types.ts`), and this project's own docs (`README.md`, `docs/OUTSTANDING.md`,
`docs/SSO-SETUP.md`).

**Frame, up front:** this is evaluated as what it is — a free, non-commercial tool for a small
kitesurfing friend group, not a startup. "Risk" below means "risk to the tool staying useful and
trustworthy for that group," not "risk to a business."

---

## TL;DR

For roughly one day's work, this is a genuinely complete, thoughtfully-engineered product —
not a prototype. The core idea (poll from the cloud, alert the phone, let the phone stay idle)
is the right architecture, and it's implemented carefully. The one thing worth fixing **this
week** is that the entire user base lives in a single JSON file with zero backup. The one
structural risk worth knowing about **going forward** is that the whole product sits on top of
an undocumented Windguru API that could change without notice. Neither is urgent in the sense of
"broken today" — both are the kind of thing you want to have already fixed before the day they
matter.

---

## Strengths

1. **Scope shipped vs. time spent is unusual.** In one day: cross-platform app (iOS/Android/web
   via Expo), full auth (guest + username/password + Google OAuth scaffolding), a cloud backend
   that polls on a schedule, dual-channel push (native Expo push *and* Web Push for the installed
   PWA — most solo hobby projects ship one and call it done), a public HTTPS domain via Cloudflare
   Tunnel with a Tailscale fallback, and a PWA install flow with platform-specific instructions.
   That's not "a script," that's a small product.

2. **Password security is genuinely solid.** `scrypt` (N=16384, memory-hard KDF — a real,
   modern choice, not MD5/SHA1/plain), random salt per user, `crypto.timingSafeEqual` for
   comparison. This is better practice than plenty of production apps manage.

3. **The core architectural bet is correct and explicitly stated.** From the README: *"Local
   background Windguru polling is off. The phone no longer wakes every 10 minutes."* Polling
   happens server-side; the phone only receives a push. That's the right call for battery life
   and reliability, and it's a deliberate design decision, not an accident.

4. **The alerting logic handles real failure modes, not just the happy path.** Sustained-duration
   is computed from actual historical samples (not just "was it true on the last poll"); if a
   push fails to deliver to *any* device, `notifiedForRun` is rolled back so the next poll retries
   instead of silently giving up (`server.mjs:284-297`); spots with no native live sensor
   transparently fall back to the nearest live station for alerting while still showing the
   spot's own forecast for context. This is careful domain logic, not a first draft.

5. **Documentation discipline that most solo projects skip.** `README.md`, a living
   `docs/OUTSTANDING.md` ("what's still needed from the user, what's done, what's blocked"),
   a step-by-step `docs/SSO-SETUP.md`, and an `docs/AGENTS.md` that tells any AI coding on the
   repo to check current Expo docs rather than trust stale training data. This is unusually mature
   practice for a first solo project — it's the difference between "vibe coding" and building
   something a second person (or a future you) can actually pick up.

6. **Deployment is clean and reversible.** Store writes are atomic (write to `.tmp`, then
   rename — survives a crash mid-write); static file serving has a path-traversal guard; web
   releases are versioned with automatic pruning (newest 3, plus anything aged 1–7 days); secrets
   are correctly kept out of git (`oauth.env` vs. the committed `oauth.env.example`).

7. **Deliberately minimal dependencies on the backend.** Zero npm packages except `web-push`
   (added cleanly, isolated to its own `code/cloud/package.json`, with a graceful "not installed
   yet" fallback). For a solo maintainer, fewer dependencies means less supply-chain exposure and
   a ~700-line file one person can actually hold in their head.

---

## Weaknesses / gaps

Ranked by how much it would hurt if it bit, not by how many there are.

| # | Gap | Why it matters | Effort to fix |
|---|-----|-----------------|----------------|
| 1 | **No backup of `data/store.json`** — the entire user base (accounts, hashed passwords, sessions, followed stations) lives in one file, no cron, no snapshot | One bad edit, disk fault, or bug wipes every user, unrecoverably. Highest "you'll wish you had" ratio on this list. | ~15 min — same pattern already running for Minecraft on the same server (daily cron → tar.gz, 14-day retention) |
| 2 | **No rate-limiting on login/register** | A scripted password-guessing run against the public endpoint goes unnoticed. Low real-world odds at friend-group scale, but a known, easy-to-close door. | Small — a crude per-IP counter is enough at this scale |
| 3 | **No automated tests / CI** | There *are* manual check scripts (`check-alerts.ts`, `check-auth.mjs`, `check-spot-station.mjs`, `verify-mobile-push.mjs`) — good instinct — but nothing runs them on push. Fine for a fast-moving solo stage; worth naming as the next engineering-maturity step. | Medium — wire the existing scripts into a GitHub Action |
| 4 | **Single-JSON-file store has a concurrency ceiling** | Each request loads the *whole* store, mutates it, writes it back. Two simultaneous writes from different users can race — the later write can silently drop fields the earlier one set (classic read-modify-write). Not a problem at "a few friends," becomes one if this ever grows. | Not urgent — worth knowing about, not worth fixing pre-emptively |
| 5 | **OAuth `state` is opaque but unsigned** | Deviates from OAuth2 best practice (state should be a verifiable anti-CSRF nonce). In practice the values it carries (device secret, link token) are already high-entropy, so real exploitability is low — but it's not "by the book," and worth understanding *why* before reusing the pattern elsewhere. | Small |
| 6 | **CORS is wildcarded on every response** | `Access-Control-Allow-Origin: *`. This is actually *fine* here specifically because auth is Bearer-token (not cookie) based — a malicious site can't silently ride a victim's token the way it could ride a cookie. Flagging so it's a deliberate, understood choice rather than a habit that gets carried into a future cookie-based project where it wouldn't be safe. | N/A — no fix needed, just worth understanding |
| 7 | **Product-shape gaps, not bugs:** one forecast source only (whatever model Windguru's own spot page picks — no comparing GFS vs. ECMWF), no trend/history view beyond "live number + countdown," no map-based spot discovery (everything is paste-a-Windguru-ID/URL) | Not wrong, just the next layer of "convenient." See recommendations below. | — |

---

## The main risk

**Windsage has zero control over its only data source.** Every reading, forecast, and spot
lookup goes through Windguru's *undocumented* internal API
(`windguru.cz/int/iapi.php`) using a spoofed `Referer` header — not a published, versioned,
committed-to API. If Windguru changes the response shape, tightens bot/Referer detection, or
starts rate-limiting by IP, the entire product stops working overnight, for everyone, with no
fallback and no warning — and there's no fix available that doesn't involve either Windguru
changing something back or finding a different data source entirely.

This is worth naming as *the* main risk (rather than the backup gap above) because it's the one
item on this whole list that is (a) capable of killing the product outright and (b) completely
outside your control to prevent. Everything else here is a "fix it and it's fixed" item; this one
isn't. The practical mitigation isn't code — it's just going in with eyes open: this is a
convenience layer built *on top of* Windguru, not a replacement for it, and it inherits
Windguru's goodwill as a dependency.

Second-order infrastructure note, specific to *this* deployment rather than the product in
general: everything (data, API, poll loop, web UI) runs as one process on one home server behind
one home internet connection, which — independent of this project — has a documented history of
WAN hiccups (IPv6-only stretches, ISP cutovers). Worth knowing the blast radius: when the home
connection or the server is down, the whole app is down for every user, not gracefully degraded.

---

## Recommended next steps

Grouped by what they buy, since "what's next" depends on what you're optimizing for.

### Do soon (cheap, protects what already exists)
- **Back up `data/store.json`.** Copy the Minecraft cron pattern verbatim (daily snapshot,
  ~14-day retention). This is the single highest-value 15 minutes available on this list.
- **Wire Google OAuth** — the one item already sitting in `docs/OUTSTANDING.md` waiting on
  Nimrod. Not urgent (password auth works fine today) but it's a short, already-documented task
  (`docs/SSO-SETUP.md` has the exact steps).
- **Basic login rate-limiting.** A few lines, closes the one real "someone messes with the group"
  door.

### The actual value proposition — lean into "don't make me check 5 tabs"
This is where the app should differentiate, based on both the code review and a quick market
check (see Competitive landscape below): most of the big forecast names are *look-it-up* tools,
not *alert-me* tools, and that gap is real, not imagined.

- **A single "how's it looking right now" glance across all followed spots**, with a trend
  arrow (rising/falling), not just a per-spot detail screen. Right now each station is checked
  one at a time; the actual pitch ("more convenient than checking forecast in several places")
  is best delivered as one screen that answers "which of my 3 spots is closest to going off"
  at a glance.
- **A lightweight "who's out there" layer** — let followers of the same spot optionally see that
  a friend already checked in as riding. This is the one feature that would make Windsage feel
  like a *community* tool rather than "a personal Windguru wrapper," and it's the one piece of
  iKitesurf's playbook (see below) that fits a small friend group without needing any of
  iKitesurf's paid infrastructure.
- **Map-based spot discovery** instead of paste-a-Windguru-ID. Lowers the bar for a new friend to
  add a spot without already knowing Windguru's internals.
- **A simple "was the alert actually right?" log** — let someone mark a past alert as
  good/meh after the fact. That feedback loop is what turns "an app that pings me" into "an app I
  trust the threshold on," and it's cheap to build (the data — `alertStates`/`snapshots` — is
  already there).

### Later, only once it matters
- **Detect and surface "Windguru unreachable"** in the UI rather than silently going quiet, so
  the single-point-of-failure risk above is at least *visible* to users instead of invisible.
- **Move off one JSON file** only once concurrent users are actually a real number — SQLite is
  the natural, still-zero-ops next step; no need to jump straight to Postgres for this scale.
- **Automated checks on push** — wire the existing manual scripts into a GitHub Action once
  changes start coming from more than one person.

---

## Competitive landscape — what similar tools do differently

Framed for what it's actually useful for here: not "how do we beat Windy," but "what should we
borrow, and what should we deliberately *not* chase."

- **Windguru itself** (the data source) gates *live alerts* behind a **paid Premium tier**, and
  even then the alerts are passive — they don't punch through Do Not Disturb. Windsage already
  does, for free, for a friend group, something the source data provider itself charges for.
  That's a genuinely strong starting position, not a gap to close.
- **Windguru, Windfinder, and PredictWind have no live-station alarm at all** — they're
  look-it-up tools; you have to remember to go check them. A recent market scan of wind apps
  explicitly frames this as the core gap: *"forecasting and alerting are two different jobs,"*
  and almost nobody does the second one. Windsage's entire premise sits exactly in that gap.
- **Windy** — the best-known general wind map, animated flow visualization, multiple
  side-by-side weather models (GFS/ECMWF/ICON), huge global coverage. General-purpose, not
  kite-specific, and (like the above) not built around *your* personal threshold — it's a map you
  go look at, not a thing that comes and gets you.
- **PredictWind** — strong marine/offshore forecasting with its own proprietary models, popular
  with sailors, positioned and priced for that audience rather than casual kite/wind-sport alerts.
- **iKitesurf** (Surfline) is the closest existing analog in *spirit* — spot cams, "who's riding
  now" community check-ins, forecaster commentary — and does offer free customizable wind alerts.
  It's a funded, ad/subscription-backed product with real infrastructure behind it (cams, staff
  forecasters). Windsage can't and shouldn't try to match the cams or paid forecasters, but the
  "who's out there right now" social layer is the one idea from its playbook worth borrowing —
  see recommendations above.
- **WindUp** — a newer, smaller entrant explicitly marketing itself as a free "Windy alternative"
  built around alarm-driven alerts with no subscription. Worth a look for feature ideas (same
  insight you landed on independently), not a threat — nobody here is selling anything.

**The takeaway:** every established name in this space is built to be *looked at*. Windsage's
actual differentiator — worth protecting rather than diluting — is that it's built to be looked
at zero times until it decides to interrupt you. That's already true today. The recommendation
above (single glance view, "who's out there," alert-quality feedback) is about deepening that
lane, not chasing Windy's map or Windguru's model table.

Sources:
- [Best Windy Alternative 2026: 5 Free Apps Tested — WindUp](https://www.windup.live/blog/best-windy-alternative/)
- [The Best Wind App for Kitesurfing in 2026 (Honest Comparison) — WindUp](https://www.windup.live/blog/best-wind-app-for-kitesurfing/)
- [Our Favorite Wind Forecasting Apps For Kiteboarding — Kite Arcade](https://www.kitearcade.com/blogs/kiteboarding-reviews/our-favorite-wind-forecasting-apps)
- [iKitesurf: Weather & Waves — Google Play](https://play.google.com/store/apps/details?id=com.windalert.android.ikitesurf&hl=en_US)
- [Windguru — Help](https://www.windguru.cz/help.php)
- [Windfinder](https://www.windfinder.com/)

---

## What this review did *not* do

- Did not test-run the app (no device/simulator pass) — this is a static code read, not a QA
  pass. UX judgments above are from reading the screen code, not from using it.
- Did not look at `public/sw.js` (service worker) or the individual small presentational
  components (`MetricPill`, `StatusPanel`, `Section`, `BrandHero`, `BootScreen`,
  `AddStationModal`) in detail — inferred their behavior from how screens use them.
- Competitive research is one search pass, not exhaustive — treat it as directionally right,
  not a market report.
