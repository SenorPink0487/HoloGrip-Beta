import assert from 'node:assert';
import './account_preferences.test.ts';
import { readFileSync } from 'node:fs';
import { formatInviteCode, normalizeInviteCode } from '../src/account/invite.ts';

await import('./password_change.test.ts');

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

const avatarWrapperRule = whiteboardCss.match(/\.profile-avatar-wrapper\s*\{([^}]*)\}/)?.[1] ?? '';
assert.doesNotMatch(avatarWrapperRule, /#0071e3|#5e5ce6/, 'Account avatar wrapper must not have blue gradient background');
assert.doesNotMatch(avatarWrapperRule, /rgba\(\s*0\s*,\s*113\s*,\s*227/, 'Account avatar wrapper must not have blue shadow');

const nameFieldRule = whiteboardCss.match(/\.account-name-field\s*\{([^}]*)\}/)?.[1] ?? '';
assert.match(nameFieldRule, /background:\s*transparent/, 'Username field must be frameless with transparent background');
assert.match(nameFieldRule, /border:\s*none/, 'Username field must not have UI border box');

// 校验苹果设计风格的底部按钮平滑交叉淡入淡出 (Native Crossfade)
assert.match(whiteboardCss, /\.auth-submit-viewport/, 'Auth submit button must have viewport container');
assert.match(whiteboardCss, /@keyframes\s+apple-crossfade-in/, 'Crossfade-in animation must be defined');
assert.match(whiteboardCss, /@keyframes\s+apple-crossfade-out/, 'Crossfade-out animation must be defined');
assert.match(whiteboardCss, /@media\s*\(prefers-reduced-motion:\s*reduce\)/, 'Accessibility reduced-motion fallback must be supported');

// 校验首屏图片与资产预加载及解码性能
const indexHtml = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
assert.match(indexHtml, /<link\s+rel="preload"\s+as="image"\s+href="\/hologrip-logo\.png"/, 'index.html should preload hologrip-logo.png');

// 校验 GPU 硬件加速与 will-change 优化
assert.match(whiteboardCss, /\.apple-modal-backdrop\s*\{[^}]*will-change:\s*opacity/, 'Backdrop must have will-change: opacity');
assert.match(whiteboardCss, /\.apple-modal-backdrop\s*\{[^}]*transform:\s*translateZ\(0\)/, 'Backdrop must have 3D hardware layer');
assert.match(whiteboardCss, /\.apple-modal-card\s*\{[^}]*will-change:\s*transform,\s*opacity/, 'Card must have will-change: transform, opacity');
assert.match(whiteboardCss, /\.apple-modal-card\s*\{[^}]*translate3d/, 'Card must use 3D hardware transform');
assert.match(whiteboardCss, /\.apple-modal-card\s*\{[^}]*overflow:\s*hidden/, 'Card must clip internal scrollbars within rounded borders');
assert.match(whiteboardCss, /\.account-modal-body\s*\{[^}]*overflow-y:\s*auto/, 'Body must handle internal scrolling within card bounds');
assert.match(whiteboardCss, /\.auth-hero-img\s*\{[^}]*will-change:\s*transform/, 'Auth hero image must have will-change: transform');
assert.match(whiteboardCss, /\.auth-hero-img\s*\{[^}]*translateZ\(0\)/, 'Auth hero image must be isolated to GPU layer');

// 校验预热函数导出与安全调用
import { preloadAccountAssets } from '../src/whiteboard/AccountModal.ts';
assert.strictEqual(typeof preloadAccountAssets, 'function');
assert.doesNotThrow(() => preloadAccountAssets());

console.log('account invite code, performance warmup & Apple-style crossfade button motion tests passed');

