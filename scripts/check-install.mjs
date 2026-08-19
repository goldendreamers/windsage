import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const profile = path.join(root, 'public/app/windsage.mobileconfig');
assert.equal(fs.existsSync(profile), true, 'missing public/app/windsage.mobileconfig');
const xml = fs.readFileSync(profile, 'utf8');
assert.match(xml, /com\.apple\.webClip\.managed/);
assert.match(xml, /https:\/\/windsage\.nimrod\.bio\//);
assert.match(xml, /<string>Windsage<\/string>/);
assert.ok(fs.statSync(profile).size > 10_000);
console.log('check-install: ok', { bytes: fs.statSync(profile).size });
