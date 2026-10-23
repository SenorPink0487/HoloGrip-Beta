import assert from 'node:assert';
import * as THREE from 'three';

import {
  AMBIENT_PRESSURE_MPA,
  AMBIENT_TEMP_C,
  FireSyringeSolver,
  MAX_VOLUME_ML,
  TINDER_IGNITION_TEMP_C,
} from '../src/physics/thermo/fireSyringeSolver.ts';
import { FireSyringeBenchMesh } from '../src/scene/thermo/FireSyringeBenchMesh.ts';
import ThermoFireSyringeExperiment from '../src/experiments/catalog/thermo-fire-syringe/index.ts';
import { PhysicsDisciplineModal } from '../src/ui/vision/PhysicsDisciplineModal.ts';

console.log('=== Starting Fire Syringe (空气压缩引火仪) Verification ===\n');

// Test 1: Fast Adiabatic Compression vs. Slow Isothermal/Leaky Compression
{
  console.log('Test 1: Fast adiabatic compression ignites tinder (T >= 260°C), slow compression fails to ignite');

  // 1A. Fast slam compression
  const fastSolver = new FireSyringeSolver();
  assert.strictEqual(fastSolver.tinderState, 'fresh');
  assert.strictEqual(fastSolver.temperatureC, AMBIENT_TEMP_C);
  assert.strictEqual(fastSolver.getTelemetry().volumeML, MAX_VOLUME_ML);

  fastSolver.triggerQuickSlam();
  let ignitedDuringSlam = false;
  let maxFlame = 0;
  let maxFlash = 0;

  for (let i = 0; i < 30; i++) {
    fastSolver.step(0.01);
    const telem = fastSolver.getTelemetry();
    if (telem.tinderState === 'igniting') {
      ignitedDuringSlam = true;
      maxFlame = Math.max(maxFlame, telem.flameIntensity);
      maxFlash = Math.max(maxFlash, telem.flashIntensity);
    }
  }

  const fastTelem = fastSolver.getTelemetry();
  assert(ignitedDuringSlam, 'Rapid compression must ignite the cotton tinder');
  assert(
    fastTelem.peakTemperatureC >= TINDER_IGNITION_TEMP_C,
    `Peak temperature (${fastTelem.peakTemperatureC.toFixed(1)}°C) must exceed ignition point (${TINDER_IGNITION_TEMP_C}°C)`
  );
  assert(fastTelem.workDoneJ > 0.5, 'Mechanical work W done on gas must be positive');
  assert(maxFlame > 0.6, 'Multi-layer flame intensity must surge on ignition');
  assert(maxFlash > 0.5, 'Ignition flash pulse must fire upon reaching auto-ignition point');

  // 1B. Slow compression (heat escapes through cylinder walls)
  const slowSolver = new FireSyringeSolver();
  slowSolver.triggerSlowPress();
  for (let i = 0; i < 160; i++) {
    slowSolver.step(0.02);
  }
  const slowTelem = slowSolver.getTelemetry();
  assert.strictEqual(
    slowTelem.tinderState,
    'fresh',
    'Slow compression must NOT ignite the tinder due to wall heat dissipation'
  );
  assert(
    slowTelem.peakTemperatureC < TINDER_IGNITION_TEMP_C,
    `Slow compression peak temp (${slowTelem.peakTemperatureC.toFixed(1)}°C) must stay below ${TINDER_IGNITION_TEMP_C}°C`
  );
  assert.strictEqual(
    slowTelem.slowPressFailedIgnition,
    true,
    'Slow compression should flag slowPressFailedIgnition'
  );

  console.log('✓ Test 1 passed: Adiabatic speed judgment (fast ignites, slow dissipates heat) verified\n');
}

// Test 2: Pneumatic Cushion Rebound, Ember/Smoke Lifecycle & Upward Pull Reset
{
  console.log('Test 2: High-pressure pneumatic cushion rebound, ember/smoke transition, and upward pull reset');
  const solver = new FireSyringeSolver();

  // Simulate manual fast downward drag of T-handle
  solver.beginDrag();
  for (let step = 1; step <= 8; step++) {
    solver.dragToStroke((step / 8) * 0.95, 0.015);
  }
  assert.strictEqual(solver.tinderState, 'igniting', 'Fast manual drag down must ignite tinder');
  const compressedStroke = solver.stroke;
  assert(compressedStroke > 0.9, 'Piston must be near bottom of cylinder');

  // Release handle -> pneumatic air cushion rebound
  solver.endDrag();
  assert.strictEqual(solver.actionMode, 'rebounding', 'Releasing at bottom must enter pneumatic rebounding mode');

  for (let i = 0; i < 40; i++) {
    solver.step(0.02);
  }
  assert(
    solver.stroke < compressedStroke - 0.1,
    `High-pressure gas cushion must push piston upward slightly (rebounded from ${compressedStroke.toFixed(2)} to ${solver.stroke.toFixed(2)})`
  );

  // Advance through combustion lifecycle: igniting -> ember -> charred + smoke
  for (let i = 0; i < 60; i++) {
    solver.step(0.02);
  }
  const emberTelem = solver.getTelemetry();
  assert.strictEqual(emberTelem.tinderState, 'ember', 'Flame must transition to glowing red ember after ~1.85s');
  assert(emberTelem.emberIntensity > 0.1, 'Ember glow must be active');
  assert(emberTelem.smokeIntensity > 0.5, 'Smoke plume must fill the combustion chamber');

  for (let i = 0; i < 130; i++) {
    solver.step(0.02);
  }
  const charredTelem = solver.getTelemetry();
  assert.strictEqual(charredTelem.tinderState, 'charred', 'Ember must settle into charred ash after ~4.2s');
  assert(charredTelem.charProgress >= 0.99, 'Char progress must reach ~1.0');

  // Drag handle back up to top (stroke <= 0.12) -> exhausts smoke and restores fresh white tinder
  solver.beginDrag();
  solver.dragToStroke(0.05, 0.04);
  solver.endDrag();
  const refreshedTelem = solver.getTelemetry();
  assert.strictEqual(
    refreshedTelem.tinderState,
    'fresh',
    'Pulling handle back up to top must automatically restore fresh white tinder'
  );
  assert.strictEqual(refreshedTelem.charProgress, 0, 'Fresh tinder charProgress must reset to 0');

  console.log('✓ Test 2 passed: Pneumatic rebound, flame -> ember -> smoke lifecycle, and pull-up reset verified\n');
}

// Test 3: 3D Apparatus Hierarchy, Dynamic Effects & Raycast Hover Interaction
{
  console.log('Test 3: 3D Apparatus anatomy, 135 instanced air molecules, and T-handle raycast interaction');
  const exp = new ThermoFireSyringeExperiment();
  const mockContext = {
    scene: new THREE.Scene(),
    camera: new THREE.PerspectiveCamera(60, 1.6, 0.1, 100),
    renderer: {
      domElement: {
        getBoundingClientRect: () => ({ left: 0, top: 0, width: 1280, height: 800 }),
      },
    },
    parameters: {},
    getParameter: () => undefined,
    setParameter: () => {},
  } as any;

  exp.init(mockContext);

  const bench = exp.bench;
  assert(bench instanceof FireSyringeBenchMesh, 'FireSyringeBenchMesh must be instantiated');
  assert(bench.group.getObjectByName('BaseAssembly'), 'Must contain heavy chamfered BaseAssembly');
  assert(bench.group.getObjectByName('TieRodsAssembly'), 'Must contain 4 stainless steel TieRodsAssembly');
  assert(
    bench.group.getObjectByName('RightLockingThumbscrew'),
    'Must contain right-side knurled locking thumbscrew matching reference apparatus'
  );
  assert(
    bench.group.getObjectByName('CombustionChamberAssembly'),
    'Must contain bottom stainless steel combustion chamber with front arched window'
  );
  assert(bench.group.getObjectByName('TinderTuftGroup'), 'Must contain 3D organic white cotton tinder tuft');
  assert(bench.group.getObjectByName('GlassCylinderAssembly'), 'Must contain thick-walled glass cylinder');
  assert(bench.group.getObjectByName('TopFlangeAssembly'), 'Must contain top flange and hex gland nut');
  assert(bench.group.getObjectByName('PistonAssemblyGroup'), 'Must contain moving piston assembly');
  assert(bench.group.getObjectByName('THandleGroup'), 'Must contain ergonomic T-handlebar');
  assert(
    bench.group.getObjectByName('AirMoleculesInstanced'),
    'Must contain instanced microscopic air molecules inside cylinder'
  );
  assert(bench.group.getObjectByName('CombustionFlameGroup'), 'Must contain 3-layer 3D combustion flame');

  // Verify T-handle raycasting returns grab cursor
  exp.rootGroup.updateMatrixWorld(true);
  const handleWorldPos = new THREE.Vector3();
  bench.handleGroup.getWorldPosition(handleWorldPos);
  const rayOrigin = handleWorldPos.clone().add(new THREE.Vector3(0, 0, 1.0));
  const raycaster = new THREE.Raycaster(rayOrigin, new THREE.Vector3(0, 0, -1));
  const hover = exp.getHoverTarget(raycaster);
  assert.strictEqual(hover?.id, 't-handle', 'Raycasting T-handle must return t-handle hover target');
  assert.strictEqual(hover?.cursor, 'grab', 'T-handle hover cursor must be grab');

  // Trigger quick slam via parameter action and verify 3D piston plunges and flame becomes visible
  const initialPistonY = bench.pistonAssemblyGroup.position.y;
  exp.onParameterChange('quickSlam', true, mockContext);
  for (let i = 0; i < 20; i++) {
    exp.update(0.012, (i + 1) * 0.012, mockContext);
  }
  const compressedPistonY = bench.pistonAssemblyGroup.position.y;
  assert(
    compressedPistonY < initialPistonY - 0.08,
    'Piston 3D mesh must plunge downward during quick slam'
  );
  const flameObj = bench.group.getObjectByName('CombustionFlameGroup');
  assert.strictEqual(flameObj?.visible, true, '3D flame group must become visible upon ignition');

  // Verify THERMO_EXPERIMENTS registration in PhysicsDisciplineModal
  const hasFireSyringeInMenu = PhysicsDisciplineModal.THERMO_EXPERIMENTS.some(
    (item) => item.id === 'thermo-fire-syringe' && item.name === '空气压缩引火仪'
  );
  assert(hasFireSyringeInMenu, 'PhysicsDisciplineModal.THERMO_EXPERIMENTS must include 空气压缩引火仪');

  exp.dispose(mockContext);
  console.log('✓ Test 3 passed: 3D apparatus hierarchy, dynamic animations, and menu integration verified\n');
}

console.log('========================================================');
console.log('All Fire Syringe (空气压缩引火仪) Tests Passed (3/3)!');
console.log('========================================================\n');
