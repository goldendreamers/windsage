import { Platform } from 'react-native';
import { displayName } from '../shared/defaults';
import type { CheckResult, FollowedStation } from '../shared/types';
import { metricLabel, metricUnit } from './windguru';
import { getCloudBaseUrl } from './cloud';

export type WebPushSubscriptionJSON = {
  endpoint: string;
  expirationTime?: number | null;
  keys: { p256dh: string; auth: string };
};

// Avoid circular imports: cloud.ts reads this after subscribe.
let cachedWebPush: WebPushSubscriptionJSON | null = null;

export function getCachedWebPushSubscription(): WebPushSubscriptionJSON | null {
  return cachedWebPush;
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

export async function ensureNotificationPermissions(): Promise<boolean> {
  if (Platform.OS === 'web') {
    if (typeof Notification === 'undefined') return false;
    if (Notification.permission === 'granted') return true;
    if (Notification.permission === 'denied') return false;
    const result = await Notification.requestPermission();
    return result === 'granted';
  }

  try {
    const Notifications = await import('expo-notifications');
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });

    const current = await Notifications.getPermissionsAsync();
    if (
      current.granted ||
      current.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL
    ) {
      return true;
    }

    const requested = await Notifications.requestPermissionsAsync();
    return (
      requested.granted ||
      requested.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL
    );
  } catch {
    return false;
  }
}

export async function configureAndroidChannel(): Promise<void> {
  if (Platform.OS === 'android') {
    try {
      const Notifications = await import('expo-notifications');
      await Notifications.setNotificationChannelAsync('windsage-alerts', {
        name: 'Windsage alerts',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 200, 250],
        lightColor: '#3DB8A0',
      });
    } catch {
      // ignore
    }
  }
}

/** Register service worker + PushManager subscription for phone OS alerts (PWA). */
export async function registerWebPushSubscription(): Promise<WebPushSubscriptionJSON | null> {
  if (Platform.OS !== 'web') return null;
  if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window)) {
    return null;
  }
  const allowed = await ensureNotificationPermissions();
  if (!allowed) return null;

  try {
    const keyRes = await fetch(`${getCloudBaseUrl()}/v1/push/vapid-public-key`, {
      headers: { Accept: 'application/json' },
    });
    if (!keyRes.ok) return null;
    const keyJson = (await keyRes.json()) as { publicKey?: string };
    if (!keyJson.publicKey) return null;

    const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    await navigator.serviceWorker.ready;

    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(keyJson.publicKey),
      });
    }
    const json = sub.toJSON();
    if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return null;
    cachedWebPush = {
      endpoint: json.endpoint,
      expirationTime: json.expirationTime ?? null,
      keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
    };
    return cachedWebPush;
  } catch (error) {
    console.warn('[windsage] web push subscribe failed', error);
    return null;
  }
}

async function showWebOsNotification(title: string, body: string, data?: Record<string, string>) {
  try {
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.ready.catch(() => null);
      if (reg?.showNotification) {
        await reg.showNotification(title, {
          body,
          icon: '/icon-192.png',
          badge: '/icon-192.png',
          tag: data?.followId || 'windsage-alert',
          data: data || {},
        });
        return;
      }
    }
    new Notification(title, { body, icon: '/icon-192.png' });
  } catch {
    // ignore
  }
}

export async function sendThresholdNotification(
  station: FollowedStation,
  result: CheckResult,
): Promise<void> {
  const allowed = await ensureNotificationPermissions();
  if (!allowed) return;

  const unit = metricUnit(station.rule.metric);
  const label = metricLabel(station.rule.metric);
  const name = displayName(station);
  const value =
    result.metricValue == null ? 'n/a' : `${result.metricValue.toFixed(1)} ${unit}`;
  const cmp = station.rule.comparison === 'gte' ? '≥' : '≤';
  const title = `Windsage · ${name}`;
  const body = `${label} ${cmp}${station.rule.threshold} ${unit} for ${station.rule.sustainedMinutes}+ min (now ${value})`;
  const data = {
    followId: station.id,
    stationId: station.stationId,
    metric: station.rule.metric,
  };

  if (Platform.OS === 'web') {
    await showWebOsNotification(title, body, data);
    return;
  }

  await configureAndroidChannel();
  try {
    const Notifications = await import('expo-notifications');
    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        data,
        sound: true,
        ...(Platform.OS === 'android' ? { channelId: 'windsage-alerts' } : {}),
      },
      trigger: null,
    });
  } catch {
    // ignore
  }
}
