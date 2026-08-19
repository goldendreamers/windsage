import * as Haptics from 'expo-haptics';
import { Linking, Modal, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { openDeveloperEmail } from '../core/contact';
import { colors } from '../shared/theme';

const PRIVACY_URL = 'https://windsage.nimrod.bio/privacy.html';

type Props = {
  visible: boolean;
  accountLabel?: string;
  simpleMode?: boolean;
  onToggleSimple?: (on: boolean) => void;
  onClose: () => void;
  onFollow: () => void;
  onAccount?: () => void;
  onInstall?: () => void;
};

export function AppMenu({
  visible,
  accountLabel,
  simpleMode = false,
  onToggleSimple,
  onClose,
  onFollow,
  onAccount,
  onInstall,
}: Props) {
  const run = (fn: () => void) => {
    void Haptics.selectionAsync();
    onClose();
    fn();
  };

  const rows: { key: string; label: string; sub?: string; onPress: () => void }[] = [
    {
      key: 'follow',
      label: simpleMode ? 'Add a station' : 'Follow a station',
      sub: simpleMode ? undefined : 'Windguru, map pin, NDBC, and more',
      onPress: () => run(onFollow),
    },
  ];
  if (onAccount) {
    rows.push({
      key: 'account',
      label: simpleMode ? 'Sign in' : 'Account',
      sub:
        accountLabel && accountLabel !== 'Account'
          ? accountLabel
          : simpleMode
            ? undefined
            : 'Sign in or guest',
      onPress: () => run(onAccount),
    });
  }
  if (onInstall) {
    rows.push({
      key: 'install',
      label: simpleMode ? 'Put on home screen' : 'Install app',
      sub: simpleMode ? undefined : 'Downloads the app onto this phone',
      onPress: () => run(onInstall),
    });
  }
  if (!simpleMode) {
    rows.push({
      key: 'email',
      label: 'Email the developer',
      sub: 'Opens Gmail',
      onPress: () => run(openDeveloperEmail),
    });
  }
  rows.push({
    key: 'privacy',
    label: 'Privacy',
    onPress: () =>
      run(() => {
        const url =
          typeof window !== 'undefined' && window.location?.origin
            ? `${window.location.origin}/privacy.html`
            : PRIVACY_URL;
        void Linking.openURL(url);
      }),
  });

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={styles.dismiss} onPress={onClose} accessibilityLabel="Close menu" />
        <View style={styles.sheet}>
          <Text style={styles.title}>Menu</Text>
          {onToggleSimple ? (
            <View style={styles.toggleRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>Simple mode</Text>
                {simpleMode ? null : (
                  <Text style={styles.sub}>Off — all options. Turn on to hide extras.</Text>
                )}
              </View>
              <Switch
                value={simpleMode}
                onValueChange={(on) => {
                  void Haptics.selectionAsync();
                  onToggleSimple(on);
                }}
                trackColor={{ false: '#23404C', true: colors.accent }}
                thumbColor="#fff"
                accessibilityLabel="Simple mode"
              />
            </View>
          ) : null}
          {rows.map((row) => (
            <Pressable
              key={row.key}
              style={styles.row}
              onPress={row.onPress}
              accessibilityRole="button"
              accessibilityLabel={row.label}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>{row.label}</Text>
                {row.sub ? <Text style={styles.sub}>{row.sub}</Text> : null}
              </View>
              <Text style={styles.chevron}>›</Text>
            </Pressable>
          ))}
          <Pressable style={styles.close} onPress={onClose}>
            <Text style={styles.closeText}>Close</Text>
          </Pressable>
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
  dismiss: {
    flex: 1,
  },
  sheet: {
    backgroundColor: colors.bgMid,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    padding: 20,
    paddingBottom: 34,
    gap: 4,
    borderWidth: 1,
    borderColor: colors.line,
  },
  title: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '800',
    marginBottom: 8,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
    gap: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
    gap: 12,
  },
  label: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  sub: {
    color: colors.muted,
    fontSize: 14,
    marginTop: 2,
  },
  chevron: {
    color: colors.muted,
    fontSize: 24,
    fontWeight: '300',
  },
  close: {
    marginTop: 10,
    alignItems: 'center',
    paddingVertical: 12,
  },
  closeText: {
    color: colors.muted,
    fontWeight: '700',
    fontSize: 15,
  },
});
