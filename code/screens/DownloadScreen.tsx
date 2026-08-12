import * as Haptics from 'expo-haptics';
import { Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Section } from '../components/Section';
import { colors } from '../shared/theme';

const PUBLIC_WEB = 'https://windsage.nimrod.bio/';
const TAILNET_WEB = 'https://windsage.taild8a1d4.ts.net/';

type Props = {
  onBack: () => void;
  onOpenApp: () => void;
};

async function openUrl(url: string) {
  try {
    await Linking.openURL(url);
  } catch {
    // ignore
  }
}

export function DownloadScreen({ onBack, onOpenApp }: Props) {
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

      <Text style={styles.title}>Get Windsage</Text>
      <Text style={styles.sub}>
        Use the live web app now, or pin it to your home screen for one-tap access. Native store
        builds are not published yet.
      </Text>

      <Section title="Open web app" icon="wind" hint="Works in any modern browser on phone or desktop.">
        <Pressable
          style={[styles.btn, styles.btnPrimary]}
          onPress={() => {
            void Haptics.selectionAsync();
            onOpenApp();
          }}
        >
          <Text style={styles.btnPrimaryText}>Open Windsage</Text>
        </Pressable>
        <Text style={styles.linkLabel}>Public</Text>
        <Pressable
          onPress={() => {
            void Haptics.selectionAsync();
            void openUrl(PUBLIC_WEB);
          }}
        >
          <Text style={styles.link}>{PUBLIC_WEB}</Text>
        </Pressable>
        <Text style={[styles.linkLabel, styles.spaced]}>Tailscale</Text>
        <Pressable
          onPress={() => {
            void Haptics.selectionAsync();
            void openUrl(TAILNET_WEB);
          }}
        >
          <Text style={styles.link}>{TAILNET_WEB}</Text>
        </Pressable>
      </Section>

      <Section
        title="Install on iPhone / iPad"
        icon="bell"
        hint="Safari only — Add to Home Screen gives you an app-like icon."
      >
        <Step n={1} text="Open the site in Safari (not Chrome)." />
        <Step n={2} text="Tap the Share button." />
        <Step n={3} text={'Tap “Add to Home Screen”, then Add.'} />
        <Step n={4} text="Launch Windsage from your home screen." />
      </Section>

      <Section
        title="Install on Android"
        icon="station"
        hint="Chrome can install the site as an app shortcut."
      >
        <Step n={1} text="Open the site in Chrome." />
        <Step n={2} text="Tap the ⋮ menu." />
        <Step n={3} text={'Choose “Install app” or “Add to Home screen”.'} />
        <Step n={4} text="Confirm — Windsage appears with your other apps." />
      </Section>

      <Section title="Native apps" icon="wind">
        <Text style={styles.body}>
          No App Store, Play Store, APK, or IPA downloads are available yet. When native builds
          ship, they will show up on this page.
        </Text>
        {Platform.OS !== 'web' ? (
          <Text style={[styles.body, styles.spaced]}>
            You are already in the Expo / native shell. Prefer the cloud-backed web app above for
            sharing with others.
          </Text>
        ) : (
          <Text style={[styles.body, styles.spaced]}>
            Developers on Tailscale can still run the Expo project with{' '}
            <Text style={styles.mono}>npm start</Text> for device testing.
          </Text>
        )}
      </Section>
    </ScrollView>
  );
}

function Step({ n, text }: { n: number; text: string }) {
  return (
    <View style={styles.step}>
      <View style={styles.stepBadge}>
        <Text style={styles.stepNum}>{n}</Text>
      </View>
      <Text style={styles.stepText}>{text}</Text>
    </View>
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
  title: { color: colors.text, fontSize: 28, fontWeight: '800' },
  sub: { color: colors.muted, fontSize: 14, lineHeight: 20 },
  btn: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  btnPrimary: { backgroundColor: colors.accent },
  btnPrimaryText: { color: colors.bg, fontWeight: '800', fontSize: 15 },
  linkLabel: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '700',
    marginTop: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  link: {
    color: colors.accent,
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 20,
  },
  spaced: { marginTop: 8 },
  body: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
  },
  mono: {
    color: colors.text,
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
    fontSize: 13,
  },
  step: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginTop: 4,
  },
  stepBadge: {
    width: 24,
    height: 24,
    borderRadius: 8,
    backgroundColor: colors.accentDim,
    borderWidth: 1,
    borderColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  stepNum: {
    color: colors.accent,
    fontSize: 12,
    fontWeight: '800',
  },
  stepText: {
    flex: 1,
    color: colors.text,
    fontSize: 14,
    lineHeight: 20,
  },
});
