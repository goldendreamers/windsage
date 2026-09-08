import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  SIMPLE_NOTIFY_PRESETS,
  matchSimpleNotifyId,
  ruleFromSimplePreset,
  simpleNotifyLabel,
  type SimpleNotifyId,
} from '../core/simpleMode';
import { colors } from '../shared/theme';
import type { AlertRule } from '../shared/types';

type Props = {
  rule: AlertRule;
  onChange: (rule: AlertRule) => void;
  hideLabel?: boolean;
};

export function SimpleNotifyPicker({ rule, onChange, hideLabel = false }: Props) {
  const [open, setOpen] = useState(false);
  const currentId = matchSimpleNotifyId(rule);
  const label = simpleNotifyLabel(rule);

  const pick = (id: SimpleNotifyId) => {
    void Haptics.selectionAsync();
    onChange(ruleFromSimplePreset(id));
    setOpen(false);
  };

  return (
    <View>
      {hideLabel ? null : <Text style={styles.label}>Ping me when</Text>}
      <Pressable
        style={styles.trigger}
        onPress={() => {
          void Haptics.selectionAsync();
          setOpen((v) => !v);
        }}
        accessibilityRole="button"
        accessibilityLabel={`Ping me when ${label}`}
      >
        <Text style={styles.triggerText}>{label}</Text>
        <Text style={styles.chevron}>{open ? '▴' : '▾'}</Text>
      </Pressable>
      {open ? (
        <View style={styles.menu}>
          {SIMPLE_NOTIFY_PRESETS.map((row) => {
            const on = currentId != null && row.id === currentId;
            return (
              <Pressable
                key={row.id}
                style={[styles.option, on && styles.optionOn]}
                onPress={() => pick(row.id)}
              >
                <Text style={[styles.optionText, on && styles.optionTextOn]}>{row.label}</Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  label: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 6,
  },
  trigger: {
    backgroundColor: colors.input,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  triggerText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  chevron: {
    color: colors.muted,
    fontSize: 14,
  },
  menu: {
    marginTop: 6,
    backgroundColor: colors.bgLift,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
    overflow: 'hidden',
  },
  option: {
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
  optionOn: {
    backgroundColor: colors.accentDim,
  },
  optionText: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
  },
  optionTextOn: {
    color: colors.accent,
    fontWeight: '800',
  },
});
