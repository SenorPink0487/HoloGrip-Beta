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
        .field-apple-deck {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 8px;
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
          font-size: 18px;
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
        .field-seg-bar {
          display: flex;
          background: rgba(0, 0, 0, 0.32);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 980px;
          padding: 3px;
          gap: 2px;
          margin: 4px 0;
        }
        .field-seg-btn {
          flex: 1;
          background: transparent;
          border: none;
          color: rgba(255, 255, 255, 0.65);
          border-radius: 980px;
          padding: 5px 8px;
          font-size: 11.5px;
          font-family: -apple-system, BlinkMacSystemFont, sans-serif;
          font-weight: 400;
          cursor: pointer;
          transition: all 0.15s ease;
          white-space: nowrap;
          text-align: center;
        }
        .field-seg-btn:hover:not(.active) {
          background: rgba(255, 255, 255, 0.08);
          color: rgba(255, 255, 255, 0.90);
        }
        .field-seg-btn.active {
          background: rgba(255, 255, 255, 0.16);
          color: #ffffff;
          font-weight: 500;
          box-shadow: 0 1px 4px rgba(0, 0, 0, 0.25);
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
          margin-top: 4px;
        }
      </style>

      <div class="hall-pure-container" style="gap: 10px;">
        <div class="hall-pure-header" style="padding-bottom: 6px;">
          <div class="hall-header-brand">
            <span class="hall-brand-title">静电场探索与电力线</span>
            <span class="hall-clean-badge" style="background: rgba(255,255,255,0.06); border-color: rgba(255,255,255,0.12); color: rgba(255,255,255,0.7);">E = ∑ k q_i / r_i²</span>
          </div>
        </div>

        <div class="thermo-card-container" style="gap: 8px;">
          <!-- Section 1: System Field Metrics -->
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
          <div style="display:flex; align-items:center; gap:6px; font-size:11px; font-weight:500; color:rgba(255,255,255,0.65); letter-spacing:0.1px; margin-top: 2px;">
            <span style="width:6px; height:6px; border-radius:50%; background:#fbbf24; box-shadow:0 0 6px rgba(251,191,36,0.6); display:inline-block;"></span>
            <span>试探电荷探测 (q₀ · 可直接在场景中拖拽移动)</span>
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
              <span class="field-apple-sub">金色矢量箭头指示方向</span>
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

          <!-- Presets Segmented Bar -->
          <div class="field-seg-bar">
            <button class="field-seg-btn active" id="field-preset-dipole" type="button">正负偶极子</button>
            <button class="field-seg-btn" id="field-preset-like" type="button">同号排斥</button>
            <button class="field-seg-btn" id="field-preset-quad" type="button">电四极子</button>
            <button class="field-seg-btn" id="field-preset-asym" type="button">非对称 (+3/-1)</button>
            <button class="field-seg-btn" id="field-preset-single" type="button">单电荷</button>
          </div>

          <!-- Charge Operations & Controls -->
          <div class="thermo-charts-deck" style="gap: 10px;">
            <div class="field-apple-card" style="padding: 10px 14px;">
              <div class="thermo-chart-header">
                <span class="thermo-chart-title" style="color: rgba(255,255,255,0.85); font-weight:500;">电荷管理</span>
              </div>
              <div style="display:flex; gap:8px; margin-top:6px;">
                <button class="field-glass-btn" id="field-btn-add-pos" type="button" style="flex:1;">
                  <span style="color:#ff453a; margin-right:5px; font-size:11px;">●</span>添加正电荷
                </button>
                <button class="field-glass-btn" id="field-btn-add-neg" type="button" style="flex:1;">
                  <span style="color:#0a84ff; margin-right:5px; font-size:11px;">●</span>添加负电荷
                </button>
              </div>
              <div style="display:flex; gap:8px; margin-top:6px;">
                <button class="field-glass-btn" id="field-btn-del" type="button" style="flex:1;">删除选中</button>
                <button class="field-glass-btn" id="field-btn-clear" type="button" style="flex:1;">清空全部</button>
              </div>

              <div style="margin-top:8px; border-top:1px solid rgba(255,255,255,0.06); padding-top:6px;">
                <span class="field-apple-sub" id="field-selected-label">选中电荷: 未选中</span>
                <input type="range" class="field-apple-slider" id="field-charge-slider" min="-5" max="5" step="0.5" value="2" disabled />
              </div>
            </div>

            <div class="field-apple-card" style="padding: 10px 14px;">
              <div class="thermo-chart-header">
                <span class="thermo-chart-title" style="color: rgba(255,255,255,0.85); font-weight:500;">电场线层</span>
              </div>
              <div style="display:flex; gap:16px; margin-top:6px;">
                <label style="font-size:12px; color:rgba(255,255,255,0.8); display:flex; align-items:center; gap:6px; cursor:pointer;">
                  <input type="checkbox" id="field-toggle-lines" checked style="accent-color:#0a84ff;" /> 空间电力线
                </label>
              </div>

              <div style="margin-top:10px;">
                <span class="field-apple-sub">场线密度 <span id="field-density-label" style="color:rgba(255,255,255,0.8);">16</span></span>
                <input type="range" class="field-apple-slider" id="field-density-slider" min="8" max="28" step="4" value="16" />
              </div>
            </div>
          </div>

          <!-- Bottom Actions -->
          <div style="display:flex; justify-content:center; margin-top:4px;">
            <button class="field-glass-btn" id="field-btn-reset" type="button" style="border-radius:980px; padding:6px 20px;">
              重置初始状态
            </button>
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

    if (data.selectedChargeId) {
      const qStr = `${data.selectedChargeValue > 0 ? '+' : ''}${data.selectedChargeValue.toFixed(1)} µC`;
      if (selectedQEl) selectedQEl.textContent = qStr;
      if (selectedIdEl) selectedIdEl.textContent = `电荷 #${data.selectedChargeId}`;
      if (selectedLabel) selectedLabel.textContent = `选中: #${data.selectedChargeId} (${qStr})`;
      if (slider) {
        slider.disabled = false;
        slider.value = String(data.selectedChargeValue);
      }
    } else {
      if (selectedQEl) selectedQEl.textContent = '未选中';
      if (selectedIdEl) selectedIdEl.textContent = '点击电荷以调节';
      if (selectedLabel) selectedLabel.textContent = '选中电荷: 未选中 (点击画面中电荷)';
      if (slider) {
        slider.disabled = true;
      }
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
    const presetButtons = this.element.querySelectorAll('.field-seg-btn');
    const setActivePreset = (id: string) => {
      presetButtons.forEach((btn) => btn.classList.remove('active'));
      this.element.querySelector(`#${id}`)?.classList.add('active');
    };

    // Presets
    this.element.querySelector('#field-preset-dipole')?.addEventListener('click', () => {
      setActivePreset('field-preset-dipole');
      this.onCommand({ type: 'setPreset', presetKey: 'dipole' });
    });
    this.element.querySelector('#field-preset-like')?.addEventListener('click', () => {
      setActivePreset('field-preset-like');
      this.onCommand({ type: 'setPreset', presetKey: 'likeCharges' });
    });
    this.element.querySelector('#field-preset-quad')?.addEventListener('click', () => {
      setActivePreset('field-preset-quad');
      this.onCommand({ type: 'setPreset', presetKey: 'quadrupole' });
    });
    this.element.querySelector('#field-preset-asym')?.addEventListener('click', () => {
      setActivePreset('field-preset-asym');
      this.onCommand({ type: 'setPreset', presetKey: 'asymmetric' });
    });
    this.element.querySelector('#field-preset-single')?.addEventListener('click', () => {
      setActivePreset('field-preset-single');
      this.onCommand({ type: 'setPreset', presetKey: 'single' });
    });

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

    // Toggles
    const toggleLines = this.element.querySelector('#field-toggle-lines') as HTMLInputElement | null;
    toggleLines?.addEventListener('change', () => {
      this.onCommand({ type: 'toggleLines', show: toggleLines.checked });
    });

    // Density slider
    const densitySlider = this.element.querySelector('#field-density-slider') as HTMLInputElement | null;
    const densityLabel = this.element.querySelector('#field-density-label');
    densitySlider?.addEventListener('input', () => {
      const val = parseInt(densitySlider.value, 10);
      if (densityLabel) densityLabel.textContent = String(val);
      this.onCommand({ type: 'setDensity', density: val });
    });

    // Reset button
    this.element.querySelector('#field-btn-reset')?.addEventListener('click', () => {
      setActivePreset('field-preset-dipole');
      this.onCommand({ type: 'reset' });
    });
  }
}
