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
  private currentDiscipline: 'optics' | 'em' | 'mechanics' | 'thermo' = 'optics';
  private toastTimeout: ReturnType<typeof setTimeout> | null = null;
  private navTransition: 'push' | 'pop' | 'none' = 'none';

  public static readonly THERMO_EXPERIMENTS: (OpticsExperimentDef & { planned?: boolean })[] = [
    {
      id: 'thermo-carnot',
      name: '卡诺热机',
      category: '理想气体卡诺循环与热力学第二定律',
      formula: '\\eta = 1 - \\frac{T_c}{T_h} = \\frac{W}{Q_h}',
      iconSvg: `
        <svg class="apple-sf-icon" viewBox="0 0 36 36" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
          <!-- Working Cylinder Barrel -->
          <rect x="4" y="13" width="16" height="10" rx="2" stroke-width="1.8" fill="currentColor" fill-opacity="0.08"/>
          <!-- Piston Head & Connecting Rod -->
          <line x1="13" y1="14" x2="13" y2="22" stroke-width="2.4"/>
          <line x1="13" y1="18" x2="26" y2="15" stroke-width="1.8"/>
          <!-- Flywheel & Crank Journal -->
          <circle cx="27" cy="18" r="6" stroke-width="1.8" fill="currentColor" fill-opacity="0.06"/>
          <circle cx="27" cy="18" r="1.6" fill="currentColor"/>
          <!-- Top Pressure Gauge -->
          <circle cx="12" cy="7" r="3.2" stroke-width="1.5"/>
          <line x1="12" y1="10.2" x2="12" y2="13" stroke-width="1.5"/>
          <line x1="12" y1="7" x2="13.5" y2="5.5" stroke-width="1.3"/>
          <!-- P-V Cycle Indicator Curve Below -->
          <path d="M7 27 Q 15 28 21 31 Q 13 30 7 27 Z" stroke-width="1.3" stroke-opacity="0.65" fill="currentColor" fill-opacity="0.12"/>
        </svg>
      `,
    },
    {
      id: 'thermo-fire-syringe',
      name: '空气压缩引火仪',
      category: '绝热压缩做功与内能转化',
      formula: '\\Delta U = W + Q,\\; Q \\approx 0 \\implies T \\uparrow',
      iconSvg: `
        <svg class="apple-sf-icon" viewBox="0 0 36 36" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
          <!-- Ergonomic T-Handlebar & Grip Spheres -->
          <line x1="10" y1="5" x2="26" y2="5" stroke-width="2.0"/>
          <circle cx="9.5" cy="5" r="2.0" fill="currentColor"/>
          <circle cx="26.5" cy="5" r="2.0" fill="currentColor"/>
          <!-- Piston Rod & Double-Sealed Piston Head -->
          <line x1="18" y1="5" x2="18" y2="16" stroke-width="2.0"/>
          <rect x="13" y="16" width="10" height="3.6" rx="1" stroke-width="1.6" fill="currentColor" fill-opacity="0.22"/>
          <!-- Transparent Cylinder & Side Tie-Rods -->
          <rect x="12" y="10" width="12" height="20" rx="1.5" stroke-width="1.7" fill="currentColor" fill-opacity="0.06"/>
          <line x1="9.5" y1="10" x2="9.5" y2="31" stroke-width="1.2" stroke-opacity="0.55"/>
          <line x1="26.5" y1="10" x2="26.5" y2="31" stroke-width="1.2" stroke-opacity="0.55"/>
          <!-- Adiabatic Ignition Flame in Bottom Chamber -->
          <path d="M18 22.5 C19.8 24.5 20.2 26.8 18 28.5 C15.8 26.8 16.2 24.5 18 22.5 Z" stroke-width="1.4" fill="currentColor" fill-opacity="0.35"/>
          <!-- Heavy Base Plate -->
          <line x1="7" y1="31.5" x2="29" y2="31.5" stroke-width="2.4"/>
        </svg>
      `,
    },
    {
      id: 'thermo-fourier',
      name: '固体热传导与傅里叶定律',
      category: '一维热传导温度梯度与导热系数测定',
      formula: 'q = -k \\frac{\\mathrm{d}T}{\\mathrm{d}x}',
      iconSvg: `
        <svg class="apple-sf-icon" viewBox="0 0 36 36" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
          <!-- Overhead 5-Channel Temperature Monitor -->
          <rect x="9" y="5" width="18" height="6" rx="1.2" stroke-width="1.6" fill="currentColor" fill-opacity="0.08"/>
          <!-- 5 Thermocouple Probe Leads -->
          <line x1="11.5" y1="11" x2="11.5" y2="18" stroke-width="1.3" stroke-opacity="0.75"/>
          <line x1="14.75" y1="11" x2="14.75" y2="18" stroke-width="1.3" stroke-opacity="0.75"/>
          <line x1="18" y1="11" x2="18" y2="18" stroke-width="1.3" stroke-opacity="0.75"/>
          <line x1="21.25" y1="11" x2="21.25" y2="18" stroke-width="1.3" stroke-opacity="0.75"/>
          <line x1="24.5" y1="11" x2="24.5" y2="18" stroke-width="1.3" stroke-opacity="0.75"/>
          <!-- Left Heating Furnace & Right Cooling Chamber -->
          <rect x="3" y="16" width="6.5" height="8" rx="1.2" stroke-width="1.7" fill="currentColor" fill-opacity="0.22"/>
          <rect x="26.5" y="16" width="6.5" height="8" rx="1.2" stroke-width="1.7" fill="currentColor" fill-opacity="0.06"/>
          <!-- Central Solid Conduction Rod -->
          <rect x="9.5" y="18" width="17" height="4" stroke-width="1.7" fill="currentColor" fill-opacity="0.14"/>
          <!-- Support Pillars & Precision Base Rail -->
          <line x1="13" y1="22" x2="13" y2="28" stroke-width="1.5"/>
          <line x1="23" y1="22" x2="23" y2="28" stroke-width="1.5"/>
          <line x1="3" y1="28.5" x2="33" y2="28.5" stroke-width="2.2"/>
        </svg>
      `,
    },
    {
      id: 'thermo-phase-change',
      name: '晶体与非晶体相变与潜热',
      category: '水浴加热固液共存熔点平台与非晶体连续软化对比',
      formula: 'Q_L = m L_f,\\; \\Delta T_{\\text{crystal}} = 0',
      iconSvg: `
        <svg class="apple-sf-icon" viewBox="0 0 36 36" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
          <!-- Left Water Bath Beaker & Immersed Test Tube -->
          <rect x="4" y="12" width="11" height="14" rx="1.5" stroke-width="1.6" fill="currentColor" fill-opacity="0.08"/>
          <rect x="7.8" y="8" width="3.4" height="14.5" rx="1.7" stroke-width="1.4" fill="currentColor" fill-opacity="0.18"/>
          <line x1="9.5" y1="4.5" x2="9.5" y2="19" stroke-width="1.4"/>
          <!-- Heating Flame & Base under Beaker -->
          <path d="M9.5 27.5 C10.8 29 11 30.5 9.5 31.8 C8 30.5 8.2 29 9.5 27.5 Z" stroke-width="1.3" fill="currentColor" fill-opacity="0.32"/>
          <line x1="3.5" y1="26.2" x2="15.5" y2="26.2" stroke-width="1.8"/>
          <!-- Right Multi-Channel Temperature Data Logger & T-t Curves -->
          <rect x="18" y="10" width="15" height="16" rx="2" stroke-width="1.7" fill="currentColor" fill-opacity="0.06"/>
          <!-- Crystalline 3-Stage Plateau Curve -->
          <polyline points="20.2,23 23.2,17 28.5,17 30.8,13.2" stroke-width="1.7"/>
          <!-- Amorphous Smooth Continuous Curve -->
          <path d="M20.2 23 Q 25 19.2 30.8 17.5" stroke-width="1.3" stroke-dasharray="1.8 1.5" stroke-opacity="0.65"/>
        </svg>
      `,
    },
    {
      id: 'thermo-gas-laws',
      name: '气体实验三定律',
      category: '玻意耳等温 · 查理等容 · 盖-吕萨克等压过程',
      formula: 'pV = C_1 \\cdot \\frac{p}{T} = C_2 \\cdot \\frac{V}{T} = C_3',
      iconSvg: `
        <svg class="apple-sf-icon" viewBox="0 0 36 36" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
          <!-- Piston T-Handle & Rod -->
          <line x1="6.5" y1="5" x2="15.5" y2="5" stroke-width="2.0"/>
          <line x1="11" y1="5" x2="11" y2="14" stroke-width="1.8"/>
          <!-- Graduated Gas Cylinder & Piston Head -->
          <rect x="6" y="9.5" width="10" height="18.5" rx="1.5" stroke-width="1.7" fill="currentColor" fill-opacity="0.08"/>
          <rect x="6.8" y="14" width="8.4" height="2.8" rx="0.8" stroke-width="1.5" fill="currentColor" fill-opacity="0.28"/>
          <!-- Ideal Gas Molecules Inside Cylinder -->
          <circle cx="9" cy="20" r="1.0" fill="currentColor"/>
          <circle cx="13" cy="21.5" r="1.0" fill="currentColor"/>
          <circle cx="10.5" cy="24.5" r="1.0" fill="currentColor"/>
          <!-- Bourdon Pressure Gauge & Right P-V / P-T Telemetry Screen -->
          <circle cx="21" cy="10" r="3.2" stroke-width="1.5"/>
          <line x1="21" y1="10" x2="22.5" y2="8.5" stroke-width="1.3"/>
          <rect x="19" y="16" width="13.5" height="12" rx="1.6" stroke-width="1.6" fill="currentColor" fill-opacity="0.06"/>
          <path d="M21.5 18.5 Q 23.2 25 29.8 25.8" stroke-width="1.6"/>
          <line x1="21.5" y1="25.8" x2="29.8" y2="19.2" stroke-width="1.3" stroke-dasharray="1.6 1.4" stroke-opacity="0.7"/>
          <!-- Base Plinth -->
          <line x1="4" y1="30.5" x2="32.5" y2="30.5" stroke-width="2.2"/>
        </svg>
      `,
    },
  ];

  public static readonly MECHANICS_EXPERIMENTS: (OpticsExperimentDef & { planned?: boolean })[] = [
    {
      id: 'mech-free-fall',
      name: '自由落体与牛顿管实验',
      category: '自由落体与空气阻力对比',
      formula: 'h = \\frac{1}{2}gt^2 · v = gt',
      iconSvg: `
        <svg class="apple-sf-icon" viewBox="0 0 36 36" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
          <!-- Precision Vacuum Glass Tube -->
          <rect x="11" y="4" width="14" height="28" rx="7" stroke-width="1.8" fill="currentColor" fill-opacity="0.06"/>
          <!-- Top & Bottom Flanges -->
          <line x1="14" y1="4" x2="22" y2="4" stroke-width="2.2"/>
          <line x1="14" y1="32" x2="22" y2="32" stroke-width="2.2"/>
          <!-- Synchronous Fall Velocity Vectors -->
          <line x1="15" y1="11" x2="15" y2="15" stroke-width="1.2" stroke-dasharray="1.5 1.5" stroke-opacity="0.5"/>
          <line x1="21" y1="11" x2="21" y2="15" stroke-width="1.2" stroke-dasharray="1.5 1.5" stroke-opacity="0.5"/>
          <!-- Falling Sphere (Coin) -->
          <circle cx="15" cy="19.5" r="2.2" fill="currentColor"/>
          <!-- Falling Feather -->
          <path d="M21 17 C22.8 18.5 22.8 21 21 22.5 C19.2 21 19.2 18.5 21 17 Z" stroke-width="1.2" fill="currentColor" fill-opacity="0.3"/>
          <line x1="21" y1="16.5" x2="21" y2="23" stroke-width="1"/>
          <!-- Downward Gravitational Acceleration Arrow -->
          <path d="M16.5 26.5 L18 28 L19.5 26.5" stroke-width="1.4"/>
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
          <!-- Symmetrical Incline Track -->
          <path d="M5 14 Q 12 28 18 28 Q 24 28 31 14" stroke-width="2"/>
          <!-- Equal Height Datum Line h1 = h2 -->
          <line x1="4" y1="14" x2="32" y2="14" stroke-width="1.2" stroke-dasharray="2.5 2" stroke-opacity="0.4"/>
          <!-- Starting Rolling Sphere at h1 -->
          <circle cx="6.5" cy="14" r="2.4" fill="currentColor"/>
          <!-- Target Equal-Height Sphere at h2 -->
          <circle cx="29.5" cy="14" r="2.4" stroke-width="1.4" stroke-dasharray="2 1.5" fill="currentColor" fill-opacity="0.18"/>
          <!-- Kinetic Motion Path along Valley -->
          <path d="M14 24.5 Q 18 26.5 22 24.5" stroke-width="1.4" stroke-opacity="0.7"/>
          <polyline points="20.5,23.5 22.5,24.5 21,26.5" stroke-width="1.3" stroke-opacity="0.7"/>
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
          <!-- Top Pivot & Suspension Cord -->
          <circle cx="18" cy="4.5" r="1.5" fill="currentColor"/>
          <line x1="18" y1="6" x2="18" y2="9.5" stroke-width="1.5"/>
          <!-- Irregular Lamina Outline -->
          <polygon points="18,9.5 29,13 27,27 16,31 7,24 10,13" stroke-width="1.8" fill="currentColor" fill-opacity="0.08"/>
          <!-- Plumb Line 1 (Vertical) -->
          <line x1="18" y1="9.5" x2="18" y2="28" stroke-width="1.4" stroke-opacity="0.45"/>
          <!-- Plumb Line 2 (Crossline from Hole 2) -->
          <line x1="10" y1="13" x2="25.5" y2="26.5" stroke-width="1.4" stroke-dasharray="2.5 1.5" stroke-opacity="0.45"/>
          <!-- Center of Gravity G (Intersection Reticle) -->
          <circle cx="18" cy="20" r="3.2" stroke-width="1.3"/>
          <circle cx="18" cy="20" r="1.3" fill="currentColor"/>
        </svg>
      `,
    },
    {
      id: 'mech-newton-third',
      name: '牛顿第三定律',
      category: '作用力与反作用力',
      formula: '\\vec{F}_{1} = -\\vec{F}_{2}',
      iconSvg: `
        <svg class="apple-sf-icon" viewBox="0 0 36 36" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
          <!-- Left Spring Balance A -->
          <rect x="3" y="14" width="11" height="8" rx="2" stroke-width="1.8" fill="currentColor" fill-opacity="0.08"/>
          <line x1="6" y1="18" x2="11" y2="18" stroke-width="1.2" stroke-dasharray="1.5 1" stroke-opacity="0.5"/>
          <path d="M 14,18 C 16,18 16,15.5 17.5,16 C 18.2,16.5 18.2,19.5 17.5,20" stroke-width="1.6"/>
          <!-- Right Spring Balance B -->
          <rect x="22" y="14" width="11" height="8" rx="2" stroke-width="1.8" fill="currentColor" fill-opacity="0.08"/>
          <line x1="25" y1="18" x2="30" y2="18" stroke-width="1.2" stroke-dasharray="1.5 1" stroke-opacity="0.5"/>
          <path d="M 22,18 C 20,18 20,20.5 18.5,20 C 17.8,19.5 17.8,16.5 18.5,16" stroke-width="1.6"/>
          <!-- Opposing Action-Reaction Vectors F1 and F2 -->
          <line x1="20" y1="9" x2="9" y2="9" stroke-width="1.6"/>
          <polyline points="12,6.5 9,9 12,11.5" stroke-width="1.4"/>
          <line x1="16" y1="27" x2="27" y2="27" stroke-width="1.6"/>
          <polyline points="24,24.5 27,27 24,29.5" stroke-width="1.4"/>
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
          <!-- Terrestrial Celestial Sphere -->
          <circle cx="18" cy="21" r="9" stroke-width="1.8" fill="currentColor" fill-opacity="0.08"/>
          <ellipse cx="18" cy="21" rx="9" ry="3.2" stroke-width="1" stroke-dasharray="2 1.5" stroke-opacity="0.3"/>
          <!-- Mountaintop Launch Apex -->
          <path d="M16 12.5 L18 9 L20 12.5" stroke-width="1.4" stroke-linejoin="round" fill="currentColor" fill-opacity="0.2"/>
          <!-- Sub-orbital Fall Trajectory -->
          <path d="M18 9 Q 23.5 9.5 24 15" stroke-width="1.2" stroke-dasharray="1.8 1.5" stroke-opacity="0.35"/>
          <!-- Complete Closed Orbital Ellipse -->
          <ellipse cx="18" cy="19" rx="14" ry="11" stroke-width="1.8" transform="rotate(-15 18 19)"/>
          <!-- Satellite Node in Orbit -->
          <circle cx="31" cy="14" r="1.8" fill="currentColor"/>
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
          <!-- Conductor Prism in Isometric Perspective -->
          <path d="M7 15 L13 10 L31 10 L25 15 Z" stroke-width="1.5" fill="currentColor" fill-opacity="0.12"/>
          <rect x="7" y="15" width="18" height="10" rx="1" stroke-width="1.8" fill="currentColor" fill-opacity="0.06"/>
          <path d="M25 15 L31 10 L31 20 L25 25 Z" stroke-width="1.5" fill="currentColor" fill-opacity="0.1"/>
          <!-- Magnetic Field B Vector (Vertical Arrow) -->
          <line x1="19" y1="31" x2="19" y2="5" stroke-width="1.4" stroke-dasharray="3 1.5" stroke-opacity="0.5"/>
          <polyline points="17,7 19,4 21,7" stroke-width="1.4" stroke-opacity="0.6"/>
          <!-- Current I Vector -->
          <line x1="2" y1="20" x2="7" y2="20" stroke-width="1.8"/>
          <polyline points="5,18.5 7,20 5,21.5" stroke-width="1.5"/>
          <!-- Hall Transverse Potential Indicators -->
          <circle cx="16" cy="12.5" r="1.3" fill="currentColor"/>
          <circle cx="16" cy="25" r="1.3" fill="currentColor" fill-opacity="0.4"/>
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
          <!-- Positive Source Node (+) -->
          <circle cx="10" cy="18" r="4.5" stroke-width="1.8" fill="currentColor" fill-opacity="0.1"/>
          <line x1="8" y1="18" x2="12" y2="18" stroke-width="1.6"/>
          <line x1="10" y1="16" x2="10" y2="20" stroke-width="1.6"/>
          <!-- Negative Sink Node (-) -->
          <circle cx="26" cy="18" r="4.5" stroke-width="1.8" fill="currentColor" fill-opacity="0.1"/>
          <line x1="24" y1="18" x2="28" y2="18" stroke-width="1.6"/>
          <!-- Axial Electric Field Vector -->
          <line x1="14.5" y1="18" x2="21.5" y2="18" stroke-width="1.6"/>
          <polyline points="18.5,16.5 20.5,18 18.5,19.5" stroke-width="1.4"/>
          <!-- Upper & Lower Curved Field Lines with Direction Chevrons -->
          <path d="M12 14 C 14.5 6.5 21.5 6.5 24 14" stroke-width="1.4" stroke-opacity="0.6"/>
          <polyline points="17,7.5 19,8.5 18,10.5" stroke-width="1.3" stroke-opacity="0.6"/>
          <path d="M12 22 C 14.5 29.5 21.5 29.5 24 22" stroke-width="1.4" stroke-opacity="0.6"/>
          <polyline points="17,28.5 19,27.5 18,25.5" stroke-width="1.3" stroke-opacity="0.6"/>
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
          <!-- Precision Capacitor Plates -->
          <line x1="15" y1="8" x2="15" y2="28" stroke-width="2.4"/>
          <line x1="21" y1="8" x2="21" y2="28" stroke-width="2.4"/>
          <!-- Circuit Leads & Terminals -->
          <line x1="4" y1="18" x2="15" y2="18" stroke-width="1.8"/>
          <line x1="21" y1="18" x2="32" y2="18" stroke-width="1.8"/>
          <circle cx="4" cy="18" r="1.5" fill="currentColor"/>
          <circle cx="32" cy="18" r="1.5" fill="currentColor"/>
          <!-- Exponential Transient Curve with Arrow -->
          <path d="M8 9 Q 17 21 28 22" stroke-width="1.6" stroke-dasharray="2.5 1.5" stroke-opacity="0.65"/>
          <polyline points="26,20.5 28,22 26,23.5" stroke-width="1.4" stroke-opacity="0.65"/>
        </svg>
      `,
    },
    {
      id: 'em-hand-rules',
      name: '右手螺旋与左右手定则',
      category: '安培右手螺旋 · 左手定则 · 右手定则 3D手部骨骼',
      formula: '\\vec{F} = I\\vec{L}\\times\\vec{B} · \\mathcal{E} = BLv',
      iconSvg: `
        <svg class="apple-sf-icon" viewBox="0 0 36 36" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
          <!-- Orthogonal Physical Vector Axes (I, B, F) & Articulated Hand Skeleton Nodes -->
          <line x1="12" y1="28" x2="12" y2="6" stroke-width="1.9"/>
          <polyline points="9.5,9 12,5.5 14.5,9" stroke-width="1.6"/>
          <line x1="12" y1="24" x2="31" y2="24" stroke-width="1.8"/>
          <polyline points="28,21.5 31.5,24 28,26.5" stroke-width="1.6"/>
          <!-- Magnetic Spiral Ring around Conductor Axis -->
          <path d="M6.5 15 C 6.5 12, 17.5 12, 17.5 15 C 17.5 18, 6.5 18, 6.5 15 Z" stroke-width="1.4" stroke-opacity="0.68"/>
          <!-- Articulated Phalanges & Porcelain Joint Nodes -->
          <circle cx="12" cy="24" r="2.1" fill="currentColor"/>
          <circle cx="19" cy="17" r="1.6" fill="currentColor" fill-opacity="0.85"/>
          <circle cx="24" cy="12" r="1.5" fill="currentColor" fill-opacity="0.7"/>
          <line x1="12" y1="24" x2="19" y2="17" stroke-width="1.6" stroke-dasharray="2 1.5"/>
          <line x1="19" y1="17" x2="24" y2="12" stroke-width="1.6"/>
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
          <!-- Refractive Medium Lower Half -->
          <rect x="4" y="18" width="28" height="14" rx="1" fill="currentColor" fill-opacity="0.08" stroke="none"/>
          <!-- Optical Interface -->
          <line x1="4" y1="18" x2="32" y2="18" stroke-width="1.8"/>
          <!-- Interface Normal -->
          <line x1="18" y1="5" x2="18" y2="31" stroke-width="1.2" stroke-dasharray="2 2" stroke-opacity="0.4"/>
          <!-- Incident Ray with Chevron -->
          <line x1="8" y1="8" x2="18" y2="18" stroke-width="2"/>
          <polyline points="12,10 14,14 10,14" stroke-width="1.4" fill="currentColor"/>
          <!-- Reflected Ray with Chevron -->
          <line x1="18" y1="18" x2="28" y2="8" stroke-width="2"/>
          <polyline points="24,10 26,10 26,12" stroke-width="1.4"/>
          <!-- Refracted Ray into Denser Medium with Chevron -->
          <line x1="18" y1="18" x2="24" y2="30" stroke-width="2"/>
          <polyline points="21,24 22.5,27 20,26" stroke-width="1.4"/>
          <!-- Boundary Vertex Node -->
          <circle cx="18" cy="18" r="1.6" fill="currentColor"/>
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
          <!-- Aperture Slit Obstacle -->
          <line x1="13" y1="5" x2="13" y2="15" stroke-width="2.2"/>
          <line x1="13" y1="21" x2="13" y2="31" stroke-width="2.2"/>
          <!-- Incident Planar Waves -->
          <line x1="5" y1="10" x2="5" y2="26" stroke-width="1.3" stroke-opacity="0.5"/>
          <line x1="9" y1="10" x2="9" y2="26" stroke-width="1.3" stroke-opacity="0.7"/>
          <!-- Central Axis -->
          <line x1="13" y1="18" x2="30" y2="18" stroke-width="1.8"/>
          <!-- Diffracted Wavefront Arcs -->
          <path d="M18 13 A 6 6 0 0 1 18 23" stroke-width="1.4" stroke-opacity="0.7"/>
          <path d="M23 9 A 11 11 0 0 1 23 27" stroke-width="1.4" stroke-opacity="0.45"/>
          <!-- Observation Screen & Intensity Maxima -->
          <line x1="31" y1="5" x2="31" y2="31" stroke-width="1.8" stroke-opacity="0.4"/>
          <circle cx="31" cy="18" r="2.4" fill="currentColor"/>
          <circle cx="31" cy="12" r="1.3" fill="currentColor" fill-opacity="0.5"/>
          <circle cx="31" cy="24" r="1.3" fill="currentColor" fill-opacity="0.5"/>
        </svg>
      `,
    },
    {
      id: 'optics-double-slit',
      name: '杨氏双缝干涉',
      category: '波动光学与相干叠加',
      formula: 'Δy = λL / d · d sinθ = kλ',
      iconSvg: `
        <svg class="apple-sf-icon" viewBox="0 0 36 36" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
          <!-- Incident Coherent Wavefronts -->
          <line x1="4" y1="10" x2="4" y2="26" stroke-width="1.3" stroke-opacity="0.45"/>
          <line x1="8" y1="10" x2="8" y2="26" stroke-width="1.4" stroke-opacity="0.75"/>
          <!-- Double-Slit Barrier with S1 & S2 Apertures -->
          <line x1="12" y1="4" x2="12" y2="11.5" stroke-width="2.2"/>
          <line x1="12" y1="15" x2="12" y2="21" stroke-width="2.2"/>
          <line x1="12" y1="24.5" x2="12" y2="32" stroke-width="2.2"/>
          <!-- Overlapping Coherent Spherical Wavefronts from S1 and S2 -->
          <path d="M12 8.5 A 5 5 0 0 1 12 18" stroke-width="1.3" stroke-opacity="0.65"/>
          <path d="M12 18 A 5 5 0 0 1 12 27.5" stroke-width="1.3" stroke-opacity="0.65"/>
          <path d="M12 4.5 A 9.5 9.5 0 0 1 12 22" stroke-width="1.3" stroke-opacity="0.5"/>
          <path d="M12 14 A 9.5 9.5 0 0 1 12 31.5" stroke-width="1.3" stroke-opacity="0.5"/>
          <path d="M15 2.5 A 14 14 0 0 1 15 25.5" stroke-width="1.2" stroke-dasharray="2 1.5" stroke-opacity="0.4"/>
          <path d="M15 10.5 A 14 14 0 0 1 15 33.5" stroke-width="1.2" stroke-dasharray="2 1.5" stroke-opacity="0.4"/>
          <!-- Observation Screen & Equidistant Interference Maxima (k = 0, ±1, ±2) -->
          <line x1="31" y1="4" x2="31" y2="32" stroke-width="1.8" stroke-opacity="0.4"/>
          <circle cx="31" cy="18" r="2.2" fill="currentColor"/>
          <circle cx="31" cy="12.5" r="1.9" fill="currentColor" fill-opacity="0.85"/>
          <circle cx="31" cy="23.5" r="1.9" fill="currentColor" fill-opacity="0.85"/>
          <circle cx="31" cy="7" r="1.5" fill="currentColor" fill-opacity="0.55"/>
          <circle cx="31" cy="29" r="1.5" fill="currentColor" fill-opacity="0.55"/>
        </svg>
      `,
    },
    {
      id: 'optics-dispersion',
      name: '光的色散',
      category: '棱镜光谱与柯西色散定律',
      formula: 'n(λ) = A + B/λ² · δ = θ₁ + θ₄ - α',
      iconSvg: `
        <svg class="apple-sf-icon" viewBox="0 0 36 36" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
          <!-- Equilateral Optical Prism Outline & Subtle Crystal Fill -->
          <polygon points="16,6 7,28 25,28" fill="currentColor" fill-opacity="0.10" stroke-width="2.0"/>
          <!-- Incident Collimated White Beam -->
          <line x1="3" y1="21" x2="11.5" y2="17" stroke-width="2.2"/>
          <!-- Internal Dispersion Wedge inside Prism -->
          <line x1="11.5" y1="17" x2="20" y2="15.8" stroke-width="1.4" stroke-opacity="0.85"/>
          <line x1="11.5" y1="17" x2="21.2" y2="18.8" stroke-width="1.4" stroke-opacity="0.65"/>
          <!-- Emergent Diverging Rainbow Spectral Fan (Red to Violet) -->
          <line x1="20" y1="15.8" x2="33" y2="13" stroke-width="1.7"/>
          <line x1="20.4" y1="16.8" x2="33" y2="17.5" stroke-width="1.6" stroke-opacity="0.85"/>
          <line x1="20.8" y1="17.8" x2="33" y2="22" stroke-width="1.6" stroke-opacity="0.70"/>
          <line x1="21.2" y1="18.8" x2="33" y2="26.5" stroke-width="1.7" stroke-opacity="0.55"/>
          <!-- Spectral Nodes on Screen -->
          <circle cx="33" cy="13" r="1.4" fill="currentColor"/>
          <circle cx="33" cy="17.5" r="1.3" fill="currentColor" fill-opacity="0.85"/>
          <circle cx="33" cy="22" r="1.3" fill="currentColor" fill-opacity="0.70"/>
          <circle cx="33" cy="26.5" r="1.4" fill="currentColor" fill-opacity="0.55"/>
        </svg>
      `,
    },
    {
      id: 'optics-polarization',
      name: '光的偏振',
      category: '马吕斯定律与三维螺旋双折射',
      formula: 'I = I₀ cos²θ · Δφ = 2π d Δn / λ',
      iconSvg: `
        <svg class="apple-sf-icon" viewBox="0 0 36 36" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
          <!-- Optical Propagation Axis -->
          <line x1="2" y1="18" x2="34" y2="18" stroke-width="1.2" stroke-dasharray="2 2" stroke-opacity="0.45"/>
          <!-- Unpolarized Starburst E-Vectors (Left) -->
          <line x1="5.5" y1="12.5" x2="5.5" y2="23.5" stroke-width="1.5"/>
          <line x1="2.8" y1="15.3" x2="8.2" y2="20.7" stroke-width="1.4" stroke-opacity="0.75"/>
          <line x1="2.8" y1="20.7" x2="8.2" y2="15.3" stroke-width="1.4" stroke-opacity="0.75"/>
          <!-- Polarizer P1 Disc & Vertical Slit Grid -->
          <ellipse cx="13" cy="18" rx="2.6" ry="8.8" fill="currentColor" fill-opacity="0.10" stroke-width="1.8"/>
          <line x1="13" y1="10.5" x2="13" y2="25.5" stroke-width="1.5"/>
          <!-- Linearly Polarized Transverse Sinusoidal Wave (Middle) -->
          <path d="M 15.6 18 Q 17.8 10.5, 20.0 18 T 24.4 18" stroke-width="1.9"/>
          <!-- Analyzer P2 Rotated Disc & Tilted Axis -->
          <ellipse cx="27" cy="18" rx="2.6" ry="8.8" fill="currentColor" fill-opacity="0.10" stroke-width="1.8"/>
          <line x1="25.3" y1="11.2" x2="28.7" y2="24.8" stroke-width="1.5" stroke-opacity="0.85"/>
          <!-- Attenuated Post-Analyzer Wave (Right) -->
          <path d="M 29.6 18 Q 31.0 14.5, 32.4 18 T 34.5 18" stroke-width="1.6" stroke-opacity="0.75"/>
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
      this.navTransition = 'pop';
      this.showLevel1();
      return true;
    }
    return false;
  }

  public reset(): void {
    this.navTransition = 'none';
    this.showLevel1();
  }

  public getCurrentLevel(): 1 | 2 {
    return this.currentLevel;
  }

  public getCurrentDiscipline(): 'optics' | 'em' | 'mechanics' | 'thermo' {
    return this.currentDiscipline;
  }

  /**
   * 渲染一级界面：物理二级学科分支选择网格
   */
  public showLevel1(): void {
    this.currentLevel = 1;
    this.callbacks.onLevelChange?.(1, '物理学');

    const navPopClass = this.navTransition === 'pop' ? 'ios-nav-pop' : '';

    this.element.innerHTML = `
      <div class="physics-level-container physics-level-1 ${navPopClass}">
        <!-- 4 Physics Branches Grid (Pure Frosted Tiles) -->
        <div class="physics-branches-deck">
          <!-- 1. Optics (Ready -> Click to enter Level 2) -->
          <div class="physics-branch-tile ready" id="branch-tile-optics" role="button" tabindex="0" title="进入光学实验" style="--tile-index: 0;">
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
          <div class="physics-branch-tile ready" id="branch-tile-mechanics" role="button" tabindex="0" title="进入力学实验" style="--tile-index: 1;">
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

          <!-- 3. Thermodynamics (Ready -> Click to enter Level 2) -->
          <div class="physics-branch-tile ready" id="branch-tile-thermo" role="button" tabindex="0" title="进入热学实验" style="--tile-index: 2;">
            <div class="branch-tile-icon-box">
              <svg class="apple-sf-icon branch-tile-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z"/>
              </svg>
            </div>
            <h3 class="branch-tile-name">热学实验</h3>
          </div>

          <!-- 4. Electromagnetism (Ready -> Click to enter Level 2) -->
          <div class="physics-branch-tile ready" id="branch-tile-em" role="button" tabindex="0" title="进入电磁学实验" style="--tile-index: 3;">
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
  public showLevel2(discipline: 'optics' | 'em' | 'mechanics' | 'thermo' = 'optics'): void {
    this.currentLevel = 2;
    this.currentDiscipline = discipline;
    this.navTransition = 'push';
    const title = discipline === 'em'
      ? '电磁学实验'
      : discipline === 'mechanics'
      ? '力学实验'
      : discipline === 'thermo'
      ? '热学实验'
      : '光学实验';
    this.callbacks.onLevelChange?.(2, title);

    const experiments = discipline === 'em'
      ? PhysicsDisciplineModal.EM_EXPERIMENTS
      : discipline === 'mechanics'
      ? PhysicsDisciplineModal.MECHANICS_EXPERIMENTS
      : discipline === 'thermo'
      ? PhysicsDisciplineModal.THERMO_EXPERIMENTS
      : PhysicsDisciplineModal.OPTICS_EXPERIMENTS;

    this.element.innerHTML = `
      <div class="physics-level-container physics-level-2 ios-nav-push">
        <!-- 4 Core Experiments 2x2 Spatial Grid -->
        <div class="optics-exp-deck">
          ${experiments.map(
            (exp, idx) => `
            <div class="optics-card ${(exp as any).planned ? 'planned-card' : ''}" data-exp-id="${exp.id}" data-planned="${(exp as any).planned ? 'true' : 'false'}" data-formula="${exp.formula}" role="button" tabindex="0" style="--card-index: ${idx};">
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
