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
      id: 'optics-propagation',
      name: '光的传播与折射色散',
      category: '几何光学',
      formula: 'n₁ sinθ₁ = n₂ sinθ₂',
      iconSvg: `
        <svg class="apple-sf-icon" viewBox="0 0 36 36" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
          <polygon points="18,4 32,30 4,30" stroke-width="2.2" fill="currentColor" fill-opacity="0.08"/>
          <line x1="2" y1="20" x2="11.5" y2="18.5" stroke-width="2.4"/>
          <line x1="11.5" y1="18.5" x2="23" y2="20.5" stroke-width="2.2" opacity="0.9"/>
          <line x1="23" y1="20.5" x2="34" y2="15" stroke-width="2" stroke="#ff3b30"/>
          <line x1="23" y1="20.5" x2="34" y2="20" stroke-width="2" stroke="#ffcc00"/>
          <line x1="23" y1="20.5" x2="34" y2="25" stroke-width="2" stroke="#007aff"/>
        </svg>
      `,
    },
    {
      id: 'optics-interference',
      name: '杨氏双缝干涉',
      category: '波动光学',
      formula: 'Δy = (λ L) / d',
      iconSvg: `
        <svg class="apple-sf-icon" viewBox="0 0 36 36" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
          <line x1="9" y1="4" x2="9" y2="11" stroke-width="2.6"/>
          <line x1="9" y1="15" x2="9" y2="21" stroke-width="2.6"/>
          <line x1="9" y1="25" x2="9" y2="32" stroke-width="2.6"/>
          <path d="M13 8 A7 7 0 0 1 18 18" stroke-width="1.8" opacity="0.85"/>
          <path d="M16 5 A13 13 0 0 1 24 21" stroke-width="1.8" opacity="0.65"/>
          <path d="M13 28 A7 7 0 0 0 18 18" stroke-width="1.8" opacity="0.85"/>
          <path d="M16 31 A13 13 0 0 0 24 15" stroke-width="1.8" opacity="0.65"/>
          <line x1="30" y1="4" x2="30" y2="32" stroke-width="2.2" opacity="0.5"/>
          <circle cx="30" cy="18" r="2" fill="currentColor"/>
          <circle cx="30" cy="10" r="1.5" fill="currentColor"/>
          <circle cx="30" cy="26" r="1.5" fill="currentColor"/>
        </svg>
      `,
    },
    {
      id: 'optics-diffraction',
      name: '单缝与光栅衍射',
      category: '衍射光谱',
      formula: 'd sinθ = mλ',
      iconSvg: `
        <svg class="apple-sf-icon" viewBox="0 0 36 36" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
          <line x1="6" y1="6" x2="6" y2="30" stroke-width="2.2"/>
          <line x1="10" y1="6" x2="10" y2="30" stroke-width="2.2"/>
          <line x1="14" y1="6" x2="14" y2="30" stroke-width="2.2"/>
          <line x1="18" y1="6" x2="18" y2="30" stroke-width="2.2"/>
          <path d="M18 18 L32 7" stroke-width="1.8" opacity="0.85" stroke-dasharray="3 1.5"/>
          <path d="M18 18 L34 18" stroke-width="2.4"/>
          <path d="M18 18 L32 29" stroke-width="1.8" opacity="0.85" stroke-dasharray="3 1.5"/>
          <path d="M28 8 Q34 18 28 28" stroke-width="1.6" opacity="0.5"/>
        </svg>
      `,
    },
    {
      id: 'optics-polarization',
      name: '光的偏振与马吕斯定律',
      category: '矢量光学',
      formula: 'I = I₀ cos²(θ₂ - θ₁)',
      iconSvg: `
        <svg class="apple-sf-icon" viewBox="0 0 36 36" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="18" cy="18" r="14" stroke-width="2.2" fill="currentColor" fill-opacity="0.08"/>
          <line x1="18" y1="4" x2="18" y2="32" stroke-width="2.4"/>
          <line x1="8" y1="8" x2="28" y2="28" stroke-width="2" opacity="0.75" stroke-dasharray="4 2"/>
          <path d="M18 10 A8 8 0 0 1 23.6 12.4" stroke-width="1.8" stroke="#ff375f"/>
          <circle cx="18" cy="18" r="2.5" fill="currentColor"/>
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
          <button class="physics-back-pill" id="btn-back-to-physics" title="返回物理学">
            <svg class="apple-sf-icon" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
            <span>物理学</span>
          </button>
          <h2 class="physics-level-title">光学实验</h2>
          <div class="physics-nav-placeholder"></div>
        </div>

        <!-- 4 Core Optics Experiments 2x2 Spatial Grid -->
        <div class="optics-exp-deck">
          ${PhysicsDisciplineModal.OPTICS_EXPERIMENTS.map(
            (exp) => `
            <div class="optics-card" data-exp-id="${exp.id}" data-formula="${exp.formula}" title="${exp.name}&#10;${exp.formula}" role="button" tabindex="0">
              <div class="optics-card-icon-box">${exp.iconSvg}</div>
              <h3 class="optics-card-name">${exp.name}</h3>
              <div class="optics-card-action">
                <svg class="apple-sf-icon action-arrow" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="9 18 15 12 9 6"/>
                </svg>
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
