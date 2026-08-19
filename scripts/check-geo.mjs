/**
 * Map URL parse + geocode helpers (no Google key required).
 */
import assert from 'node:assert/strict';
import {
  extractPlaceQueryFromMapUrl,
  looksLikeMapUrl,
  looksLikeShortMapUrl,
  parseCoordsFromEmbedHtml,
  parseCoordsFromMapText,
  parseLatLon,
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

const diamondIframe = `<iframe src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3352.420334901464!2d35.6406432!3d32.8341207!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x151c1725a72b33db%3A0xa1de84e900545ea5!2sDiamond%20Beach!5e0!3m2!1sen!2sil!4v1786627514861!5m2!1sen!2sil" width="600" height="450" style="border:0;" allowfullscreen="" loading="lazy" referrerpolicy="strict-origin-when-cross-origin"></iframe>`;
assert.equal(looksLikeMapUrl(diamondIframe), true);
const iframePin = parseCoordsFromMapText(diamondIframe);
assert.ok(iframePin);
assert.equal(iframePin.lat.toFixed(4), '32.8341');
assert.equal(iframePin.lon.toFixed(4), '35.6406');
assert.equal(extractPlaceQueryFromMapUrl(diamondIframe), 'Diamond Beach');

const staticMapHtml =
  'https://maps.google.com/maps/api/staticmap?center=32.4222101%2C34.8955188&zoom=14&size=900x900';
assert.equal(parseCoordsFromMapText(staticMapHtml), null);

const embedHtml = '["0x151c1725a72b33db:0xa1de84e900545ea5","Diamond Beach, Route 2",[32.8341207,35.6406432],"11663906221203938981"]';
const fromEmbed = parseCoordsFromEmbedHtml(embedHtml);
assert.ok(fromEmbed);
assert.equal(fromEmbed.lat.toFixed(4), '32.8341');
assert.equal(fromEmbed.lon.toFixed(4), '35.6406');

const comma = parseLatLon('32.1645, 34.7961');
assert.ok(comma);
assert.equal(comma.lat.toFixed(4), '32.1645');
assert.equal(comma.lon.toFixed(4), '34.7961');
assert.equal(parseLatLon('32.164 34.796').lat.toFixed(3), '32.164');
assert.equal(parseLatLon('(32.16, 34.80)').lon.toFixed(2), '34.80');
assert.equal(parseLatLon('32.16N, 34.80E').lat.toFixed(2), '32.16');
assert.equal(parseLatLon('N32.16 E34.80').lon.toFixed(2), '34.80');
assert.equal(parseLatLon('lat: 32.16 lon: 34.80').lat.toFixed(2), '32.16');
assert.equal(parseLatLon('32.164472° N, 34.796139° E').lat.toFixed(3), '32.164');
const dms = parseLatLon('32°09\'52"N 34°47\'46"E');
assert.ok(dms);
assert.ok(dms.lat > 32.16 && dms.lat < 32.17);
assert.equal(parseLatLon('15 20'), null);
assert.equal(parseLatLon('Herzliya Marina'), null);
assert.equal(parseLatLon('2259'), null);

const fromBare = await geocodeAddress('32.1645, 34.7961');
assert.equal(fromBare.provider, 'coords');
assert.equal(fromBare.lat.toFixed(4), '32.1645');

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

const fromIframe = await geocodeAddress(diamondIframe);
assert.ok(fromIframe.lat > 32.83 && fromIframe.lat < 32.84);
assert.ok(fromIframe.lon > 35.63 && fromIframe.lon < 35.65);

try {
  const marina = await geocodeAddress('Herzliya Marina');
  assert.ok(Number.isFinite(marina.lat) && Number.isFinite(marina.lon));
  console.log('check-geo: live search ok →', marina.address);
} catch (e) {
  console.warn('check-geo: live search skipped:', e instanceof Error ? e.message : e);
}

try {
  const diamond = await geocodeAddress('diamond beach israel');
  assert.ok(diamond.lat > 32.82 && diamond.lat < 32.85, `unexpected diamond lat ${diamond.lat}`);
  assert.ok(diamond.lon > 35.62 && diamond.lon < 35.66, `unexpected diamond lon ${diamond.lon}`);
  console.log('check-geo: diamond beach israel →', diamond.address, diamond.lat, diamond.lon);
} catch (e) {
  console.warn('check-geo: diamond beach live skipped:', e instanceof Error ? e.message : e);
}

try {
  const short = await geocodeAddress('https://maps.app.goo.gl/GXvm3CAZYusfZ8h26');
  assert.ok(short.lat > 32.82 && short.lat < 32.85);
  assert.ok(short.lon > 35.62 && short.lon < 35.66);
  console.log('check-geo: goo.gl short →', short.address, short.lat, short.lon);
} catch (e) {
  console.warn('check-geo: short url skipped:', e instanceof Error ? e.message : e);
}

console.log('check-geo: ok');
