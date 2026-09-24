import { normalizeInviteCode } from './invite.ts';
import {
  clearSession,
  getAccessToken,
  readRefresh,
  setSession,
} from './session.ts';
import { AccountApiError, type AccountUser, type AuthResult } from './types.ts';

export type RestoreStatus = 'anonymous' | 'ready' | 'offline';

export function apiBase(): string {
  const configured = import.meta.env?.VITE_ACCOUNT_API_URL;
  const base = configured && configured.trim() ? configured.trim() : 'http://127.0.0.1:8080';
  return base.replace(/\/$/, '');
}

let refreshTask: Promise<boolean> | null = null;

async function request<T>(
  path: string,
  init: RequestInit,
  auth: boolean,
  allowRefresh: boolean,
): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body) headers.set('Content-Type', 'application/json');
  if (auth) {
    const token = getAccessToken();
    if (token) headers.set('Authorization', `Bearer ${token}`);
  }

  let response: Response;
  try {
    response = await fetch(`${apiBase()}${path}`, {
      ...init,
      headers,
      credentials: 'omit',
    });
  } catch {
    throw new AccountApiError('network', '无法连接账户服务', 0);
  }

  if (response.status === 401 && auth && allowRefresh && readRefresh()) {
    const refreshed = await refreshOnce();
    if (refreshed) return request<T>(path, init, auth, false);
    clearSession();
    throw new AccountApiError('unauthorized', '登录已失效，请重新登录', 401);
  }

  if (response.status === 204) return undefined as T;
  if (!response.ok) throw await toError(response);
  return response.json() as Promise<T>;
}

async function refreshOnce(): Promise<boolean> {
  if (!refreshTask) {
    refreshTask = (async () => {
      const token = readRefresh();
      if (!token) return false;
      try {
        const result = await refresh(token);
        setSession(result);
        return true;
      } catch (error) {
        if (error instanceof AccountApiError && error.status === 0) return false;
        clearSession();
        return false;
      } finally {
        refreshTask = null;
      }
    })();
  }
  return refreshTask;
}

async function toError(response: Response): Promise<AccountApiError> {
  try {
    const body = await response.json();
    const message = body?.error?.message || '请求失败';
    const code = body?.error?.code || 'request_failed';
    return new AccountApiError(code, message, response.status);
  } catch {
    return new AccountApiError('request_failed', '请求失败', response.status);
  }
}

export function messageOf(error: unknown): string {
  if (error instanceof AccountApiError) return error.message;
  return '请求失败';
}

export async function login(email: string, password: string): Promise<AuthResult> {
  return request<AuthResult>(
    '/api/v1/auth/login',
    { method: 'POST', body: JSON.stringify({ email, password }) },
    false,
    false,
  );
}

export async function register(input: {
  role: 'teacher' | 'student';
  email: string;
  password: string;
  displayName: string;
  className?: string;
  inviteCode?: string;
}): Promise<AuthResult> {
  const body: Record<string, string> = {
    role: input.role,
    email: input.email,
    password: input.password,
    displayName: input.displayName.trim(),
  };
  if (input.role === 'teacher' && input.className) body.className = input.className;
  if (input.role === 'student' && input.inviteCode) {
    const normalized = normalizeInviteCode(input.inviteCode);
    if (normalized) body.inviteCode = normalized;
  }
  return request<AuthResult>(
    '/api/v1/auth/register',
    { method: 'POST', body: JSON.stringify(body) },
    false,
    false,
  );
}

export async function refresh(refreshToken: string): Promise<AuthResult> {
  let response: Response;
  try {
    response = await fetch(`${apiBase()}/api/v1/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'omit',
      body: JSON.stringify({ refreshToken }),
    });
  } catch {
    throw new AccountApiError('network', '无法连接账户服务', 0);
  }
  if (!response.ok) throw await toError(response);
  return response.json() as Promise<AuthResult>;
}

export async function logout(refreshToken: string | null): Promise<void> {
  if (!refreshToken) return;
  try {
    await fetch(`${apiBase()}/api/v1/auth/logout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'omit',
      body: JSON.stringify({ refreshToken }),
    });
  } catch {
    // Local sign-out still proceeds when the account service is unreachable.
  }
}

export async function fetchMe(): Promise<AccountUser> {
  return request<AccountUser>('/api/v1/me', { method: 'GET' }, true, true);
}

export async function updateDisplayName(displayName: string): Promise<AccountUser> {
  return request<AccountUser>(
    '/api/v1/me',
    { method: 'PATCH', body: JSON.stringify({ displayName }) },
    true,
    true,
  );
}

export async function updateClassName(name: string): Promise<AccountUser> {
  return request<AccountUser>(
    '/api/v1/classes/current',
    { method: 'PATCH', body: JSON.stringify({ name }) },
    true,
    true,
  );
}

export async function joinClass(inviteCode: string): Promise<AccountUser> {
  return request<AccountUser>(
    '/api/v1/classes/join',
    { method: 'POST', body: JSON.stringify({ inviteCode }) },
    true,
    true,
  );
}

export async function restoreSession(): Promise<RestoreStatus> {
  const token = readRefresh();
  if (!token) return 'anonymous';
  try {
    setSession(await refresh(token));
    return 'ready';
  } catch (error) {
    if (error instanceof AccountApiError && error.status === 0) return 'offline';
    clearSession();
    return 'anonymous';
  }
}

export async function createWhiteboardTicket(): Promise<{ ticket: string }> {
  return request('/api/v1/whiteboard/ticket', { method: 'POST' }, true, true);
}
