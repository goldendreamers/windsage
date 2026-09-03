import * as Haptics from 'expo-haptics';
import { useEffect } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { startWindAlarmAudio, stopWindAlarmAudio } from '../core/windAlarmAudio';

export type WindAlarmState = {
  title: string;
  body: string;
  via: 'native' | 'discord';
  followId?: string | null;
};

type Props = {
  alarm: WindAlarmState | null;
  onStop: () => void;
};

export function WindAlarmOverlay({ alarm, onStop }: Props) {
  const native = alarm?.via !== 'discord';

  useEffect(() => {
    if (!alarm) {
      stopWindAlarmAudio();
      return;
    }
    if (native) void startWindAlarmAudio();
    else stopWindAlarmAudio();
    return () => stopWindAlarmAudio();
  }, [alarm, native]);

  if (!alarm) return null;

  return (
    <Modal visible animationType="fade" transparent onRequestClose={onStop}>
      <View style={styles.wrap} accessibilityRole="alert">
        <Text style={styles.kicker}>Wake me up</Text>
        <Text style={styles.title}>{alarm.title || 'Wind is up'}</Text>
        <Text style={styles.body}>{alarm.body}</Text>
        <Text style={styles.via}>
          {native
            ? 'Ringing on this phone until you stop it. Unmute the ringer.'
            : 'Discord is calling you in a private voice channel until you stop it. Join that call, then tap Stop.'}
        </Text>
        <Pressable
          style={styles.stop}
          onPress={() => {
            void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            stopWindAlarmAudio();
            onStop();
          }}
          accessibilityRole="button"
          accessibilityLabel="Stop ringing"
        >
          <Text style={styles.stopText}>Stop ringing</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    backgroundColor: '#3a0c10',
    paddingHorizontal: 24,
    paddingTop: 72,
    paddingBottom: 40,
    justifyContent: 'center',
    gap: 14,
  },
  kicker: {
    color: '#F7C6C6',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  title: {
    color: '#fff',
    fontSize: 32,
    fontWeight: '800',
    lineHeight: 38,
  },
  body: {
    color: '#F3DADA',
    fontSize: 17,
    lineHeight: 24,
  },
  via: {
    color: '#E8B4B4',
    fontSize: 14,
    lineHeight: 20,
  },
  stop: {
    marginTop: 18,
    backgroundColor: '#fff',
    borderRadius: 16,
    paddingVertical: 18,
    alignItems: 'center',
  },
  stopText: {
    color: '#3a0c10',
    fontWeight: '800',
    fontSize: 18,
  },
});
