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
import {
  normalizeNotifyPrefs,
  notifyChannelsOf,
  notifyPrefsSummary,
  toggleNotifyChannel,
  type NotifyChannel,
  type NotifyPrefs,
  type NotifyPreset,
} from '../shared/defaults';
import { colors } from '../shared/theme';

type MenuSection = 'main' | 'alerts' | 'about';

const PRIVACY_URL = 'https://windsage.nimrod.bio/privacy.html';

type Props = {
  visible: boolean;
  onClose: () => void;
  notifyPrefs?: NotifyPrefs;
  hasGoogleEmail?: boolean;
  showCustom?: boolean;
  simpleMode?: boolean;
  accountLabel?: string;
  onChangeNotifyPrefs?: (prefs: NotifyPrefs) => void;
  onNeedGoogle?: () => void;
  onToggleSimple?: (on: boolean) => void;
  onAccount?: () => void;
  onInstall?: () => void;
};

function openPrivacy() {
  const origin =
    typeof window !== 'undefined' && window.location?.origin ? window.location.origin : '';
  void Linking.openURL(origin ? `${origin}/privacy.html` : PRIVACY_URL);
}

export function AppMenu({
  visible,
  onClose,
  notifyPrefs,
  hasGoogleEmail = false,
  showCustom = false,
  simpleMode = true,
  accountLabel,
  onChangeNotifyPrefs,
  onNeedGoogle,
  onToggleSimple,
  onAccount,
  onInstall,
}: Props) {
  const [section, setSection] = useState<MenuSection>('main');
  const prefs = normalizeNotifyPrefs(notifyPrefs);

  useEffect(() => {
    if (!visible) setSection('main');
  }, [visible]);

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
    if (preset === 'annoying') setPrefs({ preset, how: ['phone'] });
    else if (preset === 'quiet') setPrefs({ preset, how: ['email'], timesPerDay: 1 });
    else if (preset === 'normal') setPrefs({ preset, how: ['phone'], timesPerDay: 1 });
    else setPrefs({ preset });
  };

  const toggleHow = (channel: NotifyChannel) => {
    const current = notifyChannelsOf(prefs);
    const turningOn = !current.includes(channel);
    if (turningOn && channel === 'email' && !hasGoogleEmail) {
      void Haptics.selectionAsync();
      onClose();
      onNeedGoogle?.();
      return;
    }
    setPrefs({ preset: 'custom', how: toggleNotifyChannel(current, channel) });
  };

  const bumpTimes = (delta: number) => {
    const next = Math.min(24, Math.max(1, (prefs.timesPerDay || 1) + delta));
    setPrefs({ preset: 'custom', timesPerDay: next });
  };

  const presetRow = (key: NotifyPreset, label: string, sub: string, locked?: boolean) => {
    const active = prefs.preset === key;
    return (
      <Pressable
        key={key}
        style={styles.row}
        onPress={() => pickPreset(key)}
        accessibilityRole="button"
        accessibilityLabel={label}
      >
        <View style={{ flex: 1 }}>
          <Text style={styles.label}>{label}</Text>
          <Text style={styles.sub}>{sub}</Text>
        </View>
        <Text style={[styles.check, active && styles.checkOn]}>{locked ? '›' : active ? '●' : '○'}</Text>
      </Pressable>
    );
  };

  const menuRow = (key: string, label: string, sub: string | undefined, onPress: () => void) => (
    <Pressable
      key={key}
      style={styles.row}
      onPress={() => {
        void Haptics.selectionAsync();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <View style={{ flex: 1 }}>
        <Text style={styles.label}>{label}</Text>
        {sub ? <Text style={styles.sub}>{sub}</Text> : null}
      </View>
      <Text style={styles.chevron}>›</Text>
    </Pressable>
  );

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={styles.dismiss} onPress={onClose} accessibilityLabel="Close menu" />
        <View style={styles.sheet}>
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
                  <Text style={styles.backText}>‹ Menu</Text>
                </Pressable>
                <Text style={styles.title}>About</Text>
                {menuRow('privacy', 'Privacy', undefined, openPrivacy)}
              </>
            ) : section === 'alerts' ? (
              <>
                <Pressable
                  style={styles.backRow}
                  onPress={() => {
                    void Haptics.selectionAsync();
                    setSection('main');
                  }}
                >
                  <Text style={styles.backText}>‹ Menu</Text>
                </Pressable>
                <Text style={styles.title}>Alerts</Text>
                <Text style={styles.lead}>How often Windsage pings you when a station is on target.</Text>
                {presetRow('annoying', 'Annoying', 'Phone · every 10 minutes')}
                {presetRow('normal', 'Normal', 'Phone · once a day')}
                {presetRow(
                  'quiet',
                  'Quiet',
                  hasGoogleEmail ? 'Email only · once a day' : 'Email only · connect Google first',
                  !hasGoogleEmail,
                )}
                {simpleMode && prefs.preset === 'custom' ? (
                  <Text style={[styles.sub, { paddingHorizontal: 4, marginTop: 8 }]}>
                    Using a custom schedule. Turn off Simple mode to edit times and how they arrive.
                  </Text>
                ) : null}
                {showCustom ? (
                  <>
                    <Text style={styles.section}>Advanced</Text>
                    <Text style={[styles.sub, { paddingHorizontal: 4, marginBottom: 8 }]}>
                      Exact times per day and how they arrive.
                    </Text>
                    <View style={styles.timesRow}>
                      <Text style={[styles.label, { flex: 1 }]}>Times per day</Text>
                      <Pressable style={styles.stepBtn} onPress={() => bumpTimes(-1)}>
                        <Text style={styles.stepText}>−</Text>
                      </Pressable>
                      <TextInput
                        style={styles.timesInput}
                        value={String(prefs.timesPerDay || 1)}
                        keyboardType="number-pad"
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
                      <Pressable style={styles.stepBtn} onPress={() => bumpTimes(1)}>
                        <Text style={styles.stepText}>+</Text>
                      </Pressable>
                    </View>
                    <Text style={[styles.label, { marginTop: 12, paddingHorizontal: 4 }]}>Send by</Text>
                    <View style={styles.howRow}>
                      {([
                        { key: 'phone' as const, label: 'Phone' },
                        { key: 'email' as const, label: 'Email' },
                      ]).map((opt) => {
                        const active = notifyChannelsOf(prefs).includes(opt.key);
                        const locked = opt.key === 'email' && !hasGoogleEmail;
                        return (
                          <Pressable
                            key={opt.key}
                            style={[
                              styles.howChip,
                              {
                                borderColor: active ? colors.accent : colors.line,
                                backgroundColor: active ? colors.accentDim : colors.input,
                              },
                            ]}
                            onPress={() => toggleHow(opt.key)}
                            accessibilityRole="button"
                            accessibilityLabel={opt.label}
                            accessibilityState={{ selected: active }}
                          >
                            <Text
                              style={{
                                color: active ? colors.accent : colors.muted,
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
                ) : null}
              </>
            ) : (
              <>
                <Text style={styles.title}>Menu</Text>
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
                      trackColor={{ false: '#23404C', true: colors.accent }}
                      thumbColor="#fff"
                      accessibilityLabel="Simple mode"
                    />
                  </View>
                ) : null}
                {onChangeNotifyPrefs
                  ? menuRow('alerts', 'Alerts', notifyPrefsSummary(prefs), () => setSection('alerts'))
                  : null}
                {onAccount
                  ? menuRow(
                      'account',
                      simpleMode ? 'Sign in' : 'Account',
                      accountLabel && accountLabel !== 'Account'
                        ? accountLabel
                        : simpleMode
                          ? undefined
                          : 'Sign in or guest',
                      onAccount,
                    )
                  : null}
                {onInstall
                  ? menuRow(
                      'install',
                      simpleMode ? 'Put on home screen' : 'Install app',
                      simpleMode ? undefined : 'Downloads the app onto this phone',
                      onInstall,
                    )
                  : null}
                <Text style={styles.section}>More</Text>
                {menuRow(
                  'about',
                  'About',
                  simpleMode ? undefined : 'Privacy',
                  () => setSection('about'),
                )}
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
  dismiss: { flex: 1 },
  sheet: {
    backgroundColor: colors.bgMid,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    padding: 20,
    paddingBottom: 34,
    maxHeight: '82%',
    borderWidth: 1,
    borderColor: colors.line,
  },
  title: { color: colors.text, fontSize: 22, fontWeight: '800', marginBottom: 8 },
  lead: { color: colors.muted, fontSize: 14, lineHeight: 20, marginBottom: 8 },
  section: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    marginTop: 16,
    marginBottom: 6,
    paddingHorizontal: 4,
  },
  backRow: { paddingVertical: 6, marginBottom: 4 },
  backText: { color: colors.accent, fontSize: 16, fontWeight: '700' },
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
  label: { color: colors.text, fontSize: 16, fontWeight: '700' },
  sub: { color: colors.muted, fontSize: 13, marginTop: 2 },
  chevron: { color: colors.muted, fontSize: 24, fontWeight: '300' },
  check: { color: colors.muted, fontSize: 18, fontWeight: '700' },
  checkOn: { color: colors.accent },
  timesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
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
  stepText: { color: colors.accent, fontSize: 20, fontWeight: '700' },
  timesInput: {
    width: 48,
    textAlign: 'center',
    backgroundColor: colors.input,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.line,
    color: colors.text,
    paddingVertical: 8,
    fontWeight: '700',
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
  close: { marginTop: 10, alignItems: 'center', paddingVertical: 12 },
  closeText: { color: colors.muted, fontWeight: '700', fontSize: 15 },
});
