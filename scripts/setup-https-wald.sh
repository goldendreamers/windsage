#!/usr/bin/env bash
# Enable HTTPS for Windsage via Tailscale Serve / Funnel on MagicDNS.
#
# Prerequisite (one-time, Tailscale admin console):
#   https://login.tailscale.com/admin/dns
#   → enable "HTTPS Certificates"
#
# Enable HTTPS for Windsage via Tailscale Serve / Funnel (optional).
#
# Prerequisite (one-time, Tailscale admin console):
#   https://login.tailscale.com/admin/dns
#   → enable "HTTPS Certificates"
#
# Set WINDSAGE_DOMAIN to your MagicDNS hostname. There is no default.
set -euo pipefail

DOMAIN="${WINDSAGE_DOMAIN:-}"
if [[ -z "$DOMAIN" ]]; then
  echo "usage: WINDSAGE_DOMAIN=your-host.ts.net $0" >&2
  exit 2
fi
UPSTREAM="${WINDSAGE_UPSTREAM:-http://127.0.0.1:8787}"

echo "Domain: https://$DOMAIN/"
echo "Upstream: $UPSTREAM"
echo
echo "If ACME fails, enable HTTPS Certificates at:"
echo "  https://login.tailscale.com/admin/dns"
echo

# Funnel is often required for Let's Encrypt dns-01 on MagicDNS names.
echo "Enabling Funnel (needed for certificate issuance)…"
sudo tailscale serve reset >/dev/null 2>&1 || true
sudo tailscale funnel reset >/dev/null 2>&1 || true
sudo tailscale funnel --bg --yes "$UPSTREAM"

echo "Waiting for certificate / health (up to ~2 min)…"
ok=0
for i in $(seq 1 40); do
  if curl -4 -fsS --max-time 5 "https://$DOMAIN/health" >/dev/null 2>&1; then
    ok=1
    break
  fi
  sleep 3
done

if [[ "$ok" -ne 1 ]]; then
  echo "HTTPS not ready. Recent tailscaled cert logs:"
  sudo journalctl -u tailscaled --since "3 min ago" --no-pager | grep -iE 'cert|acme|funnel|order' | tail -20 || true
  exit 1
fi

echo "OK https://$DOMAIN/health"
curl -4 -fsS "https://$DOMAIN/health"
echo
echo
echo "Funnel is ON (public internet). For tailnet-only HTTPS after the cert is cached:"
echo "  sudo tailscale funnel reset"
echo "  sudo tailscale serve --bg --yes $UPSTREAM"
echo "Then set WINDSAGE_PUBLIC_URL=https://$DOMAIN and restart windsage."
