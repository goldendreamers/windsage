/**
 * Location-blend weight math (no network).
 */
import assert from 'node:assert/strict';
import {
  accuracyScoreFromMae,
  distanceWeight,
  memberWeight,
  mixNearbyMembers,
  PIN_MODEL_EQUIV_KM,
  pinModelMember,
  robustifyMetricWeights,
} from '../code/cloud/lib/providers/location.mjs';
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

const wgCrowd = Array.from({ length: 8 }, (_, i) => ({
  provider: 'windguru',
  stationId: String(i + 1),
  distanceKm: i + 1,
}));
const mixed = mixNearbyMembers(
  [
    wgCrowd,
    [{ provider: 'ndbc', stationId: '41009', distanceKm: 12 }],
    [
      { provider: 'synoptic', stationId: 'LLHZ', distanceKm: 4 },
      { provider: 'synoptic', stationId: 'LLBG', distanceKm: 18 },
    ],
  ],
  6,
);
assert.equal(mixed.length, 6);
assert.ok(mixed.some((m) => m.provider === 'ndbc'), 'blend should keep a buoy');
assert.ok(mixed.some((m) => m.stationId === 'LLHZ'), 'blend should keep closest airport');
assert.ok(mixed.filter((m) => m.provider === 'windguru').length >= 2);

assert.equal(marineWaveHeightFromCurrent({ wave_height: 1.2, swell_wave_height: 0.8 }), 1.2);
assert.equal(marineWaveHeightFromCurrent({ wave_height: null, swell_wave_height: 0.8 }), 0.8);
assert.equal(marineWaveHeightFromCurrent({}), null);

console.log('check-location: ok', {
  windShare: Number(windShare.toFixed(3)),
  tempShare: Number(tempShare.toFixed(3)),
});
