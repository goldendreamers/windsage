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

/** Weather network the follow belongs to (defaults to windguru for older saves). */
export type { StationProvider } from './providers';

/** Nearest (or native) live station used for readings when following a spot. */
export interface LinkedLiveStation {
  id: string;
  name: string;
  distanceKm: number;
  spotname?: string;
}

/** A spot/station you follow in Windsage (any supported provider). */
export interface FollowedStation {
  /** Local stable id for this follow entry. */
  id: string;
  /**
   * Data source. Older saved follows omit this → treat as `windguru`.
   */
  provider?: import('./providers').StationProvider;
  /** External id for that provider (Windguru #, NDBC id, lat,lon, …). */
  stationId: string;
  /**
   * Whether `stationId` is a forecast spot or a live station.
   * Readings for spots still resolve to a linked live station at fetch time
   * without changing the stored ID. Non-Windguru providers usually use `station`.
   */
  kind: WindguruKind;
  nickname: string;
  /** Official source name (not the user nickname). */
  sourceName?: string | null;
  enabled: boolean;
  rule: AlertRule;
  /** Live station used for sensor readings (native link or nearest). */
  liveStationId?: string | null;
  /** Present when readings come from a nearest-station fallback. */
  linkedLiveStation?: LinkedLiveStation | null;
  /** User-facing warning when there is no native live sensor on the spot. */
  liveLinkWarning?: string | null;
  /**
   * Location-blend follow (provider === 'location'): pin + nearby members
   * weighted by distance × historical accuracy × user rating.
   */
  locationBlend?: LocationBlend | null;
}

export interface LocationBlendMember {
  provider: string;
  stationId: string;
  name: string;
  distanceKm: number;
  weight?: number;
  weightNorm?: number;
  rating?: number | null;
  ok?: boolean;
  lat?: number;
  lon?: number;
  virtual?: boolean;
}

export interface LocationBlend {
  lat: number;
  lon: number;
  address?: string | null;
  radiusKm: number;
  maxStations: number;
  members: LocationBlendMember[];
  updatedAt?: number;
}

/** Simple: map pin + GPS. Advanced: Google Maps search still available. */
export type UiMode = 'simple' | 'advanced';

export interface AppSettings {
  stations: FollowedStation[];
  pollIntervalMinutes: number;
  /** Local UI preference; default simple. Not synced to the cloud. */
  uiMode?: UiMode;
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
  /** Live sensor reading used for alert evaluation (native or nearest). */
  reading: StationReading | null;
  /**
   * Spot model forecast “now” — set when the followed spot has no native live sensor.
   * Home/detail show this; alerts still use `reading` from the nearest live station.
   */
  forecast?: StationReading | null;
  /** Windguru model label for `forecast` (e.g. GFS 13 km). */
  forecastModel?: string | null;
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
