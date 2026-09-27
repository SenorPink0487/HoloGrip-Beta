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

  // Check standard CSS display/visibility if in browser environment
  if (typeof window !== 'undefined' && typeof window.getComputedStyle === 'function') {
    try {
      const style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse') {
        return false;
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
