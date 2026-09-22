import type { AccountUser, AuthResult } from './types.ts';

const REFRESH_KEY = 'virtuallab_refresh_token';

let accessToken: string | null = null;
let currentUser: AccountUser | null = null;
const listeners = new Set<() => void>();
let storageProbe: Storage | null | undefined;

export function getUser(): AccountUser | null {
  return currentUser;
}

export function getAccessToken(): string | null {
  return accessToken;
}

export function hasRefreshToken(): boolean {
  return readRefresh() !== null;
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function setSession(result: AuthResult): void {
  accessToken = result.accessToken;
  currentUser = result.user;
  writeRefresh(result.refreshToken);
  emit();
}

export function updateUser(user: AccountUser): void {
  currentUser = user;
  emit();
}

export function clearSession(): void {
  accessToken = null;
  currentUser = null;
  writeRefresh(null);
  emit();
}

export function replaceSession(user: AccountUser | null): void {
  currentUser = user;
  accessToken = user ? 'test-access-token' : null;
  if (!user) writeRefresh(null);
  emit();
}

export function readRefresh(): string | null {
  const storage = browserStorage();
  if (!storage) return null;
  return storage.getItem(REFRESH_KEY);
}

function emit(): void {
  for (const listener of listeners) listener();
}

function writeRefresh(token: string | null): void {
  const storage = browserStorage();
  if (!storage) return;
  if (token) storage.setItem(REFRESH_KEY, token);
  else storage.removeItem(REFRESH_KEY);
}

function browserStorage(): Storage | null {
  if (storageProbe !== undefined) return storageProbe;
  try {
    if (typeof localStorage === 'undefined') {
      storageProbe = null;
      return storageProbe;
    }
    const probe = '__virtuallab_storage_probe__';
    localStorage.setItem(probe, '1');
    localStorage.removeItem(probe);
    storageProbe = localStorage;
  } catch {
    storageProbe = null;
  }
  return storageProbe;
}
