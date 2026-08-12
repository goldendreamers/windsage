import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import {
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { brandImages } from '../shared/assets';
import type { AlertState, CheckResult, FollowedStation, StationReading } from '../shared/types';
import type { CatalogStation } from '../shared/defaults';
import type { CloudAnnouncement } from '../core/cloud';
import { colors } from '../shared/theme';
import { BrandHero } from '../components/BrandHero';
import { AddStationModal } from '../components/AddStationModal';
import { StationCard } from '../components/StationCard';

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
      'liveStationId' | 'linkedLiveStation' | 'liveLinkWarning' | 'sourceName'
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

        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.heading}>Your follows</Text>
            <Text style={styles.sub}>
              {hasStations
                ? `${stations.length} followed · ${cloudStatus || 'cloud'}`
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

        {!hasStations ? (
          <View style={styles.empty}>
            <Image source={brandImages.station} style={styles.emptyIcon} contentFit="contain" />
            <Text style={styles.emptyTitle}>Nothing followed yet</Text>
            <Text style={styles.emptyCopy}>
              Add a Windguru spot or live station and give it a nickname. It will show here with
              live wind and your alert rule.
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

        {onOpenDownload ? (
          <Pressable
            style={styles.downloadLink}
            onPress={() => {
              void Haptics.selectionAsync();
              onOpenDownload();
            }}
          >
            <Text style={styles.downloadLinkText}>Install app</Text>
          </Pressable>
        ) : null}
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
});
