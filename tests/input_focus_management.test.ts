import assert from 'node:assert';
import * as THREE from 'three';

// Lightweight Mock DOM for test environment
class MockElement {
  public tagName: string;
  public type: string;
  public className = '';
  public disabled = false;
  public readOnly = false;
  public isContentEditable = false;
  public offsetParent: any = {};
  public isConnected = true;
  public value = '';
  public style: Record<string, string> = {};
  public classList = {
    _classes: new Set<string>(),
    add: (...cls: string[]) => cls.forEach((c) => el.classList._classes.add(c)),
    remove: (...cls: string[]) => cls.forEach((c) => el.classList._classes.delete(c)),
    toggle: (c: string, force?: boolean) => {
      if (force === true) el.classList._classes.add(c);
      else if (force === false) el.classList._classes.delete(c);
      else if (el.classList._classes.has(c)) el.classList._classes.delete(c);
      else el.classList._classes.add(c);
    },
    contains: (c: string) => el.classList._classes.has(c),
  };
  public parentNode: MockElement | null = null;
  public children: MockElement[] = [];

  public addEventListener(): void {}
  public removeEventListener(): void {}

  constructor(tagName = 'DIV', type = 'text') {
    this.tagName = tagName.toUpperCase();
    this.type = type;
  }

  public focus(): void {
    if (typeof globalThis.document !== 'undefined') {
      (globalThis.document as any).activeElement = this;
    }
  }

  public blur(): void {
    if (typeof globalThis.document !== 'undefined' && (globalThis.document as any).activeElement === this) {
      (globalThis.document as any).activeElement = (globalThis.document as any).body;
    }
  }

  public appendChild(child: MockElement): MockElement {
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  public closest(selector: string): MockElement | null {
    let curr: MockElement | null = this;
    while (curr) {
      if (selector.startsWith('#') && curr.tagName.toLowerCase() === selector.slice(1).toLowerCase()) {
        return curr;
      }
      if (selector === '#experiment-drawer' && curr.className.includes('experiment-drawer')) {
        return curr;
      }
      if (selector === '#vision-spatial-window' && curr.className.includes('vision-spatial-window')) {
        return curr;
      }
      if (selector === '#account-modal-backdrop' && curr.className.includes('apple-modal-backdrop')) {
        return curr;
      }
      curr = curr.parentNode;
    }
    return null;
  }
}

const el = new MockElement();

// Setup global document/window mocks
const mockBody = new MockElement('BODY');
(mockBody as any).activeElement = mockBody;

(globalThis as any).document = {
  activeElement: mockBody,
  body: mockBody,
  createElement: (tag: string) => new MockElement(tag),
  addEventListener: () => {},
  removeEventListener: () => {},
  exitPointerLock: () => {},
  pointerLockElement: null,
};

(globalThis as any).window = {
  innerWidth: 1920,
  innerHeight: 1080,
  devicePixelRatio: 1,
  addEventListener: () => {},
  removeEventListener: () => {},
};

import {
  isTextInputElement,
  isElementVisibleAndActive,
  isTextInputActive,
  blurActiveInput,
} from '../src/core/focus.ts';
import { PlayerController } from '../src/controls/PlayerController.ts';

console.log('=== Starting Input Focus & Typing Elimination Verification ===\n');

// Test 1: Identification of text inputs vs non-text inputs
{
  console.log('Test 1: isTextInputElement correctly identifies text-entry vs non-text elements');
  const textInput = new MockElement('INPUT', 'text');
  const searchInput = new MockElement('INPUT', 'search');
  const textarea = new MockElement('TEXTAREA');
  const rangeInput = new MockElement('INPUT', 'range');
  const checkbox = new MockElement('INPUT', 'checkbox');
  const fileInput = new MockElement('INPUT', 'file');
  const div = new MockElement('DIV');

  assert.strictEqual(isTextInputElement(textInput), true, 'text input must be identified as text input');
  assert.strictEqual(isTextInputElement(searchInput), true, 'search input must be identified as text input');
  assert.strictEqual(isTextInputElement(textarea), true, 'textarea must be identified as text input');
  assert.strictEqual(isTextInputElement(rangeInput), false, 'range slider must NOT be identified as text input');
  assert.strictEqual(isTextInputElement(checkbox), false, 'checkbox must NOT be identified as text input');
  assert.strictEqual(isTextInputElement(fileInput), false, 'file input must NOT be identified as text input');
  assert.strictEqual(isTextInputElement(div), false, 'div must NOT be identified as text input');
  console.log('✓ Test 1 passed\n');
}

// Test 2: Inactive/closed container detection
{
  console.log('Test 2: Inputs inside closed containers are marked inactive and auto-blurred');
  const drawer = new MockElement('DIV');
  drawer.className = 'experiment-drawer';
  const drawerSearch = new MockElement('INPUT', 'text');
  drawer.appendChild(drawerSearch);

  // Drawer closed (lacks 'open' class)
  assert.strictEqual(isElementVisibleAndActive(drawerSearch), false, 'Input in closed drawer must be inactive');

  // Focus the search input while drawer is closed
  drawerSearch.focus();
  assert.strictEqual(globalThis.document.activeElement, drawerSearch);

  // isTextInputActive should detect stale focus, auto-blur it, and return false
  const active = isTextInputActive();
  assert.strictEqual(active, false, 'isTextInputActive must return false for closed drawer search');
  assert.strictEqual(globalThis.document.activeElement, mockBody, 'Stale focus must be auto-blurred to body');

  // Open drawer -> now active
  drawer.classList.add('open');
  assert.strictEqual(isElementVisibleAndActive(drawerSearch), true, 'Input in open drawer must be active');
  drawerSearch.focus();
  assert.strictEqual(isTextInputActive(), true, 'isTextInputActive must return true when drawer is open and focused');
  console.log('✓ Test 2 passed\n');
}

// Test 3: PlayerController ignores stale focus and prevents default on movement keys
{
  console.log('Test 3: PlayerController ignores stale/hidden input and handles movement keys');
  const cam = new THREE.PerspectiveCamera();
  const dummyDom = new MockElement('CANVAS');
  const player = new PlayerController(cam, dummyDom as any);

  // Create a closed modal with an input
  const modal = new MockElement('DIV');
  modal.className = 'vision-spatial-window';
  modal.classList.add('hidden');
  const staleInput = new MockElement('INPUT', 'text');
  modal.appendChild(staleInput);
  staleInput.focus();

  let preventDefaultCalled = false;
  player.onKey(
    {
      code: 'KeyW',
      cancelable: true,
      target: staleInput,
      preventDefault: () => {
        preventDefaultCalled = true;
      },
    } as any,
    true
  );

  assert.strictEqual(player.keys.forward, true, 'Player keys.forward must be true even if stale input was targeted');
  assert.strictEqual(preventDefaultCalled, true, 'preventDefault must be called on KeyW to prevent browser IME composition');
  assert.strictEqual(globalThis.document.activeElement, mockBody, 'Stale input focus must be automatically cleared');

  // Release KeyW
  player.onKey({ code: 'KeyW', cancelable: true } as any, false);
  assert.strictEqual(player.keys.forward, false, 'keys.forward must be false after keyup');
  console.log('✓ Test 3 passed\n');
}

// Test 4: Genuine active input retains keystrokes without moving player
{
  console.log('Test 4: Genuine visible open input retains keystrokes without triggering player movement');
  const cam = new THREE.PerspectiveCamera();
  const dummyDom = new MockElement('CANVAS');
  const player = new PlayerController(cam, dummyDom as any);

  // Open drawer with search input
  const drawer = new MockElement('DIV');
  drawer.className = 'experiment-drawer open';
  drawer.classList.add('open');
  const activeInput = new MockElement('INPUT', 'text');
  drawer.appendChild(activeInput);
  activeInput.focus();

  let preventDefaultCalled = false;
  player.onKey(
    {
      code: 'KeyW',
      cancelable: true,
      target: activeInput,
      preventDefault: () => {
        preventDefaultCalled = true;
      },
    } as any,
    true
  );

  assert.strictEqual(player.keys.forward, false, 'Player must NOT move when user is genuinely typing into active input');
  assert.strictEqual(preventDefaultCalled, false, 'preventDefault must NOT be called when typing into genuine input');
  assert.strictEqual(globalThis.document.activeElement, activeInput, 'Active input must retain focus');
  console.log('✓ Test 4 passed\n');
}

// Test 5: blurActiveInput forces focus blur on canvas interaction
{
  console.log('Test 5: Canvas interaction clears any active input focus');
  const input = new MockElement('INPUT', 'text');
  input.focus();
  assert.strictEqual(globalThis.document.activeElement, input);

  blurActiveInput(true);
  assert.strictEqual(globalThis.document.activeElement, mockBody, 'blurActiveInput must clear focus on canvas pointerdown');
  console.log('✓ Test 5 passed\n');
}

console.log('========================================================');
console.log('All Input Focus & Typing Elimination Tests Passed (5/5)!');
console.log('========================================================\n');
