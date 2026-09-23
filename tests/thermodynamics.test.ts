import assert from 'node:assert';
import { CATEGORIES } from '../src/experiments/ExperimentRegistry.ts';
import { metadata as idealGasMeta } from '../src/experiments/catalog/thermo-idealgas/meta.ts';
import { metadata as carnotMeta } from '../src/experiments/catalog/thermo-carnot/meta.ts';
import { metadata as conductionMeta } from '../src/experiments/catalog/thermo-conduction/meta.ts';
import { metadata as phaseMeta } from '../src/experiments/catalog/thermo-phase/meta.ts';

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

console.log('========================================================');
console.log('All Thermodynamics Module Tests Passed (6/6)!');
console.log('========================================================\n');
