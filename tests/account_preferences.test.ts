import assert from 'node:assert/strict';
import { AccountPreferenceStore, normalizePreferences } from '../src/account/preferences.ts';
import type { AccountUser } from '../src/account/types.ts';
import { VisionModal } from '../src/ui/vision/VisionModal.ts';

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

for (const instance of [store, delayed, offline, reloaded, switched]) instance.activate(null);
console.log('account preference persistence, retry, account isolation and silent restoration tests passed');
