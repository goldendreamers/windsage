#!/usr/bin/env node
/**
 * Wind-alert poller must default off on a Mac clone and on when Wald.
 */
import assert from 'node:assert/strict';
import { shouldPollAlerts, pollReason, WALD_DATA_DIR } from '../code/cloud/lib/poll.mjs';

assert.equal(shouldPollAlerts('/tmp/windsage-data', {}), false);
assert.equal(shouldPollAlerts('./data', {}), false);
assert.equal(shouldPollAlerts(WALD_DATA_DIR, {}), true);
assert.equal(shouldPollAlerts('/tmp/x', { WINDSAGE_POLL: '1' }), true);
assert.equal(shouldPollAlerts(WALD_DATA_DIR, { WINDSAGE_POLL: '0' }), false);
assert.equal(shouldPollAlerts('/tmp/x', { WINDSAGE_POLL: 'off' }), false);
assert.match(pollReason('/tmp/x', {}), /not Wald/);
assert.match(pollReason(WALD_DATA_DIR, { WINDSAGE_POLL: '1' }), /WINDSAGE_POLL=1/);
console.log('check-poll: ok');
