/**
 * Ranked lookup over the live-station directory.
 * Keep scoring in sync with code/shared/defaults.ts (foldSearchText / searchCatalogStations).
 */

/**
 * Latin city spellings → native-script substrings used on Windguru live names.
 * Keep in sync with code/shared/defaults.ts PLACE_NAME_ALIASES.
 */
export const PLACE_NAME_ALIASES = {
  haifa: ['חיפה'],
  'tel aviv': ['תל אביב'],
  telaviv: ['תל אביב'],
  herzliya: ['הרצליה'],
  eilat: ['אילת'],
  ashkelon: ['אשקלון'],
  ashdod: ['אשדוד'],
  netanya: ['נתניה'],
  acre: ['עכו'],
  akko: ['עכו'],
  jerusalem: ['ירושלים'],
  tiberias: ['טבריה'],
};

export function foldSearchText(value) {
  let s = String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  s = s
    .replace(/ł/g, 'l')
    .replace(/ø/g, 'o')
    .replace(/æ/g, 'ae')
    .replace(/œ/g, 'oe')
    .replace(/ß/g, 'ss')
    .replace(/đ/g, 'd');
  return s;
}

export function compactSearchText(value) {
  return foldSearchText(value).replace(/[^a-z0-9]+/g, '');
}

function catalogKey(provider, stationId) {
  return `${String(provider || 'windguru').toLowerCase()}:${String(stationId ?? '').trim()}`;
}

export function mergeCatalogRows(groups) {
  const byKey = new Map();
  for (const rows of groups || []) {
    for (const row of rows || []) {
      const provider = String(row?.provider || 'windguru').toLowerCase();
      const sid = String(row?.stationId || '').trim();
      if (!sid) continue;
      const key = catalogKey(provider, sid);
      const prev = byKey.get(key);
      if (!prev) {
        byKey.set(key, row);
        continue;
      }
      const next = { ...prev };
      if (!prev.sourceName && row.sourceName) next.sourceName = row.sourceName;
      if (prev.lat == null && row.lat != null && row.lon != null) {
        next.lat = row.lat;
        next.lon = row.lon;
      }
      byKey.set(key, next);
    }
  }
  return [...byKey.values()];
}

export function catalogMatchScore(entry, query) {
  const qRaw = String(query ?? '').trim();
  const q = foldSearchText(qRaw);
  if (!q) return 0;
  const digits = qRaw.replace(/\D/g, '');
  if (q.length < 2 && digits.length < 1) return 0;

  const sid = String(entry?.stationId ?? '').trim();
  const label = foldSearchText(entry?.sourceName || '');
  const live = foldSearchText(entry?.liveStationId || '');
  const sidFold = foldSearchText(sid);
  const qCompact = compactSearchText(qRaw);
  const labelCompact = compactSearchText(entry?.sourceName || '');

  if (label === q || sidFold === q) return 100;
  if (/windguru\.cz/i.test(qRaw) && digits && sid === digits) return 100;
  if (label.startsWith(q) || sidFold.startsWith(q)) return 90;
  if (label.split(/[\s,/._-]+/).some((w) => w.startsWith(q))) return 80;
  const aliases = PLACE_NAME_ALIASES[q];
  if (aliases?.some((alias) => String(entry?.sourceName || '').includes(alias))) return 70;
  if (digits && (sid === digits || sid.startsWith(digits))) return 75;
  if (label.includes(q) || sidFold.includes(q)) return 50;
  if (qCompact.length >= 2 && labelCompact.includes(qCompact)) return 45;
  if (live && (live.includes(q) || (digits && live.includes(digits)))) return 40;
  if (digits.length > 0 && sid.includes(digits)) return 30;
  return 0;
}

export function haversineKm(aLat, aLon, bLat, bLon) {
  const R = 6371;
  const toR = Math.PI / 180;
  const dLat = (bLat - aLat) * toR;
  const dLon = (bLon - aLon) * toR;
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(aLat * toR) * Math.cos(bLat * toR) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

/** Live stations near a geocoded place (Follow city search). */
export function nearbyCatalogStations(catalog, lat, lon, opts = {}) {
  const latitude = Number(lat);
  const longitude = Number(lon);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return [];
  const radiusKm = Number(opts.radiusKm) > 0 ? Number(opts.radiusKm) : 80;
  const limitRaw = Number(opts.limit);
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(Math.trunc(limitRaw), 400) : 80;
  const wantProvider = opts.provider ? String(opts.provider).toLowerCase() : null;
  const wantKind = opts.kind && opts.kind !== 'any' ? String(opts.kind) : null;
  const scored = [];
  for (const entry of catalog || []) {
    const sid = String(entry?.stationId || '').trim();
    if (!sid) continue;
    const provider = String(entry?.provider || 'windguru').toLowerCase();
    if (wantProvider && provider !== wantProvider) continue;
    if (wantKind && String(entry?.kind || 'station') !== wantKind) continue;
    const eLat = Number(entry?.lat);
    const eLon = Number(entry?.lon);
    if (!Number.isFinite(eLat) || !Number.isFinite(eLon)) continue;
    const distanceKm = haversineKm(latitude, longitude, eLat, eLon);
    if (distanceKm > radiusKm) continue;
    scored.push({ entry, distanceKm });
  }
  scored.sort((a, b) => a.distanceKm - b.distanceKm);
  return scored.slice(0, limit).map((row) => row.entry);
}

/** Name hits first, then nearby extras. `total` is the unique union size. */
export function unionCatalogHits(primaryStations, extraStations, limit = 40) {
  const limitRaw = Number(limit);
  const cap = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(Math.trunc(limitRaw), 400) : 40;
  const seen = new Set();
  const out = [];
  for (const row of [...(primaryStations || []), ...(extraStations || [])]) {
    const sid = String(row?.stationId || '').trim();
    if (!sid) continue;
    const key = catalogKey(row.provider, sid);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return { stations: out.slice(0, cap), total: out.length };
}

/**
 * Rank matches over the full directory. Does not drop already-followed IDs.
 * @returns {{ stations: object[], total: number }}
 */
export function searchCatalogStations(catalog, query, opts = {}) {
  const qRaw = String(query ?? '').trim();
  const q = foldSearchText(qRaw);
  const digits = qRaw.replace(/\D/g, '');
  if (!q || (q.length < 2 && digits.length < 1)) {
    return { stations: [], total: 0 };
  }

  const limitRaw = Number(opts.limit);
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(Math.trunc(limitRaw), 400) : 40;
  const wantProvider = opts.provider ? String(opts.provider).toLowerCase() : null;
  const wantKind = opts.kind && opts.kind !== 'any' ? String(opts.kind) : null;
  const exclude = new Set();
  for (const row of opts.exclude || []) {
    const sid = String(row?.stationId ?? '').trim();
    if (sid) exclude.add(catalogKey(row.provider, sid));
  }

  const scored = [];
  for (const entry of catalog || []) {
    const sid = String(entry?.stationId ?? '').trim();
    const provider = String(entry?.provider || 'windguru').toLowerCase();
    if (!sid) continue;
    if (exclude.has(catalogKey(provider, sid))) continue;
    if (wantProvider && provider !== wantProvider) continue;
    if (wantKind && String(entry?.kind || 'station') !== wantKind) continue;
    const score = catalogMatchScore(entry, qRaw);
    if (score > 0) scored.push({ entry, score, sid });
  }
  scored.sort((a, b) => b.score - a.score);
  return {
    stations: scored.slice(0, limit).map((row) => row.entry),
    total: scored.length,
  };
}

/** Put a resolved URL/ID hit first, de-duplicated, capped to limit. */
export function prependCatalogHit(stations, hit, limit) {
  if (!hit?.stationId) return stations || [];
  const key = catalogKey(hit.provider, hit.stationId);
  const rest = (stations || []).filter((row) => catalogKey(row.provider, row.stationId) !== key);
  const out = [hit, ...rest];
  const cap = Number.isFinite(limit) && limit > 0 ? Math.min(Math.trunc(limit), out.length) : out.length;
  return out.slice(0, cap);
}
