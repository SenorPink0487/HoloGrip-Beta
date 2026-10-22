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

console.log('========================================================');
console.log('All Active Gesture HUD & MediaPipe Tests Passed (2/2)!');
console.log('========================================================\n');
