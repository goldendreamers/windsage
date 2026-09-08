import assert from 'node:assert/strict';
import {
  createFollowedStation,
  foldSearchText,
  formatWindFromDisplay,
  searchCatalogStations,
  suggestCatalogStations,
  suggestExistingFollows,
  windDirectionName,
} from '../code/shared/defaults';
import {
  foldSearchText as foldMjs,
  nearbyCatalogStations,
  searchCatalogStations as searchMjs,
  unionCatalogHits,
} from '../code/cloud/lib/catalogSearch.mjs';
import {
  matchSimpleNotifyId,
  ruleFromSimplePreset,
  simpleNotifyLabel,
} from '../code/core/simpleMode';
import { DEFAULT_RULE } from '../code/shared/defaults';

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

const hebrewHaifa = [
  {
    provider: 'windguru' as const,
    stationId: '2049',
    kind: 'station' as const,
    sourceName: 'חיפה כנסיה',
    liveStationId: '2049',
    linkedLiveStation: null,
    liveLinkWarning: null,
  },
];
assert.equal(searchCatalogStations(hebrewHaifa, 'haifa').total, 1);
assert.equal(searchMjs(hebrewHaifa, 'haifa').total, 1);

const nearHaifa = [
  {
    provider: 'windguru',
    stationId: '1',
    kind: 'station',
    sourceName: 'Akko',
    lat: 32.93,
    lon: 35.08,
  },
  {
    provider: 'windguru',
    stationId: '2',
    kind: 'station',
    sourceName: 'Far away',
    lat: 50,
    lon: 0,
  },
];
assert.equal(nearbyCatalogStations(nearHaifa, 32.8, 34.99, { radiusKm: 80 }).length, 1);
assert.equal(nearbyCatalogStations(nearHaifa, 32.8, 34.99, { radiusKm: 80 })[0].stationId, '1');
const united = unionCatalogHits(
  hebrewHaifa,
  nearbyCatalogStations(nearHaifa, 32.8, 34.99, { radiusKm: 80 }),
  40,
);
assert.equal(united.total, 2);

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

assert.equal(windDirectionName(0), 'north');
assert.equal(windDirectionName(90), 'east');
assert.equal(windDirectionName(225), 'south-west');
assert.equal(formatWindFromDisplay(90, true).value, 'east');
assert.equal(formatWindFromDisplay(90, true).unit, '');
assert.equal(formatWindFromDisplay(90, false).value, 90);
assert.equal(formatWindFromDisplay(90, false).unit, '°');

const preset = ruleFromSimplePreset('wind_15');
assert.equal(preset.metric, 'wind_avg');
assert.equal(preset.threshold, 15);
assert.equal(matchSimpleNotifyId(preset), 'wind_15');
assert.equal(simpleNotifyLabel(preset), 'Wind 15 knots or more');
assert.equal(matchSimpleNotifyId({ ...DEFAULT_RULE, windDirEnabled: true }), null);
assert.equal(simpleNotifyLabel({ ...DEFAULT_RULE, threshold: 17 }), 'Pick one…');

console.log('check-catalog: ok');
