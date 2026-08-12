/**
 * NOAA NDBC buoys / CMAN — public live wind + waves.
 * https://www.ndbc.noaa.gov/
 */
import {
  asNumber,
  emptyHistory,
  fetchText,
  historyFromPairs,
  msToKnots,
  reading,
} from './common.mjs';

const LATEST_URL = 'https://www.ndbc.noaa.gov/data/latest_obs/latest_obs.txt';
const REALTIME_URL = (id) => `https://www.ndbc.noaa.gov/data/realtime2/${id}.txt`;

let latestCache = { at: 0, map: null };
const LATEST_TTL_MS = 4 * 60 * 1000;

export function parseNdbcId(input) {
  const trimmed = String(input || '').trim();
  if (!trimmed) return null;
  const fromQuery = trimmed.match(/[?&]station=([A-Za-z0-9]+)/i);
  if (fromQuery) return fromQuery[1].toUpperCase();
  const fromPath = trimmed.match(/ndbc\.noaa\.gov\/[^?\s]*station[=/]([A-Za-z0-9]+)/i);
  if (fromPath) return fromPath[1].toUpperCase();
  if (/^[A-Za-z0-9]{3,8}$/.test(trimmed)) return trimmed.toUpperCase();
  return null;
}

function parseMm(value) {
  if (value == null) return null;
  const s = String(value).trim();
  if (!s || s === 'MM' || s === 'NaN') return null;
  return asNumber(s);
}

function rowToReading(fields) {
  // latest_obs columns (space-separated after header):
  // STN LAT LON YYYY MM DD hh mm WDIR WSPD GST WVHT ...
  const year = parseMm(fields[3]);
  const mo = parseMm(fields[4]);
  const dy = parseMm(fields[5]);
  const hh = parseMm(fields[6]);
  const mi = parseMm(fields[7]);
  let unixtime = null;
  let datetime = null;
  if (year && mo && dy != null && hh != null && mi != null) {
    const d = new Date(Date.UTC(year, mo - 1, dy, hh, mi));
    unixtime = Math.floor(d.getTime() / 1000);
    datetime = d.toISOString();
  }
  return reading({
    wind_direction: parseMm(fields[8]),
    wind_avg: msToKnots(parseMm(fields[9])),
    wind_max: msToKnots(parseMm(fields[10])),
    wave_height: parseMm(fields[11]),
    temperature: parseMm(fields[17]),
    datetime,
    unixtime,
  });
}

async function loadLatestMap() {
  const now = Date.now();
  if (latestCache.map && now - latestCache.at < LATEST_TTL_MS) return latestCache.map;
  const text = await fetchText(LATEST_URL);
  const map = new Map();
  for (const line of text.split(/\r?\n/)) {
    if (!line || line.startsWith('#')) continue;
    const fields = line.trim().split(/\s+/);
    if (fields.length < 11) continue;
    const id = String(fields[0] || '').toUpperCase();
    if (!id) continue;
    map.set(id, {
      reading: rowToReading(fields),
      lat: parseMm(fields[1]),
      lon: parseMm(fields[2]),
    });
  }
  latestCache = { at: now, map };
  return map;
}

/** Flat list for nearby search. */
export async function loadNdbcLatestEntries() {
  const map = await loadLatestMap();
  return [...map.entries()].map(([id, v]) => ({
    id,
    lat: v.lat,
    lon: v.lon,
    reading: v.reading,
  }));
}

export async function resolveNdbc(input) {
  const id = parseNdbcId(input);
  if (!id) throw new Error('Paste an NDBC station id (e.g. 41009)');
  const map = await loadLatestMap();
  const hit = map.get(id);
  if (!hit) throw new Error(`NDBC station ${id} not in latest observations`);
  return {
    provider: 'ndbc',
    inputId: id,
    stationId: id,
    kind: 'station',
    hasLiveStation: true,
    liveStationId: id,
    spotName: `NDBC ${id}`,
    sourceName: `NDBC ${id}`,
    linkedLiveStation: null,
    liveLinkWarning: null,
    lat: hit.lat,
    lon: hit.lon,
  };
}

export async function fetchNdbcCurrent(stationId) {
  const id = parseNdbcId(stationId) || String(stationId || '').trim().toUpperCase();
  const map = await loadLatestMap();
  const hit = map.get(id);
  if (!hit?.reading) throw new Error(`No NDBC reading for ${id}`);
  return hit.reading;
}

function parseRealtimeLine(header, fields) {
  const idx = (name) => header.indexOf(name);
  const get = (name) => {
    const i = idx(name);
    return i >= 0 ? parseMm(fields[i]) : null;
  };
  const year = get('#YY') ?? get('YY');
  const mo = get('MM');
  const dy = get('DD');
  const hh = get('hh');
  const mi = get('mm');
  let unixtime = null;
  if (year && mo && dy != null && hh != null && mi != null) {
    unixtime = Math.floor(Date.UTC(year, mo - 1, dy, hh, mi) / 1000);
  }
  return {
    unixtime,
    wind_avg: msToKnots(get('WSPD')),
    wind_max: msToKnots(get('GST')),
    wind_direction: get('WDIR'),
    temperature: get('ATMP'),
    wave_height: get('WVHT'),
  };
}

export async function fetchNdbcHistory(stationId, metric, hours = 6) {
  const id = parseNdbcId(stationId) || String(stationId || '').trim().toUpperCase();
  try {
    const text = await fetchText(REALTIME_URL(id));
    const lines = text.split(/\r?\n/).filter(Boolean);
    if (lines.length < 3) return emptyHistory();
    const header = lines[0].trim().split(/\s+/);
    const cutoff = Math.floor(Date.now() / 1000) - hours * 3600;
    const pairs = [];
    for (let i = 2; i < lines.length; i++) {
      const fields = lines[i].trim().split(/\s+/);
      if (fields.length < 5) continue;
      const row = parseRealtimeLine(header, fields);
      if (row.unixtime == null || row.unixtime < cutoff) continue;
      pairs.push(row);
    }
    pairs.sort((a, b) => a.unixtime - b.unixtime);
    return historyFromPairs(pairs, metric);
  } catch {
    return emptyHistory();
  }
}

export function ndbcStationUrl(id) {
  return `https://www.ndbc.noaa.gov/station_page.php?station=${encodeURIComponent(id)}`;
}
