import assert from 'node:assert/strict';
import {
  createFollowedStation,
  mergeFollowedStations,
  cloudCoveredByLocal,
  suggestCatalogStations,
  suggestExistingFollows,
} from '../code/shared/defaults';

const catalog = [
  {
    provider: 'windguru' as const,
    stationId: '12345',
    kind: 'station' as const,
    sourceName: 'Parkstone',
    liveStationId: '12345',
    linkedLiveStation: null,
    liveLinkWarning: null,
  },
  {
    provider: 'windguru' as const,
    stationId: '999',
    kind: 'station' as const,
    sourceName: 'Parkgate',
    liveStationId: '999',
    linkedLiveStation: null,
    liveLinkWarning: null,
  },
  {
    provider: 'ndbc' as const,
    stationId: '44013',
    kind: 'station' as const,
    sourceName: 'Boston',
    liveStationId: null,
    linkedLiveStation: null,
    liveLinkWarning: null,
  },
];

assert.deepEqual(suggestCatalogStations(catalog, [], '', 12, 'windguru'), []);
assert.deepEqual(suggestCatalogStations(catalog, [], 'p', 12, 'windguru'), []);

const park = suggestCatalogStations(catalog, [], 'park', 12, 'windguru');
assert.equal(park.length, 2);
assert.equal(park[0].stationId, '12345');
assert.equal(park[0].sourceName, 'Parkstone');
assert.equal(park[1].stationId, '999');

const exact = suggestCatalogStations(catalog, [], 'Parkstone', 12, 'windguru');
assert.equal(exact[0].stationId, '12345');

const byId = suggestCatalogStations(catalog, [], '12345', 12, 'windguru');
assert.equal(byId[0].stationId, '12345');

const saved = [
  createFollowedStation('12345', 'Parkstone', {
    provider: 'windguru',
    sourceName: 'Parkstone',
  }),
];
const remaining = suggestCatalogStations(catalog, saved, 'park', 12, 'windguru');
assert.equal(remaining.some((row) => row.stationId === '12345'), false);
assert.equal(remaining[0].stationId, '999');

const already = suggestExistingFollows(saved, 'park');
assert.equal(already.length, 1);
assert.equal(already[0].stationId, '12345');

const nickOnly = [createFollowedStation('12345', 'Home beach', { provider: 'windguru' })];
assert.equal(suggestExistingFollows(nickOnly, 'home')[0].stationId, '12345');

const ndbcOnly = suggestCatalogStations(catalog, [], 'bost', 12, 'ndbc');
assert.equal(ndbcOnly.length, 1);
assert.equal(ndbcOnly[0].stationId, '44013');

const wgOnly = suggestCatalogStations(catalog, [], 'bost', 12, 'windguru');
assert.equal(wgOnly.length, 0);

const twelve = [
  createFollowedStation('1', 'A', { provider: 'windguru' }),
  createFollowedStation('2', 'B', { provider: 'windguru' }),
];
const half = [twelve[0]];
assert.equal(cloudCoveredByLocal(half, twelve), true);
assert.equal(cloudCoveredByLocal(twelve, half), false);
assert.equal(mergeFollowedStations(half, twelve).length, 2);

console.log('check-catalog: ok');
