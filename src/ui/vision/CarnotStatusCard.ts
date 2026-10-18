import { bindVisionSlider, isSliderActive } from './sliderGestureHelper.ts';

export interface CarnotTelemetryData {
  tempHigh: number;
  tempLow: number;
  currentTemp: number;
  currentVol: number;
  currentPress: number;
  currentEntropy: number;
  efficiency: number;
  qHigh: number;
  qLow: number;
  netWork: number;
  mechPower: number;
  flywheelRpm: number;
  currentStage: number;
  stageName: string;
  stageProgress: number;
  isReversed: boolean;
  isRunning: boolean;
  v1: number;
  v2: number;
  v3: number;
  v4: number;
  p1: number;
  p2: number;
  p3: number;
  p4: number;
  s1: number;
  s2: number;
}

export interface CarnotStatusCardCallbacks {
  onTempHighChange?: (tempK: number) => void;
  onTempLowChange?: (tempK: number) => void;
  onTogglePlay?: (playing: boolean) => void;
  onToggleRunning?: () => void;
  onToggleDirection?: () => void;
  onStepStage?: (step?: any) => void;
  onPresetChange?: (preset: string) => void;
  onApplyPreset?: (preset: any) => void;
}

export class CarnotStatusCard {
  public element: HTMLElement;
  private canvasPV: HTMLCanvasElement;
  private canvasTS: HTMLCanvasElement;
  private callbacks: CarnotStatusCardCallbacks;

  private isVisible = false;
  private currentData: CarnotTelemetryData = {
    tempHigh: 600,
    tempLow: 300,
    currentTemp: 600,
    currentVol: 1.5,
    currentPress: 332.6,
    currentEntropy: 1.85,
    efficiency: 50.0,
    qHigh: 395.2,
    qLow: 197.6,
    netWork: 197.6,
    mechPower: 16.5,
    flywheelRpm: 50,
    currentStage: 1,
    stageName: '等温膨胀 (吸热做功)',
    stageProgress: 0.1,
    isReversed: false,
    isRunning: true,
    v1: 1.5,
    v2: 3.3,
    v3: 5.6,
    v4: 2.55,
    p1: 332.6,
    p2: 151.2,
    p3: 44.5,
    p4: 98.1,
    s1: 1.0,
    s2: 1.66,
  };

  private valTempHEl: HTMLElement | null = null;
  private valTempCEl: HTMLElement | null = null;
  private valEffEl: HTMLElement | null = null;
  private valStageEl: HTMLElement | null = null;
  private stageBadgeEl: HTMLElement | null = null;
  private btnPlayPause: HTMLButtonElement | null = null;
  private btnDirection: HTMLButtonElement | null = null;
  private btnStep: HTMLButtonElement | null = null;
  private selectPreset: HTMLSelectElement | null = null;
  private sliderTempH: HTMLInputElement | null = null;
  private sliderTempC: HTMLInputElement | null = null;
  private activeSliders = new Set<string>();

  private lastChartRenderTime = 0;
  private lastRenderedVol = -1;
  private lastRenderedTempH = -1;
  private lastRenderedTempC = -1;
  private lastRenderedStage = -1;

  constructor(callbacks: CarnotStatusCardCallbacks = {}) {
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
        <!-- 1. 左侧：参数调节与状态卡片 -->
        <div class="apple-physics-panel">
          <div class="apple-physics-group">
            <!-- 高温热源 T_H -->
            <div class="apple-physics-row">
              <div class="apple-physics-row-header">
                <span class="apple-physics-label">高温热源 T_H</span>
                <span id="val-temp-h" class="apple-physics-readout">600 K</span>
              </div>
              <input type="range" class="apple-physics-slider" id="slider-temp-h" min="400" max="1000" step="10" value="600" />
              <div class="apple-physics-scale">
                <span>400 K</span>
                <span>1000 K</span>
              </div>
            </div>

            <!-- 低温冷源 T_C -->
            <div class="apple-physics-row">
              <div class="apple-physics-row-header">
                <span class="apple-physics-label">低温冷源 T_C</span>
                <span id="val-temp-c" class="apple-physics-readout">300 K</span>
              </div>
              <input type="range" class="apple-physics-slider" id="slider-temp-c" min="150" max="380" step="5" value="300" />
              <div class="apple-physics-scale">
                <span>150 K</span>
                <span>380 K</span>
              </div>
            </div>

            <!-- 理论极限效率 η -->
            <div class="apple-physics-row">
              <div class="apple-physics-row-header">
                <span class="apple-physics-label">卡诺理论极限效率 η</span>
                <span id="val-eff" class="apple-physics-readout">50.0% · 197.6 J</span>
              </div>
            </div>

            <!-- 循环冲程状态 -->
            <div class="apple-physics-row">
              <div class="apple-physics-row-header">
                <span class="apple-physics-label">当前循环冲程</span>
                <span id="badge-stage-text" class="apple-physics-readout">等温膨胀</span>
              </div>
            </div>
          </div>

          <!-- 操作按钮组 -->
          <div class="apple-actions-group">
            <select class="apple-select" id="select-preset">
              <option value="steam">经典蒸汽热机 (650K / 300K)</option>
              <option value="extreme">极限超高温差 (950K / 200K)</option>
              <option value="stirling">近环境温差 (360K / 290K)</option>
              <option value="refrig">逆卡诺制冷机 (320K / 240K)</option>
            </select>

            <div class="apple-btn-row">
              <button class="apple-btn-primary" id="btn-carnot-play" type="button">
                <span id="txt-carnot-play">运行中</span>
              </button>
              <button class="apple-btn-secondary" id="btn-carnot-dir" type="button">
                <span id="txt-carnot-dir">正向热机</span>
              </button>
              <button class="apple-btn-secondary" id="btn-carnot-step" type="button">
                <span>单步</span>
              </button>
            </div>
          </div>
        </div>

        <!-- 2. 右侧：双分析图表 -->
        <div class="apple-charts-grid">
          <div class="apple-chart-card">
            <span class="apple-chart-title">P-V 示功图 (W_net = ∮ P dV)</span>
            <canvas id="canvas-carnot-pv" class="apple-chart-canvas" width="480" height="210"></canvas>
          </div>

          <div class="apple-chart-card">
            <span class="apple-chart-title">T-S 温-熵图 (理想可逆循环)</span>
            <canvas id="canvas-carnot-ts" class="apple-chart-canvas" width="480" height="210"></canvas>
          </div>
        </div>
      </div>
    `;

    this.canvasPV = this.element.querySelector('#canvas-carnot-pv') as HTMLCanvasElement;
    this.canvasTS = this.element.querySelector('#canvas-carnot-ts') as HTMLCanvasElement;

    this.valTempHEl = this.element.querySelector('#val-temp-h');
    this.valTempCEl = this.element.querySelector('#val-temp-c');
    this.valEffEl = this.element.querySelector('#val-eff');
    this.stageBadgeEl = this.element.querySelector('#badge-stage-text');
    this.btnPlayPause = this.element.querySelector('#btn-carnot-play');
    this.btnDirection = this.element.querySelector('#btn-carnot-dir');
    this.btnStep = this.element.querySelector('#btn-carnot-step');
    this.selectPreset = this.element.querySelector('#select-preset');
    this.sliderTempH = this.element.querySelector('#slider-temp-h');
    this.sliderTempC = this.element.querySelector('#slider-temp-c');

    this.updateSliderTrackFill(this.sliderTempH, 400, 1000, 600);
    this.updateSliderTrackFill(this.sliderTempC, 150, 380, 300);

    this.bindEvents();
  }

  private bindEvents(): void {
    bindVisionSlider(this.sliderTempH, {
      activeSet: this.activeSliders,
      onChange: (val) => {
        this.updateSliderTrackFill(this.sliderTempH, 400, 1000, val);
        this.callbacks.onTempHighChange?.(val);
      },
      onScrub: (val) => {
        if (this.valTempHEl) this.valTempHEl.textContent = `${Math.round(val)} K`;
        this.updateSliderTrackFill(this.sliderTempH, 400, 1000, val);
      },
    });

    bindVisionSlider(this.sliderTempC, {
      activeSet: this.activeSliders,
      onChange: (val) => {
        this.updateSliderTrackFill(this.sliderTempC, 150, 380, val);
        this.callbacks.onTempLowChange?.(val);
      },
      onScrub: (val) => {
        if (this.valTempCEl) this.valTempCEl.textContent = `${Math.round(val)} K`;
        this.updateSliderTrackFill(this.sliderTempC, 150, 380, val);
      },
    });

    this.btnPlayPause?.addEventListener('click', () => {
      const nextRunning = !this.currentData.isRunning;
      this.currentData.isRunning = nextRunning;
      this.callbacks.onTogglePlay?.(nextRunning);
      this.callbacks.onToggleRunning?.();
    });

    this.btnDirection?.addEventListener('click', () => {
      const nextReversed = !this.currentData.isReversed;
      this.currentData.isReversed = nextReversed;
      this.callbacks.onToggleDirection?.();
    });

    this.btnStep?.addEventListener('click', () => {
      this.callbacks.onStepStage?.();
    });

    this.selectPreset?.addEventListener('change', (e) => {
      const val = (e.target as HTMLSelectElement).value;
      this.callbacks.onPresetChange?.(val);
      this.callbacks.onApplyPreset?.(val);
    });
  }

  public setVisible(show: boolean): void {
    this.isVisible = show;
    this.element.style.display = show ? 'flex' : 'none';
    if (show) {
      this.lastRenderedVol = -1;
      this.renderCharts();
    }
  }

  public get visible(): boolean {
    return this.isVisible;
  }

  public updateTelemetry(data: CarnotTelemetryData): void {
    this.currentData = data;

    if (this.valTempHEl) {
      this.valTempHEl.textContent = `${Math.round(data.tempHigh)} K`;
    }
    if (this.valTempCEl) {
      this.valTempCEl.textContent = `${Math.round(data.tempLow)} K`;
    }
    if (this.valEffEl) {
      this.valEffEl.textContent = `${data.efficiency.toFixed(1)}% · ${data.netWork.toFixed(0)} J`;
    }
    if (this.stageBadgeEl) {
      this.stageBadgeEl.textContent = data.stageName.split(' ')[0] || data.stageName;
    }

    if (this.btnPlayPause) {
      const txt = this.btnPlayPause.querySelector('#txt-carnot-play');
      if (txt) txt.textContent = data.isRunning ? '运行中' : '已暂停';
    }

    if (this.btnDirection) {
      const txt = this.btnDirection.querySelector('#txt-carnot-dir');
      if (txt) txt.textContent = data.isReversed ? '逆向制冷' : '正向热机';
    }

    if (this.sliderTempH && !isSliderActive(this.sliderTempH, this.activeSliders)) {
      this.sliderTempH.value = String(data.tempHigh);
      this.updateSliderTrackFill(this.sliderTempH, 400, 1000, data.tempHigh);
    }
    if (this.sliderTempC && !isSliderActive(this.sliderTempC, this.activeSliders)) {
      this.sliderTempC.value = String(data.tempLow);
      this.updateSliderTrackFill(this.sliderTempC, 150, 380, data.tempLow);
    }

    if (this.isVisible) {
      const now = performance.now();
      const paramsChanged =
        data.tempHigh !== this.lastRenderedTempH ||
        data.tempLow !== this.lastRenderedTempC ||
        data.currentStage !== this.lastRenderedStage ||
        Math.abs(data.currentVol - this.lastRenderedVol) > 0.04;

      if (paramsChanged && (now - this.lastChartRenderTime >= 32 || !data.isRunning)) {
        this.lastChartRenderTime = now;
        this.lastRenderedTempH = data.tempHigh;
        this.lastRenderedTempC = data.tempLow;
        this.lastRenderedStage = data.currentStage;
        this.lastRenderedVol = data.currentVol;
        this.renderCharts();
      }
    }
  }

  private renderCharts(): void {
    this.renderPVChart();
    this.renderTSChart();
  }

  private renderPVChart(): void {
    const canvas = this.canvasPV;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const padL = 40, padR = 14, padT = 14, padB = 26;
    const chartW = w - padL - padR;
    const chartH = h - padT - padB;

    const vMin = 0.8, vMax = 6.8;
    const pMin = 0, pMax = 440;

    const mapX = (v: number) => padL + ((v - vMin) / (vMax - vMin)) * chartW;
    const mapY = (p: number) => padT + chartH - ((p - pMin) / (pMax - pMin)) * chartH;

    // 网格线
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
    ctx.lineWidth = 1;
    for (let p = 100; p <= 400; p += 100) {
      const y = mapY(p);
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(w - padR, y);
      ctx.stroke();

      ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
      ctx.font = '10px -apple-system, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(`${p}`, padL - 5, y + 3);
    }

    for (let v = 2; v <= 6; v += 1) {
      const x = mapX(v);
      ctx.beginPath();
      ctx.moveTo(x, padT);
      ctx.lineTo(x, padT + chartH);
      ctx.stroke();

      ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
      ctx.font = '10px -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`${v}L`, x, h - 8);
    }

    // 坐标轴
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(padL, padT);
    ctx.lineTo(padL, padT + chartH);
    ctx.lineTo(w - padR, padT + chartH);
    ctx.stroke();

    const d = this.currentData;
    const R_GAS = 8.314;
    const n = 0.10;
    const gamma = 1.40;

    const pIsoH = (v: number) => (n * R_GAS * d.tempHigh) / v;
    const pIsoC = (v: number) => (n * R_GAS * d.tempLow) / v;
    const pAdiExp = (v: number) => d.p2 * Math.pow(d.v2 / v, gamma);
    const pAdiComp = (v: number) => d.p4 * Math.pow(d.v4 / v, gamma);

    // 填充循环面积 (经典蓝微透)
    ctx.beginPath();
    for (let i = 0; i <= 20; i++) {
      const v = d.v1 + (d.v2 - d.v1) * (i / 20);
      const x = mapX(v), y = mapY(pIsoH(v));
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    for (let i = 0; i <= 20; i++) {
      const v = d.v2 + (d.v3 - d.v2) * (i / 20);
      ctx.lineTo(mapX(v), mapY(pAdiExp(v)));
    }
    for (let i = 0; i <= 20; i++) {
      const v = d.v3 - (d.v3 - d.v4) * (i / 20);
      ctx.lineTo(mapX(v), mapY(pIsoC(v)));
    }
    for (let i = 0; i <= 20; i++) {
      const v = d.v4 - (d.v4 - d.v1) * (i / 20);
      ctx.lineTo(mapX(v), mapY(pAdiComp(v)));
    }
    ctx.closePath();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.fill();

    // 轮廓线条（纯白，克制高雅）
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.lineWidth = 2.0;
    ctx.beginPath();
    for (let i = 0; i <= 20; i++) {
      const v = d.v1 + (d.v2 - d.v1) * (i / 20);
      const x = mapX(v), y = mapY(pIsoH(v));
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    for (let i = 0; i <= 20; i++) {
      const v = d.v2 + (d.v3 - d.v2) * (i / 20);
      ctx.lineTo(mapX(v), mapY(pAdiExp(v)));
    }
    ctx.stroke();

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.beginPath();
    for (let i = 0; i <= 20; i++) {
      const v = d.v3 - (d.v3 - d.v4) * (i / 20);
      ctx.lineTo(mapX(v), mapY(pIsoC(v)));
    }
    ctx.stroke();

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.beginPath();
    for (let i = 0; i <= 20; i++) {
      const v = d.v4 - (d.v4 - d.v1) * (i / 20);
      ctx.lineTo(mapX(v), mapY(pAdiComp(v)));
    }
    ctx.stroke();

    // 当前工作点
    const liveX = mapX(d.currentVol);
    const liveY = mapY(d.currentPress);

    ctx.fillStyle = 'rgba(10, 132, 255, 0.4)';
    ctx.beginPath();
    ctx.arc(liveX, liveY, 8, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(liveX, liveY, 4, 0, Math.PI * 2);
    ctx.fill();
  }

  private renderTSChart(): void {
    const canvas = this.canvasTS;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const padL = 40, padR = 14, padT = 14, padB = 26;
    const chartW = w - padL - padR;
    const chartH = h - padT - padB;

    const sMin = 0.8, sMax = 1.9;
    const tMin = 100, tMax = 1050;

    const mapX = (s: number) => padL + ((s - sMin) / (sMax - sMin)) * chartW;
    const mapY = (t: number) => padT + chartH - ((t - tMin) / (tMax - tMin)) * chartH;

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
    ctx.lineWidth = 1;
    for (let t = 200; t <= 1000; t += 200) {
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

    const d = this.currentData;
    const x1 = mapX(d.s1), x2 = mapX(d.s2);
    const yH = mapY(d.tempHigh), yC = mapY(d.tempLow);

    // 理想卡诺矩形
    ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.fillRect(x1, yH, x2 - x1, yC - yH);

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.lineWidth = 2.0;
    ctx.strokeRect(x1, yH, x2 - x1, yC - yH);

    // 实时状态点
    const liveX = mapX(d.currentEntropy);
    const liveY = mapY(d.currentTemp);

    ctx.fillStyle = 'rgba(10, 132, 255, 0.4)';
    ctx.beginPath();
    ctx.arc(liveX, liveY, 8, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(liveX, liveY, 4, 0, Math.PI * 2);
    ctx.fill();
  }
}
