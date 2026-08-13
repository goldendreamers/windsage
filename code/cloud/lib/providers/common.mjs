/** Shared helpers for weather provider adapters. */

export function asNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

export function msToKnots(ms) {
  const n = asNumber(ms);
  return n == null ? null : n * 1.943844;
}

export function emptyReading() {
  return {
    wind_avg: null,
    wind_max: null,
    wind_min: null,
    wind_direction: null,
    temperature: null,
    wave_height: null,
    datetime: null,
    unixtime: null,
  };
}

export function reading(partial = {}) {
  return { ...emptyReading(), ...partial };
}

export function emptyHistory() {
  return { unixtime: [], values: [] };
}

export function historyFromPairs(pairs, metric) {
  const unixtime = [];
  const values = [];
  for (const row of pairs) {
    const t = asNumber(row.unixtime);
    if (t == null) continue;
    unixtime.push(t);
    values.push(asNumber(row[metric]));
  }
  return { unixtime, values };
}

const FETCH_TIMEOUT_MS = 12_000;

/** Concurrent identical GETs share one upstream call (NDBC latest, Open-Meteo, etc.). */
const inflightGets = new Map();

function coalesceKey(kind, url, headers) {
  const h = headers && Object.keys(headers).length ? JSON.stringify(headers) : '';
  return `${kind}:${url}:${h}`;
}

async function fetchWithTimeout(url, init = {}) {
  try {
    return await fetch(url, {
      ...init,
      signal: init.signal || AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  } catch (e) {
    if (e?.name === 'TimeoutError' || e?.name === 'AbortError') {
      throw new Error(`Timed out fetching ${url}`);
    }
    throw e;
  }
}

export { fetchWithTimeout };

export async function fetchText(url, headers = {}) {
  const key = coalesceKey('text', String(url), headers);
  const pending = inflightGets.get(key);
  if (pending) return pending;
  const work = (async () => {
    const response = await fetchWithTimeout(url, {
      headers: { Accept: 'text/plain,*/*', ...headers },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
    return response.text();
  })();
  inflightGets.set(key, work);
  try {
    return await work;
  } finally {
    inflightGets.delete(key);
  }
}

export async function fetchJson(url, headers = {}) {
  const key = coalesceKey('json', String(url), headers);
  const pending = inflightGets.get(key);
  if (pending) return pending;
  const work = (async () => {
    const response = await fetchWithTimeout(url, {
      headers: { Accept: 'application/json', ...headers },
    });
    let data = null;
    try {
      data = await response.json();
    } catch {
      data = null;
    }
    if (!response.ok) {
      const msg =
        data?.status?.status_message ||
        data?.message ||
        data?.error ||
        `HTTP ${response.status}`;
      throw new Error(String(msg));
    }
    return data;
  })();
  inflightGets.set(key, work);
  try {
    return await work;
  } finally {
    inflightGets.delete(key);
  }
}

export function providerOf(station) {
  const v = String(station?.provider || 'windguru')
    .trim()
    .toLowerCase();
  return v || 'windguru';
}

export function sensorId(station) {
  return String(station?.liveStationId || station?.stationId || '').trim();
}

export function cacheKey(provider, id) {
  return `${provider}:${id}`;
}
