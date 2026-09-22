import type { WhiteboardCanvas } from './WhiteboardCanvas';
import type { TeacherProfile, WhiteboardTheme } from './types';

export class AccountModal {
  public element: HTMLDivElement;
  private canvas: WhiteboardCanvas;
  private isOpen = false;

  private profile: TeacherProfile = {
    name: '全息教辅示范组 · 授课讲师',
    title: '物理 & 化学数字化实验教研组',
    institution: '国家级数字化全息教育创新联合体',
    teachingHours: 64,
    totalExperimentsRun: 28,
    handoutPagesCount: 1,
    verifiedStatus: 'VIP 认证特级教师席位',
  };

  private themeButtons: HTMLButtonElement[] = [];

  constructor(canvas: WhiteboardCanvas, parent: HTMLElement = document.body) {
    this.canvas = canvas;
    this.initUI(parent);
    this.bindEvents();
  }

  private initUI(parent: HTMLElement): void {
    this.element = document.createElement('div');
    this.element.className = 'apple-modal-backdrop';
    this.element.id = 'account-modal-backdrop';

    const card = document.createElement('div');
    card.className = 'apple-modal-card';

    // 1. Header
    card.innerHTML = `
      <div class="modal-header-row">
        <div class="modal-title-group">
          <h2 class="modal-title">账户中心</h2>
          <span class="modal-badge">${this.profile.verifiedStatus}</span>
        </div>
        <button class="modal-close-btn" id="account-modal-close-btn" title="关闭 (ESC)">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>

      <!-- Profile Card -->
      <div class="profile-card">
        <div class="profile-avatar-wrapper">
          <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
            <circle cx="12" cy="7" r="4"/>
          </svg>
          <div class="avatar-pro-dot"></div>
        </div>
        <div class="profile-info">
          <div class="profile-name">${this.profile.name}</div>
          <div class="profile-role">${this.profile.title} · ${this.profile.institution}</div>
          <span class="profile-tag">✦ 教学模式已激活 · 实时板书同步</span>
        </div>
      </div>

      <!-- Stats Grid -->
      <div class="account-stats-grid">
        <div class="stat-item-box">
          <div class="stat-item-value">${this.profile.teachingHours} h</div>
          <div class="stat-item-label">累计授课时长</div>
        </div>
        <div class="stat-item-box">
          <div class="stat-item-value" id="stat-handout-pages">${this.canvas.getTotalPages()} 页</div>
          <div class="stat-item-label">白板讲义总数</div>
        </div>
        <div class="stat-item-box">
          <div class="stat-item-value">${this.profile.totalExperimentsRun} 次</div>
          <div class="stat-item-label">演示实验开展</div>
        </div>
      </div>

      <!-- Whiteboard Theme Selector -->
      <div class="account-section-title">白板背景风格偏好</div>
      <div class="theme-selector-deck" id="theme-selector-deck">
        <button class="theme-card-btn" data-theme="plain">
          <div class="theme-preview-box preview-plain"></div>
          <span class="theme-label">经典白板</span>
        </button>
        <button class="theme-card-btn" data-theme="grid">
          <div class="theme-preview-box preview-grid"></div>
          <span class="theme-label">坐标网格</span>
        </button>
        <button class="theme-card-btn" data-theme="chalkboard">
          <div class="theme-preview-box preview-chalkboard"></div>
          <span class="theme-label">护眼墨绿</span>
        </button>
        <button class="theme-card-btn" data-theme="dark">
          <div class="theme-preview-box preview-dark"></div>
          <span class="theme-label">极客深空</span>
        </button>
      </div>

      <!-- Actions -->
      <div class="account-section-title">教学讲义快捷导出</div>
      <div class="account-actions-row">
        <button class="apple-pill-action-btn primary" id="btn-export-handout">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
          <span>导出当前讲义 (PNG)</span>
        </button>
        <button class="apple-pill-action-btn secondary" id="btn-new-lesson">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"/>
            <line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          <span>新建一页板书</span>
        </button>
      </div>
    `;

    this.element.appendChild(card);
    parent.appendChild(this.element);

    // Collect theme buttons
    this.themeButtons = Array.from(card.querySelectorAll('.theme-card-btn'));
    this.updateThemeButtonStates();
  }

  private updateThemeButtonStates(): void {
    const currentTheme = this.canvas.getTheme();
    this.themeButtons.forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.theme === currentTheme);
    });
  }

  private bindEvents(): void {
    // Close button
    this.element.querySelector('#account-modal-close-btn')?.addEventListener('click', () => {
      this.close();
    });

    // Click outside card to close
    this.element.addEventListener('click', (e) => {
      if (e.target === this.element) {
        this.close();
      }
    });

    // Escape key
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isOpen) {
        this.close();
      }
    });

    // Theme buttons
    this.themeButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const theme = btn.dataset.theme as WhiteboardTheme;
        if (theme) {
          this.canvas.setTheme(theme);
          this.updateThemeButtonStates();
        }
      });
    });

    // Export handout button
    this.element.querySelector('#btn-export-handout')?.addEventListener('click', () => {
      this.canvas.downloadCurrentPage();
    });

    // New lesson button
    this.element.querySelector('#btn-new-lesson')?.addEventListener('click', () => {
      this.canvas.addPage();
      this.updateStats();
      this.close();
    });
  }

  public updateStats(): void {
    const totalPagesEl = this.element.querySelector('#stat-handout-pages');
    if (totalPagesEl) {
      totalPagesEl.textContent = `${this.canvas.getTotalPages()} 页`;
    }
  }

  public open(): void {
    this.isOpen = true;
    this.updateStats();
    this.updateThemeButtonStates();
    this.element.classList.add('open');
  }

  public close(): void {
    this.isOpen = false;
    this.element.classList.remove('open');
  }

  public get visible(): boolean {
    return this.isOpen;
  }
}
