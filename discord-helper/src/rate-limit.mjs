const hits = new Map();
const WINDOW_MS = 30_000;
const MAX = 3;

export function tooManyAsks(userId) {
  const now = Date.now();
  const prev = (hits.get(userId) || []).filter((t) => now - t < WINDOW_MS);
  if (prev.length >= MAX) {
    hits.set(userId, prev);
    return true;
  }
  prev.push(now);
  hits.set(userId, prev);
  return false;
}
