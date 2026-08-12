/**
 * Geocoding / Places — Google when keyed, else Open-Meteo.
 */
import { asNumber, fetchJson } from './common.mjs';

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
    fallback: 'open-meteo',
  };
}

export async function geocodeAddress(query) {
  const q = String(query || '').trim();
  if (q.length < 2) throw new Error('Enter an address or place name');

  const key = googleKey();
  if (key) {
    const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
    url.searchParams.set('address', q);
    url.searchParams.set('key', key);
    const data = await fetchJson(url.toString());
    if (data.status !== 'OK' || !data.results?.[0]) {
      throw new Error(data.error_message || `Google Geocoding: ${data.status || 'no results'}`);
    }
    const hit = data.results[0];
    const lat = asNumber(hit.geometry?.location?.lat);
    const lon = asNumber(hit.geometry?.location?.lng);
    if (lat == null || lon == null) throw new Error('Geocode missing coordinates');
    return {
      provider: 'google',
      lat,
      lon,
      address: hit.formatted_address || q,
      placeId: hit.place_id || null,
    };
  }

  const url = new URL('https://geocoding-api.open-meteo.com/v1/search');
  url.searchParams.set('name', q);
  url.searchParams.set('count', '1');
  url.searchParams.set('language', 'en');
  url.searchParams.set('format', 'json');
  const data = await fetchJson(url.toString());
  const hit = data?.results?.[0];
  if (!hit) throw new Error(`No place found for “${q}”`);
  const lat = asNumber(hit.latitude);
  const lon = asNumber(hit.longitude);
  if (lat == null || lon == null) throw new Error('Geocode missing coordinates');
  const address = [hit.name, hit.admin1, hit.country].filter(Boolean).join(', ');
  return { provider: 'open-meteo', lat, lon, address, placeId: null };
}

export async function autocompletePlaces(query) {
  const q = String(query || '').trim();
  if (q.length < 2) return [];

  const key = googleKey();
  if (key) {
    // Places Autocomplete (legacy HTTP) — works with standard Maps API key when Places enabled.
    const url = new URL('https://maps.googleapis.com/maps/api/place/autocomplete/json');
    url.searchParams.set('input', q);
    url.searchParams.set('key', key);
    url.searchParams.set('types', 'geocode');
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

  const url = new URL('https://geocoding-api.open-meteo.com/v1/search');
  url.searchParams.set('name', q);
  url.searchParams.set('count', '6');
  url.searchParams.set('language', 'en');
  url.searchParams.set('format', 'json');
  const data = await fetchJson(url.toString());
  return (data?.results || []).map((hit) => ({
    description: [hit.name, hit.admin1, hit.country].filter(Boolean).join(', '),
    placeId: null,
    lat: asNumber(hit.latitude),
    lon: asNumber(hit.longitude),
    provider: 'open-meteo',
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
