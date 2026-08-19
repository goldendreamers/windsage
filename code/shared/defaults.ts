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
  simpleMode: true,
  accountId: null,
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
    const from = windDirectionName(rule.windDirFromDeg) || 'north';
    const to = windDirectionName(rule.windDirToDeg) || 'north';
    extras.push(from === to ? `from ${from}` : `from ${from}–${to}`);
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

export function followIdentityKey(
  station: Pick<FollowedStation, 'provider' | 'stationId'> | null | undefined,
): string {
  const sid = String(station?.stationId ?? '').trim();
  if (!sid) return '';
  return `${normalizeProvider(station?.provider)}:${sid}`;
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
    rule: { ...DEFAULT_RULE, ...(partial?.rule ?? {}) },
    liveStationId: partial?.liveStationId ?? null,
    linkedLiveStation: partial?.linkedLiveStation ?? null,
    liveLinkWarning: partial?.liveLinkWarning ?? null,
    locationBlend: partial?.locationBlend ?? null,
    starred: partial?.starred === true,
  };
}

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
  if (label.startsWith(q) || sidFold.startsWith(q)) return 90;
  if (label.split(/[\s,/._-]+/).some((w) => w.startsWith(q))) return 80;
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
