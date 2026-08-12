import type { HistorySeries, MetricKey, StationReading, WindguruKind } from '../shared/types';

const BASE = 'https://www.windguru.cz/int/iapi.php';
const CACHE_TTL_MS = 45_000;
const RESOLVE_TTL_MS = 6 * 60 * 60 * 1000;
const FALLBACK_CLOUD = 'https://windsage.nimrod.bio';

/** Web runtime (avoid importing react-native — breaks Node check scripts). */
function isWebRuntime(): boolean {
  return typeof document !== 'undefined';
}

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

type CacheEntry = { expires: number; value: unknown };
const responseCache = new Map<string, CacheEntry>();

export type ResolvedWindguru = {
  /** ID the user entered (spot or station). */
  inputId: string;
  /** Live station ID used for Windguru station_data_* APIs. */
  liveStationId: string;
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

function cacheKey(refererId: string, query: Record<string, string>): string {
  return `${refererId}|${Object.entries(query)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('&')}`;
}

async function fetchJson<T>(
  refererUrl: string,
  cacheId: string,
  query: Record<string, string>,
): Promise<T> {
  const key = cacheKey(cacheId, query);
  const hit = responseCache.get(key);
  if (hit && hit.expires > Date.now()) {
    return hit.value as T;
  }

  const url = new URL(BASE);
  for (const [param, value] of Object.entries(query)) {
    url.searchParams.set(param, value);
  }

  const response = await fetch(url.toString(), {
    headers: {
      Referer: refererUrl,
      Accept: 'application/json',
    },
  });

  let data: (T & {
    return?: string;
    message?: string;
    error_details?: string;
  }) | null = null;
  try {
    data = (await response.json()) as T & {
      return?: string;
      message?: string;
      error_details?: string;
    };
  } catch {
    data = null;
  }

  // Windguru returns HTTP 400 with JSON { return: "error", message: "Unknown station!" }
  if (data && typeof data === 'object' && data.return === 'error') {
    throw new Error(data.message || data.error_details || 'Windguru API error');
  }
  if (!response.ok) {
    throw new Error(`Windguru HTTP ${response.status}`);
  }
  if (!data) {
    throw new Error(`Windguru HTTP ${response.status}`);
  }

  responseCache.set(key, { value: data, expires: Date.now() + CACHE_TTL_MS });
  return data;
}

function asNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function pickWaveHeight(raw: Record<string, unknown>): number | null {
  const candidates = [
    raw.wave_height,
    raw.wave,
    raw.wvheight,
    raw.swell_height,
    raw.Hs,
    raw.hs,
  ];
  for (const candidate of candidates) {
    const n = asNumber(candidate);
    if (n !== null) return n;
  }
  return null;
}

function normalizeReading(raw: Record<string, unknown>): StationReading {
  return {
    wind_avg: asNumber(raw.wind_avg),
    wind_max: asNumber(raw.wind_max),
    wind_min: asNumber(raw.wind_min),
    wind_direction: asNumber(raw.wind_direction),
    temperature: asNumber(raw.temperature),
    wave_height: pickWaveHeight(raw),
    datetime: typeof raw.datetime === 'string' ? raw.datetime : null,
    unixtime: asNumber(raw.unixtime),
  };
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

async function tryStationCurrent(liveStationId: string): Promise<StationReading> {
  const raw = await fetchJson<Record<string, unknown>>(
    `https://www.windguru.cz/station/${liveStationId}`,
    liveStationId,
    {
      q: 'station_data_current',
      id_station: liveStationId,
      date_format: 'Y-m-d H:i:s T',
    },
  );
  return normalizeReading(raw);
}

/**
 * Resolve a user-entered Windguru ID (live station or forecast spot) to a live station.
 * Prefer Wald cloud so forecast-only spots get nearest-live linking + Referer.
 */
export async function resolveWindguruId(inputId: string): Promise<ResolvedWindguru> {
  const id = inputId.trim();
  if (!/^\d+$/.test(id)) {
    throw new Error('Use a Windguru number or URL (spot or station)');
  }

  const cached = resolveCache.get(id);
  if (cached && cached.expires > Date.now()) return cached.value;

  try {
    const response = await fetch(`${resolveCloudBaseUrl()}/v1/windguru/resolve`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ input: id }),
    });
    const data = (await response.json().catch(() => ({}))) as Partial<ResolvedWindguru> & {
      error?: string;
      ok?: boolean;
    };
    if (response.ok && data.liveStationId && data.inputId && data.kind) {
      const value: ResolvedWindguru = {
        inputId: data.inputId,
        liveStationId: data.liveStationId,
        kind: data.kind,
        spotName: data.spotName,
        hasLiveStation: data.hasLiveStation !== false,
        linkedLiveStation: data.linkedLiveStation ?? null,
        warning: data.warning ?? null,
      };
      resolveCache.set(id, { value, expires: Date.now() + RESOLVE_TTL_MS });
      return value;
    }
    if (!response.ok && data.error) {
      throw new Error(data.error);
    }
  } catch (error) {
    // Fall through to local resolve when cloud is unreachable (native).
    if (isWebRuntime()) throw error;
  }

  try {
    await tryStationCurrent(id);
    const value: ResolvedWindguru = {
      inputId: id,
      liveStationId: id,
      kind: 'station',
      hasLiveStation: true,
      linkedLiveStation: null,
      warning: null,
    };
    resolveCache.set(id, { value, expires: Date.now() + RESOLVE_TTL_MS });
    return value;
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (!/unknown station/i.test(message)) {
      throw error;
    }
  }

  const spot = await fetchJson<Record<string, unknown>>(
    `https://www.windguru.cz/${id}`,
    `spot:${id}`,
    { q: 'spot', id_spot: id },
  );

  const stationObj = spot.station as Record<string, unknown> | null | undefined;
  const live = asNumber(stationObj?.id_station);
  const spotName =
    (typeof spot.spotname === 'string' && spot.spotname) ||
    (typeof stationObj?.name === 'string' && stationObj.name) ||
    undefined;

  if (live != null) {
    const liveStationId = String(Math.trunc(live));
    await tryStationCurrent(liveStationId);
    const value: ResolvedWindguru = {
      inputId: id,
      liveStationId,
      kind: 'spot',
      spotName,
      hasLiveStation: true,
      linkedLiveStation: null,
      warning: null,
    };
    resolveCache.set(id, { value, expires: Date.now() + RESOLVE_TTL_MS });
    return value;
  }

  throw new Error(
    `Windguru spot #${id}${spotName ? ` (${spotName})` : ''} needs cloud resolve to link a nearest live station.`,
  );
}

/**
 * Resolve a pasted Windguru URL/number for follow UX.
 * Does not rewrite the user's ID — callers decide whether to keep the spot
 * or switch to the linked live station.
 *
 * On web, browsers cannot set Windguru's required Referer header (forbidden),
 * so resolve goes through Wald cloud which can set Referer: windguru.cz.
 */
export async function normalizeWindguruFollowInput(input: string): Promise<{
  inputId: string;
  liveStationId: string;
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

  if (isWebRuntime()) {
    const response = await fetch(`${resolveCloudBaseUrl()}/v1/windguru/resolve`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ input }),
    });
    const data = (await response.json().catch(() => ({}))) as {
      error?: string;
      inputId?: string;
      liveStationId?: string;
      kind?: 'station' | 'spot';
      spotName?: string;
      hasLiveStation?: boolean;
      linkedLiveStation?: ResolvedWindguru['linkedLiveStation'];
      warning?: string | null;
      rewritten?: boolean;
    };
    if (!response.ok || !data.liveStationId || !data.inputId || !data.kind) {
      throw new Error(data.error || `Could not resolve Windguru ID (${response.status})`);
    }
    return {
      inputId: data.inputId,
      liveStationId: data.liveStationId,
      kind: data.kind,
      spotName: data.spotName,
      hasLiveStation: data.hasLiveStation !== false,
      linkedLiveStation: data.linkedLiveStation ?? null,
      warning: data.warning ?? null,
      rewritten: !!data.rewritten,
    };
  }

  const resolved = await resolveWindguruId(parsed.id);
  return {
    inputId: resolved.inputId,
    liveStationId: resolved.liveStationId,
    kind: resolved.kind,
    spotName: resolved.spotName,
    hasLiveStation: resolved.hasLiveStation !== false,
    linkedLiveStation: resolved.linkedLiveStation ?? null,
    warning: resolved.warning ?? null,
    rewritten:
      resolved.kind === 'spot' &&
      resolved.hasLiveStation !== false &&
      resolved.liveStationId !== resolved.inputId,
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
    liveStationId: string;
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
  liveStationId: string;
  linkedLiveStation: ResolvedWindguru['linkedLiveStation'];
  liveLinkWarning: string | null;
} {
  if (preferred === 'station' || resolved.kind === 'station') {
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
    liveStationId: resolved.liveStationId,
    linkedLiveStation: resolved.linkedLiveStation ?? null,
    liveLinkWarning: resolved.warning ?? null,
  };
}

/**
 * Annotate kind on followed entries when missing — never rewrite stored IDs.
 * Spot IDs stay as spots; live readings still resolve at fetch time.
 */
export async function fixSpotStations<
  T extends { stationId: string; nickname?: string; kind?: 'spot' | 'station' },
>(stations: T[]): Promise<{ stations: T[]; changed: number }> {
  const out: T[] = [];
  let changed = 0;
  for (const station of stations) {
    if (!station?.stationId?.trim()) {
      out.push(station);
      continue;
    }
    if (station.kind === 'spot' || station.kind === 'station') {
      out.push(station);
      continue;
    }
    try {
      const resolved = await resolveWindguruId(station.stationId.trim());
      changed += 1;
      out.push({
        ...station,
        kind: resolved.kind,
        nickname:
          (station.nickname || '').trim() ||
          resolved.spotName ||
          station.nickname ||
          '',
      });
    } catch {
      out.push({ ...station, kind: 'station' });
      changed += 1;
    }
  }
  return { stations: out, changed };
}

/** Live reading for a Windguru station ID or spot ID (spot→station resolved at fetch only). */
export async function fetchCurrentReading(stationId: string): Promise<StationReading> {
  const resolved = await resolveWindguruId(stationId);
  return tryStationCurrent(resolved.liveStationId);
}

/**
 * Recent history samples (default 10-min averages) for sustained-threshold checks.
 * Hours is padded so we always cover the configured sustained window.
 */
export async function fetchRecentHistory(
  stationId: string,
  metric: MetricKey,
  hours: number,
  avgMinutes = 10,
): Promise<HistorySeries> {
  const resolved = await resolveWindguruId(stationId);
  const id = resolved.liveStationId;
  const vars =
    metric === 'wave_height'
      ? 'wind_avg,wave_height,wave,wvheight,swell_height'
      : metric;

  const raw = await fetchJson<Record<string, unknown>>(
    `https://www.windguru.cz/station/${id}`,
    id,
    {
      q: 'station_data_last',
      id_station: id,
      hours: String(Math.max(1, Math.ceil(hours))),
      avg_minutes: String(avgMinutes),
      back_hours: '0',
      vars,
    },
  );

  const unixtime = Array.isArray(raw.unixtime)
    ? (raw.unixtime as unknown[]).map((v) => asNumber(v) ?? 0)
    : [];

  let values: Array<number | null> = [];
  if (metric === 'wave_height') {
    const seriesKeys = ['wave_height', 'wave', 'wvheight', 'swell_height', 'Hs', 'hs'];
    const found = seriesKeys.find((key) => Array.isArray(raw[key]));
    values = found
      ? (raw[found] as unknown[]).map((v) => asNumber(v))
      : unixtime.map(() => null);
  } else if (Array.isArray(raw[metric])) {
    values = (raw[metric] as unknown[]).map((v) => asNumber(v));
  } else {
    values = unixtime.map(() => null);
  }

  return { unixtime, values };
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
