import { fetchMe, joinClass, logout, messageOf, restoreSession, updateClassName, updateDisplayName } from '../account/api.ts';
import { AuthPanel } from '../account/AuthPanel.ts';
import { PasswordChangePanel } from '../account/PasswordChangePanel.ts';
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
  private authNotice = '';
  private passwordPanel: PasswordChangePanel | null = null;
  private card: HTMLDivElement;
  private body: HTMLDivElement;
  private sheetContainer: HTMLDivElement;
  private titleEl: HTMLHeadingElement;
  private activeSheet: { close: () => void } | null = null;
  private needsRender = false;
  private lastRenderedUserId: string | null = null;
  private lastRenderedRole: string | null = null;
  private lastRenderedClassName: string | null = null;
  private lastRenderedDisplayName: string | null = null;
  private lastRenderedError: string = '';

  constructor(canvas: WhiteboardCanvas, parent: HTMLElement = document.body) {
    this.canvas = canvas;
    this.buildShell(parent);
    this.bindShell();
    const preferences = accountPreferences();
    const syncPreferences = () => {
      if (this.canvas.getTheme() !== preferences.whiteboardTheme) {
        this.canvas.setTheme(preferences.whiteboardTheme);
      }
      this.element.querySelectorAll<HTMLElement>('.theme-card-btn').forEach(button => {
        button.classList.toggle('active', button.dataset.theme === preferences.whiteboardTheme);
      });
      this.element.querySelectorAll<HTMLButtonElement>('.gallery-portrait-switch').forEach(button => {
        const shown = preferences.galleryPortraits;
        button.classList.toggle('on', shown);
        button.setAttribute('aria-checked', shown ? 'true' : 'false');
      });
      this.element.querySelectorAll<HTMLElement>('.gallery-palette-btn').forEach(button => {
        button.classList.toggle('active', button.dataset.palette === preferences.galleryPalette);
      });
    };
    preferences.subscribe(syncPreferences);
    syncPreferences();
    subscribe(() => {
      if (getUser()) { this.authError = ''; this.authNotice = ''; }
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
    this.passwordPanel?.setActive(!disabled);
  }

  private shouldRender(): boolean {
    const childrenCount = this.body?.children?.length ?? 0;
    if (childrenCount === 0) return true;
    const user = getUser();
    const userId = user?.id ?? null;
    const role = user?.role ?? null;
    const className = user?.class?.name ?? null;
    const displayName = user?.displayName ?? null;
    if (userId !== this.lastRenderedUserId) return true;
    if (role !== this.lastRenderedRole) return true;
    if (className !== this.lastRenderedClassName) return true;
    if (displayName !== this.lastRenderedDisplayName) return true;
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
    if (this.activeSheet) {
      this.activeSheet.close();
      this.activeSheet = null;
    }
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

    this.titleEl = document.createElement('h2');
    this.titleEl.className = 'modal-title';
    this.titleEl.id = 'account-modal-title';
    this.titleEl.textContent = '登录';

    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'modal-close-btn';
    close.id = 'account-modal-close-btn';
    close.title = '关闭';
    close.innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;

    header.appendChild(this.titleEl);
    header.appendChild(close);

    this.body = document.createElement('div');
    this.body.id = 'account-modal-body';
    this.body.className = 'account-modal-body';

    this.sheetContainer = document.createElement('div');
    this.sheetContainer.className = 'macos-sheets-host';

    this.card.appendChild(header);
    this.card.appendChild(this.body);
    this.card.appendChild(this.sheetContainer);
    this.element.appendChild(this.card);
    parent.appendChild(this.element);
  }

  private bindShell(): void {
    this.element.querySelector('#account-modal-close-btn')?.addEventListener('click', () => this.close());
    this.element.addEventListener('click', (event) => {
      if (event && event.target === this.element) this.close();
    });
    window.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && this.isOpen) {
        if (this.activeSheet) {
          this.activeSheet.close();
          this.activeSheet = null;
        } else {
          this.close();
        }
      }
    });
  }

  private render(): void {
    const user = getUser();
    if (this.passwordPanel && (this.passwordPanel.user.id !== user?.id || this.passwordPanel.user.email !== user?.email)) {
      this.passwordPanel.dispose();
      this.passwordPanel = null;
    }
    this.lastRenderedUserId = user?.id ?? null;
    this.lastRenderedRole = user?.role ?? null;
    this.lastRenderedClassName = user?.class?.name ?? null;
    this.lastRenderedDisplayName = user?.displayName ?? null;
    this.lastRenderedError = this.authError;
    this.needsRender = false;

    clearChildren(this.body);
    if (this.sheetContainer) {
      clearChildren(this.sheetContainer);
    }
    if (!user) {
      this.card.classList.add('auth-card-mode');
      this.titleEl.textContent = '登录';
      const panel = new AuthPanel(this.authError, (mode) => {
        this.titleEl.textContent = mode === 'login' ? '登录' : '注册';
      });
      if (this.authNotice) {
        const notice = document.createElement('p');
        notice.className = 'account-security-status';
        notice.dataset.state = 'success';
        notice.setAttribute('role', 'status');
        notice.textContent = this.authNotice;
        this.body.appendChild(notice);
      }
      this.body.appendChild(panel.element);
      if (!this.isOpen) {
        this.setInputsDisabled(true);
      }
      return;
    }

    this.card.classList.remove('auth-card-mode');
    this.titleEl.textContent = '账户信息';
    this.renderAccount(user);
    this.updateStats();
    if (!this.isOpen) {
      this.setInputsDisabled(true);
    }
  }

  private renderAccount(user: AccountUser): void {
    const profile = document.createElement('div');
    profile.className = 'profile-card apple-id-hero';
    profile.id = 'account-profile';

    const avatar = document.createElement('div');
    avatar.className = 'profile-avatar-wrapper';
    avatar.innerHTML = `<img src="/hologrip-logo.png" alt="User" class="profile-avatar-img" width="56" height="56" decoding="async" />`;
    profile.appendChild(avatar);

    const meta = document.createElement('div');
    meta.className = 'apple-id-meta';

    const nameRow = document.createElement('div');
    nameRow.className = 'apple-id-name-row';

    const displayName = document.createElement('div');
    displayName.className = 'apple-id-display-name';
    displayName.textContent = user.displayName?.trim() || '未设置用户名';

    const roleBadge = document.createElement('span');
    roleBadge.className = `apple-role-pill ${user.role}`;
    roleBadge.textContent = user.role === 'teacher' ? '教师' : '学生';

    nameRow.appendChild(displayName);
    nameRow.appendChild(roleBadge);

    const email = document.createElement('div');
    email.id = 'account-email';
    email.className = 'account-email apple-id-email';
    email.textContent = user.email;

    meta.appendChild(nameRow);
    meta.appendChild(email);
    profile.appendChild(meta);

    const personalSection = document.createElement('div');
    personalSection.className = 'apple-settings-section';

    const personalTitle = document.createElement('div');
    personalTitle.className = 'apple-section-header';
    personalTitle.textContent = '个人信息';
    personalSection.appendChild(personalTitle);

    const personalGroup = document.createElement('div');
    personalGroup.className = 'apple-settings-group';

    // 1. 姓名行：左侧「姓名」，右侧「[displayName] >」
    const nameRowEl = document.createElement('div');
    nameRowEl.className = 'apple-settings-row macos-action-row';
    nameRowEl.id = 'row-profile-name';
    nameRowEl.setAttribute('role', 'button');
    nameRowEl.setAttribute('tabindex', '0');
    nameRowEl.title = '点击修改姓名';

    const nameLabel = document.createElement('span');
    nameLabel.className = 'apple-row-label';
    nameLabel.textContent = '姓名';

    const nameRight = document.createElement('div');
    nameRight.className = 'macos-row-right';

    const nameValue = document.createElement('span');
    nameValue.className = 'macos-row-value';
    if (!user.displayName?.trim()) {
      nameValue.classList.add('placeholder');
      nameValue.textContent = '未设置';
    } else {
      nameValue.textContent = user.displayName.trim();
    }

    const nameChevron = createChevronElement();

    nameRight.appendChild(nameValue);
    nameRight.appendChild(nameChevron);
    nameRowEl.appendChild(nameLabel);
    nameRowEl.appendChild(nameRight);

    personalGroup.appendChild(nameRowEl);

    const nameSheet = this.createMacosSheet({
      title: '姓名',
      description: '输入将在白板协作与班级中展示的用户名。',
      inputId: 'profile-input-name',
      initialValue: user.displayName ?? '',
      placeholder: '输入用户名',
      onSave: (val) => this.saveName(user, val),
    });
    this.sheetContainer.appendChild(nameSheet.element);

    nameRowEl.addEventListener('click', () => {
      nameSheet.open();
    });
    nameRowEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        nameSheet.open();
      }
    });

    // 2. 班级行
    if (user.role === 'teacher') {
      const classRowEl = document.createElement('div');
      classRowEl.className = 'apple-settings-row macos-action-row';
      classRowEl.id = 'row-profile-class';
      classRowEl.setAttribute('role', 'button');
      classRowEl.setAttribute('tabindex', '0');
      classRowEl.title = '点击修改班级名称';

      const classLabel = document.createElement('span');
      classLabel.className = 'apple-row-label';
      classLabel.textContent = '班级名称';

      const classRight = document.createElement('div');
      classRight.className = 'macos-row-right';

      const classValue = document.createElement('span');
      classValue.className = 'macos-row-value';
      classValue.textContent = user.class?.name || '示范教学班';

      const classChevron = createChevronElement();

      classRight.appendChild(classValue);
      classRight.appendChild(classChevron);
      classRowEl.appendChild(classLabel);
      classRowEl.appendChild(classRight);

      personalGroup.appendChild(classRowEl);

      const classSheet = this.createMacosSheet({
        title: '班级名称',
        description: '教师可修改班级全称，方便学生辨认与加入。',
        inputId: 'profile-input-class',
        initialValue: user.class?.name || (user.class ? '' : '示范教学班'),
        placeholder: '填写班级名称',
        onSave: (val) => this.saveClass(user, val),
      });
      this.sheetContainer.appendChild(classSheet.element);

      classRowEl.addEventListener('click', () => {
        classSheet.open();
      });
      classRowEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          classSheet.open();
        }
      });
    } else if (user.class) {
      const classRowEl = document.createElement('div');
      classRowEl.className = 'apple-settings-row';
      classRowEl.id = 'row-student-class';

      const classLabel = document.createElement('span');
      classLabel.className = 'apple-row-label';
      classLabel.textContent = '所属班级';

      const classRight = document.createElement('div');
      classRight.className = 'macos-row-right';

      const classValue = document.createElement('span');
      classValue.id = 'class-name-readonly';
      classValue.className = 'account-readonly macos-row-value';
      classValue.textContent = user.class.name;

      classRight.appendChild(classValue);
      classRowEl.appendChild(classLabel);
      classRowEl.appendChild(classRight);

      personalGroup.appendChild(classRowEl);
    }

    // 3. 绑定邮箱行 (只读，无 >，无锁 emoji)
    const emailRowEl = document.createElement('div');
    emailRowEl.className = 'apple-settings-row';
    emailRowEl.id = 'row-profile-email';

    const emailLabel = document.createElement('span');
    emailLabel.className = 'apple-row-label';
    emailLabel.textContent = '绑定邮箱';

    const emailRight = document.createElement('div');
    emailRight.className = 'macos-row-right';

    const emailValue = document.createElement('span');
    emailValue.className = 'account-readonly macos-row-value';
    emailValue.textContent = user.email;

    emailRight.appendChild(emailValue);
    emailRowEl.appendChild(emailLabel);
    emailRowEl.appendChild(emailRight);

    personalGroup.appendChild(emailRowEl);
    personalSection.appendChild(personalGroup);

    this.body.appendChild(profile);
    this.body.appendChild(personalSection);

    if (user.role === 'teacher') {
      const code = user.class?.inviteCode || 'A8K9P';
      this.body.appendChild(inviteBlock(code));
      this.body.appendChild(rosterBlock(user.class?.students ?? []));
    }
    if (user.role === 'student' && !user.class) {
      this.body.appendChild(this.joinBlock());
    }

    this.body.appendChild(this.galleryBlock());
    this.body.appendChild(this.whiteboardBlock());

    const error = document.createElement('div');
    error.id = 'account-error';
    error.className = 'form-error hidden';
    this.body.appendChild(error);

    if (!this.passwordPanel) {
      this.passwordPanel = new PasswordChangePanel(user, () => {
        this.authNotice = '密码已修改，请使用新密码重新登录。';
        clearSession();
      });
    }
    this.passwordPanel.onSheetStateChange = (isOpen) => {
      this.activeSheet = isOpen ? this.passwordPanel : null;
    };

    this.body.appendChild(this.passwordPanel.element);
    this.sheetContainer.appendChild(this.passwordPanel.sheetElement);
    this.passwordPanel.setActive(this.isOpen);

    this.body.appendChild(this.logoutButton());
  }

  private createMacosSheet(options: {
    title: string;
    description: string;
    inputId: string;
    initialValue: string;
    placeholder: string;
    onSave: (value: string) => Promise<void> | void;
  }): {
    element: HTMLElement;
    input: HTMLInputElement;
    open: () => void;
    close: () => void;
  } {
    const backdrop = document.createElement('div');
    backdrop.className = 'macos-sheet-backdrop hidden';
    backdrop.setAttribute('aria-hidden', 'true');

    const card = document.createElement('div');
    card.className = 'macos-sheet-card';

    const title = document.createElement('h3');
    title.className = 'macos-sheet-title';
    title.textContent = options.title;

    const desc = document.createElement('p');
    desc.className = 'macos-sheet-desc';
    desc.textContent = options.description;

    const inputBox = document.createElement('div');
    inputBox.className = 'macos-sheet-input-box';

    const input = document.createElement('input');
    input.id = options.inputId;
    input.className = 'account-name-field macos-sheet-input';
    input.type = 'text';
    input.placeholder = options.placeholder;
    input.value = options.initialValue;

    inputBox.appendChild(input);

    const btnRow = document.createElement('div');
    btnRow.className = 'macos-sheet-btn-row';

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'macos-push-btn';
    cancelBtn.textContent = '取消';

    const saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.className = 'macos-push-btn primary';
    saveBtn.textContent = '存储';

    btnRow.appendChild(cancelBtn);
    btnRow.appendChild(saveBtn);

    card.appendChild(title);
    card.appendChild(desc);
    card.appendChild(inputBox);
    card.appendChild(btnRow);
    backdrop.appendChild(card);

    let isSheetOpen = false;

    const sheetObj = {
      element: backdrop,
      input,
      open: () => {
        isSheetOpen = true;
        this.activeSheet = sheetObj;
        input.value = options.initialValue;
        backdrop.classList.remove('hidden');
        backdrop.removeAttribute('aria-hidden');
        if (typeof requestAnimationFrame === 'function') {
          requestAnimationFrame(() => {
            backdrop.classList.add('sheet-visible');
            input.focus?.();
            try { input.select?.(); } catch {}
          });
        } else {
          backdrop.classList.add('sheet-visible');
          input.focus?.();
        }
      },
      close: () => {
        if (!isSheetOpen) return;
        isSheetOpen = false;
        if (this.activeSheet === sheetObj) {
          this.activeSheet = null;
        }
        backdrop.classList.remove('sheet-visible');
        backdrop.setAttribute('aria-hidden', 'true');
        setTimeout(() => {
          if (!isSheetOpen) backdrop.classList.add('hidden');
        }, 200);
      },
    };

    const doSave = async () => {
      const val = input.value.trim();
      saveBtn.disabled = true;
      try {
        await options.onSave(val);
        sheetObj.close();
      } finally {
        saveBtn.disabled = false;
      }
    };

    cancelBtn.addEventListener('click', () => sheetObj.close());
    saveBtn.addEventListener('click', () => { void doSave(); });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        void doSave();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        sheetObj.close();
      }
    });

    input.addEventListener('blur', () => {
      void options.onSave(input.value);
    });

    backdrop.addEventListener('click', (e) => {
      if (e && e.target === backdrop) sheetObj.close();
    });

    return sheetObj;
  }

  private joinBlock(): HTMLElement {
    const section = document.createElement('div');
    section.id = 'join-section';
    section.className = 'join-section apple-settings-section';

    const title = document.createElement('div');
    title.className = 'apple-section-header';
    title.textContent = '加入班级';
    section.appendChild(title);

    const group = document.createElement('div');
    group.className = 'apple-settings-group';

    const row = document.createElement('div');
    row.className = 'apple-settings-row join-row';

    const labelWrap = document.createElement('div');
    labelWrap.className = 'apple-row-info';
    const label = document.createElement('span');
    label.className = 'apple-row-label';
    label.textContent = '班级邀请码';
    const hint = document.createElement('span');
    hint.className = 'invite-hint';
    hint.textContent = '填写老师的 5 位邀请码进入班级';
    labelWrap.appendChild(label);
    labelWrap.appendChild(hint);

    const inputWrap = document.createElement('div');
    inputWrap.className = 'join-action-wrap';

    const input = document.createElement('input');
    input.id = 'join-invite-code';
    input.className = 'apple-profile-input join-input';
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
    button.className = 'apple-cell-action-btn primary';
    button.textContent = '加入班级';
    button.addEventListener('click', () => {
      void this.join(input, button);
    });

    inputWrap.appendChild(input);
    inputWrap.appendChild(button);

    row.appendChild(labelWrap);
    row.appendChild(inputWrap);
    group.appendChild(row);
    section.appendChild(group);
    return section;
  }

  private galleryBlock(): HTMLElement {
    const wrap = document.createElement('div');
    wrap.className = 'account-gallery-block apple-settings-section';

    const title = document.createElement('div');
    title.className = 'apple-section-header';
    title.textContent = '实验室';
    wrap.appendChild(title);

    const group = document.createElement('div');
    group.className = 'apple-settings-group';

    const row = document.createElement('div');
    row.className = 'apple-settings-row';

    const info = document.createElement('div');
    info.className = 'apple-row-info';
    const label = document.createElement('span');
    label.className = 'apple-row-label';
    label.textContent = '墙上肖像';
    const hint = document.createElement('span');
    hint.className = 'macos-row-subhint';
    hint.textContent = '隔一格悬挂物理学家与化学家';
    info.appendChild(label);
    info.appendChild(hint);

    const preferences = accountPreferences();
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'gallery-portrait-switch';
    toggle.setAttribute('role', 'switch');
    toggle.setAttribute('aria-label', '显示墙上肖像');
    const shown = preferences.galleryPortraits;
    toggle.classList.toggle('on', shown);
    toggle.setAttribute('aria-checked', shown ? 'true' : 'false');
    const knob = document.createElement('span');
    knob.className = 'gallery-switch-knob';
    toggle.appendChild(knob);
    toggle.addEventListener('click', () => {
      accountPreferences().setGalleryPortraits(!accountPreferences().galleryPortraits);
    });

    row.appendChild(info);
    row.appendChild(toggle);
    group.appendChild(row);
    wrap.appendChild(group);

    const paletteTitle = document.createElement('div');
    paletteTitle.className = 'apple-section-header';
    paletteTitle.textContent = '实验室配色';
    wrap.appendChild(paletteTitle);

    const paletteGroup = document.createElement('div');
    paletteGroup.className = 'apple-settings-group theme-group-card';
    const deck = document.createElement('div');
    deck.className = 'theme-selector-deck gallery-palette-deck';
    const palettes: { id: 'warm' | 'glacier'; label: string; preview: string }[] = [
      { id: 'warm', label: '暖石灰', preview: 'preview-warm' },
      { id: 'glacier', label: '霜青', preview: 'preview-glacier' },
    ];
    const current = preferences.galleryPalette;
    for (const palette of palettes) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'theme-card-btn gallery-palette-btn';
      button.dataset.palette = palette.id;
      if (palette.id === current) button.classList.add('active');
      const preview = document.createElement('div');
      preview.className = `theme-preview-box ${palette.preview}`;
      const name = document.createElement('span');
      name.className = 'theme-label';
      name.textContent = palette.label;
      button.appendChild(preview);
      button.appendChild(name);
      button.addEventListener('click', () => {
        accountPreferences().setGalleryPalette(palette.id);
      });
      deck.appendChild(button);
    }
    paletteGroup.appendChild(deck);
    wrap.appendChild(paletteGroup);
    return wrap;
  }

  private whiteboardBlock(): HTMLElement {
    const wrap = document.createElement('div');
    wrap.className = 'account-whiteboard-block apple-settings-section';

    const themeTitle = document.createElement('div');
    themeTitle.className = 'apple-section-header';
    themeTitle.textContent = '白板背景';
    wrap.appendChild(themeTitle);

    const group = document.createElement('div');
    group.className = 'apple-settings-group theme-group-card';

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
        accountPreferences().setWhiteboardTheme(theme.id);
        const buttons = this.element.querySelectorAll('.theme-card-btn');
        buttons.forEach((item) => {
          item.classList.toggle('active', (item as HTMLElement).dataset.theme === theme.id);
        });
      });
      deck.appendChild(button);
    }
    group.appendChild(deck);
    wrap.appendChild(group);

    return wrap;
  }

  private logoutButton(): HTMLElement {
    const wrap = document.createElement('div');
    wrap.className = 'apple-settings-section logout-section';

    const group = document.createElement('div');
    group.className = 'apple-settings-group';

    const button = document.createElement('button');
    button.type = 'button';
    button.id = 'btn-logout';
    button.className = 'apple-logout-btn';
    button.textContent = '退出登录';
    button.addEventListener('click', () => {
      const refresh = readRefresh();
      button.disabled = true;
      void accountPreferences().flush()
        .then(() => logout(refresh))
        .finally(() => clearSession());
    });

    group.appendChild(button);
    wrap.appendChild(group);
    return wrap;
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
  section.className = 'invite-section apple-settings-section';

  const title = document.createElement('div');
  title.className = 'apple-section-header';
  title.textContent = '班级邀请码';
  section.appendChild(title);

  const group = document.createElement('div');
  group.className = 'apple-settings-group';

  const row = document.createElement('div');
  row.className = 'invite-code-row';

  const labelWrap = document.createElement('div');
  labelWrap.className = 'apple-row-info';

  const label = document.createElement('span');
  label.className = 'apple-row-label';
  label.textContent = '邀请码';

  const hint = document.createElement('span');
  hint.className = 'invite-hint';
  hint.textContent = '学生注册或入班时填写';

  labelWrap.appendChild(label);
  labelWrap.appendChild(hint);

  const actionWrap = document.createElement('div');
  actionWrap.className = 'invite-action-wrap';

  const value = document.createElement('div');
  value.id = 'invite-code-value';
  value.className = 'invite-code-value';
  value.textContent = formatInviteCode(code);

  const copy = document.createElement('button');
  copy.type = 'button';
  copy.id = 'btn-copy-invite';
  copy.className = 'apple-cell-action-btn invite-copy-btn';
  copy.textContent = '复制';
  copy.addEventListener('click', () => {
    void copyInvite(formatInviteCode(code), copy);
  });

  actionWrap.appendChild(value);
  actionWrap.appendChild(copy);

  row.appendChild(labelWrap);
  row.appendChild(actionWrap);
  group.appendChild(row);
  section.appendChild(group);

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
  section.className = 'roster-section apple-settings-section';

  const title = document.createElement('div');
  title.className = 'apple-section-header';
  title.textContent = `班级学生 (${students.length}人)`;
  section.appendChild(title);

  const group = document.createElement('div');
  group.className = 'apple-settings-group';

  if (students.length === 0) {
    const empty = document.createElement('div');
    empty.id = 'roster-empty';
    empty.className = 'roster-empty';
    empty.textContent = '还没有学生加入';
    group.appendChild(empty);
    section.appendChild(group);
    return section;
  }

  const list = document.createElement('div');
  list.className = 'roster-list';
  for (const student of students) {
    const row = document.createElement('div');
    row.className = 'roster-row';

    const left = document.createElement('div');
    left.className = 'roster-student-left';

    const initial = document.createElement('div');
    initial.className = 'roster-student-avatar';
    const displayName = student.displayName?.trim() || student.email;
    initial.textContent = displayName.charAt(0).toUpperCase();

    const name = document.createElement('span');
    name.className = 'roster-name';
    name.textContent = displayName;

    left.appendChild(initial);
    left.appendChild(name);
    row.appendChild(left);

    if (student.displayName?.trim()) {
      const email = document.createElement('span');
      email.className = 'roster-email';
      email.textContent = student.email;
      row.appendChild(email);
    }

    list.appendChild(row);
  }
  group.appendChild(list);
  section.appendChild(group);
  return section;
}

function createChevronElement(): HTMLElement {
  const span = document.createElement('span');
  span.className = 'macos-chevron-wrap';
  span.setAttribute('aria-hidden', 'true');
  span.innerHTML = `<svg class="macos-chevron" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>`;
  return span;
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
