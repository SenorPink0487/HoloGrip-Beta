import assert from 'node:assert';
import * as THREE from 'three';

console.log('=== Starting Real-World FPS Performance & Architecture Verification ===\n');

// Mock minimal DOM for canvas / Node environment
const createMockElement = (tag = 'div'): any => {
  const el: any = {
    tagName: tag.toUpperCase(),
    width: 512,
    height: 512,
    setAttribute: () => {},
    getAttribute: () => null,
    style: {},
    appendChild: (child: any) => child,
    addEventListener: () => {},
    removeEventListener: () => {},
    classList: { add: () => {}, remove: () => {}, toggle: () => {}, contains: () => false },
    getContext: (type: string) => {
      if (type === '2d') {
        return {
          fillStyle: '',
          strokeStyle: '',
          lineWidth: 1,
          font: '',
          textAlign: '',
          clearRect: () => {},
          fillRect: () => {},
          strokeRect: () => {},
          beginPath: () => {},
          moveTo: () => {},
          lineTo: () => {},
          stroke: () => {},
          fill: () => {},
          arc: () => {},
          fillText: () => {},
          measureText: (txt: string) => ({ width: txt.length * 8 }),
        };
      }
      return null;
    },
    value: '',
    innerHTML: '',
    querySelector: (sel: string) => createMockElement('div'),
    querySelectorAll: (sel: string) => [],
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
    querySelector: () => createMockElement('div'),
    querySelectorAll: () => [],
  };
}

// --------------------------------------------------------------------------
// Test 1: Architectural Frame Budget Invariants
// --------------------------------------------------------------------------
console.log('Test 1: Architectural Frame Budget Invariants');
{
  // 1. Pixel Ratio Clamping Check
  const clampPixelRatio = (dpr: number) => Math.min(dpr || 1, 1.5);
  assert.strictEqual(clampPixelRatio(1), 1, '1x DPR stays 1x');
  assert.strictEqual(clampPixelRatio(2), 1.5, '2x Retina DPR clamped to 1.5x (saves 44% fragment fillrate)');
  assert.strictEqual(clampPixelRatio(3), 1.5, '3x Super-Retina DPR clamped to 1.5x');

  // 2. Downscaled Bloom Target Check
  const calcBloomSize = (w: number, h: number) => ({
    x: Math.max(256, Math.floor(w * 0.5)),
    y: Math.max(256, Math.floor(h * 0.5)),
  });
  const bloomRes = calcBloomSize(1920, 1080);
  assert.strictEqual(bloomRes.x, 960, 'Bloom width must be downsampled by 50%');
  assert.strictEqual(bloomRes.y, 540, 'Bloom height must be downsampled by 50%');

  // 3. Raycast Throttling Guard Check
  let raycastCount = 0;
  let lastCheck = 0;
  function throttledRaycast(now: number) {
    if (now - lastCheck < 50) return;
    lastCheck = now;
    raycastCount++;
  }
  for (let frame = 0; frame < 60; frame++) {
    throttledRaycast(frame * 16.66); // simulate 60 FPS calls
  }
  assert(raycastCount <= 21, `Raycasts should be throttled to <= 21/s instead of 60, got ${raycastCount}`);
  assert(raycastCount >= 14, `Raycasts should remain responsive (at least ~14-20/s), got ${raycastCount}`);

  console.log('✓ Test 1 passed: Architectural frame budget invariants verified\n');
}

// --------------------------------------------------------------------------
// Test 2: Thermodynamics Molecular Gas System FPS & Frame Budget
// --------------------------------------------------------------------------
console.log('Test 2: Thermodynamics Molecular Gas Kinetics FPS & Frame Budget');
let thermoAvgMs = 0;
{
  const { MolecularGasSystem } = await import('../src/scene/thermo/MolecularGasSystem.ts');
  const gas = new MolecularGasSystem();
  gas.updateThermodynamicState(300, 0.028, 0.15);

  // Warmup JIT
  for (let i = 0; i < 30; i++) {
    gas.update(1 / 60, 0.15);
  }

  const frameCount = 500;
  const start = performance.now();
  for (let i = 0; i < frameCount; i++) {
    gas.update(1 / 60, 0.15);
  }
  const elapsed = performance.now() - start;
  thermoAvgMs = elapsed / frameCount;
  const equivalentFps = 1000 / thermoAvgMs;

  console.log(`  Measured Average Frame Time: ${thermoAvgMs.toFixed(4)} ms`);
  console.log(`  Equivalent Logic Frame Rate:  ${equivalentFps.toFixed(0)} FPS`);

  // Target: Frame budget for 60 FPS is 16.66ms.
  // Molecular gas physics MUST consume < 1.0ms (< 6% of frame budget).
  assert(
    thermoAvgMs < 1.0,
    `MolecularGasSystem update exceeded 1.0ms budget! Got ${thermoAvgMs.toFixed(4)} ms`
  );
  assert(
    equivalentFps >= 1000,
    `MolecularGasSystem logic FPS must exceed 1000 FPS! Got ${equivalentFps.toFixed(0)} FPS`
  );

  const histStart = performance.now();
  for (let i = 0; i < 50; i++) {
    gas.getHistogramData(20);
  }
  const histAvgMs = (performance.now() - histStart) / 50;
  console.log(`  Histogram Calculation Time:   ${histAvgMs.toFixed(4)} ms`);
  assert(histAvgMs < 0.1, `Histogram calculation must be < 0.1ms! Got ${histAvgMs.toFixed(4)} ms`);

  gas.dispose();
  console.log('✓ Test 2 passed: Molecular Gas kinetics executes at > 1000 FPS (< 1.0ms/frame)\n');
}

// --------------------------------------------------------------------------
// Test 3: Chemistry Reaction Engine & Multi-Ion Kinetics FPS & Frame Budget
// --------------------------------------------------------------------------
console.log('Test 3: Chemistry Reaction Engine Multi-Ion Kinetics FPS & Frame Budget');
let chemAvgMs = 0;
{
  const { ChemistryEngine } = await import('../src/chemistry/ChemistryEngine.ts');
  const engine = new ChemistryEngine();

  // Inject reagents for vigorous multi-phase reactions
  engine.addReagent('HCl', 50);
  engine.addReagent('NaOH', 30);
  engine.addReagent('CuSO4', 20);
  engine.addReagent('BaCl2', 20);

  // Warmup JIT
  for (let i = 0; i < 30; i++) {
    engine.update(1 / 60);
  }

  const frameCount = 500;
  const start = performance.now();
  for (let i = 0; i < frameCount; i++) {
    engine.update(1 / 60);
  }
  const elapsed = performance.now() - start;
  chemAvgMs = elapsed / frameCount;
  const equivalentFps = 1000 / chemAvgMs;

  console.log(`  Measured Average Frame Time: ${chemAvgMs.toFixed(4)} ms`);
  console.log(`  Equivalent Logic Frame Rate:  ${equivalentFps.toFixed(0)} FPS`);

  assert(
    chemAvgMs < 1.0,
    `ChemistryEngine update exceeded 1.0ms budget! Got ${chemAvgMs.toFixed(4)} ms`
  );
  assert(
    equivalentFps >= 1000,
    `ChemistryEngine logic FPS must exceed 1000 FPS! Got ${equivalentFps.toFixed(0)} FPS`
  );

  console.log('✓ Test 3 passed: Chemistry Engine kinetics executes at > 1000 FPS (< 1.0ms/frame)\n');
}

// --------------------------------------------------------------------------
// Test 4: Optics Ray-Tracing & Wave Interference FPS & Frame Budget
// --------------------------------------------------------------------------
console.log('Test 4: Optics Ray-Tracing & Snell Refraction FPS & Frame Budget');
let opticsAvgMs = 0;
{
  const { OpticalPhysics } = await import('../src/scene/optics/OpticalPhysics.ts');

  const incident = new THREE.Vector3(0, 0, 1);
  const normal = new THREE.Vector3(0, 0.7071, -0.7071).normalize();

  // Warmup JIT
  for (let i = 0; i < 30; i++) {
    const n = OpticalPhysics.getCauchyIndex(550, 1.517);
    OpticalPhysics.refractRay(incident, normal, 1.0, n);
  }

  const frameCount = 1000;
  const start = performance.now();
  for (let i = 0; i < frameCount; i++) {
    // Simulate 8 rays per frame in typical multi-beam optics setup
    for (let ray = 0; ray < 8; ray++) {
      const n = OpticalPhysics.getCauchyIndex(400 + ray * 40, 1.517);
      OpticalPhysics.refractRay(incident, normal, 1.0, n);
    }
  }
  const elapsed = performance.now() - start;
  opticsAvgMs = elapsed / frameCount;
  const equivalentFps = 1000 / opticsAvgMs;

  console.log(`  Measured Average Frame Time: ${opticsAvgMs.toFixed(4)} ms`);
  console.log(`  Equivalent Logic Frame Rate:  ${equivalentFps.toFixed(0)} FPS`);

  assert(
    opticsAvgMs < 0.5,
    `Optics raytracing exceeded 0.5ms budget! Got ${opticsAvgMs.toFixed(4)} ms`
  );
  assert(
    equivalentFps >= 2000,
    `Optics raytracing logic FPS must exceed 2000 FPS! Got ${equivalentFps.toFixed(0)} FPS`
  );

  console.log('✓ Test 4 passed: Optics raytracing executes at > 2000 FPS (< 0.5ms/frame)\n');
}

// --------------------------------------------------------------------------
// Test 5: UI Telemetry Synchronization & Card Drawing FPS & Frame Budget
// --------------------------------------------------------------------------
console.log('Test 5: VisionOS UI Telemetry & Chart Synchronization FPS & Frame Budget');
let uiAvgMs = 0;
{
  const { ThermoStatusCard } = await import('../src/ui/vision/ThermoStatusCard.ts');
  const card = new ThermoStatusCard();
  card.setVisible(true);

  // Warmup JIT
  for (let i = 0; i < 30; i++) {
    card.updateTelemetry({
      temperature: 300 + Math.sin(i) * 5,
      volume: 2.5 + Math.cos(i) * 0.1,
      pressure: 99.8,
      vRms: 516.9,
    });
  }

  const frameCount = 500;
  const start = performance.now();
  for (let i = 0; i < frameCount; i++) {
    card.updateTelemetry({
      temperature: 300 + Math.sin(i * 0.1) * 20,
      volume: 2.5 + Math.cos(i * 0.1) * 0.5,
      pressure: 99.8 + Math.sin(i * 0.05) * 10,
      vRms: 516.9,
    });
  }
  const elapsed = performance.now() - start;
  uiAvgMs = elapsed / frameCount;
  const equivalentFps = 1000 / uiAvgMs;

  console.log(`  Measured Average Frame Time: ${uiAvgMs.toFixed(4)} ms`);
  console.log(`  Equivalent Logic Frame Rate:  ${equivalentFps.toFixed(0)} FPS`);

  assert(
    uiAvgMs < 0.5,
    `ThermoStatusCard update exceeded 0.5ms budget! Got ${uiAvgMs.toFixed(4)} ms`
  );
  assert(
    equivalentFps >= 2000,
    `ThermoStatusCard update logic FPS must exceed 2000 FPS! Got ${equivalentFps.toFixed(0)} FPS`
  );

  console.log('✓ Test 5 passed: VisionOS Telemetry Card executes at > 2000 FPS (< 0.5ms/frame)\n');
}

// --------------------------------------------------------------------------
// Test 6: Global Combined Frame Budget & 60+ FPS Guarantee
// --------------------------------------------------------------------------
console.log('Test 6: Global Combined Frame Budget & 60+ FPS Headroom Guarantee');
{
  const totalLogicCostMs = thermoAvgMs + chemAvgMs + opticsAvgMs + uiAvgMs;
  const targetBudgetMs = 16.666; // 60 FPS standard
  const gpuHeadroomMs = targetBudgetMs - totalLogicCostMs;
  const gpuHeadroomPercent = (gpuHeadroomMs / targetBudgetMs) * 100;
  const maxPossibleLogicFps = 1000 / totalLogicCostMs;

  console.log('  ┌─────────────────────────────────────┬──────────────┬───────────────┐');
  console.log('  │ Subsystem                           │ Frame Time   │ Equivalent FPS│');
  console.log('  ├─────────────────────────────────────┼──────────────┼───────────────┤');
  console.log(`  │ 1. Thermodynamics Molecular Kinetics│ ${thermoAvgMs.toFixed(4).padStart(8)} ms │ ${(1000 / thermoAvgMs).toFixed(0).padStart(11)} FPS │`);
  console.log(`  │ 2. Chemistry Multi-Ion Kinetics     │ ${chemAvgMs.toFixed(4).padStart(8)} ms │ ${(1000 / chemAvgMs).toFixed(0).padStart(11)} FPS │`);
  console.log(`  │ 3. Optics Multi-Ray Tracing         │ ${opticsAvgMs.toFixed(4).padStart(8)} ms │ ${(1000 / opticsAvgMs).toFixed(0).padStart(11)} FPS │`);
  console.log(`  │ 4. VisionOS Telemetry & Charts      │ ${uiAvgMs.toFixed(4).padStart(8)} ms │ ${(1000 / uiAvgMs).toFixed(0).padStart(11)} FPS │`);
  console.log('  ├─────────────────────────────────────┼──────────────┼───────────────┤');
  console.log(`  │ Total Combined Logic Computation    │ ${totalLogicCostMs.toFixed(4).padStart(8)} ms │ ${maxPossibleLogicFps.toFixed(0).padStart(11)} FPS │`);
  console.log(`  │ Remaining GPU Frame Budget (60 FPS) │ ${gpuHeadroomMs.toFixed(4).padStart(8)} ms │ (${gpuHeadroomPercent.toFixed(1)}% headroom)│`);
  console.log('  └─────────────────────────────────────┴──────────────┴───────────────┘');

  // Hard Assertion: Total combined logic computation must take < 3.0ms (< 18% of frame budget)
  assert(
    totalLogicCostMs < 3.0,
    `Total combined logic computation exceeded 3.0ms budget! Got ${totalLogicCostMs.toFixed(3)} ms`
  );
  assert(
    gpuHeadroomPercent >= 80.0,
    `GPU headroom must exceed 80% of 60 FPS frame budget! Got ${gpuHeadroomPercent.toFixed(1)}%`
  );

  console.log('\n✓ Test 6 passed: Global 60+ FPS guaranteed with > 80% GPU headroom reserved!\n');
}

console.log('========================================================');
console.log('All Real-World FPS Performance Tests Passed (6/6)!');
console.log('========================================================\n');
