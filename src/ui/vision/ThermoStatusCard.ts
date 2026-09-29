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
  private lastDrawTime = 0;
  private lastTelemetryTime = 0;
  private lastMaxwellDraw = 0;
  private lastRenderedVol = -1;
  private lastRenderedTemp = -1;
  private lastRenderedPress = -1;

  // 缓存的 DOM 元素
  private valTempEl: HTMLElement | null = null;
  private subTempEl: HTMLElement | null = null;
  private valVolEl: HTMLElement | null = null;
  private subVolEl: HTMLElement | null = null;
  private valPressEl: HTMLElement | null = null;
  private subPressEl: HTMLElement | null = null;
  private barPressFillEl: HTMLElement | null = null;
  private valEnergyEl: HTMLElement | null = null;
  private subVrmsEl: HTMLElement | null = null;
  private sliderTempEl: HTMLInputElement | null = null;
  private sliderVolEl: HTMLInputElement | null = null;
  private activeSliders = new Set<string>();

  // 缓存的文本字符串，消除频繁重排
  private lastTempStr = '';
  private lastSubTempStr = '';
  private lastVolStr = '';
  private lastSubVolStr = '';
  private lastPressStr = '';
  private lastSubPressStr = '';
  private lastBarWidthStr = '';
  private lastEnergyStr = '';
  private lastVrmsStr = '';

  constructor(callbacks: ThermoStatusCardCallbacks = {}) {
    this.callbacks = callbacks;
    this.createUI();
  }

  private createUI(): void {
    this.element = document.createElement('div');
    this.element.className = 'vision-thermo-status-card hud-interactive';

    this.element.innerHTML = `
      <div class="thermo-card-container">
        <!-- 1. Top Metrics Grid -->
        <div class="thermo-metrics-deck">
          <div class="thermo-metric-card" id="card-temp">
            <span class="thermo-metric-label">系统温度 T</span>
            <div class="thermo-metric-value" id="val-temp" style="color: #00f5ff;">300 K</div>
            <span class="thermo-metric-sub" id="sub-temp">26.9 °C</span>
            <input type="range" class="thermo-mini-slider" id="slider-temp" min="100" max="800" step="5" value="300" />
          </div>

          <div class="thermo-metric-card" id="card-vol">
            <span class="thermo-metric-label">气缸容积 V</span>
            <div class="thermo-metric-value" id="val-vol" style="color: #38bdf8;">2.50 L</div>
            <span class="thermo-metric-sub" id="sub-vol">2500 cm³</span>
            <input type="range" class="thermo-mini-slider" id="slider-vol" min="1.0" max="5.0" step="0.1" value="2.5" />
          </div>

          <div class="thermo-metric-card" id="card-press">
            <span class="thermo-metric-label">气体压强 P</span>
            <div class="thermo-metric-value" id="val-press" style="color: #f59e0b;">99.8 kPa</div>
            <span class="thermo-metric-sub" id="sub-press">0.98 atm</span>
            <div class="thermo-gauge-bar"><div class="thermo-gauge-fill" id="bar-press-fill" style="width: 25%;"></div></div>
          </div>

          <div class="thermo-metric-card" id="card-energy">
            <span class="thermo-metric-label">气体总内能 U</span>
            <div class="thermo-metric-value" id="val-energy" style="color: #a855f7;">374.1 J</div>
            <span class="thermo-metric-sub" id="sub-vrms">v_rms: 517 m/s</span>
            <div class="thermo-metric-caption">U = 3/2 nRT</div>
          </div>
        </div>

        <!-- 2. Dual Analytics Charts Deck -->
        <div class="thermo-charts-deck">
          <!-- Left: Maxwell-Boltzmann Distribution -->
          <div class="thermo-chart-box">
            <div class="thermo-chart-header">
              <span class="thermo-chart-title">麦克斯韦-玻尔兹曼速率分布</span>
              <div class="thermo-chart-legend">
                <span class="legend-dot dot-freq"></span><span>频数直方图</span>
                <span class="legend-line line-theory"></span><span>理论曲线</span>
              </div>
            </div>
            <div class="thermo-canvas-wrap">
              <canvas id="canvas-maxwell" width="480" height="260"></canvas>
            </div>
          </div>

          <!-- Right: PV Indicator Diagram -->
          <div class="thermo-chart-box">
            <div class="thermo-chart-header">
              <span class="thermo-chart-title">P-V 状态示功图与等温线</span>
              <div class="thermo-chart-legend">
                <span class="legend-line line-t200"></span><span>200K</span>
                <span class="legend-line line-t400"></span><span>400K</span>
                <span class="legend-line line-t600"></span><span>600K</span>
              </div>
            </div>
            <div class="thermo-canvas-wrap">
              <canvas id="canvas-pv" width="480" height="260"></canvas>
            </div>
          </div>
        </div>
      </div>
    `;

    this.canvasMaxwell = this.element.querySelector('#canvas-maxwell') as HTMLCanvasElement;
    this.canvasPV = this.element.querySelector('#canvas-pv') as HTMLCanvasElement;

    // 缓存 DOM 引用
    this.valTempEl = this.element.querySelector('#val-temp');
    this.subTempEl = this.element.querySelector('#sub-temp');
    this.valVolEl = this.element.querySelector('#val-vol');
    this.subVolEl = this.element.querySelector('#sub-vol');
    this.valPressEl = this.element.querySelector('#val-press');
    this.subPressEl = this.element.querySelector('#sub-press');
    this.barPressFillEl = this.element.querySelector('#bar-press-fill');
    this.valEnergyEl = this.element.querySelector('#val-energy');
    this.subVrmsEl = this.element.querySelector('#sub-vrms');
    this.sliderTempEl = this.element.querySelector('#slider-temp');
    this.sliderVolEl = this.element.querySelector('#slider-vol');

    this.bindControls();
  }

  private bindControls(): void {
    bindVisionSlider(this.sliderTempEl, {
      activeSet: this.activeSliders,
      onChange: (val) => this.callbacks.onTemperatureChange?.(val),
      onScrub: (val) => {
        if (this.valTempEl) this.valTempEl.textContent = `${Math.round(val)} K`;
        if (this.subTempEl) this.subTempEl.textContent = `${(val - 273.15).toFixed(1)} °C`;
      },
    });

    bindVisionSlider(this.sliderVolEl, {
      activeSet: this.activeSliders,
      onChange: (val) => this.callbacks.onVolumeChange?.(val),
      onScrub: (val) => {
        if (this.valVolEl) this.valVolEl.textContent = `${val.toFixed(2)} L`;
        if (this.subVolEl) this.subVolEl.textContent = `${(val * 1000).toFixed(0)} cm³`;
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

    // 节流 DOM 文本与 Canvas 重绘：用户变更时立即响应，稳态时 400ms
    const interval = hasSignificantChange ? 60 : 400;
    if (now - this.lastTelemetryTime >= interval || hasSignificantChange) {
      this.lastTelemetryTime = now;
      this.updateDOMText();
      this.drawCharts();
    }
  }

  private updateDOMText(): void {
    const d = this.currentData;

    const tempStr = `${Math.round(d.temperature)} K`;
    if (this.lastTempStr !== tempStr && this.valTempEl) {
      this.valTempEl.textContent = tempStr;
      this.lastTempStr = tempStr;
    }

    const subTempStr = `${(d.temperature - 273.15).toFixed(1)} °C`;
    if (this.lastSubTempStr !== subTempStr && this.subTempEl) {
      this.subTempEl.textContent = subTempStr;
      this.lastSubTempStr = subTempStr;
    }

    const volStr = `${d.volume.toFixed(2)} L`;
    if (this.lastVolStr !== volStr && this.valVolEl) {
      this.valVolEl.textContent = volStr;
      this.lastVolStr = volStr;
    }

    const subVolStr = `${(d.volume * 1000).toFixed(0)} cm³`;
    if (this.lastSubVolStr !== subVolStr && this.subVolEl) {
      this.subVolEl.textContent = subVolStr;
      this.lastSubVolStr = subVolStr;
    }

    const pressStr = `${d.pressure.toFixed(1)} kPa`;
    if (this.lastPressStr !== pressStr && this.valPressEl) {
      this.valPressEl.textContent = pressStr;
      this.lastPressStr = pressStr;
    }

    const subPressStr = `${(d.pressure / 101.325).toFixed(2)} atm`;
    if (this.lastSubPressStr !== subPressStr && this.subPressEl) {
      this.subPressEl.textContent = subPressStr;
      this.lastSubPressStr = subPressStr;
    }

    const pct = Math.min(100, Math.max(0, (d.pressure / 400) * 100));
    const barWidthStr = `${pct.toFixed(0)}%`;
    if (this.lastBarWidthStr !== barWidthStr && this.barPressFillEl) {
      this.barPressFillEl.style.width = barWidthStr;
      this.lastBarWidthStr = barWidthStr;
    }

    const u = 1.5 * d.moles * 8.314 * d.temperature;
    const energyStr = `${u.toFixed(1)} J`;
    if (this.lastEnergyStr !== energyStr && this.valEnergyEl) {
      this.valEnergyEl.textContent = energyStr;
      this.lastEnergyStr = energyStr;
    }

    const vrmsStr = `v_rms: ${d.vRms.toFixed(0)} m/s`;
    if (this.lastVrmsStr !== vrmsStr && this.subVrmsEl) {
      this.subVrmsEl.textContent = vrmsStr;
      this.lastVrmsStr = vrmsStr;
    }

    // 若滑块当前未处于活跃/聚焦状态，则同步其数值
    if (this.sliderTempEl && !isSliderActive(this.sliderTempEl, this.activeSliders)) {
      this.sliderTempEl.value = String(Math.round(d.temperature));
    }
    if (this.sliderVolEl && !isSliderActive(this.sliderVolEl, this.activeSliders)) {
      this.sliderVolEl.value = d.volume.toFixed(2);
    }
  }

  public setVisible(visible: boolean): void {
    this.isVisible = visible;
    if (visible) {
      this.updateDOMText();
      // 变为可见时强制重绘图表
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
    const padBottom = 28;
    const padTop = 16;
    const padRight = 16;
    const chartW = w - padLeft - padRight;
    const chartH = h - padTop - padBottom;

    // 网格线
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
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

    // 直方图柱条
    for (let i = 0; i < bins.length; i++) {
      const barH = (bins[i] / maxBin) * chartH * 0.9;
      const bx = padLeft + i * barWidth;
      const by = padTop + chartH - barH;

      ctx.fillStyle = 'rgba(14, 165, 233, 0.45)';
      ctx.fillRect(bx + 1, by, barWidth - 2, barH);
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.8)';
      ctx.strokeRect(bx + 1, by, barWidth - 2, barH);
    }

    // 麦克斯韦-玻尔兹曼理论分布曲线
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 2.5;
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
    ctx.fillStyle = '#64748b';
    ctx.font = '11px monospace';
    ctx.textAlign = 'right';
    ctx.fillText('v (m/s)', w - 8, h - 8);
    ctx.fillText('0', padLeft, h - 8);
    ctx.fillText(`${maxSpeed.toFixed(0)}`, padLeft + chartW, h - 8);
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
      return; // 若热力学状态点静止则跳过重绘
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
    const padBottom = 28;
    const padTop = 16;
    const padRight = 16;
    const chartW = w - padLeft - padRight;
    const chartH = h - padTop - padBottom;

    // 坐标轴
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(padLeft, padTop);
    ctx.lineTo(padLeft, padTop + chartH);
    ctx.lineTo(padLeft + chartW, padTop + chartH);
    ctx.stroke();

    ctx.fillStyle = '#64748b';
    ctx.font = '11px monospace';
    ctx.fillText('P(kPa)', padLeft - 2, padTop - 4);
    ctx.fillText('V(L)', padLeft + chartW - 10, padTop + chartH + 20);

    // 等温线
    const isotherms = [
      { T: 200, color: 'rgba(56, 189, 248, 0.6)' },
      { T: 400, color: 'rgba(34, 197, 94, 0.6)' },
      { T: 600, color: 'rgba(239, 68, 68, 0.6)' },
    ];
    const moles = this.currentData.moles || 0.10;

    for (const iso of isotherms) {
      ctx.strokeStyle = iso.color;
      ctx.lineWidth = 1.4;
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

    // 当前工作状态点
    const curX = padLeft + ((curVol - 0.8) / 4.4) * chartW;
    const curY = padTop + chartH - (curPress / 400) * chartH;

    // 发光光晕
    ctx.fillStyle = 'rgba(255, 59, 48, 0.35)';
    ctx.beginPath();
    ctx.arc(curX, curY, 9, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#ff3b30';
    ctx.beginPath();
    ctx.arc(curX, curY, 4.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 12px monospace';
    ctx.fillText(`(${curVol.toFixed(1)}L, ${curPress.toFixed(0)}kPa)`, curX + 8, curY - 5);
  }

  public dispose(): void {
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
  }
}
