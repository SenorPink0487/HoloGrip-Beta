import { bindVisionSlider, isSliderActive } from './sliderGestureHelper.ts';

export interface ThermoTelemetryData {
  temperature: number; // 开尔文 (K)
  volume: number;      // 升 (L)
  pressure: number;    // 千帕 (kPa)
  moles: number;       // 物质的量 (mol)
  molarMassKg: number; // 摩尔质量 (kg/mol)
  vRms: number;        // 均方根速率 (m/s)
  vMp: number;         // 最概然速率 (m/s)
  vMean: number;       // 平均速率 (m/s)
  speedBins: number[];
  maxSpeed: number;
}

export interface ThermoStatusCardCallbacks {
  onTemperatureChange?: (tempK: number) => void;
  onVolumeChange?: (volL: number) => void;
  onGasTypeChange?: (gasType: string) => void;
}

export class ThermoStatusCard {
  public element: HTMLElement;
  private canvasMaxwell: HTMLCanvasElement;
  private canvasPV: HTMLCanvasElement;
  private callbacks: ThermoStatusCardCallbacks;

  private currentData: ThermoTelemetryData = {
    temperature: 300,
    volume: 2.5,
    pressure: 99.77,
    moles: 0.10,
    molarMassKg: 0.028,
    vRms: 516.9,
    vMp: 422.0,
    vMean: 476.2,
    speedBins: new Array(20).fill(15),
    maxSpeed: 1400,
  };

  private isVisible = false;
  private animFrameId: number | null = null;
  private lastTelemetryTime = 0;
  private lastMaxwellDraw = 0;
  private lastRenderedVol = -1;
  private lastRenderedTemp = -1;
  private lastRenderedPress = -1;

  // 缓存的 DOM 元素
  private valTempEl: HTMLElement | null = null;
  private valVolEl: HTMLElement | null = null;
  private valPressEl: HTMLElement | null = null;
  private valEnergyEl: HTMLElement | null = null;
  private sliderTempEl: HTMLInputElement | null = null;
  private sliderVolEl: HTMLInputElement | null = null;
  private activeSliders = new Set<string>();

  // 缓存的文本字符串，消除频繁重排
  private lastTempStr = '';
  private lastVolStr = '';
  private lastPressStr = '';
  private lastEnergyStr = '';

  constructor(callbacks: ThermoStatusCardCallbacks = {}) {
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
          grid-template-columns: 380px 1fr;
          gap: 20px;
          align-items: start;
          font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", "PingFang SC", "Helvetica Neue", sans-serif;
          user-select: none;
          -webkit-user-select: none;
        }

        .apple-physics-panel {
          display: flex;
          flex-direction: column;
          gap: 16px;
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
          padding: 14px 18px;
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
        <!-- 1. 左侧：苹果 Inset Grouped 参数与核心指标卡片 -->
        <div class="apple-physics-panel">
          <div class="apple-physics-group">
            <!-- 系统温度 T -->
            <div class="apple-physics-row">
              <div class="apple-physics-row-header">
                <span class="apple-physics-label">系统温度 T</span>
                <span id="val-temp" class="apple-physics-readout">300 K · 26.9 °C</span>
              </div>
              <input type="range" class="apple-physics-slider" id="slider-temp" min="100" max="800" step="5" value="300" />
              <div class="apple-physics-scale">
                <span>100 K</span>
                <span>800 K</span>
              </div>
            </div>

            <!-- 气缸容积 V -->
            <div class="apple-physics-row">
              <div class="apple-physics-row-header">
                <span class="apple-physics-label">气缸容积 V</span>
                <span id="val-vol" class="apple-physics-readout">2.50 L · 2500 cm³</span>
              </div>
              <input type="range" class="apple-physics-slider" id="slider-vol" min="1.0" max="5.0" step="0.1" value="2.5" />
              <div class="apple-physics-scale">
                <span>1.0 L</span>
                <span>5.0 L</span>
              </div>
            </div>

            <!-- 气体压强 P -->
            <div class="apple-physics-row">
              <div class="apple-physics-row-header">
                <span class="apple-physics-label">气体压强 P</span>
                <span id="val-press" class="apple-physics-readout">99.8 kPa · 0.98 atm</span>
              </div>
            </div>

            <!-- 气体总内能 U -->
            <div class="apple-physics-row">
              <div class="apple-physics-row-header">
                <span class="apple-physics-label">气体总内能 U (3/2 nRT)</span>
                <span id="val-energy" class="apple-physics-readout">374.1 J · 517 m/s</span>
              </div>
            </div>
          </div>
        </div>

        <!-- 2. 右侧：精简高对比分析图表 (去除杂乱色彩) -->
        <div class="apple-charts-grid">
          <div class="apple-chart-card">
            <span class="apple-chart-title">麦克斯韦-玻尔兹曼速率分布</span>
            <canvas id="canvas-maxwell" class="apple-chart-canvas" width="480" height="210"></canvas>
          </div>

          <div class="apple-chart-card">
            <span class="apple-chart-title">P-V 状态示功图与等温线</span>
            <canvas id="canvas-pv" class="apple-chart-canvas" width="480" height="210"></canvas>
          </div>
        </div>
      </div>
    `;

    this.canvasMaxwell = this.element.querySelector('#canvas-maxwell') as HTMLCanvasElement;
    this.canvasPV = this.element.querySelector('#canvas-pv') as HTMLCanvasElement;

    this.valTempEl = this.element.querySelector('#val-temp');
    this.valVolEl = this.element.querySelector('#val-vol');
    this.valPressEl = this.element.querySelector('#val-press');
    this.valEnergyEl = this.element.querySelector('#val-energy');
    this.sliderTempEl = this.element.querySelector('#slider-temp');
    this.sliderVolEl = this.element.querySelector('#slider-vol');

    this.updateSliderTrackFill(this.sliderTempEl, 100, 800, 300);
    this.updateSliderTrackFill(this.sliderVolEl, 1.0, 5.0, 2.5);

    this.bindControls();
  }

  private bindControls(): void {
    bindVisionSlider(this.sliderTempEl, {
      activeSet: this.activeSliders,
      onChange: (val) => {
        this.updateSliderTrackFill(this.sliderTempEl, 100, 800, val);
        this.callbacks.onTemperatureChange?.(val);
      },
      onScrub: (val) => {
        if (this.valTempEl) this.valTempEl.textContent = `${Math.round(val)} K · ${(val - 273.15).toFixed(1)} °C`;
        this.updateSliderTrackFill(this.sliderTempEl, 100, 800, val);
      },
    });

    bindVisionSlider(this.sliderVolEl, {
      activeSet: this.activeSliders,
      onChange: (val) => {
        this.updateSliderTrackFill(this.sliderVolEl, 1.0, 5.0, val);
        this.callbacks.onVolumeChange?.(val);
      },
      onScrub: (val) => {
        if (this.valVolEl) this.valVolEl.textContent = `${val.toFixed(2)} L · ${(val * 1000).toFixed(0)} cm³`;
        this.updateSliderTrackFill(this.sliderVolEl, 1.0, 5.0, val);
      },
    });
  }

  public updateTelemetry(data: Partial<ThermoTelemetryData>): void {
    const prevTemp = this.currentData.temperature;
    const prevVol = this.currentData.volume;
    const prevPress = this.currentData.pressure;
    this.currentData = { ...this.currentData, ...data };

    if (!this.isVisible) return;

    const now = performance.now();
    const hasSignificantChange =
      Math.abs(this.currentData.temperature - prevTemp) > 0.5 ||
      Math.abs(this.currentData.volume - prevVol) > 0.02 ||
      Math.abs(this.currentData.pressure - prevPress) > 0.5;

    const interval = hasSignificantChange ? 60 : 400;
    if (now - this.lastTelemetryTime >= interval || hasSignificantChange) {
      this.lastTelemetryTime = now;
      this.updateDOMText();
      this.drawCharts();
    }
  }

  private updateDOMText(): void {
    const d = this.currentData;

    const tempStr = `${Math.round(d.temperature)} K · ${(d.temperature - 273.15).toFixed(1)} °C`;
    if (this.lastTempStr !== tempStr && this.valTempEl) {
      this.valTempEl.textContent = tempStr;
      this.lastTempStr = tempStr;
    }

    const volStr = `${d.volume.toFixed(2)} L · ${(d.volume * 1000).toFixed(0)} cm³`;
    if (this.lastVolStr !== volStr && this.valVolEl) {
      this.valVolEl.textContent = volStr;
      this.lastVolStr = volStr;
    }

    const pressStr = `${d.pressure.toFixed(1)} kPa · ${(d.pressure / 101.325).toFixed(2)} atm`;
    if (this.lastPressStr !== pressStr && this.valPressEl) {
      this.valPressEl.textContent = pressStr;
      this.lastPressStr = pressStr;
    }

    const u = 1.5 * (d.moles || 0.1) * 8.314 * d.temperature;
    const energyStr = `${u.toFixed(1)} J · ${d.vRms.toFixed(0)} m/s`;
    if (this.lastEnergyStr !== energyStr && this.valEnergyEl) {
      this.valEnergyEl.textContent = energyStr;
      this.lastEnergyStr = energyStr;
    }

    if (this.sliderTempEl && !isSliderActive(this.sliderTempEl, this.activeSliders)) {
      this.sliderTempEl.value = String(Math.round(d.temperature));
      this.updateSliderTrackFill(this.sliderTempEl, 100, 800, d.temperature);
    }
    if (this.sliderVolEl && !isSliderActive(this.sliderVolEl, this.activeSliders)) {
      this.sliderVolEl.value = d.volume.toFixed(2);
      this.updateSliderTrackFill(this.sliderVolEl, 1.0, 5.0, d.volume);
    }
  }

  public setVisible(visible: boolean): void {
    this.isVisible = visible;
    this.element.style.display = visible ? 'flex' : 'none';
    if (visible) {
      this.updateDOMText();
      this.lastRenderedVol = -1;
      this.lastMaxwellDraw = 0;
      this.drawCharts();
    }
  }

  private drawCharts(): void {
    this.drawMaxwellChart();
    this.drawPVChart();
  }

  private drawMaxwellChart(): void {
    if (!this.canvasMaxwell) return;
    const now = performance.now();
    if (now - this.lastMaxwellDraw < 350) return;
    this.lastMaxwellDraw = now;

    const ctx = this.canvasMaxwell.getContext('2d');
    if (!ctx) return;

    const w = this.canvasMaxwell.width;
    const h = this.canvasMaxwell.height;
    ctx.clearRect(0, 0, w, h);

    const padLeft = 36;
    const padBottom = 24;
    const padTop = 14;
    const padRight = 14;
    const chartW = w - padLeft - padRight;
    const chartH = h - padTop - padBottom;

    // 网格线
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 3; i++) {
      const y = padTop + (i / 3) * chartH;
      ctx.beginPath();
      ctx.moveTo(padLeft, y);
      ctx.lineTo(padLeft + chartW, y);
      ctx.stroke();
    }

    const bins = this.currentData.speedBins || [];
    const maxBin = Math.max(...bins, 10);
    const barWidth = chartW / (bins.length || 1);

    // 统一苹果系统蓝直方图
    for (let i = 0; i < bins.length; i++) {
      const barH = (bins[i] / maxBin) * chartH * 0.9;
      const bx = padLeft + i * barWidth;
      const by = padTop + chartH - barH;

      ctx.fillStyle = 'rgba(10, 132, 255, 0.35)';
      ctx.fillRect(bx + 1, by, barWidth - 2, barH);
      ctx.strokeStyle = 'rgba(10, 132, 255, 0.7)';
      ctx.strokeRect(bx + 1, by, barWidth - 2, barH);
    }

    // 纯白理论分布曲线
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2.0;
    ctx.beginPath();

    const R = 8.314;
    const T = Math.max(100, this.currentData.temperature);
    const M = this.currentData.molarMassKg || 0.028;
    const factor = 4 * Math.PI * Math.pow(M / (2 * Math.PI * R * T), 1.5);
    const maxSpeed = this.currentData.maxSpeed || 1500;

    let maxTheory = 0;
    const points: { x: number; y: number }[] = [];
    const steps = 50;

    for (let s = 0; s <= steps; s++) {
      const v = (s / steps) * maxSpeed;
      const fv = factor * (v * v) * Math.exp((-M * v * v) / (2 * R * T));
      if (fv > maxTheory) maxTheory = fv;
      points.push({ x: v, y: fv });
    }

    for (let s = 0; s <= steps; s++) {
      const pt = points[s];
      const px = padLeft + (pt.x / maxSpeed) * chartW;
      const py = padTop + chartH - (pt.y / (maxTheory || 1)) * chartH * 0.9;
      if (s === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();

    // 坐标轴标签
    ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.font = '10px -apple-system, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText('v (m/s)', w - 8, h - 6);
    ctx.fillText('0', padLeft, h - 6);
    ctx.fillText(`${maxSpeed.toFixed(0)}`, padLeft + chartW, h - 6);
  }

  private drawPVChart(): void {
    if (!this.canvasPV) return;
    const curVol = this.currentData.volume;
    const curPress = this.currentData.pressure;
    const curTemp = this.currentData.temperature;

    if (
      Math.abs(curVol - this.lastRenderedVol) < 0.005 &&
      Math.abs(curTemp - this.lastRenderedTemp) < 0.2 &&
      Math.abs(curPress - this.lastRenderedPress) < 0.1
    ) {
      return;
    }
    this.lastRenderedVol = curVol;
    this.lastRenderedTemp = curTemp;
    this.lastRenderedPress = curPress;

    const ctx = this.canvasPV.getContext('2d');
    if (!ctx) return;

    const w = this.canvasPV.width;
    const h = this.canvasPV.height;
    ctx.clearRect(0, 0, w, h);

    const padLeft = 40;
    const padBottom = 24;
    const padTop = 14;
    const padRight = 14;
    const chartW = w - padLeft - padRight;
    const chartH = h - padTop - padBottom;

    // 坐标轴
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padLeft, padTop);
    ctx.lineTo(padLeft, padTop + chartH);
    ctx.lineTo(padLeft + chartW, padTop + chartH);
    ctx.stroke();

    ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.font = '10px -apple-system, sans-serif';
    ctx.fillText('P(kPa)', padLeft - 2, padTop - 4);
    ctx.fillText('V(L)', padLeft + chartW - 10, padTop + chartH + 18);

    // 简约白色/浅灰阶等温线
    const isotherms = [
      { T: 200, color: 'rgba(255, 255, 255, 0.25)' },
      { T: 400, color: 'rgba(255, 255, 255, 0.45)' },
      { T: 600, color: 'rgba(255, 255, 255, 0.70)' },
    ];
    const moles = this.currentData.moles || 0.10;

    for (const iso of isotherms) {
      ctx.strokeStyle = iso.color;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      for (let s = 0; s <= 30; s++) {
        const v = 0.8 + (s / 30) * 4.4;
        const p = (moles * 8.314 * iso.T) / v;
        const px = padLeft + ((v - 0.8) / 4.4) * chartW;
        const py = padTop + chartH - (p / 400) * chartH;
        if (s === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
    }

    // 当前工作状态点（经典系统蓝）
    const curX = padLeft + ((curVol - 0.8) / 4.4) * chartW;
    const curY = padTop + chartH - (curPress / 400) * chartH;

    ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.beginPath();
    ctx.arc(curX, curY, 8, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(curX, curY, 4, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.font = '600 11px -apple-system, sans-serif';
    ctx.fillText(`(${curVol.toFixed(1)}L, ${curPress.toFixed(0)}kPa)`, curX + 7, curY - 4);
  }

  public dispose(): void {
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
  }
}
