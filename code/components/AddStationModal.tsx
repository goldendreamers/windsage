import * as Haptics from 'expo-haptics';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  DEFAULT_RULE,
  type CatalogStation,
  findExistingFollow,
  followSourceRef,
  suggestCatalogStations,
  suggestExistingFollows,
  windguruName,
} from '../shared/defaults';
import {
  PROVIDER_META,
  STATION_PROVIDERS,
  normalizeProvider,
  type StationProvider,
} from '../shared/providers';
import { colors } from '../shared/theme';
import type { AlertRule, FollowedStation, LocationBlend, WindguruKind } from '../shared/types';
import {
  detectProviderFromInput,
  followTargetFromResolved,
  resolveFollowInput,
} from '../core/stations';
import { parseWindguruRef } from '../core/windguru';
import { getCloudBaseUrl } from '../core/cloud';
import { LocationPicker, type LocationPick } from './LocationPicker';
import { FirstTimeBanner } from './FirstTimeBanner';
import { SimpleNotifyPicker } from './SimpleNotifyPicker';
import {
  DEFAULT_SIMPLE_NOTIFY_ID,
  ruleFromSimplePreset,
} from '../core/simpleMode';

type Props = {
  visible: boolean;
  onClose: () => void;
  onSave: (
    stationId: string,
    nickname: string,
    kind: WindguruKind,
    extras?: Pick<
      FollowedStation,
      | 'provider'
      | 'liveStationId'
      | 'linkedLiveStation'
      | 'liveLinkWarning'
      | 'sourceName'
      | 'locationBlend'
      | 'rule'
    >,
  ) => void;
  onReuse: (followId: string) => void;
  existingStations: FollowedStation[];
  catalogStations?: CatalogStation[];
  howto?: boolean;
  onDismissHowto?: () => void;
  simpleMode?: boolean;
};

export function AddStationModal({
  visible,
  onClose,
  onSave,
  onReuse,
  existingStations,
  catalogStations = [],
  howto = false,
  onDismissHowto,
  simpleMode = false,
}: Props) {
  const [provider, setProvider] = useState<StationProvider>('windguru');
  const [stationId, setStationId] = useState('');
  const [nickname, setNickname] = useState('');
  const [kind, setKind] = useState<WindguruKind>('station');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [linkHint, setLinkHint] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [sourceReady, setSourceReady] = useState<Record<string, boolean> | null>(null);
  const [locationPick, setLocationPick] = useState<LocationPick | null>(null);
  const [pendingMembers, setPendingMembers] = useState<LocationBlend['members'] | null>(null);
  const [pendingCatalog, setPendingCatalog] = useState<CatalogStation | null>(null);
  const [notifyRule, setNotifyRule] = useState<AlertRule>(() =>
    ruleFromSimplePreset(DEFAULT_SIMPLE_NOTIFY_ID),
  );
  const nicknameInputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (!visible || !simpleMode) return;
    setProvider('windguru');
    setKind('station');
  }, [visible, simpleMode]);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`${getCloudBaseUrl()}/v1/weather-sources`);
        const data = (await res.json()) as {
          sources?: Record<string, { ready?: boolean }>;
        };
        if (cancelled || !data.sources) return;
        const map: Record<string, boolean> = {};
        for (const [k, v] of Object.entries(data.sources)) {
          map[k] = !!v?.ready;
        }
        setSourceReady(map);
      } catch {
        // ignore — assume free sources ready
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [visible]);

  const meta = PROVIDER_META[provider];
  const providerReady = sourceReady ? sourceReady[provider] !== false : !meta.needsToken;
  const catalogPending =
    !!pendingCatalog &&
    pendingCatalog.stationId.trim() === stationId.trim() &&
    normalizeProvider(pendingCatalog.provider) === provider;
  const addDisabled = busy || (provider === 'location' && !locationPick);

  const existingSuggestions = useMemo(
    () =>
      suggestExistingFollows(existingStations, stationId).filter(
        (f) => normalizeProvider(f.provider) === provider,
      ),
    [existingStations, stationId, provider],
  );
  const catalogSuggestions = useMemo(
    () => {
      const rows = suggestCatalogStations(catalogStations, existingStations, stationId, 6, provider);
      if (!simpleMode) return rows;
      return rows.filter(
        (entry) =>
          normalizeProvider(entry.provider) === 'windguru' && entry.kind !== 'spot',
      );
    },
    [catalogStations, existingStations, stationId, provider, simpleMode],
  );

  const saveFollow = (
    id: string,
    name: string,
    followKind: WindguruKind,
    extras: Parameters<Props['onSave']>[3] = {},
  ) => {
    onSave(id, name, simpleMode ? 'station' : followKind, {
      ...extras,
      ...(simpleMode ? { rule: notifyRule } : {}),
    });
  };

  const reset = () => {
    setStationId('');
    setNickname('');
    setKind('station');
    setError(null);
    setBusy(false);
    setLinkHint(null);
    setWarning(null);
    setLocationPick(null);
    setPendingMembers(null);
    setPendingCatalog(null);
    setNotifyRule(ruleFromSimplePreset(DEFAULT_SIMPLE_NOTIFY_ID));
  };

  const close = () => {
    reset();
    onClose();
  };

  const pickExisting = (follow: FollowedStation) => {
    void Haptics.selectionAsync();
    reset();
    onReuse(follow.id);
  };

  const catalogLabel = (entry: CatalogStation) =>
    windguruName({
      id: `catalog_${entry.provider}_${entry.stationId}`,
      provider: normalizeProvider(entry.provider),
      stationId: entry.stationId,
      kind: entry.kind,
      nickname: '',
      sourceName: entry.sourceName ?? null,
      enabled: true,
      rule: DEFAULT_RULE,
      liveStationId: entry.liveStationId ?? null,
      linkedLiveStation: entry.linkedLiveStation ?? null,
      liveLinkWarning: entry.liveLinkWarning ?? null,
    });

  /** Fill the form only — user nicknames, then taps Add to home. */
  const pickCatalog = (entry: CatalogStation) => {
    void Haptics.selectionAsync();
    const entryProvider = simpleMode ? 'windguru' : normalizeProvider(entry.provider);
    setProvider(entryProvider);
    setStationId(entry.stationId);
    setKind(simpleMode ? 'station' : entry.kind === 'spot' ? 'spot' : 'station');
    setNickname('');
    setPendingCatalog(entry);
    setError(null);
    setLinkHint(null);
    setWarning(entry.liveLinkWarning ?? null);
    setTimeout(() => nicknameInputRef.current?.focus(), 50);
  };

  const applyIdText = (text: string) => {
    setStationId(text);
    setPendingCatalog(null);
    setError(null);
    setLinkHint(null);
    setWarning(null);
    if (simpleMode) return;
    const detected = detectProviderFromInput(text);
    if (detected && detected !== provider) setProvider(detected);
    if (provider === 'windguru' || detected === 'windguru') {
      const ref = parseWindguruRef(text);
      if (ref?.kindHint) setKind(ref.kindHint);
    }
  };

  const submit = async () => {
    if (provider === 'location') {
      if (!locationPick) {
        setError('Search an address or tap the map to place a pin');
        return;
      }
      setBusy(true);
      setError(null);
      try {
        const resolved = await resolveFollowInput('location', `${locationPick.lat},${locationPick.lon}`, {
          address: locationPick.address,
          lat: locationPick.lat,
          lon: locationPick.lon,
        });
        const target = followTargetFromResolved('location', 'station', resolved);
        const existing = findExistingFollow(existingStations, {
          stationId: target.stationId,
          provider: 'location',
        });
        if (existing) {
          reset();
          onReuse(existing.id);
          return;
        }
        const blend = (resolved as { locationBlend?: LocationBlend }).locationBlend || null;
        saveFollow(target.stationId, nickname.trim() || target.sourceName || locationPick.address, 'station', {
          provider: 'location',
          sourceName: target.sourceName || locationPick.address,
          liveStationId: target.liveStationId,
          liveLinkWarning: target.liveLinkWarning,
          locationBlend: blend,
        });
        reset();
      } catch (e) {
        const raw = e instanceof Error ? e.message : '';
        const lower = raw.toLowerCase();
        if (lower.includes('failed to fetch') || lower.includes('network')) {
          setError('Couldn’t reach cloud to resolve that pin. Try again in a moment.');
        } else {
          setError(raw || 'Could not resolve location');
        }
      } finally {
        setBusy(false);
      }
      return;
    }

    // Catalog pick: require nickname + explicit Add — no auto-create on select.
    if (
      pendingCatalog &&
      pendingCatalog.stationId.trim() === stationId.trim() &&
      normalizeProvider(pendingCatalog.provider) === provider
    ) {
      if (!nickname.trim()) {
        setWarning('No nickname — Home will use the official source name.');
      }
      const existing = findExistingFollow(existingStations, {
        stationId: pendingCatalog.stationId,
        provider,
      });
      if (existing) {
        void Haptics.selectionAsync();
        reset();
        onReuse(existing.id);
        return;
      }
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      saveFollow(
        pendingCatalog.stationId,
        nickname.trim() || pendingCatalog.sourceName || pendingCatalog.stationId,
        pendingCatalog.kind === 'spot' ? 'spot' : 'station',
        {
          provider,
          sourceName: pendingCatalog.sourceName ?? null,
          liveStationId: pendingCatalog.liveStationId ?? null,
          linkedLiveStation: pendingCatalog.linkedLiveStation ?? null,
          liveLinkWarning: pendingCatalog.liveLinkWarning ?? null,
        },
      );
      reset();
      return;
    }

    if (!stationId.trim()) {
      setError(`Paste a ${meta.label} id or URL`);
      return;
    }
    if (!providerReady) {
      setError(`${meta.label} needs a server API token — see Account / server env`);
      return;
    }
    setBusy(true);
    setError(null);
    setLinkHint(null);
    setWarning(null);
    try {
      const resolved = await resolveFollowInput(provider, stationId);
      const target = followTargetFromResolved(provider, kind, resolved);

      const existing = findExistingFollow(existingStations, {
        stationId: target.stationId,
        provider: target.provider,
      });
      if (existing) {
        void Haptics.selectionAsync();
        reset();
        onReuse(existing.id);
        return;
      }

      const sourceName = target.sourceName;
      const name = nickname.trim() || sourceName || '';
      if (provider === 'windguru') {
        if (kind === 'station' && resolved.kind === 'spot' && resolved.hasLiveStation) {
          setLinkHint(
            `Spot ${resolved.inputId} → live station ${resolved.liveStationId} (you chose Station)`,
          );
        } else if (kind === 'spot' && resolved.kind === 'station') {
          setLinkHint(`#${resolved.inputId} is a live station — saved as Station`);
        }
      }
      if (target.liveLinkWarning) setWarning(target.liveLinkWarning);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      saveFollow(target.stationId, name, target.kind, {
        provider: target.provider,
        liveStationId: target.liveStationId,
        linkedLiveStation: target.linkedLiveStation,
        liveLinkWarning: target.liveLinkWarning,
        sourceName,
      });
      reset();
    } catch (e) {
      if (provider === 'windguru' && kind === 'spot') {
        const parsed = parseWindguruRef(stationId);
        const id = parsed?.id;
        if (id) {
          const existing = findExistingFollow(existingStations, {
            stationId: id,
            provider: 'windguru',
            inputId: id,
          });
          if (existing) {
            void Haptics.selectionAsync();
            reset();
            onReuse(existing.id);
            return;
          }
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          saveFollow(id, nickname.trim() || `Spot ${id}`, 'spot', { provider: 'windguru' });
          reset();
          return;
        }
      }
      const msg = e instanceof Error ? e.message : `Could not resolve ${meta.label}`;
      const parsed = provider === 'windguru' ? parseWindguruRef(stationId)?.id : null;
      const saveId = parsed || stationId.trim();
      const existing = findExistingFollow(existingStations, {
        stationId: saveId,
        provider,
      });
      if (existing) {
        void Haptics.selectionAsync();
        reset();
        onReuse(existing.id);
        return;
      }
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      saveFollow(saveId, nickname.trim() || saveId, kind, {
        provider,
        liveLinkWarning: msg,
      });
      reset();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={close}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <Text style={styles.title}>
            {simpleMode ? 'Add a station' : 'Follow a station'}
          </Text>
          {howto && !simpleMode ? (
            <FirstTimeBanner
              embedded
              simple={simpleMode}
              screen="follow"
              onDismiss={onDismissHowto}
            />
          ) : null}

          {simpleMode ? (
            <Text style={styles.hint}>
              Open the live station on windguru.cz and paste the number from the address (or paste
              the whole link).
            </Text>
          ) : (
            <>
          <Text style={styles.label}>Source</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.providerScroll}>
            <View style={styles.providerRow}>
              {STATION_PROVIDERS.map((key) => {
                const active = provider === key;
                const ready = sourceReady ? sourceReady[key] !== false : !PROVIDER_META[key].needsToken;
                return (
                  <Pressable
                    key={key}
                    style={[
                      styles.providerChip,
                      active && styles.providerChipActive,
                      !ready && styles.providerChipMuted,
                    ]}
                    onPress={() => {
                      void Haptics.selectionAsync();
                      setProvider(key);
                      setError(null);
                      setLinkHint(null);
                      setWarning(null);
                      setPendingCatalog(null);
                      if (key !== 'windguru') setKind('station');
                    }}
                    disabled={busy}
                  >
                    <Text
                      style={[styles.providerChipText, active && styles.providerChipTextActive]}
                    >
                      {PROVIDER_META[key].short}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>
          {!providerReady ? (
            <Text style={styles.warning}>
              {meta.label} needs a token on the Windsage server before it can poll.
            </Text>
          ) : null}
            </>
          )}

          {simpleMode || provider !== 'windguru' ? null : (
            <>
              <Text style={[styles.label, styles.spaced]}>Type</Text>
              <View style={styles.segment}>
                {([
                  { key: 'spot', label: 'Spot' },
                  { key: 'station', label: 'Station' },
                ] as const).map((option) => {
                  const active = kind === option.key;
                  return (
                    <Pressable
                      key={option.key}
                      style={[styles.segmentItem, active && styles.segmentItemActive]}
                      onPress={() => {
                        void Haptics.selectionAsync();
                        setKind(option.key);
                        setLinkHint(null);
                        setWarning(null);
                      }}
                      disabled={busy}
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

          <Text style={[styles.label, styles.spaced]}>
            {simpleMode ? 'Name (optional)' : catalogPending ? 'Nickname (optional)' : 'Nickname'}
          </Text>
          <TextInput
            ref={nicknameInputRef}
            style={styles.input}
            value={nickname}
            onChangeText={(text) => {
              setNickname(text);
              if (error && text.trim()) setError(null);
            }}
            placeholder={
              pendingCatalog
                ? `Nickname for ${catalogLabel(pendingCatalog)}`
                : simpleMode
                  ? 'e.g. Home beach'
                  : 'Home reef / Spot name'
            }
            placeholderTextColor={colors.muted}
            autoFocus={provider !== 'location'}
            editable={!busy}
          />

          {provider === 'location' ? (
            <LocationPicker
              initial={locationPick}
              onPicked={(pick) => {
                setLocationPick(pick);
                setError(null);
                setPendingMembers(null);
              }}
            />
          ) : (
            <>
              <Text style={[styles.label, styles.spaced]}>
                {simpleMode ? 'Station number or link' : `${meta.label} URL or id`}
              </Text>
              <TextInput
                style={styles.input}
                value={stationId}
                onChangeText={applyIdText}
                placeholder={simpleMode ? 'e.g. 12345' : meta.placeholder}
                placeholderTextColor={colors.muted}
                autoCapitalize="none"
                autoCorrect={false}
                editable={!busy}
              />
            </>
          )}

          {simpleMode ? (
            <SimpleNotifyPicker rule={notifyRule} onChange={setNotifyRule} />
          ) : null}

          {provider === 'location' && pendingMembers?.length ? (
            <Text style={styles.linkHint}>
              Nearby: {pendingMembers.slice(0, 4).map((m) => m.name).join(' · ')}
            </Text>
          ) : null}
          {existingSuggestions.length > 0 ? (
            <View style={styles.suggestions}>
              <Text style={styles.suggestLabel}>Already following</Text>
              {existingSuggestions.map((follow) => (
                <Pressable
                  key={follow.id}
                  style={styles.suggestRow}
                  onPress={() => pickExisting(follow)}
                  disabled={busy}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.suggestName}>{windguruName(follow)}</Text>
                    <Text style={styles.suggestMeta}>
                      {PROVIDER_META[normalizeProvider(follow.provider)].short} ·{' '}
                      {followSourceRef(follow)}
                    </Text>
                  </View>
                  <Text style={styles.suggestOpen}>Open</Text>
                </Pressable>
              ))}
            </View>
          ) : null}

          {catalogSuggestions.length > 0 ? (
            <View style={styles.suggestions}>
              <Text style={styles.suggestLabel}>Catalog</Text>
              {catalogSuggestions.map((entry) => (
                <Pressable
                  key={`cat_${entry.provider}_${entry.stationId}`}
                  style={styles.suggestRow}
                  onPress={() => pickCatalog(entry)}
                  disabled={busy}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.suggestName}>{catalogLabel(entry)}</Text>
                    <Text style={styles.suggestMeta}>
                      {PROVIDER_META[normalizeProvider(entry.provider)].short} · #
                      {entry.stationId}
                    </Text>
                  </View>
                  <Text style={styles.suggestOpen}>Select</Text>
                </Pressable>
              ))}
            </View>
          ) : null}

          {linkHint ? <Text style={styles.linkHint}>{linkHint}</Text> : null}
          {warning ? <Text style={styles.warning}>{warning}</Text> : null}
          {error ? <Text style={styles.error}>{error}</Text> : null}

          <View style={styles.actions}>
            <Pressable style={styles.secondary} onPress={close} disabled={busy}>
              <Text style={styles.secondaryText}>Cancel</Text>
            </Pressable>
            <Pressable
              style={[styles.primary, addDisabled && styles.primaryDisabled]}
              onPress={() => void submit()}
              disabled={addDisabled}
            >
              {busy ? (
                <ActivityIndicator color="#042018" />
              ) : (
                <Text style={styles.primaryText}>{simpleMode ? 'Add station' : 'Add to home'}</Text>
              )}
            </Pressable>
          </View>
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
  sheet: {
    backgroundColor: colors.bgMid,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    padding: 20,
    paddingBottom: 34,
    gap: 8,
    borderWidth: 1,
    borderColor: colors.line,
    maxHeight: '92%',
  },
  title: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '800',
  },
  hint: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 6,
  },
  label: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  spaced: {
    marginTop: 8,
  },
  providerScroll: {
    marginHorizontal: -4,
  },
  providerRow: {
    flexDirection: 'row',
    gap: 6,
    paddingVertical: 2,
  },
  providerChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: colors.input,
    borderWidth: 1,
    borderColor: colors.line,
  },
  providerChipActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  providerChipMuted: {
    opacity: 0.55,
  },
  providerChipText: {
    color: colors.muted,
    fontWeight: '800',
    fontSize: 12,
  },
  providerChipTextActive: {
    color: '#042018',
  },
  sourceHint: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 16,
  },
  segment: {
    flexDirection: 'row',
    backgroundColor: colors.input,
    borderRadius: 10,
    padding: 3,
  },
  segmentItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
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
  suggestions: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.input,
    overflow: 'hidden',
  },
  suggestLabel: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 4,
  },
  suggestRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
  suggestName: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  suggestMeta: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 2,
  },
  suggestOpen: {
    color: colors.accent,
    fontWeight: '800',
    fontSize: 13,
  },
  linkHint: {
    color: colors.accent,
    fontSize: 12,
    lineHeight: 16,
  },
  warning: {
    color: '#E8B84A',
    fontSize: 12,
    lineHeight: 16,
  },
  error: {
    color: colors.danger,
    fontSize: 13,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  secondary: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
  },
  secondaryText: {
    color: colors.muted,
    fontWeight: '700',
  },
  primary: {
    flex: 1.2,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: colors.accent,
    minHeight: 48,
  },
  primaryDisabled: {
    opacity: 0.7,
  },
  primaryText: {
    color: '#042018',
    fontWeight: '800',
  },
});
