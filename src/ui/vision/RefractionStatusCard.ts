import * as THREE from 'three';
import { bindVisionSlider, isSliderActive } from './sliderGestureHelper.ts';
import {
  type OpticalTelemetry,
  type LiquidMediumType,
  LIQUID_MEDIA,
} from '../../scene/optics/OpticalDiskApparatusMesh.ts';

export interface RefractionStatusCardCallbacks {
  onAngleChange?: (angleDeg: number) => void;
  onDirectionChange?: (isAirToWater: boolean) => void;
  onMediumChange?: (medium: LiquidMediumType, customN?: number) => void;
  onWavelengthChange?: (wavelengthNm: number) => void;
  onToggleNormal?: (show: boolean) => void;
  onToggleArcs?: (show: boolean) => void;
  onToggleTyndall?: (show: boolean) => void;
}

/**
 * 苹果设计风格 (visionOS / macOS Liquid Glass) 光学折射与反射控制卡片
 * 极致纯粹、克制优雅的磨砂玻璃半透明质感，剔除冗余多余功能，专注核心物理交互
 */
export class RefractionStatusCard {
  public element: HTMLElement;
  private callbacks: RefractionStatusCardCallbacks;
  private isVisible = false;

  // 滑块保护活跃集合
  private activeSliderSet = new Set<string>();

  // 状态与遥测缓存
  private currentTelemetry: OpticalTelemetry | null = null;
  private currentMedium: LiquidMediumType = 'water';
  private currentAngle = 45.0;
  private isAirToWater = true;

  // DOM 元素引用
  private m1Val: HTMLElement | null = null;
  private m2Val: HTMLElement | null = null;
  private m3Val: HTMLElement | null = null;
  private m4Val: HTMLElement | null = null;
  private tirBanner: HTMLElement | null = null;
  private angleSlider: HTMLInputElement | null = null;
  private angleReadout: HTMLElement | null = null;

  constructor(callbacks: RefractionStatusCardCallbacks = {}) {
    this.callbacks = callbacks;
    this.element = document.createElement('div');
    this.element.className = 'vision-thermo-status-card hud-interactive';
    this.render();
  }

  public setVisible(show: boolean): void {
    this.isVisible = show;
    this.element.style.display = show ? 'block' : 'none';
  }

  public get visible(): boolean {
    return this.isVisible;
  }

  private render(): void {
    this.element.innerHTML = `
      <div style="display:flex; flex-direction:column; gap:16px; color:#ffffff; font-family:-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', sans-serif;">
        
        <!-- 头部标题栏 (Apple Minimal Header) -->
        <div style="display:flex; justify-content:space-between; align-items:center; padding-bottom:8px; border-bottom:1px solid rgba(255,255,255,0.08);">
          <div style="display:flex; align-items:center; gap:10px;">
            <div style="width:28px; height:28px; border-radius:8px; background:rgba(255,255,255,0.08); display:flex; align-items:center; justify-content:center;">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="9"/>
                <line x1="3" y1="12" x2="21" y2="12"/>
                <line x1="12" y1="3" x2="12" y2="21" stroke-dasharray="2 2"/>
                <line x1="6" y1="6" x2="12" y2="12"/>
                <line x1="12" y1="12" x2="18" y2="6"/>
                <line x1="12" y1="12" x2="16" y2="20"/>
              </svg>
            </div>
            <div>
              <div style="font-size:15px; font-weight:600; letter-spacing:-0.2px;">光的反射与折射</div>
              <div style="font-size:11px; color:rgba(255,255,255,0.5);">斯涅尔折射定律与全反射</div>
            </div>
          </div>
          <div style="background:rgba(255,255,255,0.08); border:1px solid rgba(255,255,255,0.12); border-radius:12px; padding:3px 10px; font-size:11px; font-family:monospace; color:rgba(255,255,255,0.85); letter-spacing:0.3px;">
            n₁ sinθ₁ = n₂ sinθ₂
          </div>
        </div>

        <!-- 4 项极简物理指标卡片 (Apple Pill Cards) -->
        <div style="display:grid; grid-template-columns:repeat(4, 1fr); gap:8px;">
          <div style="background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.08); border-radius:12px; padding:10px 8px; text-align:center;">
            <div style="font-size:11px; color:rgba(255,255,255,0.5); margin-bottom:2px;">入射角 θ₁</div>
            <div id="val-theta1" style="font-size:17px; font-weight:600; color:#ffffff; font-variant-numeric:tabular-nums;">45.0°</div>
          </div>
          <div style="background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.08); border-radius:12px; padding:10px 8px; text-align:center;">
            <div style="font-size:11px; color:rgba(255,255,255,0.5); margin-bottom:2px;">反射角 θᵣ</div>
            <div id="val-thetaR" style="font-size:17px; font-weight:600; color:#ffffff; font-variant-numeric:tabular-nums;">45.0°</div>
          </div>
          <div style="background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.08); border-radius:12px; padding:10px 8px; text-align:center;">
            <div style="font-size:11px; color:rgba(255,255,255,0.5); margin-bottom:2px;">折射角 θ₂</div>
            <div id="val-theta2" style="font-size:17px; font-weight:600; color:#ffffff; font-variant-numeric:tabular-nums;">32.1°</div>
          </div>
          <div style="background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.08); border-radius:12px; padding:10px 8px; text-align:center;">
            <div style="font-size:11px; color:rgba(255,255,255,0.5); margin-bottom:2px;">折射率比</div>
            <div id="val-ratio" style="font-size:17px; font-weight:600; color:#ffffff; font-variant-numeric:tabular-nums;">1.333</div>
          </div>
        </div>

        <!-- 全反射 / 正常折射状态胶囊 (仅在关键物理状态时提供极简反馈) -->
        <div id="tir-status-banner" style="background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.08); border-radius:10px; padding:7px 12px; font-size:12px; display:flex; align-items:center; gap:8px;">
          <span id="tir-indicator-dot" style="width:6px; height:6px; border-radius:50%; background:rgba(255,255,255,0.4); display:inline-block;"></span>
          <span id="tir-status-text" style="color:rgba(255,255,255,0.75); font-size:12px; font-weight:400;">正常折射与反射模式</span>
        </div>

        <!-- 核心物理交互控制区 (Apple Control Section) -->
        <div style="display:flex; flex-direction:column; gap:14px; background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.06); border-radius:14px; padding:14px;">
          
          <!-- 入射方向分段控制器 (Apple Segmented Control) -->
          <div>
            <div style="font-size:12px; color:rgba(255,255,255,0.6); margin-bottom:6px; font-weight:500;">入射方向</div>
            <div style="display:flex; background:rgba(0,0,0,0.3); padding:3px; border-radius:9px; border:1px solid rgba(255,255,255,0.08);">
              <button id="btn-dir-air" class="apple-dir-seg active" style="flex:1; padding:6px 0; font-size:12px; font-weight:500; border:none; border-radius:7px; background:rgba(255,255,255,0.22); color:#ffffff; cursor:pointer; transition:all 0.15s ease;">
                空气 → 液体
              </button>
              <button id="btn-dir-water" class="apple-dir-seg" style="flex:1; padding:6px 0; font-size:12px; font-weight:500; border:none; border-radius:7px; background:transparent; color:rgba(255,255,255,0.55); cursor:pointer; transition:all 0.15s ease;">
                液体 → 空气 (全反射探究)
              </button>
            </div>
          </div>

          <!-- 入射角连续调节与快捷预设 -->
          <div>
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
              <span style="font-size:12px; color:rgba(255,255,255,0.6); font-weight:500;">入射角 θ₁</span>
              <span id="readout-angle" style="font-size:14px; font-weight:600; color:#ffffff; font-variant-numeric:tabular-nums;">45°</span>
            </div>
            
            <div style="display:flex; align-items:center; gap:8px;">
              <input type="range" id="slider-refraction-angle" class="thermo-mini-slider" min="-85" max="85" step="1" value="45" style="flex:1; accent-color:#0a84ff;" />
            </div>

            <!-- 常用角度预设药丸 -->
            <div style="display:flex; gap:6px; margin-top:8px;">
              <button class="btn-preset-ang" data-ang="0" style="flex:1; background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.08); border-radius:7px; font-size:11px; padding:4px 0; color:rgba(255,255,255,0.75); cursor:pointer;">0°</button>
              <button class="btn-preset-ang" data-ang="30" style="flex:1; background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.08); border-radius:7px; font-size:11px; padding:4px 0; color:rgba(255,255,255,0.75); cursor:pointer;">30°</button>
              <button class="btn-preset-ang" data-ang="45" style="flex:1; background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.08); border-radius:7px; font-size:11px; padding:4px 0; color:rgba(255,255,255,0.75); cursor:pointer;">45°</button>
              <button class="btn-preset-ang" data-ang="60" style="flex:1; background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.08); border-radius:7px; font-size:11px; padding:4px 0; color:rgba(255,255,255,0.75); cursor:pointer;">60°</button>
              <button id="btn-preset-tc" style="flex:1.2; background:rgba(255,255,255,0.12); border:1px solid rgba(255,255,255,0.18); border-radius:7px; font-size:11px; font-weight:500; padding:4px 0; color:#ffffff; cursor:pointer;">临界角 θc</button>
            </div>
          </div>

          <!-- 液体介质单选药丸 -->
          <div>
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
              <span style="font-size:12px; color:rgba(255,255,255,0.6); font-weight:500;">下半部液体介质</span>
              <span id="readout-medium-n" style="font-size:11px; color:rgba(255,255,255,0.5); font-family:monospace;">n₂ = 1.333</span>
            </div>
            <div style="display:flex; gap:6px; flex-wrap:wrap;">
              <button class="btn-medium-chip active" data-med="water" style="flex:1; min-width:68px; background:rgba(255,255,255,0.22); border:1px solid rgba(255,255,255,0.25); border-radius:8px; font-size:11px; padding:5px 6px; color:#ffffff; font-weight:500; cursor:pointer;">水 1.333</button>
              <button class="btn-medium-chip" data-med="ethanol" style="flex:1; min-width:68px; background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.08); border-radius:8px; font-size:11px; padding:5px 6px; color:rgba(255,255,255,0.75); cursor:pointer;">乙醇 1.361</button>
              <button class="btn-medium-chip" data-med="glycerin" style="flex:1; min-width:68px; background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.08); border-radius:8px; font-size:11px; padding:5px 6px; color:rgba(255,255,255,0.75); cursor:pointer;">甘油 1.473</button>
              <button class="btn-medium-chip" data-med="glass" style="flex:1; min-width:68px; background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.08); border-radius:8px; font-size:11px; padding:5px 6px; color:rgba(255,255,255,0.75); cursor:pointer;">玻璃 1.517</button>
              <button class="btn-medium-chip" data-med="flint" style="flex:1; min-width:68px; background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.08); border-radius:8px; font-size:11px; padding:5px 6px; color:rgba(255,255,255,0.75); cursor:pointer;">重火石 1.650</button>
            </div>
          </div>

          <!-- 激光光源颜色单选药丸 -->
          <div>
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
              <span style="font-size:12px; color:rgba(255,255,255,0.6); font-weight:500;">激光光源颜色</span>
              <span id="readout-laser-wl" style="font-size:11px; color:rgba(255,255,255,0.5); font-family:monospace;">650 nm (经典红光)</span>
            </div>
            <div style="display:flex; gap:6px; flex-wrap:wrap;">
              <button class="btn-laser-chip active" data-wl="650" style="flex:1; min-width:72px; background:rgba(239,68,68,0.22); border:1px solid #ef4444; border-radius:8px; font-size:11px; padding:5px 6px; color:#ffffff; font-weight:500; cursor:pointer;">
                <span style="display:inline-block; width:7px; height:7px; border-radius:50%; background:#ef4444; margin-right:4px;"></span>经典红光 650nm
              </button>
              <button class="btn-laser-chip" data-wl="532" style="flex:1; min-width:72px; background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.08); border-radius:8px; font-size:11px; padding:5px 6px; color:rgba(255,255,255,0.75); cursor:pointer;">
                <span style="display:inline-block; width:7px; height:7px; border-radius:50%; background:#22c55e; margin-right:4px;"></span>翠绿激光 532nm
              </button>
              <button class="btn-laser-chip" data-wl="450" style="flex:1; min-width:72px; background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.08); border-radius:8px; font-size:11px; padding:5px 6px; color:rgba(255,255,255,0.75); cursor:pointer;">
                <span style="display:inline-block; width:7px; height:7px; border-radius:50%; background:#3b82f6; margin-right:4px;"></span>宝石蓝光 450nm
              </button>
              <button class="btn-laser-chip" data-wl="589" style="flex:1; min-width:72px; background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.08); border-radius:8px; font-size:11px; padding:5px 6px; color:rgba(255,255,255,0.75); cursor:pointer;">
                <span style="display:inline-block; width:7px; height:7px; border-radius:50%; background:#f59e0b; margin-right:4px;"></span>钠黄光 589nm
              </button>
            </div>
          </div>

        </div>

      </div>
    `;

    this.cacheDOMElements();
    this.bindEvents();
  }

  private cacheDOMElements(): void {
    this.m1Val = this.element.querySelector('#val-theta1');
    this.m2Val = this.element.querySelector('#val-thetaR');
    this.m3Val = this.element.querySelector('#val-theta2');
    this.m4Val = this.element.querySelector('#val-ratio');
    this.tirBanner = this.element.querySelector('#tir-status-banner');
    this.angleSlider = this.element.querySelector('#slider-refraction-angle');
    this.angleReadout = this.element.querySelector('#readout-angle');
  }

  private bindEvents(): void {
    // 1. 入射角滑块手势适配 (bindVisionSlider)
    if (this.angleSlider) {
      bindVisionSlider(this.angleSlider, {
        activeSet: this.activeSliderSet,
        onChange: (val) => {
          let snappedVal = val;
          if (Math.abs(snappedVal) <= 2.0) {
            snappedVal = 0;
          } else {
            snappedVal = Math.round(snappedVal);
          }
          this.currentAngle = snappedVal;
          if (this.angleReadout) {
            this.angleReadout.textContent = `${Math.abs(snappedVal)}°`;
          }
          this.callbacks.onAngleChange?.(snappedVal);
        },
      });
    }

    // 2. 预设角度快捷按钮
    this.element.querySelectorAll('.btn-preset-ang').forEach((btn) => {
      btn.addEventListener('click', () => {
        const ang = Math.round(parseFloat(btn.getAttribute('data-ang') || '0'));
        if (this.angleSlider) this.angleSlider.value = ang.toString();
        this.currentAngle = ang;
        if (this.angleReadout) this.angleReadout.textContent = `${Math.abs(ang)}°`;
        this.callbacks.onAngleChange?.(ang);
      });
    });

    // 临界角快捷按钮
    this.element.querySelector('#btn-preset-tc')?.addEventListener('click', () => {
      if (this.currentTelemetry && this.currentTelemetry.criticalAngleDeg < 90) {
        const tc = Math.round(this.currentTelemetry.criticalAngleDeg);
        if (this.angleSlider) this.angleSlider.value = tc.toString();
        this.currentAngle = tc;
        if (this.angleReadout) this.angleReadout.textContent = `${tc}°`;
        this.callbacks.onAngleChange?.(tc);
      }
    });

    // 3. 入射方向切换 (Apple Segmented Style)
    const btnDirAir = this.element.querySelector('#btn-dir-air') as HTMLElement;
    const btnDirWater = this.element.querySelector('#btn-dir-water') as HTMLElement;

    const setSegmentActive = (isAir: boolean) => {
      this.isAirToWater = isAir;
      if (btnDirAir && btnDirWater) {
        if (isAir) {
          btnDirAir.style.background = 'rgba(255,255,255,0.22)';
          btnDirAir.style.color = '#ffffff';
          btnDirWater.style.background = 'transparent';
          btnDirWater.style.color = 'rgba(255,255,255,0.55)';
        } else {
          btnDirWater.style.background = 'rgba(255,255,255,0.22)';
          btnDirWater.style.color = '#ffffff';
          btnDirAir.style.background = 'transparent';
          btnDirAir.style.color = 'rgba(255,255,255,0.55)';
        }
      }
    };

    btnDirAir?.addEventListener('click', () => {
      setSegmentActive(true);
      this.callbacks.onDirectionChange?.(true);
    });

    btnDirWater?.addEventListener('click', () => {
      setSegmentActive(false);
      this.callbacks.onDirectionChange?.(false);
    });

    // 4. 液体介质单选
    const chips = this.element.querySelectorAll('.btn-medium-chip');
    chips.forEach((chip) => {
      chip.addEventListener('click', () => {
        chips.forEach((c) => {
          (c as HTMLElement).style.background = 'rgba(255,255,255,0.06)';
          (c as HTMLElement).style.borderColor = 'rgba(255,255,255,0.08)';
          (c as HTMLElement).style.color = 'rgba(255,255,255,0.75)';
          (c as HTMLElement).style.fontWeight = '400';
        });

        (chip as HTMLElement).style.background = 'rgba(255,255,255,0.22)';
        (chip as HTMLElement).style.borderColor = 'rgba(255,255,255,0.25)';
        (chip as HTMLElement).style.color = '#ffffff';
        (chip as HTMLElement).style.fontWeight = '500';

        const med = chip.getAttribute('data-med') as LiquidMediumType;
        this.currentMedium = med;
        const info = LIQUID_MEDIA[med] || LIQUID_MEDIA.water;
        const readout = this.element.querySelector('#readout-medium-n');
        if (readout) readout.textContent = `n₂ = ${info.n.toFixed(3)}`;
        this.callbacks.onMediumChange?.(med, info.n);
      });
    });

    // 5. 激光颜色单选
    const laserChips = this.element.querySelectorAll('.btn-laser-chip');
    laserChips.forEach((chip) => {
      chip.addEventListener('click', () => {
        const wl = Number(chip.getAttribute('data-wl')) || 650;
        laserChips.forEach((b) => {
          (b as HTMLElement).style.background = 'rgba(255,255,255,0.06)';
          (b as HTMLElement).style.borderColor = 'rgba(255,255,255,0.08)';
          (b as HTMLElement).style.color = 'rgba(255,255,255,0.75)';
          b.classList.remove('active');
        });
        chip.classList.add('active');
        const colorMap: Record<number, string> = { 650: '#ef4444', 532: '#22c55e', 450: '#3b82f6', 589: '#f59e0b' };
        const c = colorMap[wl] || '#ef4444';
        (chip as HTMLElement).style.background = `${c}33`;
        (chip as HTMLElement).style.borderColor = c;
        (chip as HTMLElement).style.color = '#ffffff';

        const readout = this.element.querySelector('#readout-laser-wl');
        if (readout) {
          const nameMap: Record<number, string> = {
            650: '650 nm (经典红光)',
            532: '532 nm (翠绿激光)',
            450: '450 nm (宝石蓝光)',
            589: '589 nm (钠黄光)',
          };
          readout.textContent = nameMap[wl] || `${wl} nm`;
        }
        this.callbacks.onWavelengthChange?.(wl);
      });
    });
  }

  /**
   * 逐帧遥测更新 (由实验类的 update 循环调用)
   */
  public updateTelemetry(t: OpticalTelemetry): void {
    this.currentTelemetry = t;
    if (!this.isVisible) return;

    // 1. 更新 4 项指标数值 (纯白高雅排版，精确到整数角度)
    if (this.m1Val) this.m1Val.textContent = `${Math.round(Math.abs(t.incidentAngleDeg))}°`;
    if (this.m2Val) this.m2Val.textContent = `${Math.round(t.reflectionAngleDeg)}°`;
    if (this.m3Val) {
      if (t.isTotalInternalReflection) {
        this.m3Val.textContent = '全反射';
        this.m3Val.style.color = '#ff9f0a';
      } else {
        this.m3Val.textContent = `${Math.round(t.refractionAngleDeg)}°`;
        this.m3Val.style.color = '#ffffff';
      }
    }
    if (this.m4Val) {
      this.m4Val.textContent = t.isTotalInternalReflection ? '--' : t.snellRatio.toFixed(3);
    }

    // 2. 更新全反射横幅状态
    if (this.tirBanner) {
      const dot = this.element.querySelector('#tir-indicator-dot') as HTMLElement;
      const text = this.element.querySelector('#tir-status-text') as HTMLElement;

      if (t.isTotalInternalReflection) {
        this.tirBanner.style.borderColor = 'rgba(255, 159, 10, 0.35)';
        this.tirBanner.style.background = 'rgba(255, 159, 10, 0.08)';
        if (dot) dot.style.background = '#ff9f0a';
        if (text) {
          text.innerHTML = `<span style="color:#ff9f0a; font-weight:600;">全反射发生 (TIR)</span> · 临界角 θc = ${Math.round(t.criticalAngleDeg)}°`;
        }
      } else {
        this.tirBanner.style.borderColor = 'rgba(255,255,255,0.08)';
        this.tirBanner.style.background = 'rgba(255,255,255,0.04)';
        if (dot) dot.style.background = 'rgba(255,255,255,0.4)';
        if (text) {
          text.textContent = `正常折射与反射模式 (R: ${(t.reflectionCoeffR * 100).toFixed(0)}%, T: ${(t.transmissionCoeffT * 100).toFixed(0)}%)`;
        }
      }
    }

    // 3. 同步滑块位置 (若未在活跃捏合/拖拽状态)
    if (this.angleSlider && !isSliderActive(this.angleSlider, this.activeSliderSet)) {
      this.angleSlider.value = Math.round(t.incidentAngleDeg).toString();
      if (this.angleReadout) {
        this.angleReadout.textContent = `${Math.round(Math.abs(t.incidentAngleDeg))}°`;
      }
    }
  }
}
