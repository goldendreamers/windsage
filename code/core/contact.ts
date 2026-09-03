import { Linking, Platform } from 'react-native';

export const DEVELOPER_EMAIL = 'Shakedwald@gmail.com';

/** Windsage tip jar. */
export const WINDSAGE_KOFI_URL = 'https://ko-fi.com/windsage';

/** Trevor Project donate page. */
export const TREVOR_PROJECT_DONATE_URL = 'https://give.thetrevorproject.org/give/330001';

/** Opens Gmail compose in a new browser window (mailto fallback off-web). */
export function openDeveloperEmail() {
  const gmail = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(DEVELOPER_EMAIL)}&su=${encodeURIComponent('Windsage')}`;
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    const opened = window.open(gmail, '_blank', 'noopener,noreferrer');
    if (opened) return;
  }
  void Linking.openURL(gmail);
}

/** Opens the Windsage Ko-fi page. */
export function openWindsageKofi() {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    const opened = window.open(WINDSAGE_KOFI_URL, '_blank', 'noopener,noreferrer');
    if (opened) return;
  }
  void Linking.openURL(WINDSAGE_KOFI_URL);
}

/** Windsage Discord server (never-expire invite). Needed to run /link for alert DMs. */
export const WINDSAGE_DISCORD_INVITE_URL = 'https://discord.gg/uZSeqTcYq';

export function openDiscordInvite(url?: string | null) {
  const target = String(url || WINDSAGE_DISCORD_INVITE_URL).trim() || WINDSAGE_DISCORD_INVITE_URL;
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    const opened = window.open(target, '_blank', 'noopener,noreferrer');
    if (opened) return;
  }
  void Linking.openURL(target);
}

/** Opens the Trevor Project donate page. */
export function openTrevorProjectDonate() {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    const opened = window.open(TREVOR_PROJECT_DONATE_URL, '_blank', 'noopener,noreferrer');
    if (opened) return;
  }
  void Linking.openURL(TREVOR_PROJECT_DONATE_URL);
}
