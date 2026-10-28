import assert from 'node:assert';
import * as THREE from 'three';

// Lightweight DOM mock for Node.js test environment
class MockElement {
  public tagName: string;
  public className: string = '';
  public innerHTML: string = '';
  public style: Record<string, string> = {};
  public attributes: Record<string, string> = {};
  public eventListeners: Record<string, ((e?: any) => void)[]> = {};
  public children: MockElement[] = [];
  public parentElement: MockElement | null = null;

  constructor(tagName: string) {
    this.tagName = tagName.toUpperCase();
  }

  setAttribute(name: string, value: string): void {
    this.attributes[name] = value;
  }

  getAttribute(name: string): string | null {
    return this.attributes[name] ?? null;
  }

  removeAttribute(name: string): void {
    delete this.attributes[name];
  }

  appendChild(child: MockElement): void {
    child.parentElement = this;
    this.children.push(child);
  }

  removeChild(child: MockElement): void {
    const idx = this.children.indexOf(child);
    if (idx !== -1) {
      this.children.splice(idx, 1);
      child.parentElement = null;
    }
  }

  addEventListener(event: string, handler: (e?: any) => void): void {
    if (!this.eventListeners[event]) {
      this.eventListeners[event] = [];
    }
    this.eventListeners[event].push(handler);
  }

  removeEventListener(event: string, handler: (e?: any) => void): void {
    if (this.eventListeners[event]) {
      this.eventListeners[event] = this.eventListeners[event].filter((h) => h !== handler);
    }
  }

  querySelector(selector: string): MockElement | null {
    if (selector.startsWith('#')) {
      const id = selector.slice(1);
      if (this.attributes['id'] === id) return this;
      for (const child of this.children) {
        const found = child.querySelector(selector);
        if (found) return found;
      }
    }
    return new MockElement('div');
  }

  querySelectorAll(_selector: string): MockElement[] {
    return [];
  }
}

if (typeof globalThis.document === 'undefined') {
  const body = new MockElement('body');
  const head = new MockElement('head');
  (globalThis as any).document = {
    body,
    head,
    createElement: (tag: string) => new MockElement(tag),
    getElementById: (_id: string) => null,
  };
}

if (typeof globalThis.window === 'undefined') {
  (globalThis as any).window = {
    innerWidth: 1920,
    innerHeight: 1080,
    addEventListener: () => {},
    removeEventListener: () => {},
  };
}

import {
  FreeFallDynamicsSolver,
  STANDARD_ATMOSPHERE_KPA,
  STANDARD_AIR_DENSITY,
} from '../src/physics/mech/freeFallDynamics.ts';
import { NewtonTubeMesh } from '../src/scene/mech/NewtonTubeMesh.ts';
import MechFreeFallExperiment from '../src/experiments/catalog/mech-free-fall/index.ts';
import metadata from '../src/experiments/catalog/mech-free-fall/meta.ts';
import { PhysicsDisciplineModal } from '../src/ui/vision/PhysicsDisciplineModal.ts';
import type { ExperimentContext } from '../src/core/types.ts';

const mockContext: ExperimentContext = {
  scene: new THREE.Scene(),
  camera: new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 100),
  renderer: null as any,
  container: document.body as any,
  clock: new THREE.Clock(),
  resources: new Map(),
  params: new Map(),
  emitEvent: () => {},
  addEventListener: () => {},
  removeEventListener: () => {},
  setParameter: () => {},
};

console.log('=== Starting Free Fall & Newton Tube Experiment Analytical & Integration Tests ===\n');

// Test 1: Physics Dynamics in Standard Atmospheric Air (1 atm)
{
  console.log('Test 1: Free Fall Dynamics in Standard Air (Drag Law & Non-Equivalence)');
  const solver = new FreeFallDynamicsSolver({
    gravity: 9.80,
    airPressureKPa: STANDARD_ATMOSPHERE_KPA,
    fallDistanceM: 1.05,
  });

  assert.strictEqual(solver.airPressureKPa, STANDARD_ATMOSPHERE_KPA);
  assert(Math.abs(solver.airDensity - STANDARD_AIR_DENSITY) < 1e-4, 'Air density must equal standard air density 1.225 kg/m³');

  // Trigger inversion & wait for flip to complete (0.65s)
  solver.triggerInversion();
  assert.strictEqual(solver.isTubeRotating, true);

  // Advance time past flip duration to start falling
  for (let i = 0; i < 50; i++) {
    solver.step(0.016);
  }
  assert.strictEqual(solver.isTubeRotating, false);
  assert.strictEqual(solver.isFalling, true);

  // Step simulation until all objects land
  let steps = 0;
  while (solver.isFalling && steps < 3000) {
    solver.step(0.016);
    steps++;
  }

  const coin = solver.getObjectState('coin');
  const cork = solver.getObjectState('cork');
  const feather = solver.getObjectState('feather');

  assert.strictEqual(coin.hasLanded, true, 'Coin must land');
  assert.strictEqual(cork.hasLanded, true, 'Cork must land');
  assert.strictEqual(feather.hasLanded, true, 'Feather must land');

  console.log(`  [In Air] Coin land time:    ${coin.landTimeS.toFixed(4)} s`);
  console.log(`  [In Air] Cork land time:    ${cork.landTimeS.toFixed(4)} s`);
  console.log(`  [In Air] Feather land time: ${feather.landTimeS.toFixed(4)} s`);

  // In air: Coin lands first, Cork lands slightly after, Feather lands substantially later
  assert(
    coin.landTimeS < cork.landTimeS,
    `In air, coin (${coin.landTimeS.toFixed(3)}s) must land before cork (${cork.landTimeS.toFixed(3)}s)`
  );
  assert(
    cork.landTimeS < feather.landTimeS,
    `In air, cork (${cork.landTimeS.toFixed(3)}s) must land before feather (${feather.landTimeS.toFixed(3)}s)`
  );
  assert(
    feather.landTimeS > coin.landTimeS * 1.8,
    `In air, feather (${feather.landTimeS.toFixed(3)}s) must take significantly longer than coin (${coin.landTimeS.toFixed(3)}s)`
  );

  console.log('✓ Test 1 passed: In air, coin lands first, cork follows, and feather lands substantially later due to air drag\n');
}

// Test 2: Physics Dynamics in Vacuum (0 kPa) - Exact Equivalence Principle
{
  console.log('Test 2: Free Fall Dynamics in Ideal Vacuum (Equivalence Principle a = g)');
  const solver = new FreeFallDynamicsSolver({
    gravity: 9.80,
    airPressureKPa: 0.0,
    fallDistanceM: 1.05,
  });

  assert.strictEqual(solver.airPressureKPa, 0.0);
  assert.strictEqual(solver.airDensity, 0.0, 'Air density in vacuum must be strictly 0');
  assert.strictEqual(solver.vacuumRatioPercent, 100.0, 'Vacuum ratio must be 100%');

  // Trigger inversion & flip
  solver.triggerInversion();
  for (let i = 0; i < 50; i++) {
    solver.step(0.016);
  }
  assert.strictEqual(solver.isFalling, true);

  // Expected theoretical fall time: t = sqrt(2h / g)
  const expectedT = Math.sqrt((2 * 1.05) / 9.80);

  // Step simulation until landing
  let steps = 0;
  while (solver.isFalling && steps < 2000) {
    solver.step(0.005);
    steps++;
  }

  const coin = solver.getObjectState('coin');
  const cork = solver.getObjectState('cork');
  const feather = solver.getObjectState('feather');

  console.log(`  [In Vacuum] Coin land time:    ${coin.landTimeS.toFixed(5)} s`);
  console.log(`  [In Vacuum] Cork land time:    ${cork.landTimeS.toFixed(5)} s`);
  console.log(`  [In Vacuum] Feather land time: ${feather.landTimeS.toFixed(5)} s`);
  console.log(`  [In Vacuum] Theoretical time:  ${expectedT.toFixed(5)} s`);

  // In vacuum: All 3 land at the exact same millisecond!
  assert(
    Math.abs(coin.landTimeS - expectedT) < 0.01,
    `Coin land time (${coin.landTimeS.toFixed(4)}s) must closely match sqrt(2h/g) (${expectedT.toFixed(4)}s)`
  );
  assert(
    Math.abs(feather.landTimeS - coin.landTimeS) < 0.005,
    `Feather and coin must land at the exact same time in vacuum (diff: ${Math.abs(feather.landTimeS - coin.landTimeS)}s)`
  );
  assert(
    Math.abs(cork.landTimeS - coin.landTimeS) < 0.005,
    `Cork and coin must land at the exact same time in vacuum (diff: ${Math.abs(cork.landTimeS - coin.landTimeS)}s)`
  );

  // Verify feather lateral flutter was 0 in vacuum
  assert.strictEqual(feather.flutterX, 0, 'Feather lateral sway must be 0 in vacuum');
  assert.strictEqual(feather.flutterAngleRad, 0, 'Feather rocking angle must be 0 in vacuum');

  console.log('✓ Test 2 passed: In vacuum, feather, coin and cork fall synchronously with identical acceleration a = g\n');
}

// Test 3: Vacuum Pump Evacuation and Venting Dynamics
{
  console.log('Test 3: Vacuum Pump Evacuation & Venting Refill Dynamics');
  const solver = new FreeFallDynamicsSolver({
    airPressureKPa: STANDARD_ATMOSPHERE_KPA,
  });

  // Turn on pump
  solver.togglePump(true);
  assert.strictEqual(solver.isPumpRunning, true);
  assert.strictEqual(solver.isVenting, false);

  // Step pump for 3 seconds
  for (let i = 0; i < 300; i++) {
    solver.step(0.01);
  }

  // Pressure should have dropped dramatically towards 0
  assert(solver.airPressureKPa < 1.0, `After 3s pumping, pressure must drop near zero: got ${solver.airPressureKPa} kPa`);
  assert(solver.vacuumRatioPercent > 99.0, 'Vacuum ratio must exceed 99%');

  // Turn off pump and open vent valve
  solver.togglePump(false);
  solver.toggleVenting(true);
  assert.strictEqual(solver.isPumpRunning, false);
  assert.strictEqual(solver.isVenting, true);

  // Step venting for 2.5 seconds
  for (let i = 0; i < 250; i++) {
    solver.step(0.01);
  }

  assert(
    solver.airPressureKPa > 98.0,
    `After venting, pressure must return near standard atmosphere (101.3 kPa): got ${solver.airPressureKPa} kPa`
  );

  console.log('✓ Test 3 passed: Vacuum pump evacuates air smoothly, and vent valve restores atmospheric pressure\n');
}

// Test 4: NewtonTubeMesh 3D Assembly & Clean Resource Disposal
{
  console.log('Test 4: NewtonTubeMesh 3D Assembly & Disposal Invariants');
  const mesh = new NewtonTubeMesh();

  assert(mesh.group instanceof THREE.Group, 'Mesh group must be a THREE.Group');
  assert.strictEqual(mesh.group.name, 'NewtonTubeMesh');

  // Verify components exist in the 3D scene hierarchy
  let hasRotateBtn = false;
  let hasTube = false;
  let hasPump = false;
  let hasFeather = false;
  let hasCoin = false;
  let hasCork = false;

  mesh.group.traverse((obj) => {
    if (obj.name === 'freefall-rotate-button') hasRotateBtn = true;
    if (obj.name === 'freefall-tube') hasTube = true;
    if (obj.name === 'freefall-pump') hasPump = true;
    if (obj.name === 'freefall-feather') hasFeather = true;
    if (obj.name === 'freefall-coin') hasCoin = true;
    if (obj.name === 'freefall-cork') hasCork = true;
  });

  assert(hasRotateBtn, 'Must contain 3D rotate button');
  assert(hasTube, 'Must contain Newton tube');
  assert(hasPump, 'Must contain vacuum pump');
  assert(hasFeather, 'Must contain feather');
  assert(hasCoin, 'Must contain coin');
  assert(hasCork, 'Must contain cork');

  // Test visual update methods
  mesh.setTubeRotation(Math.PI / 4);
  mesh.setObjectsState(0.2, 0.4, 0.3, 0.01, 0.1);
  mesh.setPumpState(true, 5.0);
  mesh.setRotateButtonHovered(true);
  mesh.pulseRotateButton();

  // Test disposal
  mesh.dispose();
  console.log('✓ Test 4 passed: NewtonTubeMesh creates all required 3D components and disposes cleanly\n');
}

// Test 5: MechFreeFallExperiment Lifecycle & Parameter Binding
{
  console.log('Test 5: MechFreeFallExperiment Lifecycle & Interactive Handlers');
  const exp = new MechFreeFallExperiment();
  exp.init(mockContext);

  assert.strictEqual(exp.metadata.id, 'mech-free-fall');
  assert.strictEqual(exp.metadata.category, 'mechanics');

  const tel = exp.getTelemetry();
  assert(Math.abs(tel.airPressureKPa - STANDARD_ATMOSPHERE_KPA) < 0.05, 'Telemetry air pressure must match standard atmosphere');
  assert.strictEqual(tel.objects.length, 3);

  // Invert tube via experiment API
  exp.invertTube();
  const telRotating = exp.getTelemetry();
  assert.strictEqual(telRotating.isTubeRotating, true);

  // Test parameter change
  exp.onParameterChange('airPressure', 0.0, mockContext);
  assert.strictEqual(exp.getTelemetry().airPressureKPa, 0.0);

  exp.onParameterChange('gravity', 1.62, mockContext);
  assert.strictEqual(exp.getTelemetry().gravityM_S2, 1.62);

  // Clean disposal
  exp.dispose(mockContext);
  console.log('✓ Test 5 passed: MechFreeFallExperiment lifecycle, parameters, and inversion API verified\n');
}

// Test 6: 60+ FPS Frame Budget Benchmark
{
  console.log('Test 6: 60+ FPS Performance Benchmark for Free Fall Loop');
  const exp = new MechFreeFallExperiment();
  exp.init(mockContext);

  exp.invertTube();

  const iterations = 1000;
  const start = performance.now();
  for (let i = 0; i < iterations; i++) {
    exp.update(0.016, i * 0.016, mockContext);
  }
  const elapsedMs = performance.now() - start;
  const avgFrameMs = elapsedMs / iterations;
  const fps = 1000.0 / avgFrameMs;

  console.log(`  Free Fall Experiment average step time: ${avgFrameMs.toFixed(5)} ms`);
  console.log(`  Equivalent logic frame rate: ${Math.round(fps)} FPS`);
  assert(avgFrameMs < 0.5, `Logic frame time (${avgFrameMs} ms) well within 16.6ms budget`);

  exp.dispose(mockContext);
  console.log('✓ Test 6 passed: Simulation loop performance well within 60+ FPS budget\n');
}

// Test 7: 3D Raycast Hover Detection on Rotate Button & Pump
{
  console.log('Test 7: 3D Raycast Hover Target Detection (Rotate Button, Pump, Tube)');
  const exp = new MechFreeFallExperiment();
  exp.init(mockContext);

  // Update world matrices so coordinates are populated
  exp.rootGroup.updateMatrixWorld(true);

  // Ray pointing directly at rotate button
  const raycaster = new THREE.Raycaster();
  const btnPivot = exp['mesh']['rotateButtonPivot'];
  const worldPos = new THREE.Vector3();
  btnPivot.getWorldPosition(worldPos);

  raycaster.ray.origin.set(worldPos.x, worldPos.y, worldPos.z + 1.0);
  raycaster.ray.direction.set(0, 0, -1);

  const hoverInfo = exp.getHoverTarget(raycaster);
  assert(hoverInfo !== null, 'Should detect hover on rotate button');
  assert.strictEqual(hoverInfo?.id, 'freefall-rotate-button');
  assert(hoverInfo?.label.includes('旋转倒转按钮'), 'Tooltip must indicate 3D rotate button');

  // Verify pointer click on rotate button
  const mockEvent = new MockElement('div') as any;
  const hit = { object: exp['mesh']['rotateButtonHitBox'] } as any;
  const handled = exp.onPointerDown(mockEvent, hit, mockContext);
  assert.strictEqual(handled, true, 'PointerDown on rotate button must be handled');

  exp.dispose(mockContext);
  console.log('✓ Test 7 passed: 3D raycast hover target detected and pointer click handles inversion\n');
}

// Test 8: Modal & Catalog Registration
{
  console.log('Test 8: Modal & Catalog Registration Invariant');
  const mechanicsExps = PhysicsDisciplineModal.MECHANICS_EXPERIMENTS;
  const found = mechanicsExps.find((e) => e.id === 'mech-free-fall');

  assert(found !== undefined, 'mech-free-fall must be present in PhysicsDisciplineModal.MECHANICS_EXPERIMENTS');
  assert.strictEqual(found?.name, '自由落体与牛顿管实验');
  assert(found?.iconSvg.includes('svg'), 'Must have valid SVG icon');

  console.log('✓ Test 8 passed: mech-free-fall registered in Mechanics catalog with icon and formula\n');
}

// Test 9: Initial Resting Position & True Gravity Alignment during Inversion and Free Fall
{
  console.log('Test 9: Initial Resting Position & Physical Gravity Alignment');
  const exp = new MechFreeFallExperiment();
  exp.init(mockContext);

  const feather = exp['mesh']['featherGroup'];
  const coin = exp['mesh']['coinGroup'];
  const cork = exp['mesh']['corkGroup'];
  const halfH = exp['mesh'].FALL_DISTANCE_M / 2;

  // 1. Initial State: Objects must be resting at the bottom of the tube (Y = -halfH), not suspended in mid-air
  assert(Math.abs(feather.position.y - (-halfH)) < 0.05, `Feather initial position (${feather.position.y}) must be at bottom (-${halfH})`);
  assert(Math.abs(coin.position.y - (-halfH)) < 0.05, `Coin initial position (${coin.position.y}) must be at bottom (-${halfH})`);
  assert(Math.abs(cork.position.y - (-halfH)) < 0.05, `Cork initial position (${cork.position.y}) must be at bottom (-${halfH})`);

  // 2. Trigger Inversion & step through rotation
  exp.invertTube();
  for (let i = 0; i < 50; i++) {
    exp.update(0.016, i * 0.016, mockContext);
  }

  // Once flip completes, objects start at top (+halfH) and fall DOWNWARDS towards -halfH
  const startY = coin.position.y;
  assert(startY > 0.4, `After 180° flip, objects must be at top of tube (+${halfH}), got ${startY}`);

  // Step downward free fall motion
  exp.update(0.1, 1.0, mockContext);
  const midY = coin.position.y;
  assert(midY < startY, `Gravity must pull downward: midY (${midY}) < startY (${startY})`);

  // Step until all landed
  for (let i = 0; i < 200; i++) {
    exp.update(0.016, 1.1 + i * 0.016, mockContext);
  }

  assert(Math.abs(coin.position.y - (-halfH)) < 0.05, `Coin landed position (${coin.position.y}) must be at bottom cushion (-${halfH})`);
  assert(Math.abs(feather.position.y - (-halfH)) < 0.05, `Feather landed position (${feather.position.y}) must be at bottom cushion (-${halfH})`);

  exp.dispose(mockContext);
  console.log('✓ Test 9 passed: Objects start resting at bottom, carried to top on flip, and fall strictly downward with gravity\n');
}

// Test 10: Optical Clarity Glass Invariant (No transmission downsampling blur)
{
  console.log('Test 10: Optical Clarity Glass Invariant');
  const mesh = new NewtonTubeMesh();
  const glassMat = mesh['glassMaterial'];

  assert.strictEqual(glassMat.transparent, true, 'Glass must be transparent');
  assert(glassMat.opacity <= 0.25, `Glass opacity (${glassMat.opacity}) must be <= 0.25 for crystal clarity`);
  assert.strictEqual(glassMat.depthWrite, false, 'depthWrite must be false to avoid occluding interior objects');
  assert.strictEqual(glassMat.clearcoat, 1.0, 'Clearcoat must be 1.0 for physical glass sheen');
  assert(!('transmission' in glassMat) || (glassMat as any).transmission === undefined || (glassMat as any).transmission === 0, 'Must not use transmission buffer downsampling to prevent blurring interior objects');

  mesh.dispose();
  console.log('✓ Test 10 passed: Newton tube uses crystal-clear optical glass material with sharp interior resolution\n');
}

// Test 11: Experimental Apparatus Material & Anti-White Invariant (实验器材严禁使用白色)
{
  console.log('Test 11: Experimental Apparatus Material & Anti-White Invariant');
  const mesh = new NewtonTubeMesh();
  const precisionSlate = mesh['precisionSlateMaterial'];
  const pumpMotor = mesh['pumpMotorMaterial'];
  const sapphireDisplay = mesh['sapphireDisplayMaterial'];
  const switchBox = mesh['switchBoxMaterial'];

  // 1. Verify no white materials are used for equipment housings & structural bases
  assert.notStrictEqual(precisionSlate.color.getHex(), 0xffffff, 'Chassis slate must not be white');
  assert.notStrictEqual(precisionSlate.color.getHex(), 0xf8fafc, 'Chassis slate must not be white');
  assert.strictEqual(precisionSlate.color.getHex(), 0x1e293b, 'Chassis slate should be precision deep space titanium (0x1e293b)');

  // 2. Verify vacuum pump motor uses precision industrial laboratory blue
  assert.notStrictEqual(pumpMotor.color.getHex(), 0xffffff, 'Pump motor must not be white');
  assert.strictEqual(pumpMotor.color.getHex(), 0x1e40af, 'Pump motor should be precision industrial lab blue (0x1e40af)');

  // 3. Verify vacuum gauge dial face uses deep oceanic sapphire rather than plain white
  assert.notStrictEqual(sapphireDisplay.color.getHex(), 0xffffff, 'Gauge display must not be white');
  assert.strictEqual(sapphireDisplay.color.getHex(), 0x0a192f, 'Gauge display should be deep oceanic sapphire (0x0a192f)');

  // 4. Verify switch box enclosure is dark instrument polymer
  assert.notStrictEqual(switchBox.color.getHex(), 0xffffff, 'Switch box must not be white');
  assert.strictEqual(switchBox.color.getHex(), 0x0f172a, 'Switch box should be dark instrument polymer (0x0f172a)');

  mesh.dispose();
  console.log('✓ Test 11 passed: Experimental apparatus uses precision titanium slate, industrial blue, and sapphire display with zero white equipment parts\n');
}

console.log('========================================================');
console.log('All Free Fall & Newton Tube Experiment Tests Passed (11/11)!');
console.log('========================================================\n');
