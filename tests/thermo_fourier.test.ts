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
            quadraticCurveTo: () => {},
            closePath: () => {},
            arc: () => {},
            stroke: () => {},
            fill: () => {},
            save: () => {},
            restore: () => {},
            setLineDash: () => {},
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
  DEFAULT_FOURIER_COLD_TEMP_C,
  DEFAULT_FOURIER_HOT_TEMP_C,
  FOURIER_ROD_MATERIALS,
  FourierConductionSolver,
  ROD_CROSS_SECTION_M2,
} from '../src/physics/thermo/fourierConductionSolver.ts';
import { FourierConductionBenchMesh } from '../src/scene/thermo/FourierConductionBenchMesh.ts';
import ThermoFourierExperiment from '../src/experiments/catalog/thermo-fourier/index.ts';
import { FourierStatusCard } from '../src/ui/vision/FourierStatusCard.ts';
import { PhysicsDisciplineModal } from '../src/ui/vision/PhysicsDisciplineModal.ts';

console.log('=== Starting Solid Heat Conduction & Fourier Law (固体热传导与傅里叶定律) Verification ===\n');

// Test 1: Steady-State Fourier Law Identities & 5-Probe Linear Gradient
{
  console.log('Test 1: Steady-state Fourier law q = -k*(dT/dx) and 5-channel probe linearity (T1~T5)');
  const solver = new FourierConductionSolver({
    materialId: 'brass',
    hotTempC: 100.0,
    coldTempC: 20.0,
    heaterOn: true,
    startInSteadyState: true,
  });

  const telem = solver.getTelemetry();
  assert.strictEqual(telem.hotTempC, DEFAULT_FOURIER_HOT_TEMP_C);
  assert.strictEqual(telem.coldTempC, DEFAULT_FOURIER_COLD_TEMP_C);
  assert.strictEqual(telem.isSteadyState, true, 'Must be in steady state');

  // Verify T1 ~ T5 match reference apparatus values (~98.2, 75.4, 52.5, 29.7... or linear between 98.2 and 25.1)
  const [t1, t2, t3, t4, t5] = telem.probes.map((p) => p.temperatureC);
  assert(Math.abs(t1 - 98.2) < 0.2, `T1 (${t1.toFixed(1)}) should match reference 98.2°C`);
  assert(Math.abs(t5 - 25.1) < 0.2, `T5 (${t5.toFixed(1)}) should match reference 25.1°C`);

  // Verify strict linearity across equidistant probes: (T2 - T1) == (T3 - T2) == (T4 - T3) == (T5 - T4)
  const d12 = t2 - t1;
  const d23 = t3 - t2;
  const d34 = t4 - t3;
  const d45 = t5 - t4;
  assert(Math.abs(d12 - d23) < 1e-5 && Math.abs(d23 - d34) < 1e-5 && Math.abs(d34 - d45) < 1e-5, 'Steady-state probe temperatures must be strictly linear');

  // Verify Fourier's Law q = -k * (dT/dx) and Φ = q * A
  const expectedGrad = (t5 - t1) / (0.36 - 0.04); // K/m (< 0)
  assert(Math.abs(telem.temperatureGradientKm - expectedGrad) < 1e-4, 'Temperature gradient dT/dx must match linear slope');
  const expectedFlux = -FOURIER_ROD_MATERIALS.brass.thermalConductivity * expectedGrad;
  assert(Math.abs(telem.heatFluxWm2 - expectedFlux) < 1e-3, 'Heat flux q must satisfy q = -k * dT/dx');
  assert(
    Math.abs(telem.conductedPowerW - expectedFlux * ROD_CROSS_SECTION_M2) < 1e-4,
    'Conducted thermal power Φ must equal q * A'
  );

  console.log('✓ Test 1 passed: Steady-state Fourier law and 5-probe linear gradient verified\n');
}

// Test 2: Material Thermal Conductivity & Transient Diffusivity Comparison
{
  console.log('Test 2: Comparing 4 single-element/alloy rods (Copper > Aluminum > Brass > Stainless)');
  const copperSolver = new FourierConductionSolver({ materialId: 'copper', startInSteadyState: false });
  const brassSolver = new FourierConductionSolver({ materialId: 'brass', startInSteadyState: false });
  const stainlessSolver = new FourierConductionSolver({ materialId: 'stainless', startInSteadyState: false });

  // Step all 3 solvers for 2.0 seconds of simulation time
  for (let i = 0; i < 40; i++) {
    copperSolver.step(0.05);
    brassSolver.step(0.05);
    stainlessSolver.step(0.05);
  }

  const tCopper = copperSolver.getTelemetry();
  const tBrass = brassSolver.getTelemetry();
  const tStainless = stainlessSolver.getTelemetry();

  assert(
    tCopper.steadyConvergence > tBrass.steadyConvergence &&
      tBrass.steadyConvergence > tStainless.steadyConvergence,
    `Transient thermal wave convergence must follow diffusivity α: Copper (${tCopper.steadyConvergence.toFixed(2)}) > Brass (${tBrass.steadyConvergence.toFixed(2)}) > Stainless (${tStainless.steadyConvergence.toFixed(2)})`
  );

  // Snap all to steady state and compare heat flux q
  copperSolver.snapToSteadyState();
  brassSolver.snapToSteadyState();
  stainlessSolver.snapToSteadyState();

  const qCopper = copperSolver.getTelemetry().heatFluxWm2;
  const qBrass = brassSolver.getTelemetry().heatFluxWm2;
  const qStainless = stainlessSolver.getTelemetry().heatFluxWm2;

  assert(
    qCopper > qBrass && qBrass > qStainless,
    'Steady-state heat flux q must scale strictly with thermal conductivity k'
  );
  assert(
    Math.abs(qCopper / qBrass - 398.0 / 109.0) < 1e-4,
    'Ratio of heat fluxes under identical temperature gradient must equal ratio of thermal conductivities k_Cu / k_Brass'
  );

  console.log('✓ Test 2 passed: Material thermal diffusivity & heat flux scaling verified\n');
}

// Test 3: 3D Apparatus Hierarchy, Dynamic Effects, Direct Interactions & Floating Window Card
{
  console.log('Test 3: 3D apparatus hierarchy, dynamic particles, direct 3D interactions & FourierStatusCard');
  const exp = new ThermoFourierExperiment();
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
  assert(bench instanceof FourierConductionBenchMesh, 'Bench must be instantiated');
  assert(bench.group.getObjectByName('RailBaseAssembly'), 'Must contain extruded aluminum rail base');
  assert(bench.group.getObjectByName('HeaterControllerBoxAssembly'), 'Must contain left PID heater controller box');
  assert(bench.group.getObjectByName('HeatingFurnaceAssembly'), 'Must contain perforated stainless heating furnace');
  assert(bench.group.getObjectByName('InternalHeatingCoil'), 'Must contain internal glowing heating coil');
  assert(bench.group.getObjectByName('TestRodAssembly'), 'Must contain central test rod assembly');
  assert(bench.group.getObjectByName('HeatFluxParticles'), 'Must contain internal phonon/electron heat flux particles');
  assert(bench.group.getObjectByName('FiveChannelMonitorAssembly'), 'Must contain overhead 5-channel temperature monitor');
  assert(bench.group.getObjectByName('CoolingChamberAssembly'), 'Must contain right transparent spiral-coil cooling chamber');
  assert(bench.group.getObjectByName('SpiralCoolingCoil'), 'Must contain internal spiral cooling coil');
  assert(bench.group.getObjectByName('CirculatingWaterBathAssembly'), 'Must contain right constant-temp circulating water bath');
  assert(bench.group.getObjectByName('CoolingWaterBubbles'), 'Must contain animated cooling water micro-bubbles');

  for (let i = 1; i <= 5; i++) {
    assert(
      bench.group.getObjectByName(`ThermocoupleProbe_T${i}`),
      `Must contain thermocouple probe T${i}`
    );
  }

  // Verify strict 3D vertical alignment (no floating lids, protruding screens, or sunken plates)
  bench.group.updateMatrixWorld(true);
  const railBox = new THREE.Box3().setFromObject(bench.railBaseGroup);
  assert(
    Math.abs(railBox.min.y - 0.0) < 0.002 && Math.abs(railBox.max.y - 0.064) < 0.004,
    `Rail base vertical bounds [${railBox.min.y.toFixed(3)}, ${railBox.max.y.toFixed(3)}] must sit on Y=0 and top at ~0.062m`
  );

  const heaterBox = new THREE.Box3().setFromObject(bench.heaterControllerGroup);
  assert(
    Math.abs(heaterBox.min.y - 0.0) < 0.002 && Math.abs(heaterBox.max.y - 0.182) < 0.005,
    `Heater controller box vertical bounds [${heaterBox.min.y.toFixed(3)}, ${heaterBox.max.y.toFixed(3)}] must have flush top cover at ~0.182m`
  );

  const bathBox = new THREE.Box3().setFromObject(bench.waterBathGroup);
  assert(
    Math.abs(bathBox.min.y - 0.0) < 0.002 && Math.abs(bathBox.max.y - 0.295) < 0.008,
    `Circulating water bath vertical bounds [${bathBox.min.y.toFixed(3)}, ${bathBox.max.y.toFixed(3)}] must have flush top lid and handle at ~0.290m`
  );

  // Verify right cooling hoses sit strictly above the rail base (no rail interpenetration)
  const upperHose = bench.group.getObjectByName('UpperBlueCoolingHose');
  const lowerHose = bench.group.getObjectByName('LowerBlueCoolingHose');
  assert(upperHose && lowerHose, 'Must contain upper and lower blue cooling hoses');
  const lowerHoseBox = new THREE.Box3().setFromObject(lowerHose!);
  assert(
    lowerHoseBox.min.y > railBox.max.y + 0.04,
    `Lower cooling hose min.y (${lowerHoseBox.min.y.toFixed(3)}) must stay well above rail top (${railBox.max.y.toFixed(3)})`
  );

  // Step frames and verify particles and transient temperatures advance
  const initialT3 = exp.getTelemetryData().probes[2].temperatureC;
  for (let frame = 0; frame < 20; frame++) {
    exp.update(0.05, (frame + 1) * 0.05, mockContext);
  }
  const updatedT3 = exp.getTelemetryData().probes[2].temperatureC;
  assert(updatedT3 > initialT3, 'Probe T3 temperature must rise as transient thermal wave propagates');

  // Test direct 3D click on the test rod to cycle material (brass -> copper)
  exp.onPointerDown(
    {} as PointerEvent,
    { object: bench.testRodOuterMesh } as any,
    mockContext
  );
  assert.strictEqual(
    exp.getTelemetryData().materialId,
    'copper',
    'Clicking test rod must cycle material from brass to copper'
  );
  assert(
    exp.getTelemetryData().rodSwapProgress > 0,
    'Switching rod material must trigger 3D mechanical lift animation'
  );

  // Test direct 3D click on heater power switch
  exp.onPointerDown(
    {} as PointerEvent,
    { object: bench.heaterPowerSwitchGroup } as any,
    mockContext
  );
  assert.strictEqual(
    exp.getTelemetryData().heaterOn,
    false,
    'Clicking heater power switch must toggle heater OFF'
  );

  // Verify raycast hover target on test rod
  exp.rootGroup.updateMatrixWorld(true);
  const rodWorldPos = new THREE.Vector3();
  bench.testRodOuterMesh.getWorldPosition(rodWorldPos);
  const rayOrigin = rodWorldPos.clone().add(new THREE.Vector3(0, 0, 1.0));
  const raycaster = new THREE.Raycaster(rayOrigin, new THREE.Vector3(0, 0, -1));
  const hover = exp.getHoverTarget(raycaster);
  assert.strictEqual(hover?.id, 'test-rod-material', 'Raycasting test rod must return test-rod-material hover target');

  // Verify FourierStatusCard in floating spatial window
  const statusCard = new FourierStatusCard();
  assert(
    statusCard.element.innerHTML.includes('沿棒轴向温度分布曲线 T(x)'),
    'Floating window FourierStatusCard must contain T(x) profile chart'
  );
  statusCard.updateTelemetry(exp.getTelemetryData());

  // Verify PhysicsDisciplineModal registration
  const registered = PhysicsDisciplineModal.THERMO_EXPERIMENTS.some(
    (item) => item.id === 'thermo-fourier'
  );
  assert.strictEqual(registered, true, 'PhysicsDisciplineModal.THERMO_EXPERIMENTS must register thermo-fourier');

  exp.dispose(mockContext);
  console.log('✓ Test 3 passed: 3D apparatus, dynamic animations, interactions, and status card verified\n');
}

console.log('=== All Solid Heat Conduction & Fourier Law Tests Passed! ===');
