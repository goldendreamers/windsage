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
