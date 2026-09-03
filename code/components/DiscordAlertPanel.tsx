import * as Haptics from 'expo-haptics';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { openDiscordInvite, WINDSAGE_DISCORD_INVITE_URL } from '../core/contact';
import { colors } from '../shared/theme';

type Props = {
  signedIn: boolean;
  linked?: boolean;
  username?: string | null;
  code?: string | null;
  busy?: boolean;
  inviteUrl?: string | null;
  onGetCode?: () => void;
  onUnlink?: () => void;
  onSignIn?: () => void;
};

function Step({ n, title, body, done }: { n: number; title: string; body?: string; done?: boolean }) {
  return (
    <View style={styles.step} accessibilityRole="text">
      <Text style={[styles.stepN, done && styles.stepNDone]}>{done ? '✓' : String(n)}</Text>
      <View style={{ flex: 1 }}>
        <Text style={[styles.stepTitle, done && styles.stepTitleDone]}>{title}</Text>
        {body ? <Text style={styles.stepBody}>{body}</Text> : null}
      </View>
    </View>
  );
}

export function DiscordAlertPanel({
  signedIn,
  linked = false,
  username,
  code,
  busy = false,
  inviteUrl,
  onGetCode,
  onUnlink,
  onSignIn,
}: Props) {
  const invite = inviteUrl || WINDSAGE_DISCORD_INVITE_URL;

  return (
    <View style={styles.wrap}>
      <Text style={styles.lead}>
        Discord DMs are not automatic. You join the Windsage Discord server, then attach that Discord
        user to this Windsage login with a one-time code.
      </Text>

      {linked ? (
        <>
          <Text style={styles.hint}>
            Linked to {username ? `@${username}` : 'your Discord account'}. When a followed station
            alerts, Windsage DMs that user. Unlink here or type /unlink in Discord.
          </Text>
          <Pressable
            style={[styles.btn, styles.btnSecondary, busy && styles.btnDisabled]}
            disabled={busy}
            onPress={() => {
              void Haptics.selectionAsync();
              onUnlink?.();
            }}
          >
            <Text style={styles.btnSecondaryText}>Stop Discord alerts</Text>
          </Pressable>
        </>
      ) : (
        <>
          <Step
            n={1}
            done={signedIn}
            title="Sign in to Windsage"
            body={
              signedIn
                ? 'This Windsage account is signed in.'
                : onSignIn
                  ? 'Use username & password or Google. Guest mode cannot receive Discord DMs.'
                  : 'Use username & password or Google above. Guest mode cannot receive Discord DMs.'
            }
          />
          <Step
            n={2}
            title="Join the Windsage Discord server"
            body="Tap Join Discord. Accept the invite. You must be in that server to run /link."
          />
          <Step
            n={3}
            done={!!code}
            title="Get a 6-character code here"
            body="The code lasts about 10 minutes. Stay signed in on this device."
          />
          <Step
            n={4}
            title="In Discord, run /link"
            body="Open any channel in the Windsage server, type /link, then paste the code shown below."
          />
          <Step
            n={5}
            title="Allow DMs from server members"
            body="Discord → Privacy → allow direct messages from server members. Otherwise the alert DM is blocked."
          />

          <Pressable
            style={styles.btnDiscord}
            onPress={() => {
              void Haptics.selectionAsync();
              openDiscordInvite(invite);
            }}
            accessibilityRole="link"
            accessibilityLabel="Join Discord"
          >
            <Text style={styles.btnDiscordText}>Join Discord</Text>
          </Pressable>

          {!signedIn ? (
            onSignIn ? (
              <Pressable
                style={[styles.btn, styles.btnSecondary]}
                onPress={() => {
                  void Haptics.selectionAsync();
                  onSignIn();
                }}
                accessibilityRole="button"
                accessibilityLabel="Sign in for Discord alerts"
              >
                <Text style={styles.btnSecondaryText}>Sign in to Windsage</Text>
              </Pressable>
            ) : null
          ) : (
            <>
              {code ? (
                <View style={styles.codeBox} accessibilityRole="text">
                  <Text style={styles.codeLabel}>Your link code</Text>
                  <Text style={styles.code} selectable>
                    {code}
                  </Text>
                  <Text style={styles.codeHint}>In Discord type /link, then paste this code.</Text>
                </View>
              ) : null}
              <Pressable
                style={[styles.btn, styles.btnSecondary, busy && styles.btnDisabled]}
                disabled={busy}
                onPress={() => {
                  void Haptics.selectionAsync();
                  onGetCode?.();
                }}
              >
                <Text style={styles.btnSecondaryText}>
                  {code ? 'Get a new code' : 'Get a link code'}
                </Text>
              </Pressable>
            </>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  lead: { color: colors.text, fontSize: 15, lineHeight: 22, fontWeight: '600' },
  hint: { color: colors.muted, fontSize: 13, lineHeight: 18 },
  step: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
    paddingTop: 4,
  },
  stepN: {
    width: 22,
    color: colors.accent,
    fontSize: 14,
    fontWeight: '800',
    marginTop: 1,
  },
  stepNDone: { color: colors.ok },
  stepTitle: { color: colors.text, fontSize: 14, fontWeight: '800' },
  stepTitleDone: { color: colors.ok },
  stepBody: { color: colors.muted, fontSize: 13, lineHeight: 18, marginTop: 2 },
  codeBox: {
    marginTop: 8,
    backgroundColor: colors.input,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.accent,
    padding: 14,
    gap: 4,
  },
  codeLabel: { color: colors.muted, fontSize: 13, fontWeight: '600' },
  code: { color: colors.text, fontSize: 22, fontWeight: '800', letterSpacing: 0.4 },
  codeHint: { color: colors.muted, fontSize: 12, lineHeight: 16 },
  btn: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  btnSecondary: {
    backgroundColor: colors.input,
    borderWidth: 1,
    borderColor: colors.line,
  },
  btnSecondaryText: { color: colors.text, fontWeight: '700', fontSize: 15 },
  btnDisabled: { opacity: 0.55 },
  btnDiscord: {
    marginTop: 8,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    backgroundColor: '#5865F2',
  },
  btnDiscordText: { color: '#fff', fontWeight: '800', fontSize: 15 },
});
