import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import {
  buildWindguruNameFiles,
  compactStationsFromCatalog,
  namedListFromCatalog,
  readCompactCatalog,
  uniqueInOrder,
  writeWindguruNameFiles,
} from '../code/cloud/lib/windguruNames.mjs';

const rows = [
  { stationId: '1', sourceName: 'Parkstone Yacht Club' },
  { stationId: '2', sourceName: 'Parkstone Yacht Club' },
  { stationId: '3', sourceName: 'Waihi Beach' },
  { stationId: '4', sourceName: '' },
];

const named = namedListFromCatalog(rows);
assert.deepEqual(named, ['Parkstone Yacht Club', 'Parkstone Yacht Club', 'Waihi Beach']);
assert.deepEqual(uniqueInOrder(named), ['Parkstone Yacht Club', 'Waihi Beach']);

const built = buildWindguruNameFiles(rows);
assert.equal(built.allLines, 'Parkstone Yacht Club\nParkstone Yacht Club\nWaihi Beach\n');
assert.equal(built.uniqueLines, 'Parkstone Yacht Club\nWaihi Beach\n');
assert.deepEqual(JSON.parse(built.uniqueJson), ['Parkstone Yacht Club', 'Waihi Beach']);
assert.equal(built.meta.named, 3);
assert.equal(built.meta.uniqueNames, 2);
assert.equal(built.meta.liveStations, 4);
assert.equal(built.meta.files.oneNamePerLine.bytes, Buffer.byteLength(built.allLines));
assert.ok(built.meta.files.oneNamePerLine.bytes > built.meta.files.uniqueNamesOnePerLine.bytes);

const compact = compactStationsFromCatalog(rows);
assert.equal(compact.length, 4);
assert.equal(compact[0].sourceName, 'Parkstone Yacht Club');
assert.equal(compact[3].sourceName, 'Station 4');

const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'wg-names-'));
await writeWindguruNameFiles(dir, built);
const roundTrip = await readCompactCatalog(dir);
assert.equal(roundTrip.length, 4);
assert.equal(roundTrip[1].stationId, '2');
const allText = await fs.readFile(path.join(dir, 'windguru-live-station-names.txt'), 'utf8');
assert.equal(allText, built.allLines);

console.log('check-windguru-names: ok', {
  named: built.meta.named,
  unique: built.meta.uniqueNames,
  allBytes: built.meta.files.oneNamePerLine.bytes,
});
