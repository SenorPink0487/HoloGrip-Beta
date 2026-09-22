import assert from 'node:assert';
import { formatInviteCode, normalizeInviteCode } from '../src/account/invite.ts';

assert.strictEqual(normalizeInviteCode(' k7mp-q2hx '), 'K7MPQ2HX');
assert.strictEqual(normalizeInviteCode('K7MPQ2HX'), 'K7MPQ2HX');
assert.strictEqual(normalizeInviteCode(''), null);
assert.strictEqual(normalizeInviteCode('   '), null);
assert.strictEqual(normalizeInviteCode('abc'), null);
assert.strictEqual(normalizeInviteCode('O0OOOOOO'), null);
assert.strictEqual(formatInviteCode('K7MPQ2HX'), 'K7MP-Q2HX');
assert.strictEqual(formatInviteCode('k7mp-q2hx'), 'K7MP-Q2HX');

console.log('account invite code tests passed');
