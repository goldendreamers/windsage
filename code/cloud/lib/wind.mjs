const BASE = 'https://www.windguru.cz/int/iapi.php';
const RESOLVE_TTL_MS = 6 * 60 * 60 * 1000;
const STATION_LIST_TTL_MS = 24 * 60 * 60 * 1000;
const resolveCache = new Map();
let stationListCache = null;

/** Extract a numeric Windguru id from a bare number or full URL. */
export function parseWindguruId(input) {
  return parseWindguruRef(input)?.id ?? null;
}

/**
 * Parse ID and optional kind hint from Windguru URLs or bare numbers.
 * Accepts www/m, http(s), trailing slash, and query strings.
 */
export function parseWindguruRef(input) {
  const trimmed = String(input || '').trim();
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

  // Fallback: any windguru host + digits
  const loose = trimmed.match(/windguru\.cz\/(?:station\/)?(\d+)/i);
  if (loose) {
    return {
      id: loose[1],
      kindHint: /\/station\//i.test(trimmed) ? 'station' : 'spot',
    };
  }
  return null;
}

function asNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function pickWaveHeight(raw) {
  for (const key of ['wave_height', 'wave', 'wvheight', 'swell_height', 'Hs', 'hs']) {
    const n = asNumber(raw[key]);
    if (n !== null) return n;
  }
  return null;
}

function normalizeReading(raw) {
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

const FETCH_TIMEOUT_MS = 12_000;

/** Concurrent identical Windguru iapi calls share one upstream response. */
const inflightWg = new Map();

async function fetchJson(refererUrl, query, timeoutMs = FETCH_TIMEOUT_MS) {
  const url = new URL(BASE);
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  const key = `${refererUrl}|${url.searchParams.toString()}`;
  const pending = inflightWg.get(key);
  if (pending) return pending;
  const work = (async () => {
    let response;
    try {
      response = await fetch(url, {
        headers: {
          Referer: refererUrl,
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (e) {
      if (e?.name === 'TimeoutError' || e?.name === 'AbortError') {
        throw new Error('Windguru timed out — try again in a moment');
      }
      throw e;
    }
    let data = null;
    try {
      data = await response.json();
    } catch {
      data = null;
    }
    // Windguru returns HTTP 400 with JSON { return: "error", message: "Unknown station!" }
    if (data?.return === 'error') {
      throw new Error(data.message || data.error_details || 'Windguru API error');
    }
    if (!response.ok) throw new Error(`Windguru HTTP ${response.status}`);
    return data;
  })();
  inflightWg.set(key, work);
  try {
    return await work;
  } finally {
    inflightWg.delete(key);
  }
}

export function metricValue(reading, metric) {
  return reading[metric] ?? null;
}

async function tryStationCurrent(liveStationId) {
  const raw = await fetchJson(`https://www.windguru.cz/station/${liveStationId}`, {
    q: 'station_data_current',
    id_station: liveStationId,
    date_format: 'Y-m-d H:i:s T',
  });
  return normalizeReading(raw);
}

function haversineKm(aLat, aLon, bLat, bLon) {
  const R = 6371;
  const toR = Math.PI / 180;
  const dLat = (bLat - aLat) * toR;
  const dLon = (bLon - aLon) * toR;
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(aLat * toR) * Math.cos(bLat * toR) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

async function getStationList() {
  if (stationListCache && stationListCache.expires > Date.now()) {
    return stationListCache.list;
  }
  const list = await fetchJson('https://www.windguru.cz/', { q: 'station_list' }, 30_000);
  if (!Array.isArray(list)) throw new Error('Windguru station_list unavailable');
  stationListCache = { list, expires: Date.now() + STATION_LIST_TTL_MS };
  return list;
}

/** Public accessor for nearby-station search (location blend). */
export async function getStationListForNearby() {
  return getStationList();
}

function catalogFromStationList(list) {
  const out = [];
  const seen = new Set();
  for (const row of list) {
    const rawId = row?.id_station;
    if (rawId == null || rawId === '') continue;
    const n = Number(rawId);
    if (!Number.isFinite(n)) continue;
    const sid = String(Math.trunc(n));
    if (!sid || seen.has(sid)) continue;
    seen.add(sid);
    const name = String(row.name || row.spotname || '').trim();
    const lat = asNumber(row.lat);
    const lon = asNumber(row.lon);
    out.push({
      provider: 'windguru',
      stationId: sid,
      kind: 'station',
      sourceName: name || null,
      liveStationId: sid,
      linkedLiveStation: null,
      liveLinkWarning: null,
      ...(lat != null && lon != null ? { lat, lon } : {}),
    });
  }
  return out;
}

/**
 * Compact live-station directory for Follow search (names + ids only).
 * Fetched from Windguru station_list and cached in memory with that list.
 * On success, writes the ~100 KB names-only file (and a compact id+name catalog)
 * so search still works if Windguru is later unreachable.
 */
export async function windguruCatalogStations() {
  const { persistWindguruNameFiles, readCompactCatalog } = await import('./windguruNames.mjs');
  try {
    const list = await getStationList();
    const out = catalogFromStationList(list);
    persistWindguruNameFiles(out).catch((e) => {
      console.error('[windsage-cloud] windguru names file write failed', e);
    });
    return out;
  } catch (error) {
    const cached = await readCompactCatalog();
    if (cached.length) return cached;
    throw error;
  }
}

/** Nearest live station to a lat/lon from Windguru's public station_list. */
export async function findNearestLiveStation(lat, lon) {
  const latitude = asNumber(lat);
  const longitude = asNumber(lon);
  if (latitude == null || longitude == null) return null;

  const list = await getStationList();
  let best = null;
  for (const row of list) {
    const sLat = asNumber(row?.lat);
    const sLon = asNumber(row?.lon);
    const id = row?.id_station;
    if (sLat == null || sLon == null || id == null) continue;
    const d = haversineKm(latitude, longitude, sLat, sLon);
    if (!best || d < best.distanceKm) {
      const name = String(row.name || row.spotname || `Station ${id}`).trim();
      best = {
        id: String(Math.trunc(Number(id))),
        name,
        spotname: row.spotname ? String(row.spotname) : undefined,
        distanceKm: d,
        lat: sLat,
        lon: sLon,
      };
    }
  }
  return best;
}

function formatLinkedWarning(linked) {
  const km = linked.distanceKm.toFixed(1);
  return `No live Windguru sensor on this spot — alerts use the model forecast. Nearest live for reference: ${linked.name} (#${linked.id}, ${km} km)`;
}

/** Look up official name for a live station id from Windguru station_list. */
async function lookupLiveStationName(liveStationId) {
  try {
    const list = await getStationList();
    const row = list.find(
      (item) => String(Math.trunc(Number(item?.id_station))) === String(liveStationId),
    );
    if (!row) return undefined;
    const name = String(row.name || row.spotname || '').trim();
    return name || undefined;
  } catch {
    return undefined;
  }
}

/**
 * Spot IDs resolve to a native live station when Windguru links one;
 * otherwise attach the geographically nearest live station as a reference
 * (alerts for those spots use the model forecast, not that live sensor).
 */
export async function resolveWindguruId(inputId) {
  const id = String(inputId).trim();
  if (!/^\d+$/.test(id)) throw new Error('Station/spot ID must be numeric');

  const cached = resolveCache.get(id);
  if (cached && cached.expires > Date.now()) return cached.value;

  try {
    await tryStationCurrent(id);
    const spotName = await lookupLiveStationName(id);
    const value = {
      inputId: id,
      liveStationId: id,
      kind: 'station',
      spotName,
      hasLiveStation: true,
      linkedLiveStation: null,
      warning: null,
    };
    resolveCache.set(id, { value, expires: Date.now() + RESOLVE_TTL_MS });
    return value;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!/unknown station/i.test(message)) throw error;
  }

  const spot = await fetchJson(`https://www.windguru.cz/${id}`, {
    q: 'spot',
    id_spot: id,
  });
  const spotName =
    (typeof spot?.spotname === 'string' && spot.spotname) ||
    (typeof spot?.station?.name === 'string' && spot.station.name) ||
    undefined;
  const live = asNumber(spot?.station?.id_station);

  if (live != null) {
    const liveStationId = String(Math.trunc(live));
    await tryStationCurrent(liveStationId);
    const value = {
      inputId: id,
      liveStationId,
      kind: 'spot',
      spotName,
      hasLiveStation: true,
      linkedLiveStation: null,
      warning: null,
      lat: asNumber(spot?.lat),
      lon: asNumber(spot?.lon),
    };
    resolveCache.set(id, { value, expires: Date.now() + RESOLVE_TTL_MS });
    return value;
  }

  const linked = await findNearestLiveStation(spot?.lat, spot?.lon);
  if (!linked) {
    throw new Error(
      `Windguru spot #${id}${spotName ? ` (${spotName})` : ''} has no live station nearby.`,
    );
  }
  await tryStationCurrent(linked.id);
  const warning = formatLinkedWarning(linked);
  const value = {
    inputId: id,
    liveStationId: linked.id,
    kind: 'spot',
    spotName,
    hasLiveStation: false,
    linkedLiveStation: {
      id: linked.id,
      name: linked.name,
      spotname: linked.spotname,
      distanceKm: Number(linked.distanceKm.toFixed(2)),
    },
    warning,
    lat: asNumber(spot?.lat),
    lon: asNumber(spot?.lon),
  };
  resolveCache.set(id, { value, expires: Date.now() + RESOLVE_TTL_MS });
  return value;
}

/**
 * Resolve a pasted Windguru URL/number for follow UX.
 * Does not rewrite stored follow IDs — callers choose spot vs live station.
 */
export async function normalizeWindguruFollowInput(input) {
  const parsed = parseWindguruRef(input);
  if (!parsed) {
    throw new Error('Paste a Windguru URL or number (spot or station)');
  }
  const resolved = await resolveWindguruId(parsed.id);
  return {
    inputId: resolved.inputId,
    liveStationId: resolved.liveStationId,
    kind: resolved.kind,
    spotName: resolved.spotName,
    hasLiveStation: resolved.hasLiveStation !== false,
    linkedLiveStation: resolved.linkedLiveStation || null,
    warning: resolved.warning || null,
    rewritten:
      resolved.kind === 'spot' &&
      resolved.hasLiveStation &&
      resolved.liveStationId !== resolved.inputId,
  };
}

/**
 * Annotate kind / live-link fields when missing — never rewrite stored spot IDs.
 */
export async function fixSpotStations(stations = []) {
  const out = [];
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
      const resolved = await resolveWindguruId(String(station.stationId).trim());
      changed += 1;
      out.push({
        ...station,
        enabled: station.enabled !== false,
        kind: station.kind === 'spot' || station.kind === 'station' ? station.kind : resolved.kind,
        liveStationId: resolved.liveStationId,
        linkedLiveStation: resolved.linkedLiveStation || null,
        liveLinkWarning: resolved.warning || null,
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

export async function fetchCurrentReading(stationId) {
  const resolved = await resolveWindguruId(stationId);
  if (!resolved.liveStationId) {
    throw new Error('No live station available for readings');
  }
  return tryStationCurrent(resolved.liveStationId);
}

const FORECAST_BUNDLE_TTL_MS = 5 * 60 * 1000;
const forecastBundleCache = new Map();

function pickForecastWaveAt(fcst, index) {
  for (const key of ['HTsGW', 'HTSGW', 'SWELL1', 'wave_height']) {
    if (Array.isArray(fcst[key])) {
      const n = asNumber(fcst[key][index]);
      if (n != null) return n;
    }
  }
  return null;
}

function forecastPointsFromFcst(fcst) {
  const initstamp = asNumber(fcst.initstamp) ?? 0;
  const hours = Array.isArray(fcst.hours) ? fcst.hours.map((h) => asNumber(h) ?? 0) : [];
  const windspd = Array.isArray(fcst.WINDSPD) ? fcst.WINDSPD : [];
  const gust = Array.isArray(fcst.GUST) ? fcst.GUST : [];
  const winddir = Array.isArray(fcst.WINDDIR) ? fcst.WINDDIR : [];
  const tmp = Array.isArray(fcst.TMP)
    ? fcst.TMP
    : Array.isArray(fcst.TMPE)
      ? fcst.TMPE
      : [];
  return hours.map((hour, i) => ({
    unixtime: initstamp + hour * 3600,
    hour,
    wind_avg: asNumber(windspd[i]),
    wind_max: asNumber(gust[i]),
    wind_min: null,
    wind_direction: asNumber(winddir[i]),
    temperature: asNumber(tmp[i]),
    wave_height: pickForecastWaveAt(fcst, i),
  }));
}

function readingFromForecastPoint(point) {
  return {
    wind_avg: point.wind_avg,
    wind_max: point.wind_max,
    wind_min: point.wind_min,
    wind_direction: point.wind_direction,
    temperature: point.temperature,
    wave_height: point.wave_height,
    datetime: new Date(point.unixtime * 1000).toISOString(),
    unixtime: point.unixtime,
  };
}

function metricKeyFromForecast(metric) {
  if (metric === 'wind_max') return 'wind_max';
  if (metric === 'temperature') return 'temperature';
  if (metric === 'wave_height') return 'wave_height';
  return 'wind_avg';
}

function historyFromForecastPoints(points, metric, hours, nowSec) {
  const windowSec = Math.max(1, Number(hours) || 6) * 3600;
  const cutoff = nowSec - windowSec;
  const rows = points.filter(
    (p) => p.unixtime >= cutoff && p.unixtime <= nowSec + 1800,
  );
  const key = metricKeyFromForecast(metric);
  return {
    unixtime: rows.map((p) => p.unixtime),
    values: rows.map((p) => p[key] ?? null),
  };
}

async function fetchSpotForecastBundle(spotId, preferredModel = null) {
  const id = String(spotId || '').trim();
  if (!/^\d+$/.test(id)) throw new Error('Spot ID must be numeric');
  const cacheKey = `${id}:${preferredModel == null ? 'auto' : preferredModel}`;
  const cached = forecastBundleCache.get(cacheKey);
  if (cached && cached.expires > Date.now()) return cached.value;

  const spot = await fetchJson(`https://www.windguru.cz/${id}`, {
    q: 'spot',
    id_spot: id,
  });
  const models = Array.isArray(spot?.models)
    ? spot.models.map((m) => Number(m)).filter((n) => Number.isFinite(n))
    : [];
  const idModel =
    preferredModel != null && models.includes(Number(preferredModel))
      ? Number(preferredModel)
      : models.includes(3)
        ? 3
        : models[0];
  if (idModel == null) {
    throw new Error(`Windguru spot #${id} has no forecast models`);
  }

  const data = await fetchJson(`https://www.windguru.cz/${id}`, {
    q: 'forecast',
    id_spot: id,
    id_model: String(idModel),
  });
  if (data?.return === 'error') {
    throw new Error(data.message || data.error_details || 'Forecast unavailable');
  }
  const fcst = data?.fcst;
  if (!fcst || !Array.isArray(fcst.hours) || !fcst.hours.length) {
    throw new Error('Forecast data missing');
  }

  const points = forecastPointsFromFcst(fcst);
  if (!points.length) throw new Error('Forecast data missing');
  const value = {
    points,
    idModel,
    modelName:
      fcst.model_name ||
      data?.wgmodel?.model_name ||
      data?.model ||
      `model ${idModel}`,
    spotName: typeof spot?.spotname === 'string' ? spot.spotname : undefined,
  };
  forecastBundleCache.set(cacheKey, {
    expires: Date.now() + FORECAST_BUNDLE_TTL_MS,
    value,
  });
  return value;
}

/**
 * Current (nearest-hour) GFS/model forecast for a Windguru spot.
 * Used when a spot has no native live sensor — UI and alerts both use this hour.
 */
export async function fetchSpotForecastNow(
  spotId,
  preferredModel = null,
  metric = 'wind_avg',
  hours = 6,
) {
  const bundle = await fetchSpotForecastBundle(spotId, preferredModel);
  const nowSec = Date.now() / 1000;
  let best = 0;
  let bestDelta = Infinity;
  for (let i = 0; i < bundle.points.length; i += 1) {
    const delta = Math.abs(bundle.points[i].unixtime - nowSec);
    if (delta < bestDelta) {
      bestDelta = delta;
      best = i;
    }
  }
  const point = bundle.points[best];
  return {
    reading: readingFromForecastPoint(point),
    modelName: bundle.modelName,
    idModel: bundle.idModel,
    hour: point.hour,
    spotName: bundle.spotName,
    history: historyFromForecastPoints(bundle.points, metric, hours, nowSec),
  };
}

export async function fetchSpotForecastHistory(spotId, metric, hours = 6) {
  const bundle = await fetchSpotForecastBundle(spotId);
  return historyFromForecastPoints(bundle.points, metric, hours, Date.now() / 1000);
}

/** Spot has no native Windguru live sensor — alerts use the model forecast. */
export function isForecastOnlySpot(station) {
  return (
    station?.kind === 'spot' &&
    !!(station.linkedLiveStation || station.liveLinkWarning)
  );
}

/** Stable alert-clock id. Forecast-only spots prefix so a switch from live→forecast resets hold. */
export function alertEvalId(station) {
  const sid = String(station?.stationId ?? '').trim();
  if (isForecastOnlySpot(station) && sid) return `forecast:${sid}`;
  return sid;
}

export async function fetchRecentHistory(stationId, metric, hours, avgMinutes = 10) {
  const resolved = await resolveWindguruId(stationId);
  const id = resolved.liveStationId;
  if (!id) throw new Error('No live station available for history');
  const vars =
    metric === 'wave_height'
      ? 'wind_avg,wave_height,wave,wvheight,swell_height'
      : metric;
  const raw = await fetchJson(`https://www.windguru.cz/station/${id}`, {
    q: 'station_data_last',
    id_station: id,
    hours: String(Math.max(1, Math.ceil(hours))),
    avg_minutes: String(avgMinutes),
    back_hours: '0',
    vars,
  });
  const unixtime = Array.isArray(raw.unixtime)
    ? raw.unixtime.map((v) => asNumber(v) || 0)
    : [];
  let values = [];
  if (metric === 'wave_height') {
    const found = ['wave_height', 'wave', 'wvheight', 'swell_height', 'Hs', 'hs'].find((k) =>
      Array.isArray(raw[k]),
    );
    values = found ? raw[found].map((v) => asNumber(v)) : unixtime.map(() => null);
  } else if (Array.isArray(raw[metric])) {
    values = raw[metric].map((v) => asNumber(v));
  } else {
    values = unixtime.map(() => null);
  }
  return { unixtime, values };
}

function meetsRule(value, rule) {
  if (value === null) return false;
  return rule.comparison === 'gte' ? value >= rule.threshold : value <= rule.threshold;
}

function gustSpreadKnots(reading) {
  if (reading.wind_avg == null || reading.wind_max == null) return null;
  return Math.max(0, reading.wind_max - reading.wind_avg);
}

function gustSpreadOk(reading, maxGustSpreadKnots, enabled = true) {
  if (!enabled) return true;
  const spread = gustSpreadKnots(reading);
  if (spread == null) return false;
  return spread <= Math.max(0, maxGustSpreadKnots);
}

function normalizeDegrees(deg) {
  const n = deg % 360;
  return n < 0 ? n + 360 : n;
}

function directionInSector(directionDeg, fromDeg, toDeg) {
  const d = normalizeDegrees(directionDeg);
  const from = normalizeDegrees(fromDeg);
  const to = normalizeDegrees(toDeg);
  if (from === to) return true;
  if (from < to) return d >= from && d <= to;
  return d >= from || d <= to;
}

function windDirectionOk(reading, rule, applicable = true) {
  if (!applicable || !rule.windDirEnabled) return true;
  if (reading.wind_direction == null) return false;
  return directionInSector(
    reading.wind_direction,
    rule.windDirFromDeg ?? 0,
    rule.windDirToDeg ?? 360,
  );
}

function maxWaveOk(reading, rule) {
  const windPrimary = rule.metric === 'wind_avg' || rule.metric === 'wind_max';
  if (!windPrimary || !rule.maxWaveEnabled) return true;
  if (reading.wave_height == null) return false;
  return reading.wave_height <= Math.max(0, rule.maxWaveHeightM ?? 1.5);
}

function maxWindOk(reading, rule) {
  if (rule.metric !== 'wave_height' || !rule.maxWindEnabled) return true;
  if (reading.wind_avg == null) return false;
  return reading.wind_avg <= Math.max(0, rule.maxWindKnots ?? 25);
}

function windDirectionName(deg) {
  if (deg == null || !Number.isFinite(Number(deg))) return null;
  const names = [
    'north',
    'north-east',
    'east',
    'south-east',
    'south',
    'south-west',
    'west',
    'north-west',
  ];
  const d = ((Number(deg) % 360) + 360) % 360;
  return names[Math.round(d / 45) % 8];
}

function formatDirectionSector(fromDeg, toDeg) {
  const from = windDirectionName(fromDeg) || 'north';
  const to = windDirectionName(toDeg) || 'north';
  return from === to ? from : `${from}–${to}`;
}

export function sustainedDurationMs(history, rule) {
  if (!history.unixtime?.length) return 0;
  const points = history.unixtime
    .map((ts, index) => ({ ts, value: history.values[index] ?? null }))
    .filter((p) => p.ts > 0)
    .sort((a, b) => b.ts - a.ts);
  if (!points.length || !meetsRule(points[0].value, rule)) return 0;
  let oldestOk = points[0].ts;
  for (let i = 1; i < points.length; i += 1) {
    if (!meetsRule(points[i].value, rule)) break;
    oldestOk = points[i].ts;
  }
  return Math.max(0, (points[0].ts - oldestOk) * 1000);
}

/** True when the current reading fully satisfies the station alert rule. */
export function alertConditionMet(reading, station) {
  if (!reading || reading.error) return false;
  const metric = station.rule?.metric;
  if (!metric || !station.rule) return false;
  const windPrimary = metric === 'wind_avg' || metric === 'wind_max';
  const wavePrimary = metric === 'wave_height';
  const dirApplicable = windPrimary || wavePrimary;
  const value = metricValue(reading, metric);
  const metricOk = meetsRule(value, station.rule);
  const spreadEnabled = windPrimary && !!station.rule.maxGustSpreadEnabled;
  const maxSpread = station.rule.maxGustSpreadKnots ?? 5;
  const spreadOk = gustSpreadOk(reading, maxSpread, spreadEnabled);
  const dirOk = windDirectionOk(reading, station.rule, dirApplicable);
  const waveCapOk = maxWaveOk(reading, station.rule);
  const windCapOk = maxWindOk(reading, station.rule);
  return metricOk && spreadOk && dirOk && waveCapOk && windCapOk;
}

/**
 * History is only needed to backfill sustained duration when the rule just became
 * true (no hot conditionSinceMs yet). Skip when the rule fails or the clock is hot.
 */
export function needsAlertHistory(reading, station, prev) {
  if (!alertConditionMet(reading, station)) return false;
  const sid = alertEvalId(station);
  if (prev?.lastStationId && prev.lastStationId !== sid) return true;
  if (prev?.conditionSinceMs != null) return false;
  return true;
}

export function evaluateAlert(reading, history, station, prev, nowMs = Date.now()) {
  const metric = station.rule.metric;
  const windPrimary = metric === 'wind_avg' || metric === 'wind_max';
  const wavePrimary = metric === 'wave_height';
  const dirApplicable = windPrimary || wavePrimary;

  const value = metricValue(reading, metric);
  const metricOk = meetsRule(value, station.rule);
  const spreadEnabled = windPrimary && !!station.rule.maxGustSpreadEnabled;
  const maxSpread = station.rule.maxGustSpreadKnots ?? 5;
  const spread = gustSpreadKnots(reading);
  const spreadOk = gustSpreadOk(reading, maxSpread, spreadEnabled);
  const dirOk = windDirectionOk(reading, station.rule, dirApplicable);
  const waveCapOk = maxWaveOk(reading, station.rule);
  const windCapOk = maxWindOk(reading, station.rule);
  const conditionMet = alertConditionMet(reading, station);
  const historySustainedMs = sustainedDurationMs(history, station.rule);

  let conditionSinceMs = prev.conditionSinceMs;
  let notifiedForRun = prev.notifiedForRun;

  const evalId = alertEvalId(station);
  if (prev.lastStationId && prev.lastStationId !== evalId) {
    conditionSinceMs = null;
    notifiedForRun = false;
  }

  if (!conditionMet) {
    conditionSinceMs = null;
    notifiedForRun = false;
  } else if (conditionSinceMs == null) {
    conditionSinceMs = historySustainedMs > 0 ? nowMs - historySustainedMs : nowMs;
  }

  const sustainedMs =
    conditionMet && conditionSinceMs != null
      ? Math.max(nowMs - conditionSinceMs, historySustainedMs)
      : 0;
  const requiredMs = station.rule.sustainedMinutes * 60 * 1000;
  const monitoringOn = station.enabled !== false;
  const shouldNotify =
    monitoringOn && conditionMet && sustainedMs >= requiredMs && !notifiedForRun;
  if (shouldNotify) notifiedForRun = true;

  const unit =
    metric === 'temperature' ? '°C' : metric === 'wave_height' ? 'm' : 'kt';
  const formatValue = (v) => {
    if (v == null || !Number.isFinite(Number(v))) return null;
    const n = Number(v);
    const rounded = Math.round(n * 10) / 10;
    const text =
      Math.abs(rounded - Math.round(rounded)) < 0.05
        ? String(Math.round(rounded))
        : rounded.toFixed(1);
    return `${text} ${unit}`;
  };
  const valueText = formatValue(value) ?? '—';

  let message; // status text; UI Alert column uses rule threshold, not this string
  if (!monitoringOn) message = 'Paused';
  else if (value == null) message = 'No reading';
  else if (!metricOk) message = valueText;
  else if (!spreadOk) message = spread == null ? 'Need gust reading' : 'Too gusty';
  else if (!waveCapOk)
    message = reading.wave_height == null ? 'Need wave reading' : 'Waves too high';
  else if (!windCapOk) message = reading.wind_avg == null ? 'Need wind reading' : 'Wind too strong';
  else if (!dirOk)
    message = reading.wind_direction == null ? 'Need direction' : 'Wrong direction';
  else if (sustainedMs < requiredMs) message = `Holding · ${valueText}`;
  else if (shouldNotify) message = `Alert · ${valueText}`;
  else message = `On target · ${valueText}`;

  return {
    result: {
      reading,
      metricValue: value,
      conditionMet,
      sustainedMs,
      shouldNotify,
      message,
    },
    nextState: {
      conditionSinceMs,
      notifiedForRun,
      lastCheckMs: nowMs,
      lastValue: value,
      lastError: null,
      lastStationId: evalId,
    },
  };
}
