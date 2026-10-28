import assert from 'node:assert/strict';
import { AccountPreferenceStore, normalizePreferences } from '../src/account/preferences.ts';
import type { AccountUser } from '../src/account/types.ts';
import { VisionModal } from '../src/ui/vision/VisionModal.ts';
import { saveAccountPreferences } from '../src/account/api.ts';
import { clearSession, getUser, setSession } from '../src/account/session.ts';

const user = (id: string, scale?: number): AccountUser => ({
  id, email: `${id}@school.edu`, role: 'student', displayName: id, class: null,
  preferences: scale === undefined ? {} : { spatialWindowScale: scale },
});
const data = new Map<string, string>();
const storage = {
  getItem: (key: string) => data.get(key) ?? null,
  setItem: (key: string, value: string) => { data.set(key, value); },
  removeItem: (key: string) => { data.delete(key); },
};
const saved: Array<{ id: string; scale?: number }> = [];
const store = new AccountPreferenceStore(async (id, preferences) => {
  saved.push({ id, scale: preferences.spatialWindowScale });
}, storage);

store.activate(user('alice', 1.45));
assert.equal(store.spatialWindowScale, 1.45, 'login restores the server preference');
store.setSpatialWindowScale(1.6);
store.setSpatialWindowScale(1.7);
store.activate(user('alice', 1.45));
assert.equal(store.spatialWindowScale, 1.7, 'token refresh/profile updates do not roll back local edits');
await store.flush();
assert.deepEqual(saved, [{ id: 'alice', scale: 1.7 }], 'coalesce edits before saving');
assert.equal(data.size, 0, 'acknowledged edits are removed from the pending cache');
store.activate(null);
assert.equal(store.spatialWindowScale, 1);
store.activate(user('bob'));
assert.equal(store.spatialWindowScale, 1, 'another account starts with its own default');
store.activate(user('alice', 1.7));
assert.equal(store.spatialWindowScale, 1.7, 're-login restores the persisted scale');

let release!: () => void;
let firstRequest = true;
const delayed = new AccountPreferenceStore(async (id, preferences) => {
  saved.push({ id, scale: preferences.spatialWindowScale });
  if (firstRequest) {
    firstRequest = false;
    await new Promise<void>(resolve => { release = resolve; });
  }
}, storage);
delayed.activate(user('alice'));
delayed.setSpatialWindowScale(1.2);
const inFlight = delayed.flush();
delayed.setSpatialWindowScale(1.8);
release();
await inFlight;
assert.deepEqual(saved.slice(-2), [{ id: 'alice', scale: 1.2 }, { id: 'alice', scale: 1.8 }],
  'a response to an older edit cannot discard a newer edit');

let online = false;
const offline = new AccountPreferenceStore(async () => {
  if (!online) throw new Error('offline');
}, storage);
offline.activate(user('alice'));
offline.setSpatialWindowScale(1.9);
await offline.flush();
assert.equal(data.size, 1, 'failed saves remain cached');
offline.activate(user('bob', 0.8));
assert.equal(offline.spatialWindowScale, 0.8, 'pending edits are isolated by account');
const reloaded = new AccountPreferenceStore(async () => {}, storage);
reloaded.activate(user('alice', 1));
assert.equal(reloaded.spatialWindowScale, 1.9, 'reload recovers only this account’s unsynced edit');
online = true;
await reloaded.flush();

let finishAlice!: () => void;
const switched = new AccountPreferenceStore(async () => {
  await new Promise<void>(resolve => { finishAlice = resolve; });
}, storage);
switched.activate(user('alice'));
switched.setSpatialWindowScale(1.3);
const oldSave = switched.flush();
switched.activate(user('bob', 0.7));
finishAlice();
await oldSave;
assert.equal(switched.spatialWindowScale, 0.7, 'late saves never overwrite the active account');

for (const invalid of [NaN, Infinity, -1, 0.49, 2.01, '1.5', null]) {
  assert.deepEqual(normalizePreferences({ spatialWindowScale: invalid }), {});
}
assert.deepEqual(normalizePreferences({ spatialWindowScale: 1.234 }), { spatialWindowScale: 1.23 });
assert.deepEqual(normalizePreferences({ whiteboardTheme: 'unknown' }), {});
assert.deepEqual(normalizePreferences({ galleryPalette: 'neon' }), {});
assert.deepEqual(normalizePreferences({ galleryPortraits: false }), { galleryPortraits: false });
assert.deepEqual(normalizePreferences({ galleryPortraits: 'yes' }), {});
assert.deepEqual(normalizePreferences({ galleryPalette: 'glacier' }), { galleryPalette: 'glacier' });
const themeSaves: unknown[] = [];
const themed = new AccountPreferenceStore(async (_id, patch) => { themeSaves.push(patch); });
themed.activate({ ...user('alice', 1.4), preferences: { spatialWindowScale: 1.4, whiteboardTheme: 'grid' } });
assert.equal(themed.whiteboardTheme, 'grid');
themed.setWhiteboardTheme('dark');
themed.setSpatialWindowScale(1.6);
await themed.flush();
assert.deepEqual(themeSaves, [{ whiteboardTheme: 'dark', spatialWindowScale: 1.6 }]);
themed.activate(user('bob'));
assert.equal(themed.whiteboardTheme, 'plain');
assert.equal(themed.galleryPortraits, true, 'portraits default to visible');
assert.equal(themed.galleryPalette, 'warm', 'gallery palette defaults to the current warm scheme');
themed.activate({ ...user('alice', 1), preferences: { galleryPortraits: false, galleryPalette: 'glacier' } });
assert.equal(themed.galleryPortraits, false);
assert.equal(themed.galleryPalette, 'glacier');
themed.setGalleryPortraits(true);
themed.setGalleryPalette('warm');
await themed.flush();
assert.deepEqual(themeSaves.at(-1), { galleryPortraits: true, galleryPalette: 'warm' });

let indicatorCount = 0;
let appliedScale = 0;
const modal = {
  MIN_SCALE: 0.5, MAX_SCALE: 2, currentScale: 1,
  callbacks: { onScaleChange: (scale: number) => { appliedScale = scale; } },
  showScaleIndicator: () => { indicatorCount++; },
};
VisionModal.prototype.setScale.call(modal as any, 1.4, false);
assert.equal(appliedScale, 1.4);
assert.equal(indicatorCount, 0, 'restoring preferences is silent');
VisionModal.prototype.setScale.call(modal as any, 1.6);
assert.equal(indicatorCount, 1);
VisionModal.prototype.setScale.call(modal as any, NaN);
assert.equal(appliedScale, 1.6, 'invalid values cannot poison the scene transform');

for (const instance of [store, delayed, offline, reloaded, switched, themed]) instance.activate(null);

// Actual API retries must retain account ownership when a token refresh crosses logout/login.
const originalFetch = globalThis.fetch;
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage });
const auth = (id: string) => ({ user: user(id), accessToken: `${id}-access`, refreshToken: `${id}-refresh` });
try {
  setSession(auth('alice'));
  let requests = 0;
  globalThis.fetch = async (_url, init) => {
    requests++;
    assert.equal(new Headers(init?.headers).get('authorization'), 'Bearer alice-access');
    return Response.json({ spatialWindowScale: 1.5 });
  };
  await saveAccountPreferences('alice', { spatialWindowScale: 1.5 });
  await assert.rejects(saveAccountPreferences('bob', { spatialWindowScale: 1.5 }));
  assert.equal(requests, 1, 'a mismatched account is rejected before sending a request');

  let refreshStarted!: () => void;
  const refreshing = new Promise<void>(resolve => { refreshStarted = resolve; });
  let finishRefresh!: (response: Response) => void;
  globalThis.fetch = async url => {
    if (String(url).endsWith('/auth/refresh')) {
      refreshStarted();
      return new Promise<Response>(resolve => { finishRefresh = resolve; });
    }
    return new Response(null, { status: 401 });
  };
  const request = saveAccountPreferences('alice', { spatialWindowScale: 1.8 });
  await refreshing;
  setSession(auth('bob'));
  finishRefresh(Response.json(auth('alice')));
  await assert.rejects(request);
  assert.equal(getUser()?.id, 'bob', 'an old token refresh cannot sign the previous account back in');

  globalThis.fetch = async url => {
    if (String(url).endsWith('/auth/refresh')) throw new Error('offline');
    return new Response(null, { status: 401 });
  };
  await assert.rejects(saveAccountPreferences('bob', { spatialWindowScale: 1.2 }));
  assert.equal(getUser()?.id, 'bob', 'a temporary refresh network failure must preserve the session');
} finally {
  globalThis.fetch = originalFetch;
  clearSession();
  delete (globalThis as any).localStorage;
}
console.log('account preference persistence, retry, account isolation and silent restoration tests passed');
