import type {
  CarnotPVCurveSamples,
  CarnotTelemetry,
} from '../../physics/thermo/carnotCycle.ts';
import { bindVisionSlider, isSliderActive } from './sliderGestureHelper.ts';

export interface CarnotStatusCardCallbacks {
  onHotTempChange?: (tempC: number) => void;
  onColdTempChange?: (tempC: number) => void;
  onReset?: () => void;
}

export class CarnotStatusCard {
  public element: HTMLElement;
  private callbacks: CarnotStatusCardCallbacks;
  private isVisible = false;
  private activeSliders = new Set<string>();

  private valHotEl: HTMLElement | null = null;
  private valColdEl: HTMLElement | null = null;
  private valEffEl: HTMLElement | null = null;
  private valWorkEl: HTMLElement | null = null;
  private valStateEl: HTMLElement | null = null;

  private sliderHot: HTMLInputElement | null = null;
  private sliderCold: HTMLInputElement | null = null;
  private btnReset: HTMLButtonElement | null = null;

  private stageItems: HTMLElement[] = [];
  private pvCanvas: HTMLCanvasElement | null = null;

  constructor(callbacks: CarnotStatusCardCallbacks = {}) {
    this.callbacks = callbacks;
    this.element = document.createElement('div');
    this.element.className = 'vision-thermo-status-card hud-interactive';
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
        .vision-thermo-status-card {
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

        .apple-physics-layout {
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

        .apple-physics-panel {
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          gap: 14px;
        }

        .apple-physics-group {
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-top: 1px solid rgba(255, 255, 255, 0.2);
          border-radius: 20px;
          overflow: hidden;
          box-shadow: 0 12px 32px rgba(0, 0, 0, 0.25);
        }

        .apple-physics-row {
          padding: 16px 20px;
          display: flex;
          flex-direction: column;
          gap: 6px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.06);
        }

        .apple-physics-row:last-child {
          border-bottom: none;
        }

        .apple-physics-row-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .apple-physics-label {
          font-size: 14px;
          font-weight: 500;
          color: rgba(255, 255, 255, 0.68);
          letter-spacing: -0.15px;
        }

        .apple-physics-readout {
          font-size: 15px;
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
          margin: 8px 0 3px 0;
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

        .apple-btn-secondary {
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

        .apple-btn-secondary:hover {
          background: rgba(255, 255, 255, 0.12);
          border-color: rgba(255, 255, 255, 0.18);
          border-top-color: rgba(255, 255, 255, 0.32);
          transform: translate3d(0, -1px, 0) scale(1.015);
        }

        .apple-btn-secondary:active {
          transform: translate3d(0, 0, 0) scale(0.96);
          transition: transform 0.10s cubic-bezier(0.2, 0, 0, 1);
        }

        .apple-charts-grid {
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          gap: 16px;
        }

        .apple-chart-card {
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

        .apple-chart-title {
          font-size: 14px;
          font-weight: 600;
          color: rgba(255, 255, 255, 0.85);
          letter-spacing: -0.1px;
        }

        .apple-stages-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 10px;
        }

        .apple-stage-pill {
          height: 48px;
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 14px;
          padding: 0 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          transition: background 0.22s ease, border-color 0.22s ease, box-shadow 0.22s ease, transform 0.22s ease;
        }

        .apple-stage-pill.active {
          background: rgba(255, 255, 255, 0.14);
          border-color: rgba(255, 255, 255, 0.3);
          box-shadow: 0 4px 16px rgba(0, 0, 0, 0.25);
        }

        .apple-stage-dot {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: rgba(255, 255, 255, 0.18);
          flex-shrink: 0;
          transition: background 0.2s ease, box-shadow 0.2s ease;
        }

        .apple-stage-pill.active .apple-stage-dot {
          background: #0a84ff;
          box-shadow: 0 0 8px rgba(10, 132, 255, 0.85);
        }

        .apple-stage-name {
          font-size: 14px;
          font-weight: 600;
          color: rgba(255, 255, 255, 0.65);
          white-space: nowrap;
          letter-spacing: -0.1px;
        }

        .apple-stage-pill.active .apple-stage-name {
          color: #ffffff;
        }

        .apple-chart-canvas {
          width: 100%;
          height: auto;
          max-height: 235px;
          border-radius: 8px;
          display: block;
        }
      </style>

      <div class="apple-physics-layout">
        <!-- 1. 左侧：参数调节与状态卡片 -->
        <div class="apple-physics-panel">
          <div class="apple-physics-group">
            <!-- 高温热源 T_h -->
            <div class="apple-physics-row">
              <div class="apple-physics-row-header">
                <span class="apple-physics-label">高温热源 T_h</span>
                <span id="carnot-val-hot" class="apple-physics-readout">80.0 °C</span>
              </div>
              <input type="range" class="apple-physics-slider" id="carnot-slider-hot" min="50" max="150" step="1" value="80" />
              <div class="apple-physics-scale">
                <span>50 °C</span>
                <span>150 °C</span>
              </div>
            </div>

            <!-- 低温冷源 T_c -->
            <div class="apple-physics-row">
              <div class="apple-physics-row-header">
                <span class="apple-physics-label">低温冷源 T_c</span>
                <span id="carnot-val-cold" class="apple-physics-readout">20.0 °C</span>
              </div>
              <input type="range" class="apple-physics-slider" id="carnot-slider-cold" min="0" max="40" step="1" value="20" />
              <div class="apple-physics-scale">
                <span>0 °C</span>
                <span>40 °C</span>
              </div>
            </div>

            <!-- 卡诺效率 η -->
            <div class="apple-physics-row">
              <div class="apple-physics-row-header">
                <span class="apple-physics-label">卡诺效率 η</span>
                <span id="carnot-val-eff" class="apple-physics-readout">17.0%</span>
              </div>
            </div>

            <!-- 循环净功 W -->
            <div class="apple-physics-row">
              <div class="apple-physics-row-header">
                <span class="apple-physics-label">循环净功 W</span>
                <span id="carnot-val-work" class="apple-physics-readout">23.4 J</span>
              </div>
            </div>

            <!-- 气缸工质状态 -->
            <div class="apple-physics-row">
              <div class="apple-physics-row-header">
                <span class="apple-physics-label">气缸状态</span>
                <span id="carnot-pv-readout" class="apple-physics-readout">0.28 MPa · 1.00 L</span>
              </div>
            </div>
          </div>

          <button class="apple-btn-secondary" id="carnot-btn-reset" type="button">
            <span>重置</span>
          </button>
        </div>

        <!-- 2. 右侧：卡诺循环的四个过程 + 卡诺循环的 P-V 图 -->
        <div class="apple-charts-grid">
          <!-- 卡诺循环的四个过程 -->
          <div class="apple-chart-card">
            <span class="apple-chart-title">卡诺循环的四个过程</span>
            <div class="apple-stages-grid">
              <div class="apple-stage-pill active" data-stage-card="1">
                <span class="apple-stage-dot"></span>
                <span class="apple-stage-name">等温膨胀</span>
              </div>

              <div class="apple-stage-pill" data-stage-card="2">
                <span class="apple-stage-dot"></span>
                <span class="apple-stage-name">绝热膨胀</span>
              </div>

              <div class="apple-stage-pill" data-stage-card="3">
                <span class="apple-stage-dot"></span>
                <span class="apple-stage-name">等温压缩</span>
              </div>

              <div class="apple-stage-pill" data-stage-card="4">
                <span class="apple-stage-dot"></span>
                <span class="apple-stage-name">绝热压缩</span>
              </div>
            </div>
          </div>

          <!-- 卡诺循环的 P-V 图 -->
          <div class="apple-chart-card" style="flex: 1; justify-content: space-between;">
            <span class="apple-chart-title">卡诺循环的 P-V 图</span>
            <canvas id="carnot-pv-canvas" class="apple-chart-canvas" width="540" height="245"></canvas>
          </div>
        </div>
      </div>
    `;

    this.valHotEl = this.element.querySelector('#carnot-val-hot');
    this.valColdEl = this.element.querySelector('#carnot-val-cold');
    this.valEffEl = this.element.querySelector('#carnot-val-eff');
    this.valWorkEl = this.element.querySelector('#carnot-val-work');
    this.valStateEl = this.element.querySelector('#carnot-pv-readout');

    this.sliderHot = this.element.querySelector('#carnot-slider-hot');
    this.sliderCold = this.element.querySelector('#carnot-slider-cold');
    this.btnReset = this.element.querySelector('#carnot-btn-reset');
    this.pvCanvas = this.element.querySelector('#carnot-pv-canvas');

    this.stageItems = [
      this.element.querySelector('[data-stage-card="1"]') as HTMLElement,
      this.element.querySelector('[data-stage-card="2"]') as HTMLElement,
      this.element.querySelector('[data-stage-card="3"]') as HTMLElement,
      this.element.querySelector('[data-stage-card="4"]') as HTMLElement,
    ].filter(Boolean);

    this.updateSliderTrackFill(this.sliderHot, 50, 150, 80);
    this.updateSliderTrackFill(this.sliderCold, 0, 40, 20);
  }

  private bindEvents(): void {
    bindVisionSlider(this.sliderHot, {
      activeSet: this.activeSliders,
      onChange: (val: number) => {
        this.updateSliderTrackFill(this.sliderHot, 50, 150, val);
        if (this.valHotEl) {
          this.valHotEl.textContent = `${val.toFixed(1)} °C`;
        }
        this.callbacks.onHotTempChange?.(val);
      },
      onScrub: (val: number) => {
        this.updateSliderTrackFill(this.sliderHot, 50, 150, val);
        if (this.valHotEl) {
          this.valHotEl.textContent = `${val.toFixed(1)} °C`;
        }
      },
    });

    bindVisionSlider(this.sliderCold, {
      activeSet: this.activeSliders,
      onChange: (val: number) => {
        this.updateSliderTrackFill(this.sliderCold, 0, 40, val);
        if (this.valColdEl) {
          this.valColdEl.textContent = `${val.toFixed(1)} °C`;
        }
        this.callbacks.onColdTempChange?.(val);
      },
      onScrub: (val: number) => {
        this.updateSliderTrackFill(this.sliderCold, 0, 40, val);
        if (this.valColdEl) {
          this.valColdEl.textContent = `${val.toFixed(1)} °C`;
        }
      },
    });

    this.btnReset?.addEventListener('click', () => {
      this.callbacks.onReset?.();
    });
  }

  public updateTelemetry(
    telemetry: CarnotTelemetry,
    pvCurves?: CarnotPVCurveSamples
  ): void {
    if (!telemetry) return;

    if (this.valEffEl) {
      this.valEffEl.textContent = `${telemetry.efficiencyPercent.toFixed(1)}%`;
    }
    if (this.valWorkEl) {
      this.valWorkEl.textContent = `${telemetry.netWorkJ.toFixed(1)} J`;
    }
    if (this.valStateEl) {
      this.valStateEl.textContent = `${telemetry.pressureMPa.toFixed(2)} MPa · ${telemetry.volumeL.toFixed(2)} L`;
    }

    this.stageItems.forEach((item, idx) => {
      item.classList.toggle('active', telemetry.stageId === idx + 1);
    });

    if (!isSliderActive(this.sliderHot, this.activeSliders) && this.sliderHot) {
      this.sliderHot.value = String(telemetry.hotTempC);
      this.updateSliderTrackFill(this.sliderHot, 50, 150, telemetry.hotTempC);
      if (this.valHotEl) {
        this.valHotEl.textContent = `${telemetry.hotTempC.toFixed(1)} °C`;
      }
    }

    if (!isSliderActive(this.sliderCold, this.activeSliders) && this.sliderCold) {
      this.sliderCold.value = String(telemetry.coldTempC);
      this.updateSliderTrackFill(this.sliderCold, 0, 40, telemetry.coldTempC);
      if (this.valColdEl) {
        this.valColdEl.textContent = `${telemetry.coldTempC.toFixed(1)} °C`;
      }
    }

    if (pvCurves && this.pvCanvas) {
      this.drawPVDiagram(telemetry, pvCurves);
    }
  }

  private drawPVDiagram(
    telemetry: CarnotTelemetry,
    pvCurves: CarnotPVCurveSamples
  ): void {
    const canvas = this.pvCanvas;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx || typeof ctx.clearRect !== 'function') return;

    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const padL = 46;
    const padR = 18;
    const padT = 14;
    const padB = 26;
    const plotW = w - padL - padR;
    const plotH = h - padT - padB;

    const vMin = 0.78;
    const vMax = 3.35;
    const pMin = 0.04;
    const pMax = 0.36;

    const mapX = (v: number) =>
      padL + Math.max(0, Math.min(1, (v - vMin) / (vMax - vMin))) * plotW;
    const mapY = (p: number) =>
      padT + plotH - Math.max(0, Math.min(1, (p - pMin) / (pMax - pMin))) * plotH;

    // 极简暗色玻璃水平/垂直参考网格线
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
    ctx.lineWidth = 1;
    const pTicks = [0.1, 0.2, 0.3];
    for (const p of pTicks) {
      const y = mapY(p);
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(w - padR, y);
      ctx.stroke();

      if (typeof ctx.fillText === 'function') {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
        ctx.font = '10px -apple-system, sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(`${p.toFixed(1)}`, padL - 6, y + 3);
      }
    }

    const vTicks = [1.0, 1.5, 2.0, 2.5, 3.0];
    for (const v of vTicks) {
      const x = mapX(v);
      ctx.beginPath();
      ctx.moveTo(x, padT);
      ctx.lineTo(x, padT + plotH);
      ctx.stroke();

      if (typeof ctx.fillText === 'function') {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
        ctx.font = '10px -apple-system, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`${v.toFixed(1)}L`, x, h - 7);
      }
    }

    // 坐标轴
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(padL, padT);
    ctx.lineTo(padL, padT + plotH);
    ctx.lineTo(w - padR, padT + plotH);
    ctx.stroke();

    if (typeof ctx.fillText === 'function') {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.42)';
      ctx.font = '10px -apple-system, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('P (MPa)', 4, padT + 8);
    }

    // 闭合循环净功阴影面积
    const allLoopPts = [
      ...pvCurves.curve12,
      ...pvCurves.curve23.slice(1),
      ...pvCurves.curve34.slice(1),
      ...pvCurves.curve41.slice(1),
    ];
    if (allLoopPts.length > 2) {
      ctx.beginPath();
      allLoopPts.forEach((pt, idx) => {
        const x = mapX(pt.volumeL);
        const y = mapY(pt.pressureMPa);
        if (idx === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.closePath();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.fill();
    }

    // 四段过程曲线（纯白明暗层次，当前阶段高亮）
    const drawSegment = (
      pts: { volumeL: number; pressureMPa: number }[],
      baseAlpha: number,
      isCurrent: boolean
    ) => {
      if (pts.length < 2) return;
      ctx.beginPath();
      pts.forEach((pt, idx) => {
        const x = mapX(pt.volumeL);
        const y = mapY(pt.pressureMPa);
        if (idx === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.strokeStyle = isCurrent
        ? '#ffffff'
        : `rgba(255, 255, 255, ${baseAlpha})`;
      ctx.lineWidth = isCurrent ? 2.6 : 1.7;
      ctx.stroke();
    };

    drawSegment(pvCurves.curve12, 0.85, telemetry.stageId === 1);
    drawSegment(pvCurves.curve23, 0.62, telemetry.stageId === 2);
    drawSegment(pvCurves.curve34, 0.45, telemetry.stageId === 3);
    drawSegment(pvCurves.curve41, 0.62, telemetry.stageId === 4);

    // 状态顶点 1, 2, 3, 4
    const { state1, state2, state3, state4 } = telemetry.vertices;
    const vNodes = [
      { label: '1', pt: state1, dx: -9, dy: -5 },
      { label: '2', pt: state2, dx: 9, dy: -5 },
      { label: '3', pt: state3, dx: 9, dy: 4 },
      { label: '4', pt: state4, dx: -9, dy: 11 },
    ];

    vNodes.forEach((node) => {
      const vx = mapX(node.pt.volumeL);
      const vy = mapY(node.pt.pressureMPa);
      if (typeof ctx.arc === 'function') {
        ctx.beginPath();
        ctx.arc(vx, vy, 2.8, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.78)';
        ctx.fill();
      }
      if (typeof ctx.fillText === 'function') {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.72)';
        ctx.font = '600 11px -apple-system, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(node.label, vx + node.dx, vy + node.dy);
      }
    });

    // 当前实时工作点（Apple 系统蓝光晕 + 纯白核心）
    const curX = mapX(telemetry.volumeL);
    const curY = mapY(telemetry.pressureMPa);
    if (typeof ctx.arc === 'function') {
      ctx.beginPath();
      ctx.arc(curX, curY, 8, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(10, 132, 255, 0.4)';
      ctx.fill();

      ctx.beginPath();
      ctx.arc(curX, curY, 4, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
    }
  }
}
