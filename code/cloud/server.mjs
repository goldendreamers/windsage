/**
 * Windsage cloud worker — runs on Wald home server.
 * Serves the web app + API, polls Windguru, pushes Expo notifications.
 * Zero npm dependencies (Node 22 builtins only).
 */
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createReadStream } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  evaluateAlert,
  fetchCurrentReading,
  fetchRecentHistory,
  fixSpotStations,
  normalizeWindguruFollowInput,
} from './lib/wind.mjs';
import {
  loadStore,
  saveStore,
  ensureDevice,
  createUser,
  findUserByUsername,
  suggestAvailableUsernames,
  findUserByGoogleSub,
  createSession,
  getSession,
  revokeSession,
  mergeStations,
  upsertSharedStations,
  publicUser,
  publicCatalogStations,
} from './lib/store.mjs';
import {
  hashPassword,
  verifyPassword,
  parseBearer,
  validateUsername,
  validatePassword,
} from './lib/auth.mjs';
import {
  providersStatus,
  googleAuthUrl,
  exchangeGoogleCode,
  encodeOAuthState,
  decodeOAuthState,
  oauthConfig,
} from './lib/oauth.mjs';
import { sendExpoPush } from './lib/push.mjs';
import {
  vapidConfig,
  ensureWebPushConfigured,
  upsertWebPushSubscription,
  collectWebPushSubscriptions,
  sendWebPushMany,
} from './lib/webpush.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HOST = process.env.WINDSAGE_HOST || '0.0.0.0';
const PORT = Number(process.env.WINDSAGE_PORT || 8787);
const DATA_DIR = process.env.WINDSAGE_DATA || path.join(__dirname, 'data');
const WEB_DIR = process.env.WINDSAGE_WEB || path.join(__dirname, 'web');
const DEFAULT_POLL_MIN = 10;

const DEFAULT_ALERT = {
  conditionSinceMs: null,
  notifiedForRun: false,
  lastCheckMs: null,
  lastValue: null,
  lastError: null,
  lastStationId: null,
};

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.map': 'application/json',
  '.txt': 'text/plain; charset=utf-8',
  '.webp': 'image/webp',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.zip': 'application/zip',
};

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization, x-windsage-secret, Accept',
  );
}

function json(res, status, body) {
  cors(res);
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload),
    'Cache-Control': 'no-store',
  });
  res.end(payload);
}

function redirect(res, location) {
  cors(res);
  res.writeHead(302, { Location: location });
  res.end();
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function displayName(station) {
  const nick = (station.nickname || '').trim();
  if (nick) return nick;
  return station.kind === 'spot'
    ? `Spot ${station.stationId}`
    : `Station ${station.stationId}`;
}

function collectPushTokens(bag) {
  const tokens = new Set();
  if (Array.isArray(bag.pushTokens)) {
    for (const t of bag.pushTokens) if (t) tokens.add(t);
  }
  if (bag.pushToken) tokens.add(bag.pushToken);
  return [...tokens];
}

async function dispatchAlertNotifications(bag, station, result, sid) {
  const unit =
    station.rule.metric === 'temperature'
      ? '°C'
      : station.rule.metric === 'wave_height'
        ? 'm'
        : 'kt';
  const cmp = station.rule.comparison === 'gte' ? '≥' : '≤';
  const value =
    result.metricValue == null ? 'n/a' : `${result.metricValue.toFixed(1)} ${unit}`;
  const title = `Windsage · ${displayName(station)}`;
  const body = `${station.rule.metric} ${cmp}${station.rule.threshold} ${unit} for ${station.rule.sustainedMinutes}+ min (now ${value})`;
  const data = { followId: station.id, stationId: sid };

  const pushTokens = collectPushTokens(bag);
  for (const to of pushTokens) {
    await sendExpoPush({ to, title, body, data });
  }

  const subs = collectWebPushSubscriptions(bag);
  if (subs.length) {
    const { alive } = await sendWebPushMany(subs, { title, body, data });
    bag.webPushSubscriptions = alive;
  }
}

async function runBagChecks(store, bag, { notify = true } = {}) {
  const stations = (bag.stations || []).filter((s) => s.stationId?.trim());
  if (!bag.alertStates) bag.alertStates = {};
  if (!bag.snapshots) bag.snapshots = {};

  const uniqueIds = [...new Set(stations.map((s) => s.stationId.trim()))];
  const readingCache = new Map();
  const historyCache = new Map();

  for (const stationId of uniqueIds) {
    try {
      readingCache.set(stationId, await fetchCurrentReading(stationId));
    } catch (error) {
      readingCache.set(stationId, { error: error.message || 'fetch failed' });
    }
  }

  const results = [];

  for (const station of stations) {
    const sid = station.stationId.trim();
    const prev = { ...DEFAULT_ALERT, ...(bag.alertStates[station.id] || {}) };
    const cached = readingCache.get(sid);

    if (!cached || cached.error) {
      const message = cached?.error || 'No reading';
      const nextState = {
        ...prev,
        lastCheckMs: Date.now(),
        lastError: message,
        lastStationId: sid,
      };
      bag.alertStates[station.id] = nextState;
      bag.snapshots[station.id] = {
        reading: null,
        result: {
          reading: null,
          metricValue: null,
          conditionMet: false,
          sustainedMs: 0,
          shouldNotify: false,
          message,
        },
        alertState: nextState,
        updatedAt: Date.now(),
      };
      results.push({ station, result: bag.snapshots[station.id].result, nextState });
      continue;
    }

    const hours = Math.max(1, Math.ceil((station.rule.sustainedMinutes + 20) / 60));
    const histKey = `${sid}:${station.rule.metric}:${hours}`;
    if (!historyCache.has(histKey)) {
      try {
        historyCache.set(
          histKey,
          await fetchRecentHistory(sid, station.rule.metric, hours, 10),
        );
      } catch {
        historyCache.set(histKey, { unixtime: [], values: [] });
      }
    }

    const history = historyCache.get(histKey);
    const { result, nextState } = evaluateAlert(cached, history, station, prev);
    bag.alertStates[station.id] = nextState;
    bag.snapshots[station.id] = {
      reading: cached,
      result,
      alertState: nextState,
      updatedAt: Date.now(),
    };
    results.push({ station, result, nextState });

    if (notify && result.shouldNotify && station.enabled) {
      await dispatchAlertNotifications(bag, station, result, sid);
    }
  }

  bag.lastPollAt = Date.now();
  return results;
}

async function runDeviceChecks(store, deviceId, opts) {
  const device = store.devices[deviceId];
  if (!device) throw new Error('Unknown device');
  // If device is linked, prefer polling the user bag (stations live there).
  if (device.userId && store.users[device.userId]) {
    return runBagChecks(store, store.users[device.userId], opts);
  }
  return runBagChecks(store, device, opts);
}

async function pollAll() {
  const store = await loadStore(DATA_DIR);
  let touched = false;

  for (const user of Object.values(store.users)) {
    const active = (user.stations || []).some((s) => s.enabled && s.stationId?.trim());
    if (!active) continue;
    // Collect push tokens + web-push subscriptions from linked devices
    const tokens = new Set(collectPushTokens(user));
    const webSubs = new Map();
    for (const s of collectWebPushSubscriptions(user)) webSubs.set(s.endpoint, s);
    for (const device of Object.values(store.devices)) {
      if (device.userId === user.id) {
        for (const t of collectPushTokens(device)) tokens.add(t);
        for (const s of collectWebPushSubscriptions(device)) webSubs.set(s.endpoint, s);
      }
    }
    user.pushTokens = [...tokens];
    user.webPushSubscriptions = [...webSubs.values()];
    try {
      await runBagChecks(store, user, { notify: true });
      touched = true;
    } catch (error) {
      console.error('[poll] user', user.id, error.message || error);
    }
  }

  for (const deviceId of Object.keys(store.devices)) {
    const device = store.devices[deviceId];
    if (device.userId) continue; // already covered via user
    const active = (device.stations || []).some((s) => s.enabled && s.stationId?.trim());
    if (!active) continue;
    try {
      await runBagChecks(store, device, { notify: true });
      touched = true;
    } catch (error) {
      console.error('[poll]', deviceId, error.message || error);
    }
  }

  if (touched) await saveStore(DATA_DIR, store);
  console.log(`[poll] done ${new Date().toISOString()}`);
}

function getPollMs(store) {
  const mins = [
    DEFAULT_POLL_MIN,
    ...Object.values(store.devices).map((d) => d.pollIntervalMinutes || DEFAULT_POLL_MIN),
    ...Object.values(store.users || {}).map((u) => u.pollIntervalMinutes || DEFAULT_POLL_MIN),
  ];
  return Math.max(10, ...mins) * 60 * 1000;
}

function requireUser(store, req, res) {
  const token = parseBearer(req);
  const session = getSession(store, token);
  if (!session) {
    json(res, 401, { error: 'unauthorized' });
    return null;
  }
  const user = store.users[session.userId];
  if (!user) {
    revokeSession(store, token);
    json(res, 401, { error: 'unauthorized' });
    return null;
  }
  return { user, token, session };
}

async function attachDeviceToUser(store, user, deviceId, secret, pushToken, webPushSubscription) {
  if (!deviceId || !secret) return;
  const existing = store.devices[deviceId];
  if (existing && existing.secret !== secret) return;
  const device = ensureDevice(store, deviceId, secret);
  device.userId = user.id;
  if (pushToken) {
    device.pushToken = pushToken;
    if (!device.pushTokens.includes(pushToken)) device.pushTokens.push(pushToken);
    if (!user.pushTokens.includes(pushToken)) user.pushTokens.push(pushToken);
  }
  if (webPushSubscription) {
    upsertWebPushSubscription(device, webPushSubscription);
    upsertWebPushSubscription(user, webPushSubscription);
  }
  // Merge guest stations into user once.
  user.stations = mergeStations(user.stations || [], device.stations || []);
  user.pollIntervalMinutes = Math.max(
    10,
    user.pollIntervalMinutes || 10,
    device.pollIntervalMinutes || 10,
  );
  device.stations = []; // stations owned by user when linked
  device.updatedAt = Date.now();
  user.updatedAt = Date.now();
}

async function serveStatic(req, res, pathname) {
  let rel = decodeURIComponent(pathname);
  if (rel === '/' || rel === '') rel = '/index.html';
  let filePath = path.join(WEB_DIR, rel);
  const root = path.resolve(WEB_DIR);
  if (!path.resolve(filePath).startsWith(root)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }

  try {
    let st = await fs.stat(filePath);
    if (st.isDirectory()) {
      filePath = path.join(filePath, 'index.html');
      st = await fs.stat(filePath);
    }
  } catch {
    filePath = path.join(WEB_DIR, 'index.html');
    try {
      await fs.stat(filePath);
    } catch {
      cors(res);
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('Windsage web UI not deployed yet. Run npm run export:web');
    }
  }

  const ext = path.extname(filePath).toLowerCase();
  cors(res);
  const headers = {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=86400',
  };
  if (ext === '.zip') {
    headers['Content-Disposition'] = `attachment; filename="${path.basename(filePath)}"`;
  }
  res.writeHead(200, headers);
  createReadStream(filePath).pipe(res);
}

function oauthReturnUrl(returnTo, pub, params) {
  const allowed =
    typeof returnTo === 'string' &&
    (returnTo.startsWith('windsage://') ||
      returnTo.startsWith('exp://') ||
      returnTo.startsWith('exps://') ||
      returnTo.startsWith(`${pub}/`) ||
      returnTo === pub ||
      returnTo === `${pub}/`);
  const base = allowed ? returnTo : `${pub}/`;
  try {
    const target = new URL(base);
    for (const [key, value] of Object.entries(params)) {
      if (value != null) target.searchParams.set(key, String(value));
    }
    return target.toString();
  } catch {
    const q = new URLSearchParams(params).toString();
    return `${pub}/?${q}`;
  }
}

async function handleAuth(req, res, pathname, url) {
  if (req.method === 'GET' && pathname === '/v1/auth/providers') {
    return json(res, 200, { ok: true, providers: providersStatus() });
  }

  if (req.method === 'POST' && pathname === '/v1/auth/register') {
    const body = await readBody(req);
    const u = validateUsername(body.username);
    const p = validatePassword(body.password);
    if (!u.ok) return json(res, 400, { error: u.error });
    if (!p.ok) return json(res, 400, { error: p.error });

    const store = await loadStore(DATA_DIR);
    if (findUserByUsername(store, u.username)) {
      const suggestions = suggestAvailableUsernames(store, u.username, 2);
      return json(res, 409, {
        error: 'Username already taken',
        suggestions,
      });
    }
    const { passwordHash, passwordSalt } = await hashPassword(p.password);
    const user = createUser(store, {
      username: u.username,
      passwordHash,
      passwordSalt,
    });
    await attachDeviceToUser(store, user, body.deviceId, body.secret, body.pushToken, body.webPushSubscription);
    const token = createSession(store, user.id);
    await saveStore(DATA_DIR, store);
    return json(res, 200, {
      ok: true,
      token,
      user: publicUser(user),
      stations: user.stations || [],
      pollIntervalMinutes: user.pollIntervalMinutes || DEFAULT_POLL_MIN,
    });
  }

  if (req.method === 'POST' && pathname === '/v1/auth/login') {
    const body = await readBody(req);
    const store = await loadStore(DATA_DIR);
    const user = findUserByUsername(store, body.username);
    if (!user) return json(res, 401, { error: 'Invalid username or password' });
    const ok = await verifyPassword(body.password, user.passwordHash, user.passwordSalt);
    if (!ok) return json(res, 401, { error: 'Invalid username or password' });
    await attachDeviceToUser(store, user, body.deviceId, body.secret, body.pushToken, body.webPushSubscription);
    const token = createSession(store, user.id);
    await saveStore(DATA_DIR, store);
    return json(res, 200, {
      ok: true,
      token,
      user: publicUser(user),
      stations: user.stations || [],
      pollIntervalMinutes: user.pollIntervalMinutes || DEFAULT_POLL_MIN,
    });
  }

  if (req.method === 'POST' && pathname === '/v1/auth/logout') {
    const store = await loadStore(DATA_DIR);
    const token = parseBearer(req);
    revokeSession(store, token);
    await saveStore(DATA_DIR, store);
    return json(res, 200, { ok: true });
  }

  if (req.method === 'GET' && pathname === '/v1/auth/google/start') {
    const mode = url.searchParams.get('mode') || 'login';
    const deviceId = url.searchParams.get('deviceId') || '';
    const secret = url.searchParams.get('secret') || '';
    const linkToken = url.searchParams.get('token') || '';
    const returnTo = url.searchParams.get('returnTo') || '';
    try {
      const state = encodeOAuthState({ mode, deviceId, secret, linkToken, returnTo });
      return redirect(res, googleAuthUrl(state));
    } catch (error) {
      return json(res, 503, { error: error.message || 'Google not configured' });
    }
  }

  if (req.method === 'GET' && pathname === '/v1/auth/google/callback') {
    const code = url.searchParams.get('code');
    const state = decodeOAuthState(url.searchParams.get('state'));
    const pub = oauthConfig().publicUrl;
    if (!code) {
      return redirect(
        res,
        oauthReturnUrl(state.returnTo, pub, { auth_error: 'Missing Google code' }),
      );
    }
    try {
      const profile = await exchangeGoogleCode(code);
      const store = await loadStore(DATA_DIR);
      let user = findUserByGoogleSub(store, profile.sub);
      const linkToken = state.linkToken || '';
      const linkSession = linkToken ? getSession(store, linkToken) : null;

      if (state.mode === 'link' && linkSession) {
        user = store.users[linkSession.userId];
        if (!user) throw new Error('Account not found for linking');
        const other = findUserByGoogleSub(store, profile.sub);
        if (other && other.id !== user.id) {
          throw new Error('That Google account is already linked to another user');
        }
        user.sso = user.sso || {};
        user.sso.google = { sub: profile.sub, email: profile.email, name: profile.name };
        user.updatedAt = Date.now();
      } else if (!user) {
        user = createUser(store, {
          username: null,
          sso: { google: { sub: profile.sub, email: profile.email, name: profile.name } },
        });
      } else {
        user.sso = user.sso || {};
        user.sso.google = { sub: profile.sub, email: profile.email, name: profile.name };
      }

      await attachDeviceToUser(store, user, state.deviceId, state.secret, null, null);
      const token = createSession(store, user.id);
      await saveStore(DATA_DIR, store);
      return redirect(
        res,
        oauthReturnUrl(state.returnTo, pub, {
          auth_token: token,
          auth_mode: state.mode || 'login',
        }),
      );
    } catch (error) {
      return redirect(
        res,
        oauthReturnUrl(state.returnTo, pub, {
          auth_error: error.message || 'Google sign-in failed',
        }),
      );
    }
  }

  return false;
}

async function handleMe(req, res, pathname) {
  if (!pathname.startsWith('/v1/me')) return false;

  const store = await loadStore(DATA_DIR);
  const auth = requireUser(store, req, res);
  if (!auth) return true;
  const { user } = auth;

  if (req.method === 'GET' && pathname === '/v1/me') {
    return json(res, 200, {
      ok: true,
      user: publicUser(user),
      providers: providersStatus(),
    });
  }

  if (req.method === 'GET' && pathname === '/v1/me/stations') {
    return json(res, 200, {
      ok: true,
      stations: user.stations || [],
      pollIntervalMinutes: user.pollIntervalMinutes || DEFAULT_POLL_MIN,
    });
  }

  if (req.method === 'PUT' && pathname === '/v1/me/stations') {
    const body = await readBody(req);
    const incoming = Array.isArray(body.stations) ? body.stations : [];
    const fixed = await fixSpotStations(incoming);
    user.stations = fixed.stations;
    upsertSharedStations(store, fixed.stations);
    if (body.pollIntervalMinutes) {
      user.pollIntervalMinutes = Math.max(10, Number(body.pollIntervalMinutes) || 10);
    }
    if (body.pushToken) {
      if (!user.pushTokens.includes(body.pushToken)) user.pushTokens.push(body.pushToken);
    }
    if (body.deviceId && body.secret) {
      await attachDeviceToUser(store, user, body.deviceId, body.secret, body.pushToken, body.webPushSubscription);
    }
    user.updatedAt = Date.now();
    await saveStore(DATA_DIR, store);
    // Do not await Windguru bag checks on sync — poll loop + explicit /check cover that.
    // Returning last snapshots keeps PUT fast so app boot is not blocked.
    return json(res, 200, {
      ok: true,
      snapshots: user.snapshots || {},
      stations: user.stations || [],
      annotatedKinds: fixed.changed,
      rewrittenSpots: 0,
    });
  }

  if (req.method === 'GET' && pathname === '/v1/me/snapshot') {
    return json(res, 200, {
      ok: true,
      pollIntervalMinutes: user.pollIntervalMinutes || DEFAULT_POLL_MIN,
      lastPollAt: user.lastPollAt || null,
      stations: user.stations || [],
      snapshots: user.snapshots || {},
      cloud: true,
      user: publicUser(user),
    });
  }

  if (req.method === 'POST' && pathname === '/v1/me/check') {
    await readBody(req).catch(() => ({}));
    const results = await runBagChecks(store, user, { notify: true });
    await saveStore(DATA_DIR, store);
    return json(res, 200, {
      ok: true,
      snapshots: user.snapshots || {},
      notified: results.filter((r) => r.result.shouldNotify).length,
    });
  }

  if (req.method === 'POST' && pathname === '/v1/me/reset-alert') {
    const body = await readBody(req);
    if (!body.followId) return json(res, 400, { error: 'followId required' });
    user.alertStates = user.alertStates || {};
    user.alertStates[body.followId] = { ...DEFAULT_ALERT };
    if (user.snapshots?.[body.followId]) {
      user.snapshots[body.followId].alertState = { ...DEFAULT_ALERT };
    }
    await saveStore(DATA_DIR, store);
    return json(res, 200, { ok: true });
  }

  if (req.method === 'POST' && pathname === '/v1/auth/link/google') {
    // convenience alias under auth — also allow from authenticated client as start URL
    return json(res, 400, { error: 'Use /v1/auth/google/start?mode=link&token=…' });
  }

  return json(res, 404, { error: 'not found' });
}

async function handleDevices(req, res, pathname) {
  if (req.method === 'POST' && pathname === '/v1/devices') {
    const body = await readBody(req);
    if (!body.deviceId || !body.secret) {
      return json(res, 400, { error: 'deviceId and secret required' });
    }
    const store = await loadStore(DATA_DIR);
    const existing = store.devices[body.deviceId];
    if (existing && existing.secret !== body.secret) {
      return json(res, 403, { error: 'device secret mismatch' });
    }
    const device = ensureDevice(store, body.deviceId, body.secret);
    if (body.pushToken) {
      device.pushToken = body.pushToken;
      if (!device.pushTokens.includes(body.pushToken)) device.pushTokens.push(body.pushToken);
    }
    if (body.webPushSubscription) {
      upsertWebPushSubscription(device, body.webPushSubscription);
      if (device.userId && store.users[device.userId]) {
        upsertWebPushSubscription(store.users[device.userId], body.webPushSubscription);
      }
    }
    device.updatedAt = Date.now();
    await saveStore(DATA_DIR, store);
    return json(res, 200, {
      ok: true,
      deviceId: device.id,
      userId: device.userId || null,
    });
  }

  const deviceMatch = pathname.match(/^\/v1\/devices\/([^/]+)(\/.*)?$/);
  if (!deviceMatch) return false;

  const deviceId = decodeURIComponent(deviceMatch[1]);
  const rest = deviceMatch[2] || '';
  const store = await loadStore(DATA_DIR);
  const device = store.devices[deviceId];
  if (!device) return json(res, 404, { error: 'unknown device' });

  const secret = req.headers['x-windsage-secret'];
  if (!secret || secret !== device.secret) {
    return json(res, 401, { error: 'unauthorized' });
  }

  // Linked devices: station mutations go to the user bag.
  const bag =
    device.userId && store.users[device.userId] ? store.users[device.userId] : device;

  if (req.method === 'PUT' && rest === '/stations') {
    const body = await readBody(req);
    const incoming = Array.isArray(body.stations) ? body.stations : [];
    const fixed = await fixSpotStations(incoming);
    bag.stations = fixed.stations;
    upsertSharedStations(store, fixed.stations);
    if (body.pollIntervalMinutes) {
      bag.pollIntervalMinutes = Math.max(10, Number(body.pollIntervalMinutes) || 10);
    }
    if (body.pushToken) {
      device.pushToken = body.pushToken;
      if (!device.pushTokens.includes(body.pushToken)) device.pushTokens.push(body.pushToken);
      if (bag !== device && !bag.pushTokens.includes(body.pushToken)) {
        bag.pushTokens.push(body.pushToken);
      }
    }
    if (body.webPushSubscription) {
      upsertWebPushSubscription(device, body.webPushSubscription);
      upsertWebPushSubscription(bag, body.webPushSubscription);
    }
    device.updatedAt = Date.now();
    bag.updatedAt = Date.now();
    await saveStore(DATA_DIR, store);
    // Skip synchronous Windguru checks on every stations PUT (boot/sync path).
    return json(res, 200, {
      ok: true,
      snapshots: bag.snapshots || {},
      stations: bag.stations || [],
      annotatedKinds: fixed.changed,
      rewrittenSpots: 0,
    });
  }

  if (req.method === 'GET' && rest === '/snapshot') {
    return json(res, 200, {
      ok: true,
      pollIntervalMinutes: bag.pollIntervalMinutes || DEFAULT_POLL_MIN,
      lastPollAt: bag.lastPollAt || null,
      stations: bag.stations || [],
      snapshots: bag.snapshots || {},
      cloud: true,
      userId: device.userId || null,
    });
  }

  if (req.method === 'POST' && rest === '/check') {
    await readBody(req).catch(() => ({}));
    const results = await runBagChecks(store, bag, { notify: true });
    await saveStore(DATA_DIR, store);
    return json(res, 200, {
      ok: true,
      snapshots: bag.snapshots || {},
      notified: results.filter((r) => r.result.shouldNotify).length,
    });
  }

  if (req.method === 'POST' && rest === '/reset-alert') {
    const body = await readBody(req);
    if (!body.followId) return json(res, 400, { error: 'followId required' });
    bag.alertStates = bag.alertStates || {};
    bag.alertStates[body.followId] = { ...DEFAULT_ALERT };
    if (bag.snapshots?.[body.followId]) {
      bag.snapshots[body.followId].alertState = { ...DEFAULT_ALERT };
    }
    await saveStore(DATA_DIR, store);
    return json(res, 200, { ok: true });
  }

  return json(res, 404, { error: 'not found' });
}

async function handleApi(req, res, pathname, url) {
  if (req.method === 'GET' && pathname === '/health') {
    const store = await loadStore(DATA_DIR);
    return json(res, 200, {
      ok: true,
      service: 'windsage-cloud',
      web: true,
      auth: true,
      providers: providersStatus(),
      announcementId: store.announcement?.id || null,
      webPush: vapidConfig().enabled,
      ts: Date.now(),
    });
  }

  if (req.method === 'GET' && pathname === '/v1/announcement') {
    const store = await loadStore(DATA_DIR);
    const a = store.announcement || null;
    return json(res, 200, { ok: true, announcement: a });
  }

  if (req.method === 'GET' && pathname === '/v1/push/vapid-public-key') {
    const cfg = vapidConfig();
    if (!cfg.enabled) return json(res, 503, { error: 'Web Push not configured' });
    return json(res, 200, { ok: true, publicKey: cfg.publicKey });
  }

  // Public: browsers cannot set Windguru Referer, so spot/station resolve must run server-side.
  if (req.method === 'POST' && pathname === '/v1/windguru/resolve') {
    const body = await readBody(req);
    const input = typeof body.input === 'string' ? body.input : '';
    try {
      const resolved = await normalizeWindguruFollowInput(input);
      return json(res, 200, { ok: true, ...resolved });
    } catch (error) {
      return json(res, 400, { error: error.message || 'Could not resolve Windguru ID' });
    }
  }

  // Shared catalog for follow suggestions only — never auto-added to user bags.
  if (req.method === 'GET' && pathname === '/v1/catalog/stations') {
    const store = await loadStore(DATA_DIR);
    return json(res, 200, {
      ok: true,
      stations: publicCatalogStations(store),
    });
  }

  const authHandled = await handleAuth(req, res, pathname, url);
  if (authHandled !== false) return true;

  const meHandled = await handleMe(req, res, pathname);
  if (meHandled !== false) return true;

  const deviceHandled = await handleDevices(req, res, pathname);
  if (deviceHandled !== false) return true;

  return false;
}

async function handle(req, res) {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const { pathname } = url;

  try {
    if (req.method === 'OPTIONS') {
      cors(res);
      res.writeHead(204);
      return res.end();
    }

    if (pathname === '/health' || pathname.startsWith('/v1/')) {
      const handled = await handleApi(req, res, pathname, url);
      if (handled === false) return json(res, 404, { error: 'not found' });
      return;
    }

    if (req.method === 'GET' || req.method === 'HEAD') {
      return serveStatic(req, res, pathname);
    }

    return json(res, 404, { error: 'not found' });
  } catch (error) {
    console.error(error);
    return json(res, 500, { error: error.message || 'server error' });
  }
}

await fs.mkdir(DATA_DIR, { recursive: true });
await fs.mkdir(WEB_DIR, { recursive: true });

const server = http.createServer((req, res) => {
  handle(req, res);
});

server.listen(PORT, HOST, async () => {
  console.log(`[windsage-cloud] http://${HOST}:${PORT}`);
  console.log(`[windsage-cloud] data=${DATA_DIR}`);
  console.log(`[windsage-cloud] web=${WEB_DIR}`);
  console.log(`[windsage-cloud] providers`, providersStatus());
  ensureWebPushConfigured()
    .then((ok) => console.log(`[windsage-cloud] webPush=${ok ? 'enabled' : 'disabled'}`))
    .catch((e) => console.error('[windsage-cloud] webPush init failed', e));
  try {
    const store = await loadStore(DATA_DIR);
    await saveStore(DATA_DIR, store); // persist migrate (sharedStations rebuild)
    console.log(
      `[windsage-cloud] sharedStations=${(store.sharedStations || []).length}`,
    );
  } catch (e) {
    console.error('[windsage-cloud] store migrate failed', e);
  }
  setTimeout(() => {
    pollAll().catch((e) => console.error(e));
  }, 5_000);

  const tick = async () => {
    try {
      await pollAll();
    } catch (e) {
      console.error(e);
    }
    const store = await loadStore(DATA_DIR);
    setTimeout(tick, getPollMs(store));
  };
  setTimeout(tick, DEFAULT_POLL_MIN * 60 * 1000);
});
