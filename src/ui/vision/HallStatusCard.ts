import { bindVisionSlider, isSliderActive } from './sliderGestureHelper.ts';

export type CarrierType = 'electron' | 'hole' | 'metal';

export interface HallTelemetryData {
  magFieldTesla: number;
  currentMa: number;
  waferThicknessMm: number;
  hallVoltageMv: number;
  hallCoefficientRh: number;
  hallSensitivityKh: number;
  carrierType: CarrierType;
  materialKey: string;
  driftVelocity?: number;
  driftVelocityMs?: number;
  lorentzForce?: number;
  lorentzForceN?: number;
  electricField?: number;
  hallElectricFieldVm?: number;
  waferWidthMm?: number;
  waferLengthMm?: number;
  materialName?: string;
  carrierConcentration?: number;
  carrierCharge?: number;
  mobilityCm2Vs?: number;
  conductivitySm?: number;
  showVectors?: boolean;
  showParticles?: boolean;
}

export interface HallStatusCardCallbacks {
  onBChange?: (bTesla: number) => void;
  onMagFieldChange?: (bTesla: number) => void;
  onIChange?: (iMilliAmps: number) => void;
  onCurrentChange?: (iMilliAmps: number) => void;
  onDChange?: (dMm: number) => void;
  onThicknessChange?: (dMm: number) => void;
  onMaterialChange?: (materialKey: string) => void;
  onCarrierConcentrationChange?: (n: number) => void;
  onCarrierChargeToggle?: () => void;
  onMobilityChange?: (mu: number) => void;
  onToggleFieldPolarity?: () => void;
  onToggleCurrentPolarity?: () => void;
  onToggleVectors?: (visible: boolean) => void;
  onToggleParticles?: (visible: boolean) => void;
  onResetStandard?: () => void;
}

export class HallStatusCard {
  public element: HTMLElement;
  private callbacks: HallStatusCardCallbacks;
  private isVisible = false;

  private currentData: HallTelemetryData = {
    magFieldTesla: 0.5,
    currentMa: 10.0,
    waferThicknessMm: 0.5,
    hallVoltageMv: -25.0,
    hallCoefficientRh: -5.0e-3,
    hallSensitivityKh: 10.0,
    carrierType: 'electron',
    materialKey: 'n-gaas',
    driftVelocity: 12.5,
    lorentzForce: 1.0e-18,
    electricField: 6.25,
  };

  private sliderB: HTMLInputElement | null = null;
  private sliderI: HTMLInputElement | null = null;
  private sliderD: HTMLInputElement | null = null;

  private valBEl: HTMLElement | null = null;
  private valIEl: HTMLElement | null = null;
  private valDEl: HTMLElement | null = null;
  private valVhEl: HTMLElement | null = null;
  private subEhEl: HTMLElement | null = null;

  private btnRevB: HTMLButtonElement | null = null;
  private btnRevI: HTMLButtonElement | null = null;
  private btnToggleVectors: HTMLButtonElement | null = null;
  private btnToggleParticles: HTMLButtonElement | null = null;
  private btnResetStandard: HTMLButtonElement | null = null;

  private segBtnN: HTMLButtonElement | null = null;
  private segBtnP: HTMLButtonElement | null = null;

  private dragHud: HTMLElement | null = null;
  private hudValText: HTMLElement | null = null;
  private hudBarFill: HTMLElement | null = null;
  private drawerValB: HTMLElement | null = null;
  private tokenValB: HTMLElement | null = null;
  private drawerEl: HTMLElement | null = null;

  private activeSliders = new Set<string>();

  constructor(callbacks: HallStatusCardCallbacks = {}) {
    this.callbacks = callbacks;
    this.createUI();
  }

  public get visible(): boolean {
    return this.isVisible;
  }

  public setVisible(visible: boolean): void {
    this.isVisible = visible;
    this.element.style.display = visible ? 'flex' : 'none';
  }

  private updateSliderTrackFill(slider: HTMLInputElement | null, min: number, max: number, value: number): void {
    if (!slider) return;
    const ratio = Math.max(0, Math.min(1, (value - min) / (max - min)));
    const pct = (ratio * 100).toFixed(1);
    slider.style.background = `linear-gradient(to right, rgba(255, 255, 255, 0.85) 0%, rgba(255, 255, 255, 0.85) ${pct}%, rgba(255, 255, 255, 0.14) ${pct}%, rgba(255, 255, 255, 0.14) 100%)`;
  }

  private createUI(): void {
    this.element = document.createElement('div');
    this.element.className = 'vision-hall-status-card hud-interactive';

    this.element.innerHTML = `
      <style>
        .vision-hall-status-card {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 100%;
          height: 100%;
          min-height: 480px;
          padding: 24px;
          box-sizing: border-box;
        }

        .apple-hall-panel {
          width: 100%;
          max-width: 520px;
          display: flex;
          flex-direction: column;
          gap: 16px;
          font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", "PingFang SC", "Helvetica Neue", sans-serif;
          user-select: none;
          -webkit-user-select: none;
        }

        .apple-seg-control {
          display: flex;
          background: rgba(0, 0, 0, 0.28);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 12px;
          padding: 3px;
          gap: 4px;
        }

        .apple-seg-btn {
          flex: 1;
          height: 34px;
          border-radius: 9px;
          border: none;
          background: transparent;
          color: rgba(255, 255, 255, 0.65);
          font-size: 13px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.18s ease;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
        }

        .apple-seg-btn.active {
          background: rgba(255, 255, 255, 0.14);
          color: #ffffff;
          font-weight: 600;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);
        }

        .apple-physics-group {
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-top: 1px solid rgba(255, 255, 255, 0.2);
          border-radius: 18px;
          overflow: hidden;
          box-shadow: 0 12px 32px rgba(0, 0, 0, 0.25);
        }

        .apple-physics-row {
          padding: 13px 18px;
          display: flex;
          flex-direction: column;
          gap: 5px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.06);
        }

        .apple-physics-row:last-child {
          border-bottom: none;
        }

        .apple-physics-row-header {
          display: flex;
          justify-content: space-between;
          align-items: baseline;
        }

        .apple-physics-label {
          font-size: 13.5px;
          font-weight: 500;
          color: rgba(255, 255, 255, 0.68);
          letter-spacing: -0.15px;
        }

        .apple-physics-readout {
          font-size: 14.5px;
          font-weight: 600;
          color: #ffffff;
          font-variant-numeric: tabular-nums;
          letter-spacing: -0.2px;
        }

        .apple-physics-slider {
          -webkit-appearance: none;
          appearance: none;
          width: 100%;
          height: 5px;
          border-radius: 9999px;
          outline: none;
          cursor: pointer;
          margin: 6px 0 2px 0;
          background: rgba(255, 255, 255, 0.14);
          transition: background 0.08s ease;
        }

        .apple-physics-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 18px;
          height: 18px;
          border-radius: 50%;
          background: #ffffff;
          box-shadow: 0 2px 6px rgba(0, 0, 0, 0.35), 0 0 1px rgba(0, 0, 0, 0.2);
          cursor: pointer;
          transition: transform 0.12s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.12s ease;
          border: none;
        }

        .apple-physics-slider::-webkit-slider-thumb:hover {
          transform: scale(1.12);
          box-shadow: 0 3px 8px rgba(0, 0, 0, 0.45);
        }

        .apple-physics-slider::-webkit-slider-thumb:active {
          transform: scale(0.96);
        }

        .apple-physics-slider::-moz-range-thumb {
          width: 18px;
          height: 18px;
          border-radius: 50%;
          background: #ffffff;
          box-shadow: 0 2px 6px rgba(0, 0, 0, 0.35);
          cursor: pointer;
          border: none;
        }

        .apple-physics-scale {
          display: flex;
          justify-content: space-between;
          font-size: 11px;
          color: rgba(255, 255, 255, 0.3);
          font-variant-numeric: tabular-nums;
          font-weight: 400;
        }

        .apple-actions-row {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 8px;
        }

        .apple-action-btn {
          height: 38px;
          border-radius: 11px;
          background: rgba(255, 255, 255, 0.05);
          color: rgba(255, 255, 255, 0.85);
          font-size: 12px;
          font-weight: 500;
          border: 1px solid rgba(255, 255, 255, 0.1);
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 5px;
          transition: all 0.18s ease;
        }

        .apple-action-btn:hover {
          background: rgba(255, 255, 255, 0.12);
          color: #ffffff;
        }

        .apple-action-btn.active {
          background: rgba(255, 255, 255, 0.18);
          border-color: rgba(255, 255, 255, 0.30);
          color: #ffffff;
        }
      </style>

      <div class="apple-hall-panel">
        <!-- 载流子极性切换分段控件 -->
        <div class="apple-seg-control">
          <button class="apple-seg-btn active" id="seg-mat-n" type="button">n型半导体 (e⁻ 电子载流子)</button>
          <button class="apple-seg-btn" id="seg-mat-p" type="button">p型半导体 (h⁺ 空穴载流子)</button>
        </div>

        <!-- 核心物理参数调节卡片 -->
        <div class="apple-physics-group">
          <!-- 垂直磁场 B -->
          <div class="apple-physics-row">
            <div class="apple-physics-row-header">
              <span class="apple-physics-label">垂直磁场 B</span>
              <span id="hall-val-b" class="apple-physics-readout">+0.50 T</span>
            </div>
            <input type="range" class="apple-physics-slider" id="slider-hall-b" min="-2.00" max="2.00" step="0.02" value="0.50" />
            <div class="apple-physics-scale">
              <span>-2.00 T</span>
              <span>0 T</span>
              <span>+2.00 T</span>
            </div>
          </div>

          <!-- 激励电流 I_S -->
          <div class="apple-physics-row">
            <div class="apple-physics-row-header">
              <span class="apple-physics-label">激励电流 I_S</span>
              <span id="hall-val-i" class="apple-physics-readout">+10.0 mA</span>
            </div>
            <input type="range" class="apple-physics-slider" id="slider-hall-i" min="-30.0" max="30.0" step="0.5" value="10.0" />
            <div class="apple-physics-scale">
              <span>-30.0 mA</span>
              <span>0 mA</span>
              <span>+30.0 mA</span>
            </div>
          </div>

          <!-- 晶片厚度 d -->
          <div class="apple-physics-row">
            <div class="apple-physics-row-header">
              <span class="apple-physics-label">晶片厚度 d</span>
              <span id="hall-val-d" class="apple-physics-readout">0.50 mm</span>
            </div>
            <input type="range" class="apple-physics-slider" id="slider-hall-d" min="0.05" max="1.50" step="0.05" value="0.50" />
            <div class="apple-physics-scale">
              <span>0.05 mm</span>
              <span>1.50 mm</span>
            </div>
          </div>

          <!-- 霍尔响应输出电压 V_H -->
          <div class="apple-physics-row">
            <div class="apple-physics-row-header">
              <span class="apple-physics-label">霍尔响应电压 V_H</span>
              <span id="hall-val-vh" class="apple-physics-readout">-25.00 mV</span>
            </div>
            <div class="apple-physics-scale" style="margin-top: 2px;">
              <span id="hall-sub-eh">电场: 6.25 V/m</span>
              <span id="hall-sub-vd">漂移速度: 12.5 m/s</span>
            </div>
          </div>
        </div>

        <!-- 辅助操作操作栏 -->
        <div class="apple-actions-row">
          <button class="apple-action-btn" id="btn-rev-b" type="button" title="反转磁场极性">
            <span>反向磁场</span>
          </button>
          <button class="apple-action-btn" id="btn-rev-i" type="button" title="反转电流极性">
            <span>反向电流</span>
          </button>
          <button class="apple-action-btn active" id="btn-toggle-vectors" type="button">
            <span>矢量场</span>
          </button>
          <button class="apple-action-btn" id="btn-reset-standard" type="button">
            <span>重置基准</span>
          </button>
        </div>

        <!-- Compatibility Drawer / HUD Elements for Vision Pro Hand Tracking -->
        <div id="hall-focus-drawer" style="display: contents;">
          <div class="hall-drag-hud" id="hall-drag-hud" style="display: none; opacity: 0;">
            <div class="hall-hud-bubble">
              <div class="hall-hud-val" id="hud-val-text">+0.50 T</div>
              <div class="hall-hud-bar"><div class="hall-hud-fill" id="hud-bar-fill" style="width: 50%;"></div></div>
            </div>
          </div>
          <div id="hall-sub-val-b" style="display: none;"></div>
          <div id="hall-token-b" style="display: none;"></div>
        </div>
      </div>
    `;

    this.sliderB = this.element.querySelector('#slider-hall-b');
    this.sliderI = this.element.querySelector('#slider-hall-i');
    this.sliderD = this.element.querySelector('#slider-hall-d');

    this.valBEl = this.element.querySelector('#hall-val-b');
    this.valIEl = this.element.querySelector('#hall-val-i');
    this.valDEl = this.element.querySelector('#hall-val-d');
    this.valVhEl = this.element.querySelector('#hall-val-vh');
    this.subEhEl = this.element.querySelector('#hall-sub-eh');

    this.btnRevB = this.element.querySelector('#btn-rev-b');
    this.btnRevI = this.element.querySelector('#btn-rev-i');
    this.btnToggleVectors = this.element.querySelector('#btn-toggle-vectors');
    this.btnResetStandard = this.element.querySelector('#btn-reset-standard');

    this.segBtnN = this.element.querySelector('#seg-mat-n');
    this.segBtnP = this.element.querySelector('#seg-mat-p');

    this.dragHud = this.element.querySelector('#hall-drag-hud');
    this.hudValText = this.element.querySelector('#hud-val-text');
    this.hudBarFill = this.element.querySelector('#hud-bar-fill');
    this.drawerValB = this.element.querySelector('#hall-sub-val-b');
    this.tokenValB = this.element.querySelector('#hall-token-b');
    this.drawerEl = this.element.querySelector('#hall-focus-drawer');

    this.updateSliderTrackFill(this.sliderB, -2.00, 2.00, 0.50);
    this.updateSliderTrackFill(this.sliderI, -30.0, 30.0, 10.0);
    this.updateSliderTrackFill(this.sliderD, 0.05, 1.50, 0.50);

    this.bindEvents();
  }

  private bindEvents(): void {
    bindVisionSlider(this.sliderB, {
      activeSet: this.activeSliders,
      onDragStart: () => {
        if (this.dragHud) {
          this.dragHud.style.display = 'block';
          this.dragHud.style.opacity = '1';
        }
      },
      onDragEnd: () => {
        if (this.dragHud) {
          this.dragHud.style.display = 'none';
          this.dragHud.style.opacity = '0';
        }
      },
      onChange: (val) => {
        this.updateSliderTrackFill(this.sliderB, -2.00, 2.00, val);
        this.callbacks.onBChange?.(val);
        this.callbacks.onMagFieldChange?.(val);
      },
      onScrub: (val, ratio) => {
        const sign = val >= 0 ? '+' : '';
        const text = `${sign}${val.toFixed(2)} T`;
        if (this.valBEl) this.valBEl.textContent = text;
        if (this.drawerValB) this.drawerValB.textContent = text;
        if (this.tokenValB) this.tokenValB.textContent = `${sign}${val.toFixed(1)} T`;
        if (this.hudValText) this.hudValText.textContent = text;
        if (this.hudBarFill) this.hudBarFill.style.width = `${(ratio * 100).toFixed(1)}%`;
        this.updateSliderTrackFill(this.sliderB, -2.00, 2.00, val);
      },
    });

    bindVisionSlider(this.sliderI, {
      activeSet: this.activeSliders,
      onChange: (val) => {
        this.updateSliderTrackFill(this.sliderI, -30.0, 30.0, val);
        this.callbacks.onIChange?.(val);
        this.callbacks.onCurrentChange?.(val);
      },
      onScrub: (val) => {
        const sign = val >= 0 ? '+' : '';
        if (this.valIEl) this.valIEl.textContent = `${sign}${val.toFixed(1)} mA`;
        this.updateSliderTrackFill(this.sliderI, -30.0, 30.0, val);
      },
    });

    bindVisionSlider(this.sliderD, {
      activeSet: this.activeSliders,
      onChange: (val) => {
        this.updateSliderTrackFill(this.sliderD, 0.05, 1.50, val);
        this.callbacks.onDChange?.(val);
        this.callbacks.onThicknessChange?.(val);
      },
      onScrub: (val) => {
        if (this.valDEl) this.valDEl.textContent = `${val.toFixed(2)} mm`;
        this.updateSliderTrackFill(this.sliderD, 0.05, 1.50, val);
      },
    });

    this.segBtnN?.addEventListener('click', () => {
      this.segBtnN?.classList.add('active');
      this.segBtnP?.classList.remove('active');
      this.callbacks.onMaterialChange?.('n-gaas');
    });

    this.segBtnP?.addEventListener('click', () => {
      this.segBtnP?.classList.add('active');
      this.segBtnN?.classList.remove('active');
      this.callbacks.onMaterialChange?.('p-silicon');
    });

    this.btnRevB?.addEventListener('click', () => {
      this.callbacks.onToggleFieldPolarity?.();
    });

    this.btnRevI?.addEventListener('click', () => {
      this.callbacks.onToggleCurrentPolarity?.();
    });

    let vectorsVisible = true;
    this.btnToggleVectors?.addEventListener('click', () => {
      vectorsVisible = !vectorsVisible;
      this.btnToggleVectors?.classList.toggle('active', vectorsVisible);
      this.callbacks.onToggleVectors?.(vectorsVisible);
    });

    this.btnResetStandard?.addEventListener('click', () => {
      this.callbacks.onResetStandard?.();
    });
  }

  public updateTelemetry(data: Partial<HallTelemetryData>): void {
    Object.assign(this.currentData, data);

    const b = this.currentData.magFieldTesla;
    const i = this.currentData.currentMa;
    const vh = this.currentData.hallVoltageMv;
    const d = this.currentData.waferThicknessMm;

    if (this.valVhEl) {
      const signVh = vh >= 0 ? '+' : '';
      this.valVhEl.textContent = `${signVh}${vh.toFixed(2)} mV`;
    }

    if (this.valBEl) {
      const signB = b >= 0 ? '+' : '';
      this.valBEl.textContent = `${signB}${b.toFixed(2)} T`;
    }

    if (this.valIEl) {
      const signI = i >= 0 ? '+' : '';
      this.valIEl.textContent = `${signI}${i.toFixed(1)} mA`;
    }

    if (this.valDEl) {
      this.valDEl.textContent = `${d.toFixed(2)} mm`;
    }

    if (this.subEhEl) {
      const eh = this.currentData.electricField ?? this.currentData.hallElectricFieldVm ?? 0;
      this.subEhEl.textContent = `电场: ${eh.toFixed(2)} V/m`;
    }

    const subVd = this.element.querySelector('#hall-sub-vd');
    if (subVd) {
      const vd = this.currentData.driftVelocity ?? this.currentData.driftVelocityMs ?? 0;
      subVd.textContent = `漂移速度: ${vd.toFixed(1)} m/s`;
    }

    if (this.sliderB && !isSliderActive(this.sliderB, this.activeSliders)) {
      this.sliderB.value = b.toString();
      this.updateSliderTrackFill(this.sliderB, -2.00, 2.00, b);
    }

    if (this.sliderI && !isSliderActive(this.sliderI, this.activeSliders)) {
      this.sliderI.value = i.toString();
      this.updateSliderTrackFill(this.sliderI, -30.0, 30.0, i);
    }

    if (this.sliderD && !isSliderActive(this.sliderD, this.activeSliders)) {
      this.sliderD.value = d.toString();
      this.updateSliderTrackFill(this.sliderD, 0.05, 1.50, d);
    }

    if (this.currentData.carrierType) {
      const isN = this.currentData.carrierType === 'electron';
      this.segBtnN?.classList.toggle('active', isN);
      this.segBtnP?.classList.toggle('active', !isN);
    }
  }
}
