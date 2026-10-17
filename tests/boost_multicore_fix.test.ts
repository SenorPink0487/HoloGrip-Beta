import assert from 'node:assert';
import * as THREE from 'three';
import { HallCarrierParticleSystem } from '../src/scene/em/HallCarrierParticleSystem.ts';
import { HallBenchMesh } from '../src/scene/em/HallBenchMesh.ts';
import OpticsPolarizationExperiment from '../src/experiments/catalog/optics-polarization/index.ts';
import OpticsInterferenceExperiment from '../src/experiments/catalog/optics-interference/index.ts';
import OpticsDiffractionExperiment from '../src/experiments/catalog/optics-diffraction/index.ts';
import OpticsLabExperiment from '../src/experiments/catalog/optics-lab/index.ts';
import { DetectorScreenMesh } from '../src/scene/optics/DetectorScreenMesh.ts';
import { OpticalBeamSystem } from '../src/scene/optics/OpticalBeamSystem.ts';
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
// Test 2: OpticsPolarizationExperiment Continuous Worker Wave Simulation
// ---------------------------------------------------------------------------
console.log('Test 2: OpticsPolarizationExperiment Continuous Worker Wave Simulation');
{
  let polWorkerCalls = 0;
  const mockWorkerPool = {
    execute: async (req: any) => {
      if (req.action === 'OPTICAL_POLARIZATION_STEP') {
        polWorkerCalls++;
        return {
          id: req.id,
          action: 'OPTICAL_POLARIZATION_STEP',
          positions: req.positions,
          colors: req.colors,
          malusIntensity: 0.85,
          computeTimeMs: 0.22,
        };
      }
      throw new Error(`Unexpected action: ${req.action}`);
    },
  } as any;

  const bridge = new ComputeBridge(mockWorkerPool);
  const context: any = {
    scene: new THREE.Scene(),
    computeBridge: bridge,
    workerPool: mockWorkerPool,
  };

  const expPol = new OpticsPolarizationExperiment();
  expPol.init(context);

  // Update over multiple frames WITHOUT changing slider angles
  for (let i = 0; i < 5; i++) {
    expPol.update(0.016, i * 0.016, context);
    await new Promise((r) => setTimeout(r, 5));
  }

  assert.ok(polWorkerCalls >= 2, `Continuous 3D wave must offload to worker continuously without slider movement (got ${polWorkerCalls} calls)`);
  assert.ok(bridge.currentMetrics.avgComputeTimeMs > 0, `Multi-core compute metric must be > 0 (got ${bridge.currentMetrics.avgComputeTimeMs} ms)`);

  expPol.dispose(context);
  console.log('✓ Test 2 passed: Optics Polarization continuous worker offloading and active metrics verified\n');
}

// ---------------------------------------------------------------------------
// Test 3: OpticsLabExperiment Continuous Worker Polarization Wave Simulation
// ---------------------------------------------------------------------------
console.log('Test 3: OpticsLabExperiment Continuous Worker Polarization Wave Simulation');
{
  let labPolWorkerCalls = 0;
  const mockWorkerPool = {
    execute: async (req: any) => {
      if (req.action === 'OPTICAL_POLARIZATION_STEP') {
        labPolWorkerCalls++;
        return {
          id: req.id,
          action: 'OPTICAL_POLARIZATION_STEP',
          positions: req.positions,
          colors: req.colors,
          malusIntensity: 0.50,
          computeTimeMs: 0.18,
        };
      }
      return { id: req.id, action: req.action, computeTimeMs: 0.05 };
    },
  } as any;

  const bridge = new ComputeBridge(mockWorkerPool);
  const context: any = {
    scene: new THREE.Scene(),
    computeBridge: bridge,
    workerPool: mockWorkerPool,
  };

  const expLab = new OpticsLabExperiment();
  expLab.init(context);
  expLab.onParameterChange('mode', 'polarization', context);

  // Update across frames
  for (let i = 0; i < 5; i++) {
    expLab.update(0.016, i * 0.016, context);
    await new Promise((r) => setTimeout(r, 5));
  }

  assert.ok(labPolWorkerCalls >= 2, `Optics lab polarization mode must offload wave to worker continuously (got ${labPolWorkerCalls} calls)`);
  assert.ok(bridge.currentMetrics.avgComputeTimeMs > 0, `Multi-core compute metric in optics lab must be > 0 (got ${bridge.currentMetrics.avgComputeTimeMs} ms)`);

  expLab.dispose(context);
  console.log('✓ Test 3 passed: Optics Lab polarization multi-core worker offloading verified\n');
}

// ---------------------------------------------------------------------------
// Test 4: Seamless Fallback Invariants When ComputeBridge Is Not Provided
// ---------------------------------------------------------------------------
console.log('Test 4: Seamless Fallback Invariants When ComputeBridge Is Not Provided');
{
  // Hall carrier fallback
  const hallNoBridge = new HallCarrierParticleSystem();
  assert.strictEqual(hallNoBridge.useWorkerSimulation, false, 'useWorkerSimulation must be false when no bridge is provided');
  hallNoBridge.update(0.016);
  hallNoBridge.dispose();

  // Polarization fallback
  const expPolNoBridge = new OpticsPolarizationExperiment();
  const emptyContext: any = { scene: new THREE.Scene() };
  expPolNoBridge.init(emptyContext);
  expPolNoBridge.update(0.016, 0.016, emptyContext);
  expPolNoBridge.dispose(emptyContext);

  console.log('✓ Test 4 passed: Zero-dependency fallback when workers are absent verified\n');
}

// ---------------------------------------------------------------------------
// Test 5: DetectorScreenMesh Buffer Caching Precision & Sensitivity
// ---------------------------------------------------------------------------
console.log('Test 5: DetectorScreenMesh Buffer Caching Precision & Sensitivity');
{
  let fillRectCalls = 0;
  const mockScreenEl: any = {
    width: 512,
    height: 512,
    getContext: () => ({
      fillStyle: '',
      fillRect: () => { fillRectCalls++; },
      beginPath: () => {},
      arc: () => {},
      fill: () => {},
      createRadialGradient: () => ({ addColorStop: () => {} }),
      createLinearGradient: () => ({ addColorStop: () => {} }),
      drawImage: () => {},
    }),
  };

  const detectorScreen = new DetectorScreenMesh();
  (detectorScreen as any).screenCanvas = mockScreenEl;
  (detectorScreen as any).screenCtx = mockScreenEl.getContext();

  // Helper to generate simulated double-slit diffraction intensity buffers
  function createFringeBuffer(slitDistMm: number, slitWidthMm: number): Float32Array {
    const buf = new Float32Array(512);
    const lambda = 550e-9;
    const L = 1.0;
    const span = 80e-3;
    const d = slitDistMm * 1e-3;
    const a = slitWidthMm * 1e-3;
    for (let i = 0; i < 512; i++) {
      const y = ((i / 511) - 0.5) * span;
      const sinTheta = y / Math.sqrt(y * y + L * L);
      const beta = (Math.PI * a * sinTheta) / lambda;
      const sinc = Math.abs(beta) < 1e-7 ? 1.0 : Math.sin(beta) / beta;
      const alpha = (Math.PI * d * sinTheta) / lambda;
      buf[i] = sinc * sinc * Math.cos(alpha) * Math.cos(alpha);
    }
    return buf;
  }

  const bOriginal = createFringeBuffer(0.250, 0.040);
  fillRectCalls = 0;
  detectorScreen.renderFringesFromBuffer(bOriginal, 550, 1.0);
  assert.ok(fillRectCalls > 0, 'First render must draw fringes on canvas');
  const firstRenderDraws = fillRectCalls;

  // 1. Identical buffer must skip rendering (0 draws)
  fillRectCalls = 0;
  detectorScreen.renderFringesFromBuffer(bOriginal, 550, 1.0);
  assert.strictEqual(fillRectCalls, 0, 'Calling with identical buffer must skip redraw (0 canvas calls)');

  // 2. Subtle slit distance shift (0.001mm change) MUST trigger redraw
  const bDistShifted = createFringeBuffer(0.251, 0.040);
  fillRectCalls = 0;
  detectorScreen.renderFringesFromBuffer(bDistShifted, 550, 1.0);
  assert.ok(fillRectCalls > 0, `Subtle slit distance change (0.001mm) must trigger redraw, got ${fillRectCalls} draws`);

  // 3. Subtle slit width shift (0.001mm change) MUST trigger redraw
  const bWidthShifted = createFringeBuffer(0.250, 0.041);
  fillRectCalls = 0;
  detectorScreen.renderFringesFromBuffer(bWidthShifted, 550, 1.0);
  assert.ok(fillRectCalls > 0, `Subtle slit width change (0.001mm) must trigger redraw, got ${fillRectCalls} draws`);

  detectorScreen.dispose();
  console.log('✓ Test 5 passed: DetectorScreenMesh sensitive buffer hashing and zero-overhead cache verified\n');
}

// ---------------------------------------------------------------------------
// Test 6: DetectorScreenMesh Parameter Fallback & NaN Immunity
// ---------------------------------------------------------------------------
console.log('Test 6: DetectorScreenMesh Parameter Fallback & NaN Immunity');
{
  const detectorScreen = new DetectorScreenMesh();

  // Should not throw or crash when intensity is undefined or NaN
  assert.doesNotThrow(() => {
    detectorScreen.renderFringesPattern({
      mode: 'polarization',
      intensity: undefined as any,
      wavelengthNm: NaN,
    });
  }, 'renderFringesPattern must safely handle undefined intensity and NaN wavelength without throwing');

  assert.doesNotThrow(() => {
    detectorScreen.renderFringesPattern({
      mode: 'double_slit',
      intensity: NaN,
      wavelengthNm: 550,
      slitDistanceMm: 0.25,
      slitWidthMm: 0.04,
      screenDistanceM: 1.0,
    });
  }, 'renderFringesPattern must handle NaN intensity in double_slit mode');

  detectorScreen.dispose();
  console.log('✓ Test 6 passed: Parameter fallbacks and NaN immunity verified\n');
}

// ---------------------------------------------------------------------------
// Test 7: OpticsInterference & OpticsDiffraction Worker Offloading & Display Buffer Protection
// ---------------------------------------------------------------------------
console.log('Test 7: OpticsInterference & OpticsDiffraction Worker Offloading & Display Buffer Protection');
{
  let interWorkerCalls = 0;
  let diffWorkerCalls = 0;
  const mockWorkerPool = {
    execute: async (req: any) => {
      if (req.action === 'OPTICAL_DIFFRACTION_STEP') {
        if (req.slitCount === 2) {
          interWorkerCalls++;
        } else {
          diffWorkerCalls++;
        }
        return {
          id: req.id,
          action: 'OPTICAL_DIFFRACTION_STEP',
          intensityBuffer: req.intensityBuffer,
          computeTimeMs: 0.16,
        };
      }
      return { id: req.id, action: req.action, computeTimeMs: 0.05 };
    },
    size: 4,
  } as any;

  const bridge = new ComputeBridge(mockWorkerPool);
  const context: any = {
    scene: new THREE.Scene(),
    computeBridge: bridge,
    workerPool: mockWorkerPool,
  };

  // 1. Interference Experiment
  const expInter = new OpticsInterferenceExperiment();
  expInter.init(context);

  for (let i = 0; i < 5; i++) {
    expInter.update(0.016, i * 0.016, context);
    await new Promise((r) => setTimeout(r, 5));
  }

  assert.ok(interWorkerCalls >= 2, `Optics interference must offload to worker continuously (got ${interWorkerCalls} calls)`);
  assert.ok(bridge.currentMetrics.avgComputeTimeMs > 0, `Multi-core compute metric must be > 0 (got ${bridge.currentMetrics.avgComputeTimeMs} ms)`);
  assert.strictEqual((expInter as any).displayIntensityBuffer.length, 512, 'Display buffer must remain intact (not detached)');

  expInter.dispose(context);

  // 2. Diffraction Experiment
  const expDiff = new OpticsDiffractionExperiment();
  expDiff.init(context);

  for (let i = 0; i < 5; i++) {
    expDiff.update(0.016, i * 0.016, context);
    await new Promise((r) => setTimeout(r, 5));
  }

  assert.ok(diffWorkerCalls >= 2, `Optics diffraction must offload to worker continuously (got ${diffWorkerCalls} calls)`);
  assert.ok(bridge.currentMetrics.avgComputeTimeMs > 0, 'Multi-core compute metric must remain active');
  assert.strictEqual((expDiff as any).displayBuffer.length, 512, 'Display buffer in diffraction must remain intact');

  expDiff.dispose(context);
  console.log('✓ Test 7 passed: Interference and diffraction continuous worker offloading and buffer protection verified\n');
}

// ---------------------------------------------------------------------------
// Test 8: DynamicDrawUsage Invariants on Optical Wave & Wavefront BufferAttributes
// ---------------------------------------------------------------------------
console.log('Test 8: DynamicDrawUsage Invariants on Optical Wave & Wavefront BufferAttributes');
{
  const beamSystem = new OpticalBeamSystem(550);

  // 1. Double slit wavefronts
  beamSystem.updateDoubleSlitWavefronts(-0.15, 0.25, 0.1, 0.48);
  const wfGeo = (beamSystem as any).wavefrontGeo as THREE.BufferGeometry;
  assert.ok(wfGeo, 'wavefrontGeo must be instantiated');
  assert.strictEqual(
    wfGeo.getAttribute('position').usage,
    THREE.DynamicDrawUsage,
    'Wavefront position BufferAttribute must use DynamicDrawUsage to avoid GPU stalls'
  );
  assert.strictEqual(
    wfGeo.getAttribute('color').usage,
    THREE.DynamicDrawUsage,
    'Wavefront color BufferAttribute must use DynamicDrawUsage'
  );

  // 2. Single slit wavefronts
  beamSystem.clearWavefronts();
  beamSystem.updateSingleSlitWavefronts(-0.15, 0.04, 0.1, 0.48);
  const singleWfGeo = (beamSystem as any).wavefrontGeo as THREE.BufferGeometry;
  assert.strictEqual(
    singleWfGeo.getAttribute('position').usage,
    THREE.DynamicDrawUsage,
    'Single slit wavefront position must use DynamicDrawUsage'
  );

  // 3. Polarization wave vectors
  const dummyPos = new Float32Array(122 * 3);
  const dummyCol = new Float32Array(122 * 3);
  beamSystem.applyPolarizationWaveBuffer(dummyPos, dummyCol);
  const wvGeo = (beamSystem as any).waveVectorGeo as THREE.BufferGeometry;
  assert.ok(wvGeo, 'waveVectorGeo must be instantiated');
  assert.strictEqual(
    wvGeo.getAttribute('position').usage,
    THREE.DynamicDrawUsage,
    'Polarization waveVector position must use DynamicDrawUsage'
  );
  assert.strictEqual(
    wvGeo.getAttribute('color').usage,
    THREE.DynamicDrawUsage,
    'Polarization waveVector color must use DynamicDrawUsage'
  );

  // 4. Diffraction fan geometry & dirty check
  beamSystem.updateDiffractionFan(-0.15, 0.48, 0.045);
  const fanGeo = (beamSystem as any).diffractionFanGeo as THREE.BufferGeometry;
  assert.ok(fanGeo, 'diffractionFanGeo must be instantiated');
  assert.strictEqual(
    fanGeo.getAttribute('position').usage,
    THREE.DynamicDrawUsage,
    'Diffraction fan position must use DynamicDrawUsage'
  );

  // Check version before and after update with identical parameters
  const posAttr = fanGeo.getAttribute('position') as THREE.BufferAttribute;
  const initialVersion = posAttr.version;
  beamSystem.updateDiffractionFan(-0.15, 0.48, 0.045);
  assert.strictEqual(
    posAttr.version,
    initialVersion,
    'Diffraction fan with identical coordinates must skip setting needsUpdate (version stays unchanged)'
  );

  // Update with different coordinates -> version must increment
  beamSystem.updateDiffractionFan(-0.15, 0.55, 0.045);
  assert.ok(
    posAttr.version > initialVersion,
    'Diffraction fan with shifted saddle position must set needsUpdate (version increments)'
  );

  beamSystem.dispose();
  console.log('✓ Test 8 passed: DynamicDrawUsage and dirty-check invariants on all optical wave geometries verified\n');
}

// ---------------------------------------------------------------------------
// Test 9: Rapid Mode Switching in OpticsLab Cross-Mode Visual Guard
// ---------------------------------------------------------------------------
console.log('Test 9: Rapid Mode Switching in OpticsLab Cross-Mode Visual Guard');
{
  let polCalls = 0;
  let dispCalls = 0;
  let diffCalls = 0;

  const mockWorkerPool = {
    execute: async (req: any) => {
      if (req.action === 'OPTICAL_POLARIZATION_STEP') {
        polCalls++;
        await new Promise((r) => setTimeout(r, 10));
        return {
          id: req.id,
          action: req.action,
          positions: req.positions,
          colors: req.colors,
          malusIntensity: 0.50,
          computeTimeMs: 0.20,
        };
      }
      if (req.action === 'OPTICAL_DISPERSION_STEP') {
        dispCalls++;
        await new Promise((r) => setTimeout(r, 10));
        return {
          id: req.id,
          action: req.action,
          rays: [],
          computeTimeMs: 0.15,
        };
      }
      if (req.action === 'OPTICAL_DIFFRACTION_STEP') {
        diffCalls++;
        await new Promise((r) => setTimeout(r, 10));
        return {
          id: req.id,
          action: req.action,
          intensityBuffer: req.intensityBuffer,
          computeTimeMs: 0.18,
        };
      }
      return { id: req.id, action: req.action, computeTimeMs: 0.05 };
    },
    size: 4,
  } as any;

  const bridge = new ComputeBridge(mockWorkerPool);
  const context: any = {
    scene: new THREE.Scene(),
    computeBridge: bridge,
    workerPool: mockWorkerPool,
  };

  const expLab = new OpticsLabExperiment();
  expLab.init(context);

  // Switch to polarization and start frame
  expLab.onParameterChange('mode', 'polarization', context);
  expLab.update(0.016, 0.016, context);

  // Switch to propagation while polarization worker is still in-flight
  expLab.onParameterChange('mode', 'propagation', context);
  expLab.update(0.016, 0.032, context);

  // Switch to interference while propagation worker is in-flight
  expLab.onParameterChange('mode', 'interference', context);
  expLab.update(0.016, 0.048, context);

  // Wait for all in-flight workers to finish
  await new Promise((r) => setTimeout(r, 30));

  // Polarization lines must NOT be visible in interference mode
  const waveVectorGroup = (expLab as any).beamSystem.waveVectorGroup as THREE.Group;
  assert.strictEqual(
    waveVectorGroup.visible,
    false,
    'Polarization wave vectors must remain hidden in interference mode even if in-flight worker finished'
  );

  expLab.dispose(context);
  console.log('✓ Test 9 passed: OpticsLab mode switching isolation and in-flight guard verified\n');
}

// ---------------------------------------------------------------------------
// Test 10: ReadoutPanel Canvas Zero-Overhead Invariant When Invisible
// ---------------------------------------------------------------------------
console.log('Test 10: ReadoutPanel Canvas Zero-Overhead Invariant When Invisible');
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

  console.log('✓ Test 10 passed: ReadoutPanel canvas zero-overhead when invisible verified\n');
}

console.log('========================================================');
console.log('All Boost Multi-Core Fix Tests Passed Successfully (10/10)!');
console.log('========================================================\n');
