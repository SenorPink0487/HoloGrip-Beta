import type { StereometryTelemetryData } from '../../experiments/catalog/math-stereometry/index.ts';
import type { HighSchoolModelType } from '../../scene/math/GeometrySolver.ts';
import type { InteractionMode } from '../../scene/math/StereometryInteractionManager.ts';

export interface StereometryStatusCardCallbacks {
  onModelChange?: (type: HighSchoolModelType) => void;
  onDimensionChange?: (dims: { a?: number; h?: number }) => void;
  onInteractionModeChange?: (mode: InteractionMode) => void;
  onResetView?: (view: 'iso' | 'front' | 'side' | 'top') => void;
  onClearSegments?: () => void;
  onToggleDashedLines?: (show: boolean) => void;
  onToggleCoordinateSystem?: (show: boolean) => void;
  onToggleEmbeddingBox?: (show: boolean) => void;
  onToggleCircumSphere?: (show: boolean) => void;
  onToggleInSphere?: (show: boolean) => void;
  onToggleClipping?: (enabled: boolean) => void;
  onExplodeDistanceChange?: (dist: number) => void;
  onUnfoldProgressChange?: (progress: number) => void;
  onToggleThreeViews?: (show: boolean) => void;
  onToggleMidpoints?: (show: boolean) => void;
  onToggleFaceCenters?: (show: boolean) => void;
  onToggleLabels?: (show: boolean) => void;
  onApplyPreset?: (preset: 'cube-hexagon' | 'cube-skew-60' | 'tetra-orthogonal' | 'corner-box' | 'cone-conic') => void;
}

export class StereometryStatusCard {
  public element: HTMLElement;
  private callbacks: StereometryStatusCardCallbacks;
  private isVisible = false;

  // Cached DOM Elements
  private modelTitleEl: HTMLElement | null = null;
  private modelSubtitleEl: HTMLElement | null = null;
  private eulerEl: HTMLElement | null = null;
  private valDimA: HTMLElement | null = null;
  private sliderDimA: HTMLInputElement | null = null;
  private valDimH: HTMLElement | null = null;
  private sliderDimH: HTMLInputElement | null = null;
  private cutShapeEl: HTMLElement | null = null;
  private cutAreaEl: HTMLElement | null = null;
  private cutDihedralEl: HTMLElement | null = null;
  private cutPickedBadge: HTMLElement | null = null;
  private sphereRadiusEl: HTMLElement | null = null;
  private sphereDiameterEl: HTMLElement | null = null;
  private inRadiusEl: HTMLElement | null = null;
  private linesRelEl: HTMLElement | null = null;
  private linesAngleEl: HTMLElement | null = null;
  private linesDistEl: HTMLElement | null = null;
  private coordsListEl: HTMLElement | null = null;
  private unfoldSlider: HTMLInputElement | null = null;
  private unfoldVal: HTMLElement | null = null;

  // Cache to avoid DOM layout thrashing
  private lastCoordsSignature = '';

  constructor(callbacks: StereometryStatusCardCallbacks = {}) {
    this.callbacks = callbacks;
    this.createUI();
  }

  private createUI(): void {
    this.element = document.createElement('div');
    this.element.className = 'vision-math-status-card hud-interactive';

    this.element.innerHTML = `
      <div class="math-card-container">
        <!-- 1. Apple-Style Header -->
        <div class="math-card-header">
          <div class="math-header-left">
            <span class="math-live-dot"></span>
            <div class="math-title-group">
              <span class="math-card-title" id="math-model-title">正方体</span>
              <span class="math-card-subtitle" id="math-model-subtitle">空间解析基石 · 棱长 a = 0.38</span>
            </div>
          </div>
          <div class="math-header-right">
            <span class="math-euler-badge" id="math-euler-badge">V: 8 · E: 12 · F: 6</span>
          </div>
        </div>

        <!-- 2. Model Quick Selector (6 Clean Vector Diagrams) -->
        <div class="math-models-grid">
          <!-- Cube -->
          <button class="math-model-card active" data-model="cube" title="正方体 / 长方体">
            <div class="model-svg-wrap">
              <svg class="model-diagram-svg" viewBox="0 0 44 44" fill="none" stroke="currentColor">
                <path d="M22 6 L38 15 L22 24 L6 15 Z" fill="currentColor" fill-opacity="0.14" stroke-width="1.8" stroke-linejoin="round"/>
                <path d="M6 15 L22 24 L22 39 L6 30 Z" fill="currentColor" fill-opacity="0.08" stroke-width="1.8" stroke-linejoin="round"/>
                <path d="M38 15 L22 24 L22 39 L38 30 Z" fill="currentColor" fill-opacity="0.2" stroke-width="1.8" stroke-linejoin="round"/>
              </svg>
            </div>
            <span class="model-title">正方体</span>
          </button>

          <!-- Corner Pyramid -->
          <button class="math-model-card" data-model="corner-pyramid" title="墙角三棱锥 (PA ⊥ PB ⊥ PC)">
            <div class="model-svg-wrap">
              <svg class="model-diagram-svg" viewBox="0 0 44 44" fill="none" stroke="currentColor">
                <polygon points="10,34 34,34 22,10" fill="currentColor" fill-opacity="0.12" stroke-width="1.8" stroke-linejoin="round"/>
                <line x1="10" y1="34" x2="10" y2="10" stroke-width="2.2" stroke-linecap="round"/>
                <line x1="10" y1="34" x2="34" y2="34" stroke-width="2.2" stroke-linecap="round"/>
                <line x1="10" y1="34" x2="22" y2="24" stroke-width="2.2" stroke-linecap="round"/>
                <line x1="10" y1="10" x2="34" y2="34" stroke-width="1.4" stroke-dasharray="3 2"/>
                <line x1="10" y1="10" x2="22" y2="24" stroke-width="1.6"/>
                <line x1="22" y1="24" x2="34" y2="34" stroke-width="1.6"/>
              </svg>
            </div>
            <span class="model-title">墙角三棱锥</span>
          </button>

          <!-- Regular Tetrahedron -->
          <button class="math-model-card" data-model="tetrahedron" title="正四面体">
            <div class="model-svg-wrap">
              <svg class="model-diagram-svg" viewBox="0 0 44 44" fill="none" stroke="currentColor">
                <polygon points="22,6 38,36 6,36" fill="currentColor" fill-opacity="0.12" stroke-width="1.8" stroke-linejoin="round"/>
                <line x1="22" y1="6" x2="22" y2="36" stroke-width="1.8" stroke-linecap="round"/>
                <line x1="22" y1="6" x2="25" y2="26" stroke-width="1.4" stroke-dasharray="3 2"/>
                <line x1="6" y1="36" x2="25" y2="26" stroke-width="1.4" stroke-dasharray="3 2"/>
                <line x1="38" y1="36" x2="25" y2="26" stroke-width="1.4" stroke-dasharray="3 2"/>
              </svg>
            </div>
            <span class="model-title">正四面体</span>
          </button>

          <!-- Square Pyramid -->
          <button class="math-model-card" data-model="square-pyramid" title="正四棱锥">
            <div class="model-svg-wrap">
              <svg class="model-diagram-svg" viewBox="0 0 44 44" fill="none" stroke="currentColor">
                <path d="M22 6 L6 30 L26 38 L38 26 Z" fill="currentColor" fill-opacity="0.12" stroke-width="1.8" stroke-linejoin="round"/>
                <line x1="22" y1="6" x2="6" y2="30" stroke-width="1.8"/>
                <line x1="22" y1="6" x2="26" y2="38" stroke-width="1.8"/>
                <line x1="22" y1="6" x2="38" y2="26" stroke-width="1.8"/>
                <line x1="6" y1="30" x2="26" y2="38" stroke-width="1.8"/>
                <line x1="26" y1="38" x2="38" y2="26" stroke-width="1.8"/>
                <line x1="6" y1="30" x2="18" y2="18" stroke-width="1.4" stroke-dasharray="3 2"/>
                <line x1="38" y1="26" x2="18" y2="18" stroke-width="1.4" stroke-dasharray="3 2"/>
                <line x1="22" y1="6" x2="18" y2="18" stroke-width="1.4" stroke-dasharray="3 2"/>
              </svg>
            </div>
            <span class="model-title">正四棱锥</span>
          </button>

          <!-- Triangular Prism -->
          <button class="math-model-card" data-model="triangular-prism" title="直三棱柱">
            <div class="model-svg-wrap">
              <svg class="model-diagram-svg" viewBox="0 0 44 44" fill="none" stroke="currentColor">
                <polygon points="10,8 34,8 22,16" fill="currentColor" fill-opacity="0.16" stroke-width="1.8" stroke-linejoin="round"/>
                <polygon points="10,26 34,26 22,34" fill="currentColor" fill-opacity="0.08" stroke-width="1.8" stroke-linejoin="round"/>
                <line x1="10" y1="8" x2="10" y2="26" stroke-width="1.8"/>
                <line x1="34" y1="8" x2="34" y2="26" stroke-width="1.8"/>
                <line x1="22" y1="16" x2="22" y2="34" stroke-width="1.8"/>
              </svg>
            </div>
            <span class="model-title">正三棱柱</span>
          </button>

          <!-- Cylinder & Cone -->
          <button class="math-model-card" data-model="cylinder-cone" title="圆柱与圆锥">
            <div class="model-svg-wrap">
              <svg class="model-diagram-svg" viewBox="0 0 44 44" fill="none" stroke="currentColor">
                <ellipse cx="22" cy="32" rx="14" ry="5.5" fill="currentColor" fill-opacity="0.12" stroke-width="1.8"/>
                <line x1="8" y1="32" x2="22" y2="8" stroke-width="1.8"/>
                <line x1="36" y1="32" x2="22" y2="8" stroke-width="1.8"/>
                <line x1="8" y1="32" x2="8" y2="20" stroke-width="1.4" stroke-dasharray="3 2"/>
                <line x1="36" y1="32" x2="36" y2="20" stroke-width="1.4" stroke-dasharray="3 2"/>
                <ellipse cx="22" cy="20" rx="14" ry="5" stroke-width="1.4" stroke-dasharray="3 2"/>
              </svg>
            </div>
            <span class="model-title">圆柱圆锥</span>
          </button>
        </div>

        <!-- 3. Primary Action Buttons (Large Apple Pills - Direct & Intuitive) -->
        <div class="math-actions-row primary-tools">
          <button class="math-tool-btn active" id="btn-tool-orbit">自由旋转</button>
          <button class="math-tool-btn" id="btn-tool-line">连接两点</button>
          <button class="math-tool-btn" id="btn-tool-cut">三点做剖切面</button>
          <button class="math-action-pill" id="btn-preset-hexagon">经典六棱截面</button>
          <button class="math-action-pill danger" id="btn-clear-lines">清除标记</button>
          <span class="math-picked-badge" id="math-cut-picked-badge">自由旋转模式</span>
        </div>

        <!-- 4. Quick Display Options Toggles -->
        <div class="math-toggle-group">
          <label class="math-switch-chip">
            <input type="checkbox" id="check-coord-system" />
            <span>空间坐标系</span>
          </label>
          <label class="math-switch-chip">
            <input type="checkbox" id="check-circum-sphere" />
            <span>外接球</span>
          </label>
          <label class="math-switch-chip">
            <input type="checkbox" id="check-in-sphere" />
            <span>内切球</span>
          </label>
          <label class="math-switch-chip">
            <input type="checkbox" id="check-embedding-box" />
            <span>长方体补形</span>
          </label>
          <label class="math-switch-chip">
            <input type="checkbox" id="check-dashed-lines" checked />
            <span>教材虚线</span>
          </label>
          <button class="math-action-pill micro" id="btn-view-iso">标准视角</button>
        </div>

        <!-- 5. Real-Time Spatial Geometry Analytics Banner -->
        <div class="math-metrics-banner">
          <div class="metric-item">
            <span class="m-label">剖切截面形状</span>
            <span class="m-val highlight" id="val-cut-shape">未剖切</span>
          </div>
          <div class="metric-item">
            <span class="m-label">截面面积</span>
            <span class="m-val" id="val-cut-area">--</span>
          </div>
          <div class="metric-item">
            <span class="m-label">异面夹角 / 空间连线</span>
            <span class="m-val" id="val-lines-angle">--</span>
          </div>
          <div class="metric-item">
            <span class="m-label">外接球直径 2R</span>
            <span class="m-val" id="val-sphere-2r">--</span>
          </div>
        </div>

        <!-- 6. Hidden elements to preserve telemetry DOM contract -->
        <div style="display: none;">
          <span id="val-dim-a">0.38</span>
          <input type="range" id="slider-dim-a" value="0.38" />
          <span id="val-dim-h">0.38</span>
          <input type="range" id="slider-dim-h" value="0.38" />
          <span id="val-cut-dihedral">--</span>
          <span id="val-sphere-r">--</span>
          <span id="val-in-r">--</span>
          <span id="val-lines-rel">--</span>
          <span id="val-lines-dist">--</span>
          <div id="math-coords-chips"></div>
          <input type="range" id="slider-unfold" value="0" />
          <span id="val-unfold">0%</span>
        </div>
      </div>
    `;

    this.cacheDOMElements();
    this.bindEvents();
  }

  private cacheDOMElements(): void {
    this.modelTitleEl = this.element.querySelector('#math-model-title');
    this.modelSubtitleEl = this.element.querySelector('#math-model-subtitle');
    this.eulerEl = this.element.querySelector('#math-euler-badge');
    this.valDimA = this.element.querySelector('#val-dim-a');
    this.sliderDimA = this.element.querySelector('#slider-dim-a');
    this.valDimH = this.element.querySelector('#val-dim-h');
    this.sliderDimH = this.element.querySelector('#slider-dim-h');
    this.cutShapeEl = this.element.querySelector('#val-cut-shape');
    this.cutAreaEl = this.element.querySelector('#val-cut-area');
    this.cutDihedralEl = this.element.querySelector('#val-cut-dihedral');
    this.cutPickedBadge = this.element.querySelector('#math-cut-picked-badge');
    this.sphereRadiusEl = this.element.querySelector('#val-sphere-r');
    this.sphereDiameterEl = this.element.querySelector('#val-sphere-2r');
    this.inRadiusEl = this.element.querySelector('#val-in-r');
    this.linesRelEl = this.element.querySelector('#val-lines-rel');
    this.linesAngleEl = this.element.querySelector('#val-lines-angle');
    this.linesDistEl = this.element.querySelector('#val-lines-dist');
    this.coordsListEl = this.element.querySelector('#math-coords-chips');
    this.unfoldSlider = this.element.querySelector('#slider-unfold');
    this.unfoldVal = this.element.querySelector('#val-unfold');
  }

  private bindEvents(): void {
    // 1. Model Cards selection
    const modelsGrid = this.element.querySelector('.math-models-grid');
    modelsGrid?.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest('.math-model-card') as HTMLElement;
      if (!btn) return;
      const model = btn.getAttribute('data-model') as HighSchoolModelType;
      if (!model) return;

      modelsGrid.querySelectorAll('.math-model-card').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');

      this.callbacks.onModelChange?.(model);
    });

    // 2. View reset shortcut
    this.element.querySelector('#btn-view-iso')?.addEventListener('click', () => this.callbacks.onResetView?.('iso'));

    // 3. Primary action buttons
    const setupToolBtn = (selector: string, mode: InteractionMode) => {
      const btn = this.element.querySelector(selector) as HTMLButtonElement;
      btn?.addEventListener('click', () => {
        this.element.querySelectorAll('.math-tool-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        this.callbacks.onInteractionModeChange?.(mode);
      });
    };

    setupToolBtn('#btn-tool-orbit', 'orbit');
    setupToolBtn('#btn-tool-line', 'connect-line');
    setupToolBtn('#btn-tool-cut', 'three-point-cut');

    this.element.querySelector('#btn-clear-lines')?.addEventListener('click', () => {
      this.callbacks.onClearSegments?.();
    });

    this.element.querySelector('#btn-preset-hexagon')?.addEventListener('click', () => {
      this.callbacks.onApplyPreset?.('cube-hexagon');
    });

    // 4. Quick Toggles
    this.element.querySelector('#check-coord-system')?.addEventListener('change', (e) => {
      this.callbacks.onToggleCoordinateSystem?.((e.target as HTMLInputElement).checked);
    });
    this.element.querySelector('#check-circum-sphere')?.addEventListener('change', (e) => {
      this.callbacks.onToggleCircumSphere?.((e.target as HTMLInputElement).checked);
    });
    this.element.querySelector('#check-in-sphere')?.addEventListener('change', (e) => {
      this.callbacks.onToggleInSphere?.((e.target as HTMLInputElement).checked);
    });
    this.element.querySelector('#check-embedding-box')?.addEventListener('change', (e) => {
      this.callbacks.onToggleEmbeddingBox?.((e.target as HTMLInputElement).checked);
    });
    this.element.querySelector('#check-dashed-lines')?.addEventListener('change', (e) => {
      this.callbacks.onToggleDashedLines?.((e.target as HTMLInputElement).checked);
    });
  }

  public setVisible(visible: boolean): void {
    this.isVisible = visible;
    this.element.style.display = visible ? 'flex' : 'none';
  }

  /**
   * Synchronize telemetry state into the Apple VisionOS card.
   * Reinforced with dirty check signature caching to prevent DOM layout thrashing in 60 FPS loop.
   */
  public updateTelemetry(data: StereometryTelemetryData): void {
    if (!this.isVisible) return;

    // Header info
    if (this.modelTitleEl) this.modelTitleEl.textContent = data.modelName;
    if (this.modelSubtitleEl) this.modelSubtitleEl.textContent = data.modelSubtitle;
    if (this.eulerEl) {
      this.eulerEl.textContent = `V: ${data.vertexCount} · E: ${data.edgeCount} · F: ${data.faceCount}`;
    }

    // Interactive Mode badge
    if (this.cutPickedBadge) {
      if (data.interactionMode === 'three-point-cut') {
        const count = data.selectedCutPoints.length;
        this.cutPickedBadge.textContent = `剖切模式: 已选 ${count}/3 点`;
        this.cutPickedBadge.classList.add('active');
      } else if (data.interactionMode === 'connect-line') {
        this.cutPickedBadge.textContent = '两点连线模式';
        this.cutPickedBadge.classList.add('active');
      } else {
        this.cutPickedBadge.textContent = '自由旋转视角';
        this.cutPickedBadge.classList.remove('active');
      }
    }

    // Cross section metrics
    if (data.activeCrossSection) {
      if (this.cutShapeEl) this.cutShapeEl.textContent = data.activeCrossSection.polygonType;
      if (this.cutAreaEl) this.cutAreaEl.textContent = `${data.activeCrossSection.area.toFixed(3)}`;
      if (this.cutDihedralEl) this.cutDihedralEl.textContent = `${data.activeCrossSection.dihedralAngleDeg.toFixed(1)}°`;
    } else {
      if (this.cutShapeEl) this.cutShapeEl.textContent = '未剖切';
      if (this.cutAreaEl) this.cutAreaEl.textContent = '--';
      if (this.cutDihedralEl) this.cutDihedralEl.textContent = '--';
    }

    // Lines & Angles metrics
    if (data.twoLineAngle) {
      const typeDesc =
        data.twoLineAngle.type === 'skew'
          ? '异面直线'
          : data.twoLineAngle.type === 'parallel'
          ? '互相平行'
          : '相交直线';
      if (this.linesRelEl) this.linesRelEl.textContent = `${data.twoLineAngle.lineA} 与 ${data.twoLineAngle.lineB} (${typeDesc})`;
      if (this.linesAngleEl) this.linesAngleEl.textContent = `${data.twoLineAngle.angleDeg.toFixed(1)}° (${typeDesc})`;
      if (this.linesDistEl) this.linesDistEl.textContent = `${data.twoLineAngle.skewDistance.toFixed(3)}`;
    } else if (data.drawnSegments.length > 0) {
      const lastSeg = data.drawnSegments[data.drawnSegments.length - 1];
      if (this.linesRelEl) this.linesRelEl.textContent = `已绘制 ${data.drawnSegments.length} 条线段`;
      if (this.linesAngleEl) this.linesAngleEl.textContent = `线段 ${lastSeg.label} = ${lastSeg.length.toFixed(2)}`;
      if (this.linesDistEl) this.linesDistEl.textContent = '--';
    } else {
      if (this.linesRelEl) this.linesRelEl.textContent = '请点击连线';
      if (this.linesAngleEl) this.linesAngleEl.textContent = '--';
      if (this.linesDistEl) this.linesDistEl.textContent = '--';
    }

    // Spheres metrics
    if (data.sphereAnalysis.hasCircumSphere) {
      if (this.sphereDiameterEl) this.sphereDiameterEl.textContent = `${(data.sphereAnalysis.circumRadius * 2).toFixed(2)}`;
      if (this.sphereRadiusEl) this.sphereRadiusEl.textContent = `${data.sphereAnalysis.circumRadius.toFixed(2)}`;
    } else {
      if (this.sphereDiameterEl) this.sphereDiameterEl.textContent = '无外接球';
      if (this.sphereRadiusEl) this.sphereRadiusEl.textContent = '--';
    }

    if (data.sphereAnalysis.hasInSphere) {
      if (this.inRadiusEl) this.inRadiusEl.textContent = `${data.sphereAnalysis.inRadius.toFixed(2)}`;
    } else {
      if (this.inRadiusEl) this.inRadiusEl.textContent = '--';
    }

    // Signature-based cached DOM coordinates update
    if (this.coordsListEl && data.vertexCoords) {
      const sig = data.vertexCoords.map((v) => `${v.id}:${v.coords.join(',')}`).join('|');
      if (sig !== this.lastCoordsSignature) {
        this.lastCoordsSignature = sig;
        this.coordsListEl.innerHTML = data.vertexCoords
          .map(
            (v) => `
              <div class="coord-chip ${v.id === data.originPointId ? 'origin' : ''}">
                <span class="coord-lbl">${v.label}</span>
                <span class="coord-val">(${v.coords[0].toFixed(2)}, ${v.coords[1].toFixed(2)}, ${v.coords[2].toFixed(2)})</span>
              </div>
            `
          )
          .join('');
      }
    }
  }

  public dispose(): void {
    this.element.remove();
  }
}
