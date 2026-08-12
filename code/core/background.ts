import { Platform } from 'react-native';
import { BACKGROUND_TASK_NAME } from '../shared/defaults';

export async function registerBackgroundFetch(_pollIntervalMinutes: number): Promise<void> {
  if (Platform.OS === 'web') return;
  const BackgroundFetch = await import('expo-background-fetch');
  const TaskManager = await import('expo-task-manager');

  const status = await BackgroundFetch.getStatusAsync();
  if (
    status === BackgroundFetch.BackgroundFetchStatus.Restricted ||
    status === BackgroundFetch.BackgroundFetchStatus.Denied
  ) {
    throw new Error('Background refresh is disabled on this device');
  }

  const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_TASK_NAME);
  if (isRegistered) {
    await BackgroundFetch.unregisterTaskAsync(BACKGROUND_TASK_NAME);
  }

  await BackgroundFetch.registerTaskAsync(BACKGROUND_TASK_NAME, {
    minimumInterval: Math.max(10, _pollIntervalMinutes) * 60,
    stopOnTerminate: false,
    startOnBoot: true,
  });
}

export async function unregisterBackgroundFetch(): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    const BackgroundFetch = await import('expo-background-fetch');
    const TaskManager = await import('expo-task-manager');
    const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_TASK_NAME);
    if (isRegistered) {
      await BackgroundFetch.unregisterTaskAsync(BACKGROUND_TASK_NAME);
    }
  } catch {
    // Native modules unavailable on web / Expo Go edge cases.
  }
}

export async function getBackgroundFetchStatusLabel(): Promise<string> {
  if (Platform.OS === 'web') return 'Cloud (web)';
  try {
    const BackgroundFetch = await import('expo-background-fetch');
    const status = await BackgroundFetch.getStatusAsync();
    switch (status) {
      case BackgroundFetch.BackgroundFetchStatus.Available:
        return 'Available';
      case BackgroundFetch.BackgroundFetchStatus.Denied:
        return 'Denied';
      case BackgroundFetch.BackgroundFetchStatus.Restricted:
        return 'Restricted';
      default:
        return 'Unknown';
    }
  } catch {
    return 'Unavailable';
  }
}
