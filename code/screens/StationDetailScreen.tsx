import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import {
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { metricIcon, brandImages } from '../shared/assets';
import {
  METRIC_OPTIONS,
  displayName,
  followSourceRef,
  formatAlertTrigger,
  formatReadingNumber,
  formatWindFromDisplay,
  monitoringScheduleSummary,
  ruleForMetric,
} from '../shared/defaults';
import {
  PROVIDER_META,
  normalizeProvider,
  providerAllowsSourceIdEdit,
  providerHasSpotStationKinds,
} from '../shared/providers';
import { colors } from '../shared/theme';
import type {
  AlertState,
  CheckResult,
  FollowedStation,
  MetricKey,
  WindguruKind,
} from '../shared/types';
import {
  metricUnit,
  followTargetForKind,
  normalizeWindguruFollowInput,
  parseWindguruId,
  parseWindguruRef,
} from '../core/windguru';
import { followTargetFromResolved, resolveFollowInput, stationPageUrl } from '../core/stations';
import { MetricChooser } from '../components/MetricChooser';
import { MetricPill } from '../components/MetricPill';
import { MonitoringDurationModal } from '../components/MonitoringDurationModal';
import { Section } from '../components/Section';
import { SimpleNotifyPicker } from '../components/SimpleNotifyPicker';
import { StatusPanel } from '../components/StatusPanel';
import { WarnNumberInput } from '../components/WarnNumberInput';

type ReadingLike = {
  wind_avg?: number | null;
  wind_max?: number | null;
  wind_direction?: number | null;
  temperature?: number | null;
  wave_height?: number | null;
} | null;

/** Pills for the active alert metric — wind rules keep avg/gust; temp/wave do not. */
function metricReadingPills(
  metric: MetricKey,
  data: ReadingLike,
  opts: {
    emphasize: boolean;
    windDirEnabled: boolean;
    maxWindEnabled?: boolean;
    maxWaveEnabled?: boolean;
    simpleMode?: boolean;
  },
) {
  const dir = formatWindFromDisplay(data?.wind_direction, !!opts.simpleMode);

  if (metric === 'temperature') {
    return [
      {
        title: 'Temp',
        value: data?.temperature,
        unit: '°C',
        icon: brandImages.temp,
        emphasize: opts.emphasize,
      },
    ];
  }

  if (metric === 'wave_height') {
    const pills = [
      {
        title: 'Wave',
        value: data?.wave_height,
        unit: 'm',
        icon: brandImages.wave,
        emphasize: opts.emphasize,
      },
      {
        title: 'Dir',
        value: dir.value,
        unit: dir.unit,
        icon: brandImages.wind,
        emphasize: opts.windDirEnabled,
      },
    ];
    if (opts.maxWindEnabled) {
      pills.push({
        title: 'Avg',
        value: data?.wind_avg,
        unit: 'kt',
        icon: brandImages.wind,
        emphasize: false,
      });
    }
    return pills;
  }

  const windPills = [
    {
      title: 'Avg',
      value: data?.wind_avg,
      unit: 'kt',
      icon: brandImages.wind,
      emphasize: opts.emphasize && metric === 'wind_avg',
    },
    {
      title: 'Gust',
      value: data?.wind_max,
      unit: 'kt',
      icon: brandImages.gust,
      emphasize: opts.emphasize && metric === 'wind_max',
    },
    {
      title: 'Dir',
      value: dir.value,
      unit: dir.unit,
      icon: brandImages.wind,
      emphasize: opts.windDirEnabled,
    },
    {
      title: 'Temp',
      value: data?.temperature,
      unit: '°C',
      icon: brandImages.temp,
      emphasize: false,
    },
  ];
  if (opts.maxWaveEnabled || (data?.wave_height != null && Number.isFinite(Number(data.wave_height)))) {
    windPills.push({
      title: 'Wave',
      value: data?.wave_height,
      unit: 'm',
      icon: brandImages.wave,
      emphasize: !!opts.maxWaveEnabled,
    });
  }
  return windPills;
}

type Props = {
  station: FollowedStation;
  result: CheckResult | null;
  alertState: AlertState | null;
  checking: boolean;
  bgStatus: string;
  pollIntervalMinutes: number;
  onBack: () => void;
  onChange: (next: FollowedStation) => void;
  onPersist: (next: FollowedStation) => void;
  onSave: (next: FollowedStation) => void;
  onPollIntervalChange: (minutes: number) => void;
  onCheck: () => void;
  onResetAlert: () => void;
  onUnfollow: () => void;
  onAlertFeedback?: (rating: 'good' | 'meh') => Promise<void> | void;
  onOpenMenu?: () => void;
  simpleMode?: boolean;
  shareUrl?: string;
  onShare?: () => void;
};

export function StationDetailScreen({
  station,
  result,
  alertState,
  checking,
  bgStatus,
  pollIntervalMinutes,
  onBack,
  onChange,
  onPersist,
  onSave,
  onPollIntervalChange,
  onCheck,
  onResetAlert,
  onUnfollow,
  onAlertFeedback,
  onOpenMenu,
  simpleMode = false,
  shareUrl,
  onShare,
}: Props) {
  const [saving, setSaving] = useState(false);
  const [feedbackSent, setFeedbackSent] = useState<'good' | 'meh' | null>(null);
  const [monitorOpen, setMonitorOpen] = useState(false);
  const [monitorIntentOn, setMonitorIntentOn] = useState(true);
  const reading = result?.reading;
  const forecast = result?.forecast ?? null;
  const forecastOnly = !!(station.linkedLiveStation || station.liveLinkWarning);
  const showForecast = forecastOnly && !!forecast;
  const selectedMetric = METRIC_OPTIONS.find((m) => m.key === station.rule.metric);
  const windPrimary =
    station.rule.metric === 'wind_avg' || station.rule.metric === 'wind_max';
  const wavePrimary = station.rule.metric === 'wave_height';
  const showDirection = windPrimary || wavePrimary;
  const thresholdLabel =
    station.rule.metric === 'temperature'
      ? 'Temperature (°C)'
      : station.rule.metric === 'wave_height'
        ? 'Wave threshold (m)'
        : `Wind threshold (${metricUnit(station.rule.metric)})`;
  const alertHint =
    station.rule.metric === 'wind_avg'
      ? 'Default wind avg ≥ 15 kt for 20 min. Optional: gust spread, direction, max wave.'
      : station.rule.metric === 'wind_max'
        ? 'Default gust ≥ 20 kt for 20 min. Optional: gust spread, direction, max wave.'
        : wavePrimary
          ? 'Default wave ≥ 1.0 m for 20 min. Optional: max wind, direction.'
          : 'Default temperature ≥ 22 °C for 20 min.';
  const progress =
    result?.conditionMet && station.rule.sustainedMinutes
      ? Math.min(1, result.sustainedMs / (station.rule.sustainedMinutes * 60 * 1000))
      : 0;
  const provider = normalizeProvider(station.provider);
  const providerMeta = PROVIDER_META[provider];
  const showSpotStationType = providerHasSpotStationKinds(provider);
  const allowSourceIdEdit = providerAllowsSourceIdEdit(provider);
  const openOnLabel =
    provider === 'location' ? 'Open in Google Maps' : `Open on ${providerMeta.label}`;
  const monitor = monitoringScheduleSummary(station);

  const openMonitorDuration = (nextOn: boolean) => {
    void Haptics.selectionAsync();
    setMonitorIntentOn(nextOn);
    setMonitorOpen(true);
  };

  return (
    <ScrollView
      contentContainerStyle={styles.scroll}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.navRow}>
        <Pressable style={styles.back} onPress={onBack}>
          <Text style={styles.backText}>‹ Home</Text>
        </Pressable>
        {onOpenMenu ? (
          <Pressable
            style={styles.menuBtn}
            onPress={() => {
              void Haptics.selectionAsync();
              onOpenMenu();
            }}
            accessibilityRole="button"
            accessibilityLabel="Menu"
          >
            <Text style={styles.menuBtnText}>Menu</Text>
          </Pressable>
        ) : null}
      </View>

      <View style={styles.titleBlock}>
        <Image source={brandImages.station} style={styles.titleIcon} contentFit="contain" />
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{displayName(station)}</Text>
          <Text style={styles.subtitle}>
            {providerMeta.label} · {followSourceRef(station)}
          </Text>
        </View>
      </View>

      {station.liveLinkWarning && station.linkedLiveStation ? (
        <View style={styles.warnBox}>
          <Text style={styles.warnText}>{station.liveLinkWarning}</Text>
          <Pressable
            onPress={() =>
              void Linking.openURL(
                `https://www.windguru.cz/station/${station.linkedLiveStation!.id}`,
              )
            }
            style={styles.linkBtn}
          >
            <Text style={styles.linkText}>
              Open nearest live station #{station.linkedLiveStation.id}
            </Text>
          </Pressable>
        </View>
      ) : null}

      {normalizeProvider(station.provider) === 'location' && station.locationBlend?.members?.length ? (
        <Section
          title="Blend members"
          icon="station"
          hint="Weights = distance × accuracy × your rating (tap stars)"
        >
          <Text style={styles.hintLine}>
            {station.locationBlend.address ||
              `${station.locationBlend.lat.toFixed(3)}, ${station.locationBlend.lon.toFixed(3)}`}{' '}
            · {station.locationBlend.radiusKm} km radius
          </Text>
          {station.locationBlend.members.map((m) => {
            const rating = Math.round(Number(m.rating) || 0);
            return (
              <View key={`${m.provider}:${m.stationId}`} style={styles.memberRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.memberName}>{m.name}</Text>
                  <Text style={styles.memberMeta}>
                    {m.provider} #{m.stationId} · {m.distanceKm.toFixed(1)} km
                    {m.weightNorm != null ? ` · ${(m.weightNorm * 100).toFixed(0)}%` : ''}
                    {m.ok === false ? ' · offline' : ''}
                  </Text>
                </View>
                <View style={styles.stars}>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <Pressable
                      key={n}
                      onPress={() => {
                        const members = (station.locationBlend?.members || []).map((row) =>
                          row.provider === m.provider && row.stationId === m.stationId
                            ? { ...row, rating: n }
                            : row,
                        );
                        onPersist({
                          ...station,
                          locationBlend: station.locationBlend
                            ? { ...station.locationBlend, members }
                            : station.locationBlend,
                        });
                      }}
                    >
                      <Text style={[styles.star, n <= rating && styles.starOn]}>★</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            );
          })}
        </Section>
      ) : null}

      <Section title="Identity" icon="station" hint="Nickname appears on your home list">
        <Text style={styles.label}>Nickname</Text>
        <TextInput
          style={styles.input}
          value={station.nickname ?? ''}
          onChangeText={(nickname) => onChange({ ...station, nickname })}
          onEndEditing={(e) => onPersist({ ...station, nickname: e.nativeEvent.text })}
          placeholder="Home reef / Spot name"
          placeholderTextColor={colors.muted}
        />

        {showSpotStationType ? (
          <>
            <Text style={[styles.label, styles.spaced]}>Type</Text>
            <View style={styles.segment}>
              {([
                { key: 'spot' as const, label: 'Spot' },
                { key: 'station' as const, label: 'Station' },
              ]).map((option) => {
                const active = station.kind === option.key;
                return (
                  <Pressable
                    key={option.key}
                    style={[styles.segmentItem, active && styles.segmentItemActive]}
                    onPress={() => {
                      void Haptics.selectionAsync();
                      if (option.key === station.kind) return;
                      void (async () => {
                        try {
                          const resolved = await normalizeWindguruFollowInput(station.stationId);
                          const target = followTargetForKind(option.key, resolved);
                          onPersist({
                            ...station,
                            stationId: target.stationId,
                            kind: target.kind,
                            liveStationId: target.liveStationId,
                            linkedLiveStation: target.linkedLiveStation,
                            liveLinkWarning: target.liveLinkWarning,
                            sourceName:
                              target.spotName?.trim() ||
                              target.linkedLiveStation?.spotname?.trim() ||
                              target.linkedLiveStation?.name?.trim() ||
                              station.sourceName ||
                              null,
                            nickname:
                              (station.nickname || '').trim() ||
                              target.spotName ||
                              station.nickname ||
                              '',
                          });
                        } catch {
                          onPersist({
                            ...station,
                            kind: option.key,
                            liveStationId: null,
                            linkedLiveStation: null,
                            liveLinkWarning: null,
                          });
                        }
                      })();
                    }}
                  >
                    <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
                      {option.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </>
        ) : null}

        {allowSourceIdEdit ? (
          <>
            <Text style={[styles.label, styles.spaced]}>Source ID or URL</Text>
            <TextInput
              style={styles.input}
              value={station.stationId}
              onChangeText={(stationId) =>
                onChange({
                  ...station,
                  stationId,
                  // Clear stale nearest-link metadata until Save / blur re-resolves.
                  liveStationId: null,
                  linkedLiveStation: null,
                  liveLinkWarning: null,
                })
              }
              onEndEditing={(e) => {
                const raw = e.nativeEvent.text;
                void (async () => {
                  const currentProvider = normalizeProvider(station.provider);
                  try {
                    if (currentProvider === 'windguru') {
                      const ref = parseWindguruRef(raw);
                      const preferred: WindguruKind = ref?.kindHint ?? station.kind;
                      const resolved = await normalizeWindguruFollowInput(raw);
                      const target = followTargetForKind(preferred, resolved);
                      onPersist({
                        ...station,
                        provider: 'windguru',
                        stationId: target.stationId,
                        kind: target.kind,
                        liveStationId: target.liveStationId,
                        linkedLiveStation: target.linkedLiveStation,
                        liveLinkWarning: target.liveLinkWarning,
                        sourceName:
                          target.spotName?.trim() ||
                          target.linkedLiveStation?.spotname?.trim() ||
                          target.linkedLiveStation?.name?.trim() ||
                          station.sourceName ||
                          null,
                        nickname:
                          (station.nickname || '').trim() ||
                          target.spotName ||
                          station.nickname ||
                          '',
                      });
                      return;
                    }
                    const resolved = await resolveFollowInput(currentProvider, raw);
                    const target = followTargetFromResolved(currentProvider, 'station', resolved);
                    onPersist({
                      ...station,
                      provider: target.provider,
                      stationId: target.stationId,
                      kind: target.kind,
                      liveStationId: target.liveStationId,
                      linkedLiveStation: target.linkedLiveStation,
                      liveLinkWarning: target.liveLinkWarning,
                      sourceName: target.sourceName || station.sourceName || null,
                    });
                  } catch {
                    const preferred =
                      currentProvider === 'windguru'
                        ? parseWindguruRef(raw)?.kindHint ?? station.kind
                        : 'station';
                    const parsed =
                      currentProvider === 'windguru'
                        ? parseWindguruRef(raw)?.id || parseWindguruId(raw) || raw.trim()
                        : raw.trim();
                    onPersist({
                      ...station,
                      stationId: parsed,
                      kind: preferred,
                      liveStationId: currentProvider === 'windguru' ? null : parsed,
                      linkedLiveStation: null,
                      liveLinkWarning: null,
                    });
                  }
                })();
              }}
              placeholder={providerMeta.placeholder}
              placeholderTextColor={colors.muted}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </>
        ) : (
          <>
            <Text style={[styles.label, styles.spaced]}>Location</Text>
            <Text style={styles.readOnlyValue}>{followSourceRef(station)}</Text>
            <Text style={styles.hint}>
              Map pins keep their pin and blend — remove and re-add to move the pin.
            </Text>
          </>
        )}
        <Pressable
          onPress={() => void Linking.openURL(stationPageUrl(station))}
          style={styles.linkBtn}
        >
          <Text style={styles.linkText}>{openOnLabel}</Text>
        </Pressable>
      </Section>

      {showForecast ? (
        <Section
          title="Forecast"
          icon="wind"
          hint={
            result?.forecastModel
              ? `${result.forecastModel} · nearest model hour at this spot — not what the alert watches`
              : 'Model forecast for this spot — not what the alert watches'
          }
        >
          <View style={styles.metricsRow}>
            {metricReadingPills(station.rule.metric, forecast, {
              emphasize: false,
              windDirEnabled: !!station.rule.windDirEnabled,
              maxWindEnabled: !!station.rule.maxWindEnabled,
              maxWaveEnabled: !!station.rule.maxWaveEnabled,
              simpleMode,
            }).map((pill) => (
              <MetricPill
                key={`fcst-${pill.title}`}
                title={pill.title}
                value={pill.value}
                unit={pill.unit}
                icon={pill.icon}
                emphasize={pill.emphasize}
              />
            ))}
          </View>
        </Section>
      ) : null}

      <Section
        title={showForecast ? 'Nearest live (alerts)' : 'Live'}
        icon="wind"
        hint={
          showForecast
            ? 'Alerts watch this nearest live station — not the forecast numbers above'
            : undefined
        }
        right={
          <Pressable style={styles.ghostBtn} onPress={onCheck} disabled={checking}>
            <Text style={styles.ghostBtnText}>{checking ? 'Checking…' : 'Check now'}</Text>
          </Pressable>
        }
      >
        <View style={styles.metricsRow}>
          {metricReadingPills(station.rule.metric, reading, {
            emphasize: true,
            windDirEnabled: !!station.rule.windDirEnabled,
            maxWindEnabled: !!station.rule.maxWindEnabled,
            maxWaveEnabled: !!station.rule.maxWaveEnabled,
            simpleMode,
          }).map((pill) => (
            <MetricPill
              key={`live-${pill.title}`}
              title={pill.title}
              value={pill.value}
              unit={pill.unit}
              icon={pill.icon}
              emphasize={pill.emphasize}
            />
          ))}
        </View>
        <StatusPanel
          result={result}
          alertState={alertState}
          sustainedMinutes={station.rule.sustainedMinutes}
          progress={progress}
          ruleHint={formatAlertTrigger(station.rule, 'short')}
          evaluatedLabel={
            result?.metricValue != null
              ? `${formatReadingNumber(result.metricValue)} ${metricUnit(station.rule.metric)}`
              : null
          }
          quiet={simpleMode}
        />
        {alertState?.notifiedForRun && onAlertFeedback ? (
          <View style={styles.feedbackBox}>
            <Text style={styles.feedbackTitle}>Was this alert right?</Text>
            <Text style={styles.feedbackHint}>Helps tune thresholds and blended sources.</Text>
            {feedbackSent ? (
              <Text style={styles.feedbackThanks}>
                Thanks — marked {feedbackSent === 'good' ? 'good' : 'meh'}.
              </Text>
            ) : (
              <View style={styles.feedbackRow}>
                <Pressable
                  style={styles.feedbackGood}
                  onPress={() => {
                    void Haptics.selectionAsync();
                    setFeedbackSent('good');
                    void onAlertFeedback('good');
                  }}
                >
                  <Text style={styles.feedbackGoodText}>Good</Text>
                </Pressable>
                <Pressable
                  style={styles.feedbackMeh}
                  onPress={() => {
                    void Haptics.selectionAsync();
                    setFeedbackSent('meh');
                    void onAlertFeedback('meh');
                  }}
                >
                  <Text style={styles.feedbackMehText}>Meh</Text>
                </Pressable>
              </View>
            )}
          </View>
        ) : null}
      </Section>

      {simpleMode ? (
        <Section title="Ping me" icon="bell">
          <SimpleNotifyPicker
            rule={station.rule}
            onChange={(rule) => onPersist({ ...station, rule })}
            hideLabel
          />
        </Section>
      ) : (
      <Section title="Alert rule" icon="bell" hint={alertHint}>
        <MetricChooser
          value={station.rule.metric}
          onChange={(metric: MetricKey) =>
            onPersist({ ...station, rule: ruleForMetric(station.rule, metric) })
          }
        />
        {selectedMetric ? <Text style={styles.hint}>{selectedMetric.hint}</Text> : null}

        <View style={styles.rowBetween}>
          <View style={styles.thresholdLabel}>
            <Image
              source={metricIcon(station.rule.metric)}
              style={{ width: 14, height: 14 }}
              contentFit="contain"
            />
            <Text style={styles.label}>{thresholdLabel}</Text>
          </View>
          <View style={styles.segment}>
            {(['gte', 'lte'] as const).map((comparison) => {
              const active = station.rule.comparison === comparison;
              return (
                <Pressable
                  key={comparison}
                  style={[styles.segmentItem, active && styles.segmentItemActive]}
                  onPress={() => {
                    void Haptics.selectionAsync();
                    onPersist({ ...station, rule: { ...station.rule, comparison } });
                  }}
                >
                  <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
                    {comparison === 'gte' ? '≥' : '≤'}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
        <WarnNumberInput
          style={styles.input}
          value={station.rule.threshold}
          onLiveChange={(threshold) =>
            onChange({ ...station, rule: { ...station.rule, threshold } })
          }
          onCommit={(threshold) =>
            onPersist({ ...station, rule: { ...station.rule, threshold } })
          }
          rangeWarning={(n) => (n < 0 ? 'Negative value' : null)}
        />

        <Text style={[styles.label, styles.spaced]}>Must hold for (minutes)</Text>
        <WarnNumberInput
          style={styles.input}
          value={station.rule.sustainedMinutes}
          onLiveChange={(sustainedMinutes) =>
            onChange({ ...station, rule: { ...station.rule, sustainedMinutes } })
          }
          onCommit={(sustainedMinutes) =>
            onPersist({ ...station, rule: { ...station.rule, sustainedMinutes } })
          }
          rangeWarning={(n) => (n < 1 ? 'Under 1 minute' : null)}
        />

        {windPrimary ? (
          <>
            <View style={[styles.rowBetween, styles.spaced]}>
              <View style={{ flex: 1, paddingRight: 12 }}>
                <Text style={styles.label}>Limit gust − avg spread</Text>
                <Text style={styles.hint}>
                  Optional. Only notify when gust is within this many knots of average wind.
                </Text>
              </View>
              <Switch
                value={!!station.rule.maxGustSpreadEnabled}
                onValueChange={(maxGustSpreadEnabled) => {
                  void Haptics.selectionAsync();
                  onPersist({ ...station, rule: { ...station.rule, maxGustSpreadEnabled } });
                }}
                trackColor={{ false: '#23404C', true: colors.accent }}
                thumbColor="#fff"
              />
            </View>
            {station.rule.maxGustSpreadEnabled ? (
              <>
                <Text style={[styles.label, styles.spaced]}>Max spread (knots)</Text>
                <TextInput
                  style={styles.input}
                  value={String(station.rule.maxGustSpreadKnots ?? 5)}
                  onChangeText={(text) => {
                    const maxGustSpreadKnots = Math.max(0, Number(text.replace(',', '.')));
                    onChange({
                      ...station,
                      rule: {
                        ...station.rule,
                        maxGustSpreadKnots: Number.isFinite(maxGustSpreadKnots)
                          ? maxGustSpreadKnots
                          : station.rule.maxGustSpreadKnots ?? 5,
                      },
                    });
                  }}
                  onEndEditing={(e) => {
                    const parsed = Number(e.nativeEvent.text.replace(',', '.'));
                    const maxGustSpreadKnots = Number.isFinite(parsed)
                      ? Math.max(0, parsed)
                      : station.rule.maxGustSpreadKnots ?? 5;
                    onPersist({
                      ...station,
                      rule: { ...station.rule, maxGustSpreadKnots },
                    });
                  }}
                  keyboardType="decimal-pad"
                />
              </>
            ) : null}

            <View style={[styles.rowBetween, styles.spaced]}>
              <View style={{ flex: 1, paddingRight: 12 }}>
                <Text style={styles.label}>Limit max wave</Text>
                <Text style={styles.hint}>
                  Optional. Skip notify when waves are above this height (m).
                </Text>
              </View>
              <Switch
                value={!!station.rule.maxWaveEnabled}
                onValueChange={(maxWaveEnabled) => {
                  void Haptics.selectionAsync();
                  onPersist({ ...station, rule: { ...station.rule, maxWaveEnabled } });
                }}
                trackColor={{ false: '#23404C', true: colors.accent }}
                thumbColor="#fff"
              />
            </View>
            {station.rule.maxWaveEnabled ? (
              <>
                <Text style={[styles.label, styles.spaced]}>Max wave (m)</Text>
                <TextInput
                  style={styles.input}
                  value={String(station.rule.maxWaveHeightM ?? 1.5)}
                  onChangeText={(text) => {
                    const maxWaveHeightM = Math.max(0, Number(text.replace(',', '.')));
                    onChange({
                      ...station,
                      rule: {
                        ...station.rule,
                        maxWaveHeightM: Number.isFinite(maxWaveHeightM)
                          ? maxWaveHeightM
                          : station.rule.maxWaveHeightM ?? 1.5,
                      },
                    });
                  }}
                  onEndEditing={(e) => {
                    const parsed = Number(e.nativeEvent.text.replace(',', '.'));
                    const maxWaveHeightM = Number.isFinite(parsed)
                      ? Math.max(0, parsed)
                      : station.rule.maxWaveHeightM ?? 1.5;
                    onPersist({ ...station, rule: { ...station.rule, maxWaveHeightM } });
                  }}
                  keyboardType="decimal-pad"
                />
              </>
            ) : null}
          </>
        ) : null}

        {wavePrimary ? (
          <>
            <View style={[styles.rowBetween, styles.spaced]}>
              <View style={{ flex: 1, paddingRight: 12 }}>
                <Text style={styles.label}>Limit max wind</Text>
                <Text style={styles.hint}>
                  Optional. Skip notify when average wind is above this (kt).
                </Text>
              </View>
              <Switch
                value={!!station.rule.maxWindEnabled}
                onValueChange={(maxWindEnabled) => {
                  void Haptics.selectionAsync();
                  onPersist({ ...station, rule: { ...station.rule, maxWindEnabled } });
                }}
                trackColor={{ false: '#23404C', true: colors.accent }}
                thumbColor="#fff"
              />
            </View>
            {station.rule.maxWindEnabled ? (
              <>
                <Text style={[styles.label, styles.spaced]}>Max wind avg (kt)</Text>
                <TextInput
                  style={styles.input}
                  value={String(station.rule.maxWindKnots ?? 25)}
                  onChangeText={(text) => {
                    const maxWindKnots = Math.max(0, Number(text.replace(',', '.')));
                    onChange({
                      ...station,
                      rule: {
                        ...station.rule,
                        maxWindKnots: Number.isFinite(maxWindKnots)
                          ? maxWindKnots
                          : station.rule.maxWindKnots ?? 25,
                      },
                    });
                  }}
                  onEndEditing={(e) => {
                    const parsed = Number(e.nativeEvent.text.replace(',', '.'));
                    const maxWindKnots = Number.isFinite(parsed)
                      ? Math.max(0, parsed)
                      : station.rule.maxWindKnots ?? 25;
                    onPersist({ ...station, rule: { ...station.rule, maxWindKnots } });
                  }}
                  keyboardType="decimal-pad"
                />
              </>
            ) : null}
          </>
        ) : null}

        {showDirection ? (
          <>
            <View style={[styles.rowBetween, styles.spaced]}>
              <View style={{ flex: 1, paddingRight: 12 }}>
                <Text style={styles.label}>Limit by wind direction</Text>
                <Text style={styles.hint}>
                  Optional. N=0° · E=90° · S=180° · W=270°. Wrap-around OK (e.g. 300→60).
                </Text>
              </View>
              <Switch
                value={!!station.rule.windDirEnabled}
                onValueChange={(windDirEnabled) => {
                  void Haptics.selectionAsync();
                  onPersist({ ...station, rule: { ...station.rule, windDirEnabled } });
                }}
                trackColor={{ false: '#23404C', true: colors.accent }}
                thumbColor="#fff"
              />
            </View>
            {station.rule.windDirEnabled ? (
              <View style={styles.dirRow}>
                <View style={styles.dirField}>
                  <Text style={styles.label}>From (°)</Text>
                  <TextInput
                    style={styles.input}
                    value={String(station.rule.windDirFromDeg ?? 0)}
                    onChangeText={(text) => {
                      const windDirFromDeg = Number(text.replace(',', '.'));
                      onChange({
                        ...station,
                        rule: {
                          ...station.rule,
                          windDirFromDeg: Number.isFinite(windDirFromDeg)
                            ? windDirFromDeg
                            : station.rule.windDirFromDeg ?? 0,
                        },
                      });
                    }}
                    onEndEditing={(e) => {
                      const parsed = Number(e.nativeEvent.text.replace(',', '.'));
                      const windDirFromDeg = Number.isFinite(parsed)
                        ? Math.min(360, Math.max(0, parsed))
                        : station.rule.windDirFromDeg ?? 0;
                      onPersist({ ...station, rule: { ...station.rule, windDirFromDeg } });
                    }}
                    keyboardType="decimal-pad"
                  />
                </View>
                <View style={styles.dirField}>
                  <Text style={styles.label}>To (°)</Text>
                  <TextInput
                    style={styles.input}
                    value={String(station.rule.windDirToDeg ?? 360)}
                    onChangeText={(text) => {
                      const windDirToDeg = Number(text.replace(',', '.'));
                      onChange({
                        ...station,
                        rule: {
                          ...station.rule,
                          windDirToDeg: Number.isFinite(windDirToDeg)
                            ? windDirToDeg
                            : station.rule.windDirToDeg ?? 360,
                        },
                      });
                    }}
                    onEndEditing={(e) => {
                      const parsed = Number(e.nativeEvent.text.replace(',', '.'));
                      const windDirToDeg = Number.isFinite(parsed)
                        ? Math.min(360, Math.max(0, parsed))
                        : station.rule.windDirToDeg ?? 360;
                      onPersist({ ...station, rule: { ...station.rule, windDirToDeg } });
                    }}
                    keyboardType="decimal-pad"
                  />
                </View>
              </View>
            ) : null}
          </>
        ) : null}

        <Text style={[styles.label, styles.spaced]}>Cloud poll on (minutes)</Text>
        <WarnNumberInput
          style={styles.input}
          value={pollIntervalMinutes}
          onLiveChange={onPollIntervalChange}
          onCommit={onPollIntervalChange}
          rangeWarning={(n) =>
            n <= 0 ? 'Cloud waits at least 1 minute' : n < 10 ? 'Under 10 min' : null
          }
        />
        <Text style={styles.hint}>
          Phone stays idle — Wald home server polls your weather sources. Status: {bgStatus}
        </Text>
      </Section>
      )}

      <View style={[styles.block, styles.rowBetween]}>
        <View style={{ flex: 1, paddingRight: 12 }}>
          <Text style={styles.sectionTitle}>Monitoring</Text>
          {monitor.detailHint ? (
            <Text style={styles.hint}>{monitor.detailHint}</Text>
          ) : (
            <Text style={styles.hint}>On by default. Off pauses alerts for this station only</Text>
          )}
        </View>
        <Switch
          value={station.enabled !== false}
          onValueChange={openMonitorDuration}
          trackColor={{ false: '#23404C', true: colors.accent }}
          thumbColor="#fff"
          accessibilityLabel="Monitoring"
        />
      </View>

      <Pressable
        style={[styles.primaryBtn, saving && styles.primaryBtnDisabled]}
        disabled={saving}
        onPress={() => {
          void (async () => {
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            setSaving(true);
            try {
              onPollIntervalChange(pollIntervalMinutes);
              if (normalizeProvider(station.provider) !== 'windguru') {
                onSave(station);
                return;
              }
              const resolved = await normalizeWindguruFollowInput(station.stationId);
              const target = followTargetForKind(station.kind, resolved);
              const next = {
                ...station,
                stationId: target.stationId,
                kind: target.kind,
                liveStationId: target.liveStationId,
                linkedLiveStation: target.linkedLiveStation,
                liveLinkWarning: target.liveLinkWarning,
                sourceName:
                  target.spotName?.trim() ||
                  target.linkedLiveStation?.spotname?.trim() ||
                  target.linkedLiveStation?.name?.trim() ||
                  station.sourceName ||
                  null,
                nickname:
                  (station.nickname || '').trim() ||
                  target.spotName ||
                  station.nickname ||
                  '',
              };
              onSave(next);
            } catch (e) {
              // Still save identity fields, but clear stale nearest-link warning.
              onSave({
                ...station,
                liveStationId: null,
                linkedLiveStation: null,
                liveLinkWarning:
                  e instanceof Error
                    ? e.message
                    : 'Could not resolve Windguru ID — warning cleared; check the ID',
              });
            } finally {
              setSaving(false);
            }
          })();
        }}
      >
        <Text style={styles.primaryBtnText}>
          {saving ? 'Saving…' : provider === 'location' ? 'Save' : 'Save station'}
        </Text>
      </Pressable>

      {onShare ? (
        <Pressable
          style={styles.secondaryBtn}
          onPress={onShare}
          accessibilityRole="button"
          accessibilityLabel="Share follow link"
          accessibilityHint={shareUrl}
        >
          <Text style={styles.secondaryBtnText}>Share link</Text>
        </Pressable>
      ) : null}
      <Pressable style={styles.secondaryBtn} onPress={onResetAlert}>
        <Text style={styles.secondaryBtnText}>Reset alert memory</Text>
      </Pressable>
      <Pressable style={styles.dangerBtn} onPress={onUnfollow}>
        <Text style={styles.dangerBtnText}>
          {provider === 'location' ? 'Unfollow map pin' : 'Unfollow station'}
        </Text>
      </Pressable>
      <MonitoringDurationModal
        visible={monitorOpen}
        turningOn={monitorIntentOn}
        simpleMode={simpleMode}
        onCancel={() => setMonitorOpen(false)}
        onConfirm={(untilMs) => {
          setMonitorOpen(false);
          onPersist({ ...station, enabled: monitorIntentOn, monitoringUntilMs: untilMs });
        }}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 44,
    gap: 14,
  },
  back: {
    alignSelf: 'flex-start',
    paddingVertical: 4,
  },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  menuBtn: {
    backgroundColor: colors.input,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: colors.line,
  },
  menuBtnText: {
    color: colors.text,
    fontWeight: '800',
    fontSize: 13,
  },
  backText: {
    color: colors.accent,
    fontSize: 16,
    fontWeight: '700',
  },
  titleBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 4,
  },
  titleIcon: {
    width: 28,
    height: 28,
  },
  title: {
    color: colors.text,
    fontSize: 28,
    fontWeight: '800',
  },
  subtitle: {
    color: colors.muted,
    fontSize: 13,
  },
  warnBox: {
    backgroundColor: 'rgba(232,184,74,0.12)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(232,184,74,0.35)',
    padding: 12,
    gap: 6,
  },
  hintLine: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 16,
    marginBottom: 6,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
  memberName: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  memberMeta: {
    color: colors.muted,
    fontSize: 11,
    marginTop: 2,
  },
  stars: {
    flexDirection: 'row',
    gap: 2,
  },
  star: {
    color: colors.muted,
    fontSize: 16,
  },
  starOn: {
    color: '#E8B84A',
  },
  warnText: {
    color: '#E8B84A',
    fontSize: 13,
    lineHeight: 18,
  },
  block: {
    backgroundColor: colors.bgLift,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.line,
    gap: 8,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
  },
  label: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  spaced: {
    marginTop: 8,
  },
  hint: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
  },
  readOnlyValue: {
    color: colors.text,
    fontSize: 16,
    lineHeight: 22,
    marginTop: 2,
  },
  input: {
    backgroundColor: colors.input,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: colors.text,
    fontSize: 16,
    borderWidth: 1,
    borderColor: colors.line,
  },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  thresholdLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  metricsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  dirRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  dirField: {
    flex: 1,
    gap: 6,
  },
  segment: {
    flexDirection: 'row',
    backgroundColor: colors.input,
    borderRadius: 10,
    padding: 3,
  },
  segmentItem: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  segmentItemActive: {
    backgroundColor: colors.accent,
  },
  segmentText: {
    color: colors.muted,
    fontWeight: '700',
  },
  segmentTextActive: {
    color: '#042018',
  },
  ghostBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: colors.accentDim,
  },
  ghostBtnText: {
    color: colors.accent,
    fontWeight: '700',
    fontSize: 13,
  },
  linkBtn: {
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  linkText: {
    color: colors.accent,
    fontWeight: '600',
  },
  feedbackBox: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    gap: 6,
  },
  feedbackTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '800',
  },
  feedbackHint: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 16,
  },
  feedbackThanks: {
    color: colors.ok,
    fontSize: 13,
    fontWeight: '700',
  },
  feedbackRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  feedbackGood: {
    backgroundColor: colors.accentDim,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.accent,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  feedbackGoodText: {
    color: colors.accent,
    fontWeight: '800',
  },
  feedbackMeh: {
    backgroundColor: colors.input,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  feedbackMehText: {
    color: colors.muted,
    fontWeight: '800',
  },
  primaryBtn: {
    alignItems: 'center',
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: colors.accent,
  },
  primaryBtnDisabled: {
    opacity: 0.7,
  },
  primaryBtnText: {
    color: '#042018',
    fontWeight: '800',
    fontSize: 15,
  },
  secondaryBtn: {
    alignItems: 'center',
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
  },
  secondaryBtnText: {
    color: colors.muted,
    fontWeight: '600',
  },
  dangerBtn: {
    alignItems: 'center',
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(232,106,106,0.45)',
    backgroundColor: 'rgba(232,106,106,0.08)',
  },
  dangerBtnText: {
    color: colors.danger,
    fontWeight: '700',
  },
});
