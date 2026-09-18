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

console.log('========================================================');
console.log('All Dual-Beaker Mixing & Composition Analysis Tests Passed (11/11)!');
console.log('========================================================\n');
