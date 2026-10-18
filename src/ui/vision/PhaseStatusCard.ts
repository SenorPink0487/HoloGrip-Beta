import { bindVisionSlider, isSliderActive } from './sliderGestureHelper.ts';

export interface PhaseTelemetryData {
  temperatureC: number;
  temperatureK: number;
  heatPowerW: number;
  totalEnergyKj: number;
  entropyJPerK: number;
  iceFraction: number; // [0, 1]
  waterFraction: number; // [0, 1]
  steamFraction?: number; // [0, 1]
  vaporFraction?: number;
  substanceMassG?: number;
  currentPhaseStage?: string;
  isBoiling?: boolean;
  phaseStageName: string;
  isHeating: boolean;
  timeElapsedS: number;
  history?: { t: number; tempC: number }[];
  timePoints?: number[];
  tempPoints?: number[];
}

export interface PhaseStatusCardCallbacks {
  onPowerChange?: (powerW: number) => void;
  onHeatPowerChange?: (powerW: number) => void;
  onMassChange?: (massG: number) => void;
  onToggleHeating?: (heating: boolean) => void;
  onTimeAccelChange?: (accel: number) => void;
  onTimeAccelerationChange?: (scale: number) => void;
  onReset?: () => void;
  onResetExperiment?: () => void;
}

export class PhaseStatusCard {
  public element: HTMLElement;
  private canvasTT: HTMLCanvasElement;
  private canvasFractions: HTMLCanvasElement;
  private callbacks: PhaseStatusCardCallbacks;

  private isVisible = false;
  private currentData: PhaseTelemetryData = {
    temperatureC: 0.0,
    temperatureK: 273.15,
    heatPowerW: 800,
    totalEnergyKj: 32.4,
    entropyJPerK: 118.6,
    iceFraction: 0.5,
    waterFraction: 0.5,
    steamFraction: 0.0,
    phaseStageName: '固液共存 · 融化潜热平台',
    isHeating: true,
    timeElapsedS: 40.5,
    history: [],
  };

  private valTempEl: HTMLElement | null = null;
  private valPowerEl: HTMLElement | null = null;
  private valEnergyEl: HTMLElement | null = null;
  private badgeStageEl: HTMLElement | null = null;
  private sliderPower: HTMLInputElement | null = null;
  private btnHeating: HTMLButtonElement | null = null;
  private selectAccel: HTMLSelectElement | null = null;
  private btnReset: HTMLButtonElement | null = null;
  private activeSliders = new Set<string>();

  private lastChartRenderTime = 0;
  private lastRenderedTempC = -999;
  private lastRenderedPower = -1;
  private lastRenderedHeating: boolean | null = null;
  private lastRenderedStage = '';
  private lastRenderedTimeS = -1;

  constructor(callbacks: PhaseStatusCardCallbacks = {}) {
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
          transition: transform 0.12s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.12s ease;
          border: none;
        }

        .apple-physics-slider::-webkit-slider-thumb:hover {
          transform: scale(1.12);
          box-shadow: 0 3px 8px rgba(0, 0, 0, 0.45);
        }

        .apple-physics-slider::-webkit-slider-thumb:active {
          transform: scale(0.96);
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

        .apple-btn-row {
          display: flex;
          gap: 8px;
        }

        .apple-btn-primary {
          flex: 1.2;
          height: 42px;
          border-radius: 12px;
          background: rgba(255, 255, 255, 0.14);
          color: #ffffff;
          font-size: 14px;
          font-weight: 600;
          letter-spacing: -0.2px;
          border: 1px solid rgba(255, 255, 255, 0.18);
          border-top: 1px solid rgba(255, 255, 255, 0.32);
          box-shadow: 0 4px 16px rgba(0, 0, 0, 0.25), inset 0 1px 0 rgba(255, 255, 255, 0.15);
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          transition: all 0.18s cubic-bezier(0.16, 1, 0.3, 1);
        }

        .apple-btn-primary:hover {
          background: rgba(255, 255, 255, 0.22);
          border-color: rgba(255, 255, 255, 0.28);
          border-top-color: rgba(255, 255, 255, 0.45);
          box-shadow: 0 6px 20px rgba(0, 0, 0, 0.35);
          transform: translateY(-1px);
        }

        .apple-btn-primary:active {
          background: rgba(255, 255, 255, 0.08);
          transform: translateY(0.5px) scale(0.99);
        }

        .apple-btn-secondary {
          flex: 1;
          height: 42px;
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
          transition: all 0.18s ease;
        }

        .apple-btn-secondary:hover {
          background: rgba(255, 255, 255, 0.12);
          color: #ffffff;
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
        <!-- 1. 左侧：功率调节与相变指标 -->
        <div class="apple-physics-panel">
          <div class="apple-physics-group">
            <!-- 电加热功率 P -->
            <div class="apple-physics-row">
              <div class="apple-physics-row-header">
                <span class="apple-physics-label">电加热功率 P</span>
                <span id="val-phase-power" class="apple-physics-readout">800 W</span>
              </div>
              <input type="range" class="apple-physics-slider" id="slider-phase-power" min="100" max="2000" step="50" value="800" />
              <div class="apple-physics-scale">
                <span>100 W</span>
                <span>2000 W</span>
              </div>
            </div>

            <!-- 体系温度 T -->
            <div class="apple-physics-row">
              <div class="apple-physics-row-header">
                <span class="apple-physics-label">体系温度 T</span>
                <span id="val-phase-temp" class="apple-physics-readout">0.0 °C · 273.15 K</span>
              </div>
            </div>

            <!-- 累计吸热与熵变 -->
            <div class="apple-physics-row">
              <div class="apple-physics-row-header">
                <span class="apple-physics-label">累计吸收热量 Q_in</span>
                <span id="val-phase-energy" class="apple-physics-readout">32.4 kJ · 118.6 J/K</span>
              </div>
            </div>

            <!-- 当前相态阶段 -->
            <div class="apple-physics-row">
              <div class="apple-physics-row-header">
                <span class="apple-physics-label">聚集相态阶段</span>
                <span id="badge-phase-stage" class="apple-physics-readout">固液共存 · 熔化平台</span>
              </div>
            </div>
          </div>

          <!-- 操作控件 -->
          <div class="apple-actions-group">
            <select class="apple-select" id="select-phase-accel">
              <option value="1">物理流速: 1x (真实演化)</option>
              <option value="5" selected>物理流速: 5x (标准演示)</option>
              <option value="20">物理流速: 20x (超快加速)</option>
            </select>

            <div class="apple-btn-row">
              <button class="apple-btn-primary" id="btn-phase-heating" type="button">
                <span id="txt-phase-heating">加热中</span>
              </button>
              <button class="apple-btn-secondary" id="btn-phase-reset" type="button">
                <span>重置实验</span>
              </button>
            </div>
          </div>
        </div>

        <!-- 2. 右侧：升温潜热曲线与三态转化 -->
        <div class="apple-charts-grid">
          <div class="apple-chart-card">
            <span class="apple-chart-title">T-t 动态升温潜热曲线 (平台段: Q = mL)</span>
            <canvas id="canvas-phase-tt" class="apple-chart-canvas" width="480" height="210"></canvas>
          </div>

          <div class="apple-chart-card">
            <span class="apple-chart-title">固-液-汽三态质量百分比转化</span>
            <canvas id="canvas-phase-fractions" class="apple-chart-canvas" width="480" height="210"></canvas>
          </div>
        </div>
      </div>
    `;

    this.canvasTT = this.element.querySelector('#canvas-phase-tt') as HTMLCanvasElement;
    this.canvasFractions = this.element.querySelector('#canvas-phase-fractions') as HTMLCanvasElement;

    this.valTempEl = this.element.querySelector('#val-phase-temp');
    this.valPowerEl = this.element.querySelector('#val-phase-power');
    this.valEnergyEl = this.element.querySelector('#val-phase-energy');
    this.badgeStageEl = this.element.querySelector('#badge-phase-stage');
    this.sliderPower = this.element.querySelector('#slider-phase-power');
    this.btnHeating = this.element.querySelector('#btn-phase-heating');
    this.selectAccel = this.element.querySelector('#select-phase-accel');
    this.btnReset = this.element.querySelector('#btn-phase-reset');

    this.updateSliderTrackFill(this.sliderPower, 100, 2000, 800);

    this.bindEvents();
  }

  private bindEvents(): void {
    bindVisionSlider(this.sliderPower, {
      activeSet: this.activeSliders,
      onChange: (val) => {
        this.updateSliderTrackFill(this.sliderPower, 100, 2000, val);
        this.callbacks.onPowerChange?.(val);
        this.callbacks.onHeatPowerChange?.(val);
      },
      onScrub: (val) => {
        if (this.valPowerEl) this.valPowerEl.textContent = `${Math.round(val)} W`;
        this.updateSliderTrackFill(this.sliderPower, 100, 2000, val);
      },
    });

    this.btnHeating?.addEventListener('click', () => {
      const nextHeating = !this.currentData.isHeating;
      this.currentData.isHeating = nextHeating;
      this.callbacks.onToggleHeating?.(nextHeating);
    });

    this.selectAccel?.addEventListener('change', (e) => {
      const val = parseFloat((e.target as HTMLSelectElement).value) || 1;
      this.callbacks.onTimeAccelChange?.(val);
      this.callbacks.onTimeAccelerationChange?.(val);
    });

    this.btnReset?.addEventListener('click', () => {
      this.callbacks.onReset?.();
      this.callbacks.onResetExperiment?.();
    });
  }

  public setVisible(show: boolean): void {
    this.isVisible = show;
    this.element.style.display = show ? 'flex' : 'none';
    if (show) {
      this.renderCharts();
    }
  }

  public get visible(): boolean {
    return this.isVisible;
  }

  public updateTelemetry(data: PhaseTelemetryData): void {
    this.currentData = data;

    if (this.valTempEl) {
      this.valTempEl.textContent = `${data.temperatureC.toFixed(1)} °C · ${data.temperatureK.toFixed(1)} K`;
    }
    if (this.valPowerEl) {
      this.valPowerEl.textContent = `${Math.round(data.heatPowerW)} W`;
    }
    if (this.valEnergyEl) {
      this.valEnergyEl.textContent = `${data.totalEnergyKj.toFixed(1)} kJ · ${data.entropyJPerK.toFixed(1)} J/K`;
    }
    if (this.badgeStageEl) {
      this.badgeStageEl.textContent = data.phaseStageName;
    }

    if (this.btnHeating) {
      const txt = this.btnHeating.querySelector('#txt-phase-heating');
      if (txt) txt.textContent = data.isHeating ? '加热中' : '已暂停';
    }

    if (this.sliderPower && !isSliderActive(this.sliderPower, this.activeSliders)) {
      this.sliderPower.value = String(data.heatPowerW);
      this.updateSliderTrackFill(this.sliderPower, 100, 2000, data.heatPowerW);
    }

    if (this.isVisible) {
      const now = performance.now();
      const stateChanged =
        data.isHeating !== this.lastRenderedHeating ||
        data.phaseStageName !== this.lastRenderedStage ||
        Math.abs(data.heatPowerW - this.lastRenderedPower) > 1.0 ||
        Math.abs(data.temperatureC - this.lastRenderedTempC) > 0.2 ||
        (data.isHeating && data.timeElapsedS - this.lastRenderedTimeS >= 1.0);

      if (stateChanged && now - this.lastChartRenderTime >= 32) {
        this.lastChartRenderTime = now;
        this.lastRenderedTempC = data.temperatureC;
        this.lastRenderedPower = data.heatPowerW;
        this.lastRenderedHeating = data.isHeating;
        this.lastRenderedStage = data.phaseStageName;
        this.lastRenderedTimeS = data.timeElapsedS;
        this.renderCharts();
      }
    }
  }

  private renderCharts(): void {
    this.renderTTChart();
    this.renderFractionsChart();
  }

  private renderTTChart(): void {
    const canvas = this.canvasTT;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const padL = 40, padR = 14, padT = 14, padB = 26;
    const chartW = w - padL - padR;
    const chartH = h - padT - padB;

    const d = this.currentData;
    const tMin = -30, tMax = 120;

    const mapY = (tC: number) => padT + chartH - ((tC - tMin) / (tMax - tMin)) * chartH;
    const maxT = Math.max(120, d.timeElapsedS * 1.15);
    const mapX = (tSec: number) => padL + (tSec / maxT) * chartW;

    // 参考网格与零度线
    const y0 = mapY(0);
    const y100 = mapY(100);

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(padL, y0);
    ctx.lineTo(w - padR, y0);
    ctx.moveTo(padL, y100);
    ctx.lineTo(w - padR, y100);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.font = '10px -apple-system, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText('0°C', padL - 4, y0 + 3);
    ctx.fillText('100°C', padL - 4, y100 + 3);

    // 坐标轴
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(padL, padT);
    ctx.lineTo(padL, padT + chartH);
    ctx.lineTo(w - padR, padT + chartH);
    ctx.stroke();

    // 动态历史温度曲线 (纯白)
    const history = d.history || [];
    if (history.length > 1) {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2.0;
      ctx.beginPath();
      for (let i = 0; i < history.length; i++) {
        const hx = mapX(history[i].t);
        const hy = mapY(history[i].tempC);
        if (i === 0) ctx.moveTo(hx, hy); else ctx.lineTo(hx, hy);
      }
      ctx.stroke();
    }

    // 实时状态点
    const liveX = mapX(d.timeElapsedS);
    const liveY = mapY(d.temperatureC);

    ctx.fillStyle = 'rgba(10, 132, 255, 0.4)';
    ctx.beginPath();
    ctx.arc(liveX, liveY, 8, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(liveX, liveY, 4, 0, Math.PI * 2);
    ctx.fill();
  }

  private renderFractionsChart(): void {
    const canvas = this.canvasFractions;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const padL = 20, padR = 20, padT = 30, padB = 40;
    const barW = w - padL - padR;
    const barH = 44;
    const barY = padT + (h - padT - padB - barH) / 2;

    const d = this.currentData;
    const ice = d.iceFraction ?? 0;
    const water = d.waterFraction ?? 0;
    const steam = d.steamFraction ?? d.vaporFraction ?? 0;
    const iceW = Math.max(0, ice * barW);
    const waterW = Math.max(0, water * barW);
    const steamW = Math.max(0, steam * barW);

    // 绘制堆叠条形（冰: 纯白微透, 水: 苹果系统蓝, 汽: 浅灰蓝）
    let curX = padL;
    if (iceW > 0) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
      ctx.fillRect(curX, barY, iceW, barH);
      curX += iceW;
    }
    if (waterW > 0) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.fillRect(curX, barY, waterW, barH);
      curX += waterW;
    }
    if (steamW > 0) {
      ctx.fillStyle = 'rgba(100, 210, 255, 0.4)';
      ctx.fillRect(curX, barY, steamW, barH);
    }

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.lineWidth = 1;
    ctx.strokeRect(padL, barY, barW, barH);

    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.font = '11px -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`固态冰 ${(ice * 100).toFixed(0)}%`, padL + barW * 0.18, barY + barH + 20);
    ctx.fillText(`液态水 ${(water * 100).toFixed(0)}%`, padL + barW * 0.50, barY + barH + 20);
    ctx.fillText(`水蒸气 ${(steam * 100).toFixed(0)}%`, padL + barW * 0.82, barY + barH + 20);
  }
}
