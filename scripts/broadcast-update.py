#!/usr/bin/env python3
"""Publish a Windsage product update to all known users.

1. Write /v1/announcement into Wald store.json (in-app banner)
2. Email every known SSO address (+ optional extras)
3. Expo-push every registered push token (often zero on web-only installs)

Usage:
  python3 scripts/broadcast-update.py \\
    --id 20260812-1.0.2 \\
    --title "Windsage 1.0.2" \\
    --body "…" \\
    --url https://windsage.nimrod.bio/download
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
NOTIFY = ROOT / "scripts" / "notify-email.sh"
REMOTE = "wald-mc"
STORE = "/data/windsage/data/store.json"
PUBLIC = "https://windsage.nimrod.bio"


def ssh(cmd: str) -> str:
    return subprocess.check_output(["ssh", REMOTE, cmd], text=True)


def set_announcement(ann: dict) -> None:
    payload = json.dumps(ann)
    script = f"""
import json
from pathlib import Path
p = Path({STORE!r})
store = json.loads(p.read_text())
store["announcement"] = json.loads({payload!r})
p.write_text(json.dumps(store, indent=2) + "\\n")
print(store["announcement"]["id"])
"""
    out = ssh(f"python3 - <<'PY'\n{script}\nPY")
    print(f"announcement set: {out.strip()}")


def collect_contacts() -> tuple[list[str], list[str]]:
    raw = ssh(
        "python3 - <<'PY'\n"
        "import json\n"
        "from pathlib import Path\n"
        f"store=json.loads(Path({STORE!r}).read_text())\n"
        "emails=set(); tokens=set()\n"
        "for u in (store.get('users') or {}).values():\n"
        "  sso=(u.get('sso') or {})\n"
        "  for prov in sso.values() if isinstance(sso, dict) else []:\n"
        "    if isinstance(prov, dict) and prov.get('email'): emails.add(prov['email'].strip().lower())\n"
        "  for t in (u.get('pushTokens') or []):\n"
        "    if t: tokens.add(t)\n"
        "  if u.get('pushToken'): tokens.add(u['pushToken'])\n"
        "for d in (store.get('devices') or {}).values():\n"
        "  for t in (d.get('pushTokens') or []):\n"
        "    if t: tokens.add(t)\n"
        "  if d.get('pushToken'): tokens.add(d['pushToken'])\n"
        "print(json.dumps({'emails': sorted(emails), 'tokens': sorted(tokens)}))\n"
        "PY"
    )
    data = json.loads(raw.strip().splitlines()[-1])
    return list(data.get("emails") or []), list(data.get("tokens") or [])


def send_email(to: str, subject: str, body: str) -> bool:
    try:
        subprocess.run([str(NOTIFY), subject, body, to], cwd=ROOT, check=True)
        return True
    except subprocess.CalledProcessError as exc:
        print(f"email FAILED → {to}: {exc}", file=sys.stderr)
        return False


def send_expo_pushes(tokens: list[str], title: str, body: str, data: dict) -> dict:
    if not tokens:
        return {"ok": True, "skipped": True, "count": 0}
    messages = [
        {
            "to": t,
            "title": title,
            "body": body,
            "data": data,
            "sound": "default",
            "priority": "high",
            "channelId": "windsage-alerts",
        }
        for t in tokens
    ]
    req = urllib.request.Request(
        "https://exp.host/--/api/v2/push/send",
        data=json.dumps(messages).encode("utf-8"),
        headers={
            "Accept": "application/json",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        payload = json.loads(resp.read().decode("utf-8"))
    return {"ok": True, "count": len(tokens), "payload": payload}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--id", required=True, help="Stable announcement id (dismiss key)")
    parser.add_argument("--title", required=True)
    parser.add_argument("--body", required=True)
    parser.add_argument("--url", default=f"{PUBLIC}/download")
    parser.add_argument("--version", default="")
    parser.add_argument(
        "--extra-email",
        action="append",
        default=[],
        help="Additional recipient (repeatable)",
    )
    parser.add_argument(
        "--skip-email",
        action="store_true",
        help="Only set in-app announcement + push",
    )
    args = parser.parse_args()

    ann = {
        "id": args.id,
        "version": args.version or None,
        "title": args.title,
        "body": args.body,
        "url": args.url,
        "createdAt": datetime.now(timezone.utc).isoformat(),
    }
    set_announcement(ann)

    emails, tokens = collect_contacts()
    for extra in args.extra_email:
        e = extra.strip().lower()
        if e and e not in emails:
            emails.append(e)

    print(f"contacts: {len(emails)} email(s), {len(tokens)} push token(s)")

    if not args.skip_email:
        subject = f"Windsage · update: {args.title}"
        mail_body = (
            f"{args.body}\n\n"
            f"Open the app: {PUBLIC}/\n"
            f"Download / install: {args.url}\n"
            f"Offline web zip: {PUBLIC}/windsage-web.zip\n"
        )
        for to in emails:
            print(f"email → {to}")
            send_email(to, subject, mail_body)

    push = send_expo_pushes(
        tokens,
        args.title,
        args.body,
        {"announcementId": args.id, "url": args.url},
    )
    print("push:", json.dumps({k: push[k] for k in push if k != "payload"}))
    return 0


if __name__ == "__main__":
    sys.exit(main())
