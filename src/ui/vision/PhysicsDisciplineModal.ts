export interface PhysicsDisciplineCallbacks {
  onBackToDisciplines: () => void;
}

export class PhysicsDisciplineModal {
  public element: HTMLElement;

  constructor(private callbacks: PhysicsDisciplineCallbacks) {
    this.createUI();
    this.bindEvents();
  }

  private createUI(): void {
    this.element = document.createElement('div');
    this.element.className = 'vision-physics-discipline';

    this.element.innerHTML = `
      <div class="discipline-hero-header">
        <div class="header-breadcrumbs">
          <span class="crumb-link" id="btn-crumb-disciplines">学科</span>
          <span class="crumb-sep">/</span>
          <span class="crumb-current">物理学</span>
        </div>
        <p class="hero-desc">经典天体动力系统、电磁场论与波动光学空间实验台</p>
      </div>

      <!-- 4 Physics Sub-disciplines Grid (All in planning, no existing active experiments) -->
      <div class="physics-branches-grid">
        <!-- Branch 1: Optics (In planning) -->
        <div class="physics-branch-card disabled-card" title="规划中">
          <div class="branch-card-header">
            <div class="card-icon-wrapper">
              <svg class="vision-card-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="4"/>
                <path d="M12 2v2"/>
                <path d="M12 20v2"/>
                <path d="m4.93 4.93 1.41 1.41"/>
                <path d="m17.66 17.66 1.41 1.41"/>
                <path d="M2 12h2"/>
                <path d="M20 12h2"/>
                <path d="m6.34 17.66-1.41 1.41"/>
                <path d="m19.07 4.93-1.41 1.41"/>
              </svg>
            </div>
            <div class="branch-badge planned">规划中</div>
          </div>
          <div class="branch-text-group">
            <h3 class="branch-title">光学实验</h3>
            <p class="branch-desc">几何传播、双缝干涉、光栅衍射与偏振态</p>
          </div>
        </div>

        <!-- Branch 2: Mechanics (In planning) -->
        <div class="physics-branch-card disabled-card" title="规划中">
          <div class="branch-card-header">
            <div class="card-icon-wrapper">
              <svg class="vision-card-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="8"/>
                <line x1="12" y1="2" x2="12" y2="4"/>
                <line x1="12" y1="20" x2="12" y2="22"/>
                <line x1="20" y1="12" x2="22" y2="12"/>
                <line x1="2" y1="12" x2="4" y2="12"/>
              </svg>
            </div>
            <div class="branch-badge planned">规划中</div>
          </div>
          <div class="branch-text-group">
            <h3 class="branch-title">力学实验</h3>
            <p class="branch-desc">经典重力场、非线性单摆与多体天体引力</p>
          </div>
        </div>

        <!-- Branch 3: Thermodynamics (In planning) -->
        <div class="physics-branch-card disabled-card" title="规划中">
          <div class="branch-card-header">
            <div class="card-icon-wrapper">
              <svg class="vision-card-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z"/>
              </svg>
            </div>
            <div class="branch-badge planned">规划中</div>
          </div>
          <div class="branch-text-group">
            <h3 class="branch-title">热学实验</h3>
            <p class="branch-desc">分子运动论、麦克斯韦分布与卡诺循环</p>
          </div>
        </div>

        <!-- Branch 4: Electromagnetism (In planning) -->
        <div class="physics-branch-card disabled-card" title="规划中">
          <div class="branch-card-header">
            <div class="card-icon-wrapper">
              <svg class="vision-card-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
              </svg>
            </div>
            <div class="branch-badge planned">规划中</div>
          </div>
          <div class="branch-text-group">
            <h3 class="branch-title">电磁学</h3>
            <p class="branch-desc">毕奥-萨伐尔定律、霍尔效应与电磁感应</p>
          </div>
        </div>
      </div>

      <!-- Empty state: No active experiments in physics section -->
      <div class="physics-empty-deck">
        <div class="vision-empty-state" style="padding: 32px 20px;">
          <div class="empty-state-icon">
            <svg class="vision-empty-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="2.5" fill="currentColor"/>
              <ellipse cx="12" cy="12" rx="10" ry="4.2" transform="rotate(30 12 12)"/>
              <ellipse cx="12" cy="12" rx="10" ry="4.2" transform="rotate(-30 12 12)"/>
            </svg>
          </div>
          <h4 class="empty-state-title" style="font-size: 18px;">暂无可用物理实验</h4>
          <p class="empty-state-subtitle" style="font-size: 12.5px; color: #86868b; margin-top: 4px;">经典力学、热学、电磁学与光学实验模块正在规划重构中，敬请期待</p>
        </div>
      </div>
    `;
  }

  private bindEvents(): void {
    this.element.querySelector('#btn-crumb-disciplines')?.addEventListener('click', () => {
      this.callbacks.onBackToDisciplines();
    });
  }
}
