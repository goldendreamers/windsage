import { useEffect, useState } from 'react';
import { StyleSheet, Text, TextInput, type StyleProp, type TextStyle } from 'react-native';
import { parseLooseNumber } from '../shared/defaults';
import { colors } from '../shared/theme';

function stringify(value: number): string {
  if (!Number.isFinite(value)) return '';
  return String(value);
}

type Props = {
  value: number;
  onLiveChange?: (n: number) => void;
  onCommit: (n: number) => void;
  /** Extra range/policy warning for a parsed number. */
  rangeWarning?: (n: number) => string | null;
  style?: StyleProp<TextStyle>;
};

/**
 * Number field that never snaps or clamps while typing.
 * Invalid text stays; a warning is shown. Last valid number remains in the model.
 */
export function WarnNumberInput({
  value,
  onLiveChange,
  onCommit,
  rangeWarning,
  style,
}: Props) {
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState(stringify(value));

  useEffect(() => {
    if (focused) return;
    setDraft((prev) => {
      const n = parseLooseNumber(prev);
      if (n == null) return prev;
      const next = stringify(value);
      return prev === next ? prev : next;
    });
  }, [value, focused]);

  const parsed = parseLooseNumber(draft);
  const trimmed = draft.trim();
  let warning: string | null = null;
  if (trimmed && parsed == null) {
    warning = 'Not a number';
  } else if (!trimmed) {
    warning = 'Empty';
  } else if (parsed != null && rangeWarning) {
    warning = rangeWarning(parsed);
  }

  return (
    <>
      <TextInput
        style={style}
        value={draft}
        onChangeText={(text) => {
          setDraft(text);
          const n = parseLooseNumber(text);
          if (n != null) onLiveChange?.(n);
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onEndEditing={(e) => {
          const n = parseLooseNumber(e.nativeEvent.text);
          if (n != null) onCommit(n);
        }}
        keyboardType="decimal-pad"
        autoCapitalize="none"
        autoCorrect={false}
      />
      {warning ? <Text style={styles.warn}>{warning}</Text> : null}
    </>
  );
}

const styles = StyleSheet.create({
  warn: {
    color: colors.warn,
    fontSize: 12,
    lineHeight: 16,
    marginTop: 4,
  },
});
