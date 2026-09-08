import * as Haptics from 'expo-haptics';
import { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  monitoringUntilMsForCustomAmount,
  monitoringUntilMsForPreset,
  parseLooseNumber,
  type MonitoringCustomUnit,
  type MonitoringDurationPreset,
} from '../shared/defaults';
import { colors } from '../shared/theme';

type Props = {
  visible: boolean;
  turningOn: boolean;
  simpleMode?: boolean;
  onCancel: () => void;
  onConfirm: (untilMs: number | null) => void;
};

const PRESETS: { key: MonitoringDurationPreset; label: string; sub: string }[] = [
  { key: 'day', label: 'A day', sub: '24 hours' },
  { key: 'week', label: 'A week', sub: '7 days' },
  { key: 'forever', label: 'Forever', sub: 'Until you change it' },
];

export function MonitoringDurationModal({
  visible,
  turningOn,
  simpleMode = true,
  onCancel,
  onConfirm,
}: Props) {
  const [customOpen, setCustomOpen] = useState(false);
  const [amount, setAmount] = useState('2');
  const [unit, setUnit] = useState<MonitoringCustomUnit>('hours');

  useEffect(() => {
    if (!visible) {
      setCustomOpen(false);
      setAmount('2');
      setUnit('hours');
    }
  }, [visible]);

  const choosePreset = (preset: MonitoringDurationPreset) => {
    void Haptics.selectionAsync();
    onConfirm(monitoringUntilMsForPreset(preset));
  };

  const chooseCustom = () => {
    const n = parseLooseNumber(amount);
    if (n == null || n < 1) return;
    void Haptics.selectionAsync();
    onConfirm(monitoringUntilMsForCustomAmount(n, unit));
  };

  const customValid = (() => {
    const n = parseLooseNumber(amount);
    return n != null && n >= 1;
  })();

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onCancel}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.backdrop}>
          <Pressable style={styles.dismiss} onPress={onCancel} accessibilityLabel="Cancel" />
          <View style={styles.sheet}>
            <Text style={styles.title}>{turningOn ? 'Keep alerts on for' : 'Pause alerts for'}</Text>
            <Text style={styles.lead}>
              {turningOn
                ? 'Alerts stay on for this long, then pause.'
                : 'Alerts stay off for this long, then turn back on.'}
            </Text>
            {PRESETS.map((row) => (
              <Pressable
                key={row.key}
                style={styles.row}
                onPress={() => choosePreset(row.key)}
                accessibilityRole="button"
                accessibilityLabel={row.label}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>{row.label}</Text>
                  <Text style={styles.sub}>{row.sub}</Text>
                </View>
                <Text style={styles.chevron}>›</Text>
              </Pressable>
            ))}
            {simpleMode ? null : customOpen ? (
              <View style={styles.customBox}>
                <Text style={styles.label}>Custom</Text>
                <View style={styles.customRow}>
                  <TextInput
                    style={styles.input}
                    value={amount}
                    onChangeText={setAmount}
                    keyboardType="number-pad"
                    placeholder="2"
                    placeholderTextColor={colors.muted}
                    accessibilityLabel="Duration amount"
                  />
                  <View style={styles.segment}>
                    {(['hours', 'days'] as const).map((next) => {
                      const active = unit === next;
                      return (
                        <Pressable
                          key={next}
                          style={[styles.segmentItem, active && styles.segmentItemOn]}
                          onPress={() => {
                            void Haptics.selectionAsync();
                            setUnit(next);
                          }}
                        >
                          <Text style={[styles.segmentText, active && styles.segmentTextOn]}>
                            {next === 'hours' ? 'Hours' : 'Days'}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
                <Pressable
                  style={[styles.confirm, !customValid && styles.confirmOff]}
                  disabled={!customValid}
                  onPress={chooseCustom}
                >
                  <Text style={styles.confirmText}>Use this duration</Text>
                </Pressable>
              </View>
            ) : (
              <Pressable
                style={styles.row}
                onPress={() => {
                  void Haptics.selectionAsync();
                  setCustomOpen(true);
                }}
                accessibilityRole="button"
                accessibilityLabel="Custom"
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>Custom</Text>
                  <Text style={styles.sub}>Hours or days</Text>
                </View>
                <Text style={styles.chevron}>›</Text>
              </Pressable>
            )}
            <Pressable style={styles.close} onPress={onCancel}>
              <Text style={styles.closeText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
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
    gap: 4,
    borderWidth: 1,
    borderColor: colors.line,
  },
  title: { color: colors.text, fontSize: 22, fontWeight: '800', marginBottom: 4 },
  lead: { color: colors.muted, fontSize: 14, lineHeight: 20, marginBottom: 8 },
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
  sub: { color: colors.muted, fontSize: 14, marginTop: 2 },
  chevron: { color: colors.muted, fontSize: 24, fontWeight: '300' },
  customBox: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
    paddingTop: 12,
    gap: 10,
  },
  customRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  input: {
    flex: 1,
    backgroundColor: colors.input,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: colors.text,
    fontSize: 16,
    borderWidth: 1,
    borderColor: colors.line,
  },
  segment: {
    flexDirection: 'row',
    backgroundColor: colors.input,
    borderRadius: 10,
    padding: 3,
  },
  segmentItem: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
  segmentItemOn: { backgroundColor: colors.accentDim },
  segmentText: { fontWeight: '700', fontSize: 13, color: colors.muted },
  segmentTextOn: { color: colors.accent },
  confirm: {
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: colors.accent,
  },
  confirmOff: { opacity: 0.45 },
  confirmText: { color: '#042018', fontWeight: '800', fontSize: 15 },
  close: { marginTop: 10, alignItems: 'center', paddingVertical: 12 },
  closeText: { color: colors.muted, fontWeight: '700', fontSize: 15 },
});
