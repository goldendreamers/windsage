#!/usr/bin/env node
/**
 * Re-attach follows from a store backup into the live store without wiping users.
 * Lives under code/cloud so Wald rsync includes it.
 *
 *   node /data/windsage/restore-stations.mjs \
 *     --live /data/windsage/data \
 *     --from /data/backups/windsage/store-YYYYMMDDTHHMMSSZ.json.gz
 */
import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createGunzip } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { restoreStationsFromBackupStore, loadStore, saveStore } from './lib/store.mjs';

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

const here = path.dirname(fileURLToPath(import.meta.url));
const liveDir = arg('--live', path.join(here, 'data'));
const fromFile = arg('--from', '');
if (!fromFile) {
  console.error('usage: node restore-stations.mjs --live DIR --from store.json[.gz]');
  process.exit(2);
}

const backup = await readJsonMaybeGz(fromFile);
const store = await loadStore(liveDir);
const count = (s) =>
  Object.values(s.users || {}).reduce((n, u) => n + (u.stations || []).length, 0) +
  Object.values(s.devices || {}).reduce((n, d) => n + ((d.userId ? 0 : (d.stations || []).length)), 0);
const before = count(store);
const rec = restoreStationsFromBackupStore(store, backup);
if (rec.restored > 0) {
  await saveStore(liveDir, store);
}
console.log(
  JSON.stringify(
    { ok: true, restored: rec.restored, followsBefore: before, followsAfter: count(store), liveDir, fromFile },
    null,
    2,
  ),
);
