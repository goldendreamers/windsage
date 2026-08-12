import * as Haptics from 'expo-haptics';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { CloudUser } from '../core/cloud';
import {
  fetchAuthProviders,
  fetchMe,
  loginAccount,
  logoutAccount,
  registerAccount,
  startGoogleSignIn,
} from '../core/cloud';
import { colors } from '../shared/theme';
import { Section } from '../components/Section';

type Props = {
  onBack: () => void;
  onAuthed: (payload: {
    user: CloudUser;
    stations: import('../shared/types').FollowedStation[];
    pollIntervalMinutes: number;
  }) => void;
  onLoggedOut: () => void;
};

export function AccountScreen({ onBack, onAuthed, onLoggedOut }: Props) {
  const [user, setUser] = useState<CloudUser | null>(null);
  const [providers, setProviders] = useState({ google: false, facebook: false, apple: false });
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [me, prov] = await Promise.all([
          fetchMe().catch(() => null),
          fetchAuthProviders().catch(() => ({ google: false, facebook: false, apple: false })),
        ]);
        if (cancelled) return;
        setUser(me);
        setProviders(prov);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={styles.scroll}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <Pressable style={styles.back} onPress={onBack}>
        <Text style={styles.backText}>‹ Home</Text>
      </Pressable>

      <Text style={styles.title}>Account</Text>
      <Text style={styles.sub}>
        Optional. Sign in to sync stations across phones and browsers. Guest mode still works —
        all data stays on your Wald home server.
      </Text>

      {user ? (
        <Section title="Signed in" icon="station">
          <Text style={styles.label}>
            {user.username ? `@${user.username}` : user.sso.google?.email || 'SSO account'}
          </Text>
          <Text style={styles.hint}>
            Google: {user.sso.google?.linked ? user.sso.google.email || 'linked' : 'not linked'}
          </Text>
          {providers.google && !user.sso.google?.linked ? (
            <Pressable
              style={[styles.btn, styles.btnSecondary, busy && styles.btnDisabled]}
              disabled={busy}
              onPress={() => void run(async () => startGoogleSignIn('link'))}
            >
              <Text style={styles.btnSecondaryText}>Link Google</Text>
            </Pressable>
          ) : null}
          <Pressable
            style={[styles.btn, styles.btnDanger, busy && styles.btnDisabled]}
            disabled={busy}
            onPress={() =>
              void run(async () => {
                await logoutAccount();
                setUser(null);
                onLoggedOut();
              })
            }
          >
            <Text style={styles.btnDangerText}>Log out</Text>
          </Pressable>
        </Section>
      ) : (
        <>
          <Section title="Username & password" icon="bell">
            <Text style={styles.label}>Username</Text>
            <TextInput
              style={styles.input}
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="yourname"
              placeholderTextColor={colors.muted}
            />
            <Text style={[styles.label, styles.spaced]}>Password</Text>
            <TextInput
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              placeholder="min 8 characters"
              placeholderTextColor={colors.muted}
            />
            <View style={styles.row}>
              <Pressable
                style={[styles.btn, styles.btnPrimary, busy && styles.btnDisabled, { flex: 1 }]}
                disabled={busy}
                onPress={() =>
                  void run(async () => {
                    const data = await loginAccount(username.trim(), password);
                    setUser(data.user);
                    onAuthed(data);
                  })
                }
              >
                <Text style={styles.btnPrimaryText}>Log in</Text>
              </Pressable>
              <Pressable
                style={[styles.btn, styles.btnSecondary, busy && styles.btnDisabled, { flex: 1 }]}
                disabled={busy}
                onPress={() =>
                  void run(async () => {
                    const data = await registerAccount(username.trim(), password);
                    setUser(data.user);
                    onAuthed(data);
                  })
                }
              >
                <Text style={styles.btnSecondaryText}>Create</Text>
              </Pressable>
            </View>
          </Section>

          <Section title="Single sign-on" icon="wind">
            {providers.google ? (
              <Pressable
                style={[styles.btn, styles.btnPrimary, busy && styles.btnDisabled]}
                disabled={busy}
                onPress={() => void run(async () => startGoogleSignIn('login'))}
              >
                <Text style={styles.btnPrimaryText}>Continue with Google</Text>
              </Pressable>
            ) : (
              <Text style={styles.hint}>
                Google sign-in is not configured on Wald yet (set GOOGLE_CLIENT_ID /
                GOOGLE_CLIENT_SECRET). Username & password still work.
              </Text>
            )}
            {providers.facebook ? (
              <Text style={styles.hint}>Facebook available when configured.</Text>
            ) : null}
            {providers.apple ? (
              <Text style={styles.hint}>Apple available when configured.</Text>
            ) : null}
          </Section>

          <Pressable style={styles.guest} onPress={onBack}>
            <Text style={styles.guestText}>Continue as guest</Text>
          </Pressable>
        </>
      )}

      {error ? <Text style={styles.error}>{error}</Text> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  scroll: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 44,
    gap: 14,
  },
  back: { alignSelf: 'flex-start', paddingVertical: 4 },
  backText: { color: colors.accent, fontSize: 16, fontWeight: '700' },
  title: { color: colors.text, fontSize: 28, fontWeight: '800' },
  sub: { color: colors.muted, fontSize: 14, lineHeight: 20 },
  label: { color: colors.text, fontSize: 14, fontWeight: '600' },
  spaced: { marginTop: 8 },
  hint: { color: colors.muted, fontSize: 13, lineHeight: 18 },
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
  row: { flexDirection: 'row', gap: 10, marginTop: 12 },
  btn: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 10,
  },
  btnPrimary: { backgroundColor: colors.accent },
  btnPrimaryText: { color: colors.bg, fontWeight: '800', fontSize: 15 },
  btnSecondary: {
    backgroundColor: colors.input,
    borderWidth: 1,
    borderColor: colors.line,
  },
  btnSecondaryText: { color: colors.text, fontWeight: '700', fontSize: 15 },
  btnDanger: {
    backgroundColor: colors.warnDim,
    borderWidth: 1,
    borderColor: colors.danger,
  },
  btnDangerText: { color: colors.danger, fontWeight: '700', fontSize: 15 },
  btnDisabled: { opacity: 0.55 },
  guest: { alignItems: 'center', paddingVertical: 12 },
  guestText: { color: colors.muted, fontWeight: '600' },
  error: { color: colors.danger, fontSize: 13, textAlign: 'center' },
});
