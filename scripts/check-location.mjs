/**
 * Location-blend weight math + 100-station leave-one-out rebalance (no network).
 */
import assert from 'node:assert/strict';
import {
  accuracyScoreFromMae,
  BLEND_PARAMS,
  distanceWeight,
  geometryFactor,
  inferPinContext,
  memberWeight,
  pickBestMembers,
  PIN_MODEL_EQUIV_KM,
  pinModelMember,
  robustifyMetricWeights,
} from '../code/cloud/lib/providers/location.mjs';
import {
  blendMae,
  makeCoastalWindStations,
  rebalanceBlendParams,
} from '../code/cloud/lib/providers/location-calibrate.mjs';
import { marineWaveHeightFromCurrent } from '../code/cloud/lib/providers/openmeteo.mjs';
import { bboxFromRadiusKm } from '../code/cloud/lib/providers/synoptic.mjs';

assert.ok(accuracyScoreFromMae(0, 10) > 0.9);
assert.ok(accuracyScoreFromMae(8, 10) < 0.35);

const km = [4.83, 6, 7, 8, 9, 10];
const windW = km.map((d) => memberWeight({ distanceKm: d, provider: 'windguru', stationId: String(d) }, {}));
const tempW = km.map((d) =>
  memberWeight({ distanceKm: d, provider: 'windguru', stationId: String(d) }, {}, { metric: 'temperature' }),
);
const windShare = windW[0] / windW.reduce((s, w) => s + w, 0);
const tempShare = tempW[0] / tempW.reduce((s, w) => s + w, 0);
assert.ok(windShare > 0.45, `closest wind share ${windShare}`);
assert.ok(tempShare > 0.6, `closest temp share ${tempShare}`);
assert.ok(tempShare > windShare, 'temp decay should be steeper than wind');

assert.ok(distanceWeight(5) / distanceWeight(20) > 20);
assert.ok(distanceWeight(5, 'temperature') / distanceWeight(20, 'temperature') > 200);

const temps = [22, 23, 22.4, 8];
const even = [1, 1, 1, 1];
const robust = robustifyMetricWeights(temps, even, { scale: 2.5 });
assert.ok(robust[3] < 0.05, `outlier temp weight ${robust[3]}`);
assert.ok(robust[0] > 0.8);

const blended =
  temps.reduce((s, t, i) => s + t * robust[i], 0) / robust.reduce((s, w) => s + w, 0);
assert.ok(blended > 21 && blended < 24, `robust temp blend ${blended}`);

const live = memberWeight({ distanceKm: 5, provider: 'windguru', stationId: '1' }, {});
const pin = memberWeight(pinModelMember(32.16, 34.8), {});
assert.ok(live > pin * 4, `live 5km ${live} should beat pin model ${pin}`);
assert.equal(pinModelMember(32.164, 34.796).virtual, true);
assert.ok(PIN_MODEL_EQUIV_KM >= 10);

const box = bboxFromRadiusKm(32.16, 34.8, 50);
assert.ok(box.lat0 < 32.16 && box.lat1 > 32.16);
assert.ok(box.lon0 < 34.8 && box.lon1 > 34.8);

const coastCtx = {
  pinLat: 32.16,
  pinLon: 34.8,
  pinSurface: 'coast',
  pinElevM: 12,
  waterBearingDeg: 270,
  windDirDeg: 280,
};
const landAirport = {
  provider: 'synoptic',
  stationId: 'LLBG',
  distanceKm: 8,
  lat: 32.01,
  lon: 34.89,
  elevM: 40,
  surface: 'land',
};
const buoy = {
  provider: 'ndbc',
  stationId: '41009',
  distanceKm: 8,
  lat: 32.16,
  lon: 34.7,
  elevM: 0,
  surface: 'water',
};
assert.ok(
  memberWeight(buoy, {}, coastCtx) > memberWeight(landAirport, {}, coastCtx) * 1.4,
  'coastal pin should prefer a same-distance buoy over an inland airport',
);

const sameSpot = {
  provider: 'windguru',
  stationId: 'near',
  distanceKm: 6,
  lat: 32.16,
  lon: 34.82,
  elevM: 12,
};
const highHill = { ...sameSpot, stationId: 'hill', elevM: 420 };
assert.ok(
  geometryFactor(sameSpot, coastCtx) > geometryFactor(highHill, { ...coastCtx, pinElevM: 12 }) * 1.3,
  'elevation mismatch should cut weight',
);

const along = {
  provider: 'windguru',
  stationId: 'upwind',
  distanceKm: 10,
  lat: 32.16,
  lon: 34.7,
  elevM: 10,
};
const cross = {
  provider: 'windguru',
  stationId: 'cross',
  distanceKm: 10,
  lat: 32.25,
  lon: 34.8,
  elevM: 10,
};
assert.ok(
  memberWeight(along, {}, coastCtx) > memberWeight(cross, {}, coastCtx),
  'along-wind neighbor should beat cross-wind at the same distance',
);

const wgCrowd = Array.from({ length: 8 }, (_, i) => ({
  provider: 'windguru',
  stationId: String(i + 1),
  distanceKm: 1 + i * 0.4,
  lat: 32.16,
  lon: 34.805 + i * 0.002,
  elevM: 10,
}));
const picked = pickBestMembers(
  [
    ...wgCrowd,
    { provider: 'ndbc', stationId: '41009', distanceKm: 12, lat: 32.16, lon: 34.68, elevM: 0, surface: 'water' },
    { provider: 'synoptic', stationId: 'LLBG', distanceKm: 18, lat: 32.01, lon: 34.89, elevM: 40, surface: 'land' },
  ],
  6,
  inferPinContext(32.16, 34.8, wgCrowd),
);
assert.equal(picked.length, 6);
assert.ok(picked.every((m) => m.provider === 'windguru'), 'closest accurate WG should fill the cap before a far airport/buoy');
assert.ok(!picked.some((m) => m.stationId === 'LLBG'), '18 km airport is not more accurate than nearby live spots');

assert.equal(marineWaveHeightFromCurrent({ wave_height: 1.2, swell_wave_height: 0.8 }), 1.2);
assert.equal(marineWaveHeightFromCurrent({ wave_height: null, swell_wave_height: 0.8 }), 0.8);
assert.equal(marineWaveHeightFromCurrent({}), null);

const stations = makeCoastalWindStations(100, 7);
assert.equal(stations.length, 100);
const cal = rebalanceBlendParams(stations, BLEND_PARAMS, { window: 10 });
assert.ok(cal.fittedMae != null && cal.naiveMae != null && cal.startMae != null, 'calibration produced MAEs');
assert.ok(
  cal.fittedMae < cal.naiveMae * 0.92,
  `geometry rebalance should beat distance-only (fitted ${cal.fittedMae} vs naive ${cal.naiveMae})`,
);
assert.ok(
  cal.fittedMae <= cal.startMae * 1.02,
  `100-station rebalance should not worsen start MAE (fitted ${cal.fittedMae} vs start ${cal.startMae})`,
);
const prodMae = blendMae(stations, BLEND_PARAMS);
assert.ok(
  prodMae < cal.naiveMae * 0.92,
  `production weights should beat distance-only (prod ${prodMae} vs naive ${cal.naiveMae})`,
);
const changed = cal.perStation.filter((row) => row.changed).length;
assert.ok(changed >= 5, `expected several per-station nudges, got ${changed}`);

console.log('check-location: ok', {
  windShare: Number(windShare.toFixed(3)),
  tempShare: Number(tempShare.toFixed(3)),
  naiveMae: Number(cal.naiveMae.toFixed(3)),
  startMae: Number(cal.startMae.toFixed(3)),
  fittedMae: Number(cal.fittedMae.toFixed(3)),
  prodMae: Number(prodMae.toFixed(3)),
  fittedParams: cal.params,
  nudged: changed,
});
