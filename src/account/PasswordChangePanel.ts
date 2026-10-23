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
  private readonly sheetBackdrop = document.createElement('div');
  public readonly user: AccountUser;
  private readonly onChanged: () => void;
  public onSheetStateChange?: (isOpen: boolean) => void;
  private isSheetOpen = false;
  private active = false;
  private disposed = false;
  private sending = false;
  private saving = false;
  private retryAt = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;

  public get sheetElement(): HTMLElement {
    return this.sheetBackdrop;
  }

  constructor(user: AccountUser, onChanged: () => void) {
    this.user = user;
    this.onChanged = onChanged;
    this.element.id = 'account-password-section';
    this.element.className = 'account-password-section apple-settings-section';

    const title = document.createElement('div');
    title.className = 'apple-section-header';
    title.textContent = '登录与安全';

    const group = document.createElement('div');
    group.className = 'apple-settings-group';

    this.toggle.type = 'button';
    this.toggle.id = 'btn-change-password';
    this.toggle.className = 'apple-settings-row-btn macos-action-row';
    this.toggle.setAttribute('aria-expanded', 'false');
    this.toggle.setAttribute('aria-controls', 'password-change-form');

    const toggleLabel = document.createElement('span');
    toggleLabel.className = 'apple-row-label';
    toggleLabel.textContent = '修改密码';

    const toggleRight = document.createElement('div');
    toggleRight.className = 'macos-row-right';
    toggleRight.innerHTML = `<span class="macos-chevron-wrap"><svg class="macos-chevron" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg></span>`;

    this.toggle.appendChild(toggleLabel);
    this.toggle.appendChild(toggleRight);
    group.appendChild(this.toggle);

    this.element.appendChild(title);
    this.element.appendChild(group);

    // macOS Sheet Modal Architecture (identical to createMacosSheet for Name & Class)
    this.sheetBackdrop.className = 'macos-sheet-backdrop hidden';
    this.sheetBackdrop.setAttribute('aria-hidden', 'true');

    const sheetCard = document.createElement('div');
    sheetCard.className = 'macos-sheet-card macos-password-sheet-card';

    const sheetTitle = document.createElement('h3');
    sheetTitle.className = 'macos-sheet-title';
    sheetTitle.textContent = '修改密码';

    const sheetDesc = document.createElement('p');
    sheetDesc.className = 'macos-sheet-desc';
    sheetDesc.textContent = `验证码将发送至 ${user.email}，10 分钟内有效。修改后所有设备需重新登录。`;

    this.form.id = 'password-change-form';
    this.form.className = 'account-password-form';

    const fieldsList = document.createElement('div');
    fieldsList.className = 'macos-sheet-field-list';

    // 1. Code
    const codeField = document.createElement('div');
    codeField.className = 'macos-sheet-field';
    const codeLabel = document.createElement('label');
    codeLabel.className = 'macos-sheet-field-label';
    codeLabel.htmlFor = this.code.id;
    codeLabel.textContent = '邮箱验证码';

    const codeRow = document.createElement('div');
    codeRow.className = 'macos-sheet-code-row';

    const codeBox = document.createElement('div');
    codeBox.className = 'macos-sheet-input-box';
    this.code.maxLength = 6;
    this.code.inputMode = 'numeric';
    this.code.pattern = '[0-9]{6}';
    codeBox.appendChild(this.code);

    this.send.type = 'button';
    this.send.id = 'btn-send-password-code';
    this.send.className = 'macos-push-btn secondary send-code-btn';
    this.send.textContent = '获取验证码';

    codeRow.appendChild(codeBox);
    codeRow.appendChild(this.send);
    codeField.appendChild(codeLabel);
    codeField.appendChild(codeRow);

    // 2. New Password
    const pwField = document.createElement('div');
    pwField.className = 'macos-sheet-field';
    const pwLabel = document.createElement('label');
    pwLabel.className = 'macos-sheet-field-label';
    pwLabel.htmlFor = this.password.id;
    pwLabel.textContent = '新密码';

    const pwBox = document.createElement('div');
    pwBox.className = 'macos-sheet-input-box';
    pwBox.appendChild(this.password);
    pwField.appendChild(pwLabel);
    pwField.appendChild(pwBox);

    // 3. Confirm Password
    const confirmField = document.createElement('div');
    confirmField.className = 'macos-sheet-field';
    const confirmLabel = document.createElement('label');
    confirmLabel.className = 'macos-sheet-field-label';
    confirmLabel.htmlFor = this.confirm.id;
    confirmLabel.textContent = '确认新密码';

    const confirmBox = document.createElement('div');
    confirmBox.className = 'macos-sheet-input-box';
    confirmBox.appendChild(this.confirm);
    confirmField.appendChild(confirmLabel);
    confirmField.appendChild(confirmBox);

    fieldsList.appendChild(codeField);
    fieldsList.appendChild(pwField);
    fieldsList.appendChild(confirmField);

    this.status.id = 'password-change-status';
    this.status.className = 'account-security-status hidden';
    this.status.setAttribute('role', 'status');
    this.status.setAttribute('aria-live', 'polite');

    const btnRow = document.createElement('div');
    btnRow.className = 'macos-sheet-btn-row';

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.id = 'btn-cancel-password';
    cancelBtn.className = 'macos-push-btn';
    cancelBtn.textContent = '取消';

    this.submit.type = 'submit';
    this.submit.id = 'btn-save-password';
    this.submit.className = 'macos-push-btn primary';
    this.submit.textContent = '修改密码';

    btnRow.appendChild(cancelBtn);
    btnRow.appendChild(this.submit);

    this.form.appendChild(fieldsList);
    this.form.appendChild(this.status);
    this.form.appendChild(btnRow);

    sheetCard.appendChild(sheetTitle);
    sheetCard.appendChild(sheetDesc);
    sheetCard.appendChild(this.form);
    this.sheetBackdrop.appendChild(sheetCard);

    // Keep sheetBackdrop in element initially so unit tests can query it:
    this.element.appendChild(this.sheetBackdrop);

    this.toggle.addEventListener('click', () => {
      if (this.isSheetOpen) this.close();
      else this.open();
    });
    cancelBtn.addEventListener('click', () => this.close());
    this.sheetBackdrop.addEventListener('click', (e) => {
      if (e.target === this.sheetBackdrop) this.close();
    });
    this.send.addEventListener('click', () => { void this.sendCode(); });
    this.form.addEventListener('submit', event => {
      event.preventDefault();
      void this.save();
    });
    this.sync();
  }

  public open(): void {
    if (this.isSheetOpen) return;
    this.isSheetOpen = true;
    this.toggle.setAttribute('aria-expanded', 'true');
    this.sheetBackdrop.classList.toggle('hidden', false);
    this.sheetBackdrop.removeAttribute?.('aria-hidden');
    this.onSheetStateChange?.(true);

    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => {
        this.sheetBackdrop.classList.toggle('sheet-visible', true);
        this.code.focus?.();
        try { this.code.select?.(); } catch {}
      });
    } else {
      this.sheetBackdrop.classList.toggle('sheet-visible', true);
      this.code.focus?.();
    }
  }

  public close(): void {
    if (!this.isSheetOpen) return;
    this.isSheetOpen = false;
    this.toggle.setAttribute('aria-expanded', 'false');
    this.sheetBackdrop.classList.toggle('sheet-visible', false);
    this.sheetBackdrop.setAttribute('aria-hidden', 'true');
    this.clearSecrets();
    this.show('');
    this.onSheetStateChange?.(false);

    setTimeout(() => {
      if (!this.isSheetOpen) {
        this.sheetBackdrop.classList.toggle('hidden', true);
      }
    }, 200);
  }

  public setExpanded(expanded: boolean): void {
    if (expanded) this.open();
    else this.close();
  }

  setActive(active: boolean): void {
    this.active = active;
    if (!active) {
      this.clearSecrets();
      if (this.isSheetOpen) this.close();
    }
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
    this.submit.textContent = this.saving ? '修改中…' : '修改密码';
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
      const response = await sendPasswordCode(this.user.id);
      if (this.isCurrent()) {
        this.retryAt = Date.now() + response.retryAfterSeconds * 1000;
        this.show('验证码已发送，请查收邮件');
      }
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
      this.close();
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
  control.className = 'account-name-field macos-sheet-input';
  control.placeholder = placeholder;
  control.setAttribute('autocomplete', autocomplete);
  control.required = true;
  return control;
}
