import type { ChemistryEngine, ChemistryState, SoluteComponent, ChemistryComposition } from '../../chemistry/ChemistryEngine';

export interface ExperimentStatusCardCallbacks {
  onStir?: () => void;
  onOpenPeriodicTable?: () => void;
  onSelectBeaker?: (beakerId: 'left' | 'right') => void;
}

export class ExperimentStatusCard {
  public element: HTMLElement;
  private unsubscribe: (() => void) | null = null;
  private engineLeft: ChemistryEngine;
  private engineRight?: ChemistryEngine;
  public currentActiveBeakerId: 'left' | 'right' = 'left';

  private callbacks: ExperimentStatusCardCallbacks;

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
    this.element.className = 'vision-status-card hud-interactive';

    this.element.innerHTML = `
      <div class="status-card-header">
        <div class="beaker-selector-tabs" role="tablist" aria-label="烧杯切换">
          <button class="beaker-tab-btn active" id="btn-select-beaker-left" role="tab" title="查看左侧烧杯">
            <svg class="apple-sf-icon" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <path d="M5 4h14a1 1 0 0 1 1 1v14a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V5a1 1 0 0 1 1-1z"/>
              <line x1="4" y1="4" x2="2" y2="4"/>
              <line x1="7" y1="13" x2="17" y2="13"/>
            </svg>
            <span>左侧烧杯</span>
          </button>
          <button class="beaker-tab-btn" id="btn-select-beaker-right" role="tab" title="查看右侧烧杯">
            <svg class="apple-sf-icon" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <path d="M10 2v7.31L5.5 17.5A2 2 0 0 0 7.2 21h9.6a2 2 0 0 0 1.7-3.5L14 9.31V2"/>
              <line x1="8.5" y1="2" x2="15.5" y2="2"/>
              <line x1="7.5" y1="16" x2="16.5" y2="16"/>
            </svg>
            <span>右侧烧杯</span>
          </button>
        </div>

        <div class="status-quick-actions">
          <button class="status-action-btn" id="btn-to-periodic" title="选择试剂注入当前烧杯">
            <svg class="apple-sf-icon" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="3" width="7" height="7" rx="1.5"/>
              <rect x="14" y="3" width="7" height="7" rx="1.5"/>
              <rect x="14" y="14" width="7" height="7" rx="1.5"/>
              <rect x="3" y="14" width="7" height="7" rx="1.5"/>
            </svg>
            <span>选试剂</span>
          </button>
          <button class="status-action-btn" id="btn-add-water" title="加入去离子水 50mL">
            <svg class="apple-sf-icon" viewBox="0 0 24 24" width="12" height="12" fill="currentColor">
              <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/>
            </svg>
            <span>加水 50mL</span>
          </button>
          <button class="status-action-btn" id="btn-stir" title="搅拌混匀">
            <svg class="apple-sf-icon" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.19"/>
            </svg>
            <span>搅拌</span>
          </button>
          <button class="status-action-btn" id="btn-clean-beaker" title="清空并重置为纯水">
            <svg class="apple-sf-icon" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
              <path d="M3 3v5h5"/>
            </svg>
            <span>清空</span>
          </button>
        </div>
      </div>

      <!-- Top Solution Overview (体积、温度、pH三大教学核心指标) -->
      <div class="status-metrics-row">
        <!-- 1. Total Volume -->
        <div class="metric-box">
          <div class="metric-label">溶液总体积</div>
          <div class="metric-value-row">
            <span class="metric-val" id="metric-volume">60</span>
            <span class="metric-unit">mL / 250</span>
          </div>
          <div class="metric-progress-bar">
            <div class="metric-progress-fill" id="metric-vol-fill" style="width: 24%;"></div>
          </div>
        </div>

        <!-- 2. Temperature -->
        <div class="metric-box">
          <div class="metric-label">反应温度</div>
          <div class="metric-value-row">
            <span class="metric-val" id="metric-temp">22.5</span>
            <span class="metric-unit">°C</span>
          </div>
          <div class="metric-badge-tag normal" id="metric-temp-badge">室温平衡</div>
        </div>

        <!-- 3. pH -->
        <div class="metric-box">
          <div class="metric-label">酸碱度 (pH)</div>
          <div class="metric-value-row">
            <span class="metric-val" id="metric-ph">7.00</span>
            <span class="metric-badge-tag neutral" id="metric-ph-badge">中性</span>
          </div>
          <div class="ph-gradient-bar">
            <div class="ph-marker" id="ph-marker" style="left: 50%;"></div>
          </div>
        </div>
      </div>

      <!-- Two-Column Teaching Layout (左侧：实验现象与化学反应；右侧：烧杯主要成分与浓度) -->
      <div class="status-workspace-columns">
        <!-- Left Column: 实验现象与化学反应 -->
        <div class="workspace-col-left">
          <div class="reactions-log-card glass-card">
            <div class="card-section-header">
              <div class="card-title-group">
                <svg class="apple-sf-icon" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M10 2v7.31L5.5 17.5A2 2 0 0 0 7.2 21h9.6a2 2 0 0 0 1.7-3.5L14 9.31V2"/>
                  <line x1="8.5" y1="2" x2="15.5" y2="2"/>
                </svg>
                <span class="card-section-title">实验现象与化学反应</span>
              </div>
              <span class="reactions-count-tag" id="reactions-count-tag">实时记录</span>
            </div>

            <div class="reactions-log-list" id="reactions-list">
              <div class="reaction-item empty">
                <div class="notice-icon-wrapper">
                  <svg class="apple-sf-icon notice-svg" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="12" r="9"/>
                    <line x1="12" y1="8" x2="12" y2="12"/>
                    <line x1="12" y1="16" x2="12.01" y2="16"/>
                  </svg>
                </div>
                <div class="empty-notice-title">当前体系稳定 · 尚未发生反应</div>
                <div class="empty-notice-desc">在右上角点击“选试剂”注入酸、碱或金属，或长按拖拽烧杯倾倒混合触发化学反应</div>
              </div>
            </div>
          </div>
        </div>

        <!-- Right Column: 烧杯主要成分与浓度 -->
        <div class="workspace-col-right">
          <div class="ranked-solutes-card glass-card">
            <div class="card-section-header">
              <div class="card-title-group">
                <svg class="apple-sf-icon" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <line x1="8" y1="6" x2="21" y2="6"/>
                  <line x1="8" y1="12" x2="21" y2="12"/>
                  <line x1="8" y1="18" x2="21" y2="18"/>
                  <line x1="3" y1="6" x2="3.01" y2="6"/>
                  <line x1="3" y1="12" x2="3.01" y2="12"/>
                  <line x1="3" y1="18" x2="3.01" y2="18"/>
                </svg>
                <span class="card-section-title">烧杯主要成分与浓度</span>
              </div>
              <span class="ranked-count-tag" id="ranked-count-tag">纯水相</span>
            </div>

            <div class="ranked-components-scroll" id="ranked-components-container">
              <div class="empty-solute-notice">
                <div class="notice-icon-wrapper">
                  <svg class="apple-sf-icon notice-svg" viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
                    <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/>
                  </svg>
                </div>
                <div class="notice-title">高纯去离子水体系</div>
                <div class="notice-desc">溶剂为水 (H₂O)，未检测到溶解离子或固相沉淀。单击右上角“选试剂”加入溶质。</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Hidden fallbacks for legacy/test compatibility -->
      <div style="display: none;">
        <span id="beaker-title-label">左侧烧杯 · 组分全息分析</span>
        <span id="metric-water"></span>
        <span id="metric-water-sub"></span>
        <span id="chart-total-moles-tag"></span>
        <div id="pie-chart-container"></div>
        <div id="pie-chart-legend"></div>
        <div id="ions-container"></div>
        <div id="precip-container"></div>
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
  }

  public updateState(state: ChemistryState): void {
    const engine = this.getCurrentEngine();
    const comp: ChemistryComposition = engine.getCompositionAnalysis();

    // 1. Total Volume
    const volEl = this.element.querySelector('#metric-volume');
    const volFill = this.element.querySelector('#metric-vol-fill') as HTMLElement;
    if (volEl && volFill) {
      volEl.textContent = Math.round(comp.totalVolumeMl).toString();
      const pct = Math.min(100, (comp.totalVolumeMl / 250) * 100);
      volFill.style.width = `${pct}%`;
      volFill.style.background = 'rgba(255, 255, 255, 0.7)';
    }

    // 2. Solvent Water (H2O) separately in Top Banner
    const waterEl = this.element.querySelector('#metric-water');
    const waterSub = this.element.querySelector('#metric-water-sub');
    if (waterEl && waterSub) {
      waterEl.textContent = Math.round(comp.waterVolumeMl).toString();
      waterSub.textContent = `mL (${comp.waterMoles.toFixed(2)} mol)`;
    }

    // 3. Temperature
    const tempEl = this.element.querySelector('#metric-temp');
    const tempBadge = this.element.querySelector('#metric-temp-badge');
    if (tempEl && tempBadge) {
      tempEl.textContent = comp.temperature.toFixed(1);
      if (comp.temperature > 50) {
        tempBadge.textContent = '剧烈放热';
        tempBadge.className = 'metric-badge-tag danger';
      } else if (comp.temperature > 30) {
        tempBadge.textContent = '温和放热';
        tempBadge.className = 'metric-badge-tag warning';
      } else {
        tempBadge.textContent = '室温平衡';
        tempBadge.className = 'metric-badge-tag normal';
      }
    }

    // 4. pH
    const phEl = this.element.querySelector('#metric-ph');
    const phBadge = this.element.querySelector('#metric-ph-badge');
    const phMarker = this.element.querySelector('#ph-marker') as HTMLElement;
    if (phEl && phBadge && phMarker) {
      phEl.textContent = comp.pH.toFixed(2);
      const phRatio = Math.max(0, Math.min(1, comp.pH / 14));
      phMarker.style.left = `${phRatio * 100}%`;

      if (comp.pH < 2.0) {
        phBadge.textContent = '强酸性';
        phBadge.className = 'metric-badge-tag acid-strong';
      } else if (comp.pH < 6.0) {
        phBadge.textContent = '弱酸性';
        phBadge.className = 'metric-badge-tag acid-weak';
      } else if (comp.pH <= 8.0) {
        phBadge.textContent = '中性溶剂';
        phBadge.className = 'metric-badge-tag neutral';
      } else if (comp.pH <= 12.0) {
        phBadge.textContent = '弱碱性';
        phBadge.className = 'metric-badge-tag base-weak';
      } else {
        phBadge.textContent = '强碱性';
        phBadge.className = 'metric-badge-tag base-strong';
      }
    }

    // 4. Substances & Solutes List (烧杯主要化学成分与浓度)
    const rankedContainer = this.element.querySelector('#ranked-components-container');
    const countTag = this.element.querySelector('#ranked-count-tag');
    if (countTag) {
      countTag.textContent = comp.components.length > 0 ? `${comp.components.length} 种主要成分` : '纯水相';
    }

    if (rankedContainer) {
      if (comp.components.length === 0) {
        rankedContainer.innerHTML = `
          <div class="empty-solute-notice">
            <div class="notice-icon-wrapper">
              <svg class="apple-sf-icon notice-svg" viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
                <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/>
              </svg>
            </div>
            <div class="notice-title">高纯去离子水体系</div>
            <div class="notice-desc">溶剂为水 (H₂O)，未检测到溶解离子或固相沉淀。单击右上角“选试剂”加入溶质。</div>
          </div>
        `;
      } else {
        rankedContainer.innerHTML = comp.components
          .map((c) => {
            let concDisplay = '';
            if (c.category === 'precipitate') {
              concDisplay = `${c.massGrams.toFixed(3)} g 沉淀`;
            } else if (c.category === 'solid') {
              concDisplay = `${c.massGrams.toFixed(3)} g 固态`;
            } else if (c.concentration !== undefined) {
              concDisplay = `${c.concentration.toFixed(3)} mol/L`;
            } else {
              concDisplay = `${c.massGrams.toFixed(3)} g`;
            }

            return `
              <div class="teaching-solute-row">
                <div class="solute-badge-col">
                  <span class="solute-dot" style="background: ${c.color}; box-shadow: 0 0 6px ${c.color};"></span>
                  <span class="solute-formula">${c.formula}</span>
                  <span class="solute-name">${c.name}</span>
                  <span class="comp-category-tag ${c.category}">${c.categoryLabel}</span>
                </div>
                <div class="solute-metrics-col">
                  <span class="solute-conc-val">${concDisplay}</span>
                  <span class="solute-moles-val">${c.millimoles.toFixed(2)} mmol</span>
                </div>
              </div>
            `;
          })
          .join('');
      }
    }

    // 5. Reactions Log (实验现象与化学反应)
    const reactionsList = this.element.querySelector('#reactions-list');
    const rxCountTag = this.element.querySelector('#reactions-count-tag');
    if (rxCountTag) {
      rxCountTag.textContent = state.recentReactions.length > 0 ? `${state.recentReactions.length} 个反应` : '实时记录';
    }

    if (reactionsList) {
      if (state.recentReactions.length === 0) {
        reactionsList.innerHTML = `
          <div class="reaction-item empty">
            <div class="notice-icon-wrapper">
              <svg class="apple-sf-icon notice-svg" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="9"/>
                <line x1="12" y1="8" x2="12" y2="12"/>
                <line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
            </div>
            <div class="empty-notice-title">当前体系稳定 · 尚未发生反应</div>
            <div class="empty-notice-desc">在右上角点击“选试剂”注入酸、碱或金属，或长按拖拽烧杯倾倒混合触发化学反应</div>
          </div>
        `;
      } else {
        reactionsList.innerHTML = state.recentReactions
          .map(
            (r, index) => `
          <div class="reaction-item ${index === 0 ? 'latest' : ''}">
            <div class="rx-header">
              <span class="rx-title">${r.title}</span>
              <span class="rx-type-tag">${r.type}</span>
            </div>
            <div class="rx-equation">${r.equation}</div>
            <div class="rx-phenomenon"><strong>实验现象：</strong>${r.phenomenon}</div>
            <div class="rx-desc"><strong>反应原理：</strong>${r.description}</div>
          </div>
        `
          )
          .join('');
      }
    }
  }

  public destroy(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
  }
}
