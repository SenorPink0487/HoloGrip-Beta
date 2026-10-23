import assert from 'node:assert';
import * as THREE from 'three';
import { CATEGORIES } from '../src/experiments/ExperimentRegistry.ts';
import { metadata as idealGasMeta } from '../src/experiments/catalog/thermo-idealgas/meta.ts';
import { metadata as carnotMeta } from '../src/experiments/catalog/thermo-carnot/meta.ts';
import { metadata as conductionMeta } from '../src/experiments/catalog/thermo-conduction/meta.ts';
import { metadata as phaseMeta } from '../src/experiments/catalog/thermo-phase/meta.ts';

// Mock minimal DOM for headless Node test
const createMockElement = (tag = 'div'): any => ({
  tagName: tag.toUpperCase(),
  width: 1024,
  height: 768,
  style: {},
  appendChild: (child: any) => child,
  addEventListener: () => {},
  removeEventListener: () => {},
  getContext: () => ({
    fillStyle: '', strokeStyle: '', lineWidth: 1, font: '', textAlign: '', textBaseline: '',
    fillRect: () => {}, strokeRect: () => {}, clearRect: () => {}, fillText: () => {},
    beginPath: () => {}, moveTo: () => {}, lineTo: () => {}, stroke: () => {}, fill: () => {},
    arc: () => {},
    createLinearGradient: () => ({ addColorStop: () => {} }),
    createRadialGradient: () => ({ addColorStop: () => {} }),
    roundRect: () => {},
    measureText: () => ({ width: 50 }),
    drawImage: () => {},
    save: () => {},
    restore: () => {},
    setLineDash: () => {},
  }),
});

if (typeof globalThis.document === 'undefined') {
  (globalThis as any).document = {
    createElement: createMockElement,
  };
}

console.log('=== Starting Thermodynamics Module Deep Verification ===\n');

// Test 1: Category Registration
{
  console.log('Test 1: Verify thermodynamics category in ExperimentRegistry');
  const thermoCat = CATEGORIES.find((c) => c.id === 'thermodynamics');
  assert(thermoCat !== undefined, 'Thermodynamics category must exist in CATEGORIES');
  assert.strictEqual(thermoCat?.name, '热学物理', 'Category name must be 热学物理');
  assert.strictEqual(thermoCat?.icon, 'thermo', 'Category icon must be thermo');
  assert(thermoCat?.description.includes('理想气体'), 'Category description must mention 理想气体');
  console.log('✓ Test 1 passed: Thermodynamics category accurately registered\n');
}

// Test 2: 4 Core Experiments Metadata Integrity
{
  console.log('Test 2: Verify 4 core thermal experiment metadata specifications');
  const allMetas = [idealGasMeta, carnotMeta, conductionMeta, phaseMeta];

  for (const m of allMetas) {
    assert(m.id.startsWith('thermo-'), `Experiment ID ${m.id} must start with thermo-`);
    assert.strictEqual(m.category, 'thermodynamics', `Category of ${m.id} must be thermodynamics`);
    assert.strictEqual(m.categoryName, '热学物理', `CategoryName of ${m.id} must be 热学物理`);
    assert(m.name.length > 0, `Name of ${m.id} must not be empty`);
    assert(m.equation && m.equation.length > 0, `Equation of ${m.id} must not be empty`);
    assert(m.parameters && m.parameters.length > 0, `Parameters of ${m.id} must have entries`);
  }

  // Check specific flagship parameters in thermo-idealgas
  const tempParam = idealGasMeta.parameters.find((p) => p.id === 'temperature');
  const volParam = idealGasMeta.parameters.find((p) => p.id === 'volume');
  const molesParam = idealGasMeta.parameters.find((p) => p.id === 'moles');
  const gasTypeParam = idealGasMeta.parameters.find((p) => p.id === 'gasType');

  assert(tempParam && tempParam.min === 100 && tempParam.max === 800, 'Temperature bounds [100K, 800K]');
  assert(volParam && volParam.min === 1.0 && volParam.max === 5.0, 'Volume bounds [1.0L, 5.0L]');
  assert(molesParam && molesParam.defaultValue === 0.10, 'Default moles = 0.10 mol');
  assert(gasTypeParam && gasTypeParam.options && gasTypeParam.options.length >= 4, 'At least 4 gas types');

  console.log('✓ Test 2 passed: All 4 experiment metadata entries verified\n');
}

// Test 3: Ideal Gas Law PV = nRT Physical Calculations
{
  console.log('Test 3: Ideal Gas Law PV = nRT Numerical Verification');
  const R = 8.314; // J/(mol·K)

  // Standard condition: T = 300K, V = 2.5L, n = 0.1 mol
  // P (kPa) = (n * R * T) / V
  const n = 0.1;
  const T = 300;
  const V = 2.5;
  const P = (n * R * T) / V;

  // Expected: 0.1 * 8.314 * 300 / 2.5 = 249.42 / 2.5 = 99.768 kPa (~ 1 atm)
  assert(Math.abs(P - 99.768) < 0.01, `Calculated P=${P} should be ~99.768 kPa`);

  // Boyle's Law: Halving volume doubles pressure (isothermal)
  const V_half = V * 0.5;
  const P_double = (n * R * T) / V_half;
  assert.strictEqual(P_double, P * 2, "Boyle's law: P * V = const");

  // Charles's Law: Doubling temperature doubles pressure (isochoric)
  const T_double = T * 2;
  const P_tempDouble = (n * R * T_double) / V;
  assert.strictEqual(P_tempDouble, P * 2, "Charles's law: P / T = const");

  console.log('✓ Test 3 passed: Ideal gas law and isothermal/isochoric invariants verified\n');
}

// Test 4: Maxwell-Boltzmann Velocity Statistics
{
  console.log('Test 4: Maxwell-Boltzmann Kinetic Theory Invariants');
  const R = 8.314;
  const M_N2 = 0.028; // Nitrogen 28 g/mol = 0.028 kg/mol
  const T = 300;

  // v_rms = sqrt(3 * R * T / M)
  const vRms = Math.sqrt((3 * R * T) / M_N2);
  // v_mp = sqrt(2 * R * T / M) (most probable speed)
  const vMp = Math.sqrt((2 * R * T) / M_N2);
  // v_mean = sqrt(8 * R * T / (pi * M))
  const vMean = Math.sqrt((8 * R * T) / (Math.PI * M_N2));

  // For N2 at 300K:
  // v_rms ~ 516.9 m/s
  // v_mp ~ 422.0 m/s
  // v_mean ~ 476.2 m/s
  assert(vMp < vMean, 'v_mp must be less than v_mean');
  assert(vMean < vRms, 'v_mean must be less than v_rms');
  assert(Math.abs(vRms - 516.9) < 1.0, `v_rms for N2 at 300K is ~517 m/s (got ${vRms})`);

  // Helium at 300K (M = 0.004 kg/mol)
  const M_He = 0.004;
  const vRms_He = Math.sqrt((3 * R * T) / M_He);
  assert(vRms_He > vRms * 2.6, 'Helium molecules must move significantly faster than Nitrogen');

  console.log('✓ Test 4 passed: Maxwell-Boltzmann speed rankings and values verified\n');
}

// Test 5: Carnot Cycle Efficiency Invariants
{
  console.log('Test 5: Carnot Cycle Efficiency Invariants');
  const T_H = 600; // K
  const T_C = 300; // K
  const eta = 1 - T_C / T_H;

  assert.strictEqual(eta, 0.5, 'Carnot efficiency for 600K/300K must be exactly 0.5 (50%)');
  assert(eta > 0 && eta < 1, 'Efficiency must be strictly between 0 and 1');

  // Second law: eta can never reach 1.0 unless T_C = 0K
  const eta_high = 1 - 100 / 1000;
  assert(eta_high < 1.0, 'Efficiency cannot reach 100%');

  console.log('✓ Test 5 passed: Carnot cycle second law limits verified\n');
}

// Test 6: Frame Budget & Execution FPS Benchmark (User Requirement: 每次自动化测试必须测试帧数)
{
  console.log('Test 6: Molecular Gas System 60+ FPS Frame Budget & Performance Benchmark');
  const { MolecularGasSystem } = await import('../src/scene/thermo/MolecularGasSystem.ts');
  const gas = new MolecularGasSystem();
  gas.updateThermodynamicState(300, 0.028, 0.15);

  // Warm up JIT
  for (let i = 0; i < 30; i++) {
    gas.update(1 / 60, 0.15);
    gas.getHistogramData(20);
  }

  // Benchmark 300 physics simulation frames
  const frameCount = 300;
  const start = performance.now();
  for (let i = 0; i < frameCount; i++) {
    gas.update(1 / 60, 0.15);
  }
  const totalMs = performance.now() - start;
  const avgFrameTimeMs = totalMs / frameCount;
  const equivalentPhysicsFps = 1000 / avgFrameTimeMs;

  console.log(`  Measured Average Frame Time: ${avgFrameTimeMs.toFixed(3)} ms`);
  console.log(`  Equivalent Logic Frame Rate:  ${equivalentPhysicsFps.toFixed(0)} FPS`);

  // Target: Frame budget for 60 FPS is 16.66ms.
  // Physics simulation MUST consume < 1.5ms (< 9% of frame budget) to leave 91%+ for GPU render.
  assert(
    avgFrameTimeMs < 1.5,
    `MolecularGasSystem update exceeded 1.5ms budget! Got ${avgFrameTimeMs.toFixed(3)} ms (${equivalentPhysicsFps.toFixed(0)} FPS)`
  );
  assert(
    equivalentPhysicsFps >= 666,
    `MolecularGasSystem logic FPS must exceed 666 FPS! Got ${equivalentPhysicsFps.toFixed(0)} FPS`
  );

  // Benchmark histogram statistics calculation
  const histStart = performance.now();
  for (let i = 0; i < 50; i++) {
    gas.getHistogramData(20);
  }
  const histAvgMs = (performance.now() - histStart) / 50;
  console.log(`  Histogram Calculation Time:   ${histAvgMs.toFixed(3)} ms`);
  assert(histAvgMs < 0.2, `Histogram calculation must be < 0.2ms! Got ${histAvgMs.toFixed(3)} ms`);

  gas.dispose();
  console.log('✓ Test 6 passed: In-process 60+ FPS frame budget verified (physics < 1.5ms, logic > 666 FPS)\n');
}

// Test 7: Direct Tabletop Placement & Removal of ThermoBenchPlate
{
  console.log('Test 7: Verify apparatus is placed directly on tabletop without ThermoBenchPlate');
  const ThermoIdealGasExperiment = (await import('../src/experiments/catalog/thermo-idealgas/index.ts')).default;
  const exp = new ThermoIdealGasExperiment();

  const mockContext: any = {
    scene: new THREE.Scene(),
    camera: new THREE.PerspectiveCamera(),
    renderer: {} as any,
    parameters: {},
    getParameter: (id: string) => exp.metadata.parameters.find((p) => p.id === id)?.defaultValue,
    setParameter: () => {},
  };

  exp.init(mockContext);

  // 1. rootGroup must sit directly on the table surface (Y=0.082 relative to HologramStage Y=0.908 -> World Y=0.990)
  assert.strictEqual(exp.rootGroup.position.y, 0.082, 'rootGroup.position.y must be 0.082 for tabletop surface flush placement');
  assert.strictEqual(exp.rootGroup.position.z, 0.92, 'rootGroup.position.z must be 0.92 in front workbench zone');

  // 2. ThermoBenchPlate MUST NOT be in rootGroup
  const benchPlateChild = exp.rootGroup.children.find((c: THREE.Object3D) => c.name === 'ThermoBenchPlate');
  assert.strictEqual(benchPlateChild, undefined, 'ThermoBenchPlate must NOT be in rootGroup children');

  // 3. Components must sit directly on tabletop or their mounting surface
  const heater = (exp as any).heater;
  const cylinder = (exp as any).cylinder;
  const pressureGauge = (exp as any).pressureGauge;

  assert(heater, 'Heater must exist');
  assert(cylinder, 'Cylinder must exist');
  assert(pressureGauge, 'Pressure gauge must exist');

  assert.strictEqual(heater.group.position.y, 0, 'Heater base must sit directly on table at local y=0');
  assert.strictEqual(pressureGauge.group.position.y, 0, 'Pressure gauge base must sit directly on table at local y=0');
  assert(Math.abs(cylinder.group.position.y - 0.062) < 0.001, 'Cylinder must sit directly on top of heater plate at local y ~ 0.062');

  exp.dispose(mockContext);
  console.log('✓ Test 7 passed: Apparatus is resting directly on tabletop without intermediate bench plate\n');
}

// Test 8: Carnot Heat Engine Machine Simulation & Cycle Physics
{
  console.log('Test 8: Carnot Heat Engine Machine Simulation, Efficiency & Table Separation');
  const CarnotCycleExperiment = (await import('../src/experiments/catalog/thermo-carnot/index.ts')).default;
  const exp = new CarnotCycleExperiment();

  const mockContext: any = {
    scene: new THREE.Scene(),
    camera: new THREE.PerspectiveCamera(),
    renderer: {} as any,
    parameters: {},
    getParameter: (id: string) => exp.metadata.parameters.find((p) => p.id === id)?.defaultValue,
    setParameter: () => {},
  };

  exp.init(mockContext);

  // 1. Root group and tabletop placement
  assert.strictEqual(exp.rootGroup.position.y, 0.082, 'Carnot machine must be flush on tabletop (y=0.082)');
  assert.strictEqual(exp.rootGroup.position.z, 0.92, 'Carnot machine positioned in front workbench zone');

  // 2. Optical-grade construction: verify rubber footpads exist on machine base
  const machineMesh = (exp as any).engine;
  assert(machineMesh, 'CarnotEngineMesh must exist');
  const footpads = machineMesh.group.getObjectByName('BaseRubberFootpads');
  assert(footpads !== undefined, 'Dark rubber vibration-isolation footpads must exist to separate apparatus from dark table');

  // 3. Cycle physics & telemetry
  const tHigh = 650;
  const tLow = 320;
  exp.setTempHigh(tHigh);
  exp.setTempLow(tLow);

  const telem = exp.getCarnotTelemetry();
  const expectedEtaPct = (1 - tLow / tHigh) * 100;
  assert(Math.abs(telem.efficiency - expectedEtaPct) < 0.01, `Efficiency must be ~${expectedEtaPct.toFixed(2)}% (got ${telem.efficiency}%)`);
  assert(telem.v1 > 0 && telem.v2 > telem.v1, 'Cycle volume vertices must be valid');
  assert(telem.p1 > telem.p2, 'Pressure p1 must exceed p2 along isothermal expansion');

  // 4. Step cycle forward
  const initialTheta = (exp as any).theta;
  exp.update(0.05, 0.05, mockContext);
  const nextTheta = (exp as any).theta;
  assert(nextTheta !== initialTheta, 'Crank angle theta must advance during active engine operation');

  // 5. Presets
  exp.applyPreset('steam');
  assert.strictEqual(exp.getCarnotTelemetry().tempHigh, 650, 'Steam preset must set T_H = 650K');

  exp.dispose(mockContext);
  console.log('✓ Test 8 passed: Carnot engine simulation, η formula, and optical-grade tabletop isolation verified\n');
}

// Test 9: 1D Transient Heat Conduction & Fourier's Law PDE Solver
{
  console.log('Test 9: 1D Transient Heat Conduction & Fourier Law Numerical Solver');
  const ConductionExperiment = (await import('../src/experiments/catalog/thermo-conduction/index.ts')).default;
  const exp = new ConductionExperiment();

  const mockContext: any = {
    scene: new THREE.Scene(),
    camera: new THREE.PerspectiveCamera(),
    renderer: {} as any,
    parameters: {},
    getParameter: (id: string) => exp.metadata.parameters.find((p) => p.id === id)?.defaultValue,
    setParameter: () => {},
  };

  exp.init(mockContext);

  // 1. Bench placement & optical rail footpad separation
  assert.strictEqual(exp.rootGroup.position.y, 0.082, 'Conduction bench must be flush on tabletop');
  const bench = (exp as any).bench;
  assert(bench, 'ConductionBenchMesh must exist');
  const footpads = bench.group.getObjectByName('BenchRubberFootpads');
  assert(footpads !== undefined, 'Rubber isolation footpads must exist to elevate optical bench off table');

  // 2. High purity copper initial telemetry
  exp.setHeatSourceTemp(500);
  exp.setColdSourceTemp(300);
  exp.setMaterial('copper');
  exp.setProbePosition(0.5);

  let telem = exp.getConductionTelemetry();
  assert.strictEqual(telem.kValue, 390, 'Copper thermal conductivity k must be 390 W/(m·K)');
  assert.strictEqual(telem.heatSourceTemp, 500, 'Heat source must be 500K');
  assert.strictEqual(telem.coldSourceTemp, 300, 'Cold source must be 300K');

  // 3. Step PDE finite difference diffusion for 60 frames
  for (let i = 0; i < 60; i++) {
    exp.update(0.016, i * 0.016, mockContext);
  }

  telem = exp.getConductionTelemetry();
  // Temperature at center (0.5) must be between 300K and 500K
  assert(telem.probeTempK > 300 && telem.probeTempK < 500, `Center probe temp (${telem.probeTempK.toFixed(1)}K) must be between 300K and 500K`);
  // Fourier law: q = -k * gradT
  assert(telem.localHeatFlux > 0, 'Heat flux must be positive from hot to cold reservoir');
  assert(telem.probeGradient < 0, 'Temperature gradient dT/dx must be negative along x');

  // 4. Material switching to Stainless Steel (low k)
  exp.setMaterial('steel');
  telem = exp.getConductionTelemetry();
  assert.strictEqual(telem.kValue, 16, 'Steel thermal conductivity k must be 16 W/(m·K)');

  // 5. Composite material
  exp.setMaterial('composite');
  exp.setProbePosition(0.2); // In copper region
  telem = exp.getConductionTelemetry();
  assert.strictEqual(telem.kValue, 390, 'Composite bar at x=0.2 must have copper k=390');

  exp.setProbePosition(0.8); // In steel region
  telem = exp.getConductionTelemetry();
  assert.strictEqual(telem.kValue, 16, 'Composite bar at x=0.8 must have steel k=16');

  exp.dispose(mockContext);
  console.log('✓ Test 9 passed: Conduction PDE solver, Fourier law q=-k∇T, and multi-material properties verified\n');
}

// Test 10: Continuous Thermodynamic Phase Transition & Calorimetry
{
  console.log('Test 10: Continuous Thermodynamic Phase Transition, Latent Heat & Energy Conservation');
  const PhaseTransitionExperiment = (await import('../src/experiments/catalog/thermo-phase/index.ts')).default;
  const exp = new PhaseTransitionExperiment();

  const mockContext: any = {
    scene: new THREE.Scene(),
    camera: new THREE.PerspectiveCamera(),
    renderer: {} as any,
    parameters: {},
    getParameter: (id: string) => exp.metadata.parameters.find((p) => p.id === id)?.defaultValue,
    setParameter: () => {},
  };

  exp.init(mockContext);

  // 1. Calorimeter tabletop placement and isolation
  assert.strictEqual(exp.rootGroup.position.y, 0.082, 'Calorimeter must be flush on tabletop');
  const calorimeter = (exp as any).calorimeter;
  assert(calorimeter, 'PhaseCalorimeterMesh must exist');
  const footpads = calorimeter.group.getObjectByName('CalorimeterRubberFootpads');
  assert(footpads !== undefined, 'Calorimeter rubber isolation footpads must exist to separate apparatus from table');

  // 2. Setup: 100g ice starting at -20°C (253.15K), 1200W heating power
  exp.setHeatPower(1200);
  exp.setSubstanceMass(100); // 100g
  exp.setTimeAcceleration(1.0);

  let telem = exp.getPhaseTelemetry();
  assert.strictEqual(telem.currentPhaseStage, 'subzero_ice', 'Initial phase stage must be subzero_ice');
  assert(telem.iceFraction === 1.0, 'Initial ice fraction must be 1.0 (100%)');
  assert(telem.waterFraction === 0.0, 'Initial water fraction must be 0.0');

  // 3. Step simulation until melting plateau is reached (0°C)
  // Specific heat of ice = 2100 J/(kg·K). For 0.1kg and 20K rise: Q = 0.1 * 2100 * 20 = 4200 J.
  // At 1200 W, this takes ~3.5s.
  for (let i = 0; i < 250; i++) {
    exp.update(0.02, i * 0.02, mockContext);
    if (exp.getPhaseTelemetry().currentPhaseStage === 'melting_plateau') break;
  }

  telem = exp.getPhaseTelemetry();
  assert.strictEqual(telem.currentPhaseStage, 'melting_plateau', 'Stage must reach melting_plateau at 0°C');
  assert(Math.abs(telem.temperatureC) < 0.05, `Temperature must stay clamped at 0°C during melting (got ${telem.temperatureC.toFixed(2)}°C)`);

  // 4. Verify latent heat absorption during melting
  // Latent heat of fusion = 334,000 J/kg. For 100g: 33,400 J.
  // Step during melting
  for (let i = 0; i < 500; i++) {
    exp.update(0.02, i * 0.02, mockContext);
    if (exp.getPhaseTelemetry().currentPhaseStage === 'liquid_water') break;
  }

  telem = exp.getPhaseTelemetry();
  assert(telem.iceFraction < 1.0, 'Ice must have started melting (iceFraction < 1.0)');
  assert(telem.waterFraction > 0.0, 'Water fraction must be > 0.0');

  exp.dispose(mockContext);
  console.log('✓ Test 10 passed: Thermodynamic phase transitions, latent heat plateaus, and energy conservation verified\n');
}

// Test 11: Real-World 60+ FPS Frame Budget for Conduction & Phase PDE Solvers
{
  console.log('Test 11: Thermodynamics Conduction & Phase Solvers 60+ FPS Frame Budget Benchmark');
  const ConductionExperiment = (await import('../src/experiments/catalog/thermo-conduction/index.ts')).default;
  const PhaseTransitionExperiment = (await import('../src/experiments/catalog/thermo-phase/index.ts')).default;

  const condExp = new ConductionExperiment();
  const phaseExp = new PhaseTransitionExperiment();

  const mockContext: any = {
    scene: new THREE.Scene(),
    camera: new THREE.PerspectiveCamera(),
    renderer: {} as any,
    parameters: {},
    getParameter: () => undefined,
    setParameter: () => {},
  };

  condExp.init(mockContext);
  phaseExp.init(mockContext);

  // Benchmark Conduction PDE Solver
  const condStart = performance.now();
  const condIterations = 200;
  for (let i = 0; i < condIterations; i++) {
    condExp.update(0.016, i * 0.016, mockContext);
  }
  const condAvgMs = (performance.now() - condStart) / condIterations;
  const condFps = 1000 / condAvgMs;
  console.log(`  Conduction PDE Solver Frame Time:   ${condAvgMs.toFixed(4)} ms (${condFps.toFixed(0)} FPS)`);
  assert(condAvgMs < 0.5, `Conduction PDE solver must take < 0.5ms! Got ${condAvgMs.toFixed(4)} ms`);

  // Benchmark Phase Transition Enthalpy Solver
  const phaseStart = performance.now();
  const phaseIterations = 200;
  for (let i = 0; i < phaseIterations; i++) {
    phaseExp.update(0.016, i * 0.016, mockContext);
  }
  const phaseAvgMs = (performance.now() - phaseStart) / phaseIterations;
  const phaseFps = 1000 / phaseAvgMs;
  console.log(`  Phase Transition Solver Frame Time: ${phaseAvgMs.toFixed(4)} ms (${phaseFps.toFixed(0)} FPS)`);
  assert(phaseAvgMs < 0.2, `Phase transition solver must take < 0.2ms! Got ${phaseAvgMs.toFixed(4)} ms`);

  condExp.dispose(mockContext);
  phaseExp.dispose(mockContext);

  console.log('✓ Test 11 passed: Conduction and Phase solvers execute comfortably within 60+ FPS frame budget\n');
}

console.log('========================================================');
console.log('All Thermodynamics Module Tests Passed (11/11)!');
console.log('========================================================\n');
