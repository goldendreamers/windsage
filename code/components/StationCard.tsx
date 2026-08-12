import { Image } from 'expo-image';
import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { brandImages } from '../shared/assets';
import { displayName } from '../shared/defaults';
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
  const hasNickname = !!station.nickname.trim();
  const wind = reading?.wind_avg;
  const gust = reading?.wind_max;
  const holding = !!result?.conditionMet;
  const errored = !!alertState?.lastError && !reading;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed, !station.enabled && styles.cardPaused]}
    >
      <View style={styles.topRow}>
        <View style={styles.identity}>
          <Image source={brandImages.station} style={styles.icon} contentFit="contain" />
          <View style={styles.titles}>
            <Text style={styles.nickname} numberOfLines={1}>
              {name}
            </Text>
            <Text style={styles.meta} numberOfLines={1}>
              {hasNickname
                ? `${station.kind === 'spot' ? 'Spot' : 'Station'} #${station.stationId}`
                : station.kind === 'spot'
                  ? 'Windguru spot'
                  : 'Windguru station'}
              {station.enabled ? '' : ' · paused'}
            </Text>
          </View>
        </View>
        <Text style={styles.chevron}>›</Text>
      </View>

      <View style={styles.stats}>
        <View style={styles.stat}>
          <Text style={styles.statLabel}>Avg</Text>
          <Text style={styles.statValue}>{wind == null ? '—' : wind.toFixed(1)}</Text>
          <Text style={styles.statUnit}>kt</Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.stat}>
          <Text style={styles.statLabel}>Gust</Text>
          <Text style={styles.statValue}>{gust == null ? '—' : gust.toFixed(1)}</Text>
          <Text style={styles.statUnit}>kt</Text>
        </View>
        <View style={styles.divider} />
        <View style={[styles.stat, styles.statWide]}>
          <Text style={styles.statLabel}>Alert</Text>
          <Text
            style={[
              styles.statusText,
              holding ? styles.statusHold : errored ? styles.statusError : styles.statusIdle,
            ]}
            numberOfLines={2}
          >
            {errored
              ? alertState?.lastError
              : result?.message ??
                `${station.rule.comparison === 'gte' ? '≥' : '≤'}${station.rule.threshold} ${
                  station.rule.metric === 'temperature'
                    ? '°C'
                    : station.rule.metric === 'wave_height'
                      ? 'm'
                      : 'kt'
                } / ${station.rule.sustainedMinutes}m`}
          </Text>
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
  statWide: {
    flex: 1.6,
    alignItems: 'flex-start',
    paddingHorizontal: 6,
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
  statusText: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600',
    marginTop: 2,
  },
  statusIdle: {
    color: colors.muted,
  },
  statusHold: {
    color: colors.accent,
  },
  statusError: {
    color: colors.danger,
  },
});
