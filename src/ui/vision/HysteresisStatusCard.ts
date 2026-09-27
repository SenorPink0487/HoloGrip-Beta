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
    this.element.className = 'vision-thermo-status-card hud-interactive';
    this.element.innerHTML = `
      <div class="hall-pure-container">
        <div class="hall-pure-header">
          <div class="hall-header-brand">
            <span class="hall-brand-title">磁滞回线</span>
            <span class="hall-clean-badge">B = μ₀(H + M)</span>
          </div>
        </div>
      <div class="thermo-card-container">
        <div class="thermo-metrics-deck">
          <div class="thermo-metric-card">
            <span class="thermo-metric-label">磁场强度 H</span>
            <div class="thermo-metric-value" id="hy-h" style="color:#f59e0b;">0 A/m</div>
            <span class="thermo-metric-sub" id="hy-i">励磁电流 0 A</span>
          </div>
          <div class="thermo-metric-card">
            <span class="thermo-metric-label">探针 B</span>
            <div class="thermo-metric-value" id="hy-b" style="color:#38bdf8;">0 T</div>
            <span class="thermo-metric-sub" id="hy-mat">硅钢片</span>
          </div>
          <div class="thermo-metric-card">
            <span class="thermo-metric-label">搜索线圈磁通</span>
            <div class="thermo-metric-value" id="hy-flux" style="color:#22d3ee;">0 mWb</div>
            <span class="thermo-metric-sub" id="hy-br">剩磁</span>
          </div>
          <div class="thermo-metric-card">
            <span class="thermo-metric-label">每周磁滞损耗</span>
            <div class="thermo-metric-value" id="hy-area" style="color:#c084fc;">0 J/m³</div>
            <span class="thermo-metric-sub" id="hy-hc">矫顽力</span>
          </div>
        </div>
        <div class="thermo-charts-deck">
          <div class="thermo-chart-box">
            <div class="thermo-chart-header"><span class="thermo-chart-title">B–H 回线</span></div>
            <div class="thermo-canvas-wrap"><canvas id="canvas-hysteresis" width="480" height="220"></canvas></div>
          </div>
          <div class="thermo-chart-box">
            <div class="thermo-chart-header"><span class="thermo-chart-title" id="hy-caption">初始磁化曲线</span></div>
            <select class="carnot-select" id="hy-material">
              <option value="silicon-steel">硅钢片</option>
              <option value="soft-iron">软铁</option>
              <option value="carbon-steel">碳钢</option>
              <option value="ferrite">铁氧体</option>
            </select>
            <span class="thermo-metric-sub">励磁 H</span>
            <input type="range" class="thermo-mini-slider" id="hy-slider" min="-9000" max="9000" step="50" value="0" />
          </div>
        </div>
        <div class="carnot-control-deck">
          <div class="carnot-btn-group">
            <button class="carnot-btn" id="hy-sweep" type="button">自动扫描</button>
            <button class="carnot-btn" id="hy-reset" type="button">黄金复位</button>
          </div>
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
    if (sweep) sweep.textContent = data.auto ? '停止扫描' : '自动扫描';
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
  }

  private draw(): void {
    const canvas = this.canvas;
    const data = this.data;
    if (!canvas || !data) return;
    const ctx = canvas.getContext('2d');
    if (!ctx || typeof ctx.clearRect !== 'function') return;
    const w = canvas.width || 480;
    const h = canvas.height || 220;
    const hMax = 9000;
    const bMax = 2;
    const xOf = (H: number) => 36 + ((H + hMax) / (2 * hMax)) * (w - 56);
    const yOf = (B: number) => h / 2 - (B / bMax) * (h * 0.4);
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(255,255,255,0.16)';
    ctx.beginPath();
    ctx.moveTo(36, h / 2);
    ctx.lineTo(w - 20, h / 2);
    ctx.moveTo(xOf(0), 16);
    ctx.lineTo(xOf(0), h - 16);
    ctx.stroke();
    ctx.strokeStyle = '#c084fc';
    ctx.lineWidth = 2;
    ctx.beginPath();
    data.loop.forEach((point, index) => {
      const x = xOf(point.h);
      const y = yOf(point.b);
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    if (typeof ctx.arc === 'function') {
      ctx.fillStyle = '#f8fafc';
      ctx.beginPath();
      ctx.arc(xOf(data.H), yOf(data.B), 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
