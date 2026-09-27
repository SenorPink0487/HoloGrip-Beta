import type { PlayerController } from './PlayerController';
import { blurActiveInput } from '../core/focus.ts';

export class TouchController {
  private container: HTMLElement;
  private joystickBase: HTMLElement | null = null;
  private joystickKnob: HTMLElement | null = null;

  private isDraggingJoystick = false;
  private joystickTouchId: number | null = null;
  private joystickCenter = { x: 0, y: 0 };
  private maxRadius = 45;

  private lookTouchId: number | null = null;
  private lastLookPos = { x: 0, y: 0 };

  private player: PlayerController;

  constructor(player: PlayerController) {
    this.player = player;
    this.container = document.body;
    this.initTouchUI();
    this.bindEvents();
  }

  private initTouchUI(): void {
    const isTouchDevice =
      'ontouchstart' in window ||
      navigator.maxTouchPoints > 0;

    if (!isTouchDevice) return;

    document.body.classList.add('has-touch-controls');

    // Create Virtual Joystick DOM elements
    const wrapper = document.createElement('div');
    wrapper.id = 'touch-controls-layer';
    wrapper.innerHTML = `
      <div id="virtual-joystick-base">
        <div id="virtual-joystick-knob"></div>
      </div>
    `;

    // High-tech subtle cyber styling for touch joystick
    const style = document.createElement('style');
    style.textContent = `
      #touch-controls-layer {
        position: fixed;
        bottom: 0;
        left: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
        z-index: 900;
      }
      #virtual-joystick-base {
        position: absolute;
        bottom: calc(36px + env(safe-area-inset-bottom, 0px));
        left: calc(36px + env(safe-area-inset-left, 0px));
        width: 110px;
        height: 110px;
        border-radius: 50%;
        background: rgba(8, 20, 36, 0.45);
        border: 2px solid rgba(0, 240, 255, 0.4);
        box-shadow: 0 0 15px rgba(0, 240, 255, 0.15);
        backdrop-filter: blur(8px);
        -webkit-backdrop-filter: blur(8px);
        display: flex;
        align-items: center;
        justify-content: center;
        pointer-events: auto;
        touch-action: none;
      }
      #virtual-joystick-knob {
        width: 44px;
        height: 44px;
        border-radius: 50%;
        background: radial-gradient(circle, #00f0ff 0%, #0088cc 100%);
        box-shadow: 0 0 12px rgba(0, 240, 255, 0.6);
        pointer-events: none;
        transform: translate(0px, 0px);
        transition: transform 0.05s ease-out;
      }
    `;

    document.head.appendChild(style);
    this.container.appendChild(wrapper);

    this.joystickBase = wrapper.querySelector('#virtual-joystick-base');
    this.joystickKnob = wrapper.querySelector('#virtual-joystick-knob');
  }

  private bindEvents(): void {
    if (!this.joystickBase) return;

    // Joystick Touch events
    this.joystickBase.addEventListener('touchstart', (e: TouchEvent) => {
      blurActiveInput(true);
      const touch = e.changedTouches[0];
      this.isDraggingJoystick = true;
      this.joystickTouchId = touch.identifier;

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

        // 2. Camera Look drag (any touch on right half of screen)
        if (touch.identifier === this.lookTouchId) {
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
          this.player.keys.forward = false;
          this.player.keys.backward = false;
          this.player.keys.left = false;
          this.player.keys.right = false;

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
      blurActiveInput(true);
      for (let i = 0; i < e.changedTouches.length; i++) {
        const touch = e.changedTouches[i];
        // If touch is on right 60% of screen and not on a UI button/drawer
        if (
          touch.clientX > window.innerWidth * 0.4 &&
          this.lookTouchId === null &&
          !(e.target as HTMLElement).closest('.hud-interactive')
        ) {
          this.lookTouchId = touch.identifier;
          this.lastLookPos = { x: touch.clientX, y: touch.clientY };
        }
      }
    });
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
    }

    const deadZone = 8;
    this.player.keys.forward = dy < -deadZone;
    this.player.keys.backward = dy > deadZone;
    this.player.keys.left = dx < -deadZone;
    this.player.keys.right = dx > deadZone;
    this.player.keys.sprint = dist > this.maxRadius * 0.85;
  }
}
