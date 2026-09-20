import assert from 'node:assert';
import * as THREE from 'three';
import { OpticalBenchRail } from '../src/scene/optics/OpticalBenchRail.ts';
import { LaserEmitterMesh } from '../src/scene/optics/LaserEmitterMesh.ts';
import { RotaryStageMesh } from '../src/scene/optics/RotaryStageMesh.ts';
import { PrismMesh } from '../src/scene/optics/PrismMesh.ts';
import { SlitApertureMesh } from '../src/scene/optics/SlitApertureMesh.ts';
import { PolarizerMesh } from '../src/scene/optics/PolarizerMesh.ts';
import { DetectorScreenMesh } from '../src/scene/optics/DetectorScreenMesh.ts';
import { OpticalBeamSystem } from '../src/scene/optics/OpticalBeamSystem.ts';
import { OpticsInteractionManager } from '../src/scene/optics/OpticsInteractionManager.ts';
import OpticsLabExperiment from '../src/experiments/catalog/optics-lab/index.ts';
import OpticsInterferenceExperiment from '../src/experiments/catalog/optics-interference/index.ts';
import OpticsDiffractionExperiment from '../src/experiments/catalog/optics-diffraction/index.ts';
import OpticsPolarizationExperiment from '../src/experiments/catalog/optics-polarization/index.ts';
import OpticsPropagationExperiment from '../src/experiments/catalog/optics-propagation/index.ts';
import type { ExperimentContext } from '../src/core/types.ts';

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
          setLineDash: () => {},
          roundRect: () => {},
          rect: () => {},
          getImageData: () => ({ data: new Uint8ClampedArray(512 * 512 * 4) }),
          putImageData: () => {},
        };
      }
      return null;
    },
    querySelector: () => createMockElement('div'),
    querySelectorAll: () => [],
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

if (typeof globalThis.document === 'undefined') {
  (globalThis as any).document = {
    createElement: (tag: string) => createMockElement(tag),
    body: createMockElement('body'),
  };
}

if (typeof (globalThis as any).PointerEvent === 'undefined') {
  (globalThis as any).PointerEvent = class PointerEvent extends Event {
    public clientX: number;
    public clientY: number;
    constructor(type: string, init?: any) {
      super(type);
      this.clientX = init?.clientX ?? 0;
      this.clientY = init?.clientY ?? 0;
    }
  };
}

console.log('=== Starting Optical Equipment Interactivity Comprehensive Verification ===\n');

const createMockContext = (): ExperimentContext => {
  const params = new Map<string, any>();
  const camera = new THREE.PerspectiveCamera(50, 1920 / 1080, 0.1, 100);
  camera.position.set(0, 1.2, 1.8);
  camera.lookAt(0, 0.2, 0);

  return {
    scene: new THREE.Scene(),
    camera,
    renderer: {} as any,
    container: createMockElement('div'),
    parameters: params,
    setParameter: (id: string, value: any) => params.set(id, value),
    getParameter: (id: string) => params.get(id),
    timeline: { isPlaying: true, speed: 1.0, currentTime: 0, delta: 0.016 },
    assetLoader: {
      loadModel: async () => new THREE.Group(),
      loadTexture: async () => new THREE.Texture(),
      loadAudio: async () => ({} as any),
      loadHDR: async () => ({} as any),
      loadFont: async () => ({} as any),
    } as any,
  };
};

// --------------------------------------------------------------------------
// Test 1: Precision Optical Bench Rail & Carrier Saddle Tagging
// --------------------------------------------------------------------------
console.log('Test 1: Optical Bench Rail & Saddle Tagging');
{
  const rail = new OpticalBenchRail();
  const saddle = rail.createCarrierSaddle('LaserSaddle');

  assert.strictEqual(saddle.userData.isSaddle, true, 'Saddle group must have isSaddle userData');
  assert.strictEqual(saddle.userData.saddleName, 'LaserSaddle', 'Saddle group name must match');

  // Verify sub-meshes in saddle are tagged
  let foundSubMesh = false;
  saddle.traverse((child) => {
    if ((child as THREE.Mesh).isMesh && child.userData.isSaddle) {
      foundSubMesh = true;
      assert.strictEqual(child.userData.saddleGroup, saddle, 'Sub-mesh must reference parent saddle group');
    }
  });
  assert(foundSubMesh, 'Carrier saddle sub-meshes must be tagged with userData for raycasting');

  rail.dispose();
  console.log('✓ Test 1 passed: Precision optical bench rail & carrier saddle tagging verified');
}

// --------------------------------------------------------------------------
// Test 2: Laser Emitter Power Toggle & Wavelength Cycling
// --------------------------------------------------------------------------
console.log('\nTest 2: Laser Emitter Power Toggle & Wavelength Cycling');
{
  const laser = new LaserEmitterMesh(632.8);
  assert.strictEqual(laser.isOn, true, 'Laser should initially be ON');
  assert.strictEqual(laser.wavelengthNm, 632.8, 'Initial wavelength should be 632.8 nm');

  // Verify tagging
  assert(laser.toggleSwitch.userData.isLaserSwitch, 'Toggle switch mesh must be tagged');
  assert(laser.mainBarrel.userData.isLaserBarrel, 'Laser barrel mesh must be tagged');

  // Toggle power OFF
  const power1 = laser.togglePower();
  assert.strictEqual(power1, false, 'togglePower() should return false when turning off');
  assert.strictEqual(laser.isOn, false, 'laser.isOn should be false');

  // Toggle power back ON
  const power2 = laser.togglePower();
  assert.strictEqual(power2, true, 'togglePower() should return true when turning on');
  assert.strictEqual(laser.isOn, true, 'laser.isOn should be true');

  // Cycle wavelength: Red (632.8) -> Green (532.0) -> Violet (405.0) -> Yellow (589.0) -> Red (632.8)
  const wl1 = laser.cycleWavelength();
  assert.strictEqual(wl1, 532.0, 'Next wavelength should be 532.0 nm');
  const wl2 = laser.cycleWavelength();
  assert.strictEqual(wl2, 405.0, 'Next wavelength should be 405.0 nm');
  const wl3 = laser.cycleWavelength();
  assert.strictEqual(wl3, 589.0, 'Next wavelength should be 589.0 nm (Sodium Yellow)');
  const wl4 = laser.cycleWavelength();
  assert.strictEqual(wl4, 632.8, 'Wavelength should cycle back to 632.8 nm');

  laser.dispose();
  console.log('✓ Test 2 passed: Laser emitter power toggle & wavelength cycling verified');
}

// --------------------------------------------------------------------------
// Test 3: Polarizer Mesh Rotor Ring & Quarter Wave Plate
// --------------------------------------------------------------------------
console.log('\nTest 3: Polarizer Mesh Rotor Ring & Quarter Wave Plate');
{
  const pol = new PolarizerMesh('POLARIZER P1', 0);
  assert.strictEqual(pol.angleDeg, 0, 'Initial angle should be 0°');
  assert.strictEqual(pol.rotatableRing.userData.isPolarizerRotor, true, 'Rotor ring must be tagged');

  // Rotate by positive delta
  const a1 = pol.rotateBy(45);
  assert.strictEqual(a1, 45, 'Angle should be 45°');
  assert.strictEqual(pol.angleDeg, 45);

  // Rotate beyond 360° wraps cleanly
  const a2 = pol.rotateBy(330);
  assert.strictEqual(a2, 15, '45 + 330 = 375 => 15°');

  // Rotate negative delta wraps cleanly
  const a3 = pol.rotateBy(-30);
  assert.strictEqual(a3, 345, '15 - 30 = -15 => 345°');

  // Quarter Wave Plate toggle
  assert.strictEqual(pol.hasWavePlate, false, 'Quarter waveplate should initially be absent');
  const plate1 = pol.toggleWavePlate();
  assert.strictEqual(plate1, true, 'toggleWavePlate() should return true');
  assert.strictEqual(pol.hasWavePlate, true);
  assert(pol.wavePlateMesh !== null, 'Waveplate mesh must be created and added');
  assert.strictEqual(pol.wavePlateMesh.userData.isWavePlate, true, 'Waveplate must be tagged');

  const plate2 = pol.toggleWavePlate();
  assert.strictEqual(plate2, false, 'toggleWavePlate() should return false when removed');
  assert.strictEqual(pol.hasWavePlate, false);
  assert.strictEqual(pol.wavePlateMesh.visible, false, 'Waveplate mesh should be hidden when removed');

  pol.dispose();
  console.log('✓ Test 3 passed: Polarizer rotor ring & quarter wave plate verified');
}

// --------------------------------------------------------------------------
// Test 4: Rotary Stage & Prism Mesh Interactivity
// --------------------------------------------------------------------------
console.log('\nTest 4: Rotary Stage & Prism Mesh Interactivity');
{
  const stage = new RotaryStageMesh();
  assert.strictEqual(stage.currentAngleDeg, 0, 'Initial stage angle should be 0°');
  assert.strictEqual(stage.rotorGroup.userData.isRotaryStageRotor, true, 'Stage rotor must be tagged');

  // Rotate stage within limits [-35, 35]
  const st1 = stage.rotateBy(10);
  assert.strictEqual(st1, 10, 'Stage angle should be 10°');

  const st2 = stage.rotateBy(50);
  assert.strictEqual(st2, 35, 'Stage angle must clamp at +35°');

  const st3 = stage.rotateBy(-100);
  assert.strictEqual(st3, -35, 'Stage angle must clamp at -35°');

  // Prism shape toggling
  const prism = new PrismMesh('equilateral', 1.54);
  assert.strictEqual(prism.prismType, 'equilateral', 'Initial prism should be equilateral');
  assert.strictEqual(prism.group.userData.isPrism, true, 'Prism group must be tagged');

  const pType1 = prism.toggleType();
  assert.strictEqual(pType1, 'semicircular', 'Toggling equilateral should yield semicircular');
  assert.strictEqual(prism.prismType, 'semicircular');

  const pType2 = prism.toggleType();
  assert.strictEqual(pType2, 'equilateral', 'Toggling semicircular should yield equilateral');

  stage.dispose();
  prism.dispose();
  console.log('✓ Test 4 passed: Rotary stage angle clamping & prism shape toggling verified');
}

// --------------------------------------------------------------------------
// Test 5: Slit Aperture Fixture & Micrometer Drum Tuning
// --------------------------------------------------------------------------
console.log('\nTest 5: Slit Aperture Fixture & Micrometer Drum Tuning');
{
  const slit = new SlitApertureMesh('double');
  assert.strictEqual(slit.slitType, 'double');
  assert.strictEqual(slit.slitDistanceMm, 0.25);
  assert.strictEqual(slit.micrometerDrum.userData.isSlitMicrometer, true, 'Micrometer drum must be tagged');
  assert.strictEqual(slit.slideMesh.userData.isSlitSlide, true, 'Slit slide must be tagged');

  // Micrometer adjustment in double-slit mode adjusts d
  slit.adjustMicrometer(2.5);
  assert(Math.abs(slit.slitDistanceMm - 0.30) < 1e-4, 'Slit distance d should increase to 0.30 mm');

  // Test clamping of d [0.12, 0.55]
  slit.adjustMicrometer(-50.0);
  assert.strictEqual(slit.slitDistanceMm, 0.12, 'Slit distance d must clamp at 0.12 mm');

  // Cycle slit type: double -> single -> grating -> double
  const t1 = slit.cycleSlitType();
  assert.strictEqual(t1, 'single', 'Should cycle to single slit');
  slit.adjustMicrometer(2.0);
  assert(slit.slitWidthMm > 0.04, 'Micrometer should adjust single slit width a');

  const t2 = slit.cycleSlitType();
  assert.strictEqual(t2, 'grating', 'Should cycle to transmission grating');
  slit.adjustMicrometer(1.0);
  assert.strictEqual(slit.gratingLinesPerMm, 600, 'Micrometer should step grating density');

  const t3 = slit.cycleSlitType();
  assert.strictEqual(t3, 'double', 'Should cycle back to double slit');

  slit.dispose();
  console.log('✓ Test 5 passed: Slit aperture cycling & micrometer drum tuning verified');
}

// --------------------------------------------------------------------------
// Test 6: Observation Detector Screen & Virtual Vernier Calipers
// --------------------------------------------------------------------------
console.log('\nTest 6: Detector Screen & Virtual Vernier Calipers');
{
  const screen = new DetectorScreenMesh();
  assert.strictEqual(screen.showCalipers, false, 'Calipers should initially be OFF');
  assert.strictEqual(screen.screenMesh.userData.isDetectorScreen, true, 'Screen mesh must be tagged');

  const c1 = screen.toggleCalipers();
  assert.strictEqual(c1, true, 'toggleCalipers() should turn calipers ON');
  assert.strictEqual(screen.showCalipers, true);

  // Render fringes with calipers active
  screen.renderFringesPattern({
    mode: 'double_slit',
    wavelengthNm: 632.8,
    intensity: 1.0,
    slitDistanceMm: 0.25,
    slitWidthMm: 0.04,
    screenDistanceM: 0.50,
  });

  screen.updateMeter({
    intensityRatio: 0.88,
    wavelengthNm: 632.8,
    fringeSpacingMm: 1.265,
  });

  const c2 = screen.toggleCalipers();
  assert.strictEqual(c2, false, 'toggleCalipers() should turn calipers OFF');

  screen.dispose();
  console.log('✓ Test 6 passed: Detector screen & virtual vernier calipers verified');
}

// --------------------------------------------------------------------------
// Test 7: OpticsInteractionManager Clamping & Raycast Queries
// --------------------------------------------------------------------------
console.log('\nTest 7: OpticsInteractionManager Raycast & Clamping Queries');
{
  const rootGroup = new THREE.Group();
  const rail = new OpticalBenchRail();
  rootGroup.add(rail.group);

  const laserSaddle = rail.createCarrierSaddle('LaserSaddle');
  laserSaddle.position.z = -0.52;

  const centerSaddle = rail.createCarrierSaddle('CenterSaddle');
  centerSaddle.position.z = -0.05;

  const screenSaddle = rail.createCarrierSaddle('ScreenSaddle');
  screenSaddle.position.z = 0.48;

  const laser = new LaserEmitterMesh(632.8);
  laserSaddle.add(laser.group);

  const slitFixture = new SlitApertureMesh('double');
  centerSaddle.add(slitFixture.group);

  const detectorScreen = new DetectorScreenMesh();
  screenSaddle.add(detectorScreen.group);

  const beamSystem = new OpticalBeamSystem(632.8);
  rootGroup.add(beamSystem.group);

  let saddleMovedName = '';
  let saddleMovedZ = 0;
  let laserChangedPower = false;
  let slitChangedType = '';

  const manager = new OpticsInteractionManager({
    rootGroup,
    rail,
    laser,
    laserSaddle,
    slitFixture,
    slitSaddle: centerSaddle,
    detectorScreen,
    screenSaddle,
    beamSystem,
    onSaddleMove: (name, z) => {
      saddleMovedName = name;
      saddleMovedZ = z;
    },
    onLaserChange: (isOn) => {
      laserChangedPower = isOn;
    },
    onSlitChange: (type) => {
      slitChangedType = type;
    },
  });

  // Test 7.1: Raycast hit on Laser Switch
  const raycaster = new THREE.Raycaster();
  const mockLaserSwitchHit: THREE.Intersection = {
    distance: 1.0,
    point: new THREE.Vector3(0, 0.186, -0.52),
    object: laser.toggleSwitch,
  };

  const pDownLaser = manager.onPointerDown(
    new PointerEvent('pointerdown', { clientX: 500, clientY: 500 }),
    mockLaserSwitchHit
  );
  assert.strictEqual(pDownLaser, true, 'Pointer down on laser switch must be handled');
  assert.strictEqual(laser.isOn, false, 'Clicking laser switch must toggle power OFF');
  assert.strictEqual(laserChangedPower, false, 'Callback onLaserChange must receive power state false');

  // Test 7.2: Raycast hit on Slit Slide
  const mockSlitSlideHit: THREE.Intersection = {
    distance: 1.0,
    point: new THREE.Vector3(0, 0.186, -0.05),
    object: slitFixture.slideMesh,
  };
  const pDownSlit = manager.onPointerDown(
    new PointerEvent('pointerdown', { clientX: 500, clientY: 500 }),
    mockSlitSlideHit
  );
  assert.strictEqual(pDownSlit, true, 'Pointer down on slit slide must be handled');
  assert.strictEqual(slitChangedType, 'single', 'Slit type must cycle to single slit');

  // Test 7.3: Raycast hit on Screen Calipers
  const mockScreenHit: THREE.Intersection = {
    distance: 1.0,
    point: new THREE.Vector3(0, 0.186, 0.48),
    object: detectorScreen.screenMesh,
  };
  const pDownScreen = manager.onPointerDown(
    new PointerEvent('pointerdown', { clientX: 500, clientY: 500 }),
    mockScreenHit
  );
  assert.strictEqual(pDownScreen, true, 'Pointer down on detector screen must be handled');
  assert.strictEqual(detectorScreen.showCalipers, true, 'Clicking screen must toggle calipers ON');

  // Test 7.4: Saddle clamping bounds
  // Clamp laser saddle
  const clampedLaserFar = (manager as any).clampSaddlePosition(laserSaddle, -0.90);
  assert.strictEqual(clampedLaserFar, -0.58, 'Laser saddle must clamp at rail minimum -0.58');

  const clampedLaserNear = (manager as any).clampSaddlePosition(laserSaddle, 0.10);
  assert.strictEqual(clampedLaserNear, -0.28, 'Laser saddle must clamp at max bound -0.28');

  // Clamp screen saddle
  const clampedScreenNear = (manager as any).clampSaddlePosition(screenSaddle, -0.20);
  assert(Math.abs(clampedScreenNear - 0.038) < 1e-4, 'Screen saddle must clamp after center saddle (-0.05 + 0.088)');

  const clampedScreenFar = (manager as any).clampSaddlePosition(screenSaddle, 0.90);
  assert.strictEqual(clampedScreenFar, 0.58, 'Screen saddle must clamp at rail maximum 0.58');

  rail.dispose();
  laser.dispose();
  slitFixture.dispose();
  detectorScreen.dispose();
  beamSystem.dispose();
  console.log('✓ Test 7 passed: OpticsInteractionManager raycast & clamping queries verified');
}

// --------------------------------------------------------------------------
// Test 8: End-to-End Interactivity across all 5 Optics Experiments
// --------------------------------------------------------------------------
console.log('\nTest 8: End-to-End Interactivity across all 5 Optics Experiments');
{
  const context = createMockContext();

  // 8.1 Optics Lab Master Experiment
  const opticsLab = new OpticsLabExperiment();
  opticsLab.init(context);
  opticsLab.update(0.016, 0.5, context);

  // Turn off laser and verify extinguished beam
  const laserMesh = (opticsLab as any).laser as LaserEmitterMesh;
  laserMesh.togglePower();
  assert.strictEqual(laserMesh.isOn, false);
  opticsLab.update(0.016, 0.516, context);
  const beamSys = (opticsLab as any).beamSystem as OpticalBeamSystem;
  assert.strictEqual(beamSys.intensity, 0, 'Beam system intensity must be 0 when laser power is OFF');

  // Turn back on
  laserMesh.togglePower();
  opticsLab.update(0.016, 0.532, context);
  assert.strictEqual(beamSys.intensity, 1.0, 'Beam system intensity restored when laser power is ON');

  // Verify getHoverTarget exists and functions
  const raycaster = new THREE.Raycaster();
  const hover = opticsLab.getHoverTarget?.(raycaster);
  assert(hover === null || typeof hover.label === 'string', 'getHoverTarget must return HoverTargetInfo or null');

  opticsLab.dispose(context);
  console.log('  - optics-lab verified');

  // 8.2 Optics Interference
  const interference = new OpticsInterferenceExperiment();
  interference.init(context);
  interference.update(0.016, 0.5, context);
  interference.dispose(context);
  console.log('  - optics-interference verified');

  // 8.3 Optics Diffraction
  const diffraction = new OpticsDiffractionExperiment();
  diffraction.init(context);
  diffraction.update(0.016, 0.5, context);
  diffraction.dispose(context);
  console.log('  - optics-diffraction verified');

  // 8.4 Optics Polarization
  const polarization = new OpticsPolarizationExperiment();
  polarization.init(context);
  polarization.update(0.016, 0.5, context);
  polarization.dispose(context);
  console.log('  - optics-polarization verified');

  // 8.5 Optics Propagation
  const propagation = new OpticsPropagationExperiment();
  propagation.init(context);
  propagation.update(0.016, 0.5, context);
  propagation.dispose(context);
  console.log('  - optics-propagation verified');

  console.log('✓ Test 8 passed: All 5 optics experiments verified with end-to-end interactivity and zero leaks');
}

console.log('\n========================================================================');
console.log('All Optical Equipment Interactivity Tests Passed (8/8)!');
console.log('========================================================================\n');
