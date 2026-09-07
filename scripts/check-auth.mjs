/**
 * Smoke test: register → login → put stations → second session pulls same stations.
 * Uses an in-memory temp data dir against auth helpers (no live HTTP).
 */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  loadStore,
  saveStore,
  createUser,
  findUserByUsername,
  createSession,
  getSession,
  mergeStations,
  publicUser,
  ensureDevice,
  linkDeviceToUser,
  unlinkDeviceFromUser,
} from '../code/cloud/lib/store.mjs';
import { hashPassword, verifyPassword, validateUsername, validatePassword } from '../code/cloud/lib/auth.mjs';

const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'windsage-auth-'));

const u = validateUsername('alice');
assert.equal(u.ok, true);
const p = validatePassword('secret123');
assert.equal(p.ok, true);

const { passwordHash, passwordSalt } = await hashPassword('secret123');
assert.equal(await verifyPassword('secret123', passwordHash, passwordSalt), true);
assert.equal(await verifyPassword('wrong', passwordHash, passwordSalt), false);

let store = await loadStore(dir);
assert.equal(store.version, 3);
const user = createUser(store, {
  username: 'alice',
  passwordHash,
  passwordSalt,
  stations: [{ id: 'st_a', stationId: '2259', nickname: 'Caesarea', enabled: true, rule: {} }],
});
const token = createSession(store, user.id);
await saveStore(dir, store);

store = await loadStore(dir);
const found = findUserByUsername(store, 'Alice');
assert.ok(found);
assert.equal(found.id, user.id);
const session = getSession(store, token);
assert.ok(session);
assert.equal(session.userId, user.id);

const merged = mergeStations(
  [{ id: 'st_a', stationId: '2259', nickname: 'User', enabled: true }],
  [
    { id: 'st_b', stationId: '2259', nickname: 'GuestDup', enabled: true },
    { id: 'st_c', stationId: '219', nickname: 'Other', enabled: true },
  ],
);
assert.equal(merged.length, 2);
assert.equal(merged.find((s) => s.stationId === '2259')?.nickname, 'User');
assert.ok(publicUser(found)?.username === 'alice');

// Shared-phone leak regression: login must NOT merge leftover guest follows
// (e.g. "Test reef") into an existing account.
const dad = createUser(store, {
  username: 'dad',
  passwordHash,
  passwordSalt,
  stations: [{ id: 'st_dad', stationId: '15077', nickname: 'לב כנרת', enabled: true, rule: {} }],
});
const guestDevice = ensureDevice(store, 'dev_shared', 'sec_shared');
guestDevice.stations = [
  { id: 'st_guest', stationId: '219', nickname: 'Test reef', enabled: true, rule: {} },
  { id: 'st_caes', stationId: '2259', nickname: 'Caes', enabled: true, rule: {} },
];
linkDeviceToUser(store, dad, 'dev_shared', 'sec_shared', { mergeGuestStations: false });
assert.equal(dad.stations.length, 1);
assert.equal(dad.stations[0].stationId, '15077');
assert.equal(store.devices.dev_shared.stations.length, 0);
assert.equal(store.devices.dev_shared.userId, dad.id);

// Register path may import guest follows into a brand-new empty account.
const newbie = createUser(store, {
  username: 'newbie',
  passwordHash,
  passwordSalt,
  stations: [],
});
const guest2 = ensureDevice(store, 'dev_new', 'sec_new');
guest2.stations = [
  { id: 'st_g', stationId: '219', nickname: 'Test reef', enabled: true, rule: {} },
];
linkDeviceToUser(store, newbie, 'dev_new', 'sec_new', { mergeGuestStations: true });
assert.equal(newbie.stations.length, 1);
assert.equal(newbie.stations[0].stationId, '219');

assert.equal(unlinkDeviceFromUser(store, 'dev_shared', 'sec_shared'), true);
assert.equal(store.devices.dev_shared.userId, null);
assert.equal(store.devices.dev_shared.stations.length, 0);

console.log('check-auth: ok');
