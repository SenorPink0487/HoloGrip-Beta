import type { IonHit } from '../../physics/em/massSpec.ts';
import { bindVisionSlider, isSliderActive } from './sliderGestureHelper.ts';

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
  private activeSliders = new Set<string>();

  constructor(onCommand: (cmd: MassSpecCommand) => void = () => {}) {
    this.onCommand = onCommand;
    this.element = document.createElement('div');
    this.element.className = 'vision-hall-status-card hud-interactive';
    this.element.innerHTML = `
      <div class="em-unified-container">
        <!-- 1. Apple Minimal Window Header matching Hall Effect -->
        <div class="hall-pure-header">
          <div class="hall-header-brand">
            <span class="hall-brand-title">磁聚焦质谱仪</span>
            <span class="hall-clean-badge">r = mv / qB</span>
          </div>

          <div class="hall-header-actions">
            <button class="apple-circle-btn" id="btn-top-reset-ms" title="重置基准">
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
              <span class="em-metric-label">主斑半径</span>
              <div class="em-val-main em-val-accent" id="ms-radius">—</div>
              <span class="em-sub-tag em-sub-cyan" id="ms-ion">狭缝全开</span>
            </div>
            <div class="em-metric-col">
              <span class="em-metric-label">加速电压</span>
              <div class="em-val-main" id="ms-v">2000 V</div>
              <span class="em-sub-tag" id="ms-sample">氢氦轻离子</span>
            </div>
            <div class="em-metric-col">
              <span class="em-metric-label">分析磁场 B</span>
              <div class="em-val-main em-val-accent" id="ms-b">-0.15 T</div>
              <span class="em-sub-tag" id="ms-flux">磁通</span>
            </div>
            <div class="em-metric-col">
              <span class="em-metric-label">探针 B</span>
              <div class="em-val-main" id="ms-probe">0.0 mT</div>
              <span class="em-sub-tag" id="ms-region">无场区</span>
            </div>
          </div>
        </div>

        <!-- 3. Dynamic Waveform & Controls Deck -->
        <div class="em-panels-deck">
          <!-- Left: Canvas Detector Plate -->
          <div class="em-panel-box">
            <div class="em-panel-head">
              <span class="em-panel-title">底板落点谱线分布（纵轴为透过率）</span>
            </div>
            <div class="em-canvas-wrap">
              <canvas id="canvas-mass" width="480" height="200"></canvas>
            </div>
          </div>

          <!-- Right: Sample & Field Controls Deck -->
          <div class="em-panel-box">
            <div class="em-panel-head">
              <span class="em-panel-title" id="ms-caption">不同质荷比同时落在底板上</span>
            </div>
            <div class="em-controls-stack">
              <div style="margin-bottom: 2px;">
                <select class="em-apple-select" id="ms-sample-select">
                  <option value="hydrogen">氢氦轻离子 (H⁺, H₂⁺, He⁺)</option>
                  <option value="neon">氖同位素 (²⁰Ne⁺, ²²Ne⁺)</option>
                  <option value="magnesium">镁同位素 (²⁴Mg⁺, ²⁵Mg⁺, ²⁶Mg⁺)</option>
                  <option value="chlorine">氯同位素 (³⁵Cl⁺, ³⁷Cl⁺)</option>
                </select>
              </div>
              <div class="em-slider-row">
                <div class="em-slider-label">
                  <span>加速电压</span>
                </div>
                <input type="range" class="hall-apple-slider" id="ms-accel" min="200" max="5000" step="20" value="2000" />
              </div>
              <div class="em-slider-row">
                <div class="em-slider-label">
                  <span>分析磁场强度</span>
                </div>
                <input type="range" class="hall-apple-slider" id="ms-field" min="0.05" max="0.5" step="0.01" value="0.15" />
              </div>
              <div class="em-slider-row">
                <div class="em-slider-label">
                  <span>狭缝开度</span>
                </div>
                <input type="range" class="hall-apple-slider" id="ms-jaw" min="0.02" max="1" step="0.01" value="1" />
              </div>
              <div class="em-slider-row">
                <div class="em-slider-label">
                  <span>速度选择器电压</span>
                </div>
                <input type="range" class="hall-apple-slider" id="ms-plate" min="0" max="900" step="1" value="0" />
              </div>
            </div>
          </div>
        </div>

        <!-- 4. Floating Action Dock Capsule -->
        <div style="display:flex; justify-content:center; flex-shrink:0;">
          <div class="em-dock-capsule">
            <button class="em-apple-btn" id="ms-flip" type="button">翻转分析磁场</button>
            <button class="em-apple-btn" id="ms-reset" type="button">黄金复位</button>
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
    if (!slider || isSliderActive(slider, this.activeSliders)) return;
    slider.value = String(value);
  }

  private bind(): void {
    this.element.querySelector('#ms-sample-select')?.addEventListener('change', (event) => {
      this.onCommand({ type: 'sample', id: (event.target as HTMLSelectElement).value });
    });

    const accelSlider = this.element.querySelector('#ms-accel') as HTMLInputElement | null;
    bindVisionSlider(accelSlider, {
      activeSet: this.activeSliders,
      onChange: (val) => this.onCommand({ type: 'accel', voltage: val }),
    });

    const fieldSlider = this.element.querySelector('#ms-field') as HTMLInputElement | null;
    bindVisionSlider(fieldSlider, {
      activeSet: this.activeSliders,
      onChange: (val) => this.onCommand({ type: 'field', tesla: val }),
    });

    const jawSlider = this.element.querySelector('#ms-jaw') as HTMLInputElement | null;
    bindVisionSlider(jawSlider, {
      activeSet: this.activeSliders,
      onChange: (val) => this.onCommand({ type: 'jaw', opening: val }),
    });

    const plateSlider = this.element.querySelector('#ms-plate') as HTMLInputElement | null;
    bindVisionSlider(plateSlider, {
      activeSet: this.activeSliders,
      onChange: (val) => this.onCommand({ type: 'plate', voltage: val }),
    });

    this.element.querySelector('#ms-flip')?.addEventListener('click', () => this.onCommand({ type: 'flip' }));
    this.element.querySelector('#ms-reset')?.addEventListener('click', () => this.onCommand({ type: 'reset' }));
    this.element.querySelector('#btn-top-reset-ms')?.addEventListener('click', () => this.onCommand({ type: 'reset' }));
  }

  private draw(): void {
    const canvas = this.canvas;
    const data = this.data;
    if (!canvas || !data) return;
    const ctx = canvas.getContext('2d');
    if (!ctx || typeof ctx.clearRect !== 'function' || typeof ctx.fillRect !== 'function') return;
    const w = canvas.width || 480;
    const h = canvas.height || 200;
    ctx.clearRect(0, 0, w, h);
    const reach = 0.32;
    const xOf = (hitY: number) => 28 + ((hitY + reach) / (2 * reach)) * (w - 56);
    
    // 基准线
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.beginPath();
    ctx.moveTo(28, h - 28);
    ctx.lineTo(w - 28, h - 28);
    ctx.stroke();

    for (const hit of data.hits) {
      if (!Number.isFinite(hit.hitY)) continue;
      const x = xOf(Math.max(-reach, Math.min(reach, hit.hitY)));
      const barH = Math.max(4, hit.transmission * (h - 56));
      
      // 统一霍尔青色的质谱峰
      ctx.fillStyle = '#64d2ff';
      ctx.fillRect(x - 5, h - 28 - barH, 10, barH);
      
      if (typeof ctx.fillText === 'function') {
        ctx.fillStyle = '#ffffff';
        ctx.font = '11px -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif';
        ctx.fillText(hit.ion.label, x - 14, h - 10);
      }
    }
  }
}
