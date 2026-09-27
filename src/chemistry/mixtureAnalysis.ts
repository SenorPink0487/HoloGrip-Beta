/** Everyday substance → beaker mixture. Only known ions are allowed to react. */

export type MixtureMetal = 'Mg' | 'Zn' | 'Fe' | 'Al' | 'Cu' | 'Na';

export interface MixtureIon {
  ion: string;
  moles: number;
}

export interface StoredMixturePart {
  id: string;
  name: string;
  formula: string;
  moles: number;
  molarMass: number;
  color: string;
  follows: 'liquid' | 'solid';
  solidKey: string | null;
  ions: MixtureIon[];
}

export interface MixtureComponent extends StoredMixturePart {
  kind: string;
  metal: MixtureMetal | null;
  fizz: boolean;
}

export interface AnalyzedMixture {
  name: string;
  summary: string;
  color: string;
  volumeMl: number;
  components: MixtureComponent[];
}

const KNOWN_IONS = new Set([
  'H+', 'OH-', 'Na+', 'K+', 'Ca2+', 'Cu2+', 'Fe3+', 'Fe2+', 'Ba2+', 'Ag+', 'Al3+',
  'Cl-', 'SO4_2-', 'NO3-', 'CO3_2-', 'I-', 'MnO4-', 'H2O2', 'Mg2+', 'Zn2+', 'Br2', 'I2',
]);

const ION_ALIASES: Record<string, string> = {
  H: 'H+',
  OH: 'OH-',
  SO42: 'SO4_2-',
  'SO42-': 'SO4_2-',
  'SO4^2-': 'SO4_2-',
  CO32: 'CO3_2-',
  'CO32-': 'CO3_2-',
  'CO3^2-': 'CO3_2-',
  NO3: 'NO3-',
  Cl: 'Cl-',
  I: 'I-',
  MnO4: 'MnO4-',
  Cu: 'Cu2+',
  'Cu2': 'Cu2+',
  Fe: 'Fe3+',
  'Fe3': 'Fe3+',
  'Fe2': 'Fe2+',
  Ba: 'Ba2+',
  'Ba2': 'Ba2+',
  Ag: 'Ag+',
  Al: 'Al3+',
  'Al3': 'Al3+',
  Ca: 'Ca2+',
  'Ca2': 'Ca2+',
  Na: 'Na+',
  K: 'K+',
};

const SUBSCRIPT_DIGITS: Record<string, string> = {
  '₀': '0', '₁': '1', '₂': '2', '₃': '3', '₄': '4', '₅': '5', '₆': '6', '₇': '7', '₈': '8', '₉': '9',
  '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9',
  '⁺': '+', '⁻': '-', '＋': '+', '−': '-',
};

interface FormulaRule {
  molarMass: number;
  color: string;
  fizz?: boolean;
  inert?: boolean;
  skip?: boolean;
  metal?: MixtureMetal;
  ions?: Array<{ ion: string; count: number }>;
}

const FORMULAS: Record<string, FormulaRule> = {
  H2O: { molarMass: 18, color: '#d7f3ff', skip: true },
  H3PO4: { molarMass: 98, color: '#e6b800', ions: [{ ion: 'H+', count: 1 }] },
  H2SO4: { molarMass: 98.1, color: '#ffd60a', ions: [{ ion: 'H+', count: 2 }, { ion: 'SO4_2-', count: 1 }] },
  HCl: { molarMass: 36.5, color: '#f2f2f7', ions: [{ ion: 'H+', count: 1 }, { ion: 'Cl-', count: 1 }] },
  HNO3: { molarMass: 63, color: '#ffd6a5', ions: [{ ion: 'H+', count: 1 }, { ion: 'NO3-', count: 1 }] },
  CH3COOH: { molarMass: 60, color: '#f5f0e6', ions: [{ ion: 'H+', count: 1 }] },
  C2H4O2: { molarMass: 60, color: '#f5f0e6', ions: [{ ion: 'H+', count: 1 }] },
  HC2H3O2: { molarMass: 60, color: '#f5f0e6', ions: [{ ion: 'H+', count: 1 }] },
  C6H8O7: { molarMass: 192, color: '#ffe08a', ions: [{ ion: 'H+', count: 1 }] },
  NaOH: { molarMass: 40, color: '#d7f3ff', ions: [{ ion: 'Na+', count: 1 }, { ion: 'OH-', count: 1 }] },
  KOH: { molarMass: 56.1, color: '#d7f3ff', ions: [{ ion: 'K+', count: 1 }, { ion: 'OH-', count: 1 }] },
  CaOH2: { molarMass: 74.1, color: '#f2f2f7', ions: [{ ion: 'Ca2+', count: 1 }, { ion: 'OH-', count: 2 }] },
  NaHCO3: { molarMass: 84, color: '#f5f5f7', ions: [{ ion: 'Na+', count: 1 }, { ion: 'CO3_2-', count: 1 }] },
  KHCO3: { molarMass: 100.1, color: '#f5f5f7', ions: [{ ion: 'K+', count: 1 }, { ion: 'CO3_2-', count: 1 }] },
  Na2CO3: { molarMass: 106, color: '#f5f5f7', ions: [{ ion: 'Na+', count: 2 }, { ion: 'CO3_2-', count: 1 }] },
  K2CO3: { molarMass: 138.2, color: '#f5f5f7', ions: [{ ion: 'K+', count: 2 }, { ion: 'CO3_2-', count: 1 }] },
  CaCO3: { molarMass: 100.1, color: '#f5f5f7', ions: [{ ion: 'Ca2+', count: 1 }, { ion: 'CO3_2-', count: 1 }] },
  NaCl: { molarMass: 58.4, color: '#f2f2f7', ions: [{ ion: 'Na+', count: 1 }, { ion: 'Cl-', count: 1 }] },
  KCl: { molarMass: 74.6, color: '#f2f2f7', ions: [{ ion: 'K+', count: 1 }, { ion: 'Cl-', count: 1 }] },
  CuSO4: { molarMass: 159.6, color: '#0a84ff', ions: [{ ion: 'Cu2+', count: 1 }, { ion: 'SO4_2-', count: 1 }] },
  FeCl3: { molarMass: 162.2, color: '#ff9f0a', ions: [{ ion: 'Fe3+', count: 1 }, { ion: 'Cl-', count: 3 }] },
  FeSO4: { molarMass: 151.9, color: '#34c759', ions: [{ ion: 'Fe2+', count: 1 }, { ion: 'SO4_2-', count: 1 }] },
  AgNO3: { molarMass: 169.9, color: '#f2f2f7', ions: [{ ion: 'Ag+', count: 1 }, { ion: 'NO3-', count: 1 }] },
  BaCl2: { molarMass: 208.2, color: '#f2f2f7', ions: [{ ion: 'Ba2+', count: 1 }, { ion: 'Cl-', count: 2 }] },
  KMnO4: { molarMass: 158, color: '#7b1fa2', ions: [{ ion: 'K+', count: 1 }, { ion: 'MnO4-', count: 1 }] },
  H2O2: { molarMass: 34, color: '#d7f3ff', ions: [{ ion: 'H2O2', count: 1 }] },
  KI: { molarMass: 166, color: '#f2f2f7', ions: [{ ion: 'K+', count: 1 }, { ion: 'I-', count: 1 }] },
  CO2: { molarMass: 44, color: '#d0e7ff', fizz: true },
  H2CO3: { molarMass: 62, color: '#d0e7ff', fizz: true },
  C12H22O11: { molarMass: 342, color: '#f5f0e6', inert: true },
  C6H12O6: { molarMass: 180, color: '#f5f0e6', inert: true },
  C8H10N4O2: { molarMass: 194, color: '#c4a484', inert: true },
  Mg: { molarMass: 24.3, color: '#d1d1d6', metal: 'Mg' },
  Zn: { molarMass: 65.4, color: '#c7c7cc', metal: 'Zn' },
  Fe: { molarMass: 55.8, color: '#8e8e93', metal: 'Fe' },
  Al: { molarMass: 27, color: '#d1d1d6', metal: 'Al' },
  Cu: { molarMass: 63.5, color: '#b87333', metal: 'Cu' },
  Na: { molarMass: 23, color: '#e5e5ea', metal: 'Na' },
};

const KIND_COLORS: Record<string, string> = {
  acid: '#ff9f0a',
  base: '#64d2ff',
  carbonate: '#ffd60a',
  chloride: '#8e8e93',
  sulfate: '#ffd60a',
  copper: '#0a84ff',
  iron3: '#ff9f0a',
  iron2: '#34c759',
  silver: '#e5e5ea',
  barium: '#bf5af2',
  permanganate: '#bf5af2',
  peroxide: '#d7f3ff',
  metal: '#c7c7cc',
  fizz: '#d0e7ff',
  inert: '#f2f2f7',
};

export const MIXTURE_SYSTEM_PROMPT = `你是烧杯配料器。用户说出一种日常物质，把它拆成 3 到 5 种真实主要成分。只输出一个 JSON，不要解释，不要写制备步骤。

字段：name，summary（20字以内），color（#rrggbb 液体颜色），volumeMl（40到120），components。
每个成分：name，formula，kind，moles，molarMass，color，protons，species。
kind 只能是 acid、base、carbonate、chloride、sulfate、copper、iron3、iron2、silver、barium、permanganate、peroxide、metal、fizz、inert。
species 是 [{ion, count}]。ion 只能是 H+、OH-、Na+、K+、Ca2+、Cu2+、Fe3+、Fe2+、Ba2+、Ag+、Al3+、Cl-、SO4_2-、NO3-、CO3_2-、I-、MnO4-、H2O2。
moles 是这一杯里的物质的量，用 0.0001 到 0.05。弱酸 protons 写 1，盐酸写 1，硫酸写 2。金属一块大约 0.02。
糖、咖啡因、色素、蛋白质、脂肪用 inert，species 用空数组。
汽水里的二氧化碳只写一个 fizz，不要再写碳酸。可乐和果汁要写出糖。食醋、柠檬汁里的酸用 acid。小苏打用 carbonate。食盐用 chloride。
金属 formula 只能是 Mg、Zn、Fe、Al、Cu、Na。`;

export function normalizeMixtureQuery(query: string): string {
  return query.trim().slice(0, 40);
}

export function buildMixtureRequest(query: string) {
  return {
    model: 'deepseek-flash',
    thinking: { type: 'disabled' },
    max_tokens: 520,
    temperature: 0,
    stream: false,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: MIXTURE_SYSTEM_PROMPT },
      { role: 'user', content: normalizeMixtureQuery(query) },
    ],
  };
}

export function extractMixtureJson(text: string): unknown {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1] : trimmed;
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('没有拆出可用的成分');
  try {
    return JSON.parse(body.slice(start, end + 1));
  } catch {
    throw new Error('没有拆出可用的成分');
  }
}

export function mergeMixtureName(current: string, incoming: string): string {
  const nextName = incoming.trim();
  if (!nextName) return current;
  if (!current) return nextName;
  if (current.split('、').includes(nextName)) return current;
  const merged = `${current}、${nextName}`;
  return merged.length > 48 ? current : merged;
}

export function scaleMixturePart(part: StoredMixturePart, fraction: number): StoredMixturePart {
  return {
    id: part.id,
    name: part.name,
    formula: part.formula,
    moles: part.moles * fraction,
    molarMass: part.molarMass,
    color: part.color,
    follows: part.follows,
    solidKey: part.solidKey,
    ions: part.ions.map((spec) => ({ ion: spec.ion, moles: spec.moles * fraction })),
  };
}

export function parseAnalyzedMixture(raw: unknown): AnalyzedMixture {
  const record = asRecord(raw);
  const body = isPlain(record.mixture) ? record.mixture : isPlain(record.result) ? record.result : record;
  const name = cleanText(body.name, 16) || '混合物';
  const summary = cleanText(body.summary, 40) || `${name}的主要成分`;
  const color = parseColor(body.color, '#c7b299');
  const volumeMl = clampVolume(body.volumeMl);
  const list = Array.isArray(body.components) ? body.components : [];
  const ranked = list
    .map((item) => ({ item, moles: readMoles(asRecord(item).moles) ?? 0 }))
    .sort((a, b) => b.moles - a.moles)
    .slice(0, 6);

  const used = new Set<string>();
  const components: MixtureComponent[] = [];
  for (const entry of ranked) {
    const component = parseComponent(entry.item, used);
    if (component) components.push(component);
  }
  softenCarbonicAcid(components);
  if (components.length < 2) throw new Error('没有拆出足够的成分');
  return { name, summary, color, volumeMl, components };
}

function parseComponent(raw: unknown, used: Set<string>): MixtureComponent | null {
  const record = asRecord(raw);
  const name = cleanText(record.name, 16);
  const formula = cleanText(record.formula, 24);
  if (!name && !formula) return null;
  const moles = readMoles(record.moles);
  if (moles === null) return null;
  const formulaKey = normalizeFormula(formula);
  const rule = FORMULAS[formulaKey] ?? matchName(name || formula);
  if (rule?.skip) return null;

  const kind = cleanText(record.kind, 16).toLowerCase() || 'inert';
  const resolved = rule
    ? applyRule(rule, moles)
    : resolveLoose(record, kind, moles, formulaKey, name);
  if (resolved.skip) return null;

  const displayName = name || formula;
  const displayFormula = formula || resolved.formula || displayName;
  const id = uniqueId(resolved.metal ? `metal:${resolved.metal}` : (formulaKey || displayName).toLowerCase(), used);
  const color = parseColor(record.color, rule?.color || KIND_COLORS[kind] || '#f2f2f7');
  const molarMass = rule ? rule.molarMass : clampMass(record.molarMass, 100);
  const solidKey = resolved.metal && resolved.metal !== 'Na' ? resolved.metal : null;

  return {
    id,
    name: displayName,
    formula: displayFormula,
    kind: resolved.fizz ? 'fizz' : resolved.metal ? 'metal' : kind,
    moles,
    molarMass,
    color,
    follows: solidKey ? 'solid' : 'liquid',
    solidKey,
    metal: resolved.metal,
    fizz: resolved.fizz,
    ions: resolved.ions,
  };
}

function resolveLoose(
  record: Record<string, unknown>,
  kind: string,
  moles: number,
  formulaKey: string,
  name: string,
): { ions: MixtureIon[]; metal: MixtureMetal | null; fizz: boolean; skip: boolean; formula: string } {
  const species = stripConflicts(readSpecies(record.species, moles), kind);
  if (species.length > 0) {
    return { ions: species, metal: metalFromKind(kind, formulaKey, name), fizz: kind === 'fizz', skip: false, formula: '' };
  }
  return inferKind(kind, readProtons(record.protons), moles, formulaKey, name);
}

function inferKind(
  kind: string,
  protons: number,
  moles: number,
  formulaKey: string,
  name: string,
): { ions: MixtureIon[]; metal: MixtureMetal | null; fizz: boolean; skip: boolean; formula: string } {
  const metal = metalFromKind(kind, formulaKey, name);
  if (metal) return { ions: [], metal, fizz: false, skip: false, formula: metal };
  if (kind === 'fizz') return { ions: [], metal: null, fizz: true, skip: false, formula: 'CO₂' };
  if (kind === 'inert' || kind === 'water') return { ions: [], metal: null, fizz: false, skip: kind === 'water', formula: '' };
  const ions = stripConflicts(ionsFromKind(kind, protons, moles), kind);
  return { ions, metal: null, fizz: false, skip: false, formula: '' };
}

function ionsFromKind(kind: string, protons: number, moles: number): MixtureIon[] {
  const mole = (ion: string, count: number): MixtureIon => ({ ion, moles: moles * count });
  switch (kind) {
    case 'acid':
      return [mole('H+', protons)];
    case 'base':
      return [mole('Na+', 1), mole('OH-', protons)];
    case 'carbonate':
      return [mole('Na+', 2), mole('CO3_2-', 1)];
    case 'chloride':
      return [mole('Na+', 1), mole('Cl-', 1)];
    case 'sulfate':
      return [mole('SO4_2-', 1)];
    case 'copper':
      return [mole('Cu2+', 1)];
    case 'iron3':
      return [mole('Fe3+', 1)];
    case 'iron2':
      return [mole('Fe2+', 1)];
    case 'silver':
      return [mole('Ag+', 1)];
    case 'barium':
      return [mole('Ba2+', 1)];
    case 'permanganate':
      return [mole('K+', 1), mole('MnO4-', 1)];
    case 'peroxide':
      return [mole('H2O2', 1)];
    default:
      return [];
  }
}

function applyRule(rule: FormulaRule, moles: number): { ions: MixtureIon[]; metal: MixtureMetal | null; fizz: boolean; skip: boolean; formula: string } {
  return {
    ions: (rule.ions ?? []).map((spec) => ({ ion: spec.ion, moles: moles * spec.count })),
    metal: rule.metal ?? null,
    fizz: Boolean(rule.fizz),
    skip: Boolean(rule.skip),
    formula: rule.metal ?? '',
  };
}

function matchName(name: string): FormulaRule | null {
  const rules: Array<{ test: (value: string) => boolean; rule: FormulaRule }> = [
    { test: (value) => value.includes('硫酸铜'), rule: FORMULAS.CuSO4 },
    { test: (value) => value.includes('硫酸亚铁'), rule: FORMULAS.FeSO4 },
    { test: (value) => value.includes('氯化铁'), rule: FORMULAS.FeCl3 },
    { test: (value) => value.includes('氯化钡'), rule: FORMULAS.BaCl2 },
    { test: (value) => value.includes('硝酸银'), rule: FORMULAS.AgNO3 },
    { test: (value) => value.includes('碳酸氢') || value.includes('小苏打'), rule: FORMULAS.NaHCO3 },
    { test: (value) => value.includes('碳酸钠') || value.includes('纯碱') || (value.includes('苏打') && !value.includes('水')), rule: FORMULAS.Na2CO3 },
    { test: (value) => value.includes('碳酸钙'), rule: FORMULAS.CaCO3 },
    { test: (value) => value.includes('氢氧化钠') || value.includes('烧碱'), rule: FORMULAS.NaOH },
    { test: (value) => value.includes('氢氧化钾'), rule: FORMULAS.KOH },
    { test: (value) => value.includes('氢氧化钙') || value.includes('石灰水'), rule: FORMULAS.CaOH2 },
    { test: (value) => value.includes('氯化钠') || value.includes('食盐'), rule: FORMULAS.NaCl },
    { test: (value) => value.includes('硫酸') && !value.includes('盐') && !value.includes('铁') && !value.includes('铜'), rule: FORMULAS.H2SO4 },
    { test: (value) => value.includes('盐酸'), rule: FORMULAS.HCl },
    { test: (value) => value.includes('硝酸') && !value.includes('盐') && !value.includes('银'), rule: FORMULAS.HNO3 },
    { test: (value) => value.includes('磷酸') && !value.includes('盐'), rule: FORMULAS.H3PO4 },
    { test: (value) => value.includes('醋酸') || value.includes('乙酸'), rule: FORMULAS.CH3COOH },
    { test: (value) => value.includes('柠檬酸'), rule: FORMULAS.C6H8O7 },
    { test: (value) => value.includes('二氧化碳') || value.includes('碳酸水') || value === '碳酸', rule: FORMULAS.CO2 },
    { test: (value) => value.includes('咖啡因'), rule: FORMULAS.C8H10N4O2 },
    { test: (value) => value.includes('葡萄糖') || value.includes('果糖'), rule: FORMULAS.C6H12O6 },
    { test: (value) => ['蔗糖', '砂糖', '焦糖', '色素', '蛋白质', '脂肪', '淀粉', '香精'].some((hint) => value.includes(hint)), rule: FORMULAS.C12H22O11 },
    { test: (value) => value === '镁' || value.includes('镁条') || value.includes('镁片'), rule: FORMULAS.Mg },
    { test: (value) => value === '锌' || value.includes('锌粒'), rule: FORMULAS.Zn },
    { test: (value) => value === '铁' || value.includes('铁钉') || value.includes('铁粉') || value.includes('铁片'), rule: FORMULAS.Fe },
    { test: (value) => value === '铝' || value.includes('铝片'), rule: FORMULAS.Al },
    { test: (value) => value === '铜' || value.includes('铜片') || value.includes('紫铜'), rule: FORMULAS.Cu },
    { test: (value) => value.includes('金属钠') || value === '钠', rule: FORMULAS.Na },
  ];
  return rules.find((entry) => entry.test(name))?.rule ?? null;
}

function metalFromKind(kind: string, formulaKey: string, name: string): MixtureMetal | null {
  if (kind !== 'metal' && !FORMULAS[formulaKey]?.metal) {
    const named = matchName(name);
    return named?.metal ?? null;
  }
  const fromFormula = FORMULAS[formulaKey]?.metal;
  if (fromFormula) return fromFormula;
  const named = matchName(name);
  return named?.metal ?? null;
}

function softenCarbonicAcid(components: MixtureComponent[]): void {
  const hasOtherAcid = components.some((component) =>
    component.ions.some((spec) => spec.ion === 'H+' && spec.moles > 0) && !isCarbonic(component),
  );
  if (!hasOtherAcid) return;
  for (const component of components) {
    if (!isCarbonic(component)) continue;
    component.ions = [];
    component.fizz = true;
    component.kind = 'fizz';
    component.solidKey = null;
    component.follows = 'liquid';
    component.metal = null;
  }
}

function isCarbonic(component: MixtureComponent): boolean {
  const key = normalizeFormula(component.formula);
  if (key === 'CO2' || key === 'H2CO3') return true;
  if (/碳酸(钠|氢|钙|盐|钾)/.test(component.name) || component.name.includes('小苏打') || component.name.includes('苏打')) {
    return false;
  }
  return component.name === '碳酸' || component.name.includes('二氧化碳') || component.name.includes('碳酸水');
}

function stripConflicts(ions: MixtureIon[], kind: string): MixtureIon[] {
  const merged = new Map<string, number>();
  for (const spec of ions) {
    if (!KNOWN_IONS.has(spec.ion) || spec.moles <= 0) continue;
    merged.set(spec.ion, (merged.get(spec.ion) || 0) + spec.moles);
  }
  const has = (ion: string) => (merged.get(ion) || 0) > 0;
  if (has('H+') && has('CO3_2-')) merged.delete(kind === 'carbonate' ? 'H+' : 'CO3_2-');
  if (has('H+') && has('OH-')) merged.delete(kind === 'base' ? 'H+' : 'OH-');
  return [...merged.entries()].map(([ion, moles]) => ({ ion, moles }));
}

function readSpecies(raw: unknown, componentMoles: number): MixtureIon[] {
  if (!Array.isArray(raw)) return [];
  const ions: MixtureIon[] = [];
  for (const item of raw) {
    const record = asRecord(item);
    const ion = canonicalIon(record.ion ?? record.id ?? record.name);
    if (!ion) continue;
    if (typeof record.moles === 'number' && Number.isFinite(record.moles)) {
      ions.push({ ion, moles: Math.max(0, record.moles) });
      continue;
    }
    const count = clampCount(record.count);
    ions.push({ ion, moles: componentMoles * count });
  }
  return ions;
}

function canonicalIon(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const cleaned = raw.trim().replace(/[₀-₉⁰-⁹⁺⁻＋−]/g, (char) => SUBSCRIPT_DIGITS[char] || '');
  if (KNOWN_IONS.has(cleaned)) return cleaned;
  return ION_ALIASES[cleaned] ?? null;
}

function normalizeFormula(formula: string): string {
  return formula
    .replace(/[₀-₉⁰-⁹⁺⁻＋−]/g, (char) => SUBSCRIPT_DIGITS[char] || '')
    .replace(/[\s()（）·.]/g, '');
}

function uniqueId(base: string, used: Set<string>): string {
  const seed = base.replace(/[^a-z0-9:+-]/gi, '').slice(0, 24) || 'part';
  let id = seed;
  let n = 2;
  while (used.has(id)) id = `${seed}-${n++}`;
  used.add(id);
  return id;
}

function cleanText(raw: unknown, max: number): string {
  if (typeof raw !== 'string') return '';
  return raw.replace(/[<>&"'`]/g, '').replace(/[\u0000-\u001f]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function parseColor(raw: unknown, fallback: string): string {
  if (typeof raw !== 'string') return fallback;
  const full = raw.trim().match(/^#([0-9a-fA-F]{6})$/);
  if (full) return `#${full[1].toLowerCase()}`;
  const short = raw.trim().match(/^#([0-9a-fA-F]{3})$/);
  if (!short) return fallback;
  const [r, g, b] = short[1].split('');
  return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
}

function clampVolume(raw: unknown): number {
  const value = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(value)) return 80;
  return Math.min(120, Math.max(40, Math.round(value)));
}

function readMoles(raw: unknown): number | null {
  const value = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.min(0.2, Math.max(0.00005, value));
}

function clampMass(raw: unknown, fallback: number): number {
  const value = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(value) || value <= 0) return fallback;
  return Math.min(2000, Math.max(1, value));
}

function readProtons(raw: unknown): number {
  const value = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(value)) return 1;
  return Math.min(3, Math.max(1, Math.round(value)));
}

function clampCount(raw: unknown): number {
  const value = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(value) || value <= 0) return 1;
  return Math.min(3, value);
}

function isPlain(raw: unknown): raw is Record<string, unknown> {
  return Boolean(raw) && typeof raw === 'object' && !Array.isArray(raw);
}

function asRecord(raw: unknown): Record<string, unknown> {
  return isPlain(raw) ? raw : {};
}
