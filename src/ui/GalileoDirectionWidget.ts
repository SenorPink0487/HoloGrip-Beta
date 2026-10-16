/**
 * 伽利略理想斜面实验：右上角方向标交互控件 (VisionOS 空间流体毛玻璃风格)
 *
 * 功能：
 * 1. 位于屏幕右上角的可视化方向标盘（模拟斜面倾角与坡长的极坐标方向矢量）。
 * 2. 拖动方向标端点把手，实时无级改变右侧斜面的倾角 θ (0° ~ 60°) 与长度 L (0.30m ~ 1.20m)。
 * 3. 拖动改变后，小球自动回复到初始位置开始滑行，观察等高到达或惯性无限滑行现象。
 * 4. 提供 45° (对称)、30° (缓坡)、15° (极缓坡)、0° (理想水平面/惯性定律) 快速预设。
 * 5. 支持左侧/右侧释放切换、播放/暂停、重置小球。
 */

export interface GalileoWidgetCallbacks {
  onTransformChange?: (angleDeg: number, lengthM: number) => void;
  onTransformCommit?: (angleDeg: number, lengthM: number) => void;
  onResetBall?: () => void;
  onTogglePlay?: (isPlaying: boolean) => void;
  onSideChange?: (side: 'left' | 'right') => void;
}

export class GalileoDirectionWidget {
  private container: HTMLElement;
  private element: HTMLElement;
  private callbacks: GalileoWidgetCallbacks;

  // 状态值
  private currentAngleDeg = 30.0;
  private currentLengthM = 0.60;
  private releaseHeightM = 0.25;
  private isPlaying = true;
  private releaseSide: 'left' | 'right' = 'left';

  // 拖拽相关
  private isDragging = false;
  private dialSvg!: SVGSVGElement;
  private arrowLine!: SVGLineElement;
  private handleCircle!: SVGCircleElement;
  private dialArc!: SVGPathElement;
  private angleReadoutEl!: HTMLElement;
  private lengthReadoutEl!: HTMLElement;
  private heightReadoutEl!: HTMLElement;
  private climbReadoutEl!: HTMLElement;
  private playBtn!: HTMLButtonElement;
  private sideBtn!: HTMLButtonElement;

  // 极坐标原点位于 SVG 画布坐标 (24, 126)
  private readonly ORIGIN_X = 26;
  private readonly ORIGIN_Y = 124;
  private readonly MAX_PIXEL_RADIUS = 100;
  private readonly MIN_PIXEL_RADIUS = 35;
  private readonly MIN_LENGTH_M = 0.30;
  private readonly MAX_LENGTH_M = 1.20;

  constructor(callbacks: GalileoWidgetCallbacks = {}, parent: HTMLElement = document.body) {
    this.callbacks = callbacks;
    this.container = parent;
    this.createUI();
    this.bindEvents();
    this.updateDialGraphics();
  }

  private createUI(): void {
    // 注入控件独立样式
    if (typeof document !== 'undefined' && !document.getElementById('galileo-direction-widget-style')) {
      const style = document.createElement('style');
      style.id = 'galileo-direction-widget-style';
      style.textContent = `
        .galileo-direction-widget {
          position: fixed;
          top: calc(20px + env(safe-area-inset-top, 0px));
          right: calc(20px + env(safe-area-inset-right, 0px));
          width: 250px;
          border-radius: 20px;
          background: radial-gradient(circle at 75% 20%, rgba(18, 30, 48, 0.88) 0%, rgba(8, 16, 28, 0.94) 100%);
          border: 1.5px solid rgba(255, 255, 255, 0.20);
          box-shadow: 0 16px 40px rgba(0, 0, 0, 0.55),
                      inset 0 1px 1.5px rgba(255, 255, 255, 0.35),
                      0 0 28px rgba(0, 240, 255, 0.16);
          backdrop-filter: blur(28px) saturate(190%);
          -webkit-backdrop-filter: blur(28px) saturate(190%);
          z-index: 950;
          pointer-events: auto;
          user-select: none;
          -webkit-user-select: none;
          touch-action: none;
          font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "PingFang SC", "Segoe UI", sans-serif;
          color: #f1f5f9;
          padding: 14px 14px 12px;
          display: flex;
          flex-direction: column;
          gap: 10px;
          transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.25s ease;
        }

        .galileo-widget-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          border-bottom: 1px solid rgba(255, 255, 255, 0.10);
          padding-bottom: 8px;
        }

        .galileo-widget-title {
          font-size: 13px;
          font-weight: 600;
          letter-spacing: 0.3px;
          color: rgba(255, 255, 255, 0.95);
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .galileo-title-badge {
          font-size: 10px;
          padding: 1px 5px;
          border-radius: 6px;
          background: rgba(56, 189, 248, 0.22);
          color: #38bdf8;
          border: 0.5px solid rgba(56, 189, 248, 0.45);
        }

        .galileo-dial-container {
          position: relative;
          width: 100%;
          height: 140px;
          background: rgba(0, 0, 0, 0.25);
          border-radius: 14px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          overflow: hidden;
          cursor: crosshair;
        }

        .galileo-dial-svg {
          width: 100%;
          height: 100%;
          display: block;
        }

        .galileo-hint-text {
          position: absolute;
          bottom: 6px;
          right: 8px;
          font-size: 10px;
          color: rgba(148, 163, 184, 0.7);
          pointer-events: none;
        }

        .galileo-metrics-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 6px;
          background: rgba(255, 255, 255, 0.04);
          border-radius: 10px;
          padding: 8px 10px;
        }

        .galileo-metric-item {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .galileo-metric-label {
          font-size: 10px;
          color: rgba(148, 163, 184, 0.85);
        }

        .galileo-metric-val {
          font-size: 13px;
          font-weight: 600;
          font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
          color: #38bdf8;
        }

        .galileo-presets-row {
          display: flex;
          gap: 4px;
          justify-content: space-between;
        }

        .galileo-chip-btn {
          flex: 1;
          padding: 4px 0;
          border-radius: 7px;
          font-size: 10.5px;
          font-weight: 500;
          border: 0.5px solid rgba(255, 255, 255, 0.15);
          background: rgba(255, 255, 255, 0.06);
          color: rgba(255, 255, 255, 0.88);
          cursor: pointer;
          transition: all 0.15s ease;
          text-align: center;
        }

        .galileo-chip-btn:hover {
          background: rgba(56, 189, 248, 0.22);
          border-color: rgba(56, 189, 248, 0.5);
          color: #fff;
        }

        .galileo-chip-btn.active {
          background: linear-gradient(135deg, rgba(14, 165, 233, 0.85), rgba(2, 132, 199, 0.95));
          border-color: rgba(56, 189, 248, 0.8);
          color: #fff;
          box-shadow: 0 0 10px rgba(56, 189, 248, 0.4);
        }

        .galileo-controls-row {
          display: flex;
          gap: 6px;
        }

        .galileo-action-btn {
          flex: 1;
          height: 30px;
          border-radius: 9px;
          font-size: 11px;
          font-weight: 600;
          border: 0.5px solid rgba(255, 255, 255, 0.18);
          background: rgba(255, 255, 255, 0.09);
          color: #fff;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 4px;
          transition: background 0.15s ease, transform 0.1s ease;
        }

        .galileo-action-btn:active {
          transform: scale(0.96);
        }

        .galileo-action-btn.primary {
          background: linear-gradient(135deg, #0284c7, #0369a1);
          border-color: #38bdf8;
        }
      `;
      document.head.appendChild(style);
    }

    this.element = document.createElement('div');
    this.element.className = 'galileo-direction-widget hud-interactive';
    this.element.innerHTML = `
      <div class="galileo-widget-header">
        <div class="galileo-widget-title">
          <span>右侧斜面方向标</span>
          <span class="galileo-title-badge">理想实验</span>
        </div>
        <button id="galileo-side-btn" class="galileo-chip-btn" style="flex:0; padding:2px 8px; font-size:10px;">左侧释放</button>
      </div>

      <!-- 核心方向标极坐标盘 -->
      <div class="galileo-dial-container" id="galileo-dial-box" title="按住拖拽端点改变右侧斜面倾角与坡长">
        <svg class="galileo-dial-svg" viewBox="0 0 220 140" id="galileo-svg">
          <defs>
            <radialGradient id="dialGlow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stop-color="#38bdf8" stop-opacity="0.25"/>
              <stop offset="100%" stop-color="#38bdf8" stop-opacity="0"/>
            </radialGradient>
            <linearGradient id="arrowGrad" x1="0%" y1="100%" x2="100%" y2="0%">
              <stop offset="0%" stop-color="#38bdf8"/>
              <stop offset="100%" stop-color="#06b6d4"/>
            </linearGradient>
            <filter id="glowFilter" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="2.5" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          <!-- 坐标轴与背景刻度弧 -->
          <line x1="26" y1="124" x2="200" y2="124" stroke="rgba(255,255,255,0.25)" stroke-width="1.5" stroke-dasharray="3 2" />
          <line x1="26" y1="124" x2="26" y2="20" stroke="rgba(255,255,255,0.15)" stroke-width="1.2" stroke-dasharray="2 2" />

          <!-- 0° 水平基线文字 -->
          <text x="180" y="135" fill="rgba(148,163,184,0.7)" font-size="9" text-anchor="end">0° 水平面</text>
          <text x="32" y="32" fill="rgba(148,163,184,0.7)" font-size="9">60°</text>

          <!-- 刻度弧 (R=90) -->
          <path d="M 116 124 A 90 90 0 0 0 71 46" fill="none" stroke="rgba(255,255,255,0.12)" stroke-width="1.5" stroke-dasharray="2 3"/>

          <!-- 动态倾角弧扇区 -->
          <path id="galileo-dial-arc" d="" fill="rgba(56, 189, 248, 0.12)" stroke="#38bdf8" stroke-width="1.2" stroke-dasharray="2 1" />

          <!-- 原点枢轴铰链 -->
          <circle cx="26" cy="124" r="5" fill="#0f172a" stroke="#38bdf8" stroke-width="2"/>

          <!-- 动态斜面方向标矢量线 -->
          <line id="galileo-arrow-line" x1="26" y1="124" x2="95" y2="60" stroke="url(#arrowGrad)" stroke-width="3.5" stroke-linecap="round" filter="url(#glowFilter)"/>

          <!-- 端点发光拖拽把手 -->
          <circle id="galileo-handle-circle" cx="95" cy="60" r="8" fill="#38bdf8" stroke="#ffffff" stroke-width="2.5" filter="url(#glowFilter)" style="cursor: grab;"/>
        </svg>
        <span class="galileo-hint-text">拖拽端点调节方向标</span>
      </div>

      <!-- 遥测数据读数面板 -->
      <div class="galileo-metrics-grid">
        <div class="galileo-metric-item">
          <span class="galileo-metric-label">斜面倾角 θ</span>
          <span class="galileo-metric-val" id="galileo-val-angle">30.0°</span>
        </div>
        <div class="galileo-metric-item">
          <span class="galileo-metric-label">斜面坡长 L</span>
          <span class="galileo-metric-val" id="galileo-val-length">0.60 m</span>
        </div>
        <div class="galileo-metric-item">
          <span class="galileo-metric-label">斜面端高 H</span>
          <span class="galileo-metric-val" id="galileo-val-height">0.30 m</span>
        </div>
        <div class="galileo-metric-item">
          <span class="galileo-metric-label">等高上升路程 s</span>
          <span class="galileo-metric-val" id="galileo-val-climb">0.50 m</span>
        </div>
      </div>

      <!-- 经典倾角快速预设 -->
      <div class="galileo-presets-row">
        <button class="galileo-chip-btn" data-angle="45" data-len="0.50">45° 对称</button>
        <button class="galileo-chip-btn active" data-angle="30" data-len="0.60">30° 缓坡</button>
        <button class="galileo-chip-btn" data-angle="15" data-len="0.97">15° 极缓</button>
        <button class="galileo-chip-btn" data-angle="0" data-len="1.10">0° 惯性</button>
      </div>

      <!-- 操作按钮行 -->
      <div class="galileo-controls-row">
        <button id="galileo-play-btn" class="galileo-action-btn primary" title="暂停/继续运动">
          <span id="galileo-play-icon">⏸</span> 暂停
        </button>
        <button id="galileo-reset-btn" class="galileo-action-btn" title="立即重置小球位置">
          ↺ 重置
        </button>
      </div>
    `;

    this.container.appendChild(this.element);

    // 获取 DOM 引用
    this.dialSvg = this.element.querySelector('#galileo-svg')!;
    this.arrowLine = this.element.querySelector('#galileo-arrow-line')!;
    this.handleCircle = this.element.querySelector('#galileo-handle-circle')!;
    this.dialArc = this.element.querySelector('#galileo-dial-arc')!;
    this.angleReadoutEl = this.element.querySelector('#galileo-val-angle')!;
    this.lengthReadoutEl = this.element.querySelector('#galileo-val-length')!;
    this.heightReadoutEl = this.element.querySelector('#galileo-val-height')!;
    this.climbReadoutEl = this.element.querySelector('#galileo-val-climb')!;
    this.playBtn = this.element.querySelector('#galileo-play-btn')!;
    this.sideBtn = this.element.querySelector('#galileo-side-btn')!;
  }

  private bindEvents(): void {
    const dialBox = this.element.querySelector('#galileo-dial-box') as HTMLElement;

    const onPointerDown = (e: PointerEvent) => {
      e.stopPropagation();
      this.isDragging = true;
      this.handleCircle.style.cursor = 'grabbing';
      this.updateFromPointer(e);
      window.addEventListener('pointermove', onPointerMove, { passive: false });
      window.addEventListener('pointerup', onPointerUp);
      window.addEventListener('pointercancel', onPointerUp);
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!this.isDragging) return;
      e.stopPropagation();
      e.preventDefault();
      this.updateFromPointer(e);
    };

    const onPointerUp = (e: PointerEvent) => {
      if (!this.isDragging) return;
      this.isDragging = false;
      this.handleCircle.style.cursor = 'grab';
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);

      // 用户要求："拖动右上角的方向标，改变右侧斜面的长度和高度后，小球自动回复到...初始位置，观察小球的运动状况。"
      this.callbacks.onTransformCommit?.(this.currentAngleDeg, this.currentLengthM);
    };

    dialBox.addEventListener('pointerdown', onPointerDown);

    // 预设芯片按钮
    const chipBtns = this.element.querySelectorAll('.galileo-presets-row .galileo-chip-btn');
    chipBtns.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        chipBtns.forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');

        const targetAngle = parseFloat(btn.getAttribute('data-angle') || '30');
        const targetLen = parseFloat(btn.getAttribute('data-len') || '0.60');

        this.setTransform(targetAngle, targetLen, true);
      });
    });

    // 播放/暂停
    this.playBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.isPlaying = !this.isPlaying;
      this.playBtn.querySelector('#galileo-play-icon')!.textContent = this.isPlaying ? '⏸' : '▶';
      this.playBtn.childNodes[2].textContent = this.isPlaying ? ' 暂停' : ' 播放';
      this.callbacks.onTogglePlay?.(this.isPlaying);
    });

    // 重置小球
    const resetBtn = this.element.querySelector('#galileo-reset-btn')!;
    resetBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.callbacks.onResetBall?.();
    });

    // 切换释放方向
    this.sideBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.releaseSide = this.releaseSide === 'left' ? 'right' : 'left';
      this.sideBtn.textContent = this.releaseSide === 'left' ? '左侧释放' : '右侧释放';
      this.callbacks.onSideChange?.(this.releaseSide);
    });
  }

  /**
   * 从触控/鼠标指针屏幕坐标映射到极坐标方向矢量
   */
  private updateFromPointer(e: PointerEvent): void {
    const rect = this.dialSvg.getBoundingClientRect();
    // 换算至 SVG viewBox (220 x 140) 坐标系
    const svgX = ((e.clientX - rect.left) / rect.width) * 220;
    const svgY = ((e.clientY - rect.top) / rect.height) * 140;

    const dx = svgX - this.ORIGIN_X;
    const dy = this.ORIGIN_Y - svgY; // SVG Y轴向下，因此取反

    // 计算倾角 (范围限制在 0° ~ 60°)
    let angleRad = Math.atan2(Math.max(0, dy), Math.max(0, dx));
    let angleDeg = (angleRad * 180.0) / Math.PI;
    angleDeg = Math.max(0.0, Math.min(60.0, angleDeg));

    // 计算像素长度并映射为物理长度 L_R (0.30m ~ 1.20m)
    const pixelDist = Math.sqrt(dx * dx + dy * dy);
    const clampedDist = Math.max(this.MIN_PIXEL_RADIUS, Math.min(this.MAX_PIXEL_RADIUS, pixelDist));
    const distRatio = (clampedDist - this.MIN_PIXEL_RADIUS) / (this.MAX_PIXEL_RADIUS - this.MIN_PIXEL_RADIUS);
    const lengthM = this.MIN_LENGTH_M + distRatio * (this.MAX_LENGTH_M - this.MIN_LENGTH_M);

    this.currentAngleDeg = angleDeg;
    this.currentLengthM = lengthM;

    this.updateDialGraphics();
    this.callbacks.onTransformChange?.(this.currentAngleDeg, this.currentLengthM);
  }

  /**
   * 刷新 SVG 矢量图与数值读数
   */
  private updateDialGraphics(): void {
    const angleRad = (this.currentAngleDeg * Math.PI) / 180.0;
    const distRatio =
      (this.currentLengthM - this.MIN_LENGTH_M) / (this.MAX_LENGTH_M - this.MIN_LENGTH_M);
    const pixelDist =
      this.MIN_PIXEL_RADIUS + distRatio * (this.MAX_PIXEL_RADIUS - this.MIN_PIXEL_RADIUS);

    const tipX = this.ORIGIN_X + pixelDist * Math.cos(angleRad);
    const tipY = this.ORIGIN_Y - pixelDist * Math.sin(angleRad);

    this.arrowLine.setAttribute('x2', tipX.toFixed(1));
    this.arrowLine.setAttribute('y2', tipY.toFixed(1));
    this.handleCircle.setAttribute('cx', tipX.toFixed(1));
    this.handleCircle.setAttribute('cy', tipY.toFixed(1));

    // 绘制扇形填充弧
    if (this.currentAngleDeg > 0.5) {
      const arcR = 36;
      const arcEndX = this.ORIGIN_X + arcR * Math.cos(angleRad);
      const arcEndY = this.ORIGIN_Y - arcR * Math.sin(angleRad);
      this.dialArc.setAttribute(
        'd',
        `M ${this.ORIGIN_X} ${this.ORIGIN_Y} L ${this.ORIGIN_X + arcR} ${this.ORIGIN_Y} A ${arcR} ${arcR} 0 0 0 ${arcEndX.toFixed(1)} ${arcEndY.toFixed(1)} Z`
      );
      this.dialArc.style.display = 'block';
    } else {
      this.dialArc.style.display = 'none';
    }

    // 数值读数
    const heightM = this.currentLengthM * Math.sin(angleRad);
    this.angleReadoutEl.textContent =
      this.currentAngleDeg < 0.1 ? '0.0° (水平)' : `${this.currentAngleDeg.toFixed(1)}°`;
    this.lengthReadoutEl.textContent = `${this.currentLengthM.toFixed(2)} m`;
    this.heightReadoutEl.textContent = `${heightM.toFixed(2)} m`;

    if (this.currentAngleDeg < 0.1) {
      this.climbReadoutEl.textContent = '∞ 理想无限';
    } else {
      const climbDistM = this.releaseHeightM / Math.sin(angleRad);
      this.climbReadoutEl.textContent = `${climbDistM.toFixed(2)} m`;
    }
  }

  public setTransform(angleDeg: number, lengthM: number, triggerCommit = true): void {
    this.currentAngleDeg = Math.max(0, Math.min(60, angleDeg));
    this.currentLengthM = Math.max(this.MIN_LENGTH_M, Math.min(this.MAX_LENGTH_M, lengthM));

    this.updateDialGraphics();
    this.callbacks.onTransformChange?.(this.currentAngleDeg, this.currentLengthM);
    if (triggerCommit) {
      this.callbacks.onTransformCommit?.(this.currentAngleDeg, this.currentLengthM);
    }
  }

  public setReleaseHeight(h: number): void {
    this.releaseHeightM = h;
    this.updateDialGraphics();
  }

  public setVisible(show: boolean): void {
    this.element.style.display = show ? 'flex' : 'none';
  }

  public destroy(): void {
    if (this.element && this.element.parentElement) {
      this.element.parentElement.removeChild(this.element);
    }
  }
}
