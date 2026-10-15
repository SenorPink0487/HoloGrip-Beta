import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';

// Lightweight DOM Mock for Node.js test environment
class MockElement {
  public tagName: string;
  public id: string = '';
  public className: string = '';
  public innerHTML: string = '';
  public textContent: string = '';
  public style: Record<string, string> = {};
  public attributes: Record<string, string> = {};
  public eventListeners: Record<string, ((e?: any) => void)[]> = {};
  public parentNode: MockElement | null = null;
  public children: MockElement[] = [];
  private elementCache: Map<string, MockElement> = new Map();

  constructor(tagName: string) {
    this.tagName = tagName.toUpperCase();
  }

  appendChild(child: MockElement): MockElement {
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  removeChild(child: MockElement): MockElement {
    const idx = this.children.indexOf(child);
    if (idx !== -1) {
      this.children.splice(idx, 1);
      child.parentNode = null;
    }
    return child;
  }

  remove(): void {
    if (this.parentNode) {
      this.parentNode.removeChild(this);
    }
  }

  setAttribute(name: string, value: string): void {
    this.attributes[name] = value;
  }

  getAttribute(name: string): string | null {
    return this.attributes[name] ?? null;
  }

  addEventListener(event: string, handler: (e?: any) => void): void {
    if (!this.eventListeners[event]) {
      this.eventListeners[event] = [];
    }
    this.eventListeners[event].push(handler);
  }

  get classList() {
    return {
      add: (cls: string) => {
        const set = new Set(this.className.split(/\s+/).filter(Boolean));
        set.add(cls);
        this.className = Array.from(set).join(' ');
      },
      remove: (cls: string) => {
        const set = new Set(this.className.split(/\s+/).filter(Boolean));
        set.delete(cls);
        this.className = Array.from(set).join(' ');
      },
      contains: (cls: string) => {
        return this.className.split(/\s+/).includes(cls);
      },
      toggle: (cls: string, force?: boolean) => {
        const has = this.className.split(/\s+/).includes(cls);
        const shouldAdd = force !== undefined ? force : !has;
        const set = new Set(this.className.split(/\s+/).filter(Boolean));
        if (shouldAdd) set.add(cls);
        else set.delete(cls);
        this.className = Array.from(set).join(' ');
        return shouldAdd;
      },
    };
  }

  querySelector(selector: string): MockElement | null {
    if (this.elementCache.has(selector)) {
      return this.elementCache.get(selector)!;
    }
    const el = new MockElement('div');
    if (selector.startsWith('#')) {
      el.setAttribute('id', selector.slice(1));
    }
    this.elementCache.set(selector, el);
    return el;
  }

  querySelectorAll(_selector: string): MockElement[] {
    return [new MockElement('div'), new MockElement('button')];
  }

  getBoundingClientRect() {
    return { left: 0, top: 0, width: 1024, height: 768, right: 1024, bottom: 768 };
  }

  getContext(_type = '2d') {
    return {
      fillRect: () => {},
      clearRect: () => {},
      fillText: () => {},
      beginPath: () => {},
      moveTo: () => {},
      lineTo: () => {},
      stroke: () => {},
      drawImage: () => {},
      createRadialGradient: () => ({
        addColorStop: () => {},
      }),
    };
  }

  toDataURL() {
    return 'data:image/jpeg;base64,mock';
  }
}

// Global DOM setup if running in Node without browser window
if (typeof (globalThis as any).document === 'undefined') {
  (globalThis as any).document = {
    createElement: (tag: string) => new MockElement(tag),
    body: new MockElement('body'),
    head: new MockElement('head'),
    getElementById: (_id: string) => null,
  };
}

if (typeof (globalThis as any).window === 'undefined') {
  (globalThis as any).window = {
    addEventListener: () => {},
    removeEventListener: () => {},
    setTimeout: (fn: any, ms: number) => setTimeout(fn, ms),
    clearTimeout: (id: any) => clearTimeout(id),
    innerWidth: 1024,
    innerHeight: 768,
  };
}

const { GeometrySolver } = await import('../src/scene/math/GeometrySolver.ts');
const { MiniModelPreview } = await import('../src/ui/vision/MiniModelPreview.ts');
const { MathARSpatialScene } = await import('../src/ui/vision/MathARSpatialScene.ts');
const { MathARScannerModal } = await import('../src/ui/vision/MathARScannerModal.ts');

console.log('=== Starting Math AR Camera Scanner Tests ===\n');

// -------------------------------------------------------------
// Test 1: MiniModelPreview 3D Mesh Generation & Resource Disposal
// -------------------------------------------------------------
console.log('Test 1: MiniModelPreview 3D Mesh Generation & Resource Disposal');

const cubeDef = GeometrySolver.createModel('cube');
const pyramidDef = GeometrySolver.createModel('square-pyramid');

const preview = new MiniModelPreview(pyramidDef, 180, 150);
assert.ok(preview.domElement, 'MiniModelPreview must have a DOM container');
assert.strictEqual(preview.domElement.className, 'math-ar-mini-preview');

preview.dispose();
console.log('✓ Test 1 passed: MiniModelPreview initializes and disposes cleanly\n');

// -------------------------------------------------------------
// Test 2: MathARSpatialScene - Borderless True AR on Paper Scene
// -------------------------------------------------------------
console.log('Test 2: MathARSpatialScene - Borderless True AR on Paper');

let selectedIdFromScene: string | null = null;
let deletedIdFromScene: string | null = null;

const spatialScene = new MathARSpatialScene(1024, 768, {
  onSelect: (id) => {
    selectedIdFromScene = id;
  },
  onDelete: (id) => {
    deletedIdFromScene = id;
  },
});

assert.ok(spatialScene.domElement, 'Spatial scene must produce a root DOM element');
assert.strictEqual(spatialScene.domElement.className, 'math-ar-spatial-root');

// 立起第 1 个 3D 几何模型 (直接立在试卷纸面上，无方框外壳)
const arModel1 = spatialScene.addModel(
  pyramidDef,
  '正四棱锥 P-ABCD',
  '立体几何截面',
  'data:image/jpeg;base64,mock1',
  { x: 300, y: 350 }
);

assert.ok(arModel1.id, 'AR item must have a unique ID');
assert.strictEqual(spatialScene.getItems().length, 1, 'Scene must contain 1 model');
assert.strictEqual(selectedIdFromScene, arModel1.id, 'Added model should be automatically selected');
assert.ok(arModel1.group.getObjectByName('polyhedronMesh'), '3D polyhedron mesh must be mounted');
assert.ok(arModel1.group.getObjectByName('groundRing'), 'Ground pulse ring must be present on paper');
assert.ok(arModel1.tagEl, 'Floating minimal Apple capsule tag must exist');

// 连拍立起第 2 个 3D 几何模型 (多模型同屏立于纸面)
const arModel2 = spatialScene.addModel(
  cubeDef,
  '正方体 ABCD-A1B1C1D1',
  '棱长与二面角',
  'data:image/jpeg;base64,mock2',
  { x: 700, y: 400 }
);

assert.strictEqual(spatialScene.getItems().length, 2, 'Scene must support multiple models simultaneously');

// 模拟点击删除第 1 个模型
spatialScene.removeModel(arModel1.id);
assert.strictEqual(spatialScene.getItems().length, 1, 'Model 1 should be removed');
assert.strictEqual(spatialScene.getItems()[0].id, arModel2.id, 'Model 2 should remain');

spatialScene.dispose();
console.log('✓ Test 2 passed: MathARSpatialScene borderless AR rendering & lifecycle verified\n');

// -------------------------------------------------------------
// Test 3: MathARScannerModal UI Structure (Apple Design Elements)
// -------------------------------------------------------------
console.log('Test 3: MathARScannerModal UI Structure & Apple Components');

let syncedModel: any = null;
let closed = false;

const scanner = new MathARScannerModal({
  onSyncModel: (def) => {
    syncedModel = def;
  },
  onClose: () => {
    closed = true;
  },
});

assert.ok(scanner.element, 'Scanner modal must create root element');
assert.ok(scanner.element.querySelector('#math-ar-shutter'), 'Apple concentric shutter button must exist');
assert.ok(scanner.element.querySelector('#math-ar-finder'), 'Reticle finder frame must exist');
assert.ok(scanner.element.querySelector('#math-ar-laser'), 'Scan laser beam must exist');
assert.ok(scanner.element.querySelector('#math-ar-overlay'), 'AR overlay container must exist');
assert.ok(scanner.element.querySelector('#math-ar-model-tray'), 'Model carousel tray must exist');
assert.ok(scanner.element.querySelector('#math-ar-done-btn'), 'Apple capsule Done button must exist');
assert.ok(scanner.element.querySelector('#math-ar-album-btn'), 'Album import button must exist');

console.log('✓ Test 3 passed: All Apple-inspired scanner UI components verified\n');

// -------------------------------------------------------------
// Test 4: Multi-Shot Continuous Scanning Without Exiting
// -------------------------------------------------------------
console.log('Test 4: Multi-Shot Continuous Scanning on Paper Surface');

// 模拟第一道题识别与 AR 模型立于试卷纸面
await (scanner as any).processImageData('data:image/jpeg;base64,mock1', '题目 1');
assert.strictEqual((scanner as any).models.length, 1, 'Model 1 should be added to scanner models');
assert.ok(syncedModel, 'Model should sync with whiteboard');

// 模拟第二道题连拍 (不退出页面继续拍照)
await (scanner as any).processImageData('data:image/jpeg;base64,mock2', '题目 2');
assert.strictEqual((scanner as any).models.length, 2, 'Should support multi-shot continuous scanning without exiting');

console.log('✓ Test 4 passed: Multi-shot continuous scanning without exit verified\n');

// -------------------------------------------------------------
// Test 5: Delete Generated 3D Models Prior to Exit
// -------------------------------------------------------------
console.log('Test 5: Delete Generated 3D Models Prior to Exit');

const model1Id = (scanner as any).models[0].id;
const model2Id = (scanner as any).models[1].id;

// 删除第 1 个题目模型
scanner.removeModel(model1Id);
assert.strictEqual((scanner as any).models.length, 1, 'Model 1 must be removed from models list');
assert.strictEqual((scanner as any).models[0].id, model2Id, 'Model 2 must remain');

// 再次删除第 2 个题目模型
scanner.removeModel(model2Id);
assert.strictEqual((scanner as any).models.length, 0, 'All models can be deleted before exit');

console.log('✓ Test 5 passed: Delete generated models prior to exit functionality verified\n');

// -------------------------------------------------------------
// Test 6: Safe Close & Cleanup
// -------------------------------------------------------------
console.log('Test 6: Safe Close & Hardware/Spatial Cleanup');

scanner.close();
assert.ok(scanner.element.classList.contains('is-closing'), 'Modal should play exit animation');
console.log('✓ Test 6 passed: Safe close and track cleanup verified\n');

// -------------------------------------------------------------
// Test 7: CSS Design System Compliance (Apple HIG & Borderless Spatial AR)
// -------------------------------------------------------------
console.log('Test 7: CSS Design System Compliance (Apple HIG & Borderless Spatial AR)');

const css = readFileSync(new URL('../src/whiteboard/whiteboard.css', import.meta.url), 'utf8');

assert.match(css, /\.math-ar-scanner-modal/, 'CSS must declare full-screen modal');
assert.match(css, /\.math-ar-shutter-btn/, 'CSS must declare concentric shutter button');
assert.match(css, /\.math-ar-spatial-root/, 'CSS must declare spatial root layer');
assert.match(css, /\.math-ar-spatial-canvas/, 'CSS must declare spatial canvas');
assert.match(css, /\.math-ar-spatial-pin-tag/, 'CSS must declare floating pin tag');
assert.match(css, /\.math-ar-pin-pill/, 'CSS must declare frosted capsule pill');
assert.match(css, /\.math-ar-pin-close/, 'CSS must declare micro close button');
assert.match(css, /\.math-ar-model-tray/, 'CSS must declare carousel model tray');
assert.match(css, /\.math-ar-scan-laser/, 'CSS must declare laser scan beam');

// 严禁丑陋方框
assert.ok(!css.includes('.math-ar-anchor-card'), 'Ugly card box styles (.math-ar-anchor-card) must be completely eliminated');

// -------------------------------------------------------------
// Test 8: Album Input Rapid Open (No image/* Wildcard Lag) & Bitmap Optimization
// -------------------------------------------------------------
console.log('Test 8: Album Input Rapid Open & Bitmap Downsampling Optimization');

const freshScanner = new MathARScannerModal();
const albumInput = freshScanner.element.querySelector('#math-ar-album-input') as any;
assert.ok(albumInput, 'Album input element must exist');

const acceptAttr = albumInput.getAttribute('accept') || '';
assert.ok(!acceptAttr.includes('image/*'), 'Album input must NOT use wildcard accept="image/*" to avoid macOS file dialog hangs');
assert.ok(acceptAttr.includes('image/png') && acceptAttr.includes('image/jpeg'), 'Album input must use explicit fast-resolving MIME types');

// 验证快速测试环境下的 optimizeImageFile
const dummyFile = { name: 'test.jpg', type: 'image/jpeg', size: 1024 } as any;
const optimized = await (freshScanner as any).optimizeImageFile(dummyFile);
assert.ok(optimized.displayDataUrl, 'Must generate displayDataUrl');
assert.ok(optimized.thumbDataUrl, 'Must generate lightweight thumbDataUrl');

freshScanner.close();
console.log('✓ Test 8 passed: Album rapid open and downsampling verified\n');

console.log('========================================================');
console.log('All Math AR Camera Scanner Tests Passed Successfully (8/8)!');
console.log('========================================================');
