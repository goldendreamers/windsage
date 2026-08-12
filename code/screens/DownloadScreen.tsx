import * as Haptics from 'expo-haptics';
import { useEffect, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  canPromptInstall,
  getInstallPlatform,
  isRunningAsInstalledApp,
  promptPwaInstall,
} from '../core/pwaInstall';
import { colors } from '../shared/theme';

const PUBLIC_APP = 'https://windsage.nimrod.bio/';

type Props = {
  onBack: () => void;
  onOpenApp: () => void;
};

export function DownloadScreen({ onBack, onOpenApp }: Props) {
  const [installed, setInstalled] = useState(() => isRunningAsInstalledApp());
  const [canPrompt, setCanPrompt] = useState(() => canPromptInstall());
  const [hint, setHint] = useState<string | null>(null);
  const platform = getInstallPlatform();

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const tick = () => {
      setInstalled(isRunningAsInstalledApp());
      setCanPrompt(canPromptInstall());
    };
    tick();
    const id = setInterval(tick, 800);
    return () => clearInterval(id);
  }, []);

  const installLabel =
    platform === 'ios'
      ? 'Add to Home Screen'
      : platform === 'android'
        ? 'Install on this phone'
        : 'Install Windsage';

  const installHint = installed
    ? 'Already installed on this device'
    : canPrompt
      ? 'Adds Windsage like a normal app'
      : platform === 'ios'
        ? 'Safari → Share → Add to Home Screen'
        : platform === 'android'
          ? 'Chrome menu → Install app / Add to Home screen'
          : 'Use your browser’s Install / Add to Home Screen';

  const onInstall = async () => {
    void Haptics.selectionAsync();
    if (installed) {
      setHint('Windsage is already installed. Open it from your home screen.');
      return;
    }
    if (canPrompt) {
      const outcome = await promptPwaInstall();
      if (outcome === 'accepted') {
        setInstalled(true);
        setCanPrompt(false);
        setHint('Installed. Open Windsage from your home screen.');
        return;
      }
      if (outcome === 'dismissed') {
        setHint('Install canceled. You can try again anytime.');
        return;
      }
    }
    if (platform === 'ios') {
      setHint('In Safari: tap Share, then “Add to Home Screen”, then Add.');
      return;
    }
    if (platform === 'android') {
      setHint('In Chrome: tap ⋮ → “Install app” or “Add to Home screen”.');
      return;
    }
    setHint('In your browser menu, choose Install app / Add to Home Screen.');
  };

  return (
    <ScrollView
      contentContainerStyle={styles.scroll}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <Pressable
        style={styles.back}
        onPress={() => {
          void Haptics.selectionAsync();
          onBack();
        }}
      >
        <Text style={styles.backText}>‹ Home</Text>
      </Pressable>

      <View style={styles.hero}>
        <Text style={styles.title}>Install Windsage</Text>
        <Text style={styles.sub}>
          Put the app on your phone’s home screen. No App Store or ZIP file needed.
        </Text>
      </View>

      <Pressable style={[styles.btn, styles.btnPrimary]} onPress={() => void onInstall()}>
        <Text style={styles.btnPrimaryText}>{installLabel}</Text>
        <Text style={styles.btnHintPrimary}>{installHint}</Text>
      </Pressable>

      <Pressable
        style={[styles.btn, styles.btnSecondary]}
        onPress={() => {
          void Haptics.selectionAsync();
          onOpenApp();
        }}
      >
        <Text style={styles.btnSecondaryText}>Open in browser</Text>
        <Text style={styles.btnHintSecondary}>Use the app now without installing</Text>
      </Pressable>

      {hint ? <Text style={styles.hint}>{hint}</Text> : null}

      <Text style={styles.foot}>
        After installing, open Windsage from the home-screen icon and allow notifications so wind
        alerts can reach your phone.
      </Text>
      <Text style={styles.footUrl}>{PUBLIC_APP}</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 44,
    gap: 14,
  },
  back: { alignSelf: 'flex-start', paddingVertical: 4 },
  backText: { color: colors.accent, fontSize: 16, fontWeight: '700' },
  hero: { gap: 8, marginBottom: 8 },
  title: { color: colors.text, fontSize: 32, fontWeight: '800' },
  sub: { color: colors.muted, fontSize: 16, lineHeight: 22, maxWidth: 360 },
  btn: {
    borderRadius: 16,
    paddingVertical: 22,
    paddingHorizontal: 18,
    alignItems: 'center',
    gap: 4,
  },
  btnPrimary: { backgroundColor: colors.accent },
  btnPrimaryText: { color: colors.bg, fontWeight: '800', fontSize: 18 },
  btnHintPrimary: { color: 'rgba(6, 24, 33, 0.72)', fontSize: 13, fontWeight: '600', textAlign: 'center' },
  btnSecondary: {
    backgroundColor: colors.input,
    borderWidth: 1,
    borderColor: colors.line,
  },
  btnSecondaryText: { color: colors.text, fontWeight: '800', fontSize: 18 },
  btnHintSecondary: { color: colors.muted, fontSize: 13, fontWeight: '600', textAlign: 'center' },
  hint: {
    color: colors.accent,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
  },
  foot: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 8,
  },
  footUrl: {
    color: colors.accent,
    fontSize: 13,
    fontWeight: '600',
  },
});
