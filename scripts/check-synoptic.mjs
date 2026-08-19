import assert from 'node:assert/strict';
import { icaoFromSynopticId, parseSynopticId } from '../code/cloud/lib/providers/synoptic.mjs';

assert.equal(parseSynopticId('llbg'), 'LLBG');
assert.equal(parseSynopticId('KSLC'), 'KSLC');
assert.equal(parseSynopticId('https://synopticdata.com/?stid=kslc'), 'KSLC');
assert.equal(parseSynopticId(''), null);

assert.equal(icaoFromSynopticId('LLBG'), 'LLBG');
assert.equal(icaoFromSynopticId('llbg'), 'LLBG');
assert.equal(icaoFromSynopticId('SLC'), 'KSLC');
assert.equal(icaoFromSynopticId('KSLC'), 'KSLC');
assert.equal(icaoFromSynopticId('C4031'), null);

console.log('check-synoptic: ok');
