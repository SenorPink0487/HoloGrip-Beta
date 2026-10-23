import { changePassword, messageOf, sendPasswordCode } from './api.ts';
import { getUser } from './session.ts';
import type { AccountUser } from './types.ts';

export class PasswordChangePanel {
  readonly element = document.createElement('section');
  private readonly form = document.createElement('form');
  private readonly toggle = document.createElement('button');
  private readonly send = document.createElement('button');
  private readonly submit = document.createElement('button');
  private readonly code = input('password-change-code', 'text', '6 位邮箱验证码', 'one-time-code');
  private readonly password = input('password-change-new', 'password', '至少 8 位，最多 72 字节', 'new-password');
  private readonly confirm = input('password-change-confirm', 'password', '再次输入新密码', 'new-password');
  private readonly status = document.createElement('p');
  public readonly user: AccountUser;
  private readonly onChanged: () => void;
  private active = false;
  private disposed = false;
  private sending = false;
  private saving = false;
  private retryAt = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(user: AccountUser, onChanged: () => void) {
    this.user = user;
    this.onChanged = onChanged;
    this.element.id = 'account-password-section';
    this.element.className = 'account-password-section apple-settings-section';
    const title = document.createElement('div');
    title.className = 'apple-section-header';
    title.textContent = '登录与安全';
    this.toggle.type = 'button';
    this.toggle.id = 'btn-change-password';
    this.toggle.className = 'apple-settings-row-btn';
    this.toggle.textContent = '修改密码';
    this.toggle.setAttribute('aria-expanded', 'false');
    this.toggle.setAttribute('aria-controls', 'password-change-form');
    this.form.id = 'password-change-form';
    this.form.className = 'account-password-form apple-settings-group hidden';
    const hint = document.createElement('p');
    hint.className = 'invite-hint password-hint';
    hint.textContent = `验证码将发送至 ${user.email}，10 分钟内有效。修改后所有设备需重新登录。`;
    this.code.maxLength = 6;
    this.code.inputMode = 'numeric';
    this.code.pattern = '[0-9]{6}';
    this.send.type = 'button';
    this.send.id = 'btn-send-password-code';
    this.send.className = 'apple-cell-action-btn secondary send-code-btn';
    this.send.textContent = '获取验证码';
    const codeRow = document.createElement('div');
    codeRow.className = 'password-code-row';
    codeRow.appendChild(this.code);
    codeRow.appendChild(this.send);
    this.submit.type = 'submit';
    this.submit.id = 'btn-save-password';
    this.submit.className = 'auth-submit';
    this.submit.textContent = '确认修改密码';
    this.status.id = 'password-change-status';
    this.status.className = 'account-security-status hidden';
    this.status.setAttribute('role', 'status');
    this.status.setAttribute('aria-live', 'polite');
    this.form.appendChild(hint);
    this.form.appendChild(field('邮箱验证码', this.code.id, codeRow));
    this.form.appendChild(field('新密码', this.password.id, this.password));
    this.form.appendChild(field('确认新密码', this.confirm.id, this.confirm));
    this.form.appendChild(this.status);
    this.form.appendChild(this.submit);
    this.element.appendChild(title);
    this.element.appendChild(this.toggle);
    this.element.appendChild(this.form);
    this.toggle.addEventListener('click', () => {
      const expanded = this.toggle.getAttribute('aria-expanded') !== 'true';
      this.toggle.setAttribute('aria-expanded', String(expanded));
      this.form.classList.toggle('hidden', !expanded);
      if (expanded) this.code.focus();
      else this.clearSecrets();
    });
    this.send.addEventListener('click', () => { void this.sendCode(); });
    this.form.addEventListener('submit', event => {
      event.preventDefault();
      void this.save();
    });
    this.sync();
  }

  setActive(active: boolean): void {
    this.active = active;
    if (!active) this.clearSecrets();
    this.sync();
  }

  dispose(): void {
    this.disposed = true;
    this.setActive(false);
  }

  private clearSecrets(): void {
    this.code.value = '';
    this.password.value = '';
    this.confirm.value = '';
  }

  private isCurrent(): boolean {
    const user = getUser();
    return !this.disposed && user?.id === this.user.id && user.email === this.user.email;
  }

  private sync(): void {
    clearTimeout(this.timer);
    const disabled = !this.active || this.disposed;
    const busy = this.sending || this.saving;
    const seconds = Math.max(0, Math.ceil((this.retryAt - Date.now()) / 1000));
    this.toggle.disabled = disabled || busy;
    this.send.disabled = disabled || busy || seconds > 0;
    this.submit.disabled = disabled || busy;
    for (const control of [this.code, this.password, this.confirm]) control.disabled = disabled || this.saving;
    this.send.textContent = this.sending ? '发送中…' : seconds > 0 ? `${seconds} 秒后重新获取` : '获取验证码';
    this.submit.textContent = this.saving ? '修改中…' : '确认修改密码';
    if (!disabled && seconds > 0) this.timer = setTimeout(() => this.sync(), 1000);
  }

  private show(message: string, error = false): void {
    this.status.textContent = message;
    this.status.classList.toggle('hidden', !message);
    this.status.dataset.state = error ? 'error' : 'success';
  }

  private async sendCode(): Promise<void> {
    if (!this.active || !this.isCurrent() || this.sending || this.saving || Date.now() < this.retryAt) return;
    this.sending = true;
    this.show('');
    this.sync();
    try {
      const result = await sendPasswordCode(this.user.id);
      if (!this.isCurrent()) return;
      this.retryAt = Date.now() + result.retryAfterSeconds * 1000;
      this.code.value = '';
      this.show('验证码已发送，请查收邮箱（也可检查垃圾邮件）。');
    } catch (error) {
      if (this.isCurrent()) this.show(messageOf(error), true);
    } finally {
      this.sending = false;
      this.sync();
    }
  }

  private async save(): Promise<void> {
    if (!this.active || !this.isCurrent() || this.saving || this.sending) return;
    const code = this.code.value.trim();
    const password = this.password.value;
    if (!/^\d{6}$/.test(code)) return this.show('请输入 6 位邮箱验证码', true);
    if (Array.from(password).length < 8 || new TextEncoder().encode(password).length > 72) {
      return this.show('密码至少 8 位，且不能超过 72 字节', true);
    }
    if (password !== this.confirm.value) return this.show('两次输入的密码不一致', true);
    this.saving = true;
    this.show('');
    this.sync();
    try {
      await changePassword(this.user.id, code, password);
      this.clearSecrets();
      if (this.isCurrent()) this.onChanged();
    } catch (error) {
      if (this.isCurrent()) this.show(messageOf(error), true);
    } finally {
      this.saving = false;
      this.sync();
    }
  }
}

function input(id: string, type: string, placeholder: string, autocomplete: string): HTMLInputElement {
  const control = document.createElement('input');
  control.id = id;
  control.type = type;
  control.className = 'apple-profile-input';
  control.placeholder = placeholder;
  control.setAttribute('autocomplete', autocomplete);
  control.required = true;
  return control;
}

function field(label: string, id: string, control: HTMLElement): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.className = 'password-change-field';
  const caption = document.createElement('label');
  caption.htmlFor = id;
  caption.textContent = label;
  wrapper.appendChild(caption);
  wrapper.appendChild(control);
  return wrapper;
}
