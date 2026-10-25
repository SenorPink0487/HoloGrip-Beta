export interface StereometryTouchZoomWidgetCallbacks {
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  onResetScale?: () => void;
}

export class StereometryTouchZoomWidget {
  private container: HTMLElement;
  private element: HTMLElement;
  private scaleTextEl: HTMLElement | null = null;
  private callbacks: StereometryTouchZoomWidgetCallbacks;
  private currentScale = 1.0;
  private isVisible = true;
  private bodyObserver: MutationObserver | null = null;

  constructor(callbacks: StereometryTouchZoomWidgetCallbacks = {}, parent: HTMLElement = document.body) {
    this.callbacks = callbacks;
    this.container = parent;
    this.createUI();
    this.bindEvents();
    this.initEnvironmentObserver();
  }

  private createUI(): void {
    // 若尚未注入样式则注入一次
    if (
      typeof document !== 'undefined' &&
      typeof document.getElementById === 'function' &&
      !document.getElementById('stereometry-touch-zoom-style')
    ) {
      const style = document.createElement('style');
      style.id = 'stereometry-touch-zoom-style';
      style.textContent = `
        .stereometry-touch-zoom-pill {
          position: fixed;
          bottom: calc(28px + env(safe-area-inset-bottom, 0px));
          right: calc(28px + env(safe-area-inset-right, 0px));
          display: flex;
          align-items: center;
          gap: 6px;
          height: 44px;
          padding: 0 6px;
          border-radius: 22px;
          background: rgba(15, 23, 42, 0.45);
          border: 0.5px solid rgba(255, 255, 255, 0.22);
          box-shadow: 0 8px 28px rgba(0, 0, 0, 0.32),
                      inset 0 1px 1px rgba(255, 255, 255, 0.25);
          backdrop-filter: blur(28px) saturate(190%);
          -webkit-backdrop-filter: blur(28px) saturate(190%);
          font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "SF Pro Text", "SF Pro Display", "Hiragino Sans GB", "Microsoft YaHei", sans-serif !important;
          z-index: 950;
          pointer-events: auto;
          user-select: none;
          -webkit-user-select: none;
          touch-action: manipulation;
          transition: transform 0.28s cubic-bezier(0.16, 1, 0.3, 1),
                      right 0.32s cubic-bezier(0.16, 1, 0.3, 1),
                      bottom 0.32s cubic-bezier(0.16, 1, 0.3, 1),
                      opacity 0.28s ease,
                      background 0.2s ease,
                      border-color 0.2s ease,
                      box-shadow 0.2s ease;
        }

        .stereometry-touch-zoom-pill:hover {
          background: rgba(15, 23, 42, 0.58);
          border-color: rgba(255, 255, 255, 0.36);
          box-shadow: 0 10px 32px rgba(0, 0, 0, 0.38),
                      inset 0 1px 1px rgba(255, 255, 255, 0.35);
        }

        /* 触控设备与移动端响应式布局：置于右下角底排、全息视窗按钮左侧，与上升下降按钮完全解耦错开，绝不重叠 */
        body.has-touch-controls .stereometry-touch-zoom-pill,
        @media (pointer: coarse) {
          .stereometry-touch-zoom-pill {
            bottom: calc(28px + env(safe-area-inset-bottom, 0px));
            right: calc(160px + env(safe-area-inset-right, 0px));
          }
        }

        @media (pointer: coarse) and (min-width: 768px) {
          .stereometry-touch-zoom-pill {
            height: 48px;
            border-radius: 24px;
            padding: 0 7px;
            gap: 7px;
            bottom: calc(36px + env(safe-area-inset-bottom, 0px));
            right: calc(186px + env(safe-area-inset-right, 0px));
          }
        }

        /* 手势追踪激活时，视窗启动器与升降胶囊优雅淡出，缩放胶囊顺滑归位到右下角基准位 */
        body.hand-tracking-active .stereometry-touch-zoom-pill {
          right: calc(28px + env(safe-area-inset-right, 0px)) !important;
          bottom: calc(28px + env(safe-area-inset-bottom, 0px)) !important;
        }
        @media (pointer: coarse) and (min-width: 768px) {
          body.hand-tracking-active .stereometry-touch-zoom-pill {
            right: calc(36px + env(safe-area-inset-right, 0px)) !important;
            bottom: calc(36px + env(safe-area-inset-bottom, 0px)) !important;
          }
        }

        .stereometry-touch-zoom-pill.hidden {
          opacity: 0;
          pointer-events: none !important;
          transform: translateY(12px) scale(0.92);
        }

        /* 返回白板或白板应用处于激活状态时自动隐藏 */
        body:not(.lab-active) .stereometry-touch-zoom-pill,
        body.lab-returning .stereometry-touch-zoom-pill,
        #whiteboard-app-root:not(.hidden-view) ~ .stereometry-touch-zoom-pill,
        #whiteboard-app-root:not(.hidden-view) ~ * .stereometry-touch-zoom-pill,
        .stereometry-touch-zoom-pill.hidden-by-env {
          opacity: 0 !important;
          pointer-events: none !important;
          visibility: hidden !important;
          transform: translateY(16px) scale(0.90) !important;
        }

        .zoom-touch-btn {
          width: 34px;
          height: 34px;
          border-radius: 50%;
          border: 0.5px solid rgba(255, 255, 255, 0.18);
          background: rgba(255, 255, 255, 0.08);
          box-shadow: inset 0 1px 1px rgba(255, 255, 255, 0.20);
          color: rgba(255, 255, 255, 0.92);
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          outline: none;
          padding: 0;
          margin: 0;
          touch-action: manipulation;
          -webkit-tap-highlight-color: transparent;
          transition: background 0.18s ease,
                      border-color 0.18s ease,
                      transform 0.12s ease,
                      box-shadow 0.18s ease,
                      color 0.18s ease;
        }

        @media (pointer: coarse) and (min-width: 768px) {
          .zoom-touch-btn {
            width: 38px;
            height: 38px;
          }
        }

        .zoom-touch-btn:hover {
          background: rgba(255, 255, 255, 0.18);
          border-color: rgba(255, 255, 255, 0.35);
          color: #ffffff;
          box-shadow: inset 0 1px 1px rgba(255, 255, 255, 0.35), 0 0 12px rgba(255, 255, 255, 0.15);
        }

        .zoom-touch-btn:active,
        .zoom-touch-btn.is-active {
          transform: scale(0.92);
          background: rgba(255, 255, 255, 0.28);
          border-color: rgba(255, 255, 255, 0.50);
          color: #ffffff;
        }

        .zoom-touch-btn svg {
          stroke: currentColor;
          transition: transform 0.15s ease;
        }

        .zoom-touch-btn:active svg {
          transform: scale(1.10);
        }

        /* 缩放指示器与重置徽章 */
        .zoom-touch-badge {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 0 10px;
          height: 34px;
          border-radius: 17px;
          border: 0.5px solid rgba(255, 255, 255, 0.18);
          background: rgba(255, 255, 255, 0.08);
          box-shadow: inset 0 1px 1px rgba(255, 255, 255, 0.20);
          color: #ffffff;
          cursor: pointer;
          outline: none;
          touch-action: manipulation;
          -webkit-tap-highlight-color: transparent;
          transition: background 0.18s ease,
                      border-color 0.18s ease,
                      transform 0.12s ease,
                      box-shadow 0.18s ease;
        }

        @media (pointer: coarse) and (min-width: 768px) {
          .zoom-touch-badge {
            height: 38px;
            padding: 0 12px;
            border-radius: 19px;
          }
        }

        .zoom-touch-badge:hover {
          background: rgba(255, 255, 255, 0.18);
          border-color: rgba(255, 255, 255, 0.35);
          box-shadow: inset 0 1px 1px rgba(255, 255, 255, 0.35), 0 0 12px rgba(255, 255, 255, 0.15);
        }

        .zoom-touch-badge:active {
          transform: scale(0.94);
          background: rgba(255, 255, 255, 0.28);
          border-color: rgba(255, 255, 255, 0.50);
        }

        .zoom-scale-percent {
          font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "SF Pro Text", "SF Pro Display", "Hiragino Sans GB", "Microsoft YaHei", sans-serif !important;
          font-size: 13px;
          font-weight: 600;
          font-variant-numeric: tabular-nums;
          letter-spacing: -0.2px;
          color: #ffffff;
          line-height: 1.1;
          white-space: nowrap;
        }

        .zoom-scale-hint {
          font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "SF Pro Text", "SF Pro Display", "Hiragino Sans GB", "Microsoft YaHei", sans-serif !important;
          font-size: 8.5px;
          font-weight: 500;
          color: rgba(255, 255, 255, 0.60);
          letter-spacing: -0.1px;
          line-height: 1;
          margin-top: 1px;
          white-space: nowrap;
        }
      `;
      document.head?.appendChild?.(style);
    }

    this.element = document.createElement('div');
    this.element.id = 'stereometry-touch-zoom';
    this.element.className = 'stereometry-touch-zoom-pill hud-interactive';
    this.element.setAttribute('role', 'toolbar');
    this.element.setAttribute('aria-label', '立体几何图像缩放控制器');

    // 阻止触控缩放胶囊上的指针事件穿透至画布触发误旋转
    this.element.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.element.addEventListener('pointermove', (e) => e.stopPropagation());
    this.element.addEventListener('pointerup', (e) => e.stopPropagation());

    this.element.innerHTML = `
      <!-- Zoom Out Button (-) -->
      <button type="button" class="zoom-touch-btn" id="btn-touch-zoom-out" aria-label="缩小立体几何图像" title="缩小 (快捷键 - 或双指捏合)">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke-width="2.2" stroke-linecap="round">
          <line x1="5" y1="12" x2="19" y2="12"/>
        </svg>
      </button>

      <!-- Current Scale Badge (Click to reset to 100%) -->
      <button type="button" class="zoom-touch-badge" id="btn-touch-zoom-reset" aria-label="还原大小为 100%" title="点击还原原始大小 100% (快捷键 0)">
        <span class="zoom-scale-percent" id="stereometry-scale-val">100%</span>
        <span class="zoom-scale-hint">双指捏合</span>
      </button>

      <!-- Zoom In Button (+) -->
      <button type="button" class="zoom-touch-btn" id="btn-touch-zoom-in" aria-label="放大立体几何图像" title="放大 (快捷键 + 或双指扩张)">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke-width="2.2" stroke-linecap="round">
          <line x1="12" y1="5" x2="12" y2="19"/>
          <line x1="5" y1="12" x2="19" y2="12"/>
        </svg>
      </button>
    `;

    this.scaleTextEl = this.element.querySelector('#stereometry-scale-val');
    this.container.appendChild(this.element);
  }

  private bindEvents(): void {
    const btnOut = this.element.querySelector('#btn-touch-zoom-out') as HTMLElement | null;
    const btnReset = this.element.querySelector('#btn-touch-zoom-reset') as HTMLElement | null;
    const btnIn = this.element.querySelector('#btn-touch-zoom-in') as HTMLElement | null;

    const setupBtn = (el: HTMLElement | null, action: () => void) => {
      if (!el) return;
      let lastTrigger = -Infinity;

      const trigger = (e?: Event) => {
        if (e && typeof e.preventDefault === 'function') e.preventDefault();
        if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
        const now = performance.now();
        if (now - lastTrigger < 120) return;
        lastTrigger = now;
        action();
      };

      el.addEventListener('touchstart', (e) => {
        e.stopPropagation();
        el.classList.add('is-active');
      }, { passive: false });

      el.addEventListener('touchend', (e) => {
        e.stopPropagation();
        el.classList.remove('is-active');
        trigger(e);
      }, { passive: false });

      el.addEventListener('touchcancel', () => {
        el.classList.remove('is-active');
      });

      el.addEventListener('click', (e) => {
        trigger(e);
      });
    };

    setupBtn(btnOut, () => {
      this.callbacks.onZoomOut?.();
    });

    setupBtn(btnReset, () => {
      this.callbacks.onResetScale?.();
    });

    setupBtn(btnIn, () => {
      this.callbacks.onZoomIn?.();
    });
  }

  public updateScale(scale: number): void {
    this.currentScale = scale;
    if (this.scaleTextEl) {
      this.scaleTextEl.textContent = `${Math.round(scale * 100)}%`;
    }
  }

  public getScale(): number {
    return this.currentScale;
  }

  public setVisible(visible: boolean): void {
    this.isVisible = visible;
    this.element.classList.toggle('hidden', !visible);
  }

  public getVisible(): boolean {
    return this.isVisible;
  }

  public getDOMElement(): HTMLElement {
    return this.element;
  }

  private initEnvironmentObserver(): void {
    if (typeof MutationObserver === 'function' && typeof document !== 'undefined' && document.body) {
      this.bodyObserver = new MutationObserver(() => {
        this.syncVisibilityWithEnvironment();
      });
      try {
        if (typeof (document.body as any).nodeType === 'number') {
          this.bodyObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });
        }
      } catch {}
      this.syncVisibilityWithEnvironment();
    }
  }

  public syncVisibilityWithEnvironment(): void {
    if (typeof document === 'undefined' || !document.body || !this.element) return;
    const isLabActive = typeof document.body.classList?.contains === 'function'
      ? document.body.classList.contains('lab-active')
      : true;
    const isLabReturning = typeof document.body.classList?.contains === 'function'
      ? document.body.classList.contains('lab-returning')
      : false;
    const wbRoot = typeof document.getElementById === 'function'
      ? document.getElementById('whiteboard-app-root')
      : null;
    const isWbVisible = wbRoot && typeof wbRoot.classList?.contains === 'function'
      ? !wbRoot.classList.contains('hidden-view')
      : false;

    // 当 DOM 中存在白板应用时，若白板可见或实验未激活/正在返回，则自动隐藏组件
    if (wbRoot && (isWbVisible || !isLabActive || isLabReturning)) {
      this.element.classList.add('hidden-by-env');
    } else {
      this.element.classList.remove('hidden-by-env');
    }
  }

  public destroy(): void {
    if (this.bodyObserver) {
      this.bodyObserver.disconnect();
      this.bodyObserver = null;
    }
    if (this.element) {
      if (typeof this.element.remove === 'function') {
        this.element.remove();
      } else if (this.element.parentNode) {
        this.element.parentNode.removeChild(this.element);
      }
    }
  }
}
