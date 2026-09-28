import assert from 'node:assert';

// Lightweight Mock DOM for headless Node test environment
class MockElement {
  public tagName: string;
  public className = '';
  public innerHTML = '';
  public id = '';
  public title = '';
  public style: Record<string, string> = {};
  public dataset: Record<string, string> = {};
  public children: MockElement[] = [];
  public parentNode: MockElement | null = null;
  public disabled = false;
  public textContent = '';
  public eventListeners: Record<string, ((e?: any) => void)[]> = {};

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

  setAttribute(name: string, value: string): void {
    if (name === 'id') this.id = value;
    if (name === 'class') this.className = value;
    (this as any)[name] = value;
  }

  removeAttribute(name: string): void {
    if (name === 'id') this.id = '';
    if (name === 'class') this.className = '';
    delete (this as any)[name];
  }

  addEventListener(event: string, handler: (e?: any) => void): void {
    if (!this.eventListeners[event]) {
      this.eventListeners[event] = [];
    }
    this.eventListeners[event].push(handler);
  }

  dispatchEvent(event: string, e?: any): void {
    if (this.eventListeners[event]) {
      for (const h of this.eventListeners[event]) {
        h(e);
      }
    }
  }

  querySelector(selector: string): MockElement | null {
    if (selector.startsWith('#')) {
      const id = selector.slice(1);
      if (this.id === id) return this;
      for (const child of this.children) {
        const found = child.querySelector(selector);
        if (found) return found;
      }
    } else if (selector.startsWith('.')) {
      const cls = selector.slice(1);
      if (this.classList.contains(cls)) return this;
      for (const child of this.children) {
        const found = child.querySelector(selector);
        if (found) return found;
      }
    }
    return null;
  }

  querySelectorAll(selector: string): MockElement[] {
    const results: MockElement[] = [];
    if (selector.startsWith('.')) {
      const cls = selector.slice(1);
      if (this.classList.contains(cls)) results.push(this);
    }
    for (const child of this.children) {
      results.push(...child.querySelectorAll(selector));
    }
    return results;
  }

  getBoundingClientRect() {
    return { width: 1920, height: 1080, top: 0, left: 0, right: 1920, bottom: 1080 };
  }

  getContext(type: string, options?: any) {
    return {
      setTransform: () => {},
      save: () => {},
      restore: () => {},
      clearRect: () => {},
      fillRect: () => {},
      beginPath: () => {},
      arc: () => {},
      fill: () => {},
      stroke: () => {},
      moveTo: () => {},
      lineTo: () => {},
      quadraticCurveTo: () => {},
      drawImage: () => {},
      globalCompositeOperation: 'source-over',
      lineWidth: 1,
      strokeStyle: '#000',
      fillStyle: '#000',
      lineCap: 'round',
      lineJoin: 'round',
    };
  }

  toDataURL() {
    return 'data:image/png;base64,mockPngData';
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
      toggle: (cls: string, force?: boolean) => {
        const set = new Set(this.className.split(/\s+/).filter(Boolean));
        const shouldAdd = force !== undefined ? force : !set.has(cls);
        if (shouldAdd) set.add(cls);
        else set.delete(cls);
        this.className = Array.from(set).join(' ');
      },
      contains: (cls: string) => {
        return this.className.split(/\s+/).includes(cls);
      },
    };
  }
}

(global as any).requestAnimationFrame = (cb: () => void) => setTimeout(cb, 0);
(global as any).cancelAnimationFrame = clearTimeout;
// Setup global mock document & window
const mockBody = new MockElement('body');
(global as any).document = {
  body: mockBody,
  createElement: (tag: string) => new MockElement(tag),
  getElementById: (id: string) => mockBody.querySelector(`#${id}`),
};
(global as any).window = {
  devicePixelRatio: 2,
  addEventListener: () => {},
  removeEventListener: () => {},
};

import { WhiteboardCanvas } from '../src/whiteboard/WhiteboardCanvas.ts';
import { WhiteboardDock } from '../src/whiteboard/WhiteboardDock.ts';
import { AccountModal } from '../src/whiteboard/AccountModal.ts';
import { replaceSession } from '../src/account/session.ts';

console.log('=== Starting Apple-Style Whiteboard & Dock Deep Verification ===\n');

// Test 1: WhiteboardCanvas initialization & multi-page lifecycle
console.log('Test 1: Whiteboard Canvas initial state & multi-page lifecycle');
const container = new MockElement('div');
const canvas = new WhiteboardCanvas(container as any, {
  initialTheme: 'plain',
  defaultColor: '#0a84ff',
  defaultWidth: 4,
});

assert.strictEqual(canvas.getTotalPages(), 1, 'Should start with exactly 1 page');
assert.strictEqual(canvas.getCurrentPageIndex(), 0, 'Current page index should be 0 (page 1)');
assert.strictEqual(canvas.getColor(), '#0a84ff', 'Default color should match configured color');
assert.strictEqual(canvas.getWidth(), 4, 'Default width should match configured width');
assert.strictEqual(canvas.getTool(), 'pen', 'Default tool should be pen');
assert.strictEqual(canvas.getTheme(), 'plain', 'Default theme should be plain');
console.log('✓ Test 1 passed: Initialization state verified');

// Test 2: Multi-page pagination operations
console.log('Test 2: Multi-page pagination operations (add, next, prev, boundary clamping)');
// Add pages
canvas.addPage(); // Page 2
assert.strictEqual(canvas.getTotalPages(), 2, 'Total pages should now be 2');
assert.strictEqual(canvas.getCurrentPageIndex(), 1, 'Should now be on page index 1 (page 2)');

canvas.addPage(); // Page 3
assert.strictEqual(canvas.getTotalPages(), 3, 'Total pages should now be 3');
assert.strictEqual(canvas.getCurrentPageIndex(), 2, 'Should now be on page index 2 (page 3)');

// Next page when at last page -> should return false and not overflow
const nextExceeded = canvas.nextPage();
assert.strictEqual(nextExceeded, false, 'Next page at end should return false');
assert.strictEqual(canvas.getCurrentPageIndex(), 2, 'Should remain on page 3');

// Prev page
const prevSuccess = canvas.prevPage();
assert.strictEqual(prevSuccess, true, 'Prev page should succeed');
assert.strictEqual(canvas.getCurrentPageIndex(), 1, 'Should now be on page 2');

canvas.prevPage(); // Page 1
assert.strictEqual(canvas.getCurrentPageIndex(), 0, 'Should now be on page 1');

// Prev page when at page 1 -> should return false and not underflow
const prevUnderflow = canvas.prevPage();
assert.strictEqual(prevUnderflow, false, 'Prev page at beginning should return false');
assert.strictEqual(canvas.getCurrentPageIndex(), 0, 'Should remain on page 1');
console.log('✓ Test 2 passed: Multi-page pagination & boundary clamping verified');

// Test 3: Stroke isolation per page and Undo/Redo state machine
console.log('Test 3: Stroke isolation per page and Undo/Redo state machine');
const page1 = canvas.getCurrentPage();
assert.strictEqual(page1.strokes.length, 0);

// Add a mock stroke to page 1
page1.undoStack.push([]);
page1.strokes.push({
  id: 'stroke-1',
  tool: 'pen',
  color: '#0a84ff',
  width: 4,
  opacity: 1,
  points: [{ x: 10, y: 10 }, { x: 20, y: 20 }],
});
assert.strictEqual(page1.strokes.length, 1);

// Switch to page 2 -> Page 2 strokes should be completely isolated (empty)
canvas.nextPage();
const page2 = canvas.getCurrentPage();
assert.strictEqual(page2.strokes.length, 0, 'Page 2 should not have page 1 strokes');

// Switch back to page 1 -> Page 1 strokes should remain intact
canvas.prevPage();
assert.strictEqual(canvas.getCurrentPage().strokes.length, 1, 'Page 1 strokes should be preserved');

// Test Undo on page 1
const undoSuccess = canvas.undo();
assert.strictEqual(undoSuccess, true, 'Undo should succeed');
assert.strictEqual(canvas.getCurrentPage().strokes.length, 0, 'Strokes should be empty after undo');

// Test Redo on page 1
const redoSuccess = canvas.redo();
assert.strictEqual(redoSuccess, true, 'Redo should succeed');
assert.strictEqual(canvas.getCurrentPage().strokes.length, 1, 'Strokes should be restored after redo');
console.log('✓ Test 3 passed: Page stroke isolation and Undo/Redo verified');

// Test 4: Whiteboard Theme switching & smart color contrast
console.log('Test 4: Theme switching and automatic contrast adjustment');
canvas.setColor('#1c1c1e'); // Black pen
canvas.setTheme('chalkboard'); // Switch to dark green chalkboard
assert.strictEqual(canvas.getTheme(), 'chalkboard');
assert.strictEqual(canvas.getColor(), '#ffffff', 'Dark pen should automatically switch to white on chalkboard');

canvas.setTheme('plain'); // Switch back to plain white
assert.strictEqual(canvas.getColor(), '#1c1c1e', 'White pen should automatically switch to dark on plain board');
console.log('✓ Test 4 passed: Theme switching & contrast adjustment verified');

// Test 5: Bottom Dock Bar state machine & view transitions
console.log('Test 5: Bottom Dock Bar state machine & view transitions');
let enteredLab = false;
let returnedWhiteboard = false;
let openedAccount = false;

const dockParent = new MockElement('div');
const dock = new WhiteboardDock(dockParent as any, {
  onEnterLab: () => {
    enteredLab = true;
  },
  onReturnWhiteboard: () => {
    returnedWhiteboard = true;
  },
  onOpenAccount: () => {
    openedAccount = true;
  },
});

assert.strictEqual(dock.getMode(), 'whiteboard', 'Dock should initialize in whiteboard mode');

// Simulate clicking "进入实验室"
const labBtn = dockParent.querySelector('#dock-btn-lab-toggle')!;
labBtn.dispatchEvent('click');
assert.strictEqual(enteredLab, true, 'Clicking lab button in whiteboard mode should trigger onEnterLab');

// Transition dock to 'laboratory' mode
dock.setMode('laboratory');
assert.strictEqual(dock.getMode(), 'laboratory');
assert.strictEqual(dock.element.style.display, 'none', 'Dock should be hidden in laboratory mode');

// Transition dock back to 'whiteboard' mode
dock.setMode('whiteboard');
assert.strictEqual(dock.element.style.display, '', 'Dock should be visible in whiteboard mode');
dock.setMode('laboratory');

// Simulate clicking "返回白板"
labBtn.dispatchEvent('click');
assert.strictEqual(returnedWhiteboard, true, 'Clicking lab button in laboratory mode should trigger onReturnWhiteboard');

// Simulate clicking "账户中心"
const accountBtn = dockParent.querySelector('#dock-btn-account-open')!;
accountBtn.dispatchEvent('click');
assert.strictEqual(openedAccount, true, 'Clicking account button should trigger onOpenAccount');
console.log('✓ Test 5 passed: Dock state transitions & callbacks verified');

// Test 6: Logged-out account entry, role-specific register fields, and signed-in views
console.log('Test 6: Account gate, register fields, and signed-in class views');
replaceSession(null);
const modalParent = new MockElement('div');
const accountModal = new AccountModal(canvas, modalParent as any);

assert.strictEqual(accountModal.visible, false, 'Modal should initially be hidden');
accountModal.open();
assert.strictEqual(accountModal.visible, true, 'Modal should be visible after open()');
assert.ok(modalParent.querySelector('#auth-panel'), 'Logged-out account button opens the auth panel');
assert.strictEqual(modalParent.querySelector('#profile-input-name'), null, 'Logged-out view has no profile name');
assert.strictEqual(modalParent.querySelector('#invite-code-value'), null, 'Logged-out view has no invite code');
assert.strictEqual(
  modalParent.querySelector('#field-display-name')!.classList.contains('hidden'),
  true,
  'Login hides the username',
);

modalParent.querySelector('#auth-tab-register')!.dispatchEvent('click');
assert.strictEqual(
  modalParent.querySelector('#field-display-name')!.classList.contains('hidden'),
  false,
  'Registration requires a username',
);
assert.strictEqual(
  (modalParent.querySelector('#auth-display-name') as { maxLength?: number } | null)?.maxLength,
  64,
  'Username input is limited to 64 characters',
);
assert.strictEqual(
  modalParent.querySelector('#field-class-name')!.classList.contains('hidden'),
  false,
  'Teacher registration shows the class name',
);
assert.strictEqual(
  modalParent.querySelector('#field-invite-code')!.classList.contains('hidden'),
  true,
  'Teacher registration hides the invite code',
);

modalParent.querySelector('#role-student')!.dispatchEvent('click');
assert.strictEqual(
  modalParent.querySelector('#field-class-name')!.classList.contains('hidden'),
  true,
  'Student registration hides the class name',
);
assert.strictEqual(
  modalParent.querySelector('#field-invite-code')!.classList.contains('hidden'),
  false,
  'Student registration shows the optional invite code',
);
assert.strictEqual(
  modalParent.querySelector('#field-display-name')!.classList.contains('hidden'),
  false,
  'Student registration also requires a username',
);

replaceSession({
  id: 't1',
  email: 'teacher@school.edu',
  role: 'teacher',
  displayName: null,
  class: {
    id: 'c1',
    name: '高二 (3) 班',
    inviteCode: 'A3K9P',
    students: [],
  },
});
assert.strictEqual(modalParent.querySelector('#invite-code-value')?.textContent, 'A3K9P');
assert.ok(modalParent.querySelector('#student-roster'), 'Teacher account shows the class roster');
assert.strictEqual(modalParent.querySelector('#auth-panel'), null);

replaceSession({
  id: 's1',
  email: 'student@school.edu',
  role: 'student',
  displayName: null,
  class: { id: 'c1', name: '高二 (3) 班' },
});
assert.strictEqual(modalParent.querySelector('#invite-code-value'), null, 'Students do not see the invite code');
assert.strictEqual(modalParent.querySelector('#class-name-readonly')?.textContent, '高二 (3) 班');
assert.strictEqual(modalParent.querySelector('#join-section'), null);

replaceSession({
  id: 's2',
  email: 'new@school.edu',
  role: 'student',
  displayName: null,
  class: null,
});
assert.ok(modalParent.querySelector('#join-section'), 'A student without a class can enter an invite code');
assert.strictEqual(modalParent.querySelector('#invite-code-value'), null);

accountModal.close();
assert.strictEqual(accountModal.visible, false, 'Modal should be hidden after close()');
replaceSession(null);
console.log('✓ Test 6 passed: Auth gate and role-specific account views verified');

console.log('\n========================================================');
console.log('All Apple-Style Whiteboard & Dock Tests Passed (6/6)!');
console.log('========================================================\n');

// Actual pointer events must stream before pen-up, and clear must cancel local ink.
const commands: any[] = [];
const shared = new WhiteboardCanvas(new MockElement('div') as any);
const { BoardState } = await import('../src/whiteboard/collaboration.ts');
const state = new BoardState();
state.snapshot({ type: 'snapshot', generation: 'test', revision: 0, pages: [{ id: 'page-1', epoch: 0, strokes: [] }], active: [] });
shared.configureCollaboration(c => { commands.push(structuredClone(c)); return true; });
shared.renderCollaboration(state, []);
const surface = shared.canvas as any as MockElement;
const pointer = (x: number, type = 'pointermove') => ({ type, pointerId: 1, button: 0, pointerType: 'pen', clientX: x, clientY: 80, pressure: 0.5 });
surface.dispatchEvent('pointerdown', pointer(100, 'pointerdown'));
surface.dispatchEvent('pointermove', pointer(120));
await new Promise(resolve => setTimeout(resolve, 25));
assert.deepEqual(commands.map(c => c.type), ['stroke_start', 'stroke_points'], 'Moving ink is sent before pen-up');
assert.equal(commands[0].stroke.width, 4, 'Width uses logical units, not device pixels');
assert.equal(commands[1].offset, 1);
// Ignore a second pointer while the pen is active.
surface.dispatchEvent('pointermove', { ...pointer(500), pointerId: 2 });
surface.dispatchEvent('pointerup', pointer(140, 'pointerup'));
assert.equal(commands.at(-1).type, 'stroke_commit');
assert.equal(commands.at(-1).stroke.points.length, 3);
assert.equal(commands.at(-1).stroke.points.at(-1).x, 140);
surface.dispatchEvent('pointerdown', pointer(200, 'pointerdown'));
state.apply({ type: 'canvas_clear', revision: 1, pageId: 'page-1', epoch: 1 });
shared.renderCollaboration(state, []);
const before = commands.length;
surface.dispatchEvent('pointerup', pointer(220, 'pointerup'));
assert.equal(commands.length, before, 'Clear cancels a currently held pen without resurrecting old ink');
shared.configureCollaboration(null);
console.log('✓ Live pointer streaming, logical coordinates and concurrent clear verified');
