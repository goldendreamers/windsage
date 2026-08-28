/**
 * Geocoding for Map follows — no billed Google APIs.
 * Pasted Maps links and Google Maps embed search (no key), then Photon / Open-Meteo.
 */
import { asNumber, fetchJson, fetchWithTimeout } from './common.mjs';
import {
  GEO_UA,
  MAPS_FETCH_UA,
  looksLikeMapUrl,
  parseCoordsFromEmbedHtml,
  parseCoordsFromMapText,
  parseLatLon,
  resolveMapInput,
} from './mapsUrl.mjs';

export function mapsStatus() {
  return {
    searchVia: 'google-maps-search',
    fallback: 'photon',
  };
}

async function photonReverse(lat, lon) {
  const url = new URL('https://photon.komoot.io/reverse');
  url.searchParams.set('lat', String(lat));
  url.searchParams.set('lon', String(lon));
  url.searchParams.set('lang', 'en');
  try {
    const data = await fetchJson(url.toString(), { 'User-Agent': GEO_UA });
    const props = data?.features?.[0]?.properties || {};
    const street = [props.housenumber, props.street].filter(Boolean).join(' ').trim();
    const name = String(props.name || street || '').trim();
    const city = props.city || props.town || props.village || props.locality || '';
    const parts = [name, city, props.state, props.country]
      .map((p) => String(p || '').trim())
      .filter(Boolean);
    return [...new Set(parts)].join(', ') || null;
  } catch {
    return null;
  }
}

/**
 * No API key: Google Maps embed HTML includes the resolved POI lat/lon.
 * Do not scrape the interactive Maps page — it often only has staticmap?center=
 * for the viewer's IP viewport (wrong pin).
 */
async function resolveViaGoogleMapsSearch(query) {
  const q = String(query || '').trim();
  if (q.length < 2) return null;
  const embedUrl = `https://www.google.com/maps?q=${encodeURIComponent(q)}&output=embed&hl=en`;
  try {
    const response = await fetchWithTimeout(embedUrl, {
      method: 'GET',
      redirect: 'follow',
      headers: {
        'User-Agent': MAPS_FETCH_UA,
        Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });
    let html = '';
    try {
      html = await response.text();
    } catch {
      html = '';
    }
    const hit = parseCoordsFromEmbedHtml(html);
    if (!hit) return null;
    const address = hit.address || (await photonReverse(hit.lat, hit.lon)) || q;
    return {
      provider: 'google-maps-search',
      lat: hit.lat,
      lon: hit.lon,
      address,
      placeId: null,
    };
  } catch {
    return null;
  }
}

async function photonSearch(query, limit = 6) {
  const url = new URL('https://photon.komoot.io/api/');
  url.searchParams.set('q', query);
  url.searchParams.set('limit', String(Math.max(limit, 8)));
  url.searchParams.set('lang', 'en');
  const israelHint =
    /israel|ישראל|\bil\b|haifa|חיפה|tel.?aviv|תל אביב|eilat|herzliya|netanya|ashkelon|ashdod|jerusalem|tiberias|akko|acre|עכו/i.test(
      query,
    );
  if (israelHint) {
    url.searchParams.set('lat', '32.8');
    url.searchParams.set('lon', '35.2');
  }
  try {
    const data = await fetchJson(url.toString(), { 'User-Agent': GEO_UA });
    const hits = (data?.features || [])
      .map((feature) => {
        const coords = feature?.geometry?.coordinates;
        const lon = asNumber(Array.isArray(coords) ? coords[0] : null);
        const lat = asNumber(Array.isArray(coords) ? coords[1] : null);
        if (lat == null || lon == null) return null;
        const props = feature.properties || {};
        const street = [props.housenumber, props.street].filter(Boolean).join(' ').trim();
        const name = String(props.name || street || '').trim();
        const city = props.city || props.town || props.village || props.locality || '';
        const country = String(props.country || '').trim();
        const parts = [name, city, props.state, country]
          .map((p) => String(p || '').trim())
          .filter(Boolean);
        const address = [...new Set(parts)].join(', ') || name;
        if (!address) return null;
        return { lat, lon, address, country, placeId: null, provider: 'photon' };
      })
      .filter(Boolean);
    if (israelHint) {
      const il = hits.filter((h) => /israel|ישראל/i.test(`${h.address} ${h.country}`));
      const rest = hits.filter((h) => !il.includes(h));
      return (il.length ? [...il, ...rest] : hits).slice(0, limit);
    }
    return hits.slice(0, limit);
  } catch {
    return [];
  }
}

async function openMeteoSearch(query, count = 6) {
  const url = new URL('https://geocoding-api.open-meteo.com/v1/search');
  url.searchParams.set('name', query);
  url.searchParams.set('count', String(count));
  url.searchParams.set('language', 'en');
  url.searchParams.set('format', 'json');
  try {
    const data = await fetchJson(url.toString());
    return (data?.results || [])
      .map((hit) => {
        const lat = asNumber(hit.latitude);
        const lon = asNumber(hit.longitude);
        if (lat == null || lon == null) return null;
        return {
          lat,
          lon,
          address: [hit.name, hit.admin1, hit.country].filter(Boolean).join(', '),
          placeId: null,
          provider: 'open-meteo',
        };
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

const PLACE_GEO_TTL_MS = 30 * 60 * 1000;
const placeGeoCache = new Map();

/** Fast place pin for Follow search — Photon / Open-Meteo, no Maps scrape. */
export async function geocodePlaceName(query) {
  const q = String(query || '').trim();
  if (q.length < 2 || /^\d+$/.test(q)) return null;
  const key = q.toLowerCase();
  const cached = placeGeoCache.get(key);
  if (cached && cached.expires > Date.now()) return cached.value;
  let hits = await photonSearch(q, 1);
  if (!hits.length) hits = await openMeteoSearch(q, 1);
  const value = hits[0]
    ? { lat: hits[0].lat, lon: hits[0].lon, address: hits[0].address || q }
    : null;
  if (placeGeoCache.size > 200) {
    const first = placeGeoCache.keys().next().value;
    if (first) placeGeoCache.delete(first);
  }
  placeGeoCache.set(key, { value, expires: Date.now() + PLACE_GEO_TTL_MS });
  return value;
}

export async function geocodeAddress(query) {
  const q = String(query || '').trim();
  if (q.length < 2) {
    throw new Error('Enter an address, coordinates, or Google Maps link');
  }

  // Pasted coordinates
  const bare = parseLatLon(q) || parseCoordsFromMapText(q);
  if (bare && !looksLikeMapUrl(q) && !/^https?:\/\//i.test(q)) {
    const address = (await photonReverse(bare.lat, bare.lon)) || `${bare.lat.toFixed(4)}, ${bare.lon.toFixed(4)}`;
    return { provider: 'coords', lat: bare.lat, lon: bare.lon, address, placeId: null };
  }

  // Pasted Google Maps / Apple / Waze / OSM / geo: links
  if (looksLikeMapUrl(q) || /^https?:\/\//i.test(q)) {
    const resolved = await resolveMapInput(q);
    if (resolved.coords) {
      const address =
        (await photonReverse(resolved.coords.lat, resolved.coords.lon)) ||
        resolved.placeQuery ||
        q;
      return {
        provider: 'maps-url',
        lat: resolved.coords.lat,
        lon: resolved.coords.lon,
        address,
        placeId: null,
      };
    }
    if (resolved.placeQuery && resolved.placeQuery !== q) {
      return geocodeAddress(resolved.placeQuery);
    }
  }

  // Google Maps search URL → coordinates (no billed API key)
  const mapsHit = await resolveViaGoogleMapsSearch(q);
  if (mapsHit) return mapsHit;

  // 3) Free fallbacks
  const photon = await photonSearch(q, 1);
  if (photon[0]) {
    return {
      provider: photon[0].provider,
      lat: photon[0].lat,
      lon: photon[0].lon,
      address: photon[0].address,
      placeId: null,
    };
  }
  const om = await openMeteoSearch(q, 1);
  if (om[0]) {
    return {
      provider: om[0].provider,
      lat: om[0].lat,
      lon: om[0].lon,
      address: om[0].address,
      placeId: null,
    };
  }

  throw new Error(`No place found for “${q}”`);
}

export async function autocompletePlaces(query) {
  const q = String(query || '').trim();
  if (q.length < 2) return [];

  // Coordinate / maps-link paste: single synthetic suggestion
  const bare = parseLatLon(q);
  if (bare) {
    return [
      {
        description: `${bare.lat.toFixed(5)}, ${bare.lon.toFixed(5)}`,
        placeId: null,
        lat: bare.lat,
        lon: bare.lon,
        provider: 'coords',
      },
    ];
  }
  if (looksLikeMapUrl(q)) {
    return [
      {
        description: q.length > 80 ? `${q.slice(0, 77)}…` : q,
        query: q,
        placeId: null,
        lat: null,
        lon: null,
        provider: 'maps-url',
      },
    ];
  }

  const photon = await photonSearch(q, 6);
  if (photon.length) {
    return photon.map((hit) => ({
      description: hit.address,
      placeId: null,
      lat: hit.lat,
      lon: hit.lon,
      provider: hit.provider,
    }));
  }

  const om = await openMeteoSearch(q, 6);
  return om.map((hit) => ({
    description: hit.address,
    placeId: null,
    lat: hit.lat,
    lon: hit.lon,
    provider: hit.provider,
  }));
}

