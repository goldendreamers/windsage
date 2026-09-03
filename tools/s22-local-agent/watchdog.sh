#!/data/data/com.termux/files/usr/bin/sh
# Keep the local face up overnight. Does not print secrets.
HOME="${HOME:-/data/data/com.termux/files/home}"
PREFIX="${PREFIX:-/data/data/com.termux/files/usr}"
export PATH="$HOME/.local/bin:$PREFIX/bin:$PATH"
ROOT="$HOME/windsage/tools/s22-local-agent"
LOG="$HOME/windsage-local-agent.log"
MARKER="tools/s22-local-agent/server.mjs"
command -v termux-wake-lock >/dev/null && termux-wake-lock || true

kill_listeners() {
  for proc in /proc/[0-9]*; do
    pid="${proc##*/}"
    [ "$pid" = "$$" ] && continue
    cmd=$(tr '\0' ' ' < "$proc/cmdline" 2>/dev/null) || continue
    case "$cmd" in
      *"$MARKER"*)
        kill "$pid" 2>/dev/null || true
        ;;
    esac
  done
}

while true; do
  loop_ok=0
  ts_ok=0
  curl -fsS --max-time 2 http://127.0.0.1:8790/health >/dev/null 2>&1 && loop_ok=1
  curl -fsS --max-time 2 http://100.124.6.109:8790/health >/dev/null 2>&1 && ts_ok=1
  if [ "$loop_ok" = 1 ] && [ "$ts_ok" = 1 ]; then
    sleep 12
    continue
  fi
  echo "$(date -Iseconds) watchdog restart loop=$loop_ok ts=$ts_ok" >> "$LOG"
  kill_listeners
  sleep 1
  node "$ROOT/server.mjs" >> "$LOG" 2>&1 &
  sleep 3
done
