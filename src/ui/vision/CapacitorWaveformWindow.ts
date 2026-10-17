import * as THREE from 'three';
import { CSS3DObject } from 'three/addons/renderers/CSS3DRenderer.js';
import type { SwitchPosition, WaveformSample, CapacitorTelemetry } from '../../physics/em/capacitorDischarge.ts';

export type WaveformGraphMode = 'current' | 'voltage' | 'dual';

export interface CapacitorWaveformWindowCallbacks {
  onSetSwitchPosition: (pos: SwitchPosition) => void;
  onClearSamples: () => void;
  onResetExperiment: () => void;
  css3dScene?: THREE.Scene;
  camera?: THREE.Camera;
}

export class CapacitorWaveformWindow {
  public element: HTMLElement;
  public launcherBtn: HTMLElement;
  public css3dObject: any = null;

  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D | null = null;
  private callbacks: CapacitorWaveformWindowCallbacks;

  // 3D 空间变换与漂浮状态
  public isVisible = true;
  private isMinimized = false;
  private isPaused = false;
  private graphMode: WaveformGraphMode = 'current';

  // 3D 空间悬浮物理坐标与朝向
  public targetPosition = new THREE.Vector3(0.85, 1.85, 0.05);
  public targetRotY = 0;
  private lastCamera?: THREE.Camera;

  // 3D 空间拖动状态
  private isDragging = false;
  private dragStartPointerX = 0;
  private dragStartPointerY = 0;
  private dragStartTargetPos = new THREE.Vector3();

  // 悬停数据探针
  private hoverSample: { x: number; y: number; sample: WaveformSample } | null = null;

  // 遥测与波形数据缓存
  private cachedTelemetry: CapacitorTelemetry | null = null;
  private cachedSamples: readonly WaveformSample[] = [];

  // DOM 元素引用
  private titleStatusBadge: HTMLElement | null = null;
  private liveCurrentValEl: HTMLElement | null = null;
  private liveVoltageValEl: HTMLElement | null = null;
  private liveTauValEl: HTMLElement | null = null;
  private liveChargeValEl: HTMLElement | null = null;
  private livePeakValEl: HTMLElement | null = null;
  private pauseBtn: HTMLElement | null = null;
  private windowContentEl: HTMLElement | null = null;
  private btnCharge: HTMLElement | null = null;
  private btnNeutral: HTMLElement | null = null;
  private btnDischarge: HTMLElement | null = null;

  constructor(callbacks: CapacitorWaveformWindowCallbacks) {
    this.callbacks = callbacks;
    this.lastCamera = callbacks.camera;

    // 创建标准 VisionOS 空间视窗根元素
    this.element = document.createElement('div');
    this.element.id = 'capacitor-waveform-window';
    this.element.className = 'vision-spatial-window capacitor-spatial-window hud-interactive';

    // 创建右侧快捷恢复按钮（当视窗关闭时显示）
    this.launcherBtn = document.createElement('button');
    this.launcherBtn.id = 'capacitor-waveform-launcher';
    this.launcherBtn.className = 'capacitor-waveform-launcher hud-interactive';
    this.launcherBtn.innerHTML = `
      <svg class="apple-sf-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
      </svg>
      <span>充放电波形分析仪</span>
    `;
    this.launcherBtn.style.display = 'none';

    this.render();
    this.canvas = this.element.querySelector('#waveform-canvas') as HTMLCanvasElement;
    this.ctx = this.canvas?.getContext('2d') ?? null;

    // 构建 CSS3DObject 并挂载至 3D 空间
    this.initSpatialObject();

    this.bindEvents();
    this.attachToDOM();
  }

  private initSpatialObject(): void {
    try {
      this.css3dObject = new CSS3DObject(this.element);
      this.css3dObject.rotation.order = 'YXZ';
      this.css3dObject.scale.set(0.0028, 0.0028, 0.0028);
      this.css3dObject.position.copy(this.targetPosition);

      if (this.callbacks.css3dScene) {
        this.callbacks.css3dScene.add(this.css3dObject);
      }
    } catch {
      // Node 测试环境容错降级
      this.css3dObject = new THREE.Object3D() as any;
      if (this.css3dObject) {
        this.css3dObject.element = this.element;
      }
    }
  }

  private render(): void {
    this.element.innerHTML = `
      <!-- 统一 VisionOS 空间玻璃视窗框架 -->
      <div class="vision-window-frame capacitor-window-frame">
        <!-- 1. 顶层毛玻璃胶囊标题栏 -->
        <div class="vision-window-header" id="cap-win-drag-handle">
          <div class="header-left">
            <span class="cap-win-status-badge status-neutral" id="cap-win-status-badge">⚪ 断开中立</span>
          </div>

          <div class="header-center">
            <div class="vision-drag-indicator"></div>
            <span class="vision-window-title">RC 电容器充放电实时波形分析仪</span>
          </div>

          <div class="header-right">
            <button class="vision-window-btn" id="btn-cap-recenter" title="校准朝向正对视角 (R)">
              <svg class="apple-sf-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"/>
                <line x1="12" y1="8" x2="12" y2="12"/>
                <line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
            </button>
            <button class="vision-window-btn btn-close" id="btn-cap-win-close" title="关闭视窗 (ESC)">
              <svg class="apple-sf-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">
                <line x1="18" y1="6" x2="6" y2="18"/>
                <line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
        </div>

        <!-- 2. 视窗主体内容区 -->
        <div class="vision-window-body" id="cap-win-content" style="gap: 12px; padding: 18px 24px;">
          <!-- 工具栏：波形模式分段控制与动作按钮 -->
          <div style="display: flex; justify-content: space-between; align-items: center; gap: 12px;">
            <div class="cap-mode-tabs">
              <button class="cap-mode-tab active" data-mode="current">I-t 电流波形</button>
              <button class="cap-mode-tab" data-mode="voltage">U-t 电压波形</button>
              <button class="cap-mode-tab" data-mode="dual">双通道对比</button>
            </div>
            <div style="display: flex; align-items: center; gap: 8px;">
              <button class="carnot-btn" id="btn-cap-pause" style="padding: 6px 14px; font-size: 12.5px;">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                  <rect x="6" y="4" width="4" height="16"/>
                  <rect x="14" y="4" width="4" height="16"/>
                </svg>
                <span>暂停</span>
              </button>
              <button class="carnot-btn" id="btn-cap-clear" style="padding: 6px 14px; font-size: 12.5px;">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                  <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                </svg>
                <span>清空</span>
              </button>
            </div>
          </div>

          <!-- 高清 Retina 示波器视窗画布 -->
          <div class="cap-canvas-container">
            <canvas id="waveform-canvas" width="1032" height="340"></canvas>
            <div class="cap-canvas-tooltip" id="cap-canvas-tooltip" style="display: none;"></div>
          </div>

          <!-- 3. 实时遥测指标卡片（对齐菜单屏经典 .hall-metric-box 风格） -->
          <div class="hall-pure-metrics" style="display: grid; grid-template-columns: repeat(5, 1fr); gap: 10px;">
            <div class="hall-metric-box">
              <div class="hall-metric-title">瞬时电流 I(t)</div>
              <div class="hall-metric-num" id="metric-current" style="color: #38bdf8;">0.00 mA</div>
              <div class="hall-metric-sub">传感器实测</div>
            </div>
            <div class="hall-metric-box">
              <div class="hall-metric-title">电容电压 Uc(t)</div>
              <div class="hall-metric-num" id="metric-voltage" style="color: #c084fc;">0.00 V</div>
              <div class="hall-metric-sub">端极板电势差</div>
            </div>
            <div class="hall-metric-box">
              <div class="hall-metric-title">时间常数 τ = RC</div>
              <div class="hall-metric-num" id="metric-tau">1.00 s</div>
              <div class="hall-metric-sub">暂态响应特征周期</div>
            </div>
            <div class="hall-metric-box">
              <div class="hall-metric-title">积分电量 Q = ∫I dt</div>
              <div class="hall-metric-num" id="metric-charge" style="color: #34d399;">0.00 mC</div>
              <div class="hall-metric-sub">电荷量曲线积分</div>
            </div>
            <div class="hall-metric-box">
              <div class="hall-metric-title">峰值电流 I_max</div>
              <div class="hall-metric-num" id="metric-peak">0.00 mA</div>
              <div class="hall-metric-sub">瞬态极大极值</div>
            </div>
          </div>

          <!-- 4. 单刀双掷开关档位快速控制（对齐 .carnot-btn 统一设计系统） -->
          <div style="background: rgba(255, 255, 255, 0.04); border-radius: 14px; padding: 12px 16px; border: 1px solid rgba(255, 255, 255, 0.08);">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
              <span style="font-size: 13px; font-weight: 600; color: #94a3b8;">单刀双掷开关档位快速控制：</span>
              <span style="font-size: 12px; color: #64748b;">支持直接点击 3D 实体闸刀开关或点选下方档位</span>
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px;">
              <button class="carnot-btn cap-switch-btn charge" id="btn-throw-charge" style="height: 42px; justify-content: center; font-size: 13.5px; font-weight: 600;">
                <span class="btn-indicator"></span>
                <span>① 掷向电源侧 (充电)</span>
              </button>
              <button class="carnot-btn cap-switch-btn neutral active" id="btn-throw-neutral" style="height: 42px; justify-content: center; font-size: 13.5px; font-weight: 600;">
                <span class="btn-indicator"></span>
                <span>Ⓞ 中立断开 (保持)</span>
              </button>
              <button class="carnot-btn cap-switch-btn discharge" id="btn-throw-discharge" style="height: 42px; justify-content: center; font-size: 13.5px; font-weight: 600;">
                <span class="btn-indicator"></span>
                <span>② 掷向放电侧 (放电)</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- 底部 VisionOS 空间视窗拖拽定位手柄条 -->
      <div class="vision-window-mover-bar" id="cap-win-mover-bar" title="校准朝向 (R) · 拖动空间位置"></div>
    `;

    this.titleStatusBadge = this.element.querySelector('#cap-win-status-badge');
    this.liveCurrentValEl = this.element.querySelector('#metric-current');
    this.liveVoltageValEl = this.element.querySelector('#metric-voltage');
    this.liveTauValEl = this.element.querySelector('#metric-tau');
    this.liveChargeValEl = this.element.querySelector('#metric-charge');
    this.livePeakValEl = this.element.querySelector('#metric-peak');
    this.pauseBtn = this.element.querySelector('#btn-cap-pause');
    this.windowContentEl = this.element.querySelector('#cap-win-content');

    this.btnCharge = this.element.querySelector('#btn-throw-charge');
    this.btnNeutral = this.element.querySelector('#btn-throw-neutral');
    this.btnDischarge = this.element.querySelector('#btn-throw-discharge');
  }

  private attachToDOM(): void {
    if (!document.body.contains(this.launcherBtn)) {
      document.body.appendChild(this.launcherBtn);
    }
  }

  private bindEvents(): void {
    // 阻止指针、鼠标与滚轮事件向外冒泡，防止悬浮视窗交互干扰 3D 场景控制
    this.element.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.element.addEventListener('mousedown', (e) => e.stopPropagation());
    this.element.addEventListener('wheel', (e) => e.stopPropagation(), { passive: true });

    // 1. 空间视窗 3D 平面拖拽与视角校准
    const handle = this.element.querySelector('#cap-win-drag-handle') as HTMLElement;
    const moverBar = this.element.querySelector('#cap-win-mover-bar') as HTMLElement;

    const bindSpatialDrag = (el: HTMLElement | null) => {
      if (!el) return;
      el.addEventListener('pointerdown', (e: PointerEvent) => {
        if ((e.target as HTMLElement).closest('.vision-window-btn, button, input')) return;
        this.isDragging = true;
        this.dragStartPointerX = e.clientX;
        this.dragStartPointerY = e.clientY;
        this.dragStartTargetPos.copy(this.targetPosition);
        try {
          el.setPointerCapture(e.pointerId);
        } catch {}
      });

      el.addEventListener('pointermove', (e: PointerEvent) => {
        if (!this.isDragging || !this.lastCamera) return;
        const dx = e.clientX - this.dragStartPointerX;
        const dy = e.clientY - this.dragStartPointerY;

        // 根据当前相机朝向计算 3D 摄像机视平面正交矢量
        const camRight = new THREE.Vector3(1, 0, 0).applyQuaternion(this.lastCamera.quaternion);
        const camUp = new THREE.Vector3(0, 1, 0).applyQuaternion(this.lastCamera.quaternion);

        // 3D 视平面平移缩放系数
        const sensitivity = 0.0035;
        this.targetPosition.copy(this.dragStartTargetPos)
          .addScaledVector(camRight, dx * sensitivity)
          .addScaledVector(camUp, -dy * sensitivity);
      });

      const stopDrag = (e: PointerEvent) => {
        if (this.isDragging) {
          this.isDragging = false;
          try {
            el.releasePointerCapture(e.pointerId);
          } catch {}
        }
      };
      el.addEventListener('pointerup', stopDrag);
      el.addEventListener('pointercancel', stopDrag);
    };

    bindSpatialDrag(handle);
    bindSpatialDrag(moverBar);

    // 2. 点击底部拖动条或对准按键：瞬时正对当前摄像机正前方
    moverBar?.addEventListener('click', () => {
      if (this.lastCamera) {
        this.positionInFrontOfCamera(this.lastCamera);
      }
    });

    this.element.querySelector('#btn-cap-recenter')?.addEventListener('click', () => {
      if (this.lastCamera) {
        this.positionInFrontOfCamera(this.lastCamera);
      }
    });

    // 3. 视窗关闭与桌面快捷胶囊唤醒
    this.element.querySelector('#btn-cap-win-close')?.addEventListener('click', () => {
      this.close();
    });

    this.launcherBtn.addEventListener('click', () => {
      this.open();
    });

    // 4. 键盘快捷键 R (校准朝向) 与 Escape (关闭)
    window.addEventListener('keydown', (e) => {
      if (!this.isVisible) return;
      if (e.code === 'KeyR') {
        if (this.lastCamera) {
          this.positionInFrontOfCamera(this.lastCamera);
        }
      } else if (e.code === 'Escape') {
        this.close();
      }
    });

    // 5. 波形曲线模式切换
    this.element.querySelectorAll('.cap-mode-tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        this.element.querySelectorAll('.cap-mode-tab').forEach((t) => t.classList.remove('active'));
        tab.classList.add('active');
        this.graphMode = (tab.getAttribute('data-mode') as WaveformGraphMode) || 'current';
        this.drawWaveform();
      });
    });

    // 6. 清除与暂停
    this.element.querySelector('#btn-cap-clear')?.addEventListener('click', () => {
      this.callbacks.onClearSamples();
      this.drawWaveform();
    });

    this.pauseBtn?.addEventListener('click', () => {
      this.isPaused = !this.isPaused;
      if (this.pauseBtn) {
        this.pauseBtn.innerHTML = this.isPaused
          ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><polygon points="5 3 19 12 5 21 5 3"/></svg><span>继续</span>`
          : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg><span>暂停</span>`;
      }
      this.updateStatusBadge();
    });

    // 7. 档位快速切换按键
    this.btnCharge?.addEventListener('click', () => {
      this.callbacks.onSetSwitchPosition('charge');
    });

    this.btnNeutral?.addEventListener('click', () => {
      this.callbacks.onSetSwitchPosition('neutral');
    });

    this.btnDischarge?.addEventListener('click', () => {
      this.callbacks.onSetSwitchPosition('discharge');
    });

    // 8. 示波器探针交互
    if (this.canvas) {
      this.canvas.addEventListener('mousemove', (e) => {
        this.handleCanvasMouseMove(e);
      });
      this.canvas.addEventListener('mouseleave', () => {
        this.hoverSample = null;
        const tooltip = this.element.querySelector('#cap-canvas-tooltip') as HTMLElement;
        if (tooltip) tooltip.style.display = 'none';
        this.drawWaveform();
      });
    }
  }

  // ================= 3D 空间漂浮与姿态更新 =================
  /**
   * 将 3D 空间视窗平滑置于摄像机正前方视线中心
   */
  public positionInFrontOfCamera(camera: THREE.Camera, snap = false): void {
    this.lastCamera = camera;
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);

    const forwardX = dir.x;
    const forwardZ = dir.z;
    const horizontalLen = Math.hypot(forwardX, forwardZ) || 1e-4;
    const normForwardX = forwardX / horizontalLen;
    const normForwardZ = forwardZ / horizontalLen;

    // 置于视线正前方 2.2 米处
    const distance = 2.2;
    const targetX = camera.position.x + normForwardX * distance;
    const targetZ = camera.position.z + normForwardZ * distance;
    const targetY = Math.max(1.1, Math.min(2.5, camera.position.y + dir.y * 0.8));

    this.targetPosition.set(targetX, targetY, targetZ);
    this.targetRotY = Math.atan2(camera.position.x - targetX, camera.position.z - targetZ);

    if (snap && this.css3dObject) {
      this.css3dObject.position.copy(this.targetPosition);
      this.css3dObject.rotation.set(0, this.targetRotY, 0);
    }
  }

  /**
   * 每帧更新 3D 空间视窗平滑插值与摄像机对齐（消除梯形失真）
   */
  public update(delta: number, camera?: THREE.Camera): void {
    if (camera) {
      this.lastCamera = camera;
    }
    const cam = this.lastCamera;

    if (this.css3dObject && cam && this.isVisible) {
      const targetX = this.targetPosition.x;
      const targetY = this.targetPosition.y;
      const targetZ = this.targetPosition.z;

      const dx = cam.position.x - targetX;
      const dy = cam.position.y - targetY;
      const dz = cam.position.z - targetZ;
      const distXZ = Math.hypot(dx, dz) || 1e-4;

      // 视窗法线对齐视线俯仰角（Pitch），完全消除透视形变
      const targetRotX = -Math.atan2(dy, distXZ);
      const targetRotY = Math.atan2(dx, dz);

      const lerpSpeed = Math.min(1.0, delta * 7.0);
      const pos = this.css3dObject.position;
      const rot = this.css3dObject.rotation;

      pos.x = THREE.MathUtils.lerp(pos.x, targetX, lerpSpeed);
      pos.y = THREE.MathUtils.lerp(pos.y, targetY, lerpSpeed);
      pos.z = THREE.MathUtils.lerp(pos.z, targetZ, lerpSpeed);

      // 角度平滑旋转
      let diffX = targetRotX - rot.x;
      while (diffX < -Math.PI) diffX += Math.PI * 2;
      while (diffX > Math.PI) diffX -= Math.PI * 2;
      rot.x += diffX * lerpSpeed;

      let diffY = targetRotY - rot.y;
      while (diffY < -Math.PI) diffY += Math.PI * 2;
      while (diffY > Math.PI) diffY -= Math.PI * 2;
      rot.y += diffY * lerpSpeed;
      rot.z = 0;
    }

    if (this.isVisible) {
      this.drawWaveform();
    }
  }

  // ================= 示波器探针交互 =================
  private handleCanvasMouseMove(e: MouseEvent): void {
    if (!this.cachedSamples || this.cachedSamples.length < 2) return;
    const rect = this.canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const w = this.canvas.width;
    const paddingLeft = 55;
    const paddingRight = 30;
    const plotWidth = w - paddingLeft - paddingRight;

    if (mouseX < paddingLeft || mouseX > w - paddingRight) {
      this.hoverSample = null;
      return;
    }

    const samples = this.cachedSamples;
    const tMin = samples[0].time;
    const tMax = Math.max(tMin + 5, samples[samples.length - 1].time);
    const targetTime = tMin + ((mouseX - paddingLeft) / plotWidth) * (tMax - tMin);

    let closest = samples[0];
    let minDiff = Math.abs(closest.time - targetTime);
    for (let i = 1; i < samples.length; i++) {
      const diff = Math.abs(samples[i].time - targetTime);
      if (diff < minDiff) {
        minDiff = diff;
        closest = samples[i];
      }
    }

    this.hoverSample = { x: mouseX, y: mouseY, sample: closest };
    this.showTooltip(mouseX, mouseY, closest);
    this.drawWaveform();
  }

  private showTooltip(x: number, y: number, sample: WaveformSample): void {
    const tooltip = this.element.querySelector('#cap-canvas-tooltip') as HTMLElement;
    if (!tooltip) return;

    let stateLabel = '断开中立';
    let stateColor = '#94a3b8';
    if (sample.state === 'charge') {
      stateLabel = '⚡ 充电状态';
      stateColor = '#38bdf8';
    } else if (sample.state === 'discharge') {
      stateLabel = '🔄 放电状态';
      stateColor = '#f59e0b';
    }

    tooltip.innerHTML = `
      <div style="font-weight: 700; color: ${stateColor}; margin-bottom: 3px;">${stateLabel}</div>
      <div>时间 t: <b>${sample.time.toFixed(2)} s</b></div>
      <div>电流 I: <b style="color: ${sample.currentMa >= 0 ? '#38bdf8' : '#f59e0b'}">${sample.currentMa > 0 ? '+' : ''}${sample.currentMa.toFixed(2)} mA</b></div>
      <div>电压 Uc: <b>${sample.voltageCapacitor.toFixed(2)} V</b></div>
    `;

    tooltip.style.left = `${Math.min(x + 16, this.canvas.clientWidth - 160)}px`;
    tooltip.style.top = `${Math.max(10, y - 75)}px`;
    tooltip.style.display = 'block';
  }

  // ================= 遥测同步与数据显示 =================
  public updateTelemetry(telemetry: CapacitorTelemetry, samples: readonly WaveformSample[]): void {
    this.cachedTelemetry = telemetry;
    if (!this.isPaused) {
      this.cachedSamples = samples;
    }

    this.updateStatusBadge();
    this.updateNumericDisplays(telemetry);
    this.updateSwitchButtons(telemetry.switchPosition);

    if (this.isVisible) {
      this.drawWaveform();
    }
  }

  private updateStatusBadge(): void {
    if (!this.titleStatusBadge) return;

    if (this.isPaused) {
      this.titleStatusBadge.className = 'cap-win-status-badge status-paused';
      this.titleStatusBadge.textContent = '⏸ 采样暂停';
      return;
    }

    const pos = this.cachedTelemetry?.switchPosition ?? 'neutral';
    if (pos === 'charge') {
      this.titleStatusBadge.className = 'cap-win-status-badge status-charging';
      this.titleStatusBadge.textContent = '⚡ 充电中 (I > 0)';
    } else if (pos === 'discharge') {
      this.titleStatusBadge.className = 'cap-win-status-badge status-discharging';
      this.titleStatusBadge.textContent = '🔄 放电中 (I < 0)';
    } else {
      this.titleStatusBadge.className = 'cap-win-status-badge status-neutral';
      this.titleStatusBadge.textContent = '⚪ 断开中立';
    }
  }

  private updateNumericDisplays(telem: CapacitorTelemetry): void {
    if (this.liveCurrentValEl) {
      const sign = telem.currentMa > 0 ? '+' : '';
      this.liveCurrentValEl.textContent = `${sign}${telem.currentMa.toFixed(2)} mA`;
      this.liveCurrentValEl.style.color = telem.currentMa > 0.01 ? '#38bdf8' : telem.currentMa < -0.01 ? '#f59e0b' : '#94a3b8';
    }
    if (this.liveVoltageValEl) {
      this.liveVoltageValEl.textContent = `${telem.voltageCapacitor.toFixed(2)} V`;
    }
    if (this.liveTauValEl) {
      this.liveTauValEl.textContent = `${telem.timeConstantTau.toFixed(2)} s`;
    }
    if (this.liveChargeValEl) {
      const q = telem.switchPosition === 'discharge' ? telem.dischargeIntegratedMilliCoulomb : telem.chargeIntegratedMilliCoulomb;
      this.liveChargeValEl.textContent = `${q.toFixed(2)} mC`;
    }
    if (this.livePeakValEl) {
      const peak = Math.max(telem.peakChargeCurrentMa, telem.peakDischargeCurrentMa);
      this.livePeakValEl.textContent = `${peak.toFixed(2)} mA`;
    }
  }

  private updateSwitchButtons(pos: SwitchPosition): void {
    this.btnCharge?.classList.toggle('active', pos === 'charge');
    this.btnNeutral?.classList.toggle('active', pos === 'neutral');
    this.btnDischarge?.classList.toggle('active', pos === 'discharge');
  }

  // ================= 波形绘制引擎 (Canvas 2D) =================
  private drawWaveform(): void {
    if (!this.ctx || !this.canvas) return;
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;

    // 清屏与深邃高对比度示波器底色
    ctx.fillStyle = '#030a12';
    ctx.fillRect(0, 0, w, h);

    const paddingLeft = 60;
    const paddingRight = 35;
    const paddingTop = 26;
    const paddingBottom = 34;
    const plotW = w - paddingLeft - paddingRight;
    const plotH = h - paddingTop - paddingBottom;

    // 1. 绘制暗色荧光背景方格网 (10 x 6 网格)
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.09)';
    ctx.lineWidth = 1;
    const cols = 10;
    for (let c = 0; c <= cols; c++) {
      const x = paddingLeft + (plotW * c) / cols;
      ctx.beginPath();
      ctx.moveTo(x, paddingTop);
      ctx.lineTo(x, h - paddingBottom);
      ctx.stroke();
    }
    const rows = 6;
    for (let r = 0; r <= rows; r++) {
      const y = paddingTop + (plotH * r) / rows;
      ctx.beginPath();
      ctx.moveTo(paddingLeft, y);
      ctx.lineTo(w - paddingRight, y);
      ctx.stroke();
    }

    // 确定坐标轴范围
    const samples = this.cachedSamples;
    const tMin = samples.length > 0 ? samples[0].time : 0;
    const tLatest = samples.length > 0 ? samples[samples.length - 1].time : 5;
    const tWindow = Math.max(5.0, tLatest - tMin);

    let yMin = -15.0;
    let yMax = 15.0;

    if (this.graphMode === 'voltage') {
      const supply = this.cachedTelemetry?.voltageSupply ?? 10.0;
      yMin = -1.0;
      yMax = Math.max(12.0, supply * 1.2);
    } else {
      const peak = Math.max(12.0, this.cachedTelemetry?.peakChargeCurrentMa ?? 0, this.cachedTelemetry?.peakDischargeCurrentMa ?? 0);
      const limit = Math.ceil(peak * 1.25);
      yMin = -limit;
      yMax = limit;
    }

    const toScreenX = (t: number) => paddingLeft + ((t - tMin) / tWindow) * plotW;
    const toScreenY = (val: number) => paddingTop + plotH - ((val - yMin) / (yMax - yMin)) * plotH;

    // 2. 绘制零基线 (Zero reference line)
    const zeroY = toScreenY(0);
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.5)';
    ctx.lineWidth = 1.5;
    if (typeof ctx.setLineDash === 'function') {
      ctx.setLineDash([5, 4]);
    }
    ctx.beginPath();
    ctx.moveTo(paddingLeft, zeroY);
    ctx.lineTo(w - paddingRight, zeroY);
    ctx.stroke();
    if (typeof ctx.setLineDash === 'function') {
      ctx.setLineDash([]);
    }

    // 3. 绘制坐标轴刻度与文字
    ctx.fillStyle = '#64748b';
    ctx.font = '500 12px monospace';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';

    const yTicks = this.graphMode === 'voltage' ? [0, yMax * 0.25, yMax * 0.5, yMax * 0.75, yMax] : [yMin, yMin * 0.5, 0, yMax * 0.5, yMax];
    const unitLabel = this.graphMode === 'voltage' ? 'V' : 'mA';
    if (typeof ctx.fillText === 'function') {
      for (const val of yTicks) {
        const y = toScreenY(val);
        ctx.fillText(`${val > 0 ? '+' : ''}${val.toFixed(0)}`, paddingLeft - 8, y);
      }

      ctx.textAlign = 'left';
      ctx.fillStyle = '#94a3b8';
      ctx.fillText(`${unitLabel}`, paddingLeft - 50, paddingTop - 10);
      ctx.textAlign = 'right';
      ctx.fillText('t (s)', w - paddingRight, h - paddingBottom + 20);

      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      for (let c = 0; c <= cols; c += 2) {
        const t = tMin + (tWindow * c) / cols;
        const x = paddingLeft + (plotW * c) / cols;
        ctx.fillText(`${t.toFixed(1)}`, x, h - paddingBottom + 6);
      }
    }

    if (samples.length < 2) return;

    // 4. 绘制波形曲线
    // A. 电流曲线 (I-t)
    if (this.graphMode === 'current' || this.graphMode === 'dual') {
      for (let i = 0; i < samples.length - 1; i++) {
        const s0 = samples[i];
        const s1 = samples[i + 1];
        const x0 = toScreenX(s0.time);
        const y0 = toScreenY(s0.currentMa);
        const x1 = toScreenX(s1.time);
        const y1 = toScreenY(s1.currentMa);

        const isCharging = s0.state === 'charge';
        const isDischarging = s0.state === 'discharge';

        ctx.strokeStyle = isCharging ? '#38bdf8' : isDischarging ? '#f59e0b' : '#64748b';
        ctx.lineWidth = 2.6;
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        ctx.stroke();

        if (isCharging || isDischarging) {
          ctx.fillStyle = isCharging ? 'rgba(56, 189, 248, 0.10)' : 'rgba(245, 158, 11, 0.10)';
          ctx.beginPath();
          ctx.moveTo(x0, zeroY);
          ctx.lineTo(x0, y0);
          ctx.lineTo(x1, y1);
          ctx.lineTo(x1, zeroY);
          ctx.closePath();
          ctx.fill();
        }
      }

      const last = samples[samples.length - 1];
      const lx = toScreenX(last.time);
      const ly = toScreenY(last.currentMa);

      ctx.fillStyle = last.state === 'charge' ? '#38bdf8' : last.state === 'discharge' ? '#f59e0b' : '#4ade80';
      ctx.beginPath();
      ctx.arc(lx, ly, 5.0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.8;
      ctx.stroke();
    }

    // B. 电压曲线 (U-t)
    if (this.graphMode === 'voltage' || this.graphMode === 'dual') {
      ctx.strokeStyle = '#c084fc';
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      for (let i = 0; i < samples.length; i++) {
        const s = samples[i];
        const x = toScreenX(s.time);
        const y = toScreenY(s.voltageCapacitor);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      if (this.graphMode === 'dual' && typeof ctx.fillText === 'function') {
        ctx.fillStyle = '#38bdf8';
        ctx.font = '600 12px monospace';
        ctx.textAlign = 'left';
        ctx.fillText('— I(t) 电流', paddingLeft + 14, paddingTop + 14);
        ctx.fillStyle = '#c084fc';
        ctx.fillText('— Uc(t) 电压', paddingLeft + 120, paddingTop + 14);
      }
    }

    // 5. 探针悬停垂直参考虚线
    if (this.hoverSample) {
      const hx = toScreenX(this.hoverSample.sample.time);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
      ctx.lineWidth = 1;
      if (typeof ctx.setLineDash === 'function') {
        ctx.setLineDash([4, 4]);
      }
      ctx.beginPath();
      ctx.moveTo(hx, paddingTop);
      ctx.lineTo(hx, h - paddingBottom);
      ctx.stroke();
      if (typeof ctx.setLineDash === 'function') {
        ctx.setLineDash([]);
      }

      const hy = toScreenY(this.graphMode === 'voltage' ? this.hoverSample.sample.voltageCapacitor : this.hoverSample.sample.currentMa);
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(hx, hy, 4.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // ================= 窗口显隐与状态控制 =================
  public open(): void {
    this.isVisible = true;
    this.element.classList.remove('hidden');
    if (this.css3dObject) {
      this.css3dObject.visible = true;
    }
    this.launcherBtn.style.display = 'none';

    // 若当前有摄像机，则平滑摆放在视线前方
    if (this.lastCamera) {
      this.positionInFrontOfCamera(this.lastCamera);
    }
    this.drawWaveform();
  }

  public close(): void {
    this.isVisible = false;
    this.element.classList.add('hidden');
    if (this.css3dObject) {
      this.css3dObject.visible = false;
    }
    this.launcherBtn.style.display = 'inline-flex';
  }

  public toggleMinimize(): void {
    this.isMinimized = !this.isMinimized;
    this.element.classList.toggle('minimized', this.isMinimized);
    if (this.windowContentEl) {
      this.windowContentEl.style.display = this.isMinimized ? 'none' : 'flex';
    }
  }

  public dispose(): void {
    if (this.css3dObject && this.callbacks.css3dScene) {
      this.callbacks.css3dScene.remove(this.css3dObject);
    }
    if (this.element.parentNode) {
      this.element.parentNode.removeChild(this.element);
    }
    if (this.launcherBtn.parentNode) {
      this.launcherBtn.parentNode.removeChild(this.launcherBtn);
    }
  }
}
