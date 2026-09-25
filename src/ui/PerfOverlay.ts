import type { ComputeBridge } from '../core/platform/ComputeBridge';
import type { PlatformBridge } from '../core/platform/PlatformBridge';

export class PerfOverlay {
  private element: HTMLElement;
  private fpsEl: HTMLElement | null = null;
  private latencyEl: HTMLElement | null = null;
  private computeEl: HTMLElement | null = null;
  private backendEl: HTMLElement | null = null;
  private statusDotEl: HTMLElement | null = null;
  private popoverEl: HTMLElement | null = null;
  private isVisible = true;
  private isDetailsOpen = false;

  private frameCount = 0;
  private lastTime = performance.now();
  private fps = 60;
  private frameTime = 16.6;

  private computeBridge: ComputeBridge;
  private platform: PlatformBridge;
  private container: HTMLElement;

  constructor(
    computeBridge: ComputeBridge,
    platform: PlatformBridge,
    container: HTMLElement = document.body
  ) {
    this.computeBridge = computeBridge;
    this.platform = platform;
    this.container = container;
    this.initDOM();
    this.bindEvents();
  }

  private initDOM(): void {
    this.element = document.createElement('div');
    this.element.id = 'perf-overlay';
    this.element.innerHTML = `
      <div class="perf-pill-capsule" id="perf-pill-toggle" title="点击查看性能详情 (P)">
        <span class="perf-status-dot" id="perf-status-dot"></span>
        <div class="perf-pill-item">
          <span class="perf-pill-label">帧率</span>
          <span class="perf-pill-val perf-fps" id="perf-fps-val">60</span>
          <span class="perf-pill-unit">FPS</span>
        </div>
        <div class="perf-pill-divider"></div>
        <div class="perf-pill-item">
          <span class="perf-pill-label">延迟</span>
          <span class="perf-pill-val" id="perf-latency-val">16.6 ms</span>
        </div>
      </div>
      <div class="perf-details-popover" id="perf-details-popover">
        <div class="perf-detail-row">
          <span class="perf-detail-label">多核算力耗时</span>
          <span class="perf-detail-val perf-compute" id="perf-compute-val">-- ms</span>
        </div>
        <div class="perf-detail-row">
          <span class="perf-detail-label">计算后端</span>
          <span class="perf-detail-val" id="perf-backend-val">--</span>
        </div>
      </div>
    `;

    this.container.appendChild(this.element);

    this.fpsEl = this.element.querySelector('#perf-fps-val');
    this.latencyEl = this.element.querySelector('#perf-latency-val');
    this.computeEl = this.element.querySelector('#perf-compute-val');
    this.backendEl = this.element.querySelector('#perf-backend-val');
    this.statusDotEl = this.element.querySelector('#perf-status-dot');
    this.popoverEl = this.element.querySelector('#perf-details-popover');

    const toggleBtn = this.element.querySelector('#perf-pill-toggle');
    toggleBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleDetails();
    });

    if (this.backendEl) {
      const isTauri = this.platform.info.isTauri;
      this.backendEl.textContent = isTauri
        ? `Rust Rayon (${this.platform.info.logicalCores}核)`
        : `Worker池 (${this.platform.info.logicalCores}核)`;
    }
  }

  private bindEvents(): void {
    window.addEventListener('keydown', (e) => {
      if (
        e.code === 'KeyP' &&
        !e.ctrlKey &&
        !e.metaKey &&
        document.activeElement?.tagName !== 'INPUT' &&
        document.activeElement?.tagName !== 'TEXTAREA' &&
        !(document.activeElement as HTMLElement)?.isContentEditable
      ) {
        this.toggle();
      }
    });

    document.addEventListener('click', (e) => {
      if (this.isDetailsOpen && !this.element.contains(e.target as Node)) {
        this.toggleDetails(false);
      }
    });
  }

  public toggleDetails(open?: boolean): void {
    this.isDetailsOpen = open !== undefined ? open : !this.isDetailsOpen;
    this.popoverEl?.classList.toggle('open', this.isDetailsOpen);
  }

  public toggle(visible?: boolean): boolean {
    this.isVisible = visible !== undefined ? visible : !this.isVisible;
    this.element.classList.toggle('hidden', !this.isVisible);
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

      let color = '#34c759';
      if (this.fps < 30) {
        color = '#ff453a';
      } else if (this.fps < 55) {
        color = '#ff9f0a';
      }

      if (this.fpsEl) {
        this.fpsEl.textContent = `${this.fps}`;
        this.fpsEl.style.color = color;
      }

      if (this.statusDotEl) {
        this.statusDotEl.style.background = color;
        this.statusDotEl.style.boxShadow = `0 0 8px ${color}`;
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
