export interface ConductionTelemetryData {
  heatSourceTemp: number; // K
  coldSourceTemp: number; // K
  material: string;       // 'copper' | 'aluminum' | 'steel' | 'composite'
  materialName: string;
  kValue: number;         // W/(m·K)
  diffusivity: number;    // 10^-6 m^2/s
  lateralInsulation: boolean;
  probePositionNorm: number; // 0..1
  probePositionMm: number;   // mm
  probeTempK: number;        // K
  probeGradient: number;     // K/m
  localHeatFlux: number;     // W/m^2
  totalHeatFlowW: number;    // W
  timeElapsed: number;       // s
  isSteadyState: boolean;
  tempProfile: number[];     // e.g. 33 grid points along rod
}

export interface ConductionStatusCardCallbacks {
  onHeatSourceTempChange?: (tempK: number) => void;
  onColdSourceTempChange?: (tempK: number) => void;
  onMaterialChange?: (material: string) => void;
  onLateralInsulationChange?: (insulated: boolean) => void;
  onProbePositionChange?: (normX: number) => void;
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
    material: 'copper',
    materialName: '高纯紫铜 (k = 390 W/m·K)',
    kValue: 390,
    diffusivity: 111,
    lateralInsulation: true,
    probePositionNorm: 0.5,
    probePositionMm: 160,
    probeTempK: 372.5,
    probeGradient: -484.4,
    localHeatFlux: 188916,
    totalHeatFlowW: 85.5,
    timeElapsed: 12.4,
    isSteadyState: true,
    tempProfile: new Array(33).fill(372.5),
  };

  // Cached DOM elements
  private valTempHEl: HTMLElement | null = null;
  private valTempCEl: HTMLElement | null = null;
  private valFluxEl: HTMLElement | null = null;
  private valProbeEl: HTMLElement | null = null;
  private valPowerEl: HTMLElement | null = null;
  private subGradientEl: HTMLElement | null = null;
  private badgeSteadyEl: HTMLElement | null = null;
  private sliderTempH: HTMLInputElement | null = null;
  private sliderTempC: HTMLInputElement | null = null;
  private sliderProbe: HTMLInputElement | null = null;
  private selectMaterial: HTMLSelectElement | null = null;
  private btnInsulation: HTMLButtonElement | null = null;
  private lastChartRenderTime = 0;
  private lastRenderedNormX = -1;

  constructor(callbacks: ConductionStatusCardCallbacks = {}) {
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
          <div class="thermo-metric-card" id="card-th">
            <span class="thermo-metric-label">热端温度 T_H</span>
            <div class="thermo-metric-value" id="val-th" style="color: #ef4444;">450 K</div>
            <span class="thermo-metric-sub">176.9 °C · 恒温电热夹具</span>
            <input type="range" class="thermo-mini-slider" id="slider-cond-th" min="320" max="650" step="5" value="450" style="accent-color: #ef4444;" />
          </div>

          <div class="thermo-metric-card" id="card-tc">
            <span class="thermo-metric-label">冷端温度 T_C</span>
            <div class="thermo-metric-value" id="val-tc" style="color: #38bdf8;">295 K</div>
            <span class="thermo-metric-sub">21.9 °C · 循环制冷恒温阱</span>
            <input type="range" class="thermo-mini-slider" id="slider-cond-tc" min="250" max="330" step="5" value="295" style="accent-color: #38bdf8;" />
          </div>

          <div class="thermo-metric-card" id="card-probe">
            <span class="thermo-metric-label">探针温度 T_probe</span>
            <div class="thermo-metric-value" id="val-probe" style="color: #00f5ff;">372.5 K</div>
            <span class="thermo-metric-sub" id="sub-gradient">梯度: -484 K/m</span>
            <input type="range" class="thermo-mini-slider" id="slider-cond-probe" min="0" max="1" step="0.01" value="0.5" style="accent-color: #00f5ff;" />
          </div>

          <div class="thermo-metric-card" id="card-heatflow">
            <span class="thermo-metric-label">稳态传热功率 Q</span>
            <div class="thermo-metric-value" id="val-heatflow" style="color: #f59e0b;">85.5 W</div>
            <span class="thermo-metric-sub" id="sub-flux">热通量: 189 kW/m²</span>
            <div class="thermo-metric-caption" id="sub-k-prop">k: 390 W/m·K · α: 111 mm²/s</div>
          </div>
        </div>

        <!-- 2. Dual Analytics Charts Deck -->
        <div class="thermo-charts-deck">
          <!-- Left: T(x) Temperature Distribution Curve -->
          <div class="thermo-chart-box">
            <div class="thermo-chart-header">
              <span class="thermo-chart-title">T(x) 轴向温度分布曲线 (Fourier: q = -k dT/dx)</span>
              <div class="thermo-chart-legend">
                <span class="legend-line" style="background: #38bdf8; height: 2px;"></span><span>实时曲线</span>
                <span class="legend-line" style="background: #94a3b8; height: 1px; border-top: 1px dashed;"></span><span>理论稳态</span>
                <span class="legend-dot" style="background: #00f5ff;"></span><span>探针测温点</span>
              </div>
            </div>
            <div class="thermo-canvas-wrap">
              <canvas id="canvas-cond-tx" width="480" height="250"></canvas>
            </div>
          </div>

          <!-- Right: FLIR False-Color Thermal Gradient & Heat Flux -->
          <div class="thermo-chart-box">
            <div class="thermo-chart-header">
              <span class="thermo-chart-title">FLIR 红外热成像伪彩与热通量场分布</span>
              <div class="thermo-chart-legend">
                <span class="legend-dot" style="background: #ef4444;"></span><span>热端</span>
                <span class="legend-dot" style="background: #38bdf8;"></span><span>冷端</span>
              </div>
            </div>
            <div class="thermo-canvas-wrap">
              <canvas id="canvas-cond-flir" width="480" height="250"></canvas>
            </div>
          </div>
        </div>

        <!-- 3. Control Deck -->
        <div class="carnot-control-deck">
          <div class="carnot-btn-group">
            <div class="carnot-stage-badge" id="badge-steady-state">
              <span class="stage-dot" style="width: 7px; height: 7px; border-radius: 50%; background: #22c55e;"></span>
              <span id="txt-steady-state">一维稳态热传导已建立</span>
            </div>
            <button class="carnot-btn" id="btn-insulation" title="切换完全绝热 / 自然空气对流散热">
              <span>侧向绝热: 开启</span>
            </button>
          </div>

          <div class="carnot-btn-group">
            <select class="carnot-select" id="select-cond-material" title="切换不同热导率材料或复合棒">
              <option value="copper">试样材质: 高纯紫铜 (k = 390 W/m·K)</option>
              <option value="aluminum">试样材质: 硬铝合金 (k = 210 W/m·K)</option>
              <option value="steel">试样材质: 304不锈钢 (k = 16 W/m·K)</option>
              <option value="composite">试样材质: 铜-钢串联复合棒 (Cu+Steel 界面斜率突变)</option>
            </select>

            <button class="carnot-btn" id="btn-reset-transient" title="重新触发热扰动观察瞬态热波扩散">
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/>
                <path d="M21 3v5h-5"/>
                <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/>
                <path d="M3 21v-5h5"/>
              </svg>
              <span>瞬态热扩散重演</span>
            </button>
          </div>
        </div>
      </div>
    `;

    this.canvasTX = this.element.querySelector('#canvas-cond-tx') as HTMLCanvasElement;
    this.canvasFLIR = this.element.querySelector('#canvas-cond-flir') as HTMLCanvasElement;

    this.valTempHEl = this.element.querySelector('#val-th');
    this.valTempCEl = this.element.querySelector('#val-tc');
    this.valProbeEl = this.element.querySelector('#val-probe');
    this.subGradientEl = this.element.querySelector('#sub-gradient');
    this.valPowerEl = this.element.querySelector('#val-heatflow');
    this.valFluxEl = this.element.querySelector('#sub-flux');
    this.badgeSteadyEl = this.element.querySelector('#txt-steady-state');

    this.sliderTempH = this.element.querySelector('#slider-cond-th');
    this.sliderTempC = this.element.querySelector('#slider-cond-tc');
    this.sliderProbe = this.element.querySelector('#slider-cond-probe');
    this.selectMaterial = this.element.querySelector('#select-cond-material');
    this.btnInsulation = this.element.querySelector('#btn-insulation');

    this.bindEvents();
  }

  private bindEvents(): void {
    this.sliderTempH?.addEventListener('input', (e) => {
      const val = parseFloat((e.target as HTMLInputElement).value);
      this.callbacks.onHeatSourceTempChange?.(val);
    });

    this.sliderTempC?.addEventListener('input', (e) => {
      const val = parseFloat((e.target as HTMLInputElement).value);
      this.callbacks.onColdSourceTempChange?.(val);
    });

    this.sliderProbe?.addEventListener('input', (e) => {
      const val = parseFloat((e.target as HTMLInputElement).value);
      this.callbacks.onProbePositionChange?.(val);
    });

    this.selectMaterial?.addEventListener('change', () => {
      const mat = this.selectMaterial?.value || 'copper';
      this.callbacks.onMaterialChange?.(mat);
    });

    this.btnInsulation?.addEventListener('click', () => {
      const next = !this.currentData.lateralInsulation;
      this.callbacks.onLateralInsulationChange?.(next);
    });

    this.element.querySelector('#btn-reset-transient')?.addEventListener('click', () => {
      this.callbacks.onResetTransient?.();
    });
  }

  public setVisible(visible: boolean): void {
    this.isVisible = visible;
    if (visible) {
      this.renderCharts();
    }
  }

  public updateTelemetry(data: ConductionTelemetryData): void {
    this.currentData = data;

    if (this.valTempHEl) this.valTempHEl.textContent = `${Math.round(data.heatSourceTemp)} K`;
    if (this.valTempCEl) this.valTempCEl.textContent = `${Math.round(data.coldSourceTemp)} K`;
    if (this.valProbeEl) this.valProbeEl.textContent = `${data.probeTempK.toFixed(1)} K`;
    if (this.subGradientEl) this.subGradientEl.textContent = `梯度: ${Math.round(data.probeGradient)} K/m`;
    if (this.valPowerEl) this.valPowerEl.textContent = `${data.totalHeatFlowW.toFixed(1)} W`;
    if (this.valFluxEl) this.valFluxEl.textContent = `热通量: ${(data.localHeatFlux / 1000).toFixed(1)} kW/m²`;

    const subK = this.element.querySelector('#sub-k-prop');
    if (subK) {
      subK.textContent = `k: ${data.kValue} W/m·K · α: ${data.diffusivity} mm²/s`;
    }

    if (this.badgeSteadyEl) {
      this.badgeSteadyEl.textContent = data.isSteadyState
        ? `一维稳态热传导 (t = ${data.timeElapsed.toFixed(1)}s)`
        : `非稳态热波扩散中 (${data.timeElapsed.toFixed(1)}s)`;
    }

    if (this.btnInsulation) {
      this.btnInsulation.textContent = data.lateralInsulation ? '侧向绝热: 开启' : '空气自然对流散热';
      this.btnInsulation.classList.toggle('active', data.lateralInsulation);
    }

    if (this.sliderTempH && document.activeElement !== this.sliderTempH) {
      this.sliderTempH.value = String(data.heatSourceTemp);
    }
    if (this.sliderTempC && document.activeElement !== this.sliderTempC) {
      this.sliderTempC.value = String(data.coldSourceTemp);
    }
    if (this.sliderProbe && document.activeElement !== this.sliderProbe) {
      this.sliderProbe.value = String(data.probePositionNorm);
    }
    if (this.selectMaterial && document.activeElement !== this.selectMaterial) {
      this.selectMaterial.value = data.material;
    }

    if (this.isVisible) {
      const now = performance.now();
      const probeMoved = Math.abs(data.probePositionNorm - this.lastRenderedNormX) > 0.005;
      if (!data.isSteadyState || probeMoved || now - this.lastChartRenderTime >= 100) {
        this.lastChartRenderTime = now;
        this.lastRenderedNormX = data.probePositionNorm;
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

    const padL = 48, padR = 16, padT = 16, padB = 30;
    const chartW = w - padL - padR;
    const chartH = h - padT - padB;

    const d = this.currentData;
    const tMin = 240, tMax = 680;

    const mapX = (normX: number) => padL + normX * chartW;
    const mapY = (tK: number) => padT + chartH - ((tK - tMin) / (tMax - tMin)) * chartH;

    // Grid lines
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
    ctx.lineWidth = 1;
    for (let t = 300; t <= 600; t += 100) {
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

    for (let xNorm = 0.25; xNorm <= 1.0; xNorm += 0.25) {
      const x = mapX(xNorm);
      ctx.beginPath();
      ctx.moveTo(x, padT);
      ctx.lineTo(x, padT + chartH);
      ctx.stroke();

      ctx.fillStyle = '#64748b';
      ctx.font = '10px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`${Math.round(xNorm * 320)}mm`, x, h - 12);
    }

    // Axes
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(padL, padT);
    ctx.lineTo(padL, padT + chartH);
    ctx.lineTo(w - padR, padT + chartH);
    ctx.stroke();

    // 1. Theoretical Steady-State Reference Path
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.45)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();

    if (d.material === 'composite') {
      // Junction at x = 0.5: k_cu = 390, k_steel = 16
      // R1 = L1 / k1 = 0.5 / 390; R2 = L2 / k2 = 0.5 / 16
      const r1 = 0.5 / 390;
      const r2 = 0.5 / 16;
      const deltaT1 = (d.heatSourceTemp - d.coldSourceTemp) * (r1 / (r1 + r2));
      const tJunction = d.heatSourceTemp - deltaT1;

      ctx.moveTo(mapX(0), mapY(d.heatSourceTemp));
      ctx.lineTo(mapX(0.5), mapY(tJunction));
      ctx.lineTo(mapX(1), mapY(d.coldSourceTemp));
    } else {
      ctx.moveTo(mapX(0), mapY(d.heatSourceTemp));
      ctx.lineTo(mapX(1), mapY(d.coldSourceTemp));
    }
    ctx.stroke();
    ctx.setLineDash([]);

    // 2. Live Dynamic Transient Temperature Curve T(x)
    const pts = d.tempProfile;
    if (pts && pts.length > 1) {
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      for (let i = 0; i < pts.length; i++) {
        const norm = i / (pts.length - 1);
        const px = mapX(norm);
        const py = mapY(pts[i]);
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.stroke();
    }

    // 3. Mark Probe Position
    const probeX = mapX(d.probePositionNorm);
    const probeY = mapY(d.probeTempK);

    ctx.strokeStyle = 'rgba(0, 245, 255, 0.4)';
    ctx.lineWidth = 1.2;
    ctx.setLineDash([2, 2]);
    ctx.beginPath();
    ctx.moveTo(probeX, padT);
    ctx.lineTo(probeX, padT + chartH);
    ctx.moveTo(padL, probeY);
    ctx.lineTo(w - padR, probeY);
    ctx.stroke();
    ctx.setLineDash([]);

    // Glowing halo
    ctx.fillStyle = 'rgba(0, 245, 255, 0.35)';
    ctx.beginPath();
    ctx.arc(probeX, probeY, 8, 0, Math.PI * 2);
    ctx.fill();

    // Center dot
    ctx.fillStyle = '#00f5ff';
    ctx.beginPath();
    ctx.arc(probeX, probeY, 4, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`${d.probeTempK.toFixed(1)}K`, probeX + 8, probeY - 4);
  }

  private renderFLIRChart(): void {
    const canvas = this.canvasFLIR;
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

    // 1. FLIR False-Color Thermal Spectrum Bar
    const grad = ctx.createLinearGradient(padL, 0, padL + barW, 0);
    grad.addColorStop(0.0, '#ffffff'); // Hottest
    grad.addColorStop(0.2, '#ef4444'); // Red
    grad.addColorStop(0.5, '#eab308'); // Yellow
    grad.addColorStop(0.75, '#06b6d4'); // Cyan
    grad.addColorStop(1.0, '#1e1b4b'); // Deep Blue (Coldest)

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.roundRect(padL, barY, barW, barH, 6);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Labels for Hot and Cold Ends
    ctx.fillStyle = '#ef4444';
    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`热端 T_H: ${Math.round(d.heatSourceTemp)}K`, padL, barY - 8);

    ctx.fillStyle = '#38bdf8';
    ctx.textAlign = 'right';
    ctx.fillText(`冷端 T_C: ${Math.round(d.coldSourceTemp)}K`, padL + barW, barY - 8);

    // Heat Flux Vector Arrows (--> --> -->)
    const arrowCount = 7;
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;

    for (let i = 1; i <= arrowCount; i++) {
      const ax = padL + (i / (arrowCount + 1)) * barW;
      const ay = barY + barH * 0.5;

      ctx.beginPath();
      ctx.moveTo(ax - 10, ay);
      ctx.lineTo(ax + 10, ay);
      ctx.lineTo(ax + 4, ay - 4);
      ctx.moveTo(ax + 10, ay);
      ctx.lineTo(ax + 4, ay + 4);
      ctx.stroke();
    }

    // 2. Direction Indicator & Heat Flux Values
    ctx.fillStyle = '#cbd5e1';
    ctx.font = '11px -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`导热方向: 热端 -> 冷端 (q = -k dT/dx = ${(d.localHeatFlux / 1000).toFixed(1)} kW/m²)`, w * 0.5, barY + barH + 24);

    // Composite Bar Junction Indicator
    if (d.material === 'composite') {
      const jx = padL + barW * 0.5;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3;
      ctx.setLineDash([3, 2]);
      ctx.beginPath();
      ctx.moveTo(jx, barY - 4);
      ctx.lineTo(jx, barY + barH + 4);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = '#f59e0b';
      ctx.font = 'bold 11px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('铜-钢过渡交界面', jx, barY + barH + 40);
    }

    // Probe position arrow on FLIR bar
    const px = padL + d.probePositionNorm * barW;
    ctx.fillStyle = '#00f5ff';
    ctx.beginPath();
    ctx.moveTo(px, barY + barH + 2);
    ctx.lineTo(px - 6, barY + barH + 12);
    ctx.lineTo(px + 6, barY + barH + 12);
    ctx.closePath();
    ctx.fill();
  }
}
