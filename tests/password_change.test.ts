import assert from 'node:assert/strict';
import { PasswordChangePanel } from '../src/account/PasswordChangePanel.ts';
import { clearSession, setSession } from '../src/account/session.ts';
import type { AccountUser } from '../src/account/types.ts';

class Element {
  id = '';
  className = '';
  textContent = '';
  value = '';
  disabled = false;
  dataset: Record<string, string> = {};
  children: Element[] = [];
  attributes = new Map<string, string>();
  listeners = new Map<string, (event: { preventDefault(): void }) => void>();
  appendChild(child: Element): void { this.children.push(child); }
  setAttribute(name: string, value: string): void { this.attributes.set(name, value); }
  getAttribute(name: string): string | null { return this.attributes.get(name) ?? null; }
  addEventListener(name: string, handler: (event: { preventDefault(): void }) => void): void {
    this.listeners.set(name, handler);
  }
  dispatch(name: string): void { this.listeners.get(name)?.({ preventDefault() {} }); }
  focus(): void {}
  get classList() {
    return { toggle: (name: string, on: boolean) => {
      const classes = new Set(this.className.split(' '));
      if (on) classes.add(name); else classes.delete(name);
      this.className = [...classes].join(' ');
    } };
  }
  find(id: string): Element {
    if (this.id === id) return this;
    for (const child of this.children) {
      try { return child.find(id); } catch {}
    }
    throw new Error(`Missing ${id}`);
  }
}

const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
const originalFetch = globalThis.fetch;
const account: AccountUser = { id: 'password-ui', email: 'password-ui@school.edu', role: 'student', displayName: 'Test', class: null };
const requests: Array<{ url: string; init?: RequestInit }> = [];
let failSend = false;
let changed = 0;
let panel: PasswordChangePanel | undefined;
const drain = () => new Promise<void>(resolve => setImmediate(resolve));
try {
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement: () => new Element() } });
  setSession({ accessToken: 'test-access', refreshToken: 'test-refresh', user: account });
  globalThis.fetch = async (url, init) => {
    requests.push({ url: String(url), init });
    if (String(url).endsWith('/code')) {
      return failSend
        ? new Response(JSON.stringify({ error: { code: 'email_unavailable', message: '验证邮件发送失败' } }), { status: 503 })
        : new Response(JSON.stringify({ retryAfterSeconds: 60, expiresInSeconds: 600 }));
    }
    return new Response(null, { status: 204 });
  };
  panel = new PasswordChangePanel(account, () => { changed++; });
  const root = panel.element as unknown as Element;
  const code = root.find('password-change-code');
  const password = root.find('password-change-new');
  const confirm = root.find('password-change-confirm');
  const form = root.find('password-change-form');
  const send = root.find('btn-send-password-code');
  const status = root.find('password-change-status');
  assert.equal(send.disabled, true, 'closed account controls cannot send email');
  panel.setActive(true);
  root.find('btn-change-password').dispatch('click');
  assert.equal(root.find('btn-change-password').getAttribute('aria-expanded'), 'true');
  failSend = true;
  send.dispatch('click');
  await drain();
  assert.equal(status.textContent, '验证邮件发送失败');
  assert.equal(send.disabled, false, 'failed delivery allows a later retry');
  failSend = false;
  send.dispatch('click');
  send.dispatch('click');
  await drain();
  assert.equal(requests.length, 2, 'double click does not send duplicate requests');
  assert.equal(send.disabled, true, 'resend cooldown survives reopening');
  assert.match(send.textContent, /60 秒/);
  assert.match(status.textContent, /验证码已发送/);
  const requestCount = requests.length;
  form.dispatch('submit');
  await drain();
  assert.equal(requests.length, requestCount, 'invalid codes are rejected before API calls');
  code.value = '012345';
  password.value = 'new-password';
  confirm.value = 'different-password';
  form.dispatch('submit');
  await drain();
  assert.match(status.textContent, /不一致/);
  password.value = '密'.repeat(25);
  confirm.value = password.value;
  form.dispatch('submit');
  await drain();
  assert.match(status.textContent, /72 字节/);
  password.value = 'new-password';
  confirm.value = password.value;
  form.dispatch('submit');
  form.dispatch('submit');
  await drain();
  assert.equal(changed, 1);
  assert.equal(requests.length, requestCount + 1, 'duplicate submits are ignored');
  assert.deepEqual(JSON.parse(String(requests.at(-1)?.init?.body)), { code: '012345', newPassword: 'new-password' });
  assert.equal(new Headers(requests.at(-1)?.init?.headers).get('Authorization'), 'Bearer test-access');
  assert.equal(password.value, '', 'successful submission clears password fields');
  password.value = confirm.value = 'secret-on-close';
  code.value = '012345';
  panel.setActive(false);
  assert.equal(password.value, '');
  assert.equal(confirm.value, '');
  assert.equal(code.value, '');
  panel.setActive(true);
  assert.equal(send.disabled, true);
  setSession({ accessToken: 'other-token', refreshToken: 'other-refresh', user: { ...account, id: 'other-user' } });
  code.value = '012345'; password.value = confirm.value = 'new-password';
  form.dispatch('submit');
  await drain();
  assert.equal(requests.length, requestCount + 1, 'a stale form cannot change a different account');
} finally {
  panel?.dispose();
  clearSession();
  globalThis.fetch = originalFetch;
  if (originalDocument) Object.defineProperty(globalThis, 'document', originalDocument);
  else Reflect.deleteProperty(globalThis, 'document');
}
console.log('password change validation, delivery errors, duplicate requests, cooldown, and account isolation tests passed');
