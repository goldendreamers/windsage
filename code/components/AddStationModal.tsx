import * as Haptics from 'expo-haptics';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  DEFAULT_RULE,
  type CatalogStation,
  findExistingFollow,
  suggestCatalogStations,
  suggestExistingFollows,
  windguruName,
} from '../shared/defaults';
import { colors } from '../shared/theme';
import type { FollowedStation, WindguruKind } from '../shared/types';
import { followTargetForKind, normalizeWindguruFollowInput, parseWindguruRef } from '../core/windguru';

type Props = {
  visible: boolean;
  onClose: () => void;
  onSave: (
    stationId: string,
    nickname: string,
    kind: WindguruKind,
    extras?: Pick<
      FollowedStation,
      'liveStationId' | 'linkedLiveStation' | 'liveLinkWarning' | 'sourceName'
    >,
  ) => void;
  onReuse: (followId: string) => void;
  existingStations: FollowedStation[];
  catalogStations?: CatalogStation[];
};

export function AddStationModal({
  visible,
  onClose,
  onSave,
  onReuse,
  existingStations,
  catalogStations = [],
}: Props) {
  const [stationId, setStationId] = useState('');
  const [nickname, setNickname] = useState('');
  const [kind, setKind] = useState<WindguruKind>('station');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [linkHint, setLinkHint] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  const existingSuggestions = useMemo(
    () => suggestExistingFollows(existingStations, stationId),
    [existingStations, stationId],
  );
  const catalogSuggestions = useMemo(
    () => suggestCatalogStations(catalogStations, existingStations, stationId),
    [catalogStations, existingStations, stationId],
  );

  const reset = () => {
    setStationId('');
    setNickname('');
    setKind('station');
    setError(null);
    setBusy(false);
    setLinkHint(null);
    setWarning(null);
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

  const pickCatalog = (entry: CatalogStation) => {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const name =
      nickname.trim() ||
      entry.sourceName?.trim() ||
      (entry.kind === 'spot' ? `Spot ${entry.stationId}` : `Station ${entry.stationId}`);
    reset();
    onSave(entry.stationId, name, entry.kind, {
      sourceName: entry.sourceName ?? null,
      liveStationId: entry.liveStationId ?? null,
      linkedLiveStation: entry.linkedLiveStation ?? null,
      liveLinkWarning: entry.liveLinkWarning ?? null,
    });
  };

  const catalogLabel = (entry: CatalogStation) =>
    windguruName({
      id: `catalog_${entry.stationId}`,
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

  const applyIdText = (text: string) => {
    setStationId(text);
    setError(null);
    setLinkHint(null);
    setWarning(null);
    const ref = parseWindguruRef(text);
    if (ref?.kindHint) setKind(ref.kindHint);
  };

  const submit = async () => {
    const parsed = parseWindguruRef(stationId);
    if (!parsed) {
      setError('Paste a Windguru URL or number (spot or station)');
      return;
    }
    setBusy(true);
    setError(null);
    setLinkHint(null);
    setWarning(null);
    try {
      const resolved = await normalizeWindguruFollowInput(stationId);
      const target = followTargetForKind(kind, resolved);

      const existing = findExistingFollow(existingStations, {
        stationId: target.stationId,
      });
      if (existing) {
        void Haptics.selectionAsync();
        reset();
        onReuse(existing.id);
        return;
      }

      const sourceName =
        target.spotName?.trim() ||
        target.linkedLiveStation?.spotname?.trim() ||
        target.linkedLiveStation?.name?.trim() ||
        null;
      const name = nickname.trim() || sourceName || '';
      if (kind === 'station' && resolved.kind === 'spot' && resolved.hasLiveStation) {
        setLinkHint(
          `Spot ${resolved.inputId} → live station ${resolved.liveStationId} (you chose Station)`,
        );
      } else if (kind === 'spot' && resolved.kind === 'station') {
        setLinkHint(`#${resolved.inputId} is a live station — saved as Station`);
      }
      if (target.liveLinkWarning) {
        setWarning(target.liveLinkWarning);
      }
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onSave(target.stationId, name, target.kind, {
        liveStationId: target.liveStationId,
        linkedLiveStation: target.linkedLiveStation,
        liveLinkWarning: target.liveLinkWarning,
        sourceName,
      });
      reset();
    } catch (e) {
      if (kind === 'spot') {
        const id = parsed.id;
        const existing = findExistingFollow(existingStations, {
          stationId: id,
          inputId: id,
        });
        if (existing) {
          void Haptics.selectionAsync();
          reset();
          onReuse(existing.id);
          return;
        }
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        onSave(id, nickname.trim() || `Spot ${id}`, 'spot');
        reset();
        return;
      }
      setError(e instanceof Error ? e.message : 'Could not resolve Windguru ID');
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={close}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <Text style={styles.title}>Follow Windguru</Text>
          <Text style={styles.hint}>
            Choose spot or live station, then paste a Windguru URL or number. Matching follows you
            already have open instead of duplicating. House catalog spots appear as suggestions
            only — they are not added until you pick one.
          </Text>

          <Text style={styles.label}>Type</Text>
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

          <Text style={[styles.label, styles.spaced]}>Nickname</Text>
          <TextInput
            style={styles.input}
            value={nickname}
            onChangeText={setNickname}
            placeholder="Home reef / Spot name"
            placeholderTextColor={colors.muted}
            autoFocus
            editable={!busy}
          />

          <Text style={[styles.label, styles.spaced]}>Windguru URL or number</Text>
          <TextInput
            style={styles.input}
            value={stationId}
            onChangeText={applyIdText}
            placeholder={
              kind === 'spot'
                ? 'https://www.windguru.cz/377929 or 910318'
                : 'https://www.windguru.cz/station/2259 or 2259'
            }
            placeholderTextColor={colors.muted}
            autoCapitalize="none"
            autoCorrect={false}
            editable={!busy}
          />

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
                      {follow.kind === 'spot' ? 'Spot' : 'Station'} #{follow.stationId}
                      {follow.liveStationId && follow.liveStationId !== follow.stationId
                        ? ` · live #${follow.liveStationId}`
                        : ''}
                    </Text>
                  </View>
                  <Text style={styles.suggestOpen}>Open</Text>
                </Pressable>
              ))}
            </View>
          ) : null}

          {catalogSuggestions.length > 0 ? (
            <View style={styles.suggestions}>
              <Text style={styles.suggestLabel}>Suggested from house catalog</Text>
              {catalogSuggestions.map((entry) => (
                <Pressable
                  key={`cat_${entry.stationId}`}
                  style={styles.suggestRow}
                  onPress={() => pickCatalog(entry)}
                  disabled={busy}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.suggestName}>{catalogLabel(entry)}</Text>
                    <Text style={styles.suggestMeta}>
                      {entry.kind === 'spot' ? 'Spot' : 'Station'} #{entry.stationId}
                      {entry.liveStationId && entry.liveStationId !== entry.stationId
                        ? ` · live #${entry.liveStationId}`
                        : ''}
                    </Text>
                  </View>
                  <Text style={styles.suggestOpen}>Add</Text>
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
              style={[styles.primary, busy && styles.primaryDisabled]}
              onPress={() => void submit()}
              disabled={busy}
            >
              {busy ? (
                <ActivityIndicator color="#042018" />
              ) : (
                <Text style={styles.primaryText}>Add to home</Text>
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
