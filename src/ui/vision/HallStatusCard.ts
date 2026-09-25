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
  carrierType: 'electron' | 'hole' | 'metal';
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
  private canvasCurve: HTMLCanvasElement;
  private canvasDiag: HTMLCanvasElement;
  private callbacks: HallStatusCardCallbacks;

  private isVisible = false;
  private chartMode: 'vh_b' | 'vh_i' = 'vh_b'; // 'vh_b' (V_H vs B) or 'vh_i' (V_H vs I)

  private currentData: HallTelemetryData = {
    magFieldTesla: 0.5,
    currentMa: 10.0,
    waferThicknessMm: 0.5,
    waferWidthMm: 4.0,
    waferLengthMm: 8.0,
    materialKey: 'n-gaas',
    materialName: '高灵敏度 n-GaAs 芯片',
    carrierType: 'electron',
    carrierConcentration: 1.25e21,
    carrierCharge: -1.602e-19,
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
  private subVhEl: HTMLElement | null = null;
  private subBEl: HTMLElement | null = null;
  private subIEl: HTMLElement | null = null;
  private subRhEl: HTMLElement | null = null;

  private sliderB: HTMLInputElement | null = null;
  private sliderI: HTMLInputElement | null = null;
  private sliderD: HTMLInputElement | null = null;
  private sliderN: HTMLInputElement | null = null;
  private sliderMu: HTMLInputElement | null = null;

  private selectMaterial: HTMLSelectElement | null = null;
  private btnRevB: HTMLButtonElement | null = null;
  private btnRevI: HTMLButtonElement | null = null;
  private btnToggleCarrier: HTMLButtonElement | null = null;
  private btnToggleVectors: HTMLButtonElement | null = null;
  private btnToggleParticles: HTMLButtonElement | null = null;
  private btnTabVhB: HTMLButtonElement | null = null;
  private btnTabVhI: HTMLButtonElement | null = null;

  private lastChartRenderTime = 0;

  constructor(callbacks: HallStatusCardCallbacks = {}) {
    this.callbacks = callbacks;
    this.createUI();
  }

  private createUI(): void {
    this.element = document.createElement('div');
    this.element.className = 'vision-thermo-status-card hud-interactive';

    this.element.innerHTML = `
      <div class="thermo-card-container">
        <!-- 1. Top Metrics Deck -->
        <div class="thermo-metrics-deck">
          <!-- Card 1: Hall Voltage V_H -->
          <div class="thermo-metric-card" id="card-vh">
            <span class="thermo-metric-label">霍尔电势差 V_H (U_H)</span>
            <div class="thermo-metric-value" id="val-vh" style="color: #38bdf8;">-25.00 mV</div>
            <span class="thermo-metric-sub" id="sub-vh">横向霍尔电场: 6.25 V/m</span>
            <div class="thermo-metric-caption" id="caption-vh">前侧(-) 后侧(+) · 负霍尔电势</div>
          </div>

          <!-- Card 2: Magnetic Field B -->
          <div class="thermo-metric-card" id="card-b">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <span class="thermo-metric-label">气隙磁感应强度 B</span>
              <button class="carnot-btn" id="btn-rev-b" style="padding: 2px 7px; font-size: 11px; height: 20px;" title="反转磁场极性 N ↔ S">反转极性</button>
            </div>
            <div class="thermo-metric-value" id="val-b" style="color: #06b6d4;">+0.500 T</div>
            <span class="thermo-metric-sub" id="sub-b">500.0 mT · 极靴垂直穿透</span>
            <input type="range" class="thermo-mini-slider" id="slider-hall-b" min="-1.5" max="1.5" step="0.02" value="0.5" style="accent-color: #06b6d4;" />
          </div>

          <!-- Card 3: Control Current I -->
          <div class="thermo-metric-card" id="card-i">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <span class="thermo-metric-label">激励工作电流 I_S</span>
              <button class="carnot-btn" id="btn-rev-i" style="padding: 2px 7px; font-size: 11px; height: 20px;" title="反向通电">换向开关</button>
            </div>
            <div class="thermo-metric-value" id="val-i" style="color: #facc15;">+10.0 mA</div>
            <span class="thermo-metric-sub" id="sub-i">载流子漂移速: 12.5 m/s</span>
            <input type="range" class="thermo-mini-slider" id="slider-hall-i" min="-20" max="20" step="0.5" value="10" style="accent-color: #facc15;" />
          </div>

          <!-- Card 4: Hall Coefficient & Sensitivity -->
          <div class="thermo-metric-card" id="card-rh">
            <span class="thermo-metric-label">霍尔系数 R_H & 灵敏度 K_H</span>
            <div class="thermo-metric-value" id="val-rh" style="color: #a855f7; font-size: 20px;">-5.00×10⁻³</div>
            <span class="thermo-metric-sub" id="sub-rh">K_H = 10.0 mV/(mA·T)</span>
            <div class="thermo-metric-caption" id="caption-rh">厚度 d: 0.50 mm · 单载流子模型</div>
          </div>
        </div>

        <!-- 2. Dual Analytics Charts Deck -->
        <div class="thermo-charts-deck">
          <!-- Left: Dynamic Response Characteristic Curve (V_H-B or V_H-I) -->
          <div class="thermo-chart-box">
            <div class="thermo-chart-header">
              <div style="display: flex; align-items: center; gap: 8px;">
                <span class="thermo-chart-title">特性响应曲线与线性度拟合</span>
                <div class="carnot-btn-group" style="margin: 0;">
                  <button class="carnot-btn active" id="btn-tab-vh-b" style="padding: 2px 8px; font-size: 11px; height: 22px;">V_H - B 曲线</button>
                  <button class="carnot-btn" id="btn-tab-vh-i" style="padding: 2px 8px; font-size: 11px; height: 22px;">V_H - I 曲线</button>
                </div>
              </div>
              <div class="thermo-chart-legend">
                <span class="legend-line" style="background: #38bdf8; height: 2px;"></span><span>理论响应直线</span>
                <span class="legend-dot" style="background: #ef4444;"></span><span>当前工作点</span>
              </div>
            </div>
            <div class="thermo-canvas-wrap">
              <canvas id="canvas-hall-curve" width="480" height="230"></canvas>
            </div>
          </div>

          <!-- Right: Carrier Nature & Lorentz Force Balance Diagnosis -->
          <div class="thermo-chart-box">
            <div class="thermo-chart-header">
              <span class="thermo-chart-title">载流子微观动力学与极性判定图解</span>
              <div class="thermo-chart-legend">
                <span class="legend-dot" style="background: #ef4444;"></span><span>高电势(+)</span>
                <span class="legend-dot" style="background: #3b82f6;"></span><span>低电势(-)</span>
              </div>
            </div>
            <div class="thermo-canvas-wrap">
              <canvas id="canvas-hall-diag" width="480" height="230"></canvas>
            </div>
          </div>
        </div>

        <!-- 3. Advanced Parameters & Scientific Controls Deck -->
        <div class="carnot-control-deck" style="flex-direction: column; gap: 8px;">
          <!-- Row A: Material Preset Selector & Physical Toggles -->
          <div style="display: flex; justify-content: space-between; align-items: center; width: 100%; gap: 12px; flex-wrap: wrap;">
            <div class="carnot-btn-group" style="flex: 1; min-width: 280px;">
              <select class="carnot-select" id="select-hall-material" style="flex: 1;" title="切换不同半导体与金属试样">
                <option value="n-gaas">试样: n型 GaAs 砷化镓 (高灵敏霍尔探头, e⁻)</option>
                <option value="p-silicon">试样: p型 Si 单晶硅 (空穴导电, h⁺ 正霍尔电势)</option>
                <option value="copper">试样: 高纯金属紫铜薄膜 (超高载流子浓度, 微伏级)</option>
                <option value="custom">试样: 自定义半导体科研参数 (无级调节 n 与 μ)</option>
              </select>
            </div>

            <div class="carnot-btn-group">
              <button class="carnot-btn" id="btn-toggle-carrier" title="切换载流子电荷性质: 电子(q = -e) ↔ 空穴(q = +e)">
                <span>载流子: 电子 (e⁻)</span>
              </button>
              <button class="carnot-btn active" id="btn-toggle-vectors" title="开关3D速度v、磁场B、洛伦兹力F_L与电场E_H矢量指示箭头">
                <span>3D力矢量: 开</span>
              </button>
              <button class="carnot-btn active" id="btn-toggle-particles" title="开关微观载流子粒子流与侧壁发光势垒">
                <span>粒子透视: 开</span>
              </button>
            </div>
          </div>

          <!-- Row B: Fine-tuning Sliders for Thickness d, Concentration n, Mobility μ -->
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 10px; width: 100%; background: rgba(255, 255, 255, 0.03); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 8px; padding: 8px 12px;">
            <!-- Thickness d -->
            <div style="display: flex; flex-direction: column; gap: 3px;">
              <div style="display: flex; justify-content: space-between; font-size: 11px; color: #94a3b8;">
                <span>薄片厚度 d</span>
                <span id="txt-slider-d" style="color: #f1f5f9; font-family: monospace;">0.50 mm</span>
              </div>
              <input type="range" class="thermo-mini-slider" id="slider-hall-d" min="0.05" max="1.50" step="0.05" value="0.5" style="accent-color: #a855f7;" />
            </div>

            <!-- Carrier Concentration n -->
            <div style="display: flex; flex-direction: column; gap: 3px;">
              <div style="display: flex; justify-content: space-between; font-size: 11px; color: #94a3b8;">
                <span>浓度 lg(n / m⁻³)</span>
                <span id="txt-slider-n" style="color: #f1f5f9; font-family: monospace;">21.10 (1.25×10²¹)</span>
              </div>
              <input type="range" class="thermo-mini-slider" id="slider-hall-n" min="19.0" max="29.0" step="0.1" value="21.1" style="accent-color: #38bdf8;" />
            </div>

            <!-- Carrier Mobility μ -->
            <div style="display: flex; flex-direction: column; gap: 3px;">
              <div style="display: flex; justify-content: space-between; font-size: 11px; color: #94a3b8;">
                <span>迁移率 μ</span>
                <span id="txt-slider-mu" style="color: #f1f5f9; font-family: monospace;">8500 cm²/V·s</span>
              </div>
              <input type="range" class="thermo-mini-slider" id="slider-hall-mu" min="50" max="10000" step="50" value="8500" style="accent-color: #10b981;" />
            </div>
          </div>
        </div>
      </div>
    `;

    this.canvasCurve = this.element.querySelector('#canvas-hall-curve') as HTMLCanvasElement;
    this.canvasDiag = this.element.querySelector('#canvas-hall-diag') as HTMLCanvasElement;

    // Cache elements
    this.valVhEl = this.element.querySelector('#val-vh');
    this.valBEl = this.element.querySelector('#val-b');
    this.valIEl = this.element.querySelector('#val-i');
    this.valRhEl = this.element.querySelector('#val-rh');
    this.subVhEl = this.element.querySelector('#sub-vh');
    this.subBEl = this.element.querySelector('#sub-b');
    this.subIEl = this.element.querySelector('#sub-i');
    this.subRhEl = this.element.querySelector('#sub-rh');

    this.sliderB = this.element.querySelector('#slider-hall-b');
    this.sliderI = this.element.querySelector('#slider-hall-i');
    this.sliderD = this.element.querySelector('#slider-hall-d');
    this.sliderN = this.element.querySelector('#slider-hall-n');
    this.sliderMu = this.element.querySelector('#slider-hall-mu');

    this.selectMaterial = this.element.querySelector('#select-hall-material');
    this.btnRevB = this.element.querySelector('#btn-rev-b');
    this.btnRevI = this.element.querySelector('#btn-rev-i');
    this.btnToggleCarrier = this.element.querySelector('#btn-toggle-carrier');
    this.btnToggleVectors = this.element.querySelector('#btn-toggle-vectors');
    this.btnToggleParticles = this.element.querySelector('#btn-toggle-particles');
    this.btnTabVhB = this.element.querySelector('#btn-tab-vh-b');
    this.btnTabVhI = this.element.querySelector('#btn-tab-vh-i');

    this.bindEvents();
    this.renderCurveChart();
    this.renderDiagChart();
  }

  private bindEvents(): void {
    // 1. Magnetic Field B
    this.sliderB?.addEventListener('input', () => {
      const b = parseFloat(this.sliderB!.value);
      this.callbacks.onMagFieldChange?.(b);
    });

    this.btnRevB?.addEventListener('click', () => {
      this.callbacks.onToggleFieldPolarity?.();
    });

    // 2. Control Current I
    this.sliderI?.addEventListener('input', () => {
      const i = parseFloat(this.sliderI!.value);
      this.callbacks.onCurrentChange?.(i);
    });

    this.btnRevI?.addEventListener('click', () => {
      this.callbacks.onToggleCurrentPolarity?.();
    });

    // 3. Thickness d
    this.sliderD?.addEventListener('input', () => {
      const d = parseFloat(this.sliderD!.value);
      this.callbacks.onThicknessChange?.(d);
    });

    // 4. Material select
    this.selectMaterial?.addEventListener('change', () => {
      const val = this.selectMaterial!.value;
      this.callbacks.onMaterialChange?.(val);
    });

    // 5. Carrier toggle
    this.btnToggleCarrier?.addEventListener('click', () => {
      this.callbacks.onCarrierChargeToggle?.();
    });

    // 6. Concentration n
    this.sliderN?.addEventListener('input', () => {
      const logN = parseFloat(this.sliderN!.value);
      const n = Math.pow(10, logN);
      this.callbacks.onCarrierConcentrationChange?.(n);
    });

    // 7. Mobility mu
    this.sliderMu?.addEventListener('input', () => {
      const mu = parseFloat(this.sliderMu!.value);
      this.callbacks.onMobilityChange?.(mu);
    });

    // 8. Display toggles
    this.btnToggleVectors?.addEventListener('click', () => {
      const next = !this.currentData.showVectors;
      this.btnToggleVectors!.classList.toggle('active', next);
      this.btnToggleVectors!.querySelector('span')!.textContent = `3D力矢量: ${next ? '开' : '关'}`;
      this.callbacks.onToggleVectors?.(next);
    });

    this.btnToggleParticles?.addEventListener('click', () => {
      const next = !this.currentData.showParticles;
      this.btnToggleParticles!.classList.toggle('active', next);
      this.btnToggleParticles!.querySelector('span')!.textContent = `粒子透视: ${next ? '开' : '关'}`;
      this.callbacks.onToggleParticles?.(next);
    });

    // 9. Chart mode tab switching
    this.btnTabVhB?.addEventListener('click', () => {
      this.chartMode = 'vh_b';
      this.btnTabVhB!.classList.add('active');
      this.btnTabVhI!.classList.remove('active');
      this.renderCurveChart();
    });

    this.btnTabVhI?.addEventListener('click', () => {
      this.chartMode = 'vh_i';
      this.btnTabVhI!.classList.add('active');
      this.btnTabVhB!.classList.remove('active');
      this.renderCurveChart();
    });
  }

  public updateTelemetry(data: Partial<HallTelemetryData>): void {
    Object.assign(this.currentData, data);

    // Update Top Deck Text & Colors
    if (this.valVhEl) {
      const absV = Math.abs(this.currentData.hallVoltageMv);
      let vhText = '';
      if (absV < 0.0001) {
        vhText = '0.000 mV';
        this.valVhEl.style.color = '#94a3b8';
      } else if (absV < 0.01) {
        const uv = this.currentData.hallVoltageMv * 1000;
        const sign = uv >= 0 ? '+' : '';
        vhText = `${sign}${uv.toFixed(2)} µV`;
        this.valVhEl.style.color = uv >= 0 ? '#34d399' : '#38bdf8';
      } else {
        const sign = this.currentData.hallVoltageMv >= 0 ? '+' : '';
        vhText = `${sign}${this.currentData.hallVoltageMv.toFixed(2)} mV`;
        this.valVhEl.style.color = this.currentData.hallVoltageMv >= 0 ? '#ef4444' : '#38bdf8';
      }
      this.valVhEl.textContent = vhText;
    }

    if (this.subVhEl) {
      this.subVhEl.textContent = `横向霍尔电场: ${Math.abs(this.currentData.hallElectricFieldVm).toFixed(2)} V/m`;
    }

    const captionVh = this.element.querySelector('#caption-vh');
    if (captionVh) {
      const polText = this.currentData.hallVoltageMv > 0.001
        ? '前侧(+) 后侧(-) · 正霍尔电势'
        : this.currentData.hallVoltageMv < -0.001
        ? '前侧(-) 后侧(+) · 负霍尔电势'
        : '电势平衡中 (V_H ≈ 0)';
      captionVh.textContent = polText;
    }

    if (this.valBEl) {
      const sign = this.currentData.magFieldTesla >= 0 ? '+' : '';
      this.valBEl.textContent = `${sign}${this.currentData.magFieldTesla.toFixed(3)} T`;
    }
    if (this.subBEl) {
      const mt = this.currentData.magFieldTesla * 1000;
      this.subBEl.textContent = `${mt.toFixed(1)} mT · 极靴垂直穿透`;
    }

    if (this.valIEl) {
      const sign = this.currentData.currentMa >= 0 ? '+' : '';
      this.valIEl.textContent = `${sign}${this.currentData.currentMa.toFixed(1)} mA`;
    }
    if (this.subIEl) {
      this.subIEl.textContent = `载流子漂移速: ${this.currentData.driftVelocityMs.toFixed(2)} m/s`;
    }

    if (this.valRhEl) {
      const rh = this.currentData.hallCoefficientRh;
      this.valRhEl.textContent = rh.toExponential(2);
    }
    if (this.subRhEl) {
      this.subRhEl.textContent = `K_H = ${this.currentData.hallSensitivityKh.toFixed(2)} mV/(mA·T)`;
    }

    const captionRh = this.element.querySelector('#caption-rh');
    if (captionRh) {
      captionRh.textContent = `厚度 d: ${this.currentData.waferThicknessMm.toFixed(2)} mm · 单载流子模型`;
    }

    // Update Sliders if not actively dragged
    if (this.sliderB && document.activeElement !== this.sliderB) {
      this.sliderB.value = this.currentData.magFieldTesla.toString();
    }
    if (this.sliderI && document.activeElement !== this.sliderI) {
      this.sliderI.value = this.currentData.currentMa.toString();
    }
    if (this.sliderD && document.activeElement !== this.sliderD) {
      this.sliderD.value = this.currentData.waferThicknessMm.toString();
    }

    // Update slider text labels
    const txtD = this.element.querySelector('#txt-slider-d');
    if (txtD) txtD.textContent = `${this.currentData.waferThicknessMm.toFixed(2)} mm`;

    const txtN = this.element.querySelector('#txt-slider-n');
    if (txtN) {
      const logVal = Math.log10(this.currentData.carrierConcentration).toFixed(2);
      txtN.textContent = `${logVal} (${this.currentData.carrierConcentration.toExponential(2)})`;
    }

    const txtMu = this.element.querySelector('#txt-slider-mu');
    if (txtMu) txtMu.textContent = `${this.currentData.mobilityCm2Vs.toFixed(0)} cm²/V·s`;

    if (this.selectMaterial && document.activeElement !== this.selectMaterial) {
      this.selectMaterial.value = this.currentData.materialKey;
    }

    if (this.btnToggleCarrier) {
      const cLabel = this.currentData.carrierType === 'electron'
        ? '载流子: 电子 (e⁻)'
        : this.currentData.carrierType === 'hole'
        ? '载流子: 空穴 (h⁺)'
        : '载流子: 金属电子';
      this.btnToggleCarrier.querySelector('span')!.textContent = cLabel;
    }

    // Throttled Chart Render (~30 FPS)
    const now = performance.now();
    if (now - this.lastChartRenderTime > 32) {
      this.lastChartRenderTime = now;
      this.renderCurveChart();
      this.renderDiagChart();
    }
  }

  private renderCurveChart(): void {
    if (!this.canvasCurve) return;
    const ctx = this.canvasCurve.getContext('2d');
    if (!ctx) return;

    const w = this.canvasCurve.width;
    const h = this.canvasCurve.height;
    ctx.clearRect(0, 0, w, h);

    // Padding & Plot Area
    const padL = 60;
    const padR = 25;
    const padT = 25;
    const padB = 40;
    const pw = w - padL - padR;
    const ph = h - padT - padB;

    const centerX = padL + pw / 2;
    const centerY = padT + ph / 2;

    // Grid background
    ctx.fillStyle = 'rgba(15, 23, 42, 0.45)';
    ctx.fillRect(padL, padT, pw, ph);

    // Grid lines
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const gx = padL + (pw / 4) * i;
      ctx.beginPath();
      ctx.moveTo(gx, padT);
      ctx.lineTo(gx, padT + ph);
      ctx.stroke();

      const gy = padT + (ph / 4) * i;
      ctx.beginPath();
      ctx.moveTo(padL, gy);
      ctx.lineTo(padL + pw, gy);
      ctx.stroke();
    }

    // Axes
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.28)';
    ctx.lineWidth = 1.5;
    // X axis (at center Y = 0)
    ctx.beginPath();
    ctx.moveTo(padL, centerY);
    ctx.lineTo(padL + pw, centerY);
    ctx.stroke();
    // Y axis (at center X = 0)
    ctx.beginPath();
    ctx.moveTo(centerX, padT);
    ctx.lineTo(centerX, padT + ph);
    ctx.stroke();

    // Data limits
    const isVhB = this.chartMode === 'vh_b';
    const xRangeMax = isVhB ? 1.5 : 20; // 1.5 T or 20 mA
    const xUnit = isVhB ? 'T' : 'mA';
    const xLabel = isVhB ? '励磁磁感应强度 B (T)' : '激励工作电流 I (mA)';

    // Compute Y max (V_H max)
    // V_H = K_H * I * B
    const maxPossibleVh = Math.max(
      1.0,
      Math.abs(this.currentData.hallSensitivityKh * (isVhB ? this.currentData.currentMa : 10) * xRangeMax)
    );
    const yRangeMax = maxPossibleVh * 1.15;

    // Axis Labels
    ctx.font = '500 11px -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif';
    ctx.fillStyle = '#94a3b8';
    ctx.textAlign = 'center';
    ctx.fillText(`-${xRangeMax} ${xUnit}`, padL + 10, centerY + 16);
    ctx.fillText(`0`, centerX, centerY + 16);
    ctx.fillText(`+${xRangeMax} ${xUnit}`, padL + pw - 10, centerY + 16);
    ctx.fillText(xLabel, centerX, padT + ph + 28);

    ctx.textAlign = 'right';
    ctx.fillText(`+${yRangeMax.toFixed(1)} mV`, padL - 8, padT + 12);
    ctx.fillText(`0 mV`, padL - 8, centerY + 4);
    ctx.fillText(`-${yRangeMax.toFixed(1)} mV`, padL - 8, padT + ph);

    // Theoretical Response Line (Linear: passes through origin)
    // For V_H vs B: slope = K_H * I (mV / T)
    // For V_H vs I: slope = K_H * B (mV / mA)
    const slope = isVhB
      ? (this.currentData.hallCoefficientRh * this.currentData.currentMa) / (this.currentData.waferThicknessMm * 1e-3)
      : (this.currentData.hallCoefficientRh * this.currentData.magFieldTesla) / (this.currentData.waferThicknessMm * 1e-3);

    const x1 = -xRangeMax;
    const y1 = slope * x1;
    const x2 = xRangeMax;
    const y2 = slope * x2;

    const mapX = (val: number) => centerX + (val / xRangeMax) * (pw / 2);
    const mapY = (val: number) => centerY - (val / yRangeMax) * (ph / 2);

    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(mapX(x1), mapY(y1));
    ctx.lineTo(mapX(x2), mapY(y2));
    ctx.stroke();

    // Current Operating Point
    const curX = isVhB ? this.currentData.magFieldTesla : this.currentData.currentMa;
    const curY = this.currentData.hallVoltageMv;
    const ptX = mapX(curX);
    const ptY = mapY(curY);

    // Glowing halo for operating point
    ctx.fillStyle = 'rgba(239, 68, 68, 0.35)';
    ctx.beginPath();
    ctx.arc(ptX, ptY, 8, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#ef4444';
    ctx.beginPath();
    ctx.arc(ptX, ptY, 4.5, 0, Math.PI * 2);
    ctx.fill();

    // Tooltip text above operating point
    ctx.font = '600 11px "SF Mono", monospace';
    ctx.fillStyle = '#f1f5f9';
    ctx.textAlign = 'left';
    ctx.fillText(`(${curX.toFixed(2)}${xUnit}, ${curY.toFixed(2)}mV)`, Math.min(ptX + 8, padL + pw - 120), Math.max(ptY - 8, padT + 16));

    // Slope & Sensitivity Card in top-left corner
    ctx.fillStyle = 'rgba(30, 41, 59, 0.85)';
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.lineWidth = 1;
    ctx.fillRect(padL + 8, padT + 8, 160, 42);
    ctx.strokeRect(padL + 8, padT + 8, 160, 42);

    ctx.font = '500 11px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillStyle = '#94a3b8';
    ctx.textAlign = 'left';
    ctx.fillText(`拟合斜率 K = ${slope.toFixed(2)} mV/${xUnit}`, padL + 14, padT + 24);
    ctx.fillStyle = '#38bdf8';
    ctx.fillText(`霍尔灵敏度 K_H = ${this.currentData.hallSensitivityKh.toFixed(2)} V/(A·T)`, padL + 14, padT + 40);
  }

  private renderDiagChart(): void {
    if (!this.canvasDiag) return;
    const ctx = this.canvasDiag.getContext('2d');
    if (!ctx) return;

    const w = this.canvasDiag.width;
    const h = this.canvasDiag.height;
    ctx.clearRect(0, 0, w, h);

    // Background
    ctx.fillStyle = 'rgba(15, 23, 42, 0.45)';
    ctx.fillRect(15, 15, w - 30, h - 30);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.strokeRect(15, 15, w - 30, h - 30);

    // Cross section of the wafer
    const boxW = 220;
    const boxH = 90;
    const boxX = (w - boxW) / 2;
    const boxY = 40;

    // Wafer slab rectangle
    ctx.fillStyle = 'rgba(30, 41, 59, 0.9)';
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 1.5;
    ctx.fillRect(boxX, boxY, boxW, boxH);
    ctx.strokeRect(boxX, boxY, boxW, boxH);

    // Carrier accumulation sides: Front (+Z) is bottom edge, Back (-Z) is top edge
    // Determine polarity
    const isFrontPos = this.currentData.hallVoltageMv > 0.001;
    const isFrontNeg = this.currentData.hallVoltageMv < -0.001;

    // Top Edge (Back face -Z)
    ctx.fillStyle = isFrontPos ? 'rgba(59, 130, 246, 0.45)' : isFrontNeg ? 'rgba(239, 68, 68, 0.45)' : 'rgba(148, 163, 184, 0.2)';
    ctx.fillRect(boxX, boxY, boxW, 8);

    // Bottom Edge (Front face +Z)
    ctx.fillStyle = isFrontPos ? 'rgba(239, 68, 68, 0.45)' : isFrontNeg ? 'rgba(59, 130, 246, 0.45)' : 'rgba(148, 163, 184, 0.2)';
    ctx.fillRect(boxX, boxY + boxH - 8, boxW, 8);

    // Charge symbols (+ or -)
    ctx.font = '700 13px "SF Mono", monospace';
    ctx.textAlign = 'center';
    const topSign = isFrontPos ? '-' : isFrontNeg ? '+' : '0';
    const botSign = isFrontPos ? '+' : isFrontNeg ? '-' : '0';
    const topColor = isFrontPos ? '#38bdf8' : isFrontNeg ? '#ef4444' : '#64748b';
    const botColor = isFrontPos ? '#ef4444' : isFrontNeg ? '#38bdf8' : '#64748b';

    for (let c = 0; c < 5; c++) {
      const cx = boxX + 25 + c * 42;
      ctx.fillStyle = topColor;
      ctx.fillText(topSign, cx, boxY + 7);

      ctx.fillStyle = botColor;
      ctx.fillText(botSign, cx, boxY + boxH - 1);
    }

    // Edge labels
    ctx.font = '500 10px -apple-system, sans-serif';
    ctx.fillStyle = '#94a3b8';
    ctx.fillText('后侧 (-Z 侧壁)', boxX + boxW / 2, boxY - 6);
    ctx.fillText('前侧 (+Z 侧壁 · 测量电极)', boxX + boxW / 2, boxY + boxH + 16);

    // Carrier Particle in center
    const pRadius = 10;
    const pcX = boxX + boxW / 2;
    const pcY = boxY + boxH / 2;

    const isElectron = this.currentData.carrierType === 'electron';
    ctx.fillStyle = isElectron ? '#38bdf8' : '#f97316';
    ctx.beginPath();
    ctx.arc(pcX, pcY, pRadius, 0, Math.PI * 2);
    ctx.fill();

    ctx.font = '700 11px "SF Mono", monospace';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(isElectron ? 'e⁻' : 'h⁺', pcX, pcY + 4);

    // Force Arrows inside box
    // Lorentz Force Arrow (points down towards +Z or up towards -Z)
    ctx.strokeStyle = '#10b981';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(pcX + 18, pcY);
    ctx.lineTo(pcX + 45, pcY);
    ctx.stroke();
    // Label v
    ctx.fillStyle = '#facc15';
    ctx.font = '600 10px sans-serif';
    ctx.fillText('v (漂移)', pcX + 65, pcY + 3);

    // Diagnosis Verdict Box at bottom
    ctx.fillStyle = 'rgba(2, 6, 23, 0.85)';
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.3)';
    ctx.lineWidth = 1;
    ctx.fillRect(25, h - 55, w - 50, 42);
    ctx.strokeRect(25, h - 55, w - 50, 42);

    ctx.font = '600 11px -apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#38bdf8';
    ctx.fillText('【物理规律诊断】', 35, h - 38);

    ctx.font = '500 11px -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif';
    ctx.fillStyle = '#f1f5f9';
    let verdict = '';
    if (this.currentData.carrierType === 'electron') {
      verdict = '载流子为电子 (q < 0)，洛伦兹力偏向前壁使前侧聚负电，霍尔电势差 V_H < 0 (n型半导体)';
    } else if (this.currentData.carrierType === 'hole') {
      verdict = '载流子为空穴 (q > 0)，洛伦兹力偏向前壁使前侧聚正电，霍尔电势差 V_H > 0 (p型半导体)';
    } else {
      verdict = '金属自由电子浓度极高 (~10²⁸ m⁻³)，灵敏度极低，输出微伏级电压';
    }
    ctx.fillText(verdict, 35, h - 21);
  }

  public setVisible(visible: boolean): void {
    this.isVisible = visible;
    this.element.style.display = visible ? 'block' : 'none';
    if (visible) {
      requestAnimationFrame(() => {
        this.renderCurveChart();
        this.renderDiagChart();
      });
    }
  }

  public get visible(): boolean {
    return this.isVisible;
  }
}
