import type { ElectrostaticTelemetry } from '../../physics/em/electrostatic.ts';

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
  private data: ElectrostaticTelemetry | null = null;

  constructor(onCommand: (cmd: FieldCommand) => void = () => {}) {
    this.onCommand = onCommand;
    this.element = document.createElement('div');
    this.element.className = 'vision-thermo-status-card hud-interactive';
    this.element.innerHTML = `
      <style>
        .vision-thermo-status-card {
          user-select: none;
          -webkit-user-select: none;
          cursor: default;
        }
        .field-section-title {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 11px;
          font-weight: 500;
          color: rgba(255, 255, 255, 0.65);
          letter-spacing: 0.2px;
          padding-left: 2px;
          user-select: none;
          -webkit-user-select: none;
        }
        .field-apple-deck {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 8px;
          user-select: none;
          -webkit-user-select: none;
        }
        .field-apple-card {
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-top: 1px solid rgba(255, 255, 255, 0.14);
          border-radius: 12px;
          padding: 8px 12px;
          display: flex;
          flex-direction: column;
          gap: 3px;
          transition: background 0.15s ease, border-color 0.15s ease;
          user-select: none;
          -webkit-user-select: none;
        }
        .field-apple-card:hover {
          background: rgba(255, 255, 255, 0.06);
          border-color: rgba(255, 255, 255, 0.12);
        }
        .field-apple-label {
          font-size: 11px;
          font-weight: 500;
          color: rgba(255, 255, 255, 0.55);
          letter-spacing: 0.1px;
        }
        .field-apple-val {
          font-size: 17px;
          font-weight: 600;
          color: #f5f5f7;
          font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif;
          letter-spacing: -0.2px;
        }
        .field-apple-sub {
          font-size: 10px;
          color: rgba(255, 255, 255, 0.35);
          font-family: -apple-system, sans-serif;
        }
        .field-ctrl-card {
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-top: 1px solid rgba(255, 255, 255, 0.14);
          border-radius: 14px;
          padding: 12px 14px;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .field-ctrl-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .field-ctrl-title {
          font-size: 12px;
          font-weight: 600;
          color: rgba(255, 255, 255, 0.90);
          letter-spacing: 0.1px;
        }
        .field-ctrl-badge {
          font-size: 10.5px;
          color: rgba(255, 255, 255, 0.45);
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.06);
          border-radius: 980px;
          padding: 2px 8px;
        }
        .field-action-row {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 8px;
        }
        .field-action-btn {
          height: 32px;
          font-size: 11.5px;
          justify-content: center;
          white-space: nowrap;
        }
        .field-dot {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          display: inline-block;
          margin-right: 6px;
        }
        .field-dot.pos {
          background: #ff453a;
          box-shadow: 0 0 6px rgba(255, 69, 58, 0.8);
        }
        .field-dot.neg {
          background: #0a84ff;
          box-shadow: 0 0 6px rgba(10, 132, 255, 0.8);
        }
        .field-tuning-shelf {
          background: rgba(0, 0, 0, 0.22);
          border: 1px solid rgba(255, 255, 255, 0.06);
          border-radius: 10px;
          padding: 10px 12px;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .field-tuning-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .field-tuning-label {
          font-size: 11px;
          color: rgba(255, 255, 255, 0.70);
          font-family: -apple-system, BlinkMacSystemFont, sans-serif;
        }
        .field-quick-pills {
          display: flex;
          gap: 5px;
        }
        .field-pill-btn {
          background: rgba(255, 255, 255, 0.06);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 980px;
          color: rgba(255, 255, 255, 0.75);
          font-size: 10.5px;
          padding: 2px 8px;
          cursor: pointer;
          transition: all 0.15s ease;
          font-family: -apple-system, sans-serif;
        }
        .field-pill-btn:hover:not(:disabled) {
          background: rgba(255, 255, 255, 0.14);
          color: #ffffff;
        }
        .field-pill-btn:disabled {
          opacity: 0.35;
          cursor: not-allowed;
        }
        .field-slider-track-wrap {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .field-slider-ticks {
          display: flex;
          justify-content: space-between;
          font-size: 9.5px;
          color: rgba(255, 255, 255, 0.35);
          padding: 0 2px;
        }
        .field-glass-btn {
          background: rgba(255, 255, 255, 0.06);
          border: 1px solid rgba(255, 255, 255, 0.10);
          border-radius: 8px;
          color: rgba(255, 255, 255, 0.88);
          font-size: 12px;
          font-family: -apple-system, BlinkMacSystemFont, sans-serif;
          font-weight: 500;
          padding: 6px 12px;
          cursor: pointer;
          transition: all 0.15s ease;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .field-glass-btn:hover {
          background: rgba(255, 255, 255, 0.12);
          border-color: rgba(255, 255, 255, 0.18);
          color: #ffffff;
        }
        .field-glass-btn:active {
          transform: scale(0.98);
        }
        .field-apple-slider {
          width: 100%;
          height: 4px;
          accent-color: #0a84ff;
          cursor: pointer;
          background: rgba(255, 255, 255, 0.12);
          border-radius: 2px;
          outline: none;
        }
        .field-apple-slider:disabled {
          opacity: 0.35;
          cursor: not-allowed;
        }
      </style>

      <div class="hall-pure-container" style="gap: 10px;">
        <div class="hall-pure-header" style="display: flex; justify-content: space-between; align-items: center; padding-bottom: 6px;">
          <div class="hall-header-brand">
            <span class="hall-brand-title">静电场探索与电力线</span>
            <span class="hall-clean-badge" style="background: rgba(255,255,255,0.06); border-color: rgba(255,255,255,0.12); color: rgba(255,255,255,0.7);">E = ∑ k q_i / r_i²</span>
          </div>
          <button class="field-glass-btn" id="field-btn-reset" type="button" style="border-radius: 980px; padding: 4px 14px; font-size: 11.5px;">
            重置初始状态
          </button>
        </div>

        <div class="thermo-card-container" style="gap: 10px;">
          <!-- Section 1: System Field Metrics -->
          <div class="field-section-title">
            <span>空间静电场宏观分布</span>
          </div>
          <div class="field-apple-deck">
            <div class="field-apple-card">
              <span class="field-apple-label">系统净电量 Q_net</span>
              <div class="field-apple-val" id="field-qnet">0.00 µC</div>
              <span class="field-apple-sub" id="field-count">电荷总数 N = 0</span>
            </div>

            <div class="field-apple-card">
              <span class="field-apple-label">静电相互作用能 U</span>
              <div class="field-apple-val" id="field-u">0.00 mJ</div>
              <span class="field-apple-sub">∑ k q_i q_j / r_ij</span>
            </div>

            <div class="field-apple-card">
              <span class="field-apple-label">系统电偶极矩 |p|</span>
              <div class="field-apple-val" id="field-dipole">0.000 µC·m</div>
              <span class="field-apple-sub">∑ q_i · r_i</span>
            </div>

            <div class="field-apple-card">
              <span class="field-apple-label">选中电荷电量 q</span>
              <div class="field-apple-val" id="field-selected-q">未选中</div>
              <span class="field-apple-sub" id="field-selected-id">点击电荷以调节</span>
            </div>
          </div>

          <!-- Section 2: Test Charge Probe Metrics -->
          <div class="field-section-title">
            <span style="width: 6px; height: 6px; border-radius: 50%; background: #fbbf24; box-shadow: 0 0 8px rgba(251,191,36,0.7); display: inline-block;"></span>
            <span>试探电荷探测 (q₀ · 可直接在三维场景中拖拽移动)</span>
          </div>
          <div class="field-apple-deck">
            <div class="field-apple-card">
              <span class="field-apple-label">试探电量 q₀</span>
              <div class="field-apple-val" id="field-probe-q">+1.00 nC</div>
              <span class="field-apple-sub" id="field-probe-pos">位置: (0.00, 0.16) m</span>
            </div>

            <div class="field-apple-card">
              <span class="field-apple-label">局部电场强度 E</span>
              <div class="field-apple-val" id="field-probe-e">0.0 V/m</div>
              <span class="field-apple-sub">金色矢量指示场向</span>
            </div>

            <div class="field-apple-card">
              <span class="field-apple-label">局部电势 V</span>
              <div class="field-apple-val" id="field-probe-v">0.0 V</div>
              <span class="field-apple-sub">静电势能 E_p = q₀·V</span>
            </div>

            <div class="field-apple-card">
              <span class="field-apple-label">所受库仑力 F</span>
              <div class="field-apple-val" id="field-probe-f">0.00 µN</div>
              <span class="field-apple-sub">F = q₀ · E</span>
            </div>
          </div>

          <!-- Section 3: Redesigned Charge Management Deck -->
          <div class="field-ctrl-card">
            <div class="field-ctrl-header">
              <div style="display: flex; align-items: center; gap: 8px;">
                <span class="field-ctrl-title">电荷交互管理</span>
                <span class="field-ctrl-badge">双击空间空白处添加电荷</span>
              </div>
            </div>

            <!-- Operations Row -->
            <div class="field-action-row">
              <button class="field-glass-btn field-action-btn" id="field-btn-add-pos" type="button">
                <span class="field-dot pos"></span>添加正电荷 (+2.0 µC)
              </button>
              <button class="field-glass-btn field-action-btn" id="field-btn-add-neg" type="button">
                <span class="field-dot neg"></span>添加负电荷 (-2.0 µC)
              </button>
              <button class="field-glass-btn field-action-btn" id="field-btn-del" type="button">
                <span style="opacity: 0.6; margin-right: 4px;">✕</span>删除选中
              </button>
              <button class="field-glass-btn field-action-btn" id="field-btn-clear" type="button">
                <span style="opacity: 0.6; margin-right: 4px;">⟲</span>清空空间
              </button>
            </div>

            <!-- Selected Charge Tuning Shelf -->
            <div class="field-tuning-shelf">
              <div class="field-tuning-header">
                <span class="field-tuning-label" id="field-selected-label">选中电荷: 未选中 (在场景中点击电荷)</span>
                <div class="field-quick-pills" id="field-quick-pills">
                  <button type="button" class="field-pill-btn" data-val="-3.0" disabled>-3µC</button>
                  <button type="button" class="field-pill-btn" data-val="-1.0" disabled>-1µC</button>
                  <button type="button" class="field-pill-btn" data-val="1.0" disabled>+1µC</button>
                  <button type="button" class="field-pill-btn" data-val="3.0" disabled>+3µC</button>
                </div>
              </div>
              <div class="field-slider-track-wrap">
                <input type="range" class="field-apple-slider" id="field-charge-slider" min="-5" max="5" step="0.5" value="2" disabled />
                <div class="field-slider-ticks">
                  <span>-5.0 µC</span>
                  <span>-2.5</span>
                  <span>0 (中性)</span>
                  <span>+2.5</span>
                  <span>+5.0 µC</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    this.bind();
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
    const selectedQEl = this.element.querySelector('#field-selected-q');
    const selectedIdEl = this.element.querySelector('#field-selected-id');
    const selectedLabel = this.element.querySelector('#field-selected-label');
    const slider = this.element.querySelector('#field-charge-slider') as HTMLInputElement | null;

    if (qNetEl) qNetEl.textContent = `${data.totalChargeMicroC.toFixed(2)} µC`;
    if (countEl) countEl.textContent = `电荷总数 N = ${data.chargeCount}`;
    if (uEl) uEl.textContent = `${(data.potentialEnergyJoules * 1000).toFixed(2)} mJ`;
    if (dipoleEl) dipoleEl.textContent = `${data.dipoleMomentMagnitude.toFixed(3)} µC·m`;

    const pillButtons = this.element.querySelectorAll('.field-pill-btn');
    if (data.selectedChargeId) {
      const qStr = `${data.selectedChargeValue > 0 ? '+' : ''}${data.selectedChargeValue.toFixed(1)} µC`;
      if (selectedQEl) selectedQEl.textContent = qStr;
      if (selectedIdEl) selectedIdEl.textContent = `电荷 #${data.selectedChargeId}`;
      if (selectedLabel) selectedLabel.textContent = `选中: #${data.selectedChargeId} (${qStr})`;
      if (slider) {
        slider.disabled = false;
        slider.value = String(data.selectedChargeValue);
      }
      pillButtons.forEach((btn) => {
        (btn as HTMLButtonElement).disabled = false;
      });
    } else {
      if (selectedQEl) selectedQEl.textContent = '未选中';
      if (selectedIdEl) selectedIdEl.textContent = '点击电荷以调节';
      if (selectedLabel) selectedLabel.textContent = '选中电荷: 未选中 (在场景中点击电荷)';
      if (slider) {
        slider.disabled = true;
      }
      pillButtons.forEach((btn) => {
        (btn as HTMLButtonElement).disabled = true;
      });
    }

    // Test Charge (Probe) Telemetry Binding
    const probeQEl = this.element.querySelector('#field-probe-q');
    const probePosEl = this.element.querySelector('#field-probe-pos');
    const probeEEl = this.element.querySelector('#field-probe-e');
    const probeVEl = this.element.querySelector('#field-probe-v');
    const probeFEl = this.element.querySelector('#field-probe-f');

    if (data.testCharge) {
      const tc = data.testCharge;
      if (probeQEl) probeQEl.textContent = `+${(tc.q0 * 1000).toFixed(2)} nC`;
      if (probePosEl) probePosEl.textContent = `位置: (${tc.x.toFixed(2)}, ${tc.y.toFixed(2)}) m`;

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
            ? `${fMicroN.toFixed(2)} µN`
            : `${(tc.forceMagnitude * 1e9).toFixed(1)} nN`;
      }
    }
  }

  private bind(): void {
    // Add / Delete / Clear
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

    // Selected charge slider
    const slider = this.element.querySelector('#field-charge-slider') as HTMLInputElement | null;
    slider?.addEventListener('input', () => {
      const q = parseFloat(slider.value);
      this.onCommand({ type: 'setChargeMagnitude', q });
    });

    // Quick adjustment pills
    const pillButtons = this.element.querySelectorAll('.field-pill-btn');
    pillButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const val = parseFloat(btn.getAttribute('data-val') || '0');
        if (slider) {
          slider.value = String(val);
        }
        this.onCommand({ type: 'setChargeMagnitude', q: val });
      });
    });

    // Reset button
    this.element.querySelector('#field-btn-reset')?.addEventListener('click', () => {
      this.onCommand({ type: 'reset' });
    });
  }
}
