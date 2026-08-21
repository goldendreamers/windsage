#!/usr/bin/env bash
# Local phone-app environment: Wald-compatible cloud on :8787 + Expo (web PWA).
#
# Usage:
#   scripts/dev-local.sh              # cloud + Expo web (Metro :8081)
#   scripts/dev-local.sh --cloud      # cloud only (stays in foreground)
#   scripts/dev-local.sh --web        # Expo web only (expects cloud already up)
#
# Point the client at this cloud (required on :8081 — not same-origin):
#   EXPO_PUBLIC_WINDSAGE_URL=http://127.0.0.1:8787
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

MODE="${1:-all}"
PORT="${WINDSAGE_PORT:-8787}"
DATA_DIR="${WINDSAGE_DATA:-$ROOT/code/cloud/data}"
CLOUD_URL="${EXPO_PUBLIC_WINDSAGE_URL:-http://127.0.0.1:${PORT}}"
export WINDSAGE_HOST="${WINDSAGE_HOST:-127.0.0.1}"
export WINDSAGE_PORT="$PORT"
export WINDSAGE_DATA="$DATA_DIR"
export EXPO_PUBLIC_WINDSAGE_URL="$CLOUD_URL"
export CI="${CI:-1}"
export EXPO_NO_TELEMETRY="${EXPO_NO_TELEMETRY:-1}"

mkdir -p "$DATA_DIR"

start_cloud() {
  echo "Windsage cloud → http://127.0.0.1:${PORT}/health  (data: $DATA_DIR)"
  exec node "$ROOT/code/cloud/server.mjs"
}

wait_health() {
  local i
  for i in $(seq 1 40); do
    if curl -sf "http://127.0.0.1:${PORT}/health" >/dev/null; then
      echo "cloud healthy"
      return 0
    fi
    sleep 0.25
  done
  echo "cloud did not become healthy on :${PORT}" >&2
  return 1
}

start_web() {
  echo "Expo web → http://127.0.0.1:8081  (API $CLOUD_URL)"
  exec npx expo start --web --port 8081 --localhost --non-interactive
}

case "$MODE" in
  --cloud | cloud)
    start_cloud
    ;;
  --web | web)
    start_web
    ;;
  --all | all | "")
    node "$ROOT/code/cloud/server.mjs" &
    CLOUD_PID=$!
    trap 'kill "$CLOUD_PID" 2>/dev/null || true' EXIT INT TERM
    wait_health
    start_web
    ;;
  *)
    echo "usage: $0 [--cloud|--web|--all]" >&2
    exit 2
    ;;
esac
