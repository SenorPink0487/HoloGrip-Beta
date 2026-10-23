import { bindVisionSlider, isSliderActive } from './sliderGestureHelper.ts';
import type {
  JouleFluidType,
  JouleOperationMode,
  JouleTelemetry,
} from '../../physics/thermo/jouleDynamics.ts';

export interface JouleStatusCardCallbacks {
  onWeightMassChange?: (massKg: number) => void;
  onCurrentChange?: (amp: number) => void;
  onModeChange?: (mode: JouleOperationMode) => void;
  onFluidChange?: (fluid: JouleFluidType) => void;
  onReleaseDrop?: () => void;
  onToggleHeater?: () => void;
  onToggleBaffles?: () => void;
  onReset?: () => void;
}

export class JouleStatusCard {
  public element: HTMLElement;
  private canvasDTW!: HTMLCanvasElement;
  private canvasEnergy!: HTMLCanvasElement;
  private callbacks: JouleStatusCardCallbacks;

  private isVisible = false;
  private currentData: JouleTelemetry | null = null;

  private valMassEl: HTMLElement | null = null;
  private valCurrentEl: HTMLElement | null = null;
  private valTempEl: HTMLElement | null = null;
  private valWorkEl: HTMLElement | null = null;
  private valJouleEl: HTMLElement | null = null;

  private sliderMass: HTMLInputElement | null = null;
  private sliderCurrent: HTMLInputElement | null = null;
  private selectMode: HTMLSelectElement | null = null;
  private selectFluid: HTMLSelectElement | null = null;
  private btnDrop: HTMLButtonElement | null = null;
  private btnHeater: HTMLButtonElement | null = null;
  private btnBaffle: HTMLButtonElement | null = null;
  private btnReset: HTMLButtonElement | null = null;

  private activeSliders = new Set<string>();
  private lastChartRenderTime = 0;
  private lastRenderedHash = '';

  constructor(callbacks: JouleStatusCardCallbacks = {}) {
    this.callbacks = callbacks;
    this.createUI();
  }

  private updateSliderTrackFill(
    slider: HTMLInputElement | null,
    min: number,
    max: number,
    value: number
  ): void {
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
          grid-template-columns: 400px 1fr;
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
          gap: 12px;
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
          padding: 11px 16px;
          display: flex;
          flex-direction: column;
          gap: 4px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.06);
        }

        .apple-physics-row:last-child {
          border-bottom: none;
        }

        .apple-physics-row-header {
          display: flex;
          justify-content: space-between;
          align-items: baseline;
          gap: 8px;
        }

        .apple-physics-label {
          font-size: 13px;
          font-weight: 500;
          color: rgba(255, 255, 255, 0.68);
          letter-spacing: -0.15px;
          white-space: nowrap;
        }

        .apple-physics-readout {
          font-size: 14px;
          font-weight: 600;
          color: #ffffff;
          font-variant-numeric: tabular-nums;
          letter-spacing: -0.2px;
          text-align: right;
          white-space: nowrap;
        }

        .apple-physics-slider {
          -webkit-appearance: none;
          appearance: none;
          width: 100%;
          height: 5px;
          border-radius: 9999px;
          outline: none;
          cursor: pointer;
          margin: 5px 0 2px 0;
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

        .apple-physics-scale {
          display: flex;
          justify-content: space-between;
          font-size: 11px;
          color: rgba(255, 255, 255, 0.3);
          font-variant-numeric: tabular-nums;
        }

        .apple-actions-group {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .apple-select-row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px;
        }

        .apple-select {
          width: 100%;
          height: 36px;
          border-radius: 10px;
          background: rgba(255, 255, 255, 0.06);
          border: 1px solid rgba(255, 255, 255, 0.12);
          color: #ffffff;
          font-size: 12.5px;
          padding: 0 10px;
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
          gap: 7px;
        }

        .apple-btn-primary {
          flex: 1.25;
          height: 40px;
          border-radius: 12px;
          background: rgba(255, 255, 255, 0.14);
          color: #ffffff;
          font-size: 13px;
          font-weight: 600;
          letter-spacing: -0.2px;
          border: 1px solid rgba(255, 255, 255, 0.18);
          border-top: 1px solid rgba(255, 255, 255, 0.32);
          box-shadow: 0 4px 16px rgba(0, 0, 0, 0.25), inset 0 1px 0 rgba(255, 255, 255, 0.15);
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          white-space: nowrap;
          transition: transform 0.28s cubic-bezier(0.34, 1.56, 0.64, 1), background 0.2s ease;
        }

        .apple-btn-primary:hover {
          background: rgba(255, 255, 255, 0.22);
          transform: translate3d(0, -1px, 0) scale(1.015);
        }

        .apple-btn-primary:active {
          transform: scale(0.96);
        }

        .apple-btn-secondary {
          flex: 1;
          height: 40px;
          border-radius: 12px;
          background: rgba(255, 255, 255, 0.06);
          color: rgba(255, 255, 255, 0.88);
          font-size: 12.5px;
          font-weight: 500;
          border: 1px solid rgba(255, 255, 255, 0.12);
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          white-space: nowrap;
          transition: transform 0.28s cubic-bezier(0.34, 1.56, 0.64, 1), background 0.2s ease;
        }

        .apple-btn-secondary:hover {
          background: rgba(255, 255, 255, 0.12);
          color: #ffffff;
          transform: translate3d(0, -1px, 0) scale(1.015);
        }

        .apple-btn-secondary:active {
          transform: scale(0.96);
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

        .apple-chart-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 8px;
        }

        .apple-chart-title {
          font-size: 12px;
          font-weight: 600;
          color: rgba(255, 255, 255, 0.85);
          letter-spacing: -0.1px;
        }

        .apple-chart-subtitle {
          font-size: 11.5px;
          font-weight: 600;
          color: #38bdf8;
          font-variant-numeric: tabular-nums;
        }

        .apple-chart-canvas {
          width: 100%;
          height: auto;
          max-height: 190px;
          border-radius: 8px;
        }
      </style>

      <div class="apple-physics-layout">
        <!-- 1. 左侧：参数调节与热力学第一定律实时指标 -->
        <div class="apple-physics-panel">
          <div class="apple-physics-group">
            <!-- 单侧重锤配重 m -->
            <div class="apple-physics-row">
              <div class="apple-physics-row-header">
                <span class="apple-physics-label">单侧黄铜重锤质量 m</span>
                <span id="val-joule-mass" class="apple-physics-readout">6.0 kg · 双锤 12.0 kg</span>
              </div>
              <input type="range" class="apple-physics-slider" id="slider-joule-mass" min="1.0" max="10.0" step="0.5" value="6.0" />
              <div class="apple-physics-scale">
                <span>1.0 kg</span>
                <span>10.0 kg</span>
              </div>
            </div>

            <!-- 康铜电热丝电流 I -->
            <div class="apple-physics-row">
              <div class="apple-physics-row-header">
                <span class="apple-physics-label">焦耳电热电流 I (R=5Ω)</span>
                <span id="val-joule-current" class="apple-physics-readout">3.5 A · 61.3 W</span>
              </div>
              <input type="range" class="apple-physics-slider" id="slider-joule-current" min="0.5" max="6.0" step="0.1" value="3.5" />
              <div class="apple-physics-scale">
                <span>0.5 A</span>
                <span>6.0 A</span>
              </div>
            </div>

            <!-- 量热器温度与累积温升 -->
            <div class="apple-physics-row">
              <div class="apple-physics-row-header">
                <span class="apple-physics-label">量热器温度 T / 温升 ΔT</span>
                <span id="val-joule-temp" class="apple-physics-readout">20.000 °C · +0.000 K</span>
              </div>
            </div>

            <!-- 机械搅拌功与焦耳电热功 -->
            <div class="apple-physics-row">
              <div class="apple-physics-row-header">
                <span class="apple-physics-label">机械功 W_m / 电热功 W_e</span>
                <span id="val-joule-work" class="apple-physics-readout">0.0 J (N=0) · 0.0 J</span>
              </div>
            </div>

            <!-- 内能增量与实测热功当量 -->
            <div class="apple-physics-row">
              <div class="apple-physics-row-header">
                <span class="apple-physics-label">内能 ΔU / 实测热功当量 J</span>
                <span id="val-joule-eq" class="apple-physics-readout">0.0 J · J = 4.186 J/cal</span>
              </div>
            </div>
          </div>

          <!-- 模式与工作液体选择 + 操作按钮组 -->
          <div class="apple-actions-group">
            <div class="apple-select-row">
              <select class="apple-select" id="select-joule-mode" title="实验探究模式">
                <option value="free_explore">模式: 自由三维操控</option>
                <option value="auto_mech_cycle">模式: 重锤连续下落循环</option>
                <option value="elec_heating">模式: 焦耳电热恒流升温</option>
                <option value="equivalence_benchmark">模式: 机械功 vs 电功等效</option>
              </select>

              <select class="apple-select" id="select-joule-fluid" title="量热器工作介质">
                <option value="water">介质: 纯水 (c=4186)</option>
                <option value="kerosene">介质: 煤油 (c=2100)</option>
                <option value="glycerin">介质: 甘油 (c=2430)</option>
                <option value="mercury">介质: 水银 (c=140)</option>
              </select>
            </div>

            <div class="apple-btn-row">
              <button class="apple-btn-primary" id="btn-joule-drop" type="button">
                <span id="txt-joule-drop">释放重锤</span>
              </button>
              <button class="apple-btn-secondary" id="btn-joule-heater" type="button">
                <span id="txt-joule-heater">电热: 关</span>
              </button>
              <button class="apple-btn-secondary" id="btn-joule-baffle" type="button">
                <span id="txt-joule-baffle">阻流片: 啮合</span>
              </button>
              <button class="apple-btn-secondary" id="btn-joule-reset" type="button" style="flex: 0.65;">
                <span>重置</span>
              </button>
            </div>
          </div>
        </div>

        <!-- 2. 右侧：双分析图表 -->
        <div class="apple-charts-grid">
          <div class="apple-chart-card">
            <div class="apple-chart-header">
              <span class="apple-chart-title">温升 ΔT (°C) 与 累积总功 W = W_m + W_e (J) 关系图</span>
              <span class="apple-chart-subtitle" id="txt-joule-chart-badge">实测 J = 4.186 J/cal</span>
            </div>
            <canvas id="canvas-joule-dtw" class="apple-chart-canvas" width="480" height="205"></canvas>
          </div>

          <div class="apple-chart-card">
            <div class="apple-chart-header">
              <span class="apple-chart-title">热力学第一定律能量转换账本 (ΔU = W_mech + W_elec + Q)</span>
              <span class="apple-chart-subtitle" id="txt-joule-fluid-badge">纯水 H₂O · c = 4186 J/kg·K</span>
            </div>
            <canvas id="canvas-joule-energy" class="apple-chart-canvas" width="480" height="205"></canvas>
          </div>
        </div>
      </div>
    `;

    this.canvasDTW = this.element.querySelector('#canvas-joule-dtw') as HTMLCanvasElement;
    this.canvasEnergy = this.element.querySelector('#canvas-joule-energy') as HTMLCanvasElement;

    this.valMassEl = this.element.querySelector('#val-joule-mass');
    this.valCurrentEl = this.element.querySelector('#val-joule-current');
    this.valTempEl = this.element.querySelector('#val-joule-temp');
    this.valWorkEl = this.element.querySelector('#val-joule-work');
    this.valJouleEl = this.element.querySelector('#val-joule-eq');

    this.sliderMass = this.element.querySelector('#slider-joule-mass');
    this.sliderCurrent = this.element.querySelector('#slider-joule-current');
    this.selectMode = this.element.querySelector('#select-joule-mode');
    this.selectFluid = this.element.querySelector('#select-joule-fluid');
    this.btnDrop = this.element.querySelector('#btn-joule-drop');
    this.btnHeater = this.element.querySelector('#btn-joule-heater');
    this.btnBaffle = this.element.querySelector('#btn-joule-baffle');
    this.btnReset = this.element.querySelector('#btn-joule-reset');

    this.updateSliderTrackFill(this.sliderMass, 1.0, 10.0, 6.0);
    this.updateSliderTrackFill(this.sliderCurrent, 0.5, 6.0, 3.5);

    this.bindEvents();
  }

  private bindEvents(): void {
    bindVisionSlider(this.sliderMass, {
      activeSet: this.activeSliders,
      onChange: (val) => {
        this.updateSliderTrackFill(this.sliderMass, 1.0, 10.0, val);
        this.callbacks.onWeightMassChange?.(val);
      },
      onScrub: (val) => {
        if (this.valMassEl) {
          this.valMassEl.textContent = `${val.toFixed(1)} kg · 双锤 ${(val * 2).toFixed(1)} kg`;
        }
        this.updateSliderTrackFill(this.sliderMass, 1.0, 10.0, val);
      },
    });

    bindVisionSlider(this.sliderCurrent, {
      activeSet: this.activeSliders,
      onChange: (val) => {
        this.updateSliderTrackFill(this.sliderCurrent, 0.5, 6.0, val);
        this.callbacks.onCurrentChange?.(val);
      },
      onScrub: (val) => {
        const power = val * val * 5.0;
        if (this.valCurrentEl) {
          this.valCurrentEl.textContent = `${val.toFixed(1)} A · ${power.toFixed(1)} W`;
        }
        this.updateSliderTrackFill(this.sliderCurrent, 0.5, 6.0, val);
      },
    });

    this.selectMode?.addEventListener('change', (e) => {
      const mode = (e.target as HTMLSelectElement).value as JouleOperationMode;
      this.callbacks.onModeChange?.(mode);
    });

    this.selectFluid?.addEventListener('change', (e) => {
      const fluid = (e.target as HTMLSelectElement).value as JouleFluidType;
      this.callbacks.onFluidChange?.(fluid);
    });

    this.btnDrop?.addEventListener('click', () => {
      this.callbacks.onReleaseDrop?.();
    });

    this.btnHeater?.addEventListener('click', () => {
      this.callbacks.onToggleHeater?.();
    });

    this.btnBaffle?.addEventListener('click', () => {
      this.callbacks.onToggleBaffles?.();
    });

    this.btnReset?.addEventListener('click', () => {
      this.callbacks.onReset?.();
    });
  }

  public setVisible(show: boolean): void {
    this.isVisible = show;
    this.element.style.display = show ? 'flex' : 'none';
    if (show && this.currentData) {
      this.lastRenderedHash = '';
      this.renderCharts(this.currentData);
    }
  }

  public get visible(): boolean {
    return this.isVisible;
  }

  public updateTelemetry(data: JouleTelemetry): void {
    this.currentData = data;

    if (this.valMassEl && !isSliderActive(this.sliderMass, this.activeSliders)) {
      this.valMassEl.textContent = `${data.weightMassKg.toFixed(1)} kg · 双锤 ${(data.weightMassKg * 2).toFixed(1)} kg`;
    }
    if (this.valCurrentEl && !isSliderActive(this.sliderCurrent, this.activeSliders)) {
      const power = data.currentAmp * data.currentAmp * data.coilResistanceOhm;
      this.valCurrentEl.textContent = `${data.currentAmp.toFixed(1)} A · ${power.toFixed(1)} W`;
    }
    if (this.valTempEl) {
      this.valTempEl.textContent = `${data.temperatureC.toFixed(3)} °C · +${data.deltaTC.toFixed(3)} K`;
    }
    if (this.valWorkEl) {
      this.valWorkEl.textContent = `${data.mechanicalWorkJ.toFixed(1)} J (N=${data.dropCount}) · ${data.electricalWorkJ.toFixed(1)} J`;
    }
    if (this.valJouleEl) {
      this.valJouleEl.textContent = `${data.internalEnergyDeltaUJ.toFixed(1)} J (${data.equivalentHeatCal.toFixed(1)} cal) · J=${data.measuredJouleEquivalent.toFixed(3)}`;
    }

    if (this.sliderMass && !isSliderActive(this.sliderMass, this.activeSliders)) {
      this.sliderMass.value = String(data.weightMassKg);
      this.updateSliderTrackFill(this.sliderMass, 1.0, 10.0, data.weightMassKg);
    }
    if (this.sliderCurrent && !isSliderActive(this.sliderCurrent, this.activeSliders)) {
      this.sliderCurrent.value = String(data.currentAmp);
      this.updateSliderTrackFill(this.sliderCurrent, 0.5, 6.0, data.currentAmp);
    }

    if (this.selectMode && this.selectMode.value !== data.operationMode) {
      this.selectMode.value = data.operationMode;
    }
    if (this.selectFluid && this.selectFluid.value !== data.fluidType) {
      this.selectFluid.value = data.fluidType;
    }

    if (this.btnDrop) {
      const txt = this.btnDrop.querySelector('#txt-joule-drop');
      if (txt) {
        if (data.isDropping) txt.textContent = '下落做功中...';
        else if (data.isHoisting) txt.textContent = '绞升复位中...';
        else if (data.weightHeightM <= 0.05) txt.textContent = '绞升并释放';
        else txt.textContent = '释放重锤';
      }
    }

    if (this.btnHeater) {
      const txt = this.btnHeater.querySelector('#txt-joule-heater');
      if (txt) txt.textContent = data.heaterActive ? '电热: 通电' : '电热: 断开';
    }

    if (this.btnBaffle) {
      const txt = this.btnBaffle.querySelector('#txt-joule-baffle');
      if (txt) txt.textContent = data.bafflesEngaged ? '阻流片: 啮合' : '阻流片: 抽离';
    }

    const chartBadge = this.element.querySelector('#txt-joule-chart-badge');
    if (chartBadge) {
      chartBadge.textContent = `实测 J = ${data.measuredJouleEquivalent.toFixed(3)} J/cal`;
    }
    const fluidBadge = this.element.querySelector('#txt-joule-fluid-badge');
    if (fluidBadge) {
      fluidBadge.textContent = `${data.fluidSpec.name} (${data.fluidSpec.formula}) · c = ${data.fluidSpec.specificHeatJkgK} J/kg·K`;
    }

    if (this.isVisible) {
      const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
      const stateHash = [
        data.fluidType,
        data.operationMode,
        data.bafflesEngaged ? 1 : 0,
        data.heaterActive ? 1 : 0,
        data.mechanicalWorkJ.toFixed(1),
        data.electricalWorkJ.toFixed(1),
        data.deltaTC.toFixed(3),
        data.weightHeightM.toFixed(2),
        data.samples.length,
      ].join('|');

      const stateChanged = stateHash !== this.lastRenderedHash;
      if (stateChanged && now - this.lastChartRenderTime >= 32) {
        this.lastChartRenderTime = now;
        this.lastRenderedHash = stateHash;
        this.renderCharts(data);
      }
    }
  }

  private renderCharts(d: JouleTelemetry): void {
    this.renderDTWChart(d);
    this.renderEnergyChart(d);
  }

  /**
   * 图表 1：温升 ΔT (°C) 与 累积总功 W (J) 线性关系与采样点
   */
  private renderDTWChart(d: JouleTelemetry): void {
    const canvas = this.canvasDTW;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const padL = 44;
    const padR = 16;
    const padT = 14;
    const padB = 26;
    const chartW = w - padL - padR;
    const chartH = h - padT - padB;

    const totalWork = d.mechanicalWorkJ + d.electricalWorkJ;
    const maxW = Math.max(500, totalWork * 1.18);
    const maxDT = Math.max(2.0, d.deltaTC * 1.25);

    const mapX = (workJ: number) => padL + Math.min(1, Math.max(0, workJ / maxW)) * chartW;
    const mapY = (dtC: number) => padT + chartH - Math.min(1, Math.max(0, dtC / maxDT)) * chartH;

    // 水平与垂直网格线
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
    ctx.lineWidth = 1;
    for (let i = 1; i <= 4; i++) {
      const y = padT + (chartH * i) / 4;
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(w - padR, y);
      ctx.stroke();

      const valDT = maxDT * (1 - i / 4);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.38)';
      ctx.font = '10px -apple-system, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(`+${valDT.toFixed(1)}°`, padL - 6, y + 3);
    }

    for (let i = 1; i <= 4; i++) {
      const x = padL + (chartW * i) / 4;
      ctx.beginPath();
      ctx.moveTo(x, padT);
      ctx.lineTo(x, padT + chartH);
      ctx.stroke();

      const valW = (maxW * i) / 4;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.38)';
      ctx.font = '10px -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`${Math.round(valW)}J`, x, h - 7);
    }

    // 坐标轴
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(padL, padT);
    ctx.lineTo(padL, padT + chartH);
    ctx.lineTo(w - padR, padT + chartH);
    ctx.stroke();

    // 纯水基准斜率参考虚线
    ctx.save();
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.45)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(padL, padT + chartH);
    const waterEndDT = maxW / (4186 * 0.08);
    ctx.lineTo(mapX(maxW), mapY(waterEndDT));
    ctx.stroke();

    // 当前流体理论斜率虚线
    if (d.fluidType !== 'water') {
      ctx.strokeStyle = 'rgba(251, 191, 36, 0.65)';
      ctx.beginPath();
      ctx.moveTo(padL, padT + chartH);
      const curCap = d.fluidSpec.specificHeatJkgK * d.fluidSpec.fluidMassKg;
      const curEndDT = maxW / curCap;
      const targetW = curEndDT > maxDT ? maxDT * curCap : maxW;
      ctx.lineTo(mapX(targetW), mapY(Math.min(maxDT, curEndDT)));
      ctx.stroke();
    }
    ctx.restore();

    // 实测轨迹与采样点
    if (d.samples.length > 0) {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2.0;
      ctx.beginPath();
      ctx.moveTo(padL, padT + chartH);
      for (const s of d.samples) {
        ctx.lineTo(mapX(s.workTotalJ), mapY(s.deltaTC));
      }
      ctx.lineTo(mapX(totalWork), mapY(d.deltaTC));
      ctx.stroke();

      for (const s of d.samples) {
        const sx = mapX(s.workTotalJ);
        const sy = mapY(s.deltaTC);
        ctx.fillStyle = s.source === 'electrical' ? '#fb7185' : '#fbbf24';
        ctx.beginPath();
        ctx.arc(sx, sy, 3.8, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (totalWork > 0.1) {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2.0;
      ctx.beginPath();
      ctx.moveTo(padL, padT + chartH);
      ctx.lineTo(mapX(totalWork), mapY(d.deltaTC));
      ctx.stroke();
    }

    // 当前实时工作点
    const liveX = mapX(totalWork);
    const liveY = mapY(d.deltaTC);
    ctx.fillStyle = 'rgba(10, 132, 255, 0.4)';
    ctx.beginPath();
    ctx.arc(liveX, liveY, 7.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(liveX, liveY, 3.8, 0, Math.PI * 2);
    ctx.fill();
  }

  /**
   * 图表 2：热力学第一定律能量账本与机械功/电功等效对比条形图
   */
  private renderEnergyChart(d: JouleTelemetry): void {
    const canvas = this.canvasEnergy;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const padL = 108;
    const padR = 78;
    const barMaxW = w - padL - padR;

    const maxEnergy = Math.max(
      200,
      d.mechanicalWorkJ + d.electricalWorkJ,
      d.internalEnergyDeltaUJ,
      d.potentialEnergyJ
    );

    const rows = [
      {
        label: '悬挂重锤势能 Ep',
        val: d.potentialEnergyJ,
        unit: 'J',
        color: 'rgba(56, 189, 248, 0.78)',
      },
      {
        label: '机械搅拌功 W_m',
        val: d.mechanicalWorkJ,
        unit: 'J',
        color: 'rgba(251, 191, 36, 0.85)',
      },
      {
        label: '焦耳电热功 W_e',
        val: d.electricalWorkJ,
        unit: 'J',
        color: 'rgba(251, 113, 133, 0.85)',
      },
      {
        label: '液体内能增量 ΔU',
        val: d.internalEnergyDeltaUJ,
        unit: 'J',
        color: 'rgba(52, 211, 153, 0.90)',
      },
    ];

    const startY = 20;
    const rowStep = 40;
    const barH = 18;

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const y = startY + i * rowStep;

      // 左侧标签
      ctx.fillStyle = 'rgba(255, 255, 255, 0.72)';
      ctx.font = '11.5px -apple-system, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(r.label, padL - 10, y + 13);

      // 轨道底槽
      ctx.fillStyle = 'rgba(255, 255, 255, 0.07)';
      ctx.fillRect(padL, y, barMaxW, barH);

      // 能量填充条
      const fillW = Math.min(1, Math.max(0, r.val / maxEnergy)) * barMaxW;
      if (fillW > 0.5) {
        ctx.fillStyle = r.color;
        ctx.fillRect(padL, y, fillW, barH);
      }

      // 右侧数值读数
      ctx.fillStyle = '#ffffff';
      ctx.font = '600 11.5px -apple-system, monospace';
      ctx.textAlign = 'left';
      ctx.fillText(`${r.val.toFixed(1)} ${r.unit}`, padL + barMaxW + 8, y + 13);
    }

    // 底部结论与阻流片/等效状态摘要
    ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
    ctx.font = '11px -apple-system, sans-serif';
    ctx.textAlign = 'left';
    if (d.operationMode === 'equivalence_benchmark') {
      ctx.fillStyle = '#34d399';
      ctx.fillText(
        `等效对比验证: 机械功 ΔT₁ = +${d.benchmarkMechDeltaT.toFixed(3)}°C  |  等量电功 ΔT₂ = +${d.benchmarkElecDeltaT.toFixed(3)}°C`,
        16,
        h - 10
      );
    } else if (!d.bafflesEngaged) {
      ctx.fillStyle = '#fbbf24';
      ctx.fillText(
        `定子阻流片已抽离: 宏观旋涡暂存动能 E_vortex = ${d.vortexKineticEnergyJ.toFixed(1)} J · 分子速率 v_rms = ${Math.round(d.molecularRmsSpeedMS)} m/s`,
        16,
        h - 10
      );
    } else {
      ctx.fillText(
        `定子阻流片已啮合 (强湍流剪切) · 分子热运动方均根速率 v_rms = ${Math.round(d.molecularRmsSpeedMS)} m/s`,
        16,
        h - 10
      );
    }
  }
}
