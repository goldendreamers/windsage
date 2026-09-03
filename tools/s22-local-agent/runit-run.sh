#!/data/data/com.termux/files/usr/bin/sh
export HOME="${HOME:-/data/data/com.termux/files/home}"
export PREFIX="${PREFIX:-/data/data/com.termux/files/usr}"
export PATH="$HOME/.local/bin:$PREFIX/bin:$PATH"
cd "$HOME/windsage"
exec node "$HOME/windsage/tools/s22-local-agent/server.mjs"
