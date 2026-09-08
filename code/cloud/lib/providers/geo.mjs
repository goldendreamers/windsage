/**
 * Geocoding / Places for Map follows.
 *
 * Search flow (user request): send the query to Google Maps and take the
 * resulting coordinates. Prefer the Geocoding/Places API when
 * GOOGLE_MAPS_API_KEY is set; otherwise follow a Google Maps search URL and
 * parse @lat,lon from the redirect. Free Photon/Open-Meteo remain as fallback.
 */
import { asNumber, fetchJson, fetchWithTimeout } from './common.mjs';
import {
  GEO_UA,
  looksLikeMapUrl,
  parseCoordsFromMapText,
  parseLatLon,
  resolveMapInput,
} from './mapsUrl.mjs';

function googleKey() {
  return (
    process.env.GOOGLE_MAPS_API_KEY ||
    process.env.GOOGLE_GEOCODING_API_KEY ||
    process.env.GOOGLE_PLACES_API_KEY ||
    ''
  ).trim();
}

function googleBrowserKey() {
  return (
    process.env.GOOGLE_MAPS_BROWSER_KEY ||
    process.env.GOOGLE_MAPS_JS_KEY ||
    googleKey()
  ).trim();
}

export function mapsStatus() {
  const server = !!googleKey();
  const browser = !!googleBrowserKey();
  return {
    googleGeocode: server,
    googleMapsJs: browser,
    browserKey: browser ? googleBrowserKey() : null,
    // Default search tries Google Maps (API or maps URL); free geocoders are fallback.
    // Simple UI mode uses via=osm (Photon / Open-Meteo) and never hits Google.
    searchVia: 'google-maps',
    fallback: 'photon',
  };
}

function wantsOsm(via) {
  const v = String(via || '').trim().toLowerCase();
  return v === 'osm' || v === 'free' || v === 'photon';
}

/** Build a short address from Photon / Nominatim-style property bags. */
export function formatGeoLabel(props, fallback = '') {
  const p = props && typeof props === 'object' ? props : {};
  const street = [p.housenumber, p.street].filter(Boolean).join(' ').trim();
  const name = String(p.name || p.display_name || street || '').trim();
  const city = p.city || p.town || p.village || p.locality || p.county || '';
  const parts = [name, city, p.state, p.country]
    .map((part) => String(part || '').trim())
    .filter(Boolean);
  const address = [...new Set(parts)].join(', ') || name;
  return address || String(fallback || '').trim();
}

async function googleGeocodeApi(query) {
  const key = googleKey();
  if (!key) return null;
  const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
  url.searchParams.set('address', query);
  url.searchParams.set('key', key);
  const data = await fetchJson(url.toString());
  if (data.status !== 'OK' || !data.results?.[0]) return null;
  const hit = data.results[0];
  const lat = asNumber(hit.geometry?.location?.lat);
  const lon = asNumber(hit.geometry?.location?.lng);
  if (lat == null || lon == null) return null;
  return {
    provider: 'google',
    lat,
    lon,
    address: hit.formatted_address || query,
    placeId: hit.place_id || null,
  };
}

async function googleReverseApi(lat, lon) {
  const key = googleKey();
  if (!key) return null;
  const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
  url.searchParams.set('latlng', `${lat},${lon}`);
  url.searchParams.set('key', key);
  try {
    const data = await fetchJson(url.toString());
    return data?.results?.[0]?.formatted_address || null;
  } catch {
    return null;
  }
}

/**
 * No API key: open a Google Maps search URL, follow redirects, parse coordinates
 * from the final URL / HTML (@lat,lon or !3d/!4d).
 */
async function resolveViaGoogleMapsSearch(query) {
  const q = String(query || '').trim();
  if (q.length < 2) return null;
  const searchUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
  try {
    const response = await fetchWithTimeout(searchUrl, {
      method: 'GET',
      redirect: 'follow',
      headers: {
        'User-Agent': GEO_UA,
        Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
      },
    });
    const finalUrl = String(response.url || searchUrl);
    let html = '';
    try {
      html = await response.text();
    } catch {
      html = '';
    }
    const blob = `${finalUrl}\n${html.slice(0, 250_000)}`;
    const coords = parseCoordsFromMapText(blob) || parseCoordsFromMapText(finalUrl);
    if (!coords) return null;
    const address =
      (await googleReverseApi(coords.lat, coords.lon)) ||
      q;
    return {
      provider: 'google-maps-search',
      lat: coords.lat,
      lon: coords.lon,
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
  url.searchParams.set('limit', String(limit));
  url.searchParams.set('lang', 'en');
  try {
    const data = await fetchJson(url.toString(), { 'User-Agent': GEO_UA });
    return (data?.features || [])
      .map((feature) => {
        const coords = feature?.geometry?.coordinates;
        const lon = asNumber(Array.isArray(coords) ? coords[0] : null);
        const lat = asNumber(Array.isArray(coords) ? coords[1] : null);
        if (lat == null || lon == null) return null;
        const props = feature.properties || {};
        const address = formatGeoLabel(props);
        if (!address) return null;
        return { lat, lon, address, placeId: null, provider: 'photon' };
      })
      .filter(Boolean);
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

async function photonReverse(lat, lon) {
  const url = new URL('https://photon.komoot.io/reverse');
  url.searchParams.set('lat', String(lat));
  url.searchParams.set('lon', String(lon));
  url.searchParams.set('lang', 'en');
  try {
    const data = await fetchJson(url.toString(), { 'User-Agent': GEO_UA });
    const feature = data?.features?.[0];
    const address = formatGeoLabel(feature?.properties || {});
    if (!address) return null;
    return { provider: 'photon', address };
  } catch {
    return null;
  }
}

async function nominatimReverse(lat, lon) {
  const url = new URL('https://nominatim.openstreetmap.org/reverse');
  url.searchParams.set('lat', String(lat));
  url.searchParams.set('lon', String(lon));
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('zoom', '16');
  try {
    const data = await fetchJson(url.toString(), { 'User-Agent': GEO_UA });
    const address =
      formatGeoLabel({
        name: data?.name,
        display_name: data?.display_name,
        ...(data?.address || {}),
      }) || String(data?.display_name || '').trim();
    if (!address) return null;
    return { provider: 'nominatim', address };
  } catch {
    return null;
  }
}

export async function reverseGeocode(lat, lon, { via } = {}) {
  const la = Number(lat);
  const lo = Number(lon);
  if (!Number.isFinite(la) || !Number.isFinite(lo)) {
    throw new Error('Need lat,lon to reverse-geocode');
  }
  if (Math.abs(la) > 90 || Math.abs(lo) > 180) {
    throw new Error('Coordinates out of range');
  }
  const osmFirst = wantsOsm(via) || !googleKey();
  const order = osmFirst
    ? [() => photonReverse(la, lo), () => nominatimReverse(la, lo)]
    : [
        async () => {
          const address = await googleReverseApi(la, lo);
          return address ? { provider: 'google', address } : null;
        },
        () => photonReverse(la, lo),
        () => nominatimReverse(la, lo),
      ];
  for (const step of order) {
    const hit = await step();
    if (hit?.address) {
      return { lat: la, lon: lo, address: hit.address, provider: hit.provider, placeId: null };
    }
  }
  return {
    lat: la,
    lon: lo,
    address: `${la.toFixed(4)}, ${lo.toFixed(4)}`,
    provider: 'coords',
    placeId: null,
  };
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

export async function geocodeAddress(query, opts = {}) {
  const q = String(query || '').trim();
  const via = opts.via;
  const osmOnly = wantsOsm(via);
  if (q.length < 2) {
    throw new Error(
      osmOnly
        ? 'Enter an address, place, or coordinates'
        : 'Enter an address, coordinates, or Google Maps link',
    );
  }

  // Pasted coordinates
  const bare = parseLatLon(q) || parseCoordsFromMapText(q);
  if (bare && !looksLikeMapUrl(q) && !/^https?:\/\//i.test(q)) {
    const reversed = await reverseGeocode(bare.lat, bare.lon, { via: osmOnly ? 'osm' : via });
    return {
      provider: 'coords',
      lat: bare.lat,
      lon: bare.lon,
      address: reversed.address,
      placeId: null,
    };
  }

  // Pasted Google Maps / Apple / Waze / OSM / geo: links
  if (looksLikeMapUrl(q) || /^https?:\/\//i.test(q)) {
    const resolved = await resolveMapInput(q);
    if (resolved.coords) {
      const reversed = await reverseGeocode(resolved.coords.lat, resolved.coords.lon, {
        via: osmOnly ? 'osm' : via,
      });
      return {
        provider: 'maps-url',
        lat: resolved.coords.lat,
        lon: resolved.coords.lon,
        address: reversed.address || resolved.placeQuery || q,
        placeId: null,
      };
    }
    if (resolved.placeQuery && resolved.placeQuery !== q) {
      return geocodeAddress(resolved.placeQuery, opts);
    }
  }

  if (!osmOnly) {
    // 1) Google Geocoding API (when keyed on Wald)
    const apiHit = await googleGeocodeApi(q);
    if (apiHit) return apiHit;

    // 2) Google Maps search URL → coordinates (works without a billed key)
    const mapsHit = await resolveViaGoogleMapsSearch(q);
    if (mapsHit) return mapsHit;
  }

  // Free geocoders (simple mode, or Google fallback)
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

export async function autocompletePlaces(query, opts = {}) {
  const q = String(query || '').trim();
  const osmOnly = wantsOsm(opts.via);
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
        placeId: null,
        lat: null,
        lon: null,
        provider: 'maps-url',
      },
    ];
  }

  const key = osmOnly ? '' : googleKey();
  if (key) {
    const url = new URL('https://maps.googleapis.com/maps/api/place/autocomplete/json');
    url.searchParams.set('input', q);
    url.searchParams.set('key', key);
    // Do not restrict to types=geocode — beaches / marinas / spots must appear.
    try {
      const data = await fetchJson(url.toString());
      if (data.status === 'OK' || data.status === 'ZERO_RESULTS') {
        return (data.predictions || []).slice(0, 6).map((p) => ({
          description: p.description,
          placeId: p.place_id,
          provider: 'google',
        }));
      }
    } catch {
      // fall through
    }
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

export async function placeDetails(placeId) {
  const key = googleKey();
  if (!key || !placeId) throw new Error('Place details need Google Places API key');
  const url = new URL('https://maps.googleapis.com/maps/api/place/details/json');
  url.searchParams.set('place_id', placeId);
  url.searchParams.set('fields', 'geometry,formatted_address,name');
  url.searchParams.set('key', key);
  const data = await fetchJson(url.toString());
  if (data.status !== 'OK' || !data.result) {
    throw new Error(data.error_message || `Place details: ${data.status}`);
  }
  const hit = data.result;
  const lat = asNumber(hit.geometry?.location?.lat);
  const lon = asNumber(hit.geometry?.location?.lng);
  if (lat == null || lon == null) throw new Error('Place missing coordinates');
  return {
    provider: 'google',
    lat,
    lon,
    address: hit.formatted_address || hit.name || placeId,
    placeId,
  };
}
