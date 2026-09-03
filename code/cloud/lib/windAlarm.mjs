/**
 * Advanced-mode per-station “wake me up when there is wind”.
 * Rings natively (phone push + in-app siren) or via repeating Discord DMs until stopped.
 */

export const ALARM_PULSE_MS = 25_000;
export const ALARM_MAX_MS = 30 * 60 * 1000;

export function normalizeWakeVia(value) {
  return String(value || '').trim().toLowerCase() === 'discord' ? 'discord' : 'native';
}

export function wakeOnWindOf(station, bag) {
  if (!station || station.enabled === false) return false;
  if (bag?.simpleMode !== false) return false;
  return station.wakeOnWind === true;
}

export function wakeViaOf(station) {
  return normalizeWakeVia(station?.wakeOnWindVia);
}

export function startWindAlarm(bag, { followId, title, body, via } = {}) {
  if (!bag) return null;
  bag.windAlarm = {
    followId: String(followId || ''),
    title: String(title || 'Windsage'),
    body: String(body || 'Wind is up'),
    via: normalizeWakeVia(via),
    startedAt: Date.now(),
    lastPushAt: 0,
    pulses: 0,
  };
  return bag.windAlarm;
}

export function stopWindAlarm(bag) {
  if (!bag) return false;
  if (!bag.windAlarm) return false;
  bag.windAlarm = null;
  bag.updatedAt = Date.now();
  return true;
}

export function syncWindAlarmWithStations(bag) {
  const alarm = bag?.windAlarm;
  if (!alarm) return false;
  const station = (bag.stations || []).find((s) => s && s.id === alarm.followId);
  if (!wakeOnWindOf(station, bag)) return stopWindAlarm(bag);
  return false;
}

export function alarmPulseDue(alarm, now = Date.now()) {
  if (!alarm) return 'none';
  if (now - Number(alarm.startedAt || 0) > ALARM_MAX_MS) return 'expire';
  if (now - Number(alarm.lastPushAt || 0) < ALARM_PULSE_MS) return 'wait';
  return 'pulse';
}

export function markAlarmPulsed(alarm, now = Date.now()) {
  if (!alarm) return;
  alarm.lastPushAt = now;
  alarm.pulses = Number(alarm.pulses || 0) + 1;
}

export function publicWindAlarm(bag) {
  const alarm = bag?.windAlarm;
  if (!alarm) return null;
  return {
    followId: alarm.followId || null,
    title: alarm.title || 'Windsage',
    body: alarm.body || 'Wind is up',
    via: normalizeWakeVia(alarm.via),
    startedAt: alarm.startedAt || null,
  };
}

export function wakeCopy(title, body, via) {
  const ring =
    via === 'discord'
      ? 'This keeps DMing until you open Windsage and tap Stop ringing.'
      : 'This keeps ringing on your phone until you open Windsage and tap Stop ringing.';
  return {
    title: `WAKE UP · ${title || 'Windsage'}`,
    body: `${body || 'Wind is up'}\n${ring}`.slice(0, 1800),
  };
}
