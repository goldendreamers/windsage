/**
 * Synoptic Data (MesoWest) — mesonet observations.
 * Requires SYNOPTIC_TOKEN in the cloud env.
 * https://docs.synopticdata.com/
 */
import {
  asNumber,
  emptyHistory,
  fetchJson,
  historyFromPairs,
  msToKnots,
  reading,
} from './common.mjs';

function token() {
  return (process.env.SYNOPTIC_TOKEN || process.env.SYNOPTIC_API_TOKEN || '').trim();
}

export function synopticConfigured() {
  return !!token();
}

export function parseSynopticId(input) {
  const trimmed = String(input || '').trim();
  if (!trimmed) return null;
  const fromQuery = trimmed.match(/[?&]stid=([A-Za-z0-9._-]+)/i);
  if (fromQuery) return fromQuery[1].toUpperCase();
  if (/^[A-Za-z0-9._-]{3,32}$/.test(trimmed)) return trimmed.toUpperCase();
  return null;
}

function requireToken() {
  const t = token();
  if (!t) {
    throw new Error(
      'Synoptic is not configured — set SYNOPTIC_TOKEN on the Windsage server (free token at developers.synopticdata.com)',
    );
  }
  return t;
}

function obsToReading(obs) {
  // Synoptic wind speeds are typically m/s unless units=english
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

export async function resolveSynoptic(input) {
  const id = parseSynopticId(input);
  if (!id) throw new Error('Paste a Synoptic/MesoWest station id (e.g. KSLC)');
  const t = requireToken();
  const url = new URL('https://api.synopticdata.com/v2/stations/metadata');
  url.searchParams.set('token', t);
  url.searchParams.set('stid', id);
  const data = await fetchJson(url.toString());
  const st = data?.STATION?.[0];
  if (!st) throw new Error(`Unknown Synoptic station ${id}`);
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

export async function fetchSynopticCurrent(stationId) {
  const id = parseSynopticId(stationId) || String(stationId || '').trim().toUpperCase();
  const t = requireToken();
  const url = new URL('https://api.synopticdata.com/v2/stations/latest');
  url.searchParams.set('token', t);
  url.searchParams.set('stid', id);
  url.searchParams.set(
    'vars',
    'wind_speed,wind_gust,wind_direction,air_temp,wave_height,significant_wave_height',
  );
  const data = await fetchJson(url.toString());
  const st = data?.STATION?.[0];
  if (!st?.OBSERVATIONS) throw new Error(`No Synoptic reading for ${id}`);
  return obsToReading(st.OBSERVATIONS);
}

export async function fetchSynopticHistory(stationId, metric, hours = 6) {
  const id = parseSynopticId(stationId) || String(stationId || '').trim().toUpperCase();
  try {
    const t = requireToken();
    const url = new URL('https://api.synopticdata.com/v2/stations/timeseries');
    url.searchParams.set('token', t);
    url.searchParams.set('stid', id);
    url.searchParams.set('recent', String(Math.max(60, hours * 60)));
    url.searchParams.set('vars', 'wind_speed,wind_gust,air_temp,wave_height');
    const data = await fetchJson(url.toString());
    const st = data?.STATION?.[0];
    const obs = st?.OBSERVATIONS;
    if (!obs) return emptyHistory();
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
  } catch {
    return emptyHistory();
  }
}

export function synopticStationUrl(id) {
  return `https://www.synopticdata.com/`;
}
