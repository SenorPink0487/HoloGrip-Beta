/**
 * Vision Pro & Touch Interactive Slider Gesture Helper
 * 
 * Provides unified, buttery-smooth continuous pinch gesture dragging,
 * 44px hit-zone enlargement, global window tracking to absorb 3D vertical drift,
 * telemetry overwrite protection, and Apple visionOS-grade visual feedback (.is-pinching).
 */

export interface VisionSliderOptions {
  /**
   * Called whenever the value changes (via drag, touch, air pinch, or keyboard/input)
   */
  onChange?: (val: number) => void;

  /**
   * Active slider ID tracking set (to prevent 60 FPS background telemetry loops from overwriting user drags)
   */
  activeSet?: Set<string>;

  /**
   * Live scrub callback with ratio and clientX (for HUD bubbles, gauges, or real-time labels)
   */
  onScrub?: (val: number, ratio: number, clientX: number) => void;

  /**
   * Called when drag / pinch begins
   */
  onDragStart?: (clientX: number) => void;

  /**
   * Called when drag / pinch ends
   */
  onDragEnd?: () => void;
}

export function isSliderActive(slider: HTMLInputElement | null, activeSet?: Set<string>): boolean {
  if (!slider) return false;
  if (activeSet && slider.id && activeSet.has(slider.id)) return true;
  if (slider.classList && typeof slider.classList.contains === 'function' && slider.classList.contains('is-pinching')) return true;
  if (typeof document !== 'undefined' && document.activeElement === slider) return true;
  return false;
}

export function bindVisionSlider(
  slider: HTMLInputElement | null,
  optionsOrChange: ((val: number) => void) | VisionSliderOptions
): () => void {
  if (!slider) return () => {};

  const options: VisionSliderOptions =
    typeof optionsOrChange === 'function' ? { onChange: optionsOrChange } : optionsOrChange;

  const { onChange, activeSet, onScrub, onDragStart, onDragEnd } = options;

  const wrap =
    (typeof slider.closest === 'function'
      ? slider.closest('.hall-slider-track-wrap, .em-slider-row, .slider-track-wrapper, .thermo-metric-card, .em-controls-stack')
      : null) || slider.parentElement;

  if (slider.style) {
    slider.style.touchAction = 'none';
  }
  if (wrap && (wrap as HTMLElement).style) {
    (wrap as HTMLElement).style.touchAction = 'none';
  }

  let isDragging = false;

  const updateFromClientX = (clientX: number) => {
    if (typeof slider.getBoundingClientRect !== 'function') return;
    const rect = slider.getBoundingClientRect();
    if (!rect || rect.width <= 0) return;

    const stepStr = String(slider.step || (typeof slider.getAttribute === 'function' ? slider.getAttribute('step') : '') || '0.01');
    const min = parseFloat(String(slider.min || (typeof slider.getAttribute === 'function' ? slider.getAttribute('min') : '') || '0')) || 0;
    const max = parseFloat(String(slider.max || (typeof slider.getAttribute === 'function' ? slider.getAttribute('max') : '') || '1')) || 1;
    const step = parseFloat(stepStr) || 0.01;

    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    let val = min + ratio * (max - min);
    if (step > 0) {
      val = Math.round((val - min) / step) * step + min;
    }
    val = Math.max(min, Math.min(max, val));
    const decimals = (stepStr.split('.')[1] || '').length;
    val = parseFloat(val.toFixed(decimals));

    if (slider.value !== String(val)) {
      slider.value = String(val);
      onChange?.(val);
    }
    onScrub?.(val, ratio, clientX);
  };

  const onGlobalPointerMove = (e: any) => {
    if (!isDragging) return;
    if (typeof e.clientX === 'number') {
      updateFromClientX(e.clientX);
    }
  };

  const onGlobalPointerUp = (e: any) => {
    stopDrag(e?.pointerId);
  };

  const onGlobalMouseMove = (e: any) => {
    if (!isDragging) return;
    if (e.buttons === 0) {
      stopDrag();
      return;
    }
    if (typeof e.clientX === 'number') {
      updateFromClientX(e.clientX);
    }
  };

  const onGlobalMouseUp = () => {
    stopDrag();
  };

  const onGlobalTouchMove = (e: any) => {
    if (!isDragging) return;
    if (e.touches && e.touches.length > 0 && typeof e.touches[0].clientX === 'number') {
      updateFromClientX(e.touches[0].clientX);
    }
  };

  const onGlobalTouchUp = () => {
    stopDrag();
  };

  const startDrag = (clientX: number, pointerId?: number) => {
    isDragging = true;
    if (slider.id && activeSet) {
      activeSet.add(slider.id);
    }
    if (slider.classList && typeof slider.classList.add === 'function') {
      slider.classList.add('is-pinching');
    }
    if (wrap && wrap.classList && typeof wrap.classList.add === 'function') {
      wrap.classList.add('is-pinching');
    }

    if (pointerId != null && typeof slider.setPointerCapture === 'function') {
      try {
        slider.setPointerCapture(pointerId);
      } catch {
        // ignore
      }
    }

    if (typeof clientX === 'number') {
      updateFromClientX(clientX);
    }

    onDragStart?.(clientX);

    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      window.addEventListener('pointermove', onGlobalPointerMove, { passive: false });
      window.addEventListener('pointerup', onGlobalPointerUp, { passive: false });
      window.addEventListener('pointercancel', onGlobalPointerUp, { passive: false });
      window.addEventListener('mousemove', onGlobalMouseMove, { passive: false });
      window.addEventListener('mouseup', onGlobalMouseUp, { passive: false });
      window.addEventListener('touchmove', onGlobalTouchMove, { passive: false });
      window.addEventListener('touchend', onGlobalTouchUp, { passive: false });
      window.addEventListener('touchcancel', onGlobalTouchUp, { passive: false });
    }
  };

  const stopDrag = (pointerId?: number) => {
    if (!isDragging && !(slider.id && activeSet && activeSet.has(slider.id))) return;
    isDragging = false;
    if (slider.id && activeSet) {
      activeSet.delete(slider.id);
    }
    if (slider.classList && typeof slider.classList.remove === 'function') {
      slider.classList.remove('is-pinching');
    }
    if (wrap && wrap.classList && typeof wrap.classList.remove === 'function') {
      wrap.classList.remove('is-pinching');
    }

    if (pointerId != null && typeof slider.releasePointerCapture === 'function') {
      try {
        slider.releasePointerCapture(pointerId);
      } catch {
        // ignore
      }
    }

    onDragEnd?.();

    if (typeof window !== 'undefined' && typeof window.removeEventListener === 'function') {
      window.removeEventListener('pointermove', onGlobalPointerMove);
      window.removeEventListener('pointerup', onGlobalPointerUp);
      window.removeEventListener('pointercancel', onGlobalPointerUp);
      window.removeEventListener('mousemove', onGlobalMouseMove);
      window.removeEventListener('mouseup', onGlobalMouseUp);
      window.removeEventListener('touchmove', onGlobalTouchMove);
      window.removeEventListener('touchend', onGlobalTouchUp);
      window.removeEventListener('touchcancel', onGlobalTouchUp);
    }
  };

  // 1. Standard HTML input event (keyboard, accessibility, test runners)
  const onInput = (e: any) => {
    const val = parseFloat((e.target as HTMLInputElement).value);
    onChange?.(val);
  };
  slider.addEventListener('input', onInput);

  // 2. High-precision Pointer Events (iOS 13+, iPadOS, VisionProCursor hand pinch, Chrome, Edge)
  const onPointerDown = (e: any) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    startDrag(e.clientX, e.pointerId);
  };
  slider.addEventListener('pointerdown', onPointerDown);

  const onPointerMove = (e: any) => {
    if (!isDragging && !(slider.id && activeSet && activeSet.has(slider.id))) return;
    if (typeof e.clientX === 'number') {
      updateFromClientX(e.clientX);
    }
  };
  slider.addEventListener('pointermove', onPointerMove);

  const onPointerUp = (e: any) => stopDrag(e?.pointerId);
  slider.addEventListener('pointerup', onPointerUp);
  slider.addEventListener('pointercancel', onPointerUp);

  // 3. Mouse Events fallback (when pointer events are not polyfilled or desktop mouse drag)
  const onMouseDown = (e: any) => {
    if (e.button !== 0) return;
    if (!isDragging) startDrag(e.clientX);
  };
  slider.addEventListener('mousedown', onMouseDown);

  const onMouseMove = (e: any) => {
    if (isDragging && typeof e.clientX === 'number') {
      updateFromClientX(e.clientX);
    }
  };
  slider.addEventListener('mousemove', onMouseMove);

  const onMouseUp = () => stopDrag();
  slider.addEventListener('mouseup', onMouseUp);

  // 4. Robust touch listeners
  const onTouchStart = (e: any) => {
    const clientX = e.touches && e.touches.length > 0 ? e.touches[0].clientX : 0;
    startDrag(clientX);
  };
  slider.addEventListener('touchstart', onTouchStart, { passive: true });

  const onTouchMove = (e: any) => {
    if (isDragging && e.touches && e.touches.length > 0 && typeof e.touches[0].clientX === 'number') {
      updateFromClientX(e.touches[0].clientX);
    }
  };
  slider.addEventListener('touchmove', onTouchMove, { passive: true });

  const onTouchEnd = () => stopDrag();
  slider.addEventListener('touchend', onTouchEnd, { passive: true });
  slider.addEventListener('touchcancel', onTouchEnd, { passive: true });

  // 5. Wrap Events (if wrap is separate hit zone)
  if (wrap && wrap !== slider && typeof wrap.addEventListener === 'function') {
    wrap.addEventListener('pointerdown', onPointerDown);
    wrap.addEventListener('pointermove', onPointerMove);
    wrap.addEventListener('pointerup', onPointerUp);
    wrap.addEventListener('pointercancel', onPointerUp);
    wrap.addEventListener('mousedown', onMouseDown);
    wrap.addEventListener('touchstart', onTouchStart, { passive: true });
    wrap.addEventListener('touchmove', onTouchMove, { passive: true });
    wrap.addEventListener('touchend', onTouchEnd, { passive: true });
    wrap.addEventListener('touchcancel', onTouchEnd, { passive: true });
  }

  return () => {
    stopDrag();
    slider.removeEventListener('input', onInput);
    slider.removeEventListener('pointerdown', onPointerDown);
    slider.removeEventListener('pointermove', onPointerMove);
    slider.removeEventListener('pointerup', onPointerUp);
    slider.removeEventListener('pointercancel', onPointerUp);
    slider.removeEventListener('mousedown', onMouseDown);
    slider.removeEventListener('mousemove', onMouseMove);
    slider.removeEventListener('mouseup', onMouseUp);
    slider.removeEventListener('touchstart', onTouchStart);
    slider.removeEventListener('touchmove', onTouchMove);
    slider.removeEventListener('touchend', onTouchEnd);
    slider.removeEventListener('touchcancel', onTouchEnd);
  };
}
