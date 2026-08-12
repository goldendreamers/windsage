#!/usr/bin/env bash
# Send a notification email via SMTP or Resend.
# Credentials from env, or optional file: $WINDSAGE_SMTP_ENV / .env.smtp
#
# SMTP:
#   WINDSAGE_SMTP_USER
#   WINDSAGE_SMTP_PASS          # Gmail App Password (16 chars; spaces ok)
#   WINDSAGE_SMTP_HOST          # default smtp.gmail.com
#   WINDSAGE_SMTP_PORT          # default 587
#   WINDSAGE_SMTP_FROM          # default WINDSAGE_SMTP_USER
#   WINDSAGE_SMTP_FROM_NAME     # default Windsage
#
# Resend:
#   RESEND_API_KEY
#   WINDSAGE_EMAIL_FROM         # e.g. Windsage <onboarding@resend.dev>
#
# Usage:
#   scripts/notify-email.sh "subject" "body" [to]
# Default to: shakedwald@gmail.com

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="${WINDSAGE_SMTP_ENV:-$ROOT/.env.smtp}"
if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

SUBJECT="${1:-}"
BODY="${2:-}"
TO="${3:-${WINDSAGE_EMAIL_TO:-shakedwald@gmail.com}}"

if [[ -z "$SUBJECT" || -z "$BODY" ]]; then
  echo "usage: $0 \"subject\" \"body\" [to]" >&2
  exit 2
fi

if [[ -n "${RESEND_API_KEY:-}" ]]; then
  FROM="${WINDSAGE_EMAIL_FROM:-Windsage <onboarding@resend.dev>}"
  # Prefer curl — urllib from some sandboxes hits Cloudflare 1010.
  if command -v curl >/dev/null 2>&1; then
    payload="$(
      FROM="$FROM" TO="$TO" SUBJECT="$SUBJECT" BODY="$BODY" python3 -c \
        'import json,os; print(json.dumps({"from":os.environ["FROM"],"to":[os.environ["TO"]],"subject":os.environ["SUBJECT"],"text":os.environ["BODY"]}))'
    )"
    body="$(curl -sS -w '\n%{http_code}' https://api.resend.com/emails \
      -H "Authorization: Bearer ${RESEND_API_KEY}" \
      -H "Content-Type: application/json" \
      -d "$payload")"
    http="${body##*$'\n'}"
    resp="${body%$'\n'*}"
    if [[ "$http" != 2* ]]; then
      echo "RESEND_FAIL status=$http body=$resp" >&2
      exit 1
    fi
    echo "RESEND_OK status=$http body=$resp"
    echo "SUBJECT=$SUBJECT"
    exit 0
  fi
  FROM="$FROM" TO="$TO" SUBJECT="$SUBJECT" BODY="$BODY" RESEND_API_KEY="$RESEND_API_KEY" \
  python3 - <<'PY'
import json, os, sys, urllib.error, urllib.request

payload = {
    "from": os.environ["FROM"],
    "to": [os.environ["TO"]],
    "subject": os.environ["SUBJECT"],
    "text": os.environ["BODY"],
}
req = urllib.request.Request(
    "https://api.resend.com/emails",
    data=json.dumps(payload).encode(),
    headers={
        "Authorization": f"Bearer {os.environ['RESEND_API_KEY']}",
        "Content-Type": "application/json",
    },
    method="POST",
)
try:
    with urllib.request.urlopen(req, timeout=30) as resp:
        body = resp.read().decode()
        print(f"RESEND_OK status={resp.status} body={body}")
        print(f"SUBJECT={os.environ['SUBJECT']}")
except urllib.error.HTTPError as e:
    print(f"RESEND_FAIL status={e.code} body={e.read().decode()}", file=sys.stderr)
    sys.exit(1)
except Exception as e:
    print(f"RESEND_FAIL {type(e).__name__}: {e}", file=sys.stderr)
    sys.exit(1)
PY
  exit 0
fi

if [[ -n "${WINDSAGE_SMTP_USER:-}" && -n "${WINDSAGE_SMTP_PASS:-}" ]]; then
  WINDSAGE_SMTP_HOST="${WINDSAGE_SMTP_HOST:-smtp.gmail.com}" \
  WINDSAGE_SMTP_PORT="${WINDSAGE_SMTP_PORT:-587}" \
  WINDSAGE_SMTP_USER="$WINDSAGE_SMTP_USER" \
  WINDSAGE_SMTP_PASS="$WINDSAGE_SMTP_PASS" \
  WINDSAGE_SMTP_FROM="${WINDSAGE_SMTP_FROM:-$WINDSAGE_SMTP_USER}" \
  WINDSAGE_SMTP_FROM_NAME="${WINDSAGE_SMTP_FROM_NAME:-Windsage}" \
  WINDSAGE_EMAIL_TO="$TO" \
  WINDSAGE_EMAIL_SUBJECT="$SUBJECT" \
  WINDSAGE_EMAIL_BODY="$BODY" \
  python3 - <<'PY'
import os, smtplib, ssl, sys
from email.message import EmailMessage

host = os.environ["WINDSAGE_SMTP_HOST"]
port = int(os.environ["WINDSAGE_SMTP_PORT"])
user = os.environ["WINDSAGE_SMTP_USER"]
password = os.environ["WINDSAGE_SMTP_PASS"].replace(" ", "")
from_email = os.environ["WINDSAGE_SMTP_FROM"]
from_name = os.environ["WINDSAGE_SMTP_FROM_NAME"]
to_email = os.environ["WINDSAGE_EMAIL_TO"]
subject = os.environ["WINDSAGE_EMAIL_SUBJECT"]
body = os.environ["WINDSAGE_EMAIL_BODY"]

msg = EmailMessage()
msg["Subject"] = subject
msg["From"] = f"{from_name} <{from_email}>"
msg["To"] = to_email
msg.set_content(body)

ctx = ssl.create_default_context()
with smtplib.SMTP(host, port, timeout=30) as smtp:
    smtp.ehlo()
    smtp.starttls(context=ctx)
    smtp.ehlo()
    smtp.login(user, password)
    refused = smtp.send_message(msg)

print(f"SMTP_OK host={host}:{port} from={from_email} to={to_email}")
print(f"SUBJECT={subject}")
if refused:
    print(f"REFUSED={refused!r}", file=sys.stderr)
    sys.exit(1)
PY
  exit 0
fi

echo "BLOCKED: set WINDSAGE_SMTP_USER + WINDSAGE_SMTP_PASS (Gmail App Password)," >&2
echo "         or RESEND_API_KEY (+ optional WINDSAGE_EMAIL_FROM)." >&2
echo "         Optional file: $ENV_FILE" >&2
exit 1
