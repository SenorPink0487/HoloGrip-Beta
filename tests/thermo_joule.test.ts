import assert from 'node:assert';
import * as THREE from 'three';

// Lightweight Canvas & DOM mock for Node.js test environment
class MockCanvasContext {
  public fillStyle: any = '';
  public strokeStyle: any = '';
  public lineWidth = 1;
  public font = '';
  public textAlign = '';
  public textBaseline = '';
  public shadowBlur = 0;
  public shadowColor = '';

  fillRect() {}
  strokeRect() {}
  clearRect() {}
  beginPath() {}
  moveTo() {}
  lineTo() {}
  stroke() {}
  fill() {}
  arc() {}
  fillText() {}
  save() {}
  restore() {}
  setLineDash() {}
}

class MockElement {
  public tagName: string;
  public width = 1024;
  public height = 512;

  constructor(tagName: string) {
    this.tagName = tagName.toUpperCase();
  }

  getContext(type: string) {
    if (type === '2d') {
      return new MockCanvasContext();
    }
    return null;
  }
}

if (typeof document === 'undefined') {
  (global as any).document = {
    createElement(tag: string) {
      return new MockElement(tag);
    },
    body: {
      style: {
        cursor: 'default',
      },
    },
  };
  (global as any).window = {
    innerWidth: 1920,
    innerHeight: 1080,
  };
}

import { metadata } from '../src/experiments/catalog/thermo-joule/meta.ts';
import { JouleDynamicsSolver } from '../src/physics/thermo/jouleDynamics.ts';
import { JouleApparatusMesh } from '../src/scene/thermo/JouleApparatusMesh.ts';
import ThermoJouleExperiment from '../src/experiments/catalog/thermo-joule/index.ts';

console.log("=== Starting Joule's Mechanical & Electrical Equivalent of Heat Tests ===\n");

// -----------------------------------------------------------------------------
// Test 1: Experiment Metadata and Specification Invariants
// -----------------------------------------------------------------------------
console.log('Test 1: Experiment Metadata Invariants');
assert.strictEqual(metadata.id, 'thermo-joule', 'ID must be thermo-joule');
assert.strictEqual(metadata.category, 'thermodynamics', 'Category must be thermodynamics');
assert(metadata.name.includes('焦耳') && metadata.name.includes('热功当量'), 'Name must include 焦耳 and 热功当量');
assert(metadata.equation?.includes('4.186'), 'Equation must express J = 4.186 J/cal');
const requiredParams = [
  'operationMode',
  'fluidType',
  'weightMassKg',
  'weightHeightM',
  'bafflesEngaged',
  'heaterActive',
  'currentAmp',
  'insulationMode',
  'releaseDrop',
  'resetExperiment',
];
for (const paramId of requiredParams) {
  assert(
    metadata.parameters.some((p) => p.id === paramId),
    `Metadata must include parameter: ${paramId}`
  );
}
console.log('✓ Test 1 passed: Metadata and parameter definitions verified\n');

// -----------------------------------------------------------------------------
// Test 2: Joule Mechanical Work, Baffle Shear & Heat Capacity Physics
// -----------------------------------------------------------------------------
console.log('Test 2: JouleDynamicsSolver - Mechanical Work & Stator Baffle Physics');
const solver = new JouleDynamicsSolver();

// Initial state verification
let t0 = solver.getTelemetry();
assert.strictEqual(t0.weightHeightM, 1.2, 'Initial weight height must be 1.20 m');
assert.strictEqual(t0.temperatureC, 20.0, 'Initial temperature must be 20.000 ℃');
assert.strictEqual(t0.bafflesEngaged, true, 'Stator baffles must be engaged by default');

// 2a: Full drop with Stator Baffles ENGAGED (100% turbulent shear conversion)
solver.releaseClutchDrop();
assert.strictEqual(solver.isDropping, true, 'Weights must enter dropping state');

for (let i = 0; i < 200; i++) {
  solver.update(0.025);
}

const tDropEngaged = solver.getTelemetry();
assert.strictEqual(tDropEngaged.weightHeightM, 0.0, 'Weights must reach bottom h = 0.0 m');
assert.strictEqual(tDropEngaged.dropCount, 1, 'Drop count must increment to 1');
const expectedWork1 = 2 * 6.0 * JouleDynamicsSolver.GRAVITY * 1.2; // ~141.216 J
assert(
  Math.abs(tDropEngaged.mechanicalWorkJ - expectedWork1) < 0.05,
  `Mechanical work (${tDropEngaged.mechanicalWorkJ.toFixed(2)} J) must match 2mgh (${expectedWork1.toFixed(2)} J)`
);
assert(
  Math.abs(tDropEngaged.measuredJouleEquivalent - 4.186) < 0.005,
  `Measured Joule equivalent (${tDropEngaged.measuredJouleEquivalent.toFixed(3)}) must equal 4.186 J/cal`
);
const waterDeltaT = tDropEngaged.deltaTC;
assert(waterDeltaT > 0.4, `Water temperature rise (${waterDeltaT.toFixed(3)} ℃) must be ~0.422 ℃`);

// 2b: Compare with Stator Baffles DISENGAGED (fluid spins into vortex, less immediate ΔT)
solver.reset();
solver.bafflesEngaged = false;
solver.releaseClutchDrop();
for (let i = 0; i < 12; i++) {
  solver.update(0.02);
}
const tMidDisengaged = solver.getTelemetry();
assert(
  tMidDisengaged.vortexKineticEnergyJ > 1.0,
  'Disengaged stator baffles must trap energy in macroscopic fluid vortex kinetic energy'
);

// 2c: Compare specific heat capacity with Kerosene (c = 2100 vs Water c = 4186)
solver.reset();
solver.setFluidType('kerosene');
solver.releaseClutchDrop();
for (let i = 0; i < 200; i++) {
  solver.update(0.025);
}
const keroseneDeltaT = solver.getTelemetry().deltaTC;
assert(
  Math.abs(keroseneDeltaT / waterDeltaT - 4186 / 2100) < 0.02,
  `Kerosene ΔT (${keroseneDeltaT.toFixed(3)}℃) must scale inversely with specific heat c compared to water (${waterDeltaT.toFixed(3)}℃)`
);
console.log('✓ Test 2 passed: Mechanical work, stator baffle shear, and specific heat verified\n');

// -----------------------------------------------------------------------------
// Test 3: Electrical Joule Heating & Work-Heat Equivalence Benchmark
// -----------------------------------------------------------------------------
console.log('Test 3: Electrical Joule Heating (W = I²Rt) & Equivalence Benchmark');
solver.reset();
solver.setFluidType('water');
solver.setOperationMode('equivalence_benchmark');

// Run through both mechanical drop phase and electrical heating phase
for (let i = 0; i < 450; i++) {
  solver.update(0.025);
}

const tBench = solver.getTelemetry();
assert.strictEqual(tBench.benchmarkStage, 'complete', 'Equivalence benchmark must complete both phases');
assert(
  Math.abs(tBench.mechanicalWorkJ - tBench.electricalWorkJ) < 0.05,
  'Mechanical work and electrical work in benchmark must be equal'
);
assert(
  Math.abs(tBench.benchmarkMechDeltaT - tBench.benchmarkElecDeltaT) < 0.002,
  `Mechanical ΔT (${tBench.benchmarkMechDeltaT.toFixed(4)}℃) must equal Electrical ΔT (${tBench.benchmarkElecDeltaT.toFixed(4)}℃)`
);
console.log('✓ Test 3 passed: Mechanical work and electrical work equivalence verified\n');

// -----------------------------------------------------------------------------
// Test 4: High-Fidelity 3D Apparatus Mesh & In-Place Molecular Particles
// -----------------------------------------------------------------------------
console.log('Test 4: JouleApparatusMesh 3D Hierarchy & In-Place Particle Updates');
const mesh = new JouleApparatusMesh();
assert(mesh.group instanceof THREE.Group, 'Root must be THREE.Group');
assert(mesh.crankHitBox instanceof THREE.Mesh, 'Must have crankHitBox');
assert(mesh.clutchLeverHitBox instanceof THREE.Mesh, 'Must have clutchLeverHitBox');
assert(mesh.leftWeightHitBox instanceof THREE.Mesh, 'Must have leftWeightHitBox');
assert(mesh.rightWeightHitBox instanceof THREE.Mesh, 'Must have rightWeightHitBox');
assert(mesh.baffleToggleHitBox instanceof THREE.Mesh, 'Must have baffleToggleHitBox');
assert(mesh.elecSwitchHitBox instanceof THREE.Mesh, 'Must have elecSwitchHitBox');
assert(mesh.rheostatHitBox instanceof THREE.Mesh, 'Must have rheostatHitBox');
assert(mesh.fluidValveHitBox instanceof THREE.Mesh, 'Must have fluidValveHitBox');

mesh.updateVisualState(solver.getTelemetry(), 0.016);
mesh.dispose();
console.log('✓ Test 4 passed: 3D apparatus mesh hierarchy and disposal verified\n');

// -----------------------------------------------------------------------------
// Test 5: Experiment Lifecycle & Direct 3D Pointer/Touch Manipulation
// -----------------------------------------------------------------------------
console.log('Test 5: ThermoJouleExperiment Direct 3D Manipulation & Interruption Safety');
const exp = new ThermoJouleExperiment();
const paramStore = new Map<string, any>();
const mockContext: any = {
  camera: new THREE.PerspectiveCamera(60, 1.5, 0.1, 100),
  renderer: {
    domElement: {
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 1200, height: 800 }),
    },
  },
  setParameter: (k: string, v: any) => paramStore.set(k, v),
  getParameter: (k: string) => paramStore.get(k),
};
mockContext.camera.position.set(0, 0.2, 2.2);
mockContext.camera.updateMatrixWorld(true);

exp.init(mockContext);
exp.rootGroup.updateMatrixWorld(true);
assert.strictEqual(exp.targetScale, 2.15, 'targetScale must be 2.15');
assert.strictEqual(exp.hideCenterEmitter, true, 'hideCenterEmitter must be true');

// 5a: Tap 3D Electrical Knife Switch to turn heater ON
const switchHit: any = {
  object: exp.apparatusMesh.elecSwitchHitBox,
  point: new THREE.Vector3(),
};
assert.strictEqual(exp.solver.heaterActive, false);
exp.onPointerDown({ clientX: 500, clientY: 400 } as PointerEvent, switchHit, mockContext);
exp.onPointerUp({ clientX: 502, clientY: 401 } as PointerEvent, mockContext);
assert.strictEqual(exp.solver.heaterActive, true, 'Tapping 3D knife switch must close electrical circuit');

// 5b: Cancelled tap on 3D Knife Switch must NOT toggle state
exp.onPointerDown({ clientX: 500, clientY: 400 } as PointerEvent, switchHit, mockContext);
exp.onPointerCancel({ clientX: 500, clientY: 400 } as PointerEvent, mockContext);
exp.onPointerUp({ clientX: 500, clientY: 400 } as PointerEvent, mockContext);
assert.strictEqual(exp.solver.heaterActive, true, 'Cancelled pointer gesture must not toggle switch');

// 5c: Drag 3D Knurled Rheostat Knob to adjust current I
const rheostatHit: any = {
  object: exp.apparatusMesh.rheostatHitBox,
  point: new THREE.Vector3(),
};
exp.onPointerDown({ clientX: 600, clientY: 400 } as PointerEvent, rheostatHit, mockContext);
exp.onPointerMove({ clientX: 660, clientY: 400 } as PointerEvent, null, mockContext);
exp.onPointerUp({ clientX: 660, clientY: 400 } as PointerEvent, mockContext);
assert(exp.solver.currentAmp > 4.5, `Dragging rheostat knob must increase current (${exp.solver.currentAmp} A)`);

// 5d: Tap 3D Fluid Selector Valve to cycle fluid from water -> kerosene
const valveHit: any = {
  object: exp.apparatusMesh.fluidValveHitBox,
  point: new THREE.Vector3(),
};
assert.strictEqual(exp.solver.fluidType, 'water');
exp.onPointerDown({ clientX: 300, clientY: 400 } as PointerEvent, valveHit, mockContext);
exp.onPointerUp({ clientX: 300, clientY: 400 } as PointerEvent, mockContext);
assert.strictEqual(exp.solver.fluidType, 'kerosene', 'Tapping fluid valve must cycle to kerosene');

// 5e: Tap 3D Stator Baffle Lock Pin to toggle baffles
const baffleHit: any = {
  object: exp.apparatusMesh.baffleToggleHitBox,
  point: new THREE.Vector3(),
};
assert.strictEqual(exp.solver.bafflesEngaged, true);
exp.onPointerDown({ clientX: 420, clientY: 300 } as PointerEvent, baffleHit, mockContext);
exp.onPointerUp({ clientX: 420, clientY: 300 } as PointerEvent, mockContext);
assert.strictEqual(exp.solver.bafflesEngaged, false, 'Tapping baffle pin must disengage stator baffles');

exp.update(0.016, 1.0, mockContext);

// -----------------------------------------------------------------------------
// Test 6: VisionOS Spatial Floating Window Telemetry & Control Methods
// -----------------------------------------------------------------------------
console.log('Test 6: VisionOS Spatial Floating Window Telemetry & Control Sync');
exp.setWeightMass(8.5);
assert.strictEqual(exp.getJouleTelemetry().weightMassKg, 8.5, 'setWeightMass must update solver');
exp.setCurrentAmp(4.2);
assert.strictEqual(exp.getJouleTelemetry().currentAmp, 4.2, 'setCurrentAmp must update solver');
exp.setFluidType('glycerin');
assert.strictEqual(exp.getJouleTelemetry().fluidType, 'glycerin', 'setFluidType must update solver');
exp.resetExperiment();
assert.strictEqual(exp.getJouleTelemetry().temperatureC, 20.0, 'resetExperiment must restore T0 = 20.000 ℃');
exp.dispose(mockContext);
console.log('✓ Test 5 & Test 6 passed: All 3D direct manipulation controls and VisionModal sync verified\n');

console.log("=== All Joule's Equivalent of Heat Tests Passed Successfully (6/6)! ===\n");
