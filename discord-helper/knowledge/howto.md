# Windsage — public how it works (helper pack)

This is the only “how it works” text the Discord helper may use. It is for members, not operators.

Live app: https://windsage.nimrod.bio/
Open source: https://github.com/goldendreamers/windsage
Privacy: https://windsage.nimrod.bio/privacy.html

## What it is

Windsage is a small wind-alert app for friends who chase wind. You follow a station (or a place). The cloud checks the wind about every 10 minutes. If your rule holds for the full hold time (default: 15 knots average for 20 minutes), your phone or browser gets a ping. One gust is not enough; if the wind drops mid-hold, the hold resets.

The phone does not poll Windguru in the background, so it can stay idle. Home’s “Right now” glance is the last cloud check, not a live cup on the device.

It is free to use. The code is open source.

## Install

Open https://windsage.nimrod.bio/ in the browser. That is the app.

iPhone: Safari (not Chrome) → Share → Add to Home Screen. Open from that icon and allow notifications. That is how lock-screen pings work best.

Android: Chrome → menu → Add to Home screen / Install app. Notifications on. There is also Download in the app menu.

A computer browser works too. Allow site notifications if you want pings there. Guest lists do not sync between phone and computer — sign in for that.

If an old Home Screen icon looks stuck, delete it and add it again.

## Follow a station

In the app, add a station. You can use a Windguru number or URL (2259 is Freegull), an NDBC buoy, Open-Meteo, Synoptic/ICAO if the cloud token is on, or a map pin / address (blend of nearby stations, not one physical mast).

Guest mode can follow on this device. Sign in with Google, Discord, or username & password if you want the same list on another phone or computer.

To stop: open the station and unfollow. Share from the station screen so someone else can follow the same target in Windsage. Star / reorder on Home is only list order, not a second rule.

## Rules and pings

Default rule: average wind 15 knots or more for 20 minutes. Cloud check: about every 10 minutes (never under 1 minute).

Simple notify presets: 12, 15, 18, or 20 knots average, or gusts 25 knots or more. Custom rule on the station (turn simple mode off if needed): hold time, gusts, direction window 0–360°, waves, max wind, temperature where the source has them.

Units: wind in knots, waves in meters, temperature in °C.

When the hold-time rule is met, a push goes out. Home also has a Right now glance. If a ping fired, signed-in users can mark it Good or Meh — feedback, not a new alert rule.

If pings fail: app on the Home Screen, notifications allowed (Account can send a test), you still follow the station, and the rule actually met for the full time. Guest and signed-in lists can differ by device. Then ask a human mod.

## Live wind in this Discord

/ruach plus a club spot (Freegull / פריגול, Herzliya / הרצליה, Haifa / חיפה, …) and /laan (where to go) read https://windsage.nimrod.bio/v1 — the same data as the app, not an AI. Pings still come from follows in the app.

How-to is /ask or @Windsage Helper in #questions only.

## Sign-in vs this Discord

Account → Continue with Google or Continue with Discord is website login for the app. Username & password works too (min 8 characters).

Join Discord is a human invite into this server. It is not this helper bot and it is not app login.

This helper answers /ask in #questions. It cannot change the app, see your password, or ban people. Mods use /mod in #moderator-only.

## Privacy

Guest works with no account. Sign-in only syncs your follow list and lets you use the same account on another device. Precise GPS is not required. No ad trackers. Do not paste passwords or tokens here. Policy: https://windsage.nimrod.bio/privacy.html

## What this helper will not talk about

Server names, SSH, login secrets, API keys, how to restart anything, or how to get Discord Administrator.
If the answer is not in this file or the FAQ, the helper says it does not know and you should ask a human mod.
