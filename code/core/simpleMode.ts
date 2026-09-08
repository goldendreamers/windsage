import { DEFAULT_RULE } from '../shared/defaults';
import type { AlertRule, MetricKey } from '../shared/types';

export const SIMPLE_NOTIFY_PRESETS = [
  { id: 'wind_12', label: 'Wind 12 knots or more', metric: 'wind_avg' as const, threshold: 12 },
  { id: 'wind_15', label: 'Wind 15 knots or more', metric: 'wind_avg' as const, threshold: 15 },
  { id: 'wind_20', label: 'Wind 20 knots or more', metric: 'wind_avg' as const, threshold: 20 },
  { id: 'gust_25', label: 'Gusts 25 knots or more', metric: 'wind_max' as const, threshold: 25 },
] as const;

export type SimpleNotifyId = (typeof SIMPLE_NOTIFY_PRESETS)[number]['id'];

export const DEFAULT_SIMPLE_NOTIFY_ID: SimpleNotifyId = 'wind_15';

export function ruleFromSimplePreset(id: string): AlertRule {
  const preset =
    SIMPLE_NOTIFY_PRESETS.find((row) => row.id === id) ||
    SIMPLE_NOTIFY_PRESETS.find((row) => row.id === DEFAULT_SIMPLE_NOTIFY_ID)!;
  return {
    ...DEFAULT_RULE,
    metric: preset.metric as MetricKey,
    threshold: preset.threshold,
    comparison: 'gte',
    maxGustSpreadEnabled: false,
    windDirEnabled: false,
    maxWaveEnabled: false,
    maxWindEnabled: false,
  };
}

function hasExtraLimits(rule: AlertRule): boolean {
  return !!(
    rule.maxGustSpreadEnabled ||
    rule.windDirEnabled ||
    rule.maxWaveEnabled ||
    rule.maxWindEnabled
  );
}

export function matchSimpleNotifyId(rule: AlertRule | null | undefined): SimpleNotifyId | null {
  if (!rule) return null;
  if (hasExtraLimits(rule)) return null;
  const found = SIMPLE_NOTIFY_PRESETS.find(
    (row) =>
      row.metric === rule.metric &&
      row.threshold === rule.threshold &&
      (rule.comparison || 'gte') === 'gte',
  );
  return found?.id ?? null;
}

export function simpleNotifyLabel(rule: AlertRule | null | undefined): string {
  const id = matchSimpleNotifyId(rule);
  if (id) {
    return SIMPLE_NOTIFY_PRESETS.find((row) => row.id === id)?.label || 'Wind 15 knots or more';
  }
  return 'Pick one…';
}
