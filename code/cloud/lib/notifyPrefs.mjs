/**
 * Alert volume + channel. Keep in sync with code/shared/defaults.ts.
 */

const NOTIFY_PRESETS = new Set(['annoying', 'normal', 'quiet', 'custom']);
const NOTIFY_CHANNELS = ['phone', 'email', 'discord'];
const ANNOYING_INTERVAL_MIN = 10;

export const DEFAULT_NOTIFY_PREFS = {
  preset: 'normal',
  timesPerDay: 1,
  how: ['phone'],
};

export function utcDayKey(nowMs = Date.now()) {
  return new Date(nowMs).toISOString().slice(0, 10);
}

export function parseNotifyHow(raw) {
  const src = Array.isArray(raw)
    ? raw
    : raw === 'both'
      ? ['phone', 'email']
      : raw == null || raw === ''
        ? []
        : [raw];
  const seen = new Set();
  for (const item of src) {
    if (item === 'phone' || item === 'email' || item === 'discord') seen.add(item);
  }
  const ordered = NOTIFY_CHANNELS.filter((channel) => seen.has(channel));
  return ordered.length ? ordered : ['phone'];
}

export function normalizeNotifyPrefs(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const preset = NOTIFY_PRESETS.has(String(src.preset)) ? src.preset : 'normal';
  const how = parseNotifyHow(src.how);
  const n = Math.trunc(Number(src.timesPerDay));
  const timesPerDay = Number.isFinite(n) ? Math.min(24, Math.max(1, n)) : 1;
  return { preset, timesPerDay, how };
}

export function bagGoogleEmail(bag) {
  const email = bag?.sso?.google?.email;
  if (typeof email !== 'string') return null;
  const trimmed = email.trim();
  return trimmed.includes('@') ? trimmed : null;
}

function resolvedChannels(channels, opts = {}) {
  const hasGoogle = opts.hasGoogleEmail === true;
  const wantEmail = channels.includes('email');
  return {
    push: channels.includes('phone'),
    email: wantEmail && hasGoogle,
    discord: channels.includes('discord'),
  };
}

export function resolveNotifyPrefs(prefs, opts = {}) {
  const n = normalizeNotifyPrefs(prefs);
  if (n.preset === 'annoying') {
    return {
      preset: 'annoying',
      maxPerDay: null,
      minIntervalMinutes: ANNOYING_INTERVAL_MIN,
      ...resolvedChannels(['phone'], opts),
    };
  }
  if (n.preset === 'quiet') {
    return {
      preset: 'quiet',
      maxPerDay: 1,
      minIntervalMinutes: 24 * 60,
      ...resolvedChannels(['email'], opts),
    };
  }
  if (n.preset === 'custom') {
    const times = n.timesPerDay ?? 1;
    return {
      preset: 'custom',
      maxPerDay: times,
      minIntervalMinutes: Math.max(ANNOYING_INTERVAL_MIN, Math.floor((24 * 60) / times)),
      ...resolvedChannels(parseNotifyHow(n.how), opts),
    };
  }
  return {
    preset: 'normal',
    maxPerDay: 1,
    minIntervalMinutes: 24 * 60,
    ...resolvedChannels(['phone'], opts),
  };
}

export function alertNotifyDue(prev, resolved, nowMs = Date.now()) {
  if (!resolved.push && !resolved.email && !resolved.discord) return false;
  const day = utcDayKey(nowMs);
  const count = prev?.notifyDayUtc === day ? Math.max(0, Number(prev.notifyCountToday) || 0) : 0;
  if (resolved.maxPerDay != null && count >= resolved.maxPerDay) return false;
  const lastRaw = prev?.lastNotifyMs;
  const lastMs =
    typeof lastRaw === 'number' && Number.isFinite(lastRaw)
      ? lastRaw
      : prev?.notifiedForRun &&
          typeof prev.lastCheckMs === 'number' &&
          Number.isFinite(prev.lastCheckMs)
        ? prev.lastCheckMs
        : null;
  if (lastMs != null && nowMs - lastMs < resolved.minIntervalMinutes * 60 * 1000) return false;
  if (prev?.notifiedForRun && lastMs == null) return false;
  return true;
}

export function stampAlertNotify(prev, nowMs = Date.now()) {
  const day = utcDayKey(nowMs);
  const count = prev?.notifyDayUtc === day ? Math.max(0, Number(prev.notifyCountToday) || 0) : 0;
  return {
    lastNotifyMs: nowMs,
    notifyDayUtc: day,
    notifyCountToday: count + 1,
  };
}

export function applyNotifyPrefs(bag, body) {
  if (!bag || !body || typeof body.notifyPrefs !== 'object' || body.notifyPrefs == null) return;
  bag.notifyPrefs = normalizeNotifyPrefs(body.notifyPrefs);
}
