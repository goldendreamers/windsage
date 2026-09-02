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
  applyStationsPut,
  restoreStationsFromBackupStore,
  publicUser,
  ensureDevice,
  linkDeviceToUser,
  unlinkDeviceFromUser,
  upsertSharedStations,
  publicCatalogStations,
} from '../code/cloud/lib/store.mjs';
import {
  applyBagMonitoringSchedules,
  applyMonitoringSchedule,
  bagHasActiveStation,
  monitoringUntilMsForPreset,
} from '../code/cloud/lib/monitoring.mjs';
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
assert.equal(store.version, 3);
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

const twelve = Array.from({ length: 12 }, (_, i) => ({
  id: `st_${i}`,
  provider: 'windguru',
  stationId: String(1000 + i),
  nickname: `S${i}`,
}));
const half = twelve.slice(0, 6);
const shrink = applyStationsPut(twelve, half, {});
assert.equal(shrink.stations.length, 12, 'partial PUT must not drop omitted follows');
assert.equal(shrink.restored, 6);

const unfollowed = applyStationsPut(twelve, twelve.slice(1), {
  removedIds: ['st_0'],
  removedKeys: [{ provider: 'windguru', stationId: '1000' }],
});
assert.equal(unfollowed.stations.length, 11);
assert.equal(unfollowed.stations.some((s) => s.stationId === '1000'), false);

const emptied = applyStationsPut(twelve, [], {});
assert.equal(emptied.stations.length, 12);
assert.equal(emptied.kept, true);
const cleared = applyStationsPut(twelve, [], { clearStations: true });
assert.equal(cleared.stations.length, 0);

const bakStore = {
  users: {
    u1: { stations: twelve },
  },
  devices: {},
};
const liveStore = {
  users: {
    u1: { stations: half },
  },
  devices: {},
};
const rec = restoreStationsFromBackupStore(liveStore, bakStore);
assert.equal(rec.restored, 6);
assert.equal(liveStore.users.u1.stations.length, 12);

store.sharedStations = [
  {
    provider: 'location',
    stationId: '32.1,34.8',
    nickname: 'Home',
    locationBlend: { lat: 32.1, lon: 34.8, address: 'secret', radiusKm: 8, maxStations: 4, members: [] },
    rule: { metric: 'wind_avg', threshold: 15 },
  },
  {
    provider: 'windguru',
    stationId: '2259',
    nickname: 'My secret beach',
    sourceName: 'Caesarea',
    kind: 'station',
    rule: { metric: 'wind_avg', threshold: 99 },
  },
];
upsertSharedStations(store, [
  { provider: 'location', stationId: '1,2', nickname: 'Should not land', locationBlend: { lat: 1, lon: 2 } },
  { provider: 'windguru', stationId: '219', nickname: 'Also private', sourceName: 'Other' },
]);
const pub = publicCatalogStations(store);
assert.equal(pub.some((s) => s.provider === 'location'), false);
assert.equal(pub.some((s) => /secret|Home|private/i.test(JSON.stringify(s))), false);
const caes = pub.find((s) => s.stationId === '2259');
assert.ok(caes);
assert.equal(caes.sourceName, 'Caesarea');
assert.equal(caes.nickname, undefined);
assert.equal(pub.some((s) => s.stationId === '219'), false);

const now = 1_700_000_000_000;
const pausedBag = {
  stations: [
    {
      id: 's1',
      stationId: '219',
      enabled: false,
      monitoringUntilMs: monitoringUntilMsForPreset('day', now),
    },
  ],
};
assert.equal(bagHasActiveStation(pausedBag), false);
assert.equal(applyBagMonitoringSchedules(pausedBag, now), false);
assert.equal(applyBagMonitoringSchedules(pausedBag, now + 24 * 60 * 60 * 1000 + 1), true);
assert.equal(pausedBag.stations[0].enabled, true);
assert.equal(pausedBag.stations[0].monitoringUntilMs, null);
assert.equal(bagHasActiveStation(pausedBag), true);

const onDay = {
  id: 's2',
  stationId: '2259',
  enabled: true,
  monitoringUntilMs: monitoringUntilMsForPreset('day', now),
};
const flippedOff = applyMonitoringSchedule(onDay, now + 24 * 60 * 60 * 1000 + 1);
assert.equal(flippedOff.enabled, false);
assert.equal(flippedOff.monitoringUntilMs, null);
assert.equal(applyMonitoringSchedule({ id: 's3', stationId: '1', enabled: false }, now + 1e12).enabled, false);

console.log('check-auth: ok');
