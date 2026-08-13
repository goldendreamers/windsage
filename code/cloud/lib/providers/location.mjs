/**
 * Location blend — pin/address → nearest live stations → weighted average.
 * Weights: inverse-distance × trust(accuracy) × user rating.
 */
import { asNumber, emptyHistory, historyFromPairs, reading } from './common.mjs';
import { fetchNdbcCurrent } from './ndbc.mjs';
import { fetchOpenMeteoCurrent } from './openmeteo.mjs';
import { fetchCurrentReading as wgCurrent } from '../wind.mjs';

const MS_TO_KT = 1.943844;

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

export function parseLocationId(input) {
  const trimmed = String(input || '').trim();
  if (!trimmed) return null;
  const bare = trimmed.replace(/^loc:/i, '');
  const m = bare.match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
  if (!m) return null;
  const lat = Number(m[1]);
  const lon = Number(m[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { lat, lon, id: `${lat.toFixed(4)},${lon.toFixed(4)}` };
}

function trustKey(provider, stationId) {
  return `${provider}:${stationId}`;
}

/** Map MAE (knots) → 0..1 accuracy score (higher = better). */
export function accuracyScoreFromMae(mae, samples = 0) {
  if (samples < 3 || mae == null || !Number.isFinite(mae)) return 0.55;
  // 0 kt MAE → 1.0, 8+ kt → ~0.15
  const score = 1 / (1 + Math.max(0, mae) / 2.5);
  return Math.max(0.15, Math.min(1, score));
}

export function memberWeight(member, trust) {
  const d = Math.max(0, Number(member.distanceKm) || 0);
  const distW = 1 / (d + 1) ** 2;
  const key = trustKey(member.provider, member.stationId);
  const t = trust?.[key];
  const acc = accuracyScoreFromMae(t?.maeWind, t?.samples || 0);
  const rating =
    member.rating != null && Number.isFinite(Number(member.rating))
      ? Math.max(1, Math.min(5, Number(member.rating))) / 5
      : t?.ratingAvg != null
        ? Math.max(1, Math.min(5, Number(t.ratingAvg))) / 5
        : 0.7;
  return distW * (0.35 + 0.65 * acc) * (0.5 + 0.5 * rating);
}

async function loadWindguruCandidates(lat, lon, radiusKm, limit) {
  const { getStationListForNearby } = await import('../wind.mjs');
  const list = await getStationListForNearby();
  const out = [];
  for (const row of list) {
    const sLat = asNumber(row?.lat);
    const sLon = asNumber(row?.lon);
    const id = row?.id_station;
    if (sLat == null || sLon == null || id == null) continue;
    const distanceKm = haversineKm(lat, lon, sLat, sLon);
    if (distanceKm > radiusKm) continue;
    out.push({
      provider: 'windguru',
      stationId: String(Math.trunc(Number(id))),
      name: String(row.name || row.spotname || `Station ${id}`).trim(),
      distanceKm,
      lat: sLat,
      lon: sLon,
    });
  }
  out.sort((a, b) => a.distanceKm - b.distanceKm);
  return out.slice(0, limit);
}

async function loadNdbcCandidates(lat, lon, radiusKm, limit) {
  const { loadNdbcLatestEntries } = await import('./ndbc.mjs');
  const entries = await loadNdbcLatestEntries();
  const out = [];
  for (const e of entries) {
    if (e.lat == null || e.lon == null) continue;
    const distanceKm = haversineKm(lat, lon, e.lat, e.lon);
    if (distanceKm > radiusKm) continue;
    out.push({
      provider: 'ndbc',
      stationId: e.id,
      name: `NDBC ${e.id}`,
      distanceKm,
      lat: e.lat,
      lon: e.lon,
    });
  }
  out.sort((a, b) => a.distanceKm - b.distanceKm);
  return out.slice(0, limit);
}

/** Pick nearest mix of WG + NDBC within radius. */
export async function findNearbyStations(lat, lon, { radiusKm = 50, maxStations = 6 } = {}) {
  const perSource = Math.max(3, maxStations);
  const [wg, ndbc] = await Promise.all([
    loadWindguruCandidates(lat, lon, radiusKm, perSource).catch(() => []),
    loadNdbcCandidates(lat, lon, radiusKm, perSource).catch(() => []),
  ]);
  const merged = [...wg, ...ndbc].sort((a, b) => a.distanceKm - b.distanceKm);
  const seen = new Set();
  const out = [];
  for (const m of merged) {
    const k = trustKey(m.provider, m.stationId);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(m);
    if (out.length >= maxStations) break;
  }
  // Always include Open-Meteo model point as a low-weight virtual member if few sensors.
  if (out.length < 2) {
    out.push({
      provider: 'openmeteo',
      stationId: `${lat.toFixed(4)},${lon.toFixed(4)}`,
      name: 'Open-Meteo model',
      distanceKm: 0.01,
      lat,
      lon,
      virtual: true,
    });
  }
  return out;
}

function circularMeanDeg(values, weights) {
  let sx = 0;
  let sy = 0;
  let wSum = 0;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    const w = weights[i];
    if (v == null || !Number.isFinite(v) || !(w > 0)) continue;
    const rad = (v * Math.PI) / 180;
    sx += Math.cos(rad) * w;
    sy += Math.sin(rad) * w;
    wSum += w;
  }
  if (!(wSum > 0)) return null;
  const deg = (Math.atan2(sy, sx) * 180) / Math.PI;
  return (deg + 360) % 360;
}

function weightedMean(values, weights) {
  let sum = 0;
  let wSum = 0;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    const w = weights[i];
    if (v == null || !Number.isFinite(v) || !(w > 0)) continue;
    sum += v * w;
    wSum += w;
  }
  return wSum > 0 ? sum / wSum : null;
}

async function fetchMemberReading(member) {
  if (member.provider === 'ndbc') return fetchNdbcCurrent(member.stationId);
  if (member.provider === 'openmeteo') return fetchOpenMeteoCurrent(member.stationId);
  return wgCurrent(member.stationId);
}

/**
 * @param {object} station follow
 * @param {object} trustMap store.stationTrust
 */
export async function fetchLocationCurrent(station, trustMap = {}) {
  const coords =
    parseLocationId(station.stationId) ||
    (station.locationBlend?.lat != null
      ? {
          lat: station.locationBlend.lat,
          lon: station.locationBlend.lon,
          id: `${Number(station.locationBlend.lat).toFixed(4)},${Number(station.locationBlend.lon).toFixed(4)}`,
        }
      : null);
  if (!coords) throw new Error('Location follow missing lat,lon');

  const radiusKm = Math.max(5, Number(station.locationBlend?.radiusKm) || 50);
  const maxStations = Math.max(2, Math.min(12, Number(station.locationBlend?.maxStations) || 6));

  let members = Array.isArray(station.locationBlend?.members)
    ? station.locationBlend.members.map((m) => ({ ...m }))
    : [];

  const blendUpdatedAt = Number(station.locationBlend?.updatedAt) || 0;
  const membersFresh =
    members.length > 0 && blendUpdatedAt > 0 && Date.now() - blendUpdatedAt < 30 * 60 * 1000;

  if (!membersFresh) {
    // Full nearby re-search when members missing or cache older than 30 min.
    const ratingByKey = new Map(
      members.map((m) => [trustKey(m.provider, m.stationId), m.rating]),
    );
    const fresh = await findNearbyStations(coords.lat, coords.lon, { radiusKm, maxStations });
    members = fresh.map((m) => ({
      ...m,
      rating: ratingByKey.get(trustKey(m.provider, m.stationId)) ?? m.rating ?? null,
    }));
  }
  // else: reuse cached members; still fetch readings below.

  const readings = [];
  const weights = [];
  const used = [];
  for (const m of members) {
    try {
      const r = await fetchMemberReading(m);
      const w = memberWeight(m, trustMap);
      readings.push(r);
      weights.push(w);
      used.push({ ...m, weight: w, ok: true });
    } catch {
      used.push({ ...m, weight: 0, ok: false });
    }
  }
  if (!readings.length) throw new Error('No nearby stations returned readings');

  const wind_avg = weightedMean(
    readings.map((r) => r.wind_avg),
    weights,
  );
  const wind_max = weightedMean(
    readings.map((r) => r.wind_max),
    weights,
  );
  const wind_min = weightedMean(
    readings.map((r) => r.wind_min),
    weights,
  );
  const temperature = weightedMean(
    readings.map((r) => r.temperature),
    weights,
  );
  const wave_height = weightedMean(
    readings.map((r) => r.wave_height),
    weights,
  );
  const wind_direction = circularMeanDeg(
    readings.map((r) => r.wind_direction),
    weights,
  );

  const blended = reading({
    wind_avg,
    wind_max,
    wind_min,
    wind_direction,
    temperature,
    wave_height,
    datetime: new Date().toISOString(),
    unixtime: Math.floor(Date.now() / 1000),
  });

  // Trust updates vs consensus (caller persists).
  const trustUpdates = {};
  for (let i = 0; i < readings.length; i++) {
    const m = used.filter((u) => u.ok)[i];
    const r = readings[i];
    if (!m || wind_avg == null || r.wind_avg == null) continue;
    const err = Math.abs(r.wind_avg - wind_avg);
    const key = trustKey(m.provider, m.stationId);
    const prev = trustMap[key] || { samples: 0, maeWind: 0, ratingAvg: null, ratingCount: 0 };
    const samples = (prev.samples || 0) + 1;
    const maeWind = ((prev.maeWind || 0) * (samples - 1) + err) / samples;
    trustUpdates[key] = {
      ...prev,
      samples,
      maeWind,
      updatedAt: Date.now(),
      name: m.name,
      provider: m.provider,
      stationId: m.stationId,
    };
  }

  const weightSum = used.reduce((s, m) => s + (m.weight || 0), 0);
  const membersOut = used.map((m) => ({
    ...m,
    weightNorm: weightSum > 0 ? (m.weight || 0) / weightSum : 0,
  }));

  return {
    reading: blended,
    members: membersOut,
    trustUpdates,
    locationBlend: {
      lat: coords.lat,
      lon: coords.lon,
      address: station.locationBlend?.address || station.sourceName || null,
      radiusKm,
      maxStations,
      members: membersOut,
      updatedAt: Date.now(),
    },
  };
}

export async function fetchLocationHistory(station, metric, hours = 6) {
  // Approximate with Open-Meteo hourly at the pin (sensors lack aligned history easily).
  try {
    const coords = parseLocationId(station.stationId);
    if (!coords) return emptyHistory();
    const { fetchOpenMeteoHistory } = await import('./openmeteo.mjs');
    return fetchOpenMeteoHistory(coords.id, metric, hours);
  } catch {
    return emptyHistory();
  }
}

export async function resolveLocation(input, extras = {}) {
  let coords = parseLocationId(input);
  let address = extras.address || null;
  if (!coords && extras.lat != null && extras.lon != null) {
    coords = parseLocationId(`${extras.lat},${extras.lon}`);
  }
  if (!coords) throw new Error('Provide lat,lon or pick a map pin / address');
  const radiusKm = Math.max(5, Number(extras.radiusKm) || 50);
  const maxStations = Math.max(2, Math.min(12, Number(extras.maxStations) || 6));
  const members = await findNearbyStations(coords.lat, coords.lon, { radiusKm, maxStations });
  if (!members.length) throw new Error('No stations found near that location');
  const label =
    address ||
    extras.sourceName ||
    `Pin ${coords.lat.toFixed(3)}, ${coords.lon.toFixed(3)}`;
  return {
    provider: 'location',
    inputId: coords.id,
    stationId: coords.id,
    kind: 'station',
    hasLiveStation: true,
    liveStationId: coords.id,
    spotName: label,
    sourceName: label,
    linkedLiveStation: null,
    liveLinkWarning: `Blends ${members.length} nearby stations (distance × accuracy × rating).`,
    lat: coords.lat,
    lon: coords.lon,
    locationBlend: {
      lat: coords.lat,
      lon: coords.lon,
      address: label,
      radiusKm,
      maxStations,
      members,
      updatedAt: Date.now(),
    },
  };
}

export function locationStationUrl(id) {
  const c = parseLocationId(id);
  if (!c) return 'https://www.openstreetmap.org/';
  return `https://www.openstreetmap.org/?mlat=${c.lat}&mlon=${c.lon}#map=12/${c.lat}/${c.lon}`;
}

// silence unused
void MS_TO_KT;
void historyFromPairs;
