import { normalizeProvider, type StationProvider } from './providers';
import type {
  AlertRule,
  AlertState,
  AppSettings,
  Comparison,
  FollowedStation,
  MetricKey,
  WindguruKind,
} from './types';

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

export const DEFAULT_SETTINGS: AppSettings = {
  stations: [],
  pollIntervalMinutes: 10,
};

export const DEFAULT_ALERT_STATE: AlertState = {
  conditionSinceMs: null,
  notifiedForRun: false,
  lastCheckMs: null,
  lastValue: null,
  lastError: null,
  lastStationId: null,
};

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
    const from = Math.round(Number(rule.windDirFromDeg) || 0);
    const to = Math.round(Number(rule.windDirToDeg) || 0);
    extras.push(`dir ${from}–${to}°`);
  }
  const windPrimary = rule.metric === 'wind_avg' || rule.metric === 'wind_max';
  if (windPrimary && rule.maxWaveEnabled) {
    extras.push(`waves ≤${formatThresholdNumber(rule.maxWaveHeightM ?? 1.5)} m`);
  }
  if (rule.metric === 'wave_height' && rule.maxWindEnabled) {
    extras.push(`wind ≤${formatThresholdNumber(rule.maxWindKnots ?? 25)} kt`);
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
  if (/wrong direction/i.test(raw)) return 'Wrong direction';
  if (/need /i.test(raw)) return raw;
  // Bare live reading like "10.2 kt" / "21 °C" — not a condition label.
  if (/^-?\d+(\.\d+)?\s*(kt|m|°C)?$/i.test(raw)) return null;
  return raw;
}

export function stationProvider(station: Pick<FollowedStation, 'provider'> | null | undefined): StationProvider {
  return normalizeProvider(station?.provider);
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
    rule: { ...DEFAULT_RULE, ...(partial?.rule ?? {}) },
    liveStationId: partial?.liveStationId ?? null,
    linkedLiveStation: partial?.linkedLiveStation ?? null,
    liveLinkWarning: partial?.liveLinkWarning ?? null,
    locationBlend: partial?.locationBlend ?? null,
  };
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

/** Typeahead filter over already-followed stations (Windguru name / ids). */
export function suggestExistingFollows(
  stations: FollowedStation[],
  query: string,
  limit = 6,
): FollowedStation[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const digits = q.replace(/\D/g, '');
  const out: FollowedStation[] = [];
  for (const station of stations) {
    const label = windguruName(station).toLowerCase();
    const sid = String(station.stationId ?? '').trim().toLowerCase();
    const live = String(station.liveStationId ?? '').trim().toLowerCase();
    const hit =
      label.includes(q) ||
      sid.includes(q) ||
      (live && live.includes(q)) ||
      (digits.length > 0 &&
        (sid.includes(digits) || (live && live.includes(digits))));
    if (hit) {
      out.push(station);
      if (out.length >= limit) break;
    }
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

/** Catalog suggestions excluding IDs already in the user's follow list. */
export function suggestCatalogStations(
  catalog: CatalogStation[],
  existing: FollowedStation[],
  query: string,
  limit = 6,
  providerFilter?: StationProvider | null,
): CatalogStation[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const digits = q.replace(/\D/g, '');
  const taken = new Set<string>();
  for (const s of existing) {
    if (s.stationId?.trim()) taken.add(catalogKey(s.provider, s.stationId));
  }
  const wantProvider = providerFilter ? normalizeProvider(providerFilter) : null;
  const out: CatalogStation[] = [];
  for (const entry of catalog) {
    const sid = String(entry.stationId ?? '').trim();
    const provider = normalizeProvider(entry.provider);
    if (!sid || taken.has(catalogKey(provider, sid))) continue;
    if (wantProvider && provider !== wantProvider) continue;
    const asFollow = {
      id: `catalog_${provider}_${sid}`,
      provider,
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
    const label = windguruName(asFollow).toLowerCase();
    const live = String(entry.liveStationId ?? '').trim().toLowerCase();
    const hit =
      label.includes(q) ||
      sid.toLowerCase().includes(q) ||
      (live && live.includes(q)) ||
      (digits.length > 0 &&
        (sid.includes(digits) || (live && live.includes(digits))));
    if (hit) {
      out.push(entry);
      if (out.length >= limit) break;
    }
  }
  return out;
}
