import assert from 'node:assert/strict';
import {
  directionInSector,
  evaluateAlert,
  gustSpreadOk,
  maxWaveOk,
  maxWindOk,
  sustainedDurationMs,
} from '../code/core/alerts';
import { DEFAULT_ALERT_STATE, METRIC_DEFAULTS, createFollowedStation, formatAlertTrigger, ruleForMetric } from '../code/shared/defaults';
import type { HistorySeries, StationReading } from '../code/shared/types';

const reading = (
  wind_avg: number,
  wind_max?: number,
  wind_direction = 180,
  wave_height: number | null = 0.8,
): StationReading => ({
  wind_avg,
  wind_max: wind_max ?? wind_avg + 2,
  wind_min: wind_avg - 2,
  wind_direction,
  temperature: 20,
  wave_height,
  datetime: 'now',
  unixtime: Math.floor(Date.now() / 1000),
});

const station = createFollowedStation('219', 'Test reef');
const prev = { ...DEFAULT_ALERT_STATE };

const nowSec = Math.floor(Date.now() / 1000);
const history: HistorySeries = {
  unixtime: [nowSec - 1800, nowSec - 1200, nowSec - 600, nowSec],
  values: [16, 17, 15.5, 18],
};

assert.equal(sustainedDurationMs(history, station.rule) >= 30 * 60 * 1000, true);
assert.equal(station.rule.maxGustSpreadEnabled, false);
assert.equal(station.rule.maxWaveEnabled, false);
assert.equal(station.rule.maxWindEnabled, false);
assert.equal(station.rule.threshold, 15);
assert.equal(ruleForMetric(station.rule, 'wave_height').threshold, METRIC_DEFAULTS.wave_height.threshold);
assert.equal(ruleForMetric(station.rule, 'wave_height').threshold, 1.0);
assert.equal(ruleForMetric(station.rule, 'wind_max').threshold, 20);
assert.equal(ruleForMetric(station.rule, 'temperature').threshold, 22);
assert.equal(gustSpreadOk(reading(18, 20), 5, true), true);
assert.equal(gustSpreadOk(reading(18, 28), 5, true), false);
assert.equal(gustSpreadOk(reading(18, 28), 5, false), true);

assert.equal(directionInSector(10, 300, 60), true);
assert.equal(directionInSector(180, 300, 60), false);

const cold = evaluateAlert(reading(18, 28), history, station, prev, Date.now());
assert.equal(cold.result.conditionMet, true);
assert.equal(cold.result.shouldNotify, true);

const spreadStation = createFollowedStation('219', 'Spread limited', {
  rule: { ...station.rule, maxGustSpreadEnabled: true, maxGustSpreadKnots: 5 },
});
const gusty = evaluateAlert(reading(18, 28), history, spreadStation, prev, Date.now());
assert.equal(gusty.result.conditionMet, false);
assert.match(gusty.result.message, /Too gusty|spread/i);

const waveCapStation = createFollowedStation('219', 'Wave capped', {
  rule: { ...station.rule, maxWaveEnabled: true, maxWaveHeightM: 1.0 },
});
assert.equal(maxWaveOk(reading(18, 20, 180, 0.5), waveCapStation.rule), true);
assert.equal(maxWaveOk(reading(18, 20, 180, 1.5), waveCapStation.rule), false);
const wavesBig = evaluateAlert(reading(18, 20, 180, 1.5), history, waveCapStation, prev, Date.now());
assert.equal(wavesBig.result.conditionMet, false);
assert.match(wavesBig.result.message, /Waves too big|wave/i);

const waveHistory: HistorySeries = {
  unixtime: [nowSec - 1800, nowSec - 1200, nowSec - 600, nowSec],
  values: [1.2, 1.3, 1.1, 1.4],
};
const waveStation = createFollowedStation('219', 'Wave alert', {
  rule: {
    ...station.rule,
    metric: 'wave_height',
    threshold: 1.0,
    comparison: 'gte',
    maxWindEnabled: true,
    maxWindKnots: 20,
  },
});
assert.equal(maxWindOk(reading(18, 20, 180, 1.4), waveStation.rule), true);
assert.equal(maxWindOk(reading(28, 30, 180, 1.4), waveStation.rule), false);
const windStrong = evaluateAlert(
  reading(28, 30, 180, 1.4),
  waveHistory,
  waveStation,
  prev,
  Date.now(),
);
assert.equal(windStrong.result.conditionMet, false);
assert.match(windStrong.result.message, /Wind too strong|wind/i);

const waveOk = evaluateAlert(reading(18, 20, 180, 1.4), waveHistory, waveStation, prev, Date.now());
assert.equal(waveOk.result.conditionMet, true);
assert.equal(waveOk.result.shouldNotify, true);

const tempStation = createFollowedStation('219', 'Temp', {
  rule: { ...station.rule, metric: 'temperature', threshold: 18, comparison: 'gte' },
});
const tempHist: HistorySeries = {
  unixtime: [nowSec - 1800, nowSec],
  values: [19, 21],
};
const tempOk = evaluateAlert(
  { ...reading(5, 6, 90, 3), temperature: 21 },
  tempHist,
  tempStation,
  prev,
  Date.now(),
);
assert.equal(tempOk.result.conditionMet, true);

assert.equal(formatAlertTrigger(station.rule, 'short'), '15 kt');
assert.equal(formatAlertTrigger(station.rule, 'full'), '≥15 kt for 20 min');
assert.equal(formatAlertTrigger(ruleForMetric(station.rule, 'wind_max'), 'short'), '20 kt');
assert.match(
  formatAlertTrigger(
    { ...station.rule, windDirEnabled: true, windDirFromDeg: 270, windDirToDeg: 20 },
    'full',
  ),
  /dir 270–20°/,
);

console.log('check-alerts: ok');
