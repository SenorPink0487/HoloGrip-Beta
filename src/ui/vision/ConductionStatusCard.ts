import { bindVisionSlider, isSliderActive } from './sliderGestureHelper.ts';

export interface ConductionTelemetryData {
  heatSourceTemp: number; // 热端温度 (K)
  coldSourceTemp: number; // 冷端温度 (K)
  probePositionNorm: number; // 探针归一化位置 [0, 1]
  probeTempK: number; // 探针处实测温度 (K)
  probeGradient: number; // 探针处温度梯度 dT/dx (K/m)
  totalHeatFlowW: number; // 稳态/瞬态截面热流率 (W)
  localHeatFlux: number; // 局部热通量 q = -k dT/dx (W/m^2)
  material: string; // 材质标识 ('copper' | 'aluminum' | 'steel' | 'composite')
  materialName?: string;
  probePositionMm?: number;
  tempProfile?: number[];
  kValue: number; // 热导率 (W/m·K)
  diffusivity: number; // 热扩散系数 α (mm^2/s)
  lateralInsulation: boolean; // 是否侧向完全绝热
  isSteadyState: boolean; // 是否已进入一维稳态
  timeElapsed: number; // 热传导演化时间 (s)
  profileSamples?: { x: number; tK: number }[]; // 空间温度场采样
}

export interface ConductionStatusCardCallbacks {
  onTempHighChange?: (tempK: number) => void;
  onHeatSourceTempChange?: (tempK: number) => void;
  onTempLowChange?: (tempK: number) => void;
  onColdSourceTempChange?: (tempK: number) => void;
  onProbePositionChange?: (normX: number) => void;
  onMaterialChange?: (material: string) => void;
  onToggleInsulation?: (enabled: boolean) => void;
  onLateralInsulationChange?: (insulated: boolean) => void;
  onResetTransient?: () => void;
}

export class ConductionStatusCard {
  public element: HTMLElement;
  private canvasTX: HTMLCanvasElement;
  private canvasFLIR: HTMLCanvasElement;
  private callbacks: ConductionStatusCardCallbacks;

  private isVisible = false;
  private currentData: ConductionTelemetryData = {
    heatSourceTemp: 450,
    coldSourceTemp: 295,
    probePositionNorm: 0.5,
    probeTempK: 372.5,
    probeGradient: -484.0,
    totalHeatFlowW: 85.5,
    localHeatFlux: 189000,
    material: 'copper',
    kValue: 390,
    diffusivity: 111,
    lateralInsulation: true,
    isSteadyState: true,
    timeElapsed: 25.0,
    profileSamples: [],
  };

  private valTempHEl: HTMLElement | null = null;
  private valTempCEl: HTMLElement | null = null;
  private valProbeEl: HTMLElement | null = null;
  private valPowerEl: HTMLElement | null = null;
  private sliderTempH: HTMLInputElement | null = null;
  private sliderTempC: HTMLInputElement | null = null;
  private sliderProbe: HTMLInputElement | null = null;
  private selectMaterial: HTMLSelectElement | null = null;
  private btnInsulation: HTMLButtonElement | null = null;
  private btnResetTransient: HTMLButtonElement | null = null;
  private activeSliders = new Set<string>();

  private lastChartRenderTime = 0;
  private lastRenderedNormX = -1;
  private lastRenderedTempH = -1;
  private lastRenderedTempC = -1;
  private lastRenderedMaterial = '';
  private lastRenderedInsulation: boolean | null = null;
  private lastRenderedSteadyState: boolean | null = null;

  constructor(callbacks: ConductionStatusCardCallbacks = {}) {
    this.callbacks = callbacks;
    this.createUI();
  }

  private updateSliderTrackFill(slider: HTMLInputElement | null, min: number, max: number, value: number): void {
    if (!slider) return;
    const ratio = Math.max(0, Math.min(1, (value - min) / (max - min)));
    const pct = (ratio * 100).toFixed(1);
    slider.style.background = `linear-gradient(to right, rgba(255, 255, 255, 0.85) 0%, rgba(255, 255, 255, 0.85) ${pct}%, rgba(255, 255, 255, 0.14) ${pct}%, rgba(255, 255, 255, 0.14) 100%)`;
  }

  private createUI(): void {
    this.element = document.createElement('div');
    this.element.className = 'vision-thermo-status-card hud-interactive';

    this.element.innerHTML = `
      <style>
        .vision-thermo-status-card {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 100%;
          height: 100%;
          min-height: 480px;
          padding: 24px;
          box-sizing: border-box;
        }

        @keyframes iosPanelFadeIn {
          0% {
            opacity: 0;
            transform: translate3d(0, 16px, 0) scale(0.985);
          }
          100% {
            opacity: 1;
            transform: translate3d(0, 0, 0) scale(1);
          }
        }

        .apple-physics-layout {
          width: 100%;
          max-width: 1040px;
          display: grid;
          grid-template-columns: 390px 1fr;
          gap: 20px;
          align-items: start;
          font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", "PingFang SC", "Helvetica Neue", sans-serif;
          user-select: none;
          -webkit-user-select: none;
          animation: iosPanelFadeIn 0.38s cubic-bezier(0.25, 1, 0.5, 1) both;
        }

        .apple-physics-panel {
          display: flex;
          flex-direction: column;
          gap: 14px;
        }

        .apple-physics-group {
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-top: 1px solid rgba(255, 255, 255, 0.2);
          border-radius: 18px;
          overflow: hidden;
          box-shadow: 0 12px 32px rgba(0, 0, 0, 0.25);
        }

        .apple-physics-row {
          padding: 13px 18px;
          display: flex;
          flex-direction: column;
          gap: 5px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.06);
        }

        .apple-physics-row:last-child {
          border-bottom: none;
        }

        .apple-physics-row-header {
          display: flex;
          justify-content: space-between;
          align-items: baseline;
        }

        .apple-physics-label {
          font-size: 13.5px;
          font-weight: 500;
          color: rgba(255, 255, 255, 0.68);
          letter-spacing: -0.15px;
        }

        .apple-physics-readout {
          font-size: 14.5px;
          font-weight: 600;
          color: #ffffff;
          font-variant-numeric: tabular-nums;
          letter-spacing: -0.2px;
        }

        .apple-physics-slider {
          -webkit-appearance: none;
          appearance: none;
          width: 100%;
          height: 5px;
          border-radius: 9999px;
          outline: none;
          cursor: pointer;
          margin: 6px 0 2px 0;
          background: rgba(255, 255, 255, 0.14);
          transition: background 0.08s ease;
        }

        .apple-physics-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 18px;
          height: 18px;
          border-radius: 50%;
          background: #ffffff;
          box-shadow: 0 2px 6px rgba(0, 0, 0, 0.35), 0 0 1px rgba(0, 0, 0, 0.2);
          cursor: pointer;
          transition: transform 0.18s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.18s ease;
          border: none;
        }

        .apple-physics-slider::-webkit-slider-thumb:hover {
          transform: scale(1.14);
          box-shadow: 0 3px 8px rgba(0, 0, 0, 0.45);
        }

        .apple-physics-slider::-webkit-slider-thumb:active {
          transform: scale(1.25);
          box-shadow: 0 3px 10px rgba(0, 0, 0, 0.4), 0 0 0 4px rgba(10, 132, 255, 0.28);
        }

        .apple-physics-slider::-moz-range-thumb {
          width: 18px;
          height: 18px;
          border-radius: 50%;
          background: #ffffff;
          box-shadow: 0 2px 6px rgba(0, 0, 0, 0.35);
          cursor: pointer;
          border: none;
        }

        .apple-physics-scale {
          display: flex;
          justify-content: space-between;
          font-size: 11px;
          color: rgba(255, 255, 255, 0.3);
          font-variant-numeric: tabular-nums;
          font-weight: 400;
        }

        .apple-actions-group {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .apple-select {
          width: 100%;
          height: 38px;
          border-radius: 10px;
          background: rgba(255, 255, 255, 0.06);
          border: 1px solid rgba(255, 255, 255, 0.12);
          color: #ffffff;
          font-size: 13px;
          padding: 0 12px;
          outline: none;
          cursor: pointer;
          font-family: inherit;
        }

        .apple-select option {
          background: #181c24;
          color: #ffffff;
        }

        .apple-btn-row {
          display: flex;
          gap: 8px;
        }

        .apple-btn-secondary {
          flex: 1;
          height: 40px;
          border-radius: 12px;
          background: rgba(255, 255, 255, 0.06);
          color: rgba(255, 255, 255, 0.88);
          font-size: 13px;
          font-weight: 500;
          border: 1px solid rgba(255, 255, 255, 0.12);
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          transition: transform 0.38s cubic-bezier(0.34, 1.56, 0.64, 1), background 0.2s ease, border-color 0.2s ease, box-shadow 0.3s ease, filter 0.12s ease;
        }

        .apple-btn-secondary:hover {
          background: rgba(255, 255, 255, 0.12);
          color: #ffffff;
          transform: translate3d(0, -1px, 0) scale(1.015);
        }

        .apple-btn-secondary:active {
          transform: translate3d(0, 0, 0) scale(0.95);
          filter: brightness(0.92);
          transition: transform 0.10s cubic-bezier(0.2, 0, 0, 1), filter 0.10s ease;
        }

        .apple-btn-secondary.active {
          background: rgba(255, 255, 255, 0.18);
          border-color: rgba(255, 255, 255, 0.30);
          color: #ffffff;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);
        }

        .apple-charts-grid {
          display: flex;
          flex-direction: column;
          gap: 14px;
        }

        .apple-chart-card {
          background: rgba(255, 255, 255, 0.045);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-top: 1px solid rgba(255, 255, 255, 0.16);
          border-radius: 16px;
          padding: 12px 16px;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .apple-chart-title {
          font-size: 12px;
          font-weight: 600;
          color: rgba(255, 255, 255, 0.85);
          letter-spacing: -0.1px;
        }

        .apple-chart-canvas {
          width: 100%;
          height: auto;
          max-height: 190px;
          border-radius: 8px;
        }
      </style>

      <div class="apple-physics-layout">
        <!-- 1. 左侧：边界条件、探针与材质 -->
        <div class="apple-physics-panel">
          <div class="apple-physics-group">
            <!-- 热端温度 T_H -->
            <div class="apple-physics-row">
              <div class="apple-physics-row-header">
                <span class="apple-physics-label">热端温度 T_H</span>
                <span id="val-th" class="apple-physics-readout">450 K</span>
              </div>
              <input type="range" class="apple-physics-slider" id="slider-cond-th" min="320" max="650" step="5" value="450" />
              <div class="apple-physics-scale">
                <span>320 K</span>
                <span>650 K</span>
              </div>
            </div>

            <!-- 冷端温度 T_C -->
            <div class="apple-physics-row">
              <div class="apple-physics-row-header">
                <span class="apple-physics-label">冷端温度 T_C</span>
                <span id="val-tc" class="apple-physics-readout">295 K</span>
              </div>
              <input type="range" class="apple-physics-slider" id="slider-cond-tc" min="250" max="330" step="5" value="295" />
              <div class="apple-physics-scale">
                <span>250 K</span>
                <span>330 K</span>
              </div>
            </div>

            <!-- 探针位置与温度 -->
            <div class="apple-physics-row">
              <div class="apple-physics-row-header">
                <span class="apple-physics-label">探针位置 x (归一化)</span>
                <span id="val-probe" class="apple-physics-readout">372.5 K</span>
              </div>
              <input type="range" class="apple-physics-slider" id="slider-cond-probe" min="0" max="1" step="0.01" value="0.5" />
              <div class="apple-physics-scale">
                <span>0.0 (热端)</span>
                <span id="sub-gradient">梯度: -484 K/m</span>
                <span>1.0 (冷端)</span>
              </div>
            </div>

            <!-- 传热功率 -->
            <div class="apple-physics-row">
              <div class="apple-physics-row-header">
                <span class="apple-physics-label">稳态传热功率 Q</span>
                <span id="val-heatflow" class="apple-physics-readout">85.5 W</span>
              </div>
            </div>
          </div>

          <!-- 材质与边界选项 -->
          <div class="apple-actions-group">
            <select class="apple-select" id="select-cond-material">
              <option value="copper">试样材质: 高纯紫铜 (k = 390 W/m·K)</option>
              <option value="aluminum">试样材质: 硬铝合金 (k = 210 W/m·K)</option>
              <option value="steel">试样材质: 304不锈钢 (k = 16 W/m·K)</option>
              <option value="composite">试样材质: 铜-钢串联复合棒 (Cu+Steel)</option>
            </select>

            <div class="apple-btn-row">
              <button class="apple-btn-secondary active" id="btn-insulation" type="button">
                <span>侧向绝热: 开启</span>
              </button>
              <button class="apple-btn-secondary" id="btn-reset-transient" type="button">
                <span>瞬态热扩散重演</span>
              </button>
            </div>
          </div>
        </div>

        <!-- 2. 右侧：T(x) 分布曲线与红外热成像 -->
        <div class="apple-charts-grid">
          <div class="apple-chart-card">
            <span class="apple-chart-title">T(x) 轴向温度分布曲线 (Fourier 导热)</span>
            <canvas id="canvas-cond-tx" class="apple-chart-canvas" width="480" height="210"></canvas>
          </div>

          <div class="apple-chart-card">
            <span class="apple-chart-title">热通量场与温度梯度伪彩</span>
            <canvas id="canvas-cond-flir" class="apple-chart-canvas" width="480" height="210"></canvas>
          </div>
        </div>
      </div>
    `;

    this.canvasTX = this.element.querySelector('#canvas-cond-tx') as HTMLCanvasElement;
    this.canvasFLIR = this.element.querySelector('#canvas-cond-flir') as HTMLCanvasElement;

    this.valTempHEl = this.element.querySelector('#val-th');
    this.valTempCEl = this.element.querySelector('#val-tc');
    this.valProbeEl = this.element.querySelector('#val-probe');
    this.valPowerEl = this.element.querySelector('#val-heatflow');
    this.sliderTempH = this.element.querySelector('#slider-cond-th');
    this.sliderTempC = this.element.querySelector('#slider-cond-tc');
    this.sliderProbe = this.element.querySelector('#slider-cond-probe');
    this.selectMaterial = this.element.querySelector('#select-cond-material');
    this.btnInsulation = this.element.querySelector('#btn-insulation');
    this.btnResetTransient = this.element.querySelector('#btn-reset-transient');

    this.updateSliderTrackFill(this.sliderTempH, 320, 650, 450);
    this.updateSliderTrackFill(this.sliderTempC, 250, 330, 295);
    this.updateSliderTrackFill(this.sliderProbe, 0, 1, 0.5);

    this.bindEvents();
  }

  private bindEvents(): void {
    bindVisionSlider(this.sliderTempH, {
      activeSet: this.activeSliders,
      onChange: (val) => {
        this.updateSliderTrackFill(this.sliderTempH, 320, 650, val);
        this.callbacks.onTempHighChange?.(val);
        this.callbacks.onHeatSourceTempChange?.(val);
      },
      onScrub: (val) => {
        if (this.valTempHEl) this.valTempHEl.textContent = `${Math.round(val)} K`;
        this.updateSliderTrackFill(this.sliderTempH, 320, 650, val);
      },
    });

    bindVisionSlider(this.sliderTempC, {
      activeSet: this.activeSliders,
      onChange: (val) => {
        this.updateSliderTrackFill(this.sliderTempC, 250, 330, val);
        this.callbacks.onTempLowChange?.(val);
        this.callbacks.onColdSourceTempChange?.(val);
      },
      onScrub: (val) => {
        if (this.valTempCEl) this.valTempCEl.textContent = `${Math.round(val)} K`;
        this.updateSliderTrackFill(this.sliderTempC, 250, 330, val);
      },
    });

    bindVisionSlider(this.sliderProbe, {
      activeSet: this.activeSliders,
      onChange: (val) => {
        this.updateSliderTrackFill(this.sliderProbe, 0, 1, val);
        this.callbacks.onProbePositionChange?.(val);
      },
      onScrub: (val) => {
        this.updateSliderTrackFill(this.sliderProbe, 0, 1, val);
      },
    });

    this.selectMaterial?.addEventListener('change', (e) => {
      const val = (e.target as HTMLSelectElement).value;
      this.callbacks.onMaterialChange?.(val);
    });

    this.btnInsulation?.addEventListener('click', () => {
      const nextInsul = !this.currentData.lateralInsulation;
      this.currentData.lateralInsulation = nextInsul;
      this.callbacks.onToggleInsulation?.(nextInsul);
      this.callbacks.onLateralInsulationChange?.(nextInsul);
    });

    this.btnResetTransient?.addEventListener('click', () => {
      this.callbacks.onResetTransient?.();
    });
  }

  public setVisible(show: boolean): void {
    this.isVisible = show;
    this.element.style.display = show ? 'flex' : 'none';
    if (show) {
      this.lastRenderedNormX = -1;
      this.renderCharts();
    }
  }

  public get visible(): boolean {
    return this.isVisible;
  }

  public updateTelemetry(data: ConductionTelemetryData): void {
    this.currentData = data;

    if (this.valTempHEl) this.valTempHEl.textContent = `${Math.round(data.heatSourceTemp)} K`;
    if (this.valTempCEl) this.valTempCEl.textContent = `${Math.round(data.coldSourceTemp)} K`;
    if (this.valProbeEl) this.valProbeEl.textContent = `${data.probeTempK.toFixed(1)} K`;
    if (this.valPowerEl) this.valPowerEl.textContent = `${data.totalHeatFlowW.toFixed(1)} W`;

    const subGrad = this.element.querySelector('#sub-gradient');
    if (subGrad) subGrad.textContent = `梯度: ${Math.round(data.probeGradient)} K/m`;

    if (this.btnInsulation) {
      this.btnInsulation.textContent = data.lateralInsulation ? '侧向绝热: 开启' : '空气自然对流';
      this.btnInsulation.classList.toggle('active', data.lateralInsulation);
    }

    if (this.sliderTempH && !isSliderActive(this.sliderTempH, this.activeSliders)) {
      this.sliderTempH.value = String(data.heatSourceTemp);
      this.updateSliderTrackFill(this.sliderTempH, 320, 650, data.heatSourceTemp);
    }
    if (this.sliderTempC && !isSliderActive(this.sliderTempC, this.activeSliders)) {
      this.sliderTempC.value = String(data.coldSourceTemp);
      this.updateSliderTrackFill(this.sliderTempC, 250, 330, data.coldSourceTemp);
    }
    if (this.sliderProbe && !isSliderActive(this.sliderProbe, this.activeSliders)) {
      this.sliderProbe.value = String(data.probePositionNorm);
      this.updateSliderTrackFill(this.sliderProbe, 0, 1, data.probePositionNorm);
    }
    if (this.selectMaterial && document.activeElement !== this.selectMaterial) {
      this.selectMaterial.value = data.material;
    }

    if (this.isVisible) {
      const now = performance.now();
      const probeMoved = Math.abs(data.probePositionNorm - this.lastRenderedNormX) > 0.005;
      const tempChanged =
        Math.abs(data.heatSourceTemp - this.lastRenderedTempH) > 0.5 ||
        Math.abs(data.coldSourceTemp - this.lastRenderedTempC) > 0.5 ||
        data.material !== this.lastRenderedMaterial ||
        data.lateralInsulation !== this.lastRenderedInsulation;
      const stateTransition = data.isSteadyState !== this.lastRenderedSteadyState;

      const needsRender = !data.isSteadyState || probeMoved || tempChanged || stateTransition;

      if (needsRender && now - this.lastChartRenderTime >= 32) {
        this.lastChartRenderTime = now;
        this.lastRenderedNormX = data.probePositionNorm;
        this.lastRenderedTempH = data.heatSourceTemp;
        this.lastRenderedTempC = data.coldSourceTemp;
        this.lastRenderedMaterial = data.material;
        this.lastRenderedInsulation = data.lateralInsulation;
        this.lastRenderedSteadyState = data.isSteadyState;
        this.renderCharts();
      }
    }
  }

  private renderCharts(): void {
    this.renderTXChart();
    this.renderFLIRChart();
  }

  private renderTXChart(): void {
    const canvas = this.canvasTX;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const padL = 44, padR = 14, padT = 14, padB = 26;
    const chartW = w - padL - padR;
    const chartH = h - padT - padB;

    const d = this.currentData;
    const tMin = 240, tMax = 680;

    const mapX = (normX: number) => padL + normX * chartW;
    const mapY = (tK: number) => padT + chartH - ((tK - tMin) / (tMax - tMin)) * chartH;

    // 参考网格
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
    ctx.lineWidth = 1;
    for (let t = 300; t <= 600; t += 100) {
      const y = mapY(t);
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(w - padR, y);
      ctx.stroke();

      ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
      ctx.font = '10px -apple-system, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(`${t}K`, padL - 5, y + 3);
    }

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(padL, padT);
    ctx.lineTo(padL, padT + chartH);
    ctx.lineTo(w - padR, padT + chartH);
    ctx.stroke();

    // 理论稳态虚线
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.lineWidth = 1.2;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(mapX(0), mapY(d.heatSourceTemp));
    ctx.lineTo(mapX(1), mapY(d.coldSourceTemp));
    ctx.stroke();
    ctx.setLineDash([]);

    // 实际温度分布曲线 (纯净纯白)
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2.2;
    ctx.beginPath();

    const samples = d.profileSamples && d.profileSamples.length > 0 ? d.profileSamples : [];
    if (samples.length > 0) {
      for (let i = 0; i < samples.length; i++) {
        const sx = mapX(samples[i].x);
        const sy = mapY(samples[i].tK);
        if (i === 0) ctx.moveTo(sx, sy); else ctx.lineTo(sx, sy);
      }
    } else {
      ctx.moveTo(mapX(0), mapY(d.heatSourceTemp));
      ctx.lineTo(mapX(1), mapY(d.coldSourceTemp));
    }
    ctx.stroke();

    // 探针点
    const probeX = mapX(d.probePositionNorm);
    const probeY = mapY(d.probeTempK);

    ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.beginPath();
    ctx.arc(probeX, probeY, 8, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(probeX, probeY, 4, 0, Math.PI * 2);
    ctx.fill();
  }

  private renderFLIRChart(): void {
    const canvas = this.canvasFLIR;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const padL = 20, padR = 20, padT = 30, padB = 40;
    const barW = w - padL - padR;
    const barH = 50;
    const barY = padT + (h - padT - padB - barH) / 2;

    const d = this.currentData;
    const grad = ctx.createLinearGradient(padL, 0, padL + barW, 0);
    grad.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
    grad.addColorStop(0.5, '#0a84ff');
    grad.addColorStop(1, 'rgba(10, 132, 255, 0.25)');

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.roundRect(padL, barY, barW, barH, 10);
    ctx.fill();

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(padL, barY, barW, barH, 10);
    ctx.stroke();

    // 探针指示线
    const probeX = padL + d.probePositionNorm * barW;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(probeX, barY - 6);
    ctx.lineTo(probeX, barY + barH + 6);
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.font = '600 11px -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`${d.probeTempK.toFixed(1)} K`, probeX, barY - 10);

    ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.font = '10px -apple-system, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`热端 ${d.heatSourceTemp}K`, padL, barY + barH + 20);
    ctx.textAlign = 'right';
    ctx.fillText(`冷端 ${d.coldSourceTemp}K`, padL + barW, barY + barH + 20);
  }
}
