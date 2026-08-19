import assert from 'node:assert/strict';
import { createFollowedStation, findExistingFollow } from '../code/shared/defaults';
import {
  beginShareConsume,
  buildShareFollowUrl,
  endShareConsume,
  parseLatLonId,
  parseShareFollowUrl,
} from '../code/core/shareFollow';

const origin = 'https://windsage.nimrod.bio';

const dimond = createFollowedStation('377929', 'Dimond', {
  provider: 'windguru',
  kind: 'spot',
});
const dimondUrl = buildShareFollowUrl(dimond, origin);
assert.equal(dimondUrl, 'https://windsage.nimrod.bio/add?p=windguru&id=377929&k=spot&n=Dimond');
const dimondParsed = parseShareFollowUrl(dimondUrl);
assert.deepEqual(dimondParsed, {
  provider: 'windguru',
  stationId: '377929',
  kind: 'spot',
  nickname: 'Dimond',
  address: null,
});

const pin = createFollowedStation('32.8341,35.6406', 'diamond', {
  provider: 'location',
  kind: 'station',
  sourceName: 'Dimond Beach',
  locationBlend: {
    lat: 32.8341,
    lon: 35.6406,
    address: 'Dimond Beach',
    radiusKm: 50,
    maxStations: 6,
    members: [],
  },
});
const pinUrl = buildShareFollowUrl(pin, origin);
const pinParsed = parseShareFollowUrl(pinUrl);
assert.equal(pinParsed?.provider, 'location');
assert.equal(pinParsed?.stationId, '32.8341,35.6406');
assert.equal(pinParsed?.kind, 'station');
assert.equal(pinParsed?.nickname, 'diamond');
assert.equal(pinParsed?.address, 'Dimond Beach');
assert.deepEqual(parseLatLonId(pinParsed?.stationId || ''), { lat: 32.8341, lon: 35.6406 });

const list = [dimond, pin];
assert.equal(findExistingFollow(list, { provider: 'windguru', stationId: '377929' })?.id, dimond.id);
assert.equal(findExistingFollow(list, { provider: 'location', stationId: '32.8341,35.6406' })?.id, pin.id);
assert.equal(findExistingFollow(list, { provider: 'windguru', stationId: '999' }), null);
assert.equal(findExistingFollow(list, { provider: 'ndbc', stationId: '377929' }), null);

assert.equal(parseShareFollowUrl('https://windsage.nimrod.bio/add?p=nope&id=1'), null);
assert.equal(parseShareFollowUrl('https://windsage.nimrod.bio/add?p=windguru&id='), null);
assert.equal(parseShareFollowUrl('https://windsage.nimrod.bio/'), null);
assert.equal(parseShareFollowUrl(null), null);

const fromLocation = parseShareFollowUrl({ href: dimondUrl });
assert.equal(fromLocation?.stationId, '377929');

assert.equal(beginShareConsume(), true);
assert.equal(beginShareConsume(), false);
endShareConsume();
assert.equal(beginShareConsume(), true);
endShareConsume();

console.log('check-share: ok');
