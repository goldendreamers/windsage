import type { HistorySeries, MetricKey, StationReading, WindguruKind } from '../shared/types';

const RESOLVE_TTL_MS = 6 * 60 * 60 * 1000;
const FALLBACK_CLOUD = 'https://windsage.nimrod.bio';

/** Same-origin Wald when served from the cloud host; else configured/fallback URL. */
function resolveCloudBaseUrl(): string {
  if (typeof window !== 'undefined') {
    const host = window.location.hostname;
    if (
      host === '100.125.98.56' ||
      host === 'waldhomeserver' ||
      host === 'windsage.nimrod.bio' ||
      host.endsWith('.ts.net') ||
      window.location.port === '8787'
    ) {
      return window.location.origin;
    }
  }
  return (
    (typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_WINDSAGE_URL) ||
    FALLBACK_CLOUD
  );
}

export type ResolvedWindguru = {
  /** ID the user entered (spot or station). */
  inputId: string;
  /** Live station ID used for Windguru station_data_* APIs (null for forecast-only spots with no nearby sensor). */
  liveStationId: string | null;
  kind: 'station' | 'spot';
  spotName?: string;
  hasLiveStation?: boolean;
  linkedLiveStation?: {
    id: string;
    name: string;
    distanceKm: number;
    spotname?: string;
  } | null;
  warning?: string | null;
};

const resolveCache = new Map<string, { expires: number; value: ResolvedWindguru }>();

/** Extract a numeric Windguru id from a bare number or full URL. */
export function parseWindguruId(input: string): string | null {
  return parseWindguruRef(input)?.id ?? null;
}

/**
 * Parse ID and optional kind hint from Windguru URLs or bare numbers.
 * Accepts www/m, http(s), trailing slash, and query strings.
 */
export function parseWindguruRef(
  input: string,
): { id: string; kindHint?: 'spot' | 'station' } | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (/^\d+$/.test(trimmed)) return { id: trimmed };

  let path = trimmed;
  try {
    if (/^https?:\/\//i.test(trimmed) || /^[\w.-]*windguru\.cz/i.test(trimmed)) {
      const url = new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`);
      path = url.pathname || '';
    }
  } catch {
    path = trimmed;
  }

  const stationMatch = path.match(/\/station\/(\d+)/i);
  if (stationMatch) return { id: stationMatch[1], kindHint: 'station' };
  const spotMatch = path.match(/\/(\d+)\/?(?:$|\?)/) || path.match(/\/(\d+)$/);
  if (spotMatch) return { id: spotMatch[1], kindHint: 'spot' };

  const loose = trimmed.match(/windguru\.cz\/(?:station\/)?(\d+)/i);
  if (loose) {
    return {
      id: loose[1],
      kindHint: /\/station\//i.test(trimmed) ? 'station' : 'spot',
    };
  }
  return null;
}

export function metricValue(reading: StationReading, metric: MetricKey): number | null {
  return reading[metric] ?? null;
}

export function metricLabel(metric: MetricKey): string {
  switch (metric) {
    case 'wind_avg':
      return 'wind avg';
    case 'wind_max':
      return 'wind gust';
    case 'temperature':
      return 'temperature';
    case 'wave_height':
      return 'wave height';
  }
}

export function metricUnit(metric: MetricKey): string {
  switch (metric) {
    case 'wind_avg':
    case 'wind_max':
      return 'kt';
    case 'temperature':
      return '°C';
    case 'wave_height':
      return 'm';
  }
}

/**
 * Resolve a user-entered Windguru ID (live station or forecast spot) to a live station.
 * Always via Windsage cloud — the phone does not call Windguru.
 */
export async function resolveWindguruId(
  inputId: string,
  opts?: { kindHint?: 'spot' | 'station' },
): Promise<ResolvedWindguru> {
  const id = inputId.trim();
  if (!/^\d+$/.test(id)) {
    throw new Error('Use a Windguru number or URL (spot or station)');
  }
  const kindHint = opts?.kindHint === 'spot' || opts?.kindHint === 'station' ? opts.kindHint : undefined;
  const cacheId = `${id}:${kindHint || 'any'}`;

  const cached = resolveCache.get(cacheId);
  if (cached && cached.expires > Date.now()) return cached.value;

  const response = await fetch(`${resolveCloudBaseUrl()}/v1/windguru/resolve`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ input: id, kindHint }),
  });
  const data = (await response.json().catch(() => ({}))) as Partial<ResolvedWindguru> & {
    error?: string;
    ok?: boolean;
  };
  const resolvedOk =
    response.ok &&
    !!data.inputId &&
    !!data.kind &&
    (!!data.liveStationId || data.kind === 'spot');
  if (!resolvedOk) {
    throw new Error(data.error || `Could not resolve Windguru ID (${response.status})`);
  }
  const value: ResolvedWindguru = {
    inputId: data.inputId as string,
    liveStationId: data.liveStationId ?? null,
    kind: data.kind as 'station' | 'spot',
    spotName: data.spotName,
    hasLiveStation: data.hasLiveStation !== false,
    linkedLiveStation: data.linkedLiveStation ?? null,
    warning: data.warning ?? null,
  };
  resolveCache.set(cacheId, { value, expires: Date.now() + RESOLVE_TTL_MS });
  return value;
}

/**
 * Resolve a pasted Windguru URL/number for follow UX via the Windsage cloud.
 * The phone does not talk to Windguru directly (Referer + privacy).
 */
export async function normalizeWindguruFollowInput(input: string): Promise<{
  inputId: string;
  liveStationId: string | null;
  kind: 'station' | 'spot';
  spotName?: string;
  hasLiveStation: boolean;
  linkedLiveStation: ResolvedWindguru['linkedLiveStation'];
  warning: string | null;
  rewritten: boolean;
}> {
  const parsed = parseWindguruRef(input);
  if (!parsed) {
    throw new Error('Paste a Windguru URL or number (spot or station)');
  }

  const response = await fetch(`${resolveCloudBaseUrl()}/v1/windguru/resolve`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ input, kindHint: parsed.kindHint }),
  });
  const data = (await response.json().catch(() => ({}))) as {
    error?: string;
    inputId?: string;
    liveStationId?: string | null;
    kind?: 'station' | 'spot';
    spotName?: string;
    hasLiveStation?: boolean;
    linkedLiveStation?: ResolvedWindguru['linkedLiveStation'];
    warning?: string | null;
    rewritten?: boolean;
  };
  if (
    !response.ok ||
    !data.inputId ||
    !data.kind ||
    (!data.liveStationId && data.kind !== 'spot')
  ) {
    throw new Error(data.error || `Could not resolve Windguru ID (${response.status})`);
  }
  return {
    inputId: data.inputId,
    liveStationId: data.liveStationId ?? null,
    kind: data.kind,
    spotName: data.spotName,
    hasLiveStation: data.hasLiveStation !== false,
    linkedLiveStation: data.linkedLiveStation ?? null,
    warning: data.warning ?? null,
    rewritten: !!data.rewritten,
  };
}

/**
 * Map a resolved Windguru ID to what we store for a user-chosen Spot vs Station.
 * - Station → always the live station ID (no warning).
 * - Spot → keep the spot ID; attach liveStationId / nearest-link metadata.
 */
export function followTargetForKind(
  preferred: WindguruKind,
  resolved: {
    inputId: string;
    liveStationId?: string | null;
    kind: WindguruKind;
    spotName?: string;
    hasLiveStation?: boolean;
    linkedLiveStation?: ResolvedWindguru['linkedLiveStation'];
    warning?: string | null;
  },
): {
  stationId: string;
  kind: WindguruKind;
  spotName?: string;
  liveStationId: string | null;
  linkedLiveStation: ResolvedWindguru['linkedLiveStation'];
  liveLinkWarning: string | null;
} {
  if (resolved.kind === 'station') {
    const liveId = resolved.liveStationId || resolved.inputId;
    return {
      stationId: liveId,
      kind: 'station',
      spotName: resolved.spotName,
      liveStationId: liveId,
      linkedLiveStation: null,
      liveLinkWarning: null,
    };
  }
  const nativeLiveOnSpot =
    resolved.hasLiveStation !== false &&
    !!resolved.liveStationId &&
    !resolved.linkedLiveStation;
  if (preferred === 'station' && nativeLiveOnSpot && resolved.liveStationId) {
    return {
      stationId: resolved.liveStationId,
      kind: 'station',
      spotName: resolved.spotName,
      liveStationId: resolved.liveStationId,
      linkedLiveStation: null,
      liveLinkWarning: null,
    };
  }
  return {
    stationId: resolved.inputId,
    kind: 'spot',
    spotName: resolved.spotName,
    liveStationId: resolved.liveStationId ?? null,
    linkedLiveStation: resolved.linkedLiveStation ?? null,
    liveLinkWarning: resolved.warning ?? null,
  };
}

/**
 * Annotate kind on followed entries when missing — never rewrite stored IDs.
 * Spot IDs stay as spots; live readings still resolve at fetch time.
 */
export async function fixSpotStations<
  T extends {
    stationId: string;
    nickname?: string;
    kind?: 'spot' | 'station';
    liveStationId?: string | null;
    linkedLiveStation?: ResolvedWindguru['linkedLiveStation'];
    liveLinkWarning?: string | null;
    sourceName?: string | null;
  },
>(stations: T[]): Promise<{ stations: T[]; changed: number }> {
  const out: T[] = [];
  let changed = 0;
  for (const station of stations) {
    if (!station?.stationId?.trim()) {
      out.push(station);
      continue;
    }
    const needsEnrich =
      !(station.kind === 'spot' || station.kind === 'station') ||
      (station.kind === 'spot' && !station.liveStationId) ||
      station.enabled === undefined ||
      station.enabled === null;
    if (!needsEnrich) {
      out.push({ ...station, enabled: station.enabled !== false });
      continue;
    }
    try {
      const resolved = await resolveWindguruId(station.stationId.trim());
      changed += 1;
      out.push({
        ...station,
        enabled: station.enabled !== false,
        kind: station.kind === 'spot' || station.kind === 'station' ? station.kind : resolved.kind,
        liveStationId: resolved.liveStationId,
        linkedLiveStation: resolved.linkedLiveStation ?? null,
        liveLinkWarning: resolved.warning ?? null,
        sourceName:
          resolved.spotName ||
          resolved.linkedLiveStation?.spotname ||
          resolved.linkedLiveStation?.name ||
          station.sourceName ||
          null,
        nickname:
          (station.nickname || '').trim() ||
          resolved.spotName ||
          station.nickname ||
          '',
      });
    } catch {
      out.push({
        ...station,
        enabled: station.enabled !== false,
        kind: station.kind === 'spot' ? 'spot' : 'station',
      });
      changed += 1;
    }
  }
  return { stations: out, changed };
}

/** Readings are polled on the Windsage cloud — the app uses snapshots / Check now. */
export async function fetchCurrentReading(_stationId: string): Promise<StationReading> {
  throw new Error('Readings come from the Windsage cloud');
}

export type SpotForecastNow = {
  reading: StationReading;
  modelName: string;
  idModel: number;
  hour: number;
  spotName?: string;
  history?: HistorySeries;
};

/** Spot has no native Windguru live sensor — alerts use the model forecast. */
export function isForecastOnlySpot(station: {
  kind?: WindguruKind;
  linkedLiveStation?: unknown;
  liveLinkWarning?: string | null;
}): boolean {
  return (
    station?.kind === 'spot' && !!(station.linkedLiveStation || station.liveLinkWarning)
  );
}

/**
 * Current (nearest-hour) model forecast for a Windguru spot.
 * On web this must go through Wald (Referer). Used for UI and alerts when there is no native live sensor.
 */
export async function fetchSpotForecastNow(
  spotId: string,
  opts?: { metric?: MetricKey; hours?: number },
): Promise<SpotForecastNow> {
  const id = spotId.trim();
  if (!/^\d+$/.test(id)) {
    throw new Error('Spot ID must be numeric');
  }

  const response = await fetch(`${resolveCloudBaseUrl()}/v1/windguru/forecast`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      input: id,
      metric: opts?.metric,
      hours: opts?.hours,
    }),
  });
  const data = (await response.json().catch(() => ({}))) as Partial<SpotForecastNow> & {
    error?: string;
    ok?: boolean;
  };
  if (!response.ok || !data.reading) {
    throw new Error(data.error || `Could not fetch forecast (${response.status})`);
  }
  return {
    reading: data.reading,
    modelName: data.modelName || 'forecast',
    idModel: data.idModel ?? 3,
    hour: data.hour ?? 0,
    spotName: data.spotName,
    history: data.history,
  };
}

/** History for hold-time is evaluated on the Windsage cloud. */
export async function fetchRecentHistory(
  _stationId: string,
  _metric: MetricKey,
  _hours: number,
  _avgMinutes = 10,
): Promise<HistorySeries> {
  throw new Error('Readings come from the Windsage cloud');
}

export function stationUrl(
  stationId: string,
  kind?: 'spot' | 'station',
): string {
  const id = stationId.trim();
  if (kind === 'station') return `https://www.windguru.cz/station/${id}`;
  if (kind === 'spot') return `https://www.windguru.cz/${id}`;
  const cached = resolveCache.get(id);
  if (cached?.value.kind === 'spot') {
    return `https://www.windguru.cz/${cached.value.inputId}`;
  }
  if (cached?.value.kind === 'station') {
    return `https://www.windguru.cz/station/${cached.value.liveStationId}`;
  }
  return `https://www.windguru.cz/${id}`;
}
