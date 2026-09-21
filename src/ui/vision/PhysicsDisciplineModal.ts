export interface PhysicsDisciplineCallbacks {
  onBackToDisciplines: () => void;
  onSelectExperiment?: (id: string) => Promise<void>;
  onLevelChange?: (level: 1 | 2, title: string) => void;
}

export interface OpticsExperimentDef {
  id: string;
  name: string;
  category: string;
  formula: string;
  iconSvg: string;
}

export class PhysicsDisciplineModal {
  public element: HTMLElement;
  private callbacks: PhysicsDisciplineCallbacks;
  private currentLevel: 1 | 2 = 1;
  private toastTimeout: ReturnType<typeof setTimeout> | null = null;

  public static readonly OPTICS_EXPERIMENTS: OpticsExperimentDef[] = [
    {
      id: 'optics-lab',
      name: '全息光学综合实验台',
      category: '综合套件',
      formula: 'I(θ) = I₀ cos²(Δθ) sinc²(β)',
      iconSvg: `
        <svg class="apple-sf-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="9"/>
          <path d="m4.93 4.93 14.14 14.14"/>
          <path d="M12 3v18"/>
          <path d="M3 12h18"/>
        </svg>
      `,
    },
    {
      id: 'optics-propagation',
      name: '光的传播与折射色散',
      category: '几何光学',
      formula: 'n₁ sinθ₁ = n₂ sinθ₂',
      iconSvg: `
        <svg class="apple-sf-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <polygon points="12 2 22 22 2 22 12 2"/>
        </svg>
      `,
    },
    {
      id: 'optics-interference',
      name: '杨氏双缝干涉',
      category: '波动光学',
      formula: 'Δy = (λ L) / d',
      iconSvg: `
        <svg class="apple-sf-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <path d="M4 6h16M4 12h16M4 18h16"/>
        </svg>
      `,
    },
    {
      id: 'optics-diffraction',
      name: '单缝与光栅衍射',
      category: '衍射光谱',
      formula: 'd sinθ = mλ',
      iconSvg: `
        <svg class="apple-sf-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <line x1="8" y1="4" x2="8" y2="20"/>
          <line x1="12" y1="4" x2="12" y2="20"/>
          <line x1="16" y1="4" x2="16" y2="20"/>
        </svg>
      `,
    },
    {
      id: 'optics-polarization',
      name: '光的偏振与马吕斯定律',
      category: '矢量光学',
      formula: 'I = I₀ cos²(θ₂ - θ₁)',
      iconSvg: `
        <svg class="apple-sf-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="2" x2="12" y2="22"/>
          <line x1="17" y1="7" x2="7" y2="17"/>
        </svg>
      `,
    },
  ];

  constructor(callbacks: PhysicsDisciplineCallbacks) {
    this.callbacks = callbacks;
    this.element = document.createElement('div');
    this.element.className = 'vision-physics-discipline';
    this.showLevel1();
  }

  public canGoBack(): boolean {
    return this.currentLevel === 2;
  }

  public goBack(): boolean {
    if (this.currentLevel === 2) {
      this.showLevel1();
      return true;
    }
    return false;
  }

  public reset(): void {
    this.showLevel1();
  }

  public getCurrentLevel(): 1 | 2 {
    return this.currentLevel;
  }

  /**
   * Render Level 1: Physics Sub-discipline Branches Grid
   */
  public showLevel1(): void {
    this.currentLevel = 1;
    this.callbacks.onLevelChange?.(1, '物理学科');

    this.element.innerHTML = `
      <div class="physics-level-container physics-level-1">
        <!-- Apple Minimalist Navigation Header -->
        <div class="physics-nav-bar">
          <button class="physics-back-pill" id="btn-crumb-disciplines" title="返回学科选择">
            <svg class="apple-sf-icon" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
            <span>学科</span>
          </button>
          <h2 class="physics-level-title">物理学</h2>
          <div class="physics-nav-placeholder"></div>
        </div>

        <!-- 4 Physics Branches Grid (Apple Pure Frosted Tiles) -->
        <div class="physics-branches-deck">
          <!-- 1. Optics (Ready -> Click to enter Level 2) -->
          <div class="physics-branch-tile ready" id="branch-tile-optics" role="button" tabindex="0" title="进入光学实验">
            <div class="branch-tile-icon-box">
              <svg class="apple-sf-icon branch-tile-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
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
            <h3 class="branch-tile-name">光学实验</h3>
            <span class="branch-tile-badge ready">5 个实验已就绪</span>
          </div>

          <!-- 2. Mechanics (In planning) -->
          <div class="physics-branch-tile planned" id="branch-tile-mechanics" role="button" tabindex="0" title="规划中">
            <div class="branch-tile-icon-box">
              <svg class="apple-sf-icon branch-tile-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="8"/>
                <line x1="12" y1="2" x2="12" y2="4"/>
                <line x1="12" y1="20" x2="12" y2="22"/>
                <line x1="20" y1="12" x2="22" y2="12"/>
                <line x1="2" y1="12" x2="4" y2="12"/>
              </svg>
            </div>
            <h3 class="branch-tile-name">力学实验</h3>
            <span class="branch-tile-badge planned">规划中</span>
          </div>

          <!-- 3. Thermodynamics (In planning) -->
          <div class="physics-branch-tile planned" id="branch-tile-thermo" role="button" tabindex="0" title="规划中">
            <div class="branch-tile-icon-box">
              <svg class="apple-sf-icon branch-tile-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z"/>
              </svg>
            </div>
            <h3 class="branch-tile-name">热学实验</h3>
            <span class="branch-tile-badge planned">规划中</span>
          </div>

          <!-- 4. Electromagnetism (In planning) -->
          <div class="physics-branch-tile planned" id="branch-tile-em" role="button" tabindex="0" title="规划中">
            <div class="branch-tile-icon-box">
              <svg class="apple-sf-icon branch-tile-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
              </svg>
            </div>
            <h3 class="branch-tile-name">电磁学</h3>
            <span class="branch-tile-badge planned">规划中</span>
          </div>
        </div>

        <!-- VisionOS Dynamic Floating Toast Indicator -->
        <div class="physics-floating-toast" id="physics-floating-toast"></div>
      </div>
    `;

    this.bindLevel1Events();
  }

  /**
   * Render Level 2: Optics Experiment Catalog (Only visible after clicking Optics)
   */
  public showLevel2(): void {
    this.currentLevel = 2;
    this.callbacks.onLevelChange?.(2, '光学实验');

    this.element.innerHTML = `
      <div class="physics-level-container physics-level-2">
        <!-- Apple Minimalist Navigation Header with Back to Physics -->
        <div class="physics-nav-bar">
          <button class="physics-back-pill" id="btn-back-to-physics" title="返回物理学分支">
            <svg class="apple-sf-icon" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
            <span>物理学</span>
          </button>
          <div class="physics-title-group">
            <h2 class="physics-level-title">光学实验</h2>
            <span class="branch-tile-badge ready">5 个实验已就绪</span>
          </div>
          <div class="physics-nav-placeholder"></div>
        </div>

        <!-- 5 Optics Experiments Grid (Apple Pure Frosted Tiles) -->
        <div class="optics-exp-deck">
          ${PhysicsDisciplineModal.OPTICS_EXPERIMENTS.map(
            (exp) => `
            <div class="optics-card" data-exp-id="${exp.id}" role="button" tabindex="0">
              <div class="optics-card-top">
                <div class="optics-card-icon-box">${exp.iconSvg}</div>
                <div class="optics-card-header-info">
                  <h3 class="optics-card-name">${exp.name}</h3>
                  <span class="optics-card-tag">${exp.category}</span>
                </div>
              </div>

              <div class="optics-card-bottom">
                <span class="optics-formula-chip">${exp.formula}</span>
                <button class="optics-enter-pill" tabindex="-1">
                  <span>进入实验</span>
                  <svg class="apple-sf-icon action-arrow" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="9 18 15 12 9 6"/>
                  </svg>
                </button>
              </div>
            </div>
          `
          ).join('')}
        </div>
      </div>
    `;

    this.bindLevel2Events();
  }

  private showToast(msg: string): void {
    const toast = this.element.querySelector('#physics-floating-toast');
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.add('visible');

    if (this.toastTimeout) clearTimeout(this.toastTimeout);
    this.toastTimeout = setTimeout(() => {
      toast.classList.remove('visible');
    }, 1800);
  }

  private bindLevel1Events(): void {
    // Back button -> Disciplines selector
    this.element.querySelector('#btn-crumb-disciplines')?.addEventListener('click', () => {
      this.callbacks.onBackToDisciplines();
    });

    // Optics tile -> navigate to Level 2
    const opticsTile = this.element.querySelector('#branch-tile-optics');
    opticsTile?.addEventListener('click', () => {
      this.showLevel2();
    });
    opticsTile?.addEventListener('keydown', (e) => {
      if ((e as KeyboardEvent).key === 'Enter' || (e as KeyboardEvent).key === ' ') {
        this.showLevel2();
      }
    });

    // Planned tiles -> Apple visionOS toast
    const bindPlanned = (selector: string, name: string) => {
      const tile = this.element.querySelector(selector);
      tile?.addEventListener('click', () => {
        this.showToast(`${name}正在规划中`);
      });
      tile?.addEventListener('keydown', (e) => {
        if ((e as KeyboardEvent).key === 'Enter' || (e as KeyboardEvent).key === ' ') {
          this.showToast(`${name}正在规划中`);
        }
      });
    };

    bindPlanned('#branch-tile-mechanics', '力学实验');
    bindPlanned('#branch-tile-thermo', '热学实验');
    bindPlanned('#branch-tile-em', '电磁学');
  }

  private bindLevel2Events(): void {
    // Back button -> Level 1 Physics branches
    this.element.querySelector('#btn-back-to-physics')?.addEventListener('click', () => {
      this.showLevel1();
    });

    // Experiment cards click
    this.element.querySelectorAll('.optics-card').forEach((card) => {
      const expId = (card as HTMLElement).getAttribute('data-exp-id');
      const handleSelect = () => {
        if (expId && this.callbacks.onSelectExperiment) {
          this.callbacks.onSelectExperiment(expId);
        }
      };

      card.addEventListener('click', handleSelect);
      card.addEventListener('keydown', (e) => {
        if ((e as KeyboardEvent).key === 'Enter' || (e as KeyboardEvent).key === ' ') {
          handleSelect();
        }
      });
    });
  }
}
