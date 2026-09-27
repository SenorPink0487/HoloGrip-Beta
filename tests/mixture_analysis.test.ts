import assert from 'node:assert';
import { ChemistryEngine } from '../src/chemistry/ChemistryEngine.ts';
import {
  buildMixtureRequest,
  parseAnalyzedMixture,
  type AnalyzedMixture,
} from '../src/chemistry/mixtureAnalysis.ts';
import {
  formatChemicalFormula,
  getFormulaAvatarClass,
} from '../src/ui/vision/ExperimentStatusCard.ts';

console.log('=== Mixture analysis ===\n');

function colaRaw() {
  return {
    name: '可乐',
    summary: '含磷酸和糖的碳酸饮料',
    color: '#3b1a08',
    volumeMl: 80,
    components: [
      { name: '磷酸', formula: 'H₃PO₄', kind: 'acid', moles: 0.005, molarMass: 98, color: '#e6b800', protons: 1, species: [{ ion: 'H+', count: 1 }] },
      { name: '蔗糖', formula: 'C₁₂H₂₂O₁₁', kind: 'acid', moles: 0.02, molarMass: 342, color: '#f5f0e6', species: [{ ion: 'H+', count: 1 }] },
      { name: '咖啡因', formula: 'C₈H₁₀N₄O₂', kind: 'inert', moles: 0.0004, molarMass: 194, color: '#c4a484', species: [] },
      {
        name: '二氧化碳',
        formula: 'CO₂',
        kind: 'carbonate',
        moles: 0.008,
        molarMass: 44,
        color: '#d0e7ff',
        species: [{ ion: 'H+', count: 1 }, { ion: 'CO3_2-', count: 1 }],
      },
    ],
  };
}

let cola: AnalyzedMixture;

{
  console.log('Test 1: Parse cola into compounds, keep sugar inert, keep dissolved CO2 from reacting');
  cola = parseAnalyzedMixture(colaRaw());
  assert.strictEqual(cola.name, '可乐');
  assert.strictEqual(cola.volumeMl, 80);
  assert.strictEqual(cola.components.length, 4);
  const phosphate = cola.components.find((component) => component.name === '磷酸');
  const sugar = cola.components.find((component) => component.name === '蔗糖');
  const fizz = cola.components.find((component) => component.name === '二氧化碳');
  assert(phosphate);
  assert.strictEqual(phosphate?.ions.length, 1);
  assert.strictEqual(phosphate?.ions[0].ion, 'H+');
  assert(Math.abs((phosphate?.ions[0].moles ?? 0) - 0.005) < 1e-6);
  assert.strictEqual(sugar?.ions.length, 0, 'Sucrose formula must not become acid just because the model said so');
  assert.strictEqual(fizz?.fizz, true);
  assert.strictEqual(fizz?.ions.length, 0);
  const again = parseAnalyzedMixture(cola);
  assert.strictEqual(again.components.find((component) => component.name === '磷酸')?.ions[0].ion, 'H+');
  console.log('✓ Test 1 passed\n');
}

{
  console.log('Test 2: Request stays on the existing fast model');
  const request = buildMixtureRequest('  可乐  ');
  assert.strictEqual(request.model, 'deepseek-flash');
  assert.deepStrictEqual(request.thinking, { type: 'disabled' });
  assert.ok(request.max_tokens <= 520);
  assert.strictEqual(request.stream, false);
  assert.strictEqual(request.messages[1].content, '可乐');
  assert.ok(!JSON.stringify(request).includes('sk-'));
  console.log('✓ Test 2 passed\n');
}

{
  console.log('Test 3: Reject a one-component reply and strip markup');
  assert.throws(() => parseAnalyzedMixture({
    name: '水',
    components: [{ name: '水', formula: 'H2O', kind: 'water', moles: 1 }],
  }));
  const tagged = parseAnalyzedMixture({
    name: '<b>醋</b>',
    summary: '<script>nope</script>',
    color: 'red',
    volumeMl: 10,
    components: [
      { name: '醋酸', formula: 'CH3COOH', kind: 'acid', moles: 0.01 },
      { name: '香精', formula: 'aroma', kind: 'inert', moles: 0.0002 },
    ],
  });
  assert.ok(!tagged.name.includes('<'));
  assert.ok(!tagged.summary.includes('<'));
  assert.strictEqual(tagged.volumeMl, 40);
  assert.strictEqual(tagged.color, '#c7b299');
  console.log('✓ Test 3 passed\n');
}

{
  console.log('Test 4: Cola fills a fresh beaker and does not neutralize itself');
  const engine = new ChemistryEngine();
  const reaction = engine.pourAnalyzedMixture(cola);
  assert.strictEqual(engine.state.volume, 80);
  assert.ok(engine.state.pH > 0.5 && engine.state.pH < 2.5, `pH ${engine.state.pH}`);
  assert.strictEqual(engine.state.temperature, 22.5);
  assert.notStrictEqual(engine.state.liquidColor.getHex(), 0xd7f3ff);
  assert.ok((engine.state.ions.get('H+') || 0) > 0.004);
  assert.ok(!engine.state.ions.has('CO3_2-') || (engine.state.ions.get('CO3_2-') || 0) < 1e-6);
  assert.notStrictEqual(reaction?.id, 'neutralization');
  assert.notStrictEqual(reaction?.id, 'co2_gas');
  assert.strictEqual(engine.state.gasType, 'CO2');
  const names = engine.computeCompositionSync().components.map((component) => component.name);
  assert.ok(names.includes('磷酸'));
  assert.ok(names.includes('蔗糖'));
  assert.ok(names.includes('咖啡因'));
  assert.ok(!names.includes('氢离子'));
  const total = engine.computeCompositionSync().components.reduce((sum, component) => sum + component.percentage, 0);
  assert.ok(Math.abs(total - 100) < 0.11, `percentages ${total}`);
  console.log('✓ Test 4 passed\n');
}

{
  console.log('Test 5: Alkali poured into cola neutralizes; sugar alone does not');
  const engine = new ChemistryEngine();
  engine.pourAnalyzedMixture(cola);
  const reaction = engine.addReagent('NaOH', 20);
  assert.strictEqual(reaction?.id, 'neutralization');
  assert.strictEqual(engine.state.volume, 100);
  assert.ok(engine.state.pH > 8, `pH ${engine.state.pH}`);
  assert.ok(engine.state.temperature > 22.5);

  const sweet = parseAnalyzedMixture({
    name: '糖水',
    color: '#f5f0e6',
    volumeMl: 80,
    components: [
      { name: '蔗糖', formula: 'C12H22O11', kind: 'acid', moles: 0.02, species: [{ ion: 'H+', count: 1 }] },
      { name: '香精', formula: 'aroma', kind: 'inert', moles: 0.0002 },
    ],
  });
  const beaker = new ChemistryEngine();
  beaker.pourAnalyzedMixture(sweet);
  const alkali = beaker.addReagent('NaOH', 25);
  assert.notStrictEqual(alkali?.id, 'neutralization');
  assert.strictEqual(beaker.state.gasType, null);
  assert.ok(!beaker.state.recentReactions.some((item) => item.id === 'neutralization'));
  console.log('✓ Test 5 passed\n');
}

{
  console.log('Test 6: The other beaker reacts only when the chemistry matches');
  const left = new ChemistryEngine();
  const right = new ChemistryEngine();
  left.pourAnalyzedMixture(cola);
  right.addReagent('Na2CO3', 25);
  const tint = left.state.solutionTint;
  const reactions = right.mixFrom(left);
  assert.ok(reactions.some((reaction) => reaction.id === 'co2_gas'));
  assert.strictEqual(right.state.gasType, 'CO2');
  assert.ok(right.computeCompositionSync().components.some((component) => component.name === '磷酸'));
  assert.strictEqual(left.state.mixtureParts.length, 0);
  assert.strictEqual(right.state.solutionTint, tint);
  assert.ok(Math.abs(right.state.solutionTintStrength - 0.8 * (80 / 165)) < 0.03);

  const iron = new ChemistryEngine();
  iron.pourAnalyzedMixture(parseAnalyzedMixture({
    name: '铁钉',
    volumeMl: 80,
    components: [
      { name: '铁钉', formula: 'Fe', kind: 'metal', moles: 0.02 },
      { name: '碳', formula: 'C', kind: 'inert', moles: 0.001 },
    ],
  }));
  const acid = new ChemistryEngine();
  acid.addReagent('HCl', 40);
  const displaced = iron.mixFrom(acid);
  assert.ok(displaced.some((reaction) => reaction.id === 'fe_acid'));
  assert.strictEqual(iron.state.gasType, 'H2');

  const sulfate = new ChemistryEngine();
  sulfate.pourAnalyzedMixture(parseAnalyzedMixture({
    name: '稀硫酸',
    volumeMl: 50,
    components: [
      { name: '硫酸', formula: 'H2SO4', kind: 'acid', moles: 0.01 },
      { name: '色素', formula: 'dye', kind: 'inert', moles: 0.0001 },
    ],
  }));
  const precipitate = sulfate.addReagent('BaCl2', 25);
  assert.strictEqual(precipitate?.id, 'ba_precip');
  assert.ok(sulfate.state.precipitates.has('BaSO4'));

  const saltWater = new ChemistryEngine();
  saltWater.pourAnalyzedMixture(parseAnalyzedMixture({
    name: '食盐水',
    volumeMl: 80,
    components: [
      { name: '食盐', formula: 'NaCl', kind: 'chloride', moles: 0.01 },
      { name: '色素', formula: 'dye', kind: 'inert', moles: 0.0001 },
    ],
  }));
  const noPrecipitate = saltWater.addReagent('BaCl2', 25);
  assert.notStrictEqual(noPrecipitate?.id, 'ba_precip');
  assert.ok(!saltWater.state.precipitates.has('BaSO4'));
  console.log('✓ Test 6 passed\n');
}

{
  console.log('Test 7: Vinegar poured into alkali, and a full beaker refuses more');
  const vinegar = parseAnalyzedMixture({
    name: '食醋',
    volumeMl: 80,
    components: [
      { name: '醋酸', formula: 'CH3COOH', kind: 'acid', moles: 0.01 },
      { name: '香精', formula: 'aroma', kind: 'inert', moles: 0.0002 },
    ],
  });
  const alkali = new ChemistryEngine();
  alkali.addReagent('NaOH', 25);
  assert.strictEqual(alkali.pourAnalyzedMixture(vinegar)?.id, 'neutralization');

  const baking = parseAnalyzedMixture({
    name: '小苏打醋',
    volumeMl: 80,
    components: [
      { name: '醋酸', formula: 'CH3COOH', kind: 'acid', moles: 0.01 },
      { name: '小苏打', formula: 'NaHCO3', kind: 'carbonate', moles: 0.01 },
    ],
  });
  const mixed = new ChemistryEngine();
  const fizz = mixed.pourAnalyzedMixture(baking);
  assert.strictEqual(fizz?.id, 'co2_gas');
  assert.strictEqual(mixed.state.gasType, 'CO2');

  const full = new ChemistryEngine();
  while (full.state.volume < 250) full.addReagent('H2O', 50);
  assert.strictEqual(full.pourAnalyzedMixture(cola), null);
  console.log('✓ Test 7 passed\n');
}

{
  console.log('Test 8: Chemical formula subscript formatting and responsive avatar classes');
  assert.strictEqual(formatChemicalFormula('CO2'), 'CO₂');
  assert.strictEqual(formatChemicalFormula('H3PO4'), 'H₃PO₄');
  assert.strictEqual(formatChemicalFormula('C12H22O11'), 'C₁₂H₂₂O₁₁');
  assert.strictEqual(formatChemicalFormula('C8H10N4O2'), 'C₈H₁₀N₄O₂');
  assert.strictEqual(formatChemicalFormula('Ca(OH)2'), 'Ca(OH)₂');
  assert.strictEqual(formatChemicalFormula('Fe2(SO4)3'), 'Fe₂(SO₄)₃');
  assert.strictEqual(formatChemicalFormula('NaCl'), 'NaCl');
  assert.strictEqual(formatChemicalFormula('H2O'), 'H₂O');

  assert.strictEqual(getFormulaAvatarClass('CO₂'), 'formula-sm');
  assert.strictEqual(getFormulaAvatarClass('H₃PO₄'), 'formula-md');
  assert.strictEqual(getFormulaAvatarClass('C₁₂H₂₂O₁₁'), 'formula-xl formula-wide');
  assert.strictEqual(getFormulaAvatarClass('C₈H₁₀N₄O₂'), 'formula-xl formula-wide');
  assert.strictEqual(getFormulaAvatarClass('CH₃COOH'), 'formula-lg formula-wide');
  console.log('✓ Test 8 passed\n');
}

console.log('All mixture analysis checks passed.');
