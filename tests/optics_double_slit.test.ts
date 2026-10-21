import assert from 'node:assert';
import * as THREE from 'three';
import { OpticalPhysics } from '../src/scene/optics/OpticalPhysics.ts';
import {
  OpticalDoubleSlitBenchMesh,
} from '../src/scene/optics/OpticalDoubleSlitBenchMesh.ts';
import { OpticalDoubleSlitInteractionManager } from '../src/scene/optics/OpticalDoubleSlitInteractionManager.ts';
import OpticsDoubleSlitExperiment from '../src/experiments/catalog/optics-double-slit/index.ts';
import { metadata } from '../src/experiments/catalog/optics-double-slit/meta.ts';
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

console.log('=== Starting Young\'s Double-Slit Interference Analytical & Integration Tests ===\n');

// -------------------------------------------------------------
// Test 1: Analytical Young's Double-Slit Fringe Spacing & Proportional Laws
// -------------------------------------------------------------
{
  console.log('Test 1: Analytical Young\'s Double-Slit Fringe Spacing & Proportional Laws');
  const wlNm = 532.0;
  const dMm = 0.25;
  const LM = 0.55;

  // 1. Fringe spacing Delta y = lambda * L / d
  const spacingMm = OpticalPhysics.getDoubleSlitFringeSpacing(wlNm, dMm, LM);
  const theorySpacingMm = ((wlNm * 1e-9 * LM) / (dMm * 1e-3)) * 1e3; // 1.1704 mm
  assert(Math.abs(spacingMm - theorySpacingMm) < 1e-5, 'Fringe spacing must match Delta y = lambda * L / d');

  // 2. Proportional to wavelength lambda: Red (650nm) > Green (532nm) > Violet-Blue (405nm)
  const spacingRed = OpticalPhysics.getDoubleSlitFringeSpacing(650, dMm, LM);
  const spacingBlue = OpticalPhysics.getDoubleSlitFringeSpacing(405, dMm, LM);
  assert(spacingRed > spacingMm && spacingMm > spacingBlue, 'Fringe spacing must increase with wavelength');

  // 3. Proportional to screen distance L: doubling L doubles Delta y
  const spacing2L = OpticalPhysics.getDoubleSlitFringeSpacing(wlNm, dMm, LM * 2);
  assert(Math.abs(spacing2L - spacingMm * 2) < 1e-5, 'Doubling screen distance L must double fringe spacing');

  // 4. Inversely proportional to slit distance d: doubling d halves Delta y
  const spacing2D = OpticalPhysics.getDoubleSlitFringeSpacing(wlNm, dMm * 2, LM);
  assert(Math.abs(spacing2D - spacingMm * 0.5) < 1e-5, 'Doubling slit distance d must halve fringe spacing');

  console.log(`  Green 532nm spacing: ${spacingMm.toFixed(4)} mm (Theory: ${theorySpacingMm.toFixed(4)} mm)`);
  console.log('✓ Test 1 passed: Young\'s double-slit fringe spacing & proportional laws validated\n');
}

// -------------------------------------------------------------
// Test 2: Analytical Optical Path Difference & Phase Superposition
// -------------------------------------------------------------
{
  console.log('Test 2: Analytical Optical Path Difference & Phase Superposition');
  const wlNm = 532.0;
  const dMm = 0.25;
  const LM = 0.50;

  // 1. At center x = 0: path difference = 0, phase difference = 0, intensity = 1.0
  const opd0 = OpticalPhysics.calculateOpticalPathDifference(0, wlNm, dMm, LM);
  assert(Math.abs(opd0.pathDiffNm) < 1e-6, 'Central path difference must be 0');
  assert(Math.abs(opd0.phaseDiffRad) < 1e-6, 'Central phase difference must be 0');
  assert(Math.abs(opd0.fringeOrder) < 1e-6, 'Central fringe order must be 0');

  // 2. At first bright fringe x_1 = lambda * L / d: path difference ~ lambda (532nm), phase ~ 2*pi
  const x1M = (wlNm * 1e-9 * LM) / (dMm * 1e-3);
  const opd1 = OpticalPhysics.calculateOpticalPathDifference(x1M, wlNm, dMm, LM);
  assert(Math.abs(opd1.pathDiffNm - wlNm) < 0.01, `First maximum path difference must be ~${wlNm}nm, got ${opd1.pathDiffNm}`);
  assert(Math.abs(opd1.phaseDiffRad - 2 * Math.PI) < 0.001, 'First maximum phase difference must be 2*pi');
  assert(Math.abs(opd1.fringeOrder - 1.0) < 0.001, 'First maximum fringe order must be 1');

  // 3. At first dark fringe x_dark1 = 0.5 * x_1: pure interference intensity drops to 0
  const I_dark1 = OpticalPhysics.calculatePureDoubleSlitIntensity(x1M * 0.5, wlNm, dMm, LM);
  assert(I_dark1 < 1e-5, `Pure double-slit intensity at first dark fringe must be 0, got ${I_dark1}`);

  console.log(`  1st Bright Fringe OPD: ${opd1.pathDiffNm.toFixed(2)} nm (Phase: ${(opd1.phaseDiffRad / Math.PI).toFixed(2)}π rad)`);
  console.log('✓ Test 2 passed: Optical path difference & phase superposition validated\n');
}

// -------------------------------------------------------------
// Test 3: Analytical Missing Orders (缺级现象 d = m * a)
// -------------------------------------------------------------
{
  console.log('Test 3: Analytical Missing Orders (d = m * a)');
  const wlNm = 532.0;
  const aMm = 0.05;
  const dMm = 0.25; // d / a = 5 -> k = ±5 is a missing order!
  const LM = 0.50;

  const spacingM = (wlNm * 1e-9 * LM) / (dMm * 1e-3);
  const xOrder5M = 5 * spacingM;

  // Pure double-slit without diffraction envelope has peak 1.0 at k = 5
  const I_pure5 = OpticalPhysics.calculatePureDoubleSlitIntensity(xOrder5M, wlNm, dMm, LM);
  assert(I_pure5 > 0.99, `Unmodulated interference at k=5 must be ~1.0, got ${I_pure5}`);

  // Modulated double-slit has missing order (intensity ~ 0) at k = 5 because beta = pi
  const I_mod5 = OpticalPhysics.calculateDoubleSlitIntensity(xOrder5M, wlNm, aMm, dMm, LM);
  assert(I_mod5 < 1e-4, `Modulated intensity at missing order k=5 must be suppressed to 0, got ${I_mod5}`);

  console.log(`  Order k=5 unmodulated: ${I_pure5.toFixed(4)} vs envelope-modulated (missing order): ${I_mod5.toFixed(6)}`);
  console.log('✓ Test 3 passed: Missing order phenomenon (d = m * a) analytically validated\n');
}

// -------------------------------------------------------------
// Test 4: Polychromatic White-Light Chromatic Interference ("内紫外红")
// -------------------------------------------------------------
{
  console.log('Test 4: Polychromatic White-Light Chromatic Interference');
  const aMm = 0.04;
  const dMm = 0.25;
  const LM = 0.55;

  // 1. Central maximum (x = 0) must be achromatic pure bright white (r = 1, g = 1, b = 1)
  const centerRGB = OpticalPhysics.calculateWhiteLightDoubleSlitRGB(0, aMm, dMm, LM, true);
  assert(centerRGB.r > 0.98 && centerRGB.g > 0.98 && centerRGB.b > 0.98, 'Central 0th-order white-light fringe must be pure white');

  // 2. At first-order blue peak (lambda = 440nm), blue channel exceeds red channel (内紫/蓝)
  const xBlue1M = (440e-9 * LM) / (dMm * 1e-3);
  const blueZoneRGB = OpticalPhysics.calculateWhiteLightDoubleSlitRGB(xBlue1M, aMm, dMm, LM, true);
  assert(blueZoneRGB.b > blueZoneRGB.r, `Inner 1st-order edge must be blue-dominant (b=${blueZoneRGB.b.toFixed(2)} > r=${blueZoneRGB.r.toFixed(2)})`);

  // 3. At first-order red peak (lambda = 650nm), red channel exceeds blue channel (外红)
  const xRed1M = (650e-9 * LM) / (dMm * 1e-3);
  const redZoneRGB = OpticalPhysics.calculateWhiteLightDoubleSlitRGB(xRed1M, aMm, dMm, LM, true);
  assert(redZoneRGB.r > redZoneRGB.b, `Outer 1st-order edge must be red-dominant (r=${redZoneRGB.r.toFixed(2)} > b=${redZoneRGB.b.toFixed(2)})`);

  console.log(`  Center (k=0): RGB(${centerRGB.r.toFixed(2)}, ${centerRGB.g.toFixed(2)}, ${centerRGB.b.toFixed(2)})`);
  console.log(`  Inner (440nm): B=${blueZoneRGB.b.toFixed(2)} > R=${blueZoneRGB.r.toFixed(2)} | Outer (650nm): R=${redZoneRGB.r.toFixed(2)} > B=${redZoneRGB.b.toFixed(2)}`);
  console.log('✓ Test 4 passed: White-light chromatic interference analytically validated\n');
}

// -------------------------------------------------------------
// Test 5: 3D OpticalDoubleSlitBenchMesh Assembly & Disposal Invariants
// -------------------------------------------------------------
{
  console.log('Test 5: 3D OpticalDoubleSlitBenchMesh Assembly & Disposal Invariants');
  const bench = new OpticalDoubleSlitBenchMesh();

  assert.ok(bench.group, 'Apparatus group must exist');
  assert.ok(bench.railGroup, 'Rail group must exist');
  assert.ok(bench.laserGroup, 'Laser module group must exist');
  assert.ok(bench.slitStageGroup, 'Double-slit stage group must exist');
  assert.ok(bench.turretWheel, 'Preset turret rotating wheel must exist');
  assert.ok(bench.screenCarrierGroup, 'Screen carrier group must exist');
  assert.ok(bench.screenPanelGroup, 'Screen panel group must exist');
  assert.ok(bench.micrometerKnob, 'Micrometer knob must exist');
  assert.ok(bench.laserSwitchMesh, 'Laser switch mesh must exist');
  assert.ok(bench.laserLedMesh, 'Laser LED indicator must exist');
  assert.ok(bench.wlButtons[650] && bench.wlButtons[532] && bench.wlButtons[405], '3 Wavelength buttons must exist');
  assert.ok(bench.whiteLightBtnMesh, 'White-light mode button must exist');
  assert.ok(bench.leftSlitLightMesh && bench.rightSlitLightMesh, 'Coherent slits S1 and S2 must exist');
  assert.ok(bench.centerBridgeMesh, 'Double-slit center titanium dividing bridge must exist');
  assert.ok(bench.preBeamMesh && bench.postBeamMesh && bench.secondaryBeamMesh, '3D dual-cone coherent beams must exist');
  assert.ok(bench.interferenceRaysGroup, '3D constructive interference order rays group must exist');

  bench.dispose();
  console.log('✓ Test 5 passed: 3D double-slit optical bench assembly & clean disposal verified\n');
}

// -------------------------------------------------------------
// Test 6: 3D Raycast Hover Target & Pointer Direct Manipulation
// -------------------------------------------------------------
{
  console.log('Test 6: 3D Raycast Hover Target & Pointer Direct Manipulation');
  const bench = new OpticalDoubleSlitBenchMesh();
  const rootGroup = new THREE.Group();
  rootGroup.add(bench.group);

  let modeChanged = false;
  let powerToggled = false;
  let wlChanged = false;
  let slitDistChanged = false;

  const mgr = new OpticalDoubleSlitInteractionManager(bench, rootGroup, {
    onLightSourceModeChange: () => { modeChanged = true; },
    onLaserPowerToggle: () => { powerToggled = true; },
    onWavelengthChange: () => { wlChanged = true; },
    onSlitDistanceChange: () => { slitDistChanged = true; },
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
  const mockHit = { object: bench.laserSwitchMesh, point: switchWorldPos } as any;
  const handled = mgr.onPointerDown(new PointerEvent('pointerdown'), mockHit);
  assert.strictEqual(handled, true, 'Laser switch click handled');
  assert.strictEqual(powerToggled, true, 'Power toggle callback invoked');

  // 3. Click wavelength button 650nm
  const btn650 = bench.wlButtons[650];
  const hitBtn = { object: btn650, point: btn650.position } as any;
  mgr.onPointerDown(new PointerEvent('pointerdown'), hitBtn);
  assert.strictEqual(wlChanged, true, 'Wavelength callback invoked');
  assert.strictEqual(bench.wavelengthNm, 650);

  // 4. Click white-light mode button
  const hitWhite = { object: bench.whiteLightBtnMesh, point: bench.whiteLightBtnMesh.position } as any;
  mgr.onPointerDown(new PointerEvent('pointerdown'), hitWhite);
  assert.strictEqual(modeChanged, true, 'Light source mode callback invoked');
  assert.strictEqual(bench.lightSourceMode, 'white');

  // 5. Click turret to cycle calibrated double-slit preset
  const hitTurret = { object: bench.turretWheel, point: bench.turretWheel.position } as any;
  mgr.onPointerDown(new PointerEvent('pointerdown'), hitTurret);
  assert.strictEqual(slitDistChanged, true, 'Slit distance callback invoked');
  assert.strictEqual(bench.slitDistanceMm, 0.40, 'Cycled from 0.25mm to 0.40mm preset');

  bench.dispose();
  console.log('✓ Test 6 passed: 3D raycast hover target and direct interaction verified\n');
}

// -------------------------------------------------------------
// Test 7: Full Experiment Lifecycle, Parameters & Telemetry Synchronization
// -------------------------------------------------------------
{
  console.log('Test 7: Full Experiment Lifecycle, Parameters & Telemetry Synchronization');
  const exp = new OpticsDoubleSlitExperiment();
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
  assert.strictEqual(telem1.lightSourceMode, 'monochromatic');
  assert.strictEqual(telem1.wavelengthNm, 532.0);
  assert(telem1.fringeSpacingMm > 0, 'Fringe spacing must be positive');

  // Parameter updates
  exp.onParameterChange('lightSourceMode', 'white', mockContext);
  assert.strictEqual(exp.getBench().lightSourceMode, 'white');

  exp.onParameterChange('wavelength', 650.0, mockContext);
  assert.strictEqual(exp.getBench().wavelengthNm, 650.0);
  assert.strictEqual(exp.getBench().lightSourceMode, 'monochromatic');

  exp.onParameterChange('slitDistance', 0.20, mockContext);
  assert.strictEqual(exp.getBench().slitDistanceMm, 0.20);

  exp.onParameterChange('slitWidth', 0.05, mockContext);
  assert.strictEqual(exp.getBench().slitWidthMm, 0.05);

  exp.onParameterChange('screenDistance', 0.70, mockContext);
  assert.strictEqual(exp.getBench().screenDistanceM, 0.70);

  const telem2 = exp.getTelemetry();
  assert.strictEqual(telem2.wavelengthNm, 650.0);
  assert.strictEqual(telem2.slitDistanceMm, 0.20);
  assert.strictEqual(telem2.screenDistanceM, 0.70);
  assert.strictEqual(telem2.missingOrderK, 4, 'When d=0.20mm and a=0.05mm, missing order k must be 4');

  exp.update(0.016, 1.0, mockContext);
  exp.dispose(mockContext);
  console.log('✓ Test 7 passed: Experiment lifecycle, parameters, and telemetry verified\n');
}

// -------------------------------------------------------------
// Test 8: Strict Zero Floating Popups & Banners Invariant
// -------------------------------------------------------------
{
  console.log('Test 8: Strict Zero Floating Popups & Banners Invariant');
  const exp = new OpticsDoubleSlitExperiment();
  const mockContext = { scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera() } as any;
  exp.init(mockContext);

  assert.strictEqual(exp.rootGroup.children.length, 1, 'Only native 3D bench is added to rootGroup');
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
  const exp = new OpticsDoubleSlitExperiment();
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
  assert.strictEqual(metadata.id, 'optics-double-slit');
  assert.strictEqual(metadata.category, 'optics');
  assert.strictEqual(metadata.name, '杨氏双缝干涉');
  assert(metadata.parameters.length >= 8, 'Must declare at least 8 tunable parameters');

  const registered = PhysicsDisciplineModal.OPTICS_EXPERIMENTS.find(
    (e) => e.id === 'optics-double-slit'
  );
  assert.ok(registered, 'optics-double-slit must be registered in PhysicsDisciplineModal');
  assert.strictEqual(registered.name, '杨氏双缝干涉');
  assert.ok(registered.iconSvg.includes('svg'), 'Must have valid SVG icon');
  assert.ok(registered.formula.includes('Δy = λL / d'), 'Must have valid Young double-slit formula');

  console.log('✓ Test 10 passed: Metadata and Physics Discipline Modal registration verified\n');
}

// -------------------------------------------------------------
// Test 11: Center Crosshair Activation & Raycast Hover Detection Invariant
// -------------------------------------------------------------
{
  console.log('Test 11: Center Crosshair Activation & Raycast Hover Detection Invariant');
  const exp = new OpticsDoubleSlitExperiment();
  const mockContext = {
    scene: new THREE.Scene(),
    camera: new THREE.PerspectiveCamera(60, 1920 / 1080, 0.1, 100),
    setParameter: () => {},
  } as any;
  exp.init(mockContext);
  exp.rootGroup.updateMatrixWorld(true);

  const mockEvent = { clientX: 640, clientY: 480 } as PointerEvent;
  (globalThis as any).document.pointerLockElement = (globalThis as any).document.body;
  const lockedCoords = exp.getNormalizedMouse(mockEvent);
  assert.strictEqual(lockedCoords.x, 0, 'In pointer lock mode, NDC X must be 0 for center crosshair');
  assert.strictEqual(lockedCoords.y, 0, 'In pointer lock mode, NDC Y must be 0 for center crosshair');

  (globalThis as any).document.pointerLockElement = null;
  const unlockedCoords = exp.getNormalizedMouse(mockEvent);
  assert(unlockedCoords.x !== 0 || unlockedCoords.y !== 0, 'In free cursor mode, NDC coords reflect mouse position');

  const bench = exp.getBench();
  const raycaster = new THREE.Raycaster();
  const switchWorldPos = new THREE.Vector3();
  bench.laserSwitchMesh.getWorldPosition(switchWorldPos);

  raycaster.ray.origin.set(switchWorldPos.x, switchWorldPos.y, switchWorldPos.z + 0.5);
  raycaster.ray.direction.set(0, 0, -1);

  const hoverSwitch = exp.getHoverTarget(raycaster);
  assert.ok(hoverSwitch !== null, 'Center crosshair ray should detect hover target on laser switch');
  assert.strictEqual(hoverSwitch?.id, 'laser_power');

  exp.dispose(mockContext);
  console.log('✓ Test 11 passed: Center crosshair activation and hover raycasting verified\n');
}

// -------------------------------------------------------------
// Test 12: Minimalist Interference Screen Invariant (Pure Light Pattern Only)
// -------------------------------------------------------------
{
  console.log('Test 12: Minimalist Interference Screen Invariant (Pure Light Pattern Only)');
  const exp = new OpticsDoubleSlitExperiment();
  const mockContext = { scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(), setParameter: () => {} } as any;
  exp.init(mockContext);

  const bench = exp.getBench();
  let filledTextCount = 0;
  const mockCtx = (bench as any).screenCanvas.getContext('2d');
  mockCtx.fillText = () => { filledTextCount++; };
  mockCtx.strokeText = () => { filledTextCount++; };

  bench.setLaserPower(true);
  (bench as any).lastRenderHash = '';
  bench.updateScreenTexture();
  assert.strictEqual(filledTextCount, 0, 'Observation screen must not render any text, HUD cards, or scale numbers');

  bench.setLightSourceMode('white');
  (bench as any).lastRenderHash = '';
  bench.updateScreenTexture();
  assert.strictEqual(filledTextCount, 0, 'White-light interference screen must also render pure light fringes without text');

  bench.setLaserPower(false);
  (bench as any).lastRenderHash = '';
  bench.updateScreenTexture();
  assert.strictEqual(filledTextCount, 0, 'Observation screen must not render text when laser is off');

  exp.dispose(mockContext);
  console.log('✓ Test 12 passed: Minimalist interference screen invariant verified\n');
}

// -------------------------------------------------------------
// Test 13: Adjustable Double-Slit S1/S2 Kinematics & Bezel Vernier Caliper Synchronization
// -------------------------------------------------------------
{
  console.log('Test 13: Adjustable Double-Slit S1/S2 Kinematics & Bezel Vernier Caliper Synchronization');
  const exp = new OpticsDoubleSlitExperiment();
  const mockContext = { scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(), setParameter: () => {} } as any;
  exp.init(mockContext);

  const bench = exp.getBench();

  bench.setSlitDistance(0.15);
  const s1s2SpanSmall = Math.abs(bench.rightSlitLightMesh.position.z - bench.leftSlitLightMesh.position.z);
  const caliperSpanSmall = Math.abs(bench.rightOrder1CaliperMesh.position.x - bench.leftOrder1CaliperMesh.position.x);

  bench.setSlitDistance(0.50);
  const s1s2SpanLarge = Math.abs(bench.rightSlitLightMesh.position.z - bench.leftSlitLightMesh.position.z);
  const caliperSpanLarge = Math.abs(bench.rightOrder1CaliperMesh.position.x - bench.leftOrder1CaliperMesh.position.x);

  assert(s1s2SpanLarge > s1s2SpanSmall, 'Wider double-slit spacing d must physically separate S1 and S2 in 3D');
  assert(caliperSpanSmall > caliperSpanLarge, 'Smaller d produces wider fringe spacing Delta y, moving bezel vernier calipers further apart');

  exp.dispose(mockContext);
  console.log('✓ Test 13 passed: Double-slit S1/S2 kinematics & bezel vernier caliper synchronization verified\n');
}

// -------------------------------------------------------------
// Test 14: Pure Large Deep-Colored Slit Value Text Invariant (No Square UI / Card Border)
// -------------------------------------------------------------
{
  console.log('Test 14: Pure Large Deep-Colored Slit Value Text Invariant (No Square UI / Card Border)');
  const exp = new OpticsDoubleSlitExperiment();
  const mockContext = { scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(), setParameter: () => {} } as any;
  exp.init(mockContext);

  const bench = exp.getBench();

  let foundSprite: THREE.Sprite | null = null;
  bench.group.traverse((obj) => {
    if (obj.name === 'SlitValueLabel' && (obj as any).isSprite) {
      foundSprite = obj as THREE.Sprite;
    }
  });
  assert.ok(foundSprite, 'SlitValueLabel Sprite must exist in bench hierarchy');

  let fillRectCalls = 0;
  let strokeRectCalls = 0;
  let lastFilledText = '';
  let lastFillStyle = '';

  const slitCanvas = (bench as any).slitPlateCanvas;
  const ctx = slitCanvas.getContext('2d');
  ctx.fillRect = () => { fillRectCalls++; };
  ctx.strokeRect = () => { strokeRectCalls++; };
  ctx.fillText = (text: string) => {
    lastFilledText = text;
    lastFillStyle = ctx.fillStyle;
  };

  bench.setSlitDistance(0.30);
  assert.strictEqual(fillRectCalls, 0, 'Must NOT draw any background fill rect');
  assert.strictEqual(strokeRectCalls, 0, 'Must NOT draw any border stroke rect');
  assert.ok(lastFilledText.includes('双缝 d = 0.30 mm'), `Label must display slit distance: ${lastFilledText}`);
  assert.strictEqual(lastFillStyle, '#0f172a', 'Text color must be deep dark slate (#0f172a)');

  exp.dispose(mockContext);
  console.log('✓ Test 14 passed: Pure large deep-colored slit value text invariant verified\n');
}

// -------------------------------------------------------------
// Test 15: High-Fidelity Knob Craftsmanship, Rotational Dynamics & Hover Prompt Lifecycle
// -------------------------------------------------------------
{
  console.log('Test 15: High-Fidelity Knob Craftsmanship, Rotational Dynamics & Hover Prompt Lifecycle');
  const exp = new OpticsDoubleSlitExperiment();
  const mockContext = { scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(), setParameter: () => {} } as any;
  exp.init(mockContext);

  const bench = exp.getBench();

  assert.ok(bench.micrometerHoverCue && bench.turretHoverCue, 'Native 3D hover cues must exist');
  assert.strictEqual(bench.group.getObjectByName('ScreenHandleTop'), undefined, 'No crude top cylinder on screen');
  assert(bench.micrometerKnob.children.length >= 10, 'Micrometer knob must have rich mechanical sub-features');
  assert(bench.turretWheel.children.length >= 10, 'Turret wheel must have rich mechanical sub-features');

  // Verify pre-contact hover cue visibility & post-contact permanent disappearance
  const raycaster = new THREE.Raycaster();
  const knobWorldPos = new THREE.Vector3();
  bench.micrometerKnob.getWorldPosition(knobWorldPos);
  raycaster.ray.origin.set(knobWorldPos.x, knobWorldPos.y, knobWorldPos.z + 0.5);
  raycaster.ray.direction.set(0, 0, -1);

  const preHover = exp.getHoverTarget(raycaster);
  assert.ok(preHover && preHover.label.length > 0, 'Hover prompt must appear before first contact');
  assert.strictEqual(bench.micrometerHoverCue.visible, true, '3D hover halo must be visible before first contact');

  const hitKnob = { object: bench.micrometerKnob, point: knobWorldPos } as any;
  exp.interactionManager.onPointerDown(new PointerEvent('pointerdown', { clientX: 300 } as any), hitKnob);
  assert.strictEqual(bench.micrometerHoverCue.visible, false, '3D hover halo must vanish upon interaction');

  exp.interactionManager.onPointerUp(new PointerEvent('pointerup'));
  const postHover = exp.getHoverTarget(raycaster);
  assert.strictEqual(postHover?.label, '', 'Hover prompt text must remain empty after interaction');
  assert.strictEqual(bench.micrometerHoverCue.visible, false, '3D hover halo must remain hidden after interaction');

  exp.dispose(mockContext);
  console.log('✓ Test 15 passed: High-fidelity knob craftsmanship & hover prompt lifecycle verified\n');
}

// -------------------------------------------------------------
// Test 16: 3D Wave Propagation & Huygens Dual-Source Wavefront Ripples ("波的形式" 区分特征)
// -------------------------------------------------------------
{
  console.log('Test 16: 3D Wave Propagation & Huygens Dual-Source Wavefront Ripples');
  const exp = new OpticsDoubleSlitExperiment();
  const mockContext = { scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(), setParameter: () => {} } as any;
  exp.init(mockContext);

  const bench = exp.getBench();

  // 1. Verify original realistic collimated laser beams & constructive order rays are 100% preserved
  assert.strictEqual(bench.preBeamMesh.name, 'CollimatedLaserCoreBeam');
  assert.strictEqual(bench.preBeamHaloMesh.name, 'CollimatedLaserHaloBeam');
  const k0Ray = bench.interferenceRaysGroup.getObjectByName('ConstructiveOrderRay_k0') as THREE.Mesh;
  assert.ok(k0Ray, 'Central k=0 constructive interference straight laser ray must exist');

  // 2. Verify overlaid pre-slit traveling sinusoidal wave ribbon & electric field vector comb exist
  assert.strictEqual(bench.incidentWaveRibbonMesh.name, 'IncidentSinusoidalWaveRibbon');
  assert.strictEqual(bench.incidentWaveVectorsMesh.name, 'IncidentElectricFieldVectors');

  // 3. Verify near-slit Huygens dual-source concentric wavefront ripple rings exist (S1 & S2)
  assert.ok(bench.wavefrontArcsGroup, 'HuygensWavefrontRipplesGroup must exist');
  assert.strictEqual(bench.wavefrontArcsGroup.name, 'HuygensWavefrontRipplesGroup');
  assert(bench.wavefrontArcsGroup.children.length >= 12, 'Must have at least 6 pairs of concentric wavefront arcs for S1 & S2');

  // 4. Verify real-time wave phase propagation animates sinusoidal vertices and expanding wavefront radii
  const wavePosAttr = bench.incidentWaveRibbonMesh.geometry.getAttribute('position') as THREE.BufferAttribute;
  const sampleVertexIndex = 14 * 6 + 1; // Y coordinate of an intermediate wave ribbon vertex
  const yBefore = (wavePosAttr.array as Float32Array)[sampleVertexIndex];

  const ring0 = bench.wavefrontArcsGroup.children[0] as THREE.Mesh;
  const scaleBefore = ring0.scale.x;

  exp.update(0.05, 0.05, mockContext);

  const yAfter = (wavePosAttr.array as Float32Array)[sampleVertexIndex];
  const scaleAfter = ring0.scale.x;

  assert.notStrictEqual(yBefore, yAfter, 'Propagating sinusoidal wave ribbon vertices must oscillate with time');
  assert.notStrictEqual(scaleBefore, scaleAfter, 'Huygens concentric wavefront ripple rings must expand outward with time');

  exp.dispose(mockContext);
  console.log('✓ Test 16 passed: 3D wave propagation & Huygens dual-source wavefront ripples verified\n');
}

console.log('========================================================');
console.log('All Young\'s Double-Slit Interference Tests Passed (16/16)!');
console.log('========================================================\n');
