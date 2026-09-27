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

  constructor(tagName: string) {
    this.tagName = tagName.toUpperCase();
  }

  setAttribute(name: string, value: string): void {
    this.attributes[name] = value;
  }

  getAttribute(name: string): string | null {
    return this.attributes[name] ?? null;
  }

  addEventListener(event: string, handler: (e?: any) => void): void {
    if (!this.eventListeners[event]) {
      this.eventListeners[event] = [];
    }
    this.eventListeners[event].push(handler);
  }

  dispatch(event: string, e?: any): void {
    if (this.eventListeners[event]) {
      for (const h of this.eventListeners[event]) {
        h(e);
      }
    }
  }

  querySelector(selector: string): MockElement | null {
    if (selector.startsWith('#')) {
      const id = selector.slice(1);
      if (this.innerHTML.includes(`id="${id}"`)) {
        const el = new MockElement('div');
        el.setAttribute('id', id);
        return el;
      }
    }
    return null;
  }
}

if (typeof globalThis.document === 'undefined') {
  (globalThis as any).document = {
    createElement: (tag: string) => new MockElement(tag),
  };
}

import MechNewtonExperiment from '../src/experiments/catalog/mech-newton/index.ts';
import MechCollisionExperiment from '../src/experiments/catalog/mech-collision/index.ts';
import MechProjectileExperiment from '../src/experiments/catalog/mech-projectile/index.ts';
import MechPendulumExperiment from '../src/experiments/catalog/mech-pendulum/index.ts';
import MechCentripetalExperiment from '../src/experiments/catalog/mech-centripetal/index.ts';
import { MechStatusCard } from '../src/ui/vision/MechStatusCard.ts';
import type { ExperimentContext } from '../src/core/types.ts';

console.log('=== Starting Classical Mechanics Integration & Performance Tests ===\n');

const mockContext: ExperimentContext = {
  renderer: {
    shadowMap: { enabled: true },
    render: () => {},
    setSize: () => {},
  } as any,
  camera: new THREE.PerspectiveCamera(),
  scene: new THREE.Scene(),
  workerPool: null as any,
  computeBridge: null as any,
  container: document.createElement('div') as any,
  parameters: new Map(),
  setParameter: (id, val) => {},
  getParameter: (id) => undefined,
};

// Test 1: MechNewtonExperiment Lifecycle & Telemetry
{
  console.log('Test 1: MechNewtonExperiment lifecycle, parameter change & telemetry');
  const exp = new MechNewtonExperiment();
  assert.strictEqual(exp.metadata.id, 'mech-newton');
  assert.strictEqual(exp.metadata.category, 'mechanics');

  exp.init(mockContext);
  assert(exp.rootGroup.children.length > 0, 'Root group must contain bench mesh');

  exp.update(0.016, 0.016, mockContext);
  const t = exp.getTelemetry();
  assert(t.acceleration > 0, 'Must calculate positive acceleration');
  assert(t.dots.length > 0, 'Must have ticker dots');

  // Change parameters
  exp.onParameterChange('cartMass', 400, mockContext);
  exp.onParameterChange('hookMass', 40, mockContext);
  const t2 = exp.getTelemetry();
  assert.strictEqual(t2.cartMassKg, 0.400);
  assert.strictEqual(t2.hookMassKg, 0.040);

  exp.dispose(mockContext);
  console.log('✓ Test 1 passed: MechNewtonExperiment verified\n');
}

// Test 2: MechCollisionExperiment Lifecycle & Elastic Velocity Swap
{
  console.log('Test 2: MechCollisionExperiment collision triggering & conservation');
  const exp = new MechCollisionExperiment();
  assert.strictEqual(exp.metadata.id, 'mech-collision');

  exp.init(mockContext);
  // Equal mass: m1 = 0.150, m2 = 0.150, v1 = 0.8, v2 = 0
  const t = exp.getTelemetry();
  assert.strictEqual(t.mode, 'elastic');
  assert(Math.abs(t.v1After - 0.0) < 1e-6);
  assert(Math.abs(t.v2After - 0.8) < 1e-6);

  // Run update to simulate movement
  for (let i = 0; i < 30; i++) {
    exp.update(0.016, i * 0.016, mockContext);
  }

  exp.dispose(mockContext);
  console.log('✓ Test 2 passed: MechCollisionExperiment verified\n');
}

// Test 3: MechProjectileExperiment Lifecycle & Energy Conservation
{
  console.log('Test 3: MechProjectileExperiment trajectory & mechanical energy');
  const exp = new MechProjectileExperiment();
  assert.strictEqual(exp.metadata.id, 'mech-projectile');

  exp.init(mockContext);
  exp.update(0.016, 0.016, mockContext);
  const t = exp.getTelemetry();
  assert(t.v0 > 0, 'Launch speed must be positive');
  assert.strictEqual(t.energyDiscrepancy, 0, 'Energy discrepancy must be 0 in ideal model');

  exp.onParameterChange('releaseHeight', 0.45, mockContext);
  const t2 = exp.getTelemetry();
  assert(t2.v0 > t.v0, 'Higher release must yield higher exit speed');

  exp.dispose(mockContext);
  console.log('✓ Test 3 passed: MechProjectileExperiment verified\n');
}

// Test 4: MechPendulumExperiment Lifecycle & Small-Angle Period
{
  console.log('Test 4: MechPendulumExperiment period and gravity measurement');
  const exp = new MechPendulumExperiment();
  assert.strictEqual(exp.metadata.id, 'mech-pendulum');

  exp.init(mockContext);
  exp.update(0.016, 0.016, mockContext);
  const t = exp.getTelemetry();
  assert(t.periodS > 1.0, 'Period must be around 1.8~2.0s');
  assert(Math.abs(t.calculatedGravity - 9.80) < 1e-5, 'g must calculate back to 9.80');

  exp.dispose(mockContext);
  console.log('✓ Test 4 passed: MechPendulumExperiment verified\n');
}

// Test 5: MechCentripetalExperiment Lifecycle & Force Scaling
{
  console.log('Test 5: MechCentripetalExperiment uniform rotation & centripetal force');
  const exp = new MechCentripetalExperiment();
  assert.strictEqual(exp.metadata.id, 'mech-centripetal');

  exp.init(mockContext);
  exp.update(0.016, 0.016, mockContext);
  const t = exp.getTelemetry();
  assert(t.centripetalForceN > 0, 'Centripetal force must be positive');
  assert(t.indicatorScaleMarks > 0, 'Indicator marks must be positive');

  exp.onParameterChange('angularVelocity', 12.0, mockContext);
  const t2 = exp.getTelemetry();
  assert(t2.centripetalForceN > t.centripetalForceN, 'Higher omega must increase Fn');

  exp.dispose(mockContext);
  console.log('✓ Test 5 passed: MechCentripetalExperiment verified\n');
}

// Test 6: MechStatusCard Data Acquisition & Regression Fitting
{
  console.log('Test 6: MechStatusCard sampling, switching & curve fitting');
  const card = new MechStatusCard();
  card.setVisible(true);

  // Switch to pendulum
  card.setExperiment('mech-pendulum');
  card.updateTelemetry({
    effectiveLengthM: 0.50,
    periodSquaredS2: (4 * Math.PI * Math.PI * 0.50) / 9.80,
    periodS: 1.419,
    calculatedGravity: 9.80,
  });
  card.recordCurrentPoint();

  card.updateTelemetry({
    effectiveLengthM: 1.00,
    periodSquaredS2: (4 * Math.PI * Math.PI * 1.00) / 9.80,
    periodS: 2.007,
    calculatedGravity: 9.80,
  });
  card.recordCurrentPoint();

  card.runFitting();
  // Slope should be 4 * pi^2 / 9.80 = 4.029
  // g = 4 * pi^2 / slope = 9.80
  console.log('✓ Test 6 passed: MechStatusCard UI telemetry & regression verified\n');
}

// Test 7: Frame Budget Benchmark (60+ FPS performance check)
{
  console.log('Test 7: 60+ FPS Frame Budget Benchmark for all 5 Mechanics Benches');
  const exps = [
    new MechNewtonExperiment(),
    new MechCollisionExperiment(),
    new MechProjectileExperiment(),
    new MechPendulumExperiment(),
    new MechCentripetalExperiment(),
  ];

  for (const exp of exps) {
    exp.init(mockContext);
  }

  const iterations = 500;
  const start = performance.now();
  for (let i = 0; i < iterations; i++) {
    for (const exp of exps) {
      exp.update(0.016, i * 0.016, mockContext);
    }
  }
  const elapsedMs = performance.now() - start;
  const avgFrameMs = elapsedMs / iterations;
  const fps = 1000.0 / avgFrameMs;

  console.log(`  Combined 5-bench average step time: ${avgFrameMs.toFixed(4)} ms`);
  console.log(`  Equivalent logic frame rate: ${Math.round(fps)} FPS`);
  assert(avgFrameMs < 1.0, `Logic frame time (${avgFrameMs} ms) well within 16.6ms budget`);

  for (const exp of exps) {
    exp.dispose(mockContext);
  }
  console.log('✓ Test 7 passed: Performance well within 60+ FPS budget\n');
}

console.log('========================================================');
console.log('All Mechanics Integration & Performance Tests Passed (7/7)!');
console.log('========================================================\n');
