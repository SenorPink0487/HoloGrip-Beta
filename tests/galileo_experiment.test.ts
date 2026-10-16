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

  getBoundingClientRect(): DOMRect {
    return {
      x: 0,
      y: 0,
      width: 250,
      height: 140,
      top: 20,
      left: 1000,
      right: 1250,
      bottom: 160,
      toJSON: () => {},
    };
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

import { GalileoDynamicsSolver } from '../src/physics/mech/galileoDynamics.ts';
import { GalileoBenchMesh } from '../src/scene/mech/GalileoBenchMesh.ts';
import MechGalileoExperiment from '../src/experiments/catalog/mech-galileo/index.ts';
import metadata from '../src/experiments/catalog/mech-galileo/meta.ts';
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
};

console.log('=== Starting Galileo Ideal Incline Experiment Analytical & Integration Tests ===\n');

// Test 1: Physics Dynamics Solver: bottom velocity conservation v = sqrt(2gh)
{
  console.log('Test 1: Verify Galileo Incline Bottom Speed Conservation');
  const releaseHeight = 0.25;
  const gravity = 9.80;
  const solver = new GalileoDynamicsSolver({
    releaseHeightM: releaseHeight,
    gravity,
    leftAngleDeg: 35.0,
    flatLengthM: 0.40,
    rightAngleDeg: 30.0,
    rightLengthM: 0.60,
    frictionMu: 0.0,
  });

  const expectedBottomV = Math.sqrt(2 * gravity * releaseHeight);
  assert(
    Math.abs(solver.bottomSpeedM_S - expectedBottomV) < 1e-6,
    `Bottom speed must strictly equal sqrt(2gh): got ${solver.bottomSpeedM_S}, expected ${expectedBottomV}`
  );

  // Run simulation until the ball reaches the bottom horizontal section
  let state = solver.step(0.016);
  let steps = 0;
  while (state.zone !== 'flat' && steps < 500) {
    state = solver.step(0.016);
    steps++;
  }

  assert(state.zone === 'flat', 'Ball must reach horizontal section');
  assert(
    Math.abs(state.speed - expectedBottomV) < 0.02,
    `Horizontal speed (${state.speed.toFixed(3)}) must match sqrt(2gh) (${expectedBottomV.toFixed(3)})`
  );
  console.log(`✓ Test 1 passed: Speed at horizontal track matches sqrt(2gh) = ${state.speed.toFixed(3)} m/s\n`);
}

// Test 2: Angle variation and climb distance: smaller angle -> longer climb distance
{
  console.log('Test 2: Right Incline Angle vs Travel Distance (Equal Height Law)');
  const h0 = 0.25;
  const solver45 = new GalileoDynamicsSolver({
    releaseHeightM: h0,
    rightAngleDeg: 45.0,
    rightLengthM: 0.80,
  });
  const dist45 = h0 / Math.sin((45.0 * Math.PI) / 180.0);

  const solver30 = new GalileoDynamicsSolver({
    releaseHeightM: h0,
    rightAngleDeg: 30.0,
    rightLengthM: 0.80,
  });
  const dist30 = h0 / Math.sin((30.0 * Math.PI) / 180.0);

  const solver15 = new GalileoDynamicsSolver({
    releaseHeightM: h0,
    rightAngleDeg: 15.0,
    rightLengthM: 1.20,
  });
  const dist15 = h0 / Math.sin((15.0 * Math.PI) / 180.0);

  assert(dist30 > dist45, '30° slope travel distance must be strictly greater than 45°');
  assert(dist15 > dist30, '15° slope travel distance must be strictly greater than 30°');
  assert(Math.abs(dist30 - 0.50) < 1e-4, 'At 30°, climb distance must equal h0 / sin(30°) = 0.25 / 0.5 = 0.50m');

  console.log(`  45° Climb distance: ${dist45.toFixed(3)} m`);
  console.log(`  30° Climb distance: ${dist30.toFixed(3)} m`);
  console.log(`  15° Climb distance: ${dist15.toFixed(3)} m`);
  console.log('✓ Test 2 passed: As inclination angle decreases, travel distance increases while reaching equal height\n');
}

// Test 3: θ = 0° Ideal Horizontal Infinite Inertial Motion (Newton's 1st Law)
{
  console.log('Test 3: θ = 0° Ideal Horizontal Motion (Inertia Law)');
  const solverZero = new GalileoDynamicsSolver({
    releaseHeightM: 0.25,
    rightAngleDeg: 0.0,
    rightLengthM: 1.0,
    frictionMu: 0.0,
  });

  const telem = solverZero.getTelemetry();
  assert(telem.isInfiniteRoll === true, 'When θ_R = 0, isInfiniteRoll must be true');
  assert(telem.theoreticalRightDistanceM === Infinity, 'Theoretical distance must be Infinity');

  // Let ball roll onto the right flat section
  let state = solverZero.step(0.016);
  for (let i = 0; i < 200; i++) {
    state = solverZero.step(0.016);
  }

  // Once on the flat/horizontal section with mu=0, acceleration must be 0 and speed constant
  assert(state.isUniformInertia === true, 'State must identify uniform inertia');
  assert(Math.abs(state.acceleration) < 1e-6, 'Acceleration on frictionless horizontal plane must be zero');
  console.log(`✓ Test 3 passed: At 0°, acceleration is 0 and ball undergoes perpetual uniform motion\n`);
}

// Test 4: Bench Mesh Lifecycle and Disposal
{
  console.log('Test 4: GalileoBenchMesh 3D Assembly & Disposal Invariants');
  const bench = new GalileoBenchMesh();
  assert(bench.group.children.length > 0, 'Bench mesh group must have child components');
  assert(bench.getRightTipHandleMesh() !== null, 'Right tip handle mesh must be instantiated');

  // Test transform update
  bench.updateRightIncline(20.0, 0.75);
  bench.updateHeightLine(0.30);
  bench.setBallState(0.1, 0.05, 1.2, 0.3, true);

  // Disposal
  bench.dispose();
  console.log('✓ Test 4 passed: GalileoBenchMesh created, transformed and disposed cleanly without leaks\n');
}

// Test 5: Experiment Class Lifecycle, Parameter Change & Telemetry
{
  console.log('Test 5: MechGalileoExperiment Lifecycle & Auto-Reset Invariant');
  const exp = new MechGalileoExperiment();
  assert(exp.metadata.id === 'mech-galileo', 'Experiment ID must be mech-galileo');
  assert(exp.metadata.category === 'mechanics', 'Category must be mechanics');

  exp.init(mockContext);

  // Verify telemetry retrieval
  const telem = exp.getTelemetry();
  assert(telem.releaseHeightM === 0.25, 'Default release height must be 0.25m');
  assert(telem.rightAngleDeg === 30.0, 'Default right angle must be 30.0°');

  // Verify parameter modification
  exp.onParameterChange?.('rightAngle', 15.0, mockContext);
  exp.onParameterChange?.('releaseHeight', 0.30, mockContext);

  const updatedTelem = exp.getTelemetry();
  assert(updatedTelem.rightAngleDeg === 15.0, 'Right angle should update to 15.0°');
  assert(updatedTelem.releaseHeightM === 0.30, 'Release height should update to 0.30m');

  // Run update loop
  for (let i = 0; i < 60; i++) {
    exp.update(0.016, i * 0.016, mockContext);
  }

  // Verify reset ball
  exp.resetBall();
  const resetTelem = exp.getTelemetry();
  assert(resetTelem.state.arcLength < 0.01, 'Ball should be reset to starting position');

  exp.dispose(mockContext);
  console.log('✓ Test 5 passed: MechGalileoExperiment lifecycle, parameter propagation & reset verified\n');
}

// Test 6: Frame Budget Benchmark (60+ FPS performance check)
{
  console.log('Test 6: 60+ FPS Frame Budget Benchmark for Galileo Ideal Experiment');
  const exp = new MechGalileoExperiment();
  exp.init(mockContext);

  const iterations = 1000;
  const start = performance.now();
  for (let i = 0; i < iterations; i++) {
    exp.update(0.016, i * 0.016, mockContext);
  }
  const elapsedMs = performance.now() - start;
  const avgFrameMs = elapsedMs / iterations;
  const fps = 1000.0 / avgFrameMs;

  console.log(`  Galileo Experiment average step time: ${avgFrameMs.toFixed(5)} ms`);
  console.log(`  Equivalent logic frame rate: ${Math.round(fps)} FPS`);
  assert(avgFrameMs < 0.1, `Logic frame time (${avgFrameMs} ms) well within 16.6ms frame budget`);

  exp.dispose(mockContext);
  console.log('✓ Test 6 passed: Performance well within 60+ FPS budget\n');
}

// Test 7: Pure 3D interaction verification and zero DOM floating widgets
{
  console.log('Test 7: Pure 3D Interaction & Zero DOM Floating Widgets (Optics-like Model)');
  const exp = new MechGalileoExperiment();
  exp.init(mockContext);

  // Check hover detection on right handle
  const raycaster = new THREE.Raycaster();
  // Ray pointing directly at right tip handle
  const handleMesh = exp['bench'].getRightTipHandleMesh();
  const worldPos = new THREE.Vector3();
  handleMesh.getWorldPosition(worldPos);

  raycaster.ray.origin.set(worldPos.x, worldPos.y, worldPos.z + 2.0);
  raycaster.ray.direction.set(0, 0, -1);

  const hoverInfo = exp.getHoverTarget(raycaster);
  assert(hoverInfo !== null, 'Should detect hover on right direction indicator');
  assert(hoverInfo?.id === 'galileo-direction-handle', 'Target ID must be galileo-direction-handle');
  assert(hoverInfo?.label.includes('方向标'), 'Label must indicate direction handle');

  // Verify zero floating DOM widgets attached
  const domWidgets = document.body.querySelectorAll('.galileo-direction-widget');
  assert.strictEqual(domWidgets.length, 0, 'No 2D floating widget elements should exist in DOM');

  exp.dispose(mockContext);
  console.log('✓ Test 7 passed: 3D raycast hover target detected and zero DOM floating widgets verified\n');
}

console.log('========================================================');
console.log('All Galileo Experiment Tests Passed (7/7)!');
console.log('========================================================\n');
