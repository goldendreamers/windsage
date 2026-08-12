import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { brandImages } from '../shared/assets';
import { colors, space } from '../shared/theme';

export function BrandHero({ hasStation }: { hasStation: boolean }) {
  const drift = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(drift, {
        toValue: 1,
        duration: 10000,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [drift]);

  const translateX = drift.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -18],
  });

  return (
    <View style={styles.wrap}>
      <View style={styles.imageClip}>
        <Animated.View style={[styles.imageShift, { transform: [{ translateX }] }]}>
          <Image
            source={brandImages.emptyHero}
            style={styles.image}
            contentFit="cover"
            transition={400}
          />
        </Animated.View>
        <LinearGradient
          colors={['rgba(6,24,33,0.15)', 'rgba(6,24,33,0.55)', colors.bg]}
          locations={[0, 0.55, 1]}
          style={StyleSheet.absoluteFill}
        />
      </View>

      <View style={styles.copy}>
        <View style={styles.brandRow}>
          <Image source={brandImages.mark} style={styles.mark} contentFit="contain" />
          <Text style={styles.brand}>Windsage</Text>
        </View>
        <Text style={styles.tagline}>
          {hasStation
            ? 'Your followed stations live here. Wald watches Windguru so your phone can sleep.'
            : 'Follow Windguru stations, name them, and get notified when conditions hold.'}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginHorizontal: -20,
    marginTop: -8,
    marginBottom: 4,
  },
  imageClip: {
    height: 210,
    overflow: 'hidden',
  },
  imageShift: {
    width: '112%',
    height: '100%',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  copy: {
    paddingHorizontal: 20,
    marginTop: -54,
    gap: 8,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  mark: {
    width: 42,
    height: 42,
  },
  brand: {
    color: colors.text,
    fontSize: 34,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  tagline: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: 22,
    maxWidth: 340,
    marginBottom: space.xs,
  },
});
