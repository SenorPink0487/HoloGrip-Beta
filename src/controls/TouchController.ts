import type { PlayerController } from './PlayerController';
import { blurActiveInput } from '../core/focus.ts';

export class TouchController {
  private container: HTMLElement;
  private joystickBase: HTMLElement | null = null;
  private joystickKnob: HTMLElement | null = null;
  private visionLauncherBtn: HTMLElement | null = null;
  private elevationControls: HTMLElement | null = null;
  private elevateUpBtn: HTMLElement | null = null;
  private elevateDownBtn: HTMLElement | null = null;
  private uiTouchIds = new Set<number>();

  public onToggleVisionModal?: () => void;

  private isDraggingJoystick = false;
  private joystickTouchId: number | null = null;
  private joystickCenter = { x: 0, y: 0 };
  private maxRadius = 45;

  private lookTouchId: number | null = null;
  private lastLookPos = { x: 0, y: 0 };

  private player: PlayerController;

  constructor(player: PlayerController, onToggleVisionModal?: () => void) {
    this.player = player;
    this.onToggleVisionModal = onToggleVisionModal;
    this.container = document.body;
    this.initTouchUI();
    this.bindEvents();
  }

  private isHandTrackingActive = false;

  public setVisionModalOpen(isOpen: boolean): void {
    if (this.visionLauncherBtn) {
      this.visionLauncherBtn.classList.toggle('is-open', isOpen);
      this.visionLauncherBtn.setAttribute('aria-expanded', String(isOpen));
    }
  }

  public setVisible(visible: boolean): void {
    const layer = document.getElementById('touch-controls-layer');
    if (layer) {
      layer.style.display = visible ? 'block' : 'none';
    }
  }

  public startElevateUp(): void {
    blurActiveInput(true);
    if (this.player?.keys) {
      this.player.keys.up = true;
    }
    this.elevateUpBtn?.classList?.add?.('is-pressed');
  }

  public stopElevateUp(): void {
    if (this.player?.keys) {
      this.player.keys.up = false;
    }
    this.elevateUpBtn?.classList?.remove?.('is-pressed');
  }

  public startElevateDown(): void {
    blurActiveInput(true);
    if (this.player?.keys) {
      this.player.keys.down = true;
    }
    this.elevateDownBtn?.classList?.add?.('is-pressed');
  }

  public stopElevateDown(): void {
    if (this.player?.keys) {
      this.player.keys.down = false;
    }
    this.elevateDownBtn?.classList?.remove?.('is-pressed');
  }

  public isJoystickActive(): boolean {
    return this.isDraggingJoystick;
  }

  public setHandTrackingActive(active: boolean): void {
    this.isHandTrackingActive = active;
    const layer = document.getElementById('touch-controls-layer');
    if (layer) {
      layer.classList.toggle('hand-tracking-active', active);
    }
    if (typeof document !== 'undefined' && document.body) {
      document.body.classList.toggle('hand-tracking-active', active);
    }

    if (active) {
      this.stopElevateUp();
      this.stopElevateDown();
      this.uiTouchIds?.clear?.();

      if (this.isDraggingJoystick) {
        this.isDraggingJoystick = false;
        this.joystickTouchId = null;
        this.joystickBase?.classList?.remove?.('is-active', 'dir-up', 'dir-down', 'dir-left', 'dir-right');
        this.joystickKnob?.classList?.remove?.('dragging', 'sprinting');
        this.player.keys.forward = false;
        this.player.keys.backward = false;
        this.player.keys.left = false;
        this.player.keys.right = false;
        this.player.keys.sprint = false;
        if (this.joystickKnob) {
          this.joystickKnob.style.transform = 'translate(0px, 0px)';
        }
      }
      this.lookTouchId = null;
      this.visionLauncherBtn?.classList?.remove?.('is-pressed');
    }
  }

  private initTouchUI(): void {
    const isTouchDevice =
      'ontouchstart' in window ||
      (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0) ||
      document.body.classList.contains('has-touch-controls');

    if (!isTouchDevice) return;

    const isTabletTouch =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(pointer: coarse) and (min-width: 768px)').matches;
    this.maxRadius = isTabletTouch ? 54 : 45;

    document.body.classList.add('has-touch-controls');

    // 创建虚拟摇杆与全息视窗启动器 DOM 元素
    const wrapper = document.createElement('div');
    wrapper.id = 'touch-controls-layer';
    wrapper.innerHTML = `
      <!-- Bottom-Left: Minimalist Glassmorphic Movement Joystick -->
      <div id="virtual-joystick-base" class="hud-interactive" aria-label="移动摇杆">
        <div class="vj-compass-pip vj-pip-n" title="前"></div>
        <div class="vj-compass-pip vj-pip-s" title="后"></div>
        <div class="vj-compass-pip vj-pip-w" title="左"></div>
        <div class="vj-compass-pip vj-pip-e" title="右"></div>
        <div class="vj-axis-cross vj-axis-x"></div>
        <div class="vj-axis-cross vj-axis-y"></div>
        <div class="vj-guide-ring"></div>
        <div id="virtual-joystick-knob">
          <div class="vj-knob-ridge"></div>
          <div class="vj-knob-core"></div>
        </div>
      </div>

      <!-- Bottom-Right (Above Launcher): Minimalist Elevation Controls -->
      <div id="touch-elevation-controls" class="hud-interactive" role="group" aria-label="视角升降">
        <button id="touch-elevate-up" class="touch-elevate-btn" type="button" aria-label="升高视角" title="升高视角">
          <svg class="touch-elevate-icon" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="18 15 12 9 6 15"/>
          </svg>
        </button>
        <div class="touch-elevate-divider"></div>
        <button id="touch-elevate-down" class="touch-elevate-btn" type="button" aria-label="降低视角" title="降低视角">
          <svg class="touch-elevate-icon" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </button>
      </div>

      <!-- Bottom-Right: Minimalist Spatial Window Capsule Button -->
      <button id="touch-vision-launcher" class="hud-interactive" type="button" aria-label="全息实验视窗" title="打开全息实验视窗">
        <div class="touch-launcher-content">
          <svg class="touch-launcher-icon" viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="4" width="18" height="14" rx="3.5"/>
            <line x1="3" y1="8.5" x2="21" y2="8.5" opacity="0.38"/>
            <circle cx="6" cy="6.25" r="0.7" fill="currentColor"/>
            <circle cx="8.5" cy="6.25" r="0.7" fill="currentColor"/>
          </svg>
          <span class="touch-launcher-label">全息视窗</span>
        </div>
      </button>
    `;

    // 虚拟摇杆与悬浮视窗启动器的空间流体玻璃风格样式
    const style = document.createElement('style');
    style.id = 'touch-controls-style';
    style.textContent = `
      #touch-controls-layer {
        position: fixed;
        inset: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
        z-index: 900;
        user-select: none;
        -webkit-user-select: none;
      }

      /* ==================== 1. 虚拟摇杆（左下角） ==================== */
      #virtual-joystick-base {
        position: absolute;
        bottom: calc(32px + env(safe-area-inset-bottom, 0px));
        left: calc(32px + env(safe-area-inset-left, 0px));
        width: 118px;
        height: 118px;
        border-radius: 50%;
        background: rgba(255, 255, 255, 0.06);
        border: 0.5px solid rgba(255, 255, 255, 0.2);
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.25),
                    inset 0 1px 1px rgba(255, 255, 255, 0.2);
        backdrop-filter: blur(28px) saturate(180%);
        -webkit-backdrop-filter: blur(28px) saturate(180%);
        display: flex;
        align-items: center;
        justify-content: center;
        pointer-events: auto;
        touch-action: none;
        opacity: 0.72;
        transform: translate3d(0, 0, 0) scale(1);
        filter: blur(0px);
        transition: opacity 0.35s cubic-bezier(0.16, 1, 0.3, 1),
                    transform 0.4s cubic-bezier(0.16, 1, 0.3, 1),
                    filter 0.35s ease,
                    background 0.2s,
                    border-color 0.2s,
                    box-shadow 0.2s;
        will-change: transform, opacity, filter;
      }

      #virtual-joystick-base:active,
      #virtual-joystick-base.is-active {
        opacity: 0.95;
        background: rgba(255, 255, 255, 0.09);
        border-color: rgba(255, 255, 255, 0.3);
        box-shadow: 0 10px 36px rgba(0, 0, 0, 0.3),
                    inset 0 1px 1px rgba(255, 255, 255, 0.28);
      }

      .vj-guide-ring {
        position: absolute;
        width: 88px;
        height: 88px;
        border-radius: 50%;
        border: 1px solid rgba(255, 255, 255, 0.08);
        pointer-events: none;
      }

      .vj-axis-cross {
        position: absolute;
        pointer-events: none;
        background: rgba(255, 255, 255, 0.05);
      }
      .vj-axis-x {
        width: 80px;
        height: 1px;
      }
      .vj-axis-y {
        width: 1px;
        height: 80px;
      }

      .vj-compass-pip {
        position: absolute;
        width: 3.5px;
        height: 3.5px;
        border-radius: 50%;
        background: rgba(255, 255, 255, 0.2);
        pointer-events: none;
        transition: background 0.15s ease, transform 0.15s ease, box-shadow 0.15s ease;
      }
      .vj-pip-n { top: 9px; }
      .vj-pip-s { bottom: 9px; }
      .vj-pip-w { left: 9px; }
      .vj-pip-e { right: 9px; }

      #virtual-joystick-base.dir-up .vj-pip-n,
      #virtual-joystick-base.dir-down .vj-pip-s,
      #virtual-joystick-base.dir-left .vj-pip-w,
      #virtual-joystick-base.dir-right .vj-pip-e {
        background: rgba(255, 255, 255, 0.85);
        box-shadow: 0 0 6px rgba(255, 255, 255, 0.45);
        transform: scale(1.2);
      }

      #virtual-joystick-knob {
        width: 48px;
        height: 48px;
        border-radius: 50%;
        position: absolute;
        display: flex;
        align-items: center;
        justify-content: center;
        background: radial-gradient(circle at 35% 32%, rgba(255, 255, 255, 0.38) 0%, rgba(255, 255, 255, 0.16) 60%, rgba(255, 255, 255, 0.08) 100%);
        border: 0.5px solid rgba(255, 255, 255, 0.45);
        box-shadow: 0 6px 18px rgba(0, 0, 0, 0.32),
                    inset 0 1px 1.5px rgba(255, 255, 255, 0.65);
        backdrop-filter: blur(20px) saturate(180%);
        -webkit-backdrop-filter: blur(20px) saturate(180%);
        pointer-events: none;
        transform: translate(0px, 0px);
        transition: transform 0.24s cubic-bezier(0.18, 0.9, 0.3, 1), box-shadow 0.2s ease;
      }

      #virtual-joystick-knob.dragging {
        transition: none;
        background: radial-gradient(circle at 35% 32%, rgba(255, 255, 255, 0.48) 0%, rgba(255, 255, 255, 0.22) 60%, rgba(255, 255, 255, 0.12) 100%);
        border-color: rgba(255, 255, 255, 0.6);
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.38),
                    inset 0 1px 2px rgba(255, 255, 255, 0.85);
      }

      #virtual-joystick-knob.sprinting {
        transform: scale(1.04);
        border-color: rgba(255, 255, 255, 0.75);
        box-shadow: 0 10px 28px rgba(0, 0, 0, 0.42),
                    inset 0 1px 2px #ffffff,
                    0 0 14px rgba(255, 255, 255, 0.22);
      }

      .vj-knob-ridge {
        width: 32px;
        height: 32px;
        border-radius: 50%;
        border: 0.5px solid rgba(255, 255, 255, 0.2);
        background: rgba(0, 0, 0, 0.05);
        pointer-events: none;
      }

      .vj-knob-core {
        position: absolute;
        width: 4px;
        height: 4px;
        border-radius: 50%;
        background: rgba(255, 255, 255, 0.6);
        pointer-events: none;
        transition: background 0.15s ease, transform 0.15s ease;
      }

      #virtual-joystick-knob.dragging .vj-knob-core {
        background: #ffffff;
        box-shadow: 0 0 6px rgba(255, 255, 255, 0.5);
      }

      /* ==================== 2. 升降上下控制胶囊（右下角，启动器上方） ==================== */
      #touch-elevation-controls {
        position: absolute;
        bottom: calc(88px + env(safe-area-inset-bottom, 0px));
        right: calc(32px + env(safe-area-inset-right, 0px));
        width: 44px;
        display: flex;
        flex-direction: column;
        align-items: center;
        background: rgba(255, 255, 255, 0.08);
        border: 0.5px solid rgba(255, 255, 255, 0.2);
        border-radius: 22px;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.22),
                    inset 0 1px 1px rgba(255, 255, 255, 0.25);
        backdrop-filter: blur(28px) saturate(180%);
        -webkit-backdrop-filter: blur(28px) saturate(180%);
        pointer-events: auto;
        user-select: none;
        -webkit-user-select: none;
        overflow: hidden;
        opacity: 0.82;
        transform: translate3d(0, 0, 0) scale(1);
        filter: blur(0px);
        transition: opacity 0.35s cubic-bezier(0.16, 1, 0.3, 1),
                    transform 0.38s cubic-bezier(0.16, 1, 0.3, 1),
                    filter 0.35s ease,
                    background 0.2s ease,
                    border-color 0.2s ease,
                    box-shadow 0.2s ease;
        will-change: transform, opacity, filter;
      }

      .touch-elevate-btn {
        width: 44px;
        height: 42px;
        border: none;
        background: transparent;
        color: rgba(255, 255, 255, 0.88);
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        outline: none;
        padding: 0;
        touch-action: manipulation;
        user-select: none;
        -webkit-user-select: none;
        -webkit-tap-highlight-color: transparent;
        transition: background 0.15s ease, color 0.15s ease, transform 0.12s ease;
      }

      .touch-elevate-btn:active,
      .touch-elevate-btn.is-pressed {
        background: rgba(255, 255, 255, 0.22);
        color: #ffffff;
        transform: scale(0.92);
      }

      .touch-elevate-divider {
        width: 24px;
        height: 0.5px;
        background: rgba(255, 255, 255, 0.18);
        pointer-events: none;
      }

      .touch-elevate-icon {
        flex-shrink: 0;
        color: currentColor;
        pointer-events: none;
        transition: transform 0.15s cubic-bezier(0.16, 1, 0.3, 1);
      }

      .touch-elevate-btn:active .touch-elevate-icon,
      .touch-elevate-btn.is-pressed .touch-elevate-icon {
        transform: scale(1.12);
      }

      /* ==================== 3. 悬浮视窗切换按钮（右下角） ==================== */
      #touch-vision-launcher {
        position: absolute;
        bottom: calc(32px + env(safe-area-inset-bottom, 0px));
        right: calc(32px + env(safe-area-inset-right, 0px));
        padding: 0 16px 0 13px;
        height: 44px;
        border-radius: 22px;
        border: 0.5px solid rgba(255, 255, 255, 0.2);
        background: rgba(255, 255, 255, 0.09);
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.22),
                    inset 0 1px 1px rgba(255, 255, 255, 0.25);
        backdrop-filter: blur(28px) saturate(180%);
        -webkit-backdrop-filter: blur(28px) saturate(180%);
        color: rgba(255, 255, 255, 0.88);
        display: inline-flex;
        align-items: center;
        justify-content: center;
        pointer-events: auto;
        touch-action: manipulation;
        cursor: pointer;
        outline: none;
        user-select: none;
        -webkit-user-select: none;
        -webkit-tap-highlight-color: transparent;
        opacity: 0.82;
        transform: translate3d(0, 0, 0) scale(1);
        filter: blur(0px);
        transition: opacity 0.35s cubic-bezier(0.16, 1, 0.3, 1),
                    transform 0.38s cubic-bezier(0.16, 1, 0.3, 1),
                    filter 0.35s ease,
                    background 0.2s ease,
                    border-color 0.2s ease,
                    box-shadow 0.2s ease,
                    color 0.2s ease;
        will-change: transform, opacity, filter;
      }

      #touch-vision-launcher:active,
      #touch-vision-launcher.is-pressed {
        transform: scale(0.94);
        background: rgba(255, 255, 255, 0.16);
        border-color: rgba(255, 255, 255, 0.32);
        box-shadow: 0 4px 14px rgba(0, 0, 0, 0.25), inset 0 1px 1px rgba(255, 255, 255, 0.4);
      }

      #touch-vision-launcher.is-open {
        background: rgba(255, 255, 255, 0.22);
        border-color: rgba(255, 255, 255, 0.45);
        color: #ffffff;
        box-shadow: 0 8px 28px rgba(0, 0, 0, 0.28), inset 0 1px 1.5px rgba(255, 255, 255, 0.55);
      }

      .touch-launcher-content {
        display: flex;
        align-items: center;
        gap: 7px;
        pointer-events: none;
      }

      .touch-launcher-icon {
        flex-shrink: 0;
        color: currentColor;
        opacity: 0.9;
        transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1);
      }

      #touch-vision-launcher.is-open .touch-launcher-icon {
        transform: scale(1.06);
        opacity: 1;
      }

      .touch-launcher-label {
        font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", -apple-system-subheadline, sans-serif;
        font-size: 13.5px;
        font-weight: 500;
        letter-spacing: -0.2px;
        white-space: nowrap;
      }

      /* ==================== 4. iPad / 大屏幕响应式缩放适配 ==================== */
      @media (pointer: coarse) and (min-width: 768px) {
        #virtual-joystick-base {
          bottom: calc(40px + env(safe-area-inset-bottom, 0px));
          left: calc(40px + env(safe-area-inset-left, 0px));
          width: 138px;
          height: 138px;
        }
        .vj-guide-ring {
          width: 104px;
          height: 104px;
        }
        .vj-axis-cross.vj-axis-x {
          width: 96px;
        }
        .vj-axis-cross.vj-axis-y {
          height: 96px;
        }
        #virtual-joystick-knob {
          width: 54px;
          height: 54px;
        }
        .vj-knob-ridge {
          width: 36px;
          height: 36px;
        }
        .vj-knob-core {
          width: 4.5px;
          height: 4.5px;
        }
        #touch-elevation-controls {
          bottom: calc(100px + env(safe-area-inset-bottom, 0px));
          right: calc(40px + env(safe-area-inset-right, 0px));
          width: 48px;
          border-radius: 24px;
        }
        .touch-elevate-btn {
          width: 48px;
          height: 46px;
        }
        .touch-elevate-divider {
          width: 28px;
        }
        .touch-elevate-icon {
          width: 22px;
          height: 22px;
        }
        #touch-vision-launcher {
          bottom: calc(40px + env(safe-area-inset-bottom, 0px));
          right: calc(40px + env(safe-area-inset-right, 0px));
          height: 48px;
          border-radius: 24px;
          padding: 0 18px 0 14px;
          gap: 8px;
        }
        .touch-launcher-icon {
          width: 21px;
          height: 21px;
        }
        .touch-launcher-label {
          font-size: 14.5px;
        }
      }

      /* ==================== 5. 手势识别激活状态：平滑优雅隐藏动画 ==================== */
      #touch-controls-layer.hand-tracking-active #virtual-joystick-base,
      body.hand-tracking-active #virtual-joystick-base {
        opacity: 0 !important;
        transform: translate3d(-14px, 36px, 0) scale(0.88) !important;
        filter: blur(10px) !important;
        pointer-events: none !important;
        visibility: hidden;
        transition: opacity 0.36s cubic-bezier(0.16, 1, 0.3, 1),
                    transform 0.4s cubic-bezier(0.16, 1, 0.3, 1),
                    filter 0.36s ease,
                    visibility 0s linear 0.4s;
      }

      #touch-controls-layer.hand-tracking-active #touch-elevation-controls,
      body.hand-tracking-active #touch-elevation-controls {
        opacity: 0 !important;
        transform: translate3d(14px, 36px, 0) scale(0.88) !important;
        filter: blur(10px) !important;
        pointer-events: none !important;
        visibility: hidden;
        transition: opacity 0.36s cubic-bezier(0.16, 1, 0.3, 1),
                    transform 0.4s cubic-bezier(0.16, 1, 0.3, 1),
                    filter 0.36s ease,
                    visibility 0s linear 0.4s;
      }

      #touch-controls-layer.hand-tracking-active #touch-vision-launcher,
      body.hand-tracking-active #touch-vision-launcher {
        opacity: 0 !important;
        transform: translate3d(14px, 36px, 0) scale(0.88) !important;
        filter: blur(10px) !important;
        pointer-events: none !important;
        visibility: hidden;
        transition: opacity 0.36s cubic-bezier(0.16, 1, 0.3, 1),
                    transform 0.4s cubic-bezier(0.16, 1, 0.3, 1),
                    filter 0.36s ease,
                    visibility 0s linear 0.4s;
      }
    `;

    document.head.appendChild(style);
    this.container.appendChild(wrapper);

    this.joystickBase = wrapper.querySelector('#virtual-joystick-base');
    this.joystickKnob = wrapper.querySelector('#virtual-joystick-knob');
    this.visionLauncherBtn = wrapper.querySelector('#touch-vision-launcher');
    this.elevationControls = wrapper.querySelector('#touch-elevation-controls');
    this.elevateUpBtn = wrapper.querySelector('#touch-elevate-up');
    this.elevateDownBtn = wrapper.querySelector('#touch-elevate-down');
  }

  private bindEvents(): void {
    if (!this.joystickBase) return;

    // 摇杆触摸事件
    this.joystickBase.addEventListener('touchstart', (e: TouchEvent) => {
      blurActiveInput(true);
      const touch = e.changedTouches[0];
      this.isDraggingJoystick = true;
      this.joystickTouchId = touch.identifier;
      this.joystickBase?.classList.add('is-active');
      this.joystickKnob?.classList.add('dragging');

      const rect = this.joystickBase!.getBoundingClientRect();
      this.joystickCenter = {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      };

      this.updateJoystick(touch.clientX, touch.clientY);
    });

    window.addEventListener(
      'touchmove',
      (e: TouchEvent) => {
        for (let i = 0; i < e.changedTouches.length; i++) {
          const touch = e.changedTouches[i];

          // 1. 移动摇杆
          if (this.isDraggingJoystick && touch.identifier === this.joystickTouchId) {
            if (e.cancelable) e.preventDefault();
            this.updateJoystick(touch.clientX, touch.clientY);
          }

          // 2. iPad 与触摸屏上的视角拖拽
          if (
            touch.identifier === this.lookTouchId &&
            this.player.enabled &&
            !this.isHandTrackingActive
          ) {
            if (e.cancelable) e.preventDefault();
            const dx = touch.clientX - this.lastLookPos.x;
            const dy = touch.clientY - this.lastLookPos.y;
            this.lastLookPos = { x: touch.clientX, y: touch.clientY };

            const sensitivity = 0.0035;
            this.player.rotate(dx, dy, sensitivity);
          }
        }
      },
      { passive: false }
    );

    const resetJoystick = (e: TouchEvent) => {
      for (let i = 0; i < e.changedTouches.length; i++) {
        const touch = e.changedTouches[i];
        this.uiTouchIds.delete(touch.identifier);

        if (touch.identifier === this.joystickTouchId) {
          this.isDraggingJoystick = false;
          this.joystickTouchId = null;
          this.joystickBase?.classList.remove('is-active', 'dir-up', 'dir-down', 'dir-left', 'dir-right');
          this.joystickKnob?.classList.remove('dragging', 'sprinting');
          this.player.keys.forward = false;
          this.player.keys.backward = false;
          this.player.keys.left = false;
          this.player.keys.right = false;
          this.player.keys.sprint = false;

          if (this.joystickKnob) {
            this.joystickKnob.style.transform = 'translate(0px, 0px)';
          }
        }

        if (touch.identifier === this.lookTouchId) {
          this.lookTouchId = null;
        }
      }

      if (e.touches && e.touches.length === 0) {
        this.lookTouchId = null;
        this.uiTouchIds.clear();
        this.stopElevateUp();
        this.stopElevateDown();
      }
    };

    window.addEventListener('touchend', resetJoystick);
    window.addEventListener('touchcancel', resetJoystick);
    window.addEventListener('blur', () => {
      this.stopElevateUp();
      this.stopElevateDown();
    });

    // 右侧屏幕/视口区域的触摸视角监听器
    window.addEventListener(
      'touchstart',
      (e: TouchEvent) => {
        if (this.isHandTrackingActive || !this.player.enabled) return;

        const target = e.target instanceof Element ? e.target : null;
        if (!target) return;

        // 允许控件、启动按钮、升降按钮和文本框接收点击，而不触发相机拖拽
        if (target.closest('.hud-interactive, button, a, input, textarea, select, [contenteditable="true"]')) {
          return;
        }

        // 在立体几何实验中，全屏触摸操作归属于 3D 几何图形交互
        if (typeof window !== 'undefined' && (window as any).__ENGINE__?.currentExperimentId === 'math-stereometry') {
          return;
        }

        // 视角区域的多指手势（如 iPad 上的双指捏合）不应触发相机旋转。
        // 过滤掉摇杆和 UI 触摸点，使单手移动/升降与单手转动视角无缝协同
        const nonJoystickTouches = Array.from(e.touches || []).filter(
          (t) => t.identifier !== this.joystickTouchId && !this.uiTouchIds.has(t.identifier)
        );
        if (nonJoystickTouches.length > 1) {
          this.lookTouchId = null;
          return;
        }

        for (let i = 0; i < e.changedTouches.length; i++) {
          const touch = e.changedTouches[i];
          if (touch.identifier === this.joystickTouchId || this.uiTouchIds.has(touch.identifier)) continue;

          // 左下角区域预留给摇杆移动；摇杆区域外允许拖拽调整视角
          const isJoystickArea =
            touch.clientX < 220 && touch.clientY > window.innerHeight - 240;

          if (!isJoystickArea && this.lookTouchId === null) {
            this.lookTouchId = touch.identifier;
            this.lastLookPos = { x: touch.clientX, y: touch.clientY };
          }
        }
      },
      { passive: false }
    );

    // 视角升高按钮（右下角，位于启动按钮上方）
    if (this.elevateUpBtn) {
      this.elevateUpBtn.addEventListener(
        'touchstart',
        (e: TouchEvent) => {
          e.preventDefault();
          e.stopPropagation();
          for (let i = 0; i < e.changedTouches.length; i++) {
            this.uiTouchIds.add(e.changedTouches[i].identifier);
          }
          this.startElevateUp();
        },
        { passive: false }
      );

      this.elevateUpBtn.addEventListener(
        'touchend',
        (e: TouchEvent) => {
          e.preventDefault();
          e.stopPropagation();
          for (let i = 0; i < e.changedTouches.length; i++) {
            this.uiTouchIds.delete(e.changedTouches[i].identifier);
          }
          this.stopElevateUp();
        },
        { passive: false }
      );

      this.elevateUpBtn.addEventListener('touchcancel', (e: TouchEvent) => {
        for (let i = 0; i < e.changedTouches.length; i++) {
          this.uiTouchIds.delete(e.changedTouches[i].identifier);
        }
        this.stopElevateUp();
      });

      this.elevateUpBtn.addEventListener('mousedown', (e: MouseEvent) => {
        e.preventDefault();
        this.startElevateUp();
      });

      this.elevateUpBtn.addEventListener('mouseup', () => {
        this.stopElevateUp();
      });

      this.elevateUpBtn.addEventListener('mouseleave', () => {
        this.stopElevateUp();
      });
    }

    // 视角降低按钮（右下角，位于启动按钮上方）
    if (this.elevateDownBtn) {
      this.elevateDownBtn.addEventListener(
        'touchstart',
        (e: TouchEvent) => {
          e.preventDefault();
          e.stopPropagation();
          for (let i = 0; i < e.changedTouches.length; i++) {
            this.uiTouchIds.add(e.changedTouches[i].identifier);
          }
          this.startElevateDown();
        },
        { passive: false }
      );

      this.elevateDownBtn.addEventListener(
        'touchend',
        (e: TouchEvent) => {
          e.preventDefault();
          e.stopPropagation();
          for (let i = 0; i < e.changedTouches.length; i++) {
            this.uiTouchIds.delete(e.changedTouches[i].identifier);
          }
          this.stopElevateDown();
        },
        { passive: false }
      );

      this.elevateDownBtn.addEventListener('touchcancel', (e: TouchEvent) => {
        for (let i = 0; i < e.changedTouches.length; i++) {
          this.uiTouchIds.delete(e.changedTouches[i].identifier);
        }
        this.stopElevateDown();
      });

      this.elevateDownBtn.addEventListener('mousedown', (e: MouseEvent) => {
        e.preventDefault();
        this.startElevateDown();
      });

      this.elevateDownBtn.addEventListener('mouseup', () => {
        this.stopElevateDown();
      });

      this.elevateDownBtn.addEventListener('mouseleave', () => {
        this.stopElevateDown();
      });
    }

    // 全息空间视窗启动按钮（右下角）
    if (this.visionLauncherBtn) {
      let lastTapTime = 0;
      const triggerLauncher = (e: Event) => {
        e.preventDefault();
        e.stopPropagation();
        const now = performance.now();
        if (now - lastTapTime < 300) return;
        lastTapTime = now;
        blurActiveInput(true);
        this.onToggleVisionModal?.();
      };

      this.visionLauncherBtn.addEventListener('touchstart', (e) => {
        e.stopPropagation();
        for (let i = 0; i < e.changedTouches.length; i++) {
          this.uiTouchIds.add(e.changedTouches[i].identifier);
        }
        this.visionLauncherBtn?.classList.add('is-pressed');
      }, { passive: false });

      this.visionLauncherBtn.addEventListener('touchend', (e) => {
        e.stopPropagation();
        for (let i = 0; i < e.changedTouches.length; i++) {
          this.uiTouchIds.delete(e.changedTouches[i].identifier);
        }
        this.visionLauncherBtn?.classList.remove('is-pressed');
        triggerLauncher(e);
      }, { passive: false });

      this.visionLauncherBtn.addEventListener('touchcancel', (e) => {
        for (let i = 0; i < e.changedTouches.length; i++) {
          this.uiTouchIds.delete(e.changedTouches[i].identifier);
        }
        this.visionLauncherBtn?.classList.remove('is-pressed');
      });

      this.visionLauncherBtn.addEventListener('click', (e) => {
        triggerLauncher(e);
      });
    }
  }

  private updateJoystick(clientX: number, clientY: number): void {
    const dx = clientX - this.joystickCenter.x;
    const dy = clientY - this.joystickCenter.y;
    const dist = Math.hypot(dx, dy);
    const clampedDist = Math.min(this.maxRadius, dist);
    const angle = Math.atan2(dy, dx);

    const knobX = Math.cos(angle) * clampedDist;
    const knobY = Math.sin(angle) * clampedDist;

    if (this.joystickKnob) {
      this.joystickKnob.style.transform = `translate(${knobX}px, ${knobY}px)`;
      const isSprinting = dist > this.maxRadius * 0.85;
      this.joystickKnob.classList.toggle('sprinting', isSprinting);
    }

    const deadZone = 8;
    const isForward = dy < -deadZone;
    const isBackward = dy > deadZone;
    const isLeft = dx < -deadZone;
    const isRight = dx > deadZone;

    this.player.keys.forward = isForward;
    this.player.keys.backward = isBackward;
    this.player.keys.left = isLeft;
    this.player.keys.right = isRight;
    this.player.keys.sprint = dist > this.maxRadius * 0.85;

    // 四向方位视觉反馈
    if (this.joystickBase) {
      this.joystickBase.classList.toggle('dir-up', isForward);
      this.joystickBase.classList.toggle('dir-down', isBackward);
      this.joystickBase.classList.toggle('dir-left', isLeft);
      this.joystickBase.classList.toggle('dir-right', isRight);
    }
  }
}
