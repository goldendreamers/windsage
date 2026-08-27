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
  displayName,
  followSourceRef,
  formatAlertTrigger,
  ruleForMetric,
  windDirectionName,
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
import { Section } from '../components/Section';
import { StatusPanel } from '../components/StatusPanel';
import { WarnNumberInput } from '../components/WarnNumberInput';
import { SimpleNotifyPicker } from '../components/SimpleNotifyPicker';

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
  },
) {
  const dir = windDirectionName(data?.wind_direction);

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
        title: 'From',
        value: dir,
        unit: '',
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
      title: 'From',
      value: dir,
      unit: '',
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
  onOpenMenu?: () => void;
  onAlertFeedback?: (rating: 'good' | 'meh') => Promise<void> | void;
  shareUrl?: string;
  onShare?: () => void;
  simpleMode?: boolean;
};

export function StationDetailScreen({
  station,
  result,
  alertState,
  checking,
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
  shareUrl,
  onShare,
  onOpenMenu,
  simpleMode = false,
}: Props) {
  const [saving, setSaving] = useState(false);
  const [feedbackSent, setFeedbackSent] = useState<'good' | 'meh' | null>(null);
  const reading = result?.reading;
  const forecast = result?.forecast ?? null;
  const forecastOnly = station.kind === 'spot' && !!(station.linkedLiveStation || station.liveLinkWarning);
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
          {simpleMode ? null : (
            <Text style={styles.subtitle}>
              {providerMeta.label} · {followSourceRef(station)}
            </Text>
          )}
        </View>
        {simpleMode ? null : (
        <Pressable
          onPress={() => {
            void Haptics.selectionAsync();
            onPersist({ ...station, starred: !station.starred });
          }}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={station.starred ? 'Unstar follow' : 'Star follow'}
        >
          <Text style={[styles.titleStar, station.starred && styles.titleStarOn]}>
            {station.starred ? '★' : '☆'}
          </Text>
        </Pressable>
        )}
      </View>

      {simpleMode || !station.liveLinkWarning || !station.linkedLiveStation ? null : (
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
              Open nearest live station #{station.linkedLiveStation.id} (reference)
            </Text>
          </Pressable>
        </View>
      ) : null}

      {simpleMode || normalizeProvider(station.provider) !== 'location' || !station.locationBlend?.members?.length ? null : (
        <Section
          title="Blend members"
          icon="station"
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
                    {PROVIDER_META[normalizeProvider(m.provider)]?.short || m.provider}
                    {m.virtual
                      ? ' · pin model'
                      : ` · ${Number(m.distanceKm || 0).toFixed(1)} km`}
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
      )}

      <Section title={simpleMode ? 'Name' : 'Identity'} icon="station">
        {simpleMode ? null : <Text style={styles.label}>Nickname</Text>}
        <TextInput
          style={styles.input}
          value={station.nickname ?? ''}
          onChangeText={(nickname) => onChange({ ...station, nickname })}
          onEndEditing={(e) => onPersist({ ...station, nickname: e.nativeEvent.text })}
          placeholder={simpleMode ? 'Nickname' : 'Home reef / Spot name'}
          placeholderTextColor={colors.muted}
        />

        {simpleMode || !showSpotStationType ? null : (
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
        )}

        {!simpleMode && allowSourceIdEdit ? (
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
          </>
        )}
        <Pressable
          onPress={() => void Linking.openURL(stationPageUrl(station))}
          style={styles.linkBtn}
        >
          <Text style={styles.linkText}>{openOnLabel}</Text>
        </Pressable>
      </Section>

      {forecastOnly ? (
        <Section
          title={
            result?.forecastModel ? `Forecast · ${result.forecastModel}` : 'Forecast'
          }
          icon="wind"
          right={
            <Pressable style={styles.ghostBtn} onPress={onCheck} disabled={checking}>
              <Text style={styles.ghostBtnText}>
                {checking ? '…' : simpleMode ? 'Refresh' : 'Check now'}
              </Text>
            </Pressable>
          }
        >
          <View style={styles.metricsRow}>
            {metricReadingPills(station.rule.metric, forecast || reading, {
              emphasize: true,
              windDirEnabled: !!station.rule.windDirEnabled,
              maxWindEnabled: !!station.rule.maxWindEnabled,
              maxWaveEnabled: !!station.rule.maxWaveEnabled,
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
          <StatusPanel
            result={result}
            alertState={alertState}
            sustainedMinutes={station.rule.sustainedMinutes}
            progress={progress}
            ruleHint={formatAlertTrigger(station.rule, 'short')}
            quiet={simpleMode}
          />
          {simpleMode || !alertState?.notifiedForRun || !onAlertFeedback ? null : (
            <View style={styles.feedbackBox}>
              <Text style={styles.feedbackTitle}>Was this alert right?</Text>
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
          )}
        </Section>
      ) : (
      <Section
        title="Live"
        icon="wind"
        right={
          <Pressable style={styles.ghostBtn} onPress={onCheck} disabled={checking}>
            <Text style={styles.ghostBtnText}>
              {checking ? '…' : simpleMode ? 'Refresh' : 'Check now'}
            </Text>
          </Pressable>
        }
      >
        <View style={styles.metricsRow}>
          {metricReadingPills(station.rule.metric, reading, {
            emphasize: true,
            windDirEnabled: !!station.rule.windDirEnabled,
            maxWindEnabled: !!station.rule.maxWindEnabled,
            maxWaveEnabled: !!station.rule.maxWaveEnabled,
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
          quiet={simpleMode}
        />
        {simpleMode || !alertState?.notifiedForRun || !onAlertFeedback ? null : (
          <View style={styles.feedbackBox}>
            <Text style={styles.feedbackTitle}>Was this alert right?</Text>
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
        )}
      </Section>
      )}

      {simpleMode ? (
        <Section title="Ping me" icon="bell">
          <SimpleNotifyPicker
            rule={station.rule}
            onChange={(rule) => onPersist({ ...station, rule })}
            hideLabel
          />
          <View style={[styles.block, styles.rowBetween, { paddingHorizontal: 0, marginTop: 8 }]}>
            <View style={{ flex: 1, paddingRight: 12 }}>
              <Text style={styles.label}>Send alerts</Text>
            </View>
            <Switch
              value={station.enabled !== false}
              onValueChange={(enabled) => {
                void Haptics.selectionAsync();
                onPersist({ ...station, enabled });
              }}
              trackColor={{ false: '#23404C', true: colors.accent }}
              thumbColor="#fff"
            />
          </View>
        </Section>
      ) : (
      <>
      <Section title="Alert rule" icon="bell">
        <MetricChooser
          value={station.rule.metric}
          onChange={(metric: MetricKey) =>
            onPersist({ ...station, rule: ruleForMetric(station.rule, metric) })
          }
        />

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
          rangeWarning={(n) =>
            n < 0 ? 'Negative value' : null
          }
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
                <WarnNumberInput
                  style={styles.input}
                  value={station.rule.maxGustSpreadKnots ?? 5}
                  onLiveChange={(maxGustSpreadKnots) =>
                    onChange({ ...station, rule: { ...station.rule, maxGustSpreadKnots } })
                  }
                  onCommit={(maxGustSpreadKnots) =>
                    onPersist({ ...station, rule: { ...station.rule, maxGustSpreadKnots } })
                  }
                  rangeWarning={(n) =>
                    n < 0 ? 'Negative value' : null
                  }
                />
              </>
            ) : null}

            <View style={[styles.rowBetween, styles.spaced]}>
              <View style={{ flex: 1, paddingRight: 12 }}>
                <Text style={styles.label}>Limit max wave</Text>
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
                <WarnNumberInput
                  style={styles.input}
                  value={station.rule.maxWaveHeightM ?? 1.5}
                  onLiveChange={(maxWaveHeightM) =>
                    onChange({ ...station, rule: { ...station.rule, maxWaveHeightM } })
                  }
                  onCommit={(maxWaveHeightM) =>
                    onPersist({ ...station, rule: { ...station.rule, maxWaveHeightM } })
                  }
                  rangeWarning={(n) =>
                    n < 0 ? 'Negative value' : null
                  }
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
                <WarnNumberInput
                  style={styles.input}
                  value={station.rule.maxWindKnots ?? 25}
                  onLiveChange={(maxWindKnots) =>
                    onChange({ ...station, rule: { ...station.rule, maxWindKnots } })
                  }
                  onCommit={(maxWindKnots) =>
                    onPersist({ ...station, rule: { ...station.rule, maxWindKnots } })
                  }
                  rangeWarning={(n) =>
                    n < 0 ? 'Negative value' : null
                  }
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
                  <WarnNumberInput
                    style={styles.input}
                    value={station.rule.windDirFromDeg ?? 0}
                    onLiveChange={(windDirFromDeg) =>
                      onChange({ ...station, rule: { ...station.rule, windDirFromDeg } })
                    }
                    onCommit={(windDirFromDeg) =>
                      onPersist({ ...station, rule: { ...station.rule, windDirFromDeg } })
                    }
                    rangeWarning={(n) => (n < 0 || n > 360 ? 'Usually 0–360°' : null)}
                  />
                </View>
                <View style={styles.dirField}>
                  <Text style={styles.label}>To (°)</Text>
                  <WarnNumberInput
                    style={styles.input}
                    value={station.rule.windDirToDeg ?? 360}
                    onLiveChange={(windDirToDeg) =>
                      onChange({ ...station, rule: { ...station.rule, windDirToDeg } })
                    }
                    onCommit={(windDirToDeg) =>
                      onPersist({ ...station, rule: { ...station.rule, windDirToDeg } })
                    }
                    rangeWarning={(n) => (n < 0 || n > 360 ? 'Usually 0–360°' : null)}
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
      </Section>

      <View style={[styles.block, styles.rowBetween]}>
        <View style={{ flex: 1, paddingRight: 12 }}>
          <Text style={styles.sectionTitle}>Monitoring</Text>
        </View>
        <Switch
          value={station.enabled !== false}
          onValueChange={(enabled) => {
            void Haptics.selectionAsync();
            onPersist({ ...station, enabled });
          }}
          trackColor={{ false: '#23404C', true: colors.accent }}
          thumbColor="#fff"
        />
      </View>
      </>
      )}

      {simpleMode ? null : (
      <>
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
      </>
      )}
      <Pressable style={styles.dangerBtn} onPress={onUnfollow}>
        <Text style={styles.dangerBtnText}>
          {simpleMode
            ? 'Remove this station'
            : provider === 'location'
              ? 'Unfollow map pin'
              : 'Unfollow station'}
        </Text>
      </Pressable>
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
  titleStar: {
    color: colors.muted,
    fontSize: 28,
    lineHeight: 32,
    paddingHorizontal: 4,
  },
  titleStarOn: {
    color: colors.accent,
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
