import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { formatInviteCode, normalizeInviteCode } from '../src/account/invite.ts';

assert.strictEqual(normalizeInviteCode(' a3k-9p '), 'A3K9P');
assert.strictEqual(normalizeInviteCode('A3K9P'), 'A3K9P');
assert.strictEqual(normalizeInviteCode('o0i1l'), 'O0I1L');
assert.strictEqual(normalizeInviteCode(''), null);
assert.strictEqual(normalizeInviteCode('   '), null);
assert.strictEqual(normalizeInviteCode('abc'), null);
assert.strictEqual(normalizeInviteCode('ABCDEFGH'), null);
assert.strictEqual(normalizeInviteCode('A3K9!'), null);
assert.strictEqual(formatInviteCode('a3k9p'), 'A3K9P');
assert.strictEqual(formatInviteCode('a3k-9p'), 'A3K9P');

const whiteboardCss = readFileSync(new URL('../src/whiteboard/whiteboard.css', import.meta.url), 'utf8');
const avatarRule = whiteboardCss.match(/\.profile-avatar-img\s*\{([^}]*)\}/)?.[1] ?? '';
assert.match(avatarRule, /width:\s*100%/, 'Account avatar must not render at the source image width');
assert.match(avatarRule, /height:\s*100%/, 'Account avatar must not render at the source image height');
assert.match(avatarRule, /object-fit:\s*cover/, 'Account avatar should be cropped within its frame');

console.log('account invite code tests passed');
