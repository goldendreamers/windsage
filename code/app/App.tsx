import { StatusBar } from 'expo-status-bar';
import * as Haptics from 'expo-haptics';
import * as SplashScreen from 'expo-splash-screen';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Linking, Platform, Pressable, SafeAreaView, Share, StyleSheet, Text, View } from 'react-native';
import { BootScreen } from '../components/BootScreen';
import { AppMenu } from '../components/AppMenu';
import { FirstTimeBanner, dismissHowto, getHowtoDismissed, type HowtoScreen } from '../components/FirstTimeBanner';
import { TrevorSupportSheet } from '../components/TrevorSupportSheet';
import { DiscordAlertSheet } from '../components/DiscordAlertSheet';
import { WindAlarmOverlay, type WindAlarmState } from '../components/WindAlarmOverlay';
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
  fetchCloudSnapshot,
  fetchMe,
  formatCloudAge,
  pingCloud,
  pullMyStations,
  registerWithCloud,
  requestCloudCheck,
  resetCloudAlert,
  sendAlertFeedback,
  snapshotsToLive,
  stopCloudWindAlarm,
  syncStationsToCloud,
} from '../core/cloud';
import { DEFAULT_SETTINGS, applyMonitoringSchedules, cloudCoveredByLocal, createFollowedStation, displayName, findExistingFollow, mergeFollowedStations, moveFollow, normalizeNotifyPrefs, resolveNotifyPrefs, toggleFollowStar, windguruName } from '../shared/defaults';
import type { CatalogStation } from '../shared/defaults';
import { normalizeProvider } from '../shared/providers';
import { configureAndroidChannel, ensureNotificationPermissions, registerWebPushSubscription, sendThresholdNotification } from '../core/notifications';
import { applyAppUpdate, initPwaInstallCapture, registerPwaServiceWorker, subscribeAppUpdate } from '../core/pwaInstall';
import { unregisterBackgroundFetch } from '../core/background';
import { followTargetFromResolved, resolveFollowInput } from '../core/stations';
import {
  beginShareConsume,
  buildShareFollowUrl,
  endShareConsume,
  parseLatLonId,
  parseShareFollowUrl,
  stripShareFollowUrl,
} from '../core/shareFollow';
import { loadSettings, saveSettings } from '../core/storage';
import { openWindsageKofi } from '../core/contact';
import { colors, paletteForMode } from '../shared/theme';
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
  return applyMonitoringSchedules(
    (stations || []).map((s) => ({
      ...s,
      provider: normalizeProvider(s?.provider || 'windguru'),
      nickname: s?.nickname ?? '',
      starred: s?.starred === true,
    })),
  ).stations;
}

/** Keep local extras when the cloud bag is a subset (stale/partial sync). */
function adoptCloudStations(
  local: FollowedStation[] | null | undefined,
  incoming: FollowedStation[] | null | undefined,
  opts?: { sameAccount?: boolean },
): FollowedStation[] {
  const cloud = withStationDefaults(incoming);
  const loc = withStationDefaults(local);
  if (!cloud.length) return loc;
  if (opts?.sameAccount || cloudCoveredByLocal(cloud, loc)) {
    return mergeFollowedStations(cloud, loc);
  }
  return cloud;
}

function windAlarmFromCloud(raw: {
  followId?: string | null;
  title?: string;
  body?: string;
  via?: string;
} | null | undefined): WindAlarmState | null {
  if (!raw?.title) return null;
  return {
    title: raw.title,
    body: raw.body || 'Wind is up',
    via: raw.via === 'discord' ? 'discord' : 'native',
    followId: raw.followId || null,
  };
}

function consumeWakeQuery(): 'stop' | 'show' | null {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  try {
    const url = new URL(window.location.href);
    const wake = url.searchParams.get('wake');
    if (!wake) return null;
    url.searchParams.delete('wake');
    const next = `${url.pathname}${url.search}${url.hash}`;
    window.history.replaceState(window.history.state, '', next);
    return wake === 'stop' ? 'stop' : 'show';
  } catch {
    return null;
  }
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
  void registerPwaServiceWorker();
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
  const [menuOpen, setMenuOpen] = useState(false);
  const [trevorOpen, setTrevorOpen] = useState(false);
  const [discordAlertOpen, setDiscordAlertOpen] = useState(false);
  const [howtoDismissed, setHowtoDismissed] = useState(true);
  const startedEmptyRef = useRef(false);
  const [downloadOpen, setDownloadOpen] = useState(() => webPathIsDownload());
  const [account, setAccount] = useState<CloudUser | null>(null);
  const [catalogStations, setCatalogStations] = useState<CatalogStation[]>([]);
  const [appUpdate, setAppUpdate] = useState({ available: false, waiting: false });
  const [windAlarm, setWindAlarm] = useState<WindAlarmState | null>(null);

  const [cloudWarmed, setCloudWarmed] = useState(false);
  const [shareTick, setShareTick] = useState(0);
  const settingsRef = useRef(settings);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cloudWarmedRef = useRef(false);
  const pendingShareHrefRef = useRef<string | null>(null);
  const shareBusyRef = useRef(false);
  const catalogLoadedRef = useRef(false);
  settingsRef.current = settings;

  const noteShareHref = useCallback((href: string | null | undefined) => {
    if (!href || !parseShareFollowUrl(href)) return;
    pendingShareHrefRef.current = href;
    setShareTick((n) => n + 1);
  }, []);

  const showToast = useCallback((message: string) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2800);
  }, []);

  const stopWindAlarmLocal = useCallback(async () => {
    setWindAlarm(null);
    try {
      await stopCloudWindAlarm();
    } catch {
      // overlay already closed
    }
  }, []);

  const loadCatalog = useCallback(async () => {
    if (catalogLoadedRef.current) return;
    catalogLoadedRef.current = true;
    try {
      const rows = await fetchCatalogStations();
      setCatalogStations(rows);
    } catch {
      catalogLoadedRef.current = false;
    }
  }, []);

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
          const stations = adoptCloudStations(local, incoming, {
            sameAccount: !!settingsRef.current.accountId,
          });
          const next = {
            ...settingsRef.current,
            stations,
          };
          setSettings(next);
          await saveSettings(next);
          if (stations.length > incoming.length) {
            showToast(`Restored ${stations.length - incoming.length} missing station(s)`);
          }
        }
        const snap = await fetchCloudSnapshot();
        setLastPollAt(snap.lastPollAt);
        setCloudStatus(`cloud · ${formatCloudAge(snap.lastPollAt)}`);
        if (typeof snap.simpleMode === 'boolean' && snap.simpleMode !== settingsRef.current.simpleMode) {
          const next = { ...settingsRef.current, simpleMode: snap.simpleMode };
          setSettings(next);
          await saveSettings(next);
        }
        if (snap.notifyPrefs) {
          const incoming = normalizeNotifyPrefs(snap.notifyPrefs);
          const cur = normalizeNotifyPrefs(settingsRef.current.notifyPrefs);
          if (JSON.stringify(incoming) !== JSON.stringify(cur)) {
            const next = { ...settingsRef.current, notifyPrefs: incoming };
            setSettings(next);
            await saveSettings(next);
          }
        }
        const nextAlarm = windAlarmFromCloud(snap.windAlarm);
        if (nextAlarm) setWindAlarm(nextAlarm);
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
    [applySnapshots, showToast],
  );

  // Coalesce rapid persistSettings → one cloud sync (trailing debounce).
  const persistSyncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const persistSyncPending = useRef<{
    next: AppSettings;
    opts?: {
      clearStations?: boolean;
      removedIds?: string[];
      removedKeys?: Array<{ provider?: string; stationId: string }>;
    };
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
        const stations = adoptCloudStations(local, incoming, {
          sameAccount: !!pending.next.accountId,
        });
        const fixed = { ...pending.next, stations };
        setSettings(fixed);
        await saveSettings(fixed);
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
    async (
      next: AppSettings,
      opts?: {
        clearStations?: boolean;
        removedIds?: string[];
        removedKeys?: Array<{ provider?: string; stationId: string }>;
      },
    ) => {
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
            clearStations: !!(prev?.opts?.clearStations || opts?.clearStations),
            removedIds: [...new Set([...(prev?.opts?.removedIds || []), ...(opts?.removedIds || [])])],
            removedKeys: [...(prev?.opts?.removedKeys || []), ...(opts?.removedKeys || [])],
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
        simpleMode?: boolean;
        notifyPrefs?: import('../shared/types').NotifyPrefs;
      },
      opts?: { importLocalGuestFollows?: boolean },
    ) => {
      setAccount(payload.user);
      const cloudStations = withStationDefaults(payload.stations);
      const localStations = settingsRef.current.stations || [];
      const importLocal =
        opts?.importLocalGuestFollows === true &&
        cloudStations.length === 0 &&
        localStations.length > 0;
      const sameAccount = !!(payload.user?.id && settingsRef.current.accountId === payload.user.id);
      const stations = importLocal
        ? withStationDefaults(localStations)
        : adoptCloudStations(localStations, cloudStations, { sameAccount });
      const next: AppSettings = {
        stations,
        pollIntervalMinutes: Number.isFinite(Number(payload.pollIntervalMinutes))
          ? Number(payload.pollIntervalMinutes)
          : 10,
        simpleMode: payload.simpleMode !== false,
        accountId: payload.user.id,
        notifyPrefs: normalizeNotifyPrefs(
          payload.notifyPrefs ?? payload.user.notifyPrefs ?? settingsRef.current.notifyPrefs,
        ),
      };
      setSettings(next);
      settingsRef.current = next;
      await saveSettings(next);
      setAccountOpen(false);
      const restored = Math.max(0, stations.length - cloudStations.length);
      showToast(
        restored
          ? `Signed in · restored ${restored} missing station(s)`
          : `Signed in · ${payload.user.username || payload.user.sso.google?.email || 'account'}`,
      );
      await persistSettings(next);
    },
    [persistSettings, showToast],
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
          const wake =
            station.wakeOnWind === true && settingsRef.current.simpleMode === false;
          if (wake) {
            const via =
              station.wakeOnWindVia === 'discord' && account?.discordAlert?.linked
                ? 'discord'
                : 'native';
            setWindAlarm({
              title: displayName(station),
              body: snap.result.message || 'Wind is up',
              via,
              followId: station.id,
            });
          } else {
            await sendThresholdNotification(station, snap.result);
          }
        }
        const resolved = resolveNotifyPrefs(settingsRef.current.notifyPrefs, {
          hasGoogleEmail: !!account?.sso?.google?.email,
        });
        const failed = /not delivered yet/i.test(String(snap?.result?.message || ''));
        await hapticLight();
        showToast(
          snap?.result?.shouldNotify
            ? station.wakeOnWind && settingsRef.current.simpleMode === false
              ? 'Wake-up ringing — tap Stop'
              : failed
                ? 'Alert ready — allow notifications or install the app'
                : resolved.email && !resolved.push
                  ? 'Alert emailed'
                  : 'Alert fired — check phone notifications'
            : 'Cloud check complete',
        );
      } catch (error) {
        await hapticError();
        showToast(error instanceof Error ? error.message : 'Check failed');
      } finally {
        setCheckingId(null);
      }
    },
    [account, applySnapshots, showToast],
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

  useEffect(() => {
    if (Platform.OS !== 'web') return undefined;
    return subscribeAppUpdate(setAppUpdate);
  }, []);

  useEffect(() => {
    const wake = consumeWakeQuery();
    if (wake === 'stop') void stopWindAlarmLocal();
  }, [stopWindAlarmLocal]);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof navigator === 'undefined' || !navigator.serviceWorker) {
      return;
    }
    const onMessage = (event: MessageEvent) => {
      const msg = event.data;
      if (!msg || typeof msg !== 'object') return;
      if (msg.type === 'windsage-alarm-stop') {
        void stopWindAlarmLocal();
        return;
      }
      if (msg.type === 'windsage-alarm' || msg.data?.alarm === true || msg.data?.alarm === '1' || msg.data?.kind === 'alarm') {
        setWindAlarm({
          title: String(msg.title || 'WAKE UP'),
          body: String(msg.body || 'Wind is up'),
          via: msg.data?.via === 'discord' ? 'discord' : 'native',
          followId: msg.data?.followId || null,
        });
      }
    };
    navigator.serviceWorker.addEventListener('message', onMessage);
    return () => navigator.serviceWorker.removeEventListener('message', onMessage);
  }, [stopWindAlarmLocal]);

  // Native deep-link fallback if AuthSession hands off via windsage://auth
  useEffect(() => {
    if (Platform.OS === 'web') return;
    let cancelled = false;
    const handleUrl = async (url: string | null) => {
      if (!url || cancelled) return;
      if (parseShareFollowUrl(url)) {
        noteShareHref(url);
        return;
      }
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
          simpleMode: pulled?.simpleMode !== false,
          notifyPrefs: pulled?.notifyPrefs,
        });
      }
    };
    void Linking.getInitialURL().then((url) => void handleUrl(url));
    const sub = Linking.addEventListener('url', ({ url }) => void handleUrl(url));
    return () => {
      cancelled = true;
      sub.remove();
    };
  }, [applyAccountPayload, noteShareHref, showToast]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        // Paint from local storage first — do not wait on push/cloud network.
        const loaded = await loadSettings();
        if (cancelled) return;
        startedEmptyRef.current = (loaded.stations || []).length === 0;
        const dismissed = await getHowtoDismissed().catch(() => false);
        if (cancelled) return;
        setHowtoDismissed(dismissed);
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
                  simpleMode: pulled.simpleMode !== false,
                  notifyPrefs: pulled.notifyPrefs,
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
                const local = settingsRef.current.stations || [];
                const cloudStations = withStationDefaults(pulled.stations);
                const sameAccount = settingsRef.current.accountId === me.id;
                const stations = adoptCloudStations(local, cloudStations, { sameAccount });
                const merged: AppSettings = {
                  ...pulled,
                  stations,
                  accountId: me.id,
                };
                setSettings(merged);
                settingsRef.current = merged;
                await saveSettings(merged);
              }
            }

            await registerWithCloud().catch(() => undefined);
            // Permissions + push after UI is up (can prompt / hit network).
            void ensureNotificationPermissions()
              .then((ok) => (ok ? registerWebPushSubscription() : null))
              .catch(() => null);
            if (!cancelled) await refreshFromCloud('auto');
          } catch {
            if (!cancelled) await refreshFromCloud('auto');
          } finally {
            if (!cancelled) {
              cloudWarmedRef.current = true;
              setCloudWarmed(true);
            }
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
      if (persist) {
        if (next.wakeOnWind && next.wakeOnWindVia !== 'discord') {
          void ensureNotificationPermissions();
        }
        await persistSettings(payload);
      }
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
        | 'rule'
      >,
      opts?: { fromLink?: boolean },
    ) => {
      const station = createFollowedStation(stationId, nickname, { kind, ...extras });
      const payload = {
        ...settingsRef.current,
        stations: [...settingsRef.current.stations, station],
      };
      await persistSettings(payload);
      setAddOpen(false);
      setActiveStationId(station.id);
      const warn = extras?.liveLinkWarning ? ' · forecast alerts' : '';
      showToast(
        opts?.fromLink
          ? `Following ${displayName(station)} from link${warn}`
          : `Following ${displayName(station)}${warn}`,
      );
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

  const consumeShareFollow = useCallback(async () => {
    if (!cloudWarmedRef.current || shareBusyRef.current) return;
    const href =
      pendingShareHrefRef.current ||
      (Platform.OS === 'web' && typeof window !== 'undefined' ? window.location.href : null);
    const payload = parseShareFollowUrl(href);
    if (!payload || !beginShareConsume()) return;
    shareBusyRef.current = true;
    pendingShareHrefRef.current = null;
    stripShareFollowUrl();
    try {
      const existing = findExistingFollow(settingsRef.current.stations, {
        stationId: payload.stationId,
        provider: payload.provider,
      });
      if (existing) {
        reuseStation(existing.id);
        return;
      }

      const coords = payload.provider === 'location' ? parseLatLonId(payload.stationId) : null;
      try {
        const extras: Record<string, unknown> = {};
        if (payload.provider === 'location') {
          if (payload.address) extras.address = payload.address;
          if (coords) {
            extras.lat = coords.lat;
            extras.lon = coords.lon;
          }
        }
        const resolved = await resolveFollowInput(payload.provider, payload.stationId, extras);
        const target = followTargetFromResolved(payload.provider, payload.kind, resolved);
        const again = findExistingFollow(settingsRef.current.stations, {
          stationId: target.stationId,
          provider: target.provider,
        });
        if (again) {
          reuseStation(again.id);
          return;
        }
        const blend = (resolved as { locationBlend?: FollowedStation['locationBlend'] }).locationBlend;
        await addStation(
          target.stationId,
          payload.nickname || target.sourceName || '',
          target.kind,
          {
            provider: target.provider,
            liveStationId: target.liveStationId,
            linkedLiveStation: target.linkedLiveStation,
            liveLinkWarning: target.liveLinkWarning,
            sourceName: target.sourceName,
            locationBlend: blend ?? undefined,
          },
          { fromLink: true },
        );
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Could not resolve station';
        const again = findExistingFollow(settingsRef.current.stations, {
          stationId: payload.stationId,
          provider: payload.provider,
        });
        if (again) {
          reuseStation(again.id);
          return;
        }
        await addStation(
          payload.stationId,
          payload.nickname || payload.stationId,
          payload.kind,
          {
            provider: payload.provider,
            liveLinkWarning: msg,
            sourceName: payload.address || null,
            locationBlend:
              payload.provider === 'location' && coords
                ? {
                    lat: coords.lat,
                    lon: coords.lon,
                    address: payload.address,
                    radiusKm: 50,
                    maxStations: 6,
                    members: [],
                  }
                : undefined,
          },
          { fromLink: true },
        );
      }
    } finally {
      shareBusyRef.current = false;
      endShareConsume();
    }
  }, [addStation, reuseStation]);

  const shareStation = useCallback(
    async (station: FollowedStation) => {
      const url = buildShareFollowUrl(station);
      const title = displayName(station);
      if (Platform.OS === 'web') {
        try {
          if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
            await navigator.share({ title: `Follow ${title} on Windsage`, text: title, url });
            return;
          }
        } catch (error) {
          if (error instanceof Error && error.name === 'AbortError') return;
        }
        try {
          await navigator.clipboard.writeText(url);
          showToast('Link copied');
        } catch {
          showToast('Could not copy link');
        }
        return;
      }
      try {
        await Share.share({
          message: `Follow ${title} on Windsage\n${url}`,
          url,
          title,
        });
      } catch (error) {
        if (error instanceof Error && /cancel/i.test(error.message)) return;
        showToast('Could not share link');
      }
    },
    [showToast],
  );

  useEffect(() => {
    if (!cloudWarmed) return;
    void consumeShareFollow();
  }, [cloudWarmed, shareTick, consumeShareFollow]);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const onPopState = () => {
      if (!cloudWarmedRef.current) return;
      void consumeShareFollow();
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [consumeShareFollow]);

  const persistStationList = useCallback(
    async (stations: FollowedStation[]) => {
      await persistSettings({ ...settingsRef.current, stations });
    },
    [persistSettings],
  );

  const unfollow = useCallback(
    async (station: FollowedStation) => {
      const payload = {
        ...settingsRef.current,
        stations: settingsRef.current.stations.filter((s) => s.id !== station.id),
      };
      await persistSettings(payload, {
        clearStations: payload.stations.length === 0,
        removedIds: [station.id],
        removedKeys: [{ provider: station.provider, stationId: station.stationId }],
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

  const simpleMode = settings.simpleMode !== false;
  const palette = paletteForMode(simpleMode);
  const howtoScreen: HowtoScreen = downloadOpen
    ? 'install'
    : accountOpen
      ? 'account'
      : activeStation
        ? 'station'
        : addOpen
          ? 'follow'
          : 'home';
  const showHowto =
    !howtoDismissed && (settings.stations.length === 0 || startedEmptyRef.current);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: palette.bg }]}>
      <StatusBar style="light" />
      {showHowto && !addOpen ? (
        <FirstTimeBanner
          screen={howtoScreen}
          simple={simpleMode}
          onDismiss={() => {
            setHowtoDismissed(true);
            void dismissHowto();
          }}
          onFollow={
            howtoScreen === 'home'
              ? () => {
                  setAddOpen(true);
                  void loadCatalog();
                }
              : undefined
          }
        />
      ) : null}
      <View style={styles.body}>
      {downloadOpen ? (
        <DownloadScreen
          onBack={closeDownload}
          onOpenMenu={() => setMenuOpen(true)}
          onDiscordAlerts={simpleMode ? undefined : () => setDiscordAlertOpen(true)}
          onOpenApp={() => {
            closeDownload();
          }}
        />
      ) : accountOpen ? (
        <AccountScreen
          simpleMode={simpleMode}
          onBack={() => setAccountOpen(false)}
          onOpenMenu={() => setMenuOpen(true)}
          simpleMode={simpleMode}
          onAuthed={(payload, opts) => void applyAccountPayload(payload, opts)}
          onLoggedOut={() => {
            setAccount(null);
            const cleared: AppSettings = {
              stations: [],
              pollIntervalMinutes: settingsRef.current.pollIntervalMinutes || 10,
              simpleMode: true,
              accountId: null,
              notifyPrefs: settingsRef.current.notifyPrefs,
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
                  ? `Saved · ${displayName(next)} · forecast alerts`
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
          shareUrl={buildShareFollowUrl(activeStation)}
          onShare={() => void shareStation(activeStation)}
          onOpenMenu={() => setMenuOpen(true)}
          onDiscordAlerts={simpleMode ? undefined : () => setDiscordAlertOpen(true)}
          discordAlertLinked={!!account?.discordAlert?.linked}
          simpleMode={simpleMode}
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
          onToggleStar={(id) => void persistStationList(toggleFollowStar(settingsRef.current.stations, id))}
          onMoveFollow={(id, delta) =>
            void persistStationList(moveFollow(settingsRef.current.stations, id, delta))
          }
          onOpenMenu={() => setMenuOpen(true)}
          showHowto={showHowto}
          onDismissHowto={() => {
            setHowtoDismissed(true);
            void dismissHowto();
          }}
          cloudStatus={cloudStatus}
          simpleMode={simpleMode}
          updateAvailable={appUpdate.available}
          onApplyUpdate={() => void applyAppUpdate()}
        />
      )}
      </View>

      <AppMenu
        visible={menuOpen}
        simpleMode={simpleMode}
        onToggleSimple={(on) => {
          if (on) {
            setWindAlarm(null);
            void stopCloudWindAlarm().catch(() => undefined);
          }
          void persistSettings({ ...settingsRef.current, simpleMode: on });
        }}
        notifyPrefs={settings.notifyPrefs}
        hasGoogleEmail={!!account?.sso?.google?.email}
        onChangeNotifyPrefs={(prefs) => {
          void persistSettings({ ...settingsRef.current, notifyPrefs: prefs });
        }}
        onNeedGoogle={() => {
          setDownloadOpen(false);
          setActiveStationId(null);
          setAccountOpen(true);
        }}
        accountLabel={
          account
            ? account.username
              ? `@${account.username}`
              : account.sso.google?.email || 'Account'
            : 'Account'
        }
        onClose={() => setMenuOpen(false)}
        onAccount={() => {
          setDownloadOpen(false);
          setActiveStationId(null);
          setAccountOpen(true);
        }}
        onInstall={openDownload}
        onUpdate={appUpdate.available ? () => void applyAppUpdate() : undefined}
        onDiscordAlerts={simpleMode ? undefined : () => setDiscordAlertOpen(true)}
        onTrevorSupport={() => setTrevorOpen(true)}
      />

      {simpleMode ? null : (
      <Pressable
        style={[styles.donateBar, { borderTopColor: palette.line }]}
        onPress={() => {
          void hapticLight();
          openWindsageKofi();
        }}
        accessibilityRole="link"
        accessibilityLabel="Support Windsage"
        accessibilityHint="Opens the Windsage Ko-fi page"
      >
        <Text style={[styles.donateBarText, { color: palette.muted }]}>Support Windsage</Text>
      </Pressable>
      )}

      <TrevorSupportSheet visible={trevorOpen} onClose={() => setTrevorOpen(false)} />
      <DiscordAlertSheet
        visible={discordAlertOpen}
        signedIn={!!account}
        onClose={() => setDiscordAlertOpen(false)}
        onSignIn={() => {
          setDownloadOpen(false);
          setActiveStationId(null);
          setAccountOpen(true);
        }}
        onUser={setAccount}
      />

      <WindAlarmOverlay alarm={windAlarm} onStop={() => void stopWindAlarmLocal()} />

      {toast ? (
        <View style={[styles.toast, { borderColor: palette.accent, backgroundColor: palette.bgLift }, simpleMode && { bottom: 20 }]}>
          <Text style={[styles.toastText, { color: palette.text }]}>{toast}</Text>
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
  body: {
    flex: 1,
  },
  donateBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
  donateLink: {
    paddingVertical: 4,
    paddingHorizontal: 2,
  },
  donateSep: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '700',
  },
  donateBarText: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  toast: {
    position: 'absolute',
    left: 20,
    right: 20,
    bottom: 56,
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
