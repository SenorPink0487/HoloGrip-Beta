import type { OpticsExperimentManager, OpticsState, OpticsExperimentId } from '../../physics/optics/OpticsExperimentManager';
import { OpticsMath } from '../../physics/optics/OpticsMath';

export class OpticsControlCard {
  public element: HTMLElement;
  private unsubscribe: (() => void) | null = null;
  private curveCanvas: HTMLCanvasElement;
  private curveCtx: CanvasRenderingContext2D;

  // Teacher tools state
  private savedSnapshots: Array<{ name: string; canvas: HTMLCanvasElement }> = [];
  private caliperLeftPx = 140;
  private caliperRightPx = 220;
  private isDraggingCaliper: 'left' | 'right' | null = null;

  constructor(private manager: OpticsExperimentManager) {
    this.createUI();
    this.bindEvents();
    this.subscribeToManager();
  }

  private createUI(): void {
    this.element = document.createElement('div');
    this.element.className = 'optics-control-card hud-interactive';

    this.element.innerHTML = `
      <!-- Experiment Segmented Tab Bar -->
      <div class="optics-card-header">
        <div class="optics-segmented-control" role="tablist">
          <button class="optics-segment-btn" data-exp="propagation" title="光的传播与折射">
            <svg class="apple-sf-icon" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polygon points="12 2 2 22 22 22 12 2"/>
              <line x1="12" y1="2" x2="12" y2="22"/>
            </svg>
            <span>光的传播</span>
          </button>
          <button class="optics-segment-btn active" data-exp="interference" title="双缝干涉">
            <svg class="apple-sf-icon" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="7" y1="3" x2="7" y2="21"/>
              <line x1="17" y1="3" x2="17" y2="21"/>
              <circle cx="12" cy="12" r="2"/>
            </svg>
            <span>双缝干涉</span>
          </button>
          <button class="optics-segment-btn" data-exp="diffraction" title="衍射与光栅">
            <svg class="apple-sf-icon" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="4" y1="4" x2="4" y2="20"/>
              <line x1="20" y1="4" x2="20" y2="20"/>
              <line x1="9" y1="7" x2="15" y2="7"/>
              <line x1="8" y1="12" x2="16" y2="12"/>
              <line x1="9" y1="17" x2="15" y2="17"/>
            </svg>
            <span>衍射光栅</span>
          </button>
          <button class="optics-segment-btn" data-exp="polarization" title="偏振与马吕斯定律">
            <svg class="apple-sf-icon" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="9"/>
              <line x1="12" y1="3" x2="12" y2="21"/>
              <line x1="4" y1="8" x2="20" y2="16"/>
            </svg>
            <span>偏振定律</span>
          </button>
        </div>

        <div class="optics-quick-actions">
          <button class="optics-action-btn" id="btn-optics-laser-toggle" title="启闭激光源">
            <svg class="apple-sf-icon" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
              <path d="M18.36 6.64a9 9 0 1 1-12.73 0"/>
              <line x1="12" y1="2" x2="12" y2="12"/>
            </svg>
            <span id="label-laser-power">激光已开启</span>
          </button>

          <button class="optics-action-btn" id="btn-optics-golden-reset" title="复位标准教学位">
            <svg class="apple-sf-icon" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
              <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
              <polyline points="3 3 3 8 8 8"/>
            </svg>
            <span>标准教学位</span>
          </button>
        </div>
      </div>

      <!-- Universal Spectral Wavelength Slider -->
      <div class="optics-global-slider-deck">
        <div class="optics-slider-header">
          <div class="slider-title-group">
            <span class="slider-label">激光波长 (λ)</span>
            <span class="color-badge" id="optics-color-badge"></span>
          </div>
          <span class="slider-val-readout" id="readout-wavelength">632.8 nm</span>
        </div>
        <div class="optics-spectrum-track-wrap">
          <input type="range" id="slider-optics-wavelength" class="optics-spectrum-slider" min="380" max="780" step="1" value="632.8" />
        </div>
      </div>

      <!-- Experiment-Specific Controls Deck -->
      <div class="optics-experiment-deck" id="optics-dynamic-deck">
        <!-- Dynamically injected based on active experiment -->
      </div>

      <!-- Real-time Physical Analysis Curve Deck -->
      <div class="optics-analysis-section">
        <div class="analysis-header">
          <div class="analysis-title">
            <svg class="apple-sf-icon" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
            </svg>
            <span id="analysis-chart-title">光强空间分布 I(x)</span>
          </div>
          <div class="analysis-tool-toggles">
            <button class="analysis-tool-btn active" id="btn-toggle-caliper" title="开启双游标测微标尺">
              <span>测微标尺</span>
            </button>
            <button class="analysis-tool-btn" id="btn-snapshot-compare" title="暂存并对比当前条纹">
              <span>同屏对比</span>
            </button>
          </div>
        </div>

        <!-- Curve Canvas Container -->
        <div class="optics-chart-wrapper" id="optics-chart-wrapper">
          <canvas id="optics-curve-canvas" width="640" height="140"></canvas>
          
          <!-- Draggable Caliper Overlay -->
          <div class="caliper-overlay" id="caliper-overlay">
            <div class="caliper-cursor" id="caliper-left" style="left: 140px;">
              <div class="caliper-handle"></div>
              <div class="caliper-line"></div>
              <span class="caliper-tag">X₁</span>
            </div>
            <div class="caliper-cursor" id="caliper-right" style="left: 220px;">
              <div class="caliper-handle"></div>
              <div class="caliper-line"></div>
              <span class="caliper-tag">X₂</span>
            </div>
            <div class="caliper-readout-pill" id="caliper-diff-pill">
              Δx = 2.02 mm · 验证 λ = 631 nm
            </div>
          </div>
        </div>

        <!-- Comparison Shelf Slot -->
        <div class="optics-comparison-shelf hidden" id="optics-comparison-shelf">
          <div class="shelf-header">
            <span class="shelf-title">条纹同屏对比视窗</span>
            <button class="shelf-clear-btn" id="btn-clear-snapshots">清除对比</button>
          </div>
          <div class="shelf-cards-row" id="shelf-cards-row"></div>
        </div>
      </div>
    `;

    this.curveCanvas = this.element.querySelector('#optics-curve-canvas') as HTMLCanvasElement;
    this.curveCtx = this.curveCanvas.getContext('2d')!;
  }

  private subscribeToManager(): void {
    this.unsubscribe = this.manager.subscribe((state) => {
      this.updateUI(state);
    });
  }

  private updateUI(state: OpticsState): void {
    // 1. Update Segmented Tabs
    const tabs = this.element.querySelectorAll('.optics-segment-btn');
    tabs.forEach((tab) => {
      if (tab.getAttribute('data-exp') === state.experimentId) {
        tab.classList.add('active');
      } else {
        tab.classList.remove('active');
      }
    });

    // 2. Update Laser Power and Wavelength
    const laserToggleBtn = this.element.querySelector('#btn-optics-laser-toggle');
    const laserLabel = this.element.querySelector('#label-laser-power');
    if (state.laserOn) {
      laserToggleBtn?.classList.add('active');
      if (laserLabel) laserLabel.textContent = '激光已开启';
    } else {
      laserToggleBtn?.classList.remove('active');
      if (laserLabel) laserLabel.textContent = '激光已关闭';
    }

    const wlReadout = this.element.querySelector('#readout-wavelength');
    if (wlReadout) wlReadout.textContent = `${state.wavelengthNm.toFixed(1)} nm`;

    const wlSlider = this.element.querySelector('#slider-optics-wavelength') as HTMLInputElement;
    if (wlSlider && Math.abs(parseFloat(wlSlider.value) - state.wavelengthNm) > 0.5) {
      wlSlider.value = state.wavelengthNm.toString();
    }

    const colorBadge = this.element.querySelector('#optics-color-badge') as HTMLElement;
    if (colorBadge) {
      const col = OpticsMath.wavelengthToRGB(state.wavelengthNm);
      colorBadge.style.backgroundColor = col.css;
      colorBadge.style.boxShadow = `0 0 10px ${col.css}`;
    }

    // 3. Render Experiment Specific Controls
    this.renderExperimentDeck(state);

    // 4. Render Analytical Curve
    this.drawAnalysisCurve(state);

    // 5. Update Caliper calculation
    this.updateCaliperReadout(state);
  }

  private renderExperimentDeck(state: OpticsState): void {
    const deck = this.element.querySelector('#optics-dynamic-deck');
    if (!deck) return;

    if (state.experimentId === 'propagation') {
      deck.innerHTML = `
        <div class="optics-param-grid">
          <div class="param-row">
            <span class="param-name">光学介质</span>
            <div class="optics-sub-segmented">
              <button class="sub-seg-btn ${state.refractionElement === 'block' ? 'active' : ''}" id="btn-elem-block">半圆玻璃砖</button>
              <button class="sub-seg-btn ${state.refractionElement === 'prism' ? 'active' : ''}" id="btn-elem-prism">等边三棱镜</button>
            </div>
          </div>

          <div class="param-row">
            <div class="param-header">
              <span class="param-name">入射角 (θ₁)</span>
              <span class="param-val">${state.incidentAngleDeg}°</span>
            </div>
            <input type="range" class="apple-glass-slider" id="slider-prop-angle" min="0" max="85" step="1" value="${state.incidentAngleDeg}" />
          </div>

          <div class="param-row">
            <div class="param-header">
              <span class="param-name">介质折射率 (n)</span>
              <span class="param-val">${state.refractiveIndex.toFixed(2)}</span>
            </div>
            <input type="range" class="apple-glass-slider" id="slider-prop-index" min="1.10" max="2.42" step="0.01" value="${state.refractiveIndex}" />
          </div>

          <div class="param-metric-badge ${state.isTotalInternalReflection ? 'highlight-alert' : ''}">
            <span class="metric-label">光路物理状态</span>
            <span class="metric-val">
              ${state.isTotalInternalReflection ? '发生全反射 (折射光消失)' : '正常斯涅尔折射'}
              ${state.criticalAngleDeg ? `· 临界角 θc = ${state.criticalAngleDeg.toFixed(1)}°` : ''}
            </span>
          </div>
        </div>
      `;

      deck.querySelector('#btn-elem-block')?.addEventListener('click', () => this.manager.setRefractionElement('block'));
      deck.querySelector('#btn-elem-prism')?.addEventListener('click', () => this.manager.setRefractionElement('prism'));
      deck.querySelector('#slider-prop-angle')?.addEventListener('input', (e) => {
        this.manager.setIncidentAngleDeg(parseFloat((e.target as HTMLInputElement).value));
      });
      deck.querySelector('#slider-prop-index')?.addEventListener('input', (e) => {
        this.manager.setRefractiveIndex(parseFloat((e.target as HTMLInputElement).value));
      });
    } else if (state.experimentId === 'interference') {
      deck.innerHTML = `
        <div class="optics-param-grid">
          <div class="param-row">
            <div class="param-header">
              <span class="param-name">双缝间距 (d)</span>
              <span class="param-val">${state.slitDistanceMm.toFixed(2)} mm</span>
            </div>
            <input type="range" class="apple-glass-slider" id="slider-interf-d" min="0.10" max="0.80" step="0.01" value="${state.slitDistanceMm}" />
          </div>

          <div class="param-row">
            <div class="param-header">
              <span class="param-name">单缝宽度 (a) · 调制包络</span>
              <span class="param-val">${state.slitWidthMm.toFixed(3)} mm</span>
            </div>
            <input type="range" class="apple-glass-slider" id="slider-interf-a" min="0.01" max="0.10" step="0.005" value="${state.slitWidthMm}" />
          </div>

          <div class="param-metric-badge">
            <span class="metric-label">理论条纹间距 Δx = (L/d)λ</span>
            <span class="metric-val">${state.fringeSpacingMm.toFixed(2)} mm</span>
          </div>

          ${state.missingOrder.isMissingOrder ? `
            <div class="param-metric-badge highlight-subtle">
              <span class="metric-label">缺级现象 (Missing Order)</span>
              <span class="metric-val">d/a = ${state.missingOrder.ratio}，第 ±${state.missingOrder.ratio} 级主极大缺级</span>
            </div>
          ` : ''}
        </div>
      `;

      deck.querySelector('#slider-interf-d')?.addEventListener('input', (e) => {
        this.manager.setSlitDistanceMm(parseFloat((e.target as HTMLInputElement).value));
      });
      deck.querySelector('#slider-interf-a')?.addEventListener('input', (e) => {
        this.manager.setSlitWidthMm(parseFloat((e.target as HTMLInputElement).value));
      });
    } else if (state.experimentId === 'diffraction') {
      deck.innerHTML = `
        <div class="optics-param-grid">
          <div class="param-row">
            <span class="param-name">衍射阑类型</span>
            <div class="optics-sub-segmented">
              <button class="sub-seg-btn ${state.diffractionType === 'single_slit' ? 'active' : ''}" id="btn-diff-single">单缝</button>
              <button class="sub-seg-btn ${state.diffractionType === 'circular_aperture' ? 'active' : ''}" id="btn-diff-circle">圆孔(艾里斑)</button>
              <button class="sub-seg-btn ${state.diffractionType === 'grating' ? 'active' : ''}" id="btn-diff-grating">光栅</button>
            </div>
          </div>

          ${state.diffractionType === 'grating' ? `
            <div class="param-row">
              <span class="param-name">光栅刻线密度</span>
              <div class="optics-sub-segmented">
                <button class="sub-seg-btn ${state.gratingDensityLinesPerMm === 100 ? 'active' : ''}" data-lines="100">100 l/mm</button>
                <button class="sub-seg-btn ${state.gratingDensityLinesPerMm === 300 ? 'active' : ''}" data-lines="300">300 l/mm</button>
                <button class="sub-seg-btn ${state.gratingDensityLinesPerMm === 600 ? 'active' : ''}" data-lines="600">600 l/mm</button>
              </div>
            </div>
          ` : `
            <div class="param-row">
              <div class="param-header">
                <span class="param-name">${state.diffractionType === 'single_slit' ? '狭缝宽度 (a)' : '孔径直径 (D)'}</span>
                <span class="param-val">${state.diffractionSlitWidthMm.toFixed(2)} mm</span>
              </div>
              <input type="range" class="apple-glass-slider" id="slider-diff-a" min="0.03" max="0.30" step="0.01" value="${state.diffractionSlitWidthMm}" />
            </div>
          `}
        </div>
      `;

      deck.querySelector('#btn-diff-single')?.addEventListener('click', () => this.manager.setDiffractionType('single_slit'));
      deck.querySelector('#btn-diff-circle')?.addEventListener('click', () => this.manager.setDiffractionType('circular_aperture'));
      deck.querySelector('#btn-diff-grating')?.addEventListener('click', () => this.manager.setDiffractionType('grating'));

      deck.querySelectorAll('[data-lines]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const l = parseInt(btn.getAttribute('data-lines') || '300', 10);
          this.manager.setGratingDensity(l);
        });
      });

      deck.querySelector('#slider-diff-a')?.addEventListener('input', (e) => {
        this.manager.setDiffractionSlitWidthMm(parseFloat((e.target as HTMLInputElement).value));
      });
    } else if (state.experimentId === 'polarization') {
      const angleDiff = Math.abs(state.polarizerAngleDeg - state.analyzerAngleDeg);
      deck.innerHTML = `
        <div class="optics-param-grid">
          <div class="param-row">
            <div class="param-header">
              <span class="param-name">检偏器角度 (θ₂)</span>
              <span class="param-val">${state.analyzerAngleDeg}°</span>
            </div>
            <input type="range" class="apple-glass-slider" id="slider-ana-angle" min="0" max="360" step="1" value="${state.analyzerAngleDeg}" />
          </div>

          <div class="param-row">
            <span class="param-name">经典演示快选</span>
            <div class="optics-sub-segmented">
              <button class="sub-seg-btn" id="btn-pol-0">0° 同轴透光</button>
              <button class="sub-seg-btn" id="btn-pol-45">45° 半透光</button>
              <button class="sub-seg-btn" id="btn-pol-90">90° 正交消光</button>
            </div>
          </div>

          <div class="param-metric-badge">
            <span class="metric-label">马吕斯定律相对透射光强 I / I₀ = cos²(θ)</span>
            <span class="metric-val">${(state.polarizationIntensity * 100).toFixed(1)}% (夹角 ${angleDiff}°)</span>
          </div>
        </div>
      `;

      deck.querySelector('#slider-ana-angle')?.addEventListener('input', (e) => {
        this.manager.setAnalyzerAngleDeg(parseFloat((e.target as HTMLInputElement).value));
      });
      deck.querySelector('#btn-pol-0')?.addEventListener('click', () => this.manager.setAnalyzerAngleDeg(state.polarizerAngleDeg));
      deck.querySelector('#btn-pol-45')?.addEventListener('click', () => this.manager.setAnalyzerAngleDeg(state.polarizerAngleDeg + 45));
      deck.querySelector('#btn-pol-90')?.addEventListener('click', () => this.manager.setAnalyzerAngleDeg(state.polarizerAngleDeg + 90));
    }
  }

  private drawAnalysisCurve(state: OpticsState): void {
    const { curveCanvas: cvs, curveCtx: ctx } = this;
    if (!cvs || !ctx) return;

    const w = cvs.width;
    const h = cvs.height;

    ctx.clearRect(0, 0, w, h);

    // Grid lines
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, h - 20);
    ctx.lineTo(w, h - 20);
    ctx.moveTo(w / 2, 0);
    ctx.lineTo(w / 2, h);
    ctx.stroke();

    const col = OpticsMath.wavelengthToRGB(state.wavelengthNm);
    ctx.strokeStyle = col.css;
    ctx.fillStyle = col.css;
    ctx.lineWidth = 2.0;

    const chartTitle = this.element.querySelector('#analysis-chart-title');

    if (state.experimentId === 'polarization') {
      if (chartTitle) chartTitle.textContent = '马吕斯定律理论曲线 I(θ) = I₀ cos²(θ)';

      // Plot Malus curve from 0 to 180 degrees
      ctx.beginPath();
      for (let px = 0; px < w; px++) {
        const theta = (px / w) * Math.PI;
        const iVal = OpticsMath.malusIntensity(theta, 1.0);
        const py = h - 25 - iVal * (h - 45);
        if (px === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();

      // Current operating point indicator
      const angleDiffRad = (Math.abs(state.polarizerAngleDeg - state.analyzerAngleDeg) % 180 * Math.PI) / 180;
      const markerX = (angleDiffRad / Math.PI) * w;
      const markerY = h - 25 - state.polarizationIntensity * (h - 45);

      ctx.beginPath();
      ctx.arc(markerX, markerY, 5, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.strokeStyle = '#0a84ff';
      ctx.stroke();
    } else {
      if (chartTitle) chartTitle.textContent = '光强空间分布曲线 I(x)';

      const screenWidthM = 0.08;
      const lambdaM = state.wavelengthNm * 1e-9;
      const L = state.screenDistanceM;

      ctx.beginPath();
      for (let px = 0; px < w; px++) {
        const xCoord = ((px - w / 2) / w) * screenWidthM;
        let intensity = 0;

        if (state.experimentId === 'interference') {
          const d = state.slitDistanceMm * 1e-3;
          const a = state.slitWidthMm * 1e-3;
          intensity = OpticsMath.doubleSlitIntensity(xCoord, lambdaM, d, a, L, 1.0);
        } else if (state.experimentId === 'diffraction') {
          if (state.diffractionType === 'single_slit') {
            const a = state.diffractionSlitWidthMm * 1e-3;
            intensity = OpticsMath.singleSlitIntensity(xCoord, lambdaM, a, L, 1.0);
          } else if (state.diffractionType === 'circular_aperture') {
            const D = state.diffractionSlitWidthMm * 1e-3;
            intensity = OpticsMath.circularApertureIntensity(Math.abs(xCoord), lambdaM, D, L, 1.0);
          } else {
            const period = (1.0 / state.gratingDensityLinesPerMm) * 1e-3;
            intensity = OpticsMath.gratingIntensity(xCoord, lambdaM, period, period * 0.25, L, 12, 1.0);
          }
        } else {
          intensity = Math.exp(-(xCoord * xCoord) / (2 * 0.005 * 0.005));
        }

        const py = h - 25 - intensity * (h - 45);
        if (px === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
    }
  }

  private updateCaliperReadout(state: OpticsState): void {
    const pill = this.element.querySelector('#caliper-diff-pill');
    if (!pill) return;

    const chartW = this.curveCanvas.width || 640;
    const pxDiff = Math.abs(this.caliperRightPx - this.caliperLeftPx);
    const screenWidthMm = 80; // 80mm screen
    const deltaXMm = (pxDiff / chartW) * screenWidthMm;

    // Derived lambda: lambda = (d / L) * deltaX
    const dM = state.slitDistanceMm * 1e-3;
    const LM = state.screenDistanceM;
    const calculatedLambdaNm = ((dM / LM) * (deltaXMm * 1e-3)) * 1e9;

    pill.textContent = `Δx = ${deltaXMm.toFixed(2)} mm · 验算 λ = ${Math.round(calculatedLambdaNm)} nm`;
  }

  private bindEvents(): void {
    // Segmented tab clicks
    this.element.querySelectorAll('.optics-segment-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const exp = btn.getAttribute('data-exp') as OpticsExperimentId;
        if (exp) this.manager.setExperiment(exp);
      });
    });

    // Laser power toggle
    this.element.querySelector('#btn-optics-laser-toggle')?.addEventListener('click', () => {
      this.manager.toggleLaserPower();
    });

    // Golden preset reset
    this.element.querySelector('#btn-optics-golden-reset')?.addEventListener('click', () => {
      this.manager.resetToGoldenPreset();
    });

    // Wavelength slider
    this.element.querySelector('#slider-optics-wavelength')?.addEventListener('input', (e) => {
      const val = parseFloat((e.target as HTMLInputElement).value);
      this.manager.setWavelength(val);
    });

    // Caliper drag interaction
    this.setupCaliperDrag();

    // Teacher Snapshot / Compare button
    this.element.querySelector('#btn-snapshot-compare')?.addEventListener('click', () => {
      this.captureSnapshot();
    });

    this.element.querySelector('#btn-clear-snapshots')?.addEventListener('click', () => {
      this.clearSnapshots();
    });
  }

  private setupCaliperDrag(): void {
    const leftHandle = this.element.querySelector('#caliper-left') as HTMLElement;
    const rightHandle = this.element.querySelector('#caliper-right') as HTMLElement;
    const chartWrap = this.element.querySelector('#optics-chart-wrapper') as HTMLElement;

    const onPointerMove = (e: PointerEvent) => {
      if (!this.isDraggingCaliper || !chartWrap) return;

      const rect = chartWrap.getBoundingClientRect();
      const relativeX = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
      const scaleToCanvas = 640 / rect.width;
      const canvasPx = relativeX * scaleToCanvas;

      if (this.isDraggingCaliper === 'left') {
        this.caliperLeftPx = Math.min(this.caliperRightPx - 10, canvasPx);
        leftHandle.style.left = `${(this.caliperLeftPx / 640) * 100}%`;
      } else {
        this.caliperRightPx = Math.max(this.caliperLeftPx + 10, canvasPx);
        rightHandle.style.left = `${(this.caliperRightPx / 640) * 100}%`;
      }

      this.updateCaliperReadout(this.manager.state);
    };

    const onPointerUp = () => {
      this.isDraggingCaliper = null;
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };

    leftHandle?.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      this.isDraggingCaliper = 'left';
      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', onPointerUp);
    });

    rightHandle?.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      this.isDraggingCaliper = 'right';
      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', onPointerUp);
    });

    // Toggle caliper visibility
    this.element.querySelector('#btn-toggle-caliper')?.addEventListener('click', (e) => {
      const btn = e.currentTarget as HTMLElement;
      const overlay = this.element.querySelector('#caliper-overlay');
      if (overlay) {
        const isHidden = overlay.classList.toggle('hidden');
        if (isHidden) btn.classList.remove('active');
        else btn.classList.add('active');
      }
    });
  }

  private captureSnapshot(): void {
    const shelf = this.element.querySelector('#optics-comparison-shelf') as HTMLElement;
    const shelfRow = this.element.querySelector('#shelf-cards-row') as HTMLElement;
    if (!shelf || !shelfRow) return;

    shelf.classList.remove('hidden');

    const snapCvs = document.createElement('canvas');
    snapCvs.width = 300;
    snapCvs.height = 70;
    const snapCtx = snapCvs.getContext('2d')!;

    // Copy current curve
    snapCtx.drawImage(this.curveCanvas, 0, 0, 300, 70);

    const card = document.createElement('div');
    card.className = 'shelf-card';
    card.innerHTML = `
      <div class="shelf-card-title">λ=${this.manager.state.wavelengthNm.toFixed(0)}nm · d=${this.manager.state.slitDistanceMm}mm</div>
    `;
    card.appendChild(snapCvs);
    shelfRow.appendChild(card);
  }

  private clearSnapshots(): void {
    const shelf = this.element.querySelector('#optics-comparison-shelf') as HTMLElement;
    const shelfRow = this.element.querySelector('#shelf-cards-row') as HTMLElement;
    if (shelf && shelfRow) {
      shelfRow.innerHTML = '';
      shelf.classList.add('hidden');
    }
  }

  public dispose(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
  }
}
