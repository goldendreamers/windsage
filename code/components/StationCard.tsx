import { Image } from 'expo-image';
import { Fragment, memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { brandImages } from '../shared/assets';
import {
  alertThresholdDisplay,
  displayName,
  followSourceRef,
  homeLiveStatColumns,
  isFollowStarred,
  monitoringScheduleSummary,
} from '../shared/defaults';
import { PROVIDER_META, normalizeProvider } from '../shared/providers';
import { colors } from '../shared/theme';
import type { AlertState, CheckResult, FollowedStation, StationReading } from '../shared/types';

type Props = {
  station: FollowedStation;
  reading: StationReading | null;
  result: CheckResult | null;
  alertState?: AlertState;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
  onPress: () => void;
  onToggleStar?: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  simpleMode?: boolean;
};

export const StationCard = memo(function StationCard({
  station,
  reading,
  result,
  alertState,
  canMoveUp = false,
  canMoveDown = false,
  onPress,
  onToggleStar,
  onMoveUp,
  onMoveDown,
  simpleMode = false,
}: Props) {
  const name = displayName(station);
  const provider = normalizeProvider(station.provider);
  const providerShort = PROVIDER_META[provider]?.short || 'WG';
  const forecastOnly = station.kind === 'spot' && !!(station.linkedLiveStation || station.liveLinkWarning);
  const displayReading =
    forecastOnly && result?.forecast ? result.forecast : reading;
  const showingForecast = forecastOnly && !!result?.forecast;
  const holding = !!result?.conditionMet;
  const errored = !!alertState?.lastError && !reading && !result?.forecast;
  const starred = isFollowStarred(station);
  const prev = alertState?.lastValue;
  const cur =
    result?.metricValue ??
    (station.rule.metric === 'wind_max'
      ? displayReading?.wind_max
      : station.rule.metric === 'temperature'
        ? displayReading?.temperature
        : station.rule.metric === 'wave_height'
          ? displayReading?.wave_height
          : displayReading?.wind_avg);
  const trend =
    prev != null && cur != null && Number.isFinite(prev) && Number.isFinite(cur)
      ? Math.abs(cur - prev) < 0.3
        ? '→'
        : cur > prev
          ? '↑'
          : '↓'
      : '';

  const liveCols = homeLiveStatColumns(station.rule.metric, displayReading, showingForecast);
  const alertCol = alertThresholdDisplay(station.rule);
  const monitor = monitoringScheduleSummary(station);

  return (
    <View
      style={[
        styles.card,
        !monitor.on && styles.cardPaused,
        starred && styles.cardStarred,
      ]}
    >
      <View style={styles.topRow}>
        {onToggleStar ? (
          <Pressable
            onPress={onToggleStar}
            hitSlop={8}
            style={styles.starBtn}
            accessibilityRole="button"
            accessibilityLabel={starred ? 'Unstar follow' : 'Star follow'}
          >
            <Text style={[styles.star, starred && styles.starOn]}>{starred ? '★' : '☆'}</Text>
          </Pressable>
        ) : null}
        <Pressable onPress={onPress} style={styles.identity}>
          <Image source={brandImages.station} style={styles.icon} contentFit="contain" />
          <View style={styles.titles}>
            <Text style={styles.nickname} numberOfLines={1}>
              {name}
              {trend ? ` ${trend}` : ''}
            </Text>
            {simpleMode ? (
              monitor.homeLabel ? (
                <Text style={styles.meta}>{monitor.homeLabel}</Text>
              ) : null
            ) : (
              <>
                <Text style={styles.meta} numberOfLines={1}>
                  {`${providerShort} · ${followSourceRef(station)}${monitor.cardBit}${
                    showingForecast
                      ? ` · fcst${result?.forecastModel ? ` ${result.forecastModel}` : ''}`
                      : ''
                  }`}
                </Text>
                {!station.liveLinkWarning || !station.linkedLiveStation ? null : (
                  <Text style={styles.warn} numberOfLines={2}>
                    {station.liveLinkWarning}
                  </Text>
                )}
              </>
            )}
          </View>
        </Pressable>
        <View style={styles.reorder}>
          {onMoveUp ? (
            <Pressable
              onPress={onMoveUp}
              disabled={!canMoveUp}
              hitSlop={6}
              style={[styles.moveBtn, !canMoveUp && styles.moveBtnOff]}
              accessibilityRole="button"
              accessibilityLabel="Move up"
            >
              <Text style={styles.moveText}>↑</Text>
            </Pressable>
          ) : null}
          {onMoveDown ? (
            <Pressable
              onPress={onMoveDown}
              disabled={!canMoveDown}
              hitSlop={6}
              style={[styles.moveBtn, !canMoveDown && styles.moveBtnOff]}
              accessibilityRole="button"
              accessibilityLabel="Move down"
            >
              <Text style={styles.moveText}>↓</Text>
            </Pressable>
          ) : null}
        </View>
        <Pressable onPress={onPress} hitSlop={8} accessibilityRole="button" accessibilityLabel="Open follow">
          <Text style={styles.chevron}>›</Text>
        </Pressable>
      </View>

      <Pressable onPress={onPress} style={styles.stats}>
        {liveCols.map((col, index) => (
          <Fragment key={`${col.label}-${index}`}>
            {index > 0 ? <View style={styles.divider} /> : null}
            <View style={styles.stat}>
              {simpleMode ? (
                <>
                  <Text style={[styles.statValue, styles.statValueSimple]}>
                    {col.unit ? `${col.value} ${col.unit}` : col.value}
                  </Text>
                  <Text style={[styles.statLabel, styles.statLabelSimple]}>{col.label}</Text>
                </>
              ) : (
                <>
                  <Text style={styles.statLabel}>{col.label}</Text>
                  <Text style={styles.statValue}>{col.value}</Text>
                  <Text style={styles.statUnit}>{col.unit}</Text>
                </>
              )}
            </View>
          </Fragment>
        ))}
        <View style={styles.divider} />
        <View style={styles.stat}>
          {simpleMode ? (
            <>
              <Text
                style={[
                  styles.statValue,
                  styles.statValueSimple,
                  holding ? styles.statusHold : errored ? styles.statusError : null,
                ]}
              >
                {errored ? '—' : alertCol.unit ? `${alertCol.value} ${alertCol.unit}` : alertCol.value}
              </Text>
              <Text style={[styles.statLabel, styles.statLabelSimple]}>Ping</Text>
            </>
          ) : (
            <>
              <Text style={styles.statLabel}>Alert</Text>
              <Text
                style={[
                  styles.statValue,
                  holding ? styles.statusHold : errored ? styles.statusError : null,
                ]}
              >
                {errored ? '—' : alertCol.value}
              </Text>
              <Text style={styles.statUnit}>{alertCol.unit}</Text>
            </>
          )}
        </View>
      </Pressable>
    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.bgLift,
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.line,
    gap: 12,
  },
  cardPaused: {
    opacity: 0.72,
  },
  cardStarred: {
    borderColor: 'rgba(46, 196, 168, 0.45)',
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  starBtn: {
    width: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  star: {
    color: colors.muted,
    fontSize: 22,
    lineHeight: 26,
  },
  starOn: {
    color: colors.accent,
  },
  identity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  icon: {
    width: 22,
    height: 22,
  },
  titles: {
    flex: 1,
    gap: 2,
  },
  nickname: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  meta: {
    color: colors.muted,
    fontSize: 14,
  },
  warn: {
    color: '#E8B84A',
    fontSize: 11,
    lineHeight: 14,
    marginTop: 2,
  },
  reorder: {
    gap: 2,
  },
  moveBtn: {
    width: 28,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: colors.input,
  },
  moveBtnOff: {
    opacity: 0.28,
  },
  moveText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 16,
  },
  chevron: {
    color: colors.muted,
    fontSize: 28,
    fontWeight: '300',
    marginTop: -4,
  },
  stats: {
    flexDirection: 'row',
    alignItems: 'stretch',
    backgroundColor: colors.input,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 8,
    gap: 0,
  },
  divider: {
    width: 1,
    backgroundColor: colors.line,
    marginVertical: 2,
  },
  stat: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  statLabel: {
    color: colors.muted,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  statLabelSimple: {
    fontSize: 13,
    letterSpacing: 0,
    textTransform: 'none',
    fontWeight: '600',
  },
  statValue: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '800',
  },
  statValueSimple: {
    fontSize: 20,
  },
  statUnit: {
    color: colors.muted,
    fontSize: 10,
  },
  statusHold: {
    color: colors.accent,
  },
  statusError: {
    color: colors.danger,
  },
});
