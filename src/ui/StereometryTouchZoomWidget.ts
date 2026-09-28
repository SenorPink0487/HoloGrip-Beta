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

  constructor(callbacks: StereometryTouchZoomWidgetCallbacks = {}, parent: HTMLElement = document.body) {
    this.callbacks = callbacks;
    this.container = parent;
    this.createUI();
    this.bindEvents();
  }

  private createUI(): void {
    // Inject styles once if not already present
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
          gap: 3px;
          padding: 4px;
          border-radius: 980px;
          background: radial-gradient(circle at 40% 30%, rgba(18, 30, 48, 0.78) 0%, rgba(8, 16, 28, 0.90) 100%);
          border: 1.5px solid rgba(255, 255, 255, 0.18);
          box-shadow: 0 10px 32px rgba(0, 0, 0, 0.45),
                      inset 0 1px 1.5px rgba(255, 255, 255, 0.28),
                      0 0 24px rgba(0, 240, 255, 0.12);
          backdrop-filter: blur(20px) saturate(180%);
          -webkit-backdrop-filter: blur(20px) saturate(180%);
          z-index: 950;
          pointer-events: auto;
          user-select: none;
          -webkit-user-select: none;
          touch-action: manipulation;
          transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1),
                      opacity 0.25s ease,
                      box-shadow 0.25s ease;
        }

        /* Responsive placement on touch devices & iPad: positioned right above the vision launcher button */
        body.has-touch-controls .stereometry-touch-zoom-pill,
        @media (pointer: coarse) {
          .stereometry-touch-zoom-pill {
            bottom: calc(100px + env(safe-area-inset-bottom, 0px));
            right: calc(32px + env(safe-area-inset-right, 0px));
          }
        }

        @media (pointer: coarse) and (min-width: 768px) {
          .stereometry-touch-zoom-pill {
            bottom: calc(112px + env(safe-area-inset-bottom, 0px));
            right: calc(40px + env(safe-area-inset-right, 0px));
          }
        }

        .stereometry-touch-zoom-pill.hidden {
          opacity: 0;
          pointer-events: none !important;
          transform: translateY(12px) scale(0.92);
        }

        .zoom-touch-btn {
          width: 42px;
          height: 42px;
          border-radius: 50%;
          border: 1px solid rgba(255, 255, 255, 0.12);
          background: rgba(255, 255, 255, 0.08);
          color: #f0f6fc;
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
                      transform 0.15s cubic-bezier(0.2, 0.8, 0.4, 1),
                      box-shadow 0.18s ease;
        }

        @media (pointer: coarse) and (min-width: 768px) {
          .zoom-touch-btn {
            width: 46px;
            height: 46px;
          }
        }

        .zoom-touch-btn:hover {
          background: rgba(255, 255, 255, 0.18);
          border-color: rgba(255, 255, 255, 0.3);
          color: #ffffff;
        }

        .zoom-touch-btn:active,
        .zoom-touch-btn.is-active {
          transform: scale(0.90);
          background: rgba(0, 240, 255, 0.28);
          border-color: rgba(0, 240, 255, 0.6);
          box-shadow: 0 0 14px rgba(0, 240, 255, 0.4);
          color: #38bdf8;
        }

        .zoom-touch-btn svg {
          stroke: currentColor;
          transition: transform 0.15s ease;
        }

        .zoom-touch-btn:active svg {
          transform: scale(1.1);
        }

        /* Scale Indicator & Reset Badge */
        .zoom-touch-badge {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 0 12px;
          height: 42px;
          border-radius: 21px;
          border: 1px solid rgba(255, 255, 255, 0.12);
          background: rgba(255, 255, 255, 0.06);
          color: #38bdf8;
          cursor: pointer;
          outline: none;
          touch-action: manipulation;
          -webkit-tap-highlight-color: transparent;
          transition: background 0.18s, border-color 0.18s, transform 0.15s;
        }

        @media (pointer: coarse) and (min-width: 768px) {
          .zoom-touch-badge {
            height: 46px;
            padding: 0 14px;
            border-radius: 23px;
          }
        }

        .zoom-touch-badge:hover {
          background: rgba(0, 240, 255, 0.15);
          border-color: rgba(0, 240, 255, 0.35);
        }

        .zoom-touch-badge:active {
          transform: scale(0.92);
          background: rgba(0, 240, 255, 0.25);
        }

        .zoom-scale-percent {
          font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", monospace;
          font-size: 13.5px;
          font-weight: 600;
          font-variant-numeric: tabular-nums;
          letter-spacing: -0.2px;
          color: #e0f2fe;
          text-shadow: 0 0 10px rgba(56, 189, 248, 0.6);
          white-space: nowrap;
        }

        .zoom-scale-hint {
          font-size: 9px;
          font-weight: 500;
          color: rgba(255, 255, 255, 0.55);
          letter-spacing: 0.2px;
          margin-top: -1px;
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
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke-width="2.4" stroke-linecap="round">
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
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke-width="2.4" stroke-linecap="round">
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
      let lastTrigger = 0;

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

  public destroy(): void {
    if (this.element) {
      if (typeof this.element.remove === 'function') {
        this.element.remove();
      } else if (this.element.parentNode) {
        this.element.parentNode.removeChild(this.element);
      }
    }
  }
}
