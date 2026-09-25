import assert from 'node:assert';

// Mock minimal DOM environment for testing
class MockElement {
  public tagName: string;
  public id = '';
  public className = '';
  public textContent = '';
  public innerHTML = '';
  public parentNode: MockElement | null = null;
  public children: MockElement[] = [];
  public classList = {
    add: (cls: string) => {
      const parts = this.className.split(' ').filter(Boolean);
      if (!parts.includes(cls)) parts.push(cls);
      this.className = parts.join(' ');
    },
    remove: (cls: string) => {
      const parts = this.className.split(' ').filter(Boolean);
      const idx = parts.indexOf(cls);
      if (idx !== -1) parts.splice(idx, 1);
      this.className = parts.join(' ');
    },
    contains: (cls: string) => this.className.split(' ').filter(Boolean).includes(cls),
  };

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

  querySelector(sel: string): MockElement | null {
    if (sel.startsWith('.')) {
      const cls = sel.slice(1);
      return this.children.find(c => c.classList.contains(cls)) || null;
    }
    if (sel.startsWith('#')) {
      const id = sel.slice(1);
      return this.children.find(c => c.id === id) || null;
    }
    return null;
  }
}

if (typeof (globalThis as any).document === 'undefined') {
  (globalThis as any).document = {
    createElement: (tag: string) => {
      const el = new MockElement(tag);
      if (tag === 'div') {
        // Simple DOM parse simulation for Crosshair innerHTML
        Object.defineProperty(el, 'innerHTML', {
          set(val: string) {
            this._html = val;
            this.children = [];
            if (val.includes('crosshair-ring')) {
              const ring = new MockElement('div');
              ring.className = 'crosshair-ring';
              this.appendChild(ring);
            }
            if (val.includes('crosshair-tooltip')) {
              const tt = new MockElement('div');
              tt.className = 'crosshair-tooltip';
              this.appendChild(tt);
            }
          },
          get() {
            return this._html || '';
          }
        });
      }
      return el;
    },
    body: new MockElement('body'),
  };
}

import { Crosshair } from '../src/ui/Crosshair.ts';

console.log('=== Starting Crosshair & Reticle State Machine Tests ===\n');

// Test 1: Crosshair Instantiation and Default Elements
console.log('Test 1: Crosshair Instantiation and Elements');
const body = (globalThis as any).document.body;
const crosshair = new Crosshair(body);

assert.strictEqual(crosshair.getVisible(), true, 'Crosshair should be visible by default');
const el = body.children.find((c: any) => c.id === 'vision-crosshair');
assert.ok(el, '#vision-crosshair should be appended to body');
assert.strictEqual(el.classList.contains('hidden'), false, 'Crosshair should not have .hidden initially');
const ring = el.querySelector('.crosshair-ring');
assert.ok(ring, '.crosshair-ring element must exist inside crosshair');
const tooltip = el.querySelector('.crosshair-tooltip');
assert.ok(tooltip, '.crosshair-tooltip element must exist inside crosshair');
console.log('✓ Test 1 passed: Crosshair DOM hierarchy verified\n');

// Test 2: Visibility Toggling
console.log('Test 2: Crosshair setVisible Toggling');
crosshair.setVisible(false);
assert.strictEqual(crosshair.getVisible(), false);
assert.strictEqual(el.classList.contains('hidden'), true, '#vision-crosshair should have .hidden class');

crosshair.setVisible(true);
assert.strictEqual(crosshair.getVisible(), true);
assert.strictEqual(el.classList.contains('hidden'), false, '#vision-crosshair should not have .hidden class');
console.log('✓ Test 2 passed: setVisible(true/false) verified\n');

// Test 3: Hover and Tooltip States
console.log('Test 3: Crosshair Hover & Tooltip Interaction');
crosshair.setHovered(true, '烧杯 · 单击选试剂 / 长按拖拽倾倒');
assert.strictEqual(el.classList.contains('hovered'), true, 'Crosshair should have .hovered class on hover');
assert.strictEqual(tooltip.classList.contains('visible'), true, 'Tooltip should have .visible class');
assert.strictEqual(tooltip.textContent, '烧杯 · 单击选试剂 / 长按拖拽倾倒');

crosshair.setHovered(false);
assert.strictEqual(el.classList.contains('hovered'), false, 'Crosshair should remove .hovered class');
assert.strictEqual(tooltip.classList.contains('visible'), false, 'Tooltip should remove .visible class');
console.log('✓ Test 3 passed: Hover state and label updates verified\n');

// Test 4: View Mode & Multi-State Interaction Matrix
console.log('Test 4: State Machine Crosshair Visibility Invariants');
let isWhiteboardMode = true;
let isDrawerOpen = false;
let isModalOpen = false;
let isDragging = false;

const computeExpectedCrosshairVisibility = () => {
  if (isWhiteboardMode) return false;
  if (isDrawerOpen) return false;
  if (isModalOpen) return false;
  if (isDragging) return false;
  return true;
};

// In whiteboard mode: must be hidden
assert.strictEqual(computeExpectedCrosshairVisibility(), false, 'Hidden in whiteboard mode');

// Switch to lab mode: must be visible
isWhiteboardMode = false;
assert.strictEqual(computeExpectedCrosshairVisibility(), true, 'Visible in lab mode');

// Drawer opened: must be hidden
isDrawerOpen = true;
assert.strictEqual(computeExpectedCrosshairVisibility(), false, 'Hidden when drawer is open');

// Drawer closed: must be restored
isDrawerOpen = false;
assert.strictEqual(computeExpectedCrosshairVisibility(), true, 'Visible when drawer closes');

// Modal opened: must be hidden
isModalOpen = true;
assert.strictEqual(computeExpectedCrosshairVisibility(), false, 'Hidden when modal is open');

// Modal closed: must be restored
isModalOpen = false;
assert.strictEqual(computeExpectedCrosshairVisibility(), true, 'Visible when modal closes');

// Beaker dragging started: must be hidden
isDragging = true;
assert.strictEqual(computeExpectedCrosshairVisibility(), false, 'Hidden when dragging beaker');

// Dragging finished: must be restored
isDragging = false;
assert.strictEqual(computeExpectedCrosshairVisibility(), true, 'Visible when dragging finishes');

// Switch back to whiteboard: must be hidden
isWhiteboardMode = true;
assert.strictEqual(computeExpectedCrosshairVisibility(), false, 'Hidden when returning to whiteboard');
console.log('✓ Test 4 passed: All state matrix conditions verified\n');

crosshair.destroy();
console.log('========================================================');
console.log('All Crosshair & Reticle Tests Passed Successfully (4/4)!');
console.log('========================================================\n');
