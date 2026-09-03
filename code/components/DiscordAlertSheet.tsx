import * as Haptics from 'expo-haptics';
import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { CloudUser } from '../core/cloud';
import { fetchAuthProviders, fetchMe, startDiscordAlertLink, unlinkDiscordAlert } from '../core/cloud';
import { DiscordAlertPanel } from './DiscordAlertPanel';
import { colors } from '../shared/theme';

type Props = {
  visible: boolean;
  signedIn: boolean;
  onClose: () => void;
  onSignIn: () => void;
  onUser?: (user: CloudUser) => void;
};

export function DiscordAlertSheet({ visible, signedIn, onClose, onSignIn, onUser }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [linked, setLinked] = useState(false);
  const [username, setUsername] = useState<string | null>(null);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setError(null);
    let cancelled = false;
    (async () => {
      const [me, prov] = await Promise.all([
        signedIn ? fetchMe().catch(() => null) : Promise.resolve(null),
        fetchAuthProviders().catch(() => null),
      ]);
      if (cancelled) return;
      setInviteUrl(prov?.discordInvite || null);
      setLinked(!!me?.discordAlert?.linked);
      setUsername(me?.discordAlert?.username || null);
      if (me) onUser?.(me);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refresh when sheet opens
  }, [visible, signedIn]);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={styles.dismiss} onPress={onClose} accessibilityLabel="Close" />
        <ScrollView
          style={styles.sheet}
          contentContainerStyle={styles.sheetInner}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.title}>Link Discord</Text>
          <Text style={styles.sub}>How to attach your Discord user to this Windsage account</Text>
          <DiscordAlertPanel
            signedIn={signedIn}
            linked={linked}
            username={username}
            code={code}
            busy={busy}
            inviteUrl={inviteUrl}
            onSignIn={() => {
              onClose();
              onSignIn();
            }}
            onGetCode={() => {
              void (async () => {
                setBusy(true);
                setError(null);
                try {
                  const started = await startDiscordAlertLink();
                  setCode(started.code);
                } catch (e) {
                  setError(e instanceof Error ? e.message : 'Could not get a code');
                } finally {
                  setBusy(false);
                }
              })();
            }}
            onUnlink={() => {
              void (async () => {
                setBusy(true);
                setError(null);
                try {
                  const next = await unlinkDiscordAlert();
                  setLinked(!!next?.linked);
                  setUsername(next?.username || null);
                  setCode(null);
                  const me = await fetchMe().catch(() => null);
                  if (me) onUser?.(me);
                } catch (e) {
                  setError(e instanceof Error ? e.message : 'Could not unlink');
                } finally {
                  setBusy(false);
                }
              })();
            }}
          />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Pressable
            style={styles.close}
            onPress={() => {
              void Haptics.selectionAsync();
              onClose();
            }}
            accessibilityRole="button"
          >
            <Text style={styles.closeText}>Close</Text>
          </Pressable>
        </ScrollView>
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
  dismiss: { flex: 1 },
  sheet: {
    maxHeight: '92%',
    backgroundColor: colors.bgMid,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderWidth: 1,
    borderColor: colors.line,
  },
  sheetInner: {
    padding: 20,
    paddingBottom: 34,
    gap: 12,
  },
  title: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '800',
  },
  sub: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: 21,
    marginTop: -4,
  },
  error: { color: colors.danger, fontSize: 13 },
  close: {
    marginTop: 4,
    alignItems: 'center',
    paddingVertical: 12,
  },
  closeText: {
    color: colors.muted,
    fontWeight: '700',
    fontSize: 15,
  },
});
