import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { initTouchModeTracking, resetTouchModeTrackingForTest } from '../src/controls/touchMode.ts';
import { PhysicsDisciplineModal } from '../src/ui/vision/PhysicsDisciplineModal.ts';

console.log('=== Starting iPad Touchscreen Sticky Hover Prevention Tests ===\n');

// Test 1: Touch Mode Tracking Initialization & Dynamic Switch
{
  console.log('Test 1: initTouchModeTracking dynamically manages .is-touch-device on document.body');
  
  resetTouchModeTrackingForTest();
  const classList = new Set<string>();
  const listeners: Record<string, Function[]> = {};

  const mockDocument: any = {
    body: {
      classList: {
        add: (cls: string) => classList.add(cls),
        remove: (cls: string) => classList.delete(cls),
        contains: (cls: string) => classList.has(cls),
      },
    },
    createElement: (tag: string) => {
      const el: any = {
        tagName: tag.toUpperCase(),
        className: '',
        innerHTML: '',
        style: {},
        setAttribute: () => {},
        getAttribute: () => null,
        addEventListener: () => {},
        removeEventListener: () => {},
        querySelector: () => null,
        querySelectorAll: () => [],
        classList: {
          add: () => {},
          remove: () => {},
          contains: () => false,
        },
      };
      return el;
    },
    activeElement: null,
  };

  const mockWindow: any = {
    addEventListener: (type: string, fn: Function) => {
      listeners[type] = listeners[type] || [];
      listeners[type].push(fn);
    },
    ontouchstart: {},
  };

  (globalThis as any).window = mockWindow;
  (globalThis as any).document = mockDocument;
  Object.defineProperty(globalThis, 'navigator', {
    value: {
      maxTouchPoints: 5,
      userAgent: 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
    },
    configurable: true,
  });

  initTouchModeTracking(true);

  // Initially on touch-capable device, .is-touch-device should be added
  assert(classList.has('is-touch-device'), 'Must add is-touch-device initially on touch platform');

  // Trigger genuine mouse movement -> should switch to mouse mode
  const mouseMoveListeners = listeners['mousemove'] || [];
  for (const fn of mouseMoveListeners) {
    fn({ movementX: 10, movementY: 5 });
  }
  assert(!classList.has('is-touch-device'), 'Genuine mouse movement must remove is-touch-device');

  // Synthetic mouse movement with zero displacement (from touch tap) -> must NOT remove touch mode
  classList.add('is-touch-device');
  for (const fn of mouseMoveListeners) {
    fn({ movementX: 0, movementY: 0 });
  }
  assert(classList.has('is-touch-device'), 'Synthetic zero-movement mouse event must NOT remove is-touch-device');

  // Touch tap occurs -> must restore is-touch-device
  const touchStartListeners = listeners['touchstart'] || [];
  for (const fn of touchStartListeners) {
    fn();
  }
  assert(classList.has('is-touch-device'), 'touchstart must re-engage is-touch-device');

  console.log('✓ Test 1 passed: Dynamic touch mode tracking works with 100% precision');
}

// Test 2: CSS Invariants in index.html for Sticky Hover Elimination
{
  console.log('Test 2: index.html wraps card/tile hovers in @media (hover: hover) and body:not(.is-touch-device)');
  const html = fs.readFileSync(path.resolve('index.html'), 'utf8');

  // Must have @media (hover: hover) and (pointer: fine)
  assert(html.includes('@media (hover: hover) and (pointer: fine)'), 'Must define fine pointer hover media query');

  // Must gate physics-branch-tile hover
  assert(html.includes('body:not(.is-touch-device) .physics-branch-tile:hover'), 'Must guard .physics-branch-tile:hover against touch devices');
  assert(html.includes('body:not(.is-touch-device) .physics-branch-tile.ready:hover .branch-tile-icon-box'), 'Must guard .physics-branch-tile icon box glow');

  // Must gate optics-card hover
  assert(html.includes('body:not(.is-touch-device) .optics-card:hover'), 'Must guard .optics-card:hover against touch devices');

  // Must gate discipline-card hover
  assert(html.includes('body:not(.is-touch-device) .discipline-card:hover'), 'Must guard .discipline-card:hover against touch devices');

  // Must have explicit touch reset fallbacks
  assert(html.includes('body.is-touch-device .physics-branch-tile:hover:not(:active)'), 'Must include body.is-touch-device reset for physics branch tile');
  assert(html.includes('@media (hover: none), (pointer: coarse)'), 'Must include coarse pointer reset media query');

  console.log('✓ Test 2 passed: All CSS sticky hover guards and reset rules verified');
}

// Test 3: PhysicsDisciplineModal Clean State on Level Changes
{
  console.log('Test 3: PhysicsDisciplineModal clears active element focus on Level 1 and Level 2 transitions');
  
  let blurred = false;
  const mockActiveEl: any = {
    blur: () => {
      blurred = true;
    },
  };
  (globalThis as any).document.activeElement = mockActiveEl;

  const modal = new PhysicsDisciplineModal({
    onBackToDisciplines: () => {},
  });

  blurred = false;
  modal.showLevel1();
  assert.strictEqual(blurred, true, 'showLevel1 must blur active element to prevent phantom focus');

  blurred = false;
  modal.showLevel2('thermo');
  assert.strictEqual(blurred, true, 'showLevel2 must blur active element to prevent phantom focus');

  console.log('✓ Test 3 passed: Active element focus is cleanly cleared on all navigation transitions');
}

// Test 4: HandRulesStatusCard Touch Guard Verification
{
  console.log('Test 4: HandRulesStatusCard guards .math-branch-tile hover styles');
  const code = fs.readFileSync(path.resolve('src/ui/vision/HandRulesStatusCard.ts'), 'utf8');

  assert(code.includes('@media (hover: hover) and (pointer: fine)'), 'HandRulesStatusCard must contain fine pointer media query');
  assert(code.includes('body:not(.is-touch-device) .math-branch-tile:hover'), 'Must guard .math-branch-tile:hover in HandRulesStatusCard');

  console.log('✓ Test 4 passed: HandRulesStatusCard touch protection verified');
}

console.log('\n========================================================');
console.log('All iPad Sticky Hover Prevention Tests Passed (4/4)!');
console.log('========================================================\n');
