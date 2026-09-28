/**
 * Centralized focus and input-state management to prevent unwanted typing input
 * (IME composition, virtual keyboard, or text cursor) in non-input states.
 */

export function isTextInputElement(el: Element | null): boolean {
  if (!el) return false;
  const tag = el.tagName?.toUpperCase();
  if (tag === 'TEXTAREA') return true;
  if ((el as HTMLElement).isContentEditable) return true;
  if (tag === 'INPUT') {
    const input = el as HTMLInputElement;
    const type = (input.type || 'text').toLowerCase();
    const nonTextTypes = new Set([
      'range',
      'checkbox',
      'radio',
      'button',
      'submit',
      'reset',
      'file',
      'color',
      'image',
      'hidden',
    ]);
    return !nonTextTypes.has(type);
  }
  return false;
}

export function isElementVisibleAndActive(el: HTMLElement | null): boolean {
  if (!el) return false;

  // Check if disabled or readonly
  if ((el as HTMLInputElement).disabled || (el as HTMLInputElement).readOnly) {
    return false;
  }

  // Check if attached to DOM
  if (typeof el.isConnected === 'boolean' && !el.isConnected) {
    return false;
  }

  // Check inert (HTML attribute or property)
  if ((el as any).inert || (typeof el.closest === 'function' && el.closest('[inert]'))) {
    return false;
  }

  // Check aria-hidden
  if (
    el.getAttribute?.('aria-hidden') === 'true' ||
    (typeof el.closest === 'function' && el.closest('[aria-hidden="true"]'))
  ) {
    return false;
  }

  // Check known application containers
  if (typeof el.closest === 'function') {
    const drawer = el.closest('#experiment-drawer');
    if (drawer && !drawer.classList.contains('open')) {
      return false;
    }

    const visionWindow = el.closest('#vision-spatial-window');
    if (visionWindow && visionWindow.classList.contains('hidden')) {
      return false;
    }

    const accountModal = el.closest('#account-modal-backdrop');
    if (accountModal && !accountModal.classList.contains('open')) {
      return false;
    }
  }

  // Check standard CSS display/visibility/opacity/pointer-events if in browser environment
  if (typeof window !== 'undefined' && typeof window.getComputedStyle === 'function') {
    try {
      const style = window.getComputedStyle(el);
      if (
        style.display === 'none' ||
        style.visibility === 'hidden' ||
        style.visibility === 'collapse' ||
        style.opacity === '0' ||
        style.pointerEvents === 'none'
      ) {
        return false;
      }

      // Check ancestor computed styles (display/visibility/opacity)
      let parent = el.parentElement;
      while (parent && parent !== document.body) {
        // If parent is a known application container, its visibility has already been checked above
        if (
          parent.id === 'vision-spatial-window' ||
          parent.id === 'experiment-drawer' ||
          parent.id === 'account-modal-backdrop'
        ) {
          break;
        }

        const pStyle = window.getComputedStyle(parent);
        if (
          pStyle.display === 'none' ||
          pStyle.visibility === 'hidden' ||
          pStyle.visibility === 'collapse' ||
          pStyle.opacity === '0'
        ) {
          return false;
        }
        parent = parent.parentElement;
      }
    } catch {
      // Ignore errors in mock or headless environments
    }
  }

  // Check offsetParent (null means hidden unless fixed position in standard DOM)
  if (el.offsetParent === null && el.style?.position !== 'fixed') {
    // If it's not fixed position and has null offsetParent, it's hidden
    if (typeof el.getBoundingClientRect === 'function') {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) {
        return false;
      }
    }
  }

  return true;
}

/**
 * Returns true only if the user is genuinely, actively focused on an interactive text input
 * within an open, visible dialog or container.
 * If focus is on a stale, hidden, or non-text element, it automatically blurs it and returns false.
 */
export function isTextInputActive(): boolean {
  if (typeof document === 'undefined') return false;
  const active = document.activeElement as HTMLElement | null;
  if (!active || active === document.body) return false;

  if (!isTextInputElement(active)) {
    return false;
  }

  if (!isElementVisibleAndActive(active)) {
    // Stale or hidden focus leaked into non-input state -> blur immediately
    try {
      active.blur?.();
    } catch {
      // Ignore
    }
    return false;
  }

  return true;
}

/**
 * Explicitly blur any currently focused text input or modal element.
 */
export function blurActiveInput(force = false): void {
  if (typeof document === 'undefined') return;
  const active = document.activeElement as HTMLElement | null;
  if (!active || active === document.body) return;

  if (force || isTextInputElement(active) || !isElementVisibleAndActive(active)) {
    try {
      active.blur?.();
    } catch {
      // Ignore
    }
  }
}

/**
 * Traps Tab key navigation inside the given active modal container.
 */
function trapFocusInsideModal(modal: HTMLElement, event: KeyboardEvent): void {
  const focusable = modal.querySelectorAll<HTMLElement>(
    'button:not([disabled]):not([tabindex="-1"]), ' +
    'input:not([disabled]):not([tabindex="-1"]), ' +
    'select:not([disabled]):not([tabindex="-1"]), ' +
    'textarea:not([disabled]):not([tabindex="-1"]), ' +
    '[tabindex]:not([tabindex="-1"])'
  );

  const list = Array.from(focusable).filter((el) => {
    if (el.hasAttribute('disabled') || (el as any).disabled) return false;
    if (typeof window !== 'undefined' && typeof window.getComputedStyle === 'function') {
      try {
        const s = window.getComputedStyle(el);
        if (s.display === 'none' || s.visibility === 'hidden') return false;
      } catch {}
    }
    return true;
  });

  if (list.length === 0) {
    event.preventDefault();
    blurActiveInput(true);
    return;
  }

  const first = list[0];
  const last = list[list.length - 1];
  const current = document.activeElement as HTMLElement | null;

  if (event.shiftKey) {
    if (current === first || !modal.contains(current)) {
      event.preventDefault();
      last.focus();
    }
  } else {
    if (current === last || !modal.contains(current)) {
      event.preventDefault();
      first.focus();
    }
  }
}

let guardsInitialized = false;

/**
 * Initialize automatic global focus guards:
 * 1. Global focusin guard: Immediately blurs any inactive/hidden text inputs if targeted by browser autofill, Tab, or script.
 * 2. Global pointerdown guard: Blurs active text inputs when clicking outside them.
 * 3. Tab navigation guard: Prevents Tab key from leaking focus into closed modals or hidden inputs.
 */
export function initGlobalFocusGuards(): void {
  if (guardsInitialized) return;
  if (typeof document === 'undefined' || typeof window === 'undefined') return;
  guardsInitialized = true;

  // 1. Immediately intercept unwanted focus on inactive/hidden elements (e.g., from browser autofill or Tab)
  document.addEventListener(
    'focusin',
    (e) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (isTextInputElement(target)) {
        if (!isElementVisibleAndActive(target)) {
          try {
            target.blur?.();
          } catch {}
          blurActiveInput(true);
        }
      }
    },
    true
  );

  // 2. Dismiss active text inputs when clicking/touching outside their form/container
  window.addEventListener(
    'pointerdown',
    (e) => {
      const active = document.activeElement as HTMLElement | null;
      if (!active || !isTextInputElement(active)) return;

      const target = e.target as HTMLElement | null;
      if (!target) return;

      // Keep focus if clicking within the input itself or its interactive row/form
      if (active.contains(target) || target === active) return;
      if (active.closest('.mixture-ai-row')?.contains(target)) return;
      if (active.closest('.search-input-wrapper')?.contains(target)) return;
      const activeForm = active.closest('form');
      const targetForm = target.closest?.('form');
      if (activeForm && targetForm && activeForm === targetForm) return;

      // If clicking directly on 3D canvas, webgl container, or outside the interactive parent
      if (
        target.tagName === 'CANVAS' ||
        target.id === 'webgl-container' ||
        target.id === 'webgl-canvas' ||
        !active.closest('#vision-spatial-window')?.contains(target)
      ) {
        blurActiveInput(true);
      }
    },
    true
  );

  // 3. Tab key focus confinement
  window.addEventListener(
    'keydown',
    (e) => {
      if (e.key === 'Tab' || e.code === 'Tab') {
        const openAccountModal = document.querySelector('#account-modal-backdrop.open') as HTMLElement | null;
        const openDrawer = document.querySelector('#experiment-drawer.open') as HTMLElement | null;
        const openVisionModal = document.querySelector('#vision-spatial-window:not(.hidden)') as HTMLElement | null;

        if (openAccountModal) {
          trapFocusInsideModal(openAccountModal, e);
          return;
        }

        if (openDrawer) {
          trapFocusInsideModal(openDrawer, e);
          return;
        }

        if (openVisionModal) {
          trapFocusInsideModal(openVisionModal, e);
          return;
        }

        // Pure 3D scene without open modals: prevent Tab from focusing hidden inputs or background elements
        e.preventDefault();
        blurActiveInput(true);
      }
    },
    true
  );
}

// Auto-initialize when running in browser environment
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  initGlobalFocusGuards();
}
