import type { ComputeBridge } from '../core/platform/ComputeBridge';
import type { PlatformBridge } from '../core/platform/PlatformBridge';

export class PerfOverlay {
  private element: HTMLElement;
  private fpsEl: HTMLElement | null = null;
  private latencyEl: HTMLElement | null = null;
  private computeEl: HTMLElement | null = null;
  private backendEl: HTMLElement | null = null;
  private isVisible = false;

  private frameCount = 0;
  private lastTime = performance.now();
  private fps = 60;
  private frameTime = 16.6;

  constructor(
    private computeBridge: ComputeBridge,
    private platform: PlatformBridge,
    private container: HTMLElement = document.body
  ) {
    this.initDOM();
    this.bindEvents();
  }

  private initDOM(): void {
    this.element = document.createElement('div');
    this.element.id = 'perf-overlay';
    this.element.className = 'hud-panel hud-perf-hud';
    this.element.innerHTML = `
      <div class="perf-row">
        <span class="perf-label">FPS</span>
        <span class="perf-value perf-fps" id="perf-fps-val">--</span>
      </div>
      <div class="perf-row">
        <span class="perf-label">渲染延迟</span>
        <span class="perf-value" id="perf-latency-val">-- ms</span>
      </div>
      <div class="perf-row">
        <span class="perf-label">多核算力耗时</span>
        <span class="perf-value perf-compute" id="perf-compute-val">-- ms</span>
      </div>
      <div class="perf-row perf-sub-row">
        <span class="perf-label">计算后端</span>
        <span class="perf-value" id="perf-backend-val">--</span>
      </div>
    `;

    this.container.appendChild(this.element);

    this.fpsEl = this.element.querySelector('#perf-fps-val');
    this.latencyEl = this.element.querySelector('#perf-latency-val');
    this.computeEl = this.element.querySelector('#perf-compute-val');
    this.backendEl = this.element.querySelector('#perf-backend-val');

    if (this.backendEl) {
      const isTauri = this.platform.info.isTauri;
      this.backendEl.textContent = isTauri
        ? `Rust Rayon (${this.platform.info.logicalCores}核)`
        : `Worker池 (${this.platform.info.logicalCores}核)`;
    }
  }

  private bindEvents(): void {
    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyP' && !e.ctrlKey && !e.metaKey && document.activeElement?.tagName !== 'INPUT') {
        this.toggle();
      }
    });
  }

  public toggle(visible?: boolean): boolean {
    this.isVisible = visible !== undefined ? visible : !this.isVisible;
    this.element.classList.toggle('visible', this.isVisible);
    return this.isVisible;
  }

  public get visible(): boolean {
    return this.isVisible;
  }

  public update(delta: number): void {
    this.frameCount++;
    const now = performance.now();
    const elapsed = now - this.lastTime;

    if (elapsed >= 500) {
      this.fps = Math.round((this.frameCount * 1000) / elapsed);
      this.frameTime = Number((elapsed / this.frameCount).toFixed(1));
      this.frameCount = 0;
      this.lastTime = now;

      if (this.fpsEl) {
        this.fpsEl.textContent = `${this.fps}`;
        if (this.fps >= 55) {
          this.fpsEl.style.color = '#34c759';
        } else if (this.fps >= 30) {
          this.fpsEl.style.color = '#ff9f0a';
        } else {
          this.fpsEl.style.color = '#ff453a';
        }
      }

      if (this.latencyEl) {
        this.latencyEl.textContent = `${this.frameTime} ms`;
      }

      if (this.computeEl) {
        const metrics = this.computeBridge.currentMetrics;
        const computeMs = metrics.avgComputeTimeMs.toFixed(2);
        this.computeEl.textContent = `${computeMs} ms`;
      }
    }
  }
}
