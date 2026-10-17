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
  private badgeStatus: HTMLElement | null = null;
  private valCurrentText: HTMLElement | null = null;
  private valCapVoltageText: HTMLElement | null = null;
  private valTauText: HTMLElement | null = null;
  private valChargeText: HTMLElement | null = null;
  private valEnergyText: HTMLElement | null = null;

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

  private render(): void {
    this.element.innerHTML = `
      <div class="hall-pure-container" style="gap: 12px;">
        <!-- 1. 顶部品牌与状态 -->
        <div class="hall-pure-header">
          <div class="hall-header-brand">
            <svg class="apple-sf-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#38bdf8" stroke-width="2.2">
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
            </svg>
            <span class="hall-brand-title">电容器充放电与RC暂态电路</span>
            <span class="hall-clean-badge" id="card-status-badge">断开中立</span>
          </div>
          <div class="hall-header-actions">
            <button class="carnot-btn" id="btn-open-floating-waveform" style="background: rgba(56, 189, 248, 0.15); border-color: rgba(56, 189, 248, 0.4); color: #38bdf8;">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                <polyline points="7 12 10 9 13 14 17 10"/>
              </svg>
              <span>置顶波形悬浮窗</span>
            </button>
          </div>
        </div>

        <!-- 2. 遥测读数大卡片 -->
        <div class="hall-pure-metrics" style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px;">
          <div class="hall-metric-box">
            <div class="hall-metric-title">瞬时电流 I(t)</div>
            <div class="hall-metric-num" id="card-val-current" style="color: #38bdf8;">0.00 mA</div>
            <div class="hall-metric-sub">电流传感器实测</div>
          </div>
          <div class="hall-metric-box">
            <div class="hall-metric-title">电容端电压 Uc</div>
            <div class="hall-metric-num" id="card-val-cap-voltage" style="color: #a855f7;">0.00 V</div>
            <div class="hall-metric-sub">理论极限: E</div>
          </div>
          <div class="hall-metric-box">
            <div class="hall-metric-title">时间常数 τ = RC</div>
            <div class="hall-metric-num" id="card-val-tau">1.00 s</div>
            <div class="hall-metric-sub">暂态响应特征周期</div>
          </div>
        </div>

        <!-- 3. 开关掷向快捷按钮区 -->
        <div style="background: rgba(255, 255, 255, 0.04); border-radius: 12px; padding: 10px 14px; border: 1px solid rgba(255, 255, 255, 0.08);">
          <div style="font-size: 12px; font-weight: 600; color: #94a3b8; margin-bottom: 8px;">单刀双掷开关档位：</div>
          <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px;">
            <button class="carnot-btn" id="card-btn-charge" style="border-radius: 8px; justify-content: center; height: 38px;">
              <span>⚡ 掷向电源 (充电)</span>
            </button>
            <button class="carnot-btn active" id="card-btn-neutral" style="border-radius: 8px; justify-content: center; height: 38px;">
              <span>⚪ 中立断开</span>
            </button>
            <button class="carnot-btn" id="card-btn-discharge" style="border-radius: 8px; justify-content: center; height: 38px;">
              <span>🔄 掷向放电 (放电)</span>
            </button>
          </div>
        </div>

        <!-- 4. 电路实验参数调节滑块 -->
        <div style="display: flex; flex-direction: column; gap: 10px; flex: 1;">
          <!-- 电源电压 -->
          <div class="hall-slider-row">
            <div class="hall-slider-info">
              <span class="hall-slider-label">电源电压 E</span>
              <span class="hall-slider-val" id="card-label-voltage">10.0 V</span>
            </div>
            <input type="range" class="thermo-mini-slider" id="slider-cap-voltage" min="2" max="20" step="0.5" value="10.0" />
          </div>

          <!-- 电容容量 -->
          <div class="hall-slider-row">
            <div class="hall-slider-info">
              <span class="hall-slider-label">电容容量 C</span>
              <span class="hall-slider-val" id="card-label-capacitance">1000 µF</span>
            </div>
            <input type="range" class="thermo-mini-slider" id="slider-cap-c" min="100" max="3000" step="50" value="1000" />
          </div>

          <!-- 放电电阻 -->
          <div class="hall-slider-row">
            <div class="hall-slider-info">
              <span class="hall-slider-label">放电电阻 R</span>
              <span class="hall-slider-val" id="card-label-resistance">1000 Ω</span>
            </div>
            <input type="range" class="thermo-mini-slider" id="slider-cap-r" min="200" max="3000" step="50" value="1000" />
          </div>
        </div>

        <!-- 5. 底部辅助电量指标与复位 -->
        <div style="display: flex; justify-content: space-between; align-items: center; padding-top: 8px; border-top: 1px solid rgba(255, 255, 255, 0.06);">
          <div style="font-size: 12px; color: #94a3b8; display: flex; gap: 14px;">
            <span>储能电量 Q: <b id="card-val-charge" style="color: #f8fafc;">0.00 mC</b></span>
            <span>静电能量 W: <b id="card-val-energy" style="color: #fbbf24;">0.00 mJ</b></span>
          </div>
          <div style="display: flex; gap: 8px;">
            <button class="carnot-btn" id="card-btn-clear" style="padding: 4px 10px; font-size: 11px;">清空波形</button>
            <button class="carnot-btn" id="card-btn-reset" style="padding: 4px 10px; font-size: 11px;">重置实验</button>
          </div>
        </div>
      </div>
    `;

    this.badgeStatus = this.element.querySelector('#card-status-badge');
    this.btnOpenWaveform = this.element.querySelector('#btn-open-floating-waveform');

    this.valCurrentText = this.element.querySelector('#card-val-current');
    this.valCapVoltageText = this.element.querySelector('#card-val-cap-voltage');
    this.valTauText = this.element.querySelector('#card-val-tau');
    this.valChargeText = this.element.querySelector('#card-val-charge');
    this.valEnergyText = this.element.querySelector('#card-val-energy');

    this.sliderVoltage = this.element.querySelector('#slider-cap-voltage');
    this.sliderCapacitance = this.element.querySelector('#slider-cap-c');
    this.sliderResistance = this.element.querySelector('#slider-cap-r');

    this.valVoltageText = this.element.querySelector('#card-label-voltage');
    this.valCapacitanceText = this.element.querySelector('#card-label-capacitance');
    this.valResistanceText = this.element.querySelector('#card-label-resistance');

    this.btnCharge = this.element.querySelector('#card-btn-charge');
    this.btnNeutral = this.element.querySelector('#card-btn-neutral');
    this.btnDischarge = this.element.querySelector('#card-btn-discharge');
  }

  private bindEvents(): void {
    // 1. 滑块绑定与手势支持
    if (this.sliderVoltage) {
      bindVisionSlider(this.sliderVoltage, {
        activeSet: this.activeSliders,
        onChange: (val) => this.callbacks.onVoltageChange?.(val),
        onScrub: (val) => {
          if (this.valVoltageText) this.valVoltageText.textContent = `${val.toFixed(1)} V`;
        },
      });
    }

    if (this.sliderCapacitance) {
      bindVisionSlider(this.sliderCapacitance, {
        activeSet: this.activeSliders,
        onChange: (val) => this.callbacks.onCapacitanceChange?.(val),
        onScrub: (val) => {
          if (this.valCapacitanceText) this.valCapacitanceText.textContent = `${Math.round(val)} µF`;
        },
      });
    }

    if (this.sliderResistance) {
      bindVisionSlider(this.sliderResistance, {
        activeSet: this.activeSliders,
        onChange: (val) => this.callbacks.onResistanceChange?.(val),
        onScrub: (val) => {
          if (this.valResistanceText) this.valResistanceText.textContent = `${Math.round(val)} Ω`;
        },
      });
    }

    // 2. 开关操作
    this.btnCharge?.addEventListener('click', () => {
      this.callbacks.onSetSwitchPosition?.('charge');
    });

    this.btnNeutral?.addEventListener('click', () => {
      this.callbacks.onSetSwitchPosition?.('neutral');
    });

    this.btnDischarge?.addEventListener('click', () => {
      this.callbacks.onSetSwitchPosition?.('discharge');
    });

    // 3. 打开/置顶波形浮窗
    this.btnOpenWaveform?.addEventListener('click', () => {
      this.callbacks.onOpenWaveformWindow?.();
    });

    // 4. 清除与重置
    this.element.querySelector('#card-btn-clear')?.addEventListener('click', () => {
      this.callbacks.onClearSamples?.();
    });

    this.element.querySelector('#card-btn-reset')?.addEventListener('click', () => {
      this.callbacks.onResetExperiment?.();
    });
  }

  public updateTelemetry(telem: CapacitorTelemetry): void {
    // 状态徽标
    if (this.badgeStatus) {
      if (telem.switchPosition === 'charge') {
        this.badgeStatus.textContent = '⚡ 充电中';
        this.badgeStatus.style.background = 'rgba(56, 189, 248, 0.15)';
        this.badgeStatus.style.color = '#38bdf8';
      } else if (telem.switchPosition === 'discharge') {
        this.badgeStatus.textContent = '🔄 放电中';
        this.badgeStatus.style.background = 'rgba(245, 158, 11, 0.15)';
        this.badgeStatus.style.color = '#f59e0b';
      } else {
        this.badgeStatus.textContent = '⚪ 断开中立';
        this.badgeStatus.style.background = 'rgba(255, 255, 255, 0.08)';
        this.badgeStatus.style.color = '#94a3b8';
      }
    }

    // 按钮激活态
    this.btnCharge?.classList.toggle('active', telem.switchPosition === 'charge');
    this.btnNeutral?.classList.toggle('active', telem.switchPosition === 'neutral');
    this.btnDischarge?.classList.toggle('active', telem.switchPosition === 'discharge');

    // 瞬态读数
    if (this.valCurrentText) {
      const sign = telem.currentMa > 0 ? '+' : '';
      this.valCurrentText.textContent = `${sign}${telem.currentMa.toFixed(2)} mA`;
      this.valCurrentText.style.color = telem.currentMa > 0.01 ? '#38bdf8' : telem.currentMa < -0.01 ? '#f59e0b' : '#94a3b8';
    }
    if (this.valCapVoltageText) {
      this.valCapVoltageText.textContent = `${telem.voltageCapacitor.toFixed(2)} V`;
    }
    if (this.valTauText) {
      this.valTauText.textContent = `${telem.timeConstantTau.toFixed(2)} s`;
    }
    if (this.valChargeText) {
      this.valChargeText.textContent = `${telem.chargeMilliCoulomb.toFixed(2)} mC`;
    }
    if (this.valEnergyText) {
      this.valEnergyText.textContent = `${telem.energyMilliJoule.toFixed(2)} mJ`;
    }

    // 滑块同步（仅在用户未主动拖动时同步）
    if (this.sliderVoltage && !isSliderActive(this.sliderVoltage, this.activeSliders)) {
      this.sliderVoltage.value = String(telem.voltageSupply);
      if (this.valVoltageText) this.valVoltageText.textContent = `${telem.voltageSupply.toFixed(1)} V`;
    }
    if (this.sliderCapacitance && !isSliderActive(this.sliderCapacitance, this.activeSliders)) {
      this.sliderCapacitance.value = String(telem.capacitanceUf);
      if (this.valCapacitanceText) this.valCapacitanceText.textContent = `${Math.round(telem.capacitanceUf)} µF`;
    }
    if (this.sliderResistance && !isSliderActive(this.sliderResistance, this.activeSliders)) {
      this.sliderResistance.value = String(telem.dischargeResistanceOhm);
      if (this.valResistanceText) this.valResistanceText.textContent = `${Math.round(telem.dischargeResistanceOhm)} Ω`;
    }
  }

  public setVisible(visible: boolean): void {
    this.element.style.display = visible ? 'flex' : 'none';
  }
}
