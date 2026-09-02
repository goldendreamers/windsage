#!/usr/bin/env bash
# Bootstrap a Windsage *local* device agent on a Samsung Galaxy S22 (Termux).
# Safe to re-run. Never prints secret file contents or private keys.
#
# Cloud agents cannot run this for you — paste it into Termux on the phone.
# Tailscale Android is already on this S22 (same account / tailnet as Wald).
# Do not reinstall Tailscale. This script only sets up Termux + wald-mc SSH + clone.
#
# Usage (on the S22, in Termux):
#   bash scripts/s22-termux-bootstrap.sh
# or, after cloning:
#   bash ~/windsage/scripts/s22-termux-bootstrap.sh

set -euo pipefail

REPO_URL="https://github.com/goldendreamers/windsage.git"
WALD_HOST="100.125.98.56"
WALD_USER="nimrodw"
SSH_PORT=8022

say() { printf '%s\n' "$*"; }
die() { say "ERROR: $*"; exit 1; }

if [[ -z "${PREFIX:-}" || ! -d "${PREFIX:-/nonexistent}" ]]; then
  die "This script is for Termux on the S22. PREFIX is unset — not Termux?"
fi

if ! command -v pkg >/dev/null 2>&1; then
  die "pkg not found. Install Termux from F-Droid (not Play Store)."
fi

say "=== Windsage S22 / Termux local-agent bootstrap ==="
say "home=$HOME prefix=$PREFIX"
uname -a || true

say ""
say "=== 1) packages ==="
pkg update -y
pkg install -y git openssh nodejs python curl rsync termux-tools

export PATH="$HOME/.local/node/bin:$PATH"
if command -v node >/dev/null 2>&1; then
  say "node $(node -v)"
else
  die "node missing after pkg install"
fi

say ""
say "=== 2) SSH identity + wald-mc config ==="
mkdir -p "$HOME/.ssh"
chmod 700 "$HOME/.ssh"
KEY="$HOME/.ssh/id_ed25519"
if [[ ! -f "$KEY" ]]; then
  ssh-keygen -t ed25519 -f "$KEY" -N "" -C "windsage-s22-termux"
  say "generated $KEY (private key not printed)"
else
  say "reuse existing $KEY"
fi
chmod 600 "$KEY" "$KEY.pub"
if [[ ! -f "$HOME/.ssh/config" ]] || ! grep -qE '^Host[[:space:]]+wald-mc$' "$HOME/.ssh/config"; then
  cat >> "$HOME/.ssh/config" <<EOF

Host wald-mc
  HostName $WALD_HOST
  User $WALD_USER
  IdentityFile ~/.ssh/id_ed25519
  IdentitiesOnly yes
EOF
  say "wrote Host wald-mc → $WALD_USER@$WALD_HOST in $HOME/.ssh/config"
else
  say "Host wald-mc already in $HOME/.ssh/config"
fi
chmod 600 "$HOME/.ssh/config"

say ""
say "=== 3) Termux sshd (so Mac/cloud can finish setup) ==="
if ! grep -q '^Port ' "$PREFIX/etc/ssh/sshd_config" 2>/dev/null; then
  printf '\nPort %s\n' "$SSH_PORT" >> "$PREFIX/etc/ssh/sshd_config"
fi
sshd || true
say "sshd listening on port $SSH_PORT (Termux default). User: $(whoami)"

say ""
say "=== 4) clone Windsage ==="
CLONE="$HOME/windsage"
if [[ ! -d "$CLONE/.git" ]]; then
  git clone "$REPO_URL" "$CLONE"
else
  say "clone already at $CLONE"
fi
cd "$CLONE"
git fetch origin main
git checkout main
git pull --ff-only origin main || true

if [[ -f "$CLONE/package-lock.json" ]]; then
  (cd "$CLONE" && npm ci --ignore-scripts) || say "npm ci skipped/failed — run again after Node 22 is confirmed"
fi

say ""
say "=== 5) preflight (expected MISS until .env.smtp + wald-mc key) ==="
if [[ -x "$CLONE/scripts/device-agent-preflight.sh" ]]; then
  bash "$CLONE/scripts/device-agent-preflight.sh" || true
else
  say "preflight script not on this checkout yet"
fi

say ""
say "=== PUBLIC KEY (add this to Wald ~nimrodw/.ssh/authorized_keys) ==="
cat "$KEY.pub"
say "=== end public key ==="

say ""
say "BLOCKED until leftover secrets (Tailscale is already on this S22):"
say "  1. Copy /Users/goldendreamers/windsage/.env.smtp → $CLONE/.env.smtp and chmod 600."
say "  2. Either copy the Mac wald-mc private key to $KEY, or add the public key above on Wald."
say "  3. From the Mac: ssh -p $SSH_PORT $(whoami)@100.124.6.109"
say "  4. Then: ssh wald-mc 'hostname; systemctl is-active windsage'"
say "  5. Cursor CLI worker is unofficial on Android. To *control* agents from the S22:"
say "     Chrome → https://cursor.com/agents → Add to Home screen."
say "remember discord bot alerts"
