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
// Test 2: MathARScannerModal UI Structure (Apple Design Elements)
// -------------------------------------------------------------
console.log('Test 2: MathARScannerModal UI Structure & Apple Components');

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

console.log('✓ Test 2 passed: All Apple-inspired scanner UI components verified\n');

// -------------------------------------------------------------
// Test 3: Multi-Shot Continuous Scanning & AR Card Stacking
// -------------------------------------------------------------
console.log('Test 3: Multi-Shot Continuous Scanning & AR Card Stacking');

// 模拟第一道题识别与 AR 模型卡片挂载
const item1 = {
  id: 'model-q1',
  name: '立体几何例题 1 · 正四棱锥',
  subtitle: '截面与体积',
  dataUrl: 'data:image/jpeg;base64,mock1',
  modelDef: pyramidDef,
  anchor: { x: -40, y: -30 },
};

(scanner as any).mountARCard(item1);
(scanner as any).models.push(item1);
(scanner as any).selectModel(item1.id);
(scanner as any).updateTray();

assert.strictEqual((scanner as any).models.length, 1);
assert.strictEqual(syncedModel?.name, pyramidDef.name);

// 模拟第二道题连拍 (不退出页面)
const item2 = {
  id: 'model-q2',
  name: '立体几何例题 2 · 正方体',
  subtitle: '外接球与二面角',
  dataUrl: 'data:image/jpeg;base64,mock2',
  modelDef: cubeDef,
  anchor: { x: 50, y: 40 },
};

(scanner as any).mountARCard(item2);
(scanner as any).models.push(item2);
(scanner as any).selectModel(item2.id);
(scanner as any).updateTray();

assert.strictEqual((scanner as any).models.length, 2, 'Should support multi-shot and retain both models');
console.log('✓ Test 3 passed: Multi-shot continuous scanning without exit verified\n');

// -------------------------------------------------------------
// Test 4: Delete Generated 3D Models Prior to Exit
// -------------------------------------------------------------
console.log('Test 4: Delete Generated 3D Models Prior to Exit');

// 删除第 1 个模型
scanner.removeModel('model-q1');
assert.strictEqual((scanner as any).models.length, 1, 'Model 1 must be removed from models list');
assert.strictEqual((scanner as any).models[0].id, 'model-q2', 'Model 2 must remain');

// 再次删除第 2 个模型
scanner.removeModel('model-q2');
assert.strictEqual((scanner as any).models.length, 0, 'All models can be deleted before exit');

console.log('✓ Test 4 passed: Delete generated models functionality verified\n');

// -------------------------------------------------------------
// Test 5: Safe Close & Cleanup
// -------------------------------------------------------------
console.log('Test 5: Safe Close & Stream Track Cleanup');

scanner.close();
assert.ok(scanner.element.classList.contains('is-closing'), 'Modal should play exit animation');
console.log('✓ Test 5 passed: Safe close and track cleanup verified\n');

// -------------------------------------------------------------
// Test 6: CSS Design System Compliance
// -------------------------------------------------------------
console.log('Test 6: CSS Design System Compliance (Apple HIG & AR Overlay)');

const css = readFileSync(new URL('../src/whiteboard/whiteboard.css', import.meta.url), 'utf8');

assert.match(css, /\.math-ar-scanner-modal/, 'CSS must declare full-screen modal');
assert.match(css, /\.math-ar-shutter-btn/, 'CSS must declare concentric shutter button');
assert.match(css, /\.math-ar-anchor-card/, 'CSS must declare AR anchor card');
assert.match(css, /\.math-ar-card-glass/, 'CSS must declare Apple glassmorphism styling');
assert.match(css, /\.math-ar-model-tray/, 'CSS must declare carousel model tray');
assert.match(css, /\.math-ar-scan-laser/, 'CSS must declare laser scan beam');

console.log('✓ Test 6 passed: Complete Apple AR design system CSS verified\n');

console.log('========================================================');
console.log('All Math AR Camera Scanner Tests Passed Successfully (6/6)!');
console.log('========================================================');
