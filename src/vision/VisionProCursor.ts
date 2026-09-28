import type { HandGestureFrame, SingleHandData } from './types.ts';
import { blurActiveInput, isElementVisibleAndActive, isTextInputElement } from '../core/focus.ts';

export class VisionProCursor {
  // Right Hand Cursor (Mouse Emulation)
  private rightContainer: HTMLElement;
  private rightRing: HTMLElement;
  private rightCore: HTMLElement;
  private rightPulseRing: HTMLElement;

  // Left Hand Reticle (Menu Toggle & Camera Navigation)
  private leftContainer: HTMLElement;
  private leftRing: HTMLElement;
  private leftCore: HTMLElement;
  private leftPulseRing: HTMLElement;
  private leftBadge: HTMLElement;

  private isRightVisible = false;
  private isLeftVisible = false;
  private isHovered = false;
  private isRightPinching = false;
  private isDualPinching = false;
  private currentRightX = 0;
  private currentRightY = 0;
  private currentLeftX = 0;
  private currentLeftY = 0;

  // High-refresh rate smooth gliding interpolation targets & rendered positions
  private targetRightX = -100;
  private targetRightY = -100;
  private targetLeftX = -100;
  private targetLeftY = -100;
  private renderRightX = -100;
  private renderRightY = -100;
  private renderLeftX = -100;
  private renderLeftY = -100;
  private animFrameId: number | null = null;
  private isDestroyed = false;

  // Mouse emulation state (driven exclusively by Right Hand)
  private lastHoverTarget: Element | null = null;
  private dragTarget: Element | null = null;
  private dragStartX = 0;
  private dragStartY = 0;
  private dragStartTime = 0;

  // Cached hit test & event throttling (prevents DOM layout thrashing & reflow spikes)
  private lastHitElement: Element | null = null;
  private lastHitX = -9999;
  private lastHitY = -9999;
  private lastHitTime = 0;
  private lastDispatchedX = -9999;
  private lastDispatchedY = -9999;
  private lastLeftClass = '';
  private lastLeftBadgeText = '';

  constructor(parent: HTMLElement = document.body) {
    this.injectStyles();

    // 1. Right Hand Cursor DOM
    this.rightContainer = document.createElement('div');
    this.rightContainer.id = 'vision-pro-hand-cursor';
    this.rightContainer.innerHTML = `
      <div class="vp-pulse-ring"></div>
      <div class="vp-reticle-ring">
        <div class="vp-reticle-core"></div>
      </div>
    `;
    this.rightRing = this.rightContainer.querySelector('.vp-reticle-ring') as HTMLElement;
    this.rightCore = this.rightContainer.querySelector('.vp-reticle-core') as HTMLElement;
    this.rightPulseRing = this.rightContainer.querySelector('.vp-pulse-ring') as HTMLElement;

    // 2. Left Hand Reticle DOM (White Vision Pro Reticle matching Right Hand)
    this.leftContainer = document.createElement('div');
    this.leftContainer.id = 'vision-pro-left-reticle';
    this.leftContainer.innerHTML = `
      <div class="vp-pulse-ring vp-left-pulse-ring"></div>
      <div class="vp-reticle-ring vp-left-ring">
        <div class="vp-reticle-core vp-left-core"></div>
      </div>
      <span class="vp-left-badge" style="display: none;">左手</span>
    `;
    this.leftRing = this.leftContainer.querySelector('.vp-left-ring') as HTMLElement;
    this.leftCore = this.leftContainer.querySelector('.vp-left-core') as HTMLElement;
    this.leftPulseRing = this.leftContainer.querySelector('.vp-left-pulse-ring') as HTMLElement;
    this.leftBadge = (this.leftContainer.querySelector('.vp-left-badge') || document.createElement('span')) as HTMLElement;

    parent.appendChild(this.rightContainer);
    parent.appendChild(this.leftContainer);

    this.setRightVisible(false);
    this.setLeftVisible(false);

    if (typeof requestAnimationFrame === 'function') {
      this.startRenderLoop();
    }
  }

  private injectStyles(): void {
    if (document.getElementById('vision-pro-cursor-style')) return;

    const style = document.createElement('style');
    style.id = 'vision-pro-cursor-style';
    style.textContent = `
      /* ========================================================== */
      /* Symmetrical Vision Pro White Reticle Cursors (Left & Right)*/
      /* ========================================================== */
      #vision-pro-hand-cursor,
      #vision-pro-left-reticle {
        position: fixed;
        top: 0;
        left: 0;
        width: 0;
        height: 0;
        pointer-events: none !important;
        z-index: 999999;
        transform: translate3d(-100px, -100px, 0);
        transition: opacity 0.22s cubic-bezier(0.16, 1, 0.3, 1);
        will-change: transform, opacity;
        font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif;
      }

      #vision-pro-hand-cursor.hidden,
      #vision-pro-left-reticle.hidden {
        opacity: 0;
        visibility: hidden;
      }

      #vision-pro-hand-cursor.visible,
      #vision-pro-left-reticle.visible {
        opacity: 1;
        visibility: visible;
      }

      .vp-reticle-ring,
      .vp-left-ring {
        position: absolute;
        top: -16px;
        left: -16px;
        width: 32px;
        height: 32px;
        border-radius: 50%;
        background: rgba(255, 255, 255, 0.16);
        border: 1.5px solid rgba(255, 255, 255, 0.72);
        box-shadow: 0 4px 18px rgba(0, 0, 0, 0.38), 0 0 10px rgba(255, 255, 255, 0.28);
        backdrop-filter: blur(8px);
        display: flex;
        align-items: center;
        justify-content: center;
        transform: scale(1);
        transition: width 0.18s cubic-bezier(0.16, 1, 0.3, 1),
                    height 0.18s cubic-bezier(0.16, 1, 0.3, 1),
                    top 0.18s cubic-bezier(0.16, 1, 0.3, 1),
                    left 0.18s cubic-bezier(0.16, 1, 0.3, 1),
                    background-color 0.18s ease,
                    border-color 0.18s ease,
                    transform 0.18s cubic-bezier(0.16, 1, 0.3, 1);
      }

      .vp-reticle-core,
      .vp-left-core {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: #ffffff;
        box-shadow: 0 0 6px rgba(255, 255, 255, 0.85);
        transition: transform 0.18s cubic-bezier(0.16, 1, 0.3, 1),
                    width 0.18s ease,
                    height 0.18s ease,
                    background-color 0.18s ease,
                    box-shadow 0.18s ease;
      }

      #vision-pro-hand-cursor.hovered .vp-reticle-ring,
      #vision-pro-left-reticle.hovered .vp-reticle-ring {
        top: -21px;
        left: -21px;
        width: 42px;
        height: 42px;
        background: rgba(255, 255, 255, 0.24);
        border-color: rgba(255, 255, 255, 0.95);
        box-shadow: 0 6px 24px rgba(0, 0, 0, 0.45), 0 0 16px rgba(255, 255, 255, 0.45);
      }

      #vision-pro-hand-cursor.hovered .vp-reticle-core,
      #vision-pro-left-reticle.hovered .vp-reticle-core {
        width: 8px;
        height: 8px;
      }

      #vision-pro-hand-cursor.pinching .vp-reticle-ring,
      #vision-pro-left-reticle.pinching .vp-reticle-ring,
      #vision-pro-left-reticle.quick-pinching .vp-reticle-ring,
      #vision-pro-left-reticle.navigating .vp-reticle-ring {
        top: -12px;
        left: -12px;
        width: 24px;
        height: 24px;
        background: rgba(255, 255, 255, 0.32);
        border-color: #ffffff;
        transform: scale(0.88);
        box-shadow: 0 0 18px rgba(255, 255, 255, 0.85), 0 2px 10px rgba(0, 0, 0, 0.5);
      }

      #vision-pro-hand-cursor.pinching .vp-reticle-core,
      #vision-pro-left-reticle.pinching .vp-reticle-core,
      #vision-pro-left-reticle.quick-pinching .vp-reticle-core,
      #vision-pro-left-reticle.navigating .vp-reticle-core {
        width: 12px;
        height: 12px;
        background: #ffffff;
        box-shadow: 0 0 12px #ffffff;
      }

      /* Dual-Hand Pinch Mode (Simultaneous pinch zoom on 3D geometry) */
      #vision-pro-hand-cursor.dual-pinching .vp-reticle-ring,
      #vision-pro-left-reticle.dual-pinching .vp-reticle-ring,
      #vision-pro-left-reticle.dual-pinching .vp-left-ring {
        top: -14px;
        left: -14px;
        width: 28px;
        height: 28px;
        background: rgba(255, 255, 255, 0.42);
        border: 2px solid #ffffff;
        transform: scale(0.92);
        box-shadow: 0 0 24px rgba(255, 255, 255, 0.95), 0 0 12px rgba(56, 189, 248, 0.6);
      }

      #vision-pro-hand-cursor.dual-pinching .vp-reticle-core,
      #vision-pro-left-reticle.dual-pinching .vp-reticle-core,
      #vision-pro-left-reticle.dual-pinching .vp-left-core {
        width: 13px;
        height: 13px;
        background: #ffffff;
        box-shadow: 0 0 16px rgba(255, 255, 255, 1);
      }

      .vp-pulse-ring,
      .vp-left-pulse-ring {
        position: absolute;
        top: -16px;
        left: -16px;
        width: 32px;
        height: 32px;
        border-radius: 50%;
        border: 2px solid rgba(255, 255, 255, 0.85);
        opacity: 0;
        pointer-events: none;
        transform: scale(0.6);
      }

      .vp-pulse-ring.pulsing,
      .vp-left-pulse-ring.pulsing {
        animation: vpPinchPulse 0.45s cubic-bezier(0.16, 1, 0.3, 1) forwards;
      }

      @keyframes vpPinchPulse {
        0% { opacity: 0.9; transform: scale(0.7); }
        100% { opacity: 0; transform: scale(2.4); }
      }

      .vp-left-badge {
        position: absolute;
        top: -24px;
        white-space: nowrap;
        font-size: 10px;
        font-weight: 600;
        letter-spacing: -0.1px;
        color: #f5f5f7;
        background: rgba(28, 28, 30, 0.85);
        border: 1px solid rgba(255, 255, 255, 0.4);
        border-radius: 980px;
        padding: 2px 7px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
        opacity: 0;
        transform: translateY(3px) scale(0.9);
        transition: all 0.18s cubic-bezier(0.16, 1, 0.3, 1);
        pointer-events: none;
      }
    `;
    document.head.appendChild(style);
  }

  public setRightVisible(visible: boolean): void {
    if (this.isRightVisible === visible) return;
    this.isRightVisible = visible;
    if (visible) {
      this.rightContainer.classList.remove('hidden');
      this.rightContainer.classList.add('visible');
    } else {
      this.rightContainer.classList.add('hidden');
      this.rightContainer.classList.remove('visible');
      this.clearHover();
      this.releasePinch();
      this.lastHitElement = null;
      this.lastHitX = -9999;
      this.lastHitY = -9999;
      this.lastDispatchedX = -9999;
      this.lastDispatchedY = -9999;
      this.targetRightX = -100;
      this.targetRightY = -100;
      this.renderRightX = -100;
      this.renderRightY = -100;
    }
  }

  public setLeftVisible(visible: boolean): void {
    if (this.isLeftVisible === visible) return;
    this.isLeftVisible = visible;
    if (visible) {
      this.leftContainer.classList.remove('hidden');
      this.leftContainer.classList.add('visible');
    } else {
      this.leftContainer.classList.add('hidden');
      this.leftContainer.classList.remove('visible');
      this.targetLeftX = -100;
      this.targetLeftY = -100;
      this.renderLeftX = -100;
      this.renderLeftY = -100;
    }
  }

  private startRenderLoop(): void {
    const loop = () => {
      if (this.isDestroyed) return;
      this.renderTick();
      if (typeof requestAnimationFrame === 'function') {
        this.animFrameId = requestAnimationFrame(loop);
      }
    };
    this.animFrameId = requestAnimationFrame(loop);
  }

  private renderTick(): void {
    if (this.isRightVisible) {
      // High-refresh rate smooth gliding interpolation (60Hz / 120Hz)
      const factor = 0.42;
      this.renderRightX += (this.targetRightX - this.renderRightX) * factor;
      this.renderRightY += (this.targetRightY - this.renderRightY) * factor;
      this.currentRightX = this.renderRightX;
      this.currentRightY = this.renderRightY;
      this.rightContainer.style.transform = `translate3d(${this.renderRightX.toFixed(2)}px, ${this.renderRightY.toFixed(2)}px, 0)`;
    }

    if (this.isLeftVisible) {
      const factor = 0.42;
      this.renderLeftX += (this.targetLeftX - this.renderLeftX) * factor;
      this.renderLeftY += (this.targetLeftY - this.renderLeftY) * factor;
      this.currentLeftX = this.renderLeftX;
      this.currentLeftY = this.renderLeftY;
      this.leftContainer.style.transform = `translate3d(${this.renderLeftX.toFixed(2)}px, ${this.renderLeftY.toFixed(2)}px, 0)`;
    }
  }

  public getRightPosition(): { x: number; y: number } {
    return { x: this.currentRightX, y: this.currentRightY };
  }

  /**
   * Main update function called on each hand tracking frame.
   */
  public update(frame: HandGestureFrame): void {
    this.isDualPinching = Boolean(frame.isDualPinching);

    if (this.isDualPinching) {
      this.rightContainer.classList.add('dual-pinching');
      this.leftContainer.classList.add('dual-pinching');
      if (this.isRightPinching || this.dragTarget) {
        this.releasePinch(this.currentRightX, this.currentRightY);
      }
    } else {
      this.rightContainer.classList.remove('dual-pinching');
      this.leftContainer.classList.remove('dual-pinching');
    }

    // 1. Process Right Hand (or primary hand for mouse emulation)
    const rightHand = frame.rightHand || (frame.hasHand && !frame.leftHand ? frame : null);
    if (rightHand && rightHand.screenX > 0 && rightHand.screenY > 0) {
      this.updateRightHand(rightHand);
    } else {
      if (this.isRightVisible) {
        this.setRightVisible(false);
      }
    }

    // 2. Process Left Hand (Menu Toggle & Camera Perspective)
    if (frame.leftHand) {
      this.updateLeftHand(frame.leftHand, frame.leftHandQuickPinch);
    } else {
      if (this.isLeftVisible) {
        this.setLeftVisible(false);
      }
    }
  }

  private updateRightHand(hand: SingleHandData | HandGestureFrame): void {
    if (!this.isRightVisible) {
      this.setRightVisible(true);
      this.renderRightX = hand.screenX;
      this.renderRightY = hand.screenY;
      this.currentRightX = hand.screenX;
      this.currentRightY = hand.screenY;
      this.rightContainer.style.transform = `translate3d(${hand.screenX}px, ${hand.screenY}px, 0)`;
    }

    this.targetRightX = hand.screenX;
    this.targetRightY = hand.screenY;

    if (typeof requestAnimationFrame !== 'function') {
      this.currentRightX = hand.screenX;
      this.currentRightY = hand.screenY;
      this.rightContainer.style.transform = `translate3d(${hand.screenX}px, ${hand.screenY}px, 0)`;
    }

    // Throttled hit-testing: avoids repeated synchronous document.elementFromPoint layout reflows
    let element: Element | null = this.dragTarget;
    if (!element) {
      const now = performance.now();
      if (
        !this.lastHitElement ||
        Math.hypot(hand.screenX - this.lastHitX, hand.screenY - this.lastHitY) >= 3 ||
        now - this.lastHitTime >= 32
      ) {
        element = document.elementFromPoint(hand.screenX, hand.screenY) || document.body;
        this.lastHitElement = element;
        this.lastHitX = hand.screenX;
        this.lastHitY = hand.screenY;
        this.lastHitTime = now;
      } else {
        element = this.lastHitElement;
      }
    }

    const isInteractive = this.checkInteractive(element);
    this.setHovered(isInteractive);

    if (!hand.isPinching && hand.pinchStrength > 0.1) {
      const coreScale = 1.0 + hand.pinchStrength * 0.6;
      this.rightCore.style.transform = `scale(${coreScale})`;
    } else if (!hand.isPinching) {
      this.rightCore.style.transform = 'scale(1)';
    }

    this.processMouseEmulation(hand, element);
  }

  private updateLeftHand(leftHand: SingleHandData, quickPinchTriggered: boolean): void {
    if (!this.isLeftVisible) {
      this.setLeftVisible(true);
      this.renderLeftX = leftHand.screenX;
      this.renderLeftY = leftHand.screenY;
      this.currentLeftX = leftHand.screenX;
      this.currentLeftY = leftHand.screenY;
      this.leftContainer.style.transform = `translate3d(${leftHand.screenX}px, ${leftHand.screenY}px, 0)`;
    }

    this.targetLeftX = leftHand.screenX;
    this.targetLeftY = leftHand.screenY;

    if (typeof requestAnimationFrame !== 'function') {
      this.currentLeftX = leftHand.screenX;
      this.currentLeftY = leftHand.screenY;
      this.leftContainer.style.transform = `translate3d(${leftHand.screenX}px, ${leftHand.screenY}px, 0)`;
    }

    if (!leftHand.isPinching && leftHand.pinchStrength > 0.1) {
      const coreScale = 1.0 + leftHand.pinchStrength * 0.6;
      this.leftCore.style.transform = `scale(${coreScale})`;
    } else if (!leftHand.isPinching) {
      this.leftCore.style.transform = 'scale(1)';
    }

    const desiredClass = this.isDualPinching
      ? 'visible dual-pinching'
      : leftHand.isLongPinch
      ? 'visible navigating'
      : leftHand.isPinching
      ? 'visible quick-pinching'
      : 'visible';
    const desiredBadge = this.isDualPinching
      ? '双手缩放中'
      : leftHand.isLongPinch
      ? '拖拽视角中'
      : leftHand.isPinching
      ? '悬浮窗口'
      : '左手控制';

    if (this.lastLeftClass !== desiredClass) {
      this.lastLeftClass = desiredClass;
      this.leftContainer.className = desiredClass;
    }
    if (this.lastLeftBadgeText !== desiredBadge) {
      this.lastLeftBadgeText = desiredBadge;
      this.leftBadge.textContent = desiredBadge;
    }

    if (quickPinchTriggered || (leftHand.justPinchStarted && !leftHand.isLongPinch)) {
      this.triggerLeftPulse();
    }
  }

  private triggerLeftPulse(): void {
    this.leftPulseRing.classList.remove('pulsing');
    void this.leftPulseRing.offsetWidth;
    this.leftPulseRing.classList.add('pulsing');
  }

  private checkInteractive(element: Element): boolean {
    if (
      !element ||
      element === document.body ||
      element.id === 'webgl-container' ||
      element.id === 'webgl-canvas' ||
      (element.tagName === 'CANVAS' && (element.parentElement?.id === 'webgl-container' || element.id === 'webgl-canvas'))
    ) {
      return false;
    }
    return Boolean(
      element.closest(
        'button, a, input, select, textarea, [role="button"], .clickable, .tab-item, .dock-btn, .color-swatch, .reagent-card, .vision-panel, .drawer-handle, .whiteboard-canvas-layer'
      )
    );
  }

  private setHovered(hovered: boolean): void {
    if (this.isHovered === hovered) return;
    this.isHovered = hovered;
    if (hovered) {
      this.rightContainer.classList.add('hovered');
    } else {
      this.rightContainer.classList.remove('hovered');
    }
  }

  private triggerRightPinchRipple(): void {
    this.rightPulseRing.classList.remove('pulsing');
    void this.rightPulseRing.offsetWidth;
    this.rightPulseRing.classList.add('pulsing');
  }

  /**
   * Translates Right Hand pinch state transitions into standard Pointer & Mouse Events.
   */
  private processMouseEmulation(
    hand: SingleHandData | HandGestureFrame,
    currentElement: Element
  ): void {
    const x = hand.screenX;
    const y = hand.screenY;

    if (this.isDualPinching) {
      if (this.isRightPinching || this.dragTarget) {
        this.releasePinch(x, y, currentElement);
      }
      return;
    }

    if (this.lastHoverTarget !== currentElement) {
      if (this.lastHoverTarget) {
        this.dispatchPointerEvent('pointerout', this.lastHoverTarget, x, y, 0, hand.isPinching ? 1 : 0);
        this.dispatchPointerEvent('pointerleave', this.lastHoverTarget, x, y, 0, hand.isPinching ? 1 : 0);
        this.dispatchMouseEvent('mouseout', this.lastHoverTarget, x, y, 0, hand.isPinching ? 1 : 0);
        this.dispatchMouseEvent('mouseleave', this.lastHoverTarget, x, y, 0, hand.isPinching ? 1 : 0);
      }
      this.dispatchPointerEvent('pointerover', currentElement, x, y, 0, hand.isPinching ? 1 : 0);
      this.dispatchPointerEvent('pointerenter', currentElement, x, y, 0, hand.isPinching ? 1 : 0);
      this.dispatchMouseEvent('mouseover', currentElement, x, y, 0, hand.isPinching ? 1 : 0);
      this.dispatchMouseEvent('mouseenter', currentElement, x, y, 0, hand.isPinching ? 1 : 0);
      this.lastHoverTarget = currentElement;
    }

    // Pinch Down (Mouse Down)
    if (hand.justPinchStarted) {
      this.isRightPinching = true;
      this.rightContainer.classList.add('pinching');
      this.triggerRightPinchRipple();

      this.dragTarget = currentElement;
      this.dragStartX = x;
      this.dragStartY = y;
      this.dragStartTime = performance.now();

      this.dispatchPointerEvent('pointerdown', this.dragTarget, x, y, 0, 1);
      this.dispatchMouseEvent('mousedown', this.dragTarget, x, y, 0, 1);

      if (
        isTextInputElement(this.dragTarget) &&
        isElementVisibleAndActive(this.dragTarget as HTMLElement)
      ) {
        (this.dragTarget as HTMLElement).focus?.();
      } else {
        blurActiveInput(true);
      }
    }

    // Pinch Dragging
    if (hand.isPinching && !hand.justPinchStarted) {
      const target = this.dragTarget || currentElement;
      this.dispatchPointerEvent('pointermove', target, x, y, 0, 1);
      this.dispatchMouseEvent('mousemove', target, x, y, 0, 1);
      this.lastDispatchedX = x;
      this.lastDispatchedY = y;
    } else if (!hand.isPinching) {
      // Throttle micro-jitter (< 0.5px) when hovering
      if (Math.hypot(x - this.lastDispatchedX, y - this.lastDispatchedY) >= 0.5) {
        this.dispatchPointerEvent('pointermove', currentElement, x, y, 0, 0);
        this.dispatchMouseEvent('mousemove', currentElement, x, y, 0, 0);
        this.lastDispatchedX = x;
        this.lastDispatchedY = y;
      }
    }

    // Pinch Up (Mouse Up & Click)
    if (hand.justPinchEnded) {
      this.releasePinch(x, y, currentElement);
    }
  }

  private releasePinch(
    x = this.currentRightX,
    y = this.currentRightY,
    currentElement?: Element
  ): void {
    if (!this.isRightPinching && !this.dragTarget) return;

    this.isRightPinching = false;
    this.rightContainer.classList.remove('pinching');

    const target = this.dragTarget || currentElement || document.body;

    this.dispatchPointerEvent('pointerup', target, x, y, 0, 0);
    this.dispatchMouseEvent('mouseup', target, x, y, 0, 0);

    const dist = Math.hypot(x - this.dragStartX, y - this.dragStartY);
    if (dist < 26) {
      const upTarget = currentElement || document.elementFromPoint(x, y) || target;
      const clickTarget =
        upTarget && target.contains(upTarget) ? upTarget : target;

      this.dispatchMouseEvent('click', clickTarget, x, y, 0, 0);

      if (
        clickTarget instanceof HTMLElement &&
        !(clickTarget instanceof HTMLCanvasElement) &&
        typeof clickTarget.click === 'function'
      ) {
        clickTarget.click();
      }
    }

    this.dragTarget = null;
  }

  private clearHover(): void {
    if (this.lastHoverTarget) {
      this.dispatchMouseEvent('mouseleave', this.lastHoverTarget, this.currentRightX, this.currentRightY, 0, 0);
      this.lastHoverTarget = null;
    }
  }

  private dispatchPointerEvent(
    type: string,
    target: Element,
    clientX: number,
    clientY: number,
    button: number,
    buttons: number
  ): void {
    try {
      const event = new PointerEvent(type, {
        bubbles: true,
        cancelable: true,
        view: window,
        clientX,
        clientY,
        screenX: clientX,
        screenY: clientY,
        button,
        buttons,
        pointerId: 1,
        pointerType: 'mouse',
        isPrimary: true,
      });
      target.dispatchEvent(event);
    } catch (e) {
      // Ignore
    }
  }

  private dispatchMouseEvent(
    type: string,
    target: Element,
    clientX: number,
    clientY: number,
    button: number,
    buttons: number
  ): void {
    try {
      const event = new MouseEvent(type, {
        bubbles: true,
        cancelable: true,
        view: window,
        clientX,
        clientY,
        screenX: clientX,
        screenY: clientY,
        button,
        buttons,
      });
      target.dispatchEvent(event);
    } catch (e) {
      // Ignore
    }
  }

  public destroy(): void {
    this.isDestroyed = true;
    if (this.animFrameId !== null && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
    this.releasePinch();
    this.clearHover();
    if (this.rightContainer && this.rightContainer.parentNode) {
      this.rightContainer.parentNode.removeChild(this.rightContainer);
    }
    if (this.leftContainer && this.leftContainer.parentNode) {
      this.leftContainer.parentNode.removeChild(this.leftContainer);
    }
  }
}
