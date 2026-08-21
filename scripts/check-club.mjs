import assert from 'node:assert/strict';
import { matchClubSpot, normalizeClubQuery, clubStatusHe, publicClubReading } from '../code/cloud/lib/club.mjs';
import { sanitizeDiscordWebhook, holdWebhookEnabled } from '../code/cloud/lib/discordHold.mjs';

assert.equal(normalizeClubQuery('  פריגול  '), 'פריגול');
assert.equal(matchClubSpot('freegull')?.stationId, '2259');
assert.equal(matchClubSpot('הרצליה')?.stationId, '2259');
assert.equal(matchClubSpot('2259')?.stationId, '2259');
assert.equal(matchClubSpot('חיפה')?.stationId, '2049');
assert.equal(matchClubSpot('paris'), null);

assert.equal(clubStatusHe(18), 'מחזיק');
assert.equal(clubStatusHe(13), 'עולה');
assert.equal(clubStatusHe(8), 'מת');
assert.equal(clubStatusHe(null), 'מחכה');

const row = publicClubReading(
  { id: 'freegull', labelHe: 'פריגול', stationId: '2259', provider: 'windguru' },
  { wind_avg: 16.4, wind_max: 19, wind_direction: 270 },
);
assert.equal(row.statusHe, 'מחזיק');
assert.equal(row.windDirectionHe, 'מערב');

assert.equal(sanitizeDiscordWebhook('https://discord.com/api/webhooks/1/abc'), 'https://discord.com/api/webhooks/1/abc');
assert.equal(sanitizeDiscordWebhook('https://evil.example/api/webhooks/1/abc'), '');
assert.equal(sanitizeDiscordWebhook('http://discord.com/api/webhooks/1/abc'), '');
assert.equal(holdWebhookEnabled(), false);

console.log('check-club: ok');
