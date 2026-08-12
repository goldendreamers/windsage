import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { Linking, Platform } from 'react-native';
import type { AlertState, AppSettings, CheckResult, FollowedStation, StationReading } from '../shared/types';

const FALLBACK_CLOUD = 'https://windsage.nimrod.bio';

/** Resolve API base — same-origin when the website is served from Wald. */
export function getCloudBaseUrl(): string {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    const host = window.location.hostname;
    if (
      host === '100.125.98.56' ||
      host === 'waldhomeserver' ||
      host === 'windsage.nimrod.bio' ||
      host.endsWith('.ts.net') ||
      window.location.port === '8787'
    ) {
      return window.location.origin;
    }
  }
  return (
    (Constants.expoConfig?.extra?.windsageCloudUrl as string | undefined) ||
    process.env.EXPO_PUBLIC_WINDSAGE_URL ||
    FALLBACK_CLOUD
  );
}

/** @deprecated use getCloudBaseUrl() — kept for UI labels */
export const CLOUD_BASE_URL = FALLBACK_CLOUD;

const DEVICE_KEY = 'windsage.device.v1';
const SESSION_KEY = 'windsage.session.v1';

export type CloudSnapshot = {
  reading: StationReading | null;
  result: CheckResult | null;
  alertState?: AlertState;
  updatedAt?: number;
};

export type CloudUser = {
  id: string;
  username: string | null;
  sso: {
    google: { email: string | null; linked: boolean } | null;
    facebook: { linked: boolean } | null;
    apple: { linked: boolean } | null;
  };
  pollIntervalMinutes: number;
  stationCount: number;
};

type DeviceCreds = { deviceId: string; secret: string };

function randomId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export async function getDeviceCreds(): Promise<DeviceCreds> {
  const raw = await AsyncStorage.getItem(DEVICE_KEY);
  if (raw) return JSON.parse(raw) as DeviceCreds;
  const creds = { deviceId: randomId('dev'), secret: randomId('sec') };
  await AsyncStorage.setItem(DEVICE_KEY, JSON.stringify(creds));
  return creds;
}

export async function getSessionToken(): Promise<string | null> {
  return AsyncStorage.getItem(SESSION_KEY);
}

export async function setSessionToken(token: string | null): Promise<void> {
  if (!token) await AsyncStorage.removeItem(SESSION_KEY);
  else await AsyncStorage.setItem(SESSION_KEY, token);
}

async function getExpoPushTokenSafe(): Promise<string | null> {
  if (Platform.OS === 'web') return null;
  try {
    const Notifications = await import('expo-notifications');
    const projectId =
      Constants.easConfig?.projectId ??
      Constants.expoConfig?.extra?.eas?.projectId ??
      undefined;
    if (projectId && projectId !== 'windsage-wald-local') {
      return (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    }
    return (await Notifications.getExpoPushTokenAsync()).data;
  } catch {
    return null;
  }
}

async function cloudFetch<T>(
  path: string,
  options: RequestInit & { secret?: string; token?: string | null } = {},
): Promise<T> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> | undefined),
  };
  if (options.secret) headers['x-windsage-secret'] = options.secret;
  if (options.token) headers.Authorization = `Bearer ${options.token}`;

  const response = await fetch(`${getCloudBaseUrl()}${path}`, {
    ...options,
    headers,
  });
  const data = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) {
    throw new Error(data.error || `Cloud HTTP ${response.status}`);
  }
  return data;
}

export async function registerWithCloud(): Promise<{
  creds: DeviceCreds;
  pushToken: string | null;
}> {
  const creds = await getDeviceCreds();
  const pushToken = await getExpoPushTokenSafe();
  await cloudFetch('/v1/devices', {
    method: 'POST',
    body: JSON.stringify({
      deviceId: creds.deviceId,
      secret: creds.secret,
      pushToken,
    }),
  });
  return { creds, pushToken };
}

export async function fetchAuthProviders(): Promise<{
  google: boolean;
  facebook: boolean;
  apple: boolean;
}> {
  const data = await cloudFetch<{ providers: { google: boolean; facebook: boolean; apple: boolean } }>(
    '/v1/auth/providers',
    { method: 'GET' },
  );
  return data.providers;
}

export async function registerAccount(
  username: string,
  password: string,
): Promise<{ token: string; user: CloudUser; stations: FollowedStation[]; pollIntervalMinutes: number }> {
  const { creds, pushToken } = await registerWithCloud();
  const data = await cloudFetch<{
    token: string;
    user: CloudUser;
    stations: FollowedStation[];
    pollIntervalMinutes: number;
  }>('/v1/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      username,
      password,
      deviceId: creds.deviceId,
      secret: creds.secret,
      pushToken,
    }),
  });
  await setSessionToken(data.token);
  return data;
}

export async function loginAccount(
  username: string,
  password: string,
): Promise<{ token: string; user: CloudUser; stations: FollowedStation[]; pollIntervalMinutes: number }> {
  const { creds, pushToken } = await registerWithCloud();
  const data = await cloudFetch<{
    token: string;
    user: CloudUser;
    stations: FollowedStation[];
    pollIntervalMinutes: number;
  }>('/v1/auth/login', {
    method: 'POST',
    body: JSON.stringify({
      username,
      password,
      deviceId: creds.deviceId,
      secret: creds.secret,
      pushToken,
    }),
  });
  await setSessionToken(data.token);
  return data;
}

export async function logoutAccount(): Promise<void> {
  const token = await getSessionToken();
  if (token) {
    try {
      await cloudFetch('/v1/auth/logout', { method: 'POST', token });
    } catch {
      // ignore
    }
  }
  await setSessionToken(null);
}

export async function fetchMe(): Promise<CloudUser | null> {
  const token = await getSessionToken();
  if (!token) return null;
  try {
    const data = await cloudFetch<{ user: CloudUser }>('/v1/me', { method: 'GET', token });
    return data.user;
  } catch {
    await setSessionToken(null);
    return null;
  }
}

export async function pullMyStations(): Promise<AppSettings | null> {
  const token = await getSessionToken();
  if (!token) return null;
  const data = await cloudFetch<{
    stations: FollowedStation[];
    pollIntervalMinutes: number;
  }>('/v1/me/stations', { method: 'GET', token });
  return {
    stations: data.stations || [],
    pollIntervalMinutes: Math.max(10, data.pollIntervalMinutes || 10),
  };
}

export async function startGoogleSignIn(mode: 'login' | 'link' = 'login'): Promise<void> {
  const { creds } = await registerWithCloud();
  const token = mode === 'link' ? await getSessionToken() : null;
  const url = new URL(`${getCloudBaseUrl()}/v1/auth/google/start`);
  url.searchParams.set('mode', mode);
  url.searchParams.set('deviceId', creds.deviceId);
  url.searchParams.set('secret', creds.secret);
  if (token) url.searchParams.set('token', token);

  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.location.href = url.toString();
    return;
  }
  await Linking.openURL(url.toString());
}

/** Consume ?auth_token= / ?auth_error= from Google redirect (web). */
export async function consumeAuthRedirectParams(): Promise<{
  token?: string;
  error?: string;
} | null> {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  const url = new URL(window.location.href);
  const token = url.searchParams.get('auth_token');
  const error = url.searchParams.get('auth_error');
  if (!token && !error) return null;
  url.searchParams.delete('auth_token');
  url.searchParams.delete('auth_error');
  url.searchParams.delete('auth_mode');
  window.history.replaceState({}, '', url.pathname + url.search + url.hash);
  if (token) await setSessionToken(token);
  return { token: token || undefined, error: error || undefined };
}

export async function syncStationsToCloud(
  settings: AppSettings,
  pushToken?: string | null,
): Promise<{
  snapshots: Record<string, CloudSnapshot>;
  stations?: FollowedStation[];
  rewrittenSpots?: number;
}> {
  const session = await getSessionToken();
  const { creds } = await registerWithCloud();
  const tokenPush = pushToken ?? (await getExpoPushTokenSafe());

  if (session) {
    const data = await cloudFetch<{
      snapshots: Record<string, CloudSnapshot>;
      stations?: FollowedStation[];
      rewrittenSpots?: number;
    }>('/v1/me/stations', {
      method: 'PUT',
      token: session,
      body: JSON.stringify({
        stations: settings.stations,
        pollIntervalMinutes: settings.pollIntervalMinutes,
        pushToken: tokenPush ?? undefined,
        deviceId: creds.deviceId,
        secret: creds.secret,
      }),
    });
    return {
      snapshots: data.snapshots || {},
      stations: data.stations,
      rewrittenSpots: data.rewrittenSpots,
    };
  }

  const data = await cloudFetch<{
    snapshots: Record<string, CloudSnapshot>;
    stations?: FollowedStation[];
    rewrittenSpots?: number;
  }>(`/v1/devices/${encodeURIComponent(creds.deviceId)}/stations`, {
    method: 'PUT',
    secret: creds.secret,
    body: JSON.stringify({
      stations: settings.stations,
      pollIntervalMinutes: settings.pollIntervalMinutes,
      pushToken: tokenPush ?? undefined,
    }),
  });
  return {
    snapshots: data.snapshots || {},
    stations: data.stations,
    rewrittenSpots: data.rewrittenSpots,
  };
}

export async function fetchCloudSnapshot(): Promise<{
  snapshots: Record<string, CloudSnapshot>;
  lastPollAt: number | null;
  cloud: boolean;
  stations?: FollowedStation[];
}> {
  const session = await getSessionToken();
  if (session) {
    const data = await cloudFetch<{
      snapshots: Record<string, CloudSnapshot>;
      lastPollAt: number | null;
      cloud: boolean;
      stations: FollowedStation[];
    }>('/v1/me/snapshot', { method: 'GET', token: session });
    return {
      snapshots: data.snapshots || {},
      lastPollAt: data.lastPollAt ?? null,
      cloud: !!data.cloud,
      stations: data.stations,
    };
  }

  const creds = await getDeviceCreds();
  const data = await cloudFetch<{
    snapshots: Record<string, CloudSnapshot>;
    lastPollAt: number | null;
    cloud: boolean;
    stations: FollowedStation[];
  }>(`/v1/devices/${encodeURIComponent(creds.deviceId)}/snapshot`, {
    method: 'GET',
    secret: creds.secret,
  });
  return {
    snapshots: data.snapshots || {},
    lastPollAt: data.lastPollAt ?? null,
    cloud: !!data.cloud,
    stations: data.stations,
  };
}

export async function requestCloudCheck(followId?: string): Promise<Record<string, CloudSnapshot>> {
  const session = await getSessionToken();
  if (session) {
    const data = await cloudFetch<{ snapshots: Record<string, CloudSnapshot> }>('/v1/me/check', {
      method: 'POST',
      token: session,
      body: JSON.stringify(followId ? { followId } : {}),
    });
    return data.snapshots || {};
  }

  const creds = await getDeviceCreds();
  const data = await cloudFetch<{ snapshots: Record<string, CloudSnapshot> }>(
    `/v1/devices/${encodeURIComponent(creds.deviceId)}/check`,
    {
      method: 'POST',
      secret: creds.secret,
      body: JSON.stringify(followId ? { followId } : {}),
    },
  );
  return data.snapshots || {};
}

export async function resetCloudAlert(followId: string): Promise<void> {
  const session = await getSessionToken();
  if (session) {
    await cloudFetch('/v1/me/reset-alert', {
      method: 'POST',
      token: session,
      body: JSON.stringify({ followId }),
    });
    return;
  }
  const creds = await getDeviceCreds();
  await cloudFetch(`/v1/devices/${encodeURIComponent(creds.deviceId)}/reset-alert`, {
    method: 'POST',
    secret: creds.secret,
    body: JSON.stringify({ followId }),
  });
}

export async function pingCloud(): Promise<boolean> {
  try {
    const data = await cloudFetch<{ ok: boolean }>('/health', { method: 'GET' });
    return !!data.ok;
  } catch {
    return false;
  }
}

export function snapshotsToLive(
  snapshots: Record<string, CloudSnapshot>,
): Record<
  string,
  { reading: StationReading | null; result: CheckResult | null; alertState?: AlertState }
> {
  const live: Record<
    string,
    { reading: StationReading | null; result: CheckResult | null; alertState?: AlertState }
  > = {};
  for (const [id, snap] of Object.entries(snapshots)) {
    live[id] = {
      reading: snap.reading ?? null,
      result: snap.result ?? null,
      alertState: snap.alertState,
    };
  }
  return live;
}

export function formatCloudAge(lastPollAt: number | null): string {
  if (!lastPollAt) return 'waiting for first cloud poll';
  const mins = Math.max(0, Math.round((Date.now() - lastPollAt) / 60000));
  if (mins <= 0) return 'just now';
  if (mins === 1) return '1 min ago';
  return `${mins} min ago`;
}

export type { FollowedStation };
