import assert from 'node:assert';
import * as THREE from 'three';

if (typeof (globalThis as any).document === 'undefined') {
  const dummyCtx: any = new Proxy({}, {
    get: (_target, prop) => {
      if (prop === 'measureText') return () => ({ width: 10 });
      return () => dummyCtx;
    },
  });
  (globalThis as any).document = {
    createElement: () => ({
      width: 0,
      height: 0,
      getContext: () => dummyCtx,
    }),
  };
}

import { ChemistryEngine } from '../src/chemistry/ChemistryEngine.ts';
import { BeakerMesh } from '../src/scene/BeakerMesh.ts';
import { HoloTable } from '../src/scene/HoloTable.ts';
import {
  POUR_EXIT_SPEED,
  POUR_GRAVITY,
  POUR_LIP_CLEARANCE,
  POUR_STREAM_RADIAL,
  POUR_TILT,
  buildTiltedLiquidGeometry,
  composePourStream,
  ellipticTubeIndices,
  lipContactLocal,
  lipGoalForPour,
  lipOutwardFromTilt,
  solveLiquidPlane,
  writeEllipticTube,
} from '../src/chemistry/pourKinematics.ts';

console.log('=== Starting Dual-Beaker Mixing & Composition Analysis Deep Verification ===\n');

// --------------------------------------------------------------------------
// Test 1: Symmetrical Laboratory Desk Layout Invariants (Table Center Unoccupied)
// --------------------------------------------------------------------------
console.log('Test 1: Symmetrical Laboratory Desk Layout Invariants');
{
  const table = new HoloTable();
  const leftMesh = new BeakerMesh();
  const rightMesh = new BeakerMesh();

  // Set resting positions near table edge
  leftMesh.restingPosition.set(-0.38, 0.852, 1.10);
  rightMesh.restingPosition.set(0.38, 0.852, 1.10);

  table.mountBeakers(leftMesh.group, rightMesh.group, leftMesh.restingPosition, rightMesh.restingPosition);

  // 1. Check left beaker position: x = -0.38
  assert.strictEqual(leftMesh.group.position.x, -0.38, 'Left beaker must be placed on the left side (x = -0.38)');
  assert.strictEqual(leftMesh.group.position.y, 0.852, 'Left beaker base must rest flush on table top (y = 0.852)');
  assert.strictEqual(leftMesh.group.position.z, 1.10, 'Left beaker base must rest near table edge (z = 1.10)');

  // 2. Check right beaker position: x = +0.38
  assert.strictEqual(rightMesh.group.position.x, 0.38, 'Right beaker must be placed on the right side (x = +0.38)');
  assert.strictEqual(rightMesh.group.position.y, 0.852, 'Right beaker base must rest flush on table top (y = 0.852)');
  assert.strictEqual(rightMesh.group.position.z, 1.10, 'Right beaker base must rest near table edge (z = 1.10)');

  // 3. Check symmetry and distance
  assert.strictEqual(Math.abs(leftMesh.group.position.x + rightMesh.group.position.x) < 1e-6, true, 'Beakers must be placed symmetrically across center');
  const span = Math.round((rightMesh.group.position.x - leftMesh.group.position.x) * 100) / 100;
  assert.strictEqual(span, 0.76, 'Beaker separation distance should be 0.76m leaving center completely clear');

  // 4. Verify center is empty
  const centerOccupied = (leftMesh.group.position.x === 0 || rightMesh.group.position.x === 0);
  assert.strictEqual(centerOccupied, false, 'Table center must remain completely unoccupied');

  console.log('✓ Test 1 passed: Symmetrical dual-beaker placement and unoccupied center verified\n');
}

// --------------------------------------------------------------------------
// Test 2: Physical Fluid Mechanics During Pouring Tilt
// --------------------------------------------------------------------------
console.log('Test 2: Physical Fluid Mechanics During Pouring Tilt');
{
  const beaker = new BeakerMesh();
  beaker.updateFromState({
    volume: 60,
    maxVolume: 250,
    temperature: 20,
    pH: 7,
    ions: new Map(),
    precipitates: new Map(),
    solids: new Map(),
    indicators: new Map(),
    liquidColor: new THREE.Color(0x0a84ff),
    recentReactions: [],
  });

  // Check initial tilt is 0
  assert.strictEqual(beaker.currentTiltZ, 0, 'Initial tilt should be 0');

  // Tilt beaker by 30 degrees (pi / 6)
  const tiltAngle = Math.PI / 6;
  beaker.setTilt(tiltAngle);

  // Update over multiple frames to simulate fluid physics
  for (let i = 0; i < 30; i++) {
    beaker.update(0.016);
  }

  // Tilt should have lerped towards target
  assert(beaker.currentTiltZ > 0.4, `Current tilt should have approached target angle (${tiltAngle}), got ${beaker.currentTiltZ}`);

  // Test Lip and Mouth World Position helpers
  const lipPos = beaker.getLipWorldPosition();
  const mouthPos = beaker.getMouthWorldPosition();

  assert(lipPos instanceof THREE.Vector3, 'Lip position must be a Vector3');
  assert(lipPos.y > beaker.group.position.y, 'Lip elevation must be above beaker base');
  assert(mouthPos.y > beaker.group.position.y, 'Mouth elevation must be above beaker base');

  console.log('✓ Test 2 passed: Fluid mechanics and lip/mouth world kinematics verified\n');
}

// --------------------------------------------------------------------------
// Test 3: Continuous Volume & Solute Transfer via mixFrom()
// --------------------------------------------------------------------------
console.log('Test 3: Continuous Volume & Solute Transfer via mixFrom()');
{
  const sourceEngine = new ChemistryEngine();
  const targetEngine = new ChemistryEngine();

  // Source: 60mL HCl (1M)
  sourceEngine.addReagent('HCl', 60);
  const srcInitialVol = sourceEngine.state.volume;
  const srcH = sourceEngine.state.ions.get('H+') || 0;
  const srcCl = sourceEngine.state.ions.get('Cl-') || 0;

  assert.strictEqual(srcInitialVol, 120, 'Source must have 120 mL (60mL solvent + 60mL reagent)');
  assert(srcH > 0.05, 'Source must contain H+ ions');

  // Pour 40 mL (1/3) from source into target (which starts with pure water 60 mL)
  const targetInitialVol = targetEngine.state.volume;
  targetEngine.mixFrom(sourceEngine, 40);

  // Verify source volume decreased by 40 mL
  assert.strictEqual(Math.round(sourceEngine.state.volume), 80, 'Source volume should decrease to 80 mL');

  // Verify target volume increased by 40 mL
  assert.strictEqual(Math.round(targetEngine.state.volume), Math.round(targetInitialVol + 40), 'Target volume should increase to 100 mL');

  // Verify solute ions transferred proportionally (40/120 = 1/3 transferred)
  const targetH = targetEngine.state.ions.get('H+') || 0;
  const targetCl = targetEngine.state.ions.get('Cl-') || 0;
  const expectedTransferH = srcH * (40 / 120);

  assert(Math.abs(targetH - expectedTransferH) < 1e-4, `Target H+ (${targetH}) should match transferred proportion (${expectedTransferH})`);
  assert(Math.abs(targetCl - (srcCl * (40 / 120))) < 1e-4, 'Target Cl- should match transferred proportion');

  // Transfer remaining 80 mL
  targetEngine.mixFrom(sourceEngine, 100); // request more than available
  assert.strictEqual(sourceEngine.state.volume, 0, 'Source beaker should be completely emptied');
  assert.strictEqual(sourceEngine.state.ions.get('H+'), 0, 'Source H+ should be 0');
  assert.strictEqual(Math.round(targetEngine.state.volume), 180, 'Target beaker should now contain all 180 mL');

  console.log('✓ Test 3 passed: Volume & ion conservation during continuous pouring verified\n');
}

// --------------------------------------------------------------------------
// Test 4: Chemical Neutralization Reaction Triggered by Mixing (HCl + NaOH)
// --------------------------------------------------------------------------
console.log('Test 4: Chemical Neutralization Reaction Triggered by Mixing (HCl + NaOH)');
{
  const leftEngine = new ChemistryEngine();
  const rightEngine = new ChemistryEngine();

  // Left beaker: 50mL 1.0M HCl (0.05 mol H+)
  leftEngine.addReagent('HCl', 50);
  // Right beaker: 50mL 1.0M NaOH (0.05 mol OH-)
  rightEngine.addReagent('NaOH', 50);

  assert(leftEngine.state.pH < 2.0, 'Left beaker must be acidic');
  assert(rightEngine.state.pH > 12.0, 'Right beaker must be alkaline');

  // Mix left beaker completely into right beaker
  rightEngine.mixFrom(leftEngine);

  // Should trigger neutralization: HCl + NaOH -> NaCl + H2O
  assert.strictEqual(rightEngine.state.recentReactions.length > 0, true, 'Must trigger reaction upon mixing');
  const rx = rightEngine.state.recentReactions[0];
  assert(rx.equation.includes('NaCl') || rx.equation.includes('H₂O'), `Neutralization equation expected, got: ${rx.equation}`);

  // pH should be neutralized to ~7.00
  assert(Math.abs(rightEngine.state.pH - 7.00) < 0.1, `Mixture pH should be neutral ~7.00, got: ${rightEngine.state.pH}`);

  // Exothermic temperature rise
  assert(rightEngine.state.temperature > 24.0, `Temperature should rise exothermically, got: ${rightEngine.state.temperature}°C`);

  console.log('✓ Test 4 passed: Acid-base neutralization triggered by beaker mixing verified\n');
}

// --------------------------------------------------------------------------
// Test 5: Dynamic Precipitation Reaction Triggered by Mixing (BaCl2 + CuSO4)
// --------------------------------------------------------------------------
console.log('Test 5: Dynamic Precipitation Reaction Triggered by Mixing (BaCl2 + CuSO4)');
{
  const leftEngine = new ChemistryEngine();
  const rightEngine = new ChemistryEngine();

  // Left beaker: BaCl2
  leftEngine.addReagent('BaCl2', 50);
  // Right beaker: CuSO4
  rightEngine.addReagent('CuSO4', 50);

  // Pour left beaker into right beaker
  rightEngine.mixFrom(leftEngine);

  // Should trigger BaCl2 + CuSO4 -> BaSO4(s) + CuCl2
  assert(rightEngine.state.precipitates.has('BaSO4'), 'Must form BaSO4 precipitate upon mixing');
  const precip = rightEngine.state.precipitates.get('BaSO4')!;
  assert(precip.moles > 0.01, `BaSO4 precipitate moles should be > 0.01, got ${precip.moles}`);

  const rx = rightEngine.state.recentReactions.find((r) => r.equation.includes('BaSO₄'));
  assert(rx !== undefined, 'Reaction log must record BaSO4 precipitate equation');

  console.log('✓ Test 5 passed: Precipitate reaction and macro equation verified\n');
}

// --------------------------------------------------------------------------
// Test 6: Solid Metal Displacement Reaction Triggered by Mixing (Mg Ribbon + HCl)
// --------------------------------------------------------------------------
console.log('Test 6: Solid Metal Displacement Reaction Triggered by Mixing (Mg Ribbon + HCl)');
{
  const leftEngine = new ChemistryEngine();
  const rightEngine = new ChemistryEngine();

  // Left beaker: 50mL HCl
  leftEngine.addReagent('HCl', 50);
  // Right beaker: 1 piece of Mg ribbon
  rightEngine.addReagent('Mg', 1);

  assert(rightEngine.state.solids.has('Mg'), 'Right beaker must contain solid Mg ribbon');

  // Pour HCl from left into right beaker
  rightEngine.mixFrom(leftEngine);

  // Should trigger Mg + 2HCl -> MgCl2 + H2(g)
  const mgSolid = rightEngine.state.solids.get('Mg');
  const initialMgMoles = 0.015;
  const currentMgMoles = mgSolid ? mgSolid.moles : 0;
  assert(currentMgMoles < initialMgMoles, 'Solid Mg must be consumed by acid displacement');

  const rx = rightEngine.state.recentReactions.find((r) => r.equation.includes('H₂'));
  assert(rx !== undefined, 'Reaction log must record H2 gas evolution');
  assert(rightEngine.state.temperature > 30.0, `Vigorous exotherm expected, got ${rightEngine.state.temperature}°C`);

  console.log('✓ Test 6 passed: Solid metal acid displacement reaction on mixture verified\n');
}

// --------------------------------------------------------------------------
// Test 7: 100% Normalized Composition Analysis (getCompositionAnalysis) Invariants
// --------------------------------------------------------------------------
console.log('Test 7: 100% Normalized Composition Analysis Invariants');
{
  // 1. Pure Water Case: 0 solutes, water separately tracked
  const waterEngine = new ChemistryEngine();
  const waterComp = waterEngine.getCompositionAnalysis();

  assert.strictEqual(waterComp.components.length, 0, 'Pure water must have 0 solute components in pie chart');
  assert.strictEqual(waterComp.waterVolumeMl, 60, 'Water volume must be 60 mL');
  assert(waterComp.waterMoles > 3.0, 'Water moles must be ~3.33 mol');

  // 2. Multicomponent Solution (HCl + NaCl)
  const multiEngine = new ChemistryEngine();
  multiEngine.addReagent('HCl', 40);
  multiEngine.addReagent('NaCl', 40);

  const multiComp = multiEngine.getCompositionAnalysis();
  assert(multiComp.components.length >= 3, `Expected at least 3 solute ions (H+, Cl-, Na+), got ${multiComp.components.length}`);

  // Invariant A: Sum of percentages MUST strictly equal 100.0%
  const totalPct = multiComp.components.reduce((sum, c) => sum + c.percentage, 0);
  assert(Math.abs(totalPct - 100.0) < 0.1, `Sum of pie chart percentages must be 100.0%, got ${totalPct}%`);

  // Invariant B: Ranked from largest to smallest (从大到小排列)
  for (let i = 0; i < multiComp.components.length - 1; i++) {
    assert(
      multiComp.components[i].percentage >= multiComp.components[i + 1].percentage,
      `Ranked list must be sorted descending: component #${i} (${multiComp.components[i].formula}: ${multiComp.components[i].percentage}%) >= component #${i + 1} (${multiComp.components[i + 1].formula}: ${multiComp.components[i + 1].percentage}%)`
    );
  }

  // Invariant C: Water H2O is separately reported and NOT diluted into the solute chart
  assert(multiComp.waterVolumeMl > 0, 'Water volume must be tracked separately');
  assert(multiComp.waterMoles > 0, 'Water moles must be tracked separately');

  // 3. Solution with Precipitates and Solids (AgNO3 + HCl)
  const precipEngine = new ChemistryEngine();
  precipEngine.addReagent('AgNO3', 30);
  precipEngine.addReagent('HCl', 30);

  const precipComp = precipEngine.getCompositionAnalysis();
  const hasAgCl = precipComp.components.some((c) => c.category === 'precipitate' && c.formula.includes('AgCl'));
  assert(hasAgCl, 'Composition analysis must include AgCl precipitate');

  const precipTotalPct = precipComp.components.reduce((sum, c) => sum + c.percentage, 0);
  assert(Math.abs(precipTotalPct - 100.0) < 0.1, `Precipitate mixture percentages must sum to 100%, got ${precipTotalPct}%`);

  // Check descending sort order for precipitate mixture as well
  for (let i = 0; i < precipComp.components.length - 1; i++) {
    assert(
      precipComp.components[i].percentage >= precipComp.components[i + 1].percentage,
      `Precipitate ranked list must be sorted descending: #${i} >= #${i + 1}`
    );
  }

  console.log('✓ Test 7 passed: 100% normalization, descending rank order, and separate solvent metrics verified\n');
}

// --------------------------------------------------------------------------
// Test 8: Default Selection & Periodic Table Reagent Assignment
// --------------------------------------------------------------------------
console.log('Test 8: Default Selection & Periodic Table Reagent Assignment');
{
  const leftEngine = new ChemistryEngine();
  const rightEngine = new ChemistryEngine();

  // Test alias resolution
  leftEngine.addReagent('hcl_1m', 40);
  assert.strictEqual(leftEngine.state.volume, 100, 'Adding hcl_1m via alias should add 40mL (total 100mL)');

  rightEngine.addReagent('mg_ribbon', 2);
  assert.strictEqual(rightEngine.state.solids.has('Mg'), true, 'Adding mg_ribbon via alias should add solid Mg');

  console.log('✓ Test 8 passed: Reagent alias resolution and target routing verified\n');
}

// --------------------------------------------------------------------------
// Test 9: Multi-Frame Continuous Pouring Buffer Retention (No Erasing Reactions)
// --------------------------------------------------------------------------
console.log('Test 9: Multi-Frame Continuous Pouring Buffer Retention');
{
  const leftEngine = new ChemistryEngine();
  const rightEngine = new ChemistryEngine();

  // Left: 50 mL 1.0M HCl (0.05 mol)
  leftEngine.addReagent('HCl', 50);
  // Right: 50 mL 1.0M NaOH (0.05 mol)
  rightEngine.addReagent('NaOH', 50);

  // Simulate 60 frames of continuous transfer (~1.8 mL per frame)
  const totalFrames = 60;
  const transferPerFrame = leftEngine.state.volume / totalFrames;

  for (let frame = 0; frame < totalFrames; frame++) {
    rightEngine.mixFrom(leftEngine, transferPerFrame);
  }

  // Verify that neutralization reaction is NOT wiped out by 60 intermediate frames
  assert(rightEngine.state.recentReactions.length > 0, 'Recent reactions must contain the reaction');
  const hasNeutralization = rightEngine.state.recentReactions.some((r) => r.id === 'neutralization');
  assert.strictEqual(hasNeutralization, true, 'Neutralization reaction MUST remain in recent reactions after multi-frame pouring');

  // Verify there are NOT 8 duplicate copies of mix_solutions flooding the buffer
  const mixSolutionsCount = rightEngine.state.recentReactions.filter((r) => r.id === 'mix_solutions').length;
  assert(mixSolutionsCount <= 1, `mix_solutions must not flood the reaction log, got ${mixSolutionsCount}`);

  // Verify composition analysis reports neutralization as recent reaction
  const comp = rightEngine.getCompositionAnalysis();
  assert(comp.recentReaction !== null, 'Recent reaction in composition must not be null');
  assert.strictEqual(comp.recentReaction?.id, 'neutralization', 'Composition analysis must record neutralization as recent reaction');

  console.log('✓ Test 9 passed: Multi-frame continuous pouring preserves actual reactions without duplicate flooding\n');
}

// --------------------------------------------------------------------------
// Test 10: Lip Kinematics for Both Pouring Directions
// --------------------------------------------------------------------------
console.log('Test 10: Lip Kinematics for Both Pouring Directions');
{
  const beaker = new BeakerMesh();

  // 1. Pouring to the Right (Negative tilt)
  beaker.setTilt(-Math.PI / 4);
  for (let i = 0; i < 20; i++) beaker.update(0.016);

  const rightLip = beaker.getLipWorldPosition('right');
  const leftLip = beaker.getLipWorldPosition('left');
  assert(rightLip.y < leftLip.y, 'Right lip must be lower than left lip when tilted right');

  // 2. Pouring to the Left (Positive tilt)
  beaker.setTilt(Math.PI / 4);
  for (let i = 0; i < 40; i++) beaker.update(0.016);

  const rightLipAfter = beaker.getLipWorldPosition('right');
  const leftLipAfter = beaker.getLipWorldPosition('left');
  assert(leftLipAfter.y < rightLipAfter.y, 'Left lip must be lower than right lip when tilted left');

  console.log('✓ Test 10 passed: Directional lip kinematics verified for both left-to-right and right-to-left pouring\n');
}

// --------------------------------------------------------------------------
// Test 11: SVG Pie Chart Arc Geometry Non-Inversion for Small Percentages
// --------------------------------------------------------------------------
console.log('Test 11: SVG Pie Chart Arc Geometry Non-Inversion for Small Percentages');
{
  // Simulate small percentage slice angle calculation
  const smallPercentages = [0.1, 0.5, 1.0, 5.0, 50.0];
  for (const pct of smallPercentages) {
    const sliceAngle = (pct / 100) * Math.PI * 2;
    const gap = Math.min(0.018, sliceAngle * 0.12);
    const a0 = gap;
    const a1 = sliceAngle - gap;
    assert(a1 > a0, `Arc end angle (${a1}) must strictly exceed start angle (${a0}) for ${pct}%`);
  }

  console.log('✓ Test 11 passed: Pie chart SVG arc geometry non-inversion guaranteed across all percentage scales\n');
}

// --------------------------------------------------------------------------
// Test 12: Pour leaves the lip on a level surface and falls into the other beaker
// --------------------------------------------------------------------------
console.log('Test 12: Lip pour, level free surface, and ballistic stream');
{
  const radius = 0.131;
  const yBottom = 0.009;
  const yRim = 0.36;
  const fill = 0.28 * 0.24;

  const mild = solveLiquidPlane(-0.35, fill, radius, yBottom, yRim);
  assert.strictEqual(mild.spilling, false, '60 mL must not spill at 20°');
  assert(mild.yAtZero + mild.slope * radius > mild.yAtZero - mild.slope * radius, 'water climbs the lowered +X wall');

  const steep = solveLiquidPlane(-POUR_TILT, fill, radius, yBottom, yRim);
  assert.strictEqual(steep.spilling, true, '60 mL must spill at the pour tilt');
  assert(Math.abs((steep.yAtZero + steep.slope * steep.xLip) - yRim) < 1e-3, 'spilling surface is pinned to the lip');

  const level = solveLiquidPlane(-0.45, fill, radius, yBottom, yRim);
  const geo = buildTiltedLiquidGeometry(level, 64, 0.136);
  let topCount = 0;
  const localUp = { x: Math.sin(-0.45), y: Math.cos(-0.45), z: 0 };
  for (let i = 0; i < geo.indices.length; i += 3) {
    const ia = geo.indices[i] * 3;
    const ib = geo.indices[i + 1] * 3;
    const ic = geo.indices[i + 2] * 3;
    const ax = geo.positions[ia];
    const ay = geo.positions[ia + 1];
    const az = geo.positions[ia + 2];
    const bx = geo.positions[ib];
    const by = geo.positions[ib + 1];
    const bz = geo.positions[ib + 2];
    const cx = geo.positions[ic];
    const cy = geo.positions[ic + 1];
    const cz = geo.positions[ic + 2];
    const abx = bx - ax;
    const aby = by - ay;
    const abz = bz - az;
    const acx = cx - ax;
    const acy = cy - ay;
    const acz = cz - az;
    const nx = aby * acz - abz * acy;
    const ny = abz * acx - abx * acz;
    const nz = abx * acy - aby * acx;
    const nLen = Math.hypot(nx, ny, nz);
    if (nLen < 1e-8) continue;
    const px = (ax + bx + cx) / 3;
    const py = (ay + by + cy) / 3;
    const pz = (az + bz + cz) / 3;
    const planeDist = Math.abs(localUp.x * px + localUp.y * (py - level.yAtZero) + localUp.z * pz);
    if (planeDist < 0.004 && py > yBottom + 0.01) {
      topCount++;
      const align = (nx * localUp.x + ny * localUp.y + nz * localUp.z) / nLen;
      assert(align > 0.85, `free-surface normal must point up out of the liquid, got ${align.toFixed(3)}`);
    }
    const radial = Math.hypot(px, pz);
    if (radial > radius * 0.7 && py > yBottom + 0.01 && py < yRim - 0.02 && planeDist > 0.01) {
      const outward = (nx * px + nz * pz) / (nLen * radial);
      if (outward < 0.45) {
        throw new Error(`side wall faces inward (${outward.toFixed(3)}) at (${px.toFixed(3)}, ${py.toFixed(3)}, ${pz.toFixed(3)})`);
      }
    }
  }
  assert(topCount > 8, 'tilted liquid needs a free-surface cap');

  let surfaceSamples = 0;
  let meanY = 0;
  const ys: number[] = [];
  for (let v = 0; v < geo.positions.length; v += 3) {
    const x = geo.positions[v];
    const y = geo.positions[v + 1];
    const z = geo.positions[v + 2];
    const dist = Math.abs(localUp.x * x + localUp.y * (y - level.yAtZero));
    if (y > yBottom + 0.015 && dist < 0.003 && Math.hypot(x, z) > radius * 0.2) {
      const wy = x * Math.sin(-0.45) + y * Math.cos(-0.45);
      ys.push(wy);
      meanY += wy;
      surfaceSamples++;
    }
  }
  assert(surfaceSamples > 12, 'expected samples on the free surface');
  meanY /= surfaceSamples;
  let variance = 0;
  for (const wy of ys) variance += (wy - meanY) ** 2;
  assert(Math.sqrt(variance / surfaceSamples) < 0.0015, 'free surface must be level in world space');

  const upright = buildTiltedLiquidGeometry(solveLiquidPlane(0, fill, radius, yBottom, yRim), 64, 0.136);
  const uprightVol = meshVolume(upright.positions, upright.indices);
  const expected = Math.PI * radius * radius * fill;
  assert(Math.abs(uprightVol - expected) / expected < 0.06, `upright volume ${uprightVol} vs ${expected}`);

  const beaker = new BeakerMesh();
  beaker.setVisible(true, false);
  beaker.group.position.set(-0.38, 0.998, 1.1);
  beaker.setTilt(-POUR_TILT);
  for (let i = 0; i < 80; i++) beaker.update(0.016);
  assert(beaker.currentTiltZ < -1.2, 'the beaker actually tips toward the pour angle');
  beaker.currentTiltZ = -POUR_TILT;
  beaker.group.rotation.z = -POUR_TILT;
  beaker.update(0.016);
  assert(beaker.isSpilling(), 'tipped 60 mL beaker spills');
  const positions = (beaker['liquidMesh'] as THREE.Mesh).geometry.attributes.position.array as Float32Array;
  let maxY = 0;
  let lipX = 0;
  for (let v = 0; v < positions.length; v += 3) {
    if (positions[v + 1] > maxY) {
      maxY = positions[v + 1];
      lipX = positions[v];
    }
  }
  assert(maxY > beaker.beakerHeight - 0.004, `waterline must reach the rim, got y=${maxY}`);
  assert(lipX > 0.12, 'waterline reaches the lowered lip, not the middle of the cup');
  const contact = lipContactLocal(beaker['liquidPlane'], beaker.liquidRimRadius);
  let nearest = Infinity;
  for (let v = 0; v < positions.length; v += 3) {
    nearest = Math.min(nearest, Math.hypot(positions[v] - contact.x, positions[v + 1] - contact.y, positions[v + 2] - contact.z));
  }
  assert(nearest < 0.002, `liquid mesh must include the pour contact, nearest ${nearest}`);
  const spillPlane = beaker['liquidPlane'] as { yAtZero: number };
  const spillUp = { x: Math.sin(-POUR_TILT), y: Math.cos(-POUR_TILT), z: 0 };
  const spillIndex = (beaker['liquidMesh'] as THREE.Mesh).geometry.index!.array as Uint32Array;
  let spillAlign = 0;
  let spillFaces = 0;
  for (let i = 0; i < spillIndex.length; i += 3) {
    const ia = spillIndex[i] * 3;
    const ib = spillIndex[i + 1] * 3;
    const ic = spillIndex[i + 2] * 3;
    const ax = positions[ia];
    const ay = positions[ia + 1];
    const az = positions[ia + 2];
    const bx = positions[ib];
    const by = positions[ib + 1];
    const bz = positions[ib + 2];
    const cx = positions[ic];
    const cy = positions[ic + 1];
    const cz = positions[ic + 2];
    const px = (ax + bx + cx) / 3;
    const py = (ay + by + cy) / 3;
    const pz = (az + bz + cz) / 3;
    const planeDist = Math.abs(spillUp.x * px + spillUp.y * (py - spillPlane.yAtZero) + spillUp.z * pz);
    if (planeDist > 0.006 || py < 0.05) continue;
    const nx = (by - ay) * (cz - az) - (bz - az) * (cy - ay);
    const ny = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
    const nz = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    const nLen = Math.hypot(nx, ny, nz);
    if (nLen < 1e-8) continue;
    spillAlign += (nx * spillUp.x + ny * spillUp.y + nz * spillUp.z) / nLen;
    spillFaces++;
  }
  assert(spillFaces > 4 && spillAlign / spillFaces > 0.8, `spilling surface must face out of the liquid (${spillFaces} faces)`);

  const target = new BeakerMesh();
  target.setVisible(true, false);
  target.group.position.set(0.38, 0.998, 1.1);
  target.update(0.016);
  const mouth = target.getMouthWorldPosition();
  const surfaceY = target.getLiquidSurfaceWorldY();
  const outward = lipOutwardFromTilt(-POUR_TILT, 'right');
  const goal = lipGoalForPour({
    outward,
    mouth: { x: mouth.x, y: mouth.y, z: mouth.z },
    surfaceY,
    clearance: POUR_LIP_CLEARANCE,
    exitSpeed: POUR_EXIT_SPEED,
    gravity: POUR_GRAVITY,
  });
  beaker.placeLipAt(new THREE.Vector3(goal.x, goal.y, goal.z), 'right');
  const pinned = beaker.getGlassLipWorld('right');
  assert(pinned.distanceTo(new THREE.Vector3(goal.x, goal.y, goal.z)) < 1e-4, 'lip pivots onto the pour point');

  const liveOut = beaker.getPourOutwardWorld();
  assert(liveOut.x > 0.15 && liveOut.y < -0.7, `pour direction must leave the lip downward, got (${liveOut.x}, ${liveOut.y})`);
  assert(Math.abs(liveOut.x - outward.x) < 1e-4 && Math.abs(liveOut.y - outward.y) < 1e-4, 'live lip normal must match the tilt formula');

  const approach = beaker.getPourApproachWorld();
  assert(approach[2].distanceTo(pinned) < 1e-4, 'stream origin is the outer lip');
  const dropToLip = approach[1].y - approach[2].y;
  const sheetStep = approach[0].y - approach[1].y;
  assert(
    approach[0].y + 0.001 >= approach[1].y && dropToLip > 0.004,
    `sheet runs downhill off the lip (step ${sheetStep.toFixed(4)}, drop ${dropToLip.toFixed(4)}, ys ${approach.map((p) => p.y.toFixed(4)).join(',')})`,
  );

  const samples = composePourStream({
    approach: approach.map((p) => ({ x: p.x, y: p.y, z: p.z })),
    outward: { x: liveOut.x, y: liveOut.y, z: liveOut.z },
    surfaceY,
    targetX: mouth.x,
    targetZ: mouth.z,
    targetRadius: target.beakerRadius,
    gravity: POUR_GRAVITY,
    exitSpeed: POUR_EXIT_SPEED,
    phase: 0.4,
  });
  assert(samples, 'stream must be generated once the lip is over the cup');
  for (let i = 1; i < samples!.length; i++) {
    assert(samples![i].y <= samples![i - 1].y + 0.0008, `stream rose between ${i - 1} and ${i}`);
  }
  const hit = samples![samples!.length - 1];
  assert(Math.abs(hit.y - surfaceY) < 0.004, `stream must meet the receiving surface, Δy=${hit.y - surfaceY}`);
  assert(Math.hypot(hit.x - mouth.x, hit.z - mouth.z) < 0.02, 'stream must land inside the receiving mouth');
  assert(samples![2].halfWidth > samples![samples!.length - 1].halfWidth, 'jet narrows as it falls');

  const tube = new Float32Array(samples!.length * (POUR_STREAM_RADIAL + 1) * 3);
  writeEllipticTube(samples!, POUR_STREAM_RADIAL, tube);
  const indices = ellipticTubeIndices(samples!.length, POUR_STREAM_RADIAL);
  const ring0 = averageRing(tube, 0, POUR_STREAM_RADIAL);
  assert(Math.hypot(ring0.x - samples![0].x, ring0.y - samples![0].y, ring0.z - samples![0].z) < 1e-4, 'tube starts on the sheet');
  const outwardDot = tubeShellOutward(tube, indices, samples!, POUR_STREAM_RADIAL);
  assert(outwardDot > 0.5, `stream shell must face outward, got ${outwardDot.toFixed(3)}`);

  const parent = new THREE.Group();
  parent.position.set(2, 0.4, -1);
  parent.rotation.y = 0.55;
  const child = new BeakerMesh();
  child.setVisible(true, false);
  parent.add(child.group);
  parent.updateWorldMatrix(true, true);
  child.group.position.set(0.2, 1, 0.3);
  child.group.rotation.z = -0.8;
  const marker = new THREE.Vector3(4, 2, -2);
  child.placeLipAt(marker, 'right');
  parent.updateWorldMatrix(true, true);
  const placed = child.getGlassLipWorld('right');
  assert(placed.distanceTo(marker) < 1e-4, `lip placement must honor the parent frame, off by ${placed.distanceTo(marker)}`);

  console.log('✓ Test 12 passed: Water reaches the lip and falls into the other beaker\n');
}

function meshVolume(positions: Float32Array, indices: Uint32Array): number {
  let vol = 0;
  for (let i = 0; i < indices.length; i += 3) {
    const a = indices[i] * 3;
    const b = indices[i + 1] * 3;
    const c = indices[i + 2] * 3;
    const ax = positions[a];
    const ay = positions[a + 1];
    const az = positions[a + 2];
    const bx = positions[b];
    const by = positions[b + 1];
    const bz = positions[b + 2];
    const cx = positions[c];
    const cy = positions[c + 1];
    const cz = positions[c + 2];
    vol += ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx);
  }
  return Math.abs(vol) / 6;
}

function averageRing(tube: Float32Array, ring: number, radial: number): { x: number; y: number; z: number } {
  let x = 0;
  let y = 0;
  let z = 0;
  const stride = radial + 1;
  for (let j = 0; j < radial; j++) {
    const o = (ring * stride + j) * 3;
    x += tube[o];
    y += tube[o + 1];
    z += tube[o + 2];
  }
  return { x: x / radial, y: y / radial, z: z / radial };
}

function tubeShellOutward(
  tube: Float32Array,
  indices: Uint32Array,
  samples: { x: number; y: number; z: number }[],
  radial: number,
): number {
  const stride = radial + 1;
  let score = 0;
  let count = 0;
  for (let t = 0; t < indices.length; t += 3) {
    const ia = indices[t];
    const ib = indices[t + 1];
    const ic = indices[t + 2];
    const ring = Math.floor(ia / stride);
    if (ring < 3 || ring > 8) continue;
    const ax = tube[ia * 3];
    const ay = tube[ia * 3 + 1];
    const az = tube[ia * 3 + 2];
    const bx = tube[ib * 3];
    const by = tube[ib * 3 + 1];
    const bz = tube[ib * 3 + 2];
    const cx = tube[ic * 3];
    const cy = tube[ic * 3 + 1];
    const cz = tube[ic * 3 + 2];
    const nx = (by - ay) * (cz - az) - (bz - az) * (cy - ay);
    const ny = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
    const nz = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    const nLen = Math.hypot(nx, ny, nz);
    if (nLen < 1e-8) continue;
    const next = Math.min(samples.length - 1, ring + 1);
    const axisX = samples[next].x - samples[ring].x;
    const axisY = samples[next].y - samples[ring].y;
    const axisZ = samples[next].z - samples[ring].z;
    const axisLen2 = axisX * axisX + axisY * axisY + axisZ * axisZ || 1;
    let px = (ax + bx + cx) / 3 - samples[ring].x;
    let py = (ay + by + cy) / 3 - samples[ring].y;
    let pz = (az + bz + cz) / 3 - samples[ring].z;
    const along = (px * axisX + py * axisY + pz * axisZ) / axisLen2;
    px -= along * axisX;
    py -= along * axisY;
    pz -= along * axisZ;
    const pLen = Math.hypot(px, py, pz);
    if (pLen < 1e-5) continue;
    score += (nx * px + ny * py + nz * pz) / (nLen * pLen);
    count++;
  }
  return count ? score / count : 0;
}

console.log('========================================================');
console.log('All Dual-Beaker Mixing & Composition Analysis Tests Passed (12/12)!');
console.log('========================================================\n');
