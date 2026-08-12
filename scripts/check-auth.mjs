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
} from '../code/cloud/lib/store.mjs';
import { hashPassword, verifyPassword, validateUsername, validatePassword } from '../code/cloud/lib/auth.mjs';

const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'windsage-auth-'));

const u = validateUsername('nimrod');
assert.equal(u.ok, true);
const p = validatePassword('secret123');
assert.equal(p.ok, true);

const { passwordHash, passwordSalt } = await hashPassword('secret123');
assert.equal(await verifyPassword('secret123', passwordHash, passwordSalt), true);
assert.equal(await verifyPassword('wrong', passwordHash, passwordSalt), false);

let store = await loadStore(dir);
assert.equal(store.version, 2);
const user = createUser(store, {
  username: 'nimrod',
  passwordHash,
  passwordSalt,
  stations: [{ id: 'st_a', stationId: '2259', nickname: 'Caesarea', enabled: true, rule: {} }],
});
const token = createSession(store, user.id);
await saveStore(dir, store);

store = await loadStore(dir);
const found = findUserByUsername(store, 'Nimrod');
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
assert.ok(publicUser(found)?.username === 'nimrod');

console.log('check-auth: ok');
