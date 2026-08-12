import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { brandImages } from '../shared/assets';
import { colors } from '../shared/theme';

export function BootScreen() {
  const pulse = useRef(new Animated.Value(0.92)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 900,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0.92,
          duration: 900,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  return (
    <View style={styles.root}>
      <LinearGradient colors={['#083041', colors.bg, '#031017']} style={StyleSheet.absoluteFill} />
      <Animated.View style={{ transform: [{ scale: pulse }] }}>
        <Image source={brandImages.bootMark} style={styles.mark} contentFit="contain" />
      </Animated.View>
      <Text style={styles.title}>Windsage</Text>
      <Text style={styles.sub}>Reading the wind…</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  mark: {
    width: 128,
    height: 128,
  },
  title: {
    color: colors.text,
    fontSize: 30,
    fontWeight: '800',
    letterSpacing: 0.6,
    marginTop: 8,
  },
  sub: {
    color: colors.muted,
    fontSize: 14,
  },
});
