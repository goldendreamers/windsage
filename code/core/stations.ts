import { getCloudBaseUrl } from './cloud';
import {
  followTargetForKind,
  normalizeWindguruFollowInput,
  stationUrl as windguruStationUrl,
} from './windguru';
import { PROVIDER_META, normalizeProvider, type StationProvider } from '../shared/providers';
import type { FollowedStation, WindguruKind } from '../shared/types';

export type ResolvedFollow = {
  provider: StationProvider;
  inputId: string;
  stationId: string;
  kind: WindguruKind;
  hasLiveStation?: boolean;
  liveStationId?: string | null;
  spotName?: string | null;
  sourceName?: string | null;
  linkedLiveStation?: FollowedStation['linkedLiveStation'];
  liveLinkWarning?: string | null;
  warning?: string | null;
};

export async function resolveFollowInput(
  provider: StationProvider | string,
  input: string,
  extras: Record<string, unknown> = {},
): Promise<ResolvedFollow & { locationBlend?: FollowedStation['locationBlend'] }> {
  const p = normalizeProvider(provider);
  if (p === 'windguru') {
    const resolved = await normalizeWindguruFollowInput(input);
    return {
      ...resolved,
      provider: 'windguru',
      stationId: resolved.inputId,
      sourceName: resolved.spotName ?? null,
      liveLinkWarning: resolved.warning ?? null,
    };
  }

  const response = await fetch(`${getCloudBaseUrl()}/v1/stations/resolve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ provider: p, input, ...extras }),
  });
  const data = (await response.json().catch(() => ({}))) as ResolvedFollow & {
    ok?: boolean;
    error?: string;
    locationBlend?: FollowedStation['locationBlend'];
  };
  if (!response.ok || data.error) {
    throw new Error(data.error || `Could not resolve ${PROVIDER_META[p].label} station`);
  }
  return {
    provider: p,
    inputId: String(data.inputId || data.stationId || ''),
    stationId: String(data.stationId || data.inputId || ''),
    kind: data.kind === 'spot' ? 'spot' : 'station',
    hasLiveStation: data.hasLiveStation !== false,
    liveStationId: data.liveStationId ?? data.stationId ?? null,
    spotName: data.spotName ?? data.sourceName ?? null,
    sourceName: data.sourceName ?? data.spotName ?? null,
    linkedLiveStation: data.linkedLiveStation ?? null,
    liveLinkWarning: data.liveLinkWarning ?? data.warning ?? null,
    locationBlend: data.locationBlend ?? null,
  };
}

export function followTargetFromResolved(
  provider: StationProvider,
  kind: WindguruKind,
  resolved: ResolvedFollow,
): {
  stationId: string;
  kind: WindguruKind;
  liveStationId: string | null;
  linkedLiveStation: FollowedStation['linkedLiveStation'];
  liveLinkWarning: string | null;
  sourceName: string | null;
  provider: StationProvider;
} {
  if (provider === 'windguru') {
    const target = followTargetForKind(kind, {
      inputId: resolved.inputId,
      liveStationId: String(resolved.liveStationId || resolved.stationId),
      kind: resolved.kind,
      spotName: resolved.spotName || undefined,
      hasLiveStation: resolved.hasLiveStation,
      linkedLiveStation: resolved.linkedLiveStation ?? undefined,
      warning: resolved.warning ?? resolved.liveLinkWarning ?? null,
    });
    return {
      ...target,
      provider: 'windguru',
      sourceName:
        resolved.spotName?.trim() ||
        resolved.sourceName?.trim() ||
        target.linkedLiveStation?.spotname?.trim() ||
        target.linkedLiveStation?.name?.trim() ||
        null,
    };
  }
  return {
    provider,
    stationId: resolved.stationId,
    kind: 'station',
    liveStationId: resolved.liveStationId ?? resolved.stationId,
    linkedLiveStation: resolved.linkedLiveStation ?? null,
    liveLinkWarning: resolved.liveLinkWarning ?? null,
    sourceName: resolved.sourceName?.trim() || resolved.spotName?.trim() || null,
  };
}

/** Detect provider from URL hosts / lat,lon — not bare numbers (those stay on selected source). */
export function detectProviderFromInput(input: string): StationProvider | null {
  const t = input.trim().toLowerCase();
  if (!t) return null;
  if (t.includes('windguru.cz')) return 'windguru';
  if (t.includes('ndbc.noaa.gov') || t.includes('station_page.php')) return 'ndbc';
  if (t.includes('tempest') || t.includes('weatherflow')) return 'tempest';
  if (t.includes('windfinder.com')) return 'windfinder';
  if (t.includes('synoptic') || t.includes('mesowest')) return 'synoptic';
  if (/^-?\d+(\.\d+)?\s*,\s*-?\d+(\.\d+)?$/.test(t)) return 'openmeteo';
  return null;
}

export function stationPageUrl(station: FollowedStation): string {
  const provider = normalizeProvider(station.provider);
  const id = String(station.stationId ?? '').trim();
  switch (provider) {
    case 'location': {
      const lat = station.locationBlend?.lat;
      const lon = station.locationBlend?.lon;
      if (Number.isFinite(lat) && Number.isFinite(lon)) {
        return `https://www.google.com/maps?q=${lat},${lon}`;
      }
      const q = String(station.sourceName || id || '').trim();
      return q
        ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`
        : 'https://www.google.com/maps';
    }
    case 'ndbc':
      return `https://www.ndbc.noaa.gov/station_page.php?station=${encodeURIComponent(id)}`;
    case 'openmeteo':
      return 'https://open-meteo.com/en/docs';
    case 'synoptic':
      return 'https://www.synopticdata.com/';
    case 'tempest':
      return `https://tempestwx.com/station/${encodeURIComponent(id)}`;
    case 'windfinder':
      return `https://www.windfinder.com/report/${encodeURIComponent(id)}`;
    case 'windguru':
    default:
      return windguruStationUrl(id, station.kind);
  }
}
