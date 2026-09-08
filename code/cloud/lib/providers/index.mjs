/**
 * Multi-provider dispatch for resolve / current / history / forecast / URLs.
 */
import {
  fetchCurrentReading as wgCurrent,
  fetchRecentHistory as wgHistory,
  fetchSpotForecastNow as wgForecast,
  fixSpotStations as wgFixSpots,
  isForecastOnlySpot as wgIsForecastOnly,
  normalizeWindguruFollowInput as wgResolve,
  evaluateAlert,
  needsAlertHistory,
} from '../wind.mjs';
import { cacheKey, providerOf, sensorId } from './common.mjs';
import {
  fetchNdbcCurrent,
  fetchNdbcHistory,
  ndbcStationUrl,
  resolveNdbc,
} from './ndbc.mjs';
import {
  fetchOpenMeteoCurrent,
  fetchOpenMeteoHistory,
  openMeteoStationUrl,
  resolveOpenMeteo,
} from './openmeteo.mjs';
import {
  fetchSynopticCurrent,
  fetchSynopticHistory,
  resolveSynoptic,
  synopticConfigured,
  synopticStationUrl,
} from './synoptic.mjs';
import {
  fetchTempestCurrent,
  fetchTempestHistory,
  resolveTempest,
  tempestConfigured,
  tempestStationUrl,
} from './tempest.mjs';
import {
  fetchWindfinderCurrent,
  fetchWindfinderHistory,
  resolveWindfinder,
  windfinderConfigured,
  windfinderStationUrl,
} from './windfinder.mjs';
import {
  fetchLocationCurrent,
  fetchLocationHistory,
  locationStationUrl,
  resolveLocation,
} from './location.mjs';
import { mapsStatus } from './geo.mjs';

export { evaluateAlert, needsAlertHistory, cacheKey, providerOf, sensorId, mapsStatus };

function wgStationUrl(id, kind) {
  const sid = String(id || '').trim();
  if (kind === 'station') return `https://www.windguru.cz/station/${sid}`;
  return `https://www.windguru.cz/${sid}`;
}

export function providerStatus() {
  return {
    windguru: { ready: true, needsToken: false },
    ndbc: { ready: true, needsToken: false },
    openmeteo: { ready: true, needsToken: false },
    location: { ready: true, needsToken: false },
    synoptic: { ready: synopticConfigured(), needsToken: true },
    tempest: { ready: tempestConfigured(), needsToken: true },
    windfinder: { ready: windfinderConfigured(), needsToken: true },
  };
}

export async function resolveFollowInput(provider, input, extras = {}) {
  const p = String(provider || 'windguru').toLowerCase();
  switch (p) {
    case 'ndbc':
      return resolveNdbc(input);
    case 'openmeteo':
      return resolveOpenMeteo(input);
    case 'synoptic':
      return resolveSynoptic(input);
    case 'tempest':
      return resolveTempest(input);
    case 'windfinder':
      return resolveWindfinder(input);
    case 'location':
      return resolveLocation(input, extras);
    case 'windguru':
    default: {
      const resolved = await wgResolve(input);
      return { ...resolved, provider: 'windguru' };
    }
  }
}

/**
 * @returns {Promise<object>} StationReading, or for location: reading with _blend meta.
 * Windguru forecast-only spots still fetch the nearest live anemometer here.
 * Never return a GFS/model hour as `current` — that is `fetchProviderForecast`.
 */
export async function fetchProviderCurrent(station, ctx = {}) {
  const provider = providerOf(station);
  if (provider === 'location') {
    const blend = await fetchLocationCurrent(station, ctx.trustMap || {});
    return {
      ...blend.reading,
      _locationBlend: blend.locationBlend,
      _trustUpdates: blend.trustUpdates,
      _members: blend.members,
    };
  }
  const id = sensorId(station);
  if (!id) throw new Error('Missing station id');
  switch (provider) {
    case 'ndbc':
      return fetchNdbcCurrent(id);
    case 'openmeteo':
      return fetchOpenMeteoCurrent(id);
    case 'synoptic':
      return fetchSynopticCurrent(id);
    case 'tempest':
      return fetchTempestCurrent(id);
    case 'windfinder':
      return fetchWindfinderCurrent(id);
    case 'windguru':
    default:
      return wgCurrent(id);
  }
}

export async function fetchProviderHistory(station, metric, hours = 6, avgMinutes = 10) {
  const provider = providerOf(station);
  if (provider === 'location') return fetchLocationHistory(station, metric, hours);
  const id = sensorId(station);
  if (!id) return { unixtime: [], values: [] };
  switch (provider) {
    case 'ndbc':
      return fetchNdbcHistory(id, metric, hours);
    case 'openmeteo':
      return fetchOpenMeteoHistory(id, metric, hours);
    case 'synoptic':
      return fetchSynopticHistory(id, metric, hours);
    case 'tempest':
      return fetchTempestHistory(id, metric, hours);
    case 'windfinder':
      return fetchWindfinderHistory(id, metric, hours);
    case 'windguru':
    default:
      return wgHistory(id, metric, hours, avgMinutes);
  }
}

export async function fetchProviderForecast(station) {
  if (providerOf(station) !== 'windguru') {
    return { reading: null, modelName: null };
  }
  return wgForecast(String(station.stationId).trim());
}

export function isForecastOnlySpot(station) {
  if (providerOf(station) !== 'windguru') return false;
  return wgIsForecastOnly(station);
}

export async function fixSpotStations(stations) {
  const list = stations || [];
  const wg = list.filter((s) => providerOf(s) === 'windguru');
  const fixedWg = wg.length ? await wgFixSpots(wg) : { stations: [], changed: 0 };
  const wgStations = Array.isArray(fixedWg) ? fixedWg : fixedWg.stations || [];
  const changed = Array.isArray(fixedWg) ? 0 : Number(fixedWg.changed) || 0;
  let wi = 0;
  const out = list.map((s) => {
    if (providerOf(s) === 'windguru') {
      const fixed = wgStations[wi++] || s;
      return {
        ...fixed,
        provider: 'windguru',
        nickname: String(fixed?.nickname ?? s?.nickname ?? ''),
        enabled: fixed?.enabled !== false,
      };
    }
    return {
      ...s,
      provider: providerOf(s),
      nickname: String(s?.nickname ?? ''),
      enabled: s?.enabled !== false,
    };
  });
  return { stations: out, changed };
}

export function stationPageUrl(station) {
  const provider = providerOf(station);
  const id = String(station?.stationId || '').trim();
  switch (provider) {
    case 'ndbc':
      return ndbcStationUrl(id);
    case 'openmeteo':
      return openMeteoStationUrl(id);
    case 'synoptic':
      return synopticStationUrl(id);
    case 'tempest':
      return tempestStationUrl(id);
    case 'windfinder':
      return windfinderStationUrl(id);
    case 'location':
      return locationStationUrl(id);
    case 'windguru':
    default:
      return wgStationUrl(id, station?.kind);
  }
}

