import assert from 'node:assert';
import * as THREE from 'three';
import { HallCarrierParticleSystem } from '../src/scene/em/HallCarrierParticleSystem.ts';
import { HallBenchMesh } from '../src/scene/em/HallBenchMesh.ts';
import OpticsReflectionRefractionExperiment from '../src/experiments/catalog/optics-reflection-refraction/index.ts';
import { ComputeBridge } from '../src/core/platform/ComputeBridge.ts';
import { ReadoutPanel } from '../src/scene/em/labKit.ts';

console.log('=== Starting Boost Multi-Core Compute & Frame Rate Bottleneck Deep Verification ===\n');

// Mock DOM for Node environment
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
  const createMockEl = (tag = 'div'): any => ({
    tagName: tag.toUpperCase(),
    width: 512,
    height: 512,
    setAttribute: () => {},
    getAttribute: () => null,
    style: {},
    appendChild: (c: any) => c,
    addEventListener: () => {},
    removeEventListener: () => {},
    classList: { add: () => {}, remove: () => {}, toggle: () => {}, contains: () => false },
    getContext: () => ({
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 1,
      font: '',
      textAlign: '',
      textBaseline: '',
      fillRect: () => {},
      strokeRect: () => {},
      clearRect: () => {},
      fillText: () => {},
      beginPath: () => {},
      moveTo: () => {},
      lineTo: () => {},
      stroke: () => {},
      fill: () => {},
      arc: () => {},
      save: () => {},
      restore: () => {},
      translate: () => {},
      rotate: () => {},
      createRadialGradient: () => ({ addColorStop: () => {} }),
      createLinearGradient: () => ({ addColorStop: () => {} }),
      getImageData: () => ({ data: new Uint8ClampedArray(512 * 512 * 4) }),
      putImageData: () => {},
      drawImage: () => {},
    }),
    querySelector: () => createMockEl(),
    querySelectorAll: () => [],
  });

  (globalThis as any).document = {
    addEventListener: () => {},
    removeEventListener: () => {},
    createElement: (tag: string) => createMockEl(tag),
    body: createMockEl('body'),
    querySelector: () => createMockEl(),
    querySelectorAll: () => [],
  };
}

// ---------------------------------------------------------------------------
// Test 1: HallCarrierParticleSystem Worker Simulation & Metric Invariants
// ---------------------------------------------------------------------------
console.log('Test 1: HallCarrierParticleSystem Worker Simulation & Metric Invariants');
{
  let hallWorkerCalled = 0;
  const mockWorkerPool = {
    execute: async (req: any) => {
      if (req.action === 'HALL_CARRIER_STEP') {
        hallWorkerCalled++;
        return {
          id: req.id,
          action: 'HALL_CARRIER_STEP',
          positions: req.positions,
          baseOffsetsY: req.baseOffsetsY,
          computeTimeMs: 0.125,
        };
      }
      throw new Error(`Unexpected action: ${req.action}`);
    },
  } as any;

  const bridge = new ComputeBridge(mockWorkerPool);

  // When computeBridge is passed in options, useWorkerSimulation must default to true
  const particleSys = new HallCarrierParticleSystem({
    waferLength: 0.32,
    waferHeight: 0.125,
    waferThickness: 0.032,
    particleCount: 180,
    computeBridge: bridge,
  });

  assert.strictEqual(particleSys.useWorkerSimulation, true, 'useWorkerSimulation must be true when computeBridge is provided');

  // Trigger frame update
  particleSys.update(0.016);
  await new Promise((r) => setTimeout(r, 10));

  assert.ok(hallWorkerCalled >= 1, `Worker must be invoked for hall simulation (called ${hallWorkerCalled} times)`);
  assert.ok(bridge.currentMetrics.avgComputeTimeMs > 0, `avgComputeTimeMs must be > 0 (got ${bridge.currentMetrics.avgComputeTimeMs} ms)`);

  // Verify HallBenchMesh propagation
  const bench = new HallBenchMesh({ computeBridge: bridge });
  assert.strictEqual(bench.particleSystem.useWorkerSimulation, true, 'HallBenchMesh must pass computeBridge and enable worker simulation');

  bench.dispose();
  particleSys.dispose();
  console.log('✓ Test 1 passed: Hall Carrier worker offloading and multi-core telemetry verified\n');
}

// ---------------------------------------------------------------------------
// Test 2: Seamless Fallback Invariants When ComputeBridge Is Not Provided
// ---------------------------------------------------------------------------
console.log('Test 2: Seamless Fallback Invariants When ComputeBridge Is Not Provided');
{
  // Hall carrier fallback
  const hallNoBridge = new HallCarrierParticleSystem();
  assert.strictEqual(hallNoBridge.useWorkerSimulation, false, 'useWorkerSimulation must be false when no bridge is provided');
  hallNoBridge.update(0.016);
  hallNoBridge.dispose();

  // Optics reflection & refraction fallback
  const expReflectNoBridge = new OpticsReflectionRefractionExperiment();
  const emptyContext: any = { scene: new THREE.Scene() };
  expReflectNoBridge.init(emptyContext);
  expReflectNoBridge.update(0.016, 0.016, emptyContext);
  expReflectNoBridge.dispose(emptyContext);

  console.log('✓ Test 2 passed: Zero-dependency fallback when workers are absent verified\n');
}

// ---------------------------------------------------------------------------
// Test 3: ReadoutPanel Canvas Zero-Overhead Invariant When Invisible
// ---------------------------------------------------------------------------
console.log('Test 3: ReadoutPanel Canvas Zero-Overhead Invariant When Invisible');
{
  let fillRectCalls = 0;
  const panel = new ReadoutPanel(0.2, 0.08);
  const mockCanvas = (panel as any).canvas;
  mockCanvas.getContext = () => ({
    fillRect: () => { fillRectCalls++; },
    strokeRect: () => {},
    fillText: () => {},
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    font: '',
    textAlign: '',
    textBaseline: '',
  });

  // 1. When panel.mesh.visible is false -> write must NOT touch canvas 2D
  panel.mesh.visible = false;
  fillRectCalls = 0;
  panel.write([{ text: 'Line 1', color: '#fff' }]);
  panel.write([{ text: 'Line 2', color: '#fff' }]);
  assert.strictEqual(fillRectCalls, 0, 'Invisible ReadoutPanel must skip all canvas 2D draws');

  // 2. When panel.mesh.visible is set to true -> write must redraw canvas
  panel.mesh.visible = true;
  panel.write([{ text: 'Line 3', color: '#fff' }]);
  assert.ok(fillRectCalls > 0, 'Visible ReadoutPanel must draw canvas');

  // 3. Repeated write with identical text -> skips redraw (caching)
  const prevDraws = fillRectCalls;
  panel.write([{ text: 'Line 3', color: '#fff' }]);
  assert.strictEqual(fillRectCalls, prevDraws, 'Calling with identical lines must skip redraw');

  console.log('✓ Test 3 passed: ReadoutPanel canvas zero-overhead when invisible verified\n');
}

console.log('========================================================');
console.log('All Boost Multi-Core Fix Tests Passed Successfully (3/3)!');
console.log('========================================================\n');
