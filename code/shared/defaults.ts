import { normalizeProvider, type StationProvider } from './providers';
import type {
  AlertRule,
  AlertState,
  AppSettings,
  Comparison,
  FollowedStation,
  MetricKey,
  NotifyChannel,
  NotifyPrefs,
  NotifyPreset,
  WindguruKind,
} from './types';

export type { NotifyChannel, NotifyHow, NotifyPrefs, NotifyPreset } from './types';

/** Primary alert defaults per metric (threshold units match the metric). */
export const METRIC_DEFAULTS: Record<
  MetricKey,
  { threshold: number; comparison: Comparison; sustainedMinutes: number }
> = {
  wind_avg: { threshold: 15, comparison: 'gte', sustainedMinutes: 20 },
  wind_max: { threshold: 20, comparison: 'gte', sustainedMinutes: 20 },
  wave_height: { threshold: 1.0, comparison: 'gte', sustainedMinutes: 20 },
  temperature: { threshold: 22, comparison: 'gte', sustainedMinutes: 20 },
};

export const DEFAULT_RULE: AlertRule = {
  metric: 'wind_avg',
  threshold: METRIC_DEFAULTS.wind_avg.threshold,
  comparison: METRIC_DEFAULTS.wind_avg.comparison,
  sustainedMinutes: METRIC_DEFAULTS.wind_avg.sustainedMinutes,
  maxGustSpreadEnabled: false,
  maxGustSpreadKnots: 5,
  windDirEnabled: false,
  windDirFromDeg: 0,
  windDirToDeg: 360,
  maxWaveEnabled: false,
  maxWaveHeightM: 1.5,
  maxWindEnabled: false,
  maxWindKnots: 25,
  minWindEnabled: false,
  minWindKnots: 12,
  maxGustEnabled: false,
  maxGustKnots: 30,
  minTempEnabled: false,
  minTempC: 10,
  maxTempEnabled: false,
  maxTempC: 32,
};

/** When the user switches metric, apply that metric’s primary defaults. */
export function ruleForMetric(rule: AlertRule, metric: MetricKey): AlertRule {
  const defaults = METRIC_DEFAULTS[metric];
  return {
    ...rule,
    metric,
    threshold: defaults.threshold,
    comparison: defaults.comparison,
    sustainedMinutes: defaults.sustainedMinutes,
  };
}

export const DEFAULT_NOTIFY_PREFS: NotifyPrefs = {
  preset: 'normal',
  timesPerDay: 1,
  how: ['phone'],
};

export const DEFAULT_SETTINGS: AppSettings = {
  stations: [],
  pollIntervalMinutes: 10,
  simpleMode: true,
  accountId: null,
  notifyPrefs: { ...DEFAULT_NOTIFY_PREFS },
};

export const DEFAULT_ALERT_STATE: AlertState = {
  conditionSinceMs: null,
  notifiedForRun: false,
  lastCheckMs: null,
  lastValue: null,
  lastError: null,
  lastStationId: null,
  lastNotifyMs: null,
  notifyDayUtc: null,
  notifyCountToday: 0,
};

const NOTIFY_PRESETS = new Set(['annoying', 'normal', 'quiet', 'custom']);
const NOTIFY_CHANNELS: NotifyChannel[] = ['phone', 'email', 'discord'];
const ANNOYING_INTERVAL_MIN = 10;

export function parseNotifyHow(raw: unknown): NotifyChannel[] {
  const src = Array.isArray(raw)
    ? raw
    : raw === 'both'
      ? ['phone', 'email']
      : raw == null || raw === ''
        ? []
        : [raw];
  const seen = new Set<NotifyChannel>();
  for (const item of src) {
    if (item === 'phone' || item === 'email' || item === 'discord') seen.add(item);
  }
  const ordered = NOTIFY_CHANNELS.filter((channel) => seen.has(channel));
  return ordered.length ? ordered : ['phone'];
}

export function notifyChannelsOf(prefs: NotifyPrefs | null | undefined): NotifyChannel[] {
  const n = normalizeNotifyPrefs(prefs);
  if (n.preset === 'quiet') return ['email'];
  if (n.preset === 'custom') return parseNotifyHow(n.how);
  return ['phone'];
}

export function toggleNotifyChannel(
  current: NotifyChannel[] | null | undefined,
  channel: NotifyChannel,
): NotifyChannel[] {
  const have = parseNotifyHow(current);
  const on = have.includes(channel);
  if (on) {
    const next = have.filter((item) => item !== channel);
    return next.length ? next : have;
  }
  return parseNotifyHow([...have, channel]);
}

export function utcDayKey(nowMs = Date.now()): string {
  return new Date(nowMs).toISOString().slice(0, 10);
}

export function normalizeNotifyPrefs(raw: unknown): NotifyPrefs {
  const src = raw && typeof raw === 'object' ? (raw as Partial<NotifyPrefs>) : {};
  const preset = NOTIFY_PRESETS.has(String(src.preset))
    ? (src.preset as NotifyPreset)
    : 'normal';
  const how = parseNotifyHow(src.how);
  const n = Math.trunc(Number(src.timesPerDay));
  const timesPerDay = Number.isFinite(n) ? Math.min(24, Math.max(1, n)) : 1;
  return { preset, timesPerDay, how };
}

export type ResolvedNotifyPrefs = {
  preset: NotifyPreset;
  maxPerDay: number | null;
  minIntervalMinutes: number;
  push: boolean;
  email: boolean;
  discord: boolean;
  needsGoogle: boolean;
  googleMissing: boolean;
  needsDiscord: boolean;
  discordMissing: boolean;
};

function resolvedChannels(
  channels: NotifyChannel[],
  opts?: { hasGoogleEmail?: boolean; hasDiscordAlert?: boolean },
): Pick<
  ResolvedNotifyPrefs,
  'push' | 'email' | 'discord' | 'needsGoogle' | 'googleMissing' | 'needsDiscord' | 'discordMissing'
> {
  const hasGoogle = opts?.hasGoogleEmail === true;
  const hasDiscord = opts?.hasDiscordAlert === true;
  const wantEmail = channels.includes('email');
  const wantDiscord = channels.includes('discord');
  return {
    push: channels.includes('phone'),
    email: wantEmail && hasGoogle,
    discord: wantDiscord && hasDiscord,
    needsGoogle: wantEmail,
    googleMissing: wantEmail && !hasGoogle,
    needsDiscord: wantDiscord,
    discordMissing: wantDiscord && !hasDiscord,
  };
}

export function resolveNotifyPrefs(
  prefs: NotifyPrefs | null | undefined,
  opts?: { hasGoogleEmail?: boolean; hasDiscordAlert?: boolean },
): ResolvedNotifyPrefs {
  const n = normalizeNotifyPrefs(prefs);
  if (n.preset === 'annoying') {
    return {
      preset: 'annoying',
      maxPerDay: null,
      minIntervalMinutes: ANNOYING_INTERVAL_MIN,
      ...resolvedChannels(['phone'], opts),
    };
  }
  if (n.preset === 'quiet') {
    return {
      preset: 'quiet',
      maxPerDay: 1,
      minIntervalMinutes: 24 * 60,
      ...resolvedChannels(['email'], opts),
    };
  }
  if (n.preset === 'custom') {
    const times = n.timesPerDay ?? 1;
    return {
      preset: 'custom',
      maxPerDay: times,
      minIntervalMinutes: Math.max(ANNOYING_INTERVAL_MIN, Math.floor((24 * 60) / times)),
      ...resolvedChannels(parseNotifyHow(n.how), opts),
    };
  }
  return {
    preset: 'normal',
    maxPerDay: 1,
    minIntervalMinutes: 24 * 60,
    ...resolvedChannels(['phone'], opts),
  };
}

export function notifyPrefsSummary(prefs: NotifyPrefs | null | undefined): string {
  const n = normalizeNotifyPrefs(prefs);
  if (n.preset === 'annoying') return 'Annoying · every 10 min';
  if (n.preset === 'quiet') return 'Quiet · email only';
  if (n.preset === 'custom') {
    const how = parseNotifyHow(n.how).join(' + ');
    const times = n.timesPerDay ?? 1;
    return `Custom · ${times}× a day · ${how}`;
  }
  return 'Normal · once a day';
}

export function alertNotifyDue(
  prev: Pick<AlertState, 'notifiedForRun' | 'lastCheckMs' | 'lastNotifyMs' | 'notifyDayUtc' | 'notifyCountToday'> | null | undefined,
  resolved: ResolvedNotifyPrefs,
  nowMs = Date.now(),
): boolean {
  if (!resolved.push && !resolved.email && !resolved.discord) return false;
  const day = utcDayKey(nowMs);
  const count =
    prev?.notifyDayUtc === day ? Math.max(0, Number(prev.notifyCountToday) || 0) : 0;
  if (resolved.maxPerDay != null && count >= resolved.maxPerDay) return false;
  const lastRaw = prev?.lastNotifyMs;
  const lastMs =
    typeof lastRaw === 'number' && Number.isFinite(lastRaw)
      ? lastRaw
      : prev?.notifiedForRun &&
          typeof prev.lastCheckMs === 'number' &&
          Number.isFinite(prev.lastCheckMs)
        ? prev.lastCheckMs
        : null;
  if (lastMs != null && nowMs - lastMs < resolved.minIntervalMinutes * 60 * 1000) return false;
  if (prev?.notifiedForRun && lastMs == null) return false;
  return true;
}

export function stampAlertNotify(
  prev: AlertState,
  nowMs = Date.now(),
): Pick<AlertState, 'lastNotifyMs' | 'notifyDayUtc' | 'notifyCountToday'> {
  const day = utcDayKey(nowMs);
  const count = prev.notifyDayUtc === day ? Math.max(0, Number(prev.notifyCountToday) || 0) : 0;
  return {
    lastNotifyMs: nowMs,
    notifyDayUtc: day,
    notifyCountToday: count + 1,
  };
}

export const METRIC_OPTIONS = [
  {
    key: 'wind_avg' as const,
    label: 'Wind speed (avg)',
    unit: 'kt',
    hint: 'Average wind from the station',
  },
  {
    key: 'wind_max' as const,
    label: 'Wind gust (max)',
    unit: 'kt',
    hint: 'Peak gust in the sample',
  },
  {
    key: 'temperature' as const,
    label: 'Temperature',
    unit: '°C',
    hint: 'Air temperature if the station reports it',
  },
  {
    key: 'wave_height' as const,
    label: 'Wave height',
    unit: 'm',
    hint: 'Only if the station publishes wave data',
  },
];

export const BACKGROUND_TASK_NAME = 'WINDSAGE_POLL_TASK';

export function metricUnitShort(metric: MetricKey): string {
  if (metric === 'temperature') return '°C';
  if (metric === 'wave_height') return 'm';
  return 'kt';
}

export function formatThresholdNumber(value: number): string {
  if (!Number.isFinite(value)) return '—';
  const rounded = Math.round(value * 10) / 10;
  return Math.abs(rounded - Math.round(rounded)) < 0.05
    ? String(Math.round(rounded))
    : rounded.toFixed(1);
}

/** Live reading for home/detail pills — em dash when missing. */
export function formatReadingNumber(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(Number(value))) return '—';
  return formatThresholdNumber(Number(value));
}

/** Eight-point compass, meteorological “from”. 90 → east, 225 → south-west. */
const COMPASS_8 = [
  'north',
  'north-east',
  'east',
  'south-east',
  'south',
  'south-west',
  'west',
  'north-west',
] as const;

export function windDirectionName(deg: number | null | undefined): string | null {
  if (deg == null || !Number.isFinite(Number(deg))) return null;
  const d = ((Number(deg) % 360) + 360) % 360;
  const idx = Math.round(d / 45) % 8;
  return COMPASS_8[idx];
}

/** Meteorological “from” in whole degrees, 0–359. */
export function windDirectionDeg(deg: number | null | undefined): number | null {
  if (deg == null || !Number.isFinite(Number(deg))) return null;
  return Math.round(((Number(deg) % 360) + 360) % 360) % 360;
}

/** Simple mode: compass words. Advanced: exact degrees. */
export function formatWindFromDisplay(
  deg: number | null | undefined,
  simpleMode: boolean,
): { value: string | number | null; unit: string } {
  if (simpleMode) return { value: windDirectionName(deg), unit: '' };
  const n = windDirectionDeg(deg);
  return { value: n, unit: n == null ? '' : '°' };
}

export type HomeLiveStat = { label: string; value: string; unit: string };

/**
 * Home-card live columns for the active alert metric.
 * Wind keeps avg+gust; temp/wave show that reading only (no wind columns).
 */
export function homeLiveStatColumns(
  metric: MetricKey,
  reading: {
    wind_avg?: number | null;
    wind_max?: number | null;
    temperature?: number | null;
    wave_height?: number | null;
  } | null | undefined,
  showingForecast = false,
): HomeLiveStat[] {
  const fcst = showingForecast;
  const avg = formatReadingNumber(reading?.wind_avg);
  const gust = formatReadingNumber(reading?.wind_max);
  const temp = formatReadingNumber(reading?.temperature);
  const wave = formatReadingNumber(reading?.wave_height);

  switch (metric) {
    case 'temperature':
      return [{ label: fcst ? 'Fcst temp' : 'Temp', value: temp, unit: '°C' }];
    case 'wave_height':
      return [{ label: fcst ? 'Fcst wave' : 'Wave', value: wave, unit: 'm' }];
    case 'wind_max':
      return [
        { label: fcst ? 'Fcst gust' : 'Gust', value: gust, unit: 'kt' },
        { label: fcst ? 'Fcst avg' : 'Avg', value: avg, unit: 'kt' },
      ];
    case 'wind_avg':
    default:
      return [
        { label: fcst ? 'Fcst avg' : 'Avg', value: avg, unit: 'kt' },
        { label: fcst ? 'Fcst gust' : 'Gust', value: gust, unit: 'kt' },
      ];
  }
}

/**
 * The alert threshold — not the live reading.
 * short: "15 kt"   full: "≥15 kt for 20 min"
 */
export function formatAlertTrigger(
  rule: AlertRule,
  style: 'short' | 'full' = 'short',
  opts?: { directionWords?: boolean },
): string {
  const cmp = rule.comparison === 'lte' ? '≤' : '≥';
  const unit = metricUnitShort(rule.metric);
  const thr = formatThresholdNumber(Number(rule.threshold));
  const mins = Math.max(1, Number(rule.sustainedMinutes) || 1);
  if (style === 'short') return `${thr} ${unit}`;
  const metricBit =
    rule.metric === 'wind_max'
      ? 'gust '
      : rule.metric === 'temperature'
        ? 'temp '
        : rule.metric === 'wave_height'
          ? 'waves '
          : '';
  const core = `${metricBit}${cmp}${thr} ${unit}`;
  const extras: string[] = [];
  if (rule.maxGustSpreadEnabled) {
    extras.push(`spread ≤${formatThresholdNumber(rule.maxGustSpreadKnots ?? 5)} kt`);
  }
  if (rule.windDirEnabled) {
    const words = opts?.directionWords !== false;
    if (words) {
      const from = windDirectionName(rule.windDirFromDeg) || 'north';
      const to = windDirectionName(rule.windDirToDeg) || 'north';
      extras.push(from === to ? `from ${from}` : `from ${from}–${to}`);
    } else {
      const from = windDirectionDeg(rule.windDirFromDeg) ?? 0;
      const to = windDirectionDeg(rule.windDirToDeg) ?? 0;
      extras.push(from === to ? `from ${from}°` : `from ${from}–${to}°`);
    }
  }
  const windPrimary = rule.metric === 'wind_avg' || rule.metric === 'wind_max';
  if (windPrimary && rule.maxWaveEnabled) {
    extras.push(`waves ≤${formatThresholdNumber(rule.maxWaveHeightM ?? 1.5)} m`);
  }
  if (rule.metric === 'wind_avg' && rule.maxGustEnabled) {
    extras.push(`gust ≤${formatThresholdNumber(rule.maxGustKnots ?? 30)} kt`);
  }
  if (rule.metric === 'wave_height' && rule.minWindEnabled) {
    extras.push(`wind ≥${formatThresholdNumber(rule.minWindKnots ?? 12)} kt`);
  }
  if (rule.metric === 'wave_height' && rule.maxWindEnabled) {
    extras.push(`wind ≤${formatThresholdNumber(rule.maxWindKnots ?? 25)} kt`);
  }
  if (rule.minTempEnabled) {
    extras.push(`temp ≥${formatThresholdNumber(rule.minTempC ?? 10)}°C`);
  }
  if (rule.maxTempEnabled) {
    extras.push(`temp ≤${formatThresholdNumber(rule.maxTempC ?? 32)}°C`);
  }
  const hold = `for ${mins} min`;
  return extras.length ? `${core} ${hold} · ${extras.join(' · ')}` : `${core} ${hold}`;
}

/**
 * Home/detail Alert number — always the rule threshold.
 * Never use CheckResult.message here: after a cloud check that string is the
 * live reading (e.g. "10.2 kt") and would replace the threshold in the UI.
 */
export function alertThresholdDisplay(rule: AlertRule): { value: string; unit: string } {
  return {
    value: formatThresholdNumber(Number(rule.threshold)),
    unit: metricUnitShort(rule.metric),
  };
}

/** Short condition label with no live reading — safe next to the Alert threshold. */
export function alertConditionLabel(message: string | null | undefined): string | null {
  const raw = String(message ?? '').trim();
  if (!raw) return null;
  if (raw === 'Paused') return 'Paused';
  if (raw === 'No reading') return 'No reading';
  if (/^Holding\b/i.test(raw)) return 'Holding';
  if (/^Alert\b/i.test(raw)) return 'Fired';
  if (/^On target\b/i.test(raw)) return 'On target';
  if (/too gusty/i.test(raw)) return 'Too gusty';
  if (/waves too high/i.test(raw)) return 'Waves too high';
  if (/wind too strong/i.test(raw)) return 'Wind too strong';
  if (/wind too light/i.test(raw)) return 'Wind too light';
  if (/gusts too high/i.test(raw)) return 'Gusts too high';
  if (/too cold/i.test(raw)) return 'Too cold';
  if (/too hot/i.test(raw)) return 'Too hot';
  if (/wrong direction/i.test(raw)) return 'Wrong direction';
  if (/need /i.test(raw)) return raw;
  // Bare live reading like "10.2 kt" / "21 °C" — not a condition label.
  if (/^-?\d+(\.\d+)?\s*(kt|m|°C)?$/i.test(raw)) return null;
  return raw;
}

export function stationProvider(station: Pick<FollowedStation, 'provider'> | null | undefined): StationProvider {
  return normalizeProvider(station?.provider);
}

export function followIdentityKey(
  station: Pick<FollowedStation, 'provider' | 'stationId'> | null | undefined,
): string {
  const sid = String(station?.stationId ?? '').trim();
  if (!sid) return '';
  return `${normalizeProvider(station?.provider)}:${sid}`;
}

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const WEEK_MS = 7 * DAY_MS;

export type MonitoringDurationPreset = 'day' | 'week' | 'forever';
export type MonitoringCustomUnit = 'hours' | 'days';

export function normalizeMonitoringUntilMs(raw: unknown): number | null | undefined {
  if (raw === undefined) return undefined;
  if (raw === null) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/** Timestamp to auto-flip monitoring, or `null` for forever. */
export function monitoringUntilMsForPreset(
  preset: MonitoringDurationPreset,
  nowMs = Date.now(),
): number | null {
  if (preset === 'forever') return null;
  if (preset === 'week') return nowMs + WEEK_MS;
  return nowMs + DAY_MS;
}

export function monitoringUntilMsForCustomHours(hours: number, nowMs = Date.now()): number {
  const h = Math.max(1, Math.trunc(Number(hours) || 0));
  return nowMs + h * HOUR_MS;
}

export function monitoringUntilMsForCustomAmount(
  amount: number,
  unit: MonitoringCustomUnit,
  nowMs = Date.now(),
): number {
  const n = Math.max(1, Math.trunc(Number(amount) || 0));
  return monitoringUntilMsForCustomHours(unit === 'days' ? n * 24 : n, nowMs);
}

/**
 * When `monitoringUntilMs` is in the past, flip `enabled` and clear the timer.
 * Pause-for-a-day resumes; keep-on-for-a-day pauses. Forever (`null`) is a no-op.
 */
export function applyMonitoringSchedule<T extends { enabled?: boolean; monitoringUntilMs?: number | null }>(
  station: T,
  nowMs = Date.now(),
): T {
  if (!station) return station;
  const raw = station.monitoringUntilMs;
  if (raw == null) return station;
  const untilMs = Number(raw);
  if (!Number.isFinite(untilMs) || untilMs > nowMs) return station;
  const currentlyOn = station.enabled !== false;
  return {
    ...station,
    enabled: !currentlyOn,
    monitoringUntilMs: null,
  };
}

export function applyMonitoringSchedules<T extends { enabled?: boolean; monitoringUntilMs?: number | null }>(
  stations: T[] | null | undefined,
  nowMs = Date.now(),
): { stations: T[]; changed: boolean } {
  const list = Array.isArray(stations) ? stations : [];
  let changed = false;
  const next = list.map((station) => {
    const applied = applyMonitoringSchedule(station, nowMs);
    if (applied !== station) changed = true;
    return applied;
  });
  return { stations: next, changed };
}

export function formatMonitoringUntilClock(untilMs: number, nowMs = Date.now()): string {
  const d = new Date(untilMs);
  const now = new Date(nowMs);
  const opts: Intl.DateTimeFormatOptions = {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  };
  if (d.getFullYear() !== now.getFullYear()) opts.year = 'numeric';
  return d.toLocaleString(undefined, opts);
}

export type MonitoringScheduleSummary = {
  on: boolean;
  untilMs: number | null;
  homeLabel: string | null;
  cardBit: string;
  detailHint: string | null;
};

/** Labels for Home / station detail after applying any expired timer. */
export function monitoringScheduleSummary(
  station: { enabled?: boolean; monitoringUntilMs?: number | null } | null | undefined,
  nowMs = Date.now(),
): MonitoringScheduleSummary {
  if (!station) {
    return { on: true, untilMs: null, homeLabel: null, cardBit: '', detailHint: null };
  }
  const applied = applyMonitoringSchedule(station, nowMs);
  const on = applied.enabled !== false;
  const untilRaw = applied.monitoringUntilMs;
  const untilMs = untilRaw == null ? null : Number(untilRaw);
  const hasUntil = untilMs != null && Number.isFinite(untilMs) && untilMs > nowMs;
  const when = hasUntil && untilMs != null ? formatMonitoringUntilClock(untilMs, nowMs) : null;
  if (on) {
    return {
      on: true,
      untilMs: hasUntil ? untilMs : null,
      homeLabel: when ? `On until ${when}` : null,
      cardBit: when ? ` · on until ${when}` : '',
      detailHint: when ? `Alerts stay on until ${when}` : null,
    };
  }
  return {
    on: false,
    untilMs: hasUntil ? untilMs : null,
    homeLabel: when ? `Paused until ${when}` : 'Alerts off',
    cardBit: when ? ` · paused until ${when}` : ' · paused',
    detailHint: when ? `Paused until ${when}` : 'Alerts are off',
  };
}

/** Union two follow lists. Primary wins on the same provider:id; extra adds new ones. */
export function mergeFollowedStations(
  primary: FollowedStation[] | null | undefined,
  extra: FollowedStation[] | null | undefined,
): FollowedStation[] {
  const map = new Map<string, FollowedStation>();
  for (const station of primary || []) {
    const key = followIdentityKey(station);
    if (key) map.set(key, station);
  }
  for (const station of extra || []) {
    const key = followIdentityKey(station);
    if (!key || map.has(key)) continue;
    map.set(key, station);
  }
  return [...map.values()];
}

/** True when every cloud follow is already on the local list (local is a superset). */
export function cloudCoveredByLocal(
  cloud: FollowedStation[] | null | undefined,
  local: FollowedStation[] | null | undefined,
): boolean {
  const rows = cloud || [];
  if (!rows.length) return false;
  const localKeys = new Set(
    (local || []).map((station) => followIdentityKey(station)).filter(Boolean),
  );
  return rows.every((station) => {
    const key = followIdentityKey(station);
    return !!key && localKeys.has(key);
  });
}

export function createFollowedStation(
  stationId: string,
  nickname = '',
  partial?: Partial<FollowedStation>,
): FollowedStation {
  const id =
    partial?.id ??
    `st_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const kind: WindguruKind = partial?.kind === 'spot' ? 'spot' : 'station';
  return {
    id,
    provider: normalizeProvider(partial?.provider),
    stationId: String(stationId ?? '').trim(),
    kind,
    nickname: String(nickname ?? '').trim(),
    sourceName: String(partial?.sourceName ?? '').trim() || null,
    enabled: partial?.enabled !== false,
    monitoringUntilMs: normalizeMonitoringUntilMs(partial?.monitoringUntilMs),
    rule: { ...DEFAULT_RULE, ...(partial?.rule ?? {}) },
    liveStationId: partial?.liveStationId ?? null,
    linkedLiveStation: partial?.linkedLiveStation ?? null,
    liveLinkWarning: partial?.liveLinkWarning ?? null,
    locationBlend: partial?.locationBlend ?? null,
    starred: partial?.starred === true,
    wakeOnWind: partial?.wakeOnWind === true,
    wakeOnWindVia: partial?.wakeOnWindVia === 'discord' ? 'discord' : 'native',
  };
}

export type ExtraLimitKey =
  | 'maxWave'
  | 'gustSpread'
  | 'maxGust'
  | 'windDir'
  | 'minWind'
  | 'maxWind'
  | 'minTemp'
  | 'maxTemp';

/** Extra caps that apply to this primary metric (advanced “Add a limit”). */
export function extraLimitsForMetric(metric: MetricKey): ExtraLimitKey[] {
  if (metric === 'wind_avg') {
    return ['maxWave', 'gustSpread', 'maxGust', 'windDir', 'minTemp', 'maxTemp'];
  }
  if (metric === 'wind_max') {
    return ['maxWave', 'gustSpread', 'windDir', 'minTemp', 'maxTemp'];
  }
  if (metric === 'wave_height') {
    return ['minWind', 'maxWind', 'windDir', 'minTemp', 'maxTemp'];
  }
  return [];
}

export function extraLimitEnabled(rule: AlertRule, key: ExtraLimitKey): boolean {
  switch (key) {
    case 'maxWave':
      return !!rule.maxWaveEnabled;
    case 'gustSpread':
      return !!rule.maxGustSpreadEnabled;
    case 'maxGust':
      return !!rule.maxGustEnabled;
    case 'windDir':
      return !!rule.windDirEnabled;
    case 'minWind':
      return !!rule.minWindEnabled;
    case 'maxWind':
      return !!rule.maxWindEnabled;
    case 'minTemp':
      return !!rule.minTempEnabled;
    case 'maxTemp':
      return !!rule.maxTempEnabled;
  }
}

export function setExtraLimitEnabled(rule: AlertRule, key: ExtraLimitKey, on: boolean): AlertRule {
  switch (key) {
    case 'maxWave':
      return { ...rule, maxWaveEnabled: on };
    case 'gustSpread':
      return { ...rule, maxGustSpreadEnabled: on };
    case 'maxGust':
      return { ...rule, maxGustEnabled: on };
    case 'windDir':
      return { ...rule, windDirEnabled: on };
    case 'minWind':
      return { ...rule, minWindEnabled: on };
    case 'maxWind':
      return { ...rule, maxWindEnabled: on };
    case 'minTemp':
      return { ...rule, minTempEnabled: on };
    case 'maxTemp':
      return { ...rule, maxTempEnabled: on };
  }
}

export const EXTRA_LIMIT_META: Record<
  ExtraLimitKey,
  { label: string; hint: string }
> = {
  maxWave: {
    label: 'Max wave height',
    hint: 'Skip the ping if waves are bigger than this',
  },
  gustSpread: {
    label: 'Gust − avg spread',
    hint: 'Skip when it is too gusty for the average',
  },
  maxGust: {
    label: 'Max gust',
    hint: 'Skip if peak gust is above this',
  },
  windDir: {
    label: 'Wind direction',
    hint: 'Only ping when wind is from this sector',
  },
  minWind: {
    label: 'Min wind',
    hint: 'Need at least this average wind with the waves',
  },
  maxWind: {
    label: 'Max wind',
    hint: 'Skip if average wind is stronger than this',
  },
  minTemp: {
    label: 'Min air temp',
    hint: 'Skip if it is colder than this',
  },
  maxTemp: {
    label: 'Max air temp',
    hint: 'Skip if it is warmer than this',
  },
};

export function parseLooseNumber(raw: string): number | null {
  const t = String(raw ?? '')
    .trim()
    .replace(',', '.');
  if (!t || t === '-' || t === '+' || t === '.' || t === '-.' || t === '+.') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export function isFollowStarred(
  station: Pick<FollowedStation, 'starred'> | null | undefined,
): boolean {
  return station?.starred === true;
}

/** Starred follows first, otherwise the stored array order. */
export function organizeFollows(stations: FollowedStation[]): FollowedStation[] {
  const starred: FollowedStation[] = [];
  const rest: FollowedStation[] = [];
  for (const s of stations || []) {
    if (isFollowStarred(s)) starred.push(s);
    else rest.push(s);
  }
  return [...starred, ...rest];
}

/** Swap a follow one step in the organized list. Will not cross the starred group. */
export function moveFollow(
  stations: FollowedStation[],
  id: string,
  delta: -1 | 1,
): FollowedStation[] {
  const displayed = organizeFollows(stations);
  const i = displayed.findIndex((s) => s.id === id);
  if (i < 0) return stations;
  const j = i + delta;
  if (j < 0 || j >= displayed.length) return stations;
  if (isFollowStarred(displayed[i]) !== isFollowStarred(displayed[j])) return stations;
  const next = displayed.slice();
  const a = next[i];
  const b = next[j];
  if (!a || !b) return stations;
  next[i] = b;
  next[j] = a;
  return organizeFollows(next);
}

export function toggleFollowStar(stations: FollowedStation[], id: string): FollowedStation[] {
  return organizeFollows(
    stations.map((s) => (s.id === id ? { ...s, starred: !isFollowStarred(s) } : s)),
  );
}

export function stationNick(station: Pick<FollowedStation, 'nickname'> | null | undefined): string {
  return String(station?.nickname ?? '').trim();
}

export function displayName(station: FollowedStation): string {
  const nick = stationNick(station);
  if (nick) return nick;
  return windguruName(station);
}

/** Official source name for a follow (ignores user nickname). */
export function windguruName(station: FollowedStation): string {
  const source = String(station.sourceName ?? '').trim();
  if (source) return source;
  const linked =
    String(station.linkedLiveStation?.spotname ?? '').trim() ||
    String(station.linkedLiveStation?.name ?? '').trim();
  if (linked) return linked;
  const sid = String(station.stationId ?? '').trim() || '?';
  const provider = stationProvider(station);
  if (provider === 'openmeteo') return `Open-Meteo ${sid}`;
  if (provider === 'location') return String(station.sourceName ?? '').trim() || `Map pin ${sid}`;
  if (provider === 'ndbc') return `NDBC ${sid}`;
  if (provider === 'synoptic') return `Synoptic ${sid}`;
  if (provider === 'tempest') return `Tempest ${sid}`;
  if (provider === 'windfinder') return `Windfinder ${sid}`;
  return station.kind === 'spot' ? `Spot ${sid}` : `Station ${sid}`;
}

/**
 * Short source reference for cards / detail subtitles (no provider prefix).
 * Map pins show address or coords — never "Spot/Station #…".
 */
export function followSourceRef(station: FollowedStation): string {
  const provider = stationProvider(station);
  if (provider === 'location') {
    const blend = station.locationBlend;
    const address = String(blend?.address ?? station.sourceName ?? '').trim();
    if (address) return address;
    if (blend && Number.isFinite(blend.lat) && Number.isFinite(blend.lon)) {
      return `${blend.lat.toFixed(3)}, ${blend.lon.toFixed(3)}`;
    }
    return 'Map pin';
  }
  const sid = String(station.stationId ?? '').trim() || '?';
  if (provider === 'windguru') {
    return `${station.kind === 'spot' ? 'Spot' : 'Station'} #${sid}`;
  }
  if (provider === 'openmeteo') return sid;
  return `#${sid}`;
}

/** Match a follow by provider + external id (`stationId`).

 * Do not match on `liveStationId`: many spots share one live sensor, and after
 * editing a follow to a new location the old spot ID must be free to follow again.
 */
export function findExistingFollow(
  stations: FollowedStation[],
  ids: {
    stationId?: string | null;
    provider?: StationProvider | string | null;
    /** @deprecated Ignored — kept so older call sites keep typing. */
    inputId?: string | null;
    /** @deprecated Ignored — live link is not a follow identity. */
    liveStationId?: string | null;
  },
): FollowedStation | null {
  const want = (ids.stationId ?? '').trim();
  if (!want) return null;
  const wantProvider = normalizeProvider(ids.provider);
  for (const station of stations) {
    if ((station.stationId ?? '').trim() !== want) continue;
    if (stationProvider(station) !== wantProvider) continue;
    return station;
  }
  return null;
}

/** Latin city spellings → native-script Windguru names. Keep in sync with catalogSearch.mjs. */
export const PLACE_NAME_ALIASES: Record<string, string[]> = {
  haifa: ['חיפה'],
  'tel aviv': ['תל אביב'],
  telaviv: ['תל אביב'],
  herzliya: ['הרצליה'],
  eilat: ['אילת'],
  ashkelon: ['אשקלון'],
  ashdod: ['אשדוד'],
  netanya: ['נתניה'],
  acre: ['עכו'],
  akko: ['עכו'],
  jerusalem: ['ירושלים'],
  tiberias: ['טבריה'],
};

/** Fold accents so "bobik" matches "Bobík" and "haifa" matches "Haïfa". */
export function foldSearchText(value: string): string {
  let s = String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  s = s
    .replace(/ł/g, 'l')
    .replace(/ø/g, 'o')
    .replace(/æ/g, 'ae')
    .replace(/œ/g, 'oe')
    .replace(/ß/g, 'ss')
    .replace(/đ/g, 'd');
  return s;
}

export function compactSearchText(value: string): string {
  return foldSearchText(value).replace(/[^a-z0-9]+/g, '');
}

function followMatchesQuery(station: FollowedStation, query: string): boolean {
  const qRaw = query.trim();
  const q = foldSearchText(qRaw);
  if (!q) return false;
  const digits = qRaw.replace(/\D/g, '');
  const label = foldSearchText(windguruName(station));
  const nick = foldSearchText(String(station.nickname ?? ''));
  const sid = foldSearchText(String(station.stationId ?? ''));
  const live = foldSearchText(String(station.liveStationId ?? ''));
  const compact = compactSearchText(windguruName(station) + ' ' + String(station.nickname ?? ''));
  const qCompact = compactSearchText(qRaw);
  return (
    label.includes(q) ||
    (nick && nick.includes(q)) ||
    sid.includes(q) ||
    (live && live.includes(q)) ||
    (qCompact.length >= 2 && compact.includes(qCompact)) ||
    (digits.length > 0 && (sid.includes(digits) || (live && live.includes(digits))))
  );
}

/** Typeahead filter over already-followed stations (Windguru name / ids / nickname). */
export function suggestExistingFollows(
  stations: FollowedStation[],
  query: string,
  limit = 6,
): FollowedStation[] {
  const q = query.trim();
  if (!q) return [];
  const out: FollowedStation[] = [];
  for (const station of stations) {
    if (!followMatchesQuery(station, q)) continue;
    out.push(station);
    if (out.length >= limit) break;
  }
  return out;
}

export type CatalogStation = Pick<
  FollowedStation,
  | 'provider'
  | 'stationId'
  | 'kind'
  | 'sourceName'
  | 'liveStationId'
  | 'linkedLiveStation'
  | 'liveLinkWarning'
>;

function catalogKey(provider: StationProvider | string | null | undefined, stationId: string) {
  return `${normalizeProvider(provider)}:${String(stationId ?? '').trim()}`;
}

/** Keep scoring in sync with code/cloud/lib/catalogSearch.mjs */
export function catalogMatchScore(entry: CatalogStation, query: string): number {
  const qRaw = String(query ?? '').trim();
  const q = foldSearchText(qRaw);
  if (!q) return 0;
  const digits = qRaw.replace(/\D/g, '');
  if (q.length < 2 && digits.length < 1) return 0;

  const sid = String(entry?.stationId ?? '').trim();
  const asFollow = {
    id: `catalog_${normalizeProvider(entry.provider)}_${sid}`,
    provider: normalizeProvider(entry.provider),
    stationId: sid,
    kind: entry.kind,
    nickname: '',
    sourceName: entry.sourceName ?? null,
    enabled: true,
    rule: DEFAULT_RULE,
    liveStationId: entry.liveStationId ?? null,
    linkedLiveStation: entry.linkedLiveStation ?? null,
    liveLinkWarning: entry.liveLinkWarning ?? null,
  } satisfies FollowedStation;
  const label = foldSearchText(windguruName(asFollow));
  const live = foldSearchText(String(entry.liveStationId ?? ''));
  const sidFold = foldSearchText(sid);
  const qCompact = compactSearchText(qRaw);
  const labelCompact = compactSearchText(windguruName(asFollow));

  if (label === q || sidFold === q) return 100;
  if (/windguru\.cz/i.test(qRaw) && digits && sid === digits) return 100;
  if (label.startsWith(q) || sidFold.startsWith(q)) return 90;
  if (label.split(/[\s,/._-]+/).some((w) => w.startsWith(q))) return 80;
  const aliases = PLACE_NAME_ALIASES[q];
  if (aliases?.some((alias) => String(entry.sourceName || '').includes(alias))) return 70;
  if (digits && (sid === digits || sid.startsWith(digits))) return 75;
  if (label.includes(q) || sidFold.includes(q)) return 50;
  if (qCompact.length >= 2 && labelCompact.includes(qCompact)) return 45;
  if (live && (live.includes(q) || (digits && live.includes(digits)))) return 40;
  if (digits.length > 0 && sid.includes(digits)) return 30;
  return 0;
}

export type CatalogSearchOpts = {
  limit?: number;
  provider?: StationProvider | string | null;
  kind?: WindguruKind | 'any' | null;
  exclude?: FollowedStation[];
};

/** Rank matches over the full directory. Does not drop already-followed IDs unless `exclude` is set. */
export function searchCatalogStations(
  catalog: CatalogStation[],
  query: string,
  opts: CatalogSearchOpts = {},
): { stations: CatalogStation[]; total: number } {
  const qRaw = String(query ?? '').trim();
  const q = foldSearchText(qRaw);
  const digits = qRaw.replace(/\D/g, '');
  if (!q || (q.length < 2 && digits.length < 1)) {
    return { stations: [], total: 0 };
  }

  const limitRaw = Number(opts.limit);
  const limit =
    Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(Math.trunc(limitRaw), 400) : 40;
  const wantProvider = opts.provider ? normalizeProvider(opts.provider) : null;
  const wantKind = opts.kind && opts.kind !== 'any' ? opts.kind : null;
  const exclude = new Set<string>();
  for (const row of opts.exclude || []) {
    const sid = String(row?.stationId ?? '').trim();
    if (sid) exclude.add(catalogKey(row.provider, sid));
  }

  const scored: { entry: CatalogStation; score: number; sid: string }[] = [];
  for (const entry of catalog) {
    const sid = String(entry.stationId ?? '').trim();
    const provider = normalizeProvider(entry.provider);
    if (!sid) continue;
    if (exclude.has(catalogKey(provider, sid))) continue;
    if (wantProvider && provider !== wantProvider) continue;
    if (wantKind && (entry.kind || 'station') !== wantKind) continue;
    const score = catalogMatchScore(entry, qRaw);
    if (score > 0) scored.push({ entry, score, sid });
  }
  scored.sort((a, b) => b.score - a.score);
  return {
    stations: scored.slice(0, limit).map((row) => row.entry),
    total: scored.length,
  };
}

/** Catalog suggestions excluding IDs already in the user's follow list. */
export function suggestCatalogStations(
  catalog: CatalogStation[],
  existing: FollowedStation[],
  query: string,
  limit = 12,
  providerFilter?: StationProvider | null,
): CatalogStation[] {
  return searchCatalogStations(catalog, query, {
    limit: Math.max(1, limit),
    provider: providerFilter,
    exclude: existing,
  }).stations;
}
