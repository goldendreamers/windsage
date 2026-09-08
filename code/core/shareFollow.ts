import { STATION_PROVIDERS, normalizeProvider, type StationProvider } from '../shared/providers';
import type { FollowedStation, WindguruKind } from '../shared/types';

export type ShareFollowPayload = {
  provider: StationProvider;
  stationId: string;
  kind: WindguruKind;
  nickname: string;
  address: string | null;
};

function isStationProvider(value: string): value is StationProvider {
  return (STATION_PROVIDERS as string[]).includes(value);
}

const FALLBACK_ORIGIN = 'https://windsage.nimrod.bio';

export function shareFollowOrigin(): string {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }
  return process.env.EXPO_PUBLIC_WINDSAGE_URL || FALLBACK_ORIGIN;
}

/** Absolute `/add?p=&id=&k=&n=` URL for a follow (identity + nickname only). */
export function buildShareFollowUrl(
  station: Pick<
    FollowedStation,
    'provider' | 'stationId' | 'kind' | 'nickname' | 'sourceName' | 'locationBlend'
  >,
  origin?: string,
): string {
  const base = (origin || shareFollowOrigin()).replace(/\/+$/, '');
  const url = new URL('/add', `${base}/`);
  const provider = normalizeProvider(station.provider);
  url.searchParams.set('p', provider);
  url.searchParams.set('id', String(station.stationId ?? '').trim());
  url.searchParams.set('k', station.kind === 'spot' ? 'spot' : 'station');
  const nick = String(station.nickname ?? '').trim();
  if (nick) url.searchParams.set('n', nick);
  if (provider === 'location') {
    const addr = String(station.locationBlend?.address ?? station.sourceName ?? '').trim();
    if (addr) url.searchParams.set('addr', addr);
  }
  return url.toString();
}

export function parseShareFollowUrl(
  href: string | { href: string } | null | undefined,
): ShareFollowPayload | null {
  if (!href) return null;
  try {
    const raw = typeof href === 'string' ? href : href.href;
    if (!raw) return null;
    const u = new URL(raw, 'https://windsage.nimrod.bio');
    const path = u.pathname.replace(/\/+$/, '') || '/';
    if (path !== '/add') return null;
    const p = String(u.searchParams.get('p') || '')
      .trim()
      .toLowerCase();
    if (!isStationProvider(p)) return null;
    const id = String(u.searchParams.get('id') || '').trim();
    if (!id) return null;
    const k: WindguruKind = u.searchParams.get('k') === 'spot' ? 'spot' : 'station';
    const n = String(u.searchParams.get('n') || '').trim();
    const addr = String(u.searchParams.get('addr') || '').trim() || null;
    return { provider: p, stationId: id, kind: k, nickname: n, address: addr };
  } catch {
    return null;
  }
}

let shareConsumeInFlight = false;

/** Guard React StrictMode double-invoke; later visits of the same URL can run again. */
export function beginShareConsume(): boolean {
  if (shareConsumeInFlight) return false;
  shareConsumeInFlight = true;
  return true;
}

export function endShareConsume(): void {
  shareConsumeInFlight = false;
}

/** Drop `/add?...` so a refresh is not treated as a new share. */
export function stripShareFollowUrl(): void {
  if (typeof window === 'undefined') return;
  const path = window.location.pathname.replace(/\/+$/, '') || '/';
  if (path !== '/add') return;
  window.history.replaceState({ windsage: '/' }, '', '/');
}

export function parseLatLonId(id: string): { lat: number; lon: number } | null {
  const m = String(id ?? '')
    .trim()
    .match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
  if (!m) return null;
  const lat = Number(m[1]);
  const lon = Number(m[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return { lat, lon };
}
