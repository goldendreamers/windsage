export type MetricKey =
  | 'wind_avg'
  | 'wind_max'
  | 'temperature'
  | 'wave_height';

export type Comparison = 'gte' | 'lte';

export interface AlertRule {
  metric: MetricKey;
  threshold: number;
  comparison: Comparison;
  /** How long the condition must hold before notifying (minutes). */
  sustainedMinutes: number;
  /**
   * When true, only notify if (gust − avg) ≤ maxGustSpreadKnots.
   * Off by default — no extra limits required.
   */
  maxGustSpreadEnabled: boolean;
  /**
   * Max allowed gust − avg wind (knots), used when maxGustSpreadEnabled.
   */
  maxGustSpreadKnots: number;
  /**
   * When true, only notify if live wind_direction is inside [from, to]
   * (degrees, meteorological “from”). Wrap-around sectors allowed (e.g. 300→60).
   */
  windDirEnabled: boolean;
  /** Inclusive sector start (0–360). */
  windDirFromDeg: number;
  /** Inclusive sector end (0–360). */
  windDirToDeg: number;
  /**
   * When alerting on wind: optional max wave height (m).
   * Off by default.
   */
  maxWaveEnabled: boolean;
  maxWaveHeightM: number;
  /**
   * When alerting on wave: optional max wind avg (kt).
   * Off by default.
   */
  maxWindEnabled: boolean;
  maxWindKnots: number;
}

/** Windguru target: forecast spot page or live station page. */
export type WindguruKind = 'spot' | 'station';

/** Nearest (or native) live station used for readings when following a spot. */
export interface LinkedLiveStation {
  id: string;
  name: string;
  distanceKm: number;
  spotname?: string;
}

/** A Windguru spot or station you follow in Windsage. */
export interface FollowedStation {
  /** Local stable id for this follow entry. */
  id: string;
  /** Windguru spot or station number the user chose (never auto-rewritten). */
  stationId: string;
  /**
   * Whether `stationId` is a forecast spot or a live station.
   * Readings for spots still resolve to a linked live station at fetch time
   * without changing the stored ID.
   */
  kind: WindguruKind;
  nickname: string;
  /** Official Windguru spot/station name (not the user nickname). */
  sourceName?: string | null;
  enabled: boolean;
  rule: AlertRule;
  /** Live station used for sensor readings (native link or nearest). */
  liveStationId?: string | null;
  /** Present when readings come from a nearest-station fallback. */
  linkedLiveStation?: LinkedLiveStation | null;
  /** User-facing warning when there is no native live sensor on the spot. */
  liveLinkWarning?: string | null;
}

export interface AppSettings {
  stations: FollowedStation[];
  pollIntervalMinutes: number;
}

export interface StationReading {
  wind_avg: number | null;
  wind_max: number | null;
  wind_min: number | null;
  wind_direction: number | null;
  temperature: number | null;
  wave_height: number | null;
  datetime: string | null;
  unixtime: number | null;
}

export interface HistorySeries {
  unixtime: number[];
  values: Array<number | null>;
}

export interface AlertState {
  /** Unix ms when the condition first became true continuously. */
  conditionSinceMs: number | null;
  /** True after we already notified for the current continuous run. */
  notifiedForRun: boolean;
  lastCheckMs: number | null;
  lastValue: number | null;
  lastError: string | null;
  lastStationId: string | null;
}

export type AlertStateMap = Record<string, AlertState>;

export interface CheckResult {
  reading: StationReading | null;
  metricValue: number | null;
  conditionMet: boolean;
  sustainedMs: number;
  shouldNotify: boolean;
  message: string;
}

export interface StationSnapshot {
  station: FollowedStation;
  reading: StationReading | null;
  result: CheckResult | null;
  alertState: AlertState;
  error: string | null;
}
