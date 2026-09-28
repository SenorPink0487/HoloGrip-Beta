export interface HysteresisTelemetry {
  materialId: string;
  materialName: string;
  H: number;
  B: number;
  currentAmp: number;
  probeTesla: number;
  fluxWb: number;
  area: number;
  remanence: number;
  coercivity: number;
  major: boolean;
  auto: boolean;
  caption: string;
  loop: Array<{ h: number; b: number }>;
}

export type HysteresisCommand =
  | { type: 'material'; id: string }
  | { type: 'field'; H: number }
  | { type: 'sweep' }
  | { type: 'reset' };

export class HysteresisStatusCard {
  public element: HTMLElement;
  private onCommand: (cmd: HysteresisCommand) => void;
  private isVisible = false;
  private data: HysteresisTelemetry | null = null;
  private canvas: HTMLCanvasElement | null = null;

  constructor(onCommand: (cmd: HysteresisCommand) => void = () => {}) {
    this.onCommand = onCommand;
    this.element = document.createElement('div');
    this.element.className = 'vision-hall-status-card hud-interactive';
    this.element.innerHTML = `
      <div class="em-unified-container">
        <!-- 1. Apple Minimal Window Header matching Hall Effect -->
        <div class="hall-pure-header">
          <div class="hall-header-brand">
            <span class="hall-brand-title">磁滞回线</span>
            <span class="hall-clean-badge">B = μ₀(H + M)</span>
          </div>

          <div class="hall-header-actions">
            <button class="apple-circle-btn" id="btn-top-reset-hy" title="重置基准">
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
              <span class="em-metric-label">磁场强度 H</span>
              <div class="em-val-main" id="hy-h">0 A/m</div>
              <span class="em-sub-tag" id="hy-i">励磁电流 0 A</span>
            </div>
            <div class="em-metric-col">
              <span class="em-metric-label">探针 B</span>
              <div class="em-val-main em-val-accent" id="hy-b">0.000 T</div>
              <span class="em-sub-tag em-sub-cyan" id="hy-mat">硅钢片</span>
            </div>
            <div class="em-metric-col">
              <span class="em-metric-label">搜索线圈磁通</span>
              <div class="em-val-main" id="hy-flux">0.00 mWb</div>
              <span class="em-sub-tag" id="hy-br">剩磁</span>
            </div>
            <div class="em-metric-col">
              <span class="em-metric-label">每周磁滞损耗</span>
              <div class="em-val-main em-val-accent" id="hy-area">0 J/m³</div>
              <span class="em-sub-tag" id="hy-hc">矫顽力</span>
            </div>
          </div>
        </div>

        <!-- 3. Dynamic Waveform & Controls Deck -->
        <div class="em-panels-deck">
          <!-- Left: Canvas B-H Curve -->
          <div class="em-panel-box">
            <div class="em-panel-head">
              <span class="em-panel-title">B–H 磁滞回线</span>
            </div>
            <div class="em-canvas-wrap">
              <canvas id="canvas-hysteresis" width="480" height="200"></canvas>
            </div>
          </div>

          <!-- Right: Material & Excitation Studio -->
          <div class="em-panel-box">
            <div class="em-panel-head">
              <span class="em-panel-title" id="hy-caption">初始磁化曲线</span>
            </div>
            <div class="em-controls-stack">
              <div style="margin-bottom: 2px;">
                <select class="em-apple-select" id="hy-material">
                  <option value="silicon-steel">硅钢片 (Silicon Steel)</option>
                  <option value="soft-iron">软铁 (Soft Iron)</option>
                  <option value="carbon-steel">碳钢 (Carbon Steel)</option>
                  <option value="ferrite">铁氧体 (Ferrite)</option>
                </select>
              </div>
              <div class="em-slider-row">
                <div class="em-slider-label">
                  <span>励磁强度 H</span>
                </div>
                <input type="range" class="hall-apple-slider" id="hy-slider" min="-9000" max="9000" step="50" value="0" />
              </div>
            </div>
          </div>
        </div>

        <!-- 4. Floating Action Dock Capsule -->
        <div style="display:flex; justify-content:center; flex-shrink:0;">
          <div class="em-dock-capsule">
            <button class="em-apple-btn" id="hy-sweep" type="button">自动扫描</button>
            <button class="em-apple-btn" id="hy-reset" type="button">黄金复位</button>
          </div>
        </div>
      </div>
    `;
    this.canvas = this.element.querySelector('#canvas-hysteresis') as HTMLCanvasElement;
    this.bind();
  }

  public setVisible(visible: boolean): void {
    this.isVisible = visible;
    this.element.style.display = visible ? 'flex' : 'none';
    if (visible) this.draw();
  }

  public updateTelemetry(data: HysteresisTelemetry): void {
    this.data = data;
    const h = this.element.querySelector('#hy-h');
    const i = this.element.querySelector('#hy-i');
    const b = this.element.querySelector('#hy-b');
    const mat = this.element.querySelector('#hy-mat');
    const flux = this.element.querySelector('#hy-flux');
    const br = this.element.querySelector('#hy-br');
    const area = this.element.querySelector('#hy-area');
    const hc = this.element.querySelector('#hy-hc');
    const caption = this.element.querySelector('#hy-caption');
    const sweep = this.element.querySelector('#hy-sweep');
    if (h) h.textContent = `${Math.round(data.H)} A/m`;
    if (i) i.textContent = `励磁电流 ${data.currentAmp.toFixed(2)} A`;
    if (b) b.textContent = `${data.probeTesla.toFixed(3)} T`;
    if (mat) mat.textContent = data.materialName;
    if (flux) flux.textContent = `${(data.fluxWb * 1000).toFixed(2)} mWb`;
    if (br) br.textContent = `剩磁 ${data.remanence.toFixed(2)} T`;
    if (area) area.textContent = `${Math.round(data.area)} J/m³`;
    if (hc) hc.textContent = `矫顽力 ${Math.round(data.coercivity)} A/m`;
    if (caption) caption.textContent = data.caption;
    if (sweep) {
      sweep.textContent = data.auto ? '停止扫描' : '自动扫描';
      if (data.auto) {
        sweep.classList.add('active');
      } else {
        sweep.classList.remove('active');
      }
    }
    this.setSlider('#hy-slider', data.H);
    const select = this.element.querySelector('#hy-material') as HTMLSelectElement | null;
    if (select && document.activeElement !== select) select.value = data.materialId;
    if (this.isVisible) this.draw();
  }

  private setSlider(selector: string, value: number): void {
    const slider = this.element.querySelector(selector) as HTMLInputElement | null;
    if (!slider || document.activeElement === slider) return;
    slider.value = String(value);
  }

  private bind(): void {
    this.element.querySelector('#hy-material')?.addEventListener('change', (event) => {
      this.onCommand({ type: 'material', id: (event.target as HTMLSelectElement).value });
    });
    this.element.querySelector('#hy-slider')?.addEventListener('input', (event) => {
      this.onCommand({ type: 'field', H: parseFloat((event.target as HTMLInputElement).value) });
    });
    this.element.querySelector('#hy-sweep')?.addEventListener('click', () => this.onCommand({ type: 'sweep' }));
    this.element.querySelector('#hy-reset')?.addEventListener('click', () => this.onCommand({ type: 'reset' }));
    this.element.querySelector('#btn-top-reset-hy')?.addEventListener('click', () => this.onCommand({ type: 'reset' }));
  }

  private draw(): void {
    const canvas = this.canvas;
    const data = this.data;
    if (!canvas || !data) return;
    const ctx = canvas.getContext('2d');
    if (!ctx || typeof ctx.clearRect !== 'function') return;
    const w = canvas.width || 480;
    const h = canvas.height || 200;
    const hMax = 9000;
    const bMax = 2;
    const xOf = (H: number) => 36 + ((H + hMax) / (2 * hMax)) * (w - 56);
    const yOf = (B: number) => h / 2 - (B / bMax) * (h * 0.4);
    ctx.clearRect(0, 0, w, h);
    
    // Axes
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.beginPath();
    ctx.moveTo(36, h / 2);
    ctx.lineTo(w - 20, h / 2);
    ctx.moveTo(xOf(0), 16);
    ctx.lineTo(xOf(0), h - 16);
    ctx.stroke();

    // B-H curve in unified Hall cyan
    ctx.strokeStyle = '#64d2ff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    data.loop.forEach((point, index) => {
      const x = xOf(point.h);
      const y = yOf(point.b);
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // Active operating point in crisp white with halo
    if (typeof ctx.arc === 'function' && typeof ctx.fill === 'function') {
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(xOf(data.H), yOf(data.B), 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
