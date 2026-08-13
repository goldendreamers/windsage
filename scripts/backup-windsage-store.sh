#!/usr/bin/env bash
# Windsage store backup — daily cron on Wald.
# Destination: /data/backups/windsage/
# Retention: 14 days
set -euo pipefail

SRC="${WINDSAGE_STORE:-/data/windsage/data/store.json}"
DEST="${WINDSAGE_BACKUP_DIR:-/data/backups/windsage}"
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
ARCHIVE="$DEST/store-${STAMP}.json.gz"
RETENTION_DAYS=14

mkdir -p "$DEST"
if [[ ! -f "$SRC" ]]; then
  echo "Backup SKIP: missing $SRC" >&2
  exit 1
fi

gzip -c "$SRC" > "$ARCHIVE"
find "$DEST" -type f -name 'store-*.json.gz' -mtime +"${RETENTION_DAYS}" -print -delete
SIZE=$(du -h "$ARCHIVE" | cut -f1)
LEFT=$(find "$DEST" -type f -name 'store-*.json.gz' | wc -l | tr -d ' ')
echo "Backup OK: $ARCHIVE ($SIZE) archives_kept=$LEFT retention=${RETENTION_DAYS}d"
