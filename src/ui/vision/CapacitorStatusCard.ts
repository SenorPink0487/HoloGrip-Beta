import type { SwitchPosition, CapacitorTelemetry } from '../../physics/em/capacitorDischarge.ts';
import { bindVisionSlider, isSliderActive } from './sliderGestureHelper.ts';

export interface CapacitorStatusCardCallbacks {
  onSetSwitchPosition?: (pos: SwitchPosition) => void;
  onVoltageChange?: (v: number) => void;
  onCapacitanceChange?: (c: number) => void;
  onResistanceChange?: (r: number) => void;
  onOpenWaveformWindow?: () => void;
  onClearSamples?: () => void;
  onResetExperiment?: () => void;
}

export class CapacitorStatusCard {
  public element: HTMLElement;
  private callbacks: CapacitorStatusCardCallbacks;
  private activeSliders = new Set<string>();

  // 滑块与输入控件
  private sliderVoltage: HTMLInputElement | null = null;
  private sliderCapacitance: HTMLInputElement | null = null;
  private sliderResistance: HTMLInputElement | null = null;

  // 数值显示标签
  private valVoltageText: HTMLElement | null = null;
  private valCapacitanceText: HTMLElement | null = null;
  private valResistanceText: HTMLElement | null = null;

  // 遥测指示文本
  private valCurrentText: HTMLElement | null = null;
  private valCapVoltageText: HTMLElement | null = null;
  private valTauText: HTMLElement | null = null;

  // 快捷按钮
  private btnCharge: HTMLElement | null = null;
  private btnNeutral: HTMLElement | null = null;
  private btnDischarge: HTMLElement | null = null;
  private btnOpenWaveform: HTMLElement | null = null;

  constructor(callbacks: CapacitorStatusCardCallbacks = {}) {
    this.callbacks = callbacks;

    this.element = document.createElement('div');
    this.element.className = 'vision-hall-status-card hud-interactive';

    this.render();
    this.bindEvents();
  }

  private updateSliderTrackFill(slider: HTMLInputElement | null, min: number, max: number, value: number): void {
    if (!slider) return;
    const ratio = Math.max(0, Math.min(1, (value - min) / (max - min)));
    const pct = (ratio * 100).toFixed(1);
    slider.style.background = `linear-gradient(to right, rgba(255, 255, 255, 0.85) 0%, rgba(255, 255, 255, 0.85) ${pct}%, rgba(255, 255, 255, 0.14) ${pct}%, rgba(255, 255, 255, 0.14) 100%)`;
  }

  private render(): void {
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

        @keyframes iosPanelFadeIn {
          0% {
            opacity: 0;
            transform: translate3d(0, 16px, 0) scale(0.985);
          }
          100% {
            opacity: 1;
            transform: translate3d(0, 0, 0) scale(1);
          }
        }

        .apple-cap-panel {
          width: 100%;
          max-width: 520px;
          display: flex;
          flex-direction: column;
          gap: 16px;
          font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", "PingFang SC", "Helvetica Neue", sans-serif;
          user-select: none;
          -webkit-user-select: none;
          animation: iosPanelFadeIn 0.38s cubic-bezier(0.25, 1, 0.5, 1) both;
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
          height: 36px;
          border-radius: 9px;
          border: none;
          background: transparent;
          color: rgba(255, 255, 255, 0.65);
          font-size: 13px;
          font-weight: 500;
          cursor: pointer;
          transition: transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1), background 0.2s ease, color 0.2s ease, box-shadow 0.25s ease;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
        }

        .apple-seg-btn:hover {
          color: #ffffff;
          background: rgba(255, 255, 255, 0.08);
        }

        .apple-seg-btn:active {
          transform: scale(0.95);
          transition: transform 0.10s cubic-bezier(0.2, 0, 0, 1);
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
          transition: transform 0.18s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.18s ease;
          border: none;
        }

        .apple-physics-slider::-webkit-slider-thumb:hover {
          transform: scale(1.14);
          box-shadow: 0 3px 8px rgba(0, 0, 0, 0.45);
        }

        .apple-physics-slider::-webkit-slider-thumb:active {
          transform: scale(1.25);
          box-shadow: 0 3px 10px rgba(0, 0, 0, 0.4), 0 0 0 4px rgba(10, 132, 255, 0.28);
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

        .apple-actions-group {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .apple-btn-primary {
          width: 100%;
          height: 44px;
          border-radius: 12px;
          background: rgba(255, 255, 255, 0.14);
          color: #ffffff;
          font-size: 14px;
          font-weight: 600;
          letter-spacing: -0.2px;
          border: 1px solid rgba(255, 255, 255, 0.18);
          border-top: 1px solid rgba(255, 255, 255, 0.32);
          box-shadow: 0 4px 16px rgba(0, 0, 0, 0.25), inset 0 1px 0 rgba(255, 255, 255, 0.15);
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          transition: transform 0.38s cubic-bezier(0.34, 1.56, 0.64, 1), background 0.2s ease, border-color 0.2s ease, box-shadow 0.3s ease, filter 0.12s ease;
        }

        .apple-btn-primary:hover {
          background: rgba(255, 255, 255, 0.22);
          border-color: rgba(255, 255, 255, 0.28);
          border-top-color: rgba(255, 255, 255, 0.45);
          box-shadow: 0 6px 20px rgba(0, 0, 0, 0.35);
          transform: translate3d(0, -1px, 0) scale(1.015);
        }

        .apple-btn-primary:active {
          background: rgba(255, 255, 255, 0.08);
          transform: translate3d(0, 0, 0) scale(0.95);
          filter: brightness(0.92);
          transition: transform 0.10s cubic-bezier(0.2, 0, 0, 1), filter 0.10s ease;
        }

        .apple-btn-row {
          display: flex;
          gap: 8px;
        }

        .apple-btn-secondary {
          flex: 1;
          height: 38px;
          border-radius: 11px;
          background: rgba(255, 255, 255, 0.05);
          color: rgba(255, 255, 255, 0.85);
          font-size: 12.5px;
          font-weight: 500;
          border: 1px solid rgba(255, 255, 255, 0.1);
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          transition: transform 0.38s cubic-bezier(0.34, 1.56, 0.64, 1), background 0.2s ease, border-color 0.2s ease, box-shadow 0.3s ease, filter 0.12s ease;
        }

        .apple-btn-secondary:hover {
          background: rgba(255, 255, 255, 0.12);
          color: #ffffff;
          transform: translate3d(0, -1px, 0) scale(1.015);
        }

        .apple-btn-secondary:active {
          transform: translate3d(0, 0, 0) scale(0.95);
          filter: brightness(0.92);
          transition: transform 0.10s cubic-bezier(0.2, 0, 0, 1), filter 0.10s ease;
        }
      </style>

      <div class="apple-cap-panel">
        <!-- 单刀双掷开关控制栏 -->
        <div class="apple-seg-control">
          <button class="apple-seg-btn" id="card-btn-charge" type="button">充电 (掷向电源)</button>
          <button class="apple-seg-btn active" id="card-btn-neutral" type="button">中立 (电路断开)</button>
          <button class="apple-seg-btn" id="card-btn-discharge" type="button">放电 (掷向电阻)</button>
        </div>

        <!-- 核心物理参数控制卡片 -->
        <div class="apple-physics-group">
          <!-- 电源电压 E -->
          <div class="apple-physics-row">
            <div class="apple-physics-row-header">
              <span class="apple-physics-label">电源电压 E</span>
              <span id="card-label-voltage" class="apple-physics-readout">3.0 V</span>
            </div>
            <input type="range" class="apple-physics-slider" id="slider-cap-voltage" min="1.5" max="6.0" step="1.5" value="3.0" />
            <div class="apple-physics-scale">
              <span>1.5 V</span>
              <span>6.0 V</span>
            </div>
          </div>

          <!-- 电容容量 C -->
          <div class="apple-physics-row">
            <div class="apple-physics-row-header">
              <span class="apple-physics-label">电容容量 C</span>
              <span id="card-label-capacitance" class="apple-physics-readout">1000 µF</span>
            </div>
            <input type="range" class="apple-physics-slider" id="slider-cap-c" min="100" max="3000" step="50" value="1000" />
            <div class="apple-physics-scale">
              <span>100 µF</span>
              <span>3000 µF</span>
            </div>
          </div>

          <!-- 放电电阻 R -->
          <div class="apple-physics-row">
            <div class="apple-physics-row-header">
              <span class="apple-physics-label">放电电阻 R</span>
              <span id="card-label-resistance" class="apple-physics-readout">1000 Ω</span>
            </div>
            <input type="range" class="apple-physics-slider" id="slider-cap-r" min="200" max="3000" step="50" value="1000" />
            <div class="apple-physics-scale">
              <span>200 Ω</span>
              <span>3000 Ω</span>
            </div>
          </div>

          <!-- 时间常数 τ 与瞬态遥测 -->
          <div class="apple-physics-row">
            <div class="apple-physics-row-header">
              <span class="apple-physics-label">时间常数 τ = RC</span>
              <span id="card-val-tau" class="apple-physics-readout">1.00 s</span>
            </div>
            <div class="apple-physics-scale" style="margin-top: 2px;">
              <span>端电压: <b id="card-val-cap-voltage" style="color: #ffffff;">0.00 V</b></span>
              <span>瞬时电流: <b id="card-val-current" style="color: #ffffff;">0.00 mA</b></span>
              <span>电量: <b id="card-val-charge" style="color: #ffffff;">0.00 mC</b></span>
            </div>
          </div>
        </div>

        <!-- 操作按钮组 -->
        <div class="apple-actions-group">
          <button class="apple-btn-primary" id="btn-open-floating-waveform" type="button">
            <span>置顶示波器波形视窗</span>
          </button>
          <div class="apple-btn-row">
            <button class="apple-btn-secondary" id="card-btn-clear" type="button">清空采样波形</button>
            <button class="apple-btn-secondary" id="card-btn-reset" type="button">重置电路状态</button>
          </div>
        </div>
      </div>
    `;

    this.valCurrentText = this.element.querySelector('#card-val-current');
    this.valCapVoltageText = this.element.querySelector('#card-val-cap-voltage');
    this.valTauText = this.element.querySelector('#card-val-tau');
    this.valVoltageText = this.element.querySelector('#card-label-voltage');
    this.valCapacitanceText = this.element.querySelector('#card-label-capacitance');
    this.valResistanceText = this.element.querySelector('#card-label-resistance');

    this.sliderVoltage = this.element.querySelector('#slider-cap-voltage');
    this.sliderCapacitance = this.element.querySelector('#slider-cap-c');
    this.sliderResistance = this.element.querySelector('#slider-cap-r');

    this.btnCharge = this.element.querySelector('#card-btn-charge');
    this.btnNeutral = this.element.querySelector('#card-btn-neutral');
    this.btnDischarge = this.element.querySelector('#card-btn-discharge');
    this.btnOpenWaveform = this.element.querySelector('#btn-open-floating-waveform');

    this.updateSliderTrackFill(this.sliderVoltage, 1.5, 6.0, 3.0);
    this.updateSliderTrackFill(this.sliderCapacitance, 100, 3000, 1000);
    this.updateSliderTrackFill(this.sliderResistance, 200, 3000, 1000);
  }

  private bindEvents(): void {
    if (this.sliderVoltage) {
      bindVisionSlider(this.sliderVoltage, {
        activeSet: this.activeSliders,
        onChange: (val) => {
          this.updateSliderTrackFill(this.sliderVoltage, 1.5, 6.0, val);
          this.callbacks.onVoltageChange?.(val);
        },
        onScrub: (val) => {
          if (this.valVoltageText) this.valVoltageText.textContent = `${val.toFixed(1)} V`;
          this.updateSliderTrackFill(this.sliderVoltage, 1.5, 6.0, val);
        },
      });
    }

    if (this.sliderCapacitance) {
      bindVisionSlider(this.sliderCapacitance, {
        activeSet: this.activeSliders,
        onChange: (val) => {
          this.updateSliderTrackFill(this.sliderCapacitance, 100, 3000, val);
          this.callbacks.onCapacitanceChange?.(val);
        },
        onScrub: (val) => {
          if (this.valCapacitanceText) this.valCapacitanceText.textContent = `${Math.round(val)} µF`;
          this.updateSliderTrackFill(this.sliderCapacitance, 100, 3000, val);
        },
      });
    }

    if (this.sliderResistance) {
      bindVisionSlider(this.sliderResistance, {
        activeSet: this.activeSliders,
        onChange: (val) => {
          this.updateSliderTrackFill(this.sliderResistance, 200, 3000, val);
          this.callbacks.onResistanceChange?.(val);
        },
        onScrub: (val) => {
          if (this.valResistanceText) this.valResistanceText.textContent = `${Math.round(val)} Ω`;
          this.updateSliderTrackFill(this.sliderResistance, 200, 3000, val);
        },
      });
    }

    this.btnCharge?.addEventListener('click', () => {
      this.callbacks.onSetSwitchPosition?.('charge');
    });

    this.btnNeutral?.addEventListener('click', () => {
      this.callbacks.onSetSwitchPosition?.('neutral');
    });

    this.btnDischarge?.addEventListener('click', () => {
      this.callbacks.onSetSwitchPosition?.('discharge');
    });

    this.btnOpenWaveform?.addEventListener('click', () => {
      this.callbacks.onOpenWaveformWindow?.();
    });

    this.element.querySelector('#card-btn-clear')?.addEventListener('click', () => {
      this.callbacks.onClearSamples?.();
    });

    this.element.querySelector('#card-btn-reset')?.addEventListener('click', () => {
      this.callbacks.onResetExperiment?.();
    });
  }

  public updateTelemetry(telem: CapacitorTelemetry): void {
    this.btnCharge?.classList.toggle('active', telem.switchPosition === 'charge');
    this.btnNeutral?.classList.toggle('active', telem.switchPosition === 'neutral');
    this.btnDischarge?.classList.toggle('active', telem.switchPosition === 'discharge');

    if (this.valCurrentText) {
      const sign = telem.currentMa > 0 ? '+' : '';
      this.valCurrentText.textContent = `${sign}${telem.currentMa.toFixed(2)} mA`;
    }
    if (this.valCapVoltageText) {
      this.valCapVoltageText.textContent = `${telem.voltageCapacitor.toFixed(2)} V`;
    }
    if (this.valTauText) {
      this.valTauText.textContent = `${telem.timeConstantTau.toFixed(2)} s`;
    }

    const qEl = this.element.querySelector('#card-val-charge');
    if (qEl) {
      qEl.textContent = `${telem.chargeMilliCoulomb.toFixed(2)} mC`;
    }

    if (this.sliderVoltage && !isSliderActive(this.sliderVoltage, this.activeSliders)) {
      this.sliderVoltage.value = String(telem.voltageSupply);
      if (this.valVoltageText) this.valVoltageText.textContent = `${telem.voltageSupply.toFixed(1)} V`;
      this.updateSliderTrackFill(this.sliderVoltage, 1.5, 6.0, telem.voltageSupply);
    }
    if (this.sliderCapacitance && !isSliderActive(this.sliderCapacitance, this.activeSliders)) {
      this.sliderCapacitance.value = String(telem.capacitanceUf);
      if (this.valCapacitanceText) this.valCapacitanceText.textContent = `${Math.round(telem.capacitanceUf)} µF`;
      this.updateSliderTrackFill(this.sliderCapacitance, 100, 3000, telem.capacitanceUf);
    }
    if (this.sliderResistance && !isSliderActive(this.sliderResistance, this.activeSliders)) {
      this.sliderResistance.value = String(telem.dischargeResistanceOhm);
      if (this.valResistanceText) this.valResistanceText.textContent = `${Math.round(telem.dischargeResistanceOhm)} Ω`;
      this.updateSliderTrackFill(this.sliderResistance, 200, 3000, telem.dischargeResistanceOhm);
    }
  }

  public setVisible(visible: boolean): void {
    this.element.style.display = visible ? 'flex' : 'none';
  }
}
