export interface CarnotTelemetryData {
  tempHigh: number;      // K
  tempLow: number;       // K
  currentTemp: number;   // K
  currentVol: number;    // L
  currentPress: number;  // kPa
  currentEntropy: number;// J/K
  efficiency: number;    // %
  qHigh: number;         // J
  qLow: number;          // J
  netWork: number;       // J
  mechPower: number;     // W
  flywheelRpm: number;   // RPM
  currentStage: 1 | 2 | 3 | 4;
  stageName: string;
  stageProgress: number; // 0..1
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
  onToggleRunning?: () => void;
  onToggleDirection?: () => void;
  onStepStage?: (step: 1 | -1) => void;
  onApplyPreset?: (preset: 'steam' | 'extreme' | 'stirling' | 'refrig') => void;
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

  // Cached DOM elements
  private valTempHEl: HTMLElement | null = null;
  private valTempCEl: HTMLElement | null = null;
  private valEffEl: HTMLElement | null = null;
  private valWorkEl: HTMLElement | null = null;
  private stageBadgeEl: HTMLElement | null = null;
  private valPressVolEl: HTMLElement | null = null;
  private valPowerRpmEl: HTMLElement | null = null;
  private btnPlayPause: HTMLButtonElement | null = null;
  private btnDirection: HTMLButtonElement | null = null;
  private sliderTempH: HTMLInputElement | null = null;
  private sliderTempC: HTMLInputElement | null = null;

  constructor(callbacks: CarnotStatusCardCallbacks = {}) {
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
          <div class="thermo-metric-card" id="card-temp-high">
            <span class="thermo-metric-label">高温热源 T_H</span>
            <div class="thermo-metric-value" id="val-temp-h" style="color: #ef4444;">600 K</div>
            <span class="thermo-metric-sub">吸热恒温热源</span>
            <input type="range" class="thermo-mini-slider" id="slider-temp-h" min="400" max="1000" step="10" value="600" style="accent-color: #ef4444;" />
          </div>

          <div class="thermo-metric-card" id="card-temp-low">
            <span class="thermo-metric-label">低温冷源 T_C</span>
            <div class="thermo-metric-value" id="val-temp-c" style="color: #38bdf8;">300 K</div>
            <span class="thermo-metric-sub">放热恒温冷源</span>
            <input type="range" class="thermo-mini-slider" id="slider-temp-c" min="150" max="380" step="5" value="300" style="accent-color: #38bdf8;" />
          </div>

          <div class="thermo-metric-card" id="card-efficiency">
            <span class="thermo-metric-label">卡诺理论极限效率 η</span>
            <div class="thermo-metric-value" id="val-eff" style="color: #22c55e;">50.0%</div>
            <span class="thermo-metric-sub" id="sub-eff-formula">η = 1 - T_C / T_H</span>
            <div class="thermo-gauge-bar"><div class="thermo-gauge-fill" id="bar-eff-fill" style="width: 50%;"></div></div>
          </div>

          <div class="thermo-metric-card" id="card-work">
            <span class="thermo-metric-label">循环净功 W_net</span>
            <div class="thermo-metric-value" id="val-work" style="color: #f59e0b;">197.6 J</div>
            <span class="thermo-metric-sub" id="sub-heat-ratio">Q_H: 395J · Q_C: 198J</span>
            <div class="thermo-metric-caption" id="sub-power-rpm">功率: 16.5 W · 50 RPM</div>
          </div>
        </div>

        <!-- 2. Dual Analytics Charts Deck (PV & TS) -->
        <div class="thermo-charts-deck">
          <!-- Left: P-V Indicator Diagram -->
          <div class="thermo-chart-box">
            <div class="thermo-chart-header">
              <span class="thermo-chart-title">P-V 示功闭合图 (W = ∮ P dV)</span>
              <div class="thermo-chart-legend">
                <span class="legend-line line-carnot-iso-h"></span><span>等温吸热</span>
                <span class="legend-line line-carnot-adi-exp"></span><span>绝热做功</span>
                <span class="legend-line line-carnot-iso-c"></span><span>等温放热</span>
                <span class="legend-line line-carnot-adi-comp"></span><span>绝热压缩</span>
              </div>
            </div>
            <div class="thermo-canvas-wrap">
              <canvas id="canvas-carnot-pv" width="480" height="250"></canvas>
            </div>
          </div>

          <!-- Right: T-S Entropy Diagram -->
          <div class="thermo-chart-box">
            <div class="thermo-chart-header">
              <span class="thermo-chart-title">T-S 温-熵图 (理想矩形热机循环)</span>
              <div class="thermo-chart-legend">
                <span class="legend-dot" style="background: #22c55e;"></span><span>面积 = (T_H-T_C)ΔS</span>
                <span class="legend-dot" style="background: #f59e0b;"></span><span>实时状态点</span>
              </div>
            </div>
            <div class="thermo-canvas-wrap">
              <canvas id="canvas-carnot-ts" width="480" height="250"></canvas>
            </div>
          </div>
        </div>

        <!-- 3. Control Deck & Mode Toolbar -->
        <div class="carnot-control-deck">
          <div class="carnot-btn-group">
            <div class="carnot-stage-badge" id="badge-stage">
              <span class="stage-dot" style="width: 7px; height: 7px; border-radius: 50%; background: #f59e0b;"></span>
              <span id="badge-stage-text">冲程 1: 等温膨胀 (吸热做功)</span>
            </div>
            <span style="font-size: 11px; color: #94a3b8; font-family: monospace;" id="txt-press-vol">P: 332.6 kPa · V: 1.50 L · T: 600 K</span>
          </div>

          <div class="carnot-btn-group">
            <select class="carnot-select" id="select-preset" title="快速载入经典热力学工况">
              <option value="steam">工况预设: 经典工业蒸汽热机 (650K/300K)</option>
              <option value="extreme">工况预设: 极限超高温差热机 (950K/200K)</option>
              <option value="stirling">工况预设: 近环境低品位热机 (360K/290K)</option>
              <option value="refrig">工况预设: 深冷逆卡诺制冷机 (320K/240K)</option>
            </select>

            <button class="carnot-btn" id="btn-carnot-dir" title="切换正向热机 / 逆向热泵">
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M7 16V4m0 0L3 8m4-4l4 4m6 4v12m0 0l4-4m-4 4l-4-4"/>
              </svg>
              <span id="txt-carnot-dir">正向热机</span>
            </button>

            <button class="carnot-btn" id="btn-carnot-step" title="分步推进下一个冲程">
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2">
                <polygon points="5 4 15 12 5 20 5 4"></polygon>
                <line x1="19" y1="5" x2="19" y2="19"></line>
              </svg>
              <span>单步冲程</span>
            </button>

            <button class="carnot-btn active" id="btn-carnot-play" title="启动 / 暂停动力飞轮">
              <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor">
                <rect x="6" y="4" width="4" height="16"></rect>
                <rect x="14" y="4" width="4" height="16"></rect>
              </svg>
              <span id="txt-carnot-play">运行中</span>
            </button>
          </div>
        </div>
      </div>
    `;

    this.canvasPV = this.element.querySelector('#canvas-carnot-pv') as HTMLCanvasElement;
    this.canvasTS = this.element.querySelector('#canvas-carnot-ts') as HTMLCanvasElement;

    this.valTempHEl = this.element.querySelector('#val-temp-h');
    this.valTempCEl = this.element.querySelector('#val-temp-c');
    this.valEffEl = this.element.querySelector('#val-eff');
    this.valWorkEl = this.element.querySelector('#val-work');
    this.stageBadgeEl = this.element.querySelector('#badge-stage-text');
    this.valPressVolEl = this.element.querySelector('#txt-press-vol');
    this.valPowerRpmEl = this.element.querySelector('#sub-power-rpm');
    this.btnPlayPause = this.element.querySelector('#btn-carnot-play');
    this.btnDirection = this.element.querySelector('#btn-carnot-dir');
    this.sliderTempH = this.element.querySelector('#slider-temp-h');
    this.sliderTempC = this.element.querySelector('#slider-temp-c');

    this.bindEvents();
  }

  private bindEvents(): void {
    this.sliderTempH?.addEventListener('input', (e) => {
      const val = parseFloat((e.target as HTMLInputElement).value);
      this.callbacks.onTempHighChange?.(val);
    });

    this.sliderTempC?.addEventListener('input', (e) => {
      const val = parseFloat((e.target as HTMLInputElement).value);
      this.callbacks.onTempLowChange?.(val);
    });

    this.btnPlayPause?.addEventListener('click', () => {
      this.callbacks.onToggleRunning?.();
    });

    this.btnDirection?.addEventListener('click', () => {
      this.callbacks.onToggleDirection?.();
    });

    this.element.querySelector('#btn-carnot-step')?.addEventListener('click', () => {
      this.callbacks.onStepStage?.(1);
    });

    const selectPreset = this.element.querySelector('#select-preset') as HTMLSelectElement;
    selectPreset?.addEventListener('change', () => {
      const p = selectPreset.value as 'steam' | 'extreme' | 'stirling' | 'refrig';
      this.callbacks.onApplyPreset?.(p);
    });
  }

  public setVisible(visible: boolean): void {
    this.isVisible = visible;
    if (visible) {
      this.renderCharts();
    }
  }

  public updateTelemetry(data: CarnotTelemetryData): void {
    this.currentData = data;

    if (this.valTempHEl) this.valTempHEl.textContent = `${Math.round(data.tempHigh)} K`;
    if (this.valTempCEl) this.valTempCEl.textContent = `${Math.round(data.tempLow)} K`;
    if (this.valEffEl) this.valEffEl.textContent = `${data.efficiency.toFixed(1)}%`;
    if (this.valWorkEl) this.valWorkEl.textContent = `${data.netWork.toFixed(1)} J`;
    if (this.stageBadgeEl) this.stageBadgeEl.textContent = `冲程 ${data.currentStage}: ${data.stageName}`;
    if (this.valPressVolEl) {
      this.valPressVolEl.textContent = `P: ${data.currentPress.toFixed(1)} kPa · V: ${data.currentVol.toFixed(2)} L · T: ${Math.round(data.currentTemp)} K`;
    }
    if (this.valPowerRpmEl) {
      this.valPowerRpmEl.textContent = `功率: ${data.mechPower.toFixed(1)} W · ${Math.round(data.flywheelRpm)} RPM`;
    }

    if (this.btnPlayPause) {
      this.btnPlayPause.classList.toggle('active', data.isRunning);
      const txt = this.btnPlayPause.querySelector('#txt-carnot-play');
      if (txt) txt.textContent = data.isRunning ? '运行中' : '已暂停';
    }

    if (this.btnDirection) {
      const txt = this.btnDirection.querySelector('#txt-carnot-dir');
      if (txt) txt.textContent = data.isReversed ? '逆向制冷' : '正向热机';
    }

    if (this.sliderTempH && document.activeElement !== this.sliderTempH) {
      this.sliderTempH.value = String(data.tempHigh);
    }
    if (this.sliderTempC && document.activeElement !== this.sliderTempC) {
      this.sliderTempC.value = String(data.tempLow);
    }

    if (this.isVisible) {
      this.renderCharts();
    }
  }

  /**
   * High-DPI Canvas Rendering for P-V and T-S Curves
   */
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

    // Coordinate margin
    const padL = 44, padR = 16, padT = 16, padB = 30;
    const chartW = w - padL - padR;
    const chartH = h - padT - padB;

    // Grid bounds: V from 1.0 to 7.0 L, P from 0 to 450 kPa
    const vMin = 0.8, vMax = 6.8;
    const pMin = 0, pMax = 440;

    const mapX = (v: number) => padL + ((v - vMin) / (vMax - vMin)) * chartW;
    const mapY = (p: number) => padT + chartH - ((p - pMin) / (pMax - pMin)) * chartH;

    // Draw background grid lines
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
    ctx.lineWidth = 1;
    for (let p = 100; p <= 400; p += 100) {
      const y = mapY(p);
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(w - padR, y);
      ctx.stroke();

      ctx.fillStyle = '#64748b';
      ctx.font = '10px monospace';
      ctx.textAlign = 'right';
      ctx.fillText(`${p}`, padL - 6, y + 3);
    }

    for (let v = 2; v <= 6; v += 1) {
      const x = mapX(v);
      ctx.beginPath();
      ctx.moveTo(x, padT);
      ctx.lineTo(x, padT + chartH);
      ctx.stroke();

      ctx.fillStyle = '#64748b';
      ctx.font = '10px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`${v}L`, x, h - 12);
    }

    // Axes
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(padL, padT);
    ctx.lineTo(padL, padT + chartH);
    ctx.lineTo(w - padR, padT + chartH);
    ctx.stroke();

    const d = this.currentData;
    const R_GAS = 8.314;
    const n = 0.10;
    const gamma = 1.40;

    // Helper functions for curves
    // 1 -> 2: Isotherm at Th
    const pIsoH = (v: number) => (n * R_GAS * d.tempHigh) / v;
    // 3 -> 4: Isotherm at Tc
    const pIsoC = (v: number) => (n * R_GAS * d.tempLow) / v;
    // 2 -> 3: Adiabatic exp: P = P2 * (V2/V)^gamma
    const pAdiExp = (v: number) => d.p2 * Math.pow(d.v2 / v, gamma);
    // 4 -> 1: Adiabatic comp: P = P4 * (V4/V)^gamma
    const pAdiComp = (v: number) => d.p4 * Math.pow(d.v4 / v, gamma);

    // 1. Fill Closed Work Area (W_net = \oint P dV)
    ctx.beginPath();
    // Segment 1 -> 2
    for (let i = 0; i <= 20; i++) {
      const v = d.v1 + (d.v2 - d.v1) * (i / 20);
      const x = mapX(v), y = mapY(pIsoH(v));
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    // Segment 2 -> 3
    for (let i = 0; i <= 20; i++) {
      const v = d.v2 + (d.v3 - d.v2) * (i / 20);
      ctx.lineTo(mapX(v), mapY(pAdiExp(v)));
    }
    // Segment 3 -> 4
    for (let i = 0; i <= 20; i++) {
      const v = d.v3 - (d.v3 - d.v4) * (i / 20);
      ctx.lineTo(mapX(v), mapY(pIsoC(v)));
    }
    // Segment 4 -> 1
    for (let i = 0; i <= 20; i++) {
      const v = d.v4 - (d.v4 - d.v1) * (i / 20);
      ctx.lineTo(mapX(v), mapY(pAdiComp(v)));
    }
    ctx.closePath();
    ctx.fillStyle = 'rgba(245, 158, 11, 0.16)';
    ctx.fill();

    // 2. Draw 4 distinct stroke paths
    // Path 1 -> 2: Isothermal expansion (Red)
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    for (let i = 0; i <= 20; i++) {
      const v = d.v1 + (d.v2 - d.v1) * (i / 20);
      const x = mapX(v), y = mapY(pIsoH(v));
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Path 2 -> 3: Adiabatic expansion (Yellow)
    ctx.strokeStyle = '#eab308';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    for (let i = 0; i <= 20; i++) {
      const v = d.v2 + (d.v3 - d.v2) * (i / 20);
      const x = mapX(v), y = mapY(pAdiExp(v));
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Path 3 -> 4: Isothermal compression (Blue)
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    for (let i = 0; i <= 20; i++) {
      const v = d.v3 - (d.v3 - d.v4) * (i / 20);
      const x = mapX(v), y = mapY(pIsoC(v));
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Path 4 -> 1: Adiabatic compression (Purple)
    ctx.strokeStyle = '#a855f7';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    for (let i = 0; i <= 20; i++) {
      const v = d.v4 - (d.v4 - d.v1) * (i / 20);
      const x = mapX(v), y = mapY(pAdiComp(v));
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Draw 4 state vertex circles (1, 2, 3, 4)
    const pts = [
      { v: d.v1, p: d.p1, label: '1 (Th)' },
      { v: d.v2, p: d.p2, label: '2' },
      { v: d.v3, p: d.p3, label: '3 (Tc)' },
      { v: d.v4, p: d.p4, label: '4' },
    ];
    pts.forEach((pt) => {
      const px = mapX(pt.v), py = mapY(pt.p);
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(px, py, 3.5, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#cbd5e1';
      ctx.font = '10px -apple-system, sans-serif';
      ctx.fillText(pt.label, px + 5, py - 4);
    });

    // 3. Current Live State Point
    const liveX = mapX(d.currentVol);
    const liveY = mapY(d.currentPress);

    // Glowing halo
    ctx.fillStyle = 'rgba(245, 158, 11, 0.35)';
    ctx.beginPath();
    ctx.arc(liveX, liveY, 9, 0, Math.PI * 2);
    ctx.fill();

    // Dot center
    ctx.fillStyle = '#f59e0b';
    ctx.beginPath();
    ctx.arc(liveX, liveY, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  private renderTSChart(): void {
    const canvas = this.canvasTS;
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
    const sMin = 0.5, sMax = 2.5;
    const tMin = 100, tMax = 1100;

    const mapX = (s: number) => padL + ((s - sMin) / (sMax - sMin)) * chartW;
    const mapY = (t: number) => padT + chartH - ((t - tMin) / (tMax - tMin)) * chartH;

    // Grid
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
    ctx.lineWidth = 1;
    for (let t = 200; t <= 1000; t += 200) {
      const y = mapY(t);
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(w - padR, y);
      ctx.stroke();

      ctx.fillStyle = '#64748b';
      ctx.font = '10px monospace';
      ctx.textAlign = 'right';
      ctx.fillText(`${t}K`, padL - 6, y + 3);
    }

    for (let s = 1.0; s <= 2.0; s += 0.5) {
      const x = mapX(s);
      ctx.beginPath();
      ctx.moveTo(x, padT);
      ctx.lineTo(x, padT + chartH);
      ctx.stroke();

      ctx.fillStyle = '#64748b';
      ctx.font = '10px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`${s.toFixed(1)}`, x, h - 12);
    }

    // Axes
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(padL, padT);
    ctx.lineTo(padL, padT + chartH);
    ctx.lineTo(w - padR, padT + chartH);
    ctx.stroke();

    const x1 = mapX(d.s1);
    const x2 = mapX(d.s2);
    const yH = mapY(d.tempHigh);
    const yC = mapY(d.tempLow);

    // 1. Fill Carnot Rectangle Area
    ctx.fillStyle = 'rgba(34, 197, 94, 0.18)';
    ctx.fillRect(x1, yH, x2 - x1, yC - yH);

    // 2. Stroke Carnot Rectangle Edges
    // Top: Th (Isothermal expansion)
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(x1, yH);
    ctx.lineTo(x2, yH);
    ctx.stroke();

    // Right: S2 (Isentropic / Adiabatic expansion)
    ctx.strokeStyle = '#eab308';
    ctx.beginPath();
    ctx.moveTo(x2, yH);
    ctx.lineTo(x2, yC);
    ctx.stroke();

    // Bottom: Tc (Isothermal compression)
    ctx.strokeStyle = '#38bdf8';
    ctx.beginPath();
    ctx.moveTo(x2, yC);
    ctx.lineTo(x1, yC);
    ctx.stroke();

    // Left: S1 (Isentropic / Adiabatic compression)
    ctx.strokeStyle = '#a855f7';
    ctx.beginPath();
    ctx.moveTo(x1, yC);
    ctx.lineTo(x1, yH);
    ctx.stroke();

    // Labels for Th and Tc
    ctx.fillStyle = '#ef4444';
    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`T_H = ${Math.round(d.tempHigh)}K`, x2 + 6, yH + 4);

    ctx.fillStyle = '#38bdf8';
    ctx.fillText(`T_C = ${Math.round(d.tempLow)}K`, x2 + 6, yC + 4);

    // Center equation
    ctx.fillStyle = '#22c55e';
    ctx.font = '11px -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`ΔS = ${(d.s2 - d.s1).toFixed(2)} J/K`, (x1 + x2) * 0.5, (yH + yC) * 0.5);

    // 3. Current Live Point on TS
    const liveX = mapX(d.currentEntropy);
    const liveY = mapY(d.currentTemp);

    ctx.fillStyle = 'rgba(245, 158, 11, 0.35)';
    ctx.beginPath();
    ctx.arc(liveX, liveY, 9, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#f59e0b';
    ctx.beginPath();
    ctx.arc(liveX, liveY, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
}
