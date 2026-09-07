import { StatusBar } from 'expo-status-bar';
import * as Haptics from 'expo-haptics';
import * as SplashScreen from 'expo-splash-screen';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Linking, Platform, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { BootScreen } from '../components/BootScreen';
import { AccountScreen } from '../screens/AccountScreen';
import { DownloadScreen } from '../screens/DownloadScreen';
import { HomeScreen } from '../screens/HomeScreen';
import { StationDetailScreen } from '../screens/StationDetailScreen';
import {
  type CloudUser,
  getCloudBaseUrl,
  consumeAuthRedirectParams,
  consumeAuthRedirectParamsFromUrl,
  fetchCatalogStations,
  fetchAnnouncement,
  fetchCloudSnapshot,
  fetchMe,
  formatCloudAge,
  getDismissedAnnouncementId,
  dismissAnnouncement,
  pingCloud,
  pullMyStations,
  registerWithCloud,
  requestCloudCheck,
  resetCloudAlert,
  sendAlertFeedback,
  snapshotsToLive,
  syncStationsToCloud,
  type CloudAnnouncement,
} from '../core/cloud';
import { DEFAULT_SETTINGS, createFollowedStation, displayName, normalizeUiMode, windguruName } from '../shared/defaults';
import type { CatalogStation } from '../shared/defaults';
import { normalizeProvider } from '../shared/providers';
import { configureAndroidChannel, ensureNotificationPermissions, registerWebPushSubscription, sendThresholdNotification } from '../core/notifications';
import { initPwaInstallCapture } from '../core/pwaInstall';
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

/** Ensure cloud/local stations always have provider + safe nickname before setSettings. */
function withStationDefaults(stations: FollowedStation[] | null | undefined): FollowedStation[] {
  return (stations || []).map((s) => ({
    ...s,
    provider: normalizeProvider(s?.provider || 'windguru'),
    nickname: s?.nickname ?? '',
  }));
}

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

if (Platform.OS === 'web') {
  initPwaInstallCapture();
}

type LiveEntry = {
  reading: StationReading | null;
  result: CheckResult | null;
  alertState?: AlertState;
};

function webPathIsDownload(): boolean {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return false;
  const path = window.location.pathname.replace(/\/+$/, '') || '/';
  return path === '/download';
}

function setWebPath(path: '/' | '/download') {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  const current = window.location.pathname.replace(/\/+$/, '') || '/';
  const next = path === '/' ? '/' : '/download';
  if (current === next) return;
  window.history.pushState({ windsage: next }, '', next);
}

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
  const [downloadOpen, setDownloadOpen] = useState(() => webPathIsDownload());
  const [account, setAccount] = useState<CloudUser | null>(null);
  const [catalogStations, setCatalogStations] = useState<CatalogStation[]>([]);
  const [announcement, setAnnouncement] = useState<CloudAnnouncement | null>(null);

  const settingsRef = useRef(settings);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  settingsRef.current = settings;

  const showToast = useCallback((message: string) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2800);
  }, []);

  const loadCatalog = useCallback(async () => {
    const rows = await fetchCatalogStations();
    setCatalogStations(rows);
  }, []);

  const loadAnnouncement = useCallback(async () => {
    const next = await fetchAnnouncement();
    if (!next) {
      setAnnouncement(null);
      return;
    }
    const dismissed = await getDismissedAnnouncementId();
    setAnnouncement(dismissed === next.id ? null : next);
  }, []);

  const onDismissAnnouncement = useCallback(async () => {
    if (!announcement) return;
    await dismissAnnouncement(announcement.id);
    setAnnouncement(null);
  }, [announcement]);

  const applySnapshots = useCallback((snapshots: Record<string, LiveEntry>) => {
    setLive((prev) => {
      const keys = Object.keys(snapshots);
      // Keep prior readings if cloud returns an empty bag (avoids blank cards mid-refresh).
      if (keys.length === 0) return prev;
      return { ...prev, ...snapshots };
    });
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
          if (source === 'manual') showToast('Cloud unreachable — list kept as-is');
          return;
        }
        const sync = await syncStationsToCloud(settingsRef.current);
        applySnapshots(snapshotsToLive(sync.snapshots));
        if (sync.stations) {
          const incoming = withStationDefaults(sync.stations);
          const local = settingsRef.current.stations || [];
          // Never blank a non-empty home list with an empty cloud reply.
          if (incoming.length > 0 || local.length === 0) {
            const next = {
              ...settingsRef.current,
              stations: incoming,
            };
            setSettings(next);
            await saveSettings(next);
          }
        }
        const [snap] = await Promise.all([
          fetchCloudSnapshot(),
          loadCatalog().catch(() => undefined),
          loadAnnouncement().catch(() => undefined),
        ]);
        setLastPollAt(snap.lastPollAt);
        setCloudStatus(`cloud · ${formatCloudAge(snap.lastPollAt)}`);
        if (source === 'manual') {
          await hapticLight();
          showToast('Synced from Wald cloud');
        }
      } catch (error) {
        setCloudStatus('error');
        showToast(error instanceof Error ? error.message : 'Cloud refresh failed — list kept');
      } finally {
        setRefreshing(false);
      }
    },
    [applySnapshots, loadAnnouncement, loadCatalog, showToast],
  );

  // Coalesce rapid persistSettings → one cloud sync (trailing debounce).
  const persistSyncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const persistSyncPending = useRef<{
    next: AppSettings;
    opts?: { clearStations?: boolean };
    waiters: Array<{ resolve: () => void; reject: (e: unknown) => void }>;
  } | null>(null);

  const flushPersistSync = useCallback(async () => {
    const pending = persistSyncPending.current;
    persistSyncPending.current = null;
    if (persistSyncTimer.current) {
      clearTimeout(persistSyncTimer.current);
      persistSyncTimer.current = null;
    }
    if (!pending) return;
    try {
      const sync = await syncStationsToCloud(pending.next, undefined, pending.opts);
      applySnapshots(snapshotsToLive(sync.snapshots));
      if (sync.stations) {
        const incoming = withStationDefaults(sync.stations);
        const local = pending.next.stations || [];
        if (incoming.length > 0 || local.length === 0) {
          const fixed = { ...pending.next, stations: incoming };
          setSettings(fixed);
          await saveSettings(fixed);
        }
      }
      setCloudStatus(`cloud · ${formatCloudAge(Date.now())}`);
      for (const w of pending.waiters) w.resolve();
    } catch (error) {
      setCloudStatus('sync failed');
      showToast(error instanceof Error ? error.message : 'Cloud sync failed');
      for (const w of pending.waiters) w.reject(error);
    }
  }, [applySnapshots, showToast]);

  const persistSettings = useCallback(
    async (next: AppSettings, opts?: { clearStations?: boolean }) => {
      setSettings(next);
      await saveSettings(next);
      return new Promise<void>((resolve, reject) => {
        const prev = persistSyncPending.current;
        if (persistSyncTimer.current) clearTimeout(persistSyncTimer.current);
        persistSyncPending.current = {
          next,
          opts: {
            ...prev?.opts,
            ...opts,
            // Once any waiter opts into clearStations, keep it for the flush.
            clearStations: !!(prev?.opts?.clearStations || opts?.clearStations),
          },
          waiters: [...(prev?.waiters || []), { resolve, reject }],
        };
        const delay = opts?.clearStations ? 0 : 450;
        persistSyncTimer.current = setTimeout(() => {
          void flushPersistSync();
        }, delay);
      });
    },
    [flushPersistSync],
  );

  const applyAccountPayload = useCallback(
    async (
      payload: {
        user: CloudUser;
        stations: FollowedStation[];
        pollIntervalMinutes: number;
      },
      opts?: { importLocalGuestFollows?: boolean },
    ) => {
      setAccount(payload.user);
      const cloudStations = withStationDefaults(payload.stations);
      const localStations = settingsRef.current.stations || [];
      // Only import leftover guest follows on REGISTER. Login on a shared phone
      // must not push the previous person's local list into this account.
      const importLocal =
        opts?.importLocalGuestFollows === true &&
        cloudStations.length === 0 &&
        localStations.length > 0;
      const stations = cloudStations.length > 0
        ? cloudStations
        : importLocal
          ? withStationDefaults(localStations)
          : cloudStations;
      const next: AppSettings = {
        stations,
        pollIntervalMinutes: Math.max(10, payload.pollIntervalMinutes || 10),
        uiMode: normalizeUiMode(settingsRef.current.uiMode),
      };
      setSettings(next);
      await saveSettings(next);
      setAccountOpen(false);
      showToast(
        `Signed in · ${payload.user.username || payload.user.sso.google?.email || 'account'}`,
      );
      if (importLocal) {
        await persistSettings(next);
      } else {
        await refreshFromCloud('auto');
      }
    },
    [persistSettings, refreshFromCloud, showToast],
  );

  const checkOne = useCallback(
    async (station: FollowedStation) => {
      setCheckingId(station.id);
      try {
        const snapshots = await requestCloudCheck(station.id);
        applySnapshots(snapshotsToLive(snapshots));
        setLastPollAt(Date.now());
        setCloudStatus('cloud · just now');
        const snap = snapshots[station.id];
        if (snap?.result?.shouldNotify) {
          await sendThresholdNotification(station, snap.result);
        }
        await hapticLight();
        showToast(
          snap?.result?.shouldNotify
            ? 'Alert fired — check phone notifications'
            : 'Cloud check complete',
        );
      } catch (error) {
        await hapticError();
        showToast(error instanceof Error ? error.message : 'Check failed');
      } finally {
        setCheckingId(null);
      }
    },
    [applySnapshots, showToast],
  );

  const openDownload = useCallback(() => {
    // RN-web Linking.openURL is unreliable for same-site routes (often no-ops).
    // Drive the public /download page via history + in-app screen instead.
    setAccountOpen(false);
    setActiveStationId(null);
    setDownloadOpen(true);
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const host = window.location.hostname;
      if (host === 'windsage.nimrod.bio') {
        const next = 'https://windsage.nimrod.bio/download';
        if (window.location.href.replace(/\/+$/, '') !== next.replace(/\/+$/, '')) {
          window.history.pushState({ windsage: '/download' }, '', '/download');
        }
        return;
      }
      // Dev / other hosts: jump to the public download page.
      if (host !== 'localhost' && host !== '127.0.0.1' && !host.endsWith('.ts.net')) {
        window.location.assign('https://windsage.nimrod.bio/download');
        return;
      }
    }
    setWebPath('/download');
  }, []);

  const closeDownload = useCallback(() => {
    setDownloadOpen(false);
    setWebPath('/');
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const onPopState = () => setDownloadOpen(webPathIsDownload());
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  // Native deep-link fallback if AuthSession hands off via windsage://auth
  useEffect(() => {
    if (Platform.OS === 'web') return;
    let cancelled = false;
    const handleUrl = async (url: string | null) => {
      if (!url || cancelled) return;
      const oauth = await consumeAuthRedirectParamsFromUrl(url);
      if (!oauth || cancelled) return;
      if (oauth.error) {
        showToast(oauth.error);
        return;
      }
      if (!oauth.token) return;
      const me = await fetchMe().catch(() => null);
      const pulled = await pullMyStations().catch(() => null);
      if (me && !cancelled) {
        await applyAccountPayload({
          user: me,
          stations: pulled?.stations || [],
          pollIntervalMinutes: pulled?.pollIntervalMinutes || 10,
        });
      }
    };
    void Linking.getInitialURL().then((url) => void handleUrl(url));
    const sub = Linking.addEventListener('url', ({ url }) => void handleUrl(url));
    return () => {
      cancelled = true;
      sub.remove();
    };
  }, [applyAccountPayload, showToast]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        // Paint from local storage first — do not wait on push/cloud network.
        const loaded = await loadSettings();
        if (cancelled) return;
        setSettings(loaded);
        setLoading(false);
        await SplashScreen.hideAsync().catch(() => undefined);

        // Background warm-up after first paint.
        void (async () => {
          try {
            await configureAndroidChannel();
            await unregisterBackgroundFetch().catch(() => undefined);

            const oauth = await consumeAuthRedirectParams();
            if (cancelled) return;
            if (oauth?.error) showToast(oauth.error);
            if (oauth?.token) {
              const me = await fetchMe().catch(() => null);
              const pulled = await pullMyStations().catch(() => null);
              if (me && pulled && !cancelled) {
                await applyAccountPayload({
                  user: me,
                  stations: pulled.stations,
                  pollIntervalMinutes: pulled.pollIntervalMinutes,
                });
                return;
              }
            }

            const me = await fetchMe().catch(() => null);
            if (cancelled) return;
            if (me) {
              setAccount(me);
              const pulled = await pullMyStations().catch(() => null);
              if (pulled && !cancelled) {
                // Always take the cloud bag when signed in — never push leftover
                // guest follows from a previous person on this phone into the account.
                const cloudStations = withStationDefaults(pulled.stations);
                const merged = {
                  ...settingsRef.current,
                  stations: cloudStations,
                  pollIntervalMinutes: Math.max(10, pulled.pollIntervalMinutes || 10),
                  uiMode: normalizeUiMode(settingsRef.current.uiMode),
                };
                setSettings(merged);
                await saveSettings(merged);
              }
            }

            await registerWithCloud().catch(() => undefined);
            // Permissions + push after UI is up (can prompt / hit network).
            void ensureNotificationPermissions()
              .then((ok) => (ok ? registerWebPushSubscription() : null))
              .catch(() => null);
            if (!cancelled) void refreshFromCloud('auto');
          } catch {
            if (!cancelled) void refreshFromCloud('auto');
          }
        })();
      } catch {
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
  }, [applyAccountPayload, persistSettings, refreshFromCloud, showToast]);

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
      extras?: Pick<
        FollowedStation,
        | 'provider'
        | 'liveStationId'
        | 'linkedLiveStation'
        | 'liveLinkWarning'
        | 'sourceName'
        | 'locationBlend'
      >,
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
      showToast(`Following ${displayName(station)}${warn}`);
    },
    [persistSettings, showToast],
  );

  const reuseStation = useCallback(
    (followId: string) => {
      const existing = settingsRef.current.stations.find((s) => s.id === followId);
      setAddOpen(false);
      if (!existing) return;
      setActiveStationId(existing.id);
      showToast(`Already following — opened ${windguruName(existing)}`);
    },
    [showToast],
  );

  const unfollow = useCallback(
    async (station: FollowedStation) => {
      const payload = {
        ...settingsRef.current,
        stations: settingsRef.current.stations.filter((s) => s.id !== station.id),
      };
      await persistSettings(payload, {
        // Only intentional unfollow-to-empty may clear the cloud bag.
        clearStations: payload.stations.length === 0,
      });
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
      {downloadOpen ? (
        <DownloadScreen
          onBack={closeDownload}
          onOpenApp={() => {
            closeDownload();
          }}
        />
      ) : accountOpen ? (
        <AccountScreen
          onBack={() => setAccountOpen(false)}
          onAuthed={(payload) => void applyAccountPayload(payload)}
          uiMode={normalizeUiMode(settings.uiMode)}
          onUiModeChange={(mode) => {
            const next = {
              ...settingsRef.current,
              uiMode: normalizeUiMode(mode),
            };
            setSettings(next);
            void saveSettings(next);
          }}
          onLoggedOut={() => {
            setAccount(null);
            const cleared: AppSettings = {
              stations: [],
              pollIntervalMinutes: settingsRef.current.pollIntervalMinutes || 10,
              uiMode: normalizeUiMode(settingsRef.current.uiMode),
            };
            setSettings(cleared);
            void saveSettings(cleared);
            setLive({});
            showToast('Signed out · follow list cleared on this device');
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
          onAlertFeedback={async (rating) => {
            const ok = await sendAlertFeedback(activeStation.id, rating);
            showToast(ok ? `Thanks — alert marked ${rating}` : 'Sign in to save feedback');
          }}
          onUnfollow={() => void unfollow(activeStation)}
        />
      ) : (
        <HomeScreen
          stations={settings.stations}
          live={live}
          refreshing={refreshing}
          addOpen={addOpen}
          onOpenAdd={() => {
            setAddOpen(true);
            void loadCatalog();
          }}
          onCloseAdd={() => setAddOpen(false)}
          onAdd={(stationId, nickname, kind, extras) =>
            void addStation(stationId, nickname, kind, extras)
          }
          onReuse={reuseStation}
          catalogStations={catalogStations}
          onRefresh={() => void refreshFromCloud('manual')}
          onOpenStation={setActiveStationId}
          onOpenAccount={() => setAccountOpen(true)}
          onOpenDownload={openDownload}
          announcement={announcement}
          onDismissAnnouncement={() => void onDismissAnnouncement()}
          uiMode={normalizeUiMode(settings.uiMode)}
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
