#!/data/data/com.termux/files/usr/bin/sh
# One-shot: replace listeners and start watchdog. No secrets.
HOME="${HOME:-/data/data/com.termux/files/home}"
PREFIX="${PREFIX:-/data/data/com.termux/files/usr}"
export PATH="$HOME/.local/bin:$PREFIX/bin:$PATH"
ROOT="$HOME/windsage/tools/s22-local-agent"
LOG="$HOME/windsage-local-agent.log"
command -v termux-wake-lock >/dev/null && termux-wake-lock || true

kill_matching() {
  needle="$1"
  for proc in /proc/[0-9]*; do
    pid="${proc##*/}"
    [ "$pid" = "$$" ] && continue
    cmd=$(tr '\0' ' ' < "$proc/cmdline" 2>/dev/null) || continue
    case "$cmd" in
      *"$needle"*)
        kill "$pid" 2>/dev/null || true
        ;;
    esac
  done
}

if [ -f "$HOME/windsage-local-watchdog.pid" ]; then
  kill "$(cat "$HOME/windsage-local-watchdog.pid")" 2>/dev/null || true
fi
kill_matching "s22-local-agent/watchdog.sh"
kill_matching "s22-local-agent/server.mjs"
sleep 1

chmod +x "$ROOT/watchdog.sh" "$ROOT/boot-local.sh"
nohup sh "$ROOT/watchdog.sh" >> "$HOME/windsage-local-watchdog.log" 2>&1 &
echo $! > "$HOME/windsage-local-watchdog.pid"
sleep 4

echo "--- health loop ---"
curl -sS --max-time 3 http://127.0.0.1:8790/health || echo LOOP_FAIL
echo
echo "--- health tailscale ---"
curl -sS --max-time 3 http://100.124.6.109:8790/health || echo TS_FAIL
echo
echo "WATCHDOG_PID=$(cat "$HOME/windsage-local-watchdog.pid")"
tail -n 20 "$LOG" 2>/dev/null || true
