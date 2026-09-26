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
  private cutShapeEl: HTMLElement | null = null;
  private cutAreaEl: HTMLElement | null = null;
  private cutDihedralEl: HTMLElement | null = null;
  private sphereRadiusEl: HTMLElement | null = null;
  private sphereDiameterEl: HTMLElement | null = null;
  private inRadiusEl: HTMLElement | null = null;
  private linesRelEl: HTMLElement | null = null;
  private linesAngleEl: HTMLElement | null = null;
  private linesDistEl: HTMLElement | null = null;
  private modelScaleEl: HTMLElement | null = null;
  private liveHintEl: HTMLElement | null = null;

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
      <div class="math-card-container apple-style">
        <!-- 1. Apple-Style Window Header -->
        <div class="math-card-header">
          <div class="math-header-left">
            <span class="math-live-dot"></span>
            <div class="math-title-group">
              <span class="math-card-title" id="math-model-title">正方体</span>
              <span class="math-card-subtitle" id="math-model-subtitle">空间立体几何解析基石 · 棱长 a = 0.38</span>
            </div>
          </div>
          <div class="math-header-right">
            <span class="math-euler-badge" id="math-euler-badge">V: 8 · E: 12 · F: 6</span>
            <button class="apple-glass-action-btn" id="btn-math-reset-all" title="重置视角 (R)">
              <svg class="apple-sf-icon" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
                <path d="M3 3v5h5"/>
              </svg>
              <span>重置视角</span>
            </button>
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

        <!-- 3. Real-Time Spatial Geometry Analytics (4 Apple Vision Frosted Glass Tiles) -->
        <div class="math-analytics-grid">
          <!-- Tile 1: 剖切截面 -->
          <div class="math-analytic-tile">
            <div class="tile-header">
              <svg class="tile-icon" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polygon points="12 2 2 7 12 12 22 7 12 2"/>
                <polyline points="2 17 12 22 22 17"/>
                <polyline points="2 12 12 17 22 12"/>
              </svg>
              <span class="tile-title">剖切截面形状</span>
            </div>
            <div class="tile-val-main" id="val-cut-shape">未剖切</div>
            <div class="tile-subtext">
              <span>面积: <b id="val-cut-area">--</b></span>
              <span>二面角: <b id="val-cut-dihedral">--</b></span>
            </div>
          </div>

          <!-- Tile 2: 空间直线与夹角 -->
          <div class="math-analytic-tile">
            <div class="tile-header">
              <svg class="tile-icon" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="4" y1="20" x2="20" y2="4"/>
                <line x1="4" y1="4" x2="14" y2="14"/>
              </svg>
              <span class="tile-title">空间连线 / 异面夹角</span>
            </div>
            <div class="tile-val-main" id="val-lines-angle">--</div>
            <div class="tile-subtext" id="val-lines-detail">
              <span>关系: <b id="val-lines-rel">点击顶点连线</b></span>
              <span>公垂线: <b id="val-lines-dist">--</b></span>
            </div>
          </div>

          <!-- Tile 3: 外接球与内切球 -->
          <div class="math-analytic-tile">
            <div class="tile-header">
              <svg class="tile-icon" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"/>
                <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/>
              </svg>
              <span class="tile-title">外接球与内切球</span>
            </div>
            <div class="tile-val-main" id="val-sphere-2r">--</div>
            <div class="tile-subtext">
              <span>外接 R: <b id="val-sphere-r">--</b></span>
              <span>内切 r: <b id="val-in-r">--</b></span>
            </div>
          </div>

          <!-- Tile 4: 实时交互与缩放 -->
          <div class="math-analytic-tile">
            <div class="tile-header">
              <svg class="tile-icon" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="11" cy="11" r="8"/>
                <line x1="21" y1="21" x2="16.65" y2="16.65"/>
                <line x1="11" y1="8" x2="11" y2="14"/>
                <line x1="8" y1="11" x2="14" y2="11"/>
              </svg>
              <span class="tile-title">3D 模型缩放</span>
            </div>
            <div class="tile-val-main" id="val-model-scale">100%</div>
            <div class="tile-subtext">
              <span>鼠标滚轮 / 键盘 [+/-] 缩放</span>
            </div>
          </div>
        </div>

        <!-- 4. High-School Stereometry Core Theorems & Formulas (Apple Vision Pro Frosted Glass Reference Deck) -->
        <div class="math-theorems-grid">
          <div class="math-theorem-card">
            <div class="theorem-tag">多面体欧拉定理</div>
            <div class="theorem-title">拓扑结构守恒</div>
            <div class="theorem-formula">V - E + F = 2</div>
            <div class="theorem-desc">任意凸多面体顶点数 V、面数 F 与棱数 E 恒守恒，空间立体拓扑不变量。</div>
          </div>

          <div class="math-theorem-card">
            <div class="theorem-tag">空间直线与向量</div>
            <div class="theorem-title">异面直线夹角定理</div>
            <div class="theorem-formula">cos θ = |u · v| / (|u| |v|)</div>
            <div class="theorem-desc">异面直线夹角范围 θ ∈ (0°, 90°]，平移或利用空间法向量快速求算公垂线。</div>
          </div>

          <div class="math-theorem-card">
            <div class="theorem-tag">高考外接与内切球</div>
            <div class="theorem-title">割补体与射影模型</div>
            <div class="theorem-formula">(2R)² = a² + b² + c² · R:r = 3:1</div>
            <div class="theorem-desc">墙角三棱锥构造长方体体对角线割补；正四面体外接球与内切球半径比恒为 3:1。</div>
          </div>
        </div>

        <!-- 5. Apple VisionOS Dynamic Status Bar -->
        <div class="math-dynamic-status-bar">
          <span class="math-dynamic-dot"></span>
          <span class="math-dynamic-hint" id="math-live-hint">✦ 直接对3D模型交互：左键拖拽旋转 · 滚轮或[+/-]缩放 · 点击顶点直接连线或定面剖切</span>
          <button class="apple-subtle-link" id="btn-clear-lines-subtle" title="清除标记与截面 (ESC)">清除标记</button>
        </div>

        <!-- 5. Hidden preservation elements for telemetry DOM contract -->
        <div style="display: none;">
          <span id="val-dim-a">0.38</span>
          <input type="range" id="slider-dim-a" value="0.38" />
          <span id="val-dim-h">0.38</span>
          <input type="range" id="slider-dim-h" value="0.38" />
          <div id="math-coords-chips"></div>
          <input type="range" id="slider-unfold" value="0" />
          <span id="val-unfold">0%</span>
          <span id="math-cut-picked-badge">直接交互模式</span>
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
    this.cutShapeEl = this.element.querySelector('#val-cut-shape');
    this.cutAreaEl = this.element.querySelector('#val-cut-area');
    this.cutDihedralEl = this.element.querySelector('#val-cut-dihedral');
    this.sphereRadiusEl = this.element.querySelector('#val-sphere-r');
    this.sphereDiameterEl = this.element.querySelector('#val-sphere-2r');
    this.inRadiusEl = this.element.querySelector('#val-in-r');
    this.linesRelEl = this.element.querySelector('#val-lines-rel');
    this.linesAngleEl = this.element.querySelector('#val-lines-angle');
    this.linesDistEl = this.element.querySelector('#val-lines-dist');
    this.modelScaleEl = this.element.querySelector('#val-model-scale');
    this.liveHintEl = this.element.querySelector('#math-live-hint');
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
      this.callbacks.onClearSegments?.();
    });

    // 2. View reset shortcut
    this.element.querySelector('#btn-math-reset-all')?.addEventListener('click', () => {
      this.callbacks.onResetView?.('iso');
      this.callbacks.onClearSegments?.();
    });

    // 3. Subtle Clear Marks Button
    this.element.querySelector('#btn-clear-lines-subtle')?.addEventListener('click', () => {
      this.callbacks.onClearSegments?.();
    });
  }

  public setVisible(visible: boolean): void {
    this.isVisible = visible;
    this.element.style.display = visible ? 'flex' : 'none';
  }

  /**
   * Synchronize telemetry state into the Apple VisionOS card.
   * Reinforced with dirty check signature caching to prevent DOM layout thrashing.
   */
  public updateTelemetry(data: StereometryTelemetryData): void {
    if (!this.isVisible) return;

    // Header info (dirty checked)
    if (this.modelTitleEl && this.modelTitleEl.textContent !== data.modelName) {
      this.modelTitleEl.textContent = data.modelName;
    }
    if (this.modelSubtitleEl && this.modelSubtitleEl.textContent !== data.modelSubtitle) {
      this.modelSubtitleEl.textContent = data.modelSubtitle;
    }
    const eulerStr = `V: ${data.vertexCount} · E: ${data.edgeCount} · F: ${data.faceCount}`;
    if (this.eulerEl && this.eulerEl.textContent !== eulerStr) {
      this.eulerEl.textContent = eulerStr;
    }

    // Dynamic Live Interaction Hint
    if (this.liveHintEl) {
      const hint = data.interactionHint || '✦ 直接对3D模型交互：左键拖拽旋转 · 滚轮或[+/-]缩放 · 点击顶点直接连线或定面剖切';
      if (this.liveHintEl.textContent !== hint) {
        this.liveHintEl.textContent = hint;
      }
    }

    // Model Scale
    if (this.modelScaleEl && data.modelScale !== undefined) {
      const scalePct = `${Math.round(data.modelScale * 100)}%`;
      if (this.modelScaleEl.textContent !== scalePct) {
        this.modelScaleEl.textContent = scalePct;
      }
    }

    // Cross section metrics
    const cutShape = data.activeCrossSection ? data.activeCrossSection.polygonType : '未剖切';
    const cutArea = data.activeCrossSection ? data.activeCrossSection.area.toFixed(3) : '--';
    const cutDihedral = data.activeCrossSection ? `${data.activeCrossSection.dihedralAngleDeg.toFixed(1)}°` : '--';
    if (this.cutShapeEl && this.cutShapeEl.textContent !== cutShape) this.cutShapeEl.textContent = cutShape;
    if (this.cutAreaEl && this.cutAreaEl.textContent !== cutArea) this.cutAreaEl.textContent = cutArea;
    if (this.cutDihedralEl && this.cutDihedralEl.textContent !== cutDihedral) this.cutDihedralEl.textContent = cutDihedral;

    // Lines & Angles metrics
    let linesRel = '点击顶点连线';
    let linesAngle = '--';
    let linesDist = '--';
    if (data.twoLineAngle) {
      const typeDesc =
        data.twoLineAngle.type === 'skew'
          ? '异面直线'
          : data.twoLineAngle.type === 'parallel'
          ? '互相平行'
          : '相交直线';
      linesRel = `${data.twoLineAngle.lineA} 与 ${data.twoLineAngle.lineB} (${typeDesc})`;
      linesAngle = `${data.twoLineAngle.angleDeg.toFixed(1)}° (${typeDesc})`;
      linesDist = `${data.twoLineAngle.skewDistance.toFixed(3)}`;
    } else if (data.drawnSegments.length > 0) {
      const lastSeg = data.drawnSegments[data.drawnSegments.length - 1];
      linesRel = `已绘制 ${data.drawnSegments.length} 条线段`;
      linesAngle = `线段 ${lastSeg.label} = ${lastSeg.length.toFixed(2)}`;
    }
    if (this.linesRelEl && this.linesRelEl.textContent !== linesRel) this.linesRelEl.textContent = linesRel;
    if (this.linesAngleEl && this.linesAngleEl.textContent !== linesAngle) this.linesAngleEl.textContent = linesAngle;
    if (this.linesDistEl && this.linesDistEl.textContent !== linesDist) this.linesDistEl.textContent = linesDist;

    // Spheres metrics
    const sphere2r = data.sphereAnalysis.hasCircumSphere ? (data.sphereAnalysis.circumRadius * 2).toFixed(2) : '无外接球';
    const sphereR = data.sphereAnalysis.hasCircumSphere ? data.sphereAnalysis.circumRadius.toFixed(2) : '--';
    const inR = data.sphereAnalysis.hasInSphere ? data.sphereAnalysis.inRadius.toFixed(2) : '--';
    if (this.sphereDiameterEl && this.sphereDiameterEl.textContent !== sphere2r) this.sphereDiameterEl.textContent = sphere2r;
    if (this.sphereRadiusEl && this.sphereRadiusEl.textContent !== sphereR) this.sphereRadiusEl.textContent = sphereR;
    if (this.inRadiusEl && this.inRadiusEl.textContent !== inR) this.inRadiusEl.textContent = inR;
  }

  public dispose(): void {
    this.element.remove();
  }
}
