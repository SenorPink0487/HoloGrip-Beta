import { bindVisionSlider, isSliderActive } from './sliderGestureHelper.ts';
import type { GeneratorOutputType } from '../../physics/em/generator.ts';

export interface GeneratorTelemetry {
  rpm: number;
  outputType: GeneratorOutputType;
  magFieldTesla: number;
  turns: number;
  emfVolt: number;
  currentAmp: number;
  bulbPowerWatt: number;
  bulbBrightness: number;
  circuitClosed: boolean;
  bulbConnected: boolean;
  caption: string;
  emfHistory: number[];
  angleRad: number;
}

export type GeneratorCommand =
  | { type: 'outputType'; outputType: GeneratorOutputType }
  | { type: 'boost' }
  | { type: 'magField'; field: number }
  | { type: 'turns'; turns: number }
  | { type: 'toggleSwitch' }
  | { type: 'toggleBulb' }
  | { type: 'reset' };

export class GeneratorStatusCard {
  public element: HTMLElement;
  private onCommand: (cmd: GeneratorCommand) => void;
  private isVisible = false;
  private data: GeneratorTelemetry | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private activeSliders = new Set<string>();

  constructor(onCommand: (cmd: GeneratorCommand) => void = () => {}) {
    this.onCommand = onCommand;
    this.element = document.createElement('div');
    this.element.className = 'vision-hall-status-card hud-interactive';
    this.element.innerHTML = `
      <div class="em-unified-container">
        <!-- 1. Header -->
        <div class="hall-pure-header">
          <div class="hall-header-brand">
            <span class="hall-brand-title">旋转线圈发电机 (动生电动势)</span>
            <span class="hall-clean-badge" id="gen-formula-badge">ε = NBSω·sin(θ)</span>
          </div>

          <div class="hall-header-actions">
            <button class="apple-circle-btn" id="btn-top-reset-gen" title="重置基准">
              <svg class="apple-sf-icon" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">
                <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
                <path d="M3 3v5h5"/>
              </svg>
            </button>
          </div>
        </div>

        <!-- 2. Metrics Deck -->
        <div class="em-stage">
          <div class="em-metric-grid">
            <div class="em-metric-col">
              <span class="em-metric-label">转速 RPM</span>
              <div class="em-val-main" id="gen-rpm">0 RPM</div>
              <span class="em-sub-tag" id="gen-omega-tag">ω = 0.0 rad/s</span>
            </div>
            <div class="em-metric-col">
              <span class="em-metric-label">动生电动势 ε</span>
              <div class="em-val-main em-val-accent" id="gen-emf">0.00 V</div>
              <span class="em-sub-tag em-sub-cyan" id="gen-current">I = 0.0 mA</span>
            </div>
            <div class="em-metric-col">
              <span class="em-metric-label">输出模式</span>
              <div class="em-val-main" id="gen-mode-text">交流 (双滑环)</div>
              <span class="em-sub-tag" id="gen-mode-sub">正弦波交流电</span>
            </div>
            <div class="em-metric-col">
              <span class="em-metric-label">灯泡发光功率</span>
              <div class="em-val-main em-val-accent" id="gen-power">0.0 mW</div>
              <span class="em-sub-tag" id="gen-power-sub">白炽灯发亮中</span>
            </div>
          </div>
        </div>

        <!-- 3. Dynamic Waveform & Controls Deck -->
        <div class="em-panels-deck">
          <!-- Left: Waveform Scope Canvas -->
          <div class="em-panel-box">
            <div class="em-panel-head">
              <span class="em-panel-title">动生电动势实时时域波形</span>
              <div class="em-panel-legend">
                <span style="display:flex; align-items:center; gap:4px;">
                  <span style="width:7px; height:7px; border-radius:50%; background:#38bdf8; display:inline-block;"></span>
                  <span id="gen-legend-text">ε (AC 正弦波)</span>
                </span>
              </div>
            </div>
            <div class="em-canvas-wrap">
              <canvas id="canvas-generator" width="480" height="200"></canvas>
            </div>
          </div>

          <!-- Right: Control Deck -->
          <div class="em-panel-box">
            <div class="em-panel-head">
              <span class="em-panel-title" id="gen-caption">静止状态，手摇曲柄可发电</span>
            </div>
            <div class="em-controls-stack">
              <!-- Mode Toggle Segmented Pills -->
              <div style="display:flex; gap:8px; margin-bottom:6px;">
                <button class="em-apple-btn active" id="btn-mode-ac" type="button" style="flex:1;">双滑环 (AC 交流)</button>
                <button class="em-apple-btn" id="btn-mode-dc" type="button" style="flex:1;">换向器 (DC 直流)</button>
              </div>

              <div class="em-slider-row">
                <div class="em-slider-label">
                  <span>磁感应强度 B</span>
                  <span class="em-slider-val" id="gen-b-label">0.40 T</span>
                </div>
                <input type="range" class="hall-apple-slider" id="gen-b" min="0.10" max="1.00" step="0.05" value="0.40" />
              </div>

              <div class="em-slider-row">
                <div class="em-slider-label">
                  <span>转子线圈匝数 N</span>
                  <span class="em-slider-val" id="gen-turns-label">200</span>
                </div>
                <input type="range" class="hall-apple-slider" id="gen-turns" min="50" max="600" step="50" value="200" />
              </div>
            </div>
          </div>
        </div>

        <!-- 4. Floating Action Dock -->
        <div style="display:flex; justify-content:center; flex-shrink:0;">
          <div class="em-dock-capsule">
            <button class="em-apple-btn" id="gen-boost" type="button">⚡ 手摇加速</button>
            <button class="em-apple-btn" id="gen-toggle-bulb" type="button">💡 切换负载灯泡</button>
            <button class="em-apple-btn" id="gen-reset" type="button">重置静止</button>
          </div>
        </div>
      </div>
    `;

    this.canvas = this.element.querySelector('#canvas-generator') as HTMLCanvasElement;
    this.bind();
  }

  public setVisible(visible: boolean): void {
    this.isVisible = visible;
    this.element.style.display = visible ? 'flex' : 'none';
    if (visible) this.draw();
  }

  public updateTelemetry(data: GeneratorTelemetry): void {
    this.data = data;
    const rpmEl = this.element.querySelector('#gen-rpm');
    const omegaEl = this.element.querySelector('#gen-omega-tag');
    const emfEl = this.element.querySelector('#gen-emf');
    const currentEl = this.element.querySelector('#gen-current');
    const modeText = this.element.querySelector('#gen-mode-text');
    const modeSub = this.element.querySelector('#gen-mode-sub');
    const powerEl = this.element.querySelector('#gen-power');
    const powerSub = this.element.querySelector('#gen-power-sub');
    const captionEl = this.element.querySelector('#gen-caption');
    const formulaBadge = this.element.querySelector('#gen-formula-badge');
    const legendText = this.element.querySelector('#gen-legend-text');

    if (rpmEl) rpmEl.textContent = `${Math.round(data.rpm)} RPM`;
    if (omegaEl) omegaEl.textContent = `ω = ${((data.rpm * 2 * Math.PI) / 60).toFixed(1)} rad/s`;
    if (emfEl) emfEl.textContent = `${data.emfVolt.toFixed(2)} V`;
    if (currentEl) currentEl.textContent = `I = ${(data.currentAmp * 1000).toFixed(1)} mA`;

    const isAc = data.outputType === 'ac';
    if (modeText) modeText.textContent = isAc ? '交流 (双滑环)' : '直流 (换向器)';
    if (modeSub) modeSub.textContent = isAc ? '正弦波交流电' : '单向脉动直流电';
    if (formulaBadge) formulaBadge.textContent = isAc ? 'ε = NBSω·sin(θ)' : 'ε = NBSω·|sin(θ)|';
    if (legendText) legendText.textContent = isAc ? 'ε (AC 正弦波)' : 'ε (DC 脉动直流)';

    // 模式切换按钮高亮同步
    const btnAc = this.element.querySelector('#btn-mode-ac');
    const btnDc = this.element.querySelector('#btn-mode-dc');
    if (btnAc) btnAc.classList.toggle('active', isAc);
    if (btnDc) btnDc.classList.toggle('active', !isAc);

    if (powerEl) powerEl.textContent = `${(data.bulbPowerWatt * 1000).toFixed(1)} mW`;
    if (powerSub) {
      powerSub.textContent = data.bulbConnected
        ? data.bulbBrightness > 0.05
          ? `白炽灯发光中 (${Math.round(data.bulbBrightness * 100)}%)`
          : '灯泡负载已接入'
        : '灯泡已断开';
    }

    if (captionEl) captionEl.textContent = data.caption;

    this.setSlider('#gen-b', data.magFieldTesla);
    this.setSlider('#gen-turns', data.turns);

    const bLabel = this.element.querySelector('#gen-b-label');
    const turnsLabel = this.element.querySelector('#gen-turns-label');
    if (bLabel) bLabel.textContent = `${data.magFieldTesla.toFixed(2)} T`;
    if (turnsLabel) turnsLabel.textContent = String(data.turns);

    if (this.isVisible) this.draw();
  }

  private setSlider(selector: string, value: number): void {
    const slider = this.element.querySelector(selector) as HTMLInputElement | null;
    if (!slider || isSliderActive(slider, this.activeSliders)) return;
    slider.value = String(value);
  }

  private bind(): void {
    const bSlider = this.element.querySelector('#gen-b') as HTMLInputElement | null;
    const bLabel = this.element.querySelector('#gen-b-label');
    bindVisionSlider(bSlider, {
      activeSet: this.activeSliders,
      onChange: (val) => this.onCommand({ type: 'magField', field: val }),
      onScrub: (val) => { if (bLabel) bLabel.textContent = `${val.toFixed(2)} T`; },
    });

    const turnsSlider = this.element.querySelector('#gen-turns') as HTMLInputElement | null;
    const turnsLabel = this.element.querySelector('#gen-turns-label');
    bindVisionSlider(turnsSlider, {
      activeSet: this.activeSliders,
      onChange: (val) => this.onCommand({ type: 'turns', turns: Math.round(val) }),
      onScrub: (val) => { if (turnsLabel) turnsLabel.textContent = String(Math.round(val)); },
    });

    this.element.querySelector('#btn-mode-ac')?.addEventListener('click', () => {
      this.onCommand({ type: 'outputType', outputType: 'ac' });
    });
    this.element.querySelector('#btn-mode-dc')?.addEventListener('click', () => {
      this.onCommand({ type: 'outputType', outputType: 'dc' });
    });

    this.element.querySelector('#gen-boost')?.addEventListener('click', () => this.onCommand({ type: 'boost' }));
    this.element.querySelector('#gen-toggle-bulb')?.addEventListener('click', () => this.onCommand({ type: 'toggleBulb' }));
    this.element.querySelector('#gen-reset')?.addEventListener('click', () => this.onCommand({ type: 'reset' }));
    this.element.querySelector('#btn-top-reset-gen')?.addEventListener('click', () => this.onCommand({ type: 'reset' }));
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

    const history = data.emfHistory;
    if (history.length < 2) return;

    const maxVal = Math.max(0.5, ...history.map((v) => Math.abs(v)));

    // 中线
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(16, h / 2);
    ctx.lineTo(w - 16, h / 2);
    ctx.stroke();

    // 示波器波形
    ctx.strokeStyle = data.outputType === 'ac' ? '#38bdf8' : '#facc15';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    history.forEach((val, idx) => {
      const x = 16 + (idx / (history.length - 1)) * (w - 32);
      const y = h / 2 - (val / maxVal) * (h * 0.40);
      if (idx === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }
}
