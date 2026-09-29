import type { CarrierType } from '../../scene/em/HallCarrierParticleSystem.ts';
import { bindVisionSlider, isSliderActive } from './sliderGestureHelper.ts';

export interface HallTelemetryData {
  // 实验运行可控变量
  magFieldTesla: number;        // Tesla (-1.5 to +1.5)
  currentMa: number;            // mA (-20 to +20)
  waferThicknessMm: number;     // mm (0.05 to 1.5)
  waferWidthMm: number;         // mm
  waferLengthMm: number;        // mm

  // 样品与材料物性参数
  materialKey: string;          // 'n-gaas' | 'p-silicon' | 'copper' | 'custom'
  materialName: string;
  carrierType: CarrierType;
  carrierConcentration: number; // m^-3
  carrierCharge: number;        // Coulombs
  mobilityCm2Vs: number;        // cm^2 / (V·s)
  conductivitySm: number;       // S/m

  // 理论衍生物理量计算值
  hallCoefficientRh: number;    // m^3 / C
  hallSensitivityKh: number;    // V / (A·T) = mV / (mA·T)
  hallVoltageMv: number;        // mV
  hallElectricFieldVm: number;  // V / m
  driftVelocityMs: number;      // m / s
  lorentzForceN: number;        // N

  // 视觉渲染显示开关
  showVectors: boolean;
  showParticles: boolean;
}

export interface HallStatusCardCallbacks {
  onMagFieldChange?: (tesla: number) => void;
  onCurrentChange?: (ma: number) => void;
  onThicknessChange?: (thicknessMm: number) => void;
  onMaterialChange?: (materialKey: string) => void;
  onCarrierConcentrationChange?: (n: number) => void;
  onCarrierChargeToggle?: () => void;
  onMobilityChange?: (mu: number) => void;
  onToggleFieldPolarity?: () => void;
  onToggleCurrentPolarity?: () => void;
  onToggleVectors?: (show: boolean) => void;
  onToggleParticles?: (show: boolean) => void;
}

export class HallStatusCard {
  public element: HTMLElement;
  private callbacks: HallStatusCardCallbacks;
  private isVisible = false;

  // 公式中当前选中的激活参数：'b' | 'i' | 'd' | 'rh' | 'vh'
  private activeParam: 'b' | 'i' | 'd' | 'rh' | 'vh' = 'b';

  private currentData: HallTelemetryData = {
    magFieldTesla: 0.5,
    currentMa: 10.0,
    waferThicknessMm: 0.5,
    waferWidthMm: 4.0,
    waferLengthMm: 8.0,
    materialKey: 'n-gaas',
    materialName: 'n型砷化镓晶片 (n-GaAs)',
    carrierType: 'electron',
    carrierConcentration: 1.25e21,
    carrierCharge: -1.602176634e-19,
    mobilityCm2Vs: 8500,
    conductivitySm: 1700,
    hallCoefficientRh: -0.005,
    hallSensitivityKh: 10.0,
    hallVoltageMv: -25.0,
    hallElectricFieldVm: -6.25,
    driftVelocityMs: 12.48,
    lorentzForceN: 9.99e-19,
    showVectors: true,
    showParticles: true,
  };

  // 缓存的 DOM 节点集合
  private stageEl: HTMLElement | null = null;
  private valVhEl: HTMLElement | null = null;
  private valBEl: HTMLElement | null = null;
  private valIEl: HTMLElement | null = null;
  private valRhEl: HTMLElement | null = null;
  private valKhEl: HTMLElement | null = null;
  private chipPolarityEl: HTMLElement | null = null;
  private subEhEl: HTMLElement | null = null;
  private subVdEl: HTMLElement | null = null;

  // 公式符号内的动态数值展示元素
  private tokenValVh: HTMLElement | null = null;
  private tokenValRh: HTMLElement | null = null;
  private tokenValI: HTMLElement | null = null;
  private tokenValB: HTMLElement | null = null;
  private tokenValD: HTMLElement | null = null;

  // 抽屉参数读数元素
  private drawerEl: HTMLElement | null = null;
  private drawerValB: HTMLElement | null = null;
  private drawerValI: HTMLElement | null = null;
  private drawerValD: HTMLElement | null = null;
  private drawerValRh: HTMLElement | null = null;
  private drawerValVh: HTMLElement | null = null;

  private respVhB: HTMLElement | null = null;
  private respVhI: HTMLElement | null = null;
  private respVhD: HTMLElement | null = null;
  private respVhRh: HTMLElement | null = null;

  private sliderB: HTMLInputElement | null = null;
  private sliderI: HTMLInputElement | null = null;
  private sliderD: HTMLInputElement | null = null;
  private txtValD: HTMLElement | null = null;

  private btnRevB: HTMLButtonElement | null = null;
  private btnRevI: HTMLButtonElement | null = null;
  private btnToggleVectors: HTMLButtonElement | null = null;
  private btnToggleParticles: HTMLButtonElement | null = null;
  private btnResetStandard: HTMLButtonElement | null = null;
  private btnTopReset: HTMLButtonElement | null = null;

  private tokenVh: HTMLElement | null = null;
  private tokenB: HTMLElement | null = null;
  private tokenI: HTMLElement | null = null;
  private tokenD: HTMLElement | null = null;
  private tokenRh: HTMLElement | null = null;

  private paneB: HTMLElement | null = null;
  private paneI: HTMLElement | null = null;
  private paneD: HTMLElement | null = null;
  private paneRh: HTMLElement | null = null;
  private paneVh: HTMLElement | null = null;

  // 显著的悬浮拖拽数值调节 HUD 浮层
  private dragHud: HTMLElement | null = null;
  private hudValText: HTMLElement | null = null;
  private hudBarFill: HTMLElement | null = null;
  private hudParamName: HTMLElement | null = null;
  private hudRangeMin: HTMLElement | null = null;
  private hudRangeMax: HTMLElement | null = null;

  private specimenPills: NodeListOf<HTMLElement> | null = null;
  private presetChipsB: NodeListOf<HTMLElement> | null = null;
  private presetChipsI: NodeListOf<HTMLElement> | null = null;
  private presetChipsD: NodeListOf<HTMLElement> | null = null;

  private selectMaterialCompat: HTMLSelectElement | null = null;

  private lastB = -9999;
  private lastI = -9999;
  private lastVh = -9999;
  private lastD = -9999;
  private lastMatKey = '';
  private lastCarrier: CarrierType | '' = '';
  private activeSliders = new Set<string>();

  constructor(callbacks: HallStatusCardCallbacks = {}) {
    this.callbacks = callbacks;
    this.createUI();
  }

  public get visible(): boolean {
    return this.isVisible;
  }

  private createUI(): void {
    this.element = document.createElement('div');
    this.element.className = 'vision-hall-status-card hud-interactive';

    this.element.innerHTML = `
      <div class="hall-pure-container">
        <!-- 1. Apple Minimal Window Header -->
        <div class="hall-pure-header">
          <div class="hall-header-brand">
            <span class="hall-brand-title">霍尔效应</span>
            <span class="hall-clean-badge" id="chip-hall-polarity">e⁻</span>
          </div>

          <div class="hall-header-actions">
            <button class="apple-circle-btn" id="btn-top-reset" title="重置基准">
              <svg class="apple-sf-icon" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">
                <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
                <path d="M3 3v5h5"/>
              </svg>
            </button>
          </div>
        </div>

        <!-- 2. Pure Mathematical Sculpture (Zero text clutter, formula as controller) -->
        <div class="hall-pure-stage" id="hall-pure-stage">
          <!-- Formula: V_H = (R_H · I_S · B) / d -->
          <div class="hall-formula-row">
            <!-- Output Token: V_H -->
            <div class="hall-token-btn" data-param="vh" id="token-vh" tabindex="0" title="霍尔输出电压">
              <span class="hall-token-math">V<sub>H</sub></span>
              <span class="hall-token-dynamic-val" id="token-val-vh">-25.0 mV</span>
            </div>

            <!-- Operator '=' -->
            <span class="hall-math-equal">=</span>

            <!-- Fraction Block -->
            <div class="hall-math-fraction">
              <!-- Numerator: R_H · I_S · B -->
              <div class="hall-math-num-row">
                <div class="hall-token-btn" data-param="rh" id="token-rh" tabindex="0" title="霍尔系数材质">
                  <span class="hall-token-math">R<sub>H</sub></span>
                  <span class="hall-token-dynamic-val" id="token-val-rh">GaAs</span>
                </div>

                <span class="hall-math-dot">·</span>

                <div class="hall-token-btn" data-param="i" id="token-i" tabindex="0" title="激励电流">
                  <span class="hall-token-math">I<sub>S</sub></span>
                  <span class="hall-token-dynamic-val" id="token-val-i">+10 mA</span>
                </div>

                <span class="hall-math-dot">·</span>

                <div class="hall-token-btn" data-param="b" id="token-b" tabindex="0" title="垂直磁场">
                  <span class="hall-token-math">B</span>
                  <span class="hall-token-dynamic-val" id="token-val-b">+0.5 T</span>
                </div>
              </div>

              <!-- Fraction Line -->
              <div class="hall-math-bar"></div>

              <!-- Denominator: d -->
              <div class="hall-math-den-row">
                <div class="hall-token-btn" data-param="d" id="token-d" tabindex="0" title="晶片厚度">
                  <span class="hall-token-math">d</span>
                  <span class="hall-token-dynamic-val" id="token-val-d">0.5 mm</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- 3. Unified Apple Control Deck (Carrier Type Switch + Parameter Scrubber) -->
        <div class="hall-focus-drawer" id="hall-focus-drawer">
          <!-- Floating Apple Precision Scrubber HUD -->
          <div class="hall-drag-hud" id="hall-drag-hud" style="display: none; opacity: 0;">
            <div class="hall-hud-bubble">
              <div class="hall-hud-val" id="hud-val-text">+0.50 T</div>
              <div class="hall-hud-gauge">
                <div class="hall-hud-fill" id="hud-bar-fill" style="width: 66.7%;"></div>
              </div>
              <div class="hall-hud-beak"></div>
            </div>
            <span id="hud-range-min" style="display:none;"></span>
            <span id="hud-range-max" style="display:none;"></span>
            <span id="hud-param-name" style="display:none;"></span>
          </div>

          <!-- Left: Carrier Type Switch (n型 vs p型) -->
          <div class="hall-carrier-deck">
            <div class="hall-apple-seg-control">
              <button class="hall-seg-btn active" data-material="n-gaas" title="n型半导体 (主要载流子为电子 e⁻)">n型 (e⁻)</button>
              <button class="hall-seg-btn" data-material="p-silicon" title="p型半导体 (主要载流子为空穴 h⁺)">p型 (h⁺)</button>
            </div>
          </div>

          <div class="hall-deck-divider"></div>

          <!-- Right: Active Parameter Fine-Tune Pane -->
          <div class="hall-param-deck">
            <!-- Pane B (Magnetic Field) -->
            <div class="hall-focus-pane" id="pane-b">
              <span class="hall-param-tag">磁场 B</span>
              <button class="apple-circle-btn" id="btn-rev-b" title="反转磁场极性">
                <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                  <path d="M7 16V4m0 0L3 8m4-4l4 4m6 4v12m0 0l4-4m-4 4l-4-4"/>
                </svg>
              </button>
              <div class="hall-slider-track-wrap clickable" role="slider" aria-label="垂直磁场调节">
                <input type="range" class="hall-apple-slider" id="slider-hall-b" min="-2.00" max="2.00" step="0.02" value="0.50" />
              </div>
              <span class="hall-focus-val" id="drawer-val-b">+0.50 T</span>
            </div>

            <!-- Pane I (Current) -->
            <div class="hall-focus-pane" id="pane-i" style="display: none;">
              <span class="hall-param-tag">电流 I<sub>S</sub></span>
              <button class="apple-circle-btn" id="btn-rev-i" title="换向电流极性">
                <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                  <path d="M7 16V4m0 0L3 8m4-4l4 4m6 4v12m0 0l4-4m-4 4l-4-4"/>
                </svg>
              </button>
              <div class="hall-slider-track-wrap clickable" role="slider" aria-label="励磁电流调节">
                <input type="range" class="hall-apple-slider" id="slider-hall-i" min="-30.0" max="30.0" step="0.5" value="10.0" />
              </div>
              <span class="hall-focus-val" id="drawer-val-i">+10.0 mA</span>
            </div>

            <!-- Pane D (Thickness) -->
            <div class="hall-focus-pane" id="pane-d" style="display: none;">
              <span class="hall-param-tag">厚度 d</span>
              <div class="hall-slider-track-wrap clickable" role="slider" aria-label="晶片厚度调节">
                <input type="range" class="hall-apple-slider" id="slider-hall-d" min="0.05" max="1.50" step="0.05" value="0.50" />
              </div>
              <span class="hall-focus-val" id="drawer-val-d">0.50 mm</span>
            </div>

            <!-- Pane RH (Material: GaAs / Si / Cu indicator) -->
            <div class="hall-focus-pane" id="pane-rh" style="display: none;">
              <span class="hall-param-tag">系数 R<sub>H</sub></span>
              <span class="hall-focus-val" id="drawer-val-rh">-5.00e-3</span>
            </div>

            <!-- Pane VH (Output Voltage & Metrics) -->
            <div class="hall-focus-pane" id="pane-vh" style="display: none;">
              <span class="hall-param-tag">响应 V<sub>H</sub></span>
              <span class="hall-metric-pill" id="sub-hall-eh">E: 6.25 V/m</span>
              <span class="hall-metric-pill" id="sub-hall-vd">v: 12.5 m/s</span>
              <span class="hall-focus-val hall-glow-accent" id="drawer-val-vh">-25.00 mV</span>
            </div>
          </div>
        </div>

        <!-- 4. Apple Floating Glass Dock -->
        <div class="hall-pure-toolbar">
          <div class="hall-dock-capsule">
            <button class="hall-dock-btn active" id="btn-toggle-vectors" title="矢量指示">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                <line x1="12" y1="19" x2="12" y2="5"/>
                <polyline points="5 12 12 5 19 12"/>
              </svg>
            </button>
            <div class="hall-dock-divider"></div>
            <button class="hall-dock-btn active" id="btn-toggle-particles" title="微观载流子流">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="6" cy="12" r="2.2" fill="currentColor"/>
                <circle cx="12" cy="12" r="2.2" fill="currentColor"/>
                <circle cx="18" cy="12" r="2.2" fill="currentColor"/>
              </svg>
            </button>
            <div class="hall-dock-divider"></div>
            <button class="hall-dock-btn" id="btn-reset-standard" title="恢复基准工况">
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">
                <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
                <path d="M3 3v5h5"/>
              </svg>
            </button>
          </div>
        </div>

        <!-- Hidden compatibility elements to maintain DOM API contracts -->
        <div style="display: none;">
          <select id="select-hall-material">
            <option value="n-gaas">n-gaas</option>
            <option value="p-silicon">p-silicon</option>
            <option value="copper">copper</option>
            <option value="custom">custom</option>
          </select>
          <span id="val-vh">-25.00</span>
          <span id="val-b">+0.50 T</span>
          <span id="val-i">+10.0 mA</span>
          <span id="txt-slider-d">0.50 mm</span>
          <span id="val-rh">-5.00e-3 m³/C</span>
          <span id="val-kh">10.00</span>
          <span id="resp-vh-b">-25.00 mV</span>
          <span id="resp-vh-i">-25.00 mV</span>
          <span id="resp-vh-d">-25.00 mV</span>
          <span id="resp-vh-rh">-25.00 mV</span>
          <span id="sub-vh"></span>
          <span id="caption-vh"></span>
          <span id="sub-b"></span>
          <span id="sub-b-milli"></span>
          <span id="sub-i"></span>
          <span id="sub-rh"></span>
          <span id="caption-rh"></span>
          <canvas id="canvas-hall-curve"></canvas>
          <canvas id="canvas-hall-diag"></canvas>
          <canvas id="canvas-hall-main"></canvas>
          <span id="tag-slope-display"></span>
          <button id="btn-tab-vh-b"></button>
          <button id="btn-tab-vh-i"></button>
          <button id="btn-tab-diagram"></button>
          <input type="range" id="slider-hall-n" value="21.10" />
          <span id="txt-slider-n"></span>
          <input type="range" id="slider-hall-mu" value="8500" />
          <span id="txt-slider-mu"></span>
          <button id="btn-toggle-carrier"></button>
          <button id="btn-toggle-flux"></button>
          <div id="card-b"></div>
          <div id="card-i"></div>
          <div id="card-rh"></div>
          <div id="hall-mat-props"></div>
        </div>
      </div>
    `;

    this.cacheDOMElements();
    this.bindEvents();
    this.switchActiveParam('b');
  }

  private cacheDOMElements(): void {
    const el = this.element;
    this.stageEl = el.querySelector('#hall-pure-stage');
    this.valVhEl = el.querySelector('#val-vh');
    this.valBEl = el.querySelector('#val-b');
    this.valIEl = el.querySelector('#val-i');
    this.valRhEl = el.querySelector('#val-rh');
    this.valKhEl = el.querySelector('#val-kh');
    this.chipPolarityEl = el.querySelector('#chip-hall-polarity');
    this.subEhEl = el.querySelector('#sub-hall-eh');
    this.subVdEl = el.querySelector('#sub-hall-vd');

    this.tokenValVh = el.querySelector('#token-val-vh');
    this.tokenValRh = el.querySelector('#token-val-rh');
    this.tokenValI = el.querySelector('#token-val-i');
    this.tokenValB = el.querySelector('#token-val-b');
    this.tokenValD = el.querySelector('#token-val-d');

    this.drawerEl = el.querySelector('#hall-focus-drawer');
    this.drawerValB = el.querySelector('#drawer-val-b');
    this.drawerValI = el.querySelector('#drawer-val-i');
    this.drawerValD = el.querySelector('#drawer-val-d');
    this.drawerValRh = el.querySelector('#drawer-val-rh');
    this.drawerValVh = el.querySelector('#drawer-val-vh');

    this.respVhB = el.querySelector('#resp-vh-b');
    this.respVhI = el.querySelector('#resp-vh-i');
    this.respVhD = el.querySelector('#resp-vh-d');
    this.respVhRh = el.querySelector('#resp-vh-rh');

    this.sliderB = el.querySelector('#slider-hall-b');
    this.sliderI = el.querySelector('#slider-hall-i');
    this.sliderD = el.querySelector('#slider-hall-d');
    this.txtValD = el.querySelector('#txt-slider-d');

    this.btnRevB = el.querySelector('#btn-rev-b');
    this.btnRevI = el.querySelector('#btn-rev-i');
    this.btnToggleVectors = el.querySelector('#btn-toggle-vectors');
    this.btnToggleParticles = el.querySelector('#btn-toggle-particles');
    this.btnResetStandard = el.querySelector('#btn-reset-standard');
    this.btnTopReset = el.querySelector('#btn-top-reset');

    this.tokenVh = el.querySelector('#token-vh');
    this.tokenB = el.querySelector('#token-b');
    this.tokenI = el.querySelector('#token-i');
    this.tokenD = el.querySelector('#token-d');
    this.tokenRh = el.querySelector('#token-rh');

    this.paneB = el.querySelector('#pane-b');
    this.paneI = el.querySelector('#pane-i');
    this.paneD = el.querySelector('#pane-d');
    this.paneRh = el.querySelector('#pane-rh');
    this.paneVh = el.querySelector('#pane-vh');

    this.dragHud = el.querySelector('#hall-drag-hud');
    this.hudValText = el.querySelector('#hud-val-text');
    this.hudBarFill = el.querySelector('#hud-bar-fill');
    this.hudParamName = el.querySelector('#hud-param-name');
    this.hudRangeMin = el.querySelector('#hud-range-min');
    this.hudRangeMax = el.querySelector('#hud-range-max');

    this.specimenPills = el.querySelectorAll('[data-material]');
    this.presetChipsB = el.querySelectorAll('[data-set-b]');
    this.presetChipsI = el.querySelectorAll('[data-set-i]');
    this.presetChipsD = el.querySelectorAll('[data-set-d]');

    this.selectMaterialCompat = el.querySelector('#select-hall-material');
  }

  private switchActiveParam(param: 'b' | 'i' | 'd' | 'rh' | 'vh'): void {
    this.activeParam = param;

    // 1. 更新符号激活状态（严格单选：仅当前点击的参数高亮激活）
    const tokens: Array<{ el: HTMLElement | null; key: string }> = [
      { el: this.tokenVh, key: 'vh' },
      { el: this.tokenB, key: 'b' },
      { el: this.tokenI, key: 'i' },
      { el: this.tokenD, key: 'd' },
      { el: this.tokenRh, key: 'rh' },
    ];
    tokens.forEach(({ el, key }) => {
      if (!el) return;
      el.classList.toggle('active', key === param);
      el.classList.remove('dragging', 'response-active');
    });

    // 2. 切换抽屉参数调节面板
    if (this.paneB) this.paneB.style.display = param === 'b' ? 'flex' : 'none';
    if (this.paneI) this.paneI.style.display = param === 'i' ? 'flex' : 'none';
    if (this.paneD) this.paneD.style.display = param === 'd' ? 'flex' : 'none';
    if (this.paneRh) this.paneRh.style.display = param === 'rh' ? 'flex' : 'none';
    if (this.paneVh) this.paneVh.style.display = param === 'vh' ? 'flex' : 'none';
  }

  private bindEvents(): void {
    // 1. 点击公式符号切换当前激活参数
    this.tokenVh?.addEventListener('click', () => this.switchActiveParam('vh'));
    this.tokenB?.addEventListener('click', () => this.switchActiveParam('b'));
    this.tokenI?.addEventListener('click', () => this.switchActiveParam('i'));
    this.tokenD?.addEventListener('click', () => this.switchActiveParam('d'));
    this.tokenRh?.addEventListener('click', () => this.switchActiveParam('rh'));

    // 2. 针对 iPad 与触控优化的滑块手势绑定
    this.bindTouchSlider(this.sliderB, (b) => {
      this.callbacks.onMagFieldChange?.(b);
    });

    this.bindTouchSlider(this.sliderI, (i) => {
      this.callbacks.onCurrentChange?.(i);
    });

    this.bindTouchSlider(this.sliderD, (d) => {
      this.callbacks.onThicknessChange?.(d);
    });

    // 3. 极性反转按钮事件
    this.btnRevB?.addEventListener('click', () => {
      this.callbacks.onToggleFieldPolarity?.();
    });

    this.btnRevI?.addEventListener('click', () => {
      this.callbacks.onToggleCurrentPolarity?.();
    });

    // 4. 预设快捷选项胶囊
    this.presetChipsB?.forEach((chip) => {
      chip.addEventListener('click', () => {
        const val = parseFloat(chip.getAttribute('data-set-b') || '0');
        this.callbacks.onMagFieldChange?.(val);
      });
    });

    this.presetChipsI?.forEach((chip) => {
      chip.addEventListener('click', () => {
        const val = parseFloat(chip.getAttribute('data-set-i') || '0');
        this.callbacks.onCurrentChange?.(val);
      });
    });

    this.presetChipsD?.forEach((chip) => {
      chip.addEventListener('click', () => {
        const val = parseFloat(chip.getAttribute('data-set-d') || '0.5');
        this.callbacks.onThicknessChange?.(val);
      });
    });

    // 5. 待测材料样品切换胶囊
    this.specimenPills?.forEach((pill) => {
      pill.addEventListener('click', () => {
        const mat = pill.getAttribute('data-material');
        if (mat) {
          this.callbacks.onMaterialChange?.(mat);
        }
      });
    });

    // 6. 视觉效果开关切换
    this.btnToggleVectors?.addEventListener('click', () => {
      const active = this.btnToggleVectors!.classList.toggle('active');
      this.callbacks.onToggleVectors?.(active);
    });

    this.btnToggleParticles?.addEventListener('click', () => {
      const active = this.btnToggleParticles!.classList.toggle('active');
      this.callbacks.onToggleParticles?.(active);
    });

    // 7. 参数重置按钮
    const handleReset = () => {
      this.callbacks.onMaterialChange?.('n-gaas');
      this.callbacks.onMagFieldChange?.(0.5);
      this.callbacks.onCurrentChange?.(10.0);
      this.callbacks.onThicknessChange?.(0.5);
      this.switchActiveParam('b');
    };

    this.btnResetStandard?.addEventListener('click', handleReset);
    this.btnTopReset?.addEventListener('click', handleReset);
  }

  private isSliderActive(slider: HTMLInputElement | null): boolean {
    return isSliderActive(slider, this.activeSliders);
  }

  private bindTouchSlider(slider: HTMLInputElement | null, onChange: (val: number) => void): void {
    if (!slider) return;

    const wrap = (typeof slider.closest === 'function' ? slider.closest('.hall-slider-track-wrap') : null) || slider.parentElement;
    let isDragging = false;

    // 格式化输出 HUD 数值与即时视觉反馈文本的辅助函数
    const formatValue = (val: number): string => {
      if (slider.id === 'slider-hall-b') {
        return `${val >= 0 ? '+' : ''}${val.toFixed(2)} T`;
      } else if (slider.id === 'slider-hall-i') {
        return `${val >= 0 ? '+' : ''}${val.toFixed(1)} mA`;
      } else if (slider.id === 'slider-hall-d') {
        return `${val.toFixed(2)} mm`;
      }
      return val.toString();
    };

    const updateDirectReadouts = (val: number) => {
      const formatted = formatValue(val);
      if (slider.id === 'slider-hall-b') {
        if (this.drawerValB) this.drawerValB.textContent = formatted;
        if (this.tokenValB) this.tokenValB.textContent = `${val >= 0 ? '+' : ''}${val.toFixed(1)} T`;
        if (this.valBEl) this.valBEl.textContent = formatted;
      } else if (slider.id === 'slider-hall-i') {
        if (this.drawerValI) this.drawerValI.textContent = formatted;
        if (this.tokenValI) this.tokenValI.textContent = `${val >= 0 ? '+' : ''}${val.toFixed(1)} mA`;
        if (this.valIEl) this.valIEl.textContent = formatted;
      } else if (slider.id === 'slider-hall-d') {
        if (this.drawerValD) this.drawerValD.textContent = formatted;
        if (this.tokenValD) this.tokenValD.textContent = `${val.toFixed(1)} mm`;
        if (this.txtValD) this.txtValD.textContent = formatted;
      }
    };

    const updateHUD = (val: number, ratio: number, clientX: number) => {
      if (!this.dragHud) return;
      if (this.hudValText) this.hudValText.textContent = formatValue(val);
      if (this.hudBarFill) this.hudBarFill.style.width = `${Math.max(0, Math.min(100, ratio * 100)).toFixed(1)}%`;

      if (typeof slider.getBoundingClientRect === 'function') {
        const sliderRect = slider.getBoundingClientRect();
        const drawerRect = this.drawerEl && typeof this.drawerEl.getBoundingClientRect === 'function'
          ? this.drawerEl.getBoundingClientRect()
          : null;

        if (sliderRect && sliderRect.width > 0 && drawerRect && drawerRect.width > 0) {
          const clampedX = Math.max(sliderRect.left, Math.min(sliderRect.right, clientX));
          const thumbX = clampedX - drawerRect.left;
          const thumbY = (sliderRect.top - drawerRect.top) - 10;
          this.dragHud.style.left = `${thumbX}px`;
          this.dragHud.style.top = `${thumbY}px`;
        }
      }
      this.dragHud.style.display = 'block';
      this.dragHud.style.opacity = '1';
    };

    bindVisionSlider(slider, {
      activeSet: this.activeSliders,
      onChange: (val) => {
        onChange(val);
        updateDirectReadouts(val);
      },
      onScrub: (val, ratio, clientX) => {
        updateDirectReadouts(val);
        updateHUD(val, ratio, clientX);
      },
      onDragEnd: () => {
        if (this.dragHud) {
          this.dragHud.style.opacity = '0';
          this.dragHud.style.display = 'none';
        }
      },
    });
  }

  public setVisible(visible: boolean): void {
    this.isVisible = visible;
    this.element.style.display = visible ? 'flex' : 'none';
  }

  public updateTelemetry(data: Partial<HallTelemetryData>): void {
    Object.assign(this.currentData, data);

    const b = this.currentData.magFieldTesla;
    const i = this.currentData.currentMa;
    const vh = this.currentData.hallVoltageMv;
    const rh = this.currentData.hallCoefficientRh;
    const kh = this.currentData.hallSensitivityKh;
    const d = this.currentData.waferThicknessMm;
    const matKey = this.currentData.materialKey;
    const carrier = this.currentData.carrierType;

    const diffB = Math.abs(this.lastB - b) > 0.002;
    const diffI = Math.abs(this.lastI - i) > 0.02;
    const diffVh = Math.abs(this.lastVh - vh) > 0.005;
    const diffD = Math.abs(this.lastD - d) > 0.005;
    const diffMat = this.lastMatKey !== matKey || this.lastCarrier !== carrier;

    if (!diffB && !diffI && !diffVh && !diffD && !diffMat) return;

    // 1. 格式化霍尔电压显示文本
    if (diffVh) {
      this.lastVh = vh;
      const signVh = vh >= 0 ? '+' : '';
      const vhText = `${signVh}${vh.toFixed(2)} mV`;

      if (this.valVhEl) this.valVhEl.textContent = vhText;
      if (this.drawerValVh) this.drawerValVh.textContent = vhText;
      if (this.tokenValVh) this.tokenValVh.textContent = vhText;

      // 同步更新所有抽屉面板中的响应读数
      if (this.respVhB) this.respVhB.textContent = vhText;
      if (this.respVhI) this.respVhI.textContent = vhText;
      if (this.respVhD) this.respVhD.textContent = vhText;
      if (this.respVhRh) this.respVhRh.textContent = vhText;
    }

    // 2. 磁感应强度 B 遥测数据
    if (diffB) {
      this.lastB = b;
      const signB = b >= 0 ? '+' : '';
      const textB = `${signB}${b.toFixed(2)} T`;
      if (this.valBEl) this.valBEl.textContent = textB;
      if (this.drawerValB) this.drawerValB.textContent = textB;
      if (this.tokenValB) this.tokenValB.textContent = textB;

      if (
        this.sliderB &&
        !this.isSliderActive(this.sliderB) &&
        Math.abs(Number(this.sliderB.value) - b) > 0.005
      ) {
        this.sliderB.value = b.toString();
      }
      if (this.presetChipsB && this.presetChipsB.length > 0) {
        this.presetChipsB.forEach((chip) => {
          const pVal = parseFloat(chip.getAttribute('data-set-b') || '999');
          chip.classList.toggle('active', Math.abs(pVal - b) < 0.04);
        });
      }
    }

    // 3. Current I_S
    if (diffI) {
      this.lastI = i;
      const signI = i >= 0 ? '+' : '';
      const textI = `${signI}${i.toFixed(1)} mA`;
      if (this.valIEl) this.valIEl.textContent = textI;
      if (this.drawerValI) this.drawerValI.textContent = textI;
      if (this.tokenValI) this.tokenValI.textContent = textI;

      if (
        this.sliderI &&
        !this.isSliderActive(this.sliderI) &&
        Math.abs(Number(this.sliderI.value) - i) > 0.1
      ) {
        this.sliderI.value = i.toString();
      }
      if (this.presetChipsI && this.presetChipsI.length > 0) {
        this.presetChipsI.forEach((chip) => {
          const pVal = parseFloat(chip.getAttribute('data-set-i') || '999');
          chip.classList.toggle('active', Math.abs(pVal - i) < 0.3);
        });
      }
    }

    // 4. 晶圆厚度 d 遥测数据
    if (diffD) {
      this.lastD = d;
      const textD = `${d.toFixed(2)} mm`;
      if (this.txtValD) this.txtValD.textContent = textD;
      if (this.drawerValD) this.drawerValD.textContent = textD;
      if (this.tokenValD) this.tokenValD.textContent = textD;

      if (
        this.sliderD &&
        !this.isSliderActive(this.sliderD) &&
        Math.abs(Number(this.sliderD.value) - d) > 0.01
      ) {
        this.sliderD.value = d.toString();
      }
      if (this.presetChipsD && this.presetChipsD.length > 0) {
        this.presetChipsD.forEach((chip) => {
          const pVal = parseFloat(chip.getAttribute('data-set-d') || '999');
          chip.classList.toggle('active', Math.abs(pVal - d) < 0.03);
        });
      }
    }

    // 5. Material / R_H / Carrier
    if (diffMat) {
      this.lastMatKey = matKey;
      this.lastCarrier = carrier;

      if (this.chipPolarityEl) {
        if (carrier === 'electron') {
          this.chipPolarityEl.textContent = 'e⁻';
        } else if (carrier === 'hole') {
          this.chipPolarityEl.textContent = 'h⁺';
        } else {
          this.chipPolarityEl.textContent = 'Cu';
        }
      }

      if (this.drawerValRh) {
        this.drawerValRh.textContent = `${rh.toExponential(2)}`;
      }
      if (this.tokenValRh) {
        this.tokenValRh.textContent = matKey === 'n-gaas' ? 'GaAs' : (matKey === 'p-silicon' ? 'Si' : 'Cu');
      }

      this.specimenPills?.forEach((pill) => {
        const k = pill.getAttribute('data-material');
        pill.classList.toggle('active', k === matKey);
      });
      if (this.selectMaterialCompat) {
        this.selectMaterialCompat.value = matKey;
      }
    }

    // 6. 微观统计物理量遥测
    if (diffVh || diffB || diffI || diffMat || diffD) {
      if (this.subEhEl) {
        this.subEhEl.textContent = `E: ${this.currentData.hallElectricFieldVm.toFixed(2)} V/m`;
      }
      if (this.subVdEl) {
        this.subVdEl.textContent = `v: ${this.currentData.driftVelocityMs.toFixed(1)} m/s`;
      }
      if (this.valKhEl) {
        this.valKhEl.textContent = `${kh.toFixed(2)}`;
      }
      if (this.valRhEl) {
        this.valRhEl.textContent = `${rh.toExponential(2)} m³/C`;
      }
    }
  }
}
