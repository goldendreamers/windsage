import { Linking, Platform } from 'react-native';

export const DEVELOPER_EMAIL = 'Shakedwald@gmail.com';

/** Opens Gmail compose in a new browser window (mailto fallback off-web). */
export function openDeveloperEmail() {
  const gmail = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(DEVELOPER_EMAIL)}&su=${encodeURIComponent('Windsage')}`;
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    const opened = window.open(gmail, '_blank', 'noopener,noreferrer');
    if (opened) return;
  }
  void Linking.openURL(gmail);
}
