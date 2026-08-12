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
import { METRIC_OPTIONS, displayName, ruleForMetric } from '../shared/defaults';
import { PROVIDER_META, normalizeProvider } from '../shared/providers';
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
}: Props) {
  const [saving, setSaving] = useState(false);
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

  return (
    <ScrollView
      contentContainerStyle={styles.scroll}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <Pressable style={styles.back} onPress={onBack}>
        <Text style={styles.backText}>‹ Home</Text>
      </Pressable>

      <View style={styles.titleBlock}>
        <Image source={brandImages.station} style={styles.titleIcon} contentFit="contain" />
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{displayName(station)}</Text>
          <Text style={styles.subtitle}>
            {PROVIDER_META[normalizeProvider(station.provider)].label}{' '}
            {station.kind === 'spot' ? 'spot' : 'station'} #{station.stationId}
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
          value={station.nickname}
          onChangeText={(nickname) => onChange({ ...station, nickname })}
          onEndEditing={(e) => onPersist({ ...station, nickname: e.nativeEvent.text })}
          placeholder="Home reef / Spot name"
          placeholderTextColor={colors.muted}
        />

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
                          station.nickname.trim() ||
                          target.spotName ||
                          station.nickname,
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
              const provider = normalizeProvider(station.provider);
              try {
                if (provider === 'windguru') {
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
                      station.nickname.trim() ||
                      target.spotName ||
                      station.nickname,
                  });
                  return;
                }
                const resolved = await resolveFollowInput(provider, raw);
                const target = followTargetFromResolved(provider, 'station', resolved);
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
                  provider === 'windguru'
                    ? parseWindguruRef(raw)?.kindHint ?? station.kind
                    : 'station';
                const parsed =
                  provider === 'windguru'
                    ? parseWindguruRef(raw)?.id || parseWindguruId(raw) || raw.trim()
                    : raw.trim();
                onPersist({
                  ...station,
                  stationId: parsed,
                  kind: preferred,
                  liveStationId: provider === 'windguru' ? null : parsed,
                  linkedLiveStation: null,
                  liveLinkWarning: null,
                });
              }
            })();
          }}
          placeholder={PROVIDER_META[normalizeProvider(station.provider)].placeholder}
          placeholderTextColor={colors.muted}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <Pressable
          onPress={() => void Linking.openURL(stationPageUrl(station))}
          style={styles.linkBtn}
        >
          <Text style={styles.linkText}>
            Open on {PROVIDER_META[normalizeProvider(station.provider)].label}
          </Text>
        </Pressable>
      </Section>

      {showForecast ? (
        <Section
          title="Forecast"
          icon="wind"
          hint={
            result?.forecastModel
              ? `${result.forecastModel} · nearest model hour for this spot`
              : 'Model forecast for this spot (no native live sensor)'
          }
          right={
            <Pressable style={styles.ghostBtn} onPress={onCheck} disabled={checking}>
              <Text style={styles.ghostBtnText}>{checking ? 'Checking…' : 'Check now'}</Text>
            </Pressable>
          }
        >
          <View style={styles.metricsRow}>
            <MetricPill
              title="Avg"
              value={forecast?.wind_avg}
              unit="kt"
              icon={brandImages.wind}
              emphasize={station.rule.metric === 'wind_avg'}
            />
            <MetricPill
              title="Gust"
              value={forecast?.wind_max}
              unit="kt"
              icon={brandImages.gust}
              emphasize={station.rule.metric === 'wind_max'}
            />
            <MetricPill
              title="Dir"
              value={forecast?.wind_direction == null ? null : Math.round(forecast.wind_direction)}
              unit="°"
              icon={brandImages.wind}
              emphasize={station.rule.windDirEnabled}
            />
            <MetricPill
              title="Temp"
              value={forecast?.temperature}
              unit="°C"
              icon={brandImages.temp}
              emphasize={station.rule.metric === 'temperature'}
            />
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
          showForecast ? undefined : (
            <Pressable style={styles.ghostBtn} onPress={onCheck} disabled={checking}>
              <Text style={styles.ghostBtnText}>{checking ? 'Checking…' : 'Check now'}</Text>
            </Pressable>
          )
        }
      >
        <View style={styles.metricsRow}>
          <MetricPill
            title="Avg"
            value={reading?.wind_avg}
            unit="kt"
            icon={brandImages.wind}
            emphasize={!showForecast && station.rule.metric === 'wind_avg'}
          />
          <MetricPill
            title="Gust"
            value={reading?.wind_max}
            unit="kt"
            icon={brandImages.gust}
            emphasize={!showForecast && station.rule.metric === 'wind_max'}
          />
          <MetricPill
            title="Dir"
            value={reading?.wind_direction == null ? null : Math.round(reading.wind_direction)}
            unit="°"
            icon={brandImages.wind}
            emphasize={!showForecast && station.rule.windDirEnabled}
          />
          <MetricPill
            title="Temp"
            value={reading?.temperature}
            unit="°C"
            icon={brandImages.temp}
            emphasize={!showForecast && station.rule.metric === 'temperature'}
          />
        </View>
        <StatusPanel
          result={result}
          alertState={alertState}
          sustainedMinutes={station.rule.sustainedMinutes}
          progress={progress}
        />
      </Section>

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
        <TextInput
          style={styles.input}
          value={String(station.rule.threshold)}
          onChangeText={(text) => {
            const threshold = Number(text.replace(',', '.'));
            onChange({
              ...station,
              rule: {
                ...station.rule,
                threshold: Number.isFinite(threshold) ? threshold : station.rule.threshold,
              },
            });
          }}
          onEndEditing={(e) => {
            const threshold = Number(e.nativeEvent.text.replace(',', '.'));
            onPersist({
              ...station,
              rule: {
                ...station.rule,
                threshold: Number.isFinite(threshold) ? threshold : station.rule.threshold,
              },
            });
          }}
          keyboardType="decimal-pad"
        />

        <Text style={[styles.label, styles.spaced]}>Must hold for (minutes)</Text>
        <TextInput
          style={styles.input}
          value={String(station.rule.sustainedMinutes)}
          onChangeText={(text) => {
            const sustainedMinutes = Math.max(1, Math.round(Number(text)) || 1);
            onChange({
              ...station,
              rule: { ...station.rule, sustainedMinutes },
            });
          }}
          onEndEditing={(e) => {
            const sustainedMinutes = Math.max(1, Math.round(Number(e.nativeEvent.text)) || 1);
            onPersist({
              ...station,
              rule: { ...station.rule, sustainedMinutes },
            });
          }}
          keyboardType="number-pad"
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
        <TextInput
          style={styles.input}
          value={String(pollIntervalMinutes)}
          onChangeText={(text) => {
            const minutes = Math.max(10, Math.round(Number(text)) || 10);
            onPollIntervalChange(minutes);
          }}
          onEndEditing={(e) => {
            const minutes = Math.max(10, Math.round(Number(e.nativeEvent.text)) || 10);
            onPollIntervalChange(minutes);
          }}
          keyboardType="number-pad"
        />
        <Text style={styles.hint}>
          Phone stays idle — Wald home server polls your weather sources. Status: {bgStatus}
        </Text>
      </Section>

      <View style={[styles.block, styles.rowBetween]}>
        <View style={{ flex: 1, paddingRight: 12 }}>
          <Text style={styles.sectionTitle}>Monitoring</Text>
          <Text style={styles.hint}>On by default. Off pauses alerts for this station only</Text>
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
                  station.nickname.trim() ||
                  target.spotName ||
                  station.nickname,
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
        <Text style={styles.primaryBtnText}>{saving ? 'Saving…' : 'Save station'}</Text>
      </Pressable>

      <Pressable style={styles.secondaryBtn} onPress={onResetAlert}>
        <Text style={styles.secondaryBtnText}>Reset alert memory</Text>
      </Pressable>
      <Pressable style={styles.dangerBtn} onPress={onUnfollow}>
        <Text style={styles.dangerBtnText}>Unfollow station</Text>
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
