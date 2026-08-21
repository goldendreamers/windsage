#!/usr/bin/env bash
# Copy discord-helper onto Wald and install windsage-helper.service.
# Does not start the unit until helper.env has a non-empty DISCORD_TOKEN.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/discord-helper"
HOST="${WALD_HOST:-wald-mc}"
DEST="/usr/local/windsage-helper"

[[ -d "$SRC/src" ]] || { echo "missing $SRC" >&2; exit 1; }
ssh "$HOST" "sudo -n true" >/dev/null

ssh "$HOST" "sudo mkdir -p '$DEST' && sudo rm -rf /tmp/windsage-helper-src && mkdir -p /tmp/windsage-helper-src"
rsync -az --delete \
  --exclude helper.env \
  --exclude node_modules \
  --exclude .DS_Store \
  "$SRC/" "$HOST:/tmp/windsage-helper-src/"

ssh "$HOST" "sudo bash -s" <<'REMOTE'
set -euo pipefail
DEST=/usr/local/windsage-helper
if ! id windsagehelper >/dev/null 2>&1; then
  useradd --system --home "$DEST" --shell /usr/sbin/nologin windsagehelper
fi
rsync -a --delete --exclude helper.env /tmp/windsage-helper-src/ "$DEST/"
if [[ ! -f $DEST/helper.env ]]; then
  cp "$DEST/helper.env.example" "$DEST/helper.env"
fi
chmod 600 "$DEST/helper.env"
chown -R windsagehelper:windsagehelper "$DEST"
sudo -u windsagehelper env HOME="$DEST" /usr/bin/npm install --omit=dev --no-fund --no-audit --prefix "$DEST"
cp "$DEST/windsage-helper.service" /etc/systemd/system/windsage-helper.service
chmod 644 /etc/systemd/system/windsage-helper.service
systemctl daemon-reload
chmod 600 /data/windsage/data/store.json
chmod 700 /data/windsage/data
chown nimrodw:nimrodw /data/windsage/data /data/windsage/data/store.json
echo "store.json perms:"
ls -l /data/windsage/data/store.json
if sudo -u windsagehelper cat /data/windsage/oauth.env >/dev/null 2>&1; then
  echo "FAIL: windsagehelper can read oauth.env" >&2
  exit 1
fi
echo "windsagehelper cannot read oauth.env (good)"
if sudo -u windsagehelper cat /data/windsage/data/store.json >/dev/null 2>&1; then
  echo "FAIL: windsagehelper can read store.json" >&2
  exit 1
fi
echo "windsagehelper cannot read store.json (good)"
rm -rf /tmp/windsage-helper-src
TOKEN=$(grep -E '^DISCORD_TOKEN=' "$DEST/helper.env" | cut -d= -f2- | tr -d '[:space:]')
if [[ -n "$TOKEN" ]]; then
  systemctl enable --now windsage-helper.service
  systemctl status windsage-helper.service --no-pager -L | head -25
else
  systemctl disable --now windsage-helper.service >/dev/null 2>&1 || true
  echo "helper.env has no DISCORD_TOKEN yet — unit installed, not started"
fi
REMOTE
