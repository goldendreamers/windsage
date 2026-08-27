/**
 * Synoptic / MesoWest-style mesonet follows.
 * Prefer SYNOPTIC_TOKEN when set. Otherwise use NOAA Aviation Weather Center
 * METARs (no key) for ICAO ids such as LLBG or KSLC.
 */
import {
  asNumber,
  emptyHistory,
  fetchJson,
  historyFromPairs,
  msToKnots,
  reading,
} from './common.mjs';

const AWC_HEADERS = {
  Accept: 'application/json',
  'User-Agent': 'Windsage/1.0 (https://windsage.nimrod.bio)',
};

function token() {
  return (process.env.SYNOPTIC_TOKEN || process.env.SYNOPTIC_API_TOKEN || '').trim();
}

/** Always on: AWC METAR fallback when no Synoptic token. */
export function synopticConfigured() {
  return true;
}

export function parseSynopticId(input) {
  const trimmed = String(input || '').trim();
  if (!trimmed) return null;
  const fromQuery = trimmed.match(/[?&]stid=([A-Za-z0-9._-]+)/i);
  if (fromQuery) return fromQuery[1].toUpperCase();
  if (/^[A-Za-z0-9._-]{3,32}$/.test(trimmed)) return trimmed.toUpperCase();
  return null;
}

/** ICAO / US METAR id for the no-token AWC path. */
export function icaoFromSynopticId(id) {
  const s = String(id || '')
    .trim()
    .toUpperCase();
  if (/^[A-Z]{4}$/.test(s)) return s;
  if (/^[A-Z]{3}$/.test(s)) return `K${s}`;
  return null;
}

function obsToReading(obs) {
  const wind = asNumber(obs?.wind_speed?.value ?? obs?.wind_speed);
  const gust = asNumber(obs?.wind_gust?.value ?? obs?.wind_gust);
  const dir = asNumber(obs?.wind_direction?.value ?? obs?.wind_direction);
  const temp = asNumber(obs?.air_temp?.value ?? obs?.air_temp);
  const wave = asNumber(
    obs?.wave_height?.value ?? obs?.significant_wave_height?.value ?? obs?.wave_height,
  );
  const dateTime = obs?.wind_speed?.date_time || obs?.air_temp?.date_time || null;
  const unixtime = dateTime ? Math.floor(Date.parse(dateTime) / 1000) : null;
  return reading({
    wind_avg: msToKnots(wind),
    wind_max: msToKnots(gust),
    wind_direction: dir,
    temperature: temp,
    wave_height: wave,
    datetime: dateTime,
    unixtime,
  });
}

function metarToReading(ob) {
  const wspd = asNumber(ob?.wspd);
  const wgst = asNumber(ob?.wgst);
  let wdir = ob?.wdir;
  if (wdir === 'VRB' || wdir === 'variable') wdir = null;
  wdir = asNumber(wdir);
  return reading({
    wind_avg: wspd,
    wind_max: wgst ?? wspd,
    wind_direction: wdir,
    temperature: asNumber(ob?.temp),
    datetime: ob?.reportTime || ob?.receiptTime || null,
    unixtime: asNumber(ob?.obsTime),
  });
}

async function awcStationInfo(id) {
  const icao = icaoFromSynopticId(id);
  if (!icao) return null;
  const tried = icao === id.toUpperCase() ? [icao] : [id.toUpperCase(), icao];
  for (const code of [...new Set(tried)]) {
    try {
      const rows = await fetchJson(
        `https://aviationweather.gov/api/data/stationinfo?ids=${encodeURIComponent(code)}`,
        AWC_HEADERS,
      );
      const st = Array.isArray(rows) ? rows[0] : null;
      if (st?.icaoId || st?.id) return st;
    } catch {
      // try next candidate
    }
  }
  return null;
}

async function awcMetars(id, hours = 0) {
  const icao = icaoFromSynopticId(id) || String(id || '').trim().toUpperCase();
  const url = new URL('https://aviationweather.gov/api/data/metar');
  url.searchParams.set('ids', icao);
  url.searchParams.set('format', 'json');
  if (hours > 0) url.searchParams.set('hours', String(hours));
  const rows = await fetchJson(url.toString(), AWC_HEADERS);
  return Array.isArray(rows) ? rows : [];
}

async function resolveViaAwc(id) {
  const st = await awcStationInfo(id);
  if (!st) {
    throw new Error(
      `Unknown station ${id} — use an ICAO id (LLBG, KSLC). A Synoptic token unlocks extra mesonets.`,
    );
  }
  const icao = String(st.icaoId || st.id || id).toUpperCase();
  const name = String(st.site || st.name || icao).trim();
  const place = [st.state, st.country].filter(Boolean).join(', ');
  return {
    provider: 'synoptic',
    inputId: id,
    stationId: icao,
    kind: 'station',
    hasLiveStation: true,
    liveStationId: icao,
    spotName: place ? `${name} (${place})` : name,
    sourceName: place ? `${name} (${place})` : name,
    linkedLiveStation: null,
    liveLinkWarning: null,
    lat: asNumber(st.lat),
    lon: asNumber(st.lon),
  };
}

export async function resolveSynoptic(input) {
  const id = parseSynopticId(input);
  if (!id) throw new Error('Paste an ICAO / mesonet id (e.g. LLBG or KSLC)');
  const t = token();
  if (t) {
    try {
      const url = new URL('https://api.synopticdata.com/v2/stations/metadata');
      url.searchParams.set('token', t);
      url.searchParams.set('stid', id);
      const data = await fetchJson(url.toString());
      const st = data?.STATION?.[0];
      if (st) {
        const name = st.NAME || st.STID || id;
        return {
          provider: 'synoptic',
          inputId: id,
          stationId: String(st.STID || id).toUpperCase(),
          kind: 'station',
          hasLiveStation: true,
          liveStationId: String(st.STID || id).toUpperCase(),
          spotName: name,
          sourceName: name,
          linkedLiveStation: null,
          liveLinkWarning: null,
          lat: asNumber(st.LATITUDE),
          lon: asNumber(st.LONGITUDE),
        };
      }
    } catch {
      // fall through to AWC
    }
  }
  return resolveViaAwc(id);
}

export async function fetchSynopticCurrent(stationId) {
  const id = parseSynopticId(stationId) || String(stationId || '').trim().toUpperCase();
  const t = token();
  if (t) {
    try {
      const url = new URL('https://api.synopticdata.com/v2/stations/latest');
      url.searchParams.set('token', t);
      url.searchParams.set('stid', id);
      url.searchParams.set(
        'vars',
        'wind_speed,wind_gust,wind_direction,air_temp,wave_height,significant_wave_height',
      );
      const data = await fetchJson(url.toString());
      const st = data?.STATION?.[0];
      if (st?.OBSERVATIONS) return obsToReading(st.OBSERVATIONS);
    } catch {
      // fall through to AWC
    }
  }
  const rows = await awcMetars(id, 0);
  if (!rows.length) throw new Error(`No METAR for ${id}`);
  return metarToReading(rows[0]);
}

export async function fetchSynopticHistory(stationId, metric, hours = 6) {
  const id = parseSynopticId(stationId) || String(stationId || '').trim().toUpperCase();
  try {
    const t = token();
    if (t) {
      const url = new URL('https://api.synopticdata.com/v2/stations/timeseries');
      url.searchParams.set('token', t);
      url.searchParams.set('stid', id);
      url.searchParams.set('recent', String(Math.max(60, hours * 60)));
      url.searchParams.set('vars', 'wind_speed,wind_gust,air_temp,wave_height');
      const data = await fetchJson(url.toString());
      const st = data?.STATION?.[0];
      const obs = st?.OBSERVATIONS;
      if (obs) {
        const times = obs.date_time || [];
        const pairs = [];
        for (let i = 0; i < times.length; i++) {
          const unixtime = Math.floor(Date.parse(times[i]) / 1000);
          pairs.push({
            unixtime,
            wind_avg: msToKnots(asNumber(obs.wind_speed?.[i])),
            wind_max: msToKnots(asNumber(obs.wind_gust?.[i])),
            temperature: asNumber(obs.air_temp?.[i]),
            wave_height: asNumber(obs.wave_height?.[i]),
          });
        }
        return historyFromPairs(pairs, metric);
      }
    }
    const rows = await awcMetars(id, Math.max(1, hours));
    const pairs = rows.map((ob) => ({
      unixtime: asNumber(ob.obsTime),
      wind_avg: asNumber(ob.wspd),
      wind_max: asNumber(ob.wgst) ?? asNumber(ob.wspd),
      temperature: asNumber(ob.temp),
      wave_height: null,
    }));
    return historyFromPairs(pairs, metric);
  } catch {
    return emptyHistory();
  }
}

export function synopticStationUrl(id) {
  const icao = icaoFromSynopticId(id) || String(id || '').trim().toUpperCase();
  return `https://aviationweather.gov/data/metar/?ids=${encodeURIComponent(icao)}`;
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

export function bboxFromRadiusKm(lat, lon, radiusKm) {
  const r = Math.max(1, Number(radiusKm) || 50);
  const dLat = r / 111;
  const cos = Math.max(0.2, Math.cos((Number(lat) * Math.PI) / 180));
  const dLon = r / (111 * cos);
  return {
    lat0: Math.max(-90, Number(lat) - dLat),
    lon0: Math.max(-180, Number(lon) - dLon),
    lat1: Math.min(90, Number(lat) + dLat),
    lon1: Math.min(180, Number(lon) + dLon),
  };
}

function hasMetar(st) {
  const types = st?.siteType;
  if (types == null) return true;
  const list = Array.isArray(types) ? types : [types];
  return list.some((t) => String(t).toUpperCase().includes('METAR'));
}

/** Nearby ICAO / METAR sites for location blend (no Synoptic token). */
export async function loadAwcNearbyStations(lat, lon, radiusKm = 50, limit = 4) {
  const box = bboxFromRadiusKm(lat, lon, radiusKm);
  const url = new URL('https://aviationweather.gov/api/data/stationinfo');
  url.searchParams.set(
    'bbox',
    `${box.lat0.toFixed(3)},${box.lon0.toFixed(3)},${box.lat1.toFixed(3)},${box.lon1.toFixed(3)}`,
  );
  url.searchParams.set('format', 'json');
  const rows = await fetchJson(url.toString(), AWC_HEADERS);
  const list = Array.isArray(rows) ? rows : [];
  const out = [];
  const seen = new Set();
  for (const st of list) {
    if (!hasMetar(st)) continue;
    const icao = String(st.icaoId || st.id || '').trim().toUpperCase();
    const sLat = asNumber(st.lat);
    const sLon = asNumber(st.lon);
    if (!icao || sLat == null || sLon == null || seen.has(icao)) continue;
    const distanceKm = haversineKm(lat, lon, sLat, sLon);
    if (distanceKm > radiusKm) continue;
    seen.add(icao);
    const site = String(st.site || st.name || icao).trim();
    out.push({
      provider: 'synoptic',
      stationId: icao,
      name: site && site !== icao ? `${site} (${icao})` : icao,
      distanceKm,
      lat: sLat,
      lon: sLon,
      elevM: asNumber(st.elev ?? st.elevation),
      surface: 'land',
    });
  }
  out.sort((a, b) => a.distanceKm - b.distanceKm);
  return out.slice(0, Math.max(1, limit));
}
