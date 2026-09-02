#!/usr/bin/env bash
# Write Host wald-mc / wald-mc-v6 into ~/.ssh/config. Never writes private key bytes.
# Identity file must already exist at ~/.ssh/shaked_waldhomeserver_ed25519 (copied from the Mac).
set -euo pipefail

mkdir -p "$HOME/.ssh"
chmod 700 "$HOME/.ssh"
CONFIG="$HOME/.ssh/config"
touch "$CONFIG"
chmod 600 "$CONFIG"

if grep -qE '^Host[[:space:]]+wald-mc$' "$CONFIG"; then
  printf '%s\n' "Host wald-mc already in $CONFIG"
else
  cat >> "$CONFIG" <<'EOF'

Host wald-mc
  HostName 100.125.98.56
  User nimrodw
  IdentityFile ~/.ssh/shaked_waldhomeserver_ed25519
  IdentitiesOnly yes

Host wald-mc-v6
  HostName 2a06:c701:4909:fc00:428d:5cff:fe48:b9fd
  User nimrodw
  IdentityFile ~/.ssh/shaked_waldhomeserver_ed25519
  IdentitiesOnly yes
EOF
  printf '%s\n' "wrote Host wald-mc and wald-mc-v6 into $CONFIG"
fi

KEY="$HOME/.ssh/shaked_waldhomeserver_ed25519"
if [[ -f "$KEY" ]]; then
  chmod 600 "$KEY"
  printf '%s\n' "OK    identity $KEY present (bytes not printed)"
else
  printf '%s\n' "MISS  $KEY — copy from /Users/goldendreamers/.ssh/shaked_waldhomeserver_ed25519"
  exit 1
fi
