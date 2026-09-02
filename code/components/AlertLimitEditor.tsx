import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  EXTRA_LIMIT_META,
  extraLimitEnabled,
  extraLimitsForMetric,
  setExtraLimitEnabled,
  type ExtraLimitKey,
} from '../shared/defaults';
import type { AlertRule } from '../shared/types';
import { colors } from '../shared/theme';
import { WarnNumberInput } from './WarnNumberInput';

type Props = {
  rule: AlertRule;
  accent?: string;
  onLiveChange: (rule: AlertRule) => void;
  onPersist: (rule: AlertRule) => void;
};

function patch(rule: AlertRule, partial: Partial<AlertRule>): AlertRule {
  return { ...rule, ...partial };
}

export function AlertLimitEditor({ rule, accent = colors.accent, onLiveChange, onPersist }: Props) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const keys = extraLimitsForMetric(rule.metric);
  const active = keys.filter((key) => extraLimitEnabled(rule, key));
  const unused = keys.filter((key) => !extraLimitEnabled(rule, key));

  const add = (key: ExtraLimitKey) => {
    void Haptics.selectionAsync();
    onPersist(setExtraLimitEnabled(rule, key, true));
    setPickerOpen(false);
  };
  const remove = (key: ExtraLimitKey) => {
    void Haptics.selectionAsync();
    onPersist(setExtraLimitEnabled(rule, key, false));
  };

  if (!keys.length) return null;

  return (
    <View style={styles.wrap}>
      <Text style={[styles.heading, styles.spaced]}>Extra limits</Text>
      <Text style={styles.hint}>
        Optional caps on top of the main rule — e.g. max wave when alerting on wind.
      </Text>

      {active.map((key) => (
        <View key={key} style={styles.card}>
          <View style={styles.cardTop}>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>{EXTRA_LIMIT_META[key].label}</Text>
              <Text style={styles.hint}>{EXTRA_LIMIT_META[key].hint}</Text>
            </View>
            <Pressable
              onPress={() => remove(key)}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={`Remove ${EXTRA_LIMIT_META[key].label}`}
            >
              <Text style={styles.remove}>Remove</Text>
            </Pressable>
          </View>
          {key === 'maxWave' ? (
            <>
              <Text style={[styles.label, styles.spaced]}>Max wave (m)</Text>
              <WarnNumberInput
                style={styles.input}
                value={rule.maxWaveHeightM ?? 1.5}
                onLiveChange={(maxWaveHeightM) => onLiveChange(patch(rule, { maxWaveHeightM }))}
                onCommit={(maxWaveHeightM) => onPersist(patch(rule, { maxWaveHeightM }))}
                rangeWarning={(n) => (n < 0 ? 'Negative value' : null)}
              />
            </>
          ) : null}
          {key === 'gustSpread' ? (
            <>
              <Text style={[styles.label, styles.spaced]}>Max spread (knots)</Text>
              <WarnNumberInput
                style={styles.input}
                value={rule.maxGustSpreadKnots ?? 5}
                onLiveChange={(maxGustSpreadKnots) =>
                  onLiveChange(patch(rule, { maxGustSpreadKnots }))
                }
                onCommit={(maxGustSpreadKnots) => onPersist(patch(rule, { maxGustSpreadKnots }))}
                rangeWarning={(n) => (n < 0 ? 'Negative value' : null)}
              />
            </>
          ) : null}
          {key === 'maxGust' ? (
            <>
              <Text style={[styles.label, styles.spaced]}>Max gust (knots)</Text>
              <WarnNumberInput
                style={styles.input}
                value={rule.maxGustKnots ?? 30}
                onLiveChange={(maxGustKnots) => onLiveChange(patch(rule, { maxGustKnots }))}
                onCommit={(maxGustKnots) => onPersist(patch(rule, { maxGustKnots }))}
                rangeWarning={(n) => (n < 0 ? 'Negative value' : null)}
              />
            </>
          ) : null}
          {key === 'minWind' ? (
            <>
              <Text style={[styles.label, styles.spaced]}>Min wind avg (kt)</Text>
              <WarnNumberInput
                style={styles.input}
                value={rule.minWindKnots ?? 12}
                onLiveChange={(minWindKnots) => onLiveChange(patch(rule, { minWindKnots }))}
                onCommit={(minWindKnots) => onPersist(patch(rule, { minWindKnots }))}
                rangeWarning={(n) => (n < 0 ? 'Negative value' : null)}
              />
            </>
          ) : null}
          {key === 'maxWind' ? (
            <>
              <Text style={[styles.label, styles.spaced]}>Max wind avg (kt)</Text>
              <WarnNumberInput
                style={styles.input}
                value={rule.maxWindKnots ?? 25}
                onLiveChange={(maxWindKnots) => onLiveChange(patch(rule, { maxWindKnots }))}
                onCommit={(maxWindKnots) => onPersist(patch(rule, { maxWindKnots }))}
                rangeWarning={(n) => (n < 0 ? 'Negative value' : null)}
              />
            </>
          ) : null}
          {key === 'minTemp' ? (
            <>
              <Text style={[styles.label, styles.spaced]}>Min air temp (°C)</Text>
              <WarnNumberInput
                style={styles.input}
                value={rule.minTempC ?? 10}
                onLiveChange={(minTempC) => onLiveChange(patch(rule, { minTempC }))}
                onCommit={(minTempC) => onPersist(patch(rule, { minTempC }))}
              />
            </>
          ) : null}
          {key === 'maxTemp' ? (
            <>
              <Text style={[styles.label, styles.spaced]}>Max air temp (°C)</Text>
              <WarnNumberInput
                style={styles.input}
                value={rule.maxTempC ?? 32}
                onLiveChange={(maxTempC) => onLiveChange(patch(rule, { maxTempC }))}
                onCommit={(maxTempC) => onPersist(patch(rule, { maxTempC }))}
              />
            </>
          ) : null}
          {key === 'windDir' ? (
            <View style={styles.dirRow}>
              <View style={styles.dirField}>
                <Text style={styles.label}>From (°)</Text>
                <WarnNumberInput
                  style={styles.input}
                  value={rule.windDirFromDeg ?? 0}
                  onLiveChange={(windDirFromDeg) => onLiveChange(patch(rule, { windDirFromDeg }))}
                  onCommit={(windDirFromDeg) => onPersist(patch(rule, { windDirFromDeg }))}
                  rangeWarning={(n) => (n < 0 || n > 360 ? 'Usually 0–360°' : null)}
                />
              </View>
              <View style={styles.dirField}>
                <Text style={styles.label}>To (°)</Text>
                <WarnNumberInput
                  style={styles.input}
                  value={rule.windDirToDeg ?? 360}
                  onLiveChange={(windDirToDeg) => onLiveChange(patch(rule, { windDirToDeg }))}
                  onCommit={(windDirToDeg) => onPersist(patch(rule, { windDirToDeg }))}
                  rangeWarning={(n) => (n < 0 || n > 360 ? 'Usually 0–360°' : null)}
                />
              </View>
            </View>
          ) : null}
        </View>
      ))}

      {unused.length ? (
        pickerOpen ? (
          <View style={styles.picker}>
            {unused.map((key) => (
              <Pressable
                key={key}
                style={styles.pickRow}
                onPress={() => add(key)}
                accessibilityRole="button"
                accessibilityLabel={`Add ${EXTRA_LIMIT_META[key].label}`}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>{EXTRA_LIMIT_META[key].label}</Text>
                  <Text style={styles.hint}>{EXTRA_LIMIT_META[key].hint}</Text>
                </View>
                <Text style={[styles.chevron, { color: accent }]}>+</Text>
              </Pressable>
            ))}
            <Pressable style={styles.cancel} onPress={() => setPickerOpen(false)}>
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
          </View>
        ) : (
          <Pressable
            style={[styles.addBtn, { borderColor: accent }]}
            onPress={() => {
              void Haptics.selectionAsync();
              setPickerOpen(true);
            }}
            accessibilityRole="button"
            accessibilityLabel="Add a limit"
          >
            <Text style={[styles.addBtnText, { color: accent }]}>+ Add a limit</Text>
          </Pressable>
        )
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8, marginTop: 8 },
  heading: { color: colors.text, fontSize: 13, fontWeight: '800' },
  spaced: { marginTop: 6 },
  hint: { color: colors.muted, fontSize: 13, lineHeight: 18 },
  label: { color: colors.text, fontSize: 15, fontWeight: '700' },
  card: {
    backgroundColor: colors.input,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 12,
    gap: 6,
  },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  remove: { color: colors.muted, fontWeight: '700', fontSize: 13 },
  input: {
    backgroundColor: colors.bgLift,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.text,
    fontSize: 16,
    borderWidth: 1,
    borderColor: colors.line,
  },
  dirRow: { flexDirection: 'row', gap: 10, marginTop: 4 },
  dirField: { flex: 1, gap: 6 },
  addBtn: {
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 12,
    alignItems: 'center',
  },
  addBtnText: { fontWeight: '800', fontSize: 15 },
  picker: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
    overflow: 'hidden',
  },
  pickRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
  chevron: { fontSize: 22, fontWeight: '700' },
  cancel: { alignItems: 'center', paddingVertical: 10 },
  cancelText: { color: colors.muted, fontWeight: '700' },
});
