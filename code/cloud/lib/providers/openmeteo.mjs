/**
 * Open-Meteo — free model “now” at any lat/lon (not a physical station).
 * https://open-meteo.com/
 */
import { asNumber, emptyHistory, fetchJson, historyFromPairs, reading } from './common.mjs';

export function parseOpenMeteoCoords(input) {
  const trimmed = String(input || '').trim();
  if (!trimmed) return null;
  const m = trimmed.match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
  if (!m) return null;
  const lat = Number(m[1]);
  const lon = Number(m[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { lat, lon, id: `${lat.toFixed(4)},${lon.toFixed(4)}` };
}

async function geocode(name) {
  const url = new URL('https://geocoding-api.open-meteo.com/v1/search');
  url.searchParams.set('name', name);
  url.searchParams.set('count', '1');
  url.searchParams.set('language', 'en');
  url.searchParams.set('format', 'json');
  const data = await fetchJson(url.toString());
  const hit = data?.results?.[0];
  if (!hit) throw new Error(`No place found for “${name}”`);
  const lat = asNumber(hit.latitude);
  const lon = asNumber(hit.longitude);
  if (lat == null || lon == null) throw new Error('Geocode missing coordinates');
  const label = [hit.name, hit.admin1, hit.country].filter(Boolean).join(', ');
  return {
    lat,
    lon,
    id: `${lat.toFixed(4)},${lon.toFixed(4)}`,
    label,
  };
}

export async function resolveOpenMeteo(input) {
  const trimmed = String(input || '').trim();
  let coords = parseOpenMeteoCoords(trimmed);
  let sourceName = null;
  if (!coords) {
    if (trimmed.length < 2) throw new Error('Enter lat,lon or a place name');
    const geo = await geocode(trimmed);
    coords = { lat: geo.lat, lon: geo.lon, id: geo.id };
    sourceName = geo.label;
  } else {
    sourceName = `Open-Meteo ${coords.id}`;
  }
  return {
    provider: 'openmeteo',
    inputId: coords.id,
    stationId: coords.id,
    kind: 'station',
    hasLiveStation: true,
    liveStationId: coords.id,
    spotName: sourceName,
    sourceName,
    linkedLiveStation: null,
    liveLinkWarning:
      'Open-Meteo is a weather model at this point — not a physical anemometer.',
    lat: coords.lat,
    lon: coords.lon,
  };
}

function parseId(stationId) {
  const coords = parseOpenMeteoCoords(stationId);
  if (!coords) throw new Error(`Bad Open-Meteo id: ${stationId}`);
  return coords;
}

function currentFromOpenMeteoPayload(data) {
  const c = data?.current || {};
  const time = typeof c.time === 'string' ? c.time : null;
  const unixtime = time ? Math.floor(Date.parse(`${time}Z`) / 1000) : null;
  return reading({
    wind_avg: asNumber(c.wind_speed_10m),
    wind_max: asNumber(c.wind_gusts_10m),
    wind_direction: asNumber(c.wind_direction_10m),
    temperature: asNumber(c.temperature_2m),
    datetime: time ? `${time}Z` : null,
    unixtime,
  });
}

export async function fetchOpenMeteoCurrent(stationId) {
  const { lat, lon } = parseId(stationId);
  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.searchParams.set('latitude', String(lat));
  url.searchParams.set('longitude', String(lon));
  url.searchParams.set(
    'current',
    'wind_speed_10m,wind_gusts_10m,wind_direction_10m,temperature_2m',
  );
  url.searchParams.set('wind_speed_unit', 'kn');
  url.searchParams.set('timezone', 'UTC');
  const data = await fetchJson(url.toString());
  return currentFromOpenMeteoPayload(data);
}

/**
 * Current wind at many lat/lon points in one Open-Meteo call.
 * @param {Array<{lat:number,lon:number}>} points
 */
export async function fetchOpenMeteoCurrentMany(points) {
  const list = (Array.isArray(points) ? points : [])
    .map((p) => ({ lat: Number(p?.lat), lon: Number(p?.lon) }))
    .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon));
  if (!list.length) return [];
  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.searchParams.set('latitude', list.map((p) => p.lat).join(','));
  url.searchParams.set('longitude', list.map((p) => p.lon).join(','));
  url.searchParams.set(
    'current',
    'wind_speed_10m,wind_gusts_10m,wind_direction_10m,temperature_2m',
  );
  url.searchParams.set('wind_speed_unit', 'kn');
  url.searchParams.set('timezone', 'UTC');
  const data = await fetchJson(url.toString());
  const rows = Array.isArray(data) ? data : [data];
  return list.map((p, i) => {
    const r = currentFromOpenMeteoPayload(rows[i] || {});
    return {
      lat: p.lat,
      lon: p.lon,
      wind_avg: r.wind_avg,
      wind_max: r.wind_max,
      wind_direction: r.wind_direction,
      temperature: r.temperature,
    };
  });
}

export async function fetchOpenMeteoHistory(stationId, metric, hours = 6) {
  const { lat, lon } = parseId(stationId);
  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.searchParams.set('latitude', String(lat));
  url.searchParams.set('longitude', String(lon));
  url.searchParams.set('hourly', 'wind_speed_10m,wind_gusts_10m,temperature_2m');
  url.searchParams.set('past_hours', String(Math.max(1, Math.min(48, hours))));
  url.searchParams.set('forecast_hours', '1');
  url.searchParams.set('wind_speed_unit', 'kn');
  url.searchParams.set('timezone', 'UTC');
  try {
    const data = await fetchJson(url.toString());
    const times = data?.hourly?.time || [];
    const pairs = [];
    for (let i = 0; i < times.length; i++) {
      const t = times[i];
      const unixtime = Math.floor(Date.parse(`${t}Z`) / 1000);
      pairs.push({
        unixtime,
        wind_avg: asNumber(data.hourly.wind_speed_10m?.[i]),
        wind_max: asNumber(data.hourly.wind_gusts_10m?.[i]),
        temperature: asNumber(data.hourly.temperature_2m?.[i]),
        wave_height: null,
      });
    }
    return historyFromPairs(pairs, metric);
  } catch {
    return emptyHistory();
  }
}

export function openMeteoStationUrl(id) {
  const coords = parseOpenMeteoCoords(id);
  if (!coords) return 'https://open-meteo.com/';
  return `https://open-meteo.com/en/docs#latitude=${coords.lat}&longitude=${coords.lon}`;
}
