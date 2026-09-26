export interface StereometryGuidanceHUDCallbacks {
  onUndo?: () => void;
  onResetView?: () => void;
  onClear?: () => void;
}

export class StereometryGuidanceHUD {
  private container: HTMLElement;
  private pillEl: HTMLElement;
  private dotEl: HTMLElement;
  private textEl: HTMLElement;
  private undoBtn: HTMLButtonElement;
  private resetBtn: HTMLButtonElement;
  private clearBtn: HTMLButtonElement;
  private styleEl: HTMLStyleElement | null = null;
  private callbacks: StereometryGuidanceHUDCallbacks;
  private segmentsCount = 0;
  private autoResetTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(parent: HTMLElement, callbacks: StereometryGuidanceHUDCallbacks = {}) {
    this.container = parent;
    this.callbacks = callbacks;
    this.injectStyles();
    this.createDOM();
  }

  private injectStyles(): void {
    const styleId = 'vision-stereometry-guidance-hud-style';
    let existing = document.getElementById(styleId) as HTMLStyleElement | null;
    if (!existing) {
      existing = document.createElement('style');
      existing.id = styleId;
      existing.textContent = `
        .vision-math-guidance-pill {
          position: fixed;
          top: 24px;
          left: 50%;
          transform: translateX(-50%);
          z-index: 9990;
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 8px 14px 8px 16px;
          background: rgba(15, 23, 42, 0.78);
          backdrop-filter: blur(24px) saturate(180%);
          -webkit-backdrop-filter: blur(24px) saturate(180%);
          border: 1px solid rgba(255, 255, 255, 0.16);
          border-radius: 9999px;
          box-shadow: 0 12px 36px rgba(0, 0, 0, 0.40), 0 0 1px rgba(255, 255, 255, 0.25) inset;
          color: #f8fafc;
          font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Segoe UI", Roboto, sans-serif;
          font-size: 13.5px;
          line-height: 1.4;
          user-select: none;
          pointer-events: auto;
          transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
        }

        .vision-math-guidance-pill:hover {
          background: rgba(15, 23, 42, 0.88);
          border-color: rgba(255, 255, 255, 0.24);
          box-shadow: 0 16px 44px rgba(0, 0, 0, 0.50), 0 0 1px rgba(255, 255, 255, 0.35) inset;
        }

        .math-guidance-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: #38bdf8;
          box-shadow: 0 0 8px #38bdf8;
          flex-shrink: 0;
          transition: all 0.25s ease;
        }

        .math-guidance-dot.active {
          background: #fbbf24;
          box-shadow: 0 0 10px #fbbf24;
          animation: mathDotPulse 1.2s infinite ease-in-out;
        }

        .math-guidance-dot.target {
          background: #10b981;
          box-shadow: 0 0 10px #10b981;
          animation: mathDotPulse 0.9s infinite ease-in-out;
        }

        .math-guidance-dot.success {
          background: #34d399;
          box-shadow: 0 0 12px #34d399;
        }

        .math-guidance-dot.warn {
          background: #f87171;
          box-shadow: 0 0 10px #f87171;
        }

        @keyframes mathDotPulse {
          0%, 100% { transform: scale(1.0); opacity: 1; }
          50% { transform: scale(1.4); opacity: 0.7; }
        }

        .math-guidance-text {
          font-weight: 500;
          color: #f1f5f9;
          letter-spacing: 0.01em;
          white-space: nowrap;
          max-width: 440px;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .math-guidance-actions {
          display: flex;
          align-items: center;
          gap: 6px;
          margin-left: 4px;
          border-left: 1px solid rgba(255, 255, 255, 0.12);
          padding-left: 10px;
        }

        .math-guidance-btn {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 4px 10px;
          border-radius: 9999px;
          background: rgba(255, 255, 255, 0.08);
          border: 1px solid rgba(255, 255, 255, 0.10);
          color: #e2e8f0;
          font-size: 12px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.18s ease;
          outline: none;
        }

        .math-guidance-btn:hover:not(:disabled) {
          background: rgba(255, 255, 255, 0.16);
          border-color: rgba(255, 255, 255, 0.25);
          color: #ffffff;
          transform: translateY(-1px);
        }

        .math-guidance-btn:active:not(:disabled) {
          transform: translateY(0);
          background: rgba(255, 255, 255, 0.12);
        }

        .math-guidance-btn:disabled {
          opacity: 0.38;
          cursor: not-allowed;
          border-color: transparent;
        }
      `;
      document.head.appendChild(existing);
      this.styleEl = existing;
    }
  }

  private createDOM(): void {
    this.pillEl = document.createElement('div');
    this.pillEl.className = 'vision-math-guidance-pill';
    this.pillEl.id = 'vision-math-guidance-pill';

    this.pillEl.innerHTML = `
      <div class="math-guidance-dot" id="math-guidance-dot"></div>
      <span class="math-guidance-text" id="math-guidance-text">✦ 鼠标悬停关键点可磁吸捕捉 · 点击或拖拽创建连线</span>
      <div class="math-guidance-actions">
        <button class="math-guidance-btn" id="math-hud-btn-undo" title="撤销上一条辅助线 (⌘Z)" disabled>
          <span>↩ 撤销</span>
        </button>
        <button class="math-guidance-btn" id="math-hud-btn-reset-view" title="重置视角 (R)">
          <span>👁 视角</span>
        </button>
        <button class="math-guidance-btn" id="math-hud-btn-clear" title="清空辅助线 (C)" disabled>
          <span>✕ 清空</span>
        </button>
      </div>
    `;

    this.container.appendChild(this.pillEl);

    this.dotEl = this.pillEl.querySelector('#math-guidance-dot') as HTMLElement;
    this.textEl = this.pillEl.querySelector('#math-guidance-text') as HTMLElement;
    this.undoBtn = this.pillEl.querySelector('#math-hud-btn-undo') as HTMLButtonElement;
    this.resetBtn = this.pillEl.querySelector('#math-hud-btn-reset-view') as HTMLButtonElement;
    this.clearBtn = this.pillEl.querySelector('#math-hud-btn-clear') as HTMLButtonElement;

    this.undoBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.callbacks.onUndo?.();
    });

    this.resetBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.callbacks.onResetView?.();
    });

    this.clearBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.callbacks.onClear?.();
    });
  }

  public setGuidance(text: string, type: 'info' | 'active' | 'success' | 'warn' = 'info'): void {
    if (!this.textEl || !this.dotEl) return;
    this.textEl.textContent = text;

    this.dotEl.className = 'math-guidance-dot';
    if (type === 'active') {
      this.dotEl.classList.add('target');
    } else if (type === 'success') {
      this.dotEl.classList.add('success');
      if (this.autoResetTimer) clearTimeout(this.autoResetTimer);
      this.autoResetTimer = setTimeout(() => {
        this.setGuidance('✦ 鼠标悬停关键点可磁吸捕捉 · 点击或拖拽创建连线', 'info');
      }, 3500);
    } else if (type === 'warn') {
      this.dotEl.classList.add('warn');
      if (this.autoResetTimer) clearTimeout(this.autoResetTimer);
      this.autoResetTimer = setTimeout(() => {
        this.setGuidance('✦ 鼠标悬停关键点可磁吸捕捉 · 点击或拖拽创建连线', 'info');
      }, 2500);
    } else {
      if (text.includes('已选起点')) {
        this.dotEl.classList.add('active');
      }
    }
  }

  public setSegmentsCount(count: number): void {
    this.segmentsCount = count;
    if (this.undoBtn) {
      this.undoBtn.disabled = count <= 0;
    }
    if (this.clearBtn) {
      this.clearBtn.disabled = count <= 0;
    }
  }

  public dispose(): void {
    if (this.autoResetTimer) {
      clearTimeout(this.autoResetTimer);
      this.autoResetTimer = null;
    }
    if (this.pillEl && this.pillEl.parentNode) {
      this.pillEl.parentNode.removeChild(this.pillEl);
    }
    if (this.styleEl && this.styleEl.parentNode) {
      this.styleEl.parentNode.removeChild(this.styleEl);
      this.styleEl = null;
    }
  }
}
