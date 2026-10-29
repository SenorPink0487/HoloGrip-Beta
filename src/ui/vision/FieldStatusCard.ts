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
  | { type: 'toggleGaussian'; show: boolean }
  | { type: 'toggleEquipotential'; show: boolean }
  | { type: 'setDensity'; density: number }
  | { type: 'reset' };

export class FieldStatusCard {
  public element: HTMLElement;
  private onCommand: (cmd: FieldCommand) => void;
  private isVisible = false;
  private data: ElectrostaticTelemetry | null = null;
  private activeSliders = new Set<string>();
  private showGaussian = false;
  private showEquipotential = false;

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

        .apple-toggle-dot {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: rgba(255, 255, 255, 0.35);
          box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.28);
          flex-shrink: 0;
        }

        .apple-action-btn.is-on {
          background: rgba(255, 255, 255, 0.14);
          color: #ffffff;
          border-color: rgba(255, 255, 255, 0.28);
          border-top-color: rgba(255, 255, 255, 0.42);
          box-shadow: 0 4px 16px rgba(0, 0, 0, 0.25), inset 0 1px 0 rgba(255, 255, 255, 0.16);
        }

        #field-btn-gaussian.is-on .apple-toggle-dot {
          background: #fb7185;
          box-shadow: 0 0 8px rgba(251, 113, 133, 0.95);
        }

        #field-btn-equipotential.is-on .apple-toggle-dot {
          background: #38bdf8;
          box-shadow: 0 0 8px rgba(56, 189, 248, 0.95);
        }
      </style>

      <div class="apple-field-panel">
        <!-- 空间场强与电势 -->
        <div class="apple-physics-group">
          <!-- 局部电场 E -->
          <div class="apple-physics-row">
            <div class="apple-physics-row-header">
              <span class="apple-physics-label">探针电场强度 E</span>
              <span id="field-probe-e" class="apple-physics-readout">0.0 V/m</span>
            </div>
            <div class="apple-physics-scale" style="margin-top: 2px;">
              <span id="field-probe-pos">位置: (0.00, 0.16) m</span>
              <span id="field-probe-q">+1.00 nC</span>
            </div>
          </div>

          <!-- 局部电势 V 与库仑力 F -->
          <div class="apple-physics-row">
            <div class="apple-physics-row-header">
              <span class="apple-physics-label">局部空间电势 V</span>
              <span id="field-probe-v" class="apple-physics-readout">0.0 V</span>
            </div>
            <div class="apple-physics-scale" style="margin-top: 2px;">
              <span id="field-probe-f">受库仑力 F: 0.00 µN</span>
              <span id="field-u">相互作用能: 0.00 mJ</span>
            </div>
          </div>

          <!-- 系统净电量 -->
          <div class="apple-physics-row">
            <div class="apple-physics-row-header">
              <span class="apple-physics-label">系统净电量 Q_net</span>
              <span id="field-qnet" class="apple-physics-readout">0.00 µC</span>
            </div>
            <div class="apple-physics-scale" style="margin-top: 2px;">
              <span id="field-count">电荷总数 N = 0</span>
              <span id="field-dipole">偶极矩: 0.000 µC·m</span>
            </div>
          </div>

          <div class="apple-physics-row" id="field-surface-row" style="display:none">
            <div class="apple-physics-row-header">
              <span class="apple-physics-label" id="field-surface-label">高斯通量 Φ</span>
              <span id="field-surface-value" class="apple-physics-readout">—</span>
            </div>
            <div class="apple-physics-scale" style="margin-top: 2px;">
              <span id="field-surface-meta-left">Φ = Q_enc / ε₀</span>
              <span id="field-surface-meta-right"></span>
            </div>
          </div>

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

        <div class="apple-actions-row">
          <button class="apple-action-btn" id="field-btn-gaussian" type="button">
            <span class="apple-toggle-dot"></span>
            <span>显示高斯面</span>
          </button>
          <button class="apple-action-btn" id="field-btn-equipotential" type="button">
            <span class="apple-toggle-dot"></span>
            <span>显示等势面</span>
          </button>
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
    this.data = data;

    const qNetEl = this.element.querySelector('#field-qnet');
    const countEl = this.element.querySelector('#field-count');
    const uEl = this.element.querySelector('#field-u');
    const dipoleEl = this.element.querySelector('#field-dipole');
    const selectedQEl = this.element.querySelector('#field-selected-q') as HTMLElement | null;
    const selectedLabel = this.element.querySelector('#field-selected-label');
    const slider = this.element.querySelector('#field-charge-slider') as HTMLInputElement | null;

    if (qNetEl) qNetEl.textContent = `${data.totalChargeMicroC.toFixed(2)} µC`;
    if (countEl) countEl.textContent = `电荷总数 N = ${data.chargeCount}`;
    if (uEl) uEl.textContent = `${(data.potentialEnergyJoules * 1000).toFixed(2)} mJ`;
    if (dipoleEl) dipoleEl.textContent = `偶极矩: ${data.dipoleMomentMagnitude.toFixed(3)} µC·m`;

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

    const probeQEl = this.element.querySelector('#field-probe-q');
    const probePosEl = this.element.querySelector('#field-probe-pos');
    const probeEEl = this.element.querySelector('#field-probe-e');
    const probeVEl = this.element.querySelector('#field-probe-v');
    const probeFEl = this.element.querySelector('#field-probe-f');

    if (data.testCharge) {
      const tc = data.testCharge;
      if (probeQEl) probeQEl.textContent = `+${(tc.q0 * 1000).toFixed(2)} nC`;
      if (probePosEl) probePosEl.textContent = `探针: (${tc.x.toFixed(2)}, ${tc.y.toFixed(2)}) m`;

      if (probeEEl) {
        probeEEl.textContent =
          tc.fieldMagnitude >= 1000
            ? `${(tc.fieldMagnitude / 1000).toFixed(2)} kV/m`
            : `${tc.fieldMagnitude.toFixed(1)} V/m`;
      }

      if (probeVEl) {
        const sign = tc.potential >= 0 ? '+' : '';
        probeVEl.textContent = `${sign}${tc.potential.toFixed(1)} V`;
      }

      if (probeFEl) {
        const fMicroN = tc.forceMagnitude * 1e6;
        probeFEl.textContent =
          fMicroN >= 1.0
            ? `受库仑力 F: ${fMicroN.toFixed(2)} µN`
            : `受库仑力 F: ${(tc.forceMagnitude * 1e9).toFixed(1)} nN`;
      }
    }

    this.refreshSurfaceReadout();
  }

  public resetSurfaceToggles(): void {
    this.showGaussian = false;
    this.showEquipotential = false;
    this.element.querySelector('#field-btn-gaussian')?.classList.remove('is-on');
    this.element.querySelector('#field-btn-equipotential')?.classList.remove('is-on');
    this.refreshSurfaceReadout();
  }

  private refreshSurfaceReadout(): void {
    const row = this.element.querySelector('#field-surface-row') as HTMLElement | null;
    const label = this.element.querySelector('#field-surface-label');
    const value = this.element.querySelector('#field-surface-value');
    const metaLeft = this.element.querySelector('#field-surface-meta-left');
    const metaRight = this.element.querySelector('#field-surface-meta-right');
    if (!row) return;

    const visible = this.showGaussian || this.showEquipotential;
    row.style.display = visible ? '' : 'none';
    if (!visible || !this.data) return;

    const flux = this.data.gaussianFlux ?? 0;
    const radius = this.data.gaussianRadius ?? 0;
    const count = this.data.equipotentialCount ?? 0;
    const hasZero = Boolean(this.data.equipotentialHasZero);
    const selected = Boolean(this.data.selectedChargeId);

    if (this.showGaussian) {
      if (label) label.textContent = selected ? '选中高斯通量 Φ' : '净高斯通量 Φ_net';
      if (value) value.textContent = formatFlux(flux);
      if (metaLeft) metaLeft.textContent = radius > 0 ? `R = ${radius.toFixed(2)} m` : '各电荷独立高斯面';
      if (metaRight) {
        metaRight.textContent = this.showEquipotential
          ? `等势面 ${count} 层`
          : 'Φ = Q_enc / ε₀';
      }
      return;
    }

    if (label) label.textContent = '等势面';
    if (value) value.textContent = `${count} 层`;
    if (metaLeft) metaLeft.textContent = hasZero ? '银白面为 V = 0' : '闭合等势壳';
    if (metaRight) metaRight.textContent = 'V = 常量';
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
    this.element.querySelector('#field-btn-gaussian')?.addEventListener('click', () => {
      this.showGaussian = !this.showGaussian;
      this.element.querySelector('#field-btn-gaussian')?.classList.toggle('is-on', this.showGaussian);
      this.refreshSurfaceReadout();
      this.onCommand({ type: 'toggleGaussian', show: this.showGaussian });
    });
    this.element.querySelector('#field-btn-equipotential')?.addEventListener('click', () => {
      this.showEquipotential = !this.showEquipotential;
      this.element.querySelector('#field-btn-equipotential')?.classList.toggle('is-on', this.showEquipotential);
      this.refreshSurfaceReadout();
      this.onCommand({ type: 'toggleEquipotential', show: this.showEquipotential });
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

const SUPERSCRIPT_DIGITS = '⁰¹²³⁴⁵⁶⁷⁸⁹';

function formatFlux(value: number): string {
  if (!Number.isFinite(value) || Math.abs(value) < 1) return '0';
  const sign = value < 0 ? '-' : '+';
  const abs = Math.abs(value);
  const exp = Math.floor(Math.log10(abs));
  const mantissa = abs / 10 ** exp;
  const digits = String(Math.abs(exp))
    .split('')
    .map((digit) => SUPERSCRIPT_DIGITS[Number(digit)])
    .join('');
  const exponent = exp < 0 ? `⁻${digits}` : digits;
  return `${sign}${mantissa.toFixed(2)}×10${exponent} N·m²/C`;
}
