import { login, messageOf, register } from './api.ts';
import { normalizeInviteCode } from './invite.ts';
import { setSession } from './session.ts';
import type { AccountRole } from './types.ts';

type AuthMode = 'login' | 'register';

export class AuthPanel {
  readonly element: HTMLDivElement;
  private mode: AuthMode = 'login';
  private role: AccountRole = 'teacher';
  private busy = false;

  private readonly heroEl: HTMLDivElement;
  private readonly tabsEl: HTMLDivElement;
  private readonly tabsGlider: HTMLDivElement;
  private readonly loginTab: HTMLButtonElement;
  private readonly registerTab: HTMLButtonElement;
  private readonly roleRow: HTMLDivElement;
  private readonly roleSwitch: HTMLDivElement;
  private readonly roleGlider: HTMLDivElement;
  private readonly teacherBtn: HTMLButtonElement;
  private readonly studentBtn: HTMLButtonElement;
  private readonly nameField: HTMLDivElement;
  private readonly classField: HTMLDivElement;
  private readonly confirmField: HTMLDivElement;
  private readonly inviteField: HTMLDivElement;
  private readonly nameInput: HTMLInputElement;
  private readonly emailInput: HTMLInputElement;
  private readonly passwordInput: HTMLInputElement;
  private readonly confirmInput: HTMLInputElement;
  private readonly classInput: HTMLInputElement;
  private readonly inviteInput: HTMLInputElement;
  private readonly errorEl: HTMLDivElement;
  private readonly submitBtn: HTMLButtonElement;
  private readonly submitBtnText: HTMLSpanElement;
  private readonly onMode: (mode: AuthMode) => void;

  constructor(initialError: string, onMode: (mode: AuthMode) => void) {
    this.onMode = onMode;
    this.element = document.createElement('div');
    this.element.id = 'auth-panel';
    this.element.className = 'auth-panel';

    // 1. HoloGrip 头部品牌 Logo
    this.heroEl = document.createElement('div');
    this.heroEl.className = 'auth-hero';
    this.heroEl.innerHTML = `
      <div class="auth-hero-logo">
        <img src="/hologrip-logo.png" alt="HoloGrip" class="auth-hero-img" />
      </div>
      <h1 class="auth-hero-brand">HoloGrip</h1>
    `;

    // 2. 分段控制器（登录 / 注册）
    this.loginTab = tabButton('auth-tab-login', '登录');
    this.registerTab = tabButton('auth-tab-register', '注册');
    this.tabsGlider = document.createElement('div');
    this.tabsGlider.className = 'auth-segment-glider';

    this.tabsEl = document.createElement('div');
    this.tabsEl.className = 'auth-segment auth-mode-segment';
    this.tabsEl.appendChild(this.tabsGlider);
    this.tabsEl.appendChild(this.loginTab);
    this.tabsEl.appendChild(this.registerTab);

    // 3. 身份角色选择行（老师 / 学生）
    this.teacherBtn = tabButton('role-teacher', '老师');
    this.studentBtn = tabButton('role-student', '学生');
    this.roleGlider = document.createElement('div');
    this.roleGlider.className = 'auth-segment-glider';

    this.roleSwitch = document.createElement('div');
    this.roleSwitch.id = 'register-role-switch';
    this.roleSwitch.className = 'auth-segment auth-role-segment';
    this.roleSwitch.appendChild(this.roleGlider);
    this.roleSwitch.appendChild(this.teacherBtn);
    this.roleSwitch.appendChild(this.studentBtn);

    this.roleRow = document.createElement('div');
    this.roleRow.id = 'auth-role-row';
    this.roleRow.className = 'auth-role-row';
    const roleLabel = document.createElement('span');
    roleLabel.className = 'auth-role-label';
    roleLabel.textContent = '账户身份';
    this.roleRow.appendChild(roleLabel);
    this.roleRow.appendChild(this.roleSwitch);

    // 4. 表单输入字段与分组卡片
    this.nameInput = textInput('auth-display-name', 'text', '你的用户名', 'nickname');
    this.nameInput.maxLength = 64;
    this.emailInput = textInput('auth-email', 'email', 'name@school.edu', 'username');
    this.passwordInput = textInput('auth-password', 'password', '至少 8 位', 'current-password');
    this.confirmInput = textInput('auth-confirm', 'password', '再次输入密码', 'new-password');
    this.classInput = textInput('auth-class-name', 'text', '例如：高二 (3) 班', 'organization');
    this.inviteInput = textInput('auth-invite', 'text', '选填，5 位字母数字', 'off');
    this.inviteInput.spellcheck = false;
    this.inviteInput.maxLength = 5;
    this.inviteInput.autocapitalize = 'characters';

    this.nameField = labeledField('field-display-name', '用户名', this.nameInput);
    this.classField = labeledField('field-class-name', '班级', this.classInput);
    this.confirmField = labeledField('field-confirm-password', '确认密码', this.confirmInput);
    this.inviteField = labeledField('field-invite-code', '邀请码', this.inviteInput);

    const inputGroup = document.createElement('div');
    inputGroup.className = 'auth-input-group';
    inputGroup.appendChild(this.nameField);
    inputGroup.appendChild(labeledField('field-email', '邮箱', this.emailInput));
    inputGroup.appendChild(labeledField('field-password', '密码', this.passwordInput));
    inputGroup.appendChild(this.confirmField);
    inputGroup.appendChild(this.classField);
    inputGroup.appendChild(this.inviteField);

    this.errorEl = document.createElement('div');
    this.errorEl.id = 'auth-error';
    this.errorEl.className = 'form-error hidden';

    this.submitBtn = document.createElement('button');
    this.submitBtn.id = 'auth-submit';
    this.submitBtn.className = 'auth-submit';
    this.submitBtn.type = 'submit';
    this.submitBtnText = document.createElement('span');
    this.submitBtnText.className = 'auth-submit-label';
    this.submitBtnText.textContent = '登录';
    this.submitBtn.appendChild(this.submitBtnText);

    const form = document.createElement('form');
    form.id = 'auth-form';
    form.className = 'auth-form';
    form.appendChild(inputGroup);
    form.appendChild(this.errorEl);
    form.appendChild(this.submitBtn);

    this.element.appendChild(this.heroEl);
    this.element.appendChild(this.tabsEl);
    this.element.appendChild(this.roleRow);
    this.element.appendChild(form);

    this.loginTab.addEventListener('click', () => this.setMode('login'));
    this.registerTab.addEventListener('click', () => this.setMode('register'));
    this.teacherBtn.addEventListener('click', () => this.setRole('teacher'));
    this.studentBtn.addEventListener('click', () => this.setRole('student'));

    const clearErr = () => {
      if (!this.errorEl.classList.contains('hidden')) {
        this.showError('');
      }
    };
    this.nameInput.addEventListener('input', clearErr);
    this.emailInput.addEventListener('input', clearErr);
    this.passwordInput.addEventListener('input', clearErr);
    this.confirmInput.addEventListener('input', clearErr);
    this.classInput.addEventListener('input', clearErr);
    this.inviteInput.addEventListener('input', clearErr);

    form.addEventListener('submit', (event) => {
      if (event && typeof event.preventDefault === 'function') event.preventDefault();
      void this.submit();
    });

    this.apply();
    this.onMode(this.mode);
    if (initialError) this.showError(initialError);
  }

  private setMode(mode: AuthMode): void {
    if (this.mode === mode) return;
    this.mode = mode;
    this.passwordInput.setAttribute('autocomplete', mode === 'login' ? 'current-password' : 'new-password');
    if (!this.errorEl.classList.contains('hidden')) {
      this.showError('');
    }
    this.apply();
    this.onMode(mode);
  }

  private setRole(role: AccountRole): void {
    if (this.role === role) return;
    this.role = role;
    this.apply();
  }

  private apply(): void {
    const register = this.mode === 'register';
    this.tabsEl.setAttribute('data-index', register ? '1' : '0');
    this.roleSwitch.setAttribute('data-index', this.role === 'teacher' ? '0' : '1');
    this.element.setAttribute('data-mode', this.mode);
    this.element.setAttribute('data-role', this.role);

    this.roleSwitch.classList.toggle('hidden', !register);
    this.roleRow.classList.toggle('hidden', !register);
    this.nameField.classList.toggle('hidden', !register);
    this.confirmField.classList.toggle('hidden', !register);
    this.classField.classList.toggle('hidden', !(register && this.role === 'teacher'));
    this.inviteField.classList.toggle('hidden', !(register && this.role === 'student'));
    this.loginTab.classList.toggle('active', this.mode === 'login');
    this.registerTab.classList.toggle('active', register);
    this.teacherBtn.classList.toggle('active', this.role === 'teacher');
    this.studentBtn.classList.toggle('active', this.role === 'student');

    const targetText = register ? '注册' : '登录';
    if (this.submitBtnText) {
      if (this.submitBtnText.textContent !== targetText) {
        this.submitBtnText.classList.add('swapping');
        setTimeout(() => {
          this.submitBtnText.textContent = targetText;
          this.submitBtnText.classList.remove('swapping');
        }, 90);
      }
    } else {
      this.submitBtn.textContent = targetText;
    }
  }

  private showError(message: string): void {
    this.errorEl.textContent = message;
    this.errorEl.classList.toggle('hidden', message.length === 0);
    if (message.length > 0) {
      this.triggerShake();
    }
  }

  private triggerShake(): void {
    this.element.classList.remove('auth-shake');
    try {
      void (this.element as HTMLElement).offsetWidth;
    } catch {
      // 测试环境兼容
    }
    this.element.classList.add('auth-shake');
  }

  private async submit(): Promise<void> {
    if (this.busy) return;
    const email = this.emailInput.value.trim();
    const password = this.passwordInput.value;
    const displayName = this.nameInput.value.trim();
    if (this.mode === 'register' && !displayName) {
      this.showError('请填写用户名');
      return;
    }
    if (this.mode === 'register' && displayName.length > 64) {
      this.showError('用户名不能超过 64 个字');
      return;
    }
    if (!looksLikeEmail(email)) {
      this.showError('请输入有效邮箱');
      return;
    }
    if (password.length < 8) {
      this.showError('密码至少 8 位');
      return;
    }
    if (this.mode === 'register' && this.confirmInput.value !== password) {
      this.showError('两次输入的密码不一致');
      return;
    }
    if (this.mode === 'register' && this.role === 'teacher' && !this.classInput.value.trim()) {
      this.showError('请填写班级名');
      return;
    }
    if (this.mode === 'register' && this.role === 'student' && this.inviteInput.value.trim()) {
      if (!normalizeInviteCode(this.inviteInput.value)) {
        this.showError('邀请码格式不正确');
        return;
      }
    }

    this.busy = true;
    this.submitBtn.disabled = true;
    this.submitBtn.classList.add('loading');
    this.showError('');
    try {
      const result = this.mode === 'login'
        ? await login(email, password)
        : await register({
            role: this.role,
            email,
            password,
            displayName,
            className: this.classInput.value.trim(),
            inviteCode: this.inviteInput.value.trim(),
          });
      setSession(result);
    } catch (error) {
      this.showError(messageOf(error));
    } finally {
      this.busy = false;
      this.submitBtn.disabled = false;
      this.submitBtn.classList.remove('loading');
    }
  }
}

function tabButton(id: string, label: string): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.id = id;
  button.className = 'auth-segment-btn';
  button.textContent = label;
  return button;
}

function textInput(id: string, type: string, placeholder: string, autocomplete: string): HTMLInputElement {
  const input = document.createElement('input');
  input.id = id;
  input.className = 'apple-profile-input';
  input.type = type;
  input.placeholder = placeholder;
  input.setAttribute('autocomplete', autocomplete);
  input.value = '';
  return input;
}

function labeledField(id: string, label: string, input: HTMLInputElement): HTMLDivElement {
  const field = document.createElement('div');
  field.id = id;
  field.className = 'auth-field';
  const caption = document.createElement('label');
  caption.className = 'auth-field-label';
  caption.htmlFor = input.id;
  caption.textContent = label;
  field.appendChild(caption);
  field.appendChild(input);
  return field;
}

function looksLikeEmail(email: string): boolean {
  const at = email.indexOf('@');
  return at > 0 && email.indexOf('.', at + 2) > at + 1 && !/\s/.test(email);
}
