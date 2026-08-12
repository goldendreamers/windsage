import { Image } from 'expo-image';
import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { brandImages } from '../shared/assets';
import { formatDuration } from '../core/alerts';
import { colors } from '../shared/theme';
import type { AlertState, CheckResult } from '../shared/types';

type Props = {
  result: CheckResult | null;
  alertState: AlertState | null;
  sustainedMinutes: number;
  progress: number;
};

export function StatusPanel({ result, alertState, sustainedMinutes, progress }: Props) {
  const width = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(width, {
      toValue: progress,
      duration: 450,
      useNativeDriver: false,
    }).start();
  }, [progress, width]);

  const tone = !result
    ? colors.muted
    : result.shouldNotify || (result.conditionMet && progress >= 1)
      ? colors.warn
      : result.conditionMet
        ? colors.accent
        : colors.muted;

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <Image
          source={result?.conditionMet ? brandImages.bell : brandImages.check}
          style={styles.icon}
          contentFit="contain"
        />
        <Text style={[styles.statusLine, { color: tone }]}>
          {result?.message ?? 'No check yet — add a station to begin'}
        </Text>
      </View>

      <View style={styles.progressTrack}>
        <Animated.View
          style={[
            styles.progressFill,
            {
              backgroundColor: tone === colors.muted ? colors.accent : tone,
              width: width.interpolate({
                inputRange: [0, 1],
                outputRange: ['0%', '100%'],
              }),
            },
          ]}
        />
      </View>

      <Text style={styles.meta}>
        Held {formatDuration(result?.sustainedMs ?? 0)} · need {sustainedMinutes}m
        {result?.reading?.datetime ? ` · ${result.reading.datetime}` : ''}
      </Text>
      {alertState?.lastError ? <Text style={styles.errorText}>{alertState.lastError}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 8,
    marginTop: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  icon: {
    width: 18,
    height: 18,
    marginTop: 2,
  },
  statusLine: {
    flex: 1,
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '600',
  },
  meta: {
    color: colors.muted,
    fontSize: 12,
  },
  errorText: {
    color: colors.danger,
    fontSize: 13,
  },
  progressTrack: {
    height: 8,
    borderRadius: 99,
    backgroundColor: colors.input,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
  },
});
