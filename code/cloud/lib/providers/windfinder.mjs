/**
 * Windfinder — commercial API only.
 * Set WINDFINDER_API_KEY (+ optional WINDFINDER_API_BASE) when you have business access.
 * https://www.windfinder.com/about/windfinder-for-businesses
 */
import { asNumber, emptyHistory, fetchJson, reading } from './common.mjs';

function apiKey() {
  return (process.env.WINDFINDER_API_KEY || process.env.WINDFINDER_TOKEN || '').trim();
}

function apiBase() {
  return (
    process.env.WINDFINDER_API_BASE ||
    'https://api.windfinder.com/v2'
  ).replace(/\/$/, '');
}

export function windfinderConfigured() {
  return !!apiKey();
}

export function parseWindfinderId(input) {
  const trimmed = String(input || '').trim();
  if (!trimmed) return null;
  const m =
    trimmed.match(/windfinder\.com\/(?:report|forecast|weatherforecast)\/([A-Za-z0-9_-]+)/i) ||
    trimmed.match(/^(?:report|forecast)\/([A-Za-z0-9_-]+)$/i);
  if (m) return m[1].toLowerCase();
  if (/^[A-Za-z0-9_-]{2,64}$/.test(trimmed)) return trimmed.toLowerCase();
  return null;
}

function requireKey() {
  const key = apiKey();
  if (!key) {
    throw new Error(
      'Windfinder needs a business API key — set WINDFINDER_API_KEY on the server (windfinder.com/about/windfinder-for-businesses)',
    );
  }
  return key;
}

export async function resolveWindfinder(input) {
  const id = parseWindfinderId(input);
  if (!id) throw new Error('Paste a Windfinder report slug (e.g. tarifa)');
  const key = requireKey();
  // Endpoint path is vendor-specific; keep configurable via WINDFINDER_API_BASE.
  const url = new URL(`${apiBase()}/stations/${encodeURIComponent(id)}`);
  url.searchParams.set('key', key);
  const data = await fetchJson(url.toString(), {
    Authorization: `Bearer ${key}`,
    'X-API-Key': key,
  });
  const name = data?.name || data?.station_name || id;
  return {
    provider: 'windfinder',
    inputId: id,
    stationId: id,
    kind: 'station',
    hasLiveStation: true,
    liveStationId: id,
    spotName: name,
    sourceName: name,
    linkedLiveStation: null,
    liveLinkWarning: null,
    lat: asNumber(data?.lat ?? data?.latitude),
    lon: asNumber(data?.lon ?? data?.longitude),
  };
}

export async function fetchWindfinderCurrent(stationId) {
  const id = parseWindfinderId(stationId) || String(stationId || '').trim().toLowerCase();
  const key = requireKey();
  const url = new URL(`${apiBase()}/stations/${encodeURIComponent(id)}/observations/latest`);
  url.searchParams.set('key', key);
  const data = await fetchJson(url.toString(), {
    Authorization: `Bearer ${key}`,
    'X-API-Key': key,
  });
  const wind = asNumber(data?.wind_speed ?? data?.windspeed ?? data?.wind?.speed);
  const gust = asNumber(data?.wind_gust ?? data?.windgust ?? data?.wind?.gust);
  const dir = asNumber(data?.wind_direction ?? data?.winddirection ?? data?.wind?.direction);
  const temp = asNumber(data?.temperature ?? data?.air_temperature);
  const wave = asNumber(data?.wave_height ?? data?.waves?.height);
  const unixtime = asNumber(data?.unixtime ?? data?.timestamp);
  return reading({
    wind_avg: wind,
    wind_max: gust,
    wind_direction: dir,
    temperature: temp,
    wave_height: wave,
    datetime: unixtime != null ? new Date(unixtime * 1000).toISOString() : null,
    unixtime,
  });
}

export async function fetchWindfinderHistory() {
  return emptyHistory();
}

export function windfinderStationUrl(id) {
  return `https://www.windfinder.com/report/${encodeURIComponent(id)}`;
}
