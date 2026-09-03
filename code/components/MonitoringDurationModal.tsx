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
import { colors, onAccent, paletteForMode } from '../shared/theme';

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
  const palette = paletteForMode(simpleMode);
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
          <View
            style={[styles.sheet, { backgroundColor: palette.bgMid, borderColor: palette.line }]}
          >
            <Text style={[styles.title, { color: palette.text }]}>
              {turningOn ? 'Keep alerts on for' : 'Pause alerts for'}
            </Text>
            <Text style={[styles.lead, { color: palette.muted }]}>
              {turningOn
                ? 'Alerts stay on for this long, then pause.'
                : 'Alerts stay off for this long, then turn back on.'}
            </Text>
            {PRESETS.map((row) => (
              <Pressable
                key={row.key}
                style={[styles.row, { borderTopColor: palette.line }]}
                onPress={() => choosePreset(row.key)}
                accessibilityRole="button"
                accessibilityLabel={row.label}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[styles.label, { color: palette.text }]}>{row.label}</Text>
                  <Text style={[styles.sub, { color: palette.muted }]}>{row.sub}</Text>
                </View>
                <Text style={[styles.chevron, { color: palette.muted }]}>›</Text>
              </Pressable>
            ))}
            {simpleMode ? null : customOpen ? (
              <View style={[styles.customBox, { borderTopColor: palette.line }]}>
                <Text style={[styles.label, { color: palette.text }]}>Custom</Text>
                <View style={styles.customRow}>
                  <TextInput
                    style={[
                      styles.input,
                      {
                        backgroundColor: palette.input,
                        borderColor: palette.line,
                        color: palette.text,
                      },
                    ]}
                    value={amount}
                    onChangeText={setAmount}
                    keyboardType="number-pad"
                    inputMode="numeric"
                    placeholder="2"
                    placeholderTextColor={palette.muted}
                    accessibilityLabel="Duration amount"
                  />
                  <View style={[styles.segment, { backgroundColor: palette.input }]}>
                    {(['hours', 'days'] as const).map((next) => {
                      const active = unit === next;
                      return (
                        <Pressable
                          key={next}
                          style={[
                            styles.segmentItem,
                            active && { backgroundColor: palette.accentDim },
                          ]}
                          onPress={() => {
                            void Haptics.selectionAsync();
                            setUnit(next);
                          }}
                          accessibilityRole="button"
                          accessibilityLabel={next}
                        >
                          <Text
                            style={[
                              styles.segmentText,
                              { color: active ? palette.accent : palette.muted },
                            ]}
                          >
                            {next === 'hours' ? 'Hours' : 'Days'}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
                <Pressable
                  style={[
                    styles.confirm,
                    { backgroundColor: palette.accent },
                    !customValid && styles.confirmOff,
                  ]}
                  disabled={!customValid}
                  onPress={chooseCustom}
                  accessibilityRole="button"
                  accessibilityLabel="Use custom duration"
                >
                  <Text style={[styles.confirmText, { color: onAccent(simpleMode) }]}>
                    Use this duration
                  </Text>
                </Pressable>
              </View>
            ) : (
              <Pressable
                style={[styles.row, { borderTopColor: palette.line }]}
                onPress={() => {
                  void Haptics.selectionAsync();
                  setCustomOpen(true);
                }}
                accessibilityRole="button"
                accessibilityLabel="Custom"
              >
                <View style={{ flex: 1 }}>
                  <Text style={[styles.label, { color: palette.text }]}>Custom</Text>
                  <Text style={[styles.sub, { color: palette.muted }]}>Hours or days</Text>
                </View>
                <Text style={[styles.chevron, { color: palette.muted }]}>›</Text>
              </Pressable>
            )}
            <Pressable style={styles.close} onPress={onCancel} accessibilityRole="button">
              <Text style={[styles.closeText, { color: palette.muted }]}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
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
    marginBottom: 4,
  },
  lead: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 8,
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
  customBox: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
    paddingTop: 12,
    gap: 10,
  },
  customRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
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
  segmentItem: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  segmentText: {
    fontWeight: '700',
    fontSize: 13,
  },
  confirm: {
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: colors.accent,
  },
  confirmOff: {
    opacity: 0.45,
  },
  confirmText: {
    color: '#042018',
    fontWeight: '800',
    fontSize: 15,
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
});
