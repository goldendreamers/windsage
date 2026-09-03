import assert from 'node:assert/strict';
import {
  directionInSector,
  evaluateAlert,
  gustSpreadOk,
  maxGustOk,
  maxTempOk,
  maxWaveOk,
  maxWindOk,
  minTempOk,
  minWindOk,
  sustainedDurationMs,
} from '../code/core/alerts';
import { DEFAULT_ALERT_STATE, METRIC_DEFAULTS, alertConditionLabel, alertNotifyDue, alertThresholdDisplay, applyMonitoringSchedule, createFollowedStation, extraLimitsForMetric, formatAlertTrigger, formatWindFromDisplay, homeLiveStatColumns, monitoringUntilMsForCustomHours, monitoringUntilMsForPreset, monitoringScheduleSummary, moveFollow, normalizeNotifyPrefs, notifyChannelsOf, notifyPrefsSummary, organizeFollows, parseLooseNumber, parseNotifyHow, resolveNotifyPrefs, ruleForMetric, toggleFollowStar, toggleNotifyChannel, windDirectionDeg, windDirectionName } from '../code/shared/defaults';
import { matchSimpleNotifyId, ruleFromSimplePreset } from '../code/core/simpleMode';
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
assert.equal(windDirectionName(0), 'north');
assert.equal(windDirectionName(90), 'east');
assert.equal(windDirectionName(180), 'south');
assert.equal(windDirectionName(225), 'south-west');
assert.equal(windDirectionName(270), 'west');
assert.equal(windDirectionName(360), 'north');
assert.equal(windDirectionName(null), null);
assert.equal(windDirectionDeg(247.4), 247);
assert.equal(windDirectionDeg(360), 0);
assert.deepEqual(formatWindFromDisplay(247.4, true), { value: 'south-west', unit: '' });
assert.deepEqual(formatWindFromDisplay(247.4, false), { value: 247, unit: '°' });
assert.deepEqual(formatWindFromDisplay(null, false), { value: null, unit: '' });

assert.match(
  formatAlertTrigger(
    { ...station.rule, windDirEnabled: true, windDirFromDeg: 270, windDirToDeg: 20 },
    'full',
  ),
  /from west–north/,
);
assert.match(
  formatAlertTrigger(
    { ...station.rule, windDirEnabled: true, windDirFromDeg: 270, windDirToDeg: 20 },
    'full',
    { directionWords: false },
  ),
  /from 270–20°/,
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

const fcstSpot = createFollowedStation('377929', 'Dimond', {
  kind: 'spot',
  linkedLiveStation: { id: '15077', name: 'Kinneret', distanceKm: 2 },
  liveLinkWarning: 'no live sensor',
});
const switched = evaluateAlert(reading(18), history, fcstSpot, {
  ...prev,
  lastStationId: '377929',
  notifiedForRun: true,
  conditionSinceMs: Date.now() - 60 * 60 * 1000,
}, Date.now());
assert.equal(switched.nextState.lastStationId, 'forecast:377929');
assert.equal(switched.result.shouldNotify, true);

const alreadyFcst = evaluateAlert(reading(18), history, fcstSpot, {
  ...prev,
  lastStationId: 'forecast:377929',
  notifiedForRun: true,
  conditionSinceMs: Date.now() - 60 * 60 * 1000,
}, Date.now());
assert.equal(alreadyFcst.result.shouldNotify, false);
assert.equal(alreadyFcst.nextState.lastStationId, 'forecast:377929');

const a = createFollowedStation('1', 'A', { id: 'a' });
const b = createFollowedStation('2', 'B', { id: 'b' });
const c = createFollowedStation('3', 'C', { id: 'c' });
const list = [a, b, c];
assert.deepEqual(organizeFollows(list).map((s) => s.id), ['a', 'b', 'c']);
assert.deepEqual(moveFollow(list, 'b', -1).map((s) => s.id), ['b', 'a', 'c']);
assert.deepEqual(moveFollow(list, 'a', -1).map((s) => s.id), ['a', 'b', 'c']);
const starredB = toggleFollowStar(list, 'b');
assert.deepEqual(starredB.map((s) => s.id), ['b', 'a', 'c']);
assert.equal(starredB[0]?.starred, true);
assert.deepEqual(moveFollow(starredB, 'b', 1).map((s) => s.id), ['b', 'a', 'c']);
assert.deepEqual(moveFollow(starredB, 'a', 1).map((s) => s.id), ['b', 'c', 'a']);

assert.equal(parseLooseNumber(''), null);
assert.equal(parseLooseNumber('-'), null);
assert.equal(parseLooseNumber('15.5'), 15.5);
assert.equal(parseLooseNumber('15,2'), 15.2);
assert.equal(parseLooseNumber('abc'), null);
assert.equal(parseLooseNumber('0'), 0);
assert.equal(parseLooseNumber('-3'), -3);

assert.deepEqual(extraLimitsForMetric('wind_avg'), [
  'maxWave',
  'gustSpread',
  'maxGust',
  'windDir',
  'minTemp',
  'maxTemp',
]);
assert.deepEqual(extraLimitsForMetric('wind_max'), [
  'maxWave',
  'gustSpread',
  'windDir',
  'minTemp',
  'maxTemp',
]);
assert.deepEqual(extraLimitsForMetric('wave_height'), [
  'minWind',
  'maxWind',
  'windDir',
  'minTemp',
  'maxTemp',
]);
assert.deepEqual(extraLimitsForMetric('temperature'), []);

assert.equal(matchSimpleNotifyId(ruleFromSimplePreset('wind_15')), 'wind_15');
assert.equal(
  matchSimpleNotifyId({ ...ruleFromSimplePreset('wind_15'), minTempEnabled: true }),
  null,
);

const maxGustStation = createFollowedStation('219', 'Gust cap', {
  rule: { ...station.rule, maxGustEnabled: true, maxGustKnots: 22 },
});
assert.equal(maxGustOk(reading(18, 20), maxGustStation.rule), true);
assert.equal(maxGustOk(reading(18, 28), maxGustStation.rule), false);
const gustHigh = evaluateAlert(reading(18, 28), history, maxGustStation, prev, Date.now());
assert.equal(gustHigh.result.conditionMet, false);
assert.match(gustHigh.result.message, /Gusts too high|gust/i);
assert.equal(alertConditionLabel(gustHigh.result.message), 'Gusts too high');

const coldStation = createFollowedStation('219', 'Cold', {
  rule: { ...station.rule, minTempEnabled: true, minTempC: 25 },
});
assert.equal(minTempOk(reading(18), coldStation.rule), false);
const tooCold = evaluateAlert(reading(18), history, coldStation, prev, Date.now());
assert.equal(tooCold.result.conditionMet, false);
assert.match(tooCold.result.message, /Too cold|temperature/i);

const hotStation = createFollowedStation('219', 'Hot', {
  rule: { ...station.rule, maxTempEnabled: true, maxTempC: 15 },
});
assert.equal(maxTempOk(reading(18), hotStation.rule), false);
const tooHot = evaluateAlert(reading(18), history, hotStation, prev, Date.now());
assert.equal(tooHot.result.conditionMet, false);
assert.match(tooHot.result.message, /Too hot|temperature/i);

const waveMinWind = createFollowedStation('219', 'Wave min wind', {
  rule: {
    ...station.rule,
    metric: 'wave_height',
    threshold: 1.0,
    minWindEnabled: true,
    minWindKnots: 20,
    maxWindEnabled: false,
  },
});
assert.equal(minWindOk(reading(10, 12, 180, 1.4), waveMinWind.rule), false);
const light = evaluateAlert(reading(10, 12, 180, 1.4), waveHistory, waveMinWind, prev, Date.now());
assert.equal(light.result.conditionMet, false);
assert.match(light.result.message, /Wind too light|wind/i);

const now = 1_700_000_000_000;
assert.equal(monitoringUntilMsForPreset('forever', now), null);
assert.equal(monitoringUntilMsForPreset('day', now), now + 24 * 60 * 60 * 1000);
assert.equal(monitoringUntilMsForPreset('week', now), now + 7 * 24 * 60 * 60 * 1000);
assert.equal(monitoringUntilMsForCustomHours(3, now), now + 3 * 60 * 60 * 1000);
assert.equal(monitoringUntilMsForCustomHours(0, now), now + 60 * 60 * 1000);

const pausedDay = createFollowedStation('219', 'Paused day', {
  enabled: false,
  monitoringUntilMs: monitoringUntilMsForPreset('day', now),
});
assert.equal(applyMonitoringSchedule(pausedDay, now).enabled, false);
assert.equal(applyMonitoringSchedule(pausedDay, now).monitoringUntilMs, pausedDay.monitoringUntilMs);
const resumed = applyMonitoringSchedule(pausedDay, now + 24 * 60 * 60 * 1000 + 1);
assert.equal(resumed.enabled, true);
assert.equal(resumed.monitoringUntilMs, null);

const onDay = createFollowedStation('219', 'On day', {
  enabled: true,
  monitoringUntilMs: monitoringUntilMsForPreset('day', now),
});
const expiredOn = applyMonitoringSchedule(onDay, now + 24 * 60 * 60 * 1000 + 1);
assert.equal(expiredOn.enabled, false);
assert.equal(expiredOn.monitoringUntilMs, null);

const foreverOff = createFollowedStation('219', 'Forever off', {
  enabled: false,
  monitoringUntilMs: monitoringUntilMsForPreset('forever', now),
});
assert.equal(foreverOff.monitoringUntilMs, null);
assert.equal(applyMonitoringSchedule(foreverOff, now + 99e12).enabled, false);
assert.equal(monitoringScheduleSummary(pausedDay, now).homeLabel?.startsWith('Paused until'), true);
assert.equal(monitoringScheduleSummary(onDay, now).detailHint?.startsWith('Alerts stay on until'), true);
assert.equal(monitoringScheduleSummary(foreverOff, now).homeLabel, 'Alerts off');

const t0 = Date.UTC(2024, 0, 2, 1, 0, 0);
const annoyingPrefs = { preset: 'annoying' as const, timesPerDay: 1, how: 'phone' as const };
const firstAnnoy = evaluateAlert(reading(18, 28), history, station, prev, t0, annoyingPrefs);
assert.equal(firstAnnoy.result.shouldNotify, true);
const soonAnnoy = evaluateAlert(reading(18, 28), history, station, firstAnnoy.nextState, t0 + 5 * 60 * 1000, annoyingPrefs);
assert.equal(soonAnnoy.result.shouldNotify, false);
const laterAnnoy = evaluateAlert(reading(18, 28), history, station, firstAnnoy.nextState, t0 + 11 * 60 * 1000, annoyingPrefs);
assert.equal(laterAnnoy.result.shouldNotify, true);

const normalPrefs = { preset: 'normal' as const, timesPerDay: 1, how: 'phone' as const };
const firstNormal = evaluateAlert(reading(18, 28), history, station, prev, t0, normalPrefs);
assert.equal(firstNormal.result.shouldNotify, true);
const sameDayAgain = evaluateAlert(
  reading(18, 28),
  history,
  station,
  { ...firstNormal.nextState, notifiedForRun: false, conditionSinceMs: t0 },
  t0 + 3 * 60 * 60 * 1000,
  normalPrefs,
);
assert.equal(sameDayAgain.result.shouldNotify, false);

const quietNoGoogle = evaluateAlert(reading(18, 28), history, station, prev, t0, { preset: 'quiet' }, { hasGoogleEmail: false });
assert.equal(quietNoGoogle.result.shouldNotify, false);
const quietGoogle = evaluateAlert(reading(18, 28), history, station, prev, t0, { preset: 'quiet' }, { hasGoogleEmail: true });
assert.equal(quietGoogle.result.shouldNotify, true);

const customTwo = { preset: 'custom' as const, timesPerDay: 2, how: ['phone'] as const };
const discordOnlyPrefs = { preset: 'custom' as const, timesPerDay: 1, how: ['discord'] as const };
const discordNoLink = evaluateAlert(reading(18, 28), history, station, prev, t0, discordOnlyPrefs, {
  hasDiscordAlert: false,
});
assert.equal(discordNoLink.result.shouldNotify, false);
const discordLinked = evaluateAlert(reading(18, 28), history, station, prev, t0, discordOnlyPrefs, {
  hasDiscordAlert: true,
});
assert.equal(discordLinked.result.shouldNotify, true);
const c1 = evaluateAlert(reading(18, 28), history, station, prev, t0, customTwo);
assert.equal(c1.result.shouldNotify, true);
const c2 = evaluateAlert(reading(18, 28), history, station, c1.nextState, t0 + 12 * 60 * 60 * 1000, customTwo);
assert.equal(c2.result.shouldNotify, true);
const c3 = evaluateAlert(reading(18, 28), history, station, c2.nextState, t0 + 13 * 60 * 60 * 1000, customTwo);
assert.equal(c3.result.shouldNotify, false);

assert.equal(notifyPrefsSummary({ preset: 'annoying' }), 'Annoying · every 10 min');
assert.equal(notifyPrefsSummary({ preset: 'normal' }), 'Normal · once a day');
assert.equal(notifyPrefsSummary({ preset: 'quiet' }), 'Quiet · email only');
assert.equal(notifyPrefsSummary({ preset: 'custom', timesPerDay: 3, how: 'both' }), 'Custom · 3× a day · phone + email');
assert.equal(
  notifyPrefsSummary({ preset: 'custom', timesPerDay: 2, how: ['phone', 'discord'] }),
  'Custom · 2× a day · phone + discord',
);
assert.deepEqual(parseNotifyHow('both'), ['phone', 'email']);
assert.deepEqual(parseNotifyHow(['discord', 'phone', 'email', 'both']), ['phone', 'email', 'discord']);
assert.deepEqual(normalizeNotifyPrefs({ preset: 'custom', how: 'both' }).how, ['phone', 'email']);
assert.deepEqual(notifyChannelsOf({ preset: 'normal', how: ['email'] }), ['phone']);
assert.deepEqual(notifyChannelsOf({ preset: 'custom', how: ['email', 'discord'] }), ['email', 'discord']);
assert.deepEqual(toggleNotifyChannel(['phone'], 'email'), ['phone', 'email']);
assert.deepEqual(toggleNotifyChannel(['phone'], 'phone'), ['phone']);
assert.deepEqual(toggleNotifyChannel(['phone', 'discord'], 'phone'), ['discord']);
assert.equal(resolveNotifyPrefs({ preset: 'quiet' }, { hasGoogleEmail: false }).googleMissing, true);
assert.equal(alertNotifyDue(prev, resolveNotifyPrefs({ preset: 'quiet' }, { hasGoogleEmail: false }), t0), false);
const discordOnly = resolveNotifyPrefs(
  { preset: 'custom', timesPerDay: 1, how: ['discord'] },
  { hasDiscordAlert: true },
);
assert.equal(discordOnly.discord, true);
assert.equal(discordOnly.push, false);
assert.equal(discordOnly.email, false);
assert.equal(alertNotifyDue(prev, discordOnly, t0), true);
assert.equal(
  resolveNotifyPrefs({ preset: 'custom', how: ['discord'] }, { hasDiscordAlert: false }).discord,
  false,
);
assert.equal(
  alertNotifyDue(
    prev,
    resolveNotifyPrefs({ preset: 'custom', how: ['discord'] }, { hasDiscordAlert: false }),
    t0,
  ),
  false,
);
assert.equal(
  resolveNotifyPrefs({ preset: 'custom', how: ['phone', 'email', 'discord'] }, {
    hasGoogleEmail: true,
    hasDiscordAlert: true,
  }).email,
  true,
);

console.log('check-alerts: ok');
