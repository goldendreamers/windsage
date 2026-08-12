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
    stationId: stationId.trim(),
    kind,
    nickname: nickname.trim(),
    sourceName: partial?.sourceName?.trim() || null,
    enabled: partial?.enabled ?? true,
    rule: { ...DEFAULT_RULE, ...(partial?.rule ?? {}) },
    liveStationId: partial?.liveStationId ?? null,
    linkedLiveStation: partial?.linkedLiveStation ?? null,
    liveLinkWarning: partial?.liveLinkWarning ?? null,
  };
}

export function displayName(station: FollowedStation): string {
  if (station.nickname.trim()) return station.nickname.trim();
  return windguruName(station);
}

/** Official Windguru name for a follow (ignores user nickname). */
export function windguruName(station: FollowedStation): string {
  const source = (station.sourceName ?? '').trim();
  if (source) return source;
  const linked =
    (station.linkedLiveStation?.spotname ?? '').trim() ||
    (station.linkedLiveStation?.name ?? '').trim();
  if (linked) return linked;
  return station.kind === 'spot'
    ? `Spot ${station.stationId}`
    : `Station ${station.stationId}`;
}

/** Match a follow by the Windguru ID the user chose (`stationId` only).

 * Do not match on `liveStationId`: many spots share one live sensor, and after
 * editing a follow to a new location the old spot ID must be free to follow again.
 */
export function findExistingFollow(
  stations: FollowedStation[],
  ids: {
    stationId?: string | null;
    /** @deprecated Ignored — kept so older call sites keep typing. */
    inputId?: string | null;
    /** @deprecated Ignored — live link is not a follow identity. */
    liveStationId?: string | null;
  },
): FollowedStation | null {
  const want = (ids.stationId ?? '').trim();
  if (!want) return null;
  for (const station of stations) {
    if ((station.stationId ?? '').trim() === want) return station;
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
    const sid = station.stationId.trim().toLowerCase();
    const live = (station.liveStationId ?? '').trim().toLowerCase();
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
  | 'stationId'
  | 'kind'
  | 'sourceName'
  | 'liveStationId'
  | 'linkedLiveStation'
  | 'liveLinkWarning'
>;

/** Catalog suggestions excluding IDs already in the user's follow list. */
export function suggestCatalogStations(
  catalog: CatalogStation[],
  existing: FollowedStation[],
  query: string,
  limit = 6,
): CatalogStation[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const digits = q.replace(/\D/g, '');
  const taken = new Set<string>();
  for (const s of existing) {
    if (s.stationId?.trim()) taken.add(s.stationId.trim());
  }
  const out: CatalogStation[] = [];
  for (const entry of catalog) {
    const sid = entry.stationId.trim();
    if (!sid || taken.has(sid)) continue;
    const asFollow = {
      id: `catalog_${sid}`,
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
    const live = (entry.liveStationId ?? '').trim().toLowerCase();
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
