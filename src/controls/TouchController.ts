import type { PlayerController } from './PlayerController';
import { blurActiveInput } from '../core/focus.ts';

export class TouchController {
  private container: HTMLElement;
  private joystickBase: HTMLElement | null = null;
  private joystickKnob: HTMLElement | null = null;
  private visionLauncherBtn: HTMLElement | null = null;

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

  public setHandTrackingActive(active: boolean): void {
    const layer = document.getElementById('touch-controls-layer');
    if (layer) {
      layer.classList.toggle('hand-tracking-active', active);
    }
    if (typeof document !== 'undefined' && document.body) {
      document.body.classList.toggle('hand-tracking-active', active);
    }

    if (active) {
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

    // Create Virtual Joystick & Vision Launcher DOM elements
    const wrapper = document.createElement('div');
    wrapper.id = 'touch-controls-layer';
    wrapper.innerHTML = `
      <!-- Bottom-Left: Apple Minimalist Glassmorphic Movement Joystick -->
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

      <!-- Bottom-Right: Apple VisionOS Minimalist Spatial Window Capsule Button -->
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

    // Apple VisionOS liquid glass styling for joystick and floating window launcher
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

      /* ==================== 1. Virtual Joystick (Bottom-Left) ==================== */
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

      /* ==================== 2. Floating Window Button (Bottom-Right) ==================== */
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

      /* ==================== 3. iPad / Large Screen Responsive Scale ==================== */
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

      /* ==================== 4. Hand Gesture Recognition Active: Elegant Hide Animation ==================== */
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
  }

  private bindEvents(): void {
    if (!this.joystickBase) return;

    // Joystick Touch events
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

    window.addEventListener('touchmove', (e: TouchEvent) => {
      for (let i = 0; i < e.changedTouches.length; i++) {
        const touch = e.changedTouches[i];

        // 1. Move Joystick
        if (this.isDraggingJoystick && touch.identifier === this.joystickTouchId) {
          this.updateJoystick(touch.clientX, touch.clientY);
        }

        // 2. Camera Look drag (disabled when only left hand can rotate)
        if (touch.identifier === this.lookTouchId && this.player.allowMouseRotation) {
          const dx = touch.clientX - this.lastLookPos.x;
          const dy = touch.clientY - this.lastLookPos.y;
          this.lastLookPos = { x: touch.clientX, y: touch.clientY };

          const sensitivity = 0.0035;
          this.player.yaw -= dx * sensitivity;
          this.player.pitch -= dy * sensitivity;
          this.player.pitch = Math.max(
            this.player.minPitch,
            Math.min(this.player.maxPitch, this.player.pitch)
          );
          this.player.updateCameraRotation();
        }
      }
    });

    const resetJoystick = (e: TouchEvent) => {
      for (let i = 0; i < e.changedTouches.length; i++) {
        const touch = e.changedTouches[i];
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
    };

    window.addEventListener('touchend', resetJoystick);
    window.addEventListener('touchcancel', resetJoystick);

    // Screen touch look listener on right side
    window.addEventListener('touchstart', (e: TouchEvent) => {
      const target = e.target instanceof Element ? e.target : null;
      if (!target) return;

      // Let controls, launcher button, and text fields receive taps without also starting a camera drag.
      if (target.closest('.hud-interactive, button, a, input, textarea, select, [contenteditable="true"]')) {
        return;
      }

      // Multi-touch gestures (e.g. 2-finger pinch on iPad) should not trigger camera look
      if (e.touches && e.touches.length > 1) {
        this.lookTouchId = null;
        return;
      }

      // In math stereometry, full screen touch manipulation belongs to 3D geometry
      if (typeof window !== 'undefined' && (window as any).__ENGINE__?.currentExperimentId === 'math-stereometry') {
        return;
      }

      for (let i = 0; i < e.changedTouches.length; i++) {
        const touch = e.changedTouches[i];
        // Reserve the right side of the scene for camera look on touch devices.
        if (
          touch.clientX > window.innerWidth * 0.4 &&
          this.lookTouchId === null
        ) {
          this.lookTouchId = touch.identifier;
          this.lastLookPos = { x: touch.clientX, y: touch.clientY };
        }
      }
    });

    // Vision Spatial Window Launcher Button (Bottom-Right)
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
        this.visionLauncherBtn?.classList.add('is-pressed');
      }, { passive: false });

      this.visionLauncherBtn.addEventListener('touchend', (e) => {
        e.stopPropagation();
        this.visionLauncherBtn?.classList.remove('is-pressed');
        triggerLauncher(e);
      }, { passive: false });

      this.visionLauncherBtn.addEventListener('touchcancel', () => {
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

    // Visual cardinal feedback
    if (this.joystickBase) {
      this.joystickBase.classList.toggle('dir-up', isForward);
      this.joystickBase.classList.toggle('dir-down', isBackward);
      this.joystickBase.classList.toggle('dir-left', isLeft);
      this.joystickBase.classList.toggle('dir-right', isRight);
    }
  }
}
