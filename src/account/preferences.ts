import { saveAccountPreferences } from './api.ts';
import { getUser, subscribe as subscribeSession } from './session.ts';
import type { AccountPreferences, AccountUser } from './types.ts';

export const DEFAULT_SPATIAL_WINDOW_SCALE = 1;

export function normalizePreferences(value: unknown): AccountPreferences {
  if (!value || typeof value !== 'object') return {};
  const result: AccountPreferences = {};
  const scale = (value as AccountPreferences).spatialWindowScale;
  if (typeof scale === 'number' && Number.isFinite(scale) && scale >= 0.5 && scale <= 2) {
    result.spatialWindowScale = Math.round(scale * 100) / 100;
  }
  const theme = (value as AccountPreferences).whiteboardTheme;
  if (theme && ['plain', 'grid', 'chalkboard', 'dark'].includes(theme)) result.whiteboardTheme = theme;
  return result;
}

/** Account-owned preferences; local storage holds only edits awaiting server acknowledgement. */
export class AccountPreferenceStore {
  private userId: string | null = null;
  private value: AccountPreferences = {};
  private pending = new Map<string, AccountPreferences>();
  private tasks = new Map<string, Promise<void>>();
  private listeners = new Set<() => void>();
  private timer: ReturnType<typeof setTimeout> | undefined;
  private save: (userId: string, preferences: AccountPreferences) => Promise<unknown>;
  private storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

  constructor(
    save: (userId: string, preferences: AccountPreferences) => Promise<unknown>,
    storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>,
  ) {
    this.save = save;
    this.storage = storage;
  }

  get spatialWindowScale(): number {
    return this.value.spatialWindowScale ?? DEFAULT_SPATIAL_WINDOW_SCALE;
  }

  get whiteboardTheme(): NonNullable<AccountPreferences['whiteboardTheme']> {
    return this.value.whiteboardTheme ?? 'plain';
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  activate(user: AccountUser | null): void {
    if (this.userId === (user?.id ?? null)) return;
    clearTimeout(this.timer);
    this.userId = user?.id ?? null;
    if (user && !this.pending.has(user.id)) {
      try {
        const cached = normalizePreferences(JSON.parse(this.storage?.getItem(this.key(user.id)) ?? '{}'));
        if (Object.keys(cached).length) this.pending.set(user.id, cached);
      } catch { /* Unavailable or invalid local cache must not prevent login. */ }
    }
    this.value = user
      ? { ...normalizePreferences(user.preferences), ...this.pending.get(user.id) }
      : {};
    this.emit();
    if (this.userId && this.pending.has(this.userId)) this.schedule(0);
  }

  setSpatialWindowScale(scale: number): void {
    const next = normalizePreferences({ spatialWindowScale: scale });
    if (next.spatialWindowScale === undefined || next.spatialWindowScale === this.spatialWindowScale) return;
    this.update(next);
  }

  setWhiteboardTheme(theme: NonNullable<AccountPreferences['whiteboardTheme']>): void {
    const next = normalizePreferences({ whiteboardTheme: theme });
    if (!next.whiteboardTheme || next.whiteboardTheme === this.whiteboardTheme) return;
    this.update(next);
  }

  private update(next: AccountPreferences): void {
    this.value = { ...this.value, ...next };
    if (this.userId) {
      const pending = { ...this.pending.get(this.userId), ...next };
      this.pending.set(this.userId, pending);
      this.cache(this.userId, pending);
      this.schedule(350);
    }
    this.emit();
  }

  async flush(): Promise<void> {
    const id = this.userId;
    if (!id) return;
    clearTimeout(this.timer);
    const running = this.tasks.get(id);
    if (running) return running;
    const task = this.drain(id);
    this.tasks.set(id, task);
    try {
      await task;
    } finally {
      this.tasks.delete(id);
      if (this.userId === id && this.pending.has(id)) this.schedule(5000);
    }
  }

  private async drain(id: string): Promise<void> {
    while (this.userId === id) {
      const snapshot = this.pending.get(id);
      if (!snapshot) return;
      try {
        await this.save(id, snapshot);
      } catch {
        // Retry later; retain the account-specific pending edit across reloads and logout.
        return;
      }
      if (this.pending.get(id) === snapshot) {
        this.pending.delete(id);
        this.cache(id, null);
      }
    }
  }

  private key(id: string): string { return `virtuallab_pending_preferences:${id}`; }

  private cache(id: string, value: AccountPreferences | null): void {
    try {
      if (value) this.storage?.setItem(this.key(id), JSON.stringify(value));
      else this.storage?.removeItem(this.key(id));
    } catch { /* Server persistence remains available if browser storage is blocked. */ }
  }

  private schedule(delay: number): void {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => { void this.flush(); }, delay);
  }

  private emit(): void { for (const listener of this.listeners) listener(); }
}

let store: AccountPreferenceStore | undefined;

export function accountPreferences(): AccountPreferenceStore {
  if (!store) {
    let storage: Storage | undefined;
    try { storage = globalThis.localStorage; } catch { /* Optional offline cache. */ }
    store = new AccountPreferenceStore(saveAccountPreferences, storage);
    store.activate(getUser());
    subscribeSession(() => store!.activate(getUser()));
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => { void store!.flush(); });
      window.addEventListener('pagehide', () => { void store!.flush(); });
      document.addEventListener?.('visibilitychange', () => {
        if (document.visibilityState === 'hidden') void store!.flush();
      });
    }
  }
  return store;
}
