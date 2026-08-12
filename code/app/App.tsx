import { StatusBar } from 'expo-status-bar';
import * as Haptics from 'expo-haptics';
import * as SplashScreen from 'expo-splash-screen';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { BootScreen } from '../components/BootScreen';
import { AccountScreen } from '../screens/AccountScreen';
import { HomeScreen } from '../screens/HomeScreen';
import { StationDetailScreen } from '../screens/StationDetailScreen';
import {
  type CloudUser,
  getCloudBaseUrl,
  consumeAuthRedirectParams,
  fetchCloudSnapshot,
  fetchMe,
  formatCloudAge,
  pingCloud,
  pullMyStations,
  registerWithCloud,
  requestCloudCheck,
  resetCloudAlert,
  snapshotsToLive,
  syncStationsToCloud,
} from '../core/cloud';
import { DEFAULT_SETTINGS, createFollowedStation, displayName } from '../shared/defaults';
import { configureAndroidChannel, ensureNotificationPermissions } from '../core/notifications';
import { unregisterBackgroundFetch } from '../core/background';
import { loadSettings, saveSettings } from '../core/storage';
import { colors } from '../shared/theme';
import type {
  AlertState,
  AlertStateMap,
  AppSettings,
  CheckResult,
  FollowedStation,
  StationReading,
} from '../shared/types';

async function hapticLight() {
  try {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  } catch {
    // web / unsupported
  }
}

async function hapticMedium() {
  try {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  } catch {
    // web / unsupported
  }
}

async function hapticError() {
  try {
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
  } catch {
    // web / unsupported
  }
}

SplashScreen.preventAutoHideAsync().catch(() => undefined);

type LiveEntry = {
  reading: StationReading | null;
  result: CheckResult | null;
  alertState?: AlertState;
};

export default function App() {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [alertStates, setAlertStates] = useState<AlertStateMap>({});
  const [live, setLive] = useState<Record<string, LiveEntry>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [checkingId, setCheckingId] = useState<string | null>(null);
  const [cloudStatus, setCloudStatus] = useState('…');
  const [lastPollAt, setLastPollAt] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [activeStationId, setActiveStationId] = useState<string | null>(null);
  const [accountOpen, setAccountOpen] = useState(false);
  const [account, setAccount] = useState<CloudUser | null>(null);

  const settingsRef = useRef(settings);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  settingsRef.current = settings;

  const showToast = useCallback((message: string) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2800);
  }, []);

  const applySnapshots = useCallback((snapshots: Record<string, LiveEntry>) => {
    setLive(snapshots);
    const nextStates: AlertStateMap = {};
    for (const [id, entry] of Object.entries(snapshots)) {
      if (entry.alertState) nextStates[id] = entry.alertState;
    }
    setAlertStates((prev) => ({ ...prev, ...nextStates }));
  }, []);

  const refreshFromCloud = useCallback(
    async (source: 'manual' | 'auto' = 'auto') => {
      if (source === 'manual') setRefreshing(true);
      try {
        const online = await pingCloud();
        if (!online) {
          setCloudStatus('offline');
          if (source === 'manual') showToast('Cloud unreachable (Tailscale?)');
          return;
        }
        const sync = await syncStationsToCloud(settingsRef.current);
        applySnapshots(snapshotsToLive(sync.snapshots));
        if (sync.stations) {
          const next = {
            ...settingsRef.current,
            stations: sync.stations,
          };
          setSettings(next);
          await saveSettings(next);
        }
        const snap = await fetchCloudSnapshot();
        setLastPollAt(snap.lastPollAt);
        setCloudStatus(`cloud · ${formatCloudAge(snap.lastPollAt)}`);
        if (source === 'manual') {
          await hapticLight();
          showToast('Synced from Wald cloud');
        }
      } catch (error) {
        setCloudStatus('error');
        showToast(error instanceof Error ? error.message : 'Cloud refresh failed');
      } finally {
        setRefreshing(false);
      }
    },
    [applySnapshots, showToast],
  );

  const persistSettings = useCallback(
    async (next: AppSettings) => {
      setSettings(next);
      await saveSettings(next);
      try {
        const sync = await syncStationsToCloud(next);
        applySnapshots(snapshotsToLive(sync.snapshots));
        if (sync.stations) {
          const fixed = { ...next, stations: sync.stations };
          setSettings(fixed);
          await saveSettings(fixed);
        }
        setCloudStatus(`cloud · ${formatCloudAge(Date.now())}`);
      } catch (error) {
        setCloudStatus('sync failed');
        showToast(error instanceof Error ? error.message : 'Cloud sync failed');
      }
    },
    [applySnapshots, showToast],
  );

  const applyAccountPayload = useCallback(
    async (payload: {
      user: CloudUser;
      stations: FollowedStation[];
      pollIntervalMinutes: number;
    }) => {
      setAccount(payload.user);
      const next: AppSettings = {
        stations: payload.stations || [],
        pollIntervalMinutes: Math.max(10, payload.pollIntervalMinutes || 10),
      };
      setSettings(next);
      await saveSettings(next);
      setAccountOpen(false);
      showToast(
        `Signed in · ${payload.user.username || payload.user.sso.google?.email || 'account'}`,
      );
      await refreshFromCloud('auto');
    },
    [refreshFromCloud, showToast],
  );

  const checkOne = useCallback(
    async (station: FollowedStation) => {
      setCheckingId(station.id);
      try {
        const snapshots = await requestCloudCheck(station.id);
        applySnapshots(snapshotsToLive(snapshots));
        setLastPollAt(Date.now());
        setCloudStatus('cloud · just now');
        await hapticLight();
        showToast('Cloud check complete');
      } catch (error) {
        await hapticError();
        showToast(error instanceof Error ? error.message : 'Check failed');
      } finally {
        setCheckingId(null);
      }
    },
    [applySnapshots, showToast],
  );

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        await configureAndroidChannel();
        await ensureNotificationPermissions();
        await unregisterBackgroundFetch().catch(() => undefined);

        const oauth = await consumeAuthRedirectParams();
        if (oauth?.error && !cancelled) showToast(oauth.error);
        if (oauth?.token && !cancelled) {
          const me = await fetchMe();
          const pulled = await pullMyStations();
          if (me && pulled && !cancelled) {
            await applyAccountPayload({
              user: me,
              stations: pulled.stations,
              pollIntervalMinutes: pulled.pollIntervalMinutes,
            });
          }
        }

        const loaded = await loadSettings();
        if (cancelled) return;

        const me = await fetchMe().catch(() => null);
        if (me) {
          setAccount(me);
          const pulled = await pullMyStations().catch(() => null);
          if (pulled) {
            setSettings(pulled);
            await saveSettings(pulled);
          } else {
            setSettings(loaded);
          }
        } else {
          setSettings(loaded);
        }

        await registerWithCloud().catch(() => undefined);
        if (!cancelled) await refreshFromCloud('auto');
      } finally {
        if (!cancelled) {
          setLoading(false);
          await SplashScreen.hideAsync().catch(() => undefined);
        }
      }
    })();

    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refreshFromCloud('auto');
    });

    return () => {
      cancelled = true;
      sub.remove();
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, [applyAccountPayload, refreshFromCloud, showToast]);

  const activeStation = useMemo(
    () => settings.stations.find((s) => s.id === activeStationId) ?? null,
    [activeStationId, settings.stations],
  );

  const updateStation = useCallback(
    async (next: FollowedStation, persist = true) => {
      const stations = settingsRef.current.stations.map((s) => (s.id === next.id ? next : s));
      const payload = { ...settingsRef.current, stations };
      setSettings(payload);
      if (persist) await persistSettings(payload);
    },
    [persistSettings],
  );

  const addStation = useCallback(
    async (
      stationId: string,
      nickname: string,
      kind: FollowedStation['kind'] = 'station',
      extras?: Pick<FollowedStation, 'liveStationId' | 'linkedLiveStation' | 'liveLinkWarning'>,
    ) => {
      const station = createFollowedStation(stationId, nickname, { kind, ...extras });
      const payload = {
        ...settingsRef.current,
        stations: [...settingsRef.current.stations, station],
      };
      await persistSettings(payload);
      setAddOpen(false);
      setActiveStationId(station.id);
      const warn = extras?.liveLinkWarning ? ' · nearest live linked' : '';
      showToast(
        `Following ${nickname || (kind === 'spot' ? `Spot ${stationId}` : `Station ${stationId}`)}${warn}`,
      );
    },
    [persistSettings, showToast],
  );

  const unfollow = useCallback(
    async (station: FollowedStation) => {
      const payload = {
        ...settingsRef.current,
        stations: settingsRef.current.stations.filter((s) => s.id !== station.id),
      };
      await persistSettings(payload);
      setLive((prev) => {
        const next = { ...prev };
        delete next[station.id];
        return next;
      });
      setAlertStates((prev) => {
        const next = { ...prev };
        delete next[station.id];
        return next;
      });
      setActiveStationId(null);
      showToast('Station unfollowed');
    },
    [persistSettings, showToast],
  );

  if (loading) {
    return <BootScreen />;
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="light" />
      {accountOpen ? (
        <AccountScreen
          onBack={() => setAccountOpen(false)}
          onAuthed={(payload) => void applyAccountPayload(payload)}
          onLoggedOut={() => {
            setAccount(null);
            showToast('Signed out · this device stays as guest');
          }}
        />
      ) : activeStation ? (
        <StationDetailScreen
          station={activeStation}
          result={live[activeStation.id]?.result ?? null}
          alertState={alertStates[activeStation.id] ?? live[activeStation.id]?.alertState ?? null}
          checking={checkingId === activeStation.id}
          bgStatus={`${cloudStatus} · ${getCloudBaseUrl().replace(/^https?:\/\//, '') || 'same-origin'}`}
          pollIntervalMinutes={settings.pollIntervalMinutes}
          onBack={() => setActiveStationId(null)}
          onChange={(next) => void updateStation(next, false)}
          onPersist={(next) => void updateStation(next, true)}
          onSave={(next) => {
            void (async () => {
              await updateStation(next, true);
              // Drop stale live snapshot so Check/UI reflect the new location.
              setLive((prev) => {
                const copy = { ...prev };
                delete copy[next.id];
                return copy;
              });
              showToast(
                next.liveLinkWarning
                  ? `Saved · ${displayName(next)} · nearest live linked`
                  : `Saved · ${displayName(next)}`,
              );
              void checkOne(next);
            })();
          }}
          onPollIntervalChange={(minutes) => {
            const payload = { ...settingsRef.current, pollIntervalMinutes: minutes };
            setSettings(payload);
            void persistSettings(payload);
          }}
          onCheck={() => void checkOne(activeStation)}
          onResetAlert={async () => {
            await resetCloudAlert(activeStation.id);
            await hapticMedium();
            showToast('Alert memory cleared on cloud');
            void refreshFromCloud('auto');
          }}
          onUnfollow={() => void unfollow(activeStation)}
        />
      ) : (
        <HomeScreen
          stations={settings.stations}
          live={live}
          refreshing={refreshing}
          addOpen={addOpen}
          onOpenAdd={() => setAddOpen(true)}
          onCloseAdd={() => setAddOpen(false)}
          onAdd={(stationId, nickname, kind, extras) =>
            void addStation(stationId, nickname, kind, extras)
          }
          onRefresh={() => void refreshFromCloud('manual')}
          onOpenStation={setActiveStationId}
          onOpenAccount={() => setAccountOpen(true)}
          accountLabel={
            account
              ? account.username
                ? `@${account.username}`
                : account.sso.google?.email || 'Account'
              : 'Account'
          }
          cloudStatus={cloudStatus}
        />
      )}

      {toast ? (
        <View style={styles.toast}>
          <Text style={styles.toastText}>{toast}</Text>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  toast: {
    position: 'absolute',
    left: 20,
    right: 20,
    bottom: 28,
    backgroundColor: '#123B48',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: colors.accent,
  },
  toastText: {
    color: colors.text,
    textAlign: 'center',
    fontWeight: '600',
  },
});
