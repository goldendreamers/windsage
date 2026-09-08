import * as Haptics from 'expo-haptics';
import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import {
  normalizeNotifyPrefs,
  notifyPrefsSummary,
  type NotifyPrefs,
  type NotifyPreset,
} from '../shared/defaults';
import { colors } from '../shared/theme';

type MenuSection = 'main' | 'alerts';

type Props = {
  visible: boolean;
  onClose: () => void;
  notifyPrefs?: NotifyPrefs;
  hasGoogleEmail?: boolean;
  showCustom?: boolean;
  onChangeNotifyPrefs?: (prefs: NotifyPrefs) => void;
  onNeedGoogle?: () => void;
};

export function AppMenu({
  visible,
  onClose,
  notifyPrefs,
  hasGoogleEmail = false,
  showCustom = false,
  onChangeNotifyPrefs,
  onNeedGoogle,
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

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={styles.dismiss} onPress={onClose} accessibilityLabel="Close menu" />
        <View style={styles.sheet}>
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {section === 'alerts' ? (
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
                {showCustom ? (
                  <>
                    <Text style={styles.section}>Advanced</Text>
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
                      />
                      <Pressable style={styles.stepBtn} onPress={() => bumpTimes(1)}>
                        <Text style={styles.stepText}>+</Text>
                      </Pressable>
                    </View>
                  </>
                ) : null}
              </>
            ) : (
              <>
                <Text style={styles.title}>Menu</Text>
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
              </>
            )}
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
  },
  backRow: { paddingVertical: 6, marginBottom: 4 },
  backText: { color: colors.accent, fontSize: 16, fontWeight: '700' },
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
});
