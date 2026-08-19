#!/usr/bin/env node
/**
 * Re-attach follows from a store backup into the live store.json without wiping users.
 *
 *   node scripts/restore-stations-from-backup.mjs \
 *     --live /data/windsage/data \
 *     --from /data/backups/windsage/store-YYYYMMDDTHHMMSSZ.json.gz
 */
import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createGunzip } from 'node:zlib';
import path from 'node:path';
import { restoreStationsFromBackupStore, loadStore, saveStore } from '../code/cloud/lib/store.mjs';

function arg(flag, fallback) {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

async function readJsonMaybeGz(file) {
  if (file.endsWith('.gz')) {
    const chunks = [];
    await new Promise((resolve, reject) => {
      createReadStream(file)
        .pipe(createGunzip())
        .on('data', (c) => chunks.push(c))
        .on('end', resolve)
        .on('error', reject);
    });
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  }
  const raw = await fs.readFile(file, 'utf8');
  return JSON.parse(raw);
}

const liveDir = arg('--live', path.resolve('code/cloud/data'));
const fromFile = arg('--from', '');
if (!fromFile) {
  console.error('usage: node scripts/restore-stations-from-backup.mjs --live DIR --from store.json[.gz]');
  process.exit(2);
}

const backup = await readJsonMaybeGz(fromFile);
const store = await loadStore(liveDir);
const before = Object.values(store.users || {}).reduce((n, u) => n + (u.stations || []).length, 0);
const rec = restoreStationsFromBackupStore(store, backup);
if (rec.restored > 0) {
  await saveStore(liveDir, store);
}
const after = Object.values(store.users || {}).reduce((n, u) => n + (u.stations || []).length, 0);
console.log(
  JSON.stringify({ ok: true, restored: rec.restored, followsBefore: before, followsAfter: after, liveDir, fromFile }, null, 2),
);
