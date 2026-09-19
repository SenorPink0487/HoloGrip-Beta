export interface PhysicsDisciplineCallbacks {
  onBackToDisciplines: () => void;
  onSelectExperiment?: (id: string) => Promise<void>;
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
        <!-- Branch 1: Optics (Ready & Active) -->
        <div class="physics-branch-card active-card" id="branch-card-optics" role="button" tabindex="0" title="点击展开/加载光学实验">
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
            <div class="branch-badge ready">已上线</div>
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

      <!-- Active Optics Experiments Deck -->
      <div class="optics-experiments-deck">
        <div class="optics-deck-header">
          <div class="optics-deck-title-group">
            <span class="optics-deck-title">光学物理实验目录</span>
            <span class="optics-count-tag">5 个实验已就绪</span>
          </div>
        </div>

        <div class="optics-exp-grid">
          <!-- Card 1: Master Lab -->
          <div class="optics-exp-card" data-exp-id="optics-lab" role="button" tabindex="0">
            <div class="optics-exp-top">
              <div class="optics-exp-title-row">
                <svg class="apple-sf-icon optics-exp-glyph" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="12" cy="12" r="9"/>
                  <path d="m4.93 4.93 14.14 14.14"/>
                  <path d="M12 3v18"/>
                  <path d="M3 12h18"/>
                </svg>
                <span class="optics-exp-name">全息光学综合实验台</span>
              </div>
              <span class="optics-exp-badge">综合套件</span>
            </div>
            <p class="optics-exp-desc">集成精密光学导轨、激光器、游标测角台、三棱镜、双缝与偏振器，一键切换四大光学模态。</p>
            <div class="optics-exp-bottom">
              <span class="optics-exp-equation">I(θ) = I₀ cos²(Δθ) sinc²(β)</span>
              <button class="optics-launch-btn">进入实验 →</button>
            </div>
          </div>

          <!-- Card 2: Propagation & Dispersion -->
          <div class="optics-exp-card" data-exp-id="optics-propagation" role="button" tabindex="0">
            <div class="optics-exp-top">
              <div class="optics-exp-title-row">
                <svg class="apple-sf-icon optics-exp-glyph" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <polygon points="12 2 2 22 22 22 12 2"/>
                </svg>
                <span class="optics-exp-name">光的传播与折射色散</span>
              </div>
              <span class="optics-exp-badge">几何光学</span>
            </div>
            <p class="optics-exp-desc">等边三棱镜斯涅尔折射、全反射临界角验证与牛顿七彩色散光谱分解。</p>
            <div class="optics-exp-bottom">
              <span class="optics-exp-equation">n₁ sinθ₁ = n₂ sinθ₂</span>
              <button class="optics-launch-btn">进入实验 →</button>
            </div>
          </div>

          <!-- Card 3: Double Slit Interference -->
          <div class="optics-exp-card" data-exp-id="optics-interference" role="button" tabindex="0">
            <div class="optics-exp-top">
              <div class="optics-exp-title-row">
                <svg class="apple-sf-icon optics-exp-glyph" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M4 6h16M4 12h16M4 18h16"/>
                </svg>
                <span class="optics-exp-name">杨氏双缝干涉</span>
              </div>
              <span class="optics-exp-badge">波动光学</span>
            </div>
            <p class="optics-exp-desc">相干光波前空间干涉、双缝中心距调谐与高分辨等间距干涉条纹。</p>
            <div class="optics-exp-bottom">
              <span class="optics-exp-equation">Δy = (λ L) / d</span>
              <button class="optics-launch-btn">进入实验 →</button>
            </div>
          </div>

          <!-- Card 4: Diffraction -->
          <div class="optics-exp-card" data-exp-id="optics-diffraction" role="button" tabindex="0">
            <div class="optics-exp-top">
              <div class="optics-exp-title-row">
                <svg class="apple-sf-icon optics-exp-glyph" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <line x1="8" y1="4" x2="8" y2="20"/>
                  <line x1="12" y1="4" x2="12" y2="20"/>
                  <line x1="16" y1="4" x2="16" y2="20"/>
                </svg>
                <span class="optics-exp-name">单缝与光栅衍射</span>
              </div>
              <span class="optics-exp-badge">衍射光谱</span>
            </div>
            <p class="optics-exp-desc">夫琅禾费单缝 Sinc 平方光强包络与 100/300/600 lines/mm 透射光栅多级分光。</p>
            <div class="optics-exp-bottom">
              <span class="optics-exp-equation">d sinθ = mλ</span>
              <button class="optics-launch-btn">进入实验 →</button>
            </div>
          </div>

          <!-- Card 5: Polarization -->
          <div class="optics-exp-card" data-exp-id="optics-polarization" role="button" tabindex="0">
            <div class="optics-exp-top">
              <div class="optics-exp-title-row">
                <svg class="apple-sf-icon optics-exp-glyph" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="12" cy="12" r="10"/>
                  <line x1="12" y1="2" x2="12" y2="22"/>
                  <line x1="17" y1="7" x2="7" y2="17"/>
                </svg>
                <span class="optics-exp-name">光的偏振与马吕斯定律</span>
              </div>
              <span class="optics-exp-badge">矢量光学</span>
            </div>
            <p class="optics-exp-desc">360°精密起偏与检偏角盘消光、验证马吕斯余弦平方定律与 1/4 波片空间螺旋态。</p>
            <div class="optics-exp-bottom">
              <span class="optics-exp-equation">I = I₀ cos²(θ₂ - θ₁)</span>
              <button class="optics-launch-btn">进入实验 →</button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  private bindEvents(): void {
    this.element.querySelector('#btn-crumb-disciplines')?.addEventListener('click', () => {
      this.callbacks.onBackToDisciplines();
    });

    // Branch card click -> load master optics lab
    this.element.querySelector('#branch-card-optics')?.addEventListener('click', () => {
      this.callbacks.onSelectExperiment?.('optics-lab');
    });

    // Individual cards click
    this.element.querySelectorAll('.optics-exp-card').forEach((card) => {
      card.addEventListener('click', (e) => {
        const expId = (card as HTMLElement).getAttribute('data-exp-id');
        if (expId && this.callbacks.onSelectExperiment) {
          this.callbacks.onSelectExperiment(expId);
        }
      });
    });
  }
}
