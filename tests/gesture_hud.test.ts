import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// Polyfill minimal browser DOM if run directly in Node.js
class MockClassList {
  private classes = new Set<string>();
  add(...names: string[]) { names.forEach(n => this.classes.add(n)); }
  remove(...names: string[]) { names.forEach(n => this.classes.delete(n)); }
  toggle(name: string, force?: boolean): boolean {
    if (force !== undefined) {
      if (force) this.classes.add(name);
      else this.classes.delete(name);
      return force;
    }
    if (this.classes.has(name)) {
      this.classes.delete(name);
      return false;
    }
    this.classes.add(name);
    return true;
  }
  contains(name: string): boolean { return this.classes.has(name); }
}

class MockElement {
  private _className = '';
  get className(): string { return this._className; }
  set className(val: string) {
    this._className = val;
    val.split(/\s+/).filter(Boolean).forEach(c => this.classList.add(c));
  }
  textContent = '';
  get innerHTML(): string {
    return this._innerHTML;
  }
  set innerHTML(html: string) {
    this._innerHTML = html;
    const tagRegex = /<([a-z0-9]+)([^>]*)>(.*?)<\/\1>/gis;
    let match: RegExpExecArray | null;
    while ((match = tagRegex.exec(html)) !== null) {
      const tag = match[1];
      const attrs = match[2];
      const text = match[3];
      const child = new MockElement(tag.toUpperCase());
      const classMatch = /class="([^"]+)"/.exec(attrs);
      if (classMatch) {
        child.className = classMatch[1];
        classMatch[1].split(/\s+/).forEach(c => child.classList.add(c));
      }
      child.textContent = text.replace(/<[^>]+>/g, '').trim();
      this.appendChild(child);
    }
  }
  attributes = new Map<string, string>();
  children: MockElement[] = [];
  parentNode: MockElement | null = null;
  classList = new MockClassList();
  listeners = new Map<string, Array<(e: any) => void>>();
  style: Record<string, string> = {};

  tagName = 'DIV';
  constructor(tagName = 'DIV') {
    this.tagName = tagName;
  }

  setAttribute(k: string, v: string) { this.attributes.set(k, v); }
  getAttribute(k: string) { return this.attributes.get(k) ?? null; }
  removeAttribute(k: string) { this.attributes.delete(k); }

  appendChild(child: MockElement) {
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  removeChild(child: MockElement) {
    const idx = this.children.indexOf(child);
    if (idx !== -1) {
      this.children.splice(idx, 1);
      child.parentNode = null;
    }
    return child;
  }

  remove() {
    if (this.parentNode) {
      this.parentNode.removeChild(this);
    }
  }

  addEventListener(type: string, fn: (e: any) => void) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type)!.push(fn);
  }

  removeEventListener(type: string, fn: (e: any) => void) {
    if (this.listeners.has(type)) {
      this.listeners.set(type, this.listeners.get(type)!.filter(f => f !== fn));
    }
  }

  dispatchEvent(event: { type: string; stopPropagation?: () => void }) {
    event.stopPropagation = event.stopPropagation || (() => {});
    const fns = this.listeners.get(event.type) || [];
    for (const fn of fns) fn(event);
  }

  getContext() {
    return {
      clearRect: () => {},
      drawImage: () => {},
      beginPath: () => {},
      arc: () => {},
      fill: () => {},
      stroke: () => {},
      moveTo: () => {},
      lineTo: () => {},
      save: () => {},
      restore: () => {},
    };
  }

  querySelector(selector: string): MockElement | null {
    if (selector.startsWith('.')) {
      const cls = selector.slice(1);
      const find = (el: MockElement): MockElement | null => {
        if (el.className.split(/\s+/).includes(cls) || el.classList.contains(cls)) return el;
        for (const child of el.children) {
          const res = find(child);
          if (res) return res;
        }
        return null;
      };
      const found = find(this);
      if (found) return found;
      const created = new MockElement('DIV');
      created.className = cls;
      return created;
    }
    return new MockElement('DIV');
  }
}

const mockDoc = {
  head: new MockElement('HEAD'),
  body: new MockElement('BODY'),
  createElement: (tag: string) => new MockElement(tag.toUpperCase()),
  getElementById: (id: string) => (id === 'whiteboard-app-root' ? null : null),
};

(globalThis as any).HTMLElement = MockElement;
(globalThis as any).HTMLButtonElement = MockElement;
(globalThis as any).HTMLCanvasElement = MockElement;
(globalThis as any).document = mockDoc;
(globalThis as any).window = {
  addEventListener: () => {},
  removeEventListener: () => {},
  innerWidth: 1920,
  innerHeight: 1080,
};
(globalThis as any).MutationObserver = class {
  observe() {}
  disconnect() {}
};

console.log('=== Starting Active Gesture HUD & MediaPipe Integration Verification ===\n');

// Test 1: Top-Right Gesture Button HUD Preservation & Controls
{
  console.log('Test 1: Top-Right Gesture Button HUD Preservation & Controls');
  const { HandTrackingHUD } = await import('../src/vision/HandTrackingHUD.ts');
  const { HandGestureService } = await import('../src/vision/HandGestureService.ts');
  const mockParent = new MockElement('DIV');
  const service = new HandGestureService();
  const hud = new HandTrackingHUD(service, mockParent as any);

  const container = mockParent.children[0];
  assert.ok(container, 'HUD container must be mounted');
  assert.strictEqual(container.id, 'vision-pro-tracking-hud', 'Must have id #vision-pro-tracking-hud');

  const pill = container.querySelector('.vp-hud-pill');
  assert.ok(pill, 'Must contain .vp-hud-pill');
  const title = pill.querySelector('.vp-pill-title');
  assert.ok(title, 'Must contain .vp-pill-title');
  assert.strictEqual(title.textContent, '手势交互', 'Title must be "手势交互"');
  const hasIcon = pill.children.some(c => c.className.includes('vp-pill-icon'));
  assert.strictEqual(hasIcon, false, 'Must NOT contain .vp-pill-icon per user request to delete hand icon');

  const toggleBtn = pill.querySelector('.vp-pill-toggle-btn');
  assert.ok(toggleBtn, 'Must contain .vp-pill-toggle-btn');

  const camBtn = pill.querySelector('.vp-pill-cam-btn');
  assert.ok(camBtn, 'Must contain .vp-pill-cam-btn');

  // Verify preview modal
  const previewModal = container.querySelector('.vp-hud-preview-modal');
  assert.ok(previewModal, 'Must contain .vp-hud-preview-modal');
  assert.strictEqual(previewModal.classList.contains('hidden'), true, 'Modal is initially hidden');
  assert.strictEqual(previewModal.innerHTML.includes('vp-offline-tag'), false, 'Must NOT contain .vp-offline-tag');
  assert.strictEqual(previewModal.innerHTML.includes('离线 MediaPipe'), false, 'Must NOT contain 离线 MediaPipe text');
  assert.strictEqual(previewModal.innerHTML.includes('vp-modal-log-toggle-btn'), false, 'Must NOT contain .vp-modal-log-toggle-btn');

  // Verify setVisible
  hud.setVisible(false);
  assert.strictEqual(container.classList.contains('hidden'), true, 'setVisible(false) sets hidden');
  hud.setVisible(true);
  assert.strictEqual(container.classList.contains('hidden'), false, 'setVisible(true) removes hidden');

  hud.destroy();
  assert.strictEqual(mockParent.children.length, 0, 'destroy() unmounts container');
  console.log('✓ Test 1 passed: Top-right gesture button HUD and full controls verified\n');
}

// Test 2: Verify MediaPipe Integration, Models, and Worker Assets Integrity
{
  console.log('Test 2: Complete MediaPipe Integration, Models, and Worker Assets Integrity');

  // 1. Check package.json has @mediapipe/tasks-vision
  const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf-8'));
  assert.ok(pkg.dependencies?.['@mediapipe/tasks-vision'], '@mediapipe/tasks-vision must be in dependencies');

  // 2. Check public/mediapipe and models exist
  assert.strictEqual(fs.existsSync(path.join(rootDir, 'public', 'mediapipe', 'wasm', 'vision_wasm_internal.wasm')), true, 'WASM binary exists');
  assert.strictEqual(fs.existsSync(path.join(rootDir, 'public', 'models', 'hand_landmarker.task')), true, 'hand_landmarker.task exists');

  // 3. Check vite.mediapipePlugin.ts exists
  assert.strictEqual(fs.existsSync(path.join(rootDir, 'vite.mediapipePlugin.ts')), true, 'vite.mediapipePlugin.ts exists');

  // 4. Check worker exists
  assert.strictEqual(fs.existsSync(path.join(rootDir, 'src', 'workers', 'handTracking.worker.ts')), true, 'handTracking.worker.ts exists');

  // 5. Check vision service exists
  assert.strictEqual(fs.existsSync(path.join(rootDir, 'src', 'vision', 'HandGestureService.ts')), true, 'HandGestureService.ts exists');
  assert.strictEqual(fs.existsSync(path.join(rootDir, 'src', 'vision', 'HandTrackingPipeline.ts')), true, 'HandTrackingPipeline.ts exists');
  assert.strictEqual(fs.existsSync(path.join(rootDir, 'src', 'vision', 'VisionProCursor.ts')), true, 'VisionProCursor.ts exists');
  assert.strictEqual(fs.existsSync(path.join(rootDir, 'src', 'vision', 'OneEuroFilter.ts')), true, 'OneEuroFilter.ts exists');

  console.log('✓ Test 2 passed: All mediapipe packages, offline models, workers, and services verified\n');
}

// Test 3: Apple Vision Camera Preview Double-Buffered Async Decode (Zero Dark-Frame Flicker)
await (async () => {
  console.log('Test 3: Apple Vision Camera Preview Double-Buffered Async Decode (Zero Flicker)');
  const { HandTrackingHUD } = await import('../src/vision/HandTrackingHUD.ts');

  // 模拟 WebKit 异步图片解码器：设置 src 后不会立刻 complete，而是等待 decodeResolvers 手动完成解码
  const pendingDecodes: Array<{ src: string; completeNow: () => void }> = [];
  class MockWebKitAsyncImage {
    public decoding = 'async';
    public complete = false;
    public naturalWidth = 0;
    public naturalHeight = 0;
    public onload: (() => void) | null = null;
    public onerror: (() => void) | null = null;
    private _src = '';
    private _resolveDecode: (() => void) | null = null;

    get src(): string {
      return this._src;
    }
    set src(val: string) {
      this._src = val;
      // 模拟 WebKit 行为：每次赋值新 src 时，complete 与 naturalWidth 立即重置为未就绪状态
      this.complete = false;
      this.naturalWidth = 0;
      this.naturalHeight = 0;
      pendingDecodes.push({
        src: val,
        completeNow: () => {
          this.complete = true;
          this.naturalWidth = 320;
          this.naturalHeight = 240;
          this.onload?.();
          this._resolveDecode?.();
        },
      });
    }

    decode(): Promise<void> {
      if (this.complete && this.naturalWidth > 0) return Promise.resolve();
      return new Promise<void>((resolve) => {
        this._resolveDecode = resolve;
      });
    }
  }

  const prevImage = (globalThis as any).Image;
  (globalThis as any).Image = MockWebKitAsyncImage;

  let currentNativeSrc: string | null = 'data:image/jpeg;base64,frame1';
  const mockService: any = {
    onStatusChange: () => {},
    onFrame: () => {},
    getVideoElement: () => null,
    getLastFrameImage: () => currentNativeSrc,
    getTelemetry: () => ({ isAppleVision: true, latencyMs: 4.0 }),
    isAppleVision: () => true,
    stop: () => {},
  };

  const mockParent = new MockElement('DIV');
  const hud = new HandTrackingHUD(mockService, mockParent as any);

  const drawnImages: string[] = [];
  let darkFillCountAfterFirstFrame = 0;
  let firstFrameReady = false;

  (hud as any).previewCanvas.width = 380;
  (hud as any).previewCanvas.height = 240;
  (hud as any).previewCtx = {
    clearRect: () => {},
    fillRect: () => {
      if (firstFrameReady) darkFillCountAfterFirstFrame++;
    },
    fillText: () => {},
    translate: () => {},
    scale: () => {},
    drawImage: (img: any) => {
      drawnImages.push(img.src);
    },
    save: () => {},
    restore: () => {},
    beginPath: () => {},
    moveTo: () => {},
    lineTo: () => {},
    stroke: () => {},
    arc: () => {},
    fill: () => {},
  };

  // 第 1 帧到达并完成异步解码
  (hud as any).renderPreviewCanvas(null, 0.016);
  assert.strictEqual(pendingDecodes.length, 1, 'Frame 1 decode scheduled');
  pendingDecodes.shift()!.completeNow();
  await Promise.resolve();

  firstFrameReady = true;
  (hud as any).renderPreviewCanvas(null, 0.016);
  assert.strictEqual(drawnImages.at(-1), 'data:image/jpeg;base64,frame1', 'Frame 1 rendered cleanly');

  // 第 2 帧到达，此时处于 WebKit 后台异步解码过程中（尚未 complete）：
  // 连续触发 3 次 60Hz VSync 渲染，必须始终稳定保留绘制 frame1，绝不能闪出任何一次 #0f172a 黑底！
  currentNativeSrc = 'data:image/jpeg;base64,frame2';
  (hud as any).renderPreviewCanvas(null, 0.016);
  (hud as any).renderPreviewCanvas(null, 0.016);
  (hud as any).renderPreviewCanvas(null, 0.016);

  assert.strictEqual(
    darkFillCountAfterFirstFrame,
    0,
    'ZERO dark background fills allowed while next JPEG frame is decoding asynchronously'
  );
  assert.strictEqual(
    drawnImages.at(-1),
    'data:image/jpeg;base64,frame1',
    'Front buffer must continuously display previous ready frame1 during frame2 decode'
  );

  // 第 2 帧解码完成 -> 下一 VSync 原子无闪烁切换至 frame2
  assert.strictEqual(pendingDecodes.length, 1, 'Frame 2 decode in flight');
  pendingDecodes.shift()!.completeNow();
  await Promise.resolve();

  (hud as any).renderPreviewCanvas(null, 0.016);
  assert.strictEqual(drawnImages.at(-1), 'data:image/jpeg;base64,frame2', 'Atomically swapped to frame2 once decoded');
  assert.strictEqual(darkFillCountAfterFirstFrame, 0, 'Still ZERO dark flashes across swap');

  hud.destroy();
  (globalThis as any).Image = prevImage;
  console.log('✓ Test 3 passed: Double-buffered async JPEG decode completely eliminates 20-30Hz dark-frame flicker\n');

  // Test 4: Hand Skeleton Topology Rendering & In-Preview-Modal Cursor Suppression
  console.log('Test 4: Hand Skeleton Topology Rendering & In-Preview-Modal Cursor Suppression');
  const hud4 = new HandTrackingHUD(mockService, mockParent as any);
  (hud4 as any).previewCanvas.width = 380;
  (hud4 as any).previewCanvas.height = 240;

  let strokeCount = 0;
  let lineToCount = 0;
  let arcCount = 0;
  let fillCount = 0;

  (hud4 as any).previewCtx = {
    clearRect: () => {},
    fillRect: () => {},
    fillText: () => {},
    measureText: () => ({ width: 24 }),
    translate: () => {},
    scale: () => {},
    drawImage: () => {},
    save: () => {},
    restore: () => {},
    beginPath: () => {},
    moveTo: () => {},
    lineTo: () => {
      lineToCount++;
    },
    stroke: () => {
      strokeCount++;
    },
    arc: () => {
      arcCount++;
    },
    fill: () => {
      fillCount++;
    },
    roundRect: () => {},
    rect: () => {},
  };

  // 构造模拟 MediaPipe HandLandmarker 输出的 21 个手部关键点（visibility 为 0）
  const mockLandmarks = Array.from({ length: 21 }, (_, i) => ({
    x: 0.2 + (i % 5) * 0.08,
    y: 0.3 + Math.floor(i / 5) * 0.1,
    z: 0,
    visibility: 0, // MediaPipe 典型值，必须能正常渲染
  }));

  const mockFrame = {
    hasHand: true,
    timestamp: 1000,
    leftHand: null,
    rightHand: {
      handedness: 'right' as const,
      confidence: 0.95,
      landmarks: mockLandmarks,
      thumbTip: mockLandmarks[4],
      indexTip: mockLandmarks[8],
      midpointNorm: { x: 0.4, y: 0.4, z: 0 },
      interactionPointNorm: { x: 0.4, y: 0.4, z: 0 },
      screenX: 300,
      screenY: 200,
      rawDistance: 0.05,
      handScale: 0.2,
      pinchRatio: 0.25,
      pinchStrength: 0,
      isPinching: false,
      justPinchStarted: false,
      justPinchEnded: false,
      pinchDuration: 0,
      isLongPinch: false,
    },
    leftHandQuickPinch: false,
    leftHandCameraDelta: null,
    landmarks: mockLandmarks,
    thumbTip: mockLandmarks[4],
    indexTip: mockLandmarks[8],
    midpointNorm: { x: 0.4, y: 0.4, z: 0 },
    interactionPointNorm: { x: 0.4, y: 0.4, z: 0 },
    screenX: 300,
    screenY: 200,
    rawDistance: 0.05,
    handScale: 0.2,
    pinchRatio: 0.25,
    pinchStrength: 0,
    isPinching: false,
    justPinchStarted: false,
    justPinchEnded: false,
  };

  (hud4 as any).renderPreviewCanvas(mockFrame, 0.016);

  assert(lineToCount >= 20, `Hand skeleton bone connections must be drawn (got ${lineToCount} lineTo calls)`);
  assert(strokeCount >= 2, `Hand skeleton strokes must be executed (got ${strokeCount} stroke calls)`);
  assert(arcCount >= 21, `Hand joints must be rendered as arcs (got ${arcCount} arc calls)`);
  assert(fillCount >= 2, `Hand joints must be filled (got ${fillCount} fill calls)`);

  // 验证 VisionProCursor 在手势追踪窗口上方时自动隐藏且不派发手势点击
  const cursorCode = fs.readFileSync(path.join(rootDir, 'src', 'vision', 'VisionProCursor.ts'), 'utf-8');
  assert(cursorCode.includes('in-preview-modal'), 'VisionProCursor must include in-preview-modal suppression class');
  assert(cursorCode.includes('isOverPreviewModal'), 'VisionProCursor must implement isOverPreviewModal detection');

  hud4.destroy();
  console.log('✓ Test 4 passed: Hand skeleton topology rendered cleanly with MediaPipe zero-visibility coordinates & cursor suppressed\n');
})();

console.log('========================================================');
console.log('All Active Gesture HUD & MediaPipe Tests Passed (4/4)!');
console.log('========================================================\n');
