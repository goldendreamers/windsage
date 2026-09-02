import * as Haptics from 'expo-haptics';
import { useEffect, useState } from 'react';
import {
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { openDeveloperEmail, openWindsageKofi } from '../core/contact';
import {
  normalizeNotifyPrefs,
  notifyPrefsSummary,
  type NotifyHow,
  type NotifyPrefs,
  type NotifyPreset,
} from '../shared/defaults';
import { colors, paletteForMode } from '../shared/theme';

const PRIVACY_URL = 'https://windsage.nimrod.bio/privacy.html';

type MenuSection = 'main' | 'about' | 'alerts';

type Row = { key: string; label: string; sub?: string; onPress: () => void };

type Props = {
  visible: boolean;
  accountLabel?: string;
  simpleMode?: boolean;
  onToggleSimple?: (on: boolean) => void;
  onClose: () => void;
  onAccount?: () => void;
  onInstall?: () => void;
  onUpdate?: () => void;
  notifyPrefs?: NotifyPrefs;
  hasGoogleEmail?: boolean;
  onChangeNotifyPrefs?: (prefs: NotifyPrefs) => void;
  onNeedGoogle?: () => void;
};

export function AppMenu({
  visible,
  accountLabel,
  simpleMode = false,
  onToggleSimple,
  onClose,
  onAccount,
  onInstall,
  onUpdate,
  notifyPrefs,
  hasGoogleEmail = false,
  onChangeNotifyPrefs,
  onNeedGoogle,
}: Props) {
  const [section, setSection] = useState<MenuSection>('main');
  const palette = paletteForMode(simpleMode);
  const prefs = normalizeNotifyPrefs(notifyPrefs);

  useEffect(() => {
    if (!visible) setSection('main');
  }, [visible]);

  const run = (fn: () => void) => {
    void Haptics.selectionAsync();
    onClose();
    fn();
  };

  const openAbout = () => {
    void Haptics.selectionAsync();
    setSection('about');
  };

  const youRows: Row[] = [];
  if (onAccount) {
    youRows.push({
      key: 'account',
      label: simpleMode ? 'Sign in' : 'Account',
      sub:
        accountLabel && accountLabel !== 'Account'
          ? accountLabel
          : simpleMode
            ? undefined
            : 'Sign in or guest',
      onPress: () => run(onAccount),
    });
  }

  const appRows: Row[] = [];
  if (onInstall) {
    appRows.push({
      key: 'install',
      label: simpleMode ? 'Put on home screen' : 'Install app',
      sub: simpleMode ? undefined : 'Downloads the app onto this phone',
      onPress: () => run(onInstall),
    });
  }
  if (onUpdate) {
    appRows.push({
      key: 'update',
      label: 'Update Windsage',
      sub: simpleMode ? undefined : 'Gets the latest without deleting the app',
      onPress: () => run(onUpdate),
    });
  }

  const aboutRows: Row[] = [
    {
      key: 'support',
      label: 'Support Windsage',
      sub: simpleMode ? undefined : 'Keeps the app running',
      onPress: () => run(openWindsageKofi),
    },
  ];
  if (!simpleMode) {
    aboutRows.push({
      key: 'email',
      label: 'Email the developer',
      sub: 'Opens Gmail',
      onPress: () => run(openDeveloperEmail),
    });
  }
  aboutRows.push({
    key: 'privacy',
    label: 'Privacy',
    onPress: () =>
      run(() => {
        const url =
          typeof window !== 'undefined' && window.location?.origin
            ? `${window.location.origin}/privacy.html`
            : PRIVACY_URL;
        void Linking.openURL(url);
      }),
  });

  const renderRows = (rows: Row[]) =>
    rows.map((row) => (
      <Pressable
        key={row.key}
        style={styles.row}
        onPress={row.onPress}
        accessibilityRole="button"
        accessibilityLabel={row.label}
      >
        <View style={{ flex: 1 }}>
          <Text style={styles.label}>{row.label}</Text>
          {row.sub ? <Text style={styles.sub}>{row.sub}</Text> : null}
        </View>
        <Text style={styles.chevron}>›</Text>
      </Pressable>
    ));

  const setPrefs = (next: Partial<NotifyPrefs> & { preset: NotifyPreset }) => {
    if (!onChangeNotifyPrefs) return;
    void Haptics.selectionAsync();
    onChangeNotifyPrefs(normalizeNotifyPrefs({ ...prefs, ...next }));
  };

  const pickPreset = (preset: NotifyPreset) => {
    if (preset === 'quiet' && !hasGoogleEmail) {
      void Haptics.selectionAsync();
      onClose();
      onNeedGoogle?.();
      return;
    }
    if (preset === 'annoying') setPrefs({ preset, how: 'phone' });
    else if (preset === 'quiet') setPrefs({ preset, how: 'email', timesPerDay: 1 });
    else if (preset === 'normal') setPrefs({ preset, how: 'phone', timesPerDay: 1 });
    else setPrefs({ preset });
  };

  const pickHow = (how: NotifyHow) => {
    if ((how === 'email' || how === 'both') && !hasGoogleEmail) {
      void Haptics.selectionAsync();
      onClose();
      onNeedGoogle?.();
      return;
    }
    setPrefs({ preset: 'custom', how });
  };

  const bumpTimes = (delta: number) => {
    const next = Math.min(24, Math.max(1, (prefs.timesPerDay || 1) + delta));
    setPrefs({ preset: 'custom', timesPerDay: next });
  };

  const presetRow = (
    key: NotifyPreset,
    label: string,
    sub: string,
    locked?: boolean,
  ) => {
    const active = prefs.preset === key;
    return (
      <Pressable
        key={key}
        style={[styles.row, { borderTopColor: palette.line }]}
        onPress={() => pickPreset(key)}
        accessibilityRole="button"
        accessibilityLabel={label}
      >
        <View style={{ flex: 1 }}>
          <Text style={[styles.label, { color: palette.text }]}>{label}</Text>
          <Text style={[styles.sub, { color: palette.muted }]}>{sub}</Text>
        </View>
        <Text style={[styles.check, { color: active ? palette.accent : palette.muted }]}>
          {locked ? '›' : active ? '●' : '○'}
        </Text>
      </Pressable>
    );
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={styles.dismiss} onPress={onClose} accessibilityLabel="Close menu" />
        <View style={[styles.sheet, { backgroundColor: palette.bgMid, borderColor: palette.line }]}>
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {section === 'about' ? (
            <>
              <Pressable
                style={styles.backRow}
                onPress={() => {
                  void Haptics.selectionAsync();
                  setSection('main');
                }}
                accessibilityRole="button"
                accessibilityLabel="Back to menu"
              >
                <Text style={[styles.backText, { color: palette.accent }]}>‹ Menu</Text>
              </Pressable>
              <Text style={styles.title}>About</Text>
              {renderRows(aboutRows)}
            </>
          ) : section === 'alerts' ? (
            <>
              <Pressable
                style={styles.backRow}
                onPress={() => {
                  void Haptics.selectionAsync();
                  setSection('main');
                }}
                accessibilityRole="button"
                accessibilityLabel="Back to menu"
              >
                <Text style={[styles.backText, { color: palette.accent }]}>‹ Menu</Text>
              </Pressable>
              <Text style={styles.title}>Alerts</Text>
              <Text style={[styles.lead, { color: palette.muted }]}>
                How often Windsage pings you when a station is on target.
              </Text>
              {presetRow('annoying', 'Annoying', 'Phone · every 10 minutes')}
              {presetRow('normal', 'Normal', 'Phone · once a day')}
              {presetRow(
                'quiet',
                'Quiet',
                hasGoogleEmail
                  ? 'Email only · once a day'
                  : 'Email only · connect Google first',
                !hasGoogleEmail,
              )}
              {simpleMode && prefs.preset === 'custom' ? (
                <Text style={[styles.sub, { paddingHorizontal: 4, marginTop: 8 }]}>
                  Using a custom schedule. Turn off Simple mode to edit times and how they arrive.
                </Text>
              ) : null}
              {simpleMode ? null : (
                <>
                  <Text style={styles.section}>Advanced</Text>
                  <Text style={[styles.sub, { paddingHorizontal: 4, marginBottom: 8 }]}>
                    Exact times per day and how they arrive.
                  </Text>
                  <View style={[styles.timesRow, { borderTopColor: palette.line }]}>
                    <Text style={[styles.label, { color: palette.text, flex: 1 }]}>Times per day</Text>
                    <Pressable
                      style={[styles.stepBtn, { borderColor: palette.line }]}
                      onPress={() => bumpTimes(-1)}
                      accessibilityLabel="Fewer alerts"
                    >
                      <Text style={[styles.stepText, { color: palette.accent }]}>−</Text>
                    </Pressable>
                    <TextInput
                      style={[
                        styles.timesInput,
                        {
                          backgroundColor: palette.input,
                          borderColor: palette.line,
                          color: palette.text,
                        },
                      ]}
                      value={String(prefs.timesPerDay || 1)}
                      keyboardType="number-pad"
                      inputMode="numeric"
                      onChangeText={(raw) => {
                        const n = Math.trunc(Number(raw));
                        if (!Number.isFinite(n)) return;
                        setPrefs({
                          preset: 'custom',
                          timesPerDay: Math.min(24, Math.max(1, n)),
                        });
                      }}
                      accessibilityLabel="Times per day"
                    />
                    <Pressable
                      style={[styles.stepBtn, { borderColor: palette.line }]}
                      onPress={() => bumpTimes(1)}
                      accessibilityLabel="More alerts"
                    >
                      <Text style={[styles.stepText, { color: palette.accent }]}>+</Text>
                    </Pressable>
                  </View>
                  <Text style={[styles.label, { marginTop: 12, paddingHorizontal: 4 }]}>Send by</Text>
                  <View style={styles.howRow}>
                    {([
                      { key: 'phone' as const, label: 'Phone' },
                      { key: 'email' as const, label: 'Email' },
                      { key: 'both' as const, label: 'Both' },
                    ]).map((opt) => {
                      const active =
                        prefs.preset === 'custom'
                          ? prefs.how === opt.key
                          : prefs.preset === 'quiet'
                            ? opt.key === 'email'
                            : opt.key === 'phone';
                      const locked = (opt.key === 'email' || opt.key === 'both') && !hasGoogleEmail;
                      return (
                        <Pressable
                          key={opt.key}
                          style={[
                            styles.howChip,
                            {
                              borderColor: active ? palette.accent : palette.line,
                              backgroundColor: active ? palette.accentDim : palette.input,
                            },
                          ]}
                          onPress={() => pickHow(opt.key)}
                          accessibilityRole="button"
                          accessibilityLabel={opt.label}
                        >
                          <Text
                            style={{
                              color: active ? palette.accent : palette.muted,
                              fontWeight: '800',
                            }}
                          >
                            {locked ? `${opt.label} · Google` : opt.label}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </>
              )}
            </>
          ) : (
            <>
              <Text style={styles.title}>Menu</Text>
              <Text style={styles.section}>You</Text>
              {onToggleSimple ? (
                <View style={styles.toggleRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.label}>Simple mode</Text>
                    {simpleMode ? null : (
                      <Text style={styles.sub}>Off — all options. Turn on to hide extras.</Text>
                    )}
                  </View>
                  <Switch
                    value={simpleMode}
                    onValueChange={(on) => {
                      void Haptics.selectionAsync();
                      onToggleSimple(on);
                    }}
                    trackColor={{ false: palette.input, true: palette.accent }}
                    thumbColor="#fff"
                    accessibilityLabel="Simple mode"
                  />
                </View>
              ) : null}
              {onChangeNotifyPrefs ? (
                <Pressable
                  style={styles.row}
                  onPress={() => {
                    void Haptics.selectionAsync();
                    setSection('alerts');
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Alerts"
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.label}>Alerts</Text>
                    <Text style={styles.sub}>{notifyPrefsSummary(prefs)}</Text>
                  </View>
                  <Text style={styles.chevron}>›</Text>
                </Pressable>
              ) : null}
              {renderRows(youRows)}
              {appRows.length ? (
                <>
                  <Text style={styles.section}>App</Text>
                  {renderRows(appRows)}
                </>
              ) : null}
              <Text style={styles.section}>More</Text>
              <Pressable
                style={styles.row}
                onPress={openAbout}
                accessibilityRole="button"
                accessibilityLabel="About"
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>About</Text>
                  {simpleMode ? null : (
                    <Text style={styles.sub}>Support, email, privacy</Text>
                  )}
                </View>
                <Text style={styles.chevron}>›</Text>
              </Pressable>
            </>
          )}
          <Pressable style={styles.close} onPress={onClose}>
            <Text style={styles.closeText}>Close</Text>
          </Pressable>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  dismiss: {
    flex: 1,
  },
  sheet: {
    backgroundColor: colors.bgMid,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    padding: 20,
    paddingBottom: 34,
    gap: 4,
    borderWidth: 1,
    borderColor: colors.line,
  },
  title: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '800',
    marginBottom: 8,
  },
  backRow: {
    alignSelf: 'flex-start',
    paddingVertical: 4,
    marginBottom: 4,
  },
  backText: {
    color: colors.accent,
    fontWeight: '700',
    fontSize: 15,
  },
  section: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginTop: 12,
    marginBottom: 2,
    paddingHorizontal: 4,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
    gap: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
    gap: 12,
  },
  label: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  sub: {
    color: colors.muted,
    fontSize: 14,
    marginTop: 2,
  },
  chevron: {
    color: colors.muted,
    fontSize: 24,
    fontWeight: '300',
  },
  close: {
    marginTop: 10,
    alignItems: 'center',
    paddingVertical: 12,
  },
  closeText: {
    color: colors.muted,
    fontWeight: '700',
    fontSize: 15,
  },
  lead: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 8,
  },
  check: {
    fontSize: 18,
    fontWeight: '700',
  },
  timesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
  stepBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepText: {
    fontSize: 20,
    fontWeight: '800',
  },
  timesInput: {
    width: 52,
    textAlign: 'center',
    borderRadius: 10,
    borderWidth: 1,
    paddingVertical: 8,
    fontSize: 16,
    fontWeight: '800',
  },
  howRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
    paddingHorizontal: 4,
    flexWrap: 'wrap',
  },
  howChip: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
});
