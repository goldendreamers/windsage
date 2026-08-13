/**
 * Map URL parse + geocode helpers (no Google key required).
 */
import assert from 'node:assert/strict';
import {
  extractPlaceQueryFromMapUrl,
  looksLikeMapUrl,
  looksLikeShortMapUrl,
  parseCoordsFromMapText,
} from '../code/cloud/lib/providers/mapsUrl.mjs';
import { geocodeAddress } from '../code/cloud/lib/providers/geo.mjs';

const caesarea = parseCoordsFromMapText(
  'https://www.google.com/maps/place/Caesarea/@32.501,34.892,17z/data=!3m1!4b1!4m6!3m5!1s0x0:0x0!8m2!3d32.5194!4d34.9045',
);
assert.ok(caesarea);
assert.equal(caesarea.lat.toFixed(4), '32.5194');
assert.equal(caesarea.lon.toFixed(4), '34.9045');

const atOnly = parseCoordsFromMapText('https://www.google.com/maps/@32.1600,34.8000,12z');
assert.ok(atOnly);
assert.equal(atOnly.lat.toFixed(2), '32.16');
assert.equal(atOnly.lon.toFixed(2), '34.80');

const qCoords = parseCoordsFromMapText('https://maps.google.com/?q=32.16,34.80');
assert.ok(qCoords);
assert.equal(qCoords.lat.toFixed(2), '32.16');

const geoUri = parseCoordsFromMapText('geo:32.165,-34.801');
assert.ok(geoUri);
assert.equal(geoUri.lat.toFixed(3), '32.165');

const osm = parseCoordsFromMapText('https://www.openstreetmap.org/#map=12/32.161/34.807');
assert.ok(osm);
assert.equal(osm.lat.toFixed(3), '32.161');

const apple = parseCoordsFromMapText('https://maps.apple.com/?ll=32.16,-117.15&q=Spot');
assert.ok(apple);
assert.equal(apple.lat.toFixed(2), '32.16');

const waze = parseCoordsFromMapText('https://www.waze.com/ul?ll=32.165,34.801&navigate=yes');
assert.ok(waze);

assert.equal(parseCoordsFromMapText('not a map'), null);
assert.equal(looksLikeMapUrl('https://www.google.com/maps/place/Herzliya+Marina/'), true);
assert.equal(looksLikeMapUrl('https://www.google.co.il/maps/@32.1,34.8,12z'), true);
assert.equal(looksLikeMapUrl('https://maps.app.goo.gl/abc123'), true);
assert.equal(looksLikeShortMapUrl('https://maps.app.goo.gl/abc123'), true);
assert.equal(looksLikeMapUrl('https://www.windguru.cz/2259'), false);

assert.equal(
  extractPlaceQueryFromMapUrl('https://www.google.com/maps/place/Herzliya+Marina/@32.1,34.8,15z'),
  'Herzliya Marina',
);
assert.equal(
  extractPlaceQueryFromMapUrl('https://www.google.com/maps/search/?api=1&query=Caesarea+Aqueduct'),
  'Caesarea Aqueduct',
);

const named = await geocodeAddress(
  'https://www.google.com/maps/place/Herzliya+Marina/@32.164,34.796,16z/data=!3d32.164!4d34.796',
);
assert.ok(named.lat > 32 && named.lat < 33);
assert.ok(named.lon > 34 && named.lon < 35);

try {
  const marina = await geocodeAddress('Herzliya Marina');
  assert.ok(Number.isFinite(marina.lat) && Number.isFinite(marina.lon));
  console.log('check-geo: live search ok →', marina.address);
} catch (e) {
  console.warn('check-geo: live search skipped:', e instanceof Error ? e.message : e);
}

console.log('check-geo: ok');
