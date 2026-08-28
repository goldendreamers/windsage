import { Linking, Platform } from 'react-native';

export const DEVELOPER_EMAIL = 'Shakedwald@gmail.com';

/** Windsage tip jar. */
export const WINDSAGE_KOFI_URL = 'https://ko-fi.com/windsage';

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
