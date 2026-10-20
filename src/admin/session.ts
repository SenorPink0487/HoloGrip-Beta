import type { AuthResult, AccountUser } from '../account/types.ts';

const STORAGE_KEY = 'hologrip_admin_refresh';
let accessToken: string | null = null;
let currentUser: AccountUser | null = null;
let refreshTask: Promise<void> | null = null;

export class AdminApiError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

export function getAdminApiBase(): string {
  return (import.meta.env.VITE_ACCOUNT_API_URL?.trim() || 'http://127.0.0.1:8080').replace(/\/$/, '');
}
export function getAdminUser(): AccountUser | null { return currentUser; }

async function parse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new AdminApiError(data?.error?.message || `请求失败 (${response.status})`, response.status);
  }
  return response.status === 204 ? undefined as T : response.json();
}
async function authRequest(path: string, body: object): Promise<AuthResult> {
  return parse(await fetch(`${getAdminApiBase()}/api/v1/auth/${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }));
}
function forget(): void {
  accessToken = null;
  currentUser = null;
  sessionStorage.removeItem(STORAGE_KEY);
}
async function accept(result: AuthResult): Promise<void> {
  if (!result.user.isAdmin) {
    await revoke(result.refreshToken);
    throw new AdminApiError('此账号没有管理员权限，请使用管理员账号登录。', 403);
  }
  accessToken = result.accessToken;
  currentUser = result.user;
  sessionStorage.setItem(STORAGE_KEY, result.refreshToken);
}
async function revoke(refreshToken: string | null): Promise<void> {
  if (refreshToken) await authRequest('logout', { refreshToken }).catch(() => undefined);
}
export async function adminLogin(email: string, password: string): Promise<void> {
  await accept(await authRequest('login', { email, password }));
}
export async function adminLogout(): Promise<void> {
  const token = sessionStorage.getItem(STORAGE_KEY);
  forget();
  await revoke(token);
}
async function renew(): Promise<void> {
  if (!refreshTask) {
    refreshTask = (async () => {
      const token = sessionStorage.getItem(STORAGE_KEY);
      if (!token) throw new AdminApiError('请先登录管理员账号。', 401);
      await accept(await authRequest('refresh', { refreshToken: token }));
    })().finally(() => { refreshTask = null; });
  }
  return refreshTask;
}
export async function restoreAdmin(): Promise<boolean> {
  if (!sessionStorage.getItem(STORAGE_KEY)) return false;
  try { await renew(); return true; }
  catch (error) {
    if (error instanceof AdminApiError && [401, 403, 423].includes(error.status)) forget();
    throw error;
  }
}
export async function adminRequest<T>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body) headers.set('Content-Type', 'application/json');
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);
  const response = await fetch(`${getAdminApiBase()}${path}`, { ...init, headers, cache: 'no-store' });
  if (response.status === 401 && retry) {
    try { await renew(); }
    catch (error) {
      if (error instanceof AdminApiError && [401, 403, 423].includes(error.status)) {
        forget(); window.dispatchEvent(new Event('admin:unauthorized'));
      }
      throw error;
    }
    return adminRequest(path, init, false);
  }
  if ([401, 403, 423].includes(response.status)) {
    const refreshToken = sessionStorage.getItem(STORAGE_KEY);
    forget();
    void revoke(refreshToken);
    window.dispatchEvent(new Event('admin:unauthorized'));
  }
  return parse(response);
}
