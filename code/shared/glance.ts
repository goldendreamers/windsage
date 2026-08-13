import type { AlertState, CheckResult, FollowedStation, StationReading } from './types';
import { displayName } from './defaults';

export type GlanceTrend = 'up' | 'down' | 'flat' | 'unknown';

export type GlanceRow = {
  id: string;
  name: string;
  /** How far from threshold (0 = at/over). Lower = closer to going off. */
  gap: number;
  /** 0–1 progress through sustained hold when condition is met. */
  holdProgress: number;
  holding: boolean;
  notifying: boolean;
  trend: GlanceTrend;
  wind: number | null;
  line: string;
};

function metricOf(
  station: FollowedStation,
  reading: StationReading | null,
  result: CheckResult | null,
): number | null {
  const r = result?.reading ?? reading;
  const f = result?.forecast;
  const src = r?.wind_avg != null || r?.wind_max != null ? r : f;
  if (!src) return result?.metricValue ?? null;
  switch (station.rule.metric) {
    case 'wind_max':
      return src.wind_max;
    case 'temperature':
      return src.temperature;
    case 'wave_height':
      return src.wave_height;
    case 'wind_avg':
    default:
      return src.wind_avg;
  }
}

function gapToThreshold(station: FollowedStation, value: number | null): number {
  if (value == null || !Number.isFinite(value)) return Number.POSITIVE_INFINITY;
  const thr = station.rule.threshold;
  if (station.rule.comparison === 'gte') return Math.max(0, thr - value);
  return Math.max(0, value - thr);
}

function trendOf(prev: number | null | undefined, cur: number | null): GlanceTrend {
  if (prev == null || cur == null || !Number.isFinite(prev) || !Number.isFinite(cur)) {
    return 'unknown';
  }
  const d = cur - prev;
  if (Math.abs(d) < 0.3) return 'flat';
  return d > 0 ? 'up' : 'down';
}

function arrow(t: GlanceTrend): string {
  if (t === 'up') return '↑';
  if (t === 'down') return '↓';
  if (t === 'flat') return '→';
  return '';
}

export function buildGlanceRows(
  stations: FollowedStation[],
  live: Record<
    string,
    {
      reading: StationReading | null;
      result: CheckResult | null;
      alertState?: AlertState;
    }
  >,
): GlanceRow[] {
  const rows: GlanceRow[] = [];
  for (const station of stations) {
    if (station.enabled === false) continue;
    const item = live[station.id];
    const result = item?.result ?? null;
    const reading = item?.reading ?? null;
    const alertState = item?.alertState;
    const value = metricOf(station, reading, result);
    const gap = gapToThreshold(station, value);
    const requiredMs = Math.max(1, station.rule.sustainedMinutes) * 60_000;
    const sustainedMs = result?.sustainedMs ?? 0;
    const holding = !!result?.conditionMet;
    const holdProgress = holding ? Math.min(1, sustainedMs / requiredMs) : 0;
    const trend = trendOf(alertState?.lastValue, value);
    const wind = value;
    const name = displayName(station);
    const unit =
      station.rule.metric === 'temperature'
        ? '°C'
        : station.rule.metric === 'wave_height'
          ? 'm'
          : 'kt';
    let line: string;
    if (result?.shouldNotify || (holding && holdProgress >= 1)) {
      line = `${name} · ready / holding ${arrow(trend)}`.trim();
    } else if (holding) {
      const mins = Math.max(1, Math.round((requiredMs - sustainedMs) / 60_000));
      line = `${name} · holding · ${mins}m left ${arrow(trend)}`.trim();
    } else if (Number.isFinite(gap) && gap === 0) {
      line = `${name} · at threshold ${arrow(trend)}`.trim();
    } else if (Number.isFinite(gap)) {
      line = `${name} · ${gap.toFixed(1)}${unit} shy ${arrow(trend)}`.trim();
    } else {
      line = `${name} · waiting on reading`;
    }
    rows.push({
      id: station.id,
      name,
      gap,
      holdProgress,
      holding,
      notifying: !!result?.shouldNotify,
      trend,
      wind,
      line,
    });
  }
  rows.sort((a, b) => {
    if (a.notifying !== b.notifying) return a.notifying ? -1 : 1;
    if (a.holding !== b.holding) return a.holding ? -1 : 1;
    if (a.holding && b.holding) return b.holdProgress - a.holdProgress;
    return a.gap - b.gap;
  });
  return rows;
}

/** One-line home summary: closest / holding spot. */
export function glanceHeadline(rows: GlanceRow[]): string | null {
  if (!rows.length) return null;
  const top = rows[0];
  if (top.notifying || (top.holding && top.holdProgress >= 1)) {
    return `Going off: ${top.name}`;
  }
  if (top.holding) return `Closest: ${top.line.replace(/^.*?·\s*/, `${top.name} · `)}`;
  if (Number.isFinite(top.gap) && top.gap < Number.POSITIVE_INFINITY) {
    return `Closest: ${top.line}`;
  }
  return `Waiting on readings · ${rows.length} follow${rows.length === 1 ? '' : 's'}`;
}
