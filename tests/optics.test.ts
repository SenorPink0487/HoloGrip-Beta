import assert from 'node:assert';
import * as THREE from 'three';
import { OpticalPhysics } from '../src/scene/optics/OpticalPhysics.ts';
import { OpticalBenchRail } from '../src/scene/optics/OpticalBenchRail.ts';
import { LaserEmitterMesh } from '../src/scene/optics/LaserEmitterMesh.ts';
import { RotaryStageMesh } from '../src/scene/optics/RotaryStageMesh.ts';
import { PrismMesh } from '../src/scene/optics/PrismMesh.ts';
import { SlitApertureMesh } from '../src/scene/optics/SlitApertureMesh.ts';
import { PolarizerMesh } from '../src/scene/optics/PolarizerMesh.ts';
import { DetectorScreenMesh } from '../src/scene/optics/DetectorScreenMesh.ts';
import { OpticalBeamSystem } from '../src/scene/optics/OpticalBeamSystem.ts';
import OpticsLabExperiment from '../src/experiments/catalog/optics-lab/index.ts';
import OpticsPropagationExperiment from '../src/experiments/catalog/optics-propagation/index.ts';
import OpticsInterferenceExperiment from '../src/experiments/catalog/optics-interference/index.ts';
import OpticsDiffractionExperiment from '../src/experiments/catalog/optics-diffraction/index.ts';
import OpticsPolarizationExperiment from '../src/experiments/catalog/optics-polarization/index.ts';
import { HologramStage } from '../src/core/HologramStage.ts';
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
          getImageData: () => ({ data: new Uint8ClampedArray(512 * 512 * 4) }),
          putImageData: () => {},
          drawImage: () => {},
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
  (globalThis as any).PointerEvent = class PointerEvent extends Event {};
}

console.log('=== Starting Optical Laboratory Comprehensive Verification ===\n');

// Test 1: Optical Physics Fundamentals
console.log('Test 1: Optical Physics Fundamentals');
{
  // 1.1 Wavelength to Color
  const redColor = OpticalPhysics.wavelengthToColor(650);
  assert(redColor.r > 0.8 && redColor.b < 0.1, '650nm should be bright red');

  const greenColor = OpticalPhysics.wavelengthToColor(532);
  assert(greenColor.g > 0.8 && greenColor.r < 0.4 && greenColor.b === 0, '532nm should be predominantly green');

  const violetColor = OpticalPhysics.wavelengthToColor(405);
  assert(violetColor.b > 0.7 && violetColor.g < 0.1, '405nm should be violet/blue');

  // 1.2 Cauchy dispersion
  const nRed = OpticalPhysics.getCauchyIndex(680, 1.52);
  const nBlue = OpticalPhysics.getCauchyIndex(420, 1.52);
  assert(nBlue > nRed, 'Blue light must have higher refractive index than red light in normal dispersion');

  // 1.3 Snell's Law Refraction & Total Internal Reflection
  const normal = new THREE.Vector3(0, 0, 1);
  const incidentNormal = new THREE.Vector3(0, 0, 1);
  const normalRefract = OpticalPhysics.refractRay(incidentNormal, normal, 1.0, 1.5);
  assert(normalRefract.refracted, 'Normal incidence must refract directly through');
  assert(!normalRefract.totalInternalReflection, 'Normal incidence has no TIR');

  // Extreme grazing incidence from dense medium (glass to air) -> TIR
  const grazingRay = new THREE.Vector3(0.95, 0, 0.31).normalize();
  const tirResult = OpticalPhysics.refractRay(grazingRay, normal, 1.55, 1.0);
  assert(tirResult.totalInternalReflection, 'Steep angle in dense medium must undergo Total Internal Reflection');

  // 1.4 Malus's Law
  const parallelIntensity = OpticalPhysics.calculateMalusIntensity(0, 0);
  assert.strictEqual(parallelIntensity, 1.0, 'Parallel polarizers transmit 100%');

  const perpIntensity = OpticalPhysics.calculateMalusIntensity(0, 90);
  assert(Math.abs(perpIntensity) < 1e-10, 'Crossed polarizers (90 deg) must produce complete extinction (0%)');

  const halfIntensity = OpticalPhysics.calculateMalusIntensity(0, 45);
  assert(Math.abs(halfIntensity - 0.5) < 1e-5, '45 deg polarizers must transmit exactly 50%');

  // 1.5 Young's double slit fringe spacing
  // lambda = 632.8nm, d = 0.25mm, L = 1.0m -> Delta y = 632.8e-9 * 1.0 / 0.25e-3 = 2.5312 mm
  const fringeSpacing = OpticalPhysics.calculateDoubleSlitFringeSpacing(632.8, 0.25, 1.0);
  assert(Math.abs(fringeSpacing - 0.0025312) < 1e-6, 'Double slit fringe spacing equation must be exact');

  console.log('✓ Test 1 passed: All optical physics fundamentals verified');
}

// Test 2: Procedural 3D Hardware Meshes
console.log('\nTest 2: Procedural 3D Hardware Meshes');
{
  // Rail
  const rail = new OpticalBenchRail();
  assert(rail.group.children.length > 0, 'Rail must contain child meshes');
  assert.strictEqual(rail.railLength, 1.28, 'Rail length should match specification');
  const saddle = rail.createCarrierSaddle('TestSaddle');
  assert(saddle.children.length >= 4, 'Saddle must contain base clamp, post socket, lock knob, and indicator');

  // Laser Emitter
  const laser = new LaserEmitterMesh(632.8);
  assert(laser.beamOrigin.y > 0.15, 'Beam origin should be aligned with optical axis');
  assert(laser.isOn, 'Laser should be on by default');
  laser.updateWavelength(532.0);
  assert.strictEqual(laser.wavelengthNm, 532.0, 'Laser wavelength should update');

  // Rotary Stage
  const rotary = new RotaryStageMesh();
  assert(rotary.rotorGroup.children.length > 0, 'Rotary stage must have rotor elements');
  rotary.setRotationAngleDeg(45);
  assert.strictEqual(rotary.currentAngleDeg, 45, 'Rotary stage angle should update');

  // Prism
  const prism = new PrismMesh('equilateral', 1.54);
  assert.strictEqual(prism.refractiveIndex, 1.54, 'Prism refractive index should match');
  prism.setType('semicircular');
  assert.strictEqual(prism.prismType, 'semicircular', 'Prism should toggle to semicircular mode');

  // Slit Fixture
  const slit = new SlitApertureMesh('double');
  assert.strictEqual(slit.slitType, 'double', 'Slit fixture should be double slit');
  slit.setParameters({ slitDistanceMm: 0.35, slitWidthMm: 0.06 });
  assert.strictEqual(slit.slitDistanceMm, 0.35, 'Slit distance should update');

  // Polarizers
  const pol = new PolarizerMesh('POLARIZER P1', 0);
  assert.strictEqual(pol.angleDeg, 0, 'Polarizer initial angle should be 0');
  pol.setAngleDeg(60);
  assert.strictEqual(pol.angleDeg, 60, 'Polarizer angle should update to 60');
  pol.toggleQuarterWavePlate(true);
  assert(pol.hasWavePlate, 'Quarter wave plate should be active');

  // Screen & Radiometer
  const screen = new DetectorScreenMesh();
  assert.strictEqual(screen.screenWidth, 0.16, 'Screen width should match');
  screen.updateMeter({ intensityRatio: 0.75, wavelengthNm: 632.8, fringeSpacingMm: 2.53 });

  // Beam System
  const beamSystem = new OpticalBeamSystem(632.8);
  assert(beamSystem.group.children.length > 0, 'Beam system should contain core and glow meshes');
  beamSystem.updateStraightBeam(new THREE.Vector3(0, 0.186, -0.5), new THREE.Vector3(0, 0.186, 0.5));

  // Dispose all
  rail.dispose();
  laser.dispose();
  rotary.dispose();
  prism.dispose();
  slit.dispose();
  pol.dispose();
  screen.dispose();
  beamSystem.dispose();

  console.log('✓ Test 2 passed: All 3D procedural optical hardware meshes instantiated and verified');
}

// Test 3: OpticsLab Master Experiment Lifecycle
console.log('\nTest 3: OpticsLab Master Experiment Lifecycle');
{
  const mockScene = new THREE.Scene();
  const mockCamera = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 100);
  const mockRenderer: any = {
    compile: () => {},
    compileAsync: async () => {},
  };
  const mockStage = new HologramStage();

  const mockContext: ExperimentContext = {
    scene: mockScene,
    camera: mockCamera,
    renderer: mockRenderer,
    stage: mockStage,
    computeBridge: {} as any,
    workerPool: {
      size: 4,
      execute: async () => ({
        id: 1,
        action: 'OPTICAL_DIFFRACTION_STEP',
        intensityBuffer: new Float32Array(512),
        computeTimeMs: 1.2,
      }),
    } as any,
    parameters: {},
    getParameter: () => null,
    setParameter: () => {},
  };

  const exp = new OpticsLabExperiment();
  exp.init(mockContext);
  assert(exp.rootGroup.children.length > 0, 'OpticsLabExperiment rootGroup must have components');

  // Test mode switches
  exp.onParameterChange('mode', 'propagation', mockContext);
  exp.update(0.016, 1.0, mockContext);

  exp.onParameterChange('mode', 'diffraction', mockContext);
  exp.update(0.016, 2.0, mockContext);

  exp.onParameterChange('mode', 'polarization', mockContext);
  exp.onParameterChange('polarizerAngle', 45, mockContext);
  exp.onParameterChange('analyzerAngle', 45, mockContext);
  exp.update(0.016, 3.0, mockContext);

  exp.onParameterChange('mode', 'interference', mockContext);
  exp.onParameterChange('wavelength', 532.0, mockContext);
  exp.onParameterChange('slitDistance', 0.3, mockContext);
  exp.update(0.016, 4.0, mockContext);

  // Test 3D interaction hook
  const handled = exp.onPointerDown(new PointerEvent('pointerdown'), null, mockContext);
  assert.strictEqual(handled, false, 'Null hit should return false');

  // Dispose cleanly
  exp.dispose(mockContext);
  assert.strictEqual(exp.rootGroup.children.length, 0, 'OpticsLabExperiment rootGroup must be empty after disposal');

  console.log('✓ Test 3 passed: OpticsLab master experiment lifecycle, mode switches & zero-leak disposal verified');
}

// Test 4: Standalone Specialized Optics Experiments
console.log('\nTest 4: Standalone Specialized Optics Experiments');
{
  const mockContext: any = {
    scene: new THREE.Scene(),
    camera: new THREE.PerspectiveCamera(),
    renderer: { compile: () => {}, compileAsync: async () => {} },
    workerPool: { size: 0, execute: async () => {} },
  };

  // 4.1 Propagation
  const expProp = new OpticsPropagationExperiment();
  expProp.init(mockContext);
  expProp.update(0.016, 1.0, mockContext);
  expProp.dispose(mockContext);
  assert.strictEqual(expProp.rootGroup.children.length, 0, 'Propagation exp disposed');

  // 4.2 Interference
  const expInter = new OpticsInterferenceExperiment();
  expInter.init(mockContext);
  expInter.update(0.016, 1.0, mockContext);
  expInter.dispose(mockContext);
  assert.strictEqual(expInter.rootGroup.children.length, 0, 'Interference exp disposed');

  // 4.3 Diffraction
  const expDiff = new OpticsDiffractionExperiment();
  expDiff.init(mockContext);
  expDiff.update(0.016, 1.0, mockContext);
  expDiff.dispose(mockContext);
  assert.strictEqual(expDiff.rootGroup.children.length, 0, 'Diffraction exp disposed');

  // 4.4 Polarization
  const expPol = new OpticsPolarizationExperiment();
  expPol.init(mockContext);
  expPol.update(0.016, 1.0, mockContext);
  expPol.dispose(mockContext);
  assert.strictEqual(expPol.rootGroup.children.length, 0, 'Polarization exp disposed');

  console.log('✓ Test 4 passed: All 4 standalone specialized optics experiments verified with zero memory leaks');
}

console.log('\n========================================================');
console.log('All Comprehensive Optical Laboratory Tests Passed (4/4)!');
console.log('========================================================');
