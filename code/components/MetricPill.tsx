import { Image } from 'expo-image';
import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { ImageSourcePropType } from 'react-native';
import { colors } from '../shared/theme';

type Props = {
  title: string;
  value: number | null | undefined;
  unit: string;
  icon: ImageSourcePropType;
  emphasize?: boolean;
};

export const MetricPill = memo(function MetricPill({
  title,
  value,
  unit,
  icon,
  emphasize,
}: Props) {
  return (
    <View style={[styles.pill, emphasize && styles.pillActive]}>
      <View style={styles.top}>
        <Image source={icon} style={styles.icon} contentFit="contain" />
        <Text style={styles.pillTitle}>{title}</Text>
      </View>
      <Text style={styles.pillValue}>{value == null ? '—' : value.toFixed(1)}</Text>
      <Text style={styles.pillUnit}>{unit}</Text>
    </View>
  );
});

const styles = StyleSheet.create({
  pill: {
    flex: 1,
    backgroundColor: colors.input,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: colors.line,
  },
  pillActive: {
    borderColor: colors.accent,
    backgroundColor: colors.accentDim,
  },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  icon: {
    width: 16,
    height: 16,
  },
  pillTitle: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: '600',
  },
  pillValue: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '700',
  },
  pillUnit: {
    color: colors.muted,
    fontSize: 14,
    marginTop: 2,
  },
});
