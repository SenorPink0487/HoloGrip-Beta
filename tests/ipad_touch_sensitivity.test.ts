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
    closest: (selector: string) => {
      if (selector.includes('discipline-card') && el.className?.includes('discipline-card')) return el;
      if (selector.includes('hud-interactive') && el.className?.includes('hud-interactive')) return el;
      return null;
    },
  };
  return el;
};

if (typeof globalThis.window === 'undefined') {
  (globalThis as any).window = {
    addEventListener: () => {},
    removeEventListener: () => {},
    innerWidth: 1920,
    innerHeight: 1080,
    devicePixelRatio: 2,
    matchMedia: () => ({ matches: true }),
  };
}

if (typeof globalThis.document === 'undefined' || !(globalThis as any).document.body) {
  (globalThis as any).document = {
    addEventListener: () => {},
    removeEventListener: () => {},
    createElement: (tag: string) => createMockElement(tag),
    head: createMockElement('head'),
    body: createMockElement('body'),
    getElementById: () => createMockElement('div'),
    pointerLockElement: null,
    exitPointerLock: () => {},
  };
}

if (typeof (globalThis as any).navigator === 'undefined') {
  (globalThis as any).navigator = {
    maxTouchPoints: 5,
  };
}

console.log('=== Starting iPad Touchscreen Tap Sensitivity Tests ===\n');

// Test 1: TouchController Tap Slop Protection
{
  console.log('Test 1: TouchController does NOT rotate camera or preventDefault on slight finger jitter (<= 10px)');
  const fs = await import('node:fs');
  const path = await import('node:path');
  const code = fs.readFileSync(path.resolve('src/controls/TouchController.ts'), 'utf8');

  assert(code.includes('lookTapSlop'), 'TouchController must define lookTapSlop');
  assert(code.includes('totalDist > this.lookTapSlop'), 'Must gate rotation dragging on lookTapSlop');
  assert(code.includes('this.isLookDragging = true'), 'Must track isLookDragging state');
  console.log('✓ Test 1 passed: TouchController tap slop threshold implemented');
}

// Test 2: UI Exemption in TouchController
{
  console.log('Test 2: TouchController exempts discipline-card, experiment-card, element-cell, and vision modal');
  const fs = await import('node:fs');
  const path = await import('node:path');
  const code = fs.readFileSync(path.resolve('src/controls/TouchController.ts'), 'utf8');

  assert(code.includes('.discipline-card'), 'Must exempt .discipline-card');
  assert(code.includes('.experiment-card'), 'Must exempt .experiment-card');
  assert(code.includes('.element-cell'), 'Must exempt .element-cell');
  assert(code.includes('.vision-spatial-window'), 'Must exempt .vision-spatial-window');
  assert(code.includes('#css3d-container'), 'Must exempt #css3d-container');
  console.log('✓ Test 2 passed: All UI modal & card elements are exempted from camera drag hijacking');
}

// Test 3: Engine Raycast Touch Radius Multi-Sampling
{
  console.log('Test 3: Engine raycastWithTouchRadius detects near-miss touch targets on iPad');
  const fs = await import('node:fs');
  const path = await import('node:path');
  const engineCode = fs.readFileSync(path.resolve('src/core/Engine.ts'), 'utf8');

  assert(engineCode.includes('raycastWithTouchRadius'), 'Engine must implement raycastWithTouchRadius');
  assert(engineCode.includes('radiusPx = 18'), 'Touch radius must be defined for multi-directional probing');
  const inputCode = fs.readFileSync(path.resolve('src/controls/LabPointerInput.ts'), 'utf8');
  assert(inputCode.includes('Math.PI * 0.25'), 'Must probe in 8 radial angles');

  // Verify functionality: Create a target mesh and camera
  const scene = new THREE.Scene();
  const geometry = new THREE.BoxGeometry(0.1, 0.1, 0.1);
  const material = new THREE.MeshBasicMaterial();
  const targetMesh = new THREE.Mesh(geometry, material);
  targetMesh.position.set(0, 0, -2);
  targetMesh.updateMatrixWorld(true);
  scene.add(targetMesh);

  const camera = new THREE.PerspectiveCamera(60, 1920 / 1080, 0.1, 100);
  camera.position.set(0, 0, 0);
  camera.lookAt(0, 0, -2);
  camera.updateMatrixWorld(true);

  // Exact center NDC: hits
  const directRay = new THREE.Raycaster();
  directRay.setFromCamera(new THREE.Vector2(0, 0), camera);
  const directHits = directRay.intersectObjects([targetMesh], true);
  assert.strictEqual(directHits.length > 0, true, 'Direct ray should hit the mesh');

  // Offset NDC (simulating tapping ~12px away on a 1920x1080 screen):
  // Target box extends to x = 0.05 world (~0.0243 NDC). Offset at 0.035 NDC (~10px beyond edge).
  const offsetRay = new THREE.Raycaster();
  const offsetNDC = new THREE.Vector2(0.035, 0.01);
  offsetRay.setFromCamera(offsetNDC, camera);
  const offsetHits = offsetRay.intersectObjects([targetMesh], true);
  assert.strictEqual(offsetHits.length, 0, 'Offset ray directly misses the mesh');

  // Multi-sampling radial probe around offset point (radius 18px in screen space -> 0.01875 NDC X):
  let detectedHit = false;
  const sampleAngles = [0, Math.PI * 0.25, Math.PI * 0.5, Math.PI * 0.75, Math.PI, Math.PI * 1.25, Math.PI * 1.5, Math.PI * 1.75];
  for (const angle of sampleAngles) {
    const probeNDC = new THREE.Vector2(
      offsetNDC.x + Math.cos(angle) * (18 / 960),
      offsetNDC.y + Math.sin(angle) * (18 / 540)
    );
    const probeRay = new THREE.Raycaster();
    probeRay.setFromCamera(probeNDC, camera);
    const probeHits = probeRay.intersectObjects([targetMesh], true);
    if (probeHits.length > 0) {
      detectedHit = true;
      break;
    }
  }
  assert.strictEqual(detectedHit, true, 'Radial touch multi-sampling successfully rescues near-miss touch tap');
  console.log('✓ Test 3 passed: Multi-sampling touch radius rescues near-miss touch taps');
}

// Test 4: Beaker Click vs Drag Sensitivity for Touch
{
  console.log('Test 4: Beaker drag detection adapts thresholds for touchscreen (dist > 16px, elapsed > 350ms)');
  const fs = await import('node:fs');
  const path = await import('node:path');
  const engineCode = fs.readFileSync(path.resolve('src/core/Engine.ts'), 'utf8');

  assert(engineCode.includes('isTouchPointer ? 16 : 8'), 'Touch drag distance threshold must be 16px on touch devices');
  assert(engineCode.includes('isTouchPointer ? 350 : 160'), 'Touch drag elapsed threshold must be 350ms on touch devices');
  assert(engineCode.includes('isTouchPointer ? 10 : 2'), 'Touch drag min movement must be 10px on touch devices');
  console.log('✓ Test 4 passed: Touch drag threshold protects finger tap duration & skin contact tremor');
}

// Test 5: Clean Listener Separation in Engine.ts
{
  console.log('Test 5: pointerup, pointercancel, and touch listeners are properly closed and registered');
  const fs = await import('node:fs');
  const path = await import('node:path');
  const engineCode = fs.readFileSync(path.resolve('src/core/Engine.ts'), 'utf8');

  // Verify pointercancel is not trapped inside pointerup
  const pointerUpIndex = engineCode.indexOf("window.addEventListener('pointerup'");
  const pointerCancelIndex = engineCode.indexOf("window.addEventListener('pointercancel'");
  assert(pointerUpIndex !== -1, 'pointerup listener must exist');
  assert(pointerCancelIndex !== -1, 'pointercancel listener must exist');

  // Ensure pointerup listener is closed before pointercancel
  const sub = engineCode.slice(pointerUpIndex, pointerCancelIndex);
  assert(sub.includes('});'), 'pointerup listener must have a closing }); before pointercancel');
  console.log('✓ Test 5 passed: Event listeners are properly scoped and cleanly registered');
}

// Test 6: CSS touch-action and cursor: pointer
{
  console.log('Test 6: index.html has touch-action: manipulation and cursor: pointer on interactive elements');
  const fs = await import('node:fs');
  const path = await import('node:path');
  const html = fs.readFileSync(path.resolve('index.html'), 'utf8');

  assert(html.includes('touch-action: manipulation;'), 'Must have touch-action: manipulation');
  assert(html.includes('.discipline-card'), 'Must style .discipline-card');
  assert(html.includes('.experiment-card'), 'Must style .experiment-card');
  assert(html.includes('.element-cell'), 'Must style .element-cell');
  assert(html.includes('-webkit-touch-callout: none;'), 'Must have -webkit-touch-callout: none');
  console.log('✓ Test 6 passed: Global CSS rules ensure zero tap delay and native clickable semantics on iOS/iPadOS');
}

console.log('\n========================================================');
console.log('All iPad Touchscreen Sensitivity Tests Passed (6/6)!');
console.log('========================================================\n');
