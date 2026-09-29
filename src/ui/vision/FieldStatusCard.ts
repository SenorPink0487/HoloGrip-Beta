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
  private data: ElectrostaticTelemetry | null = null;
  private activeSliders = new Set<string>();

  constructor(onCommand: (cmd: FieldCommand) => void = () => {}) {
    this.onCommand = onCommand;
    this.element = document.createElement('div');
    this.element.className = 'vision-hall-status-card hud-interactive';
    this.element.innerHTML = `
      <style>
        .vision-hall-status-card {
          width: 100%;
          height: 100%;
          display: flex;
          flex-direction: column;
          box-sizing: border-box;
          overflow: hidden;
          color: #ffffff;
          padding: 8px 16px 12px 16px;
          font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", sans-serif;
        }

        .field-hall-unified-container {
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          height: 100%;
          max-width: 820px;
          margin: 0 auto;
          width: 100%;
          box-sizing: border-box;
          gap: 14px;
        }

        /* 1. 顶部标题栏 */
        .field-hall-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding-bottom: 8px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.06);
          flex-shrink: 0;
        }
        .field-hall-brand {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .field-hall-title {
          font-size: 15px;
          font-weight: 600;
          color: #f5f5f7;
          letter-spacing: -0.2px;
        }
        .field-hall-badge {
          font-size: 11px;
          font-weight: 600;
          font-family: "SF Pro Text", -apple-system, sans-serif;
          padding: 2px 10px;
          border-radius: 980px;
          background: rgba(10, 132, 255, 0.12);
          border: 1px solid rgba(10, 132, 255, 0.28);
          color: #64d2ff;
        }

        /* 2. 核心公式与核心视觉舞台 */
        .field-hall-stage {
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-top: 1px solid rgba(255, 255, 255, 0.18);
          border-radius: 22px;
          padding: 24px 30px;
          display: flex;
          flex-direction: column;
          gap: 18px;
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.25);
          flex-shrink: 0;
        }

        .field-hall-stage-head {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .field-hall-stage-title {
          font-size: 12.5px;
          font-weight: 600;
          color: rgba(255, 255, 255, 0.85);
          letter-spacing: 0.1px;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .field-hall-stage-sub {
          font-size: 11px;
          color: rgba(255, 255, 255, 0.40);
        }

        /* 指标栏分列与分隔线样式 */
        .field-hall-metric-row {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          position: relative;
        }
        .field-hall-metric-col {
          display: flex;
          flex-direction: column;
          gap: 4px;
          padding: 0 16px;
          position: relative;
        }
        .field-hall-metric-col:first-child {
          padding-left: 0;
        }
        .field-hall-metric-col:last-child {
          padding-right: 0;
        }
        .field-hall-metric-col:not(:last-child)::after {
          content: "";
          position: absolute;
          right: 0;
          top: 10%;
          height: 80%;
          width: 1px;
          background: rgba(255, 255, 255, 0.08);
        }

        .field-hall-val-main {
          font-size: 24px;
          font-weight: 600;
          color: #ffffff;
          font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif;
          letter-spacing: -0.3px;
          line-height: 1.2;
        }
        .field-hall-val-accent {
          color: #64d2ff;
          text-shadow: 0 0 12px rgba(10, 132, 255, 0.45);
        }
        .field-hall-sub-tag {
          font-size: 10.5px;
          color: rgba(255, 255, 255, 0.40);
          font-family: -apple-system, sans-serif;
        }
        .field-hall-sub-cyan {
          color: #64d2ff;
          opacity: 0.85;
        }

        .field-hall-stage-divider {
          height: 1px;
          width: 100%;
          background: rgba(255, 255, 255, 0.07);
        }

        /* 3. 焦点参数抽屉面板 */
        .field-hall-drawer {
          background: rgba(255, 255, 255, 0.035);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-top: 1px solid rgba(255, 255, 255, 0.16);
          border-radius: 20px;
          padding: 14px 22px;
          display: flex;
          flex-direction: column;
          gap: 12px;
          flex-shrink: 0;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.20);
        }

        .field-hall-seg-control {
          display: flex;
          background: rgba(0, 0, 0, 0.32);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 980px;
          padding: 3px;
          gap: 2px;
        }
        .field-hall-seg-btn {
          padding: 5px 14px;
          border-radius: 980px;
          font-size: 11.5px;
          font-weight: 500;
          color: rgba(255, 255, 255, 0.70);
          border: none;
          background: transparent;
          cursor: pointer;
          white-space: nowrap;
          transition: all 0.18s cubic-bezier(0.16, 1, 0.3, 1);
          font-family: -apple-system, sans-serif;
        }
        .field-hall-seg-btn:hover:not(:disabled) {
          background: rgba(10, 132, 255, 0.25);
          color: #64d2ff;
          box-shadow: 0 2px 8px rgba(10, 132, 255, 0.3);
          font-weight: 600;
        }
        .field-hall-seg-btn:disabled {
          opacity: 0.25;
          cursor: not-allowed;
        }

        /* 4. 底部操作胶囊栏 */
        .field-hall-dock {
          display: flex;
          align-items: center;
          justify-content: center;
          padding-top: 2px;
          flex-shrink: 0;
        }
        .field-hall-dock-capsule {
          display: flex;
          align-items: center;
          justify-content: space-around;
          width: 100%;
          padding: 8px 16px;
          border-radius: 16px;
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-top: 1px solid rgba(255, 255, 255, 0.14);
          gap: 10px;
        }
        .field-hall-action-btn {
          flex: 1;
          height: 38px;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 10px;
          color: rgba(255, 255, 255, 0.88);
          font-size: 12px;
          font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif;
          font-weight: 500;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 7px;
          cursor: pointer;
          transition: all 0.18s ease;
          white-space: nowrap;
        }
        .field-hall-action-btn:hover {
          background: rgba(10, 132, 255, 0.15);
          border-color: rgba(10, 132, 255, 0.35);
          color: #64d2ff;
          transform: translateY(-1px);
        }
        .field-hall-action-btn:active {
          transform: scale(0.98);
        }

        .field-hall-dock-divider {
          width: 1px;
          height: 22px;
          background: rgba(255, 255, 255, 0.08);
          flex-shrink: 0;
        }

        /* 5. 极简极性指示圆点 */
        .field-dot-red {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: #ff453a;
          box-shadow: 0 0 6px rgba(255, 69, 58, 0.7);
          display: inline-block;
          flex-shrink: 0;
        }
        .field-dot-blue {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: #0a84ff;
          box-shadow: 0 0 6px rgba(10, 132, 255, 0.7);
          display: inline-block;
          flex-shrink: 0;
        }
        .field-dot-cyan {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: #64d2ff;
          box-shadow: 0 0 8px rgba(100, 210, 255, 0.8);
          display: inline-block;
          flex-shrink: 0;
        }

        /* 底部提示文字 */
        .field-hall-footer {
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 10px;
          color: rgba(255, 255, 255, 0.35);
          padding: 0 4px;
          flex-shrink: 0;
        }
      </style>

      <div class="field-hall-unified-container">
        <!-- 1. Header matching Hall Effect -->
        <div class="field-hall-header">
          <div class="field-hall-brand">
            <span class="field-hall-title">静电场探索与电力线</span>
            <span class="field-hall-badge">E = ∑ k q_i / r_i²</span>
          </div>

          <div class="hall-header-actions">
            <button class="apple-circle-btn" id="field-btn-reset" title="重置初始状态">
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">
                <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
                <path d="M3 3v5h5"/>
              </svg>
            </button>
          </div>
        </div>

        <!-- 2. Pure Centerpiece Stage matching hall-pure-stage -->
        <div class="field-hall-stage">
          <!-- Macro Distribution Sector -->
          <div class="field-hall-stage-head">
            <span class="field-hall-stage-title">空间宏观场态分布</span>
            <span class="field-hall-stage-sub">库仑定律与全空间能量分布</span>
          </div>

          <div class="field-hall-metric-row">
            <div class="field-hall-metric-col">
              <span class="field-hall-sub-tag">系统净电量 Q_net</span>
              <div class="field-hall-val-main" id="field-qnet">0.00 µC</div>
              <span class="field-hall-sub-tag field-hall-sub-cyan" id="field-count">电荷总数 N = 0</span>
            </div>

            <div class="field-hall-metric-col">
              <span class="field-hall-sub-tag">静电相互作用能 U</span>
              <div class="field-hall-val-main" id="field-u">0.00 mJ</div>
              <span class="field-hall-sub-tag">∑ k q_i q_j / r_ij</span>
            </div>

            <div class="field-hall-metric-col">
              <span class="field-hall-sub-tag">系统电偶极矩 |p|</span>
              <div class="field-hall-val-main" id="field-dipole">0.000 µC·m</div>
              <span class="field-hall-sub-tag">∑ q_i · r_i</span>
            </div>
          </div>

          <div class="field-hall-stage-divider"></div>

          <!-- Probe Sensor Sector -->
          <div class="field-hall-stage-head">
            <div class="field-hall-stage-title">
              <span class="field-dot-cyan"></span>
              <span>试探电荷空间探测仪</span>
            </div>
            <div style="display: flex; align-items: center; gap: 8px;">
              <span class="field-hall-badge" id="field-probe-q" style="padding: 1px 8px; font-size: 10.5px;">+1.00 nC</span>
              <span style="font-size: 10.5px; color: rgba(255, 255, 255, 0.40);" id="field-probe-pos">位置: (0.00, 0.16) m</span>
            </div>
          </div>

          <div class="field-hall-metric-row">
            <div class="field-hall-metric-col">
              <span class="field-hall-sub-tag">局部电场强度 E</span>
              <div class="field-hall-val-main field-hall-val-accent" id="field-probe-e">0.0 V/m</div>
              <span class="field-hall-sub-tag">空间矢量箭头指示场向</span>
            </div>

            <div class="field-hall-metric-col">
              <span class="field-hall-sub-tag">局部电势 V</span>
              <div class="field-hall-val-main" id="field-probe-v">0.0 V</div>
              <span class="field-hall-sub-tag">静电势能 E_p = q₀ · V</span>
            </div>

            <div class="field-hall-metric-col">
              <span class="field-hall-sub-tag">所受库仑力 F</span>
              <div class="field-hall-val-main field-hall-val-accent" id="field-probe-f">0.00 µN</div>
              <span class="field-hall-sub-tag">F = q₀ · E 矢量耦合</span>
            </div>
          </div>
        </div>

        <!-- 3. Focus Drawer matching hall-focus-drawer -->
        <div class="field-hall-drawer">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span id="field-charge-orb" class="field-dot-red" style="display: none;"></span>
              <span class="hall-param-tag" id="field-selected-label">选中电荷: 未选中</span>
            </div>
            <div style="display: flex; align-items: baseline; gap: 6px;">
              <span class="field-hall-badge" id="field-selected-q">未选中</span>
              <span style="font-size: 10.5px; color: rgba(255, 255, 255, 0.40);" id="field-selected-id">点击电荷以调节</span>
            </div>
          </div>

          <div style="display: flex; align-items: center; gap: 14px;">
            <div class="field-hall-seg-control" id="field-quick-pills">
              <button type="button" class="field-hall-seg-btn field-pill-btn" data-val="-3.0" disabled>-3µC</button>
              <button type="button" class="field-hall-seg-btn field-pill-btn" data-val="-1.0" disabled>-1µC</button>
              <button type="button" class="field-hall-seg-btn field-pill-btn" data-val="1.0" disabled>+1µC</button>
              <button type="button" class="field-hall-seg-btn field-pill-btn" data-val="3.0" disabled>+3µC</button>
            </div>

            <div class="hall-slider-track-wrap" style="flex-direction: column; gap: 3px;">
              <input type="range" class="hall-apple-slider" id="field-charge-slider" min="-5" max="5" step="0.5" value="2" disabled />
              <div style="display: flex; justify-content: space-between; font-size: 9px; color: rgba(255, 255, 255, 0.32); padding: 0 2px; width: 100%;">
                <span>-5.0 µC</span>
                <span>-2.5</span>
                <span>0 (中性)</span>
                <span>+2.5</span>
                <span>+5.0 µC</span>
              </div>
            </div>
          </div>
        </div>

        <!-- 4. Control Dock matching hall-dock-capsule -->
        <div class="field-hall-dock">
          <div class="field-hall-dock-capsule">
            <button class="field-hall-action-btn" id="field-btn-add-pos" type="button">
              <span class="field-dot-red"></span> 添加正电荷 (+2.0 µC)
            </button>
            <div class="field-hall-dock-divider"></div>
            <button class="field-hall-action-btn" id="field-btn-add-neg" type="button">
              <span class="field-dot-blue"></span> 添加负电荷 (-2.0 µC)
            </button>
            <div class="field-hall-dock-divider"></div>
            <button class="field-hall-action-btn" id="field-btn-del" type="button">
              <span style="opacity: 0.5;">✕</span> 删除选中电荷
            </button>
            <div class="field-hall-dock-divider"></div>
            <button class="field-hall-action-btn" id="field-btn-clear" type="button">
              <span style="opacity: 0.5;">⟲</span> 清空空间电荷
            </button>
          </div>
        </div>

        <!-- 5. Minimal Footer Caption -->
        <div class="field-hall-footer">
          <span>双击三维空间空白处亦可直接创建电荷 · 拖拽电荷球即可重构高斯电力线</span>
          <span>拖拽金色探针球实时探测局部场强与电势</span>
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
    const selectedQEl = this.element.querySelector('#field-selected-q') as HTMLElement | null;
    const selectedIdEl = this.element.querySelector('#field-selected-id');
    const selectedLabel = this.element.querySelector('#field-selected-label');
    const orbEl = this.element.querySelector('#field-charge-orb') as HTMLElement | null;
    const slider = this.element.querySelector('#field-charge-slider') as HTMLInputElement | null;

    if (qNetEl) qNetEl.textContent = `${data.totalChargeMicroC.toFixed(2)} µC`;
    if (countEl) countEl.textContent = `电荷总数 N = ${data.chargeCount}`;
    if (uEl) uEl.textContent = `${(data.potentialEnergyJoules * 1000).toFixed(2)} mJ`;
    if (dipoleEl) dipoleEl.textContent = `${data.dipoleMomentMagnitude.toFixed(3)} µC·m`;

    const pillButtons = this.element.querySelectorAll('.field-pill-btn');
    if (data.selectedChargeId) {
      const qVal = data.selectedChargeValue;
      const qStr = `${qVal > 0 ? '+' : ''}${qVal.toFixed(1)} µC`;
      if (selectedQEl) {
        selectedQEl.textContent = qStr;
      }
      if (selectedIdEl) selectedIdEl.textContent = `电荷 #${data.selectedChargeId}`;
      if (selectedLabel) selectedLabel.textContent = `选中: #${data.selectedChargeId} (${qStr})`;
      if (orbEl) {
        orbEl.style.display = 'inline-block';
        orbEl.className = qVal > 0 ? 'field-dot-red' : qVal < 0 ? 'field-dot-blue' : '';
      }
      if (slider) {
        slider.disabled = false;
        if (!isSliderActive(slider, this.activeSliders)) {
          slider.value = String(qVal);
        }
      }
      pillButtons.forEach((btn) => {
        (btn as HTMLButtonElement).disabled = false;
      });
    } else {
      if (selectedQEl) {
        selectedQEl.textContent = '未选中';
      }
      if (selectedIdEl) selectedIdEl.textContent = '点击电荷以调节';
      if (selectedLabel) selectedLabel.textContent = '选中电荷: 未选中';
      if (orbEl) {
        orbEl.style.display = 'none';
      }
      if (slider) {
        slider.disabled = true;
      }
      pillButtons.forEach((btn) => {
        (btn as HTMLButtonElement).disabled = true;
      });
    }

    // 检验电荷（探针）遥测数据绑定
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

    // 选中电荷电量调节滑块
    const slider = this.element.querySelector('#field-charge-slider') as HTMLInputElement | null;
    if (slider) {
      bindVisionSlider(slider, {
        activeSet: this.activeSliders,
        onChange: (q: number) => {
          this.onCommand({ type: 'setChargeMagnitude', q });
        },
        onScrub: (q: number) => {
          const selectedQEl = this.element.querySelector('#field-selected-q') as HTMLElement | null;
          const orbEl = this.element.querySelector('#field-charge-orb') as HTMLElement | null;
          if (selectedQEl) {
            selectedQEl.textContent = `${q > 0 ? '+' : ''}${q.toFixed(1)} µC`;
          }
          if (orbEl) {
            orbEl.style.display = 'inline-block';
            orbEl.className = q > 0 ? 'field-dot-red' : q < 0 ? 'field-dot-blue' : '';
          }
        },
      });
    }

    // 快捷调节胶囊按钮
    const pillButtons = this.element.querySelectorAll('.field-pill-btn');
    pillButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const val = parseFloat(btn.getAttribute('data-val') || '0');
        if (slider) {
          slider.value = String(val);
        }
        const selectedQEl = this.element.querySelector('#field-selected-q') as HTMLElement | null;
        const orbEl = this.element.querySelector('#field-charge-orb') as HTMLElement | null;
        if (selectedQEl) {
          selectedQEl.textContent = `${val > 0 ? '+' : ''}${val.toFixed(1)} µC`;
        }
        if (orbEl) {
          orbEl.style.display = 'inline-block';
          orbEl.className = val > 0 ? 'field-dot-red' : val < 0 ? 'field-dot-blue' : '';
        }
        this.onCommand({ type: 'setChargeMagnitude', q: val });
      });
    });

    // 重置按钮
    this.element.querySelector('#field-btn-reset')?.addEventListener('click', () => {
      this.onCommand({ type: 'reset' });
    });
  }
}
