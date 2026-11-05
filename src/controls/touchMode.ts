import { PlatformBridge } from '../core/platform/PlatformBridge.ts';

/**
 * iPad & Touchscreen Anti-Sticky-Hover Input Mode Manager
 * 
 * Automatically detects whether the user is interacting via touch or mouse.
 * When touch interaction occurs (or on iPad / iOS / Android devices), adds `.is-touch-device`
 * to document.body, eliminating accidental sticky hover states on cards and buttons.
 * When a mouse/trackpad moves with genuine displacement, removes `.is-touch-device`
 * so desktop users enjoy responsive hover transitions.
 */
let isInitialized = false;

export function resetTouchModeTrackingForTest(): void {
  isInitialized = false;
}

export function isTouchModeActive(): boolean {
  return typeof document !== 'undefined' && (document.body?.classList.contains('is-touch-device') ?? false);
}

export function initTouchModeTracking(force = false): void {
  if (isInitialized && !force) return;
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  const updateTouchMode = (isTouch: boolean) => {
    if (!document.body) return;
    if (isTouch) {
      document.body.classList.add('is-touch-device');
    } else {
      document.body.classList.remove('is-touch-device');
    }
  };

  // Initial check based on platform bridge and touch capabilities
  try {
    const platform = PlatformBridge.getInstance().info;
    const isInitialTouch =
      platform.isMobile ||
      platform.platform === 'ipados' ||
      platform.platform === 'ios' ||
      platform.platform === 'android' ||
      ('ontouchstart' in window) ||
      (navigator.maxTouchPoints > 0);

    if (isInitialTouch) {
      updateTouchMode(true);
    }
  } catch {
    if (('ontouchstart' in window) || (navigator.maxTouchPoints > 0)) {
      updateTouchMode(true);
    }
  }

  // Listen for user interactions to dynamically switch modes if hybrid device
  window.addEventListener('touchstart', () => {
    updateTouchMode(true);
  }, { capture: true, passive: true });

  window.addEventListener('pointerdown', (e: PointerEvent) => {
    if (e.pointerType === 'touch') {
      updateTouchMode(true);
    } else if (e.pointerType === 'mouse') {
      updateTouchMode(false);
    }
  }, { capture: true, passive: true });

  window.addEventListener('mousemove', (e: MouseEvent) => {
    // Only respond to actual mouse displacement (ignoring synthetic zero-movement events from touch taps)
    if (e.movementX !== 0 || e.movementY !== 0) {
      updateTouchMode(false);
    }
  }, { capture: true, passive: true });

  isInitialized = true;
}
