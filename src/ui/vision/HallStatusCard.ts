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

  // Active view tab: 'vh_b' | 'vh_i' | 'lorentz_diagram'
  private viewMode: 'vh_b' | 'vh_i' | 'lorentz_diagram' = 'vh_b';

  // High-DPI single interactive canvas
  private canvasEl: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;

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
  private valVhEl: HTMLElement | null = null;
  private valBEl: HTMLElement | null = null;
  private valIEl: HTMLElement | null = null;
  private valRhEl: HTMLElement | null = null;
  private valKhEl: HTMLElement | null = null;
  private chipPolarityEl: HTMLElement | null = null;
  private subEhEl: HTMLElement | null = null;
  private subVdEl: HTMLElement | null = null;
  private tagSlopeEl: HTMLElement | null = null;

  private sliderB: HTMLInputElement | null = null;
  private sliderI: HTMLInputElement | null = null;
  private sliderD: HTMLInputElement | null = null;
  private sliderN: HTMLInputElement | null = null;
  private sliderMu: HTMLInputElement | null = null;

  private txtValD: HTMLElement | null = null;
  private txtValN: HTMLElement | null = null;
  private txtValMu: HTMLElement | null = null;

  private btnRevB: HTMLButtonElement | null = null;
  private btnRevI: HTMLButtonElement | null = null;
  private btnToggleCarrier: HTMLButtonElement | null = null;
  private btnToggleVectors: HTMLButtonElement | null = null;
  private btnToggleParticles: HTMLButtonElement | null = null;
  private btnResetStandard: HTMLButtonElement | null = null;

  private tabBtnVhB: HTMLButtonElement | null = null;
  private tabBtnVhI: HTMLButtonElement | null = null;
  private tabBtnDiagram: HTMLButtonElement | null = null;

  private specimenCards: NodeListOf<HTMLElement> | null = null;
  private selectMaterialCompat: HTMLSelectElement | null = null;

  private lastRenderTime = 0;

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
      <div class="hall-apple-container">
        <!-- 1. Apple Clean Top Navigation Bar -->
        <div class="hall-apple-nav">
          <div class="hall-nav-left">
            <div class="hall-apple-icon">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="9"/>
                <path d="M12 7v10M8 12h8"/>
              </svg>
            </div>
            <div class="hall-nav-titles">
              <span class="hall-apple-title">霍尔效应 · 载流子动力学</span>
              <span class="hall-apple-subtitle">Quantum Hall Effect · V_H = (R_H · I · B) / d</span>
            </div>
          </div>

          <!-- Apple Segmented Picker for Chart Modes -->
          <div class="apple-segmented-picker">
            <button class="seg-btn active" id="btn-tab-vh-b">V_H - B 特性</button>
            <button class="seg-btn" id="btn-tab-vh-i">V_H - I 响应</button>
            <button class="seg-btn" id="btn-tab-diagram">微观受力平衡</button>
          </div>
        </div>

        <!-- 2. Apple Vision Studio Grid (56% / 44%) -->
        <div class="hall-apple-grid">
          <!-- Left: Minimalist Chart Card -->
          <div class="hall-apple-canvas-card">
            <div class="hall-canvas-top-row">
              <div class="hall-canvas-legend">
                <div class="hall-legend-pill">
                  <span style="width: 8px; height: 8px; border-radius: 50%; background: #2997ff; display: inline-block;"></span>
                  <span>理论特性曲线</span>
                </div>
                <div class="hall-legend-pill">
                  <span style="width: 6px; height: 6px; border-radius: 50%; background: #ffffff; display: inline-block; box-shadow: 0 0 4px #ffffff;"></span>
                  <span>当前工况点</span>
                </div>
              </div>
              <span class="hall-apple-tag" id="tag-slope-display" style="font-family: monospace;">K = 10.00 mV/T</span>
            </div>
            <div class="hall-canvas-viewport" id="hall-canvas-wrap">
              <canvas id="canvas-hall-main"></canvas>
            </div>
          </div>

          <!-- Right: Telemetry & Controls Column -->
          <div class="hall-apple-ctrl-col">
            <!-- Hero Readout Block -->
            <div class="hall-apple-hero" id="card-vh">
              <div class="hall-hero-label-row">
                <span class="hall-hero-label">霍尔感应电势差 V_H</span>
                <span class="hall-apple-tag" id="chip-hall-polarity">电子导电 (e⁻)</span>
              </div>
              <div class="hall-hero-num-row">
                <span class="hall-hero-num" id="val-vh">-49.93</span>
                <span class="hall-hero-unit">mV</span>
              </div>
              <div class="hall-hero-sub-stats">
                <span id="sub-hall-eh">E_H: 12.48 V/m</span>
                <span id="sub-hall-vd">v_d: 24.37 m/s</span>
                <span id="val-kh" style="margin-left: auto; color: rgba(255, 255, 255, 0.75);">K_H: 10.00</span>
              </div>
            </div>

            <!-- Parameters Block (Field B & Current I) -->
            <div class="hall-apple-card-block" id="card-b">
              <div class="hall-param-row">
                <div class="hall-param-head">
                  <span class="hall-param-title">垂直穿透磁场 B</span>
                  <div style="display: flex; align-items: center; gap: 8px;">
                    <span class="hall-param-val" id="val-b">+0.50 T</span>
                    <button class="apple-pill-btn" id="btn-rev-b" style="padding: 2px 9px; font-size: 11px;">
                      <span>反转</span>
                    </button>
                  </div>
                </div>
                <input type="range" class="hall-apple-slider" id="slider-hall-b" min="-1.50" max="1.50" step="0.02" value="0.50" />
              </div>

              <div class="hall-param-row" id="card-i" style="margin-top: 6px;">
                <div class="hall-param-head">
                  <span class="hall-param-title">纵向激励电流 I_S</span>
                  <div style="display: flex; align-items: center; gap: 8px;">
                    <span class="hall-param-val" id="val-i">+10.0 mA</span>
                    <button class="apple-pill-btn" id="btn-rev-i" style="padding: 2px 9px; font-size: 11px;">
                      <span>换向</span>
                    </button>
                  </div>
                </div>
                <input type="range" class="hall-apple-slider" id="slider-hall-i" min="-20.0" max="20.0" step="0.5" value="10.0" />
              </div>
            </div>

            <!-- Specimen Materials Selector -->
            <div class="hall-apple-card-block">
              <span class="hall-hero-label" style="margin-bottom: 2px;">试样半导体材质</span>
              <div class="hall-specimen-deck">
                <div class="hall-specimen-item active" data-material="n-gaas">
                  <div class="hall-specimen-meta">
                    <span class="hall-specimen-name">n型砷化镓 (n-GaAs)</span>
                    <span class="hall-specimen-desc">电子导电 · 高灵敏度霍尔元件</span>
                  </div>
                  <span class="hall-apple-tag">e⁻</span>
                </div>
                <div class="hall-specimen-item" data-material="p-silicon">
                  <div class="hall-specimen-meta">
                    <span class="hall-specimen-name">p型单晶硅 (p-Si)</span>
                    <span class="hall-specimen-desc">空穴导电 · 正霍尔系数 R_H > 0</span>
                  </div>
                  <span class="hall-apple-tag">h⁺</span>
                </div>
                <div class="hall-specimen-item" data-material="copper">
                  <div class="hall-specimen-meta">
                    <span class="hall-specimen-name">高纯金属紫铜薄膜</span>
                    <span class="hall-specimen-desc">自由电子 · 极高浓度 (10²⁸ m⁻³)</span>
                  </div>
                  <span class="hall-apple-tag">Cu</span>
                </div>
              </div>

              <!-- Wafer Thickness Slider -->
              <div class="hall-param-row" style="margin-top: 8px;" id="card-rh">
                <div class="hall-param-head">
                  <span class="hall-param-title">晶片厚度 d (V_H ∝ 1/d)</span>
                  <span class="hall-param-val" id="txt-slider-d">0.50 mm</span>
                </div>
                <input type="range" class="hall-apple-slider" id="slider-hall-d" min="0.05" max="1.50" step="0.05" value="0.50" />
              </div>
            </div>
          </div>
        </div>

        <!-- 3. Bottom Minimalist Toolbar -->
        <div class="hall-apple-toolbar">
          <div style="display: flex; align-items: center; gap: 8px;">
            <button class="apple-pill-btn active" id="btn-toggle-vectors">
              <span>3D 矢量指示</span>
            </button>
            <button class="apple-pill-btn active" id="btn-toggle-particles">
              <span>微观载流子流</span>
            </button>
          </div>
          <button class="apple-pill-btn" id="btn-reset-standard">
            <span>重置工况</span>
          </button>
        </div>

        <!-- Hidden compatibility elements to maintain DOM API contracts -->
        <div style="display: none;">
          <select id="select-hall-material">
            <option value="n-gaas">n-gaas</option>
            <option value="p-silicon">p-silicon</option>
            <option value="copper">copper</option>
            <option value="custom">custom</option>
          </select>
          <span id="sub-vh"></span>
          <span id="caption-vh"></span>
          <span id="sub-b"></span>
          <span id="sub-b-milli"></span>
          <span id="sub-i"></span>
          <span id="sub-rh"></span>
          <span id="val-rh"></span>
          <span id="caption-rh"></span>
          <canvas id="canvas-hall-curve"></canvas>
          <canvas id="canvas-hall-diag"></canvas>
          <input type="range" id="slider-hall-n" value="21.10" />
          <span id="txt-slider-n"></span>
          <input type="range" id="slider-hall-mu" value="8500" />
          <span id="txt-slider-mu"></span>
          <button id="btn-toggle-carrier"></button>
          <button id="btn-toggle-flux"></button>
        </div>
      </div>
    `;

    this.cacheDOMElements();
    this.bindEvents();
    this.initCanvas();
  }

  private cacheDOMElements(): void {
    const el = this.element;
    this.valVhEl = el.querySelector('#val-vh');
    this.valBEl = el.querySelector('#val-b');
    this.valIEl = el.querySelector('#val-i');
    this.valRhEl = el.querySelector('#val-rh');
    this.valKhEl = el.querySelector('#val-kh');
    this.chipPolarityEl = el.querySelector('#chip-hall-polarity');
    this.subEhEl = el.querySelector('#sub-hall-eh');
    this.subVdEl = el.querySelector('#sub-hall-vd');
    this.tagSlopeEl = el.querySelector('#tag-slope-display');

    this.sliderB = el.querySelector('#slider-hall-b');
    this.sliderI = el.querySelector('#slider-hall-i');
    this.sliderD = el.querySelector('#slider-hall-d');
    this.sliderN = el.querySelector('#slider-hall-n');
    this.sliderMu = el.querySelector('#slider-hall-mu');

    this.txtValD = el.querySelector('#txt-slider-d');
    this.txtValN = el.querySelector('#txt-slider-n');
    this.txtValMu = el.querySelector('#txt-slider-mu');

    this.btnRevB = el.querySelector('#btn-rev-b');
    this.btnRevI = el.querySelector('#btn-rev-i');
    this.btnToggleCarrier = el.querySelector('#btn-toggle-carrier');
    this.btnToggleVectors = el.querySelector('#btn-toggle-vectors');
    this.btnToggleParticles = el.querySelector('#btn-toggle-particles');
    this.btnResetStandard = el.querySelector('#btn-reset-standard');

    this.tabBtnVhB = el.querySelector('#btn-tab-vh-b');
    this.tabBtnVhI = el.querySelector('#btn-tab-vh-i');
    this.tabBtnDiagram = el.querySelector('#btn-tab-diagram');

    this.specimenCards = el.querySelectorAll('[data-material]');
    this.selectMaterialCompat = el.querySelector('#select-hall-material');

    this.canvasEl = el.querySelector('#canvas-hall-main') as HTMLCanvasElement;
  }

  private initCanvas(): void {
    if (!this.canvasEl) return;
    this.ctx = this.canvasEl.getContext('2d')!;
    this.resizeCanvas();
    if (typeof window !== 'undefined') {
      window.addEventListener('resize', () => this.resizeCanvas());
    }
  }

  private resizeCanvas(): void {
    if (!this.canvasEl) return;
    const wrap = this.element.querySelector('#hall-canvas-wrap') as HTMLElement;
    if (wrap && wrap.clientWidth > 0 && wrap.clientHeight > 0) {
      const dpr = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 2) : 1;
      this.canvasEl.width = Math.floor(wrap.clientWidth * dpr);
      this.canvasEl.height = Math.floor(wrap.clientHeight * dpr);
    } else {
      this.canvasEl.width = 680;
      this.canvasEl.height = 360;
    }
    this.renderCanvas();
  }

  private bindEvents(): void {
    // 1. Magnetic Field Slider & Polarity Button
    this.sliderB?.addEventListener('input', (e) => {
      const b = parseFloat((e.target as HTMLInputElement).value);
      this.callbacks.onMagFieldChange?.(b);
    });

    this.btnRevB?.addEventListener('click', () => {
      this.callbacks.onToggleFieldPolarity?.();
    });

    // 2. Control Current Slider & Polarity Button
    this.sliderI?.addEventListener('input', (e) => {
      const i = parseFloat((e.target as HTMLInputElement).value);
      this.callbacks.onCurrentChange?.(i);
    });

    this.btnRevI?.addEventListener('click', () => {
      this.callbacks.onToggleCurrentPolarity?.();
    });

    // 3. Specimen Cards Selection
    this.specimenCards?.forEach((card) => {
      card.addEventListener('click', () => {
        const mat = card.getAttribute('data-material');
        if (mat) {
          this.callbacks.onMaterialChange?.(mat);
        }
      });
    });

    // 4. Thickness Slider
    this.sliderD?.addEventListener('input', (e) => {
      const d = parseFloat((e.target as HTMLInputElement).value);
      this.callbacks.onThicknessChange?.(d);
    });

    // 5. Visual toggles
    this.btnToggleVectors?.addEventListener('click', () => {
      const active = this.btnToggleVectors!.classList.toggle('active');
      this.callbacks.onToggleVectors?.(active);
    });

    this.btnToggleParticles?.addEventListener('click', () => {
      const active = this.btnToggleParticles!.classList.toggle('active');
      this.callbacks.onToggleParticles?.(active);
    });

    // 6. Tabs switching
    this.tabBtnVhB?.addEventListener('click', () => this.switchView('vh_b'));
    this.tabBtnVhI?.addEventListener('click', () => this.switchView('vh_i'));
    this.tabBtnDiagram?.addEventListener('click', () => this.switchView('lorentz_diagram'));

    // 7. Reset button
    this.btnResetStandard?.addEventListener('click', () => {
      this.callbacks.onMaterialChange?.('n-gaas');
      this.callbacks.onMagFieldChange?.(0.5);
      this.callbacks.onCurrentChange?.(10.0);
      this.callbacks.onThicknessChange?.(0.5);
    });
  }

  private switchView(mode: 'vh_b' | 'vh_i' | 'lorentz_diagram'): void {
    this.viewMode = mode;
    this.tabBtnVhB?.classList.toggle('active', mode === 'vh_b');
    this.tabBtnVhI?.classList.toggle('active', mode === 'vh_i');
    this.tabBtnDiagram?.classList.toggle('active', mode === 'lorentz_diagram');
    this.renderCanvas();
  }

  public setVisible(visible: boolean): void {
    this.isVisible = visible;
    this.element.style.display = visible ? 'flex' : 'none';
    if (visible) {
      requestAnimationFrame(() => {
        this.resizeCanvas();
      });
    }
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

    // 1. Update V_H Hero Readout (Clean Big Apple Number)
    if (this.valVhEl) {
      const absVh = Math.abs(vh);
      if (absVh < 0.001) {
        this.valVhEl.textContent = '0.00';
      } else if (absVh < 0.02) {
        const uv = vh * 1000;
        const sign = uv >= 0 ? '+' : '';
        this.valVhEl.textContent = `${sign}${uv.toFixed(2)}`;
      } else {
        const sign = vh >= 0 ? '+' : '';
        this.valVhEl.textContent = `${sign}${vh.toFixed(2)}`;
      }
    }

    if (this.chipPolarityEl) {
      if (carrier === 'electron') {
        this.chipPolarityEl.textContent = '电子导电 (e⁻)';
      } else if (carrier === 'hole') {
        this.chipPolarityEl.textContent = '空穴导电 (h⁺)';
      } else {
        this.chipPolarityEl.textContent = '金属自由电子';
      }
    }

    if (this.subEhEl) {
      this.subEhEl.textContent = `E_H: ${this.currentData.hallElectricFieldVm.toFixed(2)} V/m`;
    }
    if (this.subVdEl) {
      this.subVdEl.textContent = `v_d: ${this.currentData.driftVelocityMs.toFixed(2)} m/s`;
    }

    // 2. Magnetic Field Card
    if (this.valBEl) {
      const sign = b >= 0 ? '+' : '';
      this.valBEl.textContent = `${sign}${b.toFixed(2)} T`;
    }
    if (this.sliderB && Math.abs(parseFloat(this.sliderB.value) - b) > 0.005) {
      this.sliderB.value = b.toString();
    }

    // 3. Control Current Card
    if (this.valIEl) {
      const sign = i >= 0 ? '+' : '';
      this.valIEl.textContent = `${sign}${i.toFixed(1)} mA`;
    }
    if (this.sliderI && Math.abs(parseFloat(this.sliderI.value) - i) > 0.1) {
      this.sliderI.value = i.toString();
    }

    // 4. R_H & K_H
    if (this.valRhEl) {
      this.valRhEl.textContent = rh.toExponential(2);
    }
    if (this.valKhEl) {
      this.valKhEl.textContent = `K_H: ${kh.toFixed(2)}`;
    }

    // 5. Specimen Cards Active State
    this.specimenCards?.forEach((card) => {
      const k = card.getAttribute('data-material');
      card.classList.toggle('active', k === matKey);
    });
    if (this.selectMaterialCompat) {
      this.selectMaterialCompat.value = matKey;
    }

    // 6. Sliders & Values
    if (this.sliderD && Math.abs(parseFloat(this.sliderD.value) - d) > 0.01) {
      this.sliderD.value = d.toString();
    }
    if (this.txtValD) {
      this.txtValD.textContent = `${d.toFixed(2)} mm`;
    }

    // Throttle canvas repaint
    const now = performance.now();
    if (now - this.lastRenderTime > 25) {
      this.lastRenderTime = now;
      this.renderCanvas();
    }
  }

  // ================= Apple-Style Minimalist Canvas Renderer =================
  private renderCanvas(): void {
    if (!this.ctx || !this.canvasEl) return;
    const ctx = this.ctx;
    const w = this.canvasEl.width;
    const h = this.canvasEl.height;

    ctx.clearRect(0, 0, w, h);

    if (this.viewMode === 'vh_b' || this.viewMode === 'vh_i') {
      this.renderCharacteristicCurve(ctx, w, h, this.viewMode);
    } else {
      this.renderLorentzBalanceDiagram(ctx, w, h);
    }
  }

  private renderCharacteristicCurve(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    mode: 'vh_b' | 'vh_i'
  ): void {
    const padX = 54;
    const padY = 32;
    const chartW = Math.max(100, w - padX * 2);
    const chartH = Math.max(80, h - padY * 2);

    const b = this.currentData.magFieldTesla;
    const i = this.currentData.currentMa;
    const kh = this.currentData.hallSensitivityKh;
    const rh = this.currentData.hallCoefficientRh;
    const currentVh = this.currentData.hallVoltageMv;

    // 1. Apple Hairline Coordinate Grid
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.lineWidth = 1;

    const gridCols = 8;
    const gridRows = 6;
    for (let c = 0; c <= gridCols; c++) {
      const gx = padX + (c / gridCols) * chartW;
      ctx.beginPath();
      ctx.moveTo(gx, padY);
      ctx.lineTo(gx, padY + chartH);
      ctx.stroke();
    }
    for (let r = 0; r <= gridRows; r++) {
      const gy = padY + (r / gridRows) * chartH;
      ctx.beginPath();
      ctx.moveTo(padX, gy);
      ctx.lineTo(padX + chartW, gy);
      ctx.stroke();
    }

    // 2. Origin Axes (Clean Center Crosshair)
    const originX = padX + chartW / 2;
    const originY = padY + chartH / 2;

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
    ctx.lineWidth = 1.2;

    // X Axis
    ctx.beginPath();
    ctx.moveTo(padX, originY);
    ctx.lineTo(padX + chartW, originY);
    ctx.stroke();

    // Y Axis
    ctx.beginPath();
    ctx.moveTo(originX, padY);
    ctx.lineTo(originX, padY + chartH);
    ctx.stroke();

    // Axes Labels in SF Pro Text
    ctx.fillStyle = 'rgba(255, 255, 255, 0.50)';
    ctx.font = '500 11px -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText('V_H (mV)', originX - 10, padY + 14);

    let maxVar = 1.5;
    let varUnit = 'T';
    let varName = 'B';
    if (mode === 'vh_i') {
      maxVar = 20.0;
      varUnit = 'mA';
      varName = 'I_S';
    }

    ctx.textAlign = 'left';
    ctx.fillText(`${varName} (${varUnit})`, padX + chartW - 55, originY - 8);

    // Slope calculation
    let slope = 0;
    if (mode === 'vh_b') {
      slope = (rh >= 0 ? 1 : -1) * kh * i;
    } else {
      slope = (rh >= 0 ? 1 : -1) * kh * b;
    }

    if (this.tagSlopeEl) {
      this.tagSlopeEl.textContent = `拟合斜率 K = ${slope.toFixed(2)} mV/${varUnit}`;
    }

    const maxExpectedVh = Math.max(10, Math.abs(slope * maxVar) * 1.15);

    // 3. Apple System Blue Linear Curve
    ctx.strokeStyle = '#2997ff';
    ctx.lineWidth = 2.0;
    ctx.beginPath();

    const x1 = -maxVar;
    const y1 = slope * x1;
    const px1 = originX + (x1 / maxVar) * (chartW / 2);
    const py1 = originY - (y1 / maxExpectedVh) * (chartH / 2);

    const x2 = maxVar;
    const y2 = slope * x2;
    const px2 = originX + (x2 / maxVar) * (chartW / 2);
    const py2 = originY - (y2 / maxExpectedVh) * (chartH / 2);

    ctx.moveTo(px1, py1);
    ctx.lineTo(px2, py2);
    ctx.stroke();

    // 4. Current Operating Point
    const currentVar = mode === 'vh_b' ? b : i;
    const curPx = originX + (currentVar / maxVar) * (chartW / 2);
    const curPy = originY - (currentVh / maxExpectedVh) * (chartH / 2);

    // Hairline Projection Dash Lines
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
    if (typeof ctx.setLineDash === 'function') {
      ctx.setLineDash([2, 3]);
    }
    ctx.lineWidth = 1;

    ctx.beginPath();
    ctx.moveTo(curPx, originY);
    ctx.lineTo(curPx, curPy);
    ctx.lineTo(originX, curPy);
    ctx.stroke();
    if (typeof ctx.setLineDash === 'function') {
      ctx.setLineDash([]);
    }

    // Glowing Operating Dot (Pure White with Soft Blue Aura)
    ctx.shadowColor = '#2997ff';
    ctx.shadowBlur = 10;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(curPx, curPy, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    // Coordinate Label Tag (Minimal Apple Capsule)
    ctx.fillStyle = 'rgba(28, 28, 30, 0.85)';
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 1;

    const labelText = `(${currentVar >= 0 ? '+' : ''}${currentVar.toFixed(2)} ${varUnit}, ${currentVh.toFixed(2)} mV)`;
    const textW = (typeof ctx.measureText === 'function' ? ctx.measureText(labelText).width : 115) + 16;
    const textH = 20;

    const tagX = Math.min(w - textW - 8, Math.max(8, curPx + 8));
    const tagY = Math.max(padY + 4, Math.min(h - padY - textH, curPy - 24));

    if (typeof ctx.roundRect === 'function') {
      ctx.beginPath();
      ctx.roundRect(tagX, tagY, textW, textH, 6);
      ctx.fill();
      ctx.stroke();
    } else {
      ctx.fillRect(tagX, tagY, textW, textH);
      ctx.strokeRect(tagX, tagY, textW, textH);
    }

    ctx.fillStyle = '#ffffff';
    ctx.font = '500 11px -apple-system, BlinkMacSystemFont, "SF Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText(labelText, tagX + 8, tagY + 14);
  }

  private renderLorentzBalanceDiagram(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    const carrier = this.currentData.carrierType;
    const vh = this.currentData.hallVoltageMv;

    // Central Monolithic Wafer Cross-Section Box
    const boxW = Math.min(360, w * 0.65);
    const boxH = Math.min(130, h * 0.44);
    const boxX = (w - boxW) / 2;
    const boxY = (h - boxH) / 2 + 4;

    ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 1.5;

    if (typeof ctx.roundRect === 'function') {
      ctx.beginPath();
      ctx.roundRect(boxX, boxY, boxW, boxH, 12);
      ctx.fill();
      ctx.stroke();
    } else {
      ctx.fillRect(boxX, boxY, boxW, boxH);
      ctx.strokeRect(boxX, boxY, boxW, boxH);
    }

    const frontPositive = vh > 0;
    const backPositive = vh < 0;

    // Edge Labels
    ctx.font = '500 11.5px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.textAlign = 'center';

    // Top Edge (-Z)
    ctx.fillStyle = backPositive ? '#ffffff' : '#2997ff';
    ctx.fillText(`后侧 (-Z 侧壁) · ${backPositive ? '高电势 (+)' : '低电势 (-)'}`, w / 2, boxY - 10);

    // Bottom Edge (+Z)
    ctx.fillStyle = frontPositive ? '#ffffff' : '#2997ff';
    ctx.fillText(`前侧 (+Z 侧壁) · ${frontPositive ? '高电势 (+)' : '低电势 (-)'}`, w / 2, boxY + boxH + 20);

    // Central Carrier Particle (Apple System Blue)
    const cx = w / 2;
    const cy = boxY + boxH / 2;

    ctx.fillStyle = '#2997ff';
    ctx.beginPath();
    ctx.arc(cx, cy, 12, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.font = '600 12px "SF Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(carrier === 'electron' ? 'e⁻' : carrier === 'hole' ? 'h⁺' : 'e⁻', cx, cy);
    ctx.textBaseline = 'alphabetic';

    // Force Vectors
    const arrowLen = 44;
    const flPointsDown = (carrier === 'electron' && vh < 0) || (carrier === 'hole' && vh > 0);

    // F_L Arrow (Apple System Blue)
    const flDirY = flPointsDown ? 1 : -1;
    ctx.strokeStyle = '#2997ff';
    ctx.fillStyle = '#2997ff';
    ctx.lineWidth = 2.0;

    ctx.beginPath();
    ctx.moveTo(cx + 40, cy);
    ctx.lineTo(cx + 40, cy + flDirY * arrowLen);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(cx + 40, cy + flDirY * arrowLen);
    ctx.lineTo(cx + 36, cy + flDirY * (arrowLen - 7));
    ctx.lineTo(cx + 44, cy + flDirY * (arrowLen - 7));
    ctx.closePath();
    ctx.fill();

    ctx.font = '500 11px -apple-system, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('F_L = q(v × B)', cx + 50, cy + flDirY * (arrowLen * 0.6));

    // Electric Force F_e Arrow (Subtle White)
    const feDirY = -flDirY;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.65)';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.65)';
    ctx.beginPath();
    ctx.moveTo(cx - 40, cy);
    ctx.lineTo(cx - 40, cy + feDirY * arrowLen);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(cx - 40, cy + feDirY * arrowLen);
    ctx.lineTo(cx - 44, cy + feDirY * (arrowLen - 7));
    ctx.lineTo(cx - 36, cy + feDirY * (arrowLen - 7));
    ctx.closePath();
    ctx.fill();

    ctx.textAlign = 'right';
    ctx.fillText('F_e = q · E_H', cx - 50, cy + feDirY * (arrowLen * 0.6));

    // Bottom explanation
    ctx.fillStyle = 'rgba(255, 255, 255, 0.50)';
    ctx.font = '400 11px -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('平衡条件: q · E_H = q · v_d · B  ⟹  V_H = (I_S · B) / (n · q · d)', w / 2, h - 10);
  }
}
