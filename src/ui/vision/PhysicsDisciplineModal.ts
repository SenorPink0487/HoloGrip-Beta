import type { OpticsExperimentId } from '../../physics/optics/OpticsExperimentManager';

export interface PhysicsDisciplineCallbacks {
  onBackToDisciplines: () => void;
  onSelectOpticsExperiment: (experimentId: OpticsExperimentId) => void;
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

      <!-- 4 Physics Sub-disciplines Grid -->
      <div class="physics-branches-grid">
        <!-- Branch 1: Optics (Ready!) -->
        <div class="physics-branch-card active-card" id="card-branch-optics" role="button" tabindex="0">
          <div class="branch-card-header">
            <div class="card-icon-wrapper active-glow">
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
            <div class="branch-badge ready">已就绪</div>
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

      <!-- Sub-list: 4 Optics Classic Experiment Cards -->
      <div class="optics-sub-deck">
        <h4 class="sub-deck-title">光学经典教学实验专题</h4>
        <div class="optics-topics-grid">
          <div class="optics-topic-card" data-exp="propagation" role="button" tabindex="0">
            <div class="topic-meta">专题 01</div>
            <h5 class="topic-name">光的传播与折射</h5>
            <p class="topic-desc">斯涅尔定律、全反射临界角与棱镜色散</p>
          </div>

          <div class="optics-topic-card" data-exp="interference" role="button" tabindex="0">
            <div class="topic-meta">专题 02</div>
            <h5 class="topic-name">双缝干涉</h5>
            <p class="topic-desc">杨氏相干条纹、衍射包络调制与缺级判定</p>
          </div>

          <div class="optics-topic-card" data-exp="diffraction" role="button" tabindex="0">
            <div class="topic-meta">专题 03</div>
            <h5 class="topic-name">衍射与光栅</h5>
            <p class="topic-desc">夫琅禾费单缝、艾里斑圆孔与多缝锐谱</p>
          </div>

          <div class="optics-topic-card" data-exp="polarization" role="button" tabindex="0">
            <div class="topic-meta">专题 04</div>
            <h5 class="topic-name">偏振与马吕斯定律</h5>
            <p class="topic-desc">线偏振光转化、消光实验与三维电场矢量</p>
          </div>
        </div>
      </div>
    `;
  }

  private bindEvents(): void {
    this.element.querySelector('#btn-crumb-disciplines')?.addEventListener('click', () => {
      this.callbacks.onBackToDisciplines();
    });

    this.element.querySelector('#card-branch-optics')?.addEventListener('click', () => {
      this.callbacks.onSelectOpticsExperiment('interference');
    });

    this.element.querySelectorAll('.optics-topic-card').forEach((card) => {
      card.addEventListener('click', () => {
        const expId = card.getAttribute('data-exp') as OpticsExperimentId;
        if (expId) {
          this.callbacks.onSelectOpticsExperiment(expId);
        }
      });
    });
  }
}
