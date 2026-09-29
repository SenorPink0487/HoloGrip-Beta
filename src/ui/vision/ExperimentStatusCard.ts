import type { ChemistryEngine, ChemistryState, SoluteComponent, ChemistryComposition } from '../../chemistry/ChemistryEngine';
import { bindMixtureQuery, type MixtureQueryBinding } from './mixtureQuery.ts';

export interface ExperimentStatusCardCallbacks {
  onStir?: () => void;
  onOpenPeriodicTable?: () => void;
  onSelectBeaker?: (beakerId: 'left' | 'right') => void;
}

export function formatChemicalFormula(formula: string): string {
  if (!formula) return '';
  const subscriptMap: Record<string, string> = {
    '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄',
    '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉',
  };
  return formula.replace(/(?<=[A-Za-z\)])\d+/g, (match) => {
    return match.split('').map((ch) => subscriptMap[ch] || ch).join('');
  });
}

export function getFormulaAvatarClass(formula: string): string {
  const len = formula.length;
  if (len <= 3) return 'formula-sm';
  if (len <= 5) return 'formula-md';
  if (len <= 8) return 'formula-lg formula-wide';
  return 'formula-xl formula-wide';
}

export class ExperimentStatusCard {
  public element: HTMLElement;
  private unsubscribe: (() => void) | null = null;
  private engineLeft: ChemistryEngine;
  private engineRight?: ChemistryEngine;
  public currentActiveBeakerId: 'left' | 'right' = 'left';
  public compositionMode: 'substance' | 'ion' = 'substance';

  private callbacks: ExperimentStatusCardCallbacks;
  private mixtureQuery: MixtureQueryBinding | null = null;

  constructor(
    engine: ChemistryEngine,
    callbackOrOptions?: (() => void) | ExperimentStatusCardCallbacks,
    onOpenPeriodicTable?: () => void
  ) {
    this.engineLeft = engine;

    if (typeof callbackOrOptions === 'function') {
      this.callbacks = {
        onStir: callbackOrOptions,
        onOpenPeriodicTable: onOpenPeriodicTable,
      };
    } else {
      this.callbacks = callbackOrOptions || {};
    }

    this.createUI();
    this.subscribeToEngine(this.engineLeft);
  }

  public setEngines(left: ChemistryEngine, right: ChemistryEngine, activeId: 'left' | 'right' = 'left'): void {
    this.engineLeft = left;
    this.engineRight = right;
    this.selectBeaker(activeId);
  }

  public selectBeaker(beakerId: 'left' | 'right'): void {
    this.currentActiveBeakerId = beakerId;
    const targetEngine = beakerId === 'left' ? this.engineLeft : (this.engineRight || this.engineLeft);
    this.subscribeToEngine(targetEngine);
    this.updateBeakerTabUI();
    this.updateState(targetEngine.state);
  }

  private subscribeToEngine(engine: ChemistryEngine): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    this.unsubscribe = engine.subscribe((state) => {
      this.updateState(state);
    });
  }

  private createUI(): void {
    this.element = document.createElement('div');
    this.element.className = 'vision-status-card apple-redesign hud-interactive';

    this.element.innerHTML = `
      <!-- 1. Clean Top Navigation & Status Bar -->
      <div class="apple-nav-bar">
        <!-- Segmented Picker: 左侧烧杯 / 右侧烧杯 -->
        <div class="apple-segmented-picker" role="tablist" aria-label="烧杯切换">
          <button class="seg-btn active" id="btn-select-beaker-left" role="tab" title="切换左侧烧杯">
            <span>左侧烧杯</span>
          </button>
          <button class="seg-btn" id="btn-select-beaker-right" role="tab" title="切换右侧烧杯">
            <span>右侧烧杯</span>
          </button>
        </div>

        <!-- Quiet Ambient Status Capsule -->
        <div class="apple-status-capsule">
          <span class="capsule-val" id="summary-volume">60 mL</span>
          <span class="capsule-sep">·</span>
          <span class="capsule-val" id="summary-ph">pH 7.00</span>
          <span class="capsule-sep">·</span>
          <span class="capsule-val" id="summary-temp">22.5 °C</span>
        </div>

        <!-- Action Pills -->
        <div class="apple-action-group">
          <button class="apple-pill-btn primary" id="btn-to-periodic" title="注入试剂">
            <svg class="apple-sf-icon" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
            <span>加试剂</span>
          </button>
          <button class="apple-pill-btn" id="btn-add-water" title="加入去离子水 50mL">
            <svg class="apple-sf-icon" viewBox="0 0 24 24" width="11" height="11" fill="currentColor">
              <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/>
            </svg>
            <span>加水</span>
          </button>
          <button class="apple-pill-btn" id="btn-stir" title="搅拌混合">
            <svg class="apple-sf-icon" viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.19"/>
            </svg>
            <span>搅拌</span>
          </button>
          <button class="apple-pill-btn destructive" id="btn-clean-beaker" title="清空烧杯">
            <svg class="apple-sf-icon" viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
              <path d="M3 3v5h5"/>
            </svg>
            <span>清空</span>
          </button>
        </div>
      </div>

      <div class="mixture-ai-row">
        <input class="mixture-ai-input" id="mixture-query" type="text" maxlength="40" enterkeyhint="search" autocomplete="off" placeholder="" aria-label="要分析的物质" />
        <button class="apple-pill-btn" id="btn-mixture-voice" type="button" title="语音输入">
          <svg class="apple-sf-icon" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="9" y="3" width="6" height="11" rx="3"></rect>
            <path d="M5 11a7 7 0 0 0 14 0"></path>
            <line x1="12" y1="18" x2="12" y2="21"></line>
          </svg>
          <span>语音</span>
        </button>
        <button class="apple-pill-btn primary" id="btn-mixture-analyze" type="button" title="拆成化合物并倒入当前烧杯">
          <span>分析</span>
        </button>
      </div>
      <p class="mixture-ai-status" id="mixture-ai-status"></p>

      <!-- 2. Minimalist Breakdown Strip (全景成分占比条) -->
      <div class="apple-breakdown-bar-wrap">
        <div class="comp-view-mode-bar">
          <span class="comp-mode-title" id="comp-mode-title">体系成分全息分析 · 化学物质</span>
          <div class="apple-mini-segmented" role="tablist" aria-label="展示视角">
            <button class="mini-seg-btn active" id="btn-mode-substance" type="button" title="显示具体化学物质与生成物(分子/气体/沉淀/盐)">
              <span>化学物质</span>
            </button>
            <button class="mini-seg-btn" id="btn-mode-ions" type="button" title="显示溶液中游离阴阳离子">
              <span>离子分布</span>
            </button>
          </div>
        </div>
        <div class="apple-meter-bar" id="comp-segmented-bar"></div>
        <div class="apple-legend-chips" id="comp-legend-container"></div>
      </div>

      <!-- 3. Solutes Showcase Grid (大字号、通透、呼吸感) -->
      <div class="apple-solutes-grid" id="solutes-cards-container"></div>

      <!-- Hidden fallbacks for legacy/test compatibility -->
      <div style="display: none;">
        <span id="beaker-title-label">左侧烧杯 · 组分全息分析</span>
        <span id="metric-volume"></span>
        <div id="metric-vol-fill"></div>
        <span id="metric-water"></span>
        <span id="metric-water-sub"></span>
        <span id="metric-temp"></span>
        <div id="metric-temp-badge"></div>
        <span id="metric-ph"></span>
        <div id="metric-ph-badge"></div>
        <div id="ph-marker"></div>
        <div id="reactions-list"></div>
        <span id="reactions-count-tag"></span>
        <div id="ranked-components-container"></div>
        <span id="ranked-count-tag"></span>
        <span id="chart-total-moles-tag"></span>
        <div id="pie-chart-container"></div>
        <div id="pie-chart-legend"></div>
        <div id="ions-container"></div>
        <div id="precip-container"></div>
        <span id="summary-solute-count"></span>
      </div>
    `;

    this.bindEvents();
  }

  private updateBeakerTabUI(): void {
    const leftBtn = this.element.querySelector('#btn-select-beaker-left');
    const rightBtn = this.element.querySelector('#btn-select-beaker-right');
    const titleLabel = this.element.querySelector('#beaker-title-label');

    if (this.currentActiveBeakerId === 'left') {
      leftBtn?.classList.add('active');
      rightBtn?.classList.remove('active');
      if (titleLabel) titleLabel.textContent = '左侧烧杯 · 组分全息分析';
    } else {
      leftBtn?.classList.remove('active');
      rightBtn?.classList.add('active');
      if (titleLabel) titleLabel.textContent = '右侧烧杯 · 组分全息分析';
    }
  }

  private getCurrentEngine(): ChemistryEngine {
    if (this.currentActiveBeakerId === 'right' && this.engineRight) {
      return this.engineRight;
    }
    return this.engineLeft;
  }

  private bindEvents(): void {
    this.element.querySelector('#btn-select-beaker-left')?.addEventListener('click', () => {
      this.selectBeaker('left');
      this.callbacks.onSelectBeaker?.('left');
    });

    this.element.querySelector('#btn-select-beaker-right')?.addEventListener('click', () => {
      this.selectBeaker('right');
      this.callbacks.onSelectBeaker?.('right');
    });

    this.element.querySelector('#btn-to-periodic')?.addEventListener('click', () => {
      this.callbacks.onOpenPeriodicTable?.();
    });

    this.element.querySelector('#btn-add-water')?.addEventListener('click', () => {
      this.getCurrentEngine().addReagent('H2O', 50);
    });

    this.element.querySelector('#btn-stir')?.addEventListener('click', () => {
      this.callbacks.onStir?.();
    });

    this.element.querySelector('#btn-clean-beaker')?.addEventListener('click', () => {
      this.getCurrentEngine().reset();
    });

    this.element.querySelector('#btn-mode-substance')?.addEventListener('click', () => {
      this.setCompositionMode('substance');
    });

    this.element.querySelector('#btn-mode-ions')?.addEventListener('click', () => {
      this.setCompositionMode('ion');
    });

    this.mixtureQuery = bindMixtureQuery(this.element, {
      input: '#mixture-query',
      voice: '#btn-mixture-voice',
      analyze: '#btn-mixture-analyze',
      status: '#mixture-ai-status',
    }, {
      getEngine: () => this.getCurrentEngine(),
    });
  }

  public setCompositionMode(mode: 'substance' | 'ion'): void {
    this.compositionMode = mode;
    const btnSubstance = this.element.querySelector('#btn-mode-substance');
    const btnIons = this.element.querySelector('#btn-mode-ions');
    const title = this.element.querySelector('#comp-mode-title');
    if (mode === 'substance') {
      btnSubstance?.classList.add('active');
      btnIons?.classList.remove('active');
      if (title) title.textContent = '体系成分全息分析 · 化学物质';
    } else {
      btnSubstance?.classList.remove('active');
      btnIons?.classList.add('active');
      if (title) title.textContent = '体系成分全息分析 · 游离离子';
    }
    this.updateState(this.getCurrentEngine().state);
  }

  public updateState(state: ChemistryState): void {
    const engine = this.getCurrentEngine();
    const comp: ChemistryComposition = engine.getCompositionAnalysis(this.compositionMode);

    // 1. 烧杯环境状态胶囊栏：体积、pH 值、温度
    const volSummary = this.element.querySelector('#summary-volume');
    if (volSummary) {
      volSummary.textContent = `${Math.round(comp.totalVolumeMl)} mL`;
    }

    const phSummary = this.element.querySelector('#summary-ph');
    if (phSummary) {
      phSummary.textContent = `pH ${comp.pH.toFixed(2)}`;
    }

    const tempSummary = this.element.querySelector('#summary-temp');
    if (tempSummary) {
      tempSummary.textContent = `${comp.temperature.toFixed(1)} °C`;
    }

    // 2. 极简成分细分进度条
    const compBar = this.element.querySelector('#comp-segmented-bar');
    const compLegend = this.element.querySelector('#comp-legend-container');

    if (comp.components.length === 0) {
      if (compBar) {
        compBar.innerHTML = `<div class="bar-seg" style="width: 100%; background: rgba(100, 210, 255, 0.4);"></div>`;
      }
      if (compLegend) {
        compLegend.innerHTML = `
          <div class="legend-chip">
            <span class="chip-dot" style="background: #64d2ff;"></span>
            <span class="chip-name">去离子水 H₂O</span>
            <span class="chip-pct">100%</span>
          </div>
        `;
      }
    } else {
      if (compBar) {
        compBar.innerHTML = comp.components
          .map(
            (c) => `<div class="bar-seg" style="width: ${Math.max(2, c.percentage)}%; background: ${c.color};" title="${c.name} ${c.percentage.toFixed(1)}%"></div>`
          )
          .join('');
      }
      if (compLegend) {
        compLegend.innerHTML = comp.components
          .map(
            (c) => `
          <div class="legend-chip">
            <span class="chip-dot" style="background: ${c.color};"></span>
            <span class="chip-name">${formatChemicalFormula(c.formula)} ${c.name}</span>
            <span class="chip-pct">${c.percentage.toFixed(1)}%</span>
          </div>
        `
          )
          .join('');
      }
    }

    // 3. 溶质组分卡片列表
    const cardsContainer = this.element.querySelector('#solutes-cards-container');
    if (cardsContainer) {
      if (comp.components.length === 0) {
        cardsContainer.innerHTML = `
          <div class="apple-empty-state">
            <div class="empty-icon-bubble">
              <svg class="apple-sf-icon" viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="#64d2ff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/>
              </svg>
            </div>
            <div class="empty-title">纯水相体系</div>
            <div class="empty-desc">当前烧杯仅有去离子水溶剂，未检测到溶解溶质</div>
            <button class="apple-pill-btn primary large-cta" id="btn-empty-select-reagent">
              <svg class="apple-sf-icon" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
              <span>注入试剂</span>
            </button>
          </div>
        `;

        cardsContainer.querySelector('#btn-empty-select-reagent')?.addEventListener('click', () => {
          this.callbacks.onOpenPeriodicTable?.();
        });
      } else {
        const maxConc = Math.max(1.0, ...comp.components.map((c) => c.concentration || 0));

        cardsContainer.innerHTML = comp.components
          .map((c) => {
            const isPrecipitate = c.category === 'precipitate';
            const isSolid = c.category === 'solid';
            const isGas = c.category === 'gas';
            const isCompound = c.category === 'compound';

            let categoryLabel = c.categoryLabel || '可溶离子';
            if (!c.categoryLabel) {
              if (isGas) categoryLabel = '气体生成物';
              else if (isCompound) categoryLabel = '成分';
              else if (isPrecipitate) categoryLabel = '沉淀';
              else if (isSolid) categoryLabel = '固态单质';
              else if (c.formula.includes('⁺') || c.formula.includes('+')) categoryLabel = '阳离子';
              else if (c.formula.includes('⁻') || c.formula.includes('-')) categoryLabel = '阴离子';
            }

            let heroVal = '';
            let heroUnit = '';
            let gaugeWidth = 0;

            if (isGas) {
              const gasVolMl = c.moles * 22400;
              heroVal = gasVolMl >= 1000 ? (gasVolMl / 1000).toFixed(2) : Math.round(gasVolMl).toString();
              heroUnit = gasVolMl >= 1000 ? 'L 气体' : 'mL 气体';
              gaugeWidth = Math.min(100, Math.max(8, (c.moles / 0.03) * 100));
            } else if (isPrecipitate || isSolid) {
              heroVal = c.massGrams < 0.01 ? (c.massGrams * 1000).toFixed(1) : c.massGrams.toFixed(2);
              heroUnit = c.massGrams < 0.01 ? 'mg' : 'g';
              gaugeWidth = Math.min(100, Math.max(8, (c.massGrams / 3.0) * 100));
            } else {
              const conc = c.concentration ?? 0;
              heroVal = conc.toFixed(3);
              heroUnit = 'mol/L';
              gaugeWidth = Math.min(100, Math.max(8, (conc / maxConc) * 100));
            }

            const massDisplay = c.massGrams < 0.01 
              ? `${(c.massGrams * 1000).toFixed(1)} mg` 
              : `${c.massGrams.toFixed(2)} g`;

            const fmtFormula = formatChemicalFormula(c.formula);
            const formulaClass = getFormulaAvatarClass(fmtFormula);
            const statMassLabel = isPrecipitate ? '沉淀质量' : isGas ? '气体质量' : '质量';

            return `
              <div class="apple-solute-card" style="--tint: ${c.color}">
                <!-- Card Top: Identity & Share -->
                <div class="card-identity-row">
                  <div class="ion-avatar ${formulaClass}" style="color: ${c.color}; background: ${c.color}1c; border-color: ${c.color}40;" title="${fmtFormula}">
                    ${fmtFormula}
                  </div>
                  <div class="ion-info">
                    <span class="ion-name" title="${c.name}">${c.name}</span>
                    <span class="ion-category">${categoryLabel}</span>
                  </div>
                  <div class="ion-share-pill" style="color: ${c.color}; background: ${c.color}15;">
                    ${c.percentage.toFixed(1)}%
                  </div>
                </div>

                <!-- Card Hero: Big Bold Concentration & Smooth Gauge -->
                <div class="card-hero-block">
                  <div class="hero-metric-line">
                    <span class="hero-num">${heroVal}</span>
                    <span class="hero-unit">${heroUnit}</span>
                  </div>
                  <div class="hero-bar-track">
                    <div class="hero-bar-fill" style="width: ${gaugeWidth}%; background: ${c.color}; box-shadow: 0 0 10px ${c.color}66;"></div>
                  </div>
                </div>

                <!-- Card Bottom: Clean Secondary Stat Line -->
                <div class="card-stat-line">
                  <div class="stat-col">
                    <span class="stat-lbl">物质的量</span>
                    <span class="stat-num">${c.millimoles.toFixed(2)} mmol</span>
                  </div>
                  <div class="stat-col">
                    <span class="stat-lbl">${statMassLabel}</span>
                    <span class="stat-num">${massDisplay}</span>
                  </div>
                </div>
              </div>
            `;
          })
          .join('');
      }
    }

    // 4. 更新向后兼容字段以适配自动化测试与旧逻辑
    this.updateFallbackDOM(comp, state);
  }

  private updateFallbackDOM(comp: ChemistryComposition, state: ChemistryState): void {
    const volEl = this.element.querySelector('#metric-volume');
    const volFill = this.element.querySelector('#metric-vol-fill') as HTMLElement;
    if (volEl && volFill) {
      volEl.textContent = Math.round(comp.totalVolumeMl).toString();
      const pct = Math.min(100, (comp.totalVolumeMl / 250) * 100);
      volFill.style.width = `${pct}%`;
    }

    const waterEl = this.element.querySelector('#metric-water');
    const waterSub = this.element.querySelector('#metric-water-sub');
    if (waterEl && waterSub) {
      waterEl.textContent = Math.round(comp.waterVolumeMl).toString();
      waterSub.textContent = `mL (${comp.waterMoles.toFixed(2)} mol)`;
    }

    const tempEl = this.element.querySelector('#metric-temp');
    if (tempEl) tempEl.textContent = comp.temperature.toFixed(1);

    const phEl = this.element.querySelector('#metric-ph');
    const phMarker = this.element.querySelector('#ph-marker') as HTMLElement;
    if (phEl) phEl.textContent = comp.pH.toFixed(2);
    if (phMarker) {
      const phRatio = Math.max(0, Math.min(1, comp.pH / 14));
      phMarker.style.left = `${phRatio * 100}%`;
    }

    const countTag = this.element.querySelector('#ranked-count-tag');
    if (countTag) {
      countTag.textContent = comp.components.length > 0 ? `${comp.components.length} 种主要成分` : '纯水相';
    }

    const rxCountTag = this.element.querySelector('#reactions-count-tag');
    if (rxCountTag) {
      rxCountTag.textContent = state.recentReactions.length > 0 ? `${state.recentReactions.length} 个反应` : '实时记录';
    }
  }

  public destroy(): void {
    this.mixtureQuery?.destroy();
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
  }
}
