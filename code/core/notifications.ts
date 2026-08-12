import { Platform } from 'react-native';
import { displayName } from '../shared/defaults';
import type { CheckResult, FollowedStation } from '../shared/types';
import { metricLabel, metricUnit } from './windguru';

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
  if (Platform.OS !== 'android') return;
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

  if (Platform.OS === 'web') {
    try {
      new Notification(title, { body, icon: '/favicon.ico' });
    } catch {
      // ignore
    }
    return;
  }

  await configureAndroidChannel();
  try {
    const Notifications = await import('expo-notifications');
    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        data: {
          followId: station.id,
          stationId: station.stationId,
          metric: station.rule.metric,
        },
        sound: true,
        ...(Platform.OS === 'android' ? { channelId: 'windsage-alerts' } : {}),
      },
      trigger: null,
    });
  } catch {
    // ignore
  }
}
