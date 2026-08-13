import { Image } from 'expo-image';
import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { brandImages } from '../shared/assets';
import { formatDuration } from '../core/alerts';
import { alertConditionLabel } from '../shared/defaults';
import { colors } from '../shared/theme';
import type { AlertState, CheckResult } from '../shared/types';

type Props = {
  result: CheckResult | null;
  alertState: AlertState | null;
  sustainedMinutes: number;
  progress: number;
  /** Alert threshold only, e.g. "15 kt" — never a live reading. */
  ruleHint?: string | null;
};

export function StatusPanel({
  result,
  alertState,
  sustainedMinutes,
  progress,
  ruleHint,
}: Props) {
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

  const thresholdText = String(ruleHint ?? '').trim() || null;
  const condition = alertConditionLabel(result?.message);
  const paused = result?.message === 'Paused';

  // Threshold stays in the headline after a check. Live kt/°C/m never replace it.
  const headline = paused
    ? `Paused · ${thresholdText || 'alerts off'}`
    : thresholdText
      ? thresholdText
      : condition || 'Waiting for first check…';

  const heldMin = Math.floor((result?.sustainedMs ?? 0) / 60000);
  const metaParts = [
    !paused && thresholdText && condition ? condition : null,
    result?.conditionMet
      ? `Held ${formatDuration(result.sustainedMs ?? 0)} of ${sustainedMinutes}m`
      : `Need ${sustainedMinutes}m steady`,
    result?.reading?.datetime || null,
  ].filter(Boolean);

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <Image
          source={result?.conditionMet ? brandImages.bell : brandImages.check}
          style={styles.icon}
          contentFit="contain"
        />
        <Text style={[styles.statusLine, { color: tone }]}>{headline}</Text>
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

      <Text style={styles.meta}>{metaParts.join(' · ')}</Text>
      {heldMin === 0 && result && !result.conditionMet && result.metricValue != null ? (
        <Text style={styles.metaQuiet}>Fires when that level holds long enough</Text>
      ) : null}
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
  metaQuiet: {
    color: colors.muted,
    fontSize: 12,
    opacity: 0.85,
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
