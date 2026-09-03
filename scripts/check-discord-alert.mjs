import assert from 'node:assert/strict';
import {
  completeDiscordAlertLink,
  findUserByDiscordAlertId,
  hashLinkCode,
  hookSecretOk,
  newLinkCode,
  normalizeLinkCode,
  publicDiscordAlert,
  startDiscordAlertLink,
  unlinkDiscordAlert,
} from '../code/cloud/lib/discordAlertDm.mjs';

process.env.DISCORD_ALERT_HOOK_SECRET = 'abcdefghijklmnop';
assert.equal(hookSecretOk('abcdefghijklmnop'), true);
assert.equal(hookSecretOk('wrongwrongwrongw'), false);

const code = newLinkCode();
assert.equal(code.length, 6);
assert.equal(normalizeLinkCode(` ${code.toLowerCase()} `), code);
assert.equal(hashLinkCode(code).length, 64);

const store = {
  users: {
    u1: { id: 'u1', updatedAt: 0 },
    u2: { id: 'u2', discordAlert: { discordUserId: '99', discordUsername: 'taken' } },
  },
};

const started = startDiscordAlertLink(store.users.u1);
assert.ok(started.code);
assert.equal(publicDiscordAlert(store.users.u1).linked, false);

const bad = completeDiscordAlertLink(store, {
  code: 'NOPE12',
  discordUserId: '11',
  discordUsername: 'n',
});
assert.equal(bad.ok, false);

const clash = completeDiscordAlertLink(store, {
  code: started.code,
  discordUserId: '99',
  discordUsername: 'n',
});
assert.equal(clash.ok, false);

const fresh = startDiscordAlertLink(store.users.u1);
const ok = completeDiscordAlertLink(store, {
  code: fresh.code,
  discordUserId: '42',
  discordUsername: 'nimrod',
});
assert.equal(ok.ok, true);
assert.equal(findUserByDiscordAlertId(store, '42')?.id, 'u1');
assert.equal(publicDiscordAlert(store.users.u1).linked, true);
assert.equal(publicDiscordAlert(store.users.u1).username, 'nimrod');

unlinkDiscordAlert(store.users.u1);
assert.equal(publicDiscordAlert(store.users.u1).linked, false);

console.log('check-discord-alert: ok');
