import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import {
  Linking,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useEffect, useRef, useState } from 'react';
import { brandImages } from '../shared/assets';
import type { AlertState, CheckResult, FollowedStation, StationReading } from '../shared/types';
import type { CatalogStation } from '../shared/defaults';
import type { CloudAnnouncement } from '../core/cloud';
import { isRunningAsInstalledApp } from '../core/pwaInstall';
import { colors } from '../shared/theme';
import { BrandHero } from '../components/BrandHero';
import { AddStationModal } from '../components/AddStationModal';
import { StationCard } from '../components/StationCard';
import { GithubViewLink } from '../components/GithubViewLink';
import { buildGlanceRows, glanceHeadline } from '../shared/glance';

type LiveMap = Record<
  string,
  {
    reading: StationReading | null;
    result: CheckResult | null;
    alertState?: AlertState;
  }
>;

type Props = {
  stations: FollowedStation[];
  live: LiveMap;
  refreshing: boolean;
  addOpen: boolean;
  cloudStatus?: string;
  accountLabel?: string;
  onOpenAdd: () => void;
  onCloseAdd: () => void;
  onAdd: (
    stationId: string,
    nickname: string,
    kind: FollowedStation['kind'],
    extras?: Pick<
      FollowedStation,
      | 'provider'
      | 'liveStationId'
      | 'linkedLiveStation'
      | 'liveLinkWarning'
      | 'sourceName'
      | 'locationBlend'
    >,
  ) => void;
  onReuse: (followId: string) => void;
  catalogStations?: CatalogStation[];
  onRefresh: () => void;
  onOpenStation: (stationId: string) => void;
  onOpenAccount?: () => void;
  onOpenDownload?: () => void;
  announcement?: CloudAnnouncement | null;
  onDismissAnnouncement?: () => void;
};

export function HomeScreen({
  stations,
  live,
  refreshing,
  addOpen,
  cloudStatus,
  accountLabel,
  onOpenAdd,
  onCloseAdd,
  onAdd,
  onReuse,
  catalogStations = [],
  onRefresh,
  onOpenStation,
  onOpenAccount,
  onOpenDownload,
  announcement,
  onDismissAnnouncement,
}: Props) {
  const hasStations = stations.length > 0;
  const [installedApp, setInstalledApp] = useState(() =>
    Platform.OS === 'web' ? isRunningAsInstalledApp() : true,
  );

  useEffect(() => {
    if (Platform.OS !== 'web') {
      setInstalledApp(true);
      return;
    }
    const tick = () => setInstalledApp(isRunningAsInstalledApp());
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const showInstall = !!onOpenDownload && !installedApp;
  const glanceRows = hasStations ? buildGlanceRows(stations, live) : [];
  const headline = glanceHeadline(glanceRows);
  const sourceFails = stations.filter((s) => {
    const err = live[s.id]?.alertState?.lastError;
    const hasData = !!(live[s.id]?.reading || live[s.id]?.result?.forecast);
    return !!err && !hasData;
  }).length;
  // Don't flash “source hiccup” for brief transient fetch gaps (<2s).
  const [stableSourceFails, setStableSourceFails] = useState(0);
  const failSinceRef = useRef<number | null>(null);
  useEffect(() => {
    if (sourceFails <= 0) {
      failSinceRef.current = null;
      setStableSourceFails(0);
      return;
    }
    if (failSinceRef.current == null) failSinceRef.current = Date.now();
    const elapsed = Date.now() - failSinceRef.current;
    if (elapsed >= 2000) {
      setStableSourceFails(sourceFails);
      return;
    }
    const id = setTimeout(() => setStableSourceFails(sourceFails), 2000 - elapsed);
    return () => clearTimeout(id);
  }, [sourceFails]);

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.accent}
          />
        }
      >
        <BrandHero hasStation={hasStations} />

        {announcement ? (
          <View style={styles.updateBanner}>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={styles.updateTitle}>{announcement.title}</Text>
              {announcement.body ? (
                <Text style={styles.updateBody}>{announcement.body}</Text>
              ) : null}
              {announcement.url ? (
                <Pressable
                  onPress={() => {
                    void Haptics.selectionAsync();
                    void Linking.openURL(announcement.url!);
                  }}
                >
                  <Text style={styles.updateLink}>Details / install →</Text>
                </Pressable>
              ) : null}
            </View>
            {onDismissAnnouncement ? (
              <Pressable
                style={styles.updateDismiss}
                onPress={() => {
                  void Haptics.selectionAsync();
                  onDismissAnnouncement();
                }}
              >
                <Text style={styles.updateDismissText}>Dismiss</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        {stableSourceFails > 0 ? (
          <View style={styles.sourceBanner}>
            <Text style={styles.sourceTitle}>Weather source hiccup</Text>
            <Text style={styles.sourceBody}>
              {stableSourceFails} follow{stableSourceFails === 1 ? '' : 's'} could not fetch a
              reading. Pull to refresh — other sources still work.
            </Text>
          </View>
        ) : null}

        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.heading}>Your follows</Text>
            <Text style={styles.sub}>
              {hasStations
                ? `${stations.length} followed · ${cloudStatus || 'cloud'}`
                : cloudStatus === 'offline' || cloudStatus === 'error'
                  ? 'Cloud hiccup — you can still follow stations'
                  : 'Follow spots or stations you care about'}
            </Text>
          </View>
          {onOpenAccount ? (
            <Pressable
              style={styles.accountBtn}
              onPress={() => {
                void Haptics.selectionAsync();
                onOpenAccount();
              }}
            >
              <Text style={styles.accountBtnText}>{accountLabel || 'Account'}</Text>
            </Pressable>
          ) : null}
          <Pressable
            style={styles.addBtn}
            onPress={() => {
              void Haptics.selectionAsync();
              onOpenAdd();
            }}
          >
            <Text style={styles.addBtnText}>+ Follow</Text>
          </Pressable>
        </View>

        {hasStations && headline ? (
          <Pressable
            style={styles.glance}
            onPress={() => {
              const top = glanceRows[0];
              if (top) onOpenStation(top.id);
            }}
          >
            <Text style={styles.glanceLabel}>Right now</Text>
            <Text style={styles.glanceHeadline} numberOfLines={2}>
              {headline}
            </Text>
            {glanceRows.length > 1 ? (
              <Text style={styles.glanceSub} numberOfLines={2}>
                {glanceRows
                  .slice(1, 3)
                  .map((r) => r.line)
                  .join(' · ')}
              </Text>
            ) : null}
          </Pressable>
        ) : hasStations ? (
          <View style={styles.glance}>
            <Text style={styles.glanceLabel}>Right now</Text>
            <Text style={styles.glanceHeadline} numberOfLines={2}>
              Waiting for first readings…
            </Text>
            <Text style={styles.glanceSub} numberOfLines={2}>
              Cloud is fetching your follows — pull to refresh if this sticks.
            </Text>
          </View>
        ) : null}

        {!hasStations ? (
          <View style={styles.empty}>
            <Image source={brandImages.station} style={styles.emptyIcon} contentFit="contain" />
            <Text style={styles.emptyTitle}>Nothing followed yet</Text>
            <Text style={styles.emptyCopy}>
              Follow Windguru, NDBC buoys, Open-Meteo points, and more. Name them and get notified
              when your conditions hold.
            </Text>
            <Pressable style={styles.emptyCta} onPress={onOpenAdd}>
              <Text style={styles.emptyCtaText}>Follow your first spot</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.list}>
            {stations.map((station) => {
              const item = live[station.id];
              return (
                <StationCard
                  key={station.id}
                  station={station}
                  reading={item?.reading ?? null}
                  result={item?.result ?? null}
                  alertState={item?.alertState}
                  onPress={() => onOpenStation(station.id)}
                />
              );
            })}
          </View>
        )}

        {showInstall ? (
          <Pressable
            style={styles.downloadLink}
            onPress={() => {
              void Haptics.selectionAsync();
              onOpenDownload?.();
            }}
          >
            <Text style={styles.downloadLinkText}>Install app</Text>
          </Pressable>
        ) : null}
        <GithubViewLink />
      </ScrollView>

      <AddStationModal
        visible={addOpen}
        onClose={onCloseAdd}
        onSave={onAdd}
        onReuse={onReuse}
        existingStations={stations}
        catalogStations={catalogStations}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  scroll: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 44,
    gap: 14,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  updateBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    backgroundColor: colors.accentDim,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.accent,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  updateTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '800',
  },
  updateBody: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
  },
  updateLink: {
    color: colors.accent,
    fontSize: 13,
    fontWeight: '700',
    marginTop: 2,
  },
  updateDismiss: {
    paddingVertical: 2,
    paddingHorizontal: 4,
  },
  updateDismissText: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '700',
  },
  heading: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '800',
  },
  sub: {
    color: colors.muted,
    fontSize: 13,
    marginTop: 2,
  },
  addBtn: {
    backgroundColor: colors.accentDim,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: colors.accent,
  },
  addBtnText: {
    color: colors.accent,
    fontWeight: '800',
    fontSize: 13,
  },
  accountBtn: {
    backgroundColor: colors.input,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: colors.line,
    maxWidth: 120,
  },
  accountBtnText: {
    color: colors.text,
    fontWeight: '700',
    fontSize: 12,
  },
  list: {
    gap: 12,
  },
  empty: {
    backgroundColor: colors.bgLift,
    borderRadius: 18,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'flex-start',
    gap: 8,
  },
  emptyIcon: {
    width: 28,
    height: 28,
    marginBottom: 4,
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '800',
  },
  emptyCopy: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
  },
  emptyCta: {
    marginTop: 8,
    backgroundColor: colors.accent,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  emptyCtaText: {
    color: '#042018',
    fontWeight: '800',
  },
  downloadLink: {
    alignSelf: 'center',
    marginTop: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  downloadLinkText: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '600',
  },
  glance: {
    backgroundColor: colors.bgLift,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 4,
  },
  glanceLabel: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  glanceHeadline: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '800',
    lineHeight: 22,
  },
  glanceSub: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 2,
  },
  sourceBanner: {
    backgroundColor: colors.warnDim,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.warn,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 4,
  },
  sourceTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '800',
  },
  sourceBody: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
  },
});
