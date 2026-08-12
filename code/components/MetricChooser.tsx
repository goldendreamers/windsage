import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { metricIcon } from '../shared/assets';
import { METRIC_OPTIONS } from '../shared/defaults';
import { colors } from '../shared/theme';
import type { MetricKey } from '../shared/types';

type Props = {
  value: MetricKey;
  onChange: (metric: MetricKey) => void;
};

export function MetricChooser({ value, onChange }: Props) {
  return (
    <View style={styles.chips}>
      {METRIC_OPTIONS.map((option) => {
        const active = value === option.key;
        return (
          <Pressable
            key={option.key}
            style={[styles.chip, active && styles.chipActive]}
            onPress={() => {
              void Haptics.selectionAsync();
              onChange(option.key);
            }}
          >
            <Image source={metricIcon(option.key)} style={styles.icon} contentFit="contain" />
            <Text style={[styles.chipText, active && styles.chipTextActive]}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: colors.input,
    borderWidth: 1,
    borderColor: colors.line,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  chipActive: {
    backgroundColor: colors.accentDim,
    borderColor: colors.accent,
  },
  icon: {
    width: 14,
    height: 14,
  },
  chipText: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '600',
  },
  chipTextActive: {
    color: colors.accent,
  },
});
