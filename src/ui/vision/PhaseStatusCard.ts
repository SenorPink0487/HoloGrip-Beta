import { bindVisionSlider, isSliderActive } from './sliderGestureHelper.ts';

export interface PhaseTelemetryData {
  temperatureK: number;
  temperatureC: number;
  heatPowerW: number;
  substanceMassG: number;
  totalEnergyKj: number;
  timeElapsedS: number;
  iceFraction: number;
  waterFraction: number;
  vaporFraction: number;
  entropyJPerK: number;
  currentPhaseStage: 'subzero_ice' | 'melting_plateau' | 'liquid_water' | 'boiling_plateau' | 'superheated_steam';
  phaseStageName: string;
  isBoiling: boolean;
  isHeating: boolean;
  timePoints: number[];
  tempPoints: number[];
}

export interface PhaseStatusCardCallbacks {
  onHeatPowerChange?: (powerW: number) => void;
  onMassChange?: (massG: number) => void;
  onToggleHeating?: () => void;
  onResetExperiment?: () => void;
  onTimeAccelerationChange?: (scale: number) => void;
}

export class PhaseStatusCard {
  public element: HTMLElement;
  private canvasTT: HTMLCanvasElement;
  private canvasFractions: HTMLCanvasElement;
  private callbacks: PhaseStatusCardCallbacks;

  private isVisible = false;
  private currentData: PhaseTelemetryData = {
    temperatureK: 273.15,
    temperatureC: 0.0,
    heatPowerW: 800,
    substanceMassG: 150,
    totalEnergyKj: 32.4,
    timeElapsedS: 40.5,
    iceFraction: 0.35,
    waterFraction: 0.65,
    vaporFraction: 0.0,
    entropyJPerK: 118.6,
    currentPhaseStage: 'melting_plateau',
    phaseStageName: '固液共存 · 冰晶融化潜热平台',
    isBoiling: false,
    isHeating: true,
    timePoints: [0, 5, 10, 15, 20, 25, 30, 35, 40],
    tempPoints: [-20, -10, 0, 0, 0, 0, 0, 0, 0],
  };

  // 缓存的 DOM 元素
  private valTempEl: HTMLElement | null = null;
  private valPowerEl: HTMLElement | null = null;
  private valEnergyEl: HTMLElement | null = null;
  private valEntropyEl: HTMLElement | null = null;
  private badgeStageEl: HTMLElement | null = null;
  private sliderPower: HTMLInputElement | null = null;
  private sliderMass: HTMLInputElement | null = null;
  private activeSliders = new Set<string>();
  private selectAccel: HTMLSelectElement | null = null;
  private btnHeating: HTMLButtonElement | null = null;
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

  private createUI(): void {
    this.element = document.createElement('div');
    this.element.className = 'vision-thermo-status-card hud-interactive';

    this.element.innerHTML = `
      <div class="thermo-card-container">
        <!-- 1. Top Metrics Deck -->
        <div class="thermo-metrics-deck">
          <div class="thermo-metric-card" id="card-temp">
            <span class="thermo-metric-label">体系温度 T</span>
            <div class="thermo-metric-value" id="val-phase-temp" style="color: #00f5ff;">0.0 °C</div>
            <span class="thermo-metric-sub" id="sub-temp-k">273.15 K</span>
            <div class="thermo-gauge-bar"><div class="thermo-gauge-fill" id="bar-phase-temp" style="width: 50%;"></div></div>
          </div>

          <div class="thermo-metric-card" id="card-power">
            <span class="thermo-metric-label">电加热功率 P</span>
            <div class="thermo-metric-value" id="val-phase-power" style="color: #ef4444;">800 W</div>
            <span class="thermo-metric-sub">恒定热流输入源</span>
            <input type="range" class="thermo-mini-slider" id="slider-phase-power" min="100" max="2000" step="50" value="800" style="accent-color: #ef4444;" />
          </div>

          <div class="thermo-metric-card" id="card-energy">
            <span class="thermo-metric-label">累计吸收热量 Q_in</span>
            <div class="thermo-metric-value" id="val-phase-energy" style="color: #f59e0b;">32.4 kJ</div>
            <span class="thermo-metric-sub" id="sub-phase-time">加热时长: 40.5 s</span>
            <div class="thermo-metric-caption" id="sub-phase-mass">试样质量: 150 g</div>
          </div>

          <div class="thermo-metric-card" id="card-entropy">
            <span class="thermo-metric-label">体系熵变 ΔS (∫ dQ/T)</span>
            <div class="thermo-metric-value" id="val-phase-entropy" style="color: #a855f7;">118.6 J/K</div>
            <span class="thermo-metric-sub">无序度与聚集态跃变</span>
            <div class="thermo-metric-caption">L_f: 334 kJ/kg · L_v: 2260 kJ/kg</div>
          </div>
        </div>

        <!-- 2. Dual Analytics Charts Deck -->
        <div class="thermo-charts-deck">
          <!-- Left: T-t Heating & Latent Heat Plateau Curve -->
          <div class="thermo-chart-box">
            <div class="thermo-chart-header">
              <span class="thermo-chart-title">T-t 动态升温潜热曲线 (平台段: Q = mL)</span>
              <div class="thermo-chart-legend">
                <span class="legend-dot" style="background: #38bdf8;"></span><span>熔化平台 (0°C)</span>
                <span class="legend-dot" style="background: #ef4444;"></span><span>沸腾平台 (100°C)</span>
              </div>
            </div>
            <div class="thermo-canvas-wrap">
              <canvas id="canvas-phase-tt" width="480" height="250"></canvas>
            </div>
          </div>

          <!-- Right: Three-Phase Mass Fraction Stacked Bar -->
          <div class="thermo-chart-box">
            <div class="thermo-chart-header">
              <span class="thermo-chart-title">固-液-汽三态质量百分比转化</span>
              <div class="thermo-chart-legend">
                <span class="legend-dot" style="background: #38bdf8;"></span><span>固态冰</span>
                <span class="legend-dot" style="background: #0284c7;"></span><span>液态水</span>
                <span class="legend-dot" style="background: #f59e0b;"></span><span>水蒸气</span>
              </div>
            </div>
            <div class="thermo-canvas-wrap">
              <canvas id="canvas-phase-fractions" width="480" height="250"></canvas>
            </div>
          </div>
        </div>

        <!-- 3. Control Deck -->
        <div class="carnot-control-deck">
          <div class="carnot-btn-group">
            <div class="carnot-stage-badge" id="badge-phase-stage">
              <span class="stage-dot" style="width: 7px; height: 7px; border-radius: 50%; background: #00f5ff;"></span>
              <span id="txt-phase-stage">固液共存 · 冰晶融化潜热平台</span>
            </div>
          </div>

          <div class="carnot-btn-group">
            <select class="carnot-select" id="select-phase-accel" title="时间流速加速倍率">
              <option value="1">1x (真实物理流速)</option>
              <option value="5" selected>5x (标准演示倍速)</option>
              <option value="20">20x (高速快进)</option>
              <option value="50">50x (极速扫描)</option>
            </select>

            <button class="carnot-btn active" id="btn-phase-heating" title="启停恒功率电加热">
              <span id="txt-phase-heating">加热中</span>
            </button>

            <button class="carnot-btn" id="btn-phase-reset" title="复位冷冻初始冰块状态">
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/>
                <path d="M21 3v5h-5"/>
                <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/>
                <path d="M3 21v-5h5"/>
              </svg>
              <span>重置冷冻</span>
            </button>
          </div>
        </div>
      </div>
    `;

    this.canvasTT = this.element.querySelector('#canvas-phase-tt') as HTMLCanvasElement;
    this.canvasFractions = this.element.querySelector('#canvas-phase-fractions') as HTMLCanvasElement;

    this.valTempEl = this.element.querySelector('#val-phase-temp');
    this.valPowerEl = this.element.querySelector('#val-phase-power');
    this.valEnergyEl = this.element.querySelector('#val-phase-energy');
    this.valEntropyEl = this.element.querySelector('#val-phase-entropy');
    this.badgeStageEl = this.element.querySelector('#txt-phase-stage');

    this.sliderPower = this.element.querySelector('#slider-phase-power');
    this.selectAccel = this.element.querySelector('#select-phase-accel');
    this.btnHeating = this.element.querySelector('#btn-phase-heating');

    this.bindEvents();
  }

  private bindEvents(): void {
    if (this.sliderPower) {
      bindVisionSlider(this.sliderPower, {
        activeSet: this.activeSliders,
        onChange: (val) => {
          this.callbacks.onHeatPowerChange?.(val);
        },
        onScrub: (val) => {
          if (this.valPowerEl) this.valPowerEl.textContent = `${Math.round(val)} W`;
        },
      });
    }

    this.selectAccel?.addEventListener('change', () => {
      const val = parseFloat(this.selectAccel?.value || '5');
      this.callbacks.onTimeAccelerationChange?.(val);
    });

    this.btnHeating?.addEventListener('click', () => {
      this.callbacks.onToggleHeating?.();
    });

    this.element.querySelector('#btn-phase-reset')?.addEventListener('click', () => {
      this.callbacks.onResetExperiment?.();
    });
  }

  public setVisible(visible: boolean): void {
    this.isVisible = visible;
    if (visible) {
      this.lastChartRenderTime = 0;
      this.lastRenderedTempC = -999;
      this.lastRenderedPower = -1;
      this.lastRenderedHeating = null;
      this.lastRenderedStage = '';
      this.lastRenderedTimeS = -1;
      this.renderCharts();
    }
  }

  public updateTelemetry(data: PhaseTelemetryData): void {
    this.currentData = data;

    if (this.valTempEl) this.valTempEl.textContent = `${data.temperatureC.toFixed(1)} °C`;
    const subTK = this.element.querySelector('#sub-temp-k');
    if (subTK) subTK.textContent = `${data.temperatureK.toFixed(1)} K`;

    const barTemp = this.element.querySelector('#bar-phase-temp') as HTMLElement;
    if (barTemp) {
      const pct = Math.min(100, Math.max(0, ((data.temperatureC + 30) / 160) * 100));
      barTemp.style.width = `${pct}%`;
    }

    if (this.valPowerEl) this.valPowerEl.textContent = `${Math.round(data.heatPowerW)} W`;
    if (this.valEnergyEl) this.valEnergyEl.textContent = `${data.totalEnergyKj.toFixed(1)} kJ`;
    if (this.valEntropyEl) this.valEntropyEl.textContent = `${data.entropyJPerK.toFixed(1)} J/K`;

    const subTime = this.element.querySelector('#sub-phase-time');
    if (subTime) subTime.textContent = `加热时长: ${Math.round(data.timeElapsedS)} s`;

    if (this.badgeStageEl) this.badgeStageEl.textContent = data.phaseStageName;

    if (this.btnHeating) {
      this.btnHeating.classList.toggle('active', data.isHeating);
      const txt = this.btnHeating.querySelector('#txt-phase-heating');
      if (txt) txt.textContent = data.isHeating ? '加热中' : '已暂停';
    }

    if (this.sliderPower && !isSliderActive(this.sliderPower, this.activeSliders)) {
      this.sliderPower.value = String(data.heatPowerW);
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

    const padL = 44, padR = 16, padT = 16, padB = 30;
    const chartW = w - padL - padR;
    const chartH = h - padT - padB;

    const d = this.currentData;
    const tMin = -30, tMax = 120; // -30°C 至 120°C

    const mapY = (tC: number) => padT + chartH - ((tC - tMin) / (tMax - tMin)) * chartH;

    // 时间窗口（根据已加热时长自适应扩展）
    const maxT = Math.max(120, d.timeElapsedS * 1.15);
    const mapX = (tSec: number) => padL + (tSec / maxT) * chartW;

    // 关键温度网格线（-20°C、0°C、50°C、100°C）
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
    ctx.lineWidth = 1;

    // 0°C 与 100°C 潜热平台参考线
    const y0 = mapY(0);
    const y100 = mapY(100);

    // 0°C 熔化线
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.35)';
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(padL, y0);
    ctx.lineTo(w - padR, y0);
    ctx.stroke();

    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'right';
    ctx.fillText('0°C (熔化)', padL - 6, y0 + 3);

    // 100°C 沸腾线
    ctx.strokeStyle = 'rgba(239, 68, 68, 0.35)';
    ctx.beginPath();
    ctx.moveTo(padL, y100);
    ctx.lineTo(w - padR, y100);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = '#ef4444';
    ctx.fillText('100°C (沸腾)', padL - 6, y100 + 3);

    // 时间刻度
    ctx.fillStyle = '#64748b';
    ctx.font = '10px monospace';
    ctx.textAlign = 'center';
    for (let t = 0; t <= maxT; t += Math.round(maxT / 4)) {
      const x = mapX(t);
      ctx.fillText(`${Math.round(t)}s`, x, h - 12);
    }

    // 坐标轴
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(padL, padT);
    ctx.lineTo(padL, padT + chartH);
    ctx.lineTo(w - padR, padT + chartH);
    ctx.stroke();

    // 实时绘制 T(t) 升温曲线
    const tPoints = d.timePoints;
    const tempPoints = d.tempPoints;
    if (tPoints && tPoints.length > 1) {
      ctx.strokeStyle = '#22c55e';
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      for (let i = 0; i < tPoints.length; i++) {
        const px = mapX(tPoints[i]);
        const py = mapY(tempPoints[i]);
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.stroke();
    }

    // 实时当前点游标
    const curX = mapX(d.timeElapsedS);
    const curY = mapY(d.temperatureC);

    ctx.fillStyle = 'rgba(34, 197, 94, 0.35)';
    ctx.beginPath();
    ctx.arc(curX, curY, 8, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#22c55e';
    ctx.beginPath();
    ctx.arc(curX, curY, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  private renderFractionsChart(): void {
    const canvas = this.canvasFractions;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const padL = 36, padR = 24, padT = 24, padB = 40;
    const barW = w - padL - padR;
    const barH = 44;
    const barY = padT + 20;

    const d = this.currentData;

    // 冰-水-汽三态质量百分比堆叠条
    const wIce = d.iceFraction * barW;
    const wWater = d.waterFraction * barW;
    const wVapor = d.vaporFraction * barW;

    ctx.beginPath();
    ctx.roundRect(padL, barY, barW, barH, 6);
    ctx.clip();

    // 1. 固态冰分段（青色）
    ctx.fillStyle = '#38bdf8';
    ctx.fillRect(padL, barY, wIce, barH);

    // 2. 液态水分段（深蓝色）
    ctx.fillStyle = '#0284c7';
    ctx.fillRect(padL + wIce, barY, wWater, barH);

    // 3. 水蒸气分段（橙色/琥珀色）
    ctx.fillStyle = '#f59e0b';
    ctx.fillRect(padL + wIce + wWater, barY, wVapor, barH);

    // 重置裁剪区域
    ctx.restore();

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(padL, barY, barW, barH, 6);
    ctx.stroke();

    // 百分比数值标注
    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'center';

    const pIce = Math.round(d.iceFraction * 100);
    const pWater = Math.round(d.waterFraction * 100);
    const pVapor = Math.round(d.vaporFraction * 100);

    ctx.fillText(`固态冰: ${pIce}%`, padL + barW * 0.18, barY + barH + 24);
    ctx.fillText(`液态水: ${pWater}%`, padL + barW * 0.50, barY + barH + 24);
    ctx.fillText(`气态水汽: ${pVapor}%`, padL + barW * 0.82, barY + barH + 24);

    // 宽度充足时在柱条内部显示标注
    ctx.font = 'bold 11px -apple-system, sans-serif';
    if (wIce > 40) ctx.fillText(`${pIce}%`, padL + wIce * 0.5, barY + barH * 0.6);
    if (wWater > 40) ctx.fillText(`${pWater}%`, padL + wIce + wWater * 0.5, barY + barH * 0.6);
    if (wVapor > 40) ctx.fillText(`${pVapor}%`, padL + wIce + wWater + wVapor * 0.5, barY + barH * 0.6);
  }
}
