import * as THREE from 'three';

export function labPointerNDC(
  event: { clientX: number; clientY: number },
  canvas?: Pick<HTMLElement, 'getBoundingClientRect'>
): THREE.Vector2 {
  // iPadOS may omit Pointer Lock entirely (undefined), which is not a lock.
  if (typeof document !== 'undefined' && document.pointerLockElement != null) return new THREE.Vector2();
  const rect = canvas?.getBoundingClientRect();
  const width = rect?.width || (typeof window !== 'undefined' ? window.innerWidth : 1920);
  const height = rect?.height || (typeof window !== 'undefined' ? window.innerHeight : 1080);
  return new THREE.Vector2(
    ((event.clientX - (rect?.left ?? 0)) / width) * 2 - 1,
    -((event.clientY - (rect?.top ?? 0)) / height) * 2 + 1
  );
}

/** Only the finger that grabbed an instrument may move or release it. */
export class LabPointerSession {
  private pointers = new Map<number, PointerEvent>();

  public get active(): boolean { return this.pointers.size > 0; }

  public canStart(event: PointerEvent, multiTouch = false): boolean {
    if (event.button !== 0 || this.pointers.has(event.pointerId)) return false;
    return !this.active || (multiTouch && event.pointerType === 'touch' &&
      this.pointers.size < 2 && [...this.pointers.values()].every(p => p.pointerType === 'touch'));
  }

  public claim(event: PointerEvent, canvas: HTMLElement): void {
    this.pointers.set(event.pointerId, event);
    // Safari may have already cancelled a pointer during a view transition.
    try { canvas.setPointerCapture(event.pointerId); } catch { /* window listeners remain a fallback */ }
  }

  public owns(event: PointerEvent): boolean { return this.pointers.has(event.pointerId); }

  public update(event: PointerEvent): void {
    if (this.owns(event)) this.pointers.set(event.pointerId, event);
  }

  public release(event: PointerEvent, canvas: HTMLElement): void {
    this.pointers.delete(event.pointerId);
    try {
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    } catch { /* capture may already be lost */ }
  }

  public cancel(canvas: HTMLElement, onCancel: (event: PointerEvent) => void): void {
    const events = [...this.pointers.values()];
    this.pointers.clear();
    for (const event of events) {
      onCancel(event);
      this.release(event, canvas);
    }
  }
}

/** Finger-sized picking in CSS pixels, including controls next to a static surface. */
export function raycastTouchCandidates(
  raycaster: THREE.Raycaster,
  camera: THREE.Camera,
  center: THREE.Vector2,
  objects: THREE.Object3D[],
  recursive: boolean,
  viewport: { width: number; height: number },
  radiusPx = 18
): THREE.Intersection[] {
  const result: THREE.Intersection[] = [];
  const seen = new Set<THREE.Object3D>();
  const sample = (ndc: THREE.Vector2) => {
    raycaster.setFromCamera(ndc, camera);
    for (const hit of raycaster.intersectObjects(objects, recursive)) {
      let visible = true;
      for (let obj: THREE.Object3D | null = hit.object; obj; obj = obj.parent) {
        if (!obj.visible) { visible = false; break; }
      }
      if (visible && !seen.has(hit.object)) {
        seen.add(hit.object);
        result.push(hit);
      }
    }
  };
  sample(center);
  if (viewport.width > 0 && viewport.height > 0) {
    // Prefer the exact hit, then closer screen-space samples. Do not stop at a
    // decorative chassis: the experiment decides which candidates are controls.
    const point = new THREE.Vector2();
    for (const radius of [radiusPx / 3, radiusPx * 2 / 3, radiusPx]) {
      for (let i = 0; i < 8; i++) {
        const angle = i * Math.PI * 0.25;
        point.set(center.x + Math.cos(angle) * radius * 2 / viewport.width,
          center.y + Math.sin(angle) * radius * 2 / viewport.height);
        sample(point);
      }
    }
  }
  raycaster.setFromCamera(center, camera);
  return result;
}
