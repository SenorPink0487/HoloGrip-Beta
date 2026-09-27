import type { IonHit } from '../../physics/em/massSpec.ts';

export interface MassSpecTelemetry {
  sampleId: string;
  sampleName: string;
  accelVoltage: number;
  analyzerBz: number;
  plateVoltage: number;
  jawOpening: number;
  probeTesla: number;
  probeRegion: string;
  fluxWb: number;
  caption: string;
  hits: IonHit[];
}

export type MassSpecCommand =
  | { type: 'sample'; id: string }
  | { type: 'accel'; voltage: number }
  | { type: 'field'; tesla: number }
  | { type: 'jaw'; opening: number }
  | { type: 'plate'; voltage: number }
  | { type: 'flip' }
  | { type: 'reset' };

export class MassSpecStatusCard {
  public element: HTMLElement;
  private onCommand: (cmd: MassSpecCommand) => void;
  private isVisible = false;
  private data: MassSpecTelemetry | null = null;
  private canvas: HTMLCanvasElement | null = null;

  constructor(onCommand: (cmd: MassSpecCommand) => void = () => {}) {
    this.onCommand = onCommand;
    this.element = document.createElement('div');
    this.element.className = 'vision-thermo-status-card hud-interactive';
    this.element.innerHTML = `
      <div class="hall-pure-container">
        <div class="hall-pure-header">
          <div class="hall-header-brand">
            <span class="hall-brand-title">磁聚焦质谱仪</span>
            <span class="hall-clean-badge">r = mv / qB</span>
          </div>
        </div>
      <div class="thermo-card-container">
        <div class="thermo-metrics-deck">
          <div class="thermo-metric-card">
            <span class="thermo-metric-label">主斑半径</span>
            <div class="thermo-metric-value" id="ms-radius" style="color:#facc15;">—</div>
            <span class="thermo-metric-sub" id="ms-ion">狭缝全开</span>
          </div>
          <div class="thermo-metric-card">
            <span class="thermo-metric-label">加速电压</span>
            <div class="thermo-metric-value" id="ms-v" style="color:#f59e0b;">2000 V</div>
            <span class="thermo-metric-sub" id="ms-sample">氢氦轻离子</span>
          </div>
          <div class="thermo-metric-card">
            <span class="thermo-metric-label">分析磁场 B</span>
            <div class="thermo-metric-value" id="ms-b" style="color:#38bdf8;">-0.15 T</div>
            <span class="thermo-metric-sub" id="ms-flux">磁通</span>
          </div>
          <div class="thermo-metric-card">
            <span class="thermo-metric-label">探针 B</span>
            <div class="thermo-metric-value" id="ms-probe" style="color:#22d3ee;">0 mT</div>
            <span class="thermo-metric-sub" id="ms-region">无场区</span>
          </div>
        </div>
        <div class="thermo-charts-deck">
          <div class="thermo-chart-box">
            <div class="thermo-chart-header"><span class="thermo-chart-title">底板落点（纵轴为透过率）</span></div>
            <div class="thermo-canvas-wrap"><canvas id="canvas-mass" width="480" height="220"></canvas></div>
          </div>
          <div class="thermo-chart-box">
            <div class="thermo-chart-header"><span class="thermo-chart-title" id="ms-caption">不同质荷比同时落在底板上</span></div>
            <select class="carnot-select" id="ms-sample-select">
              <option value="hydrogen">氢氦轻离子</option>
              <option value="neon">氖同位素</option>
              <option value="magnesium">镁同位素</option>
              <option value="chlorine">氯同位素</option>
            </select>
            <span class="thermo-metric-sub">加速电压</span>
            <input type="range" class="thermo-mini-slider" id="ms-accel" min="200" max="5000" step="20" value="2000" />
            <span class="thermo-metric-sub">分析磁场强弱</span>
            <input type="range" class="thermo-mini-slider" id="ms-field" min="0.05" max="0.5" step="0.01" value="0.15" />
            <span class="thermo-metric-sub">狭缝开度</span>
            <input type="range" class="thermo-mini-slider" id="ms-jaw" min="0.02" max="1" step="0.01" value="1" />
            <span class="thermo-metric-sub">选择器电压</span>
            <input type="range" class="thermo-mini-slider" id="ms-plate" min="0" max="900" step="1" value="0" />
          </div>
        </div>
        <div class="carnot-control-deck">
          <div class="carnot-btn-group">
            <button class="carnot-btn" id="ms-flip" type="button">翻转分析磁场</button>
            <button class="carnot-btn" id="ms-reset" type="button">黄金复位</button>
          </div>
        </div>
      </div>
      </div>
    `;
    this.canvas = this.element.querySelector('#canvas-mass') as HTMLCanvasElement;
    this.bind();
  }

  public setVisible(visible: boolean): void {
    this.isVisible = visible;
    this.element.style.display = visible ? 'flex' : 'none';
    if (visible) this.draw();
  }

  public updateTelemetry(data: MassSpecTelemetry): void {
    this.data = data;
    const ranked = [...data.hits].sort((a, b) => b.transmission - a.transmission);
    const best = ranked[0];
    const landed = data.hits.filter((hit) => hit.onPlate && Number.isFinite(hit.radiusM));
    const radius = this.element.querySelector('#ms-radius');
    const ion = this.element.querySelector('#ms-ion');
    const voltage = this.element.querySelector('#ms-v');
    const sample = this.element.querySelector('#ms-sample');
    const field = this.element.querySelector('#ms-b');
    const flux = this.element.querySelector('#ms-flux');
    const probe = this.element.querySelector('#ms-probe');
    const region = this.element.querySelector('#ms-region');
    const caption = this.element.querySelector('#ms-caption');
    if (radius) {
      if (landed.length >= 2) {
        const low = landed[0].radiusM * 100;
        const high = landed[landed.length - 1].radiusM * 100;
        radius.textContent = `${low.toFixed(1)}–${high.toFixed(1)} cm`;
      } else if (landed.length === 1) {
        radius.textContent = `${(landed[0].radiusM * 100).toFixed(1)} cm`;
      } else {
        radius.textContent = '未上板';
      }
    }
    if (ion) ion.textContent = landed.length > 1 ? `${landed.length} 条谱线` : (best ? best.ion.label : '无离子');
    if (voltage) voltage.textContent = `${Math.round(data.accelVoltage)} V`;
    if (sample) sample.textContent = data.sampleName;
    if (field) field.textContent = `${data.analyzerBz.toFixed(2)} T`;
    if (flux) flux.textContent = `极面磁通 ${(data.fluxWb * 1000).toFixed(2)} mWb`;
    if (probe) probe.textContent = `${(data.probeTesla * 1000).toFixed(1)} mT`;
    if (region) region.textContent = data.probeRegion;
    if (caption) caption.textContent = data.caption;
    this.setSlider('#ms-accel', data.accelVoltage);
    this.setSlider('#ms-field', Math.abs(data.analyzerBz));
    this.setSlider('#ms-jaw', data.jawOpening);
    this.setSlider('#ms-plate', data.plateVoltage);
    const select = this.element.querySelector('#ms-sample-select') as HTMLSelectElement | null;
    if (select && document.activeElement !== select) select.value = data.sampleId;
    if (this.isVisible) this.draw();
  }

  private setSlider(selector: string, value: number): void {
    const slider = this.element.querySelector(selector) as HTMLInputElement | null;
    if (!slider || document.activeElement === slider) return;
    slider.value = String(value);
  }

  private bind(): void {
    this.element.querySelector('#ms-sample-select')?.addEventListener('change', (event) => {
      this.onCommand({ type: 'sample', id: (event.target as HTMLSelectElement).value });
    });
    this.element.querySelector('#ms-accel')?.addEventListener('input', (event) => {
      this.onCommand({ type: 'accel', voltage: parseFloat((event.target as HTMLInputElement).value) });
    });
    this.element.querySelector('#ms-field')?.addEventListener('input', (event) => {
      this.onCommand({ type: 'field', tesla: parseFloat((event.target as HTMLInputElement).value) });
    });
    this.element.querySelector('#ms-jaw')?.addEventListener('input', (event) => {
      this.onCommand({ type: 'jaw', opening: parseFloat((event.target as HTMLInputElement).value) });
    });
    this.element.querySelector('#ms-plate')?.addEventListener('input', (event) => {
      this.onCommand({ type: 'plate', voltage: parseFloat((event.target as HTMLInputElement).value) });
    });
    this.element.querySelector('#ms-flip')?.addEventListener('click', () => this.onCommand({ type: 'flip' }));
    this.element.querySelector('#ms-reset')?.addEventListener('click', () => this.onCommand({ type: 'reset' }));
  }

  private draw(): void {
    const canvas = this.canvas;
    const data = this.data;
    if (!canvas || !data) return;
    const ctx = canvas.getContext('2d');
    if (!ctx || typeof ctx.clearRect !== 'function' || typeof ctx.fillRect !== 'function') return;
    const w = canvas.width || 480;
    const h = canvas.height || 220;
    ctx.clearRect(0, 0, w, h);
    const reach = 0.32;
    const xOf = (hitY: number) => 28 + ((hitY + reach) / (2 * reach)) * (w - 56);
    ctx.strokeStyle = 'rgba(255,255,255,0.16)';
    ctx.beginPath();
    ctx.moveTo(28, h - 28);
    ctx.lineTo(w - 28, h - 28);
    ctx.stroke();
    for (const hit of data.hits) {
      if (!Number.isFinite(hit.hitY)) continue;
      const x = xOf(Math.max(-reach, Math.min(reach, hit.hitY)));
      const barH = Math.max(4, hit.transmission * (h - 56));
      ctx.fillStyle = `#${hit.ion.color.toString(16).padStart(6, '0')}`;
      ctx.fillRect(x - 6, h - 28 - barH, 12, barH);
      if (typeof ctx.fillText === 'function') {
        ctx.fillStyle = '#e2e8f0';
        ctx.font = '11px sans-serif';
        ctx.fillText(hit.ion.label, x - 16, h - 10);
      }
    }
  }
}
