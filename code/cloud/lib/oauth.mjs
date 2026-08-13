/**
 * OAuth helpers (Google / Facebook / Apple). Facebook & Apple stay env-gated.
 * Zero npm — Node fetch + crypto only.
 */
import crypto from 'node:crypto';
import fs from 'node:fs/promises';

const FB_GRAPH = 'https://graph.facebook.com/v21.0';
const FB_DIALOG = 'https://www.facebook.com/v21.0/dialog/oauth';
const APPLE_AUTH = 'https://appleid.apple.com/auth/authorize';
const APPLE_TOKEN = 'https://appleid.apple.com/auth/token';
const STATE_TTL_MS = 15 * 60 * 1000;

let appleKeyCache = { at: 0, pem: '' };
let appleSecretCache = { exp: 0, jwt: '' };

function appleKeyConfigured() {
  return !!(process.env.APPLE_PRIVATE_KEY || process.env.APPLE_PRIVATE_KEY_PATH);
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
      redirectUri: `${publicUrl}/v1/auth/apple/callback`,
      enabled: !!(
        process.env.APPLE_CLIENT_ID &&
        process.env.APPLE_TEAM_ID &&
        process.env.APPLE_KEY_ID &&
        appleKeyConfigured()
      ),
    },
  };
}

export function providersStatus() {
  const cfg = oauthConfig();
  return {
    google: cfg.google.enabled,
    facebook: cfg.facebook.enabled,
    apple: cfg.apple.enabled,
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

export function facebookAuthUrl(state) {
  const { facebook } = oauthConfig();
  if (!facebook.enabled) throw new Error('Facebook sign-in is not configured on this server');
  const url = new URL(FB_DIALOG);
  url.searchParams.set('client_id', facebook.clientId);
  url.searchParams.set('redirect_uri', facebook.redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'email,public_profile');
  url.searchParams.set('state', state || '');
  return url.toString();
}

export async function exchangeFacebookCode(code) {
  const { facebook } = oauthConfig();
  if (!facebook.enabled) throw new Error('Facebook sign-in is not configured on this server');

  const tokenUrl = new URL(`${FB_GRAPH}/oauth/access_token`);
  tokenUrl.searchParams.set('client_id', facebook.clientId);
  tokenUrl.searchParams.set('client_secret', facebook.clientSecret);
  tokenUrl.searchParams.set('redirect_uri', facebook.redirectUri);
  tokenUrl.searchParams.set('code', code);

  const tokenRes = await fetch(tokenUrl);
  const tokenJson = await tokenRes.json();
  if (!tokenRes.ok || !tokenJson.access_token) {
    throw new Error(tokenJson.error?.message || tokenJson.error || 'Facebook token exchange failed');
  }

  const meUrl = new URL(`${FB_GRAPH}/me`);
  meUrl.searchParams.set('fields', 'id,name,email');
  meUrl.searchParams.set('access_token', tokenJson.access_token);
  const meRes = await fetch(meUrl);
  const me = await meRes.json();
  if (!meRes.ok || !me.id) {
    throw new Error(me.error?.message || me.error || 'Facebook profile failed');
  }

  return {
    id: String(me.id),
    email: me.email ? String(me.email) : null,
    name: me.name ? String(me.name) : null,
  };
}

export function appleAuthUrl(state) {
  const { apple } = oauthConfig();
  if (!apple.enabled) throw new Error('Apple sign-in is not configured on this server');
  const url = new URL(APPLE_AUTH);
  url.searchParams.set('client_id', apple.clientId);
  url.searchParams.set('redirect_uri', apple.redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('response_mode', 'form_post');
  url.searchParams.set('scope', 'name email');
  url.searchParams.set('state', state || '');
  return url.toString();
}

function wrapPem(raw) {
  const text = String(raw || '')
    .replace(/\\n/g, '\n')
    .trim();
  if (!text) return '';
  if (text.includes('BEGIN')) return text;
  const body = text.replace(/\s+/g, '');
  const lines = body.match(/.{1,64}/g) || [];
  return `-----BEGIN PRIVATE KEY-----\n${lines.join('\n')}\n-----END PRIVATE KEY-----`;
}

export async function loadApplePrivateKey() {
  if (process.env.APPLE_PRIVATE_KEY) {
    return wrapPem(process.env.APPLE_PRIVATE_KEY);
  }
  const keyPath = process.env.APPLE_PRIVATE_KEY_PATH;
  if (!keyPath) throw new Error('Apple private key is not configured');
  const now = Date.now();
  if (appleKeyCache.pem && now - appleKeyCache.at < 60_000) return appleKeyCache.pem;
  const pem = wrapPem(await fs.readFile(keyPath, 'utf8'));
  appleKeyCache = { at: now, pem };
  return pem;
}

/** ES256 client secret JWT for Apple's token endpoint (cached ~50 min). */
export async function appleClientSecret() {
  const { apple } = oauthConfig();
  if (!apple.enabled) throw new Error('Apple sign-in is not configured on this server');
  const now = Math.floor(Date.now() / 1000);
  if (appleSecretCache.jwt && appleSecretCache.exp - 120 > now) return appleSecretCache.jwt;

  const header = { alg: 'ES256', kid: apple.keyId };
  const payload = {
    iss: apple.teamId,
    iat: now,
    exp: now + 3600,
    aud: 'https://appleid.apple.com',
    sub: apple.clientId,
  };
  const enc = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
  const data = `${enc(header)}.${enc(payload)}`;
  const pem = await loadApplePrivateKey();
  const sig = crypto.sign('sha256', Buffer.from(data), {
    key: pem,
    dsaEncoding: 'ieee-p1363',
  });
  const jwt = `${data}.${sig.toString('base64url')}`;
  appleSecretCache = { exp: payload.exp, jwt };
  return jwt;
}

function decodeJwtPayload(jwt) {
  const parts = String(jwt || '').split('.');
  if (parts.length < 2) return {};
  try {
    return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  } catch {
    return {};
  }
}

export function parseAppleUserForm(raw) {
  if (!raw) return { email: null, name: null };
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    const first = parsed?.name?.firstName || '';
    const last = parsed?.name?.lastName || '';
    const name = `${first} ${last}`.trim() || null;
    const email = parsed?.email ? String(parsed.email) : null;
    return { email, name };
  } catch {
    return { email: null, name: null };
  }
}

export async function exchangeAppleCode(code, userForm) {
  const { apple } = oauthConfig();
  if (!apple.enabled) throw new Error('Apple sign-in is not configured on this server');

  const clientSecret = await appleClientSecret();
  const body = new URLSearchParams({
    client_id: apple.clientId,
    client_secret: clientSecret,
    code,
    grant_type: 'authorization_code',
    redirect_uri: apple.redirectUri,
  });
  const tokenRes = await fetch(APPLE_TOKEN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const tokenJson = await tokenRes.json();
  if (!tokenRes.ok || !tokenJson.id_token) {
    throw new Error(tokenJson.error_description || tokenJson.error || 'Apple token exchange failed');
  }

  const claims = decodeJwtPayload(tokenJson.id_token);
  if (!claims.sub) throw new Error('Apple id_token missing sub');
  const form = parseAppleUserForm(userForm);
  return {
    sub: String(claims.sub),
    email: claims.email ? String(claims.email) : form.email,
    name: form.name,
  };
}

function oauthStateSecret() {
  return (
    process.env.WINDSAGE_OAUTH_STATE_SECRET ||
    process.env.GOOGLE_CLIENT_SECRET ||
    process.env.FACEBOOK_APP_SECRET ||
    process.env.APPLE_CLIENT_ID ||
    'windsage-oauth-state-dev'
  );
}

function signState(payloadB64) {
  return crypto.createHmac('sha256', oauthStateSecret()).update(payloadB64).digest('base64url');
}

function timingSafeEqualStr(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

/** HMAC-signed OAuth state (anti-CSRF). Payload includes iat + nonce. */
export function encodeOAuthState(payload) {
  const body = {
    ...payload,
    iat: Date.now(),
    n: crypto.randomBytes(12).toString('hex'),
  };
  const payloadB64 = Buffer.from(JSON.stringify(body), 'utf8').toString('base64url');
  return `${payloadB64}.${signState(payloadB64)}`;
}

export function decodeOAuthState(state) {
  try {
    const raw = String(state || '');
    const lastDot = raw.lastIndexOf('.');
    if (lastDot <= 0) return {};
    const payloadB64 = raw.slice(0, lastDot);
    const sig = raw.slice(lastDot + 1);
    if (!timingSafeEqualStr(sig, signState(payloadB64))) return {};
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
    if (!payload || typeof payload !== 'object') return {};
    if (payload.iat && Date.now() - Number(payload.iat) > STATE_TTL_MS) return {};
    return payload;
  } catch {
    return {};
  }
}
