import type { NewtonCannonTelemetry } from '../../physics/mech/newtonCannonDynamics.ts';
import { bindVisionSlider, isSliderActive } from './sliderGestureHelper.ts';

export interface NewtonCannonStatusCardCallbacks {
  onLaunch?: () => void;
  onClear?: () => void;
  onReset?: () => void;
  onMinVelocityChange?: (v: number) => void;
  onMaxVelocityChange?: (v: number) => void;
  onParticleCountChange?: (count: number) => void;
  onPreset?: (preset: 'suborbital' | 'orbital' | 'escape' | 'spectrum') => void;
}

export class NewtonCannonStatusCard {
  public element: HTMLElement;
  private callbacks: NewtonCannonStatusCardCallbacks;
  private isVisible = false;

  private activeSliders = new Set<string>();

  // 极简核心交互控件
  private sliderVMin: HTMLInputElement | null = null;
  private sliderVMax: HTMLInputElement | null = null;
  private sliderCount: HTMLInputElement | null = null;
  private readoutVMin: HTMLElement | null = null;
  private readoutVMax: HTMLElement | null = null;
  private readoutCount: HTMLElement | null = null;
  private btnLaunch: HTMLButtonElement | null = null;

  private currentVMin = 3.5;
  private currentVMax = 11.2;
  private currentCount = 8;

  constructor(callbacks: NewtonCannonStatusCardCallbacks = {}) {
    this.callbacks = callbacks;
    this.element = document.createElement('div');
    this.element.className = 'vision-newton-status-card hud-interactive';
    this.render();
    this.bindEvents();
  }

  public setVisible(show: boolean): void {
    this.isVisible = show;
    this.element.style.display = show ? 'flex' : 'none';
  }

  public get visible(): boolean {
    return this.isVisible;
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
        .vision-newton-status-card {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 100%;
          height: 100%;
          min-height: 480px;
          padding: 32px 24px;
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

        .apple-newton-panel {
          width: 100%;
          max-width: 480px;
          display: flex;
          flex-direction: column;
          gap: 12px;
          font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", "PingFang SC", "Helvetica Neue", sans-serif;
          user-select: none;
          -webkit-user-select: none;
          animation: iosPanelFadeIn 0.38s cubic-bezier(0.25, 1, 0.5, 1) both;
        }

        .apple-newton-group {
          background: rgba(20, 24, 35, 0.72);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-top: 1px solid rgba(255, 255, 255, 0.2);
          border-radius: 18px;
          overflow: hidden;
          box-shadow: 0 12px 32px rgba(0, 0, 0, 0.25);
        }

        .apple-newton-row {
          padding: 16px 20px;
          display: flex;
          flex-direction: column;
          gap: 6px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.06);
        }

        .apple-newton-row:last-child {
          border-bottom: none;
        }

        .apple-newton-row-header {
          display: flex;
          justify-content: space-between;
          align-items: baseline;
        }

        .apple-newton-label {
          font-size: 14px;
          font-weight: 500;
          color: rgba(255, 255, 255, 0.68);
          letter-spacing: -0.15px;
        }

        .apple-newton-readout {
          font-size: 15px;
          font-weight: 600;
          color: #ffffff;
          font-variant-numeric: tabular-nums;
          letter-spacing: -0.2px;
        }

        .apple-newton-slider {
          -webkit-appearance: none;
          appearance: none;
          width: 100%;
          height: 5px;
          border-radius: 9999px;
          outline: none;
          cursor: pointer;
          margin: 8px 0 3px 0;
          background: rgba(255, 255, 255, 0.14);
          transition: background 0.08s ease;
        }

        .apple-newton-slider::-webkit-slider-thumb {
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

        .apple-newton-slider::-webkit-slider-thumb:hover {
          transform: scale(1.14);
          box-shadow: 0 3px 8px rgba(0, 0, 0, 0.45);
        }

        .apple-newton-slider::-webkit-slider-thumb:active {
          transform: scale(1.25);
          box-shadow: 0 3px 10px rgba(0, 0, 0, 0.4), 0 0 0 4px rgba(10, 132, 255, 0.28);
        }

        .apple-newton-slider::-moz-range-thumb {
          width: 18px;
          height: 18px;
          border-radius: 50%;
          background: #ffffff;
          box-shadow: 0 2px 6px rgba(0, 0, 0, 0.35);
          cursor: pointer;
          border: none;
        }

        .apple-newton-scale {
          display: flex;
          justify-content: space-between;
          font-size: 11px;
          color: rgba(255, 255, 255, 0.3);
          font-variant-numeric: tabular-nums;
          font-weight: 400;
        }

        .apple-newton-launch-btn {
          width: 100%;
          height: 50px;
          border-radius: 18px;
          background: rgba(20, 24, 35, 0.72);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-top: 1px solid rgba(255, 255, 255, 0.2);
          box-shadow: 0 12px 32px rgba(0, 0, 0, 0.25);
          backdrop-filter: blur(30px);
          -webkit-backdrop-filter: blur(30px);
          color: #ffffff;
          font-size: 18px;
          font-weight: 600;
          letter-spacing: 1px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: transform 0.38s cubic-bezier(0.34, 1.56, 0.64, 1), background 0.2s ease, border-color 0.2s ease, box-shadow 0.3s ease, filter 0.12s ease;
          outline: none;
          user-select: none;
          -webkit-user-select: none;
        }

        .apple-newton-launch-btn:hover {
          background: rgba(30, 36, 52, 0.85);
          border-color: rgba(255, 255, 255, 0.16);
          border-top-color: rgba(255, 255, 255, 0.35);
          box-shadow: 0 14px 36px rgba(0, 0, 0, 0.35);
          transform: translate3d(0, -1px, 0) scale(1.015);
        }

        .apple-newton-launch-btn:active {
          background: rgba(14, 18, 28, 0.85);
          transform: translate3d(0, 0, 0) scale(0.95);
          filter: brightness(0.92);
          transition: transform 0.10s cubic-bezier(0.2, 0, 0, 1), filter 0.10s ease;
          box-shadow: 0 4px 14px rgba(0, 0, 0, 0.2);
        }

        .apple-newton-launch-btn.firing {
          background: rgba(35, 45, 65, 0.9);
          border-color: rgba(255, 255, 255, 0.25);
          border-top-color: rgba(255, 255, 255, 0.45);
        }
      </style>

      <div class="apple-newton-panel">
        <!-- 上方参数控制卡片 -->
        <div class="apple-newton-group">
          <!-- 速度下限 -->
          <div class="apple-newton-row">
            <div class="apple-newton-row-header">
              <span class="apple-newton-label">速度下限</span>
              <span id="card-readout-vmin" class="apple-newton-readout">3.5 km/s</span>
            </div>
            <input type="range" id="newton-slider-vmin" class="apple-newton-slider" min="1.0" max="15.0" step="0.1" value="3.5">
            <div class="apple-newton-scale">
              <span>1.0 km/s</span>
              <span>15.0 km/s</span>
            </div>
          </div>

          <!-- 速度上限 -->
          <div class="apple-newton-row">
            <div class="apple-newton-row-header">
              <span class="apple-newton-label">速度上限</span>
              <span id="card-readout-vmax" class="apple-newton-readout">11.2 km/s</span>
            </div>
            <input type="range" id="newton-slider-vmax" class="apple-newton-slider" min="2.0" max="16.0" step="0.1" value="11.2">
            <div class="apple-newton-scale">
              <span>2.0 km/s</span>
              <span>16.0 km/s</span>
            </div>
          </div>

          <!-- 粒子数量 -->
          <div class="apple-newton-row">
            <div class="apple-newton-row-header">
              <span class="apple-newton-label">粒子数量</span>
              <span id="card-readout-count" class="apple-newton-readout">8 颗</span>
            </div>
            <input type="range" id="newton-slider-count" class="apple-newton-slider" min="1" max="15" step="1" value="8">
            <div class="apple-newton-scale">
              <span>1 颗</span>
              <span>15 颗</span>
            </div>
          </div>
        </div>

        <!-- 下方发射操作块（与上方卡片风格完全一致，保持双块独立布局） -->
        <button id="card-btn-launch" class="apple-newton-launch-btn" type="button">
          <span>发射</span>
        </button>
      </div>
    `;

    this.sliderVMin = this.element.querySelector('#newton-slider-vmin');
    this.sliderVMax = this.element.querySelector('#newton-slider-vmax');
    this.sliderCount = this.element.querySelector('#newton-slider-count');

    this.readoutVMin = this.element.querySelector('#card-readout-vmin');
    this.readoutVMax = this.element.querySelector('#card-readout-vmax');
    this.readoutCount = this.element.querySelector('#card-readout-count');
    this.btnLaunch = this.element.querySelector('#card-btn-launch');

    this.updateSliderTrackFill(this.sliderVMin, 1.0, 15.0, this.currentVMin);
    this.updateSliderTrackFill(this.sliderVMax, 2.0, 16.0, this.currentVMax);
    this.updateSliderTrackFill(this.sliderCount, 1, 15, this.currentCount);
  }

  private bindEvents(): void {
    this.btnLaunch?.addEventListener('click', () => {
      this.callbacks.onLaunch?.();
    });

    // 初速下限滑块
    bindVisionSlider(this.sliderVMin, {
      activeSet: this.activeSliders,
      onChange: (val) => {
        const clampedMin = Math.max(1.0, Math.min(this.currentVMax - 0.2, Number(val.toFixed(1))));
        this.currentVMin = clampedMin;
        if (this.sliderVMin && Number(this.sliderVMin.value) !== clampedMin) {
          this.sliderVMin.value = String(clampedMin);
        }
        if (this.readoutVMin) this.readoutVMin.textContent = `${clampedMin.toFixed(1)} km/s`;
        this.updateSliderTrackFill(this.sliderVMin, 1.0, 15.0, clampedMin);
        this.callbacks.onMinVelocityChange?.(clampedMin);
      },
    });

    // 初速上限滑块
    bindVisionSlider(this.sliderVMax, {
      activeSet: this.activeSliders,
      onChange: (val) => {
        const clampedMax = Math.max(this.currentVMin + 0.2, Math.min(16.0, Number(val.toFixed(1))));
        this.currentVMax = clampedMax;
        if (this.sliderVMax && Number(this.sliderVMax.value) !== clampedMax) {
          this.sliderVMax.value = String(clampedMax);
        }
        if (this.readoutVMax) this.readoutVMax.textContent = `${clampedMax.toFixed(1)} km/s`;
        this.updateSliderTrackFill(this.sliderVMax, 2.0, 16.0, clampedMax);
        this.callbacks.onMaxVelocityChange?.(clampedMax);
      },
    });

    // 粒子数量滑块
    bindVisionSlider(this.sliderCount, {
      activeSet: this.activeSliders,
      onChange: (val) => {
        const count = Math.max(1, Math.min(15, Math.round(val)));
        this.currentCount = count;
        if (this.sliderCount && Number(this.sliderCount.value) !== count) {
          this.sliderCount.value = String(count);
        }
        if (this.readoutCount) this.readoutCount.textContent = `${count} 颗`;
        this.updateSliderTrackFill(this.sliderCount, 1, 15, count);
        this.callbacks.onParticleCountChange?.(count);
      },
    });
  }

  public applyLocalPreset(count: number, minV: number, maxV: number): void {
    this.currentCount = count;
    this.currentVMin = minV;
    this.currentVMax = maxV;
    if (this.sliderCount) {
      this.sliderCount.value = String(count);
      this.updateSliderTrackFill(this.sliderCount, 1, 15, count);
    }
    if (this.sliderVMin) {
      this.sliderVMin.value = String(minV);
      this.updateSliderTrackFill(this.sliderVMin, 1.0, 15.0, minV);
    }
    if (this.sliderVMax) {
      this.sliderVMax.value = String(maxV);
      this.updateSliderTrackFill(this.sliderVMax, 2.0, 16.0, maxV);
    }
    if (this.readoutCount) this.readoutCount.textContent = `${count} 颗`;
    if (this.readoutVMin) this.readoutVMin.textContent = `${minV.toFixed(1)} km/s`;
    if (this.readoutVMax) this.readoutVMax.textContent = `${maxV.toFixed(1)} km/s`;
  }

  /**
   * 接收外部动力学遥测配置更新
   */
  public updateTelemetry(
    _telemetry: NewtonCannonTelemetry,
    config?: { particleCount: number; minVelocityKmS: number; maxVelocityKmS: number }
  ): void {
    if (!this.isVisible) return;

    // 仅在滑块未被用户拖拽时同步外部配置
    if (config) {
      if (this.sliderVMin && !isSliderActive(this.sliderVMin, this.activeSliders)) {
        if (Math.abs(this.currentVMin - config.minVelocityKmS) > 1e-4) {
          this.currentVMin = config.minVelocityKmS;
          this.sliderVMin.value = String(config.minVelocityKmS);
          if (this.readoutVMin) this.readoutVMin.textContent = `${config.minVelocityKmS.toFixed(1)} km/s`;
          this.updateSliderTrackFill(this.sliderVMin, 1.0, 15.0, config.minVelocityKmS);
        }
      }
      if (this.sliderVMax && !isSliderActive(this.sliderVMax, this.activeSliders)) {
        if (Math.abs(this.currentVMax - config.maxVelocityKmS) > 1e-4) {
          this.currentVMax = config.maxVelocityKmS;
          this.sliderVMax.value = String(config.maxVelocityKmS);
          if (this.readoutVMax) this.readoutVMax.textContent = `${config.maxVelocityKmS.toFixed(1)} km/s`;
          this.updateSliderTrackFill(this.sliderVMax, 2.0, 16.0, config.maxVelocityKmS);
        }
      }
      if (this.sliderCount && !isSliderActive(this.sliderCount, this.activeSliders)) {
        if (this.currentCount !== config.particleCount) {
          this.currentCount = config.particleCount;
          this.sliderCount.value = String(config.particleCount);
          if (this.readoutCount) this.readoutCount.textContent = `${config.particleCount} 颗`;
          this.updateSliderTrackFill(this.sliderCount, 1, 15, config.particleCount);
        }
      }
    }
  }
}
