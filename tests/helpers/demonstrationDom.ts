/** Lightweight canvas/DOM for running real apparatus and physics without a GPU. */
const noop = () => {};
export function installDemonstrationDOM(): void {
  const make = (tag = 'div'): any => {
    const gradient = { addColorStop: noop };
    const context = new Proxy({
      measureText: (s: string) => ({ width: s.length * 10 }),
      createLinearGradient: () => gradient, createRadialGradient: () => gradient,
      createImageData: (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }),
      getImageData: (x: number, y: number, w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }),
    } as Record<string, any>, { get: (target, key: string) => target[key] ?? noop });
    const el: any = { tagName: tag.toUpperCase(), style: { setProperty: noop, removeProperty: noop }, dataset: {}, children: [],
      classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
      appendChild: (child: any) => { el.children.push(child); return child; },
      append: (...children: any[]) => el.children.push(...children),
      remove: noop, setAttribute: noop, removeAttribute: noop, addEventListener: noop, removeEventListener: noop,
      querySelector: () => null, querySelectorAll: () => [], getContext: () => context,
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 1280, height: 720 }),
    };
    return el;
  };
  (globalThis as any).document = { createElement: make, createElementNS: (_ns: string, tag: string) => make(tag),
    body: make(), querySelector: () => null, querySelectorAll: () => [], getElementById: () => null,
    addEventListener: noop, removeEventListener: noop, pointerLockElement: null };
  (globalThis as any).window = { innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1,
    addEventListener: noop, removeEventListener: noop, matchMedia: () => ({ matches: false }) };
}
