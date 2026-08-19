/**
 * Location blend — pin/address → nearest live stations → weighted average.
 * Weights: steep inverse-distance × trust(accuracy) × user rating.
 * Temperature uses an even sharper distance curve plus outlier shrink,
 * so a far or disagreeing sensor cannot pull the pin’s air temp.
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

/** Map MAE → 0..1 accuracy score (higher = better). `scale` is the MAE that halves the score. */
export function accuracyScoreFromMae(mae, samples = 0, { scale = 2.5, floor = 0.12 } = {}) {
  if (samples < 3 || mae == null || !Number.isFinite(mae)) return 0.55;
  const score = 1 / (1 + Math.max(0, mae) / Math.max(0.2, scale));
  return Math.max(floor, Math.min(1, score));
}

/**
 * Distance falloff. Temperature is local (shore vs inland, elevation);
 * wind is more coherent so it uses a slightly gentler power.
 */
export function distanceWeight(distanceKm, metric = 'wind') {
  const d = Math.max(0, Number(distanceKm) || 0);
  const power = metric === 'temperature' ? 6 : 4;
  return 1 / (d + 0.35) ** power;
}

export function memberWeight(member, trust, opts = {}) {
  const metric = opts.metric === 'temperature' ? 'temperature' : 'wind';
  const distW = distanceWeight(member.distanceKm, metric);
  const key = trustKey(member.provider, member.stationId);
  const t = trust?.[key];
  const accWind = accuracyScoreFromMae(t?.maeWind, t?.samples || 0);
  const accTemp = accuracyScoreFromMae(t?.maeTemp, t?.tempSamples || 0, { scale: 1.5 });
  const acc =
    metric === 'temperature' && (t?.tempSamples || 0) >= 3 ? accTemp : accWind;
  const rating =
    member.rating != null && Number.isFinite(Number(member.rating))
      ? Math.max(1, Math.min(5, Number(member.rating))) / 5
      : t?.ratingAvg != null
        ? Math.max(1, Math.min(5, Number(t.ratingAvg))) / 5
        : 0.7;
  return distW * (0.12 + 0.88 * acc) * (0.3 + 0.7 * rating);
}

/** Shrink weights for values far from the median (bad / mismatched sensors). */
export function robustifyMetricWeights(values, weights, { scale = 2.5 } = {}) {
  const next = weights.slice();
  const idxs = [];
  const vals = [];
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    const w = weights[i];
    if (v == null || !Number.isFinite(v) || !(w > 0)) continue;
    idxs.push(i);
    vals.push(v);
  }
  if (vals.length < 3) return next;
  const sorted = vals.slice().sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const s = Math.max(0.4, Number(scale) || 2.5);
  for (let j = 0; j < idxs.length; j++) {
    const delta = Math.abs(vals[j] - median);
    next[idxs[j]] *= Math.exp(-((delta / s) ** 2));
  }
  return next;
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
  const used = [];
  for (const m of members) {
    try {
      const r = await fetchMemberReading(m);
      readings.push(r);
      used.push({ ...m, ok: true });
    } catch {
      used.push({ ...m, weight: 0, ok: false });
    }
  }
  if (!readings.length) throw new Error('No nearby stations returned readings');

  const okMembers = used.filter((u) => u.ok);
  const windWeights = okMembers.map((m) => memberWeight(m, trustMap));
  const tempWeights = robustifyMetricWeights(
    readings.map((r) => r.temperature),
    okMembers.map((m) => memberWeight(m, trustMap, { metric: 'temperature' })),
    { scale: 2.5 },
  );

  const wind_avg = weightedMean(
    readings.map((r) => r.wind_avg),
    windWeights,
  );
  const wind_max = weightedMean(
    readings.map((r) => r.wind_max),
    windWeights,
  );
  const wind_min = weightedMean(
    readings.map((r) => r.wind_min),
    windWeights,
  );
  const temperature = weightedMean(
    readings.map((r) => r.temperature),
    tempWeights,
  );
  const wave_height = weightedMean(
    readings.map((r) => r.wave_height),
    windWeights,
  );
  const wind_direction = circularMeanDeg(
    readings.map((r) => r.wind_direction),
    windWeights,
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
    const m = okMembers[i];
    const r = readings[i];
    if (!m) continue;
    const key = trustKey(m.provider, m.stationId);
    const prev = trustMap[key] || { samples: 0, maeWind: 0, tempSamples: 0, maeTemp: 0, ratingAvg: null, ratingCount: 0 };
    let next = { ...prev, name: m.name, provider: m.provider, stationId: m.stationId, updatedAt: Date.now() };
    if (wind_avg != null && r.wind_avg != null) {
      const err = Math.abs(r.wind_avg - wind_avg);
      const samples = (prev.samples || 0) + 1;
      next = {
        ...next,
        samples,
        maeWind: ((prev.maeWind || 0) * (samples - 1) + err) / samples,
      };
    }
    if (temperature != null && r.temperature != null) {
      const errT = Math.abs(r.temperature - temperature);
      const tempSamples = (prev.tempSamples || 0) + 1;
      next = {
        ...next,
        tempSamples,
        maeTemp: ((prev.maeTemp || 0) * (tempSamples - 1) + errT) / tempSamples,
      };
    }
    trustUpdates[key] = next;
  }

  const membersOut = [];
  let okI = 0;
  for (const m of used) {
    if (!m.ok) {
      membersOut.push({ ...m, weight: 0, weightNorm: 0 });
      continue;
    }
    const w = windWeights[okI] || 0;
    membersOut.push({ ...m, weight: w });
    okI += 1;
  }
  const weightSum = membersOut.reduce((s, m) => s + (m.weight || 0), 0);
  for (const m of membersOut) {
    m.weightNorm = weightSum > 0 ? (m.weight || 0) / weightSum : 0;
  }

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
    liveLinkWarning: `Blends ${members.length} nearby stations (closer sensors count much more).`,
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
