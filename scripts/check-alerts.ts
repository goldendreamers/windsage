import assert from 'node:assert/strict';
import {
  directionInSector,
  evaluateAlert,
  gustSpreadOk,
  isForecastModelReading,
  maxWaveOk,
  maxWindOk,
  MAX_SUSTAINED_SAMPLE_GAP_SEC,
  modelGustAtLeastAvg,
  sustainedDurationMs,
} from '../code/core/alerts';
import { DEFAULT_ALERT_STATE, METRIC_DEFAULTS, alertConditionLabel, alertNotifyDue, alertThresholdDisplay, applyMonitoringSchedule, createFollowedStation, formatAlertTrigger, homeLiveStatColumns, isFollowStarred, organizeFollows, resolveNotifyPrefs, ruleForMetric, toggleFollowStar, toggleNotifyChannel } from '../code/shared/defaults';
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
assert.equal(formatAlertTrigger(ruleForMetric(station.rule, 'wave_height'), 'short'), '1 m');
assert.equal(formatAlertTrigger(ruleForMetric(station.rule, 'temperature'), 'short'), '22 °C');
assert.match(
  formatAlertTrigger(
    { ...station.rule, windDirEnabled: true, windDirFromDeg: 270, windDirToDeg: 20 },
    'full',
  ),
  /dir 270–20°/,
);

const sampleReading = { wind_avg: 10.2, wind_max: 14.5, temperature: 21.4, wave_height: 1.35 };
const windCols = homeLiveStatColumns('wind_avg', sampleReading);
assert.deepEqual(
  windCols.map((c) => c.label),
  ['Avg', 'Gust'],
);
assert.equal(windCols[0].value, '10.2');
assert.equal(windCols[1].value, '14.5');

const tempCols = homeLiveStatColumns('temperature', sampleReading);
assert.deepEqual(
  tempCols.map((c) => `${c.label}:${c.value}:${c.unit}`),
  ['Temp:21.4:°C'],
);
assert.equal(
  tempCols.some((c) => /avg|gust/i.test(c.label)),
  false,
);

const waveCols = homeLiveStatColumns('wave_height', sampleReading);
assert.deepEqual(
  waveCols.map((c) => `${c.label}:${c.value}:${c.unit}`),
  ['Wave:1.4:m'],
);
assert.equal(
  waveCols.some((c) => /avg|gust/i.test(c.label)),
  false,
);

// Regression: after a cloud check, result.message becomes the LIVE reading
// (e.g. "10.2 kt"). Alert column must keep the threshold (15 kt), not swap.
const below = evaluateAlert(reading(10.2, 12), history, station, prev, Date.now());
assert.match(below.result.message, /10\.2/);
assert.equal(below.result.metricValue, 10.2);
const alertCol = alertThresholdDisplay(station.rule);
assert.equal(alertCol.value, '15');
assert.equal(alertCol.unit, 'kt');
assert.notEqual(alertCol.value, String(below.result.metricValue));
assert.equal(alertConditionLabel(below.result.message), null); // bare reading → not a status chip
assert.equal(alertConditionLabel('Holding · 16 kt'), 'Holding');
assert.equal(alertConditionLabel('Too gusty'), 'Too gusty');

assert.equal(isForecastModelReading({ source: 'forecast' }), true);
assert.equal(isForecastModelReading({ source: 'live' }), false);
assert.equal(modelGustAtLeastAvg(8.9, 8.5), 8.9);
assert.equal(modelGustAtLeastAvg(8.9, 12.2), 12.2);

const gfsHistory: HistorySeries = {
  unixtime: [nowSec - 21 * 3600, nowSec - 18 * 3600, nowSec - 15 * 3600, nowSec],
  values: [18, 17, 16, 8.9],
};
assert.equal(sustainedDurationMs(gfsHistory, station.rule), 0);
assert.ok(MAX_SUSTAINED_SAMPLE_GAP_SEC < 3 * 3600);

const gfsHoldHistory: HistorySeries = {
  unixtime: [
    nowSec - 21 * 3600,
    nowSec - 18 * 3600,
    nowSec - 15 * 3600,
    nowSec - 12 * 3600,
    nowSec,
  ],
  values: [18, 17, 16, 16, 16],
};
assert.equal(sustainedDurationMs(gfsHoldHistory, station.rule), 0);

const gfsReading: StationReading = {
  ...reading(8.9, 8.5),
  datetime: '2026-09-08T09:00:00.000Z',
  source: 'forecast',
};
const hotPrev = {
  ...DEFAULT_ALERT_STATE,
  conditionSinceMs: Date.now() - 21 * 60 * 60 * 1000,
  notifiedForRun: true,
  lastStationId: station.stationId,
  lastNotifyMs: 1_700_000_000_000,
  notifyDayUtc: '2026-09-08',
  notifyCountToday: 2,
};
const refused = evaluateAlert(gfsReading, gfsHistory, station, hotPrev, Date.now());
assert.equal(refused.result.conditionMet, false);
assert.equal(refused.result.reading, null);
assert.equal(refused.nextState.conditionSinceMs, null);
assert.equal(refused.nextState.notifiedForRun, false);
assert.equal(refused.nextState.lastNotifyMs, 1_700_000_000_000);
assert.equal(refused.nextState.notifyDayUtc, '2026-09-08');
assert.equal(refused.nextState.notifyCountToday, 2);
assert.match(refused.result.message, /live station/i);

const annoying = resolveNotifyPrefs({ preset: 'annoying', how: ['phone'] });
assert.equal(alertNotifyDue(prev, annoying, Date.now()), true);
const firstPing = evaluateAlert(
  reading(18, 28),
  history,
  station,
  prev,
  Date.now(),
  { preset: 'annoying', how: ['phone'] },
);
assert.equal(firstPing.result.shouldNotify, true);
const tooSoon = evaluateAlert(
  reading(18, 28),
  history,
  station,
  firstPing.nextState,
  Date.now() + 60 * 1000,
  { preset: 'annoying', how: ['phone'] },
);
assert.equal(tooSoon.result.shouldNotify, false);
const again = evaluateAlert(
  reading(18, 28),
  history,
  station,
  firstPing.nextState,
  Date.now() + 11 * 60 * 1000,
  { preset: 'annoying', how: ['phone'] },
);
assert.equal(again.result.shouldNotify, true);

const flipped = applyMonitoringSchedule({ enabled: true, monitoringUntilMs: Date.now() - 1 });
assert.equal(flipped.enabled, false);
assert.equal(flipped.monitoringUntilMs, null);

assert.deepEqual(toggleNotifyChannel(['phone'], 'email'), ['phone', 'email']);
assert.deepEqual(toggleNotifyChannel(['phone', 'email'], 'email'), ['phone']);
assert.deepEqual(toggleNotifyChannel(['phone'], 'phone'), ['phone']);

const a = createFollowedStation('1', 'A');
const b = createFollowedStation('2', 'B');
const starred = toggleFollowStar([a, b], b.id);
assert.equal(isFollowStarred(starred[0]), true);
assert.equal(starred[0].id, b.id);
assert.equal(organizeFollows(starred)[0].id, b.id);

console.log('check-alerts: ok');
