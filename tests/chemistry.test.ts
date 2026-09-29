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

// Test 10: Realistic liquid color transformations
{
  console.log('Test 10: Realistic liquid color transformations');
  const engine = new ChemistryEngine();

  // 10a. CuSO4 -> vivid sky-blue / azure (blue channel strongly dominates red)
  engine.addReagent('CuSO4', 25);
  const cuColor = engine.state.liquidColor;
  assert(cuColor.b > cuColor.r + 0.35, `CuSO4 should have high blue and low red: r=${cuColor.r.toFixed(2)}, b=${cuColor.b.toFixed(2)}`);
  console.log(`  CuSO4 blue color verified: rgb(${cuColor.r.toFixed(2)}, ${cuColor.g.toFixed(2)}, ${cuColor.b.toFixed(2)})`);

  // 10b. FeCl3 -> rich golden-amber / orange-brown (red & green exceed blue)
  engine.reset();
  engine.addReagent('FeCl3', 25);
  const fe3Color = engine.state.liquidColor;
  assert(fe3Color.r > fe3Color.b + 0.3, `FeCl3 should have strong red/amber tone: r=${fe3Color.r.toFixed(2)}, b=${fe3Color.b.toFixed(2)}`);
  console.log(`  FeCl3 amber color verified: rgb(${fe3Color.r.toFixed(2)}, ${fe3Color.g.toFixed(2)}, ${fe3Color.b.toFixed(2)})`);

  // 10c. FeSO4 -> light apple/jade green (green exceeds red and blue)
  engine.reset();
  engine.addReagent('FeSO4', 25);
  const fe2Color = engine.state.liquidColor;
  assert(fe2Color.g > fe2Color.r + 0.15, `FeSO4 should have distinct green: g=${fe2Color.g.toFixed(2)}, r=${fe2Color.r.toFixed(2)}`);
  console.log(`  FeSO4 green color verified: rgb(${fe2Color.r.toFixed(2)}, ${fe2Color.g.toFixed(2)}, ${fe2Color.b.toFixed(2)})`);

  // 10d. KMnO4 -> deep royal purple, and decolorizes with H2O2 + acid
  engine.reset();
  engine.addReagent('KMnO4', 15);
  const kmno4Color = engine.state.liquidColor;
  assert(kmno4Color.b > kmno4Color.g + 0.2 && kmno4Color.r > kmno4Color.g + 0.1 && kmno4Color.g < 0.15, `KMnO4 must be deep purple (high red+blue, low green): r=${kmno4Color.r.toFixed(2)}, g=${kmno4Color.g.toFixed(2)}, b=${kmno4Color.b.toFixed(2)}`);
  console.log(`  KMnO4 purple verified: rgb(${kmno4Color.r.toFixed(2)}, ${kmno4Color.g.toFixed(2)}, ${kmno4Color.b.toFixed(2)})`);

  // Add acid + H2O2 to reduce MnO4- -> Mn2+ (decolorize)
  engine.addReagent('H2SO4', 30);
  engine.addReagent('H2O2', 30);
  const decolorColor = engine.state.liquidColor;
  assert(decolorColor.g > 0.7 && decolorColor.b > 0.8, 'KMnO4 should completely decolorize back to clear liquid');
  console.log(`  KMnO4 redox decolorization verified: rgb(${decolorColor.r.toFixed(2)}, ${decolorColor.g.toFixed(2)}, ${decolorColor.b.toFixed(2)})`);

  // 10e. NaOH + phenolphthalein -> vivid fuchsia pink, neutralizes with HCl back to colorless
  engine.reset();
  engine.addReagent('NaOH', 25);
  engine.addReagent('phenolphthalein', 5);
  const pinkColor = engine.state.liquidColor;
  assert(pinkColor.r > 0.7 && pinkColor.g < 0.2 && pinkColor.b > 0.2, `Alkaline phenolphthalein must be bright magenta-pink: r=${pinkColor.r.toFixed(2)}, g=${pinkColor.g.toFixed(2)}, b=${pinkColor.b.toFixed(2)}`);
  console.log(`  Phenolphthalein pink verified: rgb(${pinkColor.r.toFixed(2)}, ${pinkColor.g.toFixed(2)}, ${pinkColor.b.toFixed(2)})`);

  // Add HCl to neutralize
  engine.addReagent('HCl', 35);
  const neutralizedColor = engine.state.liquidColor;
  assert(neutralizedColor.g > 0.7 && neutralizedColor.b > 0.8, 'Neutralization should restore colorless water appearance');
  console.log(`  Acid-base titration decolorization verified: rgb(${neutralizedColor.r.toFixed(2)}, ${neutralizedColor.g.toFixed(2)}, ${neutralizedColor.b.toFixed(2)})`);

  // 10f. Bromine water Br2 -> orange-amber
  engine.reset();
  engine.addReagent('Br2', 20);
  const brColor = engine.state.liquidColor;
  assert(brColor.r > brColor.b + 0.35, `Br2 should be orange-amber: r=${brColor.r.toFixed(2)}, b=${brColor.b.toFixed(2)}`);
  console.log(`  Br2 amber-orange color verified: rgb(${brColor.r.toFixed(2)}, ${brColor.g.toFixed(2)}, ${brColor.b.toFixed(2)})`);

  // 10g. Precipitate suspension: BaCl2 + CuSO4 -> milky sky-blue
  engine.reset();
  engine.addReagent('CuSO4', 25);
  engine.addReagent('BaCl2', 25);
  const pptColor = engine.state.liquidColor;
  assert(pptColor.b > 0.7 && pptColor.r > 0.4, 'BaSO4 in CuSO4 should be milky sky-blue suspension');
  console.log(`  BaSO4 + Cu2+ milky-blue suspension verified: rgb(${pptColor.r.toFixed(2)}, ${pptColor.g.toFixed(2)}, ${pptColor.b.toFixed(2)})`);

  console.log('✓ Test 10 passed: All realistic liquid color transformations verified\n');
}

// Test 11: Concrete chemical substances display after reaction (CO2, NaCl, MgCl2, etc.)
{
  console.log('Test 11: Concrete chemical substances display after reaction');
  const engine = new ChemistryEngine();

  // 11a: Carbonate reaction (Na2CO3 + HCl -> CO2 gas, NaCl, excess HCl)
  engine.addReagent('Na2CO3', 20); // 0.5 M * 20 mL = 10 mmol Na2CO3 (20 mmol Na+, 10 mmol CO3^2-)
  engine.addReagent('HCl', 25);    // 1.0 M * 25 mL = 25 mmol HCl (25 mmol H+, 25 mmol Cl-)
  // Reaction consumes 10 mmol CO3^2- and 20 mmol H+ -> 10 mmol CO2 gas, 5 mmol excess H+
  const comp = engine.getCompositionAnalysis('substance');
  const names = comp.components.map((c) => c.name);
  const formulas = comp.components.map((c) => c.formula);

  console.log('  Substances after Na2CO3 + HCl:', comp.components.map(c => `${c.formula} (${c.name}: ${c.millimoles.toFixed(2)}mmol, ${c.percentage}%)`));

  assert(comp.components.some((c) => c.category === 'gas' && c.formula.includes('CO₂')), 'Must include CO2 gas product');
  assert(comp.components.some((c) => c.formula === 'NaCl' && c.name === '氯化钠'), 'Must include NaCl compound instead of separate Na+ and Cl- ions');
  assert(comp.components.some((c) => c.formula === 'HCl' && c.name === '稀盐酸'), 'Must include excess HCl compound');
  assert(!comp.components.some((c) => c.name === '氯离子' || c.name === '钠离子'), 'Must not display raw ion names in substance mode');

  // Verify percentages sum to 100.0%
  const totalPct = comp.components.reduce((sum, c) => sum + c.percentage, 0);
  assert(Math.abs(totalPct - 100.0) < 0.1, `Percentages must sum to 100.0%, got ${totalPct}%`);

  // 11b: Acid-base neutralization (NaOH + HCl -> NaCl)
  engine.reset();
  engine.addReagent('NaOH', 25); // 25 mmol
  engine.addReagent('HCl', 25);  // 25 mmol
  const neutComp = engine.getCompositionAnalysis('substance');
  assert.strictEqual(neutComp.components.length, 1, 'Exact stoichiometric neutralization should leave only NaCl');
  assert.strictEqual(neutComp.components[0].formula, 'NaCl');
  assert.strictEqual(neutComp.components[0].name, '氯化钠');
  assert.strictEqual(neutComp.components[0].percentage, 100.0);

  // 11c: Metal acid displacement (Mg + HCl -> H2 gas + MgCl2 + HCl)
  engine.reset();
  engine.addReagent('Mg', 1);    // 0.015 mol = 15 mmol
  engine.addReagent('HCl', 50);  // 50 mmol
  const mgComp = engine.getCompositionAnalysis('substance');
  assert(mgComp.components.some((c) => c.category === 'gas' && c.formula.includes('H₂')), 'Must include H2 gas product');
  assert(mgComp.components.some((c) => c.formula === 'MgCl₂' && c.name === '氯化镁'), 'Must include MgCl2 compound');
  assert(mgComp.components.some((c) => c.formula === 'HCl'), 'Must include excess HCl');

  console.log('✓ Test 11 passed: Concrete chemical substances (CO2, NaCl, MgCl2, etc.) verified\n');
}

console.log('========================================================');
console.log('All Comprehensive Chemistry Engine Tests Passed (11/11)!');
console.log('========================================================');
