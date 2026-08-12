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

async function fetchJson(refererUrl, query) {
  const url = new URL(BASE);
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  const response = await fetch(url, {
    headers: {
      Referer: refererUrl,
      Accept: 'application/json',
    },
  });
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
  const list = await fetchJson('https://www.windguru.cz/', { q: 'station_list' });
  if (!Array.isArray(list)) throw new Error('Windguru station_list unavailable');
  stationListCache = { list, expires: Date.now() + STATION_LIST_TTL_MS };
  return list;
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
  return `No live sensor on this spot — using nearest live station ${linked.name} (#${linked.id}, ${km} km)`;
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
 * otherwise attach the geographically nearest live station and warn.
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
      (station.kind === 'spot' && !station.liveStationId);
    if (!needsEnrich) {
      out.push(station);
      continue;
    }
    try {
      const resolved = await resolveWindguruId(String(station.stationId).trim());
      changed += 1;
      out.push({
        ...station,
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

function formatDirectionSector(fromDeg, toDeg) {
  const from = Math.round(normalizeDegrees(fromDeg));
  const to = Math.round(normalizeDegrees(toDeg));
  return `${from}–${to}°`;
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
  const conditionMet = metricOk && spreadOk && dirOk && waveCapOk && windCapOk;
  const historySustainedMs = sustainedDurationMs(history, station.rule);

  let conditionSinceMs = prev.conditionSinceMs;
  let notifiedForRun = prev.notifiedForRun;

  if (prev.lastStationId && prev.lastStationId !== station.stationId) {
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
  const shouldNotify =
    station.enabled && conditionMet && sustainedMs >= requiredMs && !notifiedForRun;
  if (shouldNotify) notifiedForRun = true;

  const unit =
    metric === 'temperature' ? '°C' : metric === 'wave_height' ? 'm' : 'kt';
  const cmp = station.rule.comparison === 'gte' ? '≥' : '≤';
  const valueText = value == null ? 'n/a' : `${value.toFixed(1)} ${unit}`;
  const label = metric;
  const spreadText = spread == null ? 'n/a' : `${spread.toFixed(1)} kt`;
  const dirText =
    reading.wind_direction == null ? 'n/a' : `${Math.round(reading.wind_direction)}°`;
  const sectorText = formatDirectionSector(
    station.rule.windDirFromDeg ?? 0,
    station.rule.windDirToDeg ?? 360,
  );
  const maxWave = station.rule.maxWaveHeightM ?? 1.5;
  const maxWind = station.rule.maxWindKnots ?? 25;
  const waveText =
    reading.wave_height == null ? 'n/a' : `${reading.wave_height.toFixed(1)} m`;
  const windAvgText =
    reading.wind_avg == null ? 'n/a' : `${reading.wind_avg.toFixed(1)} kt`;

  let message;
  if (!station.enabled) message = 'Monitoring paused';
  else if (value == null) message = `${label} is not reported by this station`;
  else if (!metricOk)
    message = `Waiting — ${label} ${valueText} (need ${cmp}${station.rule.threshold} ${unit})`;
  else if (!spreadOk) {
    message =
      spread == null
        ? `Waiting — need gust + avg to check spread (limit ≤${maxSpread} kt)`
        : `Too gusty — spread ${spreadText} (limit ≤${maxSpread} kt)`;
  } else if (!waveCapOk) {
    message =
      reading.wave_height == null
        ? `Waiting — need wave height (max ≤${maxWave} m)`
        : `Waves too big — ${waveText} (max ≤${maxWave} m)`;
  } else if (!windCapOk) {
    message =
      reading.wind_avg == null
        ? `Waiting — need wind avg (max ≤${maxWind} kt)`
        : `Wind too strong — ${windAvgText} (max ≤${maxWind} kt)`;
  } else if (!dirOk) {
    message =
      reading.wind_direction == null
        ? `Waiting — need wind direction (limit ${sectorText})`
        : `Wrong direction — ${dirText} (need ${sectorText})`;
  } else if (sustainedMs < requiredMs) {
    const heldMin = Math.floor(sustainedMs / 60000);
    message = spreadEnabled
      ? `Holding ${valueText} · spread ${spreadText} for ${heldMin}/${station.rule.sustainedMinutes} min`
      : `Holding ${valueText} for ${heldMin}/${station.rule.sustainedMinutes} min`;
  } else if (shouldNotify) {
    const extras = [
      spreadEnabled ? `spread ≤${maxSpread} kt` : null,
      station.rule.maxWaveEnabled && windPrimary ? `wave ≤${maxWave} m` : null,
      station.rule.maxWindEnabled && wavePrimary ? `wind ≤${maxWind} kt` : null,
      station.rule.windDirEnabled && dirApplicable ? `dir ${dirText}` : null,
    ].filter(Boolean);
    message = `Alert — ${label} ${cmp}${station.rule.threshold} ${unit} for ${station.rule.sustainedMinutes}+ min (now ${valueText}${extras.length ? `, ${extras.join(', ')}` : ''})`;
  } else {
    message = `Condition still met (${valueText}${spreadEnabled ? `, spread ${spreadText}` : ''}). Already notified for this run.`;
  }

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
      lastStationId: station.stationId,
    },
  };
}
