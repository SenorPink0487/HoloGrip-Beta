export type GuidanceType = 'info' | 'active' | 'success' | 'warn';

export class StereometryGuidanceBar {
  private element: HTMLElement | null = null;
  private dotEl: HTMLElement | null = null;
  private textEl: HTMLElement | null = null;
  private isVisible = true;
  private resetTimeout: any = null;

  private static readonly DEFAULT_HINT = '悬停吸附端点 / 中点 (1/2) / 三等分点 (1/3) 接线 · 空白处拖拽旋转视角';

  constructor(parent: HTMLElement = (typeof document !== 'undefined' ? document.body : (null as any))) {
    this.createElements(parent);
    this.injectStyles();
  }

  private createElements(parent: HTMLElement): void {
    if (typeof document === 'undefined' || typeof document.createElement !== 'function') return;

    this.element = document.createElement('div');
    this.element.id = 'stereometry-guidance-bar';
    this.element.className = 'stereometry-guidance-bar';
    if (typeof this.element.setAttribute === 'function') {
      this.element.setAttribute('role', 'status');
      this.element.setAttribute('aria-live', 'polite');
    }

    this.element.innerHTML = `
      <span class="guidance-dot" id="guidance-dot"></span>
      <span class="guidance-text" id="guidance-text">${StereometryGuidanceBar.DEFAULT_HINT}</span>
    `;

    this.dotEl = (typeof this.element.querySelector === 'function' ? this.element.querySelector('.guidance-dot') : null) as HTMLElement;
    this.textEl = (typeof this.element.querySelector === 'function' ? this.element.querySelector('.guidance-text') : null) as HTMLElement;

    if (parent && typeof parent.appendChild === 'function') {
      parent.appendChild(this.element);
    }
  }

  private injectStyles(): void {
    if (typeof document === 'undefined' || typeof document.getElementById !== 'function') return;
    if (document.getElementById('stereometry-guidance-styles')) return;
    if (!document.head || typeof document.head.appendChild !== 'function') return;

    const style = document.createElement('style');
    style.id = 'stereometry-guidance-styles';
    style.textContent = `
      .stereometry-guidance-bar {
        position: fixed;
        bottom: calc(26px + env(safe-area-inset-bottom, 0px));
        left: 50%;
        transform: translateX(-50%) translateY(0);
        display: inline-flex;
        align-items: center;
        gap: 10px;
        padding: 9px 22px;
        background: rgba(16, 20, 32, 0.82);
        backdrop-filter: blur(28px) saturate(190%);
        -webkit-backdrop-filter: blur(28px) saturate(190%);
        border: 1px solid rgba(255, 255, 255, 0.14);
        border-top: 1px solid rgba(255, 255, 255, 0.32);
        border-radius: 9999px;
        box-shadow:
          0 16px 40px rgba(0, 0, 0, 0.42),
          0 2px 10px rgba(0, 0, 0, 0.20),
          inset 0 1px 0 rgba(255, 255, 255, 0.15);
        color: #f5f5f7;
        font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "PingFang SC", "Microsoft YaHei", sans-serif;
        font-size: 13px;
        font-weight: 500;
        letter-spacing: -0.15px;
        pointer-events: none;
        user-select: none;
        z-index: 1000;
        opacity: 1;
        transition: opacity 0.22s cubic-bezier(0.16, 1, 0.3, 1),
                    transform 0.22s cubic-bezier(0.16, 1, 0.3, 1);
        max-width: min(92vw, 680px);
      }

      .stereometry-guidance-bar.hidden {
        opacity: 0;
        transform: translateX(-50%) translateY(14px);
        pointer-events: none;
      }

      .stereometry-guidance-bar .guidance-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: #38bdf8;
        box-shadow: 0 0 10px rgba(56, 189, 248, 0.75);
        flex-shrink: 0;
        transition: background-color 0.20s ease, box-shadow 0.20s ease, transform 0.20s ease;
      }

      .stereometry-guidance-bar .guidance-dot.pulse {
        animation: guidance-dot-pulse 1.8s infinite cubic-bezier(0.4, 0, 0.6, 1);
      }

      @keyframes guidance-dot-pulse {
        0%, 100% {
          transform: scale(1);
          opacity: 1;
        }
        50% {
          transform: scale(1.35);
          opacity: 0.85;
        }
      }

      .stereometry-guidance-bar .guidance-text {
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        color: #f5f5f7;
      }

      .stereometry-guidance-bar.type-active .guidance-text {
        color: #6ee7b7;
      }

      .stereometry-guidance-bar.type-success .guidance-text {
        color: #34d399;
      }

      .stereometry-guidance-bar.type-warn .guidance-text {
        color: #fcd34d;
      }
    `;
    document.head.appendChild(style);
  }

  public setHint(hint: string, type: GuidanceType = 'info', colorHex?: number): void {
    if (!this.textEl || !this.dotEl || !this.element) return;

    if (this.resetTimeout) {
      clearTimeout(this.resetTimeout);
      this.resetTimeout = null;
    }

    const cleanHint = hint.replace(/^[✦🎯🔗✓✕↩]\s*/, '').trim();
    this.textEl.textContent = cleanHint || StereometryGuidanceBar.DEFAULT_HINT;

    if (this.element.classList) {
      this.element.classList.remove('type-info', 'type-active', 'type-success', 'type-warn');
      this.element.classList.add(`type-${type}`);
    }

    if (colorHex !== undefined) {
      const hexStr = `#${colorHex.toString(16).padStart(6, '0')}`;
      this.dotEl.style.backgroundColor = hexStr;
      this.dotEl.style.boxShadow = `0 0 10px ${hexStr}cc`;
    } else {
      switch (type) {
        case 'active':
          this.dotEl.style.backgroundColor = '#34d399';
          this.dotEl.style.boxShadow = '0 0 10px rgba(52, 211, 153, 0.8)';
          this.dotEl.classList?.add('pulse');
          break;
        case 'success':
          this.dotEl.style.backgroundColor = '#10b981';
          this.dotEl.style.boxShadow = '0 0 10px rgba(16, 185, 129, 0.8)';
          this.dotEl.classList?.remove('pulse');
          this.scheduleResetToDefault(2800);
          break;
        case 'warn':
          this.dotEl.style.backgroundColor = '#f59e0b';
          this.dotEl.style.boxShadow = '0 0 10px rgba(245, 158, 11, 0.8)';
          this.dotEl.classList?.remove('pulse');
          this.scheduleResetToDefault(2400);
          break;
        case 'info':
        default:
          this.dotEl.style.backgroundColor = '#38bdf8';
          this.dotEl.style.boxShadow = '0 0 10px rgba(56, 189, 248, 0.75)';
          this.dotEl.classList?.remove('pulse');
          break;
      }
    }
  }

  private scheduleResetToDefault(delayMs: number): void {
    this.resetTimeout = setTimeout(() => {
      this.setHint(StereometryGuidanceBar.DEFAULT_HINT, 'info');
      this.resetTimeout = null;
    }, delayMs);
  }

  public showSuccess(msg: string): void {
    this.setHint(`✓ ${msg}`, 'success');
  }

  public showWarn(msg: string): void {
    this.setHint(`✕ ${msg}`, 'warn');
  }

  public showInfo(msg: string): void {
    this.setHint(msg, 'info');
  }

  public setVisible(visible: boolean): void {
    if (this.isVisible === visible) return;
    this.isVisible = visible;

    if (!this.element || !this.element.classList) return;
    if (visible) {
      this.element.classList.remove('hidden');
    } else {
      this.element.classList.add('hidden');
    }
  }

  public getVisible(): boolean {
    return this.isVisible;
  }

  public destroy(): void {
    if (this.resetTimeout) {
      clearTimeout(this.resetTimeout);
      this.resetTimeout = null;
    }
    if (this.element && this.element.parentNode) {
      this.element.parentNode.removeChild(this.element);
    }
    if (typeof document !== 'undefined' && typeof document.getElementById === 'function') {
      const style = document.getElementById('stereometry-guidance-styles');
      if (style && style.parentNode) {
        style.parentNode.removeChild(style);
      }
    }
  }
}
