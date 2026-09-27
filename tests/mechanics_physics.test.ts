import assert from 'node:assert';
import { calculateLinearFit } from '../src/physics/mech/regression.ts';
import { solveNewtonDynamics } from '../src/physics/mech/newtonDynamics.ts';
import { solveCollisionDynamics } from '../src/physics/mech/collisionDynamics.ts';
import { solveProjectileDynamics } from '../src/physics/mech/projectileDynamics.ts';
import { solvePendulumDynamics, getPendulumAngleAtTime } from '../src/physics/mech/pendulumDynamics.ts';
import { solveCentripetalDynamics } from '../src/physics/mech/centripetalDynamics.ts';

console.log('=== Starting Mechanics Physics & Analytical Precision Tests ===\n');

// Test 1: Least Squares Linear Regression Solver
{
  console.log('Test 1: Linear regression precision on known points');
  // y = 2.5 * x + 1.2
  const pts = [
    { x: 1, y: 3.7 },
    { x: 2, y: 6.2 },
    { x: 3, y: 8.7 },
    { x: 4, y: 11.2 },
  ];
  const fit = calculateLinearFit(pts);
  assert(fit.valid, 'Regression must be valid');
  assert(Math.abs(fit.slope - 2.5) < 1e-6, `Slope should be 2.5, got ${fit.slope}`);
  assert(Math.abs(fit.intercept - 1.2) < 1e-6, `Intercept should be 1.2, got ${fit.intercept}`);
  assert(Math.abs(fit.r2 - 1.0) < 1e-6, `R2 should be 1.0, got ${fit.r2}`);
  console.log('✓ Test 1 passed: Regression solver calculates exact slope and R2\n');
}

// Test 2: Newton 2nd Law Dynamics & Difference Method
{
  console.log('Test 2: Newton 2nd Law & Ticker Difference Method');
  // M = 0.200 kg, m = 0.020 kg, angle = 0, mu = 0, g = 9.80
  // a = m * g / (M + m) = 0.020 * 9.80 / 0.220 = 0.890909 m/s^2
  const res = solveNewtonDynamics({
    cartMassKg: 0.200,
    hookMassKg: 0.020,
    inclineDeg: 0,
    frictionMu: 0,
    gravity: 9.80,
  });

  const expectedA = (0.020 * 9.80) / 0.220;
  assert(Math.abs(res.acceleration - expectedA) < 1e-6, 'Acceleration must match analytic formula');
  assert(res.dots.length > 10, 'Must generate ticker dots');
  // Verify difference method matches theoretical acceleration
  assert(Math.abs(res.diffAccCalc - res.acceleration) < 1e-5, 'Difference method must match theoretical a');
  console.log('✓ Test 2 passed: Newton dynamics and ticker difference method verified\n');
}

// Test 3: Momentum Conservation & Elastic/Inelastic Collisions
{
  console.log('Test 3: Collision Dynamics on Air Track');
  // Elastic collision: m1 = 0.150, m2 = 0.150, v1 = 1.0, v2 = 0 => equal mass swap velocities: v1' = 0, v2' = 1.0
  const elasticRes = solveCollisionDynamics({
    m1Kg: 0.150,
    m2Kg: 0.150,
    v1: 1.0,
    v2: 0.0,
    mode: 'elastic',
  });
  assert(Math.abs(elasticRes.v1After) < 1e-6, 'Elastic equal mass: v1After should be 0');
  assert(Math.abs(elasticRes.v2After - 1.0) < 1e-6, 'Elastic equal mass: v2After should be 1.0');
  assert(elasticRes.pRelativeError < 1e-6, 'Momentum must be conserved');
  assert(Math.abs(elasticRes.keRetentionRatio - 1.0) < 1e-6, 'KE must be 100% retained in elastic collision');

  // Inelastic collision: m1 = 0.150, m2 = 0.150, v1 = 1.0, v2 = 0 => vCommon = 0.5
  const inelasticRes = solveCollisionDynamics({
    m1Kg: 0.150,
    m2Kg: 0.150,
    v1: 1.0,
    v2: 0.0,
    mode: 'inelastic',
  });
  assert(Math.abs(inelasticRes.v1After - 0.5) < 1e-6, 'Inelastic: v1After should be 0.5');
  assert(Math.abs(inelasticRes.v2After - 0.5) < 1e-6, 'Inelastic: v2After should be 0.5');
  assert(inelasticRes.pRelativeError < 1e-6, 'Momentum must still be conserved');
  assert(Math.abs(inelasticRes.keRetentionRatio - 0.5) < 1e-6, 'KE retention should be 50% for equal masses');
  console.log('✓ Test 3 passed: Collision dynamics and momentum conservation verified\n');
}

// Test 4: Projectile Motion & Mechanical Energy Conservation
{
  console.log('Test 4: Projectile Motion & Energy Conservation');
  // Release from H = 0.20m, drop y = 0.40m
  const proj = solveProjectileDynamics({
    releaseHeightM: 0.20,
    ballMassKg: 0.030,
    targetYM: 0.40,
    gravity: 9.80,
  });
  const expectedV0 = Math.sqrt(2 * 9.80 * 0.20);
  assert(Math.abs(proj.v0 - expectedV0) < 1e-6, 'Horizontal exit speed must match sqrt(2gH)');
  assert(proj.energyDiscrepancy < 1e-9, 'Delta Ep must strictly equal Delta Ek');
  assert(proj.points.length > 20, 'Trajectory points must be populated');
  console.log('✓ Test 4 passed: Projectile motion and strict mechanical energy conservation verified\n');
}

// Test 5: Simple Pendulum Period & Gravity Measurement
{
  console.log('Test 5: Pendulum Period and Gravity Calculation');
  // Line = 0.990 m, ball diameter = 0.020 m => effective length = 1.000 m
  // T = 2 * pi * sqrt(1.0 / 9.80) = 2.0070899 s
  const pend = solvePendulumDynamics({
    lineLengthM: 0.990,
    ballDiameterM: 0.020,
    initialAngleDeg: 4.0,
    ballMassKg: 0.030,
    gravity: 9.80,
  });
  assert(Math.abs(pend.effectiveLengthM - 1.000) < 1e-6, 'Effective length must be line + d/2');
  const expectedT = 2 * Math.PI * Math.sqrt(1.000 / 9.80);
  assert(Math.abs(pend.periodS - expectedT) < 1e-6, 'Period must match formula');
  assert(Math.abs(pend.calculatedGravity - 9.80) < 1e-6, 'Calculated g must equal 9.80');

  const ang = getPendulumAngleAtTime(0, 1.0, 4.0, 9.80);
  assert(Math.abs(ang.angleDeg - 4.0) < 1e-6, 'At t=0 angle must be initial angle');
  console.log('✓ Test 5 passed: Pendulum period and precision gravity measurement verified\n');
}

// Test 6: Centripetal Force Inquiry
{
  console.log('Test 6: Centripetal Force Scaling');
  // m = 0.100 kg, r = 0.10 m, omega = 10 rad/s
  // Fn = 0.100 * 10^2 * 0.10 = 1.00 N
  const cent = solveCentripetalDynamics({
    massKg: 0.100,
    radiusM: 0.10,
    angularVelocityRadS: 10.0,
  });
  assert(Math.abs(cent.centripetalForceN - 1.0) < 1e-6, 'Centripetal force must be 1.0 N');
  assert(Math.abs(cent.centripetalAccMs2 - 10.0) < 1e-6, 'Centripetal acc must be 10.0 m/s^2');
  assert(Math.abs(cent.linearVelocityMs - 1.0) < 1e-6, 'Linear speed must be 1.0 m/s');
  assert(Math.abs(cent.indicatorScaleMarks - 2.0) < 1e-6, '1.0 N corresponds to 2 marks (0.5N each)');
  console.log('✓ Test 6 passed: Centripetal force and scaling verified\n');
}

console.log('========================================================');
console.log('All Mechanics Analytical Physics Tests Passed (6/6)!');
console.log('========================================================\n');
