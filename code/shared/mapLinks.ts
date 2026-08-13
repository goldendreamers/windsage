/** Client-side detector for pasted map links (server does full parse + short-link follow). */

export function looksLikeMapQuery(text: string): boolean {
  const t = String(text || '').trim();
  if (!t) return false;
  if (/^geo:/i.test(t)) return true;
  if (/^https?:\/\//i.test(t)) {
    return /google\.|goo\.gl|g\.co|maps\.apple\.com|waze\.com|openstreetmap\.org/i.test(t);
  }
  return /maps\.app\.goo\.gl|goo\.gl\/maps|google\.[^\s/]+\/maps|maps\.google\.|maps\.apple\.com|waze\.com\/ul/i.test(
    t,
  );
}

export function looksLikeLatLon(text: string): boolean {
  return /^-?\d{1,3}(?:\.\d+)?\s*,\s*-?\d{1,3}(?:\.\d+)?$/.test(String(text || '').trim());
}
