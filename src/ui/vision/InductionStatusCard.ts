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
    this.element.className = 'vision-hall-status-card hud-interactive';
    this.element.innerHTML = `
      <div class="em-unified-container">
        <!-- 1. Apple Minimal Window Header matching Hall Effect -->
        <div class="hall-pure-header">
          <div class="hall-header-brand">
            <span class="hall-brand-title">法拉第电磁感应</span>
            <span class="hall-clean-badge">ε = −dΨ/dt</span>
          </div>

          <div class="hall-header-actions">
            <button class="apple-circle-btn" id="btn-top-reset-ind" title="重置基准">
              <svg class="apple-sf-icon" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">
                <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
                <path d="M3 3v5h5"/>
              </svg>
            </button>
          </div>
        </div>

        <!-- 2. Hero Centerpiece Stage with hairlines & Hall color tokens -->
        <div class="em-stage">
          <div class="em-metric-grid">
            <div class="em-metric-col">
              <span class="em-metric-label">磁通链 Ψ</span>
              <div class="em-val-main" id="ind-flux">0.00 mWb</div>
              <span class="em-sub-tag" id="ind-flux-sub">N∫B·dA</span>
            </div>
            <div class="em-metric-col">
              <span class="em-metric-label">感应电动势 ε</span>
              <div class="em-val-main em-val-accent" id="ind-emf">0.0 mV</div>
              <span class="em-sub-tag em-sub-cyan" id="ind-current">I = 0.0 mA</span>
            </div>
            <div class="em-metric-col">
              <span class="em-metric-label">探针 B</span>
              <div class="em-val-main" id="ind-probe">0.00 mT</div>
              <span class="em-sub-tag" id="ind-bmag">线圈中心 B</span>
            </div>
            <div class="em-metric-col">
              <span class="em-metric-label">感应磁场</span>
              <div class="em-val-main em-val-accent" id="ind-bind">0.0 μT</div>
              <span class="em-sub-tag">楞次定律反向</span>
            </div>
          </div>
        </div>

        <!-- 3. Dynamic Waveform & Controls Deck -->
        <div class="em-panels-deck">
          <!-- Left: Canvas Waveform Chart -->
          <div class="em-panel-box">
            <div class="em-panel-head">
              <span class="em-panel-title">Ψ 与 ε 动态时域波形</span>
              <div class="em-panel-legend">
                <span style="display:flex; align-items:center; gap:4px;">
                  <span style="width:7px; height:7px; border-radius:50%; background:#64d2ff; display:inline-block;"></span>
                  <span>Ψ (磁通)</span>
                </span>
                <span style="display:flex; align-items:center; gap:4px;">
                  <span style="width:7px; height:7px; border-radius:50%; background:#ffffff; display:inline-block;"></span>
                  <span>ε (电动势)</span>
                </span>
              </div>
            </div>
            <div class="em-canvas-wrap">
              <canvas id="canvas-induction" width="480" height="200"></canvas>
            </div>
          </div>

          <!-- Right: Parameter Control Deck -->
          <div class="em-panel-box">
            <div class="em-panel-head">
              <span class="em-panel-title" id="ind-caption">磁铁静止，磁通不变</span>
            </div>
            <div class="em-controls-stack">
              <div class="em-slider-row">
                <div class="em-slider-label">
                  <span>磁铁位置</span>
                </div>
                <input type="range" class="hall-apple-slider" id="ind-axial" min="-0.18" max="0.26" step="0.01" value="0.22" />
              </div>
              <div class="em-slider-row">
                <div class="em-slider-label">
                  <span>探针位置</span>
                </div>
                <input type="range" class="hall-apple-slider" id="ind-probe-slider" min="-0.18" max="0.26" step="0.01" value="0" />
              </div>
              <div class="em-slider-row">
                <div class="em-slider-label">
                  <span>线圈匝数</span>
                  <span class="em-slider-val" id="ind-turns-label">200</span>
                </div>
                <input type="range" class="hall-apple-slider" id="ind-turns" min="50" max="800" step="50" value="200" />
              </div>
              <div class="em-slider-row">
                <div class="em-slider-label">
                  <span>回路电阻</span>
                  <span class="em-slider-val" id="ind-r-label">8.0 Ω</span>
                </div>
                <input type="range" class="hall-apple-slider" id="ind-r" min="1" max="40" step="0.5" value="8" />
              </div>
            </div>
          </div>
        </div>

        <!-- 4. Floating Action Dock Capsule -->
        <div style="display:flex; justify-content:center; flex-shrink:0;">
          <div class="em-dock-capsule">
            <button class="em-apple-btn" id="ind-flip" type="button">翻转 N/S</button>
            <button class="em-apple-btn" id="ind-pass" type="button">匀速穿过</button>
            <button class="em-apple-btn" id="ind-reset" type="button">黄金复位</button>
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
    this.element.querySelector('#btn-top-reset-ind')?.addEventListener('click', () => this.onCommand({ type: 'reset' }));
  }

  private draw(): void {
    const canvas = this.canvas;
    const data = this.data;
    if (!canvas || !data) return;
    const ctx = canvas.getContext('2d');
    if (!ctx || typeof ctx.clearRect !== 'function') return;
    const w = canvas.width || 480;
    const h = canvas.height || 200;
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
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.beginPath();
    ctx.moveTo(16, h / 2);
    ctx.lineTo(w - 16, h / 2);
    ctx.stroke();
    plot(flux, fMax, '#64d2ff');
    plot(emf, eMax, '#ffffff');
  }
}
