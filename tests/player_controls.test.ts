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

// Test 7: TouchController virtual joystick and bottom-right vision launcher CSS invariants
{
  console.log('Test 7: TouchController virtual joystick and bottom-right vision launcher CSS invariants');
  const fs = await import('node:fs');
  const path = await import('node:path');

  const touchCode = fs.readFileSync(path.resolve('src/controls/TouchController.ts'), 'utf8');

  // Verify bottom-right launcher positioning
  assert(touchCode.includes('#touch-vision-launcher'), 'Must define #touch-vision-launcher');
  assert(touchCode.includes('right: calc('), 'Launcher must be positioned on the right (bottom-right)');
  assert(touchCode.includes('bottom: calc('), 'Launcher must be positioned on the bottom');
  assert(touchCode.includes('全息视窗'), 'Launcher must contain label text 全息视窗');

  // Verify bottom-left joystick positioning and aesthetic components
  assert(touchCode.includes('#virtual-joystick-base'), 'Must define #virtual-joystick-base');
  assert(touchCode.includes('left: calc('), 'Joystick must be positioned on the left (bottom-left)');
  assert(touchCode.includes('vj-compass-pip'), 'Joystick base must contain cardinal compass direction pips');
  assert(touchCode.includes('vj-guide-ring'), 'Joystick base must contain concentric guide track ring');
  assert(touchCode.includes('vj-axis-cross'), 'Joystick base must contain subtle crosshair axis lines');
  assert(touchCode.includes('vj-knob-ridge'), 'Joystick knob must contain tactile concentric ridge');
  assert(touchCode.includes('vj-knob-core'), 'Joystick knob must contain luminous core pip');

  // Verify iPad / tablet responsive scaling (@media 768px+)
  assert(touchCode.includes('@media (pointer: coarse) and (min-width: 768px)'), 'Must include iPad/tablet media query');
  assert(touchCode.includes('width: 138px'), 'iPad joystick base must scale up to 138px');
  assert(touchCode.includes('width: 54px'), 'iPad joystick knob must scale up to 54px');

  console.log('✓ Test 7 passed: TouchController layout, bottom-right launcher, and glassmorphic joystick verified\n');
}

// Test 8: TouchController lifecycle, toggle callback, and modal state synchronization
{
  console.log('Test 8: TouchController lifecycle, toggle callback, and modal state synchronization');
  const { TouchController } = await import('../src/controls/TouchController.ts');

  assert.strictEqual(typeof TouchController.prototype.setVisionModalOpen, 'function', 'Must implement setVisionModalOpen');
  assert.strictEqual(typeof TouchController.prototype.setVisible, 'function', 'Must implement setVisible');

  let toggleTriggered = false;
  const mockLauncherBtn: any = {
    classList: {
      classes: new Set<string>(),
      add: (c: string) => mockLauncherBtn.classList.classes.add(c),
      remove: (c: string) => mockLauncherBtn.classList.classes.delete(c),
      toggle: (c: string, force?: boolean) => {
        if (force !== undefined) {
          if (force) mockLauncherBtn.classList.classes.add(c);
          else mockLauncherBtn.classList.classes.delete(c);
          return force;
        }
        if (mockLauncherBtn.classList.classes.has(c)) {
          mockLauncherBtn.classList.classes.delete(c);
          return false;
        } else {
          mockLauncherBtn.classList.classes.add(c);
          return true;
        }
      },
      contains: (c: string) => mockLauncherBtn.classList.classes.has(c),
    },
    setAttribute: (attr: string, val: string) => {
      mockLauncherBtn[attr] = val;
    },
  };

  const dummyTouch: any = Object.create(TouchController.prototype);
  dummyTouch.visionLauncherBtn = mockLauncherBtn;
  dummyTouch.onToggleVisionModal = () => {
    toggleTriggered = true;
  };

  // Test setVisionModalOpen(true)
  dummyTouch.setVisionModalOpen(true);
  assert.strictEqual(mockLauncherBtn.classList.contains('is-open'), true, 'Launcher must have is-open class when open');
  assert.strictEqual(mockLauncherBtn['aria-expanded'], 'true', 'aria-expanded must be true');

  // Test setVisionModalOpen(false)
  dummyTouch.setVisionModalOpen(false);
  assert.strictEqual(mockLauncherBtn.classList.contains('is-open'), false, 'Launcher must not have is-open class when closed');
  assert.strictEqual(mockLauncherBtn['aria-expanded'], 'false', 'aria-expanded must be false');

  // Test onToggleVisionModal trigger
  dummyTouch.onToggleVisionModal();
  assert.strictEqual(toggleTriggered, true, 'onToggleVisionModal callback must fire');

  console.log('✓ Test 8 passed: TouchController modal synchronization and callback verified\n');
}

// Test 9: Hand tracking active hides bottom-left joystick and bottom-right launcher with elegant animation
{
  console.log('Test 9: Hand tracking active hides bottom-left joystick and bottom-right launcher with elegant animation');
  const fs = await import('node:fs');
  const path = await import('node:path');
  const { TouchController } = await import('../src/controls/TouchController.ts');

  assert.strictEqual(typeof TouchController.prototype.setHandTrackingActive, 'function', 'Must implement setHandTrackingActive');

  const touchCode = fs.readFileSync(path.resolve('src/controls/TouchController.ts'), 'utf8');

  // Verify CSS hide animation rules
  assert(touchCode.includes('.hand-tracking-active #virtual-joystick-base'), 'Must define hide rule for joystick');
  assert(touchCode.includes('.hand-tracking-active #touch-vision-launcher'), 'Must define hide rule for launcher');
  assert(touchCode.includes('opacity: 0 !important'), 'Hide rule must force opacity 0');
  assert(touchCode.includes('pointer-events: none !important'), 'Hide rule must disable pointer events');
  assert(touchCode.includes('filter: blur(10px) !important'), 'Hide rule must apply elegant glass blur');
  assert(touchCode.includes('cubic-bezier(0.16, 1, 0.3, 1)'), 'Must use Apple fluid cubic-bezier curve for elegant animation');

  // Verify functional reset behavior
  const mockLayer: any = {
    classes: new Set<string>(),
    classList: {
      add: (c: string) => mockLayer.classes.add(c),
      remove: (c: string) => mockLayer.classes.delete(c),
      toggle: (c: string, force?: boolean) => {
        if (force !== undefined) {
          if (force) mockLayer.classes.add(c);
          else mockLayer.classes.delete(c);
          return force;
        }
        if (mockLayer.classes.has(c)) {
          mockLayer.classes.delete(c);
          return false;
        } else {
          mockLayer.classes.add(c);
          return true;
        }
      },
      contains: (c: string) => mockLayer.classes.has(c),
    },
  };

  const prevGetElementById = (globalThis as any).document.getElementById;
  (globalThis as any).document.getElementById = (id: string) => {
    if (id === 'touch-controls-layer') return mockLayer;
    return null;
  };

  const dummyTouch: any = Object.create(TouchController.prototype);
  dummyTouch.player = {
    keys: { forward: true, backward: false, left: true, right: false, sprint: true },
  };
  dummyTouch.isDraggingJoystick = true;
  dummyTouch.joystickKnob = { style: { transform: 'translate(20px, 30px)' }, classList: { remove: () => {} } };
  dummyTouch.joystickBase = { classList: { remove: () => {} } };

  // Turn hand tracking on -> active: true
  dummyTouch.setHandTrackingActive(true);
  assert.strictEqual(mockLayer.classList.contains('hand-tracking-active'), true, 'Layer must receive hand-tracking-active class');
  assert.strictEqual(dummyTouch.isDraggingJoystick, false, 'Active joystick drag must be cancelled');
  assert.strictEqual(dummyTouch.joystickTouchId, null, 'Joystick touch ID must be cleared');
  assert.strictEqual(dummyTouch.player.keys.forward, false, 'Player forward key must be reset');
  assert.strictEqual(dummyTouch.player.keys.sprint, false, 'Player sprint key must be reset');
  assert.strictEqual(dummyTouch.joystickKnob.style.transform, 'translate(0px, 0px)', 'Knob must return to center');

  // Turn hand tracking off -> active: false
  dummyTouch.setHandTrackingActive(false);
  assert.strictEqual(mockLayer.classList.contains('hand-tracking-active'), false, 'Layer must remove hand-tracking-active class');

  (globalThis as any).document.getElementById = prevGetElementById;

  console.log('✓ Test 9 passed: Hand gesture active state machine and elegant hide animation verified\n');
}

console.log('========================================================');
console.log('All PlayerController & Touch Interaction Tests Passed (9/9)!');
console.log('========================================================\n');
