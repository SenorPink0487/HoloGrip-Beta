import assert from 'node:assert';
import * as THREE from 'three';
import { OpticalPhysics } from '../src/scene/optics/OpticalPhysics.ts';
import {
  OpticalDiffractionBenchMesh,
  type DiffractionType,
} from '../src/scene/optics/OpticalDiffractionBenchMesh.ts';
import { OpticalDiffractionInteractionManager } from '../src/scene/optics/OpticalDiffractionInteractionManager.ts';
import OpticsDiffractionExperiment from '../src/experiments/catalog/optics-diffraction/index.ts';
import { metadata } from '../src/experiments/catalog/optics-diffraction/meta.ts';
import { PhysicsDisciplineModal } from '../src/ui/vision/PhysicsDisciplineModal.ts';

// Minimal DOM mock for Node.js test environment
const createMockElement = (tag = 'div'): any => {
  let context2d: any = null;
  const el: any = {
    tagName: tag.toUpperCase(),
    id: '',
    className: '',
    innerHTML: '',
    attributes: {} as Record<string, string>,
    children: [] as any[],
    style: {},
    setAttribute: (k: string, v: string) => { el.attributes[k] = v; },
    getAttribute: (k: string) => el.attributes[k] ?? null,
    appendChild: (child: any) => { el.children.push(child); return child; },
    addEventListener: () => {},
    removeEventListener: () => {},
    getContext: (type: string) => {
      if (type === '2d') {
        if (!context2d) {
          context2d = {
            fillStyle: '',
            strokeStyle: '',
            lineWidth: 1,
            font: '',
            textAlign: '',
            textBaseline: '',
            shadowColor: '',
            shadowBlur: 0,
            save: () => {},
            restore: () => {},
            fillRect: () => {},
            strokeRect: () => {},
            clearRect: () => {},
            fillText: () => {},
            strokeText: () => {},
            beginPath: () => {},
            moveTo: () => {},
            lineTo: () => {},
            stroke: () => {},
            fill: () => {},
            arc: () => {},
            setLineDash: () => {},
            createImageData: (w: number, h: number) => ({
              width: w,
              height: h,
              data: new Uint8ClampedArray(w * h * 4),
            }),
            putImageData: () => {},
            createLinearGradient: () => ({
              addColorStop: () => {},
            }),
          };
        }
        return context2d;
      }
      return null;
    },
  };
  return el;
};

if (typeof globalThis.document === 'undefined') {
  (globalThis as any).document = {
    createElement: (tag: string) => createMockElement(tag),
    body: createMockElement('body'),
    pointerLockElement: null,
  };
}
if (typeof globalThis.window === 'undefined') {
  (globalThis as any).window = {
    innerWidth: 1920,
    innerHeight: 1080,
  };
}
if (typeof (globalThis as any).PointerEvent === 'undefined') {
  (globalThis as any).PointerEvent = class PointerEvent extends Event {
    public clientX = 0;
    public clientY = 0;
    public movementX = 0;
    public movementY = 0;
    constructor(type: string, init?: any) {
      super(type);
      if (init) {
        if (init.clientX !== undefined) this.clientX = init.clientX;
        if (init.clientY !== undefined) this.clientY = init.clientY;
        if (init.movementX !== undefined) this.movementX = init.movementX;
        if (init.movementY !== undefined) this.movementY = init.movementY;
      }
    }
  };
}

console.log('=== Starting Light Diffraction Analytical & Integration Tests ===\n');

// -------------------------------------------------------------
// Test 1: Analytical Single-Slit Fraunhofer Diffraction
// -------------------------------------------------------------
{
  console.log('Test 1: Analytical Single-Slit Fraunhofer Diffraction');
  const wlNm = 532.0;
  const aMm = 0.08;
  const LM = 0.50;

  // 1. Center intensity is normalized peak 1.0
  const I0 = OpticalPhysics.calculateSingleSlitIntensity(0, wlNm, aMm, LM);
  assert(Math.abs(I0 - 1.0) < 1e-5, 'Center intensity must be 1.0');

  // 2. Central maximum width Delta x_0 = 2 * lambda * L / a
  const theoryDeltaX0M = (2 * wlNm * 1e-9 * LM) / (aMm * 1e-3);
  const theoryFirstMinM = theoryDeltaX0M * 0.5; // 0.003325m = 3.325mm
  const res = OpticalPhysics.getSingleSlitFringeWidth(wlNm, aMm, LM);
  assert(Math.abs(res.centralWidthMm - theoryDeltaX0M * 1e3) < 1e-4, 'Central fringe width must match theory');
  assert(Math.abs(res.centralWidthMm - 2 * res.secondarySpacingMm) < 1e-5, 'Central width must be exactly 2x secondary spacing');

  // 3. At first minimum x = firstMin, intensity drops to 0
  const I_min1 = OpticalPhysics.calculateSingleSlitIntensity(theoryFirstMinM, wlNm, aMm, LM);
  assert(I_min1 < 1e-4, `Intensity at first minimum must be 0, got ${I_min1}`);

  // 4. Secondary maximum at beta ~ 1.4303 * pi (~4.75mm)
  const secondaryPeakXM = (1.4303 * wlNm * 1e-9 * LM) / (aMm * 1e-3);
  const I_sec = OpticalPhysics.calculateSingleSlitIntensity(secondaryPeakXM, wlNm, aMm, LM);
  assert(Math.abs(I_sec - 0.0472) < 0.005, `Secondary peak intensity should be ~0.0472, got ${I_sec}`);

  // 5. Inversely proportional to slit width a: doubling a halves central width
  const resDoubleA = OpticalPhysics.getSingleSlitFringeWidth(wlNm, aMm * 2, LM);
  assert(Math.abs(resDoubleA.centralWidthMm - res.centralWidthMm * 0.5) < 1e-4, 'Doubling slit width must halve fringe width');

  console.log(`  Central maximum width: ${res.centralWidthMm.toFixed(3)} mm (Theory: ${(theoryDeltaX0M * 1e3).toFixed(3)} mm)`);
  console.log(`  Secondary peak ratio:  ${(I_sec * 100).toFixed(2)}% (Theory: 4.72%)`);
  console.log('✓ Test 1 passed: Single-slit Fraunhofer diffraction analytically validated\n');
}

// -------------------------------------------------------------
// Test 2: Analytical Double-Slit Interference & Diffraction Modulation
// -------------------------------------------------------------
{
  console.log('Test 2: Analytical Double-Slit Interference & Diffraction');
  const wlNm = 532.0;
  const aMm = 0.04;
  const dMm = 0.25;
  const LM = 0.50;

  // 1. Center intensity is 1.0
  const I0 = OpticalPhysics.calculateDoubleSlitIntensity(0, wlNm, aMm, dMm, LM);
  assert(Math.abs(I0 - 1.0) < 1e-5, 'Center intensity must be 1.0');

  // 2. Fringe spacing Delta y = lambda * L / d
  const spacingMm = OpticalPhysics.getDoubleSlitFringeSpacing(wlNm, dMm, LM);
  const theorySpacingM = (wlNm * 1e-9 * LM) / (dMm * 1e-3);
  assert(Math.abs(spacingMm - theorySpacingM * 1e3) < 1e-4, 'Fringe spacing must match formula lambda*L/d');

  // 3. First interference minimum at x = 0.5 * spacing
  const I_interfMin = OpticalPhysics.calculateDoubleSlitIntensity(theorySpacingM * 0.5, wlNm, aMm, dMm, LM);
  assert(I_interfMin < 1e-4, `Intensity at first interference minimum must be 0, got ${I_interfMin}`);

  // 4. First interference peak at x = spacing
  const I_interfPeak1 = OpticalPhysics.calculateDoubleSlitIntensity(theorySpacingM, wlNm, aMm, dMm, LM);
  assert(I_interfPeak1 > 0.85, 'First interference peak must be high intensity');

  console.log(`  Double slit fringe spacing: ${spacingMm.toFixed(3)} mm (Theory: ${(theorySpacingM * 1e3).toFixed(3)} mm)`);
  console.log('✓ Test 2 passed: Double-slit interference and modulation analytically validated\n');
}

// -------------------------------------------------------------
// Test 3: Analytical Circular Aperture Diffraction & Airy Disk
// -------------------------------------------------------------
{
  console.log('Test 3: Analytical Circular Aperture Diffraction & Airy Disk');
  const wlNm = 532.0;
  const DMm = 0.25;
  const LM = 0.50;

  // 1. Center intensity is 1.0
  const I0 = OpticalPhysics.calculateCircularApertureIntensity(0, wlNm, DMm, LM);
  assert(Math.abs(I0 - 1.0) < 1e-4, 'Center intensity of Airy disk must be 1.0');

  // 2. First dark ring radius r1 = 1.22 * lambda * L / D
  const r1Mm = OpticalPhysics.getAiryDiskRadius(wlNm, DMm, LM);
  const theoryR1M = 1.2196696 * (wlNm * 1e-9 * LM) / (DMm * 1e-3);
  assert(Math.abs(r1Mm - theoryR1M * 1e3) < 1e-4, 'Airy disk radius must match 1.22 lambda L / D');

  // 3. Intensity at r1 must be zero (first minimum of J1(v))
  const I_ring1 = OpticalPhysics.calculateCircularApertureIntensity(theoryR1M, wlNm, DMm, LM);
  assert(I_ring1 < 1e-3, `Intensity at Airy disk boundary must be zero, got ${I_ring1}`);

  // 4. First bright ring peak at v ~ 5.136 (r ~ 1.34 * r1) with ~1.75% intensity
  const brightRingRM = (5.136 * wlNm * 1e-9 * LM) / (Math.PI * DMm * 1e-3);
  const I_brightRing = OpticalPhysics.calculateCircularApertureIntensity(brightRingRM, wlNm, DMm, LM);
  assert(Math.abs(I_brightRing - 0.0175) < 0.005, `First bright ring intensity should be ~0.0175, got ${I_brightRing}`);

  console.log(`  Airy disk radius r₁:   ${r1Mm.toFixed(3)} mm (Theory: ${(theoryR1M * 1e3).toFixed(3)} mm)`);
  console.log(`  First bright ring:     ${(I_brightRing * 100).toFixed(2)}% (Theory: 1.75%)`);
  console.log('✓ Test 3 passed: Circular aperture Airy disk analytically validated\n');
}

// -------------------------------------------------------------
// Test 4: Analytical Diffraction Grating Dispersion & Angular Condition
// -------------------------------------------------------------
{
  console.log('Test 4: Analytical Diffraction Grating Dispersion & Angular Condition');
  const N = 300; // lines/mm
  const LM = 0.50;

  // Red (650nm) vs Green (532nm) vs Blue (405nm)
  const redPeaks = OpticalPhysics.getGratingPeakPositions(650, N, LM, 1);
  const greenPeaks = OpticalPhysics.getGratingPeakPositions(532, N, LM, 1);
  const bluePeaks = OpticalPhysics.getGratingPeakPositions(405, N, LM, 1);

  const redOrder1 = redPeaks.find((p) => p.order === 1)!;
  const greenOrder1 = greenPeaks.find((p) => p.order === 1)!;
  const blueOrder1 = bluePeaks.find((p) => p.order === 1)!;

  assert(redOrder1 && greenOrder1 && blueOrder1, 'Order 1 must exist for all wavelengths');
  // Longer wavelength diffracts more: theta_red > theta_green > theta_blue
  assert(redOrder1.angleDeg > greenOrder1.angleDeg, 'Red diffraction angle must exceed green');
  assert(greenOrder1.angleDeg > blueOrder1.angleDeg, 'Green diffraction angle must exceed blue');

  // Check d * sin(theta) = lambda
  const d = 1e-3 / N;
  const sinGreen = Math.sin(THREE.MathUtils.degToRad(greenOrder1.angleDeg));
  assert(Math.abs(d * sinGreen - 532e-9) < 1e-8, 'Grating equation d*sin(theta)=m*lambda must hold');

  console.log(`  Blue 405nm  order 1: ${blueOrder1.angleDeg.toFixed(2)}° (x = ${blueOrder1.xMm.toFixed(1)} mm)`);
  console.log(`  Green 532nm order 1: ${greenOrder1.angleDeg.toFixed(2)}° (x = ${greenOrder1.xMm.toFixed(1)} mm)`);
  console.log(`  Red 650nm   order 1: ${redOrder1.angleDeg.toFixed(2)}° (x = ${redOrder1.xMm.toFixed(1)} mm)`);
  console.log('✓ Test 4 passed: Grating dispersion and angular condition analytically validated\n');
}

// -------------------------------------------------------------
// Test 5: 3D OpticalDiffractionBenchMesh Assembly & Disposal Invariants
// -------------------------------------------------------------
{
  console.log('Test 5: 3D OpticalDiffractionBenchMesh Assembly & Disposal Invariants');
  const bench = new OpticalDiffractionBenchMesh();

  assert.ok(bench.group, 'Apparatus group must exist');
  assert.ok(bench.railGroup, 'Rail group must exist');
  assert.ok(bench.laserGroup, 'Laser module group must exist');
  assert.ok(bench.turretGroup, 'Slit turret group must exist');
  assert.ok(bench.turretWheel, 'Slit turret rotating wheel must exist');
  assert.ok(bench.screenCarrierGroup, 'Screen carrier group must exist');
  assert.ok(bench.screenPanelGroup, 'Screen panel group must exist');
  assert.ok(bench.micrometerKnob, 'Micrometer knob must exist');
  assert.ok(bench.laserSwitchMesh, 'Laser switch mesh must exist');
  assert.ok(bench.laserLedMesh, 'Laser LED indicator must exist');
  assert.ok(bench.wlButtons[650] && bench.wlButtons[532] && bench.wlButtons[405], '3 Wavelength buttons must exist');
  assert.ok(bench.preBeamMesh, 'Pre-slit laser beam must exist');
  assert.ok(bench.postBeamMesh, 'Post-slit diffraction light fan must exist');
  assert.ok(bench.gratingRaysGroup, 'Grating discrete rays group must exist');

  // Verify Scheme A: Standard 3-carrier scientific optical bench architecture (no redundant 4th saddle)
  assert.strictEqual(
    bench.group.children.filter((c) => c.name === 'GratingHolderGroup').length,
    0,
    'Must have eliminated redundant 4th grating holder saddle from bench group'
  );
  assert.strictEqual(bench.slitStageGroup, bench.turretGroup, 'Slit stage group must unify turret group');

  // Verify memory disposal
  bench.dispose();
  console.log('✓ Test 5 passed: 3D optical bench assembly & clean disposal verified\n');
}

// -------------------------------------------------------------
// Test 6: 3D Raycast Hover Target & Pointer Direct Manipulation
// -------------------------------------------------------------
{
  console.log('Test 6: 3D Raycast Hover Target & Pointer Direct Manipulation');
  const bench = new OpticalDiffractionBenchMesh();
  const rootGroup = new THREE.Group();
  rootGroup.add(bench.group);

  let typeChanged = false;
  let powerToggled = false;
  let wlChanged = false;
  let distChanged = false;

  const mgr = new OpticalDiffractionInteractionManager(bench, rootGroup, {
    onDiffractionTypeChange: () => { typeChanged = true; },
    onLaserPowerToggle: () => { powerToggled = true; },
    onWavelengthChange: () => { wlChanged = true; },
    onScreenDistanceChange: () => { distChanged = true; },
  });

  // 1. Raycast hover over laser power switch
  const mockRaycaster = new THREE.Raycaster();
  const switchWorldPos = new THREE.Vector3();
  bench.laserSwitchMesh.getWorldPosition(switchWorldPos);
  mockRaycaster.ray.set(new THREE.Vector3(switchWorldPos.x, switchWorldPos.y + 0.5, switchWorldPos.z), new THREE.Vector3(0, -1, 0));

  const target = mgr.getHoverTarget(mockRaycaster);
  assert.ok(target, 'Must detect hover target');
  assert.strictEqual(target.id, 'laser_power');
  assert.strictEqual(target.cursor, 'pointer');

  // 2. Click laser switch
  const mockHit = {
    object: bench.laserSwitchMesh,
    point: switchWorldPos,
  } as any;
  const handled = mgr.onPointerDown(new PointerEvent('pointerdown'), mockHit);
  assert.strictEqual(handled, true, 'Laser switch click handled');
  assert.strictEqual(powerToggled, true, 'Power toggle callback invoked');

  // 3. Click wavelength button 650nm
  const btn650 = bench.wlButtons[650];
  const hitBtn = { object: btn650, point: btn650.position } as any;
  mgr.onPointerDown(new PointerEvent('pointerdown'), hitBtn);
  assert.strictEqual(wlChanged, true, 'Wavelength callback invoked');
  assert.strictEqual(bench.wavelengthNm, 650);

  // 4. Click turret to cycle slit type
  const hitTurret = { object: bench.turretWheel, point: bench.turretWheel.position } as any;
  mgr.onPointerDown(new PointerEvent('pointerdown'), hitTurret);
  assert.strictEqual(typeChanged, true, 'Slit type changed callback invoked');
  assert.strictEqual(bench.diffractionType, 'double', 'Cycled from single to double');

  bench.dispose();
  console.log('✓ Test 6 passed: 3D raycast hover target and direct interaction verified\n');
}

// -------------------------------------------------------------
// Test 7: Full Experiment Lifecycle, Parameters & Telemetry Synchronization
// -------------------------------------------------------------
{
  console.log('Test 7: Full Experiment Lifecycle, Parameters & Telemetry Synchronization');
  const exp = new OpticsDiffractionExperiment();
  const mockContext = {
    scene: new THREE.Scene(),
    camera: new THREE.PerspectiveCamera(),
    setParameter: (k: string, v: any) => {
      exp.onParameterChange(k, v, mockContext);
    },
  } as any;

  exp.init(mockContext);
  assert.ok(exp.getBench(), 'Apparatus bench must be initialized');

  const telem1 = exp.getTelemetry();
  assert.strictEqual(telem1.diffractionType, 'single');
  assert.strictEqual(telem1.wavelengthNm, 532.0);
  assert(telem1.centralWidthMm > 0, 'Central width must be positive');

  // Parameter updates
  exp.onParameterChange('diffractionType', 'circular', mockContext);
  assert.strictEqual(exp.getBench().diffractionType, 'circular');

  exp.onParameterChange('wavelength', 650.0, mockContext);
  assert.strictEqual(exp.getBench().wavelengthNm, 650.0);

  exp.onParameterChange('screenDistance', 0.70, mockContext);
  assert.strictEqual(exp.getBench().screenDistanceM, 0.70);

  const telem2 = exp.getTelemetry();
  assert.strictEqual(telem2.diffractionType, 'circular');
  assert.strictEqual(telem2.wavelengthNm, 650.0);
  assert.strictEqual(telem2.screenDistanceM, 0.70);
  assert(telem2.airyDiskRadiusMm > 0, 'Airy disk radius must be positive');

  // Advance update loop
  exp.update(0.016, 1.0, mockContext);

  exp.dispose(mockContext);
  console.log('✓ Test 7 passed: Experiment lifecycle, parameters, and telemetry verified\n');
}

// -------------------------------------------------------------
// Test 8: Strict Zero Floating Popups & Banners Invariant
// -------------------------------------------------------------
{
  console.log('Test 8: Strict Zero Floating Popups & Banners Invariant');
  const exp = new OpticsDiffractionExperiment();
  const mockContext = { scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera() } as any;
  exp.init(mockContext);

  // Invariant 1: Root group does not contain any DOM elements or floating UI widgets
  assert.strictEqual(exp.rootGroup.children.length, 1, 'Only native 3D bench is added to rootGroup');

  // Invariant 2: No DOM popups, modals, toasts, or guide banners injected
  assert.strictEqual((exp as any).statusCard, undefined, 'No DOM status cards permitted');
  assert.strictEqual((exp as any).guidanceBanner, undefined, 'No DOM guidance banners permitted');
  assert.strictEqual((exp as any).floatingModal, undefined, 'No DOM floating modals permitted');

  exp.dispose(mockContext);
  console.log('✓ Test 8 passed: Strict zero floating popups & banners rule enforced\n');
}

// -------------------------------------------------------------
// Test 9: 60+ FPS Performance Benchmark (< 0.05ms per simulation update)
// -------------------------------------------------------------
{
  console.log('Test 9: 60+ FPS Performance Benchmark');
  const exp = new OpticsDiffractionExperiment();
  const mockContext = { scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera() } as any;
  exp.init(mockContext);

  const iterations = 1000;
  const start = performance.now();
  for (let i = 0; i < iterations; i++) {
    exp.update(0.016, i * 0.016, mockContext);
  }
  const totalMs = performance.now() - start;
  const stepMs = totalMs / iterations;
  const fps = Math.round(1000 / Math.max(0.0001, stepMs));

  console.log(`  Total time for ${iterations} steps: ${totalMs.toFixed(3)} ms`);
  console.log(`  Average step time:          ${stepMs.toFixed(5)} ms`);
  console.log(`  Equivalent logic frame rate: ${fps} FPS`);

  assert(stepMs < 0.05, `Step time ${stepMs}ms must be under 0.05ms for locked 60+ FPS`);
  exp.dispose(mockContext);
  console.log('✓ Test 9 passed: Simulation loop performance well within 60+ FPS budget\n');
}

// -------------------------------------------------------------
// Test 10: Metadata & Discipline Modal Registration Invariants
// -------------------------------------------------------------
{
  console.log('Test 10: Metadata & Discipline Modal Registration Invariants');
  assert.strictEqual(metadata.id, 'optics-diffraction');
  assert.strictEqual(metadata.category, 'optics');
  assert.strictEqual(metadata.name, '光的衍射');
  assert(metadata.parameters.length >= 8, 'Must declare at least 8 tunable parameters');

  const registered = PhysicsDisciplineModal.OPTICS_EXPERIMENTS.find(
    (e) => e.id === 'optics-diffraction'
  );
  assert.ok(registered, 'optics-diffraction must be registered in PhysicsDisciplineModal');
  assert.strictEqual(registered.name, '光的衍射');
  assert.ok(registered.iconSvg.includes('svg'), 'Must have valid SVG icon');
  assert.ok(registered.formula.includes('sinθ'), 'Must have valid diffraction formula');

  console.log('✓ Test 10 passed: Metadata and Physics Discipline Modal registration verified\n');
}

// -------------------------------------------------------------
// Test 11: Center Crosshair Activation & Raycast Hover Detection Invariant
// -------------------------------------------------------------
{
  console.log('Test 11: Center Crosshair Activation & Raycast Hover Detection Invariant');
  const exp = new OpticsDiffractionExperiment();
  const mockContext = {
    scene: new THREE.Scene(),
    camera: new THREE.PerspectiveCamera(60, 1920 / 1080, 0.1, 100),
    setParameter: () => {},
  } as any;
  exp.init(mockContext);
  exp.rootGroup.updateMatrixWorld(true);

  // 11.1 归一化指针坐标换算：在指针锁定激活状态下必须返回屏幕绝对中心 (0, 0) 以驱动准星
  const mockEvent = { clientX: 640, clientY: 480 } as PointerEvent;
  (globalThis as any).document.pointerLockElement = (globalThis as any).document.body;
  const lockedCoords = exp.getNormalizedMouse(mockEvent);
  assert.strictEqual(lockedCoords.x, 0, 'In pointer lock mode, NDC X must be 0 for center crosshair');
  assert.strictEqual(lockedCoords.y, 0, 'In pointer lock mode, NDC Y must be 0 for center crosshair');

  (globalThis as any).document.pointerLockElement = null;
  const unlockedCoords = exp.getNormalizedMouse(mockEvent);
  assert(unlockedCoords.x !== 0 || unlockedCoords.y !== 0, 'In free cursor mode, NDC coords reflect mouse position');

  // 11.2 准星射线直接对准激光电源开关
  const bench = exp.getBench();
  const raycaster = new THREE.Raycaster();
  const switchWorldPos = new THREE.Vector3();
  bench.laserSwitchMesh.getWorldPosition(switchWorldPos);

  raycaster.ray.origin.set(switchWorldPos.x, switchWorldPos.y, switchWorldPos.z + 0.5);
  raycaster.ray.direction.set(0, 0, -1);

  const hoverSwitch = exp.getHoverTarget(raycaster);
  assert.ok(hoverSwitch !== null, 'Center crosshair ray should detect hover target on laser switch');
  assert.strictEqual(hoverSwitch?.id, 'laser_power');
  assert.strictEqual(hoverSwitch?.cursor, 'pointer');
  assert.ok(hoverSwitch?.label.includes('激光电源开关'), 'Hover target must show descriptive label for crosshair tooltip');

  // 11.3 验证指针锁定状态下的微米鼓轮微调
  const micrometerHit: any = {
    object: bench.micrometerKnob,
    point: new THREE.Vector3(),
  };
  const downHandled = exp.interactionManager.onPointerDown(new PointerEvent('pointerdown'), micrometerHit);
  assert.strictEqual(downHandled, true);
  assert.strictEqual(exp.interactionManager.isDragging, true);

  (globalThis as any).document.pointerLockElement = (globalThis as any).document.body;
  const initialWidth = bench.slitWidthMm;
  const moveEvent = { movementX: 10 } as any;
  exp.interactionManager.onPointerMove(moveEvent, raycaster);
  assert(bench.slitWidthMm > initialWidth, 'Slit width should increase with positive movementX under pointer lock');

  exp.interactionManager.onPointerUp(new PointerEvent('pointerup'));
  (globalThis as any).document.pointerLockElement = null;

  exp.dispose(mockContext);
  console.log('✓ Test 11 passed: Center crosshair activation and hover raycasting verified\n');
}

// -------------------------------------------------------------
// Test 12: Minimalist Diffraction Screen Invariant (Pure Light Image Only)
// -------------------------------------------------------------
{
  console.log('Test 12: Minimalist Diffraction Screen Invariant (Pure Light Image Only)');
  const exp = new OpticsDiffractionExperiment();
  const mockContext = { scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(), setParameter: () => {} } as any;
  exp.init(mockContext);

  const bench = exp.getBench();

  // 12.1 验证激光开启时：观测屏纹理更新仅渲染纯物理衍射光像，绝不绘制任何刻度文字、网格或波形图卡片
  let filledTextCount = 0;
  const originalGetContext = (bench as any).screenCanvas.getContext;
  const mockCtx = (bench as any).screenCanvas.getContext('2d');
  mockCtx.fillText = () => { filledTextCount++; };
  mockCtx.strokeText = () => { filledTextCount++; };

  bench.setLaserPower(true);
  (bench as any).lastRenderHash = '';
  bench.updateScreenTexture();
  assert.strictEqual(filledTextCount, 0, 'Observation screen must not render any text, HUD cards, or scale numbers');

  // 12.2 验证激光关闭时：观测屏保持纯黑深邃，不展示任何多余提示文字
  bench.setLaserPower(false);
  (bench as any).lastRenderHash = '';
  bench.updateScreenTexture();
  assert.strictEqual(filledTextCount, 0, 'Observation screen must not render text even when laser is off');

  // 12.3 验证屏幕表面交互悬停文案体现纯光像呈现
  const raycaster = new THREE.Raycaster();
  const screenWorldPos = new THREE.Vector3();
  bench.screenMesh.getWorldPosition(screenWorldPos);
  raycaster.ray.origin.set(screenWorldPos.x, screenWorldPos.y, screenWorldPos.z + 0.5);
  raycaster.ray.direction.set(0, 0, -1);

  const hoverScreen = exp.getHoverTarget(raycaster);
  assert.ok(hoverScreen !== null);
  assert.strictEqual(hoverScreen?.id, 'screen_surface');
  assert.ok(hoverScreen?.label.includes('激光衍射光斑'), 'Screen surface hover label should describe pure light pattern');

  exp.dispose(mockContext);
  console.log('✓ Test 12 passed: Minimalist diffraction screen invariant verified\n');
}

// -------------------------------------------------------------
// Test 13: Adjustable Single Slit Mechanical Kinematics & Blade Separation Invariant
// -------------------------------------------------------------
{
  console.log('Test 13: Adjustable Single Slit Mechanical Kinematics & Blade Separation Invariant');
  const exp = new OpticsDiffractionExperiment();
  const mockContext = { scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(), setParameter: () => {} } as any;
  exp.init(mockContext);

  const bench = exp.getBench();

  // 13.1 Verify physical presence of precision opposed knife-edge jaws
  assert.ok(bench.leftJawMesh, 'Left knife-edge jaw must exist');
  assert.ok(bench.rightJawMesh, 'Right knife-edge jaw must exist');
  assert.ok(bench.micrometerKnob, 'Micrometer knob must exist');

  // 13.2 Verify initial blade separation
  bench.setSlitWidth(0.04);
  const gapSmall = Math.abs(bench.rightJawMesh.position.z - bench.leftJawMesh.position.z);
  const rotSmall = bench.micrometerKnob.rotation.z;

  bench.setSlitWidth(0.20);
  const gapLarge = Math.abs(bench.rightJawMesh.position.z - bench.leftJawMesh.position.z);
  const rotLarge = bench.micrometerKnob.rotation.z;

  assert(gapLarge > gapSmall, `Wider slit must yield wider blade gap in 3D: gapLarge=${gapLarge} > gapSmall=${gapSmall}`);
  assert(rotLarge !== rotSmall, 'Micrometer knob must rotate when slit width changes');

  // 13.3 Verify raycast hover on micrometer and jaws
  const raycaster = new THREE.Raycaster();
  const knobPos = new THREE.Vector3();
  bench.micrometerKnob.getWorldPosition(knobPos);
  raycaster.ray.origin.set(knobPos.x, knobPos.y, knobPos.z + 0.5);
  raycaster.ray.direction.set(0, 0, -1);

  const hoverKnob = exp.getHoverTarget(raycaster);
  assert.ok(hoverKnob !== null, 'Micrometer knob must be hover-detectable');
  assert.strictEqual(hoverKnob?.id, 'slit_micrometer');
  assert.ok(hoverKnob?.label.includes('单缝'), 'Hover label must describe single slit micrometer');

  // 13.4 Verify direct dragging of micrometer under free cursor
  let changedSlitWidth = 0;
  exp.interactionManager = new OpticalDiffractionInteractionManager(bench, exp.rootGroup, {
    onSlitWidthChange: (w) => { changedSlitWidth = w; },
  });

  const hitKnob = { object: bench.micrometerKnob, point: knobPos } as any;
  const downHandled = exp.interactionManager.onPointerDown(new PointerEvent('pointerdown', { clientX: 200 } as any), hitKnob);
  assert.strictEqual(downHandled, true);
  assert.strictEqual(exp.interactionManager.isDragging, true);

  const moveEvent = { clientX: 260 } as any;
  exp.interactionManager.onPointerMove(moveEvent, raycaster);
  assert(changedSlitWidth > 0.20, `Dragging micrometer must update slit width, got ${changedSlitWidth}`);
  assert.strictEqual(bench.slitWidthMm, changedSlitWidth);

  exp.interactionManager.onPointerUp(new PointerEvent('pointerup'));
  assert.strictEqual(exp.interactionManager.isDragging, false);

  exp.dispose(mockContext);
  console.log('✓ Test 13 passed: Adjustable single slit mechanical kinematics & blade separation verified\n');
}

// -------------------------------------------------------------
// Test 14: Pure Large Deep-Colored Slit Value Text Invariant (No Square UI / Card Border)
// -------------------------------------------------------------
{
  console.log('Test 14: Pure Large Deep-Colored Slit Value Text Invariant (No Square UI / Card Border)');
  const exp = new OpticsDiffractionExperiment();
  const mockContext = { scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(), setParameter: () => {} } as any;
  exp.init(mockContext);

  const bench = exp.getBench();

  // 14.1 验证缝隙数值标注必须采用纯文字 3D Sprite，杜绝低多边形平板/卡片网格拼接
  let foundSprite: THREE.Sprite | null = null;
  bench.group.traverse((obj) => {
    if (obj.name === 'SlitValueLabel' && (obj as any).isSprite) {
      foundSprite = obj as THREE.Sprite;
    }
  });

  assert.ok(foundSprite, 'SlitValueLabel Sprite must exist in bench hierarchy');
  const spriteMat = (foundSprite as any).material as THREE.SpriteMaterial;
  assert.strictEqual(spriteMat.transparent, true, 'Sprite material must be transparent');
  assert.strictEqual(spriteMat.depthWrite, false, 'Sprite material must disable depthWrite');

  // 14.2 验证绘制过程：严禁调用 fillRect / strokeRect 绘制方形 UI 框与背景色块
  let fillRectCalls = 0;
  let strokeRectCalls = 0;
  let clearRectCalls = 0;
  let lastFilledText = '';
  let lastFillStyle = '';
  let lastFont = '';

  const slitCanvas = (bench as any).slitPlateCanvas;
  assert.ok(slitCanvas, 'Slit plate canvas must exist');
  const ctx = slitCanvas.getContext('2d');
  ctx.fillRect = () => { fillRectCalls++; };
  ctx.strokeRect = () => { strokeRectCalls++; };
  ctx.clearRect = () => { clearRectCalls++; };
  ctx.fillText = (text: string) => {
    lastFilledText = text;
    lastFillStyle = ctx.fillStyle;
    lastFont = ctx.font;
  };

  // 触发缝宽更新
  bench.setSlitWidth(0.10);
  assert.strictEqual(fillRectCalls, 0, 'Must NOT draw any background fill rect (no square UI allowed)');
  assert.strictEqual(strokeRectCalls, 0, 'Must NOT draw any stroke rect / border outline (no square UI allowed)');
  assert(clearRectCalls > 0, 'Must clear canvas with transparency');

  // 14.3 验证文字为大号深色字
  assert.ok(lastFilledText.includes('单缝 a = 0.10 mm'), `Rendered text must match slit width: ${lastFilledText}`);
  assert.strictEqual(lastFillStyle, '#0f172a', 'Text color must be deep dark slate (#0f172a)');
  assert.ok(lastFont.includes('bold'), 'Font must be bold');
  assert.ok(lastFont.includes('96px'), 'Font must be large (96px)');

  // 14.4 验证切换衍射类型时文字同步更新
  bench.setDiffractionType('double');
  assert.ok(lastFilledText.includes('双缝'), 'Must display double slit label when switched');

  bench.setDiffractionType('circular');
  assert.ok(lastFilledText.includes('圆孔'), 'Must display circular aperture label when switched');

  bench.setDiffractionType('grating');
  assert.ok(lastFilledText.includes('光栅'), 'Must display grating label when switched');

  exp.dispose(mockContext);
  console.log('✓ Test 14 passed: Pure large deep-colored slit value text invariant verified\n');
}

// -------------------------------------------------------------
// Test 15: High-Fidelity Knob Craftsmanship, Rotational Dynamics & Hover Prompt Lifecycle Invariant
// -------------------------------------------------------------
{
  console.log('Test 15: High-Fidelity Knob Craftsmanship, Rotational Dynamics & Hover Prompt Lifecycle Invariant');
  const exp = new OpticsDiffractionExperiment();
  const mockContext = { scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(), setParameter: () => {} } as any;
  exp.init(mockContext);

  const bench = exp.getBench();

  // 15.1 高精度旋钮建模细节校验 (严禁粗糙几何拼接，要求倒角游标环、滚花防滑棱纹、棘轮定位及 3D 光晕环)
  assert.ok(bench.micrometerHoverCue, 'Micrometer native 3D hover cue must exist');
  assert.ok(bench.turretHoverCue, 'Turret native 3D hover cue must exist');
  assert.strictEqual(bench.micrometerHoverCue.visible, false, 'Hover cue must be initially invisible');
  assert.strictEqual(bench.turretHoverCue.visible, false, 'Hover cue must be initially invisible');

  // 严禁在屏幕上方突兀拼接生硬圆柱体，确保屏幕顶缘完全平整专业
  assert.strictEqual(bench.group.getObjectByName('ScreenHandleTop'), undefined, 'Extra cylinder above screen must NOT exist');

  // 验证遵循纯净开阔三维台面铁律：彻底移除一切侵入式浮动文字提示标贴 (保持台面纯净)
  assert.strictEqual(bench.group.getObjectByName('MicrometerHintLabel'), undefined, 'Micrometer floating hint text must be removed');
  assert.strictEqual(bench.group.getObjectByName('TurretHintLabel'), undefined, 'Turret floating hint text must be removed');

  // 旋钮大直径与紧凑平整轴向比例规范：旋钮做大 (直径 >= 30mm，半径 >= 15mm)，不要做的很长 (厚度 <= 12mm，轴向紧凑)
  const knobGeo = bench.micrometerKnob.geometry as THREE.CylinderGeometry;
  assert(knobGeo.parameters.radiusTop >= 0.015, `Knob radius must be enlarged for ergonomic laboratory precision (got ${knobGeo.parameters.radiusTop} >= 0.015)`);
  assert(knobGeo.parameters.height <= 0.012, `Knob must be compact in axial length, not an overly long cylinder (got ${knobGeo.parameters.height} <= 0.012)`);

  // 微米鼓轮必须包含倒角游标刻度环、32道滚花棱纹、铬合金倒角环、精致端面阶梯等丰富装配细节
  assert(bench.micrometerKnob.children.length >= 10, `Micrometer knob must have high mechanical craftsmanship (found ${bench.micrometerKnob.children.length} sub-features)`);
  // 转换轮必须包含防滑凹槽、中心液态铬端盖、激光蚀刻象限分度标记等细节
  assert(bench.turretWheel.children.length >= 10, `Turret wheel must have high mechanical craftsmanship (found ${bench.turretWheel.children.length} sub-features)`);

  // 15.2 差动微米螺杆旋转与轴向真实进给动效校验
  bench.setSlitWidth(0.02);
  const posZMin = bench.micrometerKnob.position.z;
  const rotZMin = bench.micrometerKnob.rotation.z;

  bench.setSlitWidth(0.25);
  const posZMax = bench.micrometerKnob.position.z;
  const rotZMax = bench.micrometerKnob.rotation.z;

  assert(posZMax > posZMin, `Micrometer knob must advance axially with slit width: posZMax=${posZMax} > posZMin=${posZMin}`);
  assert(posZMax <= 0.015, `Micrometer knob position must remain compact without long projecting barrel (posZMax=${posZMax} <= 0.015)`);
  assert(Math.abs(rotZMax - rotZMin) >= Math.PI * 6, 'Micrometer knob must execute multiple rotations across tuning range');

  // 15.3 转换轮机械弹簧阻尼卡珠平滑旋转动效校验
  bench.setDiffractionType('double');
  assert.strictEqual(bench.targetTurretAngle, Math.PI * 0.5);
  // 模拟逐帧渲染，验证阻尼旋转平滑插值过渡
  const initialAngle = bench.turretWheel.rotation.x;
  bench.update(0.016);
  const step1Angle = bench.turretWheel.rotation.x;
  assert(step1Angle > initialAngle, 'Turret wheel must smoothly rotate towards target angle');
  // 经过若干帧后收敛到达精确目标角
  for (let i = 0; i < 60; i++) {
    bench.update(0.016);
  }
  assert(Math.abs(bench.turretWheel.rotation.x - Math.PI * 0.5) < 0.001, 'Turret wheel must settle on target detent angle');

  // 15.4 悬浮提示生命周期：没接触前有提示与 3D 光晕环，交互后提示彻底消失
  const raycaster = new THREE.Raycaster();
  const knobWorldPos = new THREE.Vector3();
  bench.micrometerKnob.getWorldPosition(knobWorldPos);
  raycaster.ray.origin.set(knobWorldPos.x, knobWorldPos.y, knobWorldPos.z + 0.5);
  raycaster.ray.direction.set(0, 0, -1);

  // a. 没接触前悬停：应出现提示文本与 3D 原生光晕环
  const preHover = exp.getHoverTarget(raycaster);
  assert.ok(preHover !== null, 'Should detect hover target before interaction');
  assert.strictEqual(preHover?.id, 'slit_micrometer');
  assert(preHover?.label && preHover.label.length > 0, 'Must have hover prompt before contact');
  assert.strictEqual(bench.micrometerHoverCue.visible, true, '3D hover cue halo must be visible before contact');

  // b. 交互触发：执行 pointerdown
  const hitKnob = { object: bench.micrometerKnob, point: knobWorldPos } as any;
  const handled = exp.interactionManager.onPointerDown(new PointerEvent('pointerdown', { clientX: 300 } as any), hitKnob);
  assert.strictEqual(handled, true);
  assert.strictEqual(bench.micrometerHoverCue.visible, false, '3D hover cue must immediately disappear upon interaction');

  // 转换轮交互后光晕同样彻底消失
  const hitTurret = { object: bench.turretWheel, point: new THREE.Vector3() } as any;
  const handledTurret = exp.interactionManager.onPointerDown(new PointerEvent('pointerdown'), hitTurret);
  assert.strictEqual(handledTurret, true);
  assert.strictEqual(bench.turretHoverCue.visible, false, 'Turret 3D hover cue must immediately disappear upon interaction');

  // c. 交互后悬停：提示彻底消失 (label 为空，3D 光晕不可见)
  const postHover = exp.getHoverTarget(raycaster);
  assert.strictEqual(postHover?.label, '', 'Hover prompt text must disappear after interaction');
  assert.strictEqual(bench.micrometerHoverCue.visible, false, '3D hover cue halo must remain hidden after interaction');

  exp.interactionManager.onPointerUp(new PointerEvent('pointerup'));
  exp.dispose(mockContext);
  console.log('✓ Test 15 passed: High-fidelity knob craftsmanship, rotational dynamics & hover prompt lifecycle verified\n');
}

// -------------------------------------------------------------
// Test 16: Ergonomic Operator-Facing Single-Knob Standard for Slit Stage Invariant
// -------------------------------------------------------------
{
  console.log('Test 16: Ergonomic Operator-Facing Single-Knob Standard for Slit Stage Invariant');
  const bench = new OpticalDiffractionBenchMesh();

  // 1. 中间实验器材在正对操作者一侧 (+Z) 必须包含高精度测微鼓轮旋钮
  assert.ok(bench.micrometerThimbleGroup, 'Micrometer knob assembly must exist');
  assert.ok(bench.micrometerKnob, 'Micrometer rotating knob must exist');
  assert(bench.micrometerThimbleGroup.position.z > 0, 'Micrometer knob must be located on the operator-facing side (+Z)');

  // 2. 中间实验器材背对操作者一侧 (-Z) 严禁挂载任何突兀的额外旋钮 (杜绝不合理的双向对称突兀旋钮)
  const attachedTurret = bench.slitStageGroup.getObjectByName('SlitTurretWheel');
  assert.strictEqual(attachedTurret, undefined, 'Turret wheel must NOT be attached to the 3D slit stage (rear side must have no protruding knob)');

  const attachedTurretCue = bench.slitStageGroup.getObjectByName('TurretHoverCue');
  assert.strictEqual(attachedTurretCue, undefined, 'Turret hover cue must NOT be attached to the 3D slit stage');

  // 3. 校验 slitStageGroup 所有直接子构件：在负 Z 侧 (背向操作者) 绝不允许存在任何旋钮类机械构件
  bench.slitStageGroup.children.forEach((child) => {
    if (child.position.z < -0.015) {
      assert(
        !child.name.toLowerCase().includes('knob') &&
        !child.name.toLowerCase().includes('wheel') &&
        !child.name.toLowerCase().includes('turret'),
        `Unexpected rear knob/wheel detected on slit stage: ${child.name}`
      );
    }
  });

  bench.dispose();
  console.log('✓ Test 16 passed: Ergonomic operator-facing single-knob standard for slit stage verified\n');
}

// -------------------------------------------------------------
// Test 17: Visible Slit Aperture Window, Ground Knife-Edge Blades & Slit Illumination Invariant
// -------------------------------------------------------------
{
  console.log('Test 17: Visible Slit Aperture Window, Ground Knife-Edge Blades & Slit Illumination Invariant');
  const bench = new OpticalDiffractionBenchMesh();

  // 1. 验证中央挡板开有精密通光观测视窗，杜绝实心挡板遮蔽狭缝
  assert.ok(bench.leftJawMesh, 'Left knife-edge blade must exist');
  assert.ok(bench.rightJawMesh, 'Right knife-edge blade must exist');
  assert.ok(bench.slitLightMesh, 'Slit transmission 3D light core must exist');

  // 2. 验证两研磨刀口片之间存在真实物理开度狭缝 (visualGap > 0)
  bench.setSlitWidth(0.08);
  const gapAt008 = Math.abs(bench.rightJawMesh.position.z - bench.leftJawMesh.position.z);
  assert(gapAt008 > 0.015, `Slit blades must be visibly separated: gapAt008=${gapAt008}`);

  // 3. 验证狭缝发光光芯宽度与狭缝开度同步动态缩放
  bench.setSlitWidth(0.04);
  const scaleZSmall = bench.slitLightMesh.scale.z;
  bench.setSlitWidth(0.20);
  const scaleZLarge = bench.slitLightMesh.scale.z;
  assert(scaleZLarge > scaleZSmall, `Slit light core must widen with slit width: ${scaleZLarge} > ${scaleZSmall}`);

  // 4. 验证不同衍射孔径模式下插片元件的可见性切换
  bench.setDiffractionType('double');
  assert.strictEqual(bench.leftJawMesh.visible, false);
  assert.strictEqual(bench.doubleSlitInsertMesh.visible, true, 'Double slit slide must be visible in double mode');

  bench.setDiffractionType('circular');
  assert.strictEqual(bench.doubleSlitInsertMesh.visible, false);
  assert.strictEqual(bench.circularInsertMesh.visible, true, 'Circular aperture slide must be visible in circular mode');

  bench.setDiffractionType('grating');
  assert.strictEqual(bench.circularInsertMesh.visible, false);
  assert.strictEqual(bench.gratingSlideMesh.visible, true, 'Grating slide must be visible in grating mode');

  bench.setDiffractionType('single');
  assert.strictEqual(bench.leftJawMesh.visible, true, 'Single slit knife edges must be visible in single mode');
  assert.strictEqual(bench.rightJawMesh.visible, true);
  assert.strictEqual(bench.slitLightMesh.visible, true, 'Slit light beam must be visible when laser is on in single mode');

  // 5. 激光关闭时狭缝透光隐藏，但机械刀口狭缝依然真实可见
  bench.setLaserPower(false);
  assert.strictEqual(bench.slitLightMesh.visible, false, 'Slit light beam must be hidden when laser is off');
  assert.strictEqual(bench.leftJawMesh.visible, true, 'Physical knife edge must remain visible even when laser is off');
  assert.strictEqual(bench.rightJawMesh.visible, true);

  bench.dispose();
  console.log('✓ Test 17 passed: Visible slit aperture window, ground knife-edge blades & slit illumination verified\n');
}

console.log('========================================================');
console.log('All Light Diffraction Tests Passed (17/17)!');
console.log('========================================================\n');


