/**
 * Leave-one-out blend calibration.
 *
 * Live weather APIs are blocked in the cloud VM, so this builds 100 stations
 * on a coastal wind field whose “true” wind is known from geometry (water vs
 * land, elevation, shelter, inland veer). Each station is treated as a map pin,
 * neighbors are blended, error vs the known wind is measured, and weight knobs
 * are nudged after every station.
 */
import {
  BLEND_PARAMS,
  cloneBlendParams,
  haversineKm,
  inferPinContext,
  memberWeight,
  pickBestMembers,
  twoPassWindWeights,
  weightedMean,
} from './location.mjs';

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function inlandKm(lat, lon, coastLon = 34.8) {
  return (lon - coastLon) * 111 * Math.cos((lat * Math.PI) / 180);
}

/** Geometric wind a sailor would actually feel at this site. */
export function trueWindAt(st, rng = () => 0.5) {
  const inland = inlandKm(st.lat, st.lon);
  let speed;
  if (inland < 0) speed = 16.5 + Math.min(2.2, -inland / 6);
  else if (inland < 2.2) speed = 14.2 - inland * 1.6;
  else speed = 8.6 - Math.min(2.8, (inland - 2.2) / 10);
  speed += (Number(st.elevM) || 0) / 85;
  if (st.lat < 32.12 && inland > 1.5) speed *= 0.7;
  let dir = 275;
  if (inland > 3) dir = 305;
  speed += (rng() - 0.5) * 0.45;
  return {
    wind_avg: Math.max(2, speed),
    wind_max: Math.max(2, speed) + 2.4,
    wind_direction: (dir + 360) % 360,
    temperature: 22 - inland * 0.08 - (Number(st.elevM) || 0) / 150,
    wave_height: inland < 2 ? Math.max(0.2, 1.1 - inland * 0.15) : null,
  };
}

export function makeCoastalWindStations(n = 100, seed = 1) {
  const rng = mulberry32(seed);
  const stations = [];
  const nCoast = 30;
  const nBuoy = 18;
  const nApt = 28;
  const nHill = n - nCoast - nBuoy - nApt;

  for (let i = 0; i < nCoast; i++) {
    const lat = 31.7 + (i / Math.max(1, nCoast - 1)) * 1.35;
    const lon = 34.808 + (rng() - 0.45) * 0.012;
    stations.push({
      provider: 'windguru',
      stationId: `wg-c-${i}`,
      name: `Coast ${i}`,
      lat,
      lon,
      elevM: 6 + rng() * 14,
      surface: 'unknown',
    });
  }
  for (let i = 0; i < nBuoy; i++) {
    const lat = 31.75 + (i / Math.max(1, nBuoy - 1)) * 1.25;
    const lon = 34.58 + rng() * 0.12;
    stations.push({
      provider: 'ndbc',
      stationId: `buoy-${i}`,
      name: `Buoy ${i}`,
      lat,
      lon,
      elevM: 0,
      surface: 'water',
    });
  }
  for (let i = 0; i < nApt; i++) {
    const lat = 31.72 + (i / Math.max(1, nApt - 1)) * 1.3;
    const lon = 34.86 + rng() * 0.08;
    stations.push({
      provider: 'synoptic',
      stationId: `apt-${i}`,
      name: `Airport ${i}`,
      lat,
      lon,
      elevM: 35 + rng() * 40,
      surface: 'land',
    });
  }
  for (let i = 0; i < nHill; i++) {
    const lat = 31.8 + (i / Math.max(1, nHill - 1)) * 1.15;
    const lon = 35.05 + rng() * 0.14;
    stations.push({
      provider: 'windguru',
      stationId: `wg-h-${i}`,
      name: `Hill ${i}`,
      lat,
      lon,
      elevM: 240 + rng() * 150,
      surface: 'land',
    });
  }

  const windRng = mulberry32(seed + 99);
  for (const st of stations) {
    Object.assign(st, trueWindAt(st, windRng));
  }
  return stations;
}

export function leaveOneOutBlend(stations, index, params, { radiusKm = 50, maxStations = 6 } = {}) {
  const truth = stations[index];
  const neighbors = [];
  for (let j = 0; j < stations.length; j++) {
    if (j === index) continue;
    const distanceKm = haversineKm(truth.lat, truth.lon, stations[j].lat, stations[j].lon);
    if (distanceKm > radiusKm) continue;
    neighbors.push({ ...stations[j], distanceKm });
  }
  const ctx = { ...inferPinContext(truth.lat, truth.lon, neighbors), params };
  const picked = pickBestMembers(neighbors, maxStations, ctx);
  if (!picked.length) {
    return { error: null, predicted: null, truth: truth.wind_avg, picked: [] };
  }
  const readings = picked.map((m) => ({
    wind_avg: m.wind_avg,
    wind_max: m.wind_max,
    wind_direction: m.wind_direction,
    temperature: m.temperature,
    wave_height: m.wave_height,
  }));
  const weights = twoPassWindWeights(picked, readings, {}, ctx);
  const predicted = weightedMean(
    readings.map((r) => r.wind_avg),
    weights,
  );
  const error =
    predicted == null || truth.wind_avg == null ? null : Math.abs(predicted - truth.wind_avg);
  return { error, predicted, truth: truth.wind_avg, picked };
}

export function blendMae(stations, params, opts, onlyIndexes = null) {
  const idxs = onlyIndexes || stations.map((_, i) => i);
  let sum = 0;
  let n = 0;
  for (const i of idxs) {
    const { error } = leaveOneOutBlend(stations, i, params, opts);
    if (error == null || !Number.isFinite(error)) continue;
    sum += error;
    n += 1;
  }
  return n ? sum / n : null;
}

function getKnob(params, key) {
  const parts = key.split('.');
  let cur = params;
  for (const p of parts) cur = cur?.[p];
  return Number(cur);
}

function setKnob(params, key, value) {
  const next = cloneBlendParams(params);
  const parts = key.split('.');
  if (parts.length === 1) {
    next[parts[0]] = value;
    return next;
  }
  next.providerPrior = { ...next.providerPrior, [parts[1]]: value };
  return next;
}

const KNOBS = [
  ['distPowerWind', 2.4, 5.6, 0.12],
  ['elevScaleM', 80, 400, 25],
  ['exposureMismatch', 0.16, 0.85, 0.04],
  ['alongWindMix', 0, 0.55, 0.04],
  ['coastAlignMix', 0, 0.55, 0.04],
  ['pinEquivKm', 10, 22, 1],
  ['providerPrior.synoptic', 0.28, 1, 0.05],
  ['providerPrior.ndbc', 0.45, 1, 0.05],
];

export const NAIVE_BLEND_PARAMS = {
  distPowerWind: 2,
  distPowerTemp: 6,
  distOffsetKm: 0.4,
  pinEquivKm: 14,
  elevScaleM: 8000,
  exposureMismatch: 1,
  alongWindMix: 0,
  coastAlignMix: 0,
  providerPrior: {
    windguru: 1,
    ndbc: 1,
    synoptic: 1,
    openmeteo: 1,
  },
};

/**
 * For each of `stations.length` sites: blend as a map pin, then nudge one weight
 * knob if it lowers error on a window of nearby sites (plus that pin).
 */
export function rebalanceBlendParams(stations, startParams = BLEND_PARAMS, opts = {}) {
  const startSnapshot = cloneBlendParams(startParams);
  let params = cloneBlendParams(startSnapshot);
  const perStation = [];
  const window = Math.max(8, Number(opts.window) || 12);
  for (let i = 0; i < stations.length; i++) {
    const lo = Math.max(0, i - window);
    const hi = Math.min(stations.length - 1, i + window);
    const idxs = [];
    for (let j = lo; j <= hi; j++) idxs.push(j);
    const err0 = blendMae(stations, params, opts, idxs);
    if (err0 == null) {
      perStation.push({ i, error: null, changed: false });
      continue;
    }
    const [key, loB, hiB, step] = KNOBS[i % KNOBS.length];
    const cur = getKnob(params, key);
    let best = { params, err: err0 };
    for (const trialVal of [cur - step, cur + step]) {
      if (trialVal < loB || trialVal > hiB) continue;
      const trial = setKnob(params, key, trialVal);
      const error = blendMae(stations, trial, opts, idxs);
      if (error != null && error < best.err - 1e-6) best = { params: trial, err: error };
    }
    params = best.params;
    perStation.push({
      i,
      id: stations[i].stationId,
      error: best.err,
      changed: best.err < err0 - 1e-6,
    });
  }
  return {
    params,
    perStation,
    startMae: blendMae(stations, startSnapshot, opts),
    fittedMae: blendMae(stations, params, opts),
    naiveMae: blendMae(stations, NAIVE_BLEND_PARAMS, opts),
  };
}

void memberWeight;
