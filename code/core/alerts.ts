import { DEFAULT_ALERT_STATE } from '../shared/defaults';
import type {
  AlertState,
  CheckResult,
  FollowedStation,
  HistorySeries,
  StationReading,
} from '../shared/types';
import { fetchCurrentReading, fetchRecentHistory, metricLabel, metricUnit, metricValue } from './windguru';

function meetsRule(value: number | null, rule: FollowedStation['rule']): boolean {
  if (value === null) return false;
  return rule.comparison === 'gte' ? value >= rule.threshold : value <= rule.threshold;
}

function comparisonSymbol(rule: FollowedStation['rule']): string {
  return rule.comparison === 'gte' ? '≥' : '≤';
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
  const shouldNotify =
    station.enabled && conditionMet && sustainedMs >= requiredMs && !notifiedForRun;

  if (shouldNotify) {
    notifiedForRun = true;
  }

  const unit = metricUnit(metric);
  const label = metricLabel(metric);
  const valueText = value == null ? 'n/a' : `${value.toFixed(1)} ${unit}`;
  const cmp = comparisonSymbol(station.rule);
  const spreadText = spread == null ? 'n/a' : `${spread.toFixed(1)} kt`;
  const dirText =
    reading.wind_direction == null ? 'n/a' : `${Math.round(reading.wind_direction)}°`;
  const sectorText = formatDirectionSector(
    station.rule.windDirFromDeg ?? 0,
    station.rule.windDirToDeg ?? 360,
  );
  const maxWave = station.rule.maxWaveHeightM ?? 1.5;
  const maxWind = station.rule.maxWindKnots ?? 25;
  const waveText =
    reading.wave_height == null ? 'n/a' : `${reading.wave_height.toFixed(1)} m`;
  const windAvgText =
    reading.wind_avg == null ? 'n/a' : `${reading.wind_avg.toFixed(1)} kt`;

  let message: string;
  if (!station.enabled) {
    message = 'Monitoring paused';
  } else if (value == null) {
    message = `${label} is not reported by this station`;
  } else if (!metricOk) {
    message = `Waiting — ${label} ${valueText} (need ${cmp}${station.rule.threshold} ${unit})`;
  } else if (!spreadOk) {
    message =
      spread == null
        ? `Waiting — need gust + avg to check spread (limit ≤${maxSpread} kt)`
        : `Too gusty — spread ${spreadText} (limit ≤${maxSpread} kt)`;
  } else if (!waveCapOk) {
    message =
      reading.wave_height == null
        ? `Waiting — need wave height (max ≤${maxWave} m)`
        : `Waves too big — ${waveText} (max ≤${maxWave} m)`;
  } else if (!windCapOk) {
    message =
      reading.wind_avg == null
        ? `Waiting — need wind avg (max ≤${maxWind} kt)`
        : `Wind too strong — ${windAvgText} (max ≤${maxWind} kt)`;
  } else if (!dirOk) {
    message =
      reading.wind_direction == null
        ? `Waiting — need wind direction (limit ${sectorText})`
        : `Wrong direction — ${dirText} (need ${sectorText})`;
  } else if (sustainedMs < requiredMs) {
    const heldMin = Math.floor(sustainedMs / 60000);
    message = spreadEnabled
      ? `Holding ${valueText} · spread ${spreadText} for ${heldMin}/${station.rule.sustainedMinutes} min`
      : `Holding ${valueText} for ${heldMin}/${station.rule.sustainedMinutes} min`;
  } else if (shouldNotify) {
    const extras = [
      spreadEnabled ? `spread ≤${maxSpread} kt` : null,
      station.rule.maxWaveEnabled && windPrimary ? `wave ≤${maxWave} m` : null,
      station.rule.maxWindEnabled && wavePrimary ? `wind ≤${maxWind} kt` : null,
      station.rule.windDirEnabled && dirApplicable ? `dir ${dirText}` : null,
    ].filter(Boolean);
    message = `Alert — ${label} ${cmp}${station.rule.threshold} ${unit} for ${station.rule.sustainedMinutes}+ min (now ${valueText}${extras.length ? `, ${extras.join(', ')}` : ''})`;
  } else {
    message = `Condition still met (${valueText}${spreadEnabled ? `, spread ${spreadText}` : ''}). Already notified for this run.`;
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
  if (!station.stationId.trim()) {
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
        lastStationId: station.stationId,
      },
    };
  }

  const hours = Math.max(1, Math.ceil((station.rule.sustainedMinutes + 20) / 60));
  const [reading, history] = await Promise.all([
    fetchCurrentReading(station.stationId),
    fetchRecentHistory(station.stationId, station.rule.metric, hours, 10),
  ]);

  return evaluateAlert(reading, history, station, prev);
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
    if (!station.stationId.trim()) continue;
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
