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
            stroke: () => {},
            fill: () => {},
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
  ADIABATIC_GAMMA,
  CarnotEngineSolver,
  DEFAULT_COLD_TEMP_C,
  DEFAULT_HOT_TEMP_C,
  KELVIN_OFFSET,
} from '../src/physics/thermo/carnotCycle.ts';
import { CarnotEngineBenchMesh } from '../src/scene/thermo/CarnotEngineBenchMesh.ts';
import ThermoCarnotExperiment from '../src/experiments/catalog/thermo-carnot/index.ts';
import { CarnotStatusCard } from '../src/ui/vision/CarnotStatusCard.ts';

console.log('=== Starting Carnot Heat Engine (卡诺热机) Verification ===\n');

// Test 1: Carnot thermodynamic cycle identities & efficiency theorem
{
  console.log('Test 1: Carnot thermodynamic cycle identities (η = 1 - Tc/Th = W/Qh) and P-V state laws');
  const solver = new CarnotEngineSolver({
    hotTempC: 80.0,
    coldTempC: 20.0,
  });

  const telem = solver.getTelemetry();
  assert.strictEqual(telem.hotTempC, DEFAULT_HOT_TEMP_C);
  assert.strictEqual(telem.coldTempC, DEFAULT_COLD_TEMP_C);
  assert(Math.abs(telem.hotTempK - (80 + KELVIN_OFFSET)) < 1e-6);
  assert(Math.abs(telem.coldTempK - (20 + KELVIN_OFFSET)) < 1e-6);

  // Efficiency η = 1 - Tc / Th = W / Qh
  const expectedEta = 1 - (20 + KELVIN_OFFSET) / (80 + KELVIN_OFFSET);
  assert(Math.abs(telem.efficiency - expectedEta) < 1e-6, 'Carnot efficiency must equal 1 - Tc/Th');
  assert(
    Math.abs(telem.netWorkJ / telem.heatAbsorbedJ - expectedEta) < 1e-6,
    'W / Qh must strictly equal Carnot efficiency 1 - Tc/Th'
  );
  assert(
    Math.abs(telem.heatAbsorbedJ - telem.heatRejectedJ - telem.netWorkJ) < 1e-6,
    'First Law of Thermodynamics W = Qh - Qc must hold'
  );

  // Verify the 4 state vertices satisfy ideal gas isothermal & adiabatic relations
  const { state1, state2, state3, state4 } = telem.vertices;
  // 1 -> 2 Isothermal at Th: P1 * V1 = P2 * V2
  assert(
    Math.abs(state1.pressureMPa * state1.volumeL - state2.pressureMPa * state2.volumeL) < 1e-6,
    '1 -> 2 must satisfy isothermal Boyle law P1*V1 = P2*V2'
  );
  // 2 -> 3 Adiabatic: P2 * V2^γ = P3 * V3^γ
  assert(
    Math.abs(
      state2.pressureMPa * Math.pow(state2.volumeL, ADIABATIC_GAMMA) -
        state3.pressureMPa * Math.pow(state3.volumeL, ADIABATIC_GAMMA)
    ) < 1e-6,
    '2 -> 3 must satisfy Poisson adiabatic equation P2*V2^γ = P3*V3^γ'
  );
  // 3 -> 4 Isothermal at Tc: P3 * V3 = P4 * V4
  assert(
    Math.abs(state3.pressureMPa * state3.volumeL - state4.pressureMPa * state4.volumeL) < 1e-6,
    '3 -> 4 must satisfy isothermal Boyle law P3*V3 = P4*V4'
  );
  // 4 -> 1 Adiabatic: P4 * V4^γ = P1 * V1^γ
  assert(
    Math.abs(
      state4.pressureMPa * Math.pow(state4.volumeL, ADIABATIC_GAMMA) -
        state1.pressureMPa * Math.pow(state1.volumeL, ADIABATIC_GAMMA)
    ) < 1e-6,
    '4 -> 1 must satisfy Poisson adiabatic equation P4*V4^γ = P1*V1^γ'
  );

  console.log('✓ Test 1 passed: Carnot thermodynamic equations and efficiency theorem verified\n');
}

// Test 2: Continuous cycle traverses all 4 Carnot stages (① -> ② -> ③ -> ④)
{
  console.log('Test 2: Full crank rotation traverses all 4 Carnot stages and activates pipe thermal pulses');
  const solver = new CarnotEngineSolver({ hotTempC: 100.0, coldTempC: 15.0 });
  const visitedStages = new Set<number>();
  let sawHotFlow = false;
  let sawColdFlow = false;
  let sawAdiabaticIsolation = false;

  for (let i = 0; i < 120; i++) {
    const angle = (i / 120) * Math.PI * 2;
    solver.setCrankAngle(angle);
    const t = solver.getTelemetry();
    visitedStages.add(t.stageId);
    if (t.stageId === 1 && t.hotPipeFlowIntensity > 0.1 && t.coldPipeFlowIntensity === 0) {
      sawHotFlow = true;
    }
    if (t.stageId === 3 && t.coldPipeFlowIntensity > 0.1 && t.hotPipeFlowIntensity === 0) {
      sawColdFlow = true;
    }
    if ((t.stageId === 2 || t.stageId === 4) && t.hotPipeFlowIntensity === 0 && t.coldPipeFlowIntensity === 0) {
      sawAdiabaticIsolation = true;
    }
  }

  assert.deepStrictEqual(
    Array.from(visitedStages).sort(),
    [1, 2, 3, 4],
    'Must traverse all 4 Carnot stages (1, 2, 3, 4) over a full revolution'
  );
  assert(sawHotFlow, 'Stage 1 must activate hot pipe heat absorption pulse');
  assert(sawColdFlow, 'Stage 3 must activate cold pipe heat rejection pulse');
  assert(sawAdiabaticIsolation, 'Stages 2 & 4 must enforce adiabatic isolation (Q = 0)');

  console.log('✓ Test 2 passed: All 4 Carnot stages and thermal flow pulses verified\n');
}

// Test 3: 3D Apparatus Mesh Hierarchy & Crank-Connecting Rod Kinematic Lock
{
  console.log('Test 3: 3D Apparatus hierarchy and rigid-body crank-connecting rod kinematics');
  const exp = new ThermoCarnotExperiment();
  const mockContext = {
    scene: new THREE.Scene(),
    camera: new THREE.PerspectiveCamera(60, 1.6, 0.1, 100),
    renderer: { domElement: { getBoundingClientRect: () => ({ left: 0, top: 0, width: 1280, height: 800 }) } },
    parameters: {},
    getParameter: () => undefined,
    setParameter: () => {},
  } as any;

  exp.init(mockContext);

  const bench = exp.bench;
  assert(bench instanceof CarnotEngineBenchMesh, 'Bench must be instantiated');
  assert(bench.group.getObjectByName('CarnotBaseplateAssembly'), 'Must contain heavy baseplate assembly');
  assert.strictEqual(
    bench.group.getObjectByName('FrontConsoleFascia'),
    undefined,
    'FrontConsoleFascia must be removed from 3D desk and placed in floating spatial window instead'
  );
  assert(bench.group.getObjectByName('HotReservoirAssembly'), 'Must contain left hot reservoir assembly');
  assert(bench.group.getObjectByName('ColdReservoirAssembly'), 'Must contain right cold reservoir assembly');
  assert(bench.group.getObjectByName('WorkingCylinderAssembly'), 'Must contain central working cylinder assembly');
  assert(bench.group.getObjectByName('TopPressureGaugeAssembly'), 'Must contain top analog pressure gauge');
  assert(bench.group.getObjectByName('CrankFlywheelAssembly'), 'Must contain crank-flywheel mechanism');
  assert(bench.group.getObjectByName('WorkingGasParticles'), 'Must contain 3D working gas molecular particles');

  // Verify CarnotStatusCard renders the 4 stages and P-V diagram in the floating spatial window
  const statusCard = new CarnotStatusCard();
  assert(statusCard.element.innerHTML.includes('卡诺循环的四个过程'), 'Floating window card must contain 卡诺循环的四个过程');
  assert(statusCard.element.innerHTML.includes('卡诺循环的 P-V 图'), 'Floating window card must contain 卡诺循环的 P-V 图');
  statusCard.updateTelemetry(exp.getTelemetryData(), exp.getPVCurves());

  // Step through multiple frames and verify piston & flywheel movement
  const initialPistonX = bench.pistonGroup.position.x;
  for (let frame = 0; frame < 10; frame++) {
    exp.update(0.08, (frame + 1) * 0.08, mockContext);
  }
  const movedPistonX = bench.pistonGroup.position.x;
  assert(Math.abs(movedPistonX - initialPistonX) > 0.015, 'Piston must reciprocate as flywheel rotates');
  assert.strictEqual(
    bench.pistonGroup.position.x,
    bench.connectingRodGroup.position.x,
    'Connecting rod wrist pin must remain 100% locked to piston clevis pin'
  );

  // Verify hover target on hot & cold valve handwheels
  exp.rootGroup.updateMatrixWorld(true);
  const hotWorldPos = new THREE.Vector3();
  bench.hotValveHandleGroup.getWorldPosition(hotWorldPos);
  const rayOrigin = hotWorldPos.clone().add(new THREE.Vector3(0, 0, 1.0));
  const raycaster = new THREE.Raycaster(rayOrigin, new THREE.Vector3(0, 0, -1));
  const hover = exp.getHoverTarget(raycaster);
  assert.strictEqual(hover?.id, 'hot-valve', 'Raycasting hot valve must return hot-valve hover target');
  assert.strictEqual(hover?.cursor, 'grab', 'Valve hover cursor must be grab');

  // Verify parameter updates
  exp.onParameterChange('hotTempC', 125, mockContext);
  exp.onParameterChange('coldTempC', 10, mockContext);
  const updatedTelem = exp.getTelemetryData();
  assert.strictEqual(updatedTelem.hotTempC, 125);
  assert.strictEqual(updatedTelem.coldTempC, 10);
  assert(updatedTelem.efficiencyPercent > 25, 'Higher temperature difference must increase Carnot efficiency');

  exp.dispose(mockContext);
  console.log('✓ Test 3 passed: 3D apparatus hierarchy, kinematics, and valve interactions verified\n');
}

console.log('========================================================');
console.log('All Carnot Heat Engine Tests Passed (3/3)!');
console.log('========================================================\n');
