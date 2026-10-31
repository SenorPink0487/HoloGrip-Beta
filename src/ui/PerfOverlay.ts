import type { ComputeBridge } from '../core/platform/ComputeBridge';
import type { PlatformBridge } from '../core/platform/PlatformBridge';
import { isTextInputActive } from '../core/focus.ts';

export class PerfOverlay {
  private element: HTMLElement;
  private fpsEl: HTMLElement | null = null;
  private latencyEl: HTMLElement | null = null;
  private computeEl: HTMLElement | null = null;
  private backendEl: HTMLElement | null = null;
  private renderTimeEl: HTMLElement | null = null;
  private headroomEl: HTMLElement | null = null;
  private vsyncEl: HTMLElement | null = null;
  private statusDotEl: HTMLElement | null = null;
  private popoverEl: HTMLElement | null = null;
  private isVisible = false;
  private isDetailsOpen = false;

  private frameCount = 0;
  private lastTime = performance.now();
  private fps = 60;
  private frameTime = 16.6;
  private renderTimeSum = 0;
  private renderCount = 0;
  private lastRenderTimeMs = 1.2;
  private detectedRefreshRate = 60;
  private lastFrameInstant = performance.now();
  private highRefreshStreak120 = 0;
  private highRefreshStreak144 = 0;
  private stable60Count = 0;

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
          <span class="perf-pill-val perf-fps" id="perf-fps-val">--</span>
          <span class="perf-pill-unit">FPS</span>
        </div>
        <div class="perf-pill-divider"></div>
        <div class="perf-pill-item">
          <span class="perf-pill-label">延迟</span>
          <span class="perf-pill-val" id="perf-latency-val">-- ms</span>
        </div>
      </div>
      <div class="perf-details-popover" id="perf-details-popover">
        <div class="perf-detail-row">
          <span class="perf-detail-label">3D 渲染耗时 (GPU)</span>
          <span class="perf-detail-val perf-render" id="perf-render-val">-- ms</span>
        </div>
        <div class="perf-detail-row">
          <span class="perf-detail-label">渲染算力天花板</span>
          <span class="perf-detail-val perf-fps" id="perf-headroom-val">-- FPS</span>
        </div>
        <div class="perf-detail-row">
          <span class="perf-detail-label">屏幕硬件刷新率</span>
          <span class="perf-detail-val perf-vsync" id="perf-vsync-val">-- Hz</span>
        </div>
        <div class="perf-detail-row">
          <span class="perf-detail-label">多核算力耗时</span>
          <span class="perf-detail-val perf-compute" id="perf-compute-val">空闲 (待机)</span>
        </div>
        <div class="perf-detail-row">
          <span class="perf-detail-label">计算后端</span>
          <span class="perf-detail-val" id="perf-backend-val">--</span>
        </div>
      </div>
    `;

    this.container.appendChild(this.element);
    this.element.classList.toggle('hidden', !this.isVisible);

    this.fpsEl = this.element.querySelector('#perf-fps-val');
    this.latencyEl = this.element.querySelector('#perf-latency-val');
    this.renderTimeEl = this.element.querySelector('#perf-render-val');
    this.headroomEl = this.element.querySelector('#perf-headroom-val');
    this.vsyncEl = this.element.querySelector('#perf-vsync-val');
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
        !isTextInputActive()
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

  public update(delta: number, renderDuration = 0): void {
    this.frameCount++;
    if (renderDuration > 0) {
      this.renderTimeSum += renderDuration;
      this.renderCount++;
    }
    const now = performance.now();
    const frameDeltaMs = now - this.lastFrameInstant;
    this.lastFrameInstant = now;

    // 基于多帧连击防抖嗅探高刷时间槽（连续多帧 <= 10.2ms 确认 120Hz，<= 7.8ms 确认 144Hz，避免单帧偶发抖动误判）
    if (frameDeltaMs > 0) {
      if (frameDeltaMs <= 7.8) {
        this.highRefreshStreak144++;
        this.highRefreshStreak120++;
      } else if (frameDeltaMs <= 10.2) {
        this.highRefreshStreak120++;
        this.highRefreshStreak144 = 0;
      } else {
        this.highRefreshStreak120 = 0;
        this.highRefreshStreak144 = 0;
      }

      if (this.highRefreshStreak144 >= 6 && this.detectedRefreshRate < 144) {
        this.detectedRefreshRate = 144;
      } else if (this.highRefreshStreak120 >= 6 && this.detectedRefreshRate < 120) {
        this.detectedRefreshRate = 120;
      }
    }

    const elapsed = now - this.lastTime;

    if (elapsed >= 500) {
      const realFps = Math.max(1, Math.round((this.frameCount * 1000) / elapsed));
      const avgRenderMs = this.renderCount > 0 ? this.renderTimeSum / this.renderCount : this.lastRenderTimeMs;
      this.lastRenderTimeMs = avgRenderMs;
      const headroomFps = avgRenderMs > 0 ? Math.round(1000 / avgRenderMs) : 1000;
      const realFrameIntervalMs = Number((elapsed / this.frameCount).toFixed(1));

      // 动态采样识别显示器的硬件最高刷新率（如 60Hz, 120Hz ProMotion, 144Hz 等）
      if (realFps >= 135) {
        this.detectedRefreshRate = 144;
        this.stable60Count = 0;
      } else if (realFps >= 105) {
        this.detectedRefreshRate = 120;
        this.stable60Count = 0;
      } else if (realFps >= 75) {
        if (this.detectedRefreshRate < 90) this.detectedRefreshRate = 90;
        this.stable60Count = 0;
      } else if (this.detectedRefreshRate > 60) {
        // 如果显示器处于 60Hz（或系统低电量模式），连续 3 个采样窗口（1.5秒）帧率稳定在 65 以下，自动校准回 60Hz 避免红字假阳性
        if (realFps <= 65) {
          this.stable60Count++;
          if (this.stable60Count >= 3) {
            this.detectedRefreshRate = 60;
            this.stable60Count = 0;
          }
        } else {
          this.stable60Count = 0;
        }
      }

      // 铁律：帧率必须真实呈现浏览器 rAF 实际递交至显示器的帧率，绝不造假
      this.fps = realFps;
      this.frameTime = realFrameIntervalMs;

      this.frameCount = 0;
      this.renderTimeSum = 0;
      this.renderCount = 0;
      this.lastTime = now;

      // 帧率状态颜色与警示（适配当前屏幕的实际目标刷新率与纯黑高对比度统一风格）
      const targetFps = this.detectedRefreshRate;
      let dotColor = '#30d158'; // 绿（平稳跑满硬件刷新率）
      let fpsColor = '#000000'; // 纯黑高对比度
      if (this.fps < targetFps * 0.7) {
        dotColor = '#ff453a'; // 严重掉帧（低于标称刷新率 70%）
        fpsColor = '#dc2626';
      } else if (this.fps < targetFps - 4) {
        dotColor = '#ff9f0a'; // 轻度波动
        fpsColor = '#d97706';
      }

      if (this.fpsEl) {
        this.fpsEl.textContent = `${this.fps}`;
        this.fpsEl.style.color = fpsColor;
      }

      if (this.statusDotEl) {
        this.statusDotEl.style.background = dotColor;
        this.statusDotEl.style.boxShadow = `0 0 10px ${dotColor}`;
      }

      if (this.latencyEl) {
        this.latencyEl.textContent = `${this.frameTime} ms`;
      }

      if (this.renderTimeEl) {
        this.renderTimeEl.textContent = `${avgRenderMs.toFixed(1)} ms`;
      }

      if (this.headroomEl) {
        this.headroomEl.textContent = headroomFps >= 1000 ? '1000+ FPS' : `${headroomFps} FPS`;
      }

      if (this.vsyncEl) {
        this.vsyncEl.textContent = `${this.detectedRefreshRate} Hz`;
      }

      if (this.computeEl) {
        const metrics = this.computeBridge.currentMetrics as any;
        if (metrics.isIdle || metrics.avgComputeTimeMs === 0) {
          this.computeEl.textContent = '空闲 (待机)';
          this.computeEl.style.color = '#94a3b8';
        } else {
          const computeMs = metrics.avgComputeTimeMs.toFixed(2);
          this.computeEl.textContent = `${computeMs} ms (活跃)`;
          this.computeEl.style.color = '#38bdf8';
        }
      }
    }
  }
}
