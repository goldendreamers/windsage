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
import { openDeveloperEmail, openDiscordInvite } from '../core/contact';
import type { CloudUser } from '../core/cloud';
import {
  CloudError,
  EMPTY_AUTH_PROVIDERS,
  fetchAuthProviders,
  fetchMe,
  loginAccount,
  logoutAccount,
  pullMyStations,
  registerAccount,
  sendTestPhoneAlert,
  startDiscordSignIn,
  startGoogleSignIn,
} from '../core/cloud';
import { colors } from '../shared/theme';
import { Section } from '../components/Section';
import { registerWebPushSubscription, ensureNotificationPermissions, isInstalledPwa } from '../core/notifications';
import { isRunningAsInstalledApp } from '../core/pwaInstall';

type Props = {
  onBack: () => void;
  onOpenMenu?: () => void;
  onAuthed: (
    payload: {
      user: CloudUser;
      stations: import('../shared/types').FollowedStation[];
      pollIntervalMinutes: number;
      simpleMode?: boolean;
    },
    opts?: { importLocalGuestFollows?: boolean },
  ) => void;
  onLoggedOut: () => void;
};

export function AccountScreen({ onBack, onOpenMenu, onAuthed, onLoggedOut }: Props) {
  const [user, setUser] = useState<CloudUser | null>(null);
  const [providers, setProviders] = useState(EMPTY_AUTH_PROVIDERS);
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
          fetchAuthProviders().catch(() => EMPTY_AUTH_PROVIDERS),
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

  async function finishOAuth(provider: 'google' | 'discord', mode: 'login' | 'link') {
    const result = provider === 'discord' ? await startDiscordSignIn(mode) : await startGoogleSignIn(mode);
    // Web navigates away; native AuthSession returns here.
    if (!result) return;
    if (result.error) throw new Error(result.error);
    if (!result.token) throw new Error(`${provider === 'discord' ? 'Discord' : 'Google'} sign-in returned no session`);
    const me = await fetchMe();
    if (!me) throw new Error('Signed in but could not load account');
    if (mode === 'link') {
      setUser(me);
      return;
    }
    const pulled = await pullMyStations();
    onAuthed(
      {
        user: me,
        stations: pulled?.stations || [],
        pollIntervalMinutes: pulled?.pollIntervalMinutes || 10,
        simpleMode: pulled?.simpleMode !== false,
      },
      // SSO login to a brand-new user already merged guest follows server-side
      // when created; never import leftover local guest lists for returning users.
      { importLocalGuestFollows: false },
    );
  }

  const signedInLabel = user
    ? user.username
      ? `@${user.username}`
      : user.sso.google?.email || user.sso.discord?.username || user.sso.discord?.email || 'SSO account'
    : '';

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
      <View style={styles.navRow}>
        <Pressable style={styles.back} onPress={onBack}>
          <Text style={styles.backText}>‹ Home</Text>
        </Pressable>
        {onOpenMenu ? (
          <Pressable
            style={styles.menuBtn}
            onPress={() => {
              void Haptics.selectionAsync();
              onOpenMenu();
            }}
            accessibilityRole="button"
            accessibilityLabel="Menu"
          >
            <Text style={styles.menuBtnText}>Menu</Text>
          </Pressable>
        ) : null}
      </View>

      <Text style={styles.title}>Account</Text>
      <Text style={styles.sub}>Sign in to sync across devices. Guest still works.</Text>

      {user ? (
        <Section title="Signed in" icon="station">
          <Text style={styles.label}>{signedInLabel}</Text>
          {providers.google && !user.sso.google?.linked ? (
            <Pressable
              style={[styles.btn, styles.btnSecondary, busy && styles.btnDisabled]}
              disabled={busy}
              onPress={() => void run(async () => finishOAuth('google', 'link'))}
            >
              <Text style={styles.btnSecondaryText}>Link Google</Text>
            </Pressable>
          ) : null}
          {providers.discord && !user.sso.discord?.linked ? (
            <Pressable
              style={[styles.btn, styles.btnSecondary, busy && styles.btnDisabled]}
              disabled={busy}
              onPress={() => void run(async () => finishOAuth('discord', 'link'))}
            >
              <Text style={styles.btnSecondaryText}>Link Discord</Text>
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
                    onAuthed(data, { importLocalGuestFollows: false });
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
                      onAuthed(data, { importLocalGuestFollows: true });
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
                onPress={() => void run(async () => finishOAuth('google', 'login'))}
              >
                <Text style={styles.btnPrimaryText}>Continue with Google</Text>
              </Pressable>
            ) : (
              <Text style={styles.hint}>Google sign-in isn’t configured on this server.</Text>
            )}
            {providers.discord ? (
              <Pressable
                style={[styles.btn, styles.btnDiscord, busy && styles.btnDisabled]}
                disabled={busy}
                onPress={() => void run(async () => finishOAuth('discord', 'login'))}
              >
                <Text style={styles.btnDiscordText}>Continue with Discord</Text>
              </Pressable>
            ) : (
              <Text style={styles.hint}>Discord sign-in isn’t configured on this server.</Text>
            )}
          </Section>

          <Pressable style={styles.guest} onPress={onBack}>
            <Text style={styles.guestText}>Continue as guest</Text>
          </Pressable>
        </>
      )}

      <Section title="Phone alerts" icon="bell">
        {!isInstalledPwa() && !isRunningAsInstalledApp() ? (
          <Text style={[styles.hint, styles.warnHint]}>
            Install and open from the home-screen icon for lock-screen alerts.
          </Text>
        ) : null}
        <Text style={styles.hint}>
          Android: Apps → Windsage and Chrome → Battery → Unrestricted. Lock screen: show all
          notifications.
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
                  ? ' Install and open from the home screen.'
                  : '';
              setPhoneAlertMsg(
                result.delivered > 0 ? `Test sent.${lockHint}` : 'Nothing was delivered.',
              );
              void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            })
          }
        >
          <Text style={styles.btnPrimaryText}>Send test phone alert</Text>
        </Pressable>
        {phoneAlertMsg ? <Text style={styles.hint}>{phoneAlertMsg}</Text> : null}
      </Section>

      {providers.discordInvite ? (
        <Pressable
          style={[styles.btn, styles.btnDiscord]}
          onPress={() => {
            void Haptics.selectionAsync();
            openDiscordInvite(providers.discordInvite);
          }}
          accessibilityRole="button"
          accessibilityLabel="Join Discord"
        >
          <Text style={styles.btnDiscordText}>Join Discord</Text>
        </Pressable>
      ) : null}

      <Pressable
        style={[styles.btn, styles.btnSecondary]}
        onPress={() => {
          void Haptics.selectionAsync();
          openDeveloperEmail();
        }}
        accessibilityRole="button"
        accessibilityLabel="Email the developer"
      >
        <Text style={styles.btnSecondaryText}>Email the developer</Text>
      </Pressable>

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
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  back: { alignSelf: 'flex-start', paddingVertical: 4 },
  backText: { color: colors.accent, fontSize: 16, fontWeight: '700' },
  menuBtn: {
    backgroundColor: colors.input,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: colors.line,
  },
  menuBtnText: {
    color: colors.text,
    fontWeight: '800',
    fontSize: 13,
  },
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
  btnDiscord: { backgroundColor: '#5865F2' },
  btnDiscordText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  btnDisabled: { opacity: 0.55 },
  guest: { alignItems: 'center', paddingVertical: 12 },
  guestText: { color: colors.muted, fontWeight: '600' },
  error: { color: colors.danger, fontSize: 13, textAlign: 'center' },
});
