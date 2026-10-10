export class HandTrackingHUD {
  private container: HTMLElement;
  private pillEl: HTMLElement;
  private toggleBtn: HTMLButtonElement;
  private toastEl: HTMLElement;
  private toastTimer: any = null;
  private bodyObserver: MutationObserver | null = null;

  constructor(_service?: any, parent: HTMLElement = document.body) {
    const isEl = (typeof HTMLElement !== 'undefined' && _service instanceof HTMLElement) || (_service && typeof _service === 'object' && 'appendChild' in _service);
    const mountTarget = (isEl ? _service : parent) || document.body;

    this.injectStyles();

    this.container = document.createElement('div');
    this.container.id = 'vision-pro-tracking-hud';

    // 右上角手势交互悬浮胶囊按钮
    this.pillEl = document.createElement('div');
    this.pillEl.className = 'vp-hud-pill';
    this.pillEl.setAttribute('role', 'button');
    this.pillEl.setAttribute('tabindex', '0');
    this.pillEl.setAttribute('aria-label', '手势交互');

    const dot = document.createElement('div');
    dot.className = 'vp-pill-status-dot';

    const icon = document.createElement('div');
    icon.className = 'vp-pill-icon';
    icon.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 11V6a2 2 0 0 0-4 0v5"></path><path d="M14 10V4a2 2 0 0 0-4 0v6"></path><path d="M10 10.5V6a2 2 0 0 0-4 0v8"></path><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"></path></svg>`;

    const title = document.createElement('span');
    title.className = 'vp-pill-title';
    title.textContent = '手势交互';

    this.toggleBtn = document.createElement('button') as HTMLButtonElement;
    this.toggleBtn.className = 'vp-pill-btn vp-pill-toggle-btn';
    this.toggleBtn.title = '开启/关闭手势交互';
    this.toggleBtn.textContent = '开启';

    this.toastEl = document.createElement('div');
    this.toastEl.className = 'vp-pill-toast';
    this.toastEl.textContent = '手势交互功能已停用';

    this.pillEl.appendChild(dot);
    this.pillEl.appendChild(icon);
    this.pillEl.appendChild(title);
    this.pillEl.appendChild(this.toggleBtn);
    this.pillEl.appendChild(this.toastEl);

    this.container.appendChild(this.pillEl);
    mountTarget.appendChild(this.container);

    this.bindEvents();
    this.initEnvironmentObserver();
  }

  private injectStyles(): void {
    const css = `
      #vision-pro-tracking-hud {
        position: fixed;
        top: calc(16px + env(safe-area-inset-top, 0px));
        right: calc(20px + env(safe-area-inset-right, 0px));
        z-index: 8500;
        font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", system-ui, sans-serif;
        user-select: none;
        pointer-events: auto;
        transition: opacity 0.25s ease, transform 0.25s cubic-bezier(0.16, 1, 0.3, 1), visibility 0.25s ease;
      }

      /* 处于白板模式或正在返回白板时，自动隐藏手势交互按钮 */
      #vision-pro-tracking-hud.hidden,
      #vision-pro-tracking-hud.hidden-by-env,
      body:not(.lab-active) #vision-pro-tracking-hud,
      body.lab-returning #vision-pro-tracking-hud,
      #whiteboard-app-root:not(.hidden-view) ~ #vision-pro-tracking-hud,
      #whiteboard-app-root:not(.hidden-view) ~ * #vision-pro-tracking-hud {
        opacity: 0 !important;
        pointer-events: none !important;
        visibility: hidden !important;
        transform: translateY(-16px) scale(0.92) !important;
      }

      .vp-hud-pill {
        position: relative;
        display: flex;
        align-items: center;
        gap: 8px;
        background: rgba(28, 28, 30, 0.82);
        backdrop-filter: blur(28px) saturate(190%);
        border: 1px solid rgba(255, 255, 255, 0.16);
        border-top: 1px solid rgba(255, 255, 255, 0.28);
        border-radius: 980px;
        padding: 5px 10px 5px 12px;
        box-shadow: 0 10px 30px rgba(0, 0, 0, 0.4), 0 2px 8px rgba(0, 0, 0, 0.25);
        color: #f5f5f7;
        font-size: 12px;
        font-weight: 500;
        letter-spacing: -0.1px;
        transition: all 0.24s cubic-bezier(0.16, 1, 0.3, 1);
        cursor: pointer;
      }

      .vp-hud-pill:hover {
        background: rgba(38, 38, 42, 0.88);
        border-color: rgba(255, 255, 255, 0.24);
        transform: translateY(-1px);
      }

      .vp-hud-pill:active {
        transform: scale(0.97);
      }

      .vp-pill-status-dot {
        width: 7px;
        height: 7px;
        border-radius: 50%;
        background: #8e8e93;
        transition: background-color 0.2s ease, box-shadow 0.2s ease;
      }

      .vp-pill-status-dot.active {
        background: #30d158;
        box-shadow: 0 0 8px #30d158;
      }

      .vp-pill-icon {
        display: flex;
        align-items: center;
        color: #0a84ff;
      }

      .vp-pill-title {
        white-space: nowrap;
      }

      .vp-pill-btn {
        background: rgba(255, 255, 255, 0.1);
        border: 1px solid rgba(255, 255, 255, 0.12);
        color: #ffffff;
        border-radius: 12px;
        padding: 4px 9px;
        font-size: 11px;
        font-weight: 600;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.16s ease;
      }

      .vp-pill-btn:hover {
        background: rgba(255, 255, 255, 0.2);
        border-color: rgba(255, 255, 255, 0.25);
      }

      .vp-pill-btn:active {
        transform: scale(0.95);
      }

      .vp-pill-toggle-btn.active {
        background: rgba(10, 132, 255, 0.25);
        color: #0a84ff;
        border-color: rgba(10, 132, 255, 0.5);
      }

      .vp-pill-toast {
        position: absolute;
        top: calc(100% + 8px);
        right: 0;
        background: rgba(28, 28, 32, 0.94);
        backdrop-filter: blur(24px);
        border: 1px solid rgba(255, 255, 255, 0.16);
        border-radius: 10px;
        padding: 6px 12px;
        font-size: 11.5px;
        color: rgba(255, 255, 255, 0.9);
        box-shadow: 0 10px 24px rgba(0, 0, 0, 0.5);
        white-space: nowrap;
        pointer-events: none;
        opacity: 0;
        transform: translateY(-4px);
        transition: opacity 0.2s ease, transform 0.2s ease;
      }

      .vp-pill-toast.visible {
        opacity: 1;
        transform: translateY(0);
      }
    `;

    if (typeof document === 'undefined') return;
    const existing = document.getElementById('vision-pro-hud-style');
    if (existing) {
      existing.textContent = css;
      return;
    }
    const style = document.createElement('style');
    style.id = 'vision-pro-hud-style';
    style.textContent = css;
    document.head.appendChild(style);
  }

  private bindEvents(): void {
    const handleClick = (e: Event) => {
      if (e && typeof e.stopPropagation === 'function') {
        e.stopPropagation();
      }
      this.showToast('手势交互功能已停用');
    };

    this.pillEl.addEventListener('click', handleClick);
    if (this.toggleBtn) {
      this.toggleBtn.addEventListener('click', handleClick);
    }
  }

  public showToast(msg = '手势交互功能已停用'): void {
    if (!this.toastEl) return;
    this.toastEl.textContent = msg;
    this.toastEl.classList.add('visible');

    if (this.toastTimer) {
      clearTimeout(this.toastTimer);
    }
    this.toastTimer = setTimeout(() => {
      this.toastEl.classList.remove('visible');
      this.toastTimer = null;
    }, 2200);
  }

  private initEnvironmentObserver(): void {
    if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') return;

    this.checkEnvironmentVisibility();

    this.bodyObserver = new MutationObserver(() => {
      this.checkEnvironmentVisibility();
    });

    this.bodyObserver.observe(document.body, {
      attributes: true,
      attributeFilter: ['class'],
    });

    const wbRoot = document.getElementById('whiteboard-app-root');
    if (wbRoot) {
      this.bodyObserver.observe(wbRoot, {
        attributes: true,
        attributeFilter: ['class'],
      });
    }
  }

  private checkEnvironmentVisibility(): void {
    if (typeof document === 'undefined') return;

    const isLabActive = document.body.classList.contains('lab-active');
    const isLabReturning = document.body.classList.contains('lab-returning');
    const wbRoot = document.getElementById('whiteboard-app-root');
    const isWhiteboardForeground = wbRoot && !wbRoot.classList.contains('hidden-view');

    const shouldHide = !isLabActive || isLabReturning || isWhiteboardForeground;
    this.container.classList.toggle('hidden-by-env', Boolean(shouldHide));
  }

  public setVisible(visible: boolean): void {
    if (!this.container) return;
    this.container.classList.toggle('hidden', !visible);
  }

  public destroy(): void {
    if (this.toastTimer) {
      clearTimeout(this.toastTimer);
      this.toastTimer = null;
    }
    if (this.bodyObserver) {
      this.bodyObserver.disconnect();
      this.bodyObserver = null;
    }
    this.container?.remove();
  }
}
