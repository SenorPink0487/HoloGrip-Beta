export interface InductionTelemetry {
  axial: number;
  velocity: number;
  poleSign: 1 | -1;
  turns: number;
  resistanceOhm: number;
  probeAxial: number;
  magnetFieldTesla: number;
  probeFieldTesla: number;
  inducedFieldTesla: number;
  fluxLinkageWb: number;
  fluxSingleWb: number;
  emfVolt: number;
  currentAmp: number;
  caption: string;
  fluxHistory: number[];
  emfHistory: number[];
}

export type InductionCommand =
  | { type: 'turns'; turns: number }
  | { type: 'resistance'; ohm: number }
  | { type: 'flip' }
  | { type: 'pass' }
  | { type: 'reset' }
  | { type: 'axial'; axial: number }
  | { type: 'probe'; axial: number };

export class InductionStatusCard {
  public element: HTMLElement;
  private onCommand: (cmd: InductionCommand) => void;
  private isVisible = false;
  private data: InductionTelemetry | null = null;
  private canvas: HTMLCanvasElement | null = null;

  constructor(onCommand: (cmd: InductionCommand) => void = () => {}) {
    this.onCommand = onCommand;
    this.element = document.createElement('div');
    this.element.className = 'vision-thermo-status-card hud-interactive';
    this.element.innerHTML = `
      <div class="hall-pure-container">
        <div class="hall-pure-header">
          <div class="hall-header-brand">
            <span class="hall-brand-title">法拉第电磁感应</span>
            <span class="hall-clean-badge">ε = −dΨ/dt</span>
          </div>
        </div>
      <div class="thermo-card-container">
        <div class="thermo-metrics-deck">
          <div class="thermo-metric-card">
            <span class="thermo-metric-label">磁通链 Ψ</span>
            <div class="thermo-metric-value" id="ind-flux" style="color:#38bdf8;">0 mWb</div>
            <span class="thermo-metric-sub" id="ind-flux-sub">N∫B·dA</span>
          </div>
          <div class="thermo-metric-card">
            <span class="thermo-metric-label">感应电动势 ε</span>
            <div class="thermo-metric-value" id="ind-emf" style="color:#fbbf24;">0 mV</div>
            <span class="thermo-metric-sub" id="ind-current">I = 0 mA</span>
          </div>
          <div class="thermo-metric-card">
            <span class="thermo-metric-label">探针 B</span>
            <div class="thermo-metric-value" id="ind-probe" style="color:#22d3ee;">0 mT</div>
            <span class="thermo-metric-sub" id="ind-bmag">线圈中心 B</span>
          </div>
          <div class="thermo-metric-card">
            <span class="thermo-metric-label">感应磁场</span>
            <div class="thermo-metric-value" id="ind-bind" style="color:#a855f7;">0 μT</div>
            <span class="thermo-metric-sub">楞次定律方向</span>
          </div>
        </div>
        <div class="thermo-charts-deck">
          <div class="thermo-chart-box">
            <div class="thermo-chart-header"><span class="thermo-chart-title">Ψ 与 ε 随时间</span></div>
            <div class="thermo-canvas-wrap"><canvas id="canvas-induction" width="480" height="220"></canvas></div>
          </div>
          <div class="thermo-chart-box">
            <div class="thermo-chart-header"><span class="thermo-chart-title" id="ind-caption">磁铁静止，磁通不变</span></div>
            <span class="thermo-metric-sub">磁铁位置</span>
            <input type="range" class="thermo-mini-slider" id="ind-axial" min="-0.18" max="0.26" step="0.01" value="0.22" />
            <span class="thermo-metric-sub">探针位置</span>
            <input type="range" class="thermo-mini-slider" id="ind-probe-slider" min="-0.18" max="0.26" step="0.01" value="0" />
            <span class="thermo-metric-sub">匝数 <span id="ind-turns-label">200</span></span>
            <input type="range" class="thermo-mini-slider" id="ind-turns" min="50" max="800" step="50" value="200" />
            <span class="thermo-metric-sub">回路电阻 <span id="ind-r-label">8 Ω</span></span>
            <input type="range" class="thermo-mini-slider" id="ind-r" min="1" max="40" step="0.5" value="8" />
          </div>
        </div>
        <div class="carnot-control-deck">
          <div class="carnot-btn-group">
            <button class="carnot-btn" id="ind-flip" type="button">翻转 N/S</button>
            <button class="carnot-btn" id="ind-pass" type="button">匀速穿过</button>
            <button class="carnot-btn" id="ind-reset" type="button">黄金复位</button>
          </div>
        </div>
      </div>
      </div>
    `;
    this.canvas = this.element.querySelector('#canvas-induction') as HTMLCanvasElement;
    this.bind();
  }

  public setVisible(visible: boolean): void {
    this.isVisible = visible;
    this.element.style.display = visible ? 'flex' : 'none';
    if (visible) this.draw();
  }

  public updateTelemetry(data: InductionTelemetry): void {
    this.data = data;
    const flux = this.element.querySelector('#ind-flux');
    const emf = this.element.querySelector('#ind-emf');
    const current = this.element.querySelector('#ind-current');
    const probe = this.element.querySelector('#ind-probe');
    const bmag = this.element.querySelector('#ind-bmag');
    const bind = this.element.querySelector('#ind-bind');
    const caption = this.element.querySelector('#ind-caption');
    if (flux) flux.textContent = `${(data.fluxLinkageWb * 1000).toFixed(2)} mWb`;
    if (emf) emf.textContent = `${(data.emfVolt * 1000).toFixed(1)} mV`;
    if (current) current.textContent = `I = ${(data.currentAmp * 1000).toFixed(1)} mA`;
    if (probe) probe.textContent = `${(data.probeFieldTesla * 1000).toFixed(2)} mT`;
    if (bmag) bmag.textContent = `线圈中心 ${(data.magnetFieldTesla * 1000).toFixed(2)} mT`;
    if (bind) bind.textContent = `${(data.inducedFieldTesla * 1e6).toFixed(1)} μT`;
    if (caption) caption.textContent = data.caption;
    this.setSlider('#ind-axial', data.axial);
    this.setSlider('#ind-probe-slider', data.probeAxial);
    this.setSlider('#ind-turns', data.turns);
    this.setSlider('#ind-r', data.resistanceOhm);
    const turnsLabel = this.element.querySelector('#ind-turns-label');
    const rLabel = this.element.querySelector('#ind-r-label');
    if (turnsLabel) turnsLabel.textContent = String(data.turns);
    if (rLabel) rLabel.textContent = `${data.resistanceOhm.toFixed(1)} Ω`;
    if (this.isVisible) this.draw();
  }

  private setSlider(selector: string, value: number): void {
    const slider = this.element.querySelector(selector) as HTMLInputElement | null;
    if (!slider || document.activeElement === slider) return;
    slider.value = String(value);
  }

  private bind(): void {
    this.element.querySelector('#ind-axial')?.addEventListener('input', (event) => {
      this.onCommand({ type: 'axial', axial: parseFloat((event.target as HTMLInputElement).value) });
    });
    this.element.querySelector('#ind-probe-slider')?.addEventListener('input', (event) => {
      this.onCommand({ type: 'probe', axial: parseFloat((event.target as HTMLInputElement).value) });
    });
    this.element.querySelector('#ind-turns')?.addEventListener('input', (event) => {
      this.onCommand({ type: 'turns', turns: parseFloat((event.target as HTMLInputElement).value) });
    });
    this.element.querySelector('#ind-r')?.addEventListener('input', (event) => {
      this.onCommand({ type: 'resistance', ohm: parseFloat((event.target as HTMLInputElement).value) });
    });
    this.element.querySelector('#ind-flip')?.addEventListener('click', () => this.onCommand({ type: 'flip' }));
    this.element.querySelector('#ind-pass')?.addEventListener('click', () => this.onCommand({ type: 'pass' }));
    this.element.querySelector('#ind-reset')?.addEventListener('click', () => this.onCommand({ type: 'reset' }));
  }

  private draw(): void {
    const canvas = this.canvas;
    const data = this.data;
    if (!canvas || !data) return;
    const ctx = canvas.getContext('2d');
    if (!ctx || typeof ctx.clearRect !== 'function') return;
    const w = canvas.width || 480;
    const h = canvas.height || 220;
    ctx.clearRect(0, 0, w, h);
    const flux = data.fluxHistory;
    const emf = data.emfHistory;
    if (flux.length < 2) return;
    const fMax = Math.max(1e-4, ...flux.map((v) => Math.abs(v)));
    const eMax = Math.max(1e-4, ...emf.map((v) => Math.abs(v)));
    const plot = (series: number[], max: number, color: string) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      series.forEach((value, index) => {
        const x = 16 + (index / (series.length - 1)) * (w - 32);
        const y = h / 2 - (value / max) * (h * 0.38);
        if (index === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    };
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.beginPath();
    ctx.moveTo(16, h / 2);
    ctx.lineTo(w - 16, h / 2);
    ctx.stroke();
    plot(flux, fMax, '#38bdf8');
    plot(emf, eMax, '#fbbf24');
  }
}
