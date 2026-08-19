import * as Haptics from 'expo-haptics';
import { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  canPromptInstall,
  getInstallPlatform,
  installWindsage,
  isRunningAsInstalledApp,
  type InstallOutcome,
} from '../core/pwaInstall';
import { colors } from '../shared/theme';

const PUBLIC_APP = 'https://windsage.nimrod.bio/';

type Props = {
  onBack: () => void;
  onOpenApp: () => void;
  onOpenMenu?: () => void;
};

function hintFor(outcome: InstallOutcome, platform: ReturnType<typeof getInstallPlatform>): string {
  if (outcome === 'installed') return 'Windsage is already installed. Open it from your home screen.';
  if (outcome === 'accepted') return 'Installed. Open Windsage from your home screen.';
  if (outcome === 'dismissed') return 'Install canceled. Tap Download to try again.';
  if (outcome === 'downloaded') {
    if (platform === 'ios') {
      return 'Download started. Open the Windsage profile, then Install, to put the app on your Home Screen.';
    }
    if (platform === 'android') return 'Download started. Open the file to install Windsage.';
    return 'Download started.';
  }
  return 'Couldn’t start a download in this browser. Open windsage.nimrod.bio in Chrome and tap Download again.';
}

export function DownloadScreen({ onBack, onOpenApp, onOpenMenu }: Props) {
  const [installed, setInstalled] = useState(() => isRunningAsInstalledApp());
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const started = useRef(false);
  const platform = getInstallPlatform();

  const runInstall = async () => {
    if (installed || busy) return;
    setBusy(true);
    setHint(null);
    try {
      const outcome = await installWindsage();
      if (outcome === 'accepted' || outcome === 'installed') setInstalled(true);
      setHint(hintFor(outcome, platform));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    if (isRunningAsInstalledApp()) {
      setInstalled(true);
      return;
    }
    if (started.current) return;
    started.current = true;
    void Haptics.selectionAsync();
    void runInstall();
    // One auto-download when this screen opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const installHint = installed
    ? 'Already on this device'
    : busy
      ? 'Starting download…'
      : canPromptInstall()
        ? 'Saves Windsage like a normal app'
        : 'Downloads the app onto this phone';

  return (
    <ScrollView
      contentContainerStyle={styles.scroll}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.navRow}>
        <Pressable
          style={styles.back}
          onPress={() => {
            void Haptics.selectionAsync();
            onBack();
          }}
        >
          <Text style={styles.backText}>‹ Home</Text>
        </Pressable>
        {onOpenMenu ? (
          <Pressable
            style={styles.menuBtn}
            onPress={() => {
              void Haptics.selectionAsync();
              onOpenMenu();
            }}
            accessibilityRole="button"
            accessibilityLabel="Menu"
          >
            <Text style={styles.menuBtnText}>Menu</Text>
          </Pressable>
        ) : null}
      </View>

      <View style={styles.hero}>
        <Text style={styles.title}>Install Windsage</Text>
        <Text style={styles.sub}>Downloads the app onto this phone.</Text>
      </View>

      {!installed ? (
        <>
          <Pressable
            style={[styles.btn, styles.btnPrimary, busy && styles.primaryDisabled]}
            onPress={() => {
              void Haptics.selectionAsync();
              void runInstall();
            }}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel="Download Windsage"
          >
            <Text style={styles.btnPrimaryText}>{busy ? 'Downloading…' : 'Download Windsage'}</Text>
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
          </Pressable>
        </>
      ) : (
        <Pressable
          style={[styles.btn, styles.btnSecondary]}
          onPress={() => {
            void Haptics.selectionAsync();
            onOpenApp();
          }}
        >
          <Text style={styles.btnSecondaryText}>Back to home</Text>
        </Pressable>
      )}

      {hint ? <Text style={styles.hint}>{hint}</Text> : null}

      <Text style={styles.foot}>
        After it lands on the home screen: open that icon, allow notifications, Android battery
        unrestricted for Windsage and Chrome.
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
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  back: { alignSelf: 'flex-start', paddingVertical: 4 },
  backText: { color: colors.accent, fontSize: 16, fontWeight: '700' },
  menuBtn: {
    backgroundColor: colors.input,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: colors.line,
  },
  menuBtnText: {
    color: colors.text,
    fontWeight: '800',
    fontSize: 13,
  },
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
  primaryDisabled: { opacity: 0.7 },
  btnPrimaryText: { color: colors.bg, fontWeight: '800', fontSize: 18 },
  btnHintPrimary: { color: 'rgba(6, 24, 33, 0.72)', fontSize: 13, fontWeight: '600', textAlign: 'center' },
  btnSecondary: {
    backgroundColor: colors.input,
    borderWidth: 1,
    borderColor: colors.line,
  },
  btnSecondaryText: { color: colors.text, fontWeight: '800', fontSize: 18 },
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
