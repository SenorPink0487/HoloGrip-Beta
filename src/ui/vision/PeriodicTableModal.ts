import { ChemistryEngine, type ChemicalReagent } from '../../chemistry/ChemistryEngine.ts';
import { bindMixtureQuery, type MixtureQueryBinding } from './mixtureQuery.ts';

export interface PeriodicElement {
  number: number;
  symbol: string;
  name: string;
  enName: string;
  mass: number;
  period: number;
  group: number;
  category:
    | 'alkali-metal'
    | 'alkaline-earth'
    | 'transition-metal'
    | 'post-transition'
    | 'metalloid'
    | 'reactive-nonmetal'
    | 'noble-gas'
    | 'lanthanide'
    | 'actinide';
  electronConfig: string;
  oxidationStates: string;
  reagentIds: string[];
}

export class PeriodicTableModal {
  public element: HTMLElement;

  public static readonly ELEMENTS: PeriodicElement[] = [
    // Period 1
    { number: 1, symbol: 'H', name: '氢', enName: 'Hydrogen', mass: 1.008, period: 1, group: 1, category: 'reactive-nonmetal', electronConfig: '1s¹', oxidationStates: '+1, -1', reagentIds: ['HCl', 'H2SO4', 'H2O2', 'H2O'] },
    { number: 2, symbol: 'He', name: '氦', enName: 'Helium', mass: 4.0026, period: 1, group: 18, category: 'noble-gas', electronConfig: '1s²', oxidationStates: '0', reagentIds: [] },

    // Period 2
    { number: 3, symbol: 'Li', name: '锂', enName: 'Lithium', mass: 6.94, period: 2, group: 1, category: 'alkali-metal', electronConfig: '[He] 2s¹', oxidationStates: '+1', reagentIds: [] },
    { number: 4, symbol: 'Be', name: '铍', enName: 'Beryllium', mass: 9.0122, period: 2, group: 2, category: 'alkaline-earth', electronConfig: '[He] 2s²', oxidationStates: '+2', reagentIds: [] },
    { number: 5, symbol: 'B', name: '硼', enName: 'Boron', mass: 10.81, period: 2, group: 13, category: 'metalloid', electronConfig: '[He] 2s² 2p¹', oxidationStates: '+3', reagentIds: [] },
    { number: 6, symbol: 'C', name: '碳', enName: 'Carbon', mass: 12.011, period: 2, group: 14, category: 'reactive-nonmetal', electronConfig: '[He] 2s² 2p²', oxidationStates: '+4, +2, -4', reagentIds: ['Na2CO3', 'phenolphthalein'] },
    { number: 7, symbol: 'N', name: '氮', enName: 'Nitrogen', mass: 14.007, period: 2, group: 15, category: 'reactive-nonmetal', electronConfig: '[He] 2s² 2p³', oxidationStates: '+5, +3, -3', reagentIds: ['HNO3', 'AgNO3'] },
    { number: 8, symbol: 'O', name: '氧', enName: 'Oxygen', mass: 15.999, period: 2, group: 16, category: 'reactive-nonmetal', electronConfig: '[He] 2s² 2p⁴', oxidationStates: '-2, -1', reagentIds: ['H2O', 'H2O2', 'KMnO4'] },
    { number: 9, symbol: 'F', name: '氟', enName: 'Fluorine', mass: 18.998, period: 2, group: 17, category: 'reactive-nonmetal', electronConfig: '[He] 2s² 2p⁵', oxidationStates: '-1', reagentIds: [] },
    { number: 10, symbol: 'Ne', name: '氖', enName: 'Neon', mass: 20.180, period: 2, group: 18, category: 'noble-gas', electronConfig: '[He] 2s² 2p⁶', oxidationStates: '0', reagentIds: [] },

    // Period 3
    { number: 11, symbol: 'Na', name: '钠', enName: 'Sodium', mass: 22.990, period: 3, group: 1, category: 'alkali-metal', electronConfig: '[Ne] 3s¹', oxidationStates: '+1', reagentIds: ['Na', 'NaOH', 'Na2CO3', 'NaCl'] },
    { number: 12, symbol: 'Mg', name: '镁', enName: 'Magnesium', mass: 24.305, period: 3, group: 2, category: 'alkaline-earth', electronConfig: '[Ne] 3s²', oxidationStates: '+2', reagentIds: ['Mg'] },
    { number: 13, symbol: 'Al', name: '铝', enName: 'Aluminium', mass: 26.982, period: 3, group: 13, category: 'post-transition', electronConfig: '[Ne] 3s² 3p¹', oxidationStates: '+3', reagentIds: ['Al', 'AlCl3'] },
    { number: 14, symbol: 'Si', name: '硅', enName: 'Silicon', mass: 28.085, period: 3, group: 14, category: 'metalloid', electronConfig: '[Ne] 3s² 3p²', oxidationStates: '+4, -4', reagentIds: [] },
    { number: 15, symbol: 'P', name: '磷', enName: 'Phosphorus', mass: 30.974, period: 3, group: 15, category: 'reactive-nonmetal', electronConfig: '[Ne] 3s² 3p³', oxidationStates: '+5, +3, -3', reagentIds: [] },
    { number: 16, symbol: 'S', name: '硫', enName: 'Sulfur', mass: 32.06, period: 3, group: 16, category: 'reactive-nonmetal', electronConfig: '[Ne] 3s² 3p⁴', oxidationStates: '+6, +4, -2', reagentIds: ['H2SO4', 'CuSO4', 'FeSO4'] },
    { number: 17, symbol: 'Cl', name: '氯', enName: 'Chlorine', mass: 35.45, period: 3, group: 17, category: 'reactive-nonmetal', electronConfig: '[Ne] 3s² 3p⁵', oxidationStates: '+7, +5, +3, +1, -1', reagentIds: ['HCl', 'NaCl', 'BaCl2', 'FeCl3'] },
    { number: 18, symbol: 'Ar', name: '氩', enName: 'Argon', mass: 39.948, period: 3, group: 18, category: 'noble-gas', electronConfig: '[Ne] 3s² 3p⁶', oxidationStates: '0', reagentIds: [] },

    // Period 4
    { number: 19, symbol: 'K', name: '钾', enName: 'Potassium', mass: 39.098, period: 4, group: 1, category: 'alkali-metal', electronConfig: '[Ar] 4s¹', oxidationStates: '+1', reagentIds: ['KOH', 'KMnO4'] },
    { number: 20, symbol: 'Ca', name: '钙', enName: 'Calcium', mass: 40.078, period: 4, group: 2, category: 'alkaline-earth', electronConfig: '[Ar] 4s²', oxidationStates: '+2', reagentIds: ['Ca(OH)2', 'CaCl2'] },
    { number: 25, symbol: 'Mn', name: '锰', enName: 'Manganese', mass: 54.938, period: 4, group: 7, category: 'transition-metal', electronConfig: '[Ar] 3d⁵ 4s²', oxidationStates: '+7, +4, +2', reagentIds: ['KMnO4'] },
    { number: 26, symbol: 'Fe', name: '铁', enName: 'Iron', mass: 55.845, period: 4, group: 8, category: 'transition-metal', electronConfig: '[Ar] 3d⁶ 4s²', oxidationStates: '+3, +2', reagentIds: ['Fe', 'FeCl3', 'FeSO4'] },
    { number: 29, symbol: 'Cu', name: '铜', enName: 'Copper', mass: 63.546, period: 4, group: 11, category: 'transition-metal', electronConfig: '[Ar] 3d¹⁰ 4s¹', oxidationStates: '+2, +1', reagentIds: ['Cu', 'CuSO4'] },
    { number: 30, symbol: 'Zn', name: '锌', enName: 'Zinc', mass: 65.38, period: 4, group: 12, category: 'transition-metal', electronConfig: '[Ar] 3d¹⁰ 4s²', oxidationStates: '+2', reagentIds: ['Zn'] },
    { number: 35, symbol: 'Br', name: '溴', enName: 'Bromine', mass: 79.904, period: 4, group: 17, category: 'reactive-nonmetal', electronConfig: '[Ar] 3d¹⁰ 4s² 4p⁵', oxidationStates: '+5, +1, -1', reagentIds: ['Br2'] },

    // 第 5 与第 6 周期（常用实验室元素垂直对其所属化学族）
    { number: 47, symbol: 'Ag', name: '银', enName: 'Silver', mass: 107.87, period: 5, group: 11, category: 'transition-metal', electronConfig: '[Kr] 4d¹⁰ 5s¹', oxidationStates: '+1', reagentIds: ['AgNO3'] },
    { number: 53, symbol: 'I', name: '碘', enName: 'Iodine', mass: 126.90, period: 5, group: 17, category: 'reactive-nonmetal', electronConfig: '[Kr] 4d¹⁰ 5s² 5p⁵', oxidationStates: '+7, +5, -1', reagentIds: ['KI', 'I2'] },
    { number: 56, symbol: 'Ba', name: '钡', enName: 'Barium', mass: 137.33, period: 6, group: 2, category: 'alkaline-earth', electronConfig: '[Xe] 6s²', oxidationStates: '+2', reagentIds: ['BaCl2'] },
  ];

  /**
   * 元素周期表布局映射：将常用化学元素精准映射至 18 列 x 5 行的周期表网格位置。
   * 严格保持化学族（列）与周期（行）的对应关系：
   * - 第 1 列：碱金属（H、Li、Na、K）
   * - 第 2 列：碱土金属（Be、Mg、Ca、Ba）
   * - 第 7 列：锰（Mn）
   * - 第 8 列：铁（Fe）
   * - 第 11 列：铜族金属（Cu、Ag）
   * - 第 12 列：锌（Zn）
   * - 第 13 列：硼与铝（B、Al）
   * - 第 14 列：碳族元素（C、Si）
   * - 第 15 列：氮族元素（N、P）
   * - 第 16 列：氧族元素（O、S）
   * - 第 17 列：卤族元素（F、Cl、Br、I）
   * - 第 18 列：稀有气体（He、Ne、Ar）
   */
  public static readonly COMMON_ELEMENT_LAYOUT: Record<number, { row: number; col: number }> = {
    // Period 1
    1: { row: 1, col: 1 },    // H
    2: { row: 1, col: 18 },   // He

    // Period 2
    3: { row: 2, col: 1 },    // Li
    4: { row: 2, col: 2 },    // Be
    5: { row: 2, col: 13 },   // B
    6: { row: 2, col: 14 },   // C
    7: { row: 2, col: 15 },   // N
    8: { row: 2, col: 16 },   // O
    9: { row: 2, col: 17 },   // F
    10: { row: 2, col: 18 },  // Ne

    // Period 3
    11: { row: 3, col: 1 },   // Na
    12: { row: 3, col: 2 },   // Mg
    13: { row: 3, col: 13 },  // Al
    14: { row: 3, col: 14 },  // Si
    15: { row: 3, col: 15 },  // P
    16: { row: 3, col: 16 },  // S
    17: { row: 3, col: 17 },  // Cl
    18: { row: 3, col: 18 },  // Ar

    // Period 4
    19: { row: 4, col: 1 },   // K
    20: { row: 4, col: 2 },   // Ca
    25: { row: 4, col: 7 },   // Mn
    26: { row: 4, col: 8 },   // Fe
    29: { row: 4, col: 11 },  // Cu
    30: { row: 4, col: 12 },  // Zn
    35: { row: 4, col: 17 },  // Br

    // 第 5 与第 6 周期（常用实验室元素垂直对其所属化学族）
    56: { row: 5, col: 2 },   // 钡 Ba（碱土金属：Be -> Mg -> Ca -> Ba）
    47: { row: 5, col: 11 },  // 银 Ag（铜族金属：Cu -> Ag）
    53: { row: 5, col: 17 },  // I  (Halogens: F -> Cl -> Br -> I)
  };

  private engineLeft: ChemistryEngine;
  private engineRight?: ChemistryEngine;
  public activeBeakerId: 'left' | 'right' = 'left';
  private onBackToDisciplines: () => void;
  private onViewBeaker?: () => void;
  private onSelectBeaker?: (beakerId: 'left' | 'right') => void;
  private selectedElement: PeriodicElement;
  private toastTimeout: number | null = null;
  private mixtureQuery: MixtureQueryBinding | null = null;

  constructor(
    engine: ChemistryEngine,
    onBackToDisciplines: () => void,
    onViewBeaker?: () => void,
    onSelectBeaker?: (beakerId: 'left' | 'right') => void
  ) {
    this.engineLeft = engine;
    this.onBackToDisciplines = onBackToDisciplines;
    this.onViewBeaker = onViewBeaker;
    this.onSelectBeaker = onSelectBeaker;
    this.selectedElement = PeriodicTableModal.ELEMENTS.find((e) => e.symbol === 'Na') || PeriodicTableModal.ELEMENTS[0];
    this.createUI();
  }

  public setEngines(left: ChemistryEngine, right: ChemistryEngine, activeId: 'left' | 'right' = 'left'): void {
    this.engineLeft = left;
    this.engineRight = right;
    this.setActiveBeaker(activeId);
  }

  public getActiveEngine(): ChemistryEngine {
    if (this.activeBeakerId === 'right' && this.engineRight) {
      return this.engineRight;
    }
    return this.engineLeft;
  }

  public setActiveBeaker(id: 'left' | 'right'): void {
    this.activeBeakerId = id;
    this.updateBeakerSwitcherUI();
  }

  private updateBeakerSwitcherUI(): void {
    const leftBtn = this.element.querySelector('#btn-periodic-beaker-left');
    const rightBtn = this.element.querySelector('#btn-periodic-beaker-right');
    const label = this.element.querySelector('#periodic-beaker-label');

    if (this.activeBeakerId === 'left') {
      leftBtn?.classList.add('active');
      rightBtn?.classList.remove('active');
      if (label) label.textContent = '当前目标：左侧烧杯 (默认)';
    } else {
      leftBtn?.classList.remove('active');
      rightBtn?.classList.add('active');
      if (label) label.textContent = '当前目标：右侧烧杯';
    }
  }

  private createUI(): void {
    this.element = document.createElement('div');
    this.element.className = 'vision-periodic-container';

    this.element.innerHTML = `
      <!-- Primary Periodic Table Content (Recedes and soft-blurs when popover is open) -->
      <div class="periodic-primary-content" id="periodic-primary-content">
        <!-- Apple Vision Pro Spatial Toolbar -->
        <div class="periodic-top-bar">
          <!-- Target Beaker Segmented Control -->
          <div class="periodic-beaker-tabs" role="tablist" aria-label="目标烧杯选择">
            <button class="periodic-tab-btn active" id="btn-periodic-beaker-left" role="tab" title="为左侧烧杯添加试剂">
              <span class="tab-indicator-dot"></span>
              <svg class="apple-sf-icon" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <path d="M5 4h14a1 1 0 0 1 1 1v14a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V5a1 1 0 0 1 1-1z"/>
                <line x1="4" y1="4" x2="2" y2="4"/>
                <line x1="7" y1="13" x2="17" y2="13"/>
              </svg>
              <span>左侧烧杯</span>
            </button>
            <button class="periodic-tab-btn" id="btn-periodic-beaker-right" role="tab" title="为右侧烧杯添加试剂">
              <span class="tab-indicator-dot"></span>
              <svg class="apple-sf-icon" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <path d="M10 2v7.31L5.5 17.5A2 2 0 0 0 7.2 21h9.6a2 2 0 0 0 1.7-3.5L14 9.31V2"/>
                <line x1="8.5" y1="2" x2="15.5" y2="2"/>
                <line x1="7.5" y1="16" x2="16.5" y2="16"/>
              </svg>
              <span>右侧烧杯</span>
            </button>
          </div>

          <!-- Trailing Action: View Beaker Analysis -->
          <button class="periodic-analysis-action-btn" id="btn-periodic-view-analysis" title="查看烧杯组分全息分析">
            <span>烧杯成分分析</span>
            <svg class="apple-sf-icon action-arrow" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="9 18 15 12 9 6"/>
            </svg>
          </button>

          <span id="periodic-beaker-label" style="display: none;">当前目标：左侧烧杯 (默认)</span>
        </div>

        <div class="mixture-ai-row periodic-mixture-row">
          <input class="mixture-ai-input" id="periodic-mixture-query" type="text" maxlength="40" enterkeyhint="search" autocomplete="off" placeholder="" aria-label="要分析的物质" />
          <button class="apple-pill-btn" id="btn-periodic-mixture-voice" type="button" title="语音输入">
            <svg class="apple-sf-icon" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="9" y="3" width="6" height="11" rx="3"></rect>
              <path d="M5 11a7 7 0 0 0 14 0"></path>
              <line x1="12" y1="18" x2="12" y2="21"></line>
            </svg>
            <span>语音</span>
          </button>
          <button class="apple-pill-btn primary" id="btn-periodic-mixture-analyze" type="button" title="拆成化合物并倒入当前烧杯">
            <span>分析</span>
          </button>
        </div>
        <p class="mixture-ai-status" id="periodic-mixture-status"></p>

        <!-- Common Reagents Periodic Grid -->
        <div class="periodic-grid" id="periodic-elements-grid"></div>
      </div>

      <!-- Apple Contextual Popover Card -->
      <div class="element-popover-overlay hidden" id="element-popover-overlay">
        <div class="element-popover-card" id="element-popover-card"></div>
      </div>

      <!-- Apple Minimalist Toast -->
      <div class="vision-hud-toast hidden" id="vision-hud-toast">
        <span class="toast-text" id="toast-text"></span>
      </div>
    `;

    this.renderGrid();
    this.bindEvents();
  }

  private renderGrid(): void {
    const mainGrid = this.element.querySelector('#periodic-elements-grid') as HTMLElement;
    if (!mainGrid) return;

    mainGrid.innerHTML = '';

    // 渲染 28 种常用元素，严格对应其族与周期位置
    for (const [numStr, pos] of Object.entries(PeriodicTableModal.COMMON_ELEMENT_LAYOUT)) {
      const num = parseInt(numStr, 10);
      const elem = PeriodicTableModal.ELEMENTS.find((e) => e.number === num);
      if (!elem) continue;

      const card = document.createElement('div');
      card.className = `element-cell cat-${elem.category} ${this.selectedElement?.number === elem.number ? 'selected' : ''}`;
      card.dataset.num = elem.number.toString();
      card.style.gridRow = pos.row.toString();
      card.style.gridColumn = pos.col.toString();

      card.innerHTML = `
        <span class="elem-num">${elem.number}</span>
        <span class="elem-sym">${elem.symbol}</span>
        <span class="elem-name">${elem.name}</span>
      `;

      card.addEventListener('click', (e) => {
        e.stopPropagation();
        this.openElementPopover(elem);
      });

      mainGrid.appendChild(card);
    }
  }

  public selectElement(elem: PeriodicElement): void {
    this.openElementPopover(elem);
  }

  public static getReagentsForElement(elem: PeriodicElement): ChemicalReagent[] {
    const list = elem.reagentIds.map((id) => ChemistryEngine.REAGENTS[id]).filter(Boolean);
    if (list.length > 0) {
      return list;
    }

    // 若未配置特定化合物试剂，则自动生成标准单质试剂
    const id = elem.symbol;
    if (!ChemistryEngine.REAGENTS[id]) {
      const isMetal = [
        'alkali-metal',
        'alkaline-earth',
        'transition-metal',
        'post-transition',
        'lanthanide',
        'actinide',
      ].includes(elem.category);
      const isGas = elem.category === 'noble-gas';

      ChemistryEngine.REAGENTS[id] = {
        id,
        name: isMetal ? `${elem.name}片 / 单质` : `${elem.name}单质试剂`,
        formula: elem.symbol,
        category: isMetal ? 'metal' : 'salt',
        state: isMetal ? 'solid' : 'liquid',
        color: isMetal ? 0xb0bec5 : 0xe0f7fa,
        description: `${elem.name}元素（${elem.enName}）高纯度实验室单质试样。`,
        defaultAmount: isMetal ? 1 : 20,
        unit: isMetal ? '片' : (isGas ? 'mL' : 'mL'),
      };
    }
    return [ChemistryEngine.REAGENTS[id]];
  }

  public openElementPopover(elem: PeriodicElement): void {
    this.selectedElement = elem;
    const overlay = this.element.querySelector('#element-popover-overlay') as HTMLElement;
    const card = this.element.querySelector('#element-popover-card') as HTMLElement;
    if (!overlay || !card) return;

    // 高亮当前选中的元素单元格
    this.element.querySelectorAll('.element-cell').forEach((c) => {
      const isSelected = (c as HTMLElement).dataset.num === elem.number.toString();
      c.classList.toggle('selected', isSelected);
    });

    const reagents = PeriodicTableModal.getReagentsForElement(elem);

    card.innerHTML = `
      <div class="popover-header">
        <div class="popover-title-row">
          <span class="popover-sym">${elem.symbol}</span>
          <div class="popover-title-text">
            <div class="popover-names">
              <span class="popover-cn">${elem.name}</span>
              <span class="popover-en">${elem.enName}</span>
            </div>
            <div class="popover-meta">
              <span>No. ${elem.number}</span>
              <span>·</span>
              <span class="popover-meta-cat">${this.getCategoryLabel(elem.category)}</span>
            </div>
          </div>
        </div>
        <button class="popover-close-btn" id="btn-popover-close" title="关闭 (ESC)">
          <svg class="apple-sf-icon" viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>

      <div class="popover-reagents-list">
        ${reagents
          .map((r) => {
            const isSolid = r.state === 'solid';
            const stateLabel = isSolid ? '固态单质' : '水溶液';
            return `
            <button class="popover-reagent-row" data-reagent-id="${r.id}">
              <div class="reagent-row-info">
                <div class="reagent-row-primary">
                  <span class="reagent-formula">${r.formula}</span>
                  <span class="reagent-state-badge ${r.state}">${stateLabel}</span>
                </div>
                <div class="reagent-row-name">${r.name}</div>
              </div>
              <span class="reagent-row-action">
                <span class="action-text">${isSolid ? '投入' : '注入'} ${r.defaultAmount}${r.unit}</span>
              </span>
            </button>
          `;
          })
          .join('')}
      </div>
    `;

    // 绑定试剂选择按钮事件
    reagents.forEach((r) => {
      const btn = card.querySelector(`.popover-reagent-row[data-reagent-id="${r.id}"]`);
      btn?.addEventListener('click', (e) => {
        e.stopPropagation();
        this.getActiveEngine().addReagent(r.id, r.defaultAmount);

        btn.classList.add('row-added');
        const actionSpan = btn.querySelector('.reagent-row-action');
        const origHTML = actionSpan?.innerHTML || '';
        if (actionSpan) {
          actionSpan.innerHTML = `
            <svg class="apple-sf-icon" viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
            <span>已加入</span>
          `;
        }

        const beakerName = this.activeBeakerId === 'left' ? '左侧烧杯' : '右侧烧杯';
        this.showToast(`已加入 ${r.formula} (${r.name}) 至【${beakerName}】`);

        setTimeout(() => {
          btn.classList.remove('row-added');
          if (actionSpan) actionSpan.innerHTML = origHTML;
        }, 800);
      });
    });

    // 关闭按钮事件
    card.querySelector('#btn-popover-close')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.closeElementPopover();
    });

    // 阻止卡片内部点击事件冒泡导致弹窗关闭
    card.addEventListener('click', (e) => {
      e.stopPropagation();
    });

    this.element.classList.add('popover-open');
    const frame = this.element.closest('.vision-window-frame') || document.querySelector('.vision-window-frame');
    frame?.classList.add('has-modal-popover');
    overlay.classList.remove('hidden');
  }

  public closeElementPopover(): void {
    this.element.classList.remove('popover-open');
    const frame = this.element.closest('.vision-window-frame') || document.querySelector('.vision-window-frame');
    frame?.classList.remove('has-modal-popover');
    const overlay = this.element.querySelector('#element-popover-overlay');
    if (overlay) {
      overlay.classList.add('hidden');
    }
    this.element.querySelectorAll('.element-cell').forEach((c) => {
      c.classList.remove('selected');
    });
  }

  public isPopoverOpen(): boolean {
    return this.element.classList.contains('popover-open');
  }

  public showToast(message: string): void {
    const toast = this.element.querySelector('#vision-hud-toast') as HTMLElement;
    const textEl = this.element.querySelector('#toast-text') as HTMLElement;
    if (!toast || !textEl) return;

    textEl.textContent = message;
    toast.classList.remove('hidden');

    if (this.toastTimeout) {
      clearTimeout(this.toastTimeout);
    }

    const setTimer = typeof window !== 'undefined' ? window.setTimeout.bind(window) : setTimeout;
    this.toastTimeout = setTimer(() => {
      toast.classList.add('hidden');
    }, 2200) as unknown as number;
  }

  private getCategoryLabel(cat: PeriodicElement['category']): string {
    switch (cat) {
      case 'alkali-metal':
        return '碱金属';
      case 'alkaline-earth':
        return '碱土金属';
      case 'transition-metal':
        return '过渡金属';
      case 'post-transition':
        return '后过渡金属';
      case 'metalloid':
        return '类金属';
      case 'reactive-nonmetal':
        return '非金属';
      case 'noble-gas':
        return '稀有气体';
      case 'lanthanide':
        return '镧系';
      case 'actinide':
        return '锕系';
      default:
        return '元素';
    }
  }

  private bindEvents(): void {
    // 顶部导航栏中的烧杯切换标签
    this.element.querySelector('#btn-periodic-beaker-left')?.addEventListener('click', () => {
      this.setActiveBeaker('left');
      this.onSelectBeaker?.('left');
    });

    this.element.querySelector('#btn-periodic-beaker-right')?.addEventListener('click', () => {
      this.setActiveBeaker('right');
      this.onSelectBeaker?.('right');
    });

    // 查看成分分析详情按钮
    this.element.querySelector('#btn-periodic-view-analysis')?.addEventListener('click', () => {
      this.onViewBeaker?.();
    });

    this.mixtureQuery = bindMixtureQuery(this.element, {
      input: '#periodic-mixture-query',
      voice: '#btn-periodic-mixture-voice',
      analyze: '#btn-periodic-mixture-analyze',
      status: '#periodic-mixture-status',
    }, {
      getEngine: () => this.getActiveEngine(),
      onPoured: () => this.onViewBeaker?.(),
    });

    // 点击半透明遮罩背景关闭弹层
    const overlay = this.element.querySelector('#element-popover-overlay');
    overlay?.addEventListener('click', (e) => {
      if (e.target === overlay) {
        this.closeElementPopover();
      }
    });

    // 全局 ESC 键关闭弹层
    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', (e) => {
        if (e.code === 'Escape' && this.isPopoverOpen()) {
          e.stopPropagation();
          this.closeElementPopover();
        }
      });
    }
  }
}

