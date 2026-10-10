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
  id = '';
  className = '';
  innerHTML = '';
  textContent = '';
  attributes = new Map<string, string>();
  children: MockElement[] = [];
  parentNode: MockElement | null = null;
  classList = new MockClassList();
  listeners = new Map<string, Array<(e: any) => void>>();

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

  remove() {
    if (this.parentNode) {
      const idx = this.parentNode.children.indexOf(this);
      if (idx !== -1) this.parentNode.children.splice(idx, 1);
      this.parentNode = null;
    }
  }

  addEventListener(type: string, fn: (e: any) => void) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type)!.push(fn);
  }

  dispatchEvent(event: { type: string; stopPropagation?: () => void }) {
    event.stopPropagation = event.stopPropagation || (() => {});
    const fns = this.listeners.get(event.type) || [];
    for (const fn of fns) fn(event);
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
      return find(this);
    }
    return null;
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
(globalThis as any).document = mockDoc;
(globalThis as any).MutationObserver = class {
  observe() {}
  disconnect() {}
};

console.log('=== Starting Gesture Button & MediaPipe Elimination Verification ===\n');

// Test 1: Top-Right Gesture Button HUD Preservation
{
  console.log('Test 1: Top-Right Gesture Button HUD Preservation');
  const { HandTrackingHUD } = await import('../src/vision/HandTrackingHUD.ts');
  const mockParent = new MockElement('DIV');
  const hud = new HandTrackingHUD(mockParent);

  const container = mockParent.children[0];
  assert.ok(container, 'HUD container must be mounted');
  assert.strictEqual(container.id, 'vision-pro-tracking-hud', 'Must have id #vision-pro-tracking-hud');

  const pill = container.querySelector('.vp-hud-pill');
  const title = pill.querySelector('.vp-pill-title');
  assert.ok(title, 'Must contain .vp-pill-title');
  assert.strictEqual(title.textContent, '手势交互', 'Title must be "手势交互"');
  const icon = pill.querySelector('.vp-pill-icon');
  assert.ok(icon, 'Must contain .vp-pill-icon');

  // Verify setVisible
  hud.setVisible(false);
  assert.strictEqual(container.classList.contains('hidden'), true, 'setVisible(false) sets hidden');
  hud.setVisible(true);
  assert.strictEqual(container.classList.contains('hidden'), false, 'setVisible(true) removes hidden');

  // Verify click feedback
  const toast = pill.querySelector('.vp-pill-toast');
  assert.ok(toast, 'Must contain toast notification element');
  pill.dispatchEvent({ type: 'click' });
  assert.strictEqual(toast.classList.contains('visible'), true, 'Clicking button activates toast');
  assert.ok(toast.textContent.includes('手势交互功能已停用'), 'Toast informs user feature is disabled');

  hud.destroy();
  assert.strictEqual(mockParent.children.length, 0, 'destroy() unmounts container');
  console.log('✓ Test 1 passed: Top-right gesture button HUD and visibility preserved\n');
}

// Test 2: Verify Complete MediaPipe Code & Asset Elimination
{
  console.log('Test 2: Complete MediaPipe Code & Asset Elimination');

  // 1. Check package.json has no @mediapipe
  const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf-8'));
  assert.strictEqual(pkg.dependencies?.['@mediapipe/tasks-vision'], undefined, 'No @mediapipe in dependencies');

  // 2. Check public/mediapipe does not exist
  assert.strictEqual(fs.existsSync(path.join(rootDir, 'public', 'mediapipe')), false, 'public/mediapipe removed');
  assert.strictEqual(fs.existsSync(path.join(rootDir, 'public', 'models', 'hand_landmarker.task')), false, 'hand_landmarker.task removed');

  // 3. Check vite.mediapipePlugin.ts removed
  assert.strictEqual(fs.existsSync(path.join(rootDir, 'vite.mediapipePlugin.ts')), false, 'vite.mediapipePlugin.ts removed');

  // 4. Check worker removed
  assert.strictEqual(fs.existsSync(path.join(rootDir, 'src', 'workers', 'handTracking.worker.ts')), false, 'handTracking.worker.ts removed');

  // 5. Check vision service removed
  assert.strictEqual(fs.existsSync(path.join(rootDir, 'src', 'vision', 'HandGestureService.ts')), false, 'HandGestureService.ts removed');
  assert.strictEqual(fs.existsSync(path.join(rootDir, 'src', 'vision', 'HandTrackingPipeline.ts')), false, 'HandTrackingPipeline.ts removed');
  assert.strictEqual(fs.existsSync(path.join(rootDir, 'src', 'vision', 'VisionProCursor.ts')), false, 'VisionProCursor.ts removed');

  console.log('✓ Test 2 passed: All mediapipe packages, assets, workers, and services eliminated\n');
}

console.log('========================================================');
console.log('All Gesture Button & MediaPipe Tests Passed (2/2)!');
console.log('========================================================\n');
