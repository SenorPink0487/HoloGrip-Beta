import assert from 'node:assert';
import * as THREE from 'three';

// Lightweight Canvas/DOM mock for Node.js test environment
let bodyAppendedCount = 0;
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
      appendChild: () => {
        bodyAppendedCount++;
      },
    },
  };
}

import {
  BOYLE_INVARIANT_PV,
  CHARLES_INVARIANT_P_OVER_T,
  GAY_LUSSAC_INVARIANT_V_OVER_T,
  GasLawsSolver,
  REF_PRESSURE_KPA,
  REF_TEMPERATURE_K,
  REF_VOLUME_ML,
} from '../src/physics/thermo/gasLawsSolver.ts';
import { GasLawsBenchMesh } from '../src/scene/thermo/GasLawsBenchMesh.ts';
import ThermoGasLawsExperiment from '../src/experiments/catalog/thermo-gas-laws/index.ts';
import { PhysicsDisciplineModal } from '../src/ui/vision/PhysicsDisciplineModal.ts';

console.log('=== Starting Three Experimental Gas Laws (Boyle / Charles / Gay-Lussac) Verification ===\n');

// Test 1: Boyle's Law (Isothermal Process T = 300 K, pV = C1) & Strict Invariant Lock
{
  console.log('Test 1: Boyle\'s Law (isothermal pV = C1) & strict T0 = 300 K lock');
  const solver = new GasLawsSolver({ mode: 'boyle' });
  const init = solver.getTelemetry();

  assert.strictEqual(init.mode, 'boyle', 'Initial mode must be boyle');
  assert.strictEqual(init.pistonLocked, false, 'Piston lock pin must be unlocked in Boyle mode');
  assert.strictEqual(init.temperatureK, REF_TEMPERATURE_K, 'Temperature must be 300 K');
  assert.strictEqual(init.volumeML, REF_VOLUME_ML, 'Initial volume must be 35.0 mL');
  assert(
    Math.abs(init.pressureKPa * init.volumeML - BOYLE_INVARIANT_PV) < 1e-6,
    'Initial state must satisfy pV = C1'
  );

  // Compress gas to 20 mL
  const didSetV1 = solver.setVolumeML(20.0);
  assert.strictEqual(didSetV1, true, 'Must allow changing volume in Boyle mode');
  const compressed = solver.getTelemetry();
  assert.strictEqual(compressed.volumeML, 20.0);
  assert(
    Math.abs(compressed.pressureKPa * compressed.volumeML - BOYLE_INVARIANT_PV) < 1e-6,
    'Compressed state must strictly satisfy pV = C1'
  );
  assert(
    compressed.pressureKPa > 175,
    `Compressing to 20 mL must raise pressure to ~177.3 kPa (got ${compressed.pressureKPa.toFixed(1)})`
  );

  // Expand gas to 55 mL
  solver.setVolumeML(55.0);
  const expanded = solver.getTelemetry();
  assert.strictEqual(expanded.volumeML, 55.0);
  assert(
    Math.abs(expanded.pressureKPa * expanded.volumeML - BOYLE_INVARIANT_PV) < 1e-6,
    'Expanded state must strictly satisfy pV = C1'
  );
  assert.deepStrictEqual(
    expanded.sweptVolumeRangeML,
    [20.0, 55.0],
    'Swept volume range must track [20.0, 55.0] mL'
  );

  // Attempting to change temperature in Boyle mode must be rejected (strictly locked T0 = 300 K)
  const didSetTempInBoyle = solver.setTemperatureK(400.0);
  assert.strictEqual(didSetTempInBoyle, false, 'Must lock temperature T0 in Boyle mode');
  assert.strictEqual(solver.temperatureK, REF_TEMPERATURE_K, 'Temperature must remain 300 K');

  console.log('✓ Test 1 passed\n');
}

// Test 2: Charles's Law (Isochoric Process V = 35 mL, p/T = C2) & Brass Lock Pin Engagement
{
  console.log('Test 2: Charles\'s Law (isochoric p/T = C2) & mechanical piston lock');
  const solver = new GasLawsSolver({ mode: 'charles' });
  const init = solver.getTelemetry();

  assert.strictEqual(init.mode, 'charles');
  assert.strictEqual(init.pistonLocked, true, 'Brass lock pin must be engaged in Charles mode');
  assert.strictEqual(init.volumeML, REF_VOLUME_ML, 'Volume must be locked at 35.0 mL');

  // Attempting to drag piston volume in Charles mode must be rejected
  assert.strictEqual(
    solver.setVolumeML(50.0),
    false,
    'Must block piston volume change when locked in Charles mode'
  );
  assert.strictEqual(solver.volumeML, REF_VOLUME_ML);

  // Heat bath to 420 K and cool to 210 K
  assert.strictEqual(solver.setTemperatureK(420.0), true);
  const heated = solver.getTelemetry();
  assert(
    Math.abs(heated.pressureKPa / heated.temperatureK - CHARLES_INVARIANT_P_OVER_T) < 1e-6,
    'Heated state must strictly satisfy p/T = C2'
  );
  assert(
    heated.molecularSpeedFactor > 1.15,
    'Molecular RMS speed factor must increase when heated'
  );

  solver.setTemperatureK(210.0);
  const cooled = solver.getTelemetry();
  assert(
    Math.abs(cooled.pressureKPa / cooled.temperatureK - CHARLES_INVARIANT_P_OVER_T) < 1e-6,
    'Cooled state must strictly satisfy p/T = C2'
  );
  assert.deepStrictEqual(
    cooled.sweptCharlesTempRangeK,
    [210.0, 420.0],
    'Swept temperature range in Charles mode must record [210, 420] K'
  );

  console.log('✓ Test 2 passed\n');
}

// Test 3: Gay-Lussac's Law (Isobaric Process p = 101.3 kPa, V/T = C3) & Thermal Piston Expansion
{
  console.log('Test 3: Gay-Lussac\'s Law (isobaric V/T = C3) & automatic piston height expansion');
  const solver = new GasLawsSolver({ mode: 'gay-lussac' });
  const init = solver.getTelemetry();

  assert.strictEqual(init.mode, 'gay-lussac');
  assert.strictEqual(init.pistonLocked, false, 'Piston must be unlocked in Gay-Lussac mode');
  assert.strictEqual(init.pressureKPa, REF_PRESSURE_KPA, 'Pressure must remain constant at 101.3 kPa');

  // Heat to 450 K -> Volume must expand proportionally to 52.5 mL
  assert.strictEqual(solver.setTemperatureK(450.0), true);
  const heated = solver.getTelemetry();
  assert.strictEqual(heated.pressureKPa, REF_PRESSURE_KPA, 'Pressure must stay 101.3 kPa');
  assert(
    Math.abs(heated.volumeML - 52.5) < 1e-5,
    `At 450 K, isobaric volume must expand to 52.5 mL (got ${heated.volumeML})`
  );
  assert(
    Math.abs(heated.volumeML / heated.temperatureK - GAY_LUSSAC_INVARIANT_V_OVER_T) < 1e-6,
    'Must strictly satisfy V/T = C3'
  );

  // Cool to 210 K -> Volume must contract proportionally to 24.5 mL
  solver.setTemperatureK(210.0);
  const cooled = solver.getTelemetry();
  assert(
    Math.abs(cooled.volumeML - 24.5) < 1e-5,
    `At 210 K, isobaric volume must contract to 24.5 mL (got ${cooled.volumeML})`
  );

  // Verify pure manual control (step does not drift state)
  solver.step(5.0);
  assert.strictEqual(solver.temperatureK, 210.0, 'Pure manual mode must not auto-sweep on step()');
  assert.strictEqual(solver.volumeML, 24.5);

  console.log('✓ Test 3 passed\n');
}

// Test 4: 3D Apparatus Mesh, Ideal Gas Molecules & Manual 3D Dragging Interaction
{
  console.log('Test 4: 3D Bench Mesh, 88 Ideal Gas Molecules & Manual 3D Pointer Dragging');
  const exp = new ThermoGasLawsExperiment();
  const mockContext: any = {
    setParameter: () => {},
  };

  const beforeBodyCount = bodyAppendedCount;
  exp.init(mockContext);
  assert.strictEqual(
    bodyAppendedCount,
    beforeBodyCount,
    'Strict Zero Floating Popups: must not append any DOM overlay to document.body'
  );

  const bench: GasLawsBenchMesh = exp.bench;
  assert(bench, 'GasLawsBenchMesh must be initialized');
  assert.strictEqual(
    bench.moleculesInstancedMesh.count,
    88,
    'Must always render 88 3D ideal gas molecules inside cylinder'
  );

  // 1. In Boyle mode: manually drag piston handle upward (clientY decreases) -> Volume increases, Piston Y rises
  const initialPistonY = bench.pistonAssemblyGroup.position.y;
  const initialNeedleRot = bench.bourdonNeedleGroup.rotation.z;

  const downPiston = exp.onPointerDown(
    { clientX: 300, clientY: 300 } as PointerEvent,
    { object: bench.pistonHandleHitMesh } as any,
    mockContext
  );
  assert.strictEqual(downPiston, true, 'Must start dragging piston handle in Boyle mode');

  exp.onPointerMove(
    { clientX: 300, clientY: 210 } as PointerEvent,
    null,
    mockContext
  );
  exp.onPointerUp({} as PointerEvent, mockContext);

  assert(
    exp.solver.volumeML > REF_VOLUME_ML + 10,
    `Dragging piston upward must increase volume V (got ${exp.solver.volumeML.toFixed(1)} mL)`
  );
  assert(
    bench.pistonAssemblyGroup.position.y > initialPistonY + 0.02,
    '3D piston assembly Y position must physically rise'
  );
  assert(
    bench.bourdonNeedleGroup.rotation.z !== initialNeedleRot,
    'Bourdon pressure gauge 3D needle must rotate with pressure change'
  );

  // 2. Click 3D Brass Lock Pin -> switches to Charles (isochoric) mode & slides lock pin inward
  const unlockedPinX = bench.lockPinMovingGroup.position.x;
  exp.onPointerDown(
    {} as PointerEvent,
    { object: bench.lockPinHitMesh } as any,
    mockContext
  );
  assert.strictEqual(exp.solver.mode, 'charles', 'Clicking brass lock pin must engage Charles mode');
  assert(
    bench.lockPinMovingGroup.position.x > unlockedPinX + 0.01,
    '3D brass lock pin must physically slide inward (+X) to lock piston shaft'
  );

  // 3. In Charles mode: manually drag brass temperature knob -> Temperature & Pressure increase
  const downKnob = exp.onPointerDown(
    { clientX: 300, clientY: 300 } as PointerEvent,
    { object: bench.tempKnobHitMesh } as any,
    mockContext
  );
  assert.strictEqual(downKnob, true, 'Must start dragging brass temperature knob in Charles mode');

  exp.onPointerMove(
    { clientX: 390, clientY: 300 } as PointerEvent,
    null,
    mockContext
  );
  exp.onPointerUp({} as PointerEvent, mockContext);
  assert(
    exp.solver.temperatureK > REF_TEMPERATURE_K + 30,
    `Dragging temperature knob right must increase T (got ${exp.solver.temperatureK.toFixed(1)} K)`
  );

  // 4. Click 3D Terminal "盖-吕萨克 · 等压" button -> switches to Gay-Lussac mode
  exp.onPointerDown(
    {} as PointerEvent,
    { object: bench.btnModeGayLussacGroup } as any,
    mockContext
  );
  assert.strictEqual(exp.solver.mode, 'gay-lussac', 'Must switch to Gay-Lussac mode');
  assert.strictEqual(
    bench.lockPinMovingGroup.position.x,
    unlockedPinX,
    'Brass lock pin must retract when switching to Gay-Lussac mode'
  );

  exp.dispose();
  console.log('✓ Test 4 passed\n');
}

// Test 5: PhysicsDisciplineModal THERMO_EXPERIMENTS Registration
{
  console.log('Test 5: PhysicsDisciplineModal THERMO_EXPERIMENTS catalog verification');
  const found = PhysicsDisciplineModal.THERMO_EXPERIMENTS.find(
    (item) => item.id === 'thermo-gas-laws'
  );
  assert(found, 'PhysicsDisciplineModal.THERMO_EXPERIMENTS must include thermo-gas-laws');
  assert.strictEqual(found.name, '气体实验三定律');
  console.log('✓ Test 5 passed\n');
}

console.log('========================================================');
console.log('All Three Experimental Gas Laws Tests Passed (5/5)!');
console.log('========================================================\n');
