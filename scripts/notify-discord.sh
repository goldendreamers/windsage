#!/usr/bin/env bash
# Post an ops update to Discord channel "windsage updates".
# Webhook from env, or optional files: .env.smtp / discord-updates.env /
# discord-cursor.env / .env.discord-cursor.local
#
#   WINDSAGE_DISCORD_UPDATES_WEBHOOK   # Discord incoming webhook URL
#   DISCORD_WEBHOOK_UPDATES            # alias
#   DISCORD_WEBHOOK_URL                # alias
#   WINDSAGE_DISCORD_USERNAME          # default: Windsage agent
#
# Usage:
#   scripts/notify-discord.sh "title" "body"
#
# This is agent ops (#windsage-updates), not user wind-alert DMs.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
for f in \
  "${WINDSAGE_SMTP_ENV:-$ROOT/.env.smtp}" \
  "$ROOT/discord-updates.env" \
  "$ROOT/discord-cursor.env" \
  "$ROOT/.env.discord-cursor.local"
do
  if [[ -f "$f" ]]; then
    set -a
    # shellcheck disable=SC1090
    source "$f"
    set +a
  fi
done

TITLE="${1:-}"
BODY="${2:-}"
WEBHOOK="${WINDSAGE_DISCORD_UPDATES_WEBHOOK-}"
if [[ -z "$WEBHOOK" ]]; then WEBHOOK="${DISCORD_WEBHOOK_UPDATES-}"; fi
if [[ -z "$WEBHOOK" ]]; then WEBHOOK="${DISCORD_WEBHOOK_URL-}"; fi
WEBHOOK="${WEBHOOK//[$'\t\r\n ']}"
USERNAME="${WINDSAGE_DISCORD_USERNAME:-Windsage agent}"

if [[ -z "$TITLE" || -z "$BODY" ]]; then
  echo "usage: $0 \"title\" \"body\"" >&2
  exit 2
fi

if [[ -z "$WEBHOOK" ]]; then
  echo "BLOCKED: set WINDSAGE_DISCORD_UPDATES_WEBHOOK to the Discord incoming webhook" >&2
  echo "         for channel \"windsage updates\"." >&2
  echo "         Optional files: $ROOT/.env.smtp or $ROOT/discord-updates.env" >&2
  echo "         Discord → channel → Edit → Integrations → Webhooks → New Webhook" >&2
  echo "         Copy URL; never commit it." >&2
  exit 1
fi

if [[ ! "$WEBHOOK" =~ ^https://(discord|discordapp)\.com/api/webhooks/ ]]; then
  echo "BLOCKED: WINDSAGE_DISCORD_UPDATES_WEBHOOK is not a discord.com webhook URL." >&2
  exit 1
fi

export TITLE BODY USERNAME WEBHOOK
payload="$(
  python3 -c '
import json, os
title = os.environ["TITLE"].strip()
body = os.environ["BODY"].strip()
content = f"**{title}**\n{body}".strip()
if len(content) > 2000:
    content = content[:1997] + "..."
print(json.dumps({
    "username": os.environ["USERNAME"][:80] or "Windsage agent",
    "content": content,
}))
'
)"

if ! command -v curl >/dev/null 2>&1; then
  echo "BLOCKED: curl is required to post to Discord." >&2
  exit 1
fi

set +e
body="$(curl -sS -w '\n%{http_code}' "$WEBHOOK" \
  -H "Content-Type: application/json" \
  -d "$payload" 2>&1)"
curl_ec=$?
set -e
if [[ "$curl_ec" -ne 0 ]]; then
  echo "DISCORD_FAIL curl_exit=$curl_ec body=$body" >&2
  echo "If this is a Cursor Cloud VM, add discord.com and discordapp.com to the egress allowlist." >&2
  exit 1
fi

http="${body##*$'\n'}"
resp="${body%$'\n'*}"

if [[ "$http" != 2* ]]; then
  echo "DISCORD_FAIL status=$http body=$resp" >&2
  exit 1
fi

echo "DISCORD_OK status=$http"
echo "TITLE=$TITLE"
