/**
 * OAuth helpers (Google primary; Facebook/Apple gated by env).
 * Zero npm — Node fetch + crypto only.
 */

/** Never-expire https://discord.gg/… or https://discord.com/invite/… only. */
export function sanitizeDiscordInvite(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  try {
    const u = new URL(s);
    if (u.protocol !== 'https:') return '';
    const host = u.hostname.replace(/^www\./, '');
    if (host === 'discord.gg') {
      const code = u.pathname.replace(/^\//, '').split('/')[0];
      return code ? `https://discord.gg/${code}` : '';
    }
    if (host === 'discord.com' && u.pathname.startsWith('/invite/')) {
      const code = u.pathname.slice('/invite/'.length).split('/')[0];
      return code ? `https://discord.gg/${code}` : '';
    }
  } catch {
    return '';
  }
  return '';
}

export function oauthConfig() {
  const publicUrl = (
    process.env.WINDSAGE_PUBLIC_URL || 'https://windsage.nimrod.bio'
  ).replace(/\/$/, '');
  return {
    publicUrl,
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID || '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
      redirectUri: `${publicUrl}/v1/auth/google/callback`,
      enabled: !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
    },
    facebook: {
      clientId: process.env.FACEBOOK_APP_ID || '',
      clientSecret: process.env.FACEBOOK_APP_SECRET || '',
      redirectUri: `${publicUrl}/v1/auth/facebook/callback`,
      enabled: !!(process.env.FACEBOOK_APP_ID && process.env.FACEBOOK_APP_SECRET),
    },
    apple: {
      clientId: process.env.APPLE_CLIENT_ID || '',
      teamId: process.env.APPLE_TEAM_ID || '',
      keyId: process.env.APPLE_KEY_ID || '',
      enabled: !!(
        process.env.APPLE_CLIENT_ID &&
        process.env.APPLE_TEAM_ID &&
        process.env.APPLE_KEY_ID
      ),
    },
  };
}

export function providersStatus() {
  const cfg = oauthConfig();
  const discordInvite = sanitizeDiscordInvite(process.env.DISCORD_INVITE_URL);
  return {
    google: cfg.google.enabled,
    facebook: cfg.facebook.enabled,
    apple: cfg.apple.enabled,
    discordInvite: discordInvite || null,
  };
}

export function googleAuthUrl(state) {
  const { google } = oauthConfig();
  if (!google.enabled) throw new Error('Google sign-in is not configured on this server');
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.searchParams.set('client_id', google.clientId);
  url.searchParams.set('redirect_uri', google.redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'openid email profile');
  url.searchParams.set('access_type', 'online');
  url.searchParams.set('include_granted_scopes', 'true');
  url.searchParams.set('state', state || '');
  url.searchParams.set('prompt', 'select_account');
  return url.toString();
}

export async function exchangeGoogleCode(code) {
  const { google } = oauthConfig();
  if (!google.enabled) throw new Error('Google sign-in is not configured on this server');

  const body = new URLSearchParams({
    code,
    client_id: google.clientId,
    client_secret: google.clientSecret,
    redirect_uri: google.redirectUri,
    grant_type: 'authorization_code',
  });

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const tokenJson = await tokenRes.json();
  if (!tokenRes.ok) {
    throw new Error(tokenJson.error_description || tokenJson.error || 'Google token exchange failed');
  }

  const accessToken = tokenJson.access_token;
  const infoRes = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const info = await infoRes.json();
  if (!infoRes.ok || !info.sub) {
    throw new Error(info.error || 'Google userinfo failed');
  }

  return {
    sub: String(info.sub),
    email: info.email ? String(info.email) : null,
    name: info.name ? String(info.name) : null,
  };
}

/** Encode opaque OAuth state: mode|deviceId|linkToken|nonce */
export function encodeOAuthState(payload) {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

export function decodeOAuthState(state) {
  try {
    return JSON.parse(Buffer.from(String(state || ''), 'base64url').toString('utf8'));
  } catch {
    return {};
  }
}
