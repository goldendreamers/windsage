/** Client-side detector for pasted map links and coordinates (server does full parse). */

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

/** True for pasted lat/lon (comma, space, N/E, DMS, lat:/lon:). Not a single Windguru id. */
export function looksLikeLatLon(text: string): boolean {
  const t = String(text || '').trim();
  if (!t || t.length > 160 || /^https?:\/\//i.test(t)) return false;
  if (/lat(?:itude)?/i.test(t) && /lon(?:g(?:itude)?)?/i.test(t) && /-?\d/.test(t)) return true;
  if (/\d\s*°/.test(t) && /[NSns]/.test(t) && /[EWew]/.test(t)) return true;
  if (/^[\s(]*[+\-]?\d{1,3}(?:\.\d+)?\s*°?\s*[NSns]\s*[,;/\s]+[+\-]?\d{1,3}(?:\.\d+)?\s*°?\s*[EWew][\s)]*$/.test(t)) {
    return true;
  }
  if (/^[NSns]\s*[+\-]?\d{1,3}(?:\.\d+)?\s*[,;/\s]+[EWew]\s*[+\-]?\d{1,3}(?:\.\d+)?$/.test(t)) {
    return true;
  }
  if (/^[\s(]*[+\-]?\d{1,3}(?:\.\d+)?\s*[,;/]\s*[+\-]?\d{1,3}(?:\.\d+)?[\s)]*$/.test(t)) {
    return true;
  }
  if (/^[+\-]?\d{1,3}\.\d+\s+[+\-]?\d{1,3}\.\d+$/.test(t)) return true;
  return false;
}
