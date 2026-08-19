import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const STORE_FILE = 'store.json';
const STORE_BAK = 'store.json.bak';

const empty = () => ({
  version: 3,
  devices: {},
  users: {},
  sessions: {},
  /** Shared follow catalog visible to every new/empty user on this server. */
  sharedStations: [],
  /** Latest product update shown in-app (and used by broadcast script). */
  announcement: null,
  /** Global station trust / accuracy scores for location blends. */
  stationTrust: {},
});

function userCount(store) {
  return Object.keys(store?.users || {}).length;
}

function migrate(store) {
  if (!store.devices) store.devices = {};
  if (!store.users) store.users = {};
  if (!store.sessions) store.sessions = {};
  if (!Array.isArray(store.sharedStations)) store.sharedStations = [];
  if (store.announcement === undefined) store.announcement = null;
  if (!store.stationTrust || typeof store.stationTrust !== 'object') store.stationTrust = {};
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

async function readStoreFile(file) {
  const raw = await fs.readFile(file, 'utf8');
  return migrate(JSON.parse(raw));
}

/** Process-wide store cache — avoids load/modify/save races that wiped users. */
let cachedStore = null;
let cachedDir = null;

export async function loadStore(dataDir) {
  const key = path.resolve(dataDir);
  if (cachedStore && cachedDir === key) return cachedStore;

  const file = path.join(dataDir, STORE_FILE);
  const bak = path.join(dataDir, STORE_BAK);
  let primary = null;
  let primaryErr = null;
  try {
    primary = await readStoreFile(file);
  } catch (e) {
    primaryErr = e;
  }

  let backup = null;
  try {
    backup = await readStoreFile(bak);
  } catch {
    backup = null;
  }

  // Prefer bak when primary is missing/corrupt OR looks wiped while bak still has users.
  let loaded;
  if (primary && userCount(primary) === 0 && backup && userCount(backup) > 0) {
    console.error(
      `[store] primary looks wiped (users=0); recovering from ${STORE_BAK} (users=${userCount(backup)})`,
    );
    loaded = backup;
  } else if (primary) {
    loaded = primary;
  } else if (backup) {
    console.error(
      `[store] primary unreadable (${primaryErr?.code || primaryErr?.message}); recovered from ${STORE_BAK} (users=${userCount(backup)})`,
    );
    loaded = backup;
  } else {
    console.error(
      `[store] load failed; starting empty (${primaryErr?.code || primaryErr?.message || 'no file'})`,
    );
    loaded = empty();
  }
  if (loaded && backup && loaded !== backup) {
    const rec = restoreStationsFromBackupStore(loaded, backup);
    if (rec.restored > 0) {
      console.warn(`[store] reattached ${rec.restored} dropped follows from ${STORE_BAK}`);
    }
  }
  cachedStore = loaded;
  cachedDir = key;
  return cachedStore;
}

/** Serialize all store writes per dataDir (concurrent fixed-.tmp rename raced and wiped). */
const saveQueues = new Map();

async function saveStoreUnlocked(dataDir, store) {
  const file = path.join(dataDir, STORE_FILE);
  const bak = path.join(dataDir, STORE_BAK);
  const migrated = migrate(store);
  await fs.mkdir(dataDir, { recursive: true });

  // Refuse catastrophic wipe: never replace a non-empty users bag with empty.
  let onDiskUsers = 0;
  try {
    const disk = await readStoreFile(file);
    onDiskUsers = userCount(disk);
  } catch {
    try {
      const diskBak = await readStoreFile(bak);
      onDiskUsers = userCount(diskBak);
    } catch {
      onDiskUsers = 0;
    }
  }
  if (onDiskUsers > 0 && userCount(migrated) === 0) {
    const err = new Error(
      `[store] refused wipe: on-disk users=${onDiskUsers}, incoming users=0`,
    );
    console.error(err.message);
    throw err;
  }

  // Unique tmp avoids ENOENT when two writers share store.json.tmp.
  const tmp = `${file}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;
  const payload = JSON.stringify(migrated, null, 2);
  await fs.writeFile(tmp, payload);
  try {
    // Rolling bak of previous good file (best-effort).
    try {
      await fs.copyFile(file, bak);
    } catch {
      /* no prior file */
    }
    await fs.rename(tmp, file);
  } catch (e) {
    await fs.unlink(tmp).catch(() => {});
    throw e;
  }
}

export async function saveStore(dataDir, store) {
  const key = path.resolve(dataDir);
  const prev = saveQueues.get(key) || Promise.resolve();
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const queued = prev.then(() => gate);
  saveQueues.set(
    key,
    queued.finally(() => {
      if (saveQueues.get(key) === queued) saveQueues.delete(key);
    }),
  );
  await prev.catch(() => {});
  try {
    await saveStoreUnlocked(dataDir, store);
    cachedStore = store;
    cachedDir = path.resolve(dataDir);
  } finally {
    release();
  }
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
      simpleMode: true,
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
    simpleMode: partial.simpleMode !== false,
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

export function simpleModeOf(bag) {
  return bag?.simpleMode !== false;
}

export function applySimpleMode(bag, body) {
  if (typeof body?.simpleMode === 'boolean') bag.simpleMode = body.simpleMode;
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

/**
 * Link a device to a user.
 * Guest-device follows are merged only when `mergeGuestStations` is true (register).
 * Login must NOT merge — leftover guest bags on a shared phone would pollute
 * another account (e.g. “Test reef” appearing for dad).
 */
export function linkDeviceToUser(
  store,
  user,
  deviceId,
  secret,
  { mergeGuestStations = false, pushToken = null } = {},
) {
  if (!user || !deviceId || !secret) return null;
  const existing = store.devices[deviceId];
  if (existing && existing.secret !== secret) return null;
  const device = ensureDevice(store, deviceId, secret);
  device.userId = user.id;
  if (pushToken) {
    device.pushToken = pushToken;
    if (!device.pushTokens.includes(pushToken)) device.pushTokens.push(pushToken);
    if (!user.pushTokens.includes(pushToken)) user.pushTokens.push(pushToken);
  }
  if (mergeGuestStations && Array.isArray(device.stations) && device.stations.length) {
    user.stations = mergeStations(user.stations || [], device.stations || []);
  }
  if (mergeGuestStations && typeof device.simpleMode === 'boolean') {
    user.simpleMode = device.simpleMode;
  }
  // Device bag is owned by the user while linked — never keep a second copy.
  device.stations = [];
  device.updatedAt = Date.now();
  user.updatedAt = Date.now();
  return device;
}

/** Detach device from any user and clear its guest bag (safe multi-user phones). */
export function unlinkDeviceFromUser(store, deviceId, secret) {
  if (!deviceId || !secret) return false;
  const device = store.devices[deviceId];
  if (!device || device.secret !== secret) return false;
  device.userId = null;
  device.stations = [];
  device.updatedAt = Date.now();
  return true;
}

/** Prefer existing user station rules; add guest stations that are new by Windguru id. */
export function mergeStations(userStations = [], guestStations = []) {
  const map = new Map();
  for (const s of userStations) {
    const k = followKey(s);
    if (k) map.set(k, s);
  }
  for (const s of guestStations) {
    const k = followKey(s);
    if (!k) continue;
    if (!map.has(k)) map.set(k, s);
  }
  return [...map.values()];
}

export function followKey(s) {
  const provider = String(s?.provider || 'windguru').trim().toLowerCase() || 'windguru';
  const sid = String(s?.stationId || '').trim();
  return sid ? `${provider}:${sid}` : '';
}

/**
 * Apply a stations PUT without dropping follows the client omitted by accident.
 * Removals must be explicit (`removedIds` / `removedKeys` or `clearStations`).
 */
export function applyStationsPut(existing = [], incoming, opts = {}) {
  const current = Array.isArray(existing) ? existing.slice() : [];
  if (!Array.isArray(incoming)) {
    return { stations: current, kept: true, restored: 0 };
  }
  if (incoming.length === 0 && current.length > 0 && opts.clearStations !== true) {
    return { stations: current, kept: true, restored: 0 };
  }
  if (incoming.length === 0 && opts.clearStations === true) {
    return { stations: [], kept: false, restored: 0 };
  }

  const removedIds = new Set(
    (opts.removedIds || []).map((id) => String(id || '').trim()).filter(Boolean),
  );
  const removedKeys = new Set();
  for (const raw of opts.removedKeys || []) {
    if (!raw) continue;
    if (typeof raw === 'string') {
      const k = raw.trim();
      if (k) removedKeys.add(k);
      continue;
    }
    const k = followKey(raw);
    if (k) removedKeys.add(k);
  }

  const incomingByKey = new Map();
  for (const s of incoming) {
    const k = followKey(s);
    if (!k) continue;
    incomingByKey.set(k, s);
  }

  const out = [];
  const seen = new Set();
  for (const s of current) {
    const k = followKey(s);
    if (!k) {
      out.push(s);
      continue;
    }
    if (removedIds.has(String(s.id || '').trim()) || removedKeys.has(k)) continue;
    const newer = incomingByKey.get(k);
    out.push(newer ? { ...s, ...newer, id: s.id || newer.id } : s);
    seen.add(k);
  }
  for (const [k, s] of incomingByKey) {
    if (seen.has(k)) continue;
    if (removedIds.has(String(s.id || '').trim()) || removedKeys.has(k)) continue;
    out.push(s);
    seen.add(k);
  }
  const restored = Math.max(0, out.length - incoming.length);
  return { stations: out, kept: false, restored };
}

/** Re-attach follows that still exist on bak but were dropped from the live bag. */
export function restoreStationsFromBackupStore(primary, backup) {
  if (!primary || !backup) return { restored: 0 };
  let restored = 0;
  const mergeBag = (cur, bak, label) => {
    if (!cur || !bak?.stations?.length) return;
    const before = (cur.stations || []).length;
    const merged = mergeStations(cur.stations || [], bak.stations || []);
    const extra = merged.length - before;
    if (extra > 0) {
      console.warn(`[store] restored ${extra} follows for ${label} from bak`);
      cur.stations = merged;
      restored += extra;
    }
  };
  for (const [id, user] of Object.entries(primary.users || {})) {
    mergeBag(user, backup.users?.[id], `user/${id}`);
  }
  for (const [id, device] of Object.entries(primary.devices || {})) {
    mergeBag(device, backup.devices?.[id], `device/${id}`);
  }
  return { restored };
}

/** Upsert follows into the server-wide catalog (keyed by provider:stationId). */
export function upsertSharedStations(store, stations = []) {
  if (!Array.isArray(store.sharedStations)) store.sharedStations = [];
  if (!stations?.length) return store.sharedStations;
  const keyOf = (s) => {
    const provider = String(s?.provider || 'windguru').trim().toLowerCase() || 'windguru';
    const sid = String(s?.stationId || '').trim();
    return sid ? `${provider}:${sid}` : '';
  };
  const map = new Map();
  for (const s of store.sharedStations) {
    const k = keyOf(s);
    if (k) map.set(k, s);
  }
  for (const s of stations) {
    const k = keyOf(s);
    if (!k) continue;
    const prev = map.get(k);
    if (!prev) {
      map.set(k, { ...s, provider: String(s.provider || 'windguru').toLowerCase() });
      continue;
    }
    map.set(k, {
      ...prev,
      ...s,
      provider: String(s.provider || prev.provider || 'windguru').toLowerCase(),
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
      provider: String(s.provider || 'windguru').toLowerCase(),
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
    simpleMode: user.simpleMode !== false,
    stationCount: (user.stations || []).length,
  };
}
