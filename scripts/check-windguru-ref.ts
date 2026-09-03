import assert from 'node:assert/strict';
import {
  followTargetForKind,
  isForecastOnlySpot,
  parseWindguruRef as parseTs,
} from '../code/core/windguru';
import {
  catalogRowFromWindguruResolved,
  isUnknownWindguruLiveStationError,
  isWindguruTransportError,
  parseWindguruRef as parseMjs,
  shouldResolveWindguruCatalogQuery,
} from '../code/cloud/lib/wind.mjs';
import { prependCatalogHit, searchCatalogStations } from '../code/cloud/lib/catalogSearch.mjs';

const cases: Array<{ input: string; id: string; kindHint?: 'spot' | 'station' }> = [
  { input: 'https://www.windguru.cz/168017', id: '168017', kindHint: 'spot' },
  { input: 'https://www.windguru.cz/168017/', id: '168017', kindHint: 'spot' },
  { input: 'https://m.windguru.cz/168017', id: '168017', kindHint: 'spot' },
  { input: 'www.windguru.cz/168017', id: '168017', kindHint: 'spot' },
  { input: 'https://www.windguru.cz/station/2259', id: '2259', kindHint: 'station' },
  { input: 'https://www.windguru.cz/station/2259/', id: '2259', kindHint: 'station' },
  { input: '168017', id: '168017' },
];

for (const c of cases) {
  const ts = parseTs(c.input);
  const mjs = parseMjs(c.input);
  assert.deepEqual(ts, { id: c.id, ...(c.kindHint ? { kindHint: c.kindHint } : {}) });
  assert.deepEqual(mjs, ts);
}

assert.equal(parseTs('Parkstone'), null);
assert.equal(parseMjs('https://www.ndbc.noaa.gov/station_page.php?station=44013'), null);

const liveCatalog = [{ provider: 'windguru', stationId: '2259', kind: 'station', sourceName: 'Live' }];
assert.equal(shouldResolveWindguruCatalogQuery('https://www.windguru.cz/168017', []), true);
assert.equal(
  shouldResolveWindguruCatalogQuery('https://www.windguru.cz/168017', [
    { provider: 'windguru', stationId: '168017', kind: 'station' },
  ]),
  true,
);
assert.equal(shouldResolveWindguruCatalogQuery('168017', []), true);
assert.equal(shouldResolveWindguruCatalogQuery('168017', [{ provider: 'windguru', stationId: '168017' }]), false);
assert.equal(shouldResolveWindguruCatalogQuery('https://www.windguru.cz/station/2259', liveCatalog), false);
assert.equal(shouldResolveWindguruCatalogQuery('Parkstone', []), false);

const resolvedSpot = {
  inputId: '168017',
  liveStationId: '15077',
  kind: 'spot',
  spotName: 'Kalamaki',
  hasLiveStation: false,
  linkedLiveStation: { id: '15077', name: 'Nearby', distanceKm: 8.2 },
  warning: 'No live Windguru sensor on this spot — alerts use the model forecast.',
};
const row = catalogRowFromWindguruResolved(resolvedSpot);
assert.equal(row?.stationId, '168017');
assert.equal(row?.kind, 'spot');
assert.equal(row?.sourceName, 'Kalamaki');
assert.equal(row?.liveStationId, '15077');
assert.equal(row?.liveLinkWarning, resolvedSpot.warning);

const others = [
  { provider: 'windguru', stationId: '1', kind: 'station', sourceName: 'A' },
  { provider: 'windguru', stationId: '168017', kind: 'station', sourceName: 'Wrong live' },
];
const prepended = prependCatalogHit(others, row, 40);
assert.equal(prepended[0].stationId, '168017');
assert.equal(prepended[0].kind, 'spot');
assert.equal(prepended.length, 2);

const urlHits = searchCatalogStations(
  [{ provider: 'windguru', stationId: '168017', kind: 'spot', sourceName: 'Kalamaki' }],
  'https://www.windguru.cz/168017',
  { limit: 12 },
);
assert.equal(urlHits.stations[0]?.stationId, '168017');

const asPreferredStation = followTargetForKind('station', resolvedSpot);
assert.equal(asPreferredStation.kind, 'spot');
assert.equal(asPreferredStation.stationId, '168017');
assert.equal(asPreferredStation.liveStationId, '15077');

const nativeSpot = {
  inputId: '910318',
  liveStationId: '2259',
  kind: 'spot' as const,
  hasLiveStation: true,
  linkedLiveStation: null,
  warning: null,
};
assert.equal(followTargetForKind('station', nativeSpot).stationId, '2259');
assert.equal(followTargetForKind('station', nativeSpot).kind, 'station');
assert.equal(followTargetForKind('spot', nativeSpot).stationId, '910318');
assert.equal(followTargetForKind('spot', nativeSpot).kind, 'spot');

const liveStation = {
  inputId: '2259',
  liveStationId: '2259',
  kind: 'station' as const,
  hasLiveStation: true,
};
assert.equal(followTargetForKind('spot', liveStation).kind, 'station');
assert.equal(followTargetForKind('spot', liveStation).stationId, '2259');

assert.equal(
  isForecastOnlySpot({ kind: 'spot', liveLinkWarning: resolvedSpot.warning }),
  true,
);
assert.equal(isForecastOnlySpot({ kind: 'station', liveLinkWarning: resolvedSpot.warning }), false);

assert.equal(isUnknownWindguruLiveStationError(new Error('Unknown station!')), true);
assert.equal(isUnknownWindguruLiveStationError(new Error('Windguru HTTP 400')), true);
assert.equal(isWindguruTransportError(new Error('fetch failed')), true);
assert.equal(isWindguruTransportError(new Error('Windguru timed out — try again in a moment')), true);
assert.equal(isWindguruTransportError(new Error('Unknown station!')), false);

console.log('check-windguru-ref: ok');
