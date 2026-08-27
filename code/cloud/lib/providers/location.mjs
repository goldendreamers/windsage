/**
 * Location blend — pin/address → nearest accurate live sensors → weighted average.
 *
 * Selection: keep the highest-scoring nearby sensors (not one of every network).
 * Weights: inverse-distance × geometry (elevation, coast/land, wind-axis, fetch)
 *   × provider accuracy prior × trust(MAE) × user rating.
 * Temperature uses a sharper distance curve plus outlier shrink.
 */
import { asNumber, emptyHistory, historyFromPairs, reading } from './common.mjs';
import { fetchNdbcCurrent } from './ndbc.mjs';
import { fetchOpenMeteoCurrent } from './openmeteo.mjs';
import { fetchSynopticCurrent, loadAwcNearbyStations } from './synoptic.mjs';
import { fetchCurrentReading as wgCurrent } from '../wind.mjs';

const MS_TO_KT = 1.943844;

/** Physics-informed start; 100-station leave-one-out (seed 7) nudged these. */
export const DEFAULT_BLEND_PARAMS = {
  distPowerWind: 5.3,
  distPowerTemp: 6,
  distOffsetKm: 0.4,
  pinEquivKm: 14,
  elevScaleM: 355,
  /** Multiply when pin and member disagree water vs land. */
  exposureMismatch: 0.72,
  /** 0 = ignore wind axis, 1 = only along-wind neighbors. */
  alongWindMix: 0.05,
  /** Prefer seaward/along-coast vs inland for a coastal pin (and reverse inland). */
  coastAlignMix: 0.52,
  providerPrior: {
    windguru: 1,
    ndbc: 1,
    synoptic: 0.88,
    openmeteo: 0.4,
  },
};

export const BLEND_PARAMS = { ...DEFAULT_BLEND_PARAMS, providerPrior: { ...DEFAULT_BLEND_PARAMS.providerPrior } };

/** Treat the pin’s weather model as if it sat this far away so live sensors still win. */
export const PIN_MODEL_EQUIV_KM = BLEND_PARAMS.pinEquivKm;

export function cloneBlendParams(src = BLEND_PARAMS) {
  return {
    ...src,
    providerPrior: { ...(src.providerPrior || {}) },
  };
}

export function haversineKm(aLat, aLon, bLat, bLon) {
  const R = 6371;
  const toR = Math.PI / 180;
  const dLat = (bLat - aLat) * toR;
  const dLon = (bLon - aLon) * toR;
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(aLat * toR) * Math.cos(bLat * toR) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

/** Initial bearing from A to B, degrees 0–360 (meteorological-style clockwise from north). */
export function initialBearingDeg(lat1, lon1, lat2, lon2) {
  const toR = Math.PI / 180;
  const φ1 = lat1 * toR;
  const φ2 = lat2 * toR;
  const Δλ = (lon2 - lon1) * toR;
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (((Math.atan2(y, x) * 180) / Math.PI) + 360) % 360;
}

export function angleDiffDeg(a, b) {
  const d = ((((Number(a) || 0) - (Number(b) || 0)) % 360) + 540) % 360 - 180;
  return d;
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

export function inferSurface(member) {
  const raw = String(member?.surface || '').toLowerCase();
  if (raw === 'water' || raw === 'land' || raw === 'coast' || raw === 'pin') return raw;
  if (member?.provider === 'ndbc') return 'water';
  if (member?.provider === 'synoptic') return 'land';
  if (member?.virtual || member?.provider === 'openmeteo') return 'pin';
  return 'unknown';
}

function isWaterish(surface) {
  return surface === 'water' || surface === 'coast';
}

export function inferPinContext(lat, lon, members = []) {
  const live = (members || []).filter((m) => !m.virtual && m.lat != null && m.lon != null);
  const byDist = live.slice().sort((a, b) => (a.distanceKm || 0) - (b.distanceKm || 0));
  const water = live
    .filter((m) => inferSurface(m) === 'water')
    .slice()
    .sort((a, b) => (a.distanceKm || 0) - (b.distanceKm || 0));
  const land = live
    .filter((m) => inferSurface(m) === 'land')
    .slice()
    .sort((a, b) => (a.distanceKm || 0) - (b.distanceKm || 0));
  const nearestWater = water[0] || null;
  const nearestLand = land[0] || null;
  const nearest = byDist[0] || null;
  const waterD = nearestWater ? Number(nearestWater.distanceKm) || 99 : 99;
  const landD = nearestLand ? Number(nearestLand.distanceKm) || 99 : 99;
  let pinSurface = 'unknown';
  if (waterD <= 10 && waterD <= landD + 6) pinSurface = 'coast';
  else if (landD < 12 && landD + 2 < waterD) pinSurface = 'land';
  else if (waterD <= 20 && nearest && inferSurface(nearest) !== 'land') pinSurface = 'coast';
  else if (landD < 20) pinSurface = 'land';

  let waterBearingDeg = null;
  if (nearestWater) {
    waterBearingDeg = initialBearingDeg(lat, lon, nearestWater.lat, nearestWater.lon);
  }

  const close = live
    .filter((m) => (Number(m.distanceKm) || 99) <= 3 && Number.isFinite(Number(m.elevM)))
    .sort((a, b) => (a.distanceKm || 0) - (b.distanceKm || 0));
  const pinElevM = close.length ? Number(close[0].elevM) : null;

  return {
    pinLat: lat,
    pinLon: lon,
    pinSurface,
    pinElevM,
    waterBearingDeg,
  };
}

/**
 * Distance falloff. Temperature is local (shore vs inland, elevation);
 * wind is more coherent so it uses a slightly gentler power.
 */
export function distanceWeight(distanceKm, metric = 'wind', params = BLEND_PARAMS) {
  const d = Math.max(0, Number(distanceKm) || 0);
  const power = metric === 'temperature' ? params.distPowerTemp ?? 6 : params.distPowerWind ?? 4;
  const off = params.distOffsetKm ?? 0.35;
  return 1 / (d + off) ** power;
}

export function providerPrior(member, ctx = {}, params = BLEND_PARAMS) {
  const priors = params.providerPrior || {};
  if (member.virtual || member.provider === 'openmeteo') return priors.openmeteo ?? 0.4;
  let base = priors[member.provider] ?? 0.75;
  const pinSurf = ctx.pinSurface || 'unknown';
  if (member.provider === 'ndbc' && pinSurf === 'land') base *= 0.45;
  if (member.provider === 'synoptic' && isWaterish(pinSurf)) base *= 0.72;
  return base;
}

/**
 * How much this sensor’s setting matches the pin: elevation, water vs land,
 * inland vs seaward, and (when known) along-wind vs cross-wind fetch.
 */
export function geometryFactor(member, ctx = {}, params = BLEND_PARAMS) {
  if (member.virtual) return 1;
  let g = 1;
  const metric = ctx.metric === 'temperature' ? 'temperature' : 'wind';

  const elevM = Number(member.elevM);
  const pinElev = Number(ctx.pinElevM);
  if (Number.isFinite(elevM) && Number.isFinite(pinElev)) {
    const scale = Math.max(40, Number(params.elevScaleM) || 180);
    g *= 1 / (1 + Math.abs(elevM - pinElev) / scale);
  }

  const pinSurf = ctx.pinSurface || 'unknown';
  const surf = inferSurface(member);
  if (pinSurf !== 'unknown' && surf !== 'unknown' && surf !== 'pin') {
    const mismatch = pinSurf === 'land' ? surf === 'water' : isWaterish(pinSurf) && surf === 'land';
    if (mismatch) g *= Math.max(0.08, Number(params.exposureMismatch) ?? 0.4);
  }

  const pinLat = Number(ctx.pinLat);
  const pinLon = Number(ctx.pinLon);
  const mLat = Number(member.lat);
  const mLon = Number(member.lon);
  const hasPos = Number.isFinite(pinLat) && Number.isFinite(pinLon) && Number.isFinite(mLat) && Number.isFinite(mLon);

  if (hasPos && ctx.waterBearingDeg != null && Number.isFinite(Number(ctx.waterBearingDeg))) {
    const brg = initialBearingDeg(pinLat, pinLon, mLat, mLon);
    const towardWater = Math.cos((angleDiffDeg(brg, ctx.waterBearingDeg) * Math.PI) / 180);
    const mix = Math.max(0, Math.min(0.85, Number(params.coastAlignMix) ?? 0.32));
    if (pinSurf === 'land') {
      g *= 1 - mix + mix * (0.4 + 0.6 * (1 - towardWater) / 2);
    } else if (isWaterish(pinSurf)) {
      g *= 1 - mix + mix * (0.4 + 0.6 * (towardWater + 1) / 2);
    }
  }

  if (metric === 'wind' && hasPos && ctx.windDirDeg != null && Number.isFinite(Number(ctx.windDirDeg))) {
    const brg = initialBearingDeg(pinLat, pinLon, mLat, mLon);
    const along = Math.abs(Math.cos((angleDiffDeg(brg, ctx.windDirDeg) * Math.PI) / 180));
    const mix = Math.max(0, Math.min(0.85, Number(params.alongWindMix) ?? 0.38));
    g *= 1 - mix + mix * (0.35 + 0.65 * along);
  }

  return Math.max(0.04, g);
}

export function memberWeight(member, trust, opts = {}) {
  const params = opts.params || BLEND_PARAMS;
  const metric = opts.metric === 'temperature' ? 'temperature' : 'wind';
  const rawDist = Number(member.distanceKm) || 0;
  const pinKm = params.pinEquivKm ?? PIN_MODEL_EQUIV_KM;
  const dist = member.virtual ? Math.max(pinKm, rawDist) : rawDist;
  const distW = distanceWeight(dist, metric, params);
  const geo = geometryFactor(member, opts, params);
  const prior = providerPrior(member, opts, params);
  const key = trustKey(member.provider, member.stationId);
  const t = trust?.[key];
  const accWind = accuracyScoreFromMae(t?.maeWind, t?.samples || 0);
  const accTemp = accuracyScoreFromMae(t?.maeTemp, t?.tempSamples || 0, { scale: 1.5 });
  const acc = metric === 'temperature' && (t?.tempSamples || 0) >= 3 ? accTemp : accWind;
  const rating =
    member.rating != null && Number.isFinite(Number(member.rating))
      ? Math.max(1, Math.min(5, Number(member.rating))) / 5
      : t?.ratingAvg != null
        ? Math.max(1, Math.min(5, Number(t.ratingAvg))) / 5
        : 0.7;
  return distW * geo * prior * (0.12 + 0.88 * acc) * (0.3 + 0.7 * rating);
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

/** Keep the highest-scoring nearby sensors — not one of each network. */
export function pickBestMembers(candidates, maxStations, ctx = {}) {
  const cap = Math.max(1, Number(maxStations) || 6);
  const scored = (Array.isArray(candidates) ? candidates : [])
    .filter(Boolean)
    .map((m) => ({ m, s: memberWeight(m, ctx.trust || {}, ctx) }))
    .sort((a, b) => b.s - a.s || (a.m.distanceKm || 0) - (b.m.distanceKm || 0));
  const seen = new Set();
  const out = [];
  for (const row of scored) {
    const k = trustKey(row.m.provider, row.m.stationId);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(row.m);
    if (out.length >= cap) break;
  }
  return out;
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
      elevM: asNumber(row.alt ?? row.altitude ?? row.elev ?? row.elevation),
      surface: 'unknown',
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
      elevM: 0,
      surface: 'water',
    });
  }
  out.sort((a, b) => a.distanceKm - b.distanceKm);
  return out.slice(0, limit);
}

/** Pin-local Open-Meteo (wind/temp) + Marine (waves). Gap-fill, not a live sensor. */
export function pinModelMember(lat, lon) {
  return {
    provider: 'openmeteo',
    stationId: `${Number(lat).toFixed(4)},${Number(lon).toFixed(4)}`,
    name: 'Pin model (wind + waves)',
    distanceKm: 0,
    lat,
    lon,
    virtual: true,
    surface: 'pin',
  };
}

/** Nearest accurate live sensors, plus the pin model for waves / gaps. */
export async function findNearbyStations(lat, lon, { radiusKm = 50, maxStations = 6 } = {}) {
  const perSource = Math.max(8, maxStations * 2);
  const [wg, ndbc, awc] = await Promise.all([
    loadWindguruCandidates(lat, lon, radiusKm, perSource).catch(() => []),
    loadNdbcCandidates(lat, lon, radiusKm, perSource).catch(() => []),
    loadAwcNearbyStations(lat, lon, radiusKm, perSource).catch(() => []),
  ]);
  const pool = [...wg, ...ndbc, ...awc];
  const ctx = inferPinContext(lat, lon, pool);
  const out = pickBestMembers(pool, maxStations, ctx);
  const seen = new Set(out.map((m) => trustKey(m.provider, m.stationId)));
  const pin = pinModelMember(lat, lon);
  if (!seen.has(trustKey(pin.provider, pin.stationId))) out.push(pin);
  return out;
}

export function circularMeanDeg(values, weights) {
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

export function weightedMean(values, weights) {
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

export function twoPassWindWeights(members, readings, trust = {}, ctx = {}) {
  const params = ctx.params || BLEND_PARAMS;
  const pass1 = members.map((m) =>
    memberWeight(m, trust, { ...ctx, params, metric: 'wind', windDirDeg: null }),
  );
  const windDirDeg = circularMeanDeg(
    readings.map((r) => r?.wind_direction),
    pass1,
  );
  return members.map((m) =>
    memberWeight(m, trust, { ...ctx, params, metric: 'wind', windDirDeg }),
  );
}

async function fetchMemberReading(member) {
  if (member.provider === 'ndbc') return fetchNdbcCurrent(member.stationId);
  if (member.provider === 'openmeteo') return fetchOpenMeteoCurrent(member.stationId);
  if (member.provider === 'synoptic') return fetchSynopticCurrent(member.stationId);
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
  const hasPinModel = members.some(
    (m) => m.virtual || (m.provider === 'openmeteo' && (Number(m.distanceKm) || 0) < 1),
  );
  const membersFresh =
    members.length > 0 &&
    hasPinModel &&
    blendUpdatedAt > 0 &&
    Date.now() - blendUpdatedAt < 30 * 60 * 1000;

  if (!membersFresh) {
    const ratingByKey = new Map(
      members.map((m) => [trustKey(m.provider, m.stationId), m.rating]),
    );
    const fresh = await findNearbyStations(coords.lat, coords.lon, { radiusKm, maxStations });
    members = fresh.map((m) => ({
      ...m,
      rating: ratingByKey.get(trustKey(m.provider, m.stationId)) ?? m.rating ?? null,
    }));
  }

  const fetched = await Promise.all(
    members.map(async (m) => {
      try {
        const r = await fetchMemberReading(m);
        return { m: { ...m, ok: true }, r };
      } catch {
        return { m: { ...m, weight: 0, ok: false }, r: null };
      }
    }),
  );
  const used = [];
  const okMembers = [];
  const readings = [];
  for (const row of fetched) {
    used.push(row.m);
    if (row.m.ok && row.r) {
      okMembers.push(row.m);
      readings.push(row.r);
    }
  }
  if (!readings.length) throw new Error('No nearby stations returned readings');

  const pinCtx = inferPinContext(coords.lat, coords.lon, okMembers);
  const windWeights = twoPassWindWeights(okMembers, readings, trustMap, pinCtx);
  const tempWeights = robustifyMetricWeights(
    readings.map((r) => r.temperature),
    okMembers.map((m) =>
      memberWeight(m, trustMap, { ...pinCtx, metric: 'temperature', windDirDeg: null }),
    ),
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
  const liveN = members.filter((m) => !m.virtual).length;
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
    liveLinkWarning: `Blends the ${liveN} closest accurate live sensors (distance, coast/land, elevation). Pin model fills waves.`,
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

void MS_TO_KT;
void historyFromPairs;
