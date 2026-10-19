import { fetchMe, joinClass, logout, messageOf, restoreSession, updateClassName, updateDisplayName } from '../account/api.ts';
import { AuthPanel } from '../account/AuthPanel.ts';
import { formatInviteCode, normalizeInviteCode } from '../account/invite.ts';
import { clearSession, getUser, hasRefreshToken, readRefresh, subscribe, updateUser } from '../account/session.ts';
import { accountPreferences } from '../account/preferences.ts';
import type { AccountUser, ClassStudent } from '../account/types.ts';
import { AccountApiError } from '../account/types.ts';
import type { WhiteboardCanvas } from './WhiteboardCanvas';
import type { WhiteboardTheme } from './types';
import { blurActiveInput } from '../core/focus.ts';

const THEMES: { id: WhiteboardTheme; label: string; preview: string }[] = [
  { id: 'plain', label: '经典白板', preview: 'preview-plain' },
  { id: 'grid', label: '坐标网格', preview: 'preview-grid' },
  { id: 'chalkboard', label: '护眼墨绿', preview: 'preview-chalkboard' },
  { id: 'dark', label: '极客深空', preview: 'preview-dark' },
];

export function preloadAccountAssets(): void {
  if (typeof window === 'undefined' || typeof Image === 'undefined') return;
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = '/hologrip-logo.png';
    if (typeof img.decode === 'function') {
      img.decode().catch(() => {});
    }
  } catch {
    // 忽略在非浏览器或测试环境中的错误
  }
}

// 模块加载时尽早触发预热
preloadAccountAssets();

export class AccountModal {
  public element: HTMLDivElement;
  private canvas: WhiteboardCanvas;
  private isOpen = false;
  private authError = '';
  private card: HTMLDivElement;
  private body: HTMLDivElement;
  private titleEl: HTMLHeadingElement;
  private badgeEl: HTMLSpanElement;
  private needsRender = false;
  private lastRenderedUserId: string | null = null;
  private lastRenderedRole: string | null = null;
  private lastRenderedClassName: string | null = null;
  private lastRenderedError: string = '';

  constructor(canvas: WhiteboardCanvas, parent: HTMLElement = document.body) {
    this.canvas = canvas;
    this.buildShell(parent);
    this.bindShell();
    subscribe(() => {
      if (getUser()) this.authError = '';
      if (this.isOpen) {
        this.render();
      } else {
        this.needsRender = true;
      }
    });
    this.render();
    this.setInputsDisabled(true);
    preloadAccountAssets();
  }

  private setInputsDisabled(disabled: boolean): void {
    const inputs = this.element.querySelectorAll<HTMLInputElement | HTMLButtonElement | HTMLTextAreaElement>(
      'input, button, textarea'
    );
    inputs.forEach((el) => {
      if (el.id === 'account-modal-close-btn') {
        el.tabIndex = disabled ? -1 : 0;
        return;
      }
      el.disabled = disabled;
      el.tabIndex = disabled ? -1 : 0;
    });
  }

  private shouldRender(): boolean {
    const childrenCount = this.body?.children?.length ?? 0;
    if (childrenCount === 0) return true;
    const user = getUser();
    const userId = user?.id ?? null;
    const role = user?.role ?? null;
    const className = user?.class?.name ?? null;
    if (userId !== this.lastRenderedUserId) return true;
    if (role !== this.lastRenderedRole) return true;
    if (className !== this.lastRenderedClassName) return true;
    if (this.authError !== this.lastRenderedError) return true;
    return false;
  }

  public open(): void {
    this.isOpen = true;
    this.element.classList.add('open');
    this.element.removeAttribute?.('aria-hidden');
    this.element.removeAttribute?.('inert');
    (this.element as any).inert = false;
    this.setInputsDisabled(false);
    if (this.needsRender || this.shouldRender()) {
      this.render();
    }
    this.updateStats();
    if (getUser() || hasRefreshToken()) {
      void this.refreshFromServer();
    }
  }

  public close(): void {
    blurActiveInput(true);
    try {
      this.element.querySelectorAll('input, textarea').forEach((el) => (el as HTMLElement).blur?.());
    } catch {
      // 忽略错误
    }
    this.isOpen = false;
    this.element.classList.remove('open');
    this.element.setAttribute('aria-hidden', 'true');
    this.element.setAttribute('inert', '');
    (this.element as any).inert = true;
    this.setInputsDisabled(true);
  }

  public get visible(): boolean {
    return this.isOpen;
  }

  public updateStats(): void {
    const total = this.element.querySelector('#stat-handout-pages');
    if (total) total.textContent = `${this.canvas.getTotalPages()} 页`;
  }

  private async refreshFromServer(): Promise<void> {
    try {
      if (!getUser()) {
        const status = await restoreSession();
        if (!this.isOpen) return;
        this.authError = status === 'offline' ? '无法连接账户服务' : '';
        this.render();
        return;
      }
      const user = await fetchMe();
      if (!this.isOpen) return;
      updateUser(user);
    } catch (error) {
      if (!this.isOpen) return;
      if (error instanceof AccountApiError && error.status === 0) {
        this.showAccountError('无法连接账户服务');
      }
    }
  }

  private buildShell(parent: HTMLElement): void {
    this.element = document.createElement('div');
    this.element.className = 'apple-modal-backdrop';
    this.element.id = 'account-modal-backdrop';
    this.element.setAttribute('aria-hidden', 'true');
    this.element.setAttribute('inert', '');
    (this.element as any).inert = true;

    this.card = document.createElement('div');
    this.card.className = 'apple-modal-card';

    const header = document.createElement('div');
    header.className = 'modal-header-row';
    const group = document.createElement('div');
    group.className = 'modal-title-group';

    this.titleEl = document.createElement('h2');
    this.titleEl.className = 'modal-title';
    this.titleEl.id = 'account-modal-title';
    this.titleEl.textContent = '登录';

    this.badgeEl = document.createElement('span');
    this.badgeEl.className = 'modal-badge hidden';
    this.badgeEl.id = 'account-class-badge';

    group.appendChild(this.titleEl);
    group.appendChild(this.badgeEl);

    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'modal-close-btn';
    close.id = 'account-modal-close-btn';
    close.title = '关闭';
    close.innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;

    header.appendChild(group);
    header.appendChild(close);

    this.body = document.createElement('div');
    this.body.id = 'account-modal-body';
    this.body.className = 'account-modal-body';

    this.card.appendChild(header);
    this.card.appendChild(this.body);
    this.element.appendChild(this.card);
    parent.appendChild(this.element);
  }

  private bindShell(): void {
    this.element.querySelector('#account-modal-close-btn')?.addEventListener('click', () => this.close());
    this.element.addEventListener('click', (event) => {
      if (event && event.target === this.element) this.close();
    });
    window.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && this.isOpen) this.close();
    });
  }

  private render(): void {
    const user = getUser();
    this.lastRenderedUserId = user?.id ?? null;
    this.lastRenderedRole = user?.role ?? null;
    this.lastRenderedClassName = user?.class?.name ?? null;
    this.lastRenderedError = this.authError;
    this.needsRender = false;

    clearChildren(this.body);
    if (!user) {
      this.card.classList.add('auth-card-mode');
      this.titleEl.textContent = '登录';
      this.badgeEl.textContent = '';
      this.badgeEl.classList.add('hidden');
      const panel = new AuthPanel(this.authError, (mode) => {
        this.titleEl.textContent = mode === 'login' ? '登录' : '注册';
      });
      this.body.appendChild(panel.element);
      if (!this.isOpen) {
        this.setInputsDisabled(true);
      }
      return;
    }

    this.card.classList.remove('auth-card-mode');
    this.titleEl.textContent = '账户信息';
    const badge = user.class?.name ?? (user.role === 'student' ? '未加入班级' : '');
    this.badgeEl.textContent = badge;
    this.badgeEl.classList.toggle('hidden', badge.length === 0);
    this.renderAccount(user);
    this.updateStats();
    if (!this.isOpen) {
      this.setInputsDisabled(true);
    }
  }

  private renderAccount(user: AccountUser): void {
    const profile = document.createElement('div');
    profile.className = 'profile-card';
    profile.id = 'account-profile';

    const avatar = document.createElement('div');
    avatar.className = 'profile-avatar-wrapper';
    avatar.innerHTML = `<img src="/hologrip-logo.png" alt="User" class="profile-avatar-img" width="52" height="52" decoding="async" />`;
    profile.appendChild(avatar);

    const form = document.createElement('div');
    form.className = 'profile-form';

    const email = document.createElement('div');
    email.id = 'account-email';
    email.className = 'account-email';
    email.textContent = `${user.role === 'teacher' ? '老师' : '学生'} · ${user.email}`;
    form.appendChild(fieldRow('邮箱', email));

    const nameInput = document.createElement('input');
    nameInput.id = 'profile-input-name';
    nameInput.className = 'apple-profile-input';
    nameInput.type = 'text';
    nameInput.placeholder = '你的用户名';
    nameInput.setAttribute('autocomplete', 'nickname');
    nameInput.value = user.displayName ?? '';
    nameInput.addEventListener('blur', () => {
      void this.saveName(user, nameInput.value);
    });
    form.appendChild(fieldRow('用户名', nameInput));

    if (user.role === 'teacher' && user.class) {
      const classInput = document.createElement('input');
      classInput.id = 'profile-input-class';
      classInput.className = 'apple-profile-input';
      classInput.type = 'text';
      classInput.value = user.class.name;
      classInput.addEventListener('blur', () => {
        void this.saveClass(user, classInput.value);
      });
      form.appendChild(fieldRow('班级', classInput));
    } else if (user.class) {
      const className = document.createElement('div');
      className.id = 'class-name-readonly';
      className.className = 'account-readonly';
      className.textContent = user.class.name;
      form.appendChild(fieldRow('班级', className));
    }

    profile.appendChild(form);
    this.body.appendChild(profile);

    if (user.role === 'teacher' && user.class?.inviteCode) {
      this.body.appendChild(inviteBlock(user.class.inviteCode));
      this.body.appendChild(rosterBlock(user.class.students ?? []));
    }
    if (user.role === 'student' && !user.class) {
      this.body.appendChild(this.joinBlock());
    }

    const error = document.createElement('div');
    error.id = 'account-error';
    error.className = 'form-error hidden';
    this.body.appendChild(error);
    this.body.appendChild(this.whiteboardBlock());
    this.body.appendChild(this.logoutButton());
  }

  private joinBlock(): HTMLElement {
    const section = document.createElement('div');
    section.id = 'join-section';
    section.className = 'join-section';

    const title = document.createElement('div');
    title.className = 'account-section-title';
    title.textContent = '加入班级';
    const hint = document.createElement('p');
    hint.className = 'invite-hint';
    hint.textContent = '填写老师的邀请码后进入对应班级。';
    const input = document.createElement('input');
    input.id = 'join-invite-code';
    input.className = 'apple-profile-input';
    input.type = 'text';
    input.placeholder = '5 位字母数字';
    input.setAttribute('autocomplete', 'off');
    input.spellcheck = false;
    input.maxLength = 5;
    input.autocapitalize = 'characters';
    input.value = '';
    const button = document.createElement('button');
    button.type = 'button';
    button.id = 'btn-join-class';
    button.className = 'auth-submit';
    button.textContent = '加入班级';
    button.addEventListener('click', () => {
      void this.join(input, button);
    });

    section.appendChild(title);
    section.appendChild(hint);
    section.appendChild(input);
    section.appendChild(button);
    return section;
  }

  private whiteboardBlock(): HTMLElement {
    const wrap = document.createElement('div');
    wrap.className = 'account-whiteboard-block';

    const pageTitle = document.createElement('div');
    pageTitle.className = 'account-section-title';
    pageTitle.textContent = '白板讲义';
    const pages = document.createElement('div');
    pages.id = 'stat-handout-pages';
    pages.className = 'handout-stat';
    pages.textContent = `${this.canvas.getTotalPages()} 页`;
    wrap.appendChild(pageTitle);
    wrap.appendChild(pages);

    const themeTitle = document.createElement('div');
    themeTitle.className = 'account-section-title';
    themeTitle.textContent = '白板背景';
    const deck = document.createElement('div');
    deck.className = 'theme-selector-deck';
    deck.id = 'theme-selector-deck';
    const current = this.canvas.getTheme();
    for (const theme of THEMES) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'theme-card-btn';
      button.dataset.theme = theme.id;
      if (theme.id === current) button.classList.add('active');
      const preview = document.createElement('div');
      preview.className = `theme-preview-box ${theme.preview}`;
      const label = document.createElement('span');
      label.className = 'theme-label';
      label.textContent = theme.label;
      button.appendChild(preview);
      button.appendChild(label);
      button.addEventListener('click', () => {
        this.canvas.setTheme(theme.id);
        const buttons = this.element.querySelectorAll('.theme-card-btn');
        buttons.forEach((item) => {
          item.classList.toggle('active', (item as HTMLElement).dataset.theme === theme.id);
        });
      });
      deck.appendChild(button);
    }
    wrap.appendChild(themeTitle);
    wrap.appendChild(deck);

    return wrap;
  }

  private logoutButton(): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.id = 'btn-logout';
    button.className = 'apple-pill-action-btn secondary account-logout-btn';
    button.textContent = '退出登录';
    button.addEventListener('click', () => {
      const refresh = readRefresh();
      button.disabled = true;
      void accountPreferences().flush()
        .then(() => logout(refresh))
        .finally(() => clearSession());
    });
    return button;
  }

  private async saveName(user: AccountUser, raw: string): Promise<void> {
    const next = raw.trim();
    if (next === (user.displayName ?? '')) return;
    try {
      updateUser(await updateDisplayName(next));
    } catch (error) {
      this.showAccountError(messageOf(error));
    }
  }

  private async saveClass(user: AccountUser, raw: string): Promise<void> {
    const next = raw.trim();
    if (!user.class || next === user.class.name) return;
    if (!next || next.length > 64) {
      this.showAccountError('班级名需要 1 到 64 个字');
      return;
    }
    try {
      updateUser(await updateClassName(next));
    } catch (error) {
      this.showAccountError(messageOf(error));
    }
  }

  private async join(input: HTMLInputElement, button: HTMLButtonElement): Promise<void> {
    const raw = input.value.trim();
    if (!raw) {
      this.showAccountError('请填写邀请码');
      return;
    }
    if (!normalizeInviteCode(raw)) {
      this.showAccountError('邀请码格式不正确');
      return;
    }
    button.disabled = true;
    try {
      updateUser(await joinClass(raw));
    } catch (error) {
      this.showAccountError(messageOf(error));
      button.disabled = false;
    }
  }

  private showAccountError(message: string): void {
    this.lastRenderedError = message;
    const el = this.element.querySelector('#account-error');
    if (!el) return;
    el.textContent = message;
    el.classList.toggle('hidden', message.length === 0);
  }
}

function inviteBlock(code: string): HTMLElement {
  const section = document.createElement('div');
  section.id = 'invite-section';
  section.className = 'invite-section';
  const title = document.createElement('div');
  title.className = 'account-section-title';
  title.textContent = '班级邀请码';
  const row = document.createElement('div');
  row.className = 'invite-code-row';
  const value = document.createElement('div');
  value.id = 'invite-code-value';
  value.className = 'invite-code-value';
  value.textContent = formatInviteCode(code);
  const copy = document.createElement('button');
  copy.type = 'button';
  copy.id = 'btn-copy-invite';
  copy.className = 'apple-pill-action-btn secondary invite-copy-btn';
  copy.textContent = '复制';
  copy.addEventListener('click', () => {
    void copyInvite(formatInviteCode(code), copy);
  });
  const hint = document.createElement('p');
  hint.className = 'invite-hint';
  hint.textContent = '学生注册时填写这个邀请码，就会进入本班。';
  row.appendChild(value);
  row.appendChild(copy);
  section.appendChild(title);
  section.appendChild(row);
  section.appendChild(hint);
  return section;
}

async function copyInvite(text: string, button: HTMLButtonElement): Promise<void> {
  try {
    if (!navigator.clipboard?.writeText) throw new Error('clipboard unavailable');
    await navigator.clipboard.writeText(text);
    button.textContent = '已复制';
  } catch {
    button.textContent = '复制失败';
  }
}

function rosterBlock(students: ClassStudent[]): HTMLElement {
  const section = document.createElement('div');
  section.id = 'student-roster';
  section.className = 'roster-section';
  const title = document.createElement('div');
  title.className = 'account-section-title';
  title.textContent = '班级学生';
  section.appendChild(title);
  if (students.length === 0) {
    const empty = document.createElement('div');
    empty.id = 'roster-empty';
    empty.className = 'roster-empty';
    empty.textContent = '还没有学生加入';
    section.appendChild(empty);
    return section;
  }
  const list = document.createElement('div');
  list.className = 'roster-list';
  for (const student of students) {
    const row = document.createElement('div');
    row.className = 'roster-row';
    const name = document.createElement('span');
    name.className = 'roster-name';
    name.textContent = student.displayName?.trim() || student.email;
    row.appendChild(name);
    if (student.displayName?.trim()) {
      const email = document.createElement('span');
      email.className = 'roster-email';
      email.textContent = student.email;
      row.appendChild(email);
    }
    list.appendChild(row);
  }
  section.appendChild(list);
  return section;
}

function fieldRow(label: string, control: HTMLElement): HTMLDivElement {
  const row = document.createElement('div');
  row.className = 'profile-field-row';
  const caption = document.createElement('span');
  caption.className = 'field-label';
  caption.textContent = label;
  row.appendChild(caption);
  row.appendChild(control);
  return row;
}

function clearChildren(el: HTMLElement): void {
  const node = el as HTMLElement & { replaceChildren?: () => void; children?: ArrayLike<Node> };
  if (typeof node.replaceChildren === 'function') {
    node.replaceChildren();
    return;
  }
  const kids = node.children;
  if (!kids) return;
  const copy: Node[] = [];
  for (let i = 0; i < kids.length; i += 1) copy.push(kids[i]);
  for (const kid of copy) el.removeChild(kid);
}
