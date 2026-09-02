/**
 * Alert volume + channel. Keep in sync with code/shared/defaults.ts.
 * Lives on the user/device bag — never the public catalog.
 */

const NOTIFY_PRESETS = new Set(['annoying', 'normal', 'quiet', 'custom']);
const NOTIFY_HOWS = new Set(['phone', 'email', 'both']);
const ANNOYING_INTERVAL_MIN = 10;

export const DEFAULT_NOTIFY_PREFS = {
  preset: 'normal',
  timesPerDay: 1,
  how: 'phone',
};

export function utcDayKey(nowMs = Date.now()) {
  return new Date(nowMs).toISOString().slice(0, 10);
}

export function normalizeNotifyPrefs(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const preset = NOTIFY_PRESETS.has(String(src.preset)) ? src.preset : 'normal';
  const how = NOTIFY_HOWS.has(String(src.how)) ? src.how : 'phone';
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

export function resolveNotifyPrefs(prefs, opts = {}) {
  const n = normalizeNotifyPrefs(prefs);
  const hasGoogle = opts.hasGoogleEmail === true;
  if (n.preset === 'annoying') {
    return {
      preset: 'annoying',
      maxPerDay: null,
      minIntervalMinutes: ANNOYING_INTERVAL_MIN,
      push: true,
      email: false,
      needsGoogle: false,
      googleMissing: false,
    };
  }
  if (n.preset === 'quiet') {
    return {
      preset: 'quiet',
      maxPerDay: 1,
      minIntervalMinutes: 24 * 60,
      push: false,
      email: hasGoogle,
      needsGoogle: true,
      googleMissing: !hasGoogle,
    };
  }
  if (n.preset === 'custom') {
    const times = n.timesPerDay ?? 1;
    const how = n.how ?? 'phone';
    const wantEmail = how === 'email' || how === 'both';
    const wantPush = how === 'phone' || how === 'both';
    return {
      preset: 'custom',
      maxPerDay: times,
      minIntervalMinutes: Math.max(ANNOYING_INTERVAL_MIN, Math.floor((24 * 60) / times)),
      push: wantPush,
      email: wantEmail && hasGoogle,
      needsGoogle: wantEmail,
      googleMissing: wantEmail && !hasGoogle,
    };
  }
  return {
    preset: 'normal',
    maxPerDay: 1,
    minIntervalMinutes: 24 * 60,
    push: true,
    email: false,
    needsGoogle: false,
    googleMissing: false,
  };
}

export function alertNotifyDue(prev, resolved, nowMs = Date.now()) {
  if (!resolved.push && !resolved.email) return false;
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
