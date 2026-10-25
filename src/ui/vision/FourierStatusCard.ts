import {
  FOURIER_MATERIAL_ORDER,
  FOURIER_ROD_MATERIALS,
  type FourierConductionTelemetry,
  type FourierRodMaterialId,
} from '../../physics/thermo/fourierConductionSolver.ts';
import { bindVisionSlider, isSliderActive } from './sliderGestureHelper.ts';

export interface FourierStatusCardCallbacks {
  onHotTempChange?: (tempC: number) => void;
  onColdTempChange?: (tempC: number) => void;
  onMaterialChange?: (materialId: FourierRodMaterialId) => void;
  onReset?: () => void;
}

export class FourierStatusCard {
  public element: HTMLElement;
  private callbacks: FourierStatusCardCallbacks;
  private isVisible = false;
  private activeSliders = new Set<string>();

  private valHotEl: HTMLElement | null = null;
  private valColdEl: HTMLElement | null = null;
  private valConductivityEl: HTMLElement | null = null;
  private valGradientEl: HTMLElement | null = null;
  private valFluxEl: HTMLElement | null = null;

  private sliderHot: HTMLInputElement | null = null;
  private sliderCold: HTMLInputElement | null = null;
  private btnReset: HTMLButtonElement | null = null;

  private materialPills: HTMLElement[] = [];
  private profileCanvas: HTMLCanvasElement | null = null;

  constructor(callbacks: FourierStatusCardCallbacks = {}) {
    this.callbacks = callbacks;
    this.element = document.createElement('div');
    this.element.className = 'vision-fourier-status-card hud-interactive';
    this.render();
    this.bindEvents();
  }

  public setVisible(show: boolean): void {
    this.isVisible = show;
    this.element.style.display = show ? 'flex' : 'none';
  }

  public get visible(): boolean {
    return this.isVisible;
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

  private render(): void {
    this.element.innerHTML = `
      <style>
        .vision-fourier-status-card {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 100%;
          height: 100%;
          min-height: 480px;
          padding: 28px;
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

        .vision-fourier-status-card .apple-physics-layout {
          width: 100%;
          max-width: 1020px;
          display: grid;
          grid-template-columns: 380px 1fr;
          gap: 22px;
          align-items: stretch;
          font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", "PingFang SC", "Helvetica Neue", sans-serif;
          user-select: none;
          -webkit-user-select: none;
          animation: iosPanelFadeIn 0.38s cubic-bezier(0.25, 1, 0.5, 1) both;
        }

        .vision-fourier-status-card .apple-physics-panel {
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          gap: 14px;
        }

        .vision-fourier-status-card .apple-physics-group {
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-top: 1px solid rgba(255, 255, 255, 0.2);
          border-radius: 20px;
          overflow: hidden;
          box-shadow: 0 12px 32px rgba(0, 0, 0, 0.25);
        }

        .vision-fourier-status-card .apple-physics-row {
          padding: 16px 20px;
          display: flex;
          flex-direction: column;
          gap: 6px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.06);
        }

        .vision-fourier-status-card .apple-physics-row:last-child {
          border-bottom: none;
        }

        .vision-fourier-status-card .apple-physics-row-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .vision-fourier-status-card .apple-physics-label {
          font-size: 14px;
          font-weight: 500;
          color: rgba(255, 255, 255, 0.68);
          letter-spacing: -0.15px;
        }

        .vision-fourier-status-card .apple-physics-readout {
          font-size: 15px;
          font-weight: 600;
          color: #ffffff;
          font-variant-numeric: tabular-nums;
          letter-spacing: -0.2px;
        }

        .vision-fourier-status-card .apple-physics-slider {
          -webkit-appearance: none;
          appearance: none;
          width: 100%;
          height: 5px;
          border-radius: 9999px;
          outline: none;
          cursor: pointer;
          margin: 8px 0 3px 0;
          background: rgba(255, 255, 255, 0.14);
          transition: background 0.08s ease;
        }

        .vision-fourier-status-card .apple-physics-slider::-webkit-slider-thumb {
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

        .vision-fourier-status-card .apple-physics-slider::-webkit-slider-thumb:hover {
          transform: scale(1.14);
          box-shadow: 0 3px 8px rgba(0, 0, 0, 0.45);
        }

        .vision-fourier-status-card .apple-physics-slider::-webkit-slider-thumb:active {
          transform: scale(1.25);
          box-shadow: 0 3px 10px rgba(0, 0, 0, 0.4), 0 0 0 4px rgba(10, 132, 255, 0.28);
        }

        .vision-fourier-status-card .apple-physics-slider::-moz-range-thumb {
          width: 18px;
          height: 18px;
          border-radius: 50%;
          background: #ffffff;
          box-shadow: 0 2px 6px rgba(0, 0, 0, 0.35);
          cursor: pointer;
          border: none;
        }

        .vision-fourier-status-card .apple-physics-scale {
          display: flex;
          justify-content: space-between;
          font-size: 11px;
          color: rgba(255, 255, 255, 0.3);
          font-variant-numeric: tabular-nums;
          font-weight: 400;
        }

        .vision-fourier-status-card .apple-btn-secondary {
          width: 100%;
          height: 48px;
          border-radius: 18px;
          background: rgba(255, 255, 255, 0.05);
          color: #ffffff;
          font-size: 15px;
          font-weight: 600;
          letter-spacing: 0.3px;
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-top: 1px solid rgba(255, 255, 255, 0.2);
          box-shadow: 0 12px 32px rgba(0, 0, 0, 0.22);
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: transform 0.38s cubic-bezier(0.34, 1.56, 0.64, 1), background 0.2s ease, border-color 0.2s ease;
        }

        .vision-fourier-status-card .apple-btn-secondary:hover {
          background: rgba(255, 255, 255, 0.12);
          border-color: rgba(255, 255, 255, 0.18);
          border-top-color: rgba(255, 255, 255, 0.32);
          transform: translate3d(0, -1px, 0) scale(1.015);
        }

        .vision-fourier-status-card .apple-btn-secondary:active {
          transform: translate3d(0, 0, 0) scale(0.96);
          transition: transform 0.10s cubic-bezier(0.2, 0, 0, 1);
        }

        .vision-fourier-status-card .apple-charts-grid {
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          gap: 16px;
        }

        .vision-fourier-status-card .apple-chart-card {
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-top: 1px solid rgba(255, 255, 255, 0.2);
          border-radius: 20px;
          padding: 18px 22px;
          display: flex;
          flex-direction: column;
          gap: 14px;
          box-shadow: 0 12px 32px rgba(0, 0, 0, 0.25);
        }

        .vision-fourier-status-card .apple-chart-title {
          font-size: 14px;
          font-weight: 600;
          color: rgba(255, 255, 255, 0.85);
          letter-spacing: -0.1px;
        }

        .vision-fourier-status-card .apple-stages-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 10px;
        }

        .vision-fourier-status-card .apple-stage-pill {
          height: 48px;
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 14px;
          padding: 0 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          cursor: pointer;
          transition: background 0.22s ease, border-color 0.22s ease, box-shadow 0.22s ease, transform 0.22s ease;
        }

        .vision-fourier-status-card .apple-stage-pill:hover {
          background: rgba(255, 255, 255, 0.09);
          border-color: rgba(255, 255, 255, 0.18);
        }

        .vision-fourier-status-card .apple-stage-pill.active {
          background: rgba(255, 255, 255, 0.14);
          border-color: rgba(255, 255, 255, 0.3);
          box-shadow: 0 4px 16px rgba(0, 0, 0, 0.25);
        }

        .vision-fourier-status-card .apple-stage-dot {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: rgba(255, 255, 255, 0.18);
          flex-shrink: 0;
          transition: background 0.2s ease, box-shadow 0.2s ease;
        }

        .vision-fourier-status-card .apple-stage-pill.active .apple-stage-dot {
          background: #0a84ff;
          box-shadow: 0 0 8px rgba(10, 132, 255, 0.85);
        }

        .vision-fourier-status-card .apple-stage-name {
          font-size: 14px;
          font-weight: 600;
          color: rgba(255, 255, 255, 0.65);
          white-space: nowrap;
          letter-spacing: -0.1px;
        }

        .vision-fourier-status-card .apple-stage-pill.active .apple-stage-name {
          color: #ffffff;
        }

        .vision-fourier-status-card .apple-chart-canvas {
          width: 100%;
          height: auto;
          max-height: 235px;
          border-radius: 8px;
          display: block;
        }
      </style>

      <div class="apple-physics-layout">
        <!-- 1. 左侧：冷热源控制与傅里叶定律核心量遥测 -->
        <div class="apple-physics-panel">
          <div class="apple-physics-group">
            <!-- 高温端设定 T_h -->
            <div class="apple-physics-row">
              <div class="apple-physics-row-header">
                <span class="apple-physics-label">高温端加热 T_h</span>
                <span id="fourier-val-hot" class="apple-physics-readout">100.0 °C</span>
              </div>
              <input type="range" class="apple-physics-slider" id="fourier-slider-hot" min="60" max="150" step="1" value="100" />
              <div class="apple-physics-scale">
                <span>60 °C</span>
                <span>150 °C</span>
              </div>
            </div>

            <!-- 低温端水浴 T_c -->
            <div class="apple-physics-row">
              <div class="apple-physics-row-header">
                <span class="apple-physics-label">恒温水浴 T_c</span>
                <span id="fourier-val-cold" class="apple-physics-readout">20.0 °C</span>
              </div>
              <input type="range" class="apple-physics-slider" id="fourier-slider-cold" min="5" max="40" step="1" value="20" />
              <div class="apple-physics-scale">
                <span>5 °C</span>
                <span>40 °C</span>
              </div>
            </div>

            <!-- 导热系数 k -->
            <div class="apple-physics-row">
              <div class="apple-physics-row-header">
                <span class="apple-physics-label">导热系数 k</span>
                <span id="fourier-val-k" class="apple-physics-readout">109.0 W/(m·K)</span>
              </div>
            </div>

            <!-- 轴向温度梯度 |dT/dx| -->
            <div class="apple-physics-row">
              <div class="apple-physics-row-header">
                <span class="apple-physics-label">温度梯度 |dT/dx|</span>
                <span id="fourier-val-grad" class="apple-physics-readout">228.4 K/m</span>
              </div>
            </div>

            <!-- 傅里叶热流密度 q -->
            <div class="apple-physics-row">
              <div class="apple-physics-row-header">
                <span class="apple-physics-label">热流密度 q = -k·dT/dx</span>
                <span id="fourier-val-flux" class="apple-physics-readout">24.9 kW/m²</span>
              </div>
            </div>
          </div>

          <button class="apple-btn-secondary" id="fourier-btn-reset" type="button">
            <span>重置传热波前</span>
          </button>
        </div>

        <!-- 2. 右侧：4 种单质金属试件切换 + 沿棒轴向温度分布曲线 T(x) -->
        <div class="apple-charts-grid">
          <!-- 待测单质金属导热棒材质选择 -->
          <div class="apple-chart-card">
            <span class="apple-chart-title">导热试件材质（点击切换对比导热系数 k）</span>
            <div class="apple-stages-grid">
              <div class="apple-stage-pill fourier-material-pill active" data-fourier-mat="brass">
                <span class="apple-stage-dot"></span>
                <span class="apple-stage-name">黄铜 H62</span>
              </div>

              <div class="apple-stage-pill fourier-material-pill" data-fourier-mat="copper">
                <span class="apple-stage-dot"></span>
                <span class="apple-stage-name">紫铜 T2</span>
              </div>

              <div class="apple-stage-pill fourier-material-pill" data-fourier-mat="aluminum">
                <span class="apple-stage-dot"></span>
                <span class="apple-stage-name">铝合金 6061</span>
              </div>

              <div class="apple-stage-pill fourier-material-pill" data-fourier-mat="stainless">
                <span class="apple-stage-dot"></span>
                <span class="apple-stage-name">不锈钢 304</span>
              </div>
            </div>
          </div>

          <!-- 沿棒轴向温度分布曲线 T(x) 与 T1~T5 探头读数 -->
          <div class="apple-chart-card" style="flex: 1; justify-content: space-between;">
            <span class="apple-chart-title">沿棒轴向温度分布曲线 T(x) 与五探头读数</span>
            <canvas id="fourier-profile-canvas" class="apple-chart-canvas" width="540" height="245"></canvas>
          </div>
        </div>
      </div>
    `;

    this.valHotEl = this.element.querySelector('#fourier-val-hot');
    this.valColdEl = this.element.querySelector('#fourier-val-cold');
    this.valConductivityEl = this.element.querySelector('#fourier-val-k');
    this.valGradientEl = this.element.querySelector('#fourier-val-grad');
    this.valFluxEl = this.element.querySelector('#fourier-val-flux');

    this.sliderHot = this.element.querySelector('#fourier-slider-hot');
    this.sliderCold = this.element.querySelector('#fourier-slider-cold');
    this.btnReset = this.element.querySelector('#fourier-btn-reset');
    this.profileCanvas = this.element.querySelector('#fourier-profile-canvas');

    this.materialPills = FOURIER_MATERIAL_ORDER.map(
      (matId) =>
        this.element.querySelector(`[data-fourier-mat="${matId}"]`) as HTMLElement
    ).filter(Boolean);

    this.updateSliderTrackFill(this.sliderHot, 60, 150, 100);
    this.updateSliderTrackFill(this.sliderCold, 5, 40, 20);
  }

  private bindEvents(): void {
    bindVisionSlider(this.sliderHot, {
      activeSet: this.activeSliders,
      onChange: (val: number) => {
        this.updateSliderTrackFill(this.sliderHot, 60, 150, val);
        if (this.valHotEl) {
          this.valHotEl.textContent = `${val.toFixed(1)} °C`;
        }
        this.callbacks.onHotTempChange?.(val);
      },
      onScrub: (val: number) => {
        this.updateSliderTrackFill(this.sliderHot, 60, 150, val);
        if (this.valHotEl) {
          this.valHotEl.textContent = `${val.toFixed(1)} °C`;
        }
      },
    });

    bindVisionSlider(this.sliderCold, {
      activeSet: this.activeSliders,
      onChange: (val: number) => {
        this.updateSliderTrackFill(this.sliderCold, 5, 40, val);
        if (this.valColdEl) {
          this.valColdEl.textContent = `${val.toFixed(1)} °C`;
        }
        this.callbacks.onColdTempChange?.(val);
      },
      onScrub: (val: number) => {
        this.updateSliderTrackFill(this.sliderCold, 5, 40, val);
        if (this.valColdEl) {
          this.valColdEl.textContent = `${val.toFixed(1)} °C`;
        }
      },
    });

    this.materialPills.forEach((pill) => {
      pill.addEventListener('click', () => {
        const matId = pill.getAttribute('data-fourier-mat') as FourierRodMaterialId;
        if (matId && FOURIER_ROD_MATERIALS[matId]) {
          this.callbacks.onMaterialChange?.(matId);
        }
      });
    });

    this.btnReset?.addEventListener('click', () => {
      this.callbacks.onReset?.();
    });
  }

  public updateTelemetry(telemetry: FourierConductionTelemetry): void {
    if (!telemetry) return;

    if (this.valConductivityEl) {
      this.valConductivityEl.textContent = `${telemetry.material.thermalConductivity.toFixed(1)} W/(m·K)`;
    }
    if (this.valGradientEl) {
      this.valGradientEl.textContent = `${telemetry.absGradientKm.toFixed(1)} K/m`;
    }
    if (this.valFluxEl) {
      this.valFluxEl.textContent = `${telemetry.heatFluxKWm2.toFixed(1)} kW/m² · ${telemetry.conductedPowerW.toFixed(1)} W`;
    }

    this.materialPills.forEach((pill) => {
      const matId = pill.getAttribute('data-fourier-mat');
      pill.classList.toggle('active', matId === telemetry.materialId);
    });

    if (!isSliderActive(this.sliderHot, this.activeSliders) && this.sliderHot) {
      this.sliderHot.value = String(telemetry.hotTempC);
      this.updateSliderTrackFill(this.sliderHot, 60, 150, telemetry.hotTempC);
      if (this.valHotEl) {
        this.valHotEl.textContent = `${telemetry.hotTempC.toFixed(1)} °C`;
      }
    }

    if (!isSliderActive(this.sliderCold, this.activeSliders) && this.sliderCold) {
      this.sliderCold.value = String(telemetry.coldTempC);
      this.updateSliderTrackFill(this.sliderCold, 5, 40, telemetry.coldTempC);
      if (this.valColdEl) {
        this.valColdEl.textContent = `${telemetry.coldTempC.toFixed(1)} °C`;
      }
    }

    if (this.profileCanvas) {
      this.drawTemperatureProfileChart(telemetry);
    }
  }

  private drawTemperatureProfileChart(telemetry: FourierConductionTelemetry): void {
    const canvas = this.profileCanvas;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx || typeof ctx.clearRect !== 'function') return;

    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const padL = 46;
    const padR = 22;
    const padT = 18;
    const padB = 28;
    const plotW = w - padL - padR;
    const plotH = h - padT - padB;

    const xMin = 0.0;
    const xMax = 0.40;
    const tMin = 0.0;
    const tMax = 155.0;

    const mapX = (xM: number) =>
      padL + Math.max(0, Math.min(1, (xM - xMin) / (xMax - xMin))) * plotW;
    const mapY = (tempC: number) =>
      padT + plotH - Math.max(0, Math.min(1, (tempC - tMin) / (tMax - tMin))) * plotH;

    // 水平参考网格线
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
    ctx.lineWidth = 1;
    const tTicks = [30, 60, 90, 120, 150];
    for (const tVal of tTicks) {
      const y = mapY(tVal);
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(w - padR, y);
      ctx.stroke();

      if (typeof ctx.fillText === 'function') {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
        ctx.font = '10px -apple-system, sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(`${tVal}°`, padL - 6, y + 3);
      }
    }

    // 垂直探头坐标参考线 (T1 ~ T5)
    for (const probe of telemetry.probes) {
      const x = mapX(probe.positionM);
      ctx.beginPath();
      ctx.moveTo(x, padT);
      ctx.lineTo(x, padT + plotH);
      ctx.stroke();

      if (typeof ctx.fillText === 'function') {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
        ctx.font = '600 10px -apple-system, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(
          `${probe.label} (${(probe.positionM * 100).toFixed(0)}cm)`,
          x,
          h - 7
        );
      }
    }

    // 坐标轴
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(padL, padT);
    ctx.lineTo(padL, padT + plotH);
    ctx.lineTo(w - padR, padT + plotH);
    ctx.stroke();

    // 1. 理想傅里叶稳态线性参考虚线
    const samples = telemetry.profileSamples;
    if (samples.length >= 2) {
      ctx.save();
      if (typeof ctx.setLineDash === 'function') {
        ctx.setLineDash([5, 4]);
      }
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.28)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(mapX(samples[0].xM), mapY(samples[0].steadyTempC));
      ctx.lineTo(
        mapX(samples[samples.length - 1].xM),
        mapY(samples[samples.length - 1].steadyTempC)
      );
      ctx.stroke();
      ctx.restore();

      // 2. 曲线下方柔和面积填充
      ctx.beginPath();
      samples.forEach((pt, idx) => {
        const px = mapX(pt.xM);
        const py = mapY(pt.tempC);
        if (idx === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.lineTo(mapX(samples[samples.length - 1].xM), padT + plotH);
      ctx.lineTo(mapX(samples[0].xM), padT + plotH);
      ctx.closePath();
      ctx.fillStyle = 'rgba(10, 132, 255, 0.12)';
      ctx.fill();

      // 3. 实时温度分布曲线 T(x)
      ctx.beginPath();
      samples.forEach((pt, idx) => {
        const px = mapX(pt.xM);
        const py = mapY(pt.tempC);
        if (idx === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2.6;
      ctx.stroke();
    }

    // 4. 绘制 T1 ~ T5 五个探头的实时温度圆点与数值标签
    for (const probe of telemetry.probes) {
      const px = mapX(probe.positionM);
      const py = mapY(probe.temperatureC);

      if (typeof ctx.arc === 'function') {
        ctx.beginPath();
        ctx.arc(px, py, 7, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(10, 132, 255, 0.38)';
        ctx.fill();

        ctx.beginPath();
        ctx.arc(px, py, 3.6, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
      }

      if (typeof ctx.fillText === 'function') {
        ctx.fillStyle = '#ffffff';
        ctx.font = '600 11px -apple-system, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`${probe.temperatureC.toFixed(1)}°C`, px, Math.max(14, py - 10));
      }
    }
  }
}
