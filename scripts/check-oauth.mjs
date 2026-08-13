/**
 * OAuth helpers: env gates, Facebook/Apple URLs, signed state, Apple JWT, store finders.
 * No live HTTP to Google/Facebook/Apple.
 */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  oauthConfig,
  providersStatus,
  googleAuthUrl,
  facebookAuthUrl,
  appleAuthUrl,
  appleClientSecret,
  parseAppleUserForm,
  encodeOAuthState,
  decodeOAuthState,
} from '../code/cloud/lib/oauth.mjs';
import {
  loadStore,
  saveStore,
  createUser,
  findUserByGoogleSub,
  findUserByFacebookId,
  findUserByAppleSub,
  publicUser,
} from '../code/cloud/lib/store.mjs';

const saved = { ...process.env };
function restoreEnv() {
  for (const key of Object.keys(process.env)) {
    if (!(key in saved)) delete process.env[key];
  }
  Object.assign(process.env, saved);
}

function setEnv(map) {
  for (const [k, v] of Object.entries(map)) {
    if (v == null) delete process.env[k];
    else process.env[k] = v;
  }
}

setEnv({
  GOOGLE_CLIENT_ID: '',
  GOOGLE_CLIENT_SECRET: '',
  FACEBOOK_APP_ID: '',
  FACEBOOK_APP_SECRET: '',
  APPLE_CLIENT_ID: '',
  APPLE_TEAM_ID: '',
  APPLE_KEY_ID: '',
  APPLE_PRIVATE_KEY: '',
  APPLE_PRIVATE_KEY_PATH: '',
  WINDSAGE_OAUTH_STATE_SECRET: 'test-state-secret',
  WINDSAGE_PUBLIC_URL: 'https://windsage.nimrod.bio',
});

let status = providersStatus();
assert.equal(status.google, false);
assert.equal(status.facebook, false);
assert.equal(status.apple, false);

assert.throws(() => googleAuthUrl('s'), /not configured/);
assert.throws(() => facebookAuthUrl('s'), /not configured/);
assert.throws(() => appleAuthUrl('s'), /not configured/);

setEnv({
  GOOGLE_CLIENT_ID: 'gid',
  GOOGLE_CLIENT_SECRET: 'gsecret',
  FACEBOOK_APP_ID: 'fbid',
  FACEBOOK_APP_SECRET: 'fbsecret',
});
status = providersStatus();
assert.equal(status.google, true);
assert.equal(status.facebook, true);
assert.equal(status.apple, false);

const gUrl = new URL(googleAuthUrl('stateg'));
assert.equal(gUrl.hostname, 'accounts.google.com');
assert.equal(gUrl.searchParams.get('client_id'), 'gid');
assert.equal(
  gUrl.searchParams.get('redirect_uri'),
  'https://windsage.nimrod.bio/v1/auth/google/callback',
);

const fbUrl = new URL(facebookAuthUrl('statef'));
assert.equal(fbUrl.hostname, 'www.facebook.com');
assert.match(fbUrl.pathname, /\/dialog\/oauth$/);
assert.equal(fbUrl.searchParams.get('client_id'), 'fbid');
assert.equal(
  fbUrl.searchParams.get('redirect_uri'),
  'https://windsage.nimrod.bio/v1/auth/facebook/callback',
);
assert.match(fbUrl.searchParams.get('scope') || '', /email/);

const { privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
setEnv({
  APPLE_CLIENT_ID: 'com.windsage.service',
  APPLE_TEAM_ID: 'TEAMID12',
  APPLE_KEY_ID: 'KEYID12345',
  APPLE_PRIVATE_KEY: pem,
});
status = providersStatus();
assert.equal(status.apple, true);

const appleUrl = new URL(appleAuthUrl('statea'));
assert.equal(appleUrl.hostname, 'appleid.apple.com');
assert.equal(appleUrl.searchParams.get('client_id'), 'com.windsage.service');
assert.equal(appleUrl.searchParams.get('response_mode'), 'form_post');
assert.equal(
  appleUrl.searchParams.get('redirect_uri'),
  'https://windsage.nimrod.bio/v1/auth/apple/callback',
);

const jwt = await appleClientSecret();
const jwtParts = jwt.split('.');
assert.equal(jwtParts.length, 3);
const header = JSON.parse(Buffer.from(jwtParts[0], 'base64url').toString('utf8'));
const payload = JSON.parse(Buffer.from(jwtParts[1], 'base64url').toString('utf8'));
assert.equal(header.alg, 'ES256');
assert.equal(header.kid, 'KEYID12345');
assert.equal(payload.iss, 'TEAMID12');
assert.equal(payload.sub, 'com.windsage.service');
assert.equal(payload.aud, 'https://appleid.apple.com');
assert.ok(payload.exp > payload.iat);

const parsedUser = parseAppleUserForm(
  JSON.stringify({ name: { firstName: 'Nim', lastName: 'Wald' }, email: 'n@example.com' }),
);
assert.equal(parsedUser.name, 'Nim Wald');
assert.equal(parsedUser.email, 'n@example.com');
assert.equal(parseAppleUserForm(null).name, null);

const state = encodeOAuthState({ mode: 'login', deviceId: 'dev1', returnTo: 'windsage://auth' });
assert.match(state, /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
const decoded = decodeOAuthState(state);
assert.equal(decoded.mode, 'login');
assert.equal(decoded.deviceId, 'dev1');
assert.equal(decoded.returnTo, 'windsage://auth');
assert.ok(decoded.iat);
assert.ok(decoded.n);

assert.deepEqual(decodeOAuthState('not-valid'), {});
assert.deepEqual(decodeOAuthState(`${state}x`), {});
const [payloadB64] = state.split('.');
const badSig = crypto.createHmac('sha256', 'wrong').update(payloadB64).digest('base64url');
assert.deepEqual(decodeOAuthState(`${payloadB64}.${badSig}`), {});

const expiredBody = { mode: 'login', iat: Date.now() - 20 * 60 * 1000, n: 'old' };
const expiredB64 = Buffer.from(JSON.stringify(expiredBody), 'utf8').toString('base64url');
const expiredSig = crypto
  .createHmac('sha256', 'test-state-secret')
  .update(expiredB64)
  .digest('base64url');
assert.deepEqual(decodeOAuthState(`${expiredB64}.${expiredSig}`), {});

const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'windsage-oauth-'));
let store = await loadStore(dir);
const gUser = createUser(store, {
  username: null,
  sso: { google: { sub: 'g-sub', email: 'g@example.com', name: 'G' } },
});
const fUser = createUser(store, {
  username: 'fbuser',
  sso: { facebook: { id: 'fb-99', email: 'f@example.com', name: 'F' } },
});
const aUser = createUser(store, {
  username: null,
  sso: { apple: { sub: 'apple.sub', email: 'a@example.com', name: 'A' } },
});
await saveStore(dir, store);
store = await loadStore(dir);
assert.equal(findUserByGoogleSub(store, 'g-sub')?.id, gUser.id);
assert.equal(findUserByFacebookId(store, 'fb-99')?.id, fUser.id);
assert.equal(findUserByAppleSub(store, 'apple.sub')?.id, aUser.id);
assert.equal(findUserByFacebookId(store, 'missing'), null);

const pub = publicUser(store.users[fUser.id]);
assert.equal(pub.sso.facebook.linked, true);
assert.equal(pub.sso.facebook.email, 'f@example.com');
assert.equal(publicUser(store.users[aUser.id]).sso.apple.email, 'a@example.com');

restoreEnv();
console.log('check-oauth: ok');
