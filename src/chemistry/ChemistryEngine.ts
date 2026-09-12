import * as THREE from 'three';

export interface ChemicalReagent {
  id: string;
  name: string;
  formula: string;
  category: 'acid' | 'base' | 'salt' | 'metal' | 'indicator' | 'oxide' | 'water';
  state: 'liquid' | 'solid';
  concentration?: number; // mol/L if liquid
  color: number; // Hex color
  description: string;
  hazard?: string;
  defaultAmount: number; // mL for liquid, count for solid
  unit: 'mL' | '片' | '滴';
}

export interface ChemicalReaction {
  id: string;
  title: string;
  equation: string;
  type: string;
  description: string;
  phenomenon: string;
  isExothermic: boolean;
  heatDelta: number; // in Celsius
  gasType?: 'CO2' | 'H2' | 'O2';
  gasRate?: number; // 0-1
  precipitate?: {
    formula: string;
    name: string;
    color: number;
    amountMoles: number;
  };
  dissolvesPrecipitate?: string;
  specialEffect?: 'sodium_burn' | 'effervescence' | 'precipitation' | 'color_shift';
}

export interface ChemistryState {
  volume: number; // mL
  maxVolume: number; // 250 mL
  temperature: number; // Celsius
  pH: number;
  ions: Map<string, number>; // ion name -> moles
  precipitates: Map<string, { formula: string; name: string; color: number; moles: number }>;
  solids: Map<string, { formula: string; name: string; moles: number }>;
  indicators: { phenolphthalein: number; litmus: number };
  liquidColor: THREE.Color;
  recentReactions: ChemicalReaction[];
  activeGasRate: number; // 0 to 1
  gasType: 'CO2' | 'H2' | 'O2' | null;
  activeEffects: Array<{
    type: 'pour' | 'gas' | 'precipitate' | 'sodium_burn' | 'exotherm';
    color?: number;
    intensity?: number;
    duration?: number;
  }>;
}

export class ChemistryEngine {
  public static readonly REAGENTS: Record<string, ChemicalReagent> = {
    H2O: {
      id: 'H2O',
      name: '去离子水',
      formula: 'H₂O',
      category: 'water',
      state: 'liquid',
      color: 0xe0f7fa,
      description: '高纯度实验室用去离子水，中性溶剂。',
      defaultAmount: 50,
      unit: 'mL',
    },
    HCl: {
      id: 'HCl',
      name: '稀盐酸 (1.0 mol/L)',
      formula: 'HCl',
      category: 'acid',
      state: 'liquid',
      concentration: 1.0,
      color: 0xf5f5f5,
      description: '强酸性溶液，解离产生氢离子与氯离子。',
      hazard: '腐蚀性',
      defaultAmount: 25,
      unit: 'mL',
    },
    NaOH: {
      id: 'NaOH',
      name: '氢氧化钠溶液 (1.0 mol/L)',
      formula: 'NaOH',
      category: 'base',
      state: 'liquid',
      concentration: 1.0,
      color: 0xf5f5f5,
      description: '强碱性溶液，提供高浓度氢氧根离子。',
      hazard: '强腐蚀性',
      defaultAmount: 25,
      unit: 'mL',
    },
    CuSO4: {
      id: 'CuSO4',
      name: '硫酸铜溶液 (0.5 mol/L)',
      formula: 'CuSO₄',
      category: 'salt',
      state: 'liquid',
      concentration: 0.5,
      color: 0x00b0ff,
      description: '特征天蓝色透明溶液，含水合铜离子 [Cu(H₂O)₄]²⁺。',
      defaultAmount: 25,
      unit: 'mL',
    },
    BaCl2: {
      id: 'BaCl2',
      name: '氯化钡溶液 (0.5 mol/L)',
      formula: 'BaCl₂',
      category: 'salt',
      state: 'liquid',
      concentration: 0.5,
      color: 0xfafafa,
      description: '用于硫酸根特征沉淀检验的标准检测试剂。',
      hazard: '有毒',
      defaultAmount: 20,
      unit: 'mL',
    },
    FeCl3: {
      id: 'FeCl3',
      name: '氯化铁溶液 (0.5 mol/L)',
      formula: 'FeCl₃',
      category: 'salt',
      state: 'liquid',
      concentration: 0.5,
      color: 0xffa726,
      description: '红褐色/黄色透明溶液，含三价铁离子。',
      defaultAmount: 20,
      unit: 'mL',
    },
    FeSO4: {
      id: 'FeSO4',
      name: '硫酸亚铁溶液 (0.5 mol/L)',
      formula: 'FeSO₄',
      category: 'salt',
      state: 'liquid',
      concentration: 0.5,
      color: 0x81c784,
      description: '浅绿色透明溶液，含二价亚铁离子。',
      defaultAmount: 25,
      unit: 'mL',
    },
    AgNO3: {
      id: 'AgNO3',
      name: '硝酸银溶液 (0.2 mol/L)',
      formula: 'AgNO₃',
      category: 'salt',
      state: 'liquid',
      concentration: 0.2,
      color: 0xfcfcfc,
      description: '氯离子特征检测剂，极易生成白色氯化银沉淀。',
      hazard: '避光保存',
      defaultAmount: 15,
      unit: 'mL',
    },
    Na2CO3: {
      id: 'Na2CO3',
      name: '碳酸钠溶液 (0.5 mol/L)',
      formula: 'Na₂CO₃',
      category: 'salt',
      state: 'liquid',
      concentration: 0.5,
      color: 0xf8f9fa,
      description: '纯碱溶液，遇酸产生剧烈二氧化碳气泡。',
      defaultAmount: 25,
      unit: 'mL',
    },
    NaCl: {
      id: 'NaCl',
      name: '氯化钠溶液 (1.0 mol/L)',
      formula: 'NaCl',
      category: 'salt',
      state: 'liquid',
      concentration: 1.0,
      color: 0xf8f9fa,
      description: '生理食盐水溶质，中性强电解质。',
      defaultAmount: 25,
      unit: 'mL',
    },
    H2O2: {
      id: 'H2O2',
      name: '过氧化氢溶液 (10%)',
      formula: 'H₂O₂',
      category: 'oxide',
      state: 'liquid',
      concentration: 3.0,
      color: 0xf5faff,
      description: '双氧水，遇过渡金属催化剂剧烈分解产生氧气。',
      hazard: '氧化性',
      defaultAmount: 25,
      unit: 'mL',
    },
    Na: {
      id: 'Na',
      name: '金属钠单质',
      formula: 'Na',
      category: 'metal',
      state: 'solid',
      color: 0xe0e0e0,
      description: '极活泼碱金属，遇水剧烈浮游、熔球燃烧并释放氢气。',
      hazard: '遇水燃烧爆炸',
      defaultAmount: 1,
      unit: '片',
    },
    Mg: {
      id: 'Mg',
      name: '镁条',
      formula: 'Mg',
      category: 'metal',
      state: 'solid',
      color: 0xd0d0d0,
      description: '较活泼活泼金属单质，与稀酸剧烈反应产生大量氢气，伴随明显放热。',
      defaultAmount: 1,
      unit: '片',
    },
    Zn: {
      id: 'Zn',
      name: '锌粒',
      formula: 'Zn',
      category: 'metal',
      state: 'solid',
      color: 0x9e9e9e,
      description: '经典实验室制氢金属，与稀盐酸/硫酸平稳置换产生氢气。',
      defaultAmount: 1,
      unit: '片',
    },
    Fe: {
      id: 'Fe',
      name: '细铁粉 / 铁钉',
      formula: 'Fe',
      category: 'metal',
      state: 'solid',
      color: 0x757575,
      description: '较活泼过渡金属单质，与稀酸置换反应生成淡绿亚铁与氢气。',
      defaultAmount: 1,
      unit: '片',
    },
    Cu: {
      id: 'Cu',
      name: '紫铜片',
      formula: 'Cu',
      category: 'metal',
      state: 'solid',
      color: 0xb87333,
      description: '紫红色不活泼金属单质，不与非氧化性稀酸反应。',
      defaultAmount: 1,
      unit: '片',
    },
    H2SO4: {
      id: 'H2SO4',
      name: '稀硫酸 (1.0 mol/L)',
      formula: 'H₂SO₄',
      category: 'acid',
      state: 'liquid',
      concentration: 1.0,
      color: 0xf5f5f5,
      description: '二元强酸，完全解离提供高浓度质子与硫酸根离子。',
      hazard: '强腐蚀性',
      defaultAmount: 25,
      unit: 'mL',
    },
    KOH: {
      id: 'KOH',
      name: '氢氧化钾溶液 (1.0 mol/L)',
      formula: 'KOH',
      category: 'base',
      state: 'liquid',
      concentration: 1.0,
      color: 0xf8f9fa,
      description: '强碱性溶液，提供高活性钾离子与氢氧根离子。',
      hazard: '强腐蚀性',
      defaultAmount: 25,
      unit: 'mL',
    },
    'Ca(OH)2': {
      id: 'Ca(OH)2',
      name: '澄清石灰水 (0.05 mol/L)',
      formula: 'Ca(OH)₂',
      category: 'base',
      state: 'liquid',
      concentration: 0.05,
      color: 0xf4fbff,
      description: '微溶性氢氧化钙澄清滤液，遇二氧化碳生成特征白色碳酸钙沉淀。',
      defaultAmount: 30,
      unit: 'mL',
    },
    KMnO4: {
      id: 'KMnO4',
      name: '高锰酸钾溶液 (0.1 mol/L)',
      formula: 'KMnO₄',
      category: 'salt',
      state: 'liquid',
      concentration: 0.1,
      color: 0x8e24aa,
      description: '经典强氧化剂，特征深紫红色，遇还原剂或过氧化氢迅速褪色并剧烈产氧。',
      hazard: '强氧化剂',
      defaultAmount: 15,
      unit: 'mL',
    },
    phenolphthalein: {
      id: 'phenolphthalein',
      name: '酚酞指示剂',
      formula: 'C₂₀H₁₄O₄',
      category: 'indicator',
      state: 'liquid',
      color: 0xffffff,
      description: '酸碱指示剂：pH < 8.2 无色透明；pH ≥ 8.2 呈现明艳紫红色。',
      defaultAmount: 5,
      unit: '滴',
    },
    litmus: {
      id: 'litmus',
      name: '石蕊试剂',
      formula: 'Litmus',
      category: 'indicator',
      state: 'liquid',
      color: 0xba68c8,
      description: '酸碱指示剂：酸红 (pH<5.0)、中紫 (5.0-8.0)、碱蓝 (pH>8.0)。',
      defaultAmount: 5,
      unit: '滴',
    },
  };

  public state: ChemistryState;
  private listeners: Array<(state: ChemistryState) => void> = [];

  constructor() {
    this.reset();
  }

  public reset(): void {
    this.state = {
      volume: 60, // Start with 60mL pure water in beaker
      maxVolume: 250,
      temperature: 22.5, // Room temp
      pH: 7.0,
      ions: new Map<string, number>([
        ['H+', 1e-7 * 0.06],
        ['OH-', 1e-7 * 0.06],
      ]),
      precipitates: new Map(),
      solids: new Map(),
      indicators: { phenolphthalein: 0, litmus: 0 },
      liquidColor: new THREE.Color(0xd7f3ff),
      recentReactions: [],
      activeGasRate: 0,
      gasType: null,
      activeEffects: [],
    };
    this.notify();
  }

  public subscribe(fn: (state: ChemistryState) => void): () => void {
    this.listeners.push(fn);
    fn(this.state);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== fn);
    };
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener(this.state);
    }
  }

  public addReagent(reagentId: string, amount?: number): ChemicalReaction | null {
    const reagent = ChemistryEngine.REAGENTS[reagentId];
    if (!reagent) {
      console.warn(`[ChemistryEngine] Unknown reagent: ${reagentId}`);
      return null;
    }

    const qty = amount !== undefined ? amount : reagent.defaultAmount;

    // Trigger pouring effect
    this.state.activeEffects.push({
      type: 'pour',
      color: reagent.color,
      intensity: 1.0,
      duration: 1.2,
    });

    let primaryReaction: ChemicalReaction | null = null;
    const occurredReactions: ChemicalReaction[] = [];

    if (reagent.state === 'liquid') {
      const addedVol = qty; // in mL
      this.state.volume = Math.min(this.state.maxVolume, this.state.volume + addedVol);
      const volLiters = addedVol / 1000;

      if (reagent.id === 'H2O') {
        occurredReactions.push({
          id: 'dilution',
          title: '去离子水稀释',
          equation: 'H₂O + Solution ➔ Dilution',
          type: '物理稀释',
          description: '注入纯净去离子水，增加溶剂体积，平缓稀释溶液中的离子浓度。',
          phenomenon: '液面平缓上升，溶质浓度均匀稀释。',
          isExothermic: false,
          heatDelta: -0.2,
        });
      } else if (reagent.id === 'HCl') {
        const molesH = (reagent.concentration || 1.0) * volLiters;
        this.addIon('H+', molesH);
        this.addIon('Cl-', molesH);
      } else if (reagent.id === 'H2SO4') {
        const moles = (reagent.concentration || 1.0) * volLiters;
        this.addIon('H+', moles * 2);
        this.addIon('SO4_2-', moles);
      } else if (reagent.id === 'NaOH') {
        const molesOH = (reagent.concentration || 1.0) * volLiters;
        this.addIon('Na+', molesOH);
        this.addIon('OH-', molesOH);
      } else if (reagent.id === 'KOH') {
        const molesOH = (reagent.concentration || 1.0) * volLiters;
        this.addIon('K+', molesOH);
        this.addIon('OH-', molesOH);
      } else if (reagent.id === 'Ca(OH)2') {
        const moles = (reagent.concentration || 0.05) * volLiters;
        this.addIon('Ca2+', moles);
        this.addIon('OH-', moles * 2);
      } else if (reagent.id === 'CuSO4') {
        const moles = (reagent.concentration || 0.5) * volLiters;
        this.addIon('Cu2+', moles);
        this.addIon('SO4_2-', moles);
      } else if (reagent.id === 'BaCl2') {
        const moles = (reagent.concentration || 0.5) * volLiters;
        this.addIon('Ba2+', moles);
        this.addIon('Cl-', moles * 2);
      } else if (reagent.id === 'FeCl3') {
        const moles = (reagent.concentration || 0.5) * volLiters;
        this.addIon('Fe3+', moles);
        this.addIon('Cl-', moles * 3);
      } else if (reagent.id === 'FeSO4') {
        const moles = (reagent.concentration || 0.5) * volLiters;
        this.addIon('Fe2+', moles);
        this.addIon('SO4_2-', moles);
      } else if (reagent.id === 'AgNO3') {
        const moles = (reagent.concentration || 0.2) * volLiters;
        this.addIon('Ag+', moles);
        this.addIon('NO3-', moles);
      } else if (reagent.id === 'Na2CO3') {
        const moles = (reagent.concentration || 0.5) * volLiters;
        this.addIon('Na+', moles * 2);
        this.addIon('CO3_2-', moles);
      } else if (reagent.id === 'NaCl') {
        const moles = (reagent.concentration || 1.0) * volLiters;
        this.addIon('Na+', moles);
        this.addIon('Cl-', moles);
      } else if (reagent.id === 'H2O2') {
        const moles = (reagent.concentration || 3.0) * volLiters;
        this.addIon('H2O2', moles);
      } else if (reagent.id === 'KMnO4') {
        const moles = (reagent.concentration || 0.1) * volLiters;
        this.addIon('K+', moles);
        this.addIon('MnO4-', moles);
      } else if (reagent.id === 'phenolphthalein') {
        this.state.indicators.phenolphthalein += 1;
        occurredReactions.push({
          id: 'add_indicator',
          title: '加入酚酞指示剂',
          equation: 'In (酚酞) + H₂O ⇌ 变色平衡',
          type: '指示剂滴加',
          description: '滴入酚酞试剂。若溶液处于碱性环境 (pH ≥ 8.2)，将立刻呈现特征紫红色。',
          phenomenon: this.state.pH >= 8.2 ? '溶液瞬间转变为明艳紫红色！' : '在酸性/中性环境下保持无色透明。',
          isExothermic: false,
          heatDelta: 0,
        });
      } else if (reagent.id === 'litmus') {
        this.state.indicators.litmus += 1;
        const colorDesc = this.state.pH < 5.0 ? '红色' : this.state.pH > 8.0 ? '蓝色' : '紫色';
        occurredReactions.push({
          id: 'add_litmus',
          title: '加入石蕊指示剂',
          equation: 'HLit (石蕊) ⇌ H⁺ + Lit⁻',
          type: '指示剂滴加',
          description: '滴入石蕊指示剂，根据氢离子活度在红、紫、蓝之间灵敏指示酸碱环境。',
          phenomenon: `当前环境显现特征【${colorDesc}】。`,
          isExothermic: false,
          heatDelta: 0,
        });
      }
    } else {
      // Solid reagents
      if (reagent.id === 'Na') {
        occurredReactions.push(this.processSodiumReaction(qty));
      } else if (reagent.id === 'Mg') {
        const cur = this.state.solids.get('Mg') || { formula: 'Mg', name: '镁条', moles: 0 };
        cur.moles += qty * 0.015;
        this.state.solids.set('Mg', cur);
      } else if (reagent.id === 'Zn') {
        const cur = this.state.solids.get('Zn') || { formula: 'Zn', name: '锌粒', moles: 0 };
        cur.moles += qty * 0.018;
        this.state.solids.set('Zn', cur);
      } else if (reagent.id === 'Fe') {
        const cur = this.state.solids.get('Fe') || { formula: 'Fe', name: '铁钉/铁粉', moles: 0 };
        cur.moles += qty * 0.018;
        this.state.solids.set('Fe', cur);
      } else if (reagent.id === 'Cu') {
        const cur = this.state.solids.get('Cu') || { formula: 'Cu', name: '紫铜片', moles: 0 };
        cur.moles += qty * 0.015;
        this.state.solids.set('Cu', cur);
        occurredReactions.push({
          id: 'cu_inert',
          title: '投入紫铜片',
          equation: 'Cu + H⁺ ➔ 无置换反应',
          type: '金属惰性',
          description: '铜在金属活动性顺序中排在氢 (H) 之后，常温下不与非氧化性稀酸发生反应。',
          phenomenon: '紫红色铜片沉入烧杯底部，表面光亮无气泡生成。',
          isExothermic: false,
          heatDelta: 0,
        });
      }
    }

    // Process all chemical reaction pathways
    const reactionsFromEquilibrium = this.processReactions();
    occurredReactions.push(...reactionsFromEquilibrium);

    // If no macroscopic reactions occurred, log the dissolution/ionization event
    if (occurredReactions.length === 0) {
      const defaultEvent = this.getDefaultDissolutionEvent(reagent, qty);
      if (defaultEvent) {
        occurredReactions.push(defaultEvent);
      }
    }

    // Recompute pH and liquid color
    this.updatepH();
    this.updateLiquidColor();

    for (const rx of occurredReactions) {
      this.state.recentReactions.unshift(rx);
    }
    if (this.state.recentReactions.length > 8) {
      this.state.recentReactions.length = 8;
    }

    if (occurredReactions.length > 0) {
      const getPriority = (r: ChemicalReaction): number => {
        if (r.specialEffect === 'sodium_burn') return 100;
        if (r.id === 'kmno4_redox') return 95;
        if (r.id.startsWith('dissolve_')) return 92;
        if (r.gasType) return 90;
        if (r.precipitate) return 80;
        if (r.id === 'neutralization') return 50;
        if (r.isExothermic) return 45;
        if (r.id.includes('ionize') || r.id.includes('dissolve')) return 20;
        return 10;
      };
      primaryReaction = occurredReactions.slice().sort((a, b) => getPriority(b) - getPriority(a))[0];
    } else {
      primaryReaction = null;
    }
    this.notify();
    return primaryReaction;
  }

  private getDefaultDissolutionEvent(reagent: ChemicalReagent, qty: number): ChemicalReaction | null {
    if (reagent.id === 'HCl') {
      return {
        id: 'hcl_ionize',
        title: '稀盐酸水合电离',
        equation: 'HCl ➔ H⁺ + Cl⁻ (完全电离)',
        type: '强酸溶解电离',
        description: '氯化氢气体溶质在极性水分子作用下彻底解离，溶液质子活度大幅提高。',
        phenomenon: '无色透明液体，溶液 pH 迅速跌至强酸性区间。',
        isExothermic: false,
        heatDelta: 0.1,
      };
    } else if (reagent.id === 'H2SO4') {
      return {
        id: 'h2so4_ionize',
        title: '稀硫酸水合电离',
        equation: 'H₂SO₄ ➔ 2H⁺ + SO₄²⁻ (完全电离)',
        type: '二元强酸电离',
        description: '硫酸分子在水中两级彻底电离，提供双倍当量质子与硫酸根。',
        phenomenon: '无色透明液体，溶液显现强酸性。',
        isExothermic: false,
        heatDelta: 0.3,
      };
    } else if (reagent.id === 'NaOH') {
      return {
        id: 'naoh_ionize',
        title: '氢氧化钠水合电离',
        equation: 'NaOH ➔ Na⁺ + OH⁻ (强电解质电离)',
        type: '强碱溶解电离',
        description: '离子晶体氢氧化钠迅速水合分散出大量氢氧根离子与钠离子。',
        phenomenon: '溶液澄清透明，pH 大幅升至强碱性区间。',
        isExothermic: false,
        heatDelta: 0.1,
      };
    } else if (reagent.id === 'KOH') {
      return {
        id: 'koh_ionize',
        title: '氢氧化钾水合电离',
        equation: 'KOH ➔ K⁺ + OH⁻ (完全电离)',
        type: '强碱溶解电离',
        description: '极性氢氧化钾彻底离解，提供高活性钾离子与强碱性氢氧根。',
        phenomenon: '溶液清澈透亮，显强碱性。',
        isExothermic: false,
        heatDelta: 0.1,
      };
    } else if (reagent.id === 'Ca(OH)2') {
      return {
        id: 'caoh2_ionize',
        title: '澄清石灰水溶入',
        equation: 'Ca(OH)₂ ➔ Ca²⁺ + 2OH⁻',
        type: '微溶强碱微解离',
        description: '澄清石灰水引入钙离子与氢氧根离子，为二氧化碳特征检验准备基质。',
        phenomenon: '溶液保持清澈透明，呈弱碱性。',
        isExothermic: false,
        heatDelta: 0,
      };
    } else if (reagent.id === 'NaCl') {
      return {
        id: 'nacl_dissolve',
        title: '氯化钠晶体溶解',
        equation: 'NaCl ➔ Na⁺ + Cl⁻',
        type: '中性强电解质电离',
        description: '食盐晶格在水合能驱动下瓦解，钠离子与氯离子自由扩散于水相。',
        phenomenon: '溶液澄清无色，pH 保持中性 7.0。',
        isExothermic: false,
        heatDelta: 0,
      };
    } else if (reagent.id === 'CuSO4') {
      return {
        id: 'cuso4_dissolve',
        title: '硫酸铜配位水合',
        equation: 'CuSO₄ + 4H₂O ➔ [Cu(H₂O)₄]²⁺ + SO₄²⁻',
        type: '配位离子分散',
        description: '铜离子与水分子结合形成四水合铜配合物，产生特征天蓝色。',
        phenomenon: '烧杯内溶液呈现出清澈明亮的天蓝色。',
        isExothermic: false,
        heatDelta: 0,
      };
    } else if (reagent.id === 'BaCl2') {
      return {
        id: 'bacl2_dissolve',
        title: '氯化钡溶解电离',
        equation: 'BaCl₂ ➔ Ba²⁺ + 2Cl⁻',
        type: '钡盐电离',
        description: '氯化钡在水中完全解离为钡离子与氯离子。',
        phenomenon: '溶液清澈无色透明。',
        isExothermic: false,
        heatDelta: 0,
      };
    } else if (reagent.id === 'FeCl3') {
      return {
        id: 'fecl3_dissolve',
        title: '三氯化铁水合电离',
        equation: 'FeCl₃ ➔ Fe³⁺ + 3Cl⁻',
        type: '过渡金属盐电离',
        description: '水合三价铁离子具有明显的配位光吸收，溶液呈棕黄色。',
        phenomenon: '烧杯液体转为清澈透明的棕黄色/橙黄色。',
        isExothermic: false,
        heatDelta: 0,
      };
    } else if (reagent.id === 'FeSO4') {
      return {
        id: 'feso4_dissolve',
        title: '硫酸亚铁水合电离',
        equation: 'FeSO₄ ➔ Fe²⁺ + SO₄²⁻',
        type: '亚铁盐电离',
        description: '二价亚铁水合离子产生特征淡绿色。',
        phenomenon: '烧杯液体呈浅绿透明色泽。',
        isExothermic: false,
        heatDelta: 0,
      };
    } else if (reagent.id === 'AgNO3') {
      return {
        id: 'agno3_dissolve',
        title: '硝酸银溶解电离',
        equation: 'AgNO₃ ➔ Ag⁺ + NO₃⁻',
        type: '银盐电离',
        description: '可溶性银盐完全电离出对卤素极其敏锐的自由银离子。',
        phenomenon: '溶液清澈无色透明。',
        isExothermic: false,
        heatDelta: 0,
      };
    } else if (reagent.id === 'Na2CO3') {
      return {
        id: 'na2co3_dissolve',
        title: '碳酸钠溶解与初级水解',
        equation: 'Na₂CO₃ + H₂O ⇌ NaHCO₃ + NaOH',
        type: '弱酸强碱盐水解',
        description: '碳酸根结合质子发生水解平衡，使溶液产生富余氢氧根并显弱碱性。',
        phenomenon: '溶液清澈无色，pH 上升呈弱碱性。',
        isExothermic: false,
        heatDelta: 0,
      };
    } else if (reagent.id === 'H2O2') {
      return {
        id: 'h2o2_stable',
        title: '注入过氧化氢',
        equation: 'H₂O₂ + H₂O ⇌ 稳定水溶液',
        type: '过氧化物分散',
        description: '双氧水与水完全互溶，常温避光无催化剂状态下自分解极其缓慢。',
        phenomenon: '溶液清澈透明，暂无剧烈气泡析出。',
        isExothermic: false,
        heatDelta: 0,
      };
    } else if (reagent.id === 'KMnO4') {
      return {
        id: 'kmno4_dissolve',
        title: '高锰酸钾溶解电离',
        equation: 'KMnO₄ ➔ K⁺ + MnO₄⁻',
        type: '强氧化剂电离',
        description: '四面体高锰酸根离子产生强烈的荷移跃迁吸收，显明艳深紫红色。',
        phenomenon: '烧杯内瞬间被瑰丽浓郁的深紫红色充满！',
        isExothermic: false,
        heatDelta: 0,
      };
    } else if (reagent.id === 'Fe') {
      return {
        id: 'fe_neutral',
        title: '铁钉沉入中性水体',
        equation: 'Fe + H₂O ➔ 常温无气泡反应',
        type: '金属浸润',
        description: '常温脱气中性水中缺乏驱动质子，铁单质不发生明显置换。',
        phenomenon: '金属沉在杯底，表面光洁无气泡。',
        isExothermic: false,
        heatDelta: 0,
      };
    } else if (reagent.id === 'Mg') {
      return {
        id: 'mg_neutral',
        title: '镁条投入水中',
        equation: 'Mg + 2H₂O ➔ 极微量置换',
        type: '金属钝化',
        description: '常温水中镁表面快速形成致密难溶微孔薄膜，常温反应极为迟缓。',
        phenomenon: '银白金属片沉底，常温无剧烈气泡。',
        isExothermic: false,
        heatDelta: 0,
      };
    } else if (reagent.id === 'Zn') {
      return {
        id: 'zn_neutral',
        title: '锌粒沉入水中',
        equation: 'Zn + H₂O ➔ 常温无置换反应',
        type: '金属中性浸润',
        description: '中性水中缺乏足量游离 H⁺，锌粒保持化学沉寂。',
        phenomenon: '灰色锌粒沉入底部，表面无明显反应。',
        isExothermic: false,
        heatDelta: 0,
      };
    }
    return null;
  }

  private addIon(ion: string, moles: number): void {
    const cur = this.state.ions.get(ion) || 0;
    this.state.ions.set(ion, Math.max(0, cur + moles));
  }

  private getIon(ion: string): number {
    return this.state.ions.get(ion) || 0;
  }

  private setIon(ion: string, moles: number): void {
    this.state.ions.set(ion, Math.max(0, moles));
  }

  private processReactions(): ChemicalReaction[] {
    const reactions: ChemicalReaction[] = [];

    // 1. Metal + Acid active displacement (Mg, Zn, Fe)
    const molesH = this.getIon('H+');

    // 1a. Magnesium + Acid
    const solidMg = this.state.solids.get('Mg');
    if (solidMg && solidMg.moles > 1e-6 && this.getIon('H+') > 1e-4) {
      const curH = this.getIon('H+');
      const reacted = Math.min(curH / 2, solidMg.moles);
      solidMg.moles -= reacted;
      if (solidMg.moles <= 1e-6) this.state.solids.delete('Mg');
      this.setIon('H+', curH - reacted * 2);
      this.addIon('Mg2+', reacted);

      const heatDelta = (reacted * 460 * 1000) / (this.state.volume * 4.184);
      this.state.temperature = Math.min(96, this.state.temperature + heatDelta);
      this.state.activeGasRate = 1.0;
      this.state.gasType = 'H2';

      this.state.activeEffects.push({ type: 'gas', intensity: 1.0, duration: 4.0 });
      this.state.activeEffects.push({ type: 'exotherm', intensity: 0.8, duration: 2.0 });

      const eq = this.getIon('SO4_2-') > 1e-4 ? 'Mg + H₂SO₄ ➔ MgSO₄ + H₂↑' : 'Mg + 2HCl ➔ MgCl₂ + H₂↑';
      reactions.push({
        id: 'mg_acid',
        title: '活泼镁条剧烈置换产氢',
        equation: eq,
        type: '活泼金属置换反应',
        description: '镁单质电负性极低，极易释放电子还原氢离子，产生大量氢气微气泡与强烈放热。',
        phenomenon: `镁条表面剧烈翻腾，如沸水般喷涌密集白雾状氢气泡，烧杯明显放热发烫 (${this.state.temperature.toFixed(1)}°C)！`,
        isExothermic: true,
        heatDelta: heatDelta,
        gasType: 'H2',
        gasRate: 1.0,
      });
    }

    // 1b. Zinc + Acid
    const solidZn = this.state.solids.get('Zn');
    if (solidZn && solidZn.moles > 1e-6 && this.getIon('H+') > 1e-4) {
      const curH = this.getIon('H+');
      const reacted = Math.min(curH / 2, solidZn.moles);
      solidZn.moles -= reacted;
      if (solidZn.moles <= 1e-6) this.state.solids.delete('Zn');
      this.setIon('H+', curH - reacted * 2);
      this.addIon('Zn2+', reacted);

      const heatDelta = (reacted * 153 * 1000) / (this.state.volume * 4.184);
      this.state.temperature = Math.min(90, this.state.temperature + heatDelta);
      this.state.activeGasRate = 0.8;
      this.state.gasType = 'H2';

      this.state.activeEffects.push({ type: 'gas', intensity: 0.8, duration: 3.5 });

      const eq = this.getIon('SO4_2-') > 1e-4 ? 'Zn + H₂SO₄ ➔ ZnSO₄ + H₂↑' : 'Zn + 2HCl ➔ ZnCl₂ + H₂↑';
      reactions.push({
        id: 'zn_acid',
        title: '锌粒平稳置换制氢',
        equation: eq,
        type: '经典实验室制氢反应',
        description: '锌单质与强酸平稳均一反应，析出细小均匀的纯净氢气泡。',
        phenomenon: '锌粒表面持续不断冒出细密珍珠状氢气泡并升腾扩散。',
        isExothermic: true,
        heatDelta: heatDelta,
        gasType: 'H2',
        gasRate: 0.8,
      });
    }

    // 1c. Iron + Acid
    const solidFe = this.state.solids.get('Fe');
    if (solidFe && solidFe.moles > 1e-6 && this.getIon('H+') > 1e-4) {
      const curH = this.getIon('H+');
      const reacted = Math.min(curH / 2, solidFe.moles);
      solidFe.moles -= reacted;
      if (solidFe.moles <= 1e-6) this.state.solids.delete('Fe');
      this.setIon('H+', curH - reacted * 2);
      this.addIon('Fe2+', reacted);

      this.state.activeGasRate = 0.5;
      this.state.gasType = 'H2';
      this.state.activeEffects.push({ type: 'gas', intensity: 0.5, duration: 3.0 });

      const eq = this.getIon('SO4_2-') > 1e-4 ? 'Fe + H₂SO₄ ➔ FeSO₄ + H₂↑' : 'Fe + 2HCl ➔ FeCl₂ + H₂↑';
      reactions.push({
        id: 'fe_acid',
        title: '铁与酸置换反应',
        equation: eq,
        type: '置换反应',
        description: '铁单质失去外层电子被强酸氧化为淡绿色亚铁离子，释放氢气。',
        phenomenon: '铁钉表面持续产生均匀气泡，溶液色泽渐渐转为透明浅绿色。',
        isExothermic: false,
        heatDelta: 0.6,
        gasType: 'H2',
        gasRate: 0.5,
      });
    }

    // 2. Precipitates Acid Dissolution
    // 2a. Cu(OH)2 dissolution
    const cuPrecip = this.state.precipitates.get('Cu(OH)2');
    if (cuPrecip && cuPrecip.moles > 1e-6 && this.getIon('H+') > 1e-4) {
      const curH = this.getIon('H+');
      const maxDissolve = curH / 2;
      const dissolved = Math.min(cuPrecip.moles, maxDissolve);

      cuPrecip.moles -= dissolved;
      this.setIon('H+', curH - dissolved * 2);
      this.addIon('Cu2+', dissolved);

      if (cuPrecip.moles <= 1e-6) {
        this.state.precipitates.delete('Cu(OH)2');
      }

      reactions.push({
        id: 'dissolve_cu',
        title: '氢氧化铜沉淀溶解',
        equation: 'Cu(OH)₂↓ + 2HCl ➔ CuCl₂ + 2H₂O',
        type: '沉淀溶解平衡破坏',
        description: '高活度质子 H⁺ 夺取难溶碱的氢氧根生成水，蓝色絮状沉淀完全溶解重回溶液离子相。',
        phenomenon: '烧杯底部蓝色絮状沉淀逐渐消融消失，溶液转为清澈透亮的天蓝色。',
        isExothermic: true,
        heatDelta: 0.8,
      });
    }

    // 2b. CaCO3 dissolution (Limestone with acid effervescence)
    const caPrecip = this.state.precipitates.get('CaCO3');
    if (caPrecip && caPrecip.moles > 1e-6 && this.getIon('H+') > 1e-4) {
      const curH = this.getIon('H+');
      const maxDissolve = curH / 2;
      const dissolved = Math.min(caPrecip.moles, maxDissolve);

      caPrecip.moles -= dissolved;
      this.setIon('H+', curH - dissolved * 2);
      this.addIon('Ca2+', dissolved);

      if (caPrecip.moles <= 1e-6) {
        this.state.precipitates.delete('CaCO3');
      }

      this.state.activeGasRate = 1.0;
      this.state.gasType = 'CO2';
      this.state.activeEffects.push({ type: 'gas', intensity: 1.0, duration: 3.5 });

      reactions.push({
        id: 'dissolve_caco3',
        title: '碳酸钙沉淀溶解并剧烈产气',
        equation: 'CaCO₃↓ + 2HCl ➔ CaCl₂ + H₂O + CO₂↑',
        type: '难溶弱酸盐酸解',
        description: '强酸质子快速进攻碳酸钙晶格，释放出大量二氧化碳气泡，乳白浑浊迅速变澄清。',
        phenomenon: '乳白色浑浊物剧烈翻腾冒泡，迅速被酸液溶解，溶液重归透明！',
        isExothermic: false,
        heatDelta: 0.4,
        gasType: 'CO2',
        gasRate: 1.0,
      });
    }

    // 2c. Fe(OH)3 dissolution
    const fePrecip = this.state.precipitates.get('Fe(OH)3');
    if (fePrecip && fePrecip.moles > 1e-6 && this.getIon('H+') > 1e-4) {
      const curH = this.getIon('H+');
      const maxDissolve = curH / 3;
      const dissolved = Math.min(fePrecip.moles, maxDissolve);

      fePrecip.moles -= dissolved;
      this.setIon('H+', curH - dissolved * 3);
      this.addIon('Fe3+', dissolved);

      if (fePrecip.moles <= 1e-6) {
        this.state.precipitates.delete('Fe(OH)3');
      }

      reactions.push({
        id: 'dissolve_fe',
        title: '氢氧化铁沉淀溶解',
        equation: 'Fe(OH)₃↓ + 3HCl ➔ FeCl₃ + 3H₂O',
        type: '难溶碱酸溶',
        description: '红褐色胶凝沉淀被强酸完全溶解，生成黄色三价铁水合离子。',
        phenomenon: '底部红褐色沉淀溶解消失，溶液转为澄清透明的琥珀黄色。',
        isExothermic: false,
        heatDelta: 0.5,
      });
    }

    // 3. Carbonate Effervescence: CO3(2-) + 2H+ -> H2O + CO2 ^
    const curCO3 = this.getIon('CO3_2-');
    const curH2 = this.getIon('H+');
    if (curCO3 > 1e-5 && curH2 > 1e-4) {
      const reacted = Math.min(curCO3, curH2 / 2);
      this.setIon('CO3_2-', curCO3 - reacted);
      this.setIon('H+', curH2 - reacted * 2);

      this.state.activeGasRate = 1.0;
      this.state.gasType = 'CO2';
      this.state.activeEffects.push({ type: 'gas', intensity: 1.0, duration: 3.5 });

      const eq = this.getIon('SO4_2-') > 1e-4 ? 'Na₂CO₃ + H₂SO₄ ➔ Na₂SO₄ + H₂O + CO₂↑' : 'Na₂CO₃ + 2HCl ➔ 2NaCl + H₂O + CO₂↑';
      reactions.push({
        id: 'co2_gas',
        title: '碳酸盐剧烈产气泡反应',
        equation: eq,
        type: '强酸夺弱酸根产气',
        description: '强酸质子迅速质子化碳酸根形成极不稳定的碳酸分子，瞬时解聚为大量二氧化碳气体。',
        phenomenon: '烧杯内剧烈翻滚沸腾，密集透明二氧化碳气泡蜂拥而上并在液面破裂！',
        isExothermic: false,
        heatDelta: 0.3,
        gasType: 'CO2',
        gasRate: 1.0,
        specialEffect: 'effervescence',
      });
    }

    // 4. Acid-Base Neutralization: H+ + OH- -> H2O
    // Threshold 1e-4 mol to distinguish actual macroscopic neutralization from solvent autodissociation!
    const curH_neut = this.getIon('H+');
    const curOH_neut = this.getIon('OH-');
    if (curH_neut >= 1e-4 && curOH_neut >= 1e-4) {
      const reacted = Math.min(curH_neut, curOH_neut);
      this.setIon('H+', curH_neut - reacted);
      this.setIon('OH-', curOH_neut - reacted);

      // Exothermic: ~57.3 kJ/mol
      const heatRise = (reacted * 57.3 * 1000) / (this.state.volume * 4.184);
      this.state.temperature = Math.min(95, this.state.temperature + heatRise);

      this.state.activeEffects.push({
        type: 'exotherm',
        intensity: Math.min(1.0, heatRise / 5),
        duration: 1.5,
      });

      let eq = 'HCl + NaOH ➔ NaCl + H₂O';
      if (this.getIon('K+') > 1e-4) {
        eq = this.getIon('SO4_2-') > 1e-4 ? 'H₂SO₄ + 2KOH ➔ K₂SO₄ + 2H₂O' : 'HCl + KOH ➔ KCl + H₂O';
      } else if (this.getIon('Ca2+') > 1e-4) {
        eq = '2HCl + Ca(OH)₂ ➔ CaCl₂ + 2H₂O';
      } else if (this.getIon('SO4_2-') > 1e-4) {
        eq = 'H₂SO₄ + 2NaOH ➔ Na₂SO₄ + 2H₂O';
      }

      reactions.push({
        id: 'neutralization',
        title: '酸碱中和反应',
        equation: eq,
        type: '中和反应 (复分解)',
        description: '强酸氢离子与强碱氢氧根离子快速结合生成极稳定的水分子，释放可观的中和热。',
        phenomenon: `系统显著放热，液体温度平稳上升至 ${this.state.temperature.toFixed(1)}°C。`,
        isExothermic: true,
        heatDelta: heatRise,
      });
    }

    // 5. Precipitations
    // 5a. Cu(OH)2 precipitate: Cu2+ + 2OH- -> Cu(OH)2 v (Blue flocculent)
    const curCu = this.getIon('Cu2+');
    const curOH = this.getIon('OH-');
    if (curCu > 1e-5 && curOH > 1e-5) {
      const precipMoles = Math.min(curCu, curOH / 2);
      this.setIon('Cu2+', curCu - precipMoles);
      this.setIon('OH-', curOH - precipMoles * 2);

      const existing = this.state.precipitates.get('Cu(OH)2');
      const totalMoles = (existing?.moles || 0) + precipMoles;
      this.state.precipitates.set('Cu(OH)2', {
        formula: 'Cu(OH)₂↓',
        name: '蓝色絮状沉淀',
        color: 0x0288d1,
        moles: totalMoles,
      });

      this.state.activeEffects.push({
        type: 'precipitate',
        color: 0x0288d1,
        intensity: 1.0,
        duration: 2.5,
      });

      const eq = this.getIon('K+') > 1e-4 ? 'CuSO₄ + 2KOH ➔ Cu(OH)₂↓ + K₂SO₄' : 'CuSO₄ + 2NaOH ➔ Cu(OH)₂↓ + Na₂SO₄';
      reactions.push({
        id: 'cu_precip',
        title: '氢氧化铜沉淀反应',
        equation: eq,
        type: '复分解反应',
        description: '溶液中 Cu²⁺ 与 OH⁻ 结合生成难溶性氢氧化铜絮状物，溶度积 Ksp 达 2.2×10⁻²⁰。',
        phenomenon: '烧杯内立刻涌现出轻盈飘散的深海蓝色絮状沉淀，并在液体中缓缓沉降。',
        isExothermic: false,
        heatDelta: 0.5,
        precipitate: {
          formula: 'Cu(OH)₂↓',
          name: '蓝色絮状沉淀',
          color: 0x0288d1,
          amountMoles: totalMoles,
        },
      });
    }

    // 5b. BaSO4 precipitate: Ba2+ + SO4(2-) -> BaSO4 v (Dense white)
    const curBa = this.getIon('Ba2+');
    const curSO4 = this.getIon('SO4_2-');
    if (curBa > 1e-5 && curSO4 > 1e-5) {
      const precipMoles = Math.min(curBa, curSO4);
      this.setIon('Ba2+', curBa - precipMoles);
      this.setIon('SO4_2-', curSO4 - precipMoles);

      const existing = this.state.precipitates.get('BaSO4');
      const totalMoles = (existing?.moles || 0) + precipMoles;
      this.state.precipitates.set('BaSO4', {
        formula: 'BaSO₄↓',
        name: '白色微晶沉淀',
        color: 0xffffff,
        moles: totalMoles,
      });

      this.state.activeEffects.push({
        type: 'precipitate',
        color: 0xffffff,
        intensity: 1.0,
        duration: 2.5,
      });

      let eq = 'BaCl₂ + Na₂SO₄ ➔ BaSO₄↓ + 2NaCl';
      if (this.getIon('Cu2+') > 1e-4) {
        eq = 'BaCl₂ + CuSO₄ ➔ BaSO₄↓ + CuCl₂';
      } else if (this.getIon('Fe2+') > 1e-4) {
        eq = 'BaCl₂ + FeSO₄ ➔ BaSO₄↓ + FeCl₂';
      } else if (this.getIon('H+') > 1e-4) {
        eq = 'BaCl₂ + H₂SO₄ ➔ BaSO₄↓ + 2HCl';
      }

      reactions.push({
        id: 'ba_precip',
        title: '硫酸钡白色沉淀反应',
        equation: eq,
        type: '复分解检验反应',
        description: 'Ba²⁺ 与 SO₄²⁻ 极度灵敏反应生成不溶于水亦不溶于强酸的致密白色硫酸钡沉淀。',
        phenomenon: '溶液瞬间产生雪白乳浊状悬浮物，沉淀颗粒细密均匀并沉入杯底。',
        isExothermic: false,
        heatDelta: 0.2,
        precipitate: {
          formula: 'BaSO₄↓',
          name: '白色细微晶体',
          color: 0xffffff,
          amountMoles: totalMoles,
        },
      });
    }

    // 5c. CaCO3 precipitate (Cloudy limewater): Ca2+ + CO3(2-) -> CaCO3 v
    const curCa = this.getIon('Ca2+');
    const curCO3_ca = this.getIon('CO3_2-');
    if (curCa > 1e-5 && curCO3_ca > 1e-5) {
      const precipMoles = Math.min(curCa, curCO3_ca);
      this.setIon('Ca2+', curCa - precipMoles);
      this.setIon('CO3_2-', curCO3_ca - precipMoles);

      const existing = this.state.precipitates.get('CaCO3');
      const totalMoles = (existing?.moles || 0) + precipMoles;
      this.state.precipitates.set('CaCO3', {
        formula: 'CaCO₃↓',
        name: '碳酸钙白色浑浊沉淀',
        color: 0xffffff,
        moles: totalMoles,
      });

      this.state.activeEffects.push({
        type: 'precipitate',
        color: 0xffffff,
        intensity: 0.9,
        duration: 2.5,
      });

      reactions.push({
        id: 'caco3_precip',
        title: '石灰水变浑浊沉淀',
        equation: 'Ca(OH)₂ + Na₂CO₃ ➔ CaCO₃↓ + 2NaOH',
        type: '碳酸盐沉淀检验',
        description: '钙离子与碳酸根结合生成微晶碳酸钙沉淀，重现经典的石灰水变浑浊特征现象。',
        phenomenon: '清澈澄清的石灰水瞬间出现乳白色牛奶状浑浊悬浊液！',
        isExothermic: false,
        heatDelta: 0.2,
        precipitate: {
          formula: 'CaCO₃↓',
          name: '白色浑浊微晶',
          color: 0xffffff,
          amountMoles: totalMoles,
        },
      });
    }

    // 5d. Fe(OH)3 precipitate: Fe3+ + 3OH- -> Fe(OH)3 v (Red-brown)
    const curFe3 = this.getIon('Fe3+');
    const curOH_fe = this.getIon('OH-');
    if (curFe3 > 1e-5 && curOH_fe > 1e-5) {
      const precipMoles = Math.min(curFe3, curOH_fe / 3);
      this.setIon('Fe3+', curFe3 - precipMoles);
      this.setIon('OH-', curOH_fe - precipMoles * 3);

      const existing = this.state.precipitates.get('Fe(OH)3');
      const totalMoles = (existing?.moles || 0) + precipMoles;
      this.state.precipitates.set('Fe(OH)3', {
        formula: 'Fe(OH)₃↓',
        name: '红褐色胶状沉淀',
        color: 0x8d4925,
        moles: totalMoles,
      });

      this.state.activeEffects.push({
        type: 'precipitate',
        color: 0x8d4925,
        intensity: 1.0,
        duration: 2.5,
      });

      reactions.push({
        id: 'fe_precip',
        title: '氢氧化铁胶体沉淀',
        equation: 'FeCl₃ + 3NaOH ➔ Fe(OH)₃↓ + 3NaCl',
        type: '复分解胶体析出',
        description: '三价铁在碱性环境中发生快速水解与聚合，形成特征明显的红褐色凝胶状沉淀。',
        phenomenon: '生成红褐色胶凝絮片，浮悬于液体内部并逐渐凝聚成层。',
        isExothermic: false,
        heatDelta: 0.4,
        precipitate: {
          formula: 'Fe(OH)₃↓',
          name: '红褐色胶状物',
          color: 0x8d4925,
          amountMoles: totalMoles,
        },
      });
    }

    // 5e. AgCl precipitate: Ag+ + Cl- -> AgCl v (Curdy white)
    const curAg = this.getIon('Ag+');
    const curCl = this.getIon('Cl-');
    if (curAg > 1e-5 && curCl > 1e-5) {
      const precipMoles = Math.min(curAg, curCl);
      this.setIon('Ag+', curAg - precipMoles);
      this.setIon('Cl-', curCl - precipMoles);

      const existing = this.state.precipitates.get('AgCl');
      const totalMoles = (existing?.moles || 0) + precipMoles;
      this.state.precipitates.set('AgCl', {
        formula: 'AgCl↓',
        name: '白色凝乳状沉淀',
        color: 0xf5f5f5,
        moles: totalMoles,
      });

      this.state.activeEffects.push({
        type: 'precipitate',
        color: 0xf5f5f5,
        intensity: 1.0,
        duration: 2.5,
      });

      let eq = 'AgNO₃ + NaCl ➔ AgCl↓ + NaNO₃';
      if (this.getIon('H+') > 1e-4) {
        eq = 'AgNO₃ + HCl ➔ AgCl↓ + HNO₃';
      } else if (this.getIon('Ba2+') > 1e-4) {
        eq = '2AgNO₃ + BaCl₂ ➔ 2AgCl↓ + Ba(NO₃)₂';
      } else if (this.getIon('Fe3+') > 1e-4) {
        eq = '3AgNO₃ + FeCl₃ ➔ 3AgCl↓ + Fe(NO₃)₃';
      }

      reactions.push({
        id: 'ag_precip',
        title: '氯化银白色凝乳沉淀',
        equation: eq,
        type: '离子沉淀检验',
        description: '银离子与氯离子极度敏锐结合，呈现出经典的凝乳样纯白微粒。',
        phenomenon: '液滴接触面瞬间凝固为絮状凝乳白斑，缓缓下落至杯底。',
        isExothermic: false,
        heatDelta: 0.2,
        precipitate: {
          formula: 'AgCl↓',
          name: '白色凝乳沉淀',
          color: 0xf5f5f5,
          amountMoles: totalMoles,
        },
      });
    }

    // 6. Redox: KMnO4 + H2O2 in acid
    const curMnO4 = this.getIon('MnO4-');
    const curH2O2_ox = this.getIon('H2O2');
    const curH_ox = this.getIon('H+');
    if (curMnO4 > 1e-5 && curH2O2_ox > 1e-5 && curH_ox > 1e-5) {
      // 2KMnO4 + 5H2O2 + 3H2SO4 -> K2SO4 + 2MnSO4 + 8H2O + 5O2 ^
      const reacted = Math.min(curMnO4, curH2O2_ox * (2 / 5), curH_ox * (2 / 6));
      this.setIon('MnO4-', curMnO4 - reacted);
      this.setIon('H2O2', curH2O2_ox - reacted * 2.5);
      this.setIon('H+', curH_ox - reacted * 3);
      this.addIon('Mn2+', reacted);

      this.state.activeGasRate = 1.0;
      this.state.gasType = 'O2';
      this.state.temperature += 4.5;
      this.state.activeEffects.push({ type: 'gas', intensity: 1.0, duration: 4.0 });
      this.state.activeEffects.push({ type: 'exotherm', intensity: 0.7, duration: 2.0 });

      reactions.push({
        id: 'kmno4_redox',
        title: '高锰酸钾氧化双氧水剧烈喷氧',
        equation: '2KMnO₄ + 5H₂O₂ + 6H⁺ ➔ 2Mn²⁺ + 8H₂O + 5O₂↑',
        type: '氧化还原剧烈产氧',
        description: '七价高锰酸根强氧化剂将过氧化氢氧化为纯氧气，自身还原为近乎无色的二价锰离子。',
        phenomenon: '浓郁深紫红色瞬间褪为无色透明，同时伴随剧烈沸腾般的纯氧气泡喷涌！',
        isExothermic: true,
        heatDelta: 4.5,
        gasType: 'O2',
        gasRate: 1.0,
      });
    }

    // 7. Catalytic decomposition: H2O2 decomposition with Fe3+ or Fe2+
    const curH2O2 = this.getIon('H2O2');
    if (curH2O2 > 1e-4 && (this.getIon('Fe3+') > 1e-4 || this.getIon('Fe2+') > 1e-4)) {
      const decomposed = curH2O2 * 0.75;
      this.setIon('H2O2', curH2O2 - decomposed);

      this.state.activeGasRate = 0.8;
      this.state.gasType = 'O2';
      this.state.temperature += 2.5;

      this.state.activeEffects.push({
        type: 'gas',
        intensity: 0.85,
        duration: 3.0,
      });

      reactions.push({
        id: 'h2o2_decomp',
        title: '过氧化氢催化分解',
        equation: '2H₂O₂ ➔ 2H₂O + O₂↑ (Fe³⁺催化)',
        type: '氧化还原催化分解',
        description: '过渡金属铁离子作为强效电子中继催化剂，大幅降低活化能，快速释放纯氧。',
        phenomenon: '大量细小氧气泡在黄色溶液中迅速升腾聚集，产生类似香槟泡沫的发泡浪潮。',
        isExothermic: true,
        heatDelta: 2.5,
        gasType: 'O2',
        gasRate: 0.8,
      });
    }

    return reactions;
  }

  private processSodiumReaction(pieceCount: number): ChemicalReaction {
    const molesNa = pieceCount * 0.02; // ~0.46g per piece
    const molesH2O = (this.state.volume / 18) * 0.01;
    const reacted = Math.min(molesNa, molesH2O);

    // 2Na + 2H2O -> 2NaOH + H2 ^
    this.addIon('Na+', reacted);
    this.addIon('OH-', reacted);

    const heatDelta = (reacted * 368 * 1000) / (this.state.volume * 4.184);
    this.state.temperature = Math.min(98, this.state.temperature + heatDelta);

    this.state.activeGasRate = 1.0;
    this.state.gasType = 'H2';

    // Trigger sodium burn effect
    this.state.activeEffects.push({
      type: 'sodium_burn',
      intensity: 1.0,
      duration: 4.5,
    });

    this.state.activeEffects.push({
      type: 'gas',
      intensity: 1.0,
      duration: 4.0,
    });

    return {
      id: 'na_reaction',
      title: '金属钠剧烈水解燃烧',
      equation: '2Na + 2H₂O ➔ 2NaOH + H₂↑ (剧烈放热燃烧)',
      type: '超活泼金属氧化还原',
      description: '金属钠表面极度缺电子亲核反应，释放巨大热量使钠熔为银白闪亮小球并游动燃烧。',
      phenomenon: `钠融化为银亮液滴在水面急剧旋转游弋，伴随耀眼金黄钠火花、轻微爆鸣与大量氢气泡！温度升至 ${this.state.temperature.toFixed(1)}°C。`,
      isExothermic: true,
      heatDelta: heatDelta,
      gasType: 'H2',
      gasRate: 1.0,
      specialEffect: 'sodium_burn',
    };
  }

  private updatepH(): void {
    const volL = Math.max(0.01, this.state.volume / 1000);
    const molesH = this.getIon('H+');
    const molesOH = this.getIon('OH-');

    if (molesH > molesOH + 1e-8) {
      const netH = molesH - molesOH;
      const concH = netH / volL;
      this.state.pH = Math.max(0.1, Math.min(6.99, -Math.log10(concH)));
    } else if (molesOH > molesH + 1e-8) {
      const netOH = molesOH - molesH;
      const concOH = netOH / volL;
      const pOH = -Math.log10(concOH);
      this.state.pH = Math.max(7.01, Math.min(13.9, 14 - pOH));
    } else {
      this.state.pH = 7.0;
    }
  }

  private updateLiquidColor(): void {
    const baseColor = new THREE.Color(0xd2f0ff); // Clear water tint
    const volL = this.state.volume / 1000;

    // Check ions
    const cuConc = this.getIon('Cu2+') / volL;
    const fe3Conc = this.getIon('Fe3+') / volL;
    const fe2Conc = this.getIon('Fe2+') / volL;
    const mno4Conc = this.getIon('MnO4-') / volL;

    if (mno4Conc > 0.0001) {
      // Intense permanganate violet
      const violetColor = new THREE.Color(0x8e24aa);
      baseColor.lerp(violetColor, Math.min(0.95, mno4Conc * 40.0));
    }

    if (cuConc > 0.001) {
      // Sky blue
      const blueColor = new THREE.Color(0x00a8ff);
      baseColor.lerp(blueColor, Math.min(0.85, cuConc * 1.5));
    }

    if (fe3Conc > 0.001) {
      // Amber/yellow
      const amberColor = new THREE.Color(0xff9800);
      baseColor.lerp(amberColor, Math.min(0.9, fe3Conc * 2.0));
    }

    if (fe2Conc > 0.001) {
      // Pale green
      const greenColor = new THREE.Color(0x66bb6a);
      baseColor.lerp(greenColor, Math.min(0.8, fe2Conc * 1.8));
    }

    // Check indicators
    if (this.state.indicators.phenolphthalein > 0) {
      if (this.state.pH >= 8.2) {
        // Vibrant fuchsia pink
        const pinkColor = new THREE.Color(0xff1493);
        const intensity = Math.min(1.0, (this.state.pH - 8.2) / 1.5 + 0.3);
        baseColor.lerp(pinkColor, intensity);
      }
    }

    if (this.state.indicators.litmus > 0) {
      if (this.state.pH < 5.0) {
        // Red
        const redColor = new THREE.Color(0xe53935);
        baseColor.lerp(redColor, 0.75);
      } else if (this.state.pH > 8.0) {
        // Blue
        const deepBlue = new THREE.Color(0x1e88e5);
        baseColor.lerp(deepBlue, 0.75);
      } else {
        // Purple
        const purpleColor = new THREE.Color(0x8e24aa);
        baseColor.lerp(purpleColor, 0.65);
      }
    }

    // Cloudy precipitate tint
    if (this.state.precipitates.has('CaCO3') || this.state.precipitates.has('BaSO4')) {
      baseColor.lerp(new THREE.Color(0xf1f5f9), 0.35);
    }

    this.state.liquidColor.copy(baseColor);
  }

  public update(delta: number): void {
    // Natural cooling towards room temp (22.5°C)
    if (this.state.temperature > 22.5) {
      this.state.temperature = Math.max(22.5, this.state.temperature - delta * 0.35);
    }

    // Decay gas rate
    if (this.state.activeGasRate > 0) {
      this.state.activeGasRate = Math.max(0, this.state.activeGasRate - delta * 0.25);
      if (this.state.activeGasRate === 0) {
        this.state.gasType = null;
      }
    }

    // Decay active effects
    for (let i = this.state.activeEffects.length - 1; i >= 0; i--) {
      const eff = this.state.activeEffects[i];
      if (eff.duration !== undefined) {
        eff.duration -= delta;
        if (eff.duration <= 0) {
          this.state.activeEffects.splice(i, 1);
        }
      }
    }
  }
}
