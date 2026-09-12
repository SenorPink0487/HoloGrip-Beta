import type { ChemistryEngine, ChemistryState } from '../../chemistry/ChemistryEngine';

export class ExperimentStatusCard {
  public element: HTMLElement;
  private unsubscribe: (() => void) | null = null;

  constructor(
    private engine: ChemistryEngine,
    private onStir?: () => void
  ) {
    this.createUI();
    this.subscribeToEngine();
  }

  private createUI(): void {
    this.element = document.createElement('div');
    this.element.className = 'vision-status-card hud-interactive';

    this.element.innerHTML = `
      <div class="status-card-header">
        <div class="status-card-title-group">
          <span class="status-live-indicator"></span>
          <span class="status-card-title">烧杯微观实时监控</span>
        </div>
        <div class="status-quick-actions">
          <button class="status-action-btn" id="btn-add-water" title="注入 50mL 去离子水">
            <span class="action-glyph">+</span>
            <span>加水 50mL</span>
          </button>
          <button class="status-action-btn" id="btn-stir" title="玻璃棒均匀搅拌">
            <span class="action-glyph">↺</span>
            <span>搅拌</span>
          </button>
          <button class="status-action-btn btn-danger" id="btn-clean-beaker" title="清空并洗净烧杯">
            <span class="action-glyph">✕</span>
            <span>清空</span>
          </button>
        </div>
      </div>

      <!-- Metrics Row -->
      <div class="status-metrics-row">
        <!-- Volume metric -->
        <div class="metric-box">
          <div class="metric-label">溶液容积</div>
          <div class="metric-value-row">
            <span class="metric-val" id="metric-volume">60</span>
            <span class="metric-unit">mL / 250</span>
          </div>
          <div class="metric-progress-bar">
            <div class="metric-progress-fill" id="metric-vol-fill" style="width: 24%;"></div>
          </div>
        </div>

        <!-- Temperature metric -->
        <div class="metric-box">
          <div class="metric-label">反应温度</div>
          <div class="metric-value-row">
            <span class="metric-val" id="metric-temp">22.5</span>
            <span class="metric-unit">°C</span>
          </div>
          <div class="metric-badge-tag" id="metric-temp-badge">室温平衡</div>
        </div>

        <!-- pH metric -->
        <div class="metric-box">
          <div class="metric-label">酸碱度 (pH)</div>
          <div class="metric-value-row">
            <span class="metric-val" id="metric-ph">7.00</span>
            <span class="metric-badge-tag" id="metric-ph-badge">中性</span>
          </div>
          <div class="ph-gradient-bar">
            <div class="ph-marker" id="ph-marker" style="left: 50%;"></div>
          </div>
        </div>
      </div>

      <!-- Microscopic Ions Section -->
      <div class="status-section">
        <div class="section-title">
          <span>微观解离离子群 (Ions in Solution)</span>
        </div>
        <div class="ions-chips-container" id="ions-container">
          <span class="ion-chip neutral">H₂O</span>
        </div>
      </div>

      <!-- Precipitates & Solids Section -->
      <div class="status-section" id="section-precipitates">
        <div class="section-title">
          <span>沉淀与固相产物 (Precipitates & Solids)</span>
        </div>
        <div class="precip-chips-container" id="precip-container">
          <span class="empty-hint">当前无难溶沉淀析出</span>
        </div>
      </div>

      <!-- Balanced Chemical Equations Section -->
      <div class="status-section reaction-section">
        <div class="section-title">
          <span>平衡化学反应式与机理解析 (Reaction Logs)</span>
        </div>
        <div class="reactions-log-list" id="reactions-list">
          <div class="reaction-item empty">
            <div class="eq-hint">在元素周期表中选择元素试剂，注入桌上烧杯开始化学实验</div>
          </div>
        </div>
      </div>
    `;

    this.bindEvents();
  }

  private bindEvents(): void {
    this.element.querySelector('#btn-add-water')?.addEventListener('click', () => {
      this.engine.addReagent('H2O', 50);
    });

    this.element.querySelector('#btn-stir')?.addEventListener('click', () => {
      this.onStir?.();
    });

    this.element.querySelector('#btn-clean-beaker')?.addEventListener('click', () => {
      this.engine.reset();
    });
  }

  private subscribeToEngine(): void {
    this.unsubscribe = this.engine.subscribe((state) => {
      this.updateState(state);
    });
  }

  public updateState(state: ChemistryState): void {
    // 1. Volume
    const volEl = this.element.querySelector('#metric-volume');
    const volFill = this.element.querySelector('#metric-vol-fill') as HTMLElement;
    if (volEl && volFill) {
      volEl.textContent = Math.round(state.volume).toString();
      const pct = Math.min(100, (state.volume / state.maxVolume) * 100);
      volFill.style.width = `${pct}%`;
      volFill.style.background = pct > 90 ? 'linear-gradient(90deg, #ff9f0a, #ff453a)' : 'linear-gradient(90deg, #0a84ff, #5ac8fa)';
    }

    // 2. Temperature
    const tempEl = this.element.querySelector('#metric-temp');
    const tempBadge = this.element.querySelector('#metric-temp-badge');
    if (tempEl && tempBadge) {
      tempEl.textContent = state.temperature.toFixed(1);
      if (state.temperature > 50) {
        tempBadge.textContent = '剧烈放热';
        tempBadge.className = 'metric-badge-tag danger';
      } else if (state.temperature > 30) {
        tempBadge.textContent = '温和放热';
        tempBadge.className = 'metric-badge-tag warning';
      } else {
        tempBadge.textContent = '常温稳定';
        tempBadge.className = 'metric-badge-tag normal';
      }
    }

    // 3. pH
    const phEl = this.element.querySelector('#metric-ph');
    const phBadge = this.element.querySelector('#metric-ph-badge');
    const phMarker = this.element.querySelector('#ph-marker') as HTMLElement;
    if (phEl && phBadge && phMarker) {
      phEl.textContent = state.pH.toFixed(2);
      const phRatio = Math.max(0, Math.min(1, state.pH / 14));
      phMarker.style.left = `${phRatio * 100}%`;

      if (state.pH < 2.0) {
        phBadge.textContent = '强酸性';
        phBadge.className = 'metric-badge-tag acid-strong';
      } else if (state.pH < 6.0) {
        phBadge.textContent = '弱酸性';
        phBadge.className = 'metric-badge-tag acid-weak';
      } else if (state.pH <= 8.0) {
        phBadge.textContent = '中性溶剂';
        phBadge.className = 'metric-badge-tag neutral';
      } else if (state.pH <= 12.0) {
        phBadge.textContent = '弱碱性';
        phBadge.className = 'metric-badge-tag base-weak';
      } else {
        phBadge.textContent = '强碱性';
        phBadge.className = 'metric-badge-tag base-strong';
      }
    }

    // 4. Ions
    const ionsContainer = this.element.querySelector('#ions-container');
    if (ionsContainer) {
      const activeIons: Array<{ name: string; moles: number }> = [];
      for (const [name, moles] of state.ions) {
        if (moles > 1e-6) {
          activeIons.push({ name, moles });
        }
      }

      if (activeIons.length === 0) {
        ionsContainer.innerHTML = '<span class="ion-chip neutral">纯水分子 (H₂O)</span>';
      } else {
        ionsContainer.innerHTML = activeIons
          .map((ion) => {
            const formatted = this.formatIonFormula(ion.name);
            const conc = (ion.moles / (state.volume / 1000)).toFixed(3);
            return `<span class="ion-chip" title="物质的量浓度: ${conc} mol/L">${formatted} <small>${conc}M</small></span>`;
          })
          .join('');
      }
    }

    // 5. Precipitates & Solids
    const precipContainer = this.element.querySelector('#precip-container');
    if (precipContainer) {
      const items: string[] = [];

      // Solid metals (Fe, Mg, Zn, Cu)
      for (const [_, s] of state.solids) {
        if (s.moles > 1e-6) {
          items.push(`
            <div class="precip-chip-item solid-item">
              <span class="precip-badge solid">金属固相</span>
              <span class="precip-formula">${s.formula}</span>
              <span class="precip-name">${s.name}</span>
              <span class="precip-moles">${(s.moles * 1000).toFixed(1)} mmol</span>
            </div>
          `);
        }
      }

      // Precipitates
      for (const [_, p] of state.precipitates) {
        if (p.moles > 1e-6) {
          items.push(`
            <div class="precip-chip-item">
              <span class="precip-badge">沉淀</span>
              <span class="precip-formula">${p.formula}</span>
              <span class="precip-name">${p.name}</span>
              <span class="precip-moles">${(p.moles * 1000).toFixed(1)} mmol</span>
            </div>
          `);
        }
      }

      if (items.length === 0) {
        precipContainer.innerHTML = '<span class="empty-hint">当前无难溶沉淀或金属固相析出</span>';
      } else {
        precipContainer.innerHTML = items.join('');
      }
    }

    // 6. Reactions Log
    const reactionsList = this.element.querySelector('#reactions-list');
    if (reactionsList) {
      if (state.recentReactions.length === 0) {
        reactionsList.innerHTML = `
          <div class="reaction-item empty">
            <div class="eq-hint">在元素周期表中选择元素试剂，注入桌上烧杯开始化学实验</div>
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

  private formatIonFormula(ion: string): string {
    return ion
      .replace('2-', '²⁻')
      .replace('3-', '³⁻')
      .replace('+', '⁺')
      .replace('-', '⁻')
      .replace('2+', '²⁺')
      .replace('3+', '³⁺')
      .replace('SO4_2-', 'SO₄²⁻')
      .replace('CO3_2-', 'CO₃²⁻');
  }

  public destroy(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
  }
}
