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
        <div class="status-card-title-group">
          <span class="status-live-indicator"></span>
          <span class="status-card-title" id="beaker-title-label">左侧烧杯 · 组分全息分析</span>
        </div>

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

      <!-- Top Solvent & Solution Overview (卡片顶部单独展示溶剂水及总体积) -->
      <div class="status-metrics-row">
        <!-- Total Volume -->
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

        <!-- Solvent H2O (Top Banner Separate Display) -->
        <div class="metric-box">
          <div class="metric-label">溶剂水 (H₂O)</div>
          <div class="metric-value-row">
            <span class="metric-val" id="metric-water">60</span>
            <span class="metric-unit" id="metric-water-sub">mL (3.33 mol)</span>
          </div>
          <div class="metric-badge-tag neutral" id="metric-water-tag">溶剂基质</div>
        </div>

        <!-- Temperature -->
        <div class="metric-box">
          <div class="metric-label">反应温度</div>
          <div class="metric-value-row">
            <span class="metric-val" id="metric-temp">22.5</span>
            <span class="metric-unit">°C</span>
          </div>
          <div class="metric-badge-tag normal" id="metric-temp-badge">室温平衡</div>
        </div>

        <!-- pH -->
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

      <!-- Two-Column Spatial Workspace (左栏全息环形图与图例，右栏成分清单与反应记录独立卡片) -->
      <div class="status-workspace-columns">
        <!-- Left Column: Holographic Donut Chart Card -->
        <div class="workspace-col-left">
          <div class="pie-chart-card glass-card">
            <div class="chart-card-header">
              <div class="chart-card-title-row">
                <span class="chart-badge-tag">100% 归一化</span>
                <span class="chart-card-title">溶质与固相产物</span>
              </div>
              <span class="chart-moles-tag" id="chart-total-moles-tag">0.0 mmol</span>
            </div>
            <div class="chart-subtitle">聚焦离子、难溶沉淀及固相产物（按摩尔比归一化）</div>

            <div class="pie-chart-viewport" id="pie-chart-container">
              <!-- Rendered by SVG dynamically -->
            </div>

            <!-- Mini Legend Breakdown -->
            <div class="pie-chart-legend-container" id="pie-chart-legend">
              <div class="pie-legend-empty">高纯水介质 (H₂O) · 未检测到溶质</div>
            </div>
          </div>
        </div>

        <!-- Right Column: Dual-Deck Detailed Analysis Cards -->
        <div class="workspace-col-right">
          <!-- Upper Deck: Ranked Solutes & Products List (从大到小排列) -->
          <div class="ranked-solutes-card glass-card">
            <div class="ranked-card-header">
              <div class="card-title-group">
                <svg class="apple-sf-icon" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <line x1="3" y1="6" x2="21" y2="6"/>
                  <line x1="3" y1="12" x2="15" y2="12"/>
                  <line x1="3" y1="18" x2="9" y2="18"/>
                </svg>
                <span class="ranked-card-title">成分占比降序清单 (从大到小)</span>
              </div>
              <span class="ranked-count-tag" id="ranked-count-tag">0 种溶质/产物</span>
            </div>

            <div class="ranked-components-scroll" id="ranked-components-container">
              <div class="empty-solute-notice">
                <div class="notice-icon-wrapper">
                  <svg class="apple-sf-icon notice-svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" fill="rgba(100, 210, 255, 0.15)"/>
                    <path d="M8 14c1.5 1 3.5 1 5 0s3.5-1 5 0"/>
                  </svg>
                </div>
                <div class="notice-title">高纯度去离子水体系</div>
                <div class="notice-desc">当前烧杯中仅含溶剂水 (H₂O)，未检测到溶解离子或固相产物。单击“选试剂”加入溶质，或长按拖拽烧杯混合发生反应。</div>
              </div>
            </div>
          </div>

          <!-- Lower Deck: Balanced Chemical Equation & Macro Reaction Log -->
          <div class="reactions-log-card glass-card">
            <div class="reactions-card-header">
              <div class="card-title-group">
                <svg class="apple-sf-icon" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M10 2v7.31L5.5 17.5A2 2 0 0 0 7.2 21h9.6a2 2 0 0 0 1.7-3.5L14 9.31V2"/>
                  <line x1="8.5" y1="2" x2="15.5" y2="2"/>
                </svg>
                <span class="reactions-card-title">化学反应全息记录</span>
              </div>
              <span class="reactions-count-tag" id="reactions-count-tag">实时记录</span>
            </div>

            <div class="reactions-log-list" id="reactions-list">
              <div class="reaction-item empty">
                <div class="eq-hint">在元素周期表中选择元素试剂，或长按拖拽将一个烧杯倒入另一个烧杯混合触发反应</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Hidden fallbacks for legacy compatibility -->
      <div style="display: none;" id="ions-container"></div>
      <div style="display: none;" id="precip-container"></div>
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

    // 5. 100% Pie Chart rendering
    const pieContainer = this.element.querySelector('#pie-chart-container');
    if (pieContainer) {
      pieContainer.innerHTML = this.renderPieChartSvg(comp.components);
    }

    // 5b. Update chart moles tag & pie-chart-legend breakdown
    const totalMmols = comp.components.reduce((sum, c) => sum + c.millimoles, 0);
    const molesTag = this.element.querySelector('#chart-total-moles-tag');
    if (molesTag) {
      molesTag.textContent = totalMmols > 0 ? `${totalMmols.toFixed(1)} mmol` : '纯水介质';
    }

    const pieLegend = this.element.querySelector('#pie-chart-legend');
    if (pieLegend) {
      if (comp.components.length === 0) {
        pieLegend.innerHTML = `<div class="pie-legend-empty">高纯水介质 (H₂O) · 未检测到溶质</div>`;
      } else {
        pieLegend.innerHTML = comp.components
          .map(
            (c) => `
          <div class="pie-legend-chip">
            <span class="legend-chip-dot" style="background: ${c.color}; box-shadow: 0 0 6px ${c.color};"></span>
            <span class="legend-chip-formula">${c.formula}</span>
            <span class="legend-chip-pct">${c.percentage.toFixed(1)}%</span>
          </div>
        `
          )
          .join('');
      }
    }

    // 6. Ranked Components from largest to smallest (从大到小排列)
    const rankedContainer = this.element.querySelector('#ranked-components-container');
    const countTag = this.element.querySelector('#ranked-count-tag');
    if (countTag) {
      countTag.textContent = `${comp.components.length} 种溶质/产物`;
    }

    if (rankedContainer) {
      if (comp.components.length === 0) {
        rankedContainer.innerHTML = `
          <div class="empty-solute-notice">
            <div class="notice-icon-wrapper">
              <svg class="apple-sf-icon notice-svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" fill="rgba(100, 210, 255, 0.15)"/>
                <path d="M8 14c1.5 1 3.5 1 5 0s3.5-1 5 0"/>
              </svg>
            </div>
            <div class="notice-title">高纯度去离子水体系</div>
            <div class="notice-desc">当前烧杯中仅含溶剂水 (H₂O)，未检测到溶解离子或固相产物。单击“选试剂”加入溶质，或长按拖拽烧杯混合发生反应。</div>
          </div>
        `;
      } else {
        rankedContainer.innerHTML = comp.components
          .map((c, index) => {
            const rankNum = index + 1;
            const concStr = c.concentration !== undefined ? `${c.concentration.toFixed(3)} mol/L` : `${c.massGrams.toFixed(3)} g 固相`;
            return `
              <div class="ranked-component-item rank-${rankNum}">
                <div class="comp-rank-badge">#${rankNum}</div>
                <div class="comp-color-dot" style="background: ${c.color}; box-shadow: 0 0 8px ${c.color};"></div>
                <div class="comp-info-col">
                  <div class="comp-title-row">
                    <span class="comp-formula">${c.formula}</span>
                    <span class="comp-name">${c.name}</span>
                    <span class="comp-category-tag ${c.category}">${c.categoryLabel}</span>
                  </div>
                  <div class="comp-subtext-row">
                    <span class="comp-data-chip">物质的量: ${(c.millimoles).toFixed(2)} mmol</span>
                    <span class="comp-data-chip">${concStr}</span>
                  </div>
                </div>
                <div class="comp-pct-col">
                  <span class="comp-pct-text">${c.percentage.toFixed(1)}%</span>
                  <div class="comp-mini-bar">
                    <div class="comp-mini-fill" style="width: ${c.percentage}%; background: ${c.color};"></div>
                  </div>
                </div>
              </div>
            `;
          })
          .join('');
      }
    }

    // 7. Reactions Log
    const reactionsList = this.element.querySelector('#reactions-list');
    const rxCountTag = this.element.querySelector('#reactions-count-tag');
    if (rxCountTag) {
      rxCountTag.textContent = state.recentReactions.length > 0 ? `${state.recentReactions.length} 条记录` : '实时记录';
    }

    if (reactionsList) {
      if (state.recentReactions.length === 0) {
        reactionsList.innerHTML = `
          <div class="reaction-item empty">
            <div class="eq-hint">在元素周期表中选择元素试剂，或长按拖拽将一个烧杯倒入另一个烧杯混合触发反应</div>
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
            <div class="rx-phenomenon"><strong>宏观现象：</strong>${r.phenomenon}</div>
            <div class="rx-desc"><strong>原理简述：</strong>${r.description}</div>
          </div>
        `
          )
          .join('');
      }
    }
  }

  private renderPieChartSvg(components: SoluteComponent[]): string {
    const cx = 110;
    const cy = 110;
    const R = 84;
    const r = 50;

    if (components.length === 0) {
      return `
        <svg class="pie-chart-svg" viewBox="0 0 220 220">
          <circle cx="${cx}" cy="${cy}" r="67" fill="none" stroke="rgba(100, 210, 255, 0.22)" stroke-width="28" />
          <text x="${cx}" y="103" text-anchor="middle" class="chart-center-sub">高纯水相</text>
          <text x="${cx}" y="125" text-anchor="middle" class="chart-center-pct">100%</text>
          <text x="${cx}" y="141" text-anchor="middle" class="chart-center-total">去离子水 (H₂O)</text>
        </svg>
      `;
    }

    const totalMmols = components.reduce((sum, c) => sum + c.millimoles, 0);

    if (components.length === 1) {
      const c = components[0];
      return `
        <svg class="pie-chart-svg" viewBox="0 0 220 220">
          <circle cx="${cx}" cy="${cy}" r="67" fill="none" stroke="${c.color}" stroke-width="32" opacity="0.95" />
          <text x="${cx}" y="102" text-anchor="middle" class="chart-center-sub">${c.formula} ${c.name}</text>
          <text x="${cx}" y="125" text-anchor="middle" class="chart-center-pct">100%</text>
          <text x="${cx}" y="141" text-anchor="middle" class="chart-center-total">${c.millimoles.toFixed(1)} mmol</text>
        </svg>
      `;
    }

    let startAngle = -Math.PI / 2;
    const paths: string[] = [];

    for (let i = 0; i < components.length; i++) {
      const c = components[i];
      const sliceAngle = (c.percentage / 100) * Math.PI * 2;
      if (sliceAngle < 0.002) continue;

      // Scale gap proportionally with sliceAngle to strictly avoid inverted negative arc sweeps for small percentages
      const gap = Math.min(0.018, sliceAngle * 0.12);
      const a0 = startAngle + gap;
      const a1 = startAngle + sliceAngle - gap;
      startAngle += sliceAngle;

      const x0_outer = cx + R * Math.cos(a0);
      const y0_outer = cy + R * Math.sin(a0);
      const x1_outer = cx + R * Math.cos(a1);
      const y1_outer = cy + R * Math.sin(a1);

      const x1_inner = cx + r * Math.cos(a1);
      const y1_inner = cy + r * Math.sin(a1);
      const x0_inner = cx + r * Math.cos(a0);
      const y0_inner = cy + r * Math.sin(a0);

      const largeArc = (a1 - a0) > Math.PI ? 1 : 0;

      const d = `
        M ${x0_outer.toFixed(2)} ${y0_outer.toFixed(2)}
        A ${R} ${R} 0 ${largeArc} 1 ${x1_outer.toFixed(2)} ${y1_outer.toFixed(2)}
        L ${x1_inner.toFixed(2)} ${y1_inner.toFixed(2)}
        A ${r} ${r} 0 ${largeArc} 0 ${x0_inner.toFixed(2)} ${y0_inner.toFixed(2)}
        Z
      `;

      paths.push(`
        <path d="${d}" fill="${c.color}" opacity="0.92" class="pie-slice" data-comp-id="${c.id}">
          <title>${c.name} (${c.formula}): ${c.percentage.toFixed(1)}% · ${c.millimoles.toFixed(2)} mmol</title>
        </path>
      `);
    }

    return `
      <svg class="pie-chart-svg" viewBox="0 0 220 220">
        <g class="pie-slices-group">
          ${paths.join('')}
        </g>
        <text x="${cx}" y="102" text-anchor="middle" class="chart-center-sub">溶质与产物</text>
        <text x="${cx}" y="125" text-anchor="middle" class="chart-center-pct">100%</text>
        <text x="${cx}" y="141" text-anchor="middle" class="chart-center-total">共 ${totalMmols.toFixed(1)} mmol</text>
      </svg>
    `;
  }

  public destroy(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
  }
}
