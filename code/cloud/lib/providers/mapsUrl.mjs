/**
 * Parse Google Maps / Apple Maps / Waze / OSM / geo: links into lat,lon or a place query.
 * Short links (maps.app.goo.gl) are resolved server-side by following redirects.
 */
import { fetchWithTimeout } from './common.mjs';

const GEO_UA =
  'Windsage/1.0 (+https://windsage.nimrod.bio; friend-group wind alerts)';

const SHORT_HOSTS = new Set(['maps.app.goo.gl', 'goo.gl', 'g.co']);

function tryUrl(text) {
  try {
    const raw = String(text || '').trim();
    if (!raw) return null;
    if (/^https?:\/\//i.test(raw)) return new URL(raw);
    if (/^(maps\.app\.goo\.gl|goo\.gl|g\.co)\//i.test(raw)) return new URL(`https://${raw}`);
    return null;
  } catch {
    return null;
  }
}

function hostLooksLikeMaps(hostname, pathname) {
  const h = String(hostname || '').toLowerCase();
  const p = String(pathname || '').toLowerCase();
  if (SHORT_HOSTS.has(h)) return true;
  if (h === 'maps.google.com' || h.startsWith('maps.google.')) return true;
  if (h === 'maps.apple.com') return true;
  if (h === 'waze.com' || h.endsWith('.waze.com')) return true;
  if (h === 'openstreetmap.org' || h.endsWith('.openstreetmap.org') || h === 'osm.org') return true;
  if (h === 'google.com' || h.endsWith('.google.com') || /(^|\.)google\./.test(h)) {
    return p.includes('/maps');
  }
  return false;
}

export function looksLikeMapUrl(text) {
  const t = String(text || '').trim();
  if (!t) return false;
  if (/^geo:/i.test(t)) return true;
  const u = tryUrl(t);
  if (u && hostLooksLikeMaps(u.hostname, u.pathname)) return true;
  return /maps\.app\.goo\.gl|goo\.gl\/maps|g\.co\/maps|google\.[^/\s]+\/maps|maps\.google\.|maps\.apple\.com|waze\.com\/ul|openstreetmap\.org/i.test(
    t,
  );
}

export function looksLikeShortMapUrl(text) {
  const u = tryUrl(text);
  if (!u) return /maps\.app\.goo\.gl\/|goo\.gl\/maps\/|g\.co\/maps\//i.test(String(text || ''));
  return SHORT_HOSTS.has(u.hostname.toLowerCase());
}

function validCoords(lat, lon) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { lat, lon };
}

function applyHemi(value, hemi, negativeLetters) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const h = String(hemi || '').toUpperCase();
  if (negativeLetters.includes(h)) return -Math.abs(n);
  if (h) return Math.abs(n);
  return n;
}

function dmsToDec(deg, min, sec, hemi, negativeLetters) {
  const d = Number(deg);
  const m = Number(min || 0);
  const s = Number(sec || 0);
  if (!Number.isFinite(d) || !Number.isFinite(m) || !Number.isFinite(s)) return null;
  const signed = applyHemi(d + m / 60 + s / 3600, hemi, negativeLetters);
  return signed;
}

/**
 * Pasteable coordinates: "32.16, 34.80", "32.16 34.80", "32.16N 34.80E",
 * "lat: 32.16 lon: 34.80", "32°09'52\"N 34°47'46\"E".
 */
export function parseLatLon(text) {
  const t = String(text || '')
    .trim()
    .replace(/^loc:/i, '');
  if (!t || t.length > 160) return null;
  if (/^https?:\/\//i.test(t) || /^geo:/i.test(t)) return null;

  const labeled = t.match(
    /lat(?:itude)?\s*[:=]?\s*([+\-]?\d+(?:\.\d+)?)\s*[,;\s]+lon(?:g(?:itude)?)?\s*[:=]?\s*([+\-]?\d+(?:\.\d+)?)/i,
  );
  if (labeled) return validCoords(Number(labeled[1]), Number(labeled[2]));

  const dms = t.match(
    /^(\d{1,3})\s*°\s*(\d{1,2})?\s*['′]?\s*(\d{1,2}(?:\.\d+)?)?\s*["″]?\s*([NSns])\s*[,;/\s]+(\d{1,3})\s*°\s*(\d{1,2})?\s*['′]?\s*(\d{1,2}(?:\.\d+)?)?\s*["″]?\s*([EWew])$/,
  );
  if (dms) {
    const lat = dmsToDec(dms[1], dms[2], dms[3], dms[4], 'S');
    const lon = dmsToDec(dms[5], dms[6], dms[7], dms[8], 'W');
    return validCoords(lat, lon);
  }

  const degHemi = t.match(
    /^([+\-]?\d+(?:\.\d+)?)\s*°?\s*([NSns])\s*[,;/\s]+([+\-]?\d+(?:\.\d+)?)\s*°?\s*([EWew])$/,
  );
  if (degHemi) {
    return validCoords(applyHemi(degHemi[1], degHemi[2], 'S'), applyHemi(degHemi[3], degHemi[4], 'W'));
  }

  const prefixHemi = t.match(
    /^([NSns])\s*([+\-]?\d+(?:\.\d+)?)\s*[,;/\s]+([EWew])\s*([+\-]?\d+(?:\.\d+)?)$/,
  );
  if (prefixHemi) {
    return validCoords(
      applyHemi(prefixHemi[2], prefixHemi[1], 'S'),
      applyHemi(prefixHemi[4], prefixHemi[3], 'W'),
    );
  }

  const pair = t.match(
    /^\(?\s*([+\-]?\d{1,3}(?:\.\d+)?)\s*[,;/\s]+\s*([+\-]?\d{1,3}(?:\.\d+)?)\s*\)?$/,
  );
  if (pair) {
    const onlySpace = !/[,;/]/.test(t);
    if (onlySpace && !t.includes('.')) return null;
    return validCoords(Number(pair[1]), Number(pair[2]));
  }

  return null;
}

function decodePathPlace(raw) {
  try {
    return decodeURIComponent(String(raw || '').replace(/\+/g, ' ')).replace(/\/+$/, '').trim();
  } catch {
    return String(raw || '').replace(/\+/g, ' ').trim();
  }
}

/**
 * Extract the most precise pin from a maps URL or HTML snippet.
 * Prefers !3d/!4d (place) over @lat,lon (camera).
 */
export function parseCoordsFromMapText(text) {
  const t = String(text || '').trim();
  if (!t) return null;

  const geo = t.match(/^geo:(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/i);
  if (geo) return validCoords(Number(geo[1]), Number(geo[2]));

  const bang = t.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);
  if (bang) return validCoords(Number(bang[1]), Number(bang[2]));

  const at = t.match(/@(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/);
  if (at) return validCoords(Number(at[1]), Number(at[2]));

  const qll = t.match(
    /[?&#](?:q|query|ll|center|destination|daddr|sll|q1)=(-?\d+(?:\.\d+)?)(?:%2[cC]|,|\s*\+\s*|\s+)(-?\d+(?:\.\d+)?)/i,
  );
  if (qll) return validCoords(Number(qll[1]), Number(qll[2]));

  const osmHash = t.match(/[#&]map=\d+\/(-?\d+(?:\.\d+)?)\/(-?\d+(?:\.\d+)?)/);
  if (osmHash) return validCoords(Number(osmHash[1]), Number(osmHash[2]));

  const mlat = t.match(/[?&]mlat=(-?\d+(?:\.\d+)?)/i);
  const mlon = t.match(/[?&]mlon=(-?\d+(?:\.\d+)?)/i);
  if (mlat && mlon) return validCoords(Number(mlat[1]), Number(mlon[1]));

  const appleLl = t.match(/[?&]ll=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/i);
  if (appleLl) return validCoords(Number(appleLl[1]), Number(appleLl[2]));

  return parseLatLon(t);
}

/** Place name from a maps URL when coords are missing (e.g. /maps/place/Herzliya+Marina/). */
export function extractPlaceQueryFromMapUrl(text) {
  const t = String(text || '').trim();
  const u = tryUrl(t);
  const src = u ? u.toString() : t;

  const placePath = src.match(/\/maps\/place\/([^/@?]+)/i);
  if (placePath) {
    const name = decodePathPlace(placePath[1]);
    if (name && !/^-?\d/.test(name)) return name;
  }

  const searchPath = src.match(/\/maps\/search\/([^/@?]+)/i);
  if (searchPath) {
    const name = decodePathPlace(searchPath[1]);
    if (name && !parseCoordsFromMapText(name)) return name;
  }

  try {
    const url = u || (src.includes('://') ? new URL(src) : null);
    if (url) {
      for (const key of ['q', 'query', 'destination', 'daddr', 'address']) {
        const val = url.searchParams.get(key);
        if (!val) continue;
        if (parseCoordsFromMapText(val) || parseCoordsFromMapText(`?q=${val}`)) continue;
        const name = decodePathPlace(val);
        if (name && name.length >= 2) return name;
      }
    }
  } catch {
    // ignore
  }
  return null;
}

export async function followMapShortUrl(input) {
  const raw = String(input || '').trim();
  const start = tryUrl(raw.startsWith('http') ? raw : `https://${raw}`);
  if (!start || !looksLikeShortMapUrl(start.toString())) return null;

  const response = await fetchWithTimeout(start.toString(), {
    method: 'GET',
    redirect: 'follow',
    headers: {
      'User-Agent': GEO_UA,
      Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
    },
  });
  const finalUrl = String(response.url || '');
  let html = '';
  try {
    html = await response.text();
  } catch {
    html = '';
  }
  const blob = `${finalUrl}\n${html.slice(0, 250_000)}`;
  return { finalUrl, blob };
}

/**
 * @returns {{ coords: {lat,lon}|null, placeQuery: string|null, resolvedUrl: string|null }}
 */
export async function resolveMapInput(text) {
  const raw = String(text || '').trim();
  let coords = parseCoordsFromMapText(raw);
  let placeQuery = extractPlaceQueryFromMapUrl(raw);
  let resolvedUrl = null;

  if (!coords && looksLikeShortMapUrl(raw)) {
    try {
      const followed = await followMapShortUrl(raw);
      if (followed) {
        resolvedUrl = followed.finalUrl;
        coords = parseCoordsFromMapText(followed.blob) || parseCoordsFromMapText(followed.finalUrl);
        placeQuery = placeQuery || extractPlaceQueryFromMapUrl(followed.finalUrl);
      }
    } catch {
      // caller may still try name search
    }
  }

  return { coords, placeQuery, resolvedUrl };
}

export { GEO_UA };
