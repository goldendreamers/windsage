/**
 * WeatherFlow Tempest — official REST API.
 * Requires TEMPEST_TOKEN (personal access token or OAuth).
 * Personal tokens typically cover stations you own.
 * https://weatherflow.github.io/Tempest/api/
 */
import { asNumber, emptyHistory, fetchJson, historyFromPairs, msToKnots, reading } from './common.mjs';

function token() {
  return (process.env.TEMPEST_TOKEN || process.env.WEATHERFLOW_TOKEN || '').trim();
}

export function tempestConfigured() {
  return !!token();
}

export function parseTempestId(input) {
  const trimmed = String(input || '').trim();
  if (!trimmed) return null;
  if (/^\d+$/.test(trimmed)) return trimmed;
  const m =
    trimmed.match(/tempest\.earth\/[^?\s]*\/(\d+)/i) ||
    trimmed.match(/tempestwx\.com\/[^?\s]*station\/(\d+)/i) ||
    trimmed.match(/\/station\/(\d+)/i) ||
    trimmed.match(/[?&]station_id=(\d+)/i);
  return m ? m[1] : null;
}

function requireToken() {
  const t = token();
  if (!t) {
    throw new Error(
      'Tempest is not configured — set TEMPEST_TOKEN on the Windsage server (Settings → Data Authorizations on tempest.earth)',
    );
  }
  return t;
}

function obsArrayToReading(obs) {
  // Tempest obs_st: [epoch, lull, avg, gust, dir, ...]
  if (!Array.isArray(obs) || obs.length < 5) return reading();
  const unixtime = asNumber(obs[0]);
  return reading({
    wind_min: msToKnots(obs[1]),
    wind_avg: msToKnots(obs[2]),
    wind_max: msToKnots(obs[3]),
    wind_direction: asNumber(obs[4]),
    temperature: asNumber(obs[7]),
    datetime: unixtime != null ? new Date(unixtime * 1000).toISOString() : null,
    unixtime,
  });
}

export async function resolveTempest(input) {
  const id = parseTempestId(input);
  if (!id) throw new Error('Paste a Tempest station id (numeric)');
  const t = requireToken();
  const url = new URL(`https://swd.weatherflow.com/swd/rest/stations/${id}`);
  url.searchParams.set('token', t);
  let data;
  try {
    data = await fetchJson(url.toString());
  } catch {
    // Fallback: list stations and find id
    const listUrl = new URL('https://swd.weatherflow.com/swd/rest/stations');
    listUrl.searchParams.set('token', t);
    data = await fetchJson(listUrl.toString());
  }
  const stations = data?.stations || (data?.station ? [data.station] : []);
  const st = stations.find((s) => String(s.station_id) === String(id)) || stations[0];
  if (!st || String(st.station_id) !== String(id)) {
    throw new Error(
      `Tempest station ${id} not visible with this token (personal tokens only see stations you own)`,
    );
  }
  const name = st.name || `Tempest ${id}`;
  return {
    provider: 'tempest',
    inputId: id,
    stationId: id,
    kind: 'station',
    hasLiveStation: true,
    liveStationId: id,
    spotName: name,
    sourceName: name,
    linkedLiveStation: null,
    liveLinkWarning: null,
    lat: asNumber(st.latitude),
    lon: asNumber(st.longitude),
  };
}

export async function fetchTempestCurrent(stationId) {
  const id = parseTempestId(stationId) || String(stationId || '').trim();
  const t = requireToken();
  const url = new URL(`https://swd.weatherflow.com/swd/rest/observations/station/${id}`);
  url.searchParams.set('token', t);
  const data = await fetchJson(url.toString());
  const obs = data?.obs?.[0] || data?.obs;
  if (Array.isArray(obs) && typeof obs[0] === 'number') {
    return obsArrayToReading(obs);
  }
  if (Array.isArray(obs) && Array.isArray(obs[0])) {
    return obsArrayToReading(obs[0]);
  }
  // Some responses nest under obs[0].obs
  const nested = data?.obs?.[0]?.obs;
  if (Array.isArray(nested)) return obsArrayToReading(nested);
  throw new Error(`No Tempest reading for station ${id}`);
}

export async function fetchTempestHistory(stationId, metric, hours = 6) {
  // Tempest REST history needs device_id + time_start/end; without device lookup
  // we fall back to empty history (alert still uses current + duration clock).
  void stationId;
  void metric;
  void hours;
  return emptyHistory();
}

export function tempestStationUrl(id) {
  return `https://tempestwx.com/station/${encodeURIComponent(id)}`;
}
