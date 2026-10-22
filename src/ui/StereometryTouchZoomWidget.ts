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
          bottom: calc(32px + env(safe-area-inset-bottom, 0px));
          right: calc(32px + env(safe-area-inset-right, 0px));
          display: flex;
          align-items: center;
          gap: 6px;
          height: 44px;
          padding: 0 6px;
          border-radius: 22px;
          background: rgba(255, 255, 255, 0.72);
          border: 0.5px solid rgba(0, 0, 0, 0.12);
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12),
                      inset 0 1px 1px rgba(255, 255, 255, 0.85);
          backdrop-filter: blur(28px) saturate(180%);
          -webkit-backdrop-filter: blur(28px) saturate(180%);
          font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "SF Pro Text", "SF Pro Display", "Hiragino Sans GB", "Microsoft YaHei", sans-serif !important;
          z-index: 950;
          pointer-events: auto;
          user-select: none;
          -webkit-user-select: none;
          touch-action: manipulation;
          transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1),
                      opacity 0.25s ease,
                      background 0.2s ease,
                      border-color 0.2s ease,
                      box-shadow 0.2s ease;
        }

        .stereometry-touch-zoom-pill:hover {
          background: rgba(255, 255, 255, 0.85);
          border-color: rgba(0, 0, 0, 0.18);
          box-shadow: 0 10px 28px rgba(0, 0, 0, 0.16),
                      inset 0 1px 1px rgba(255, 255, 255, 0.95);
        }

        /* 触控设备与 iPad 响应式布局：位于 Vision 启动按钮正上方 */
        body.has-touch-controls .stereometry-touch-zoom-pill,
        @media (pointer: coarse) {
          .stereometry-touch-zoom-pill {
            bottom: calc(100px + env(safe-area-inset-bottom, 0px));
            right: calc(32px + env(safe-area-inset-right, 0px));
          }
        }

        @media (pointer: coarse) and (min-width: 768px) {
          .stereometry-touch-zoom-pill {
            height: 48px;
            border-radius: 24px;
            padding: 0 6px;
            gap: 7px;
            bottom: calc(112px + env(safe-area-inset-bottom, 0px));
            right: calc(40px + env(safe-area-inset-right, 0px));
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
          border: 0.5px solid rgba(0, 0, 0, 0.12);
          background: rgba(0, 0, 0, 0.05);
          box-shadow: inset 0 1px 1px rgba(255, 255, 255, 0.3);
          color: #000000;
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
          background: rgba(0, 0, 0, 0.09);
          border-color: rgba(0, 0, 0, 0.2);
          color: #000000;
          box-shadow: inset 0 1px 1px rgba(255, 255, 255, 0.4), 0 2px 8px rgba(0, 0, 0, 0.08);
        }

        .zoom-touch-btn:active,
        .zoom-touch-btn.is-active {
          transform: scale(0.92);
          background: rgba(0, 0, 0, 0.14);
          color: #000000;
        }

        .zoom-touch-btn svg {
          stroke: #000000;
          transition: transform 0.15s ease;
        }

        .zoom-touch-btn:active svg {
          transform: scale(1.08);
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
          border: 0.5px solid rgba(0, 0, 0, 0.12);
          background: rgba(0, 0, 0, 0.05);
          box-shadow: inset 0 1px 1px rgba(255, 255, 255, 0.3);
          color: #000000;
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
          background: rgba(0, 0, 0, 0.09);
          border-color: rgba(0, 0, 0, 0.2);
          box-shadow: inset 0 1px 1px rgba(255, 255, 255, 0.4), 0 2px 8px rgba(0, 0, 0, 0.08);
        }

        .zoom-touch-badge:active {
          transform: scale(0.94);
          background: rgba(0, 0, 0, 0.14);
        }

        .zoom-scale-percent {
          font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "SF Pro Text", "SF Pro Display", "Hiragino Sans GB", "Microsoft YaHei", sans-serif !important;
          font-size: 13px;
          font-weight: 600;
          font-variant-numeric: tabular-nums;
          letter-spacing: -0.2px;
          color: #000000;
          line-height: 1.1;
          white-space: nowrap;
        }

        .zoom-scale-hint {
          font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "SF Pro Text", "SF Pro Display", "Hiragino Sans GB", "Microsoft YaHei", sans-serif !important;
          font-size: 8.5px;
          font-weight: 500;
          color: rgba(0, 0, 0, 0.5);
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
