import type { ElectrostaticTelemetry } from '../../physics/em/electrostatic.ts';
import { bindVisionSlider, isSliderActive } from './sliderGestureHelper.ts';

export type FieldCommand =
  | { type: 'addCharge'; q: number }
  | { type: 'removeCharge'; id?: string }
  | { type: 'clearCharges' }
  | { type: 'selectCharge'; id: string | null }
  | { type: 'setChargeMagnitude'; q: number }
  | { type: 'setPreset'; presetKey: string }
  | { type: 'toggleLines'; show: boolean }
  | { type: 'toggleFlow'; show: boolean }
  | { type: 'setDensity'; density: number }
  | { type: 'reset' };

export class FieldStatusCard {
  public element: HTMLElement;
  private onCommand: (cmd: FieldCommand) => void;
  private isVisible = false;
  private activeSliders = new Set<string>();

  constructor(onCommand: (cmd: FieldCommand) => void = () => {}) {
    this.onCommand = onCommand;
    this.element = document.createElement('div');
    this.element.className = 'vision-hall-status-card hud-interactive';

    this.render();
    this.bind();
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

        .apple-field-panel {
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

        .apple-physics-slider:disabled {
          opacity: 0.3;
          cursor: not-allowed;
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

        .apple-actions-row {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 8px;
        }

        .apple-action-btn {
          height: 40px;
          border-radius: 12px;
          background: rgba(255, 255, 255, 0.05);
          color: rgba(255, 255, 255, 0.85);
          font-size: 13px;
          font-weight: 500;
          border: 1px solid rgba(255, 255, 255, 0.1);
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          transition: transform 0.38s cubic-bezier(0.34, 1.56, 0.64, 1), background 0.2s ease, border-color 0.2s ease, box-shadow 0.3s ease, filter 0.12s ease;
        }

        .apple-action-btn:hover {
          background: rgba(255, 255, 255, 0.12);
          color: #ffffff;
          transform: translate3d(0, -1px, 0) scale(1.015);
        }

        .apple-action-btn:active {
          transform: translate3d(0, 0, 0) scale(0.95);
          filter: brightness(0.92);
          transition: transform 0.10s cubic-bezier(0.2, 0, 0, 1), filter 0.10s ease;
        }

        .apple-action-btn.btn-primary {
          background: rgba(255, 255, 255, 0.14);
          color: #ffffff;
          border-color: rgba(255, 255, 255, 0.22);
          border-top-color: rgba(255, 255, 255, 0.35);
          font-weight: 600;
          box-shadow: 0 4px 16px rgba(0, 0, 0, 0.25), inset 0 1px 0 rgba(255, 255, 255, 0.15);
        }

        .apple-action-btn.btn-primary:hover {
          background: rgba(255, 255, 255, 0.22);
          border-color: rgba(255, 255, 255, 0.32);
          box-shadow: 0 6px 20px rgba(0, 0, 0, 0.35);
        }
      </style>

      <div class="apple-field-panel">
        <div class="apple-physics-group">
          <!-- 选中电荷微调滑块 -->
          <div class="apple-physics-row">
            <div class="apple-physics-row-header">
              <span class="apple-physics-label" id="field-selected-label">选中电荷量 Q</span>
              <span id="field-selected-q" class="apple-physics-readout">未选中</span>
            </div>
            <input type="range" class="apple-physics-slider" id="field-charge-slider" min="-5" max="5" step="0.5" value="2" disabled />
            <div class="apple-physics-scale">
              <span>-5.0 µC</span>
              <span>0 (中性)</span>
              <span>+5.0 µC</span>
            </div>
          </div>
        </div>

        <!-- 操作按钮网格 -->
        <div class="apple-actions-row">
          <button class="apple-action-btn btn-primary" id="field-btn-add-pos" type="button">
            <span>+ 添加正电荷 (+2µC)</span>
          </button>
          <button class="apple-action-btn" id="field-btn-add-neg" type="button">
            <span>- 添加负电荷 (-2µC)</span>
          </button>
          <button class="apple-action-btn" id="field-btn-del" type="button">
            <span>删除选中电荷</span>
          </button>
          <button class="apple-action-btn" id="field-btn-clear" type="button">
            <span>清空空间电荷</span>
          </button>
          <button class="apple-action-btn" id="field-btn-reset" type="button">
            <span>重置场景</span>
          </button>
        </div>
      </div>
    `;
  }

  public setVisible(visible: boolean): void {
    this.isVisible = visible;
    this.element.style.display = visible ? 'flex' : 'none';
  }

  public updateTelemetry(data: ElectrostaticTelemetry): void {
    const selectedQEl = this.element.querySelector('#field-selected-q') as HTMLElement | null;
    const selectedLabel = this.element.querySelector('#field-selected-label');
    const slider = this.element.querySelector('#field-charge-slider') as HTMLInputElement | null;

    if (data.selectedChargeId) {
      const qVal = data.selectedChargeValue;
      const qStr = `${qVal > 0 ? '+' : ''}${qVal.toFixed(1)} µC`;
      if (selectedQEl) selectedQEl.textContent = qStr;
      if (selectedLabel) selectedLabel.textContent = `选中电荷 #${data.selectedChargeId}`;
      if (slider) {
        slider.disabled = false;
        if (!isSliderActive(slider, this.activeSliders)) {
          slider.value = String(qVal);
          this.updateSliderTrackFill(slider, -5, 5, qVal);
        }
      }
    } else {
      if (selectedQEl) selectedQEl.textContent = '未选中';
      if (selectedLabel) selectedLabel.textContent = '选中电荷量 Q';
      if (slider) {
        slider.disabled = true;
      }
    }
  }

  private bind(): void {
    this.element.querySelector('#field-btn-add-pos')?.addEventListener('click', () => {
      this.onCommand({ type: 'addCharge', q: 2.0 });
    });
    this.element.querySelector('#field-btn-add-neg')?.addEventListener('click', () => {
      this.onCommand({ type: 'addCharge', q: -2.0 });
    });
    this.element.querySelector('#field-btn-del')?.addEventListener('click', () => {
      this.onCommand({ type: 'removeCharge' });
    });
    this.element.querySelector('#field-btn-clear')?.addEventListener('click', () => {
      this.onCommand({ type: 'clearCharges' });
    });
    this.element.querySelector('#field-btn-reset')?.addEventListener('click', () => {
      this.onCommand({ type: 'reset' });
    });

    const slider = this.element.querySelector('#field-charge-slider') as HTMLInputElement | null;
    if (slider) {
      bindVisionSlider(slider, {
        activeSet: this.activeSliders,
        onChange: (q: number) => {
          this.updateSliderTrackFill(slider, -5, 5, q);
          this.onCommand({ type: 'setChargeMagnitude', q });
        },
        onScrub: (q: number) => {
          const selectedQEl = this.element.querySelector('#field-selected-q') as HTMLElement | null;
          if (selectedQEl) {
            selectedQEl.textContent = `${q > 0 ? '+' : ''}${q.toFixed(1)} µC`;
          }
          this.updateSliderTrackFill(slider, -5, 5, q);
        },
      });
    }
  }
}
