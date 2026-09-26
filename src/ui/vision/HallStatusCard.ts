import type { CarrierType } from '../../scene/em/HallCarrierParticleSystem.ts';

export interface HallTelemetryData {
  // Operational variables
  magFieldTesla: number;        // Tesla (-1.5 to +1.5)
  currentMa: number;            // mA (-20 to +20)
  waferThicknessMm: number;     // mm (0.05 to 1.5)
  waferWidthMm: number;         // mm
  waferLengthMm: number;        // mm

  // Specimen & Material properties
  materialKey: string;          // 'n-gaas' | 'p-silicon' | 'copper' | 'custom'
  materialName: string;
  carrierType: CarrierType;
  carrierConcentration: number; // m^-3
  carrierCharge: number;        // Coulombs
  mobilityCm2Vs: number;        // cm^2 / (V·s)
  conductivitySm: number;       // S/m

  // Derived Physical Quantities
  hallCoefficientRh: number;    // m^3 / C
  hallSensitivityKh: number;    // V / (A·T) = mV / (mA·T)
  hallVoltageMv: number;        // mV
  hallElectricFieldVm: number;  // V / m
  driftVelocityMs: number;      // m / s
  lorentzForceN: number;        // N

  // Display toggles
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

  // Active parameter selected in formula: 'b' | 'i' | 'd' | 'rh' | 'vh'
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

  // Cached DOM elements
  private stageEl: HTMLElement | null = null;
  private valVhEl: HTMLElement | null = null;
  private valBEl: HTMLElement | null = null;
  private valIEl: HTMLElement | null = null;
  private valRhEl: HTMLElement | null = null;
  private valKhEl: HTMLElement | null = null;
  private chipPolarityEl: HTMLElement | null = null;
  private subEhEl: HTMLElement | null = null;
  private subVdEl: HTMLElement | null = null;

  // In-token dynamic value elements
  private tokenValVh: HTMLElement | null = null;
  private tokenValRh: HTMLElement | null = null;
  private tokenValI: HTMLElement | null = null;
  private tokenValB: HTMLElement | null = null;
  private tokenValD: HTMLElement | null = null;

  // Drawer values
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

  // Prominent Floating Drag HUD
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
          <!-- Floating Apple Precision Scrubber HUD -->
          <div class="hall-drag-hud" id="hall-drag-hud" style="display: none;">
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
              <div class="hall-slider-track-wrap">
                <input type="range" class="hall-apple-slider" id="slider-hall-b" min="-1.50" max="1.50" step="0.02" value="0.50" />
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
              <div class="hall-slider-track-wrap">
                <input type="range" class="hall-apple-slider" id="slider-hall-i" min="-20.0" max="20.0" step="0.5" value="10.0" />
              </div>
              <span class="hall-focus-val" id="drawer-val-i">+10.0 mA</span>
            </div>

            <!-- Pane D (Thickness) -->
            <div class="hall-focus-pane" id="pane-d" style="display: none;">
              <span class="hall-param-tag">厚度 d</span>
              <div class="hall-slider-track-wrap">
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
    this.bindScrubGestures();
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

    // 1. Update token active states
    this.tokenVh?.classList.toggle('active', param === 'vh');
    this.tokenB?.classList.toggle('active', param === 'b');
    this.tokenI?.classList.toggle('active', param === 'i');
    this.tokenD?.classList.toggle('active', param === 'd');
    this.tokenRh?.classList.toggle('active', param === 'rh');

    // 2. Toggle drawer panes
    if (this.paneB) this.paneB.style.display = param === 'b' ? 'flex' : 'none';
    if (this.paneI) this.paneI.style.display = param === 'i' ? 'flex' : 'none';
    if (this.paneD) this.paneD.style.display = param === 'd' ? 'flex' : 'none';
    if (this.paneRh) this.paneRh.style.display = param === 'rh' ? 'flex' : 'none';
    if (this.paneVh) this.paneVh.style.display = param === 'vh' ? 'flex' : 'none';
  }

  private bindEvents(): void {
    // 1. Token clicks switch active parameter
    this.tokenVh?.addEventListener('click', () => this.switchActiveParam('vh'));
    this.tokenB?.addEventListener('click', () => this.switchActiveParam('b'));
    this.tokenI?.addEventListener('click', () => this.switchActiveParam('i'));
    this.tokenD?.addEventListener('click', () => this.switchActiveParam('d'));
    this.tokenRh?.addEventListener('click', () => this.switchActiveParam('rh'));

    // 2. Sliders input
    this.sliderB?.addEventListener('input', (e) => {
      const b = parseFloat((e.target as HTMLInputElement).value);
      this.callbacks.onMagFieldChange?.(b);
    });

    this.sliderI?.addEventListener('input', (e) => {
      const i = parseFloat((e.target as HTMLInputElement).value);
      this.callbacks.onCurrentChange?.(i);
    });

    this.sliderD?.addEventListener('input', (e) => {
      const d = parseFloat((e.target as HTMLInputElement).value);
      this.callbacks.onThicknessChange?.(d);
    });

    // 3. Polarity inversion buttons
    this.btnRevB?.addEventListener('click', () => {
      this.callbacks.onToggleFieldPolarity?.();
    });

    this.btnRevI?.addEventListener('click', () => {
      this.callbacks.onToggleCurrentPolarity?.();
    });

    // 4. Preset Chips
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

    // 5. Specimen pills selection
    this.specimenPills?.forEach((pill) => {
      pill.addEventListener('click', () => {
        const mat = pill.getAttribute('data-material');
        if (mat) {
          this.callbacks.onMaterialChange?.(mat);
        }
      });
    });

    // 6. Visual toggles
    this.btnToggleVectors?.addEventListener('click', () => {
      const active = this.btnToggleVectors!.classList.toggle('active');
      this.callbacks.onToggleVectors?.(active);
    });

    this.btnToggleParticles?.addEventListener('click', () => {
      const active = this.btnToggleParticles!.classList.toggle('active');
      this.callbacks.onToggleParticles?.(active);
    });

    // 7. Reset buttons
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

  // Direct Horizontal Scrubbing / Dragging on Formula Parameter Tokens
  private bindScrubGestures(): void {
    const positionHud = (tokenEl: HTMLElement, isBelow: boolean = false) => {
      if (!this.dragHud || !this.stageEl) return;
      const tokenRect = tokenEl.getBoundingClientRect();
      const stageRect = this.stageEl.getBoundingClientRect();
      const centerX = tokenRect.left + tokenRect.width / 2 - stageRect.left;

      if (isBelow) {
        const bottomY = tokenRect.bottom - stageRect.top + 10;
        this.dragHud.style.left = `${centerX}px`;
        this.dragHud.style.top = `${bottomY}px`;
        this.dragHud.classList.add('hud-below');
      } else {
        const topY = tokenRect.top - stageRect.top - 12;
        this.dragHud.style.left = `${centerX}px`;
        this.dragHud.style.top = `${topY}px`;
        this.dragHud.classList.remove('hud-below');
      }
    };

    const showHud = (param: 'b' | 'i' | 'd', formattedVal: string, percent: number, tokenEl: HTMLElement) => {
      if (!this.dragHud || !this.hudValText || !this.hudBarFill) return;
      const isBelow = param === 'd';
      positionHud(tokenEl, isBelow);
      this.hudValText.textContent = formattedVal;
      this.hudBarFill.style.width = `${Math.max(0, Math.min(100, percent))}%`;

      if (this.hudParamName) {
        this.hudParamName.textContent = param === 'b' ? '垂直磁场 B' : (param === 'i' ? '纵向电流 I_S' : '晶片厚度 d');
      }
      if (this.hudRangeMin && this.hudRangeMax) {
        if (param === 'b') {
          this.hudRangeMin.textContent = '-1.5 T';
          this.hudRangeMax.textContent = '+1.5 T';
        } else if (param === 'i') {
          this.hudRangeMin.textContent = '-20 mA';
          this.hudRangeMax.textContent = '+20 mA';
        } else {
          this.hudRangeMin.textContent = '0.05 mm';
          this.hudRangeMax.textContent = '1.50 mm';
        }
      }

      this.dragHud.style.display = 'block';
    };

    const hideHud = () => {
      if (this.dragHud) {
        this.dragHud.style.display = 'none';
      }
    };

    const attachScrub = (
      el: HTMLElement | null,
      param: 'b' | 'i' | 'd',
      onDelta: (dx: number, startVal: number) => { valStr: string; pct: number },
      getStartVal: () => number
    ) => {
      if (!el) return;
      let isDragging = false;
      let startX = 0;
      let startVal = 0;

      el.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        this.switchActiveParam(param);
        isDragging = true;
        startX = e.clientX;
        startVal = getStartVal();
        el.classList.add('dragging');
        this.tokenVh?.classList.add('response-active');
        try {
          el.setPointerCapture(e.pointerId);
        } catch {}

        // Immediate responsive visual feedback upon press
        const { valStr, pct } = onDelta(0, startVal);
        showHud(param, valStr, pct, el);
      });

      el.addEventListener('pointermove', (e) => {
        if (!isDragging) return;
        const dx = e.clientX - startX;
        const { valStr, pct } = onDelta(dx, startVal);
        showHud(param, valStr, pct, el);
      });

      const stopDrag = (e: PointerEvent) => {
        if (!isDragging) return;
        isDragging = false;
        el.classList.remove('dragging');
        this.tokenVh?.classList.remove('response-active');
        hideHud();
        try {
          el.releasePointerCapture(e.pointerId);
        } catch {}
      };

      el.addEventListener('pointerup', stopDrag);
      el.addEventListener('pointercancel', stopDrag);
    };

    // Scrub for Field B (-1.50 to +1.50 T)
    attachScrub(
      this.tokenB,
      'b',
      (dx, startVal) => {
        const raw = startVal + dx * 0.005;
        const clamped = Math.max(-1.50, Math.min(1.50, raw));
        const val = parseFloat(clamped.toFixed(2));
        const valStr = `${val >= 0 ? '+' : ''}${val.toFixed(2)} T`;
        if (this.tokenValB) this.tokenValB.textContent = valStr;
        if (this.drawerValB) this.drawerValB.textContent = valStr;
        if (this.sliderB) this.sliderB.value = val.toString();

        // Optimistic live response calculation
        const i_ma = this.currentData.currentMa;
        const d_mm = this.currentData.waferThicknessMm;
        const rh = this.currentData.hallCoefficientRh;
        const liveVh = d_mm > 0.001 ? (rh * i_ma * val / d_mm) * 1000 : 0;
        const vhText = `${liveVh >= 0 ? '+' : ''}${liveVh.toFixed(2)} mV`;
        if (this.tokenValVh) this.tokenValVh.textContent = vhText;
        if (this.drawerValVh) this.drawerValVh.textContent = vhText;
        if (this.respVhB) this.respVhB.textContent = vhText;

        this.callbacks.onMagFieldChange?.(val);
        const pct = ((val - (-1.50)) / 3.0) * 100;
        return { valStr, pct };
      },
      () => this.currentData.magFieldTesla
    );

    // Scrub for Current I (-20.0 to +20.0 mA)
    attachScrub(
      this.tokenI,
      'i',
      (dx, startVal) => {
        const raw = startVal + dx * 0.08;
        const clamped = Math.max(-20.0, Math.min(20.0, raw));
        const val = parseFloat(clamped.toFixed(1));
        const valStr = `${val >= 0 ? '+' : ''}${val.toFixed(1)} mA`;
        if (this.tokenValI) this.tokenValI.textContent = valStr;
        if (this.drawerValI) this.drawerValI.textContent = valStr;
        if (this.sliderI) this.sliderI.value = val.toString();

        // Optimistic live response calculation
        const b_t = this.currentData.magFieldTesla;
        const d_mm = this.currentData.waferThicknessMm;
        const rh = this.currentData.hallCoefficientRh;
        const liveVh = d_mm > 0.001 ? (rh * val * b_t / d_mm) * 1000 : 0;
        const vhText = `${liveVh >= 0 ? '+' : ''}${liveVh.toFixed(2)} mV`;
        if (this.tokenValVh) this.tokenValVh.textContent = vhText;
        if (this.drawerValVh) this.drawerValVh.textContent = vhText;
        if (this.respVhI) this.respVhI.textContent = vhText;

        this.callbacks.onCurrentChange?.(val);
        const pct = ((val - (-20.0)) / 40.0) * 100;
        return { valStr, pct };
      },
      () => this.currentData.currentMa
    );

    // Scrub for Thickness d (0.05 to 1.50 mm)
    attachScrub(
      this.tokenD,
      'd',
      (dx, startVal) => {
        const raw = startVal + dx * 0.003;
        const clamped = Math.max(0.05, Math.min(1.50, raw));
        const val = parseFloat(clamped.toFixed(2));
        const valStr = `${val.toFixed(2)} mm`;
        if (this.tokenValD) this.tokenValD.textContent = valStr;
        if (this.drawerValD) this.drawerValD.textContent = valStr;
        if (this.sliderD) this.sliderD.value = val.toString();

        // Optimistic live response calculation
        const b_t = this.currentData.magFieldTesla;
        const i_ma = this.currentData.currentMa;
        const rh = this.currentData.hallCoefficientRh;
        const liveVh = val > 0.001 ? (rh * i_ma * b_t / val) * 1000 : 0;
        const vhText = `${liveVh >= 0 ? '+' : ''}${liveVh.toFixed(2)} mV`;
        if (this.tokenValVh) this.tokenValVh.textContent = vhText;
        if (this.drawerValVh) this.drawerValVh.textContent = vhText;
        if (this.respVhD) this.respVhD.textContent = vhText;

        this.callbacks.onThicknessChange?.(val);
        const pct = ((val - 0.05) / 1.45) * 100;
        return { valStr, pct };
      },
      () => this.currentData.waferThicknessMm
    );
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

    // 1. Format Hall Voltage String
    if (diffVh) {
      this.lastVh = vh;
      const signVh = vh >= 0 ? '+' : '';
      const vhText = `${signVh}${vh.toFixed(2)} mV`;

      if (this.valVhEl) this.valVhEl.textContent = vhText;
      if (this.drawerValVh) this.drawerValVh.textContent = vhText;
      if (this.tokenValVh) this.tokenValVh.textContent = vhText;

      // Response readouts across all drawer panes
      if (this.respVhB) this.respVhB.textContent = vhText;
      if (this.respVhI) this.respVhI.textContent = vhText;
      if (this.respVhD) this.respVhD.textContent = vhText;
      if (this.respVhRh) this.respVhRh.textContent = vhText;
    }

    // 2. Magnetic Field B
    if (diffB) {
      this.lastB = b;
      const signB = b >= 0 ? '+' : '';
      const textB = `${signB}${b.toFixed(2)} T`;
      if (this.valBEl) this.valBEl.textContent = textB;
      if (this.drawerValB) this.drawerValB.textContent = textB;
      if (this.tokenValB) this.tokenValB.textContent = textB;

      if (
        this.sliderB &&
        (typeof document === 'undefined' || document.activeElement !== this.sliderB) &&
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
        (typeof document === 'undefined' || document.activeElement !== this.sliderI) &&
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

    // 4. Wafer Thickness d
    if (diffD) {
      this.lastD = d;
      const textD = `${d.toFixed(2)} mm`;
      if (this.txtValD) this.txtValD.textContent = textD;
      if (this.drawerValD) this.drawerValD.textContent = textD;
      if (this.tokenValD) this.tokenValD.textContent = textD;

      if (
        this.sliderD &&
        (typeof document === 'undefined' || document.activeElement !== this.sliderD) &&
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

    // 6. Micro Stats
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
