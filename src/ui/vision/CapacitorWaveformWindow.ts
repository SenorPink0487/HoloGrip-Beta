import * as THREE from 'three';
import { CSS3DObject } from 'three/addons/renderers/CSS3DRenderer.js';
import type { SwitchPosition, WaveformSample, CapacitorTelemetry } from '../../physics/em/capacitorDischarge.ts';

export interface CapacitorWaveformWindowCallbacks {
  onSetSwitchPosition?: (pos: SwitchPosition) => void;
  onClearSamples?: () => void;
  onResetExperiment?: () => void;
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

  // 3D 侧边悬浮物理坐标与朝向（位于实验台侧面，绝不遮挡主操作区与主视窗）
  public targetPosition = new THREE.Vector3(2.25, 1.85, 0.35);
  public targetRotY = -0.75;
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
  private windowContentEl: HTMLElement | null = null;

  constructor(callbacks: CapacitorWaveformWindowCallbacks = {}) {
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
      <span>充放电波形图</span>
    `;
    this.launcherBtn.style.display = 'none';

    this.render();
    this.canvas = this.element.querySelector('#waveform-canvas') as HTMLCanvasElement;
    this.ctx = this.canvas?.getContext('2d') ?? null;

    // 构建 CSS3DObject 并挂载至 3D 空间
    this.initSpatialObject();

    this.bindEvents();
    this.attachToDOM();

    // 默认对齐至视线侧面位置
    if (this.lastCamera) {
      this.positionAtSide(this.lastCamera, true);
    }
  }

  private initSpatialObject(): void {
    try {
      this.css3dObject = new CSS3DObject(this.element);
      this.css3dObject.rotation.order = 'YXZ';
      // 适度紧凑的空间比例 (0.0016)，与视线侧边完美相融，绝不遮挡主操作区
      this.css3dObject.scale.set(0.0016, 0.0016, 0.0016);
      this.css3dObject.position.copy(this.targetPosition);

      if (this.callbacks.css3dScene) {
        this.callbacks.css3dScene.add(this.css3dObject);
      }
    } catch {
      // Node 测试环境降级
      this.css3dObject = new THREE.Object3D() as any;
      if (this.css3dObject) {
        this.css3dObject.element = this.element;
      }
    }
  }

  private render(): void {
    // 纯粹、专业、精致小巧：视窗内部仅保留波形曲线图像自身，彻底移除额外菜单、把手与控制卡片
    this.element.innerHTML = `
      <div class="vision-window-frame capacitor-window-frame" id="cap-win-frame" title="拖动调整位置 · 双击还原侧面">
        <div class="cap-canvas-container" id="cap-win-content">
          <canvas id="waveform-canvas" width="880" height="540"></canvas>
          <div class="cap-canvas-tooltip" id="cap-canvas-tooltip" style="display: none;"></div>
          <!-- 右上角精致微型半透关闭按钮 -->
          <button class="cap-floating-close" id="btn-cap-win-close" title="关闭视窗 (ESC)">
            <svg class="apple-sf-icon" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
      </div>
    `;

    this.titleStatusBadge = null;
    this.windowContentEl = this.element.querySelector('#cap-win-content');
  }

  private attachToDOM(): void {
    if (!document.body.contains(this.launcherBtn)) {
      document.body.appendChild(this.launcherBtn);
    }
  }

  private bindEvents(): void {
    // 阻止指针事件冒泡干扰 3D 场景镜头
    this.element.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.element.addEventListener('mousedown', (e) => e.stopPropagation());
    this.element.addEventListener('wheel', (e) => e.stopPropagation(), { passive: true });

    // 1. 空间视窗 3D 侧面位置直接抓取拖拽
    const frame = this.element.querySelector('#cap-win-frame') as HTMLElement;

    const bindSpatialDrag = (el: HTMLElement | null) => {
      if (!el) return;
      el.addEventListener('pointerdown', (e: PointerEvent) => {
        if ((e.target as HTMLElement).closest('.btn-close, button, .cap-floating-close')) return;
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

        const sensitivity = 0.0024;
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

    bindSpatialDrag(frame);

    // 双击还原侧面视姿
    frame?.addEventListener('dblclick', () => {
      if (this.lastCamera) {
        this.positionAtSide(this.lastCamera);
      }
    });

    // 2. 视窗关闭与桌面快捷胶囊唤醒
    this.element.querySelector('#btn-cap-win-close')?.addEventListener('click', () => {
      this.close();
    });

    this.launcherBtn.addEventListener('click', () => {
      this.open();
    });

    // 3. 键盘快捷键 R (校准朝向) 与 Escape (关闭)
    window.addEventListener('keydown', (e) => {
      if (!this.isVisible) return;
      if (e.code === 'KeyR') {
        if (this.lastCamera) {
          this.positionAtSide(this.lastCamera);
        }
      } else if (e.code === 'Escape') {
        this.close();
      }
    });

    // 4. 示波器探针交互
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

  // ================= 3D 侧边空间漂浮与姿态更新 =================
  /**
   * 将 3D 空间波形视窗稳定置于摄像机视线右侧边（与主操作区与主菜单完全错开，绝不遮挡）
   */
  public positionAtSide(camera?: THREE.Camera, snap = false): void {
    const cam = camera || this.lastCamera;
    if (!cam) {
      this.targetPosition.set(1.45, 1.45, 2.05);
      this.targetRotY = -0.62;
      return;
    }
    this.lastCamera = cam;

    const dir = new THREE.Vector3();
    cam.getWorldDirection(dir);

    // 水平相机侧向向右矢量
    const camRight = new THREE.Vector3(1, 0, 0).applyQuaternion(cam.quaternion);
    camRight.y = 0;
    camRight.normalize();

    const forward = new THREE.Vector3(dir.x, 0, dir.z).normalize();

    // 放置在视线正前方 2.05 米且向右侧偏移 1.45 米处，精致适度
    const distanceForward = 2.05;
    const distanceRight = 1.45;

    const targetX = cam.position.x + forward.x * distanceForward + camRight.x * distanceRight;
    const targetZ = cam.position.z + forward.z * distanceForward + camRight.z * distanceRight;
    const targetY = Math.max(1.15, Math.min(2.1, cam.position.y + dir.y * 0.35 + 0.05));

    this.targetPosition.set(targetX, targetY, targetZ);
    this.targetRotY = Math.atan2(cam.position.x - targetX, cam.position.z - targetZ);

    if (snap && this.css3dObject) {
      this.css3dObject.position.copy(this.targetPosition);
      this.css3dObject.rotation.set(0, this.targetRotY, 0);
    }
  }

  public positionInFrontOfCamera(camera?: THREE.Camera, snap = false): void {
    this.positionAtSide(camera, snap);
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

      // 视窗法线对齐视线俯仰角（Pitch），消除上下梯形畸变
      const targetRotX = -Math.atan2(dy, distXZ);
      const targetRotY = Math.atan2(dx, dz);

      const lerpSpeed = Math.min(1.0, delta * 7.0);
      const pos = this.css3dObject.position;
      const rot = this.css3dObject.rotation;

      pos.x = THREE.MathUtils.lerp(pos.x, targetX, lerpSpeed);
      pos.y = THREE.MathUtils.lerp(pos.y, targetY, lerpSpeed);
      pos.z = THREE.MathUtils.lerp(pos.z, targetZ, lerpSpeed);

      // 角度平滑过渡
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
  // ================= 示波器探针交互 =================
  private handleCanvasMouseMove(e: MouseEvent): void {
    if (!this.cachedSamples || this.cachedSamples.length < 2) return;
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width / (rect.width || 1);
    const scaleY = this.canvas.height / (rect.height || 1);
    const mouseX = (e.clientX - rect.left) * scaleX;
    const mouseY = (e.clientY - rect.top) * scaleY;

    const w = this.canvas.width;
    const paddingLeft = 60;
    const paddingRight = 36;
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
    this.showTooltip(e.clientX - rect.left, e.clientY - rect.top, rect.width, closest);
    this.drawWaveform();
  }

  private showTooltip(cssX: number, cssY: number, containerW: number, sample: WaveformSample): void {
    const tooltip = this.element.querySelector('#cap-canvas-tooltip') as HTMLElement;
    if (!tooltip) return;

    let stateLabel = '断开中立';
    let stateColor = '#94a3b8';
    if (sample.state === 'charge') {
      stateLabel = '⚡ 充电状态 (I > 0)';
      stateColor = '#38bdf8';
    } else if (sample.state === 'discharge') {
      stateLabel = '🔄 放电状态 (I < 0)';
      stateColor = '#f59e0b';
    }

    tooltip.innerHTML = `
      <div style="font-weight: 700; color: ${stateColor}; margin-bottom: 2px;">${stateLabel}</div>
      <div>时间 t: <b>${sample.time.toFixed(2)} s</b></div>
      <div>电流 I: <b style="color: ${sample.currentMa >= 0 ? '#38bdf8' : '#f59e0b'}">${sample.currentMa > 0 ? '+' : ''}${sample.currentMa.toFixed(2)} mA</b></div>
      <div>电压 Uc: <b>${sample.voltageCapacitor.toFixed(2)} V</b></div>
    `;

    tooltip.style.left = `${Math.min(cssX + 12, (containerW || 440) - 145)}px`;
    tooltip.style.top = `${Math.max(8, cssY - 68)}px`;
    tooltip.style.display = 'block';
  }

  // ================= 遥测同步与数据显示 =================
  public updateTelemetry(telemetry: CapacitorTelemetry, samples: readonly WaveformSample[]): void {
    this.cachedTelemetry = telemetry;
    this.cachedSamples = samples;
    this.updateStatusBadge();

    if (this.isVisible) {
      this.drawWaveform();
    }
  }

  private updateStatusBadge(): void {
    if (!this.titleStatusBadge) return;

    const pos = this.cachedTelemetry?.switchPosition ?? 'neutral';
    if (pos === 'charge') {
      this.titleStatusBadge.className = 'cap-win-status-badge status-charging';
      this.titleStatusBadge.textContent = '⚡ 充电中';
    } else if (pos === 'discharge') {
      this.titleStatusBadge.className = 'cap-win-status-badge status-discharging';
      this.titleStatusBadge.textContent = '🔄 放电中';
    } else {
      this.titleStatusBadge.className = 'cap-win-status-badge status-neutral';
      this.titleStatusBadge.textContent = '⚪ 断开';
    }
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
    const paddingRight = 36;
    const paddingTop = 44;
    const paddingBottom = 42;
    const plotW = w - paddingLeft - paddingRight;
    const plotH = h - paddingTop - paddingBottom;

    // 1. 绘制暗色荧光背景方格网 (10 x 6 网格)
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.08)';
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

    // 确定坐标轴时间与电流范围
    const samples = this.cachedSamples;
    const tMin = samples.length > 0 ? samples[0].time : 0;
    const tLatest = samples.length > 0 ? samples[samples.length - 1].time : 5;
    const tWindow = Math.max(5.0, tLatest - tMin);

    const peak = Math.max(12.0, this.cachedTelemetry?.peakChargeCurrentMa ?? 0, this.cachedTelemetry?.peakDischargeCurrentMa ?? 0);
    const limit = Math.ceil(peak * 1.25);
    const yMin = -limit;
    const yMax = limit;

    const toScreenX = (t: number) => paddingLeft + ((t - tMin) / tWindow) * plotW;
    const toScreenY = (val: number) => paddingTop + plotH - ((val - yMin) / (yMax - yMin)) * plotH;

    // 2. 绘制零基线 (Zero reference line: I = 0)
    const zeroY = toScreenY(0);
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.45)';
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

    const yTicks = [yMin, yMin * 0.5, 0, yMax * 0.5, yMax];
    if (typeof ctx.fillText === 'function') {
      for (const val of yTicks) {
        const y = toScreenY(val);
        ctx.fillText(`${val > 0 ? '+' : ''}${val.toFixed(0)}`, paddingLeft - 8, y);
      }

      ctx.textAlign = 'left';
      ctx.fillStyle = '#94a3b8';
      ctx.fillText('I (mA)', paddingLeft - 50, paddingTop - 16);
      ctx.textAlign = 'right';
      ctx.fillText('t (s)', w - paddingRight + 4, h - paddingBottom + 26);

      // X 轴时间刻度
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      for (let c = 0; c <= cols; c += 2) {
        const t = tMin + (tWindow * c) / cols;
        const x = paddingLeft + (plotW * c) / cols;
        ctx.fillText(`${t.toFixed(1)}`, x, h - paddingBottom + 8);
      }

      // 图内标识：标题与充放电图例
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.font = 'bold 14px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
      ctx.fillStyle = '#f1f5f9';
      ctx.fillText('I - t 曲线', paddingLeft, paddingTop - 16);

      ctx.font = '600 12px monospace';
      ctx.fillStyle = '#38bdf8';
      ctx.fillText('— 充电 (I > 0)', paddingLeft + 82, paddingTop - 16);
      ctx.fillStyle = '#f59e0b';
      ctx.fillText('— 放电 (I < 0)', paddingLeft + 196, paddingTop - 16);

      // 实时数值 HUD (右上角，留出关闭按钮边距)
      if (this.cachedTelemetry) {
        const curr = this.cachedTelemetry.currentMa;
        const volt = this.cachedTelemetry.voltageCapacitor;
        ctx.textAlign = 'right';
        ctx.font = '600 12px monospace';
        ctx.fillStyle = curr > 0.01 ? '#38bdf8' : curr < -0.01 ? '#f59e0b' : '#94a3b8';
        const sign = curr > 0 ? '+' : '';
        ctx.fillText(`I: ${sign}${curr.toFixed(2)} mA  Uc: ${volt.toFixed(2)} V`, w - paddingRight - 42, paddingTop - 16);
      }
    }

    if (samples.length < 2) return;

    // 4. 绘制连续电流曲线 (I-t)
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
      ctx.lineWidth = 2.8;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();

      // 积分阴影发光填充
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

    // 实时最新扫描亮点
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

      const hy = toScreenY(this.hoverSample.sample.currentMa);
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

    if (this.lastCamera) {
      this.positionAtSide(this.lastCamera);
    }
    this.drawWaveform();
  }

  public close(): void {
    this.isVisible = false;
    this.element.classList.add('hidden');
    if (this.css3dObject) {
      this.css3dObject.visible = false;
    }
    this.launcherBtn.style.display = 'none';
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
