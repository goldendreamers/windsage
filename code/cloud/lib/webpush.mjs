/**
 * Web Push (PWA) helpers — optional dependency on `web-push`.
 * Expo push tokens stay separate; most phone users are on the installed website.
 */

let webpushMod = null;
let configured = false;

export function vapidConfig() {
  const publicKey = (process.env.WEB_PUSH_VAPID_PUBLIC || '').trim();
  const privateKey = (process.env.WEB_PUSH_VAPID_PRIVATE || '').trim();
  const subject = (process.env.WEB_PUSH_CONTACT || 'mailto:shakedwald@gmail.com').trim();
  return {
    publicKey,
    privateKey,
    subject,
    enabled: !!(publicKey && privateKey),
  };
}

async function loadWebPush() {
  if (webpushMod) return webpushMod;
  try {
    webpushMod = await import('web-push');
    return webpushMod;
  } catch (error) {
    console.error('[webpush] module missing — run npm install in /data/windsage', error.message || error);
    return null;
  }
}

export async function ensureWebPushConfigured() {
  if (configured) return vapidConfig().enabled;
  const cfg = vapidConfig();
  if (!cfg.enabled) return false;
  const mod = await loadWebPush();
  if (!mod) return false;
  const webpush = mod.default || mod;
  webpush.setVapidDetails(cfg.subject, cfg.publicKey, cfg.privateKey);
  configured = true;
  return true;
}

export function normalizeSubscription(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const endpoint = typeof raw.endpoint === 'string' ? raw.endpoint.trim() : '';
  const keys = raw.keys && typeof raw.keys === 'object' ? raw.keys : null;
  const p256dh = keys && typeof keys.p256dh === 'string' ? keys.p256dh : '';
  const auth = keys && typeof keys.auth === 'string' ? keys.auth : '';
  if (!endpoint || !p256dh || !auth) return null;
  return {
    endpoint,
    expirationTime: raw.expirationTime ?? null,
    keys: { p256dh, auth },
  };
}

export function upsertWebPushSubscription(bag, raw) {
  const sub = normalizeSubscription(raw);
  if (!sub || !bag) return false;
  if (!Array.isArray(bag.webPushSubscriptions)) bag.webPushSubscriptions = [];
  const idx = bag.webPushSubscriptions.findIndex((s) => s?.endpoint === sub.endpoint);
  if (idx >= 0) bag.webPushSubscriptions[idx] = sub;
  else bag.webPushSubscriptions.push(sub);
  return true;
}

export function collectWebPushSubscriptions(bag) {
  const out = [];
  const seen = new Set();
  for (const s of bag?.webPushSubscriptions || []) {
    const n = normalizeSubscription(s);
    if (!n || seen.has(n.endpoint)) continue;
    seen.add(n.endpoint);
    out.push(n);
  }
  return out;
}

export async function sendWebPush(subscription, { title, body, data } = {}) {
  const ok = await ensureWebPushConfigured();
  if (!ok) return { ok: false, skipped: true };
  const mod = await loadWebPush();
  if (!mod) return { ok: false, skipped: true };
  const webpush = mod.default || mod;
  const payload = JSON.stringify({
    title: title || 'Windsage',
    body: body || '',
    data: data || {},
  });
  try {
    await webpush.sendNotification(subscription, payload, {
      TTL: 60 * 60,
      urgency: 'high',
    });
    return { ok: true };
  } catch (error) {
    const status = error?.statusCode || error?.status || 0;
    console.error('[webpush] send failed', status, error?.message || error);
    return { ok: false, status, gone: status === 404 || status === 410 };
  }
}

export async function sendWebPushMany(subscriptions, message) {
  const results = [];
  const alive = [];
  for (const sub of subscriptions || []) {
    const r = await sendWebPush(sub, message);
    results.push(r);
    if (!r.gone) alive.push(sub);
  }
  return { results, alive };
}
