import assert from 'node:assert';
import * as THREE from 'three';

const createMockElement = (tag = 'div'): any => {
  const el: any = {
    tagName: tag.toUpperCase(),
    setAttribute: () => {},
    getAttribute: () => null,
    style: {},
    appendChild: (child: any) => child,
    addEventListener: () => {},
    removeEventListener: () => {},
    classList: {
      add: () => {},
      remove: () => {},
      toggle: () => {},
      contains: () => false,
    },
    value: '',
    innerHTML: '',
    querySelector: () => createMockElement('div'),
    querySelectorAll: () => [],
    closest: () => null,
  };
  return el;
};

if (typeof globalThis.window === 'undefined') {
  (globalThis as any).window = {
    addEventListener: () => {},
    removeEventListener: () => {},
    innerWidth: 1920,
    innerHeight: 1080,
    devicePixelRatio: 1,
  };
}

if (typeof globalThis.document === 'undefined' || !(globalThis as any).document.body) {
  (globalThis as any).document = {
    addEventListener: () => {},
    removeEventListener: () => {},
    createElement: (tag: string) => createMockElement(tag),
    body: createMockElement('body'),
    pointerLockElement: null,
    exitPointerLock: () => {},
  };
}

import { PlayerController } from '../src/controls/PlayerController.ts';

console.log('=== PlayerController Vertical Elevation Tests ===\n');

// Test 1: Space bar increases Y (ascend)
{
  console.log('Test 1: Space bar key triggers ascend and increases camera Y');
  const cam = new THREE.PerspectiveCamera();
  const dummyDom = createMockElement('canvas');
  const player = new PlayerController(cam, dummyDom);

  const initialY = cam.position.y;
  assert.strictEqual(player.keys.up, false, 'keys.up must be false initially');

  // Key down Space
  let preventDefaultCalled = false;
  player.onKey({
    code: 'Space',
    cancelable: true,
    preventDefault: () => { preventDefaultCalled = true; },
  } as any, true);

  assert.strictEqual(player.keys.up, true, 'keys.up must be true when Space is pressed');
  assert.strictEqual(preventDefaultCalled, true, 'preventDefault must be called for Space to avoid page scroll');

  // Simulate multiple physics frames
  for (let i = 0; i < 10; i++) {
    player.update(0.016);
  }

  assert(cam.position.y > initialY, `Camera Y (${cam.position.y}) must be higher than initial Y (${initialY})`);
  assert(player.velocity.y > 0, `Vertical velocity (${player.velocity.y}) must be positive`);

  // Key up Space
  player.onKey({ code: 'Space' } as any, false);
  assert.strictEqual(player.keys.up, false, 'keys.up must be false after release');

  // Let damping decelerate
  for (let i = 0; i < 60; i++) {
    player.update(0.016);
  }
  assert(Math.abs(player.velocity.y) < 1e-3, 'Vertical velocity should damp down to zero after key release');
  console.log('✓ Test 1 passed: Space bar increases camera Y elevation and damps smoothly\n');
}

// Test 2: Shift key decreases Y (descend)
{
  console.log('Test 2: Shift key triggers descend and decreases camera Y');
  const cam = new THREE.PerspectiveCamera();
  const dummyDom = createMockElement('canvas');
  const player = new PlayerController(cam, dummyDom);

  const initialY = cam.position.y;
  assert.strictEqual(player.keys.down, false, 'keys.down must be false initially');

  // Key down ShiftLeft
  player.onKey({ code: 'ShiftLeft' } as any, true);
  assert.strictEqual(player.keys.down, true, 'keys.down must be true when ShiftLeft is pressed');

  // Simulate frames
  for (let i = 0; i < 10; i++) {
    player.update(0.016);
  }

  assert(cam.position.y < initialY, `Camera Y (${cam.position.y}) must be lower than initial Y (${initialY})`);
  assert(player.velocity.y < 0, `Vertical velocity (${player.velocity.y}) must be negative`);

  // Key up ShiftLeft
  player.onKey({ code: 'ShiftLeft' } as any, false);
  assert.strictEqual(player.keys.down, false, 'keys.down must be false after ShiftLeft release');

  // ShiftRight test
  player.onKey({ code: 'ShiftRight' } as any, true);
  assert.strictEqual(player.keys.down, true, 'keys.down must be true when ShiftRight is pressed');
  player.onKey({ code: 'ShiftRight' } as any, false);
  assert.strictEqual(player.keys.down, false, 'keys.down must be false after ShiftRight release');

  console.log('✓ Test 2 passed: Shift keys decrease camera Y elevation\n');
}

// Test 3: Clamping at minHeight and maxHeight
{
  console.log('Test 3: Camera Y is clamped between minHeight and maxHeight');
  const cam = new THREE.PerspectiveCamera();
  const dummyDom = createMockElement('canvas');
  const player = new PlayerController(cam, dummyDom);

  // Drive up past maxHeight
  player.keys.up = true;
  for (let i = 0; i < 300; i++) {
    player.update(0.05);
  }
  assert.strictEqual(cam.position.y, player.maxHeight, `Camera Y (${cam.position.y}) must clamp at maxHeight (${player.maxHeight})`);
  assert.strictEqual(player.velocity.y, 0, 'Velocity Y must be zero when clamped at ceiling');

  // Drive down past minHeight
  player.keys.up = false;
  player.keys.down = true;
  for (let i = 0; i < 300; i++) {
    player.update(0.05);
  }
  assert.strictEqual(cam.position.y, player.minHeight, `Camera Y (${cam.position.y}) must clamp at minHeight (${player.minHeight})`);
  assert.strictEqual(player.velocity.y, 0, 'Velocity Y must be zero when clamped at floor');

  console.log('✓ Test 3 passed: Camera Y successfully clamped at minHeight and maxHeight\n');
}

// Test 4: resetKeys resets both up and down
{
  console.log('Test 4: resetKeys clears up and down states');
  const cam = new THREE.PerspectiveCamera();
  const dummyDom = createMockElement('canvas');
  const player = new PlayerController(cam, dummyDom);

  player.keys.up = true;
  player.keys.down = true;
  player.resetKeys();

  assert.strictEqual(player.keys.up, false, 'keys.up must be reset');
  assert.strictEqual(player.keys.down, false, 'keys.down must be reset');
  console.log('✓ Test 4 passed: resetKeys clears vertical keys\n');
}

// Test 5: Simultaneous Space and Shift cancellation
{
  console.log('Test 5: Simultaneous Space and Shift cancel vertical velocity');
  const cam = new THREE.PerspectiveCamera();
  const dummyDom = createMockElement('canvas');
  const player = new PlayerController(cam, dummyDom);

  player.keys.up = true;
  player.keys.down = true;

  const startY = cam.position.y;
  for (let i = 0; i < 30; i++) {
    player.update(0.016);
  }

  assert(Math.abs(cam.position.y - startY) < 1e-4, 'Camera Y should not change when both up and down are pressed');
  console.log('✓ Test 5 passed: Up and down keys cancel each other out\n');
}

// Test 6: Typing in INPUT/TEXTAREA does not trigger controls
{
  console.log('Test 6: Keyboard inputs to INPUT/TEXTAREA are ignored');
  const cam = new THREE.PerspectiveCamera();
  const dummyDom = createMockElement('canvas');
  const player = new PlayerController(cam, dummyDom);

  const inputTarget = createMockElement('input');
  player.onKey({
    code: 'Space',
    target: inputTarget,
  } as any, true);

  assert.strictEqual(player.keys.up, false, 'keys.up should remain false when target is INPUT');
  console.log('✓ Test 6 passed: Typing in input field does not move camera\n');
}

console.log('========================================================');
console.log('All PlayerController Vertical Elevation Tests Passed (6/6)!');
console.log('========================================================\n');
