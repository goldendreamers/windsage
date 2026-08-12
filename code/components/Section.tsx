import { Image } from 'expo-image';
import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { brandImages } from '../shared/assets';
import { colors } from '../shared/theme';

export function Section({
  title,
  hint,
  icon,
  children,
  right,
}: {
  title: string;
  hint?: string;
  icon?: 'station' | 'bell' | 'wind';
  children: ReactNode;
  right?: ReactNode;
}) {
  const source =
    icon === 'station'
      ? brandImages.station
      : icon === 'bell'
        ? brandImages.bell
        : icon === 'wind'
          ? brandImages.wind
          : null;

  return (
    <View style={styles.block}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          {source ? <Image source={source} style={styles.icon} contentFit="contain" /> : null}
          <Text style={styles.sectionTitle}>{title}</Text>
        </View>
        {right}
      </View>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    backgroundColor: colors.bgLift,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.line,
    gap: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  icon: {
    width: 18,
    height: 18,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
  },
  hint: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
  },
});
