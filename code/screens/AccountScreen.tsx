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
import type { CloudUser, SsoProvider } from '../core/cloud';
import {
  CloudError,
  fetchAuthProviders,
  fetchMe,
  loginAccount,
  logoutAccount,
  pullMyStations,
  registerAccount,
  sendTestPhoneAlert,
  ssoAccountLabel,
  startSsoSignIn,
} from '../core/cloud';
import { colors } from '../shared/theme';
import { Section } from '../components/Section';
import { registerWebPushSubscription, ensureNotificationPermissions, isInstalledPwa } from '../core/notifications';
import { isRunningAsInstalledApp } from '../core/pwaInstall';

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
  const [nameSuggestions, setNameSuggestions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [phoneAlertMsg, setPhoneAlertMsg] = useState<string | null>(null);

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

  async function finishSso(provider: SsoProvider, mode: 'login' | 'link') {
    const result = await startSsoSignIn(provider, mode);
    // Web navigates away; native AuthSession returns here.
    if (!result) return;
    if (result.error) throw new Error(result.error);
    const label = provider === 'google' ? 'Google' : provider === 'facebook' ? 'Facebook' : 'Apple';
    if (!result.token) throw new Error(`${label} sign-in returned no session`);
    const me = await fetchMe();
    if (!me) throw new Error('Signed in but could not load account');
    if (mode === 'link') {
      setUser(me);
      return;
    }
    const pulled = await pullMyStations();
    onAuthed({
      user: me,
      stations: pulled?.stations || [],
      pollIntervalMinutes: pulled?.pollIntervalMinutes || 10,
    });
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
            {user.username ? `@${user.username}` : ssoAccountLabel(user, 'SSO account')}
          </Text>
          <Text style={styles.hint}>
            Google: {user.sso.google?.linked ? user.sso.google.email || 'linked' : 'not linked'}
          </Text>
          <Text style={styles.hint}>
            Facebook: {user.sso.facebook?.linked ? user.sso.facebook.email || 'linked' : 'not linked'}
          </Text>
          <Text style={styles.hint}>
            Apple: {user.sso.apple?.linked ? user.sso.apple.email || 'linked' : 'not linked'}
          </Text>
          {providers.google && !user.sso.google?.linked ? (
            <Pressable
              style={[styles.btn, styles.btnSecondary, busy && styles.btnDisabled]}
              disabled={busy}
              onPress={() => void run(async () => finishSso('google', 'link'))}
            >
              <Text style={styles.btnSecondaryText}>Link Google</Text>
            </Pressable>
          ) : null}
          {providers.facebook && !user.sso.facebook?.linked ? (
            <Pressable
              style={[styles.btn, styles.btnSecondary, busy && styles.btnDisabled]}
              disabled={busy}
              onPress={() => void run(async () => finishSso('facebook', 'link'))}
            >
              <Text style={styles.btnSecondaryText}>Link Facebook</Text>
            </Pressable>
          ) : null}
          {providers.apple && !user.sso.apple?.linked ? (
            <Pressable
              style={[styles.btn, styles.btnSecondary, busy && styles.btnDisabled]}
              disabled={busy}
              onPress={() => void run(async () => finishSso('apple', 'link'))}
            >
              <Text style={styles.btnSecondaryText}>Link Apple</Text>
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
              onChangeText={(text) => {
                setUsername(text);
                setNameSuggestions([]);
              }}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="yourname"
              placeholderTextColor={colors.muted}
            />
            {nameSuggestions.length > 0 ? (
              <View style={styles.suggestWrap}>
                <Text style={styles.hint}>Try one of these instead:</Text>
                <View style={styles.suggestRow}>
                  {nameSuggestions.map((name) => (
                    <Pressable
                      key={name}
                      style={styles.suggestChip}
                      onPress={() => {
                        void Haptics.selectionAsync();
                        setUsername(name);
                        setNameSuggestions([]);
                        setError(null);
                      }}
                    >
                      <Text style={styles.suggestChipText}>{name}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            ) : null}
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
                    setNameSuggestions([]);
                    try {
                      const data = await registerAccount(username.trim(), password);
                      setUser(data.user);
                      onAuthed(data);
                    } catch (e) {
                      if (e instanceof CloudError && e.suggestions?.length) {
                        setNameSuggestions(e.suggestions.slice(0, 2));
                      }
                      throw e;
                    }
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
                onPress={() => void run(async () => finishSso('google', 'login'))}
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
              <Pressable
                style={[styles.btn, styles.btnSecondary, busy && styles.btnDisabled]}
                disabled={busy}
                onPress={() => void run(async () => finishSso('facebook', 'login'))}
              >
                <Text style={styles.btnSecondaryText}>Continue with Facebook</Text>
              </Pressable>
            ) : null}
            {providers.apple ? (
              <Pressable
                style={[styles.btn, styles.btnSecondary, busy && styles.btnDisabled]}
                disabled={busy}
                onPress={() => void run(async () => finishSso('apple', 'login'))}
              >
                <Text style={styles.btnSecondaryText}>Continue with Apple</Text>
              </Pressable>
            ) : null}
          </Section>

          <Pressable style={styles.guest} onPress={onBack}>
            <Text style={styles.guestText}>Continue as guest</Text>
          </Pressable>
        </>
      )}

      <Section
        title="Phone alerts"
        icon="bell"
        hint="Must wake the lock screen — not only after you open the phone."
      >
        {!isInstalledPwa() && !isRunningAsInstalledApp() ? (
          <Text style={[styles.hint, styles.warnHint]}>
            Open Windsage from the home-screen icon (installed app), not a Chrome tab. Lock-screen
            wake is unreliable in a normal browser tab.
          </Text>
        ) : (
          <Text style={styles.hint}>Running as installed app ✓</Text>
        )}
        <Text style={styles.hint}>
          Android (required for alerts while locked):{'\n'}
          1. Settings → Apps → Windsage (and Chrome) → Battery → Unrestricted{'\n'}
          2. Notifications → Lock screen → Show all / Alerting{'\n'}
          3. Turn Adaptive Battery off if alerts still wait for unlock{'\n'}
          Then lock the phone, wait 30s, and tap the test below.
        </Text>
        <Pressable
          style={[styles.btn, styles.btnPrimary, busy && styles.btnDisabled]}
          disabled={busy}
          onPress={() =>
            void run(async () => {
              setPhoneAlertMsg(null);
              const allowed = await ensureNotificationPermissions();
              if (!allowed) {
                throw new CloudError(
                  'Notifications are blocked. Enable them in phone settings for Windsage / Chrome.',
                  400,
                );
              }
              await registerWebPushSubscription();
              const result = await sendTestPhoneAlert();
              const lockHint =
                !isInstalledPwa() && !isRunningAsInstalledApp()
                  ? ' Tip: install + open from home screen, then set Battery → Unrestricted.'
                  : ' Keep the phone locked — it should buzz without unlocking.';
              setPhoneAlertMsg(
                result.delivered > 0
                  ? `Test sent.${lockHint}`
                  : 'Nothing was delivered.',
              );
              void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            })
          }
        >
          <Text style={styles.btnPrimaryText}>Send test phone alert</Text>
        </Pressable>
        {phoneAlertMsg ? <Text style={styles.hint}>{phoneAlertMsg}</Text> : null}
      </Section>

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
  warnHint: { color: '#E8B84A' },
  suggestWrap: { gap: 8, marginTop: 8 },
  suggestRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  suggestChip: {
    backgroundColor: colors.input,
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  suggestChipText: { color: colors.accent, fontWeight: '700', fontSize: 13 },
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
