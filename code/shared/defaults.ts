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
    enabled: partial?.enabled ?? true,
    rule: { ...DEFAULT_RULE, ...(partial?.rule ?? {}) },
    liveStationId: partial?.liveStationId ?? null,
    linkedLiveStation: partial?.linkedLiveStation ?? null,
    liveLinkWarning: partial?.liveLinkWarning ?? null,
  };
}

export function displayName(station: FollowedStation): string {
  if (station.nickname.trim()) return station.nickname.trim();
  return station.kind === 'spot'
    ? `Spot ${station.stationId}`
    : `Station ${station.stationId}`;
}
