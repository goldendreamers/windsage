#!/usr/bin/env bash
# Device-agent preflight. Prints ok / missing only — never dumps secrets.
# Usage: bash scripts/device-agent-preflight.sh

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
export PATH="${HOME}/.local/node/bin:${PATH}"

fail=0
say() { printf '%s\n' "$1"; }
check() {
  local name="$1" status="$2"
  if [[ "$status" == ok ]]; then
    say "OK    $name"
  else
    say "MISS  $name — $status"
    fail=1
  fi
}

if git remote get-url origin 2>/dev/null | grep -q 'github.com[:/]goldendreamers/windsage'; then
  check "git remote goldendreamers/windsage" ok
else
  check "git remote goldendreamers/windsage" "origin is not https://github.com/goldendreamers/windsage"
fi

if command -v node >/dev/null 2>&1; then
  ver="$(node -v | sed 's/^v//')"
  major="${ver%%.*}"
  if [[ "$major" == 22 ]]; then
    check "Node 22 on PATH ($ver)" ok
  else
    check "Node 22 on PATH" "found v$ver (export PATH=\"\$HOME/.local/node/bin:\$PATH\")"
  fi
else
  check "Node 22 on PATH" "node not found"
fi

if [[ -f "$ROOT/.env.smtp" ]]; then
  if [[ -r "$ROOT/.env.smtp" ]]; then
    check ".env.smtp present (gitignored; contents not shown)" ok
  else
    check ".env.smtp readable" "file exists but is not readable"
  fi
else
  check ".env.smtp present" "copy from /Users/goldendreamers/windsage/.env.smtp then chmod 600"
fi

if [[ -f "$ROOT/.env.smtp" ]] && git check-ignore -q .env.smtp 2>/dev/null; then
  check ".env.smtp is gitignored" ok
elif [[ -f "$ROOT/.env.smtp" ]]; then
  check ".env.smtp is gitignored" "WARNING: git may track this file — do not commit"
else
  :
fi

ssh_bin="$(command -v ssh || true)"
if [[ -z "$ssh_bin" ]]; then
  check "ssh wald-mc" "ssh not installed"
else
  if ssh -o BatchMode=yes -o ConnectTimeout=8 wald-mc 'hostname; systemctl is-active windsage' >/tmp/windsage-preflight-ssh.txt 2>/tmp/windsage-preflight-ssh.err; then
    host_line="$(head -n 1 /tmp/windsage-preflight-ssh.txt)"
    check "ssh wald-mc (BatchMode) host=${host_line}" ok
  else
    check "ssh wald-mc (BatchMode)" "failed — Tailscale off, missing key, or host not in ~/.ssh/config"
  fi
fi

if command -v curl >/dev/null 2>&1; then
  if curl -sS -m 12 -o /tmp/windsage-preflight-health.json -w '%{http_code}' https://windsage.nimrod.bio/health | grep -q '^200$'; then
    check "https://windsage.nimrod.bio/health HTTP 200" ok
  else
    check "https://windsage.nimrod.bio/health" "non-200 or timeout"
  fi
else
  check "curl live health" "curl not installed"
fi

say ""
if [[ "$fail" -eq 0 ]]; then
  say "PREFLIGHT_OK — device agent bootstrap looks green."
  say "remember discord bot alerts"
  exit 0
fi

say "PREFLIGHT_BLOCKED — stop and tell Nimrod (ACTION NEEDED). Do not invent passwords or keys."
say "Copy steps: file://${ROOT}/docs/DEVICE_AGENT_CONTEXT.md"
say "remember discord bot alerts"
exit 1
