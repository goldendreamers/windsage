import assert from 'node:assert/strict';
import {
  alarmPulseDue,
  normalizeWakeVia,
  startWindAlarm,
  stopWindAlarm,
  syncWindAlarmWithStations,
  wakeCopy,
  wakeOnWindOf,
  wakeViaOf,
} from '../code/cloud/lib/windAlarm.mjs';

const bag = { simpleMode: false, stations: [] };
const station = {
  id: 'st1',
  enabled: true,
  wakeOnWind: true,
  wakeOnWindVia: 'discord',
};
assert.equal(wakeOnWindOf(station, bag), true);
assert.equal(wakeViaOf(station), 'discord');
assert.equal(normalizeWakeVia('native'), 'native');
assert.equal(wakeOnWindOf(station, { simpleMode: true }), false);
assert.equal(wakeOnWindOf({ ...station, enabled: false }, bag), false);
assert.equal(wakeOnWindOf({ ...station, wakeOnWind: false }, bag), false);

bag.stations = [station];
const alarm = startWindAlarm(bag, {
  followId: 'st1',
  title: 'Caesarea',
  body: '15 kt',
  via: 'discord',
});
assert.equal(alarm.via, 'discord');
assert.equal(alarmPulseDue({ ...alarm, lastPushAt: 0, startedAt: Date.now() }), 'pulse');
assert.equal(syncWindAlarmWithStations(bag), false);
station.wakeOnWind = false;
assert.equal(syncWindAlarmWithStations(bag), true);
assert.equal(bag.windAlarm, null);

station.wakeOnWind = true;
startWindAlarm(bag, { followId: 'st1', title: 'Caesarea', body: '15 kt', via: 'native' });
assert.equal(stopWindAlarm(bag), true);
assert.equal(bag.windAlarm, null);

const copy = wakeCopy('Spot', 'Wind is up', 'native');
assert.match(copy.title, /WAKE UP/);
assert.match(copy.body, /phone/);
assert.match(wakeCopy('Spot', 'Wind is up', 'discord').body, /DMing/);

console.log('check-wind-alarm: ok');
