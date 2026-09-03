# Simple vs advanced (Windsage)

Standing rule from Nimrod: **not every option belongs in simple mode.** Unless he says otherwise, new UI is advanced-only until you decide it is a **core** action.

## Decision test (every new control)

Ask: **does a first-time wind user need this to get a useful alert?**

| | Simple | Advanced |
| --- | --- | --- |
| Job | Follow a station, pick when, get a ping | Exact numbers, extra sources, extra limits |
| Shape | Few presets, plain words | Steppers, units, providers, custom |
| Default | Yes | Everything else |

Nimrod can override (“put X in simple”). Until then, do not dump new pickers into simple.

## Current simple (core)

- Follow a Windguru station (search + add)
- Nickname
- Ping-me presets: wind 12 / 15 / 20 kt, gusts 25 kt
- Send alerts on/off for a day, a week, or forever
- Alert volume: Annoying / Normal / Quiet (Quiet needs Google)
- Sign in, put on home screen, update when one is waiting
- Privacy
- Remove station

## Current advanced-only (not core)

- Times per day, send-by phone/email/Discord (pick any mix)
- Wake-on-wind: this phone or a Discord voice call
- Custom monitoring hours/days
- Extra alert limits, metric chooser, thresholds, poll interval
- Other providers, map pins, source IDs, spot vs station
- Stars, reorder, share, reset alert memory, Good/Meh
- Support / email the developer, always-on donate bar
- Open on Windguru / location source line on station detail
- Duplicate “Add another station” (header Add is enough)

## When adding UI

1. Default to **advanced**.
2. Only promote to simple if it fails the “can they get an alert without it?” test.
3. Glance at this list and drop near-duplicates.
