/**
 * Location-blend weight math (no network).
 */
import assert from 'node:assert/strict';
import {
  accuracyScoreFromMae,
  distanceWeight,
  memberWeight,
  robustifyMetricWeights,
} from '../code/cloud/lib/providers/location.mjs';

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

console.log('check-location: ok', {
  windShare: Number(windShare.toFixed(3)),
  tempShare: Number(tempShare.toFixed(3)),
});
