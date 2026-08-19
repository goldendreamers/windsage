/**
 * Parse Google Maps / Apple Maps / Waze / OSM / geo: links into lat,lon or a place query.
 * Short links (maps.app.goo.gl) are resolved server-side by following redirects.
 */
import { fetchWithTimeout } from './common.mjs';

const GEO_UA =
  'Windsage/1.0 (+https://windsage.nimrod.bio; friend-group wind alerts)';

/** Browser-like UA — Google Maps HTML is empty of place coords with a bot UA. */
const MAPS_FETCH_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

const SHORT_HOSTS = new Set(['maps.app.goo.gl', 'goo.gl', 'g.co']);

function decodeLoose(raw) {
  try {
    return decodeURIComponent(String(raw || '').replace(/\+/g, ' '));
  } catch {
    return String(raw || '').replace(/\+/g, ' ');
  }
}

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
  if (/<iframe\b/i.test(t) && /google\.[^"'<\s]+\/maps/i.test(t)) return true;
  if (/\/maps\/embed\?/i.test(t) || /[?&]pb=!1m/i.test(t)) return true;
  const extracted = extractMapsUrlFromText(t);
  if (extracted && extracted !== t) {
    const u = tryUrl(extracted);
    if (u && hostLooksLikeMaps(u.hostname, u.pathname)) return true;
  }
  const u = tryUrl(t);
  if (u && hostLooksLikeMaps(u.hostname, u.pathname)) return true;
  return /maps\.app\.goo\.gl|goo\.gl\/maps|g\.co\/maps|google\.[^/\s]+\/maps|maps\.google\.|maps\.apple\.com|waze\.com\/ul|openstreetmap\.org/i.test(
    t,
  );
}

/**
 * Pull a usable Maps URL out of a paste (bare URL, Share iframe, or HTML snippet).
 */
export function extractMapsUrlFromText(text) {
  const t = String(text || '').trim();
  if (!t) return null;
  const iframe = t.match(/<iframe\b[^>]*\bsrc=["']([^"']+)["']/i);
  if (iframe?.[1]) return iframe[1].replace(/&amp;/g, '&').trim();
  const src = t.match(/\bsrc=["'](https?:\/\/[^"']*google\.[^"']*\/maps[^"']+)["']/i);
  if (src?.[1]) return src[1].replace(/&amp;/g, '&').trim();
  const embed = t.match(
    /https?:\/\/(?:www\.)?google\.[^\s"'<>]+\/maps\/embed\?[^\s"'<>]+/i,
  );
  if (embed) return embed[0].replace(/&amp;/g, '&');
  const short = t.match(/https?:\/\/maps\.app\.goo\.gl\/[^\s"'<>]+/i);
  if (short) return short[0];
  const u = tryUrl(t);
  if (u && hostLooksLikeMaps(u.hostname, u.pathname)) return u.toString();
  return null;
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
 * Embed Share iframe / maps/embed?pb= uses !1d{span}!2d{lng}!3d{lat}
 * (not the regular-maps !3d{lat}!4d{lng} place pin).
 */
export function parseEmbedPbCoords(text) {
  const t = decodeLoose(String(text || ''));
  if (!t) return null;
  const cam = t.match(/!1d-?\d+(?:\.\d+)?!2d(-?\d+(?:\.\d+)?)!3d(-?\d+(?:\.\d+)?)/);
  if (cam) return validCoords(Number(cam[2]), Number(cam[1]));
  const two = t.match(/!2d(-?\d+(?:\.\d+)?)!3d(-?\d+(?:\.\d+)?)/);
  if (two) {
    const a = Number(two[1]);
    const b = Number(two[2]);
    if (Math.abs(a) > 90 && Math.abs(b) <= 90) return validCoords(b, a);
    if (Math.abs(b) > 90 && Math.abs(a) <= 90) return validCoords(a, b);
    return validCoords(b, a);
  }
  return null;
}

export function extractPlaceNameFromEmbedPb(text) {
  const t = decodeLoose(String(text || ''));
  const named = t.match(/!2s([^!]+)/);
  if (!named) return null;
  const name = decodeLoose(named[1]).replace(/\/+$/, '').trim();
  if (!name || /^0x[0-9a-f]+/i.test(name) || /^-?\d/.test(name)) return null;
  if (name.length < 2 || name.length > 120) return null;
  return name;
}

/**
 * Place coords from Google Maps embed HTML (`output=embed`), which includes the
 * resolved POI even when the interactive Maps page has no @lat,lon.
 */
export function parseCoordsFromEmbedHtml(html) {
  const t = String(html || '');
  if (!t) return null;
  const cid = t.match(
    /\["0x[0-9a-f]+:0x[0-9a-f]+","([^"]+)",\[(-?\d+\.\d+),(-?\d+\.\d+)\]/i,
  );
  if (cid) {
    const hit = validCoords(Number(cid[2]), Number(cid[3]));
    if (hit) return { ...hit, address: cid[1] };
  }
  const named = t.match(
    /"([^"]{2,80})",\[(-?\d{1,2}\.\d{4,}),(-?\d{1,3}\.\d{4,})\]/,
  );
  if (named) {
    const hit = validCoords(Number(named[2]), Number(named[3]));
    if (hit) return { ...hit, address: named[1].replace(/,+\s*$/, '').trim() };
  }
  const trip = t.match(/\[\d{3,}\.\d+,(-?\d+\.\d+),(-?\d+\.\d+)\]/);
  if (trip) return validCoords(Number(trip[2]), Number(trip[1]));
  const e7 = t.match(/\[(\d{8,10}),(\d{8,10})\]/);
  if (e7) return validCoords(Number(e7[1]) / 1e7, Number(e7[2]) / 1e7);
  return parseEmbedPbCoords(t);
}

function parseQueryLatLon(text) {
  const re =
    /[?&#](?:q|query|ll|center|destination|daddr|sll|q1)=(-?\d+(?:\.\d+)?)(?:%2[cC]|,|\s*\+\s*|\s+)(-?\d+(?:\.\d+)?)/gi;
  let m;
  while ((m = re.exec(text))) {
    const before = text.slice(Math.max(0, m.index - 48), m.index).toLowerCase();
    if (before.includes('staticmap')) continue;
    const hit = validCoords(Number(m[1]), Number(m[2]));
    if (hit) return hit;
  }
  return null;
}

/**
 * Extract the most precise pin from a maps URL, iframe, or HTML snippet.
 * Prefers !3d/!4d (place) over embed !2d/!3d over @lat,lon (camera).
 * Ignores Google staticmap?center= (IP viewport, not the searched place).
 */
export function parseCoordsFromMapText(text) {
  const raw = String(text || '').trim();
  if (!raw) return null;
  const extracted = extractMapsUrlFromText(raw);
  const t = extracted ? `${extracted}\n${raw}` : raw;

  const geo = t.match(/geo:(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/i);
  if (geo) return validCoords(Number(geo[1]), Number(geo[2]));

  const bang = t.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);
  if (bang) return validCoords(Number(bang[1]), Number(bang[2]));

  const embed = parseEmbedPbCoords(t);
  if (embed) return embed;

  const at = t.match(/@(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/);
  if (at) return validCoords(Number(at[1]), Number(at[2]));

  const qll = parseQueryLatLon(t);
  if (qll) return qll;

  const osmHash = t.match(/[#&]map=\d+\/(-?\d+(?:\.\d+)?)\/(-?\d+(?:\.\d+)?)/);
  if (osmHash) return validCoords(Number(osmHash[1]), Number(osmHash[2]));

  const mlat = t.match(/[?&]mlat=(-?\d+(?:\.\d+)?)/i);
  const mlon = t.match(/[?&]mlon=(-?\d+(?:\.\d+)?)/i);
  if (mlat && mlon) return validCoords(Number(mlat[1]), Number(mlon[1]));

  const appleLl = t.match(/[?&]ll=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/i);
  if (appleLl) return validCoords(Number(appleLl[1]), Number(appleLl[2]));

  return parseLatLon(raw);
}

/** Place name from a maps URL when coords are missing (e.g. /maps/place/Herzliya+Marina/). */
export function extractPlaceQueryFromMapUrl(text) {
  const t = String(text || '').trim();
  const extracted = extractMapsUrlFromText(t) || t;
  const pbName = extractPlaceNameFromEmbedPb(extracted) || extractPlaceNameFromEmbedPb(t);
  if (pbName) return pbName;
  const u = tryUrl(extracted);
  const src = u ? u.toString() : extracted;

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
  const extracted = extractMapsUrlFromText(raw) || raw;
  const start = tryUrl(extracted.startsWith('http') ? extracted : `https://${extracted}`);
  if (!start || !looksLikeShortMapUrl(start.toString())) return null;

  const response = await fetchWithTimeout(start.toString(), {
    method: 'GET',
    redirect: 'follow',
    headers: {
      'User-Agent': GEO_UA,
      Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
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
  const extracted = extractMapsUrlFromText(raw) || raw;
  let coords = parseCoordsFromMapText(extracted) || parseCoordsFromMapText(raw);
  let placeQuery = extractPlaceQueryFromMapUrl(extracted) || extractPlaceQueryFromMapUrl(raw);
  let resolvedUrl = extracted !== raw ? extracted : null;

  const shortish = looksLikeShortMapUrl(extracted) || looksLikeShortMapUrl(raw);
  if (!coords && shortish) {
    try {
      const followed = await followMapShortUrl(extracted);
      if (followed) {
        resolvedUrl = followed.finalUrl;
        coords =
          parseCoordsFromMapText(followed.finalUrl) ||
          parseCoordsFromEmbedHtml(followed.blob) ||
          parseCoordsFromMapText(followed.blob);
        placeQuery =
          placeQuery ||
          extractPlaceQueryFromMapUrl(followed.finalUrl) ||
          null;
      }
    } catch {
      // caller may still try name search
    }
  }

  return { coords, placeQuery, resolvedUrl };
}

export { GEO_UA, MAPS_FETCH_UA };
