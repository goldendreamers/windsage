import assert from 'node:assert/strict';
import {
  createFollowedStation,
  mergeFollowedStations,
  cloudCoveredByLocal,
  foldSearchText,
  searchCatalogStations,
  suggestCatalogStations,
  suggestExistingFollows,
} from '../code/shared/defaults';
import {
  foldSearchText as foldMjs,
  searchCatalogStations as searchMjs,
} from '../code/cloud/lib/catalogSearch.mjs';

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
  {
    provider: 'windguru' as const,
    stationId: '77',
    kind: 'station' as const,
    sourceName: 'Bobík',
    liveStationId: '77',
    linkedLiveStation: null,
    liveLinkWarning: null,
  },
  {
    provider: 'windguru' as const,
    stationId: '88',
    kind: 'station' as const,
    sourceName: 'Tel Aviv',
    liveStationId: '88',
    linkedLiveStation: null,
    liveLinkWarning: null,
  },
];

assert.equal(foldSearchText('Bobík'), 'bobik');
assert.equal(foldMjs('Bobík'), 'bobik');
assert.equal(foldSearchText('Haïfa'), 'haifa');

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

const accent = suggestCatalogStations(catalog, [], 'bobik', 12, 'windguru');
assert.equal(accent[0].stationId, '77');

const compact = suggestCatalogStations(catalog, [], 'telaviv', 12, 'windguru');
assert.equal(compact[0].stationId, '88');

const saved = [
  createFollowedStation('12345', 'Parkstone', {
    provider: 'windguru',
    sourceName: 'Parkstone',
  }),
];
const remaining = suggestCatalogStations(catalog, saved, 'park', 12, 'windguru');
assert.equal(remaining.some((row) => row.stationId === '12345'), false);
assert.equal(remaining[0].stationId, '999');

const unfiltered = searchCatalogStations(catalog, 'park', { limit: 12, provider: 'windguru' });
assert.equal(unfiltered.total, 2);
assert.equal(unfiltered.stations.some((row) => row.stationId === '12345'), true);

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

const many = Array.from({ length: 30 }, (_, i) => ({
  provider: 'windguru' as const,
  stationId: String(2000 + i),
  kind: 'station' as const,
  sourceName: `Haifa ${i}`,
  liveStationId: String(2000 + i),
  linkedLiveStation: null,
  liveLinkWarning: null,
}));
const page = searchCatalogStations(many, 'haifa', { limit: 12 });
assert.equal(page.stations.length, 12);
assert.equal(page.total, 30);
const pageMjs = searchMjs(many, 'haifa', { limit: 12 });
assert.equal(pageMjs.stations.length, 12);
assert.equal(pageMjs.total, 30);
const all = searchCatalogStations(many, 'haifa', { limit: 400 });
assert.equal(all.stations.length, 30);
assert.equal(all.total, 30);

const twelve = [
  createFollowedStation('1', 'A', { provider: 'windguru' }),
  createFollowedStation('2', 'B', { provider: 'windguru' }),
];
const half = [twelve[0]];
assert.equal(cloudCoveredByLocal(half, twelve), true);
assert.equal(cloudCoveredByLocal(twelve, half), false);
assert.equal(mergeFollowedStations(half, twelve).length, 2);

console.log('check-catalog: ok');
