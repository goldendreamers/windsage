/**
 * Geocoding / Places — Google when keyed, else Photon (OSM) + Open-Meteo.
 * Also accepts pasted Google Maps / Apple Maps / Waze / OSM / geo: links.
 */
import { asNumber, fetchJson } from './common.mjs';
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
    fallback: 'photon',
  };
}

function photonLabel(props = {}) {
  const street = [props.housenumber, props.street].filter(Boolean).join(' ').trim();
  const name = String(props.name || street || '').trim();
  const city = props.city || props.town || props.village || props.locality || '';
  const parts = [name, props.district, city, props.county, props.state, props.country]
    .map((p) => String(p || '').trim())
    .filter(Boolean);
  const seen = new Set();
  const out = [];
  for (const p of parts) {
    const k = p.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(p);
  }
  return out.join(', ') || street || name || '';
}

function photonHit(feature) {
  const coords = feature?.geometry?.coordinates;
  const lon = asNumber(Array.isArray(coords) ? coords[0] : null);
  const lat = asNumber(Array.isArray(coords) ? coords[1] : null);
  if (lat == null || lon == null) return null;
  const address = photonLabel(feature.properties || {});
  if (!address) return null;
  return { lat, lon, address, placeId: null, provider: 'photon' };
}

async function photonSearch(query, limit = 8) {
  const url = new URL('https://photon.komoot.io/api/');
  url.searchParams.set('q', query);
  url.searchParams.set('limit', String(limit));
  url.searchParams.set('lang', 'en');
  const data = await fetchJson(url.toString(), { 'User-Agent': GEO_UA });
  return (data?.features || []).map(photonHit).filter(Boolean);
}

async function photonReverse(lat, lon) {
  const url = new URL('https://photon.komoot.io/reverse');
  url.searchParams.set('lat', String(lat));
  url.searchParams.set('lon', String(lon));
  url.searchParams.set('lang', 'en');
  try {
    const data = await fetchJson(url.toString(), { 'User-Agent': GEO_UA });
    const hit = photonHit(data?.features?.[0]);
    return hit?.address || null;
  } catch {
    return null;
  }
}

async function openMeteoSearch(query, count = 6) {
  const url = new URL('https://geocoding-api.open-meteo.com/v1/search');
  url.searchParams.set('name', query);
  url.searchParams.set('count', String(count));
  url.searchParams.set('language', 'en');
  url.searchParams.set('format', 'json');
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
}

let lastNominatimMs = 0;
async function nominatimSearch(query) {
  const wait = 1100 - (Date.now() - lastNominatimMs);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastNominatimMs = Date.now();
  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.searchParams.set('q', query);
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('limit', '5');
  url.searchParams.set('addressdetails', '0');
  const data = await fetchJson(url.toString(), { 'User-Agent': GEO_UA });
  if (!Array.isArray(data)) return [];
  return data
    .map((hit) => {
      const lat = asNumber(hit.lat);
      const lon = asNumber(hit.lon);
      if (lat == null || lon == null) return null;
      return {
        lat,
        lon,
        address: String(hit.display_name || query),
        placeId: null,
        provider: 'nominatim',
      };
    })
    .filter(Boolean);
}

async function googleGeocode(query) {
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

async function googleReverse(lat, lon) {
  const key = googleKey();
  if (!key) return null;
  const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
  url.searchParams.set('latlng', `${lat},${lon}`);
  url.searchParams.set('key', key);
  try {
    const data = await fetchJson(url.toString());
    const hit = data?.results?.[0];
    return hit?.formatted_address || null;
  } catch {
    return null;
  }
}

async function labelForCoords(lat, lon, fallback) {
  const google = await googleReverse(lat, lon);
  if (google) return google;
  const photon = await photonReverse(lat, lon);
  if (photon) return photon;
  return fallback || `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
}

function hitToResult(hit, fallbackQuery) {
  return {
    provider: hit.provider,
    lat: hit.lat,
    lon: hit.lon,
    address: hit.address || fallbackQuery,
    placeId: hit.placeId || null,
  };
}

export async function geocodeAddress(query) {
  const q = String(query || '').trim();
  if (q.length < 2) throw new Error('Enter an address, coordinates, or Google Maps link');

  const fromText = parseCoordsFromMapText(q) || parseLatLon(q);

  if (looksLikeMapUrl(q) || (!fromText && /^https?:\/\//i.test(q))) {
    const resolved = await resolveMapInput(q);
    if (resolved.coords) {
      const address = await labelForCoords(
        resolved.coords.lat,
        resolved.coords.lon,
        resolved.placeQuery || q,
      );
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
    throw new Error(
      'Couldn’t read coordinates from that Maps link. Try a full maps.google.com URL, or search the place name.',
    );
  }

  if (fromText) {
    const address = await labelForCoords(fromText.lat, fromText.lon, q);
    return {
      provider: 'coords',
      lat: fromText.lat,
      lon: fromText.lon,
      address,
      placeId: null,
    };
  }

  const google = await googleGeocode(q);
  if (google) return google;

  let sawEmptyOk = false;
  let lastErr = null;
  for (const task of [
    () => photonSearch(q, 1),
    () => openMeteoSearch(q, 1),
    () => nominatimSearch(q),
  ]) {
    try {
      const rows = await task();
      if (rows[0]) return hitToResult(rows[0], q);
      sawEmptyOk = true;
    } catch (e) {
      lastErr = e;
    }
  }
  if (!sawEmptyOk && lastErr) {
    throw new Error(
      'Place search is unreachable right now. Paste coordinates or a Google Maps link, or try again in a moment.',
    );
  }

  throw new Error(`No place found for “${q}”`);
}

function dedupeSuggestions(rows) {
  const seen = new Set();
  const out = [];
  for (const row of rows) {
    const key = `${row.description.toLowerCase()}|${
      row.lat != null ? Number(row.lat).toFixed(3) : ''
    }|${row.lon != null ? Number(row.lon).toFixed(3) : ''}|${row.placeId || ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
    if (out.length >= 8) break;
  }
  return out;
}

export async function autocompletePlaces(query) {
  const q = String(query || '').trim();
  if (q.length < 2) return [];

  if (looksLikeMapUrl(q) || /^https?:\/\//i.test(q)) {
    const resolved = await resolveMapInput(q).catch(() => null);
    if (resolved?.coords) {
      const address =
        resolved.placeQuery ||
        `Maps pin ${resolved.coords.lat.toFixed(4)}, ${resolved.coords.lon.toFixed(4)}`;
      return [
        {
          description: address,
          placeId: null,
          lat: resolved.coords.lat,
          lon: resolved.coords.lon,
          provider: 'maps-url',
        },
      ];
    }
    if (resolved?.placeQuery && resolved.placeQuery !== q) {
      return autocompletePlaces(resolved.placeQuery);
    }
    return [];
  }

  const key = googleKey();
  if (key) {
    const url = new URL('https://maps.googleapis.com/maps/api/place/autocomplete/json');
    url.searchParams.set('input', q);
    url.searchParams.set('key', key);
    try {
      const data = await fetchJson(url.toString());
      if (data.status === 'OK' || data.status === 'ZERO_RESULTS') {
        const googleRows = (data.predictions || []).slice(0, 8).map((p) => ({
          description: p.description,
          placeId: p.place_id,
          provider: 'google',
        }));
        if (googleRows.length) return googleRows;
      }
    } catch {
      // fall through to OSM
    }
  }

  const [photon, om] = await Promise.all([
    photonSearch(q, 8).catch(() => []),
    openMeteoSearch(q, 5).catch(() => []),
  ]);
  const rows = [...photon, ...om].map((hit) => ({
    description: hit.address,
    placeId: hit.placeId,
    lat: hit.lat,
    lon: hit.lon,
    provider: hit.provider,
  }));
  return dedupeSuggestions(rows);
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
