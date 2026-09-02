import * as Haptics from 'expo-haptics';
import { useEffect, useState } from 'react';
import { Linking, Modal, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { openDeveloperEmail, openWindsageKofi } from '../core/contact';
import { colors, paletteForMode } from '../shared/theme';

const PRIVACY_URL = 'https://windsage.nimrod.bio/privacy.html';

type MenuSection = 'main' | 'about';

type Row = { key: string; label: string; sub?: string; onPress: () => void };

type Props = {
  visible: boolean;
  accountLabel?: string;
  simpleMode?: boolean;
  onToggleSimple?: (on: boolean) => void;
  onClose: () => void;
  onAccount?: () => void;
  onInstall?: () => void;
  onUpdate?: () => void;
};

export function AppMenu({
  visible,
  accountLabel,
  simpleMode = false,
  onToggleSimple,
  onClose,
  onAccount,
  onInstall,
  onUpdate,
}: Props) {
  const [section, setSection] = useState<MenuSection>('main');
  const palette = paletteForMode(simpleMode);

  useEffect(() => {
    if (!visible) setSection('main');
  }, [visible]);

  const run = (fn: () => void) => {
    void Haptics.selectionAsync();
    onClose();
    fn();
  };

  const openAbout = () => {
    void Haptics.selectionAsync();
    setSection('about');
  };

  const youRows: Row[] = [];
  if (onAccount) {
    youRows.push({
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

  const appRows: Row[] = [];
  if (onInstall) {
    appRows.push({
      key: 'install',
      label: simpleMode ? 'Put on home screen' : 'Install app',
      sub: simpleMode ? undefined : 'Downloads the app onto this phone',
      onPress: () => run(onInstall),
    });
  }
  if (onUpdate) {
    appRows.push({
      key: 'update',
      label: 'Update Windsage',
      sub: simpleMode ? undefined : 'Gets the latest without deleting the app',
      onPress: () => run(onUpdate),
    });
  }

  const aboutRows: Row[] = [
    {
      key: 'support',
      label: 'Support Windsage',
      sub: simpleMode ? undefined : 'Keeps the app running',
      onPress: () => run(openWindsageKofi),
    },
  ];
  if (!simpleMode) {
    aboutRows.push({
      key: 'email',
      label: 'Email the developer',
      sub: 'Opens Gmail',
      onPress: () => run(openDeveloperEmail),
    });
  }
  aboutRows.push({
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

  const renderRows = (rows: Row[]) =>
    rows.map((row) => (
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
    ));

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={styles.dismiss} onPress={onClose} accessibilityLabel="Close menu" />
        <View style={[styles.sheet, { backgroundColor: palette.bgMid, borderColor: palette.line }]}>
          {section === 'about' ? (
            <>
              <Pressable
                style={styles.backRow}
                onPress={() => {
                  void Haptics.selectionAsync();
                  setSection('main');
                }}
                accessibilityRole="button"
                accessibilityLabel="Back to menu"
              >
                <Text style={[styles.backText, { color: palette.accent }]}>‹ Menu</Text>
              </Pressable>
              <Text style={styles.title}>About</Text>
              {renderRows(aboutRows)}
            </>
          ) : (
            <>
              <Text style={styles.title}>Menu</Text>
              <Text style={styles.section}>You</Text>
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
                    trackColor={{ false: palette.input, true: palette.accent }}
                    thumbColor="#fff"
                    accessibilityLabel="Simple mode"
                  />
                </View>
              ) : null}
              {renderRows(youRows)}
              {appRows.length ? (
                <>
                  <Text style={styles.section}>App</Text>
                  {renderRows(appRows)}
                </>
              ) : null}
              <Text style={styles.section}>More</Text>
              <Pressable
                style={styles.row}
                onPress={openAbout}
                accessibilityRole="button"
                accessibilityLabel="About"
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>About</Text>
                  {simpleMode ? null : (
                    <Text style={styles.sub}>Support, email, privacy</Text>
                  )}
                </View>
                <Text style={styles.chevron}>›</Text>
              </Pressable>
            </>
          )}
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
  backRow: {
    alignSelf: 'flex-start',
    paddingVertical: 4,
    marginBottom: 4,
  },
  backText: {
    color: colors.accent,
    fontWeight: '700',
    fontSize: 15,
  },
  section: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginTop: 12,
    marginBottom: 2,
    paddingHorizontal: 4,
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
