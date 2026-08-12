import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const STORE_FILE = 'store.json';

const empty = () => ({
  version: 2,
  devices: {},
  users: {},
  sessions: {},
});

function migrate(store) {
  if (!store.devices) store.devices = {};
  if (!store.users) store.users = {};
  if (!store.sessions) store.sessions = {};
  for (const device of Object.values(store.devices)) {
    if (device.userId === undefined) device.userId = null;
    if (!Array.isArray(device.pushTokens)) {
      device.pushTokens = device.pushToken ? [device.pushToken] : [];
    }
  }
  store.version = 2;
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
