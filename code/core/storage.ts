import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  DEFAULT_ALERT_STATE,
  DEFAULT_RULE,
  DEFAULT_SETTINGS,
  createFollowedStation,
} from '../shared/defaults';
import type { AlertState, AlertStateMap, AppSettings, FollowedStation } from '../shared/types';

const SETTINGS_KEY = 'windsage.settings.v2';
const LEGACY_SETTINGS_KEY = 'windsage.settings.v1';
const ALERT_STATE_KEY = 'windsage.alertState.v2';
const LEGACY_ALERT_STATE_KEY = 'windsage.alertState.v1';

function mergeStation(raw: Partial<FollowedStation>): FollowedStation | null {
  if (!raw.stationId?.trim()) return null;
  return createFollowedStation(raw.stationId, raw.nickname ?? '', {
    id: raw.id,
    kind: raw.kind === 'spot' ? 'spot' : 'station',
    enabled: raw.enabled,
    rule: { ...DEFAULT_RULE, ...(raw.rule ?? {}) },
    liveStationId: raw.liveStationId ?? null,
    linkedLiveStation: raw.linkedLiveStation ?? null,
    liveLinkWarning: raw.liveLinkWarning ?? null,
  });
}

function mergeSettings(raw: Partial<AppSettings> | null): AppSettings {
  if (!raw) return { ...DEFAULT_SETTINGS, stations: [] };
  const stations = Array.isArray(raw.stations)
    ? raw.stations
        .map((item) => mergeStation(item as Partial<FollowedStation>))
        .filter((item): item is FollowedStation => item != null)
    : [];
  return {
    stations,
    pollIntervalMinutes: Math.max(
      10,
      raw.pollIntervalMinutes ?? DEFAULT_SETTINGS.pollIntervalMinutes,
    ),
  };
}

async function migrateLegacySettings(): Promise<AppSettings | null> {
  const legacyRaw = await AsyncStorage.getItem(LEGACY_SETTINGS_KEY);
  if (!legacyRaw) return null;
  try {
    const legacy = JSON.parse(legacyRaw) as {
      stationId?: string;
      stationName?: string;
      enabled?: boolean;
      pollIntervalMinutes?: number;
      rule?: FollowedStation['rule'];
    };
    const stations =
      legacy.stationId?.trim()
        ? [
            createFollowedStation(legacy.stationId, legacy.stationName ?? '', {
              enabled: legacy.enabled ?? true,
              rule: { ...DEFAULT_RULE, ...(legacy.rule ?? {}) },
            }),
          ]
        : [];
    const migrated: AppSettings = {
      stations,
      pollIntervalMinutes: Math.max(10, legacy.pollIntervalMinutes ?? 10),
    };
    await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(migrated));
    return migrated;
  } catch {
    return null;
  }
}

export async function loadSettings(): Promise<AppSettings> {
  try {
    const raw = await AsyncStorage.getItem(SETTINGS_KEY);
    if (raw) {
      return mergeSettings(JSON.parse(raw) as Partial<AppSettings>);
    }
    const migrated = await migrateLegacySettings();
    if (migrated) return migrated;
    return mergeSettings(null);
  } catch {
    return mergeSettings(null);
  }
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

export async function loadAlertStates(): Promise<AlertStateMap> {
  try {
    const raw = await AsyncStorage.getItem(ALERT_STATE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as AlertStateMap;
      return parsed && typeof parsed === 'object' ? parsed : {};
    }

    // Migrate single legacy alert state onto first followed station if present.
    const legacy = await AsyncStorage.getItem(LEGACY_ALERT_STATE_KEY);
    const settings = await loadSettings();
    if (legacy && settings.stations[0]) {
      const state = {
        ...DEFAULT_ALERT_STATE,
        ...(JSON.parse(legacy) as AlertState),
      };
      const map = { [settings.stations[0].id]: state };
      await AsyncStorage.setItem(ALERT_STATE_KEY, JSON.stringify(map));
      return map;
    }
    return {};
  } catch {
    return {};
  }
}

export async function saveAlertStates(map: AlertStateMap): Promise<void> {
  await AsyncStorage.setItem(ALERT_STATE_KEY, JSON.stringify(map));
}

export async function getAlertState(
  map: AlertStateMap,
  stationLocalId: string,
): Promise<AlertState> {
  return { ...DEFAULT_ALERT_STATE, ...(map[stationLocalId] ?? {}) };
}

export function upsertAlertState(
  map: AlertStateMap,
  stationLocalId: string,
  state: AlertState,
): AlertStateMap {
  return { ...map, [stationLocalId]: state };
}

export async function resetAlertStateFor(stationLocalId: string): Promise<AlertStateMap> {
  const map = await loadAlertStates();
  const next = { ...map, [stationLocalId]: { ...DEFAULT_ALERT_STATE } };
  await saveAlertStates(next);
  return next;
}

export async function resetAllAlertStates(): Promise<void> {
  await saveAlertStates({});
}
