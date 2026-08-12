import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { colors } from '../shared/theme';
import type { WindguruKind } from '../shared/types';
import { followTargetForKind, normalizeWindguruFollowInput, parseWindguruRef } from '../core/windguru';

type Props = {
  visible: boolean;
  onClose: () => void;
  onSave: (stationId: string, nickname: string, kind: WindguruKind) => void;
  existingIds: string[];
};

export function AddStationModal({ visible, onClose, onSave, existingIds }: Props) {
  const [stationId, setStationId] = useState('');
  const [nickname, setNickname] = useState('');
  const [kind, setKind] = useState<WindguruKind>('station');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [linkHint, setLinkHint] = useState<string | null>(null);

  const reset = () => {
    setStationId('');
    setNickname('');
    setKind('station');
    setError(null);
    setBusy(false);
    setLinkHint(null);
  };

  const close = () => {
    reset();
    onClose();
  };

  const applyIdText = (text: string) => {
    setStationId(text);
    setError(null);
    setLinkHint(null);
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
    try {
      const resolved = await normalizeWindguruFollowInput(stationId);
      const target = followTargetForKind(kind, resolved);

      if (
        existingIds.includes(target.stationId) ||
        existingIds.includes(resolved.inputId) ||
        existingIds.includes(resolved.liveStationId)
      ) {
        setError('You already follow this spot or station');
        return;
      }
      const name =
        nickname.trim() ||
        target.spotName ||
        (target.kind === 'spot' ? `Spot ${target.stationId}` : '');
      if (kind === 'station' && resolved.kind === 'spot') {
        setLinkHint(
          `Spot ${resolved.inputId} → live station ${resolved.liveStationId} (you chose Station)`,
        );
      } else if (kind === 'spot' && resolved.kind === 'station') {
        setLinkHint(`#${resolved.inputId} is a live station — saved as Station`);
      }
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onSave(target.stationId, name, target.kind);
      reset();
    } catch (e) {
      // If resolve fails but the user picked Spot, still allow following by ID.
      if (kind === 'spot') {
        const id = parsed.id;
        if (existingIds.includes(id)) {
          setError('You already follow this spot or station');
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
            Choose spot or live station, then paste a Windguru URL or number. Your ID is kept as
            entered — spots are not rewritten to a station unless you pick Station.
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

          <Text style={[styles.label, styles.spaced]}>Windguru ID or URL</Text>
          <TextInput
            style={styles.input}
            value={stationId}
            onChangeText={applyIdText}
            placeholder={
              kind === 'spot'
                ? 'e.g. 910318 or https://www.windguru.cz/910318'
                : 'e.g. 2259 or https://www.windguru.cz/station/2259'
            }
            placeholderTextColor={colors.muted}
            autoCapitalize="none"
            autoCorrect={false}
            editable={!busy}
          />
          {linkHint ? <Text style={styles.linkHint}>{linkHint}</Text> : null}
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
  linkHint: {
    color: colors.accent,
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
