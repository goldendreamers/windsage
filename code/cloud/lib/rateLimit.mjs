/**
 * Tiny in-memory rate limiter (per-process). Enough for friend-group login/register.
 * Keyed by client IP + bucket name.
 */

const buckets = new Map();

function prune(now, windowMs) {
  for (const [key, hits] of buckets) {
    const kept = hits.filter((t) => now - t < windowMs);
    if (kept.length) buckets.set(key, kept);
    else buckets.delete(key);
  }
}

export function clientIp(req) {
  const xf = req.headers['x-forwarded-for'];
  if (typeof xf === 'string' && xf.trim()) return xf.split(',')[0].trim();
  const cf = req.headers['cf-connecting-ip'];
  if (typeof cf === 'string' && cf.trim()) return cf.trim();
  return req.socket?.remoteAddress || 'unknown';
}

/**
 * @returns {{ ok: true } | { ok: false, retryAfterSec: number }}
 */
export function takeToken(key, { limit = 20, windowMs = 15 * 60 * 1000 } = {}) {
  const now = Date.now();
  if (buckets.size > 5000) prune(now, windowMs);
  const hits = (buckets.get(key) || []).filter((t) => now - t < windowMs);
  if (hits.length >= limit) {
    const oldest = hits[0] || now;
    const retryAfterSec = Math.max(1, Math.ceil((oldest + windowMs - now) / 1000));
    buckets.set(key, hits);
    return { ok: false, retryAfterSec };
  }
  hits.push(now);
  buckets.set(key, hits);
  return { ok: true };
}
