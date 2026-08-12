import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const STORE_FILE = 'store.json';

const empty = () => ({
  version: 3,
  devices: {},
  users: {},
  sessions: {},
  /** Shared follow catalog visible to every new/empty user on this server. */
  sharedStations: [],
  /** Latest product update shown in-app (and used by broadcast script). */
  announcement: null,
});

function migrate(store) {
  if (!store.devices) store.devices = {};
  if (!store.users) store.users = {};
  if (!store.sessions) store.sessions = {};
  if (!Array.isArray(store.sharedStations)) store.sharedStations = [];
  if (store.announcement === undefined) store.announcement = null;
  for (const device of Object.values(store.devices)) {
    if (device.userId === undefined) device.userId = null;
    if (!Array.isArray(device.pushTokens)) {
      device.pushTokens = device.pushToken ? [device.pushToken] : [];
    }
    if (!Array.isArray(device.webPushSubscriptions)) device.webPushSubscriptions = [];
  }
  for (const user of Object.values(store.users)) {
    if (!Array.isArray(user.pushTokens)) {
      user.pushTokens = user.pushToken ? [user.pushToken] : [];
    }
    if (!Array.isArray(user.webPushSubscriptions)) user.webPushSubscriptions = [];
  }
  // One-time rebuild if catalog is empty but users/devices already have follows.
  if (store.sharedStations.length === 0) {
    const collected = [];
    for (const user of Object.values(store.users)) {
      collected.push(...(user.stations || []));
    }
    for (const device of Object.values(store.devices)) {
      collected.push(...(device.stations || []));
    }
    if (collected.length) {
      store.sharedStations = mergeStations([], collected);
    }
  }
  store.version = 3;
  return store;
}

export async function loadStore(dataDir) {
  const file = path.join(dataDir, STORE_FILE);
  try {
    const raw = await fs.readFile(file, 'utf8');
    return migrate(JSON.parse(raw));
  } catch {
    return empty();
  }
}

export async function saveStore(dataDir, store) {
  const file = path.join(dataDir, STORE_FILE);
  const tmp = `${file}.tmp`;
  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(tmp, JSON.stringify(migrate(store), null, 2));
  await fs.rename(tmp, file);
}

export function ensureDevice(store, deviceId, secret) {
  if (!store.devices[deviceId]) {
    store.devices[deviceId] = {
      id: deviceId,
      secret,
      userId: null,
      pushToken: null,
      pushTokens: [],
      webPushSubscriptions: [],
      stations: [],
      pollIntervalMinutes: 10,
      alertStates: {},
      snapshots: {},
      createdAt: Date.now(),
      updatedAt: Date.now(),
      lastPollAt: null,
    };
    return store.devices[deviceId];
  }
  const device = store.devices[deviceId];
  if (device.userId === undefined) device.userId = null;
  if (!Array.isArray(device.pushTokens)) {
    device.pushTokens = device.pushToken ? [device.pushToken] : [];
  }
  if (!Array.isArray(device.webPushSubscriptions)) device.webPushSubscriptions = [];
  return device;
}

export function createUser(store, partial = {}) {
  const id = `usr_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`;
  const user = {
    id,
    username: partial.username ?? null,
    passwordHash: partial.passwordHash ?? null,
    passwordSalt: partial.passwordSalt ?? null,
    sso: partial.sso ?? {},
    stations: partial.stations ?? [],
    pollIntervalMinutes: partial.pollIntervalMinutes ?? 10,
    alertStates: partial.alertStates ?? {},
    snapshots: partial.snapshots ?? {},
    pushTokens: partial.pushTokens ?? [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    lastPollAt: null,
  };
  store.users[id] = user;
  return user;
}

export function findUserByUsername(store, username) {
  const needle = String(username || '')
    .trim()
    .toLowerCase();
  if (!needle) return null;
  return (
    Object.values(store.users).find(
      (u) => u.username && String(u.username).toLowerCase() === needle,
    ) || null
  );
}

/** Two unused username alternatives when the desired name is taken. */
export function suggestAvailableUsernames(store, desired, count = 2) {
  const raw = String(desired || 'user')
    .trim()
    .replace(/[^a-zA-Z0-9._-]/g, '');
  const base = (raw.slice(0, 24) || 'user').replace(/[._-]+$/g, '') || 'user';
  const out = [];
  const seen = new Set([base.toLowerCase()]);

  const tryAdd = (candidate) => {
    const c = String(candidate).slice(0, 32);
    if (c.length < 3) return;
    const key = c.toLowerCase();
    if (seen.has(key)) return;
    if (findUserByUsername(store, c)) return;
    seen.add(key);
    out.push(c);
  };

  // Prefer readable variants: name2, name3, …
  for (let n = 2; out.length < count && n < 500; n += 1) {
    tryAdd(`${base}${n}`);
  }
  // Then short random suffixes
  while (out.length < count) {
    tryAdd(`${base}_${crypto.randomBytes(2).toString('hex')}`);
  }
  return out.slice(0, count);
}

export function findUserByGoogleSub(store, sub) {
  if (!sub) return null;
  return Object.values(store.users).find((u) => u.sso?.google?.sub === sub) || null;
}

export function createSession(store, userId, ttlMs = 90 * 24 * 60 * 60 * 1000) {
  const token = crypto.randomBytes(32).toString('hex');
  store.sessions[token] = {
    userId,
    createdAt: Date.now(),
    expiresAt: Date.now() + ttlMs,
  };
  return token;
}

export function getSession(store, token) {
  if (!token) return null;
  const session = store.sessions[token];
  if (!session) return null;
  if (session.expiresAt < Date.now()) {
    delete store.sessions[token];
    return null;
  }
  return session;
}

export function revokeSession(store, token) {
  if (token && store.sessions[token]) delete store.sessions[token];
}

/** Prefer existing user station rules; add guest stations that are new by Windguru id. */
export function mergeStations(userStations = [], guestStations = []) {
  const map = new Map();
  for (const s of userStations) {
    if (s?.stationId?.trim()) map.set(String(s.stationId).trim(), s);
  }
  for (const s of guestStations) {
    const sid = s?.stationId?.trim();
    if (!sid) continue;
    if (!map.has(sid)) map.set(sid, s);
  }
  return [...map.values()];
}

/** Upsert follows into the server-wide catalog (keyed by Windguru stationId). */
export function upsertSharedStations(store, stations = []) {
  if (!Array.isArray(store.sharedStations)) store.sharedStations = [];
  if (!stations?.length) return store.sharedStations;
  const map = new Map();
  for (const s of store.sharedStations) {
    if (s?.stationId?.trim()) map.set(String(s.stationId).trim(), s);
  }
  for (const s of stations) {
    const sid = s?.stationId?.trim();
    if (!sid) continue;
    const prev = map.get(sid);
    if (!prev) {
      map.set(sid, { ...s });
      continue;
    }
    map.set(sid, {
      ...prev,
      ...s,
      // Prefer richer Windguru naming / live-link metadata when present.
      sourceName: s.sourceName || prev.sourceName || null,
      liveStationId: s.liveStationId || prev.liveStationId || null,
      linkedLiveStation: s.linkedLiveStation || prev.linkedLiveStation || null,
      liveLinkWarning:
        s.liveLinkWarning != null ? s.liveLinkWarning : prev.liveLinkWarning ?? null,
      nickname: prev.nickname || s.nickname || '',
      kind: s.kind || prev.kind,
      rule: prev.rule || s.rule,
      enabled: prev.enabled !== false && s.enabled !== false,
    });
  }
  store.sharedStations = [...map.values()];
  return store.sharedStations;
}

/** Fresh local ids so alert state does not collide across users. */
export function cloneStationsForBag(stations = []) {
  return (stations || []).map((s) => ({
    ...s,
    id: `st_${Date.now().toString(36)}_${crypto.randomBytes(3).toString('hex')}`,
  }));
}

/**
 * If a user/device bag has no follows, seed from the shared catalog.
 * Returns true when the bag was modified.
 * @deprecated Do not auto-seed — catalog is suggestion-only.
 */
export function seedBagFromShared(bag, store) {
  return false;
}

/** Public catalog rows for follow suggestions (no alert state / push tokens). */
export function publicCatalogStations(store) {
  return (store.sharedStations || [])
    .filter((s) => s?.stationId?.trim())
    .map((s) => ({
      stationId: String(s.stationId).trim(),
      kind: s.kind === 'spot' ? 'spot' : 'station',
      sourceName: s.sourceName || null,
      nickname: '',
      liveStationId: s.liveStationId || null,
      linkedLiveStation: s.linkedLiveStation || null,
      liveLinkWarning: s.liveLinkWarning || null,
    }));
}

export function publicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    username: user.username,
    sso: {
      google: user.sso?.google
        ? { email: user.sso.google.email || null, linked: true }
        : null,
      facebook: user.sso?.facebook ? { linked: true } : null,
      apple: user.sso?.apple ? { linked: true } : null,
    },
    pollIntervalMinutes: user.pollIntervalMinutes || 10,
    stationCount: (user.stations || []).length,
  };
}
