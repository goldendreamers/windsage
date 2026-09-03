import * as Haptics from 'expo-haptics';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { AlertState, CheckResult, FollowedStation, StationReading } from '../shared/types';
import type { CatalogStation } from '../shared/defaults';
import { colors, onAccent, paletteForMode } from '../shared/theme';
import { BrandHero } from '../components/BrandHero';
import { AddStationModal } from '../components/AddStationModal';
import { StationCard } from '../components/StationCard';
import { buildGlanceRows, glanceHeadline } from '../shared/glance';
import { isFollowStarred, organizeFollows } from '../shared/defaults';

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
      | 'rule'
    >,
  ) => void;
  onReuse: (followId: string) => void;
  catalogStations?: CatalogStation[];
  onRefresh: () => void;
  onOpenStation: (stationId: string) => void;
  onToggleStar?: (stationId: string) => void;
  onMoveFollow?: (stationId: string, delta: -1 | 1) => void;
  onOpenMenu?: () => void;
  showHowto?: boolean;
  onDismissHowto?: () => void;
  simpleMode?: boolean;
  updateAvailable?: boolean;
  onApplyUpdate?: () => void;
};

export function HomeScreen({
  stations,
  live,
  refreshing,
  addOpen,
  cloudStatus,
  onOpenAdd,
  onCloseAdd,
  onAdd,
  onReuse,
  catalogStations = [],
  onRefresh,
  onOpenStation,
  onToggleStar,
  onMoveFollow,
  onOpenMenu,
  showHowto,
  onDismissHowto,
  simpleMode = false,
  updateAvailable = false,
  onApplyUpdate,
}: Props) {
  const palette = paletteForMode(simpleMode);
  const ink = onAccent(simpleMode);
  const hasStations = stations.length > 0;
  const orderedStations = useMemo(() => organizeFollows(stations), [stations]);
  const starredCount = orderedStations.filter((s) => isFollowStarred(s)).length;
  const glanceRows = useMemo(
    () => (hasStations ? buildGlanceRows(orderedStations, live) : []),
    [hasStations, orderedStations, live],
  );
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
            tintColor={palette.accent}
          />
        }
      >
        <BrandHero hasStation={hasStations} simpleMode={simpleMode} />

        {updateAvailable && onApplyUpdate ? (
          <Pressable
            style={[styles.updateBanner, { borderColor: palette.accent, backgroundColor: palette.accentDim }]}
            onPress={() => {
              void Haptics.selectionAsync();
              onApplyUpdate();
            }}
            accessibilityRole="button"
            accessibilityLabel="Update Windsage"
          >
            <Text style={[styles.updateBannerText, { color: palette.text }]}>
              Update Windsage — latest version, no uninstall
            </Text>
          </Pressable>
        ) : null}

        {stableSourceFails > 0 ? (
          <View style={styles.sourceBanner}>
            <Text style={styles.sourceBody}>
              {simpleMode
                ? 'Couldn’t load wind. Pull down to try again.'
                : `${stableSourceFails} follow${stableSourceFails === 1 ? '' : 's'} couldn’t fetch — pull to refresh`}
            </Text>
          </View>
        ) : null}

        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.heading}>{simpleMode ? 'Your stations' : 'Your follows'}</Text>
            {simpleMode ? null : hasStations ? (
              <Text style={styles.sub}>
                {`${stations.length}${starredCount ? ` · ${starredCount} starred` : ''}${
                  cloudStatus === 'offline' || cloudStatus === 'error' ? ' · cloud down' : ''
                }`}
              </Text>
            ) : cloudStatus === 'offline' || cloudStatus === 'error' ? (
              <Text style={styles.sub}>Cloud down — follows still work</Text>
            ) : null}
          </View>
          <View style={styles.headerActions}>
            <Pressable
              style={[styles.addBtn, { backgroundColor: palette.accent }]}
              onPress={() => {
                void Haptics.selectionAsync();
                onOpenAdd();
              }}
              accessibilityRole="button"
              accessibilityLabel={simpleMode ? 'Add a station' : 'Follow a station'}
            >
              <Text style={[styles.addBtnText, { color: ink }]}>{simpleMode ? 'Add' : 'Follow'}</Text>
            </Pressable>
            <Pressable
              style={styles.menuBtn}
              onPress={() => {
                void Haptics.selectionAsync();
                onOpenMenu?.();
              }}
              accessibilityRole="button"
              accessibilityLabel="Menu"
            >
              <Text style={styles.menuBtnText}>Menu</Text>
            </Pressable>
          </View>
        </View>

        {!hasStations ? (
          <Pressable
            style={[styles.emptyCta, { backgroundColor: palette.accent }]}
            onPress={() => {
              void Haptics.selectionAsync();
              onOpenAdd();
            }}
            accessibilityRole="button"
            accessibilityLabel={simpleMode ? 'Add a Windguru station' : 'Follow a station'}
          >
            <Text style={[styles.emptyCtaText, { color: ink }]}>
              {simpleMode ? 'Add a Windguru station' : 'Follow a station'}
            </Text>
          </Pressable>
        ) : null}

        {hasStations && headline ? (
          <Pressable
            style={styles.glance}
            onPress={() => {
              const top = glanceRows[0];
              if (top) onOpenStation(top.id);
            }}
          >
            {simpleMode ? null : <Text style={styles.glanceLabel}>Right now</Text>}
            <Text style={styles.glanceHeadline} numberOfLines={2}>
              {headline}
            </Text>
            {simpleMode || glanceRows.length <= 1 ? null : (
              <Text style={styles.glanceSub} numberOfLines={2}>
                {glanceRows
                  .slice(1, 3)
                  .map((r) => r.line)
                  .join(' · ')}
              </Text>
            )}
          </Pressable>
        ) : hasStations ? (
          <View style={styles.glance}>
            {simpleMode ? null : <Text style={styles.glanceLabel}>Right now</Text>}
            <Text style={styles.glanceHeadline} numberOfLines={2}>
              {simpleMode ? 'Waiting for wind…' : 'Waiting for first readings…'}
            </Text>
          </View>
        ) : null}

        {hasStations ? (
          <View style={styles.list}>
            {orderedStations.map((station, index) => {
              const item = live[station.id];
              const prev = orderedStations[index - 1];
              const next = orderedStations[index + 1];
              const starred = isFollowStarred(station);
              const canMoveUp = !!prev && isFollowStarred(prev) === starred;
              const canMoveDown = !!next && isFollowStarred(next) === starred;
              return (
                <StationCard
                  key={station.id}
                  station={station}
                  reading={item?.reading ?? null}
                  result={item?.result ?? null}
                  alertState={item?.alertState}
                  simpleMode={simpleMode}
                  canMoveUp={canMoveUp}
                  canMoveDown={canMoveDown}
                  onPress={() => onOpenStation(station.id)}
                  onToggleStar={
                    !simpleMode && onToggleStar
                      ? () => {
                          void Haptics.selectionAsync();
                          onToggleStar(station.id);
                        }
                      : undefined
                  }
                  onMoveUp={
                    !simpleMode && onMoveFollow
                      ? () => {
                          void Haptics.selectionAsync();
                          onMoveFollow(station.id, -1);
                        }
                      : undefined
                  }
                  onMoveDown={
                    !simpleMode && onMoveFollow
                      ? () => {
                          void Haptics.selectionAsync();
                          onMoveFollow(station.id, 1);
                        }
                      : undefined
                  }
                />
              );
            })}
          </View>
        ) : null}
      </ScrollView>

      <AddStationModal
        visible={addOpen}
        onClose={onCloseAdd}
        onSave={onAdd}
        onReuse={onReuse}
        existingStations={stations}
        catalogStations={catalogStations}
        howto={showHowto}
        onDismissHowto={onDismissHowto}
        simpleMode={simpleMode}
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
  heading: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '800',
  },
  sub: {
    color: colors.muted,
    fontSize: 14,
    marginTop: 2,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  addBtn: {
    backgroundColor: colors.accent,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  addBtnText: {
    color: '#042018',
    fontWeight: '800',
    fontSize: 13,
  },
  menuBtn: {
    backgroundColor: colors.input,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: colors.line,
  },
  menuBtnText: {
    color: colors.text,
    fontWeight: '800',
    fontSize: 13,
  },
  emptyCta: {
    backgroundColor: colors.accent,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    alignItems: 'center',
  },
  emptyCtaText: {
    color: '#042018',
    fontWeight: '800',
    fontSize: 16,
  },
  list: {
    gap: 12,
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
  updateBanner: {
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  updateBannerText: {
    fontSize: 14,
    fontWeight: '800',
  },
});
