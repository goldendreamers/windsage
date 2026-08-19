import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '../shared/theme';

export type HowtoScreen = 'home' | 'follow' | 'station' | 'install' | 'account';

const HOWTO_DISMISS_KEY = 'windsage.howto.dismissed.v1';

export async function getHowtoDismissed(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(HOWTO_DISMISS_KEY)) === '1';
  } catch {
    return false;
  }
}

export async function dismissHowto(): Promise<void> {
  await AsyncStorage.setItem(HOWTO_DISMISS_KEY, '1');
}

const STEPS: { id: Exclude<HowtoScreen, 'home'>; n: number; short: string; hint: string }[] = [
  {
    id: 'follow',
    n: 1,
    short: 'Follow',
    hint: 'Menu → Follow a station — Windguru, map pin, NDBC, Open-Meteo, or airport code',
  },
  {
    id: 'station',
    n: 2,
    short: 'Alert',
    hint: 'Open the station and set when to notify (wind, gust, temp, or waves)',
  },
  {
    id: 'install',
    n: 3,
    short: 'Install',
    hint: 'Menu → Install app — downloads Windsage onto this phone',
  },
  {
    id: 'account',
    n: 4,
    short: 'Account',
    hint: 'Menu → Account to sync this list on another phone',
  },
];

const SIMPLE_STEPS: typeof STEPS = [
  {
    id: 'follow',
    n: 1,
    short: 'Add',
    hint: 'Tap Add a station and paste the number from the Windguru station page',
  },
  {
    id: 'station',
    n: 2,
    short: 'Ping',
    hint: 'Open the station and pick when to ping you',
  },
  {
    id: 'account',
    n: 3,
    short: 'Sign in',
    hint: 'Menu → Sign in if you want this list on another phone',
  },
];

function stepsFor(simple?: boolean) {
  return simple ? SIMPLE_STEPS : STEPS;
}

function activeStep(screen: HowtoScreen, simple?: boolean) {
  const steps = stepsFor(simple);
  if (screen === 'home') return steps[0];
  return steps.find((s) => s.id === screen) || steps[0];
}

type Props = {
  screen: HowtoScreen;
  embedded?: boolean;
  simple?: boolean;
  onDismiss?: () => void;
  onFollow?: () => void;
};

export function FirstTimeBanner({ screen, embedded, simple, onDismiss, onFollow }: Props) {
  const steps = stepsFor(simple);
  const current = activeStep(screen, simple);
  const showFollow = screen === 'home' && !!onFollow;

  return (
    <View style={[styles.wrap, embedded && styles.wrapEmbedded]} accessibilityRole="summary">
      <View style={styles.top}>
        <Text style={styles.title}>{simple ? 'How this works' : 'First time here'}</Text>
        {onDismiss ? (
          <Pressable
            onPress={() => {
              void Haptics.selectionAsync();
              onDismiss();
            }}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Dismiss first-time guide"
          >
            <Text style={styles.dismiss}>Dismiss</Text>
          </Pressable>
        ) : null}
      </View>
      <View style={styles.pills}>
        {steps.map((step) => {
          const on = step.id === current.id;
          return (
            <Text key={step.id} style={[styles.pill, on && styles.pillOn]}>
              {step.n} {step.short}
            </Text>
          );
        })}
      </View>
      <Text style={styles.hint}>{current.hint}</Text>
      {showFollow ? (
        <Pressable
          style={styles.cta}
          onPress={() => {
            void Haptics.selectionAsync();
            onFollow?.();
          }}
        >
          <Text style={styles.ctaText}>{simple ? 'Add a station' : 'Follow your first spot'}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: colors.accentDim,
    borderBottomWidth: 1,
    borderBottomColor: colors.accent,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 12,
    gap: 6,
  },
  wrapEmbedded: {
    borderWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.accent,
    borderRadius: 12,
    paddingHorizontal: 12,
    marginBottom: 4,
  },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  title: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '800',
  },
  dismiss: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '700',
  },
  pills: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  pill: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '700',
  },
  pillOn: {
    color: colors.accent,
  },
  hint: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 16,
  },
  cta: {
    alignSelf: 'flex-start',
    marginTop: 4,
    backgroundColor: colors.accent,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  ctaText: {
    color: '#042018',
    fontWeight: '800',
    fontSize: 13,
  },
});
