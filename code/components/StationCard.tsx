import { Image } from 'expo-image';
import { Fragment, memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { brandImages } from '../shared/assets';
import {
  alertThresholdDisplay,
  displayName,
  homeLiveStatColumns,
  stationNick,
} from '../shared/defaults';
import { PROVIDER_META, normalizeProvider } from '../shared/providers';
import { colors } from '../shared/theme';
import type { AlertState, CheckResult, FollowedStation, StationReading } from '../shared/types';

type Props = {
  station: FollowedStation;
  reading: StationReading | null;
  result: CheckResult | null;
  alertState?: AlertState;
  onPress: () => void;
};

export const StationCard = memo(function StationCard({
  station,
  reading,
  result,
  alertState,
  onPress,
}: Props) {
  const name = displayName(station);
  const hasNickname = !!stationNick(station);
  const provider = normalizeProvider(station.provider);
  const providerShort = PROVIDER_META[provider]?.short || 'WG';
  const forecastOnly = !!(station.linkedLiveStation || station.liveLinkWarning);
  const displayReading =
    forecastOnly && result?.forecast ? result.forecast : reading;
  const showingForecast = forecastOnly && !!result?.forecast;
  const holding = !!result?.conditionMet;
  const errored = !!alertState?.lastError && !reading && !result?.forecast;
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

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        pressed && styles.cardPressed,
        station.enabled === false && styles.cardPaused,
      ]}
    >
      <View style={styles.topRow}>
        <View style={styles.identity}>
          <Image source={brandImages.station} style={styles.icon} contentFit="contain" />
          <View style={styles.titles}>
            <Text style={styles.nickname} numberOfLines={1}>
              {name}
              {trend ? ` ${trend}` : ''}
            </Text>
            <Text style={styles.meta} numberOfLines={2}>
              {providerShort} ·{' '}
              {hasNickname
                ? `${station.kind === 'spot' ? 'Spot' : 'Station'} #${station.stationId}`
                : station.kind === 'spot'
                  ? 'spot'
                  : 'station'}
              {station.enabled === false ? ' · paused' : ''}
              {showingForecast
                ? ` · forecast${result?.forecastModel ? ` (${result.forecastModel})` : ''}`
                : ''}
              {forecastOnly && station.linkedLiveStation
                ? ` · alerts via #${station.linkedLiveStation.id}`
                : ''}
            </Text>
            {station.liveLinkWarning && station.linkedLiveStation ? (
              <Text style={styles.warn} numberOfLines={2}>
                {station.liveLinkWarning}
              </Text>
            ) : null}
          </View>
        </View>
        <Text style={styles.chevron}>›</Text>
      </View>

      <View style={styles.stats}>
        {liveCols.map((col, index) => (
          <Fragment key={`${col.label}-${index}`}>
            {index > 0 ? <View style={styles.divider} /> : null}
            <View style={styles.stat}>
              <Text style={styles.statLabel}>{col.label}</Text>
              <Text style={styles.statValue}>{col.value}</Text>
              <Text style={styles.statUnit}>{col.unit}</Text>
            </View>
          </Fragment>
        ))}
        <View style={styles.divider} />
        <View style={styles.stat}>
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
        </View>
      </View>
    </Pressable>
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
  cardPressed: {
    opacity: 0.88,
    borderColor: colors.accent,
  },
  cardPaused: {
    opacity: 0.72,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
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
    fontSize: 12,
  },
  warn: {
    color: '#E8B84A',
    fontSize: 11,
    lineHeight: 14,
    marginTop: 2,
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
    borderWidth: 1,
    borderColor: colors.line,
  },
  stat: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  divider: {
    width: 1,
    backgroundColor: colors.line,
    marginVertical: 2,
  },
  statLabel: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '600',
  },
  statValue: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '700',
  },
  statUnit: {
    color: colors.muted,
    fontSize: 11,
  },
  statusHold: {
    color: colors.accent,
  },
  statusError: {
    color: colors.danger,
  },
});
