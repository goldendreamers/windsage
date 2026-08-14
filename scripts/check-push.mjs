#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sw = fs.readFileSync(path.join(root, 'public/sw.js'), 'utf8');
const notif = fs.readFileSync(path.join(root, 'code/core/notifications.ts'), 'utf8');
const example = fs.readFileSync(path.join(root, 'code/cloud/oauth.env.example'), 'utf8');

const swVer = sw.match(/SW_VERSION = 'windsage-sw-v(\d+)'/);
const clientVer = notif.match(/const swVersion = '(\d+)'/);
assert.ok(swVer, 'SW_VERSION missing in public/sw.js');
assert.ok(clientVer, 'swVersion missing in code/core/notifications.ts');
assert.equal(
  clientVer[1],
  swVer[1],
  `notifications.ts swVersion=${clientVer[1]} must match public/sw.js v${swVer[1]}`,
);
assert.match(example, /WEB_PUSH_VAPID_PUBLIC/);
assert.match(example, /WEB_PUSH_VAPID_PRIVATE/);
assert.match(notif, /registerWithCloud/);

console.log(`check-push: ok (sw v${swVer[1]})`);
