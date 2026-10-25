import assert from 'node:assert';
import * as THREE from 'three';

// Lightweight Canvas/DOM mock for Node.js test environment
if (typeof globalThis.document === 'undefined') {
  (globalThis as any).document = {
    createElement: (tag: string) => {
      if (tag === 'canvas') {
        return {
          width: 512,
          height: 512,
          getContext: () => ({
            fillStyle: '',
            strokeStyle: '',
            lineWidth: 1,
            font: '',
            textAlign: 'left',
            textBaseline: 'middle',
            globalAlpha: 1,
            clearRect: () => {},
            fillRect: () => {},
            strokeRect: () => {},
            fillText: () => {},
            beginPath: () => {},
            moveTo: () => {},
            lineTo: () => {},
            closePath: () => {},
            arc: () => {},
            roundRect: () => {},
            stroke: () => {},
            fill: () => {},
            save: () => {},
            restore: () => {},
            createLinearGradient: () => ({ addColorStop: () => {} }),
            createRadialGradient: () => ({ addColorStop: () => {} }),
          }),
        };
      }
      return {
        tagName: tag.toUpperCase(),
        style: {},
        classList: { add: () => {}, remove: () => {}, toggle: () => {}, contains: () => false },
        setAttribute: () => {},
        getAttribute: () => null,
        addEventListener: () => {},
        removeEventListener: () => {},
        appendChild: () => {},
        querySelector: () => null,
        querySelectorAll: () => [],
      };
    },
    body: {
      appendChild: () => {},
    },
  };
}

import {
  CRYSTAL_FINAL_TEMP_C,
  CRYSTAL_MELT_END_MIN,
  CRYSTAL_MELT_START_MIN,
  CRYSTAL_MELTING_POINT_C,
  MAX_EXPERIMENT_TIME_MIN,
  PhaseChangeSolver,
  evaluateAmorphousTempC,
  evaluateCrystallineTempC,
} from '../src/physics/thermo/phaseChangeSolver.ts';
import { PhaseChangeBenchMesh } from '../src/scene/thermo/PhaseChangeBenchMesh.ts';
import ThermoPhaseChangeExperiment from '../src/experiments/catalog/thermo-phase-change/index.ts';
import { PhysicsDisciplineModal } from '../src/ui/vision/PhysicsDisciplineModal.ts';

console.log('=== Starting Crystalline vs. Amorphous Phase Change & Latent Heat Verification ===\n');

// Test 1: Crystalline 3-Stage Phase Transition & Isothermal Latent Heat Plateau vs. Amorphous Smooth Curve
{
  console.log(
    'Test 1: Crystalline 3-stage heating (Solid -> Isothermal Coexistence Plateau -> Liquid) vs. Amorphous continuous softening'
  );

  const solver = new PhaseChangeSolver({ simMinutesPerSecond: 1.0 });
  const initTelem = solver.getTelemetry();
  assert.strictEqual(initTelem.leftLampLit, true, 'Left alcohol lamp must be lit by default on entry');
  assert.strictEqual(initTelem.rightLampLit, true, 'Right alcohol lamp must be lit by default on entry');
  assert.strictEqual(initTelem.channel1TempC, 0, 'Initial crystal temperature must be 0°C');
  assert.strictEqual(initTelem.channel2TempC, 0, 'Initial amorphous temperature must be 0°C');
  assert.strictEqual(initTelem.channel1Phase, 'solid', 'Initial crystal phase must be solid');

  // Advance to t = 3.0 min (Stage 1: Solid Heating)
  for (let i = 0; i < 30; i++) solver.step(0.1);
  const stage1Telem = solver.getTelemetry();
  assert.strictEqual(stage1Telem.channel1Phase, 'solid', 'At t=3 min, crystal must still be in solid heating stage');
  assert.strictEqual(stage1Telem.channel1MeltFraction, 0, 'Melt fraction must be 0 before reaching melting point');
  assert(
    stage1Telem.channel1TempC > 25 && stage1Telem.channel1TempC < CRYSTAL_MELTING_POINT_C,
    `Solid crystal temperature (${stage1Telem.channel1TempC.toFixed(1)}°C) must rise toward melting point`
  );

  // Advance to t = 9.0 min (Stage 2: Solid-Liquid Coexistence / Latent Heat Plateau)
  for (let i = 0; i < 60; i++) solver.step(0.1);
  const plateauEarlyTelem = solver.getTelemetry();
  assert.strictEqual(
    plateauEarlyTelem.channel1Phase,
    'coexistence',
    'At t=9 min, crystal must be in solid-liquid coexistence phase'
  );
  assert(
    Math.abs(plateauEarlyTelem.channel1TempC - CRYSTAL_MELTING_POINT_C) < 1e-6,
    `At t=9 min, crystal temperature must equal melting point ${CRYSTAL_MELTING_POINT_C}°C`
  );
  assert(
    plateauEarlyTelem.channel1MeltFraction > 0.2 && plateauEarlyTelem.channel1MeltFraction < 0.3,
    `Melt fraction at t=9 min (${plateauEarlyTelem.channel1MeltFraction.toFixed(2)}) must be ~0.25`
  );

  // Advance to t = 15.0 min (Still on Latent Heat Plateau: ΔT = 0 while absorbed heat increases!)
  for (let i = 0; i < 60; i++) solver.step(0.1);
  const plateauLateTelem = solver.getTelemetry();
  assert.strictEqual(
    plateauLateTelem.channel1Phase,
    'coexistence',
    'At t=15 min, crystal must still be in solid-liquid coexistence phase'
  );
  assert.strictEqual(
    plateauLateTelem.channel1TempC,
    plateauEarlyTelem.channel1TempC,
    'During solid-liquid coexistence, crystal temperature must remain strictly constant (ΔT = 0)'
  );
  assert(
    plateauLateTelem.channel1AbsorbedHeatKJPerKg > plateauEarlyTelem.channel1AbsorbedHeatKJPerKg + 80,
    'Latent heat of fusion must continuously accumulate during the constant-temperature plateau'
  );

  //Meanwhile, verify Amorphous (Paraffin) temperature rose continuously between t=9 min and t=15 min (no plateau!)
  assert(
    plateauLateTelem.channel2TempC > plateauEarlyTelem.channel2TempC + 8.0,
    'Amorphous paraffin temperature must continue rising smoothly without any isothermal plateau'
  );
  assert.strictEqual(
    plateauLateTelem.channel2Phase,
    'softening',
    'Amorphous paraffin must be in continuous softening state'
  );

  // Advance to t = 25.0 min (Stage 3: Complete Melting -> Liquid Heating)
  for (let i = 0; i < 105; i++) solver.step(0.1);
  const finalTelem = solver.getTelemetry();
  assert.strictEqual(
    finalTelem.channel1TimeMin,
    MAX_EXPERIMENT_TIME_MIN,
    'Time must clamp at 25.0 min'
  );
  assert.strictEqual(finalTelem.channel1Phase, 'liquid', 'At t=25 min, crystal must be completely melted into liquid');
  assert.strictEqual(finalTelem.channel1MeltFraction, 1, 'Melt fraction must reach 1.0');
  assert(
    Math.abs(finalTelem.channel1TempC - CRYSTAL_FINAL_TEMP_C) < 0.01,
    `Liquid crystal temperature at 25 min (${finalTelem.channel1TempC.toFixed(1)}°C) must reach ${CRYSTAL_FINAL_TEMP_C}°C`
  );
  assert.strictEqual(finalTelem.channel2Phase, 'liquid', 'Amorphous paraffin at 25 min must reach liquid state');
  assert(
    evaluateCrystallineTempC(CRYSTAL_MELT_START_MIN) === CRYSTAL_MELTING_POINT_C &&
      evaluateCrystallineTempC(CRYSTAL_MELT_END_MIN) === CRYSTAL_MELTING_POINT_C &&
      evaluateAmorphousTempC(25) > 58,
    'Pure curve evaluation functions must match expected thermodynamic landmarks'
  );

  console.log('✓ Test 1 passed: Crystalline 3-stage latent heat plateau & amorphous smooth softening verified\n');
}

// Test 2: Independent Alcohol Lamp Toggle & Rapid Cooling Auto-Reset
{
  console.log('Test 2: Extinguishing alcohol lamp triggers rapid cooling back to 0°C and automatic curve reset');
  const solver = new PhaseChangeSolver({ simMinutesPerSecond: 1.0 });

  // Heat both channels for 10 seconds
  for (let i = 0; i < 100; i++) solver.step(0.1);
  assert(solver.getTelemetry().channel1TempC > 50, 'Channel 1 must be heated');
  assert(solver.getTelemetry().channel2TempC > 30, 'Channel 2 must be heated');

  // Extinguish Left Lamp (Channel 1) only; keep Right Lamp (Channel 2) burning
  solver.toggleLeftLamp();
  assert.strictEqual(solver.leftLampLit, false, 'Left lamp must now be extinguished');
  assert.strictEqual(solver.rightLampLit, true, 'Right lamp must remain burning');

  const ch2Before = solver.getTelemetry().channel2TempC;
  for (let i = 0; i < 30; i++) solver.step(0.1);

  const afterCoolTelem = solver.getTelemetry();
  assert.strictEqual(afterCoolTelem.channel1TimeMin, 0, 'Extinguished Channel 1 must cool back to t=0');
  assert.strictEqual(afterCoolTelem.channel1TempC, 0, 'Extinguished Channel 1 must cool back to 0°C');
  assert.strictEqual(
    afterCoolTelem.channel1Curve.length,
    1,
    'Channel 1 curve must automatically clear/reset upon cooling to 0°C'
  );
  assert(
    afterCoolTelem.channel2TempC > ch2Before,
    'Burning Channel 2 must continue heating independently while Channel 1 cools'
  );

  console.log('✓ Test 2 passed: Independent lamp control and cooling auto-reset verified\n');
}

// Test 3: 3D Apparatus Anatomy, Raycast Direct Manipulation & Menu Registration
{
  console.log('Test 3: 3D Apparatus anatomy, alcohol lamp & collector button raycast interactions, and menu registration');
  const exp = new ThermoPhaseChangeExperiment();
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
  assert(bench instanceof PhaseChangeBenchMesh, 'PhaseChangeBenchMesh must be instantiated');

  exp.rootGroup.updateMatrixWorld(true);

  // 3A. Raycast onto Left Alcohol Lamp and click to toggle ignition
  const leftLampWorldPos = new THREE.Vector3();
  bench.leftAlcoholLampGroup.getWorldPosition(leftLampWorldPos);
  leftLampWorldPos.y += 0.04;
  const raycaster = new THREE.Raycaster(
    leftLampWorldPos.clone().add(new THREE.Vector3(0, 0, 0.8)),
    new THREE.Vector3(0, 0, -1)
  );
  const lampHover = exp.getHoverTarget(raycaster);
  assert.strictEqual(lampHover?.id, 'left-alcohol-lamp', 'Raycasting left alcohol lamp must return left-alcohol-lamp');

  const lampHits = raycaster.intersectObjects([bench.leftAlcoholLampGroup], true);
  assert(lampHits.length > 0, 'Must intersect left alcohol lamp collider');
  exp.onPointerDown({} as PointerEvent, lampHits[0], mockContext);
  assert.strictEqual(exp.getTelemetryData().leftLampLit, false, 'Clicking left alcohol lamp must extinguish it');

  // 3B. Raycast onto Collector Channel 1 Button and click to toggle curve visibility
  const btn1WorldPos = new THREE.Vector3();
  bench.channel1ButtonGroup.getWorldPosition(btn1WorldPos);
  const btnRaycaster = new THREE.Raycaster(
    btn1WorldPos.clone().add(new THREE.Vector3(0, 0, 0.5)),
    new THREE.Vector3(0, 0, -1)
  );
  const btnHover = exp.getHoverTarget(btnRaycaster);
  assert.strictEqual(btnHover?.id, 'channel-1-btn', 'Raycasting Channel 1 button must return channel-1-btn');

  const btnHits = btnRaycaster.intersectObjects([bench.channel1ButtonGroup], true);
  assert(btnHits.length > 0, 'Must intersect Channel 1 button');
  exp.onPointerDown({} as PointerEvent, btnHits[0], mockContext);
  assert.strictEqual(
    exp.getTelemetryData().showChannel1,
    false,
    'Clicking Channel 1 button must hide Channel 1 curve'
  );

  // 3C. Verify THERMO_EXPERIMENTS registration in PhysicsDisciplineModal
  const hasPhaseChangeInMenu = PhysicsDisciplineModal.THERMO_EXPERIMENTS.some(
    (item) => item.id === 'thermo-phase-change' && item.name === '晶体与非晶体相变与潜热'
  );
  assert(
    hasPhaseChangeInMenu,
    'PhysicsDisciplineModal.THERMO_EXPERIMENTS must include 晶体与非晶体相变与潜热'
  );

  exp.dispose(mockContext);
  console.log('✓ Test 3 passed: 3D apparatus anatomy, direct manipulation, and menu registration verified\n');
}

// Test 4: Anti-Flickering & Non-Penetration Geometry Boundary Invariants
{
  console.log('Test 4: Flame clearance under wire gauze & anti-flickering boundary invariants');
  const exp = new ThermoPhaseChangeExperiment();
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

  // Step across 100 animation frames to check flame scale and tip height
  let maxFlameTipY = -Infinity;
  const leftVisual = (bench as any).leftLampVisual;
  const flameOuterMesh = leftVisual.flameOuterMesh;
  const flameGeo = flameOuterMesh.geometry as THREE.BufferGeometry;
  flameGeo.computeBoundingBox();
  const rawFlameHeight = (flameGeo.boundingBox?.max.y ?? 0) - (flameGeo.boundingBox?.min.y ?? 0);

  for (let step = 0; step < 100; step++) {
    exp.update(0.033, step * 0.033, mockContext);
    exp.rootGroup.updateMatrixWorld(true);

    const flameGroup = leftVisual.flameGroup;
    const currentScaleY = flameGroup.scale.y;
    const flameBaseWorldY = new THREE.Vector3();
    flameGroup.getWorldPosition(flameBaseWorldY);

    const tipWorldY = flameBaseWorldY.y + rawFlameHeight * currentScaleY;
    if (tipWorldY > maxFlameTipY) {
      maxFlameTipY = tipWorldY;
    }

    // Flame light intensity must stay in a smooth comfortable range without strobing
    const lightIntensity = leftVisual.flameLight.intensity;
    assert(lightIntensity >= 0.65 && lightIntensity <= 0.85, 'Flame light intensity must remain in [0.65, 0.85]');
  }

  // World position of gauze plate bottom is bench position Y (0.082) + TRIPOD_TOP_Y (0.140) = 0.222
  const gauzeBottomWorldY = exp.rootGroup.position.y + PhaseChangeBenchMesh.TRIPOD_TOP_Y;
  const beakerBottomWorldY = exp.rootGroup.position.y + PhaseChangeBenchMesh.BEAKER_BOTTOM_Y;

  assert(
    maxFlameTipY < gauzeBottomWorldY,
    `Flame tip maximum world Y (${maxFlameTipY.toFixed(4)}) must strictly remain below wire gauze bottom (${gauzeBottomWorldY.toFixed(4)})`
  );
  assert(
    maxFlameTipY < beakerBottomWorldY,
    `Flame tip maximum world Y (${maxFlameTipY.toFixed(4)}) must strictly remain below beaker bottom (${beakerBottomWorldY.toFixed(4)})`
  );

  exp.dispose(mockContext);
  console.log('✓ Test 4 passed: Flame clearance and non-penetration geometry invariants verified\n');
}

console.log('=========================================================================');
console.log('All Crystalline vs. Amorphous Phase Change Tests Passed (4/4)!');
console.log('=========================================================================\n');
