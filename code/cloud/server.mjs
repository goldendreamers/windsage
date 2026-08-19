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
  fetchProviderCurrent,
  fetchProviderForecast,
  fetchProviderHistory,
  fixSpotStations,
  isForecastOnlySpot,
  needsAlertHistory,
  providerOf,
  providerStatus,
  resolveFollowInput,
  sensorId,
  cacheKey,
  mapsStatus,
} from './lib/providers/index.mjs';
import { normalizeWindguruFollowInput, fetchSpotForecastNow } from './lib/wind.mjs';
import { autocompletePlaces, geocodeAddress } from './lib/providers/geo.mjs';
import { resolveLocation } from './lib/providers/location.mjs';
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
  upsertSharedStations,
  publicUser,
  publicCatalogStations,
  linkDeviceToUser,
  unlinkDeviceFromUser,
  simpleModeOf,
  applySimpleMode,
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
import { alertEmailConfig, sendAlertEmail } from './lib/alertEmail.mjs';
import {
  vapidConfig,
  ensureWebPushConfigured,
  upsertWebPushSubscription,
  collectWebPushSubscriptions,
  sendWebPushMany,
} from './lib/webpush.mjs';
import { formatAlertNotificationCopy, formatTestNotificationCopy } from './lib/notifyCopy.mjs';
import { clientIp, takeToken } from './lib/rateLimit.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HOST = process.env.WINDSAGE_HOST || '0.0.0.0';
const PORT = Number(process.env.WINDSAGE_PORT || 8787);
const DATA_DIR = process.env.WINDSAGE_DATA || path.join(__dirname, 'data');
const WEB_DIR = process.env.WINDSAGE_WEB || path.join(__dirname, 'web');
const DEFAULT_POLL_MIN = 10;
/** Reuse provider "current" across bags/checks within this window (shared sensors). */
const READING_CACHE_TTL_MS = 90_000;
/** Spot model forecast changes slowly — reuse prior snap / skip provider hit when fresh. */
const FORECAST_REUSE_TTL_MS = 300_000;
/** key → { at, reading } — process-wide; errors are never stored here. */
const globalReadingCache = new Map();

function getGlobalReading(key) {
  const hit = globalReadingCache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > READING_CACHE_TTL_MS) {
    globalReadingCache.delete(key);
    return null;
  }
  return hit.reading;
}

function setGlobalReading(key, reading) {
  if (!reading || reading.error) return;
  globalReadingCache.set(key, { at: Date.now(), reading });
  if (globalReadingCache.size <= 256) return;
  const now = Date.now();
  for (const [k, v] of globalReadingCache) {
    if (now - v.at > READING_CACHE_TTL_MS) globalReadingCache.delete(k);
  }
}

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

function json(res, status, body, headers = {}) {
  cors(res);
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload),
    'Cache-Control': 'no-store',
    ...headers,
  });
  res.end(payload);
}

/** Bound-concurrency map (simple p-limit) — one slow provider must not stall the whole bag. */
async function mapPool(items, concurrency, fn) {
  const list = Array.isArray(items) ? items : [];
  if (!list.length) return [];
  const limit = Math.max(1, Math.min(concurrency, list.length));
  const out = new Array(list.length);
  let next = 0;
  async function worker() {
    for (;;) {
      const i = next++;
      if (i >= list.length) return;
      out[i] = await fn(list[i], i);
    }
  }
  await Promise.all(Array.from({ length: limit }, () => worker()));
  return out;
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
  const nick = String(station?.nickname ?? '').trim();
  if (nick) return nick;
  const sid = String(station?.stationId ?? '').trim() || '?';
  return station?.kind === 'spot' ? `Spot ${sid}` : `Station ${sid}`;
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
  const { title, body } = formatAlertNotificationCopy(station, result);
  const data = {
    followId: station.id,
    stationId: sid,
    liveStationId: station.liveStationId || station.linkedLiveStation?.id || sid,
    kind: 'alert',
  };

  let delivered = 0;
  const pushTokens = collectPushTokens(bag);
  for (const to of pushTokens) {
    const r = await sendExpoPush({ to, title, body, data });
    if (r?.ok) delivered += 1;
  }

  const subs = collectWebPushSubscriptions(bag);
  if (subs.length) {
    const { results, alive } = await sendWebPushMany(subs, { title, body, data });
    bag.webPushSubscriptions = alive;
    delivered += results.filter((r) => r.ok).length;
  }

  const emailed =
    bag?.username || bag?.email
      ? await sendAlertEmail({ title, body })
      : { ok: false, skipped: true };
  if (emailed?.ok) delivered += 1;

  console.log(
    `[notify] ${station.id} delivered=${delivered} expo=${pushTokens.length} webPush=${subs.length} email=${emailed?.ok ? 1 : 0}`,
  );
  return { delivered, title, body };
}

function sensorPollId(station) {
  if (isForecastOnlySpot(station)) {
    return `spot:${String(station.stationId || '').trim()}`;
  }
  return sensorId(station);
}

function stripProviderMeta(raw) {
  if (!raw || typeof raw !== 'object') return raw;
  const {
    _forecastHistory,
    _forecastModel,
    _locationBlend,
    _trustUpdates,
    _members,
    ...rest
  } = raw;
  return rest;
}

function sensorCacheKey(station) {
  return cacheKey(providerOf(station), sensorPollId(station));
}

/**
 * Apply a stations PUT safely.
 * - Missing/non-array `stations` → leave bag unchanged (token/poll-only updates).
 * - Explicit `[]` while bag non-empty → keep existing unless `clearStations: true`
 *   (blocks boot-race / empty-local wipes; unfollow-all must opt in).
 */
async function resolveStationsPut(bag, body) {
  const existing = Array.isArray(bag.stations) ? bag.stations : [];
  if (!Array.isArray(body?.stations)) {
    return { stations: existing, kept: true, annotatedKinds: 0 };
  }
  const incoming = body.stations;
  if (incoming.length === 0 && existing.length > 0 && body.clearStations !== true) {
    console.warn(
      `[stations-put] refused empty wipe (kept ${existing.length} follows)`,
    );
    return { stations: existing, kept: true, annotatedKinds: 0 };
  }
  const fixed = await fixSpotStations(incoming);
  const nextStations = Array.isArray(fixed) ? fixed : fixed?.stations || [];
  const stations = Array.isArray(nextStations) ? nextStations : existing;
  return {
    stations,
    kept: false,
    annotatedKinds: Array.isArray(fixed) ? 0 : fixed?.changed || 0,
  };
}

/**
 * Attach spot model forecast for UI. When the current reading already *is* the
 * forecast (forecast-only alerts), reuse it and skip a second Windguru hit.
 */
async function attachSpotForecast(station, result, forecastCache, priorSnap) {
  if (!isForecastOnlySpot(station)) {
    return { ...result, forecast: null, forecastModel: null };
  }
  const sid = String(station?.stationId ?? '').trim();
  if (!sid) {
    return { ...result, forecast: null, forecastModel: null };
  }
  const key = `wg:${sid}`;
  if (forecastCache.has(key)) {
    return { ...result, ...forecastCache.get(key) };
  }
  if (result.forecast) {
    const hit = {
      forecast: result.forecast,
      forecastModel: result.forecastModel ?? null,
    };
    forecastCache.set(key, hit);
    return { ...result, ...hit };
  }
  const priorResult = priorSnap?.result;
  const priorAt = priorSnap?.updatedAt;
  if (
    priorResult?.forecast &&
    typeof priorAt === 'number' &&
    Date.now() - priorAt < FORECAST_REUSE_TTL_MS
  ) {
    const hit = {
      forecast: priorResult.forecast,
      forecastModel: priorResult.forecastModel ?? null,
    };
    forecastCache.set(key, hit);
    return { ...result, ...hit };
  }
  try {
    const fc = await fetchProviderForecast(station);
    const hit = { forecast: fc.reading, forecastModel: fc.modelName || null };
    forecastCache.set(key, hit);
    return { ...result, ...hit };
  } catch {
    // Prefer stale prior over wiping UI when the model endpoint blips.
    if (priorResult?.forecast) {
      const hit = {
        forecast: priorResult.forecast,
        forecastModel: priorResult.forecastModel ?? null,
      };
      forecastCache.set(key, hit);
      return { ...result, ...hit };
    }
    const hit = { forecast: null, forecastModel: null };
    forecastCache.set(key, hit);
    return { ...result, ...hit };
  }
}

async function runBagChecks(store, bag, { notify = true } = {}) {
  const stations = (bag.stations || []).filter((s) => s.stationId?.trim());
  if (!bag.alertStates) bag.alertStates = {};
  if (!bag.snapshots) bag.snapshots = {};
  if (!store.stationTrust) store.stationTrust = {};

  const uniqueKeys = [
    ...new Set(stations.map((s) => sensorCacheKey(s)).filter((k) => k && !k.endsWith(':'))),
  ];
  const readingCache = new Map();
  const historyCache = new Map();
  const forecastCache = new Map();
  const stationByKey = new Map();
  for (const s of stations) {
    const k = sensorCacheKey(s);
    if (k && !stationByKey.has(k)) stationByKey.set(k, s);
  }

  // Cap parallel provider fetches so one slow source does not block the whole poll.
  // Process-wide TTL cache avoids re-fetching the same sensor for every user bag.
  await mapPool(uniqueKeys, 4, async (key) => {
    const sample = stationByKey.get(key);
    const shared = getGlobalReading(key);
    if (shared) {
      readingCache.set(key, shared);
      return;
    }
    try {
      const raw = await fetchProviderCurrent(sample, { trustMap: store.stationTrust });
      if (raw && raw._locationBlend) {
        const {
          _locationBlend,
          _trustUpdates,
          _members,
          ...reading
        } = raw;
        readingCache.set(key, reading);
        setGlobalReading(key, reading);
        // Persist blend members + trust back onto matching follows in this bag.
        for (const s of stations) {
          if (sensorCacheKey(s) !== key) continue;
          s.locationBlend = _locationBlend;
          s.liveLinkWarning =
            s.liveLinkWarning ||
            `Blends ${(_members || []).filter((m) => m.ok).length} nearby stations`;
        }
        if (_trustUpdates) {
          for (const [tk, tv] of Object.entries(_trustUpdates)) {
            store.stationTrust[tk] = { ...(store.stationTrust[tk] || {}), ...tv };
          }
        }
      } else {
        readingCache.set(key, raw);
        setGlobalReading(key, raw);
      }
    } catch (error) {
      readingCache.set(key, { error: error.message || 'fetch failed' });
    }
  });

  const results = [];

  for (const station of stations) {
    const sid = String(station?.stationId ?? '').trim();
    if (!sid) continue;
    // Soft-fail one station: never abort the whole bag on a single bad follow.
    try {
      const key = sensorCacheKey(station);
      const prev = { ...DEFAULT_ALERT, ...(bag.alertStates[station.id] || {}) };
      const cached = readingCache.get(key);
      const priorSnap = bag.snapshots[station.id];

      if (!cached || cached.error) {
        const message = cached?.error || 'No reading';
        const nextState = {
          ...prev,
          lastCheckMs: Date.now(),
          lastError: message,
          lastStationId: sid,
        };
        const baseResult = {
          reading: null,
          metricValue: null,
          conditionMet: false,
          sustainedMs: 0,
          shouldNotify: false,
          message,
          forecast: null,
          forecastModel: null,
        };
        const result = await attachSpotForecast(station, baseResult, forecastCache, priorSnap);
        bag.alertStates[station.id] = nextState;
        bag.snapshots[station.id] = {
          reading: null,
          result,
          alertState: nextState,
          updatedAt: Date.now(),
        };
        results.push({ station, result, nextState });
        continue;
      }

      const publicReading = stripProviderMeta(cached);
      // Skip history when rule fails or alert clock is already hot — history only
      // backfills sustained duration the first moment the condition becomes true.
      const hours = Math.max(1, Math.ceil((station.rule.sustainedMinutes + 20) / 60));
      const histKey = `${key}:${station.rule.metric}:${hours}`;
      const emptyHistory = { unixtime: [], values: [] };
      if (cached._forecastHistory) {
        historyCache.set(histKey, cached._forecastHistory);
      } else if (!historyCache.has(histKey)) {
        if (needsAlertHistory(publicReading, station, prev)) {
          try {
            historyCache.set(
              histKey,
              await fetchProviderHistory(station, station.rule.metric, hours, 10),
            );
          } catch {
            historyCache.set(histKey, emptyHistory);
          }
        } else {
          historyCache.set(histKey, emptyHistory);
        }
      }

      const history = historyCache.get(histKey);
      const evaluated = evaluateAlert(publicReading, history, station, prev);
      const withForecast = isForecastOnlySpot(station)
        ? {
            ...evaluated.result,
            forecast: publicReading,
            forecastModel: cached._forecastModel || null,
          }
        : evaluated.result;
      const result = await attachSpotForecast(
        station,
        withForecast,
        forecastCache,
        priorSnap,
      );
      const { nextState } = evaluated;
      bag.alertStates[station.id] = nextState;
      bag.snapshots[station.id] = {
        reading: publicReading,
        result,
        alertState: nextState,
        updatedAt: Date.now(),
      };
      results.push({ station, result, nextState });

      if (notify && result.shouldNotify && station.enabled !== false) {
        const { delivered } = await dispatchAlertNotifications(bag, station, result, sid);
        if (!delivered) {
          const state = bag.alertStates[station.id] || nextState;
          state.notifiedForRun = false;
          bag.alertStates[station.id] = state;
          if (bag.snapshots?.[station.id]) {
            bag.snapshots[station.id].alertState = state;
            bag.snapshots[station.id].result = {
              ...result,
              shouldNotify: true,
              message: `${result.message} · phone alert not delivered yet (allow notifications + install app)`,
            };
          }
          console.warn(`[notify] no delivery for ${station.id} — will retry`);
        }
      }
    } catch (error) {
      const message = error?.message || String(error) || 'poll failed';
      console.error(`[poll] station soft-fail ${station.id}:`, message);
      const prev = { ...DEFAULT_ALERT, ...(bag.alertStates[station.id] || {}) };
      const nextState = {
        ...prev,
        lastCheckMs: Date.now(),
        lastError: message,
        lastStationId: sid,
      };
      bag.alertStates[station.id] = nextState;
      const prior = bag.snapshots[station.id];
      bag.snapshots[station.id] = {
        reading: prior?.reading ?? null,
        result: prior?.result ?? {
          reading: null,
          metricValue: null,
          conditionMet: false,
          sustainedMs: 0,
          shouldNotify: false,
          message,
          forecast: null,
          forecastModel: null,
        },
        alertState: nextState,
        updatedAt: Date.now(),
      };
      results.push({
        station,
        result: bag.snapshots[station.id].result,
        nextState,
      });
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
  const t0 = Date.now();
  const store = await loadStore(DATA_DIR);
  let touched = false;
  let bags = 0;

  for (const user of Object.values(store.users)) {
    const active = (user.stations || []).some((s) => s.enabled !== false && s.stationId?.trim());
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
      bags += 1;
    } catch (error) {
      console.error('[poll] user', user.id, error.message || error);
    }
  }

  for (const deviceId of Object.keys(store.devices)) {
    const device = store.devices[deviceId];
    if (device.userId) continue; // already covered via user
    const active = (device.stations || []).some((s) => s.enabled !== false && s.stationId?.trim());
    if (!active) continue;
    try {
      await runBagChecks(store, device, { notify: true });
      touched = true;
      bags += 1;
    } catch (error) {
      console.error('[poll]', deviceId, error.message || error);
    }
  }

  if (touched) await saveStore(DATA_DIR, store);
  console.log(
    `[poll] done durationMs=${Date.now() - t0} bags=${bags} readingCache=${globalReadingCache.size} ${new Date().toISOString()}`,
  );
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

async function attachDeviceToUser(
  store,
  user,
  deviceId,
  secret,
  pushToken,
  webPushSubscription,
  { mergeGuestStations = false } = {},
) {
  const device = linkDeviceToUser(store, user, deviceId, secret, {
    mergeGuestStations,
    pushToken,
  });
  if (!device) return;
  if (webPushSubscription) {
    upsertWebPushSubscription(device, webPushSubscription);
    upsertWebPushSubscription(user, webPushSubscription);
  }
}

async function serveStatic(req, res, pathname) {
  let rel = decodeURIComponent(pathname);
  if (rel === '/' || rel === '') rel = '/index.html';
  if (rel === '/privacy' || rel === '/privacy/') rel = '/privacy.html';
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
  const base = path.basename(filePath).toLowerCase();
  cors(res);
  const noCache =
    ext === '.html' ||
    base === 'sw.js' ||
    base === 'manifest.webmanifest' ||
    base === 'badge-96.png' ||
    base === 'notify-icon.png' ||
    base.startsWith('sw.js');
  const longCache =
    !noCache && (rel.includes('/_expo/') || rel.includes('/assets/') || ext === '.js');
  const headers = {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Cache-Control': noCache
      ? 'no-cache, no-store, must-revalidate'
      : longCache
        ? 'public, max-age=604800, immutable'
        : 'public, max-age=86400',
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
    const ip = clientIp(req);
    const limited = takeToken(`register:${ip}`, { limit: 8, windowMs: 15 * 60 * 1000 });
    if (!limited.ok) {
      res.setHeader('Retry-After', String(limited.retryAfterSec));
      return json(res, 429, { error: 'Too many sign-ups from this network. Try again later.' });
    }
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
    await attachDeviceToUser(
      store,
      user,
      body.deviceId,
      body.secret,
      body.pushToken,
      body.webPushSubscription,
      { mergeGuestStations: true },
    );
    const token = createSession(store, user.id);
    await saveStore(DATA_DIR, store);
    return json(res, 200, {
      ok: true,
      token,
      user: publicUser(user),
      stations: user.stations || [],
      pollIntervalMinutes: user.pollIntervalMinutes || DEFAULT_POLL_MIN,
      simpleMode: simpleModeOf(user),
    });
  }

  if (req.method === 'POST' && pathname === '/v1/auth/login') {
    const ip = clientIp(req);
    const limited = takeToken(`login:${ip}`, { limit: 30, windowMs: 15 * 60 * 1000 });
    if (!limited.ok) {
      res.setHeader('Retry-After', String(limited.retryAfterSec));
      return json(res, 429, { error: 'Too many login attempts. Try again later.' });
    }
    const body = await readBody(req);
    const store = await loadStore(DATA_DIR);
    const user = findUserByUsername(store, body.username);
    if (!user) return json(res, 401, { error: 'Invalid username or password' });
    const ok = await verifyPassword(body.password, user.passwordHash, user.passwordSalt);
    if (!ok) return json(res, 401, { error: 'Invalid username or password' });
    // Never merge guest-device follows on login (shared-phone leak).
    await attachDeviceToUser(
      store,
      user,
      body.deviceId,
      body.secret,
      body.pushToken,
      body.webPushSubscription,
      { mergeGuestStations: false },
    );
    const token = createSession(store, user.id);
    await saveStore(DATA_DIR, store);
    return json(res, 200, {
      ok: true,
      token,
      user: publicUser(user),
      stations: user.stations || [],
      pollIntervalMinutes: user.pollIntervalMinutes || DEFAULT_POLL_MIN,
      simpleMode: simpleModeOf(user),
    });
  }

  if (req.method === 'POST' && pathname === '/v1/auth/logout') {
    const store = await loadStore(DATA_DIR);
    const token = parseBearer(req);
    revokeSession(store, token);
    const body = await readBody(req).catch(() => ({}));
    if (body?.deviceId && body?.secret) {
      unlinkDeviceFromUser(store, body.deviceId, body.secret);
    }
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

      let created = false;
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
        created = true;
      } else {
        user.sso = user.sso || {};
        user.sso.google = { sub: profile.sub, email: profile.email, name: profile.name };
      }

      await attachDeviceToUser(store, user, state.deviceId, state.secret, null, null, {
        mergeGuestStations: created,
      });
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
      simpleMode: simpleModeOf(user),
    });
  }

  if (req.method === 'PUT' && pathname === '/v1/me/stations') {
    const body = await readBody(req);
    const applied = await resolveStationsPut(user, body);
    user.stations = applied.stations;
    upsertSharedStations(store, user.stations);
    if (body.pollIntervalMinutes != null && Number.isFinite(Number(body.pollIntervalMinutes))) {
      user.pollIntervalMinutes = Number(body.pollIntervalMinutes);
    }
    applySimpleMode(user, body);
    if (body.pushToken) {
      if (!user.pushTokens.includes(body.pushToken)) user.pushTokens.push(body.pushToken);
    }
    if (body.deviceId && body.secret) {
      await attachDeviceToUser(
        store,
        user,
        body.deviceId,
        body.secret,
        body.pushToken,
        body.webPushSubscription,
        { mergeGuestStations: false },
      );
    }
    user.updatedAt = Date.now();
    await saveStore(DATA_DIR, store);
    // Do not await Windguru bag checks on sync — poll loop + explicit /check cover that.
    // Returning last snapshots keeps PUT fast so app boot is not blocked.
    return json(res, 200, {
      ok: true,
      snapshots: user.snapshots || {},
      stations: user.stations || [],
      annotatedKinds: applied.annotatedKinds,
      rewrittenSpots: 0,
      keptStations: applied.kept || undefined,
    });
  }

  if (req.method === 'GET' && pathname === '/v1/me/snapshot') {
    return json(res, 200, {
      ok: true,
      pollIntervalMinutes: user.pollIntervalMinutes || DEFAULT_POLL_MIN,
      simpleMode: simpleModeOf(user),
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

  if (req.method === 'POST' && pathname === '/v1/me/alert-feedback') {
    const body = await readBody(req);
    const followId = typeof body.followId === 'string' ? body.followId.trim() : '';
    const rating = body.rating === 'good' || body.rating === 'meh' ? body.rating : null;
    if (!followId || !rating) {
      return json(res, 400, { error: 'followId and rating (good|meh) required' });
    }
    const station = (user.stations || []).find((s) => s.id === followId);
    if (!station) return json(res, 404, { error: 'Follow not found' });
    if (!Array.isArray(user.alertFeedback)) user.alertFeedback = [];
    user.alertFeedback.push({
      followId,
      stationId: station.stationId,
      provider: station.provider || 'windguru',
      rating,
      at: Date.now(),
    });
    if (user.alertFeedback.length > 80) {
      user.alertFeedback = user.alertFeedback.slice(-80);
    }
    // Soft trust nudge for location blends / shared catalog.
    const tk = `${String(station.provider || 'windguru').toLowerCase()}:${String(station.stationId ?? '').trim()}`;
    if (!store.stationTrust[tk]) store.stationTrust[tk] = {};
    const trust = store.stationTrust[tk];
    const delta = rating === 'good' ? 0.05 : -0.05;
    const prev = Number(trust.alertScore);
    trust.alertScore = Math.max(0, Math.min(1, (Number.isFinite(prev) ? prev : 0.5) + delta));
    trust.updatedAt = Date.now();
    user.updatedAt = Date.now();
    await saveStore(DATA_DIR, store);
    return json(res, 200, { ok: true, rating });
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
    const applied = await resolveStationsPut(bag, body);
    bag.stations = applied.stations;
    upsertSharedStations(store, bag.stations);
    if (body.pollIntervalMinutes != null && Number.isFinite(Number(body.pollIntervalMinutes))) {
      bag.pollIntervalMinutes = Number(body.pollIntervalMinutes);
    }
    applySimpleMode(bag, body);
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
      annotatedKinds: applied.annotatedKinds,
      rewrittenSpots: 0,
      keptStations: applied.kept || undefined,
    });
  }

  if (req.method === 'GET' && rest === '/snapshot') {
    return json(res, 200, {
      ok: true,
      pollIntervalMinutes: bag.pollIntervalMinutes || DEFAULT_POLL_MIN,
      simpleMode: simpleModeOf(bag),
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

  if (req.method === 'POST' && rest === '/test-push') {
    const body = await readBody(req).catch(() => ({}));
    if (body.webPushSubscription) {
      upsertWebPushSubscription(device, body.webPushSubscription);
      upsertWebPushSubscription(bag, body.webPushSubscription);
    }
    if (bag !== device) {
      for (const s of collectWebPushSubscriptions(device)) upsertWebPushSubscription(bag, s);
    }
    const { title, body: bodyText } = formatTestNotificationCopy(
      typeof body.message === 'string' ? body.message : '',
    );
    const data = { kind: 'test' };
    let delivered = 0;
    for (const to of collectPushTokens(bag)) {
      const r = await sendExpoPush({ to, title, body: bodyText, data });
      if (r?.ok) delivered += 1;
    }
    const subs = collectWebPushSubscriptions(bag);
    if (subs.length) {
      const { results, alive } = await sendWebPushMany(subs, {
        title,
        body: bodyText,
        data,
      });
      bag.webPushSubscriptions = alive;
      if (bag !== device) device.webPushSubscriptions = alive;
      delivered += results.filter((r) => r.ok).length;
    }
    await saveStore(DATA_DIR, store);
    console.log(`[notify] test-push device=${deviceId} delivered=${delivered}`);
    return json(res, delivered ? 200 : 400, {
      ok: delivered > 0,
      delivered,
      error: delivered
        ? undefined
        : 'No phone subscription yet. Allow notifications, install the app, open it once, then try again.',
    });
  }

  return json(res, 404, { error: 'not found' });
}

async function handleApi(req, res, pathname, url) {
  if (req.method === 'GET' && pathname === '/health') {
    const store = await loadStore(DATA_DIR);
    const body = {
      ok: true,
      service: 'windsage-cloud',
      web: true,
      auth: true,
      providers: providersStatus(),
      weatherSources: providerStatus(),
      maps: mapsStatus(),
      announcementId: store.announcement?.id || null,
      webPush: vapidConfig().enabled,
      alertEmail: alertEmailConfig().enabled,
      // Stable-ish second bucket for short CDN/browser revalidation (not live ts).
      ts: Math.floor(Date.now() / 1000) * 1000,
    };
    const etag = `W/"health-${body.ts}-${body.announcementId || 'none'}-${body.webPush ? 1 : 0}-${body.alertEmail ? 1 : 0}"`;
    const inm = req.headers['if-none-match'];
    if (inm && inm === etag) {
      cors(res);
      res.writeHead(304, {
        ETag: etag,
        'Cache-Control': 'public, max-age=5, stale-while-revalidate=15',
      });
      return res.end();
    }
    return json(res, 200, body, {
      ETag: etag,
      'Cache-Control': 'public, max-age=5, stale-while-revalidate=15',
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
    const ip = clientIp(req);
    const limited = takeToken(`wg-resolve:${ip}`, { limit: 60, windowMs: 15 * 60 * 1000 });
    if (!limited.ok) {
      res.setHeader('Retry-After', String(limited.retryAfterSec));
      return json(res, 429, { error: 'Too many resolve requests. Try again later.' });
    }
    const body = await readBody(req);
    const input = typeof body.input === 'string' ? body.input : '';
    try {
      const resolved = await normalizeWindguruFollowInput(input);
      return json(res, 200, { ok: true, provider: 'windguru', ...resolved });
    } catch (error) {
      return json(res, 400, { error: error.message || 'Could not resolve Windguru ID' });
    }
  }

  // Public: resolve a follow target for any weather source.
  if (req.method === 'POST' && pathname === '/v1/stations/resolve') {
    const ip = clientIp(req);
    const limited = takeToken(`resolve:${ip}`, { limit: 60, windowMs: 15 * 60 * 1000 });
    if (!limited.ok) {
      res.setHeader('Retry-After', String(limited.retryAfterSec));
      return json(res, 429, { error: 'Too many resolve requests. Try again later.' });
    }
    const body = await readBody(req);
    const input = typeof body.input === 'string' ? body.input : '';
    const provider =
      typeof body.provider === 'string' ? body.provider.trim().toLowerCase() : 'windguru';
    try {
      if (provider === 'location') {
        const resolved = await resolveLocation(input || `${body.lat},${body.lon}`, {
          address: body.address,
          sourceName: body.sourceName,
          lat: body.lat,
          lon: body.lon,
          radiusKm: body.radiusKm,
          maxStations: body.maxStations,
        });
        return json(res, 200, { ok: true, ...resolved });
      }
      const resolved = await resolveFollowInput(provider, input, body);
      return json(res, 200, { ok: true, ...resolved });
    } catch (error) {
      return json(res, 400, { error: error.message || 'Could not resolve station' });
    }
  }

  if (req.method === 'GET' && pathname === '/v1/weather-sources') {
    return json(res, 200, { ok: true, sources: providerStatus(), maps: mapsStatus() });
  }

  if (req.method === 'GET' && pathname === '/v1/maps/config') {
    const maps = mapsStatus();
    return json(res, 200, {
      ok: true,
      searchVia: maps.searchVia || 'google-maps-search',
      fallback: maps.fallback || 'photon',
    });
  }

  if (req.method === 'GET' && pathname === '/v1/geo/autocomplete') {
    const ip = clientIp(req);
    const limited = takeToken(`geo-auto:${ip}`, { limit: 90, windowMs: 15 * 60 * 1000 });
    if (!limited.ok) {
      res.setHeader('Retry-After', String(limited.retryAfterSec));
      return json(res, 429, { error: 'Too many autocomplete requests. Try again later.' });
    }
    const q = String(url.searchParams.get('q') || '').trim();
    try {
      const suggestions = await autocompletePlaces(q);
      return json(res, 200, { ok: true, suggestions });
    } catch (error) {
      return json(res, 400, { error: error.message || 'Autocomplete failed' });
    }
  }

  if (req.method === 'POST' && pathname === '/v1/geo/geocode') {
    const ip = clientIp(req);
    const limited = takeToken(`geo-code:${ip}`, { limit: 60, windowMs: 15 * 60 * 1000 });
    if (!limited.ok) {
      res.setHeader('Retry-After', String(limited.retryAfterSec));
      return json(res, 429, { error: 'Too many geocode requests. Try again later.' });
    }
    const body = await readBody(req);
    try {
      const query =
        typeof body.query === 'string'
          ? body.query
          : typeof body.address === 'string'
            ? body.address
            : '';
      const hit = await geocodeAddress(query);
      return json(res, 200, { ok: true, ...hit });
    } catch (error) {
      return json(res, 400, { error: error.message || 'Geocode failed' });
    }
  }

  // Public: spot forecast “now” (model) for UI when a spot has no native live sensor.
  if (req.method === 'POST' && pathname === '/v1/windguru/forecast') {
    const body = await readBody(req);
    const input = typeof body.input === 'string' ? body.input : typeof body.id === 'string' ? body.id : '';
    const trimmed = String(input).trim();
    const spotId = /^\d+$/.test(trimmed) ? trimmed : trimmed.match(/(\d{3,})/)?.[1];
    try {
      if (!spotId) throw new Error('Paste a Windguru spot URL or number');
      const metric = typeof body.metric === 'string' ? body.metric : 'wind_avg';
      const hours = Number(body.hours);
      const forecast = await fetchSpotForecastNow(
        spotId,
        null,
        metric,
        Number.isFinite(hours) && hours > 0 ? hours : 6,
      );
      return json(res, 200, { ok: true, ...forecast });
    } catch (error) {
      return json(res, 400, { error: error.message || 'Could not fetch forecast' });
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
    // Persist migrate / bak recovery, but never force-write an empty bag.
    if (Object.keys(store.users || {}).length > 0 || (store.sharedStations || []).length > 0) {
      await saveStore(DATA_DIR, store);
    }
    console.log(
      `[windsage-cloud] users=${Object.keys(store.users || {}).length} sharedStations=${(store.sharedStations || []).length}`,
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
