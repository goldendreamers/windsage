import { DEFAULT_ALERT_STATE } from '../shared/defaults';
import type {
  AlertState,
  CheckResult,
  FollowedStation,
  HistorySeries,
  StationReading,
} from '../shared/types';
import { fetchCurrentReading, fetchRecentHistory, fetchSpotForecastNow, isForecastOnlySpot, metricUnit, metricValue } from './windguru';

function meetsRule(value: number | null, rule: FollowedStation['rule']): boolean {
  if (value === null) return false;
  return rule.comparison === 'gte' ? value >= rule.threshold : value <= rule.threshold;
}

/** Gust − avg (knots). Null if either reading is missing. */
export function gustSpreadKnots(reading: StationReading): number | null {
  if (reading.wind_avg == null || reading.wind_max == null) return null;
  return Math.max(0, reading.wind_max - reading.wind_avg);
}

export function gustSpreadOk(
  reading: StationReading,
  maxGustSpreadKnots: number,
  enabled = true,
): boolean {
  if (!enabled) return true;
  const spread = gustSpreadKnots(reading);
  if (spread == null) return false;
  return spread <= Math.max(0, maxGustSpreadKnots);
}

/** Normalize degrees into [0, 360). */
export function normalizeDegrees(deg: number): number {
  const n = deg % 360;
  return n < 0 ? n + 360 : n;
}

/**
 * Inclusive wind-direction sector. If from === to (after normalize), treats as full circle.
 * Wrap-around: from=300, to=60 includes 300…359 and 0…60.
 */
export function directionInSector(directionDeg: number, fromDeg: number, toDeg: number): boolean {
  const d = normalizeDegrees(directionDeg);
  const from = normalizeDegrees(fromDeg);
  const to = normalizeDegrees(toDeg);
  if (from === to) return true;
  if (from < to) return d >= from && d <= to;
  return d >= from || d <= to;
}

export function windDirectionOk(
  reading: StationReading,
  rule: FollowedStation['rule'],
  applicable = true,
): boolean {
  if (!applicable || !rule.windDirEnabled) return true;
  if (reading.wind_direction == null) return false;
  return directionInSector(
    reading.wind_direction,
    rule.windDirFromDeg ?? 0,
    rule.windDirToDeg ?? 360,
  );
}

/** Optional max wave when primary metric is wind. */
export function maxWaveOk(
  reading: StationReading,
  rule: FollowedStation['rule'],
): boolean {
  const windPrimary = rule.metric === 'wind_avg' || rule.metric === 'wind_max';
  if (!windPrimary || !rule.maxWaveEnabled) return true;
  if (reading.wave_height == null) return false;
  return reading.wave_height <= Math.max(0, rule.maxWaveHeightM ?? 1.5);
}

/** Optional max wind when primary metric is wave. */
export function maxWindOk(
  reading: StationReading,
  rule: FollowedStation['rule'],
): boolean {
  if (rule.metric !== 'wave_height' || !rule.maxWindEnabled) return true;
  if (reading.wind_avg == null) return false;
  return reading.wind_avg <= Math.max(0, rule.maxWindKnots ?? 25);
}

export function formatDirectionSector(fromDeg: number, toDeg: number): string {
  const from = Math.round(normalizeDegrees(fromDeg));
  const to = Math.round(normalizeDegrees(toDeg));
  return `${from}–${to}°`;
}

/**
 * Walk recent samples newest→oldest and measure how long the threshold has
 * been continuously true. Returns sustained duration in milliseconds.
 */
export function sustainedDurationMs(
  history: HistorySeries,
  rule: FollowedStation['rule'],
): number {
  if (history.unixtime.length === 0) return 0;

  const points = history.unixtime
    .map((ts, index) => ({ ts, value: history.values[index] ?? null }))
    .filter((p) => p.ts > 0)
    .sort((a, b) => b.ts - a.ts);

  if (points.length === 0) return 0;
  if (!meetsRule(points[0].value, rule)) return 0;

  let oldestOk = points[0].ts;
  for (let i = 1; i < points.length; i += 1) {
    if (!meetsRule(points[i].value, rule)) break;
    oldestOk = points[i].ts;
  }

  const newest = points[0].ts;
  return Math.max(0, (newest - oldestOk) * 1000);
}

export function evaluateAlert(
  reading: StationReading,
  history: HistorySeries,
  station: FollowedStation,
  prev: AlertState,
  nowMs = Date.now(),
): { result: CheckResult; nextState: AlertState } {
  const metric = station.rule.metric;
  const windPrimary = metric === 'wind_avg' || metric === 'wind_max';
  const wavePrimary = metric === 'wave_height';
  const dirApplicable = windPrimary || wavePrimary;

  const value = metricValue(reading, metric);
  const metricOk = meetsRule(value, station.rule);
  const spreadEnabled = windPrimary && !!station.rule.maxGustSpreadEnabled;
  const maxSpread = station.rule.maxGustSpreadKnots ?? 5;
  const spread = gustSpreadKnots(reading);
  const spreadOk = gustSpreadOk(reading, maxSpread, spreadEnabled);
  const dirOk = windDirectionOk(reading, station.rule, dirApplicable);
  const waveCapOk = maxWaveOk(reading, station.rule);
  const windCapOk = maxWindOk(reading, station.rule);
  const conditionMet = metricOk && spreadOk && dirOk && waveCapOk && windCapOk;
  const historySustainedMs = sustainedDurationMs(history, station.rule);

  let conditionSinceMs = prev.conditionSinceMs;
  let notifiedForRun = prev.notifiedForRun;

  if (prev.lastStationId && prev.lastStationId !== station.stationId) {
    conditionSinceMs = null;
    notifiedForRun = false;
  }

  if (!conditionMet) {
    conditionSinceMs = null;
    notifiedForRun = false;
  } else if (conditionSinceMs == null) {
    if (historySustainedMs > 0) {
      conditionSinceMs = nowMs - historySustainedMs;
    } else {
      conditionSinceMs = nowMs;
    }
  }

  const sustainedMs =
    conditionMet && conditionSinceMs != null
      ? Math.max(nowMs - conditionSinceMs, historySustainedMs)
      : 0;

  const requiredMs = station.rule.sustainedMinutes * 60 * 1000;
  const monitoringOn = station.enabled !== false;
  const shouldNotify =
    monitoringOn && conditionMet && sustainedMs >= requiredMs && !notifiedForRun;

  if (shouldNotify) {
    notifiedForRun = true;
  }

  const unit = metricUnit(metric);
  const formatValue = (v: number | null | undefined) => {
    if (v == null || !Number.isFinite(Number(v))) return null;
    const n = Number(v);
    const rounded = Math.round(n * 10) / 10;
    const text = Math.abs(rounded - Math.round(rounded)) < 0.05 ? String(Math.round(rounded)) : rounded.toFixed(1);
    return `${text} ${unit}`;
  };
  const valueText = formatValue(value) ?? '—';

  // Plain status for the home/detail alert line — lead with the live number, not metric keys.
  let message: string;
  if (!monitoringOn) {
    message = 'Paused';
  } else if (value == null) {
    message = 'No reading';
  } else if (!metricOk) {
    message = valueText;
  } else if (!spreadOk) {
    message = spread == null ? 'Need gust reading' : 'Too gusty';
  } else if (!waveCapOk) {
    message = reading.wave_height == null ? 'Need wave reading' : 'Waves too high';
  } else if (!windCapOk) {
    message = reading.wind_avg == null ? 'Need wind reading' : 'Wind too strong';
  } else if (!dirOk) {
    message = reading.wind_direction == null ? 'Need direction' : 'Wrong direction';
  } else if (sustainedMs < requiredMs) {
    message = `Holding · ${valueText}`;
  } else if (shouldNotify) {
    message = `Alert · ${valueText}`;
  } else {
    message = `On target · ${valueText}`;
  }

  return {
    result: {
      reading,
      metricValue: value,
      conditionMet,
      sustainedMs,
      shouldNotify,
      message,
    },
    nextState: {
      conditionSinceMs,
      notifiedForRun,
      lastCheckMs: nowMs,
      lastValue: value,
      lastError: null,
      lastStationId: station.stationId,
    },
  };
}

export async function runStationCheck(
  station: FollowedStation,
  prev: AlertState,
): Promise<{ result: CheckResult; nextState: AlertState }> {
  if (!String(station.stationId ?? '').trim()) {
    return {
      result: {
        reading: null,
        metricValue: null,
        conditionMet: false,
        sustainedMs: 0,
        shouldNotify: false,
        message: 'Set a Windguru station ID to start',
      },
      nextState: {
        ...prev,
        lastCheckMs: Date.now(),
        lastError: 'Missing station ID',
        lastStationId: String(station.stationId ?? ''),
      },
    };
  }

  const hours = Math.max(1, Math.ceil((station.rule.sustainedMinutes + 20) / 60));
  const pollId = String(station.liveStationId || station.stationId || '').trim();
  const [reading, history] = await Promise.all([
    fetchCurrentReading(pollId),
    fetchRecentHistory(pollId, station.rule.metric, hours, 10),
  ]);

  const evaluated = evaluateAlert(reading, history, station, prev);
  if (!isForecastOnlySpot(station)) {
    return {
      result: { ...evaluated.result, forecast: null, forecastModel: null },
      nextState: evaluated.nextState,
    };
  }
  try {
    const fc = await fetchSpotForecastNow(String(station.stationId).trim());
    return {
      result: {
        ...evaluated.result,
        forecast: fc.reading,
        forecastModel: fc.modelName,
      },
      nextState: evaluated.nextState,
    };
  } catch {
    return {
      result: { ...evaluated.result, forecast: null, forecastModel: null },
      nextState: evaluated.nextState,
    };
  }
}

export async function runAllStationChecks(
  stations: FollowedStation[],
  states: Record<string, AlertState>,
): Promise<{
  results: Array<{ station: FollowedStation; result: CheckResult; nextState: AlertState }>;
  nextStates: Record<string, AlertState>;
}> {
  const nextStates = { ...states };
  const results: Array<{ station: FollowedStation; result: CheckResult; nextState: AlertState }> =
    [];

  for (const station of stations) {
    if (!String(station.stationId ?? '').trim()) continue;
    const prev = { ...DEFAULT_ALERT_STATE, ...(states[station.id] ?? {}) };
    try {
      const { result, nextState } = await runStationCheck(station, prev);
      nextStates[station.id] = nextState;
      results.push({ station, result, nextState });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Check failed';
      const nextState: AlertState = {
        ...prev,
        lastCheckMs: Date.now(),
        lastError: message,
        lastStationId: station.stationId,
      };
      nextStates[station.id] = nextState;
      results.push({
        station,
        result: {
          reading: null,
          metricValue: null,
          conditionMet: false,
          sustainedMs: 0,
          shouldNotify: false,
          message,
          forecast: null,
          forecastModel: null,
        },
        nextState,
      });
    }
  }

  return { results, nextStates };
}

export function formatDuration(ms: number): string {
  const totalMin = Math.max(0, Math.floor(ms / 60000));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h <= 0) return `${m}m`;
  return `${h}h ${m}m`;
}
