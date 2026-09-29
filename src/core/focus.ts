/**
 * 集中焦点与输入状态管理，防止在非输入状态下触发意外输入
 * （如输入法合成、虚拟键盘或文本光标闪烁）。
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

  // 检查是否禁用或只读
  if ((el as HTMLInputElement).disabled || (el as HTMLInputElement).readOnly) {
    return false;
  }

  // 检查是否挂载至 DOM
  if (typeof el.isConnected === 'boolean' && !el.isConnected) {
    return false;
  }

  // 检查 inert 属性或其祖先元素
  if ((el as any).inert || (typeof el.closest === 'function' && el.closest('[inert]'))) {
    return false;
  }

  // 检查 aria-hidden 状态
  if (
    el.getAttribute?.('aria-hidden') === 'true' ||
    (typeof el.closest === 'function' && el.closest('[aria-hidden="true"]'))
  ) {
    return false;
  }

  // 检查已知的应用容器可见性
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

  // 浏览器环境下检查标准 CSS 属性（display/visibility/opacity/pointer-events）
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

      // 检查祖先元素的计算样式（display/visibility/opacity）
      let parent = el.parentElement;
      while (parent && parent !== document.body) {
        // 若父级为已知应用容器，其可见性已在上方检查过
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
      // 忽略模拟或无头环境中的异常
    }
  }

  // 检查 offsetParent（非 fixed 定位下为 null 表示隐藏）
  if (el.offsetParent === null && el.style?.position !== 'fixed') {
    // 若非 fixed 定位且 offsetParent 为 null，则判定为隐藏
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
 * 仅当用户在已打开的可见对话框或容器内主动聚焦于可交互文本输入框时返回 true。
 * 若焦点停留在陈旧、隐藏或非文本元素上，会自动使其失焦并返回 false。
 */
export function isTextInputActive(): boolean {
  if (typeof document === 'undefined') return false;
  const active = document.activeElement as HTMLElement | null;
  if (!active || active === document.body) return false;

  if (!isTextInputElement(active)) {
    return false;
  }

  if (!isElementVisibleAndActive(active)) {
    // 焦点泄漏至陈旧或隐藏元素 -> 立即强制失焦
    try {
      active.blur?.();
    } catch {
      // 忽略异常
    }
    return false;
  }

  return true;
}

/**
 * 显式使当前聚焦的文本输入框或弹窗元素失焦。
 */
export function blurActiveInput(force = false): void {
  if (typeof document === 'undefined') return;
  const active = document.activeElement as HTMLElement | null;
  if (!active || active === document.body) return;

  if (force || isTextInputElement(active) || !isElementVisibleAndActive(active)) {
    try {
      active.blur?.();
    } catch {
      // 忽略异常
    }
  }
}

/**
 * 将 Tab 键导航焦点限制在指定的活动弹窗容器内。
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
 * 初始化全局自动焦点守卫：
 * 1. 全局 focusin 守卫：拦截浏览器自动填充、Tab 键或脚本触发的隐藏/非活动输入框焦点并使其失焦。
 * 2. 全局 pointerdown 守卫：点击输入框区域外部时自动解除输入框焦点。
 * 3. Tab 导航守卫：防止 Tab 键将焦点移入已关闭弹窗或隐藏输入框。
 */
export function initGlobalFocusGuards(): void {
  if (guardsInitialized) return;
  if (typeof document === 'undefined' || typeof window === 'undefined') return;
  guardsInitialized = true;

  // 1. 立即拦截非活动/隐藏元素上的意外焦点（如浏览器自动填充或 Tab 键切换）
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

  // 2. 点击/触摸表单或容器外部时解除活动输入框的焦点
  window.addEventListener(
    'pointerdown',
    (e) => {
      const active = document.activeElement as HTMLElement | null;
      if (!active || !isTextInputElement(active)) return;

      const target = e.target as HTMLElement | null;
      if (!target) return;

      // 若点击输入框自身或其交互行/表单内，保持焦点
      if (active.contains(target) || target === active) return;
      if (active.closest('.mixture-ai-row')?.contains(target)) return;
      if (active.closest('.search-input-wrapper')?.contains(target)) return;
      const activeForm = active.closest('form');
      const targetForm = target.closest?.('form');
      if (activeForm && targetForm && activeForm === targetForm) return;

      // 若直接点击 3D 画布、WebGL 容器或交互父容器外部，立即失焦
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

  // 3. Tab 键焦点限制
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

        // 纯 3D 场景且无弹窗打开：阻止 Tab 聚焦隐藏输入框或背景元素
        e.preventDefault();
        blurActiveInput(true);
      }
    },
    true
  );
}

// 在浏览器环境中自动初始化
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  initGlobalFocusGuards();
}
