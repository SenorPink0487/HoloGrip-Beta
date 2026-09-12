import assert from 'node:assert';
import { ChemistryEngine } from '../src/chemistry/ChemistryEngine.ts';

console.log('=== Starting Chemistry Engine Comprehensive Verification ===\n');

// Test 1: Initial state
{
  console.log('Test 1: Initial state verification');
  const engine = new ChemistryEngine();
  assert.strictEqual(engine.state.volume, 60, 'Initial volume should be 60mL');
  assert.strictEqual(engine.state.pH, 7.0, 'Initial pH should be 7.0');
  assert.strictEqual(engine.state.precipitates.size, 0, 'Initial precipitates should be 0');
  assert.strictEqual(engine.state.solids.size, 0, 'Initial solids should be 0');
  assert.strictEqual(engine.state.recentReactions.length, 0, 'No initial reactions');
  assert.strictEqual(engine.state.gasType, null, 'No initial gas');
  console.log('✓ Test 1 passed\n');
}

// Test 2: Adding solitary acid/salt to pure water (ionization, NO false neutralization)
{
  console.log('Test 2: Solitary reagent ionization without false neutralization');
  const engine = new ChemistryEngine();

  // Adding HCl to pure water should NOT trigger neutralization with autodissociated water
  const hclRx = engine.addReagent('HCl', 25);
  assert(hclRx !== null, 'Should return ionization event');
  assert.strictEqual(hclRx?.id, 'hcl_ionize', 'Should be hcl_ionize event, NOT neutralization');
  assert.notStrictEqual(hclRx?.id, 'neutralization', 'Must not trigger false neutralization');
  assert(engine.state.pH < 2.0, `pH should be acidic, got ${engine.state.pH}`);
  assert.strictEqual(engine.state.volume, 85, 'Volume should be 85mL');
  console.log(`  HCl added: id = ${hclRx?.id}, pH = ${engine.state.pH.toFixed(2)}`);

  // Reset and test NaCl to water
  engine.reset();
  const naclRx = engine.addReagent('NaCl', 25);
  assert.strictEqual(naclRx?.id, 'nacl_dissolve', 'Should be nacl_dissolve');
  assert.strictEqual(engine.state.pH, 7.0, 'NaCl in water should maintain neutral pH 7.0');
  console.log(`  NaCl added: id = ${naclRx?.id}, pH = ${engine.state.pH.toFixed(2)}`);
  console.log('✓ Test 2 passed\n');
}

// Test 3: True acid-base neutralization (HCl + NaOH)
{
  console.log('Test 3: True acid-base neutralization (HCl + NaOH)');
  const engine = new ChemistryEngine();

  // Add 25mL HCl (1.0 M)
  engine.addReagent('HCl', 25);
  assert(engine.state.pH < 2.0);

  // Add 25mL NaOH (1.0 M) -> exact stoichiometric neutralization
  const neutRx = engine.addReagent('NaOH', 25);
  assert(neutRx !== null, 'Neutralization reaction should occur');
  assert.strictEqual(neutRx?.id, 'neutralization', 'Reaction ID should be neutralization');
  assert(neutRx?.isExothermic, 'Neutralization should be exothermic');
  assert(engine.state.temperature > 22.5, 'Temperature should have risen');
  assert(Math.abs(engine.state.pH - 7.0) < 0.2, `pH should be near neutral 7.0, got ${engine.state.pH}`);
  assert.strictEqual(engine.state.volume, 110, 'Volume should be 110mL');
  console.log(`  After NaOH: pH = ${engine.state.pH.toFixed(2)}, Temp = ${engine.state.temperature.toFixed(1)}°C, eq = ${neutRx?.equation}`);
  console.log('✓ Test 3 passed\n');
}

// Test 4: Solid metal tracking & acid displacement (Mg, Fe, Cu)
{
  console.log('Test 4: Solid metals tracking and acid displacement');
  const engine = new ChemistryEngine();

  // 4a. Put solid Mg into water first -> stays in beaker as solid
  const mgNeutral = engine.addReagent('Mg', 2); // 2 pieces
  assert.strictEqual(mgNeutral?.id, 'mg_neutral', 'Mg in water should produce mg_neutral event');
  assert(engine.state.solids.has('Mg'), 'Mg should be stored in state.solids');
  const mgSolid = engine.state.solids.get('Mg');
  assert(mgSolid && mgSolid.moles > 0.02, 'Mg moles should be tracked');
  console.log(`  Solid Mg added: ${mgSolid?.moles.toFixed(3)} moles in beaker`);

  // Now add HCl -> should displace H2 and dissolve Mg
  const acidRx = engine.addReagent('HCl', 50);
  assert(acidRx !== null, 'Reaction should occur');
  assert.strictEqual(acidRx?.id, 'mg_acid', 'Should be mg_acid reaction');
  assert.strictEqual(acidRx?.gasType, 'H2', 'Should generate H2 gas');
  assert(engine.state.activeGasRate > 0.5, 'Gas rate should be active');
  assert(engine.state.temperature > 25, 'Mg + acid should be exothermic');
  console.log(`  Mg + HCl: Temp = ${engine.state.temperature.toFixed(1)}°C, gas = ${acidRx?.gasType}`);

  // 4b. Copper inertness: Cu + acid does not react
  engine.reset();
  engine.addReagent('HCl', 25);
  const cuRx = engine.addReagent('Cu', 1);
  assert.strictEqual(cuRx?.id, 'cu_inert', 'Cu with acid should be inert');
  assert(engine.state.solids.has('Cu'), 'Cu should remain as solid in beaker');
  assert.strictEqual(engine.state.gasType, null, 'No gas should be produced by Cu');
  console.log('  Cu inertness verified: no gas, remains in beaker');

  // 4c. Iron displacement: Fe + 2HCl -> FeCl2 + H2
  engine.reset();
  engine.addReagent('Fe', 1);
  assert(engine.state.solids.has('Fe'), 'Fe should be in solids');
  const feRx = engine.addReagent('HCl', 30);
  assert.strictEqual(feRx?.id, 'fe_acid', 'Should be fe_acid reaction');
  assert.strictEqual(feRx?.gasType, 'H2', 'Gas should be H2');
  console.log('  Fe + HCl displacement verified');
  console.log('✓ Test 4 passed\n');
}

// Test 5: Dynamic precipitate equations (BaSO4 with CuSO4 vs H2SO4)
{
  console.log('Test 5: Dynamic precipitate equations');
  const engine = new ChemistryEngine();

  // BaCl2 + CuSO4 -> BaSO4 + CuCl2 (should dynamic match CuCl2, NOT Na2SO4)
  engine.addReagent('CuSO4', 25);
  const baRx1 = engine.addReagent('BaCl2', 25);
  assert.strictEqual(baRx1?.id, 'ba_precip');
  assert(baRx1?.equation.includes('CuCl₂'), `Equation should include CuCl₂, got: ${baRx1?.equation}`);
  assert(engine.state.precipitates.has('BaSO4'), 'BaSO4 precipitate should exist');
  console.log(`  BaCl2 + CuSO4 equation: ${baRx1?.equation}`);

  // AgNO3 + HCl -> AgCl + HNO3
  engine.reset();
  engine.addReagent('HCl', 25);
  const agRx = engine.addReagent('AgNO3', 20);
  assert.strictEqual(agRx?.id, 'ag_precip');
  assert(agRx?.equation.includes('HNO₃'), `Equation should include HNO₃, got: ${agRx?.equation}`);
  assert(engine.state.precipitates.has('AgCl'), 'AgCl precipitate should exist');
  console.log(`  AgNO3 + HCl equation: ${agRx?.equation}`);
  console.log('✓ Test 5 passed\n');
}

// Test 6: Limewater turbidity (Ca(OH)2 + Na2CO3) and acid redissolution
{
  console.log('Test 6: Limewater turbidity (Ca(OH)2 + Na2CO3) and acid redissolution');
  const engine = new ChemistryEngine();

  // Add Ca(OH)2
  const caRx = engine.addReagent('Ca(OH)2', 30);
  assert.strictEqual(caRx?.id, 'caoh2_ionize');

  // Add Na2CO3 -> forms CaCO3 precipitate
  const pptRx = engine.addReagent('Na2CO3', 25);
  assert.strictEqual(pptRx?.id, 'caco3_precip', 'Should form CaCO3 precipitate');
  assert(engine.state.precipitates.has('CaCO3'), 'CaCO3 should be in precipitates');
  console.log(`  Formed CaCO3: ${engine.state.precipitates.get('CaCO3')?.name}`);

  // Add excess HCl -> dissolves CaCO3 and effervesces CO2
  const dissRx = engine.addReagent('HCl', 50);
  assert.strictEqual(dissRx?.id, 'dissolve_caco3', 'Should dissolve CaCO3 with CO2 gas');
  assert.strictEqual(dissRx?.gasType, 'CO2', 'Gas should be CO2');
  assert(!engine.state.precipitates.has('CaCO3'), 'CaCO3 should be completely dissolved');
  console.log(`  CaCO3 dissolved: ${dissRx?.equation}, gas = ${dissRx?.gasType}`);
  console.log('✓ Test 6 passed\n');
}

// Test 7: Redox (KMnO4 + H2O2 in acid)
{
  console.log('Test 7: KMnO4 + H2O2 redox oxygen evolution');
  const engine = new ChemistryEngine();

  engine.addReagent('H2SO4', 25);
  engine.addReagent('H2O2', 25);
  const redoxRx = engine.addReagent('KMnO4', 15);
  assert.strictEqual(redoxRx?.id, 'kmno4_redox', 'Should trigger kmno4_redox');
  assert.strictEqual(redoxRx?.gasType, 'O2', 'Should evolve O2 gas');
  assert(redoxRx?.isExothermic, 'Redox should be exothermic');
  console.log(`  Redox reaction: ${redoxRx?.equation}`);
  console.log('✓ Test 7 passed\n');
}

// Test 8: Custom quantity specification
{
  console.log('Test 8: Custom quantity specification');
  const engine = new ChemistryEngine();

  // Default is 25mL, specify 10mL
  engine.addReagent('HCl', 10);
  assert.strictEqual(engine.state.volume, 70, 'Volume should be 60 + 10 = 70mL');

  // Specify 50mL
  engine.addReagent('NaOH', 50);
  assert.strictEqual(engine.state.volume, 120, 'Volume should be 70 + 50 = 120mL');

  // Specify 3 pieces of Zn
  engine.reset();
  engine.addReagent('Zn', 3);
  const znSolid = engine.state.solids.get('Zn');
  assert(znSolid && Math.abs(znSolid.moles - 3 * 0.018) < 1e-4, 'Zn moles should reflect 3 pieces');
  console.log(`  Specified 3 pieces of Zn: ${znSolid?.moles.toFixed(3)} moles`);
  console.log('✓ Test 8 passed\n');
}

// Test 9: Complete reset / cleaning
{
  console.log('Test 9: Full beaker clean & reset');
  const engine = new ChemistryEngine();
  engine.addReagent('CuSO4', 30);
  engine.addReagent('NaOH', 30);
  engine.addReagent('Fe', 2);
  assert(engine.state.precipitates.size > 0, 'Should have precipitates');
  assert(engine.state.solids.size > 0, 'Should have solids');

  engine.reset();
  assert.strictEqual(engine.state.volume, 60, 'Reset volume should be 60mL');
  assert.strictEqual(engine.state.pH, 7.0, 'Reset pH should be 7.0');
  assert.strictEqual(engine.state.precipitates.size, 0, 'Reset precipitates should be 0');
  assert.strictEqual(engine.state.solids.size, 0, 'Reset solids should be 0');
  assert.strictEqual(engine.state.recentReactions.length, 0, 'Reset reactions should be empty');
  assert.strictEqual(engine.state.activeEffects.length, 0, 'Reset active effects should be empty');
  assert.strictEqual(engine.state.gasType, null, 'Reset gas type should be null');
  console.log('✓ Test 9 passed\n');
}

console.log('========================================================');
console.log('All Comprehensive Chemistry Engine Tests Passed (9/9)!');
console.log('========================================================');
