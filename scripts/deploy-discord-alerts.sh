#!/usr/bin/env bash
# Copy discord-alerts onto Wald and install windsage-alerts.service.
# Does not start until alerts.env has DISCORD_TOKEN.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/discord-alerts"
HOST="${WALD_HOST:-wald-mc}"
DEST="/usr/local/windsage-alerts"

[[ -d "$SRC/src" ]] || { echo "missing $SRC" >&2; exit 1; }
ssh "$HOST" "sudo -n true" >/dev/null

ssh "$HOST" "sudo mkdir -p '$DEST' && sudo rm -rf /tmp/windsage-alerts-src && mkdir -p /tmp/windsage-alerts-src"
rsync -az --delete \
  --exclude alerts.env \
  --exclude node_modules \
  --exclude .DS_Store \
  "$SRC/" "$HOST:/tmp/windsage-alerts-src/"

ssh "$HOST" "sudo bash -s" <<'REMOTE'
set -euo pipefail
DEST=/usr/local/windsage-alerts
if ! id windsagealerts >/dev/null 2>&1; then
  useradd --system --home "$DEST" --shell /usr/sbin/nologin windsagealerts
fi
rsync -a --delete --exclude alerts.env /tmp/windsage-alerts-src/ "$DEST/"
if [[ ! -f $DEST/alerts.env ]]; then
  secret=$(python3 -c 'import secrets; print(secrets.token_urlsafe(24))')
  cat > "$DEST/alerts.env" <<EOF
DISCORD_TOKEN=
DISCORD_CLIENT_ID=
DISCORD_GUILD_ID=
DISCORD_ALERT_HOOK_SECRET=$secret
WINDSAGE_CLOUD_URL=http://127.0.0.1:8787
WINDSAGE_ALERTS_PORT=8788
EOF
fi
chmod 600 "$DEST/alerts.env"
chown -R windsagealerts:windsagealerts "$DEST"
sudo -u windsagealerts env HOME="$DEST" /usr/bin/npm install --omit=dev --no-fund --no-audit --prefix "$DEST"
cp "$DEST/windsage-alerts.service" /etc/systemd/system/windsage-alerts.service
chmod 644 /etc/systemd/system/windsage-alerts.service

mkdir -p /etc/systemd/system/windsage.service.d
cat > /etc/systemd/system/windsage.service.d/discord-alert.conf <<'EOF'
[Service]
EnvironmentFile=-/data/windsage/discord-alert.env
EOF
chmod 644 /etc/systemd/system/windsage.service.d/discord-alert.conf

HOOK=$(grep -E '^DISCORD_ALERT_HOOK_SECRET=' "$DEST/alerts.env" | cut -d= -f2- | tr -d '[:space:]')
if [[ ! -f /data/windsage/discord-alert.env ]]; then
  cat > /data/windsage/discord-alert.env <<EOF
DISCORD_ALERT_BOT_TOKEN=
DISCORD_ALERT_HOOK_SECRET=$HOOK
DISCORD_ALERTS_URL=http://127.0.0.1:8788
EOF
  chmod 600 /data/windsage/discord-alert.env
  chown nimrodw:nimrodw /data/windsage/discord-alert.env
else
  # Keep hook secrets in sync if cloud file has an empty secret.
  if ! grep -qE '^DISCORD_ALERT_HOOK_SECRET=.+' /data/windsage/discord-alert.env; then
    printf '\nDISCORD_ALERT_HOOK_SECRET=%s\n' "$HOOK" >> /data/windsage/discord-alert.env
  fi
  if ! grep -qE '^DISCORD_ALERTS_URL=' /data/windsage/discord-alert.env; then
    printf '\nDISCORD_ALERTS_URL=http://127.0.0.1:8788\n' >> /data/windsage/discord-alert.env
  fi
  chmod 600 /data/windsage/discord-alert.env
  chown nimrodw:nimrodw /data/windsage/discord-alert.env
fi

systemctl daemon-reload
chmod 600 /data/windsage/data/store.json
chmod 700 /data/windsage/data
chown nimrodw:nimrodw /data/windsage/data /data/windsage/data/store.json
if sudo -u windsagealerts cat /data/windsage/data/store.json >/dev/null 2>&1; then
  echo "FAIL: windsagealerts can read store.json" >&2
  exit 1
fi
echo "windsagealerts cannot read store.json (good)"
rm -rf /tmp/windsage-alerts-src
TOKEN=$(grep -E '^DISCORD_TOKEN=' "$DEST/alerts.env" | cut -d= -f2- | tr -d '[:space:]')
if [[ -n "$TOKEN" ]]; then
  systemctl enable --now windsage-alerts.service
  systemctl restart windsage.service
  systemctl status windsage-alerts.service --no-pager -L | head -20
else
  systemctl disable --now windsage-alerts.service >/dev/null 2>&1 || true
  echo "alerts.env has no DISCORD_TOKEN yet — unit installed, not started"
fi
REMOTE
