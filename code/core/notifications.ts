import { Platform } from 'react-native';
import type { CheckResult, FollowedStation } from '../shared/types';
import { getCloudBaseUrl } from './cloud';
import { formatAlertNotificationCopy } from './notifyCopy';

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

    // Cache-bust so phones pick up lock-screen SW fixes after deploy.
    const swVersion = '5';
    const reg = await navigator.serviceWorker.register(`/sw.js?v=${swVersion}`, { scope: '/' });
    await navigator.serviceWorker.ready;
    await reg.update().catch(() => undefined);

    let sub = await reg.pushManager.getSubscription();
    const prevSw = window.localStorage.getItem('windsage.swPushVersion');
    const needsRefresh = !sub || prevSw !== swVersion;
    if (needsRefresh && sub) {
      try {
        await sub.unsubscribe();
      } catch {
        // ignore
      }
      sub = null;
    }
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(keyJson.publicKey),
      });
    }
    window.localStorage.setItem('windsage.swPushVersion', swVersion);
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

/** True when running as an installed PWA (needed for reliable Android lock-screen wake). */
export function isInstalledPwa(): boolean {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return Platform.OS !== 'web';
  const media = window.matchMedia?.('(display-mode: standalone)')?.matches;
  const iosStandalone = Boolean((window.navigator as { standalone?: boolean }).standalone);
  return !!(media || iosStandalone);
}

async function showWebOsNotification(title: string, body: string, data?: Record<string, string>) {
  try {
    const origin =
      typeof window !== 'undefined' && window.location?.origin
        ? window.location.origin
        : 'https://windsage.nimrod.bio';
    const icon = `${origin}/notify-icon.png`;
    const badge = `${origin}/badge-96.png`;
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.ready.catch(() => null);
      if (reg?.showNotification) {
        await reg.showNotification(title, {
          body,
          icon,
          badge,
          tag: `${data?.followId || 'windsage-alert'}-${Date.now()}`,
          renotify: true,
          requireInteraction: true,
          silent: false,
          vibrate: [300, 120, 300],
          data: data || {},
        });
        return;
      }
    }
    new Notification(title, { body, icon, requireInteraction: true, silent: false });
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

  const { title, body } = formatAlertNotificationCopy(station, result);
  const data = {
    followId: station.id,
    stationId: station.stationId,
    liveStationId: station.liveStationId || station.linkedLiveStation?.id || station.stationId,
    metric: station.rule.metric,
    kind: 'alert',
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
