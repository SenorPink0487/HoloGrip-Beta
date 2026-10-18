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
      id: 'mech-free-fall',
      name: '自由落体与牛顿管实验',
      category: '自由落体与空气阻力对比',
      formula: 'h = \\frac{1}{2}gt^2 · v = gt',
      iconSvg: `
        <svg class="apple-sf-icon" viewBox="0 0 36 36" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
          <!-- Newton Tube Body -->
          <rect x="7" y="3" width="9" height="30" rx="3.5" stroke-width="2.2" fill="currentColor" fill-opacity="0.08"/>
          <!-- Falling Coin -->
          <circle cx="11.5" cy="28" r="2.2" fill="#facc15" stroke="currentColor" stroke-width="1.2"/>
          <!-- Falling Cork -->
          <rect x="10" y="20" width="3" height="4" rx="1" fill="#b45309" stroke="currentColor" stroke-width="1"/>
          <!-- Falling Feather -->
          <path d="M11.5 8 C13.5 10 13.5 13 11.5 15 C9.5 13 9.5 10 11.5 8 Z" fill="#38bdf8" fill-opacity="0.9" stroke="currentColor" stroke-width="1"/>
          <line x1="11.5" y1="7" x2="11.5" y2="16" stroke="currentColor" stroke-width="1"/>
          <!-- Connecting Hose to Pump -->
          <path d="M11.5 33 Q18 34 22 28 Q24 24 25 21" stroke="#38bdf8" stroke-width="1.8" stroke-linecap="round"/>
          <!-- Vacuum Pump -->
          <rect x="23" y="16" width="10" height="9" rx="1.5" stroke-width="2.0" fill="currentColor" fill-opacity="0.12"/>
          <circle cx="28" cy="20.5" r="2.4" stroke="#ef4444" stroke-width="1.2" fill="#ef4444" fill-opacity="0.2"/>
          <line x1="28" y1="20.5" x2="29.5" y2="19.5" stroke="#ef4444" stroke-width="1.4"/>
          <!-- Rotation Symbol -->
          <path d="M19 8 A 4 4 0 0 1 23 12" stroke="#a855f7" stroke-width="1.8" stroke-linecap="round"/>
          <polyline points="23,9.5 23,12 20.5,12" stroke="#a855f7" stroke-width="1.5"/>
        </svg>
      `,
    },
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
    {
      id: 'mech-center-of-gravity',
      name: '悬挂法测物体重心',
      category: '二力平衡与重心测定',
      formula: '\\vec{\\tau}_{net} = 0 \\implies G \\in \\text{Line}_1 \\cap \\text{Line}_2',
      iconSvg: `
        <svg class="apple-sf-icon" viewBox="0 0 36 36" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
          <!-- Retort Stand & Cord -->
          <line x1="18" y1="3" x2="18" y2="13" stroke="#94a3b8" stroke-width="2"/>
          <circle cx="18" cy="13" r="1.8" fill="#facc15" stroke="currentColor" stroke-width="1"/>
          <!-- Acrylic Irregular Plate Outline -->
          <polygon points="11,13 26,11 28,25 16,31 8,24" stroke="#38bdf8" stroke-width="2" fill="#38bdf8" fill-opacity="0.18"/>
          <!-- Holes -->
          <circle cx="18" cy="13" r="1.4" fill="#f59e0b"/>
          <circle cx="24" cy="15" r="1.4" fill="#f59e0b"/>
          <circle cx="12" cy="22" r="1.4" fill="#f59e0b"/>
          <!-- Intersecting Red Plumb Lines -->
          <line x1="18" y1="13" x2="17" y2="30" stroke="#ef4444" stroke-width="1.8"/>
          <line x1="24" y1="15" x2="10" y2="25" stroke="#ef4444" stroke-width="1.8"/>
          <!-- Center of Gravity G -->
          <circle cx="17.2" cy="20.5" r="2.4" fill="#ef4444" stroke="#facc15" stroke-width="1.5"/>
        </svg>
      `,
    },
    {
      id: 'mech-newton-cannon',
      name: '牛顿大炮',
      category: '万有引力与人造地球卫星',
      formula: 'v_1 = \\sqrt{\\frac{GM}{R}} \\approx 7.91\\text{ km/s}',
      iconSvg: `
        <svg class="apple-sf-icon" viewBox="0 0 36 36" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
          <!-- Earth Globe -->
          <circle cx="18" cy="22" r="10" stroke="#38bdf8" stroke-width="2" fill="#0284c7" fill-opacity="0.2"/>
          <ellipse cx="18" cy="22" rx="10" ry="3.5" stroke="#38bdf8" stroke-width="1" stroke-dasharray="2 1.5"/>
          <!-- Mountain and Cannon -->
          <polygon points="17,12 19,12 18,8" fill="#e2e8f0" stroke="currentColor" stroke-width="1"/>
          <line x1="18" y1="8" x2="22" y2="8" stroke="#f59e0b" stroke-width="1.8"/>
          <!-- Cannonball Orbital Path -->
          <path d="M 22,8 C 32,8 32,32 18,32 C 6,32 6,10 18,8" stroke="#34d399" stroke-width="1.8" stroke-dasharray="3 1.5"/>
          <!-- Satellite -->
          <circle cx="18" cy="32" r="2" fill="#34d399" stroke="#ffffff" stroke-width="1"/>
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
      id: 'em-capacitor-discharge',
      name: '电容器充放电过程',
      category: '电容储能与RC暂态电路',
      formula: 'I(t) = (E/R) · e^{-t/RC}',
      iconSvg: `
        <svg class="apple-sf-icon" viewBox="0 0 36 36" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
          <!-- Capacitor Plates -->
          <line x1="14" y1="8" x2="14" y2="28" stroke="#38bdf8" stroke-width="2.6"/>
          <line x1="22" y1="8" x2="22" y2="28" stroke="#38bdf8" stroke-width="2.6"/>
          <!-- Leads -->
          <line x1="4" y1="18" x2="14" y2="18" stroke="#facc15" stroke-width="2.2"/>
          <line x1="22" y1="18" x2="32" y2="18" stroke="#facc15" stroke-width="2.2"/>
          <!-- SPDT Switch blade & contacts -->
          <circle cx="6" cy="18" r="1.8" fill="#facc15"/>
          <path d="M6 18 L11 11" stroke="#f59e0b" stroke-width="2"/>
          <circle cx="12" cy="10" r="1.5" fill="#38bdf8"/>
          <circle cx="12" cy="26" r="1.5" fill="#f59e0b"/>
          <!-- Exponential decay curve -->
          <path d="M16 11 Q 19 16 28 17" stroke="#34d399" stroke-width="1.8" stroke-dasharray="2 1.5"/>
          <polyline points="26,15 28,17 26,19" stroke="#34d399" stroke-width="1.6"/>
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
      id: 'optics-diffraction',
      name: '光的衍射',
      category: '波动光学与夫琅禾费衍射',
      formula: 'a sinθ = kλ · I = I₀ sinc²β',
      iconSvg: `
        <svg class="apple-sf-icon" viewBox="0 0 36 36" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
          <!-- 激光源与狭缝 -->
          <rect x="3" y="15" width="6" height="6" rx="1" fill="#38bdf8" fill-opacity="0.3" stroke="#38bdf8" stroke-width="1.8"/>
          <line x1="9" y1="18" x2="16" y2="18" stroke="#38bdf8" stroke-width="2.2"/>
          <line x1="16" y1="6" x2="16" y2="15" stroke="#94a3b8" stroke-width="2.4"/>
          <line x1="16" y1="21" x2="16" y2="30" stroke="#94a3b8" stroke-width="2.4"/>
          <!-- 衍射发散光羽 -->
          <line x1="16" y1="18" x2="31" y2="8" stroke="#38bdf8" stroke-width="1.8" opacity="0.75" stroke-dasharray="2 1.5"/>
          <line x1="16" y1="18" x2="33" y2="18" stroke="#38bdf8" stroke-width="2.6"/>
          <line x1="16" y1="18" x2="31" y2="28" stroke="#38bdf8" stroke-width="1.8" opacity="0.75" stroke-dasharray="2 1.5"/>
          <!-- 投影屏与光强条纹 -->
          <line x1="33" y1="5" x2="33" y2="31" stroke="#f8fafc" stroke-width="2.2"/>
          <circle cx="33" cy="18" r="2.8" fill="#38bdf8"/>
          <circle cx="33" cy="11" r="1.6" fill="#38bdf8" fill-opacity="0.7"/>
          <circle cx="33" cy="25" r="1.6" fill="#38bdf8" fill-opacity="0.7"/>
          <circle cx="33" cy="7" r="1.0" fill="#38bdf8" fill-opacity="0.4"/>
          <circle cx="33" cy="29" r="1.0" fill="#38bdf8" fill-opacity="0.4"/>
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
    this.callbacks.onLevelChange?.(1, '物理学');

    this.element.innerHTML = `
      <div class="physics-level-container physics-level-1">
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
