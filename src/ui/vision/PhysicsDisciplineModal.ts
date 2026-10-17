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
  private currentDiscipline: 'optics' | 'thermo' | 'em' | 'mechanics' = 'optics';
  private toastTimeout: ReturnType<typeof setTimeout> | null = null;

  public static readonly MECHANICS_EXPERIMENTS: (OpticsExperimentDef & { planned?: boolean })[] = [
    {
      id: 'mech-galileo',
      name: '伽利略理想斜面实验',
      category: '惯性定律与理想实验',
      formula: 'v = \\sqrt{2gh} · h_1 = h_2',
      iconSvg: `
        <svg class="apple-sf-icon" viewBox="0 0 36 36" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="4,12 12,26 22,26 32,16" stroke-width="2.2"/>
          <line x1="4" y1="12" x2="32" y2="12" stroke="#38bdf8" stroke-width="1.2" stroke-dasharray="2 1.5"/>
          <circle cx="8" cy="19" r="2.4" fill="#38bdf8" stroke="currentColor" stroke-width="1.5"/>
          <path d="M9 22 L15 26" stroke="#38bdf8" stroke-width="1.8"/>
          <polyline points="13,24 15,26 13,28" stroke="#38bdf8" stroke-width="1.5"/>
          <circle cx="28" cy="20" r="2.2" fill="#facc15" stroke="currentColor" stroke-width="1.5" opacity="0.8"/>
        </svg>
      `,
    },
  ];

  public static readonly EM_EXPERIMENTS: (OpticsExperimentDef & { planned?: boolean })[] = [
    {
      id: 'em-hall',
      name: '霍尔效应原理',
      category: '电磁感应与载流子动力学',
      formula: 'V_H = R_H · (I B / d)',
      iconSvg: `
        <svg class="apple-sf-icon" viewBox="0 0 36 36" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
          <rect x="7" y="11" width="22" height="14" rx="2" stroke-width="2.2" fill="currentColor" fill-opacity="0.08"/>
          <line x1="2" y1="18" x2="7" y2="18" stroke="#facc15" stroke-width="2.4"/>
          <line x1="29" y1="18" x2="34" y2="18" stroke="#facc15" stroke-width="2.4"/>
          <line x1="18" y1="3" x2="18" y2="11" stroke="#06b6d4" stroke-width="2.2"/>
          <polyline points="15,7 18,3 21,7" stroke="#06b6d4" stroke-width="2"/>
          <rect x="13" y="9" width="10" height="2.5" rx="1" fill="#ef4444"/>
          <rect x="13" y="24.5" width="10" height="2.5" rx="1" fill="#3b82f6"/>
          <path d="M8 18 Q 18 19 27 24" stroke="#38bdf8" stroke-width="1.8" stroke-dasharray="3 1.5"/>
          <circle cx="27" cy="24" r="1.8" fill="#38bdf8"/>
        </svg>
      `,
    },
    {
      id: 'em-induction',
      name: '法拉第电磁感应与楞次定律',
      category: '电磁感应与螺线管',
      formula: 'ℰ_{感} = -N (ΔΦ/Δt)',
      iconSvg: `
        <svg class="apple-sf-icon" viewBox="0 0 36 36" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
          <rect x="9" y="15" width="18" height="16" rx="2" stroke-width="2" fill="currentColor" fill-opacity="0.08"/>
          <line x1="9" y1="19" x2="27" y2="19" stroke="#ca8a04" stroke-width="2"/>
          <line x1="9" y1="23" x2="27" y2="23" stroke="#ca8a04" stroke-width="2"/>
          <line x1="9" y1="27" x2="27" y2="27" stroke="#ca8a04" stroke-width="2"/>
          <rect x="15" y="3" width="6" height="6" rx="1" fill="#ef4444"/>
          <rect x="15" y="9" width="6" height="6" rx="1" fill="#2563eb"/>
          <path d="M18 10 L18 15" stroke="#38bdf8" stroke-width="2"/>
          <polyline points="15,13 18,15 21,13" stroke="#38bdf8" stroke-width="1.8"/>
        </svg>
      `,
    },
    {
      id: 'em-generator',
      name: '旋转线圈发电机与交直流输出',
      category: '动生电动势与发电机',
      formula: 'ℰ_{动} = NBSω sin(ωt)',
      iconSvg: `
        <svg class="apple-sf-icon" viewBox="0 0 36 36" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
          <path d="M6 10 C6 18 10 22 10 26" stroke="#ef4444" stroke-width="3" stroke-linecap="round"/>
          <path d="M30 10 C30 18 26 22 26 26" stroke="#2563eb" stroke-width="3" stroke-linecap="round"/>
          <rect x="13" y="12" width="10" height="12" rx="2" stroke="#ca8a04" stroke-width="2" fill="none"/>
          <circle cx="18" cy="18" r="3" stroke="#38bdf8" stroke-width="1.8"/>
          <path d="M18 6 L18 12" stroke="#e2e8f0" stroke-width="2"/>
          <path d="M18 24 L18 30" stroke="#e2e8f0" stroke-width="2"/>
        </svg>
      `,
    },
    {
      id: 'em-field',
      name: '静电场探索与电力线叠加',
      category: '静电场与高斯定理',
      formula: 'E = ∑ k q_i / r_i² · r̂_i',
      iconSvg: `
        <svg class="apple-sf-icon" viewBox="0 0 36 36" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="11" cy="18" r="4.5" stroke="#ef4444" stroke-width="2.2" fill="currentColor" fill-opacity="0.12"/>
          <line x1="9" y1="18" x2="13" y2="18" stroke="#ef4444" stroke-width="2"/>
          <line x1="11" y1="16" x2="11" y2="20" stroke="#ef4444" stroke-width="2"/>
          <circle cx="25" cy="18" r="4.5" stroke="#3b82f6" stroke-width="2.2" fill="currentColor" fill-opacity="0.12"/>
          <line x1="23" y1="18" x2="27" y2="18" stroke="#3b82f6" stroke-width="2"/>
          <path d="M15.5 18 L20.5 18" stroke="#38bdf8" stroke-width="2"/>
          <polyline points="18.5,16 20.5,18 18.5,20" stroke="#38bdf8" stroke-width="1.8"/>
          <path d="M13 14 C15 7 21 7 23 14" stroke="#facc15" stroke-width="1.8"/>
          <polyline points="19,8.5 21,8.5 20,10.5" stroke="#facc15" stroke-width="1.5"/>
          <path d="M13 22 C15 29 21 29 23 22" stroke="#facc15" stroke-width="1.8"/>
          <polyline points="19,27.5 21,27.5 20,25.5" stroke="#facc15" stroke-width="1.5"/>
        </svg>
      `,
    },
    {
      id: 'em-mass-spec',
      name: '磁聚焦与带电粒子质谱仪',
      category: '带电粒子运动',
      formula: 'r = mv / (qB) · q/m',
      iconSvg: `
        <svg class="apple-sf-icon" viewBox="0 0 36 36" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="18" cy="18" r="13" stroke-width="2" stroke-dasharray="2 2" opacity="0.4"/>
          <path d="M9 27 A11 11 0 0 1 27 15" stroke="#facc15" stroke-width="2.2"/>
          <polyline points="25,12 27,15 24,17" stroke="#facc15" stroke-width="2"/>
          <circle cx="9" cy="27" r="2.2" fill="#38bdf8"/>
          <rect x="24" y="23" width="8" height="3" fill="#64748b"/>
        </svg>
      `,
    },
    {
      id: 'em-hysteresis',
      name: '铁磁材料磁化与磁滞回线',
      category: '磁介质物理',
      formula: 'B = μ₀ (H + M)',
      iconSvg: `
        <svg class="apple-sf-icon" viewBox="0 0 36 36" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
          <line x1="5" y1="18" x2="31" y2="18" stroke-width="1.5" opacity="0.5"/>
          <line x1="18" y1="5" x2="18" y2="31" stroke-width="1.5" opacity="0.5"/>
          <path d="M8 24 C14 24 16 12 28 12 C22 12 20 24 8 24 Z" stroke="#a855f7" stroke-width="2.2" fill="currentColor" fill-opacity="0.08"/>
        </svg>
      `,
    },
  ];

  public static readonly THERMO_EXPERIMENTS: OpticsExperimentDef[] = [
    {
      id: 'thermo-idealgas',
      name: '理想气体状态与分子运动论',
      category: '统计与动理论',
      formula: 'PV = nRT · v_rms = √(3RT/M)',
      iconSvg: `
        <svg class="apple-sf-icon" viewBox="0 0 36 36" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
          <rect x="7" y="6" width="22" height="24" rx="2" stroke-width="2.2" fill="currentColor" fill-opacity="0.06"/>
          <line x1="18" y1="2" x2="18" y2="14" stroke-width="2.6"/>
          <line x1="13" y1="2" x2="23" y2="2" stroke-width="2.6"/>
          <rect x="8" y="14" width="20" height="4" rx="1" fill="currentColor" fill-opacity="0.3" stroke="currentColor" stroke-width="1.8"/>
          <circle cx="12" cy="22" r="1.6" fill="#ff3b30"/>
          <circle cx="17" cy="26" r="1.4" fill="#007aff"/>
          <circle cx="23" cy="21" r="1.5" fill="#34c759"/>
          <circle cx="21" cy="27" r="1.3" fill="#ff9500"/>
          <circle cx="14" cy="28" r="1.2" fill="#af52de"/>
        </svg>
      `,
    },
    {
      id: 'thermo-carnot',
      name: '卡诺热机与循环效率',
      category: '工程热力学',
      formula: 'η = 1 - T_C / T_H',
      iconSvg: `
        <svg class="apple-sf-icon" viewBox="0 0 36 36" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
          <path d="M10 26 Q12 12 24 10 Q28 14 26 22 Q18 28 10 26 Z" stroke-width="2.2" fill="currentColor" fill-opacity="0.08"/>
          <path d="M16 11 L19 10 L18 13" stroke-width="1.8"/>
          <path d="M26 17 L25 20 L22 19" stroke-width="1.8"/>
          <path d="M19 26 L16 27 L17 24" stroke-width="1.8"/>
          <path d="M18 4 L18 8 M16 6 L18 8 L20 6" stroke="#ff3b30" stroke-width="1.8"/>
          <path d="M18 29 L18 33 M16 31 L18 33 L20 31" stroke="#007aff" stroke-width="1.8"/>
        </svg>
      `,
    },
    {
      id: 'thermo-conduction',
      name: '热传导与傅里叶定律',
      category: '传热物理',
      formula: 'q = -k ∇T',
      iconSvg: `
        <svg class="apple-sf-icon" viewBox="0 0 36 36" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
          <rect x="5" y="13" width="26" height="10" rx="2" stroke-width="2" fill="currentColor" fill-opacity="0.06"/>
          <line x1="8" y1="13" x2="8" y2="23" stroke="#ff3b30" stroke-width="2.2"/>
          <line x1="14" y1="13" x2="14" y2="23" stroke="#ff9500" stroke-width="2"/>
          <line x1="20" y1="13" x2="20" y2="23" stroke="#ffcc00" stroke-width="2"/>
          <line x1="26" y1="13" x2="26" y2="23" stroke="#007aff" stroke-width="2"/>
          <line x1="6" y1="28" x2="30" y2="28" stroke-width="1.8" stroke-dasharray="3 2"/>
          <polyline points="26,25 30,28 26,31" stroke-width="1.8"/>
        </svg>
      `,
    },
    {
      id: 'thermo-phase',
      name: '物态相变与潜热曲线',
      category: '相变物理',
      formula: 'Q = m · L',
      iconSvg: `
        <svg class="apple-sf-icon" viewBox="0 0 36 36" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="5,30 11,24 19,24 25,12 31,12" stroke-width="2.2"/>
          <circle cx="15" cy="24" r="2" fill="#007aff"/>
          <circle cx="28" cy="12" r="2" fill="#ff3b30"/>
          <line x1="5" y1="6" x2="5" y2="30" stroke-width="1.6" opacity="0.6"/>
          <line x1="5" y1="30" x2="32" y2="30" stroke-width="1.6" opacity="0.6"/>
        </svg>
      `,
    },
  ];

  public static readonly OPTICS_EXPERIMENTS: OpticsExperimentDef[] = [
    {
      id: 'optics-reflection-refraction',
      name: '光的反射与折射',
      category: '几何光学与全反射',
      formula: 'n₁ sinθ₁ = n₂ sinθ₂ · θᵣ = θ₁',
      iconSvg: `
        <svg class="apple-sf-icon" viewBox="0 0 36 36" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="18" cy="18" r="14" stroke="#0284c7" stroke-width="2"/>
          <path d="M4 18 A14 14 0 0 0 32 18 Z" fill="#38bdf8" fill-opacity="0.18"/>
          <line x1="4" y1="18" x2="32" y2="18" stroke="#38bdf8" stroke-width="2.2"/>
          <line x1="18" y1="4" x2="18" y2="32" stroke="#94a3b8" stroke-width="1.6" stroke-dasharray="3 1.5"/>
          <line x1="8" y1="8" x2="18" y2="18" stroke="#ff3b30" stroke-width="2.4"/>
          <polyline points="12,8.5 8,8 10,12" stroke="#ff3b30" stroke-width="1.8"/>
          <line x1="18" y1="18" x2="28" y2="8" stroke="#ff3b30" stroke-width="2"/>
          <polyline points="24,10 28,8 26,12" stroke="#ff3b30" stroke-width="1.6"/>
          <line x1="18" y1="18" x2="25" y2="30" stroke="#ff3b30" stroke-width="2.2"/>
          <polyline points="23,26 25,30 21,28" stroke="#ff3b30" stroke-width="1.8"/>
          <circle cx="18" cy="18" r="1.8" fill="#ff3b30"/>
        </svg>
      `,
    },
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

  public getCurrentDiscipline(): 'optics' | 'thermo' | 'em' | 'mechanics' {
    return this.currentDiscipline;
  }

  /**
   * 渲染一级界面：物理二级学科分支选择网格
   */
  public showLevel1(): void {
    this.currentLevel = 1;
    this.callbacks.onLevelChange?.(1, '物理学科');

    this.element.innerHTML = `
      <div class="physics-level-container physics-level-1">
        <!-- Minimalist Navigation Header -->
        <div class="physics-nav-bar">
          <h2 class="physics-level-title">物理学</h2>
        </div>

        <!-- 4 Physics Branches Grid (Pure Frosted Tiles) -->
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

          <!-- 2. Mechanics (Ready -> Click to enter Level 2) -->
          <div class="physics-branch-tile ready" id="branch-tile-mechanics" role="button" tabindex="0" title="进入力学实验">
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
          </div>

          <!-- 3. Thermodynamics (Ready) -->
          <div class="physics-branch-tile ready" id="branch-tile-thermo" role="button" tabindex="0" title="进入热学实验">
            <div class="branch-tile-icon-box">
              <svg class="apple-sf-icon branch-tile-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z"/>
              </svg>
            </div>
            <h3 class="branch-tile-name">热学实验</h3>
          </div>

          <!-- 4. Electromagnetism (Ready -> Click to enter Level 2) -->
          <div class="physics-branch-tile ready" id="branch-tile-em" role="button" tabindex="0" title="进入电磁学实验">
            <div class="branch-tile-icon-box">
              <svg class="apple-sf-icon branch-tile-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
              </svg>
            </div>
            <h3 class="branch-tile-name">电磁学</h3>
          </div>
        </div>

        <!-- VisionOS Dynamic Floating Toast Indicator -->
        <div class="physics-floating-toast" id="physics-floating-toast"></div>
      </div>
    `;

    this.bindLevel1Events();
  }

  /**
   * 渲染二级界面：实验目录列表（光学、力学、热学或电磁学）
   */
  public showLevel2(discipline: 'optics' | 'thermo' | 'em' | 'mechanics' = 'optics'): void {
    this.currentLevel = 2;
    this.currentDiscipline = discipline;
    const title = discipline === 'thermo'
      ? '热学实验'
      : discipline === 'em'
      ? '电磁学实验'
      : discipline === 'mechanics'
      ? '力学实验'
      : '光学实验';
    this.callbacks.onLevelChange?.(2, title);

    const experiments = discipline === 'thermo'
      ? PhysicsDisciplineModal.THERMO_EXPERIMENTS
      : discipline === 'em'
      ? PhysicsDisciplineModal.EM_EXPERIMENTS
      : discipline === 'mechanics'
      ? PhysicsDisciplineModal.MECHANICS_EXPERIMENTS
      : PhysicsDisciplineModal.OPTICS_EXPERIMENTS;

    this.element.innerHTML = `
      <div class="physics-level-container physics-level-2">
        <!-- Minimalist Navigation Header -->
        <div class="physics-nav-bar">
          <h2 class="physics-level-title">${title}</h2>
        </div>

        <!-- 4 Core Experiments 2x2 Spatial Grid -->
        <div class="optics-exp-deck">
          ${experiments.map(
            (exp) => `
            <div class="optics-card ${(exp as any).planned ? 'planned-card' : ''}" data-exp-id="${exp.id}" data-planned="${(exp as any).planned ? 'true' : 'false'}" data-formula="${exp.formula}" role="button" tabindex="0">
              <div class="optics-card-icon-box">${exp.iconSvg}</div>
              <h3 class="optics-card-name">${exp.name}</h3>
              ${(exp as any).planned ? '<span class="branch-tile-badge planned" style="margin-top: 4px;">规划中</span>' : `
              <div class="optics-card-action">
                <svg class="apple-sf-icon action-arrow" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="9 18 15 12 9 6"/>
                </svg>
              </div>`}
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
    // 光学卡片 -> 进入二级界面（光学实验目录）
    const opticsTile = this.element.querySelector('#branch-tile-optics');
    opticsTile?.addEventListener('click', () => {
      this.showLevel2('optics');
    });
    opticsTile?.addEventListener('keydown', (e) => {
      if ((e as KeyboardEvent).key === 'Enter' || (e as KeyboardEvent).key === ' ') {
        this.showLevel2('optics');
      }
    });

    // 热学卡片 -> 进入二级界面（热学实验目录）
    const thermoTile = this.element.querySelector('#branch-tile-thermo');
    thermoTile?.addEventListener('click', () => {
      this.showLevel2('thermo');
    });
    thermoTile?.addEventListener('keydown', (e) => {
      if ((e as KeyboardEvent).key === 'Enter' || (e as KeyboardEvent).key === ' ') {
        this.showLevel2('thermo');
      }
    });

    // 电磁学卡片 -> 进入二级界面（电磁学实验目录）
    const emTile = this.element.querySelector('#branch-tile-em');
    emTile?.addEventListener('click', () => {
      this.showLevel2('em');
    });
    emTile?.addEventListener('keydown', (e) => {
      if ((e as KeyboardEvent).key === 'Enter' || (e as KeyboardEvent).key === ' ') {
        this.showLevel2('em');
      }
    });

    // 力学卡片 -> 进入二级界面（力学实验目录）
    const mechTile = this.element.querySelector('#branch-tile-mechanics');
    mechTile?.addEventListener('click', () => {
      this.showLevel2('mechanics');
    });
    mechTile?.addEventListener('keydown', (e) => {
      if ((e as KeyboardEvent).key === 'Enter' || (e as KeyboardEvent).key === ' ') {
        this.showLevel2('mechanics');
      }
    });

    // 规划中分支卡片 -> 弹出提示（目前四大物理分支均已上线）
  }

  private bindLevel2Events(): void {
    // 实验卡片点击加载对应实验
    this.element.querySelectorAll('.optics-card').forEach((card) => {
      const expId = (card as HTMLElement).getAttribute('data-exp-id');
      const isPlanned = (card as HTMLElement).getAttribute('data-planned') === 'true';
      const handleSelect = () => {
        if (!expId) return;
        if (isPlanned) {
          this.showToast('该实验正在规划中，即将上线');
          return;
        }
        if (this.callbacks.onSelectExperiment) {
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
