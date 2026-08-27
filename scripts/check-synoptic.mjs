import assert from 'node:assert/strict';
import { icaoFromSynopticId, parseSynopticId, bboxFromRadiusKm } from '../code/cloud/lib/providers/synoptic.mjs';

assert.equal(parseSynopticId('llbg'), 'LLBG');
assert.equal(parseSynopticId('KSLC'), 'KSLC');
assert.equal(parseSynopticId('https://synopticdata.com/?stid=kslc'), 'KSLC');
assert.equal(parseSynopticId(''), null);

assert.equal(icaoFromSynopticId('LLBG'), 'LLBG');
assert.equal(icaoFromSynopticId('llbg'), 'LLBG');
assert.equal(icaoFromSynopticId('SLC'), 'KSLC');
assert.equal(icaoFromSynopticId('KSLC'), 'KSLC');
assert.equal(icaoFromSynopticId('C4031'), null);

const box = bboxFromRadiusKm(40, -90, 50);
assert.ok(box.lat0 < 40 && box.lat1 > 40);
assert.ok(box.lon0 < -90 && box.lon1 > -90);

console.log('check-synoptic: ok');
