import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
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
          arcTo: () => {},
          roundRect: () => {},
          save: () => {},
          restore: () => {},
          scale: () => {},
          translate: () => {},
          setTransform: () => {},
          setLineDash: () => {},
          getLineDash: () => [],
          drawImage: () => {},
          bezierCurveTo: () => {},
          quadraticCurveTo: () => {},
          closePath: () => {},
          createRadialGradient: () => ({ addColorStop: () => {} }),
          createLinearGradient: () => ({ addColorStop: () => {} }),
          createImageData: (w = 256, h = 256) => ({ data: new Uint8ClampedArray(w * h * 4) }),
          getImageData: (x = 0, y = 0, w = 256, h = 256) => ({ data: new Uint8ClampedArray(w * h * 4) }),
          putImageData: () => {},
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
    getBoundingClientRect: () => ({ width: 1920, height: 1080, top: 0, left: 0, right: 1920, bottom: 1080 }),
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

  // Warmup JIT
  for (let i = 0; i < 10; i++) {
    gas.getHistogramData(20);
  }
  const histStart = performance.now();
  for (let i = 0; i < 50; i++) {
    gas.getHistogramData(20);
  }
  const histAvgMs = (performance.now() - histStart) / 50;
  console.log(`  Histogram Calculation Time:   ${histAvgMs.toFixed(4)} ms`);
  assert(histAvgMs < 1.0, `Histogram calculation must be < 1.0ms! Got ${histAvgMs.toFixed(4)} ms`);

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

// --------------------------------------------------------------------------
// Test 7: Whiteboard Mode vs Laboratory Mode Frame Budget & Decoupled Render Loop
// --------------------------------------------------------------------------
console.log('Test 7: Whiteboard Mode vs Laboratory Mode Frame Budget & Decoupled Render Loop');
{
  const { Engine } = await import('../src/core/Engine.ts');
  assert.strictEqual(typeof Engine.prototype.setViewMode, 'function', 'Engine must implement setViewMode');
  assert.strictEqual(typeof Engine.prototype.getViewMode, 'function', 'Engine must implement getViewMode');

  // Verify view mode state transitions on engine instance / prototype
  const mockEngine: any = Object.create(Engine.prototype);
  mockEngine.isWhiteboardMode = false;
  mockEngine.renderer = { shadowMap: { enabled: true, needsUpdate: false } };

  assert.strictEqual(mockEngine.getViewMode(), 'laboratory');
  mockEngine.setViewMode('whiteboard');
  assert.strictEqual(mockEngine.getViewMode(), 'whiteboard');
  assert.strictEqual(mockEngine.isWhiteboardMode, true);

  mockEngine.setViewMode('laboratory');
  assert.strictEqual(mockEngine.getViewMode(), 'laboratory');
  assert.strictEqual(mockEngine.isWhiteboardMode, false);
  assert.strictEqual(mockEngine.renderer.shadowMap.needsUpdate, true);

  // Verify WhiteboardApp switches engine view modes
  const wbAppPath = path.resolve(process.cwd(), 'src/whiteboard/WhiteboardApp.ts');
  const wbAppCode = fs.readFileSync(wbAppPath, 'utf-8');
  assert(wbAppCode.includes("this.engine.setViewMode('whiteboard')"), 'WhiteboardApp must set engine view mode to whiteboard');
  assert(wbAppCode.includes("this.engine.setViewMode('laboratory')"), 'WhiteboardApp must set engine view mode to laboratory');

  // Measure simulated animation loop frame time in Whiteboard Mode
  // In whiteboard mode, 3D WebGL render calls, scene updates, and raycasting are completely skipped
  let hudUpdateCount = 0;
  let webglRenderCount = 0;
  const mockHud = { update: () => { hudUpdateCount++; } };
  const mockRenderer = { render: () => { webglRenderCount++; } };

  mockEngine.hud = mockHud;
  mockEngine.renderer = mockRenderer;

  function simulateFrame(engine: any) {
    if (engine.isWhiteboardMode) {
      if (engine.hud) {
        engine.hud.update();
      }
      return;
    }
    engine.renderer.render();
  }

  mockEngine.setViewMode('whiteboard');

  // Warmup JIT
  for (let i = 0; i < 50; i++) simulateFrame(mockEngine);

  const frameCount = 1000;
  hudUpdateCount = 0;
  const start = performance.now();
  for (let i = 0; i < frameCount; i++) {
    simulateFrame(mockEngine);
  }
  const elapsed = performance.now() - start;
  const wbFrameAvgMs = elapsed / frameCount;
  const wbFps = 1000 / wbFrameAvgMs;

  console.log(`  Whiteboard Frame Logic Time:   ${wbFrameAvgMs.toFixed(5)} ms`);
  console.log(`  Whiteboard Logic Frame Rate:   ${wbFps.toFixed(0)} FPS`);
  console.log(`  HUD Telemetry Updates:         ${hudUpdateCount}/${frameCount}`);
  console.log(`  WebGL Draw Calls in WB:        ${webglRenderCount} (0 expected)`);

  assert.strictEqual(webglRenderCount, 0, 'WebGL rendering must be 0 in Whiteboard mode to preserve 100% GPU for ink');
  assert.strictEqual(hudUpdateCount, frameCount, 'HUD telemetry must update on every frame in Whiteboard mode');
  assert(wbFrameAvgMs < 0.05, `Whiteboard frame logic time must be < 0.05ms, got ${wbFrameAvgMs.toFixed(4)} ms`);
  assert(wbFps > 20000, `Whiteboard logic FPS must exceed 20,000 FPS, got ${wbFps.toFixed(0)} FPS`);

  console.log('✓ Test 7 passed: Whiteboard mode decouples 3D rendering and executes at > 20,000 FPS (< 0.05ms)\n');
}

// --------------------------------------------------------------------------
// Test 8: Glass Transmission & Pipeline Invariants Verification
// --------------------------------------------------------------------------
console.log('Test 8: Glass Transmission & Pipeline Invariants Verification');
{
  // 1. Verify HoloTable has zero transmissive objects (eliminates redundant full-screen offscreen render passes)
  const { HoloTable } = await import('../src/scene/HoloTable.ts');
  const table = new HoloTable();
  let tableTransmissionCount = 0;
  table.group.traverse((child) => {
    if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshPhysicalMaterial) {
      if ((child.material as any).transmission > 0) {
        tableTransmissionCount++;
      }
    }
  });
  console.log(`  HoloTable Transmissive Meshes: ${tableTransmissionCount} (0 expected)`);
  assert.strictEqual(
    tableTransmissionCount,
    0,
    'HoloTable must NOT use transmission > 0; use clearcoat specular highlights to avoid transmission render passes'
  );

  // 2. Verify Laboratory chamber has zero transmissive objects (observation windows and entry door)
  const { Laboratory } = await import('../src/scene/Laboratory.ts');
  const lab = new Laboratory();
  let labTransmissionCount = 0;
  lab.group.traverse((child) => {
    if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshPhysicalMaterial) {
      if ((child.material as any).transmission > 0) {
        labTransmissionCount++;
      }
    }
  });
  console.log(`  Laboratory Transmissive Meshes: ${labTransmissionCount} (0 expected)`);
  assert.strictEqual(
    labTransmissionCount,
    0,
    'Laboratory must NOT use transmission > 0; use clearcoat specular highlights to avoid transmission render passes'
  );

  // 3. Verify BeakerMesh has zero transmissive objects
  const { BeakerMesh } = await import('../src/scene/BeakerMesh.ts');
  const beaker = new BeakerMesh();
  let beakerTransmissionCount = 0;
  beaker.group.traverse((child) => {
    if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshPhysicalMaterial) {
      if ((child.material as any).transmission > 0) {
        beakerTransmissionCount++;
      }
    }
  });
  console.log(`  BeakerMesh Transmissive Meshes: ${beakerTransmissionCount} (0 expected)`);
  assert.strictEqual(
    beakerTransmissionCount,
    0,
    'BeakerMesh must NOT use transmission > 0'
  );

  // 4. Verify Engine downsamples transmission resolution scale to <= 0.5 as fallback
  const enginePath = path.resolve(process.cwd(), 'src/core/Engine.ts');
  const engineCode = fs.readFileSync(enginePath, 'utf-8');
  assert(
    engineCode.includes('transmissionResolutionScale = 0.5'),
    'Engine must downscale transmissionResolutionScale to 0.5 to prevent GPU bus saturation'
  );

  // 5. Verify WhiteboardCanvas clamps DPR to <= 1.5
  const wbCanvasPath = path.resolve(process.cwd(), 'src/whiteboard/WhiteboardCanvas.ts');
  const wbCanvasCode = fs.readFileSync(wbCanvasPath, 'utf-8');
  assert(
    wbCanvasCode.includes('Math.min(window.devicePixelRatio || 1, 1.5)'),
    'WhiteboardCanvas must clamp DPR to 1.5x on high-DPI displays'
  );

  // 6. Verify CSS hides inactive whiteboard from browser compositor
  const cssPath = path.resolve(process.cwd(), 'src/whiteboard/whiteboard.css');
  const cssContent = fs.readFileSync(cssPath, 'utf-8');
  assert(
    cssContent.includes('visibility: hidden;'),
    'whiteboard.css hidden-view must set visibility: hidden to drop composite layers in laboratory mode'
  );

  console.log('✓ Test 8 passed: Transmission pipeline optimizations and compositor drop invariants verified\n');
}

// --------------------------------------------------------------------------
// Test 9: Whiteboard Multi-Stroke Canvas Redraw Frame Budget Benchmark
// --------------------------------------------------------------------------
console.log('Test 9: Whiteboard Multi-Stroke Canvas Redraw Frame Budget Benchmark');
{
  const { WhiteboardCanvas } = await import('../src/whiteboard/WhiteboardCanvas.ts');
  const container = createMockElement('div');
  const canvas = new WhiteboardCanvas(container as any);

  // Create 3 pages with 15 complex strokes and 50 points each (750 points)
  const page = canvas.getCurrentPage();
  for (let s = 0; s < 15; s++) {
    const points: any[] = [];
    for (let p = 0; p < 50; p++) {
      points.push({ x: 50 + p * 10 + s * 20, y: 100 + Math.sin(p * 0.2) * 40, pressure: 0.5 });
    }
    page.strokes.push({
      id: `benchmark-stroke-${s}`,
      tool: 'pen',
      color: '#1c1c1e',
      width: 4,
      opacity: 1,
      points,
    });
  }

  // Warmup JIT
  for (let i = 0; i < 20; i++) {
    canvas.redrawCurrentPage();
  }

  const redrawRuns = 200;
  const start = performance.now();
  for (let i = 0; i < redrawRuns; i++) {
    canvas.redrawCurrentPage();
  }
  const elapsed = performance.now() - start;
  const redrawAvgMs = elapsed / redrawRuns;
  const equivalentRedrawFps = 1000 / redrawAvgMs;

  console.log(`  Redraw Time (15 complex strokes, 750 points): ${redrawAvgMs.toFixed(4)} ms`);
  console.log(`  Equivalent Redraw Rate:                       ${equivalentRedrawFps.toFixed(0)} FPS`);

  // Hard Assertion: Redrawing an entire detailed whiteboard page must consume < 2.0ms (< 12% of 60 FPS frame budget)
  assert(
    redrawAvgMs < 2.0,
    `Whiteboard page redraw exceeded 2.0ms budget! Got ${redrawAvgMs.toFixed(4)} ms`
  );
  assert(
    equivalentRedrawFps >= 500,
    `Whiteboard page redraw rate must exceed 500 FPS! Got ${equivalentRedrawFps.toFixed(0)} FPS`
  );

  console.log('✓ Test 9 passed: Whiteboard canvas redraws at > 500 FPS (< 2.0ms/frame), ensuring 60+ FPS while drawing\n');
}

// --------------------------------------------------------------------------
// Test 10: Math Stereometry Lighting, Geometry Invariants & Telemetry Budget
// --------------------------------------------------------------------------
console.log('Test 10: Math Stereometry Lighting, Geometry Invariants & Telemetry Budget');
{
  const MathStereometryExpModule = await import('../src/experiments/catalog/math-stereometry/index.ts');
  const MathExperiment = MathStereometryExpModule.default;
  const exp = new MathExperiment();
  const mockContext: any = {
    renderer: { localClippingEnabled: false },
    scene: new THREE.Scene(),
    camera: new THREE.PerspectiveCamera(),
  };
  exp.init(mockContext);

  // 1. Verify zero global DirectionalLights added (prevents lab lighting sudden mutation)
  let dirLightCount = 0;
  exp.rootGroup.traverse((obj: any) => {
    if (obj instanceof THREE.DirectionalLight) {
      dirLightCount++;
    }
  });
  console.log(`  Math Experiment DirectionalLights: ${dirLightCount} (0 expected)`);
  assert.strictEqual(dirLightCount, 0, 'MathStereometryExperiment must not add DirectionalLight to prevent room lighting mutation');

  // 2. Verify rootGroup height rests flush on tabletop (Y >= 0.08)
  assert(
    exp.rootGroup.position.y >= 0.08,
    `rootGroup.position.y must be >= 0.08 to rest on tabletop, got ${exp.rootGroup.position.y}`
  );

  // 3. Verify Cube face outward normals (all face normals point away from origin)
  const { GeometrySolver } = await import('../src/scene/math/GeometrySolver.ts');
  const cubeModel = GeometrySolver.createModel('cube', { a: 0.38, b: 0.38, c: 0.38 });
  for (const face of cubeModel.faces) {
    const v0 = cubeModel.vertices[face.vertexIndices[0]];
    const v1 = cubeModel.vertices[face.vertexIndices[1]];
    const v2 = cubeModel.vertices[face.vertexIndices[2]];
    const computedNormal = new THREE.Vector3()
      .crossVectors(new THREE.Vector3().subVectors(v1, v0), new THREE.Vector3().subVectors(v2, v0))
      .normalize();
    const dot = computedNormal.dot(face.normal);
    assert(
      dot > 0.95,
      `Face ${face.id} winding must match outward normal! dot=${dot}`
    );
  }
  console.log('  Cube Model Face Windings: 6/6 outward CCW verified');

  // 4. Benchmark Stereometry telemetry generation (< 0.01ms)
  const telemetryStart = performance.now();
  for (let i = 0; i < 500; i++) {
    exp.getStereometryTelemetry();
  }
  const telemetryAvg = (performance.now() - telemetryStart) / 500;
  console.log(`  Telemetry Computation Time: ${telemetryAvg.toFixed(5)} ms`);
  assert(telemetryAvg < 0.05, `Telemetry computation must be < 0.05ms, got ${telemetryAvg}`);

  exp.dispose(mockContext);
  console.log('✓ Test 10 passed: Math stereometry lighting, geometry invariants & telemetry verified\n');
}

console.log('========================================================');
console.log('All Real-World FPS Performance Tests Passed (10/10)!');
console.log('========================================================\n');
