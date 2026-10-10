import type { HandGestureFrame, NormalizedLandmark, SingleHandData, TrackerTelemetry } from './types.ts';
import { HandGestureService } from './HandGestureService.ts';

export interface PinchLogEntry {
  id: number;
  timeStr: string;
  hand: 'left' | 'right';
  handLabel: string;
  durationMs: number;
  action: string;
  tagClass: 'tag-window' | 'tag-rotate' | 'tag-click' | 'tag-drag';
}

export class HandTrackingHUD {
  private service: HandGestureService;
  private container: HTMLElement;
  private pillEl: HTMLElement;
  private previewModalEl: HTMLElement;
  private previewCanvas: HTMLCanvasElement;
  private previewCtx: CanvasRenderingContext2D;

  private isPreviewOpen = false;
  private isEnabled = false;
  public isFullscreen = false;
  public isLogPanelOpen = true;
  private lastFrame: HandGestureFrame | null = null;

  // 捏合持续时长历史记录日志
  private pinchLogs: PinchLogEntry[] = [];
  private maxPinchLogs = 60;
  private logIdCounter = 0;

  // 缓存的 DOM 节点集合
  private logSectionEl!: HTMLElement;
  private logListEl!: HTMLElement;
  private logCountBadge!: HTMLElement;
  private logCountHeader!: HTMLElement;
  private logAvgStat!: HTMLElement;
  private logToggleBtn!: HTMLButtonElement;
  private leftLiveBadge!: HTMLElement;
  private rightLiveBadge!: HTMLElement;
  private leftDurationVal!: HTMLElement;
  private rightDurationVal!: HTMLElement;

  // DOM 状态缓存，彻底杜绝强制同步重排
  private cachedLeftTxt = '';
  private cachedLeftClass = '';
  private cachedLeftBadge = '';
  private cachedLeftDur = '';
  private cachedLeftDurClass = '';
  private cachedRightTxt = '';
  private cachedRightClass = '';
  private cachedRightBadge = '';
  private cachedRightDur = '';
  private cachedRightDurClass = '';
  private cachedRatioTxt = '';
  private cachedFps = '';
  private cachedLatency = '';
  private prevHandLandmarks: Map<string, { lms: NormalizedLandmark[]; timestamp: number }> = new Map();
  private bodyObserver: MutationObserver | null = null;

  constructor(serviceOrParent?: any, maybeParent?: HTMLElement) {
    const isEl = (typeof HTMLElement !== 'undefined' && serviceOrParent instanceof HTMLElement) ||
      (serviceOrParent && typeof serviceOrParent === 'object' && 'appendChild' in serviceOrParent && !('onFrame' in serviceOrParent));
    const parent = (isEl ? serviceOrParent : maybeParent) || (typeof document !== 'undefined' ? document.body : ({} as any));
    this.service = isEl || !serviceOrParent ? new HandGestureService() : serviceOrParent;
    this.injectStyles();

    this.container = document.createElement('div');
    this.container.id = 'vision-pro-tracking-hud';

    // 1. 右上角悬浮状态胶囊
    this.pillEl = document.createElement('div');
    this.pillEl.className = 'vp-hud-pill';
    this.pillEl.innerHTML = `
      <div class="vp-pill-status-dot"></div>
      <div class="vp-pill-icon">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M18 11V6a2 2 0 0 0-4 0v5"></path>
          <path d="M14 10V4a2 2 0 0 0-4 0v6"></path>
          <path d="M10 10.5V6a2 2 0 0 0-4 0v8"></path>
          <path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"></path>
        </svg>
      </div>
      <span class="vp-pill-title">手势交互</span>
      <button class="vp-pill-btn vp-pill-cam-btn" title="显示摄像头画面">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path>
          <circle cx="12" cy="13" r="4"></circle>
        </svg>
      </button>
      <button class="vp-pill-btn vp-pill-toggle-btn" title="开启/关闭手势识别">开启</button>
    `;

    // 2. 画中画摄像头预览浮窗
    this.previewModalEl = document.createElement('div');
    this.previewModalEl.className = 'vp-hud-preview-modal hidden';
    this.previewModalEl.innerHTML = `
      <div class="vp-modal-header">
        <div class="vp-modal-header-left">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path>
            <circle cx="12" cy="13" r="4"></circle>
          </svg>
          <span class="vp-modal-title">双手手势跟踪 (离线 MediaPipe)</span>
          <span class="vp-offline-tag">离线模型</span>
        </div>
        <div class="vp-modal-header-actions">
          <button class="vp-modal-action-btn vp-modal-log-toggle-btn active" title="显示/收起捏合时长记录">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"></circle>
              <polyline points="12 6 12 12 16 14"></polyline>
            </svg>
            <span class="vp-log-badge">0</span>
          </button>
          <button class="vp-modal-action-btn vp-modal-fullscreen-btn" title="全屏显示镜头">
            <svg class="vp-icon-fullscreen" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"></path>
            </svg>
            <svg class="vp-icon-exit-fullscreen hidden" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7"></path>
            </svg>
          </button>
          <button class="vp-modal-action-btn vp-modal-close-btn" title="收起画面">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
      </div>
      <div class="vp-modal-video-wrap">
        <canvas class="vp-modal-canvas" width="320" height="240"></canvas>
        <div class="vp-dual-indicator">
          <div class="vp-ind-row left">
            <span class="vp-ind-dot left"></span>
            <span class="vp-ind-name">左手(悬浮窗口/拖拽视角):</span>
            <span class="vp-left-txt">未检测</span>
            <span class="vp-left-live-badge hidden">0 ms</span>
          </div>
          <div class="vp-ind-row right">
            <span class="vp-ind-dot right"></span>
            <span class="vp-ind-name">右手(点击/拖拽):</span>
            <span class="vp-right-txt">未检测</span>
            <span class="vp-right-live-badge hidden">0 ms</span>
          </div>
        </div>
      </div>
      <div class="vp-modal-footer">
        <div class="vp-footer-stat"><span class="vp-stat-label">帧率:</span> <span class="vp-fps-val">0 FPS</span></div>
        <div class="vp-footer-stat"><span class="vp-stat-label">延迟:</span> <span class="vp-latency-val">0 ms</span></div>
        <div class="vp-footer-stat"><span class="vp-stat-label">加速:</span> <span class="vp-delegate-val">GPU</span></div>
        <div class="vp-footer-stat"><span class="vp-stat-label">左捏合:</span> <span class="vp-left-duration-val">-</span></div>
        <div class="vp-footer-stat"><span class="vp-stat-label">右捏合:</span> <span class="vp-right-duration-val">-</span></div>
      </div>
      <div class="vp-pinch-log-section">
        <div class="vp-pinch-log-header">
          <div class="vp-pinch-log-title">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"></circle>
              <polyline points="12 6 12 12 16 14"></polyline>
            </svg>
            <span>捏合时长记录</span>
            <span class="vp-pinch-log-count">(0)</span>
          </div>
          <div class="vp-pinch-log-actions">
            <span class="vp-pinch-avg-stat">平均: -</span>
            <button class="vp-pinch-clear-btn" title="清空记录">清空</button>
          </div>
        </div>
        <div class="vp-pinch-log-list">
          <div class="vp-pinch-log-empty">暂无捏合记录，尝试用双手捏合</div>
        </div>
      </div>
    `;

    this.container.appendChild(this.pillEl);
    this.container.appendChild(this.previewModalEl);
    parent.appendChild(this.container);

    this.previewCanvas = this.previewModalEl.querySelector('.vp-modal-canvas') as HTMLCanvasElement;
    this.previewCtx = this.previewCanvas.getContext('2d')!;

    // 预先缓存 DOM 节点以保证极致性能
    this.logSectionEl = this.previewModalEl.querySelector('.vp-pinch-log-section') as HTMLElement;
    this.logListEl = this.previewModalEl.querySelector('.vp-pinch-log-list') as HTMLElement;
    this.logCountBadge = this.previewModalEl.querySelector('.vp-log-badge') as HTMLElement;
    this.logCountHeader = this.previewModalEl.querySelector('.vp-pinch-log-count') as HTMLElement;
    this.logAvgStat = this.previewModalEl.querySelector('.vp-pinch-avg-stat') as HTMLElement;
    this.logToggleBtn = this.previewModalEl.querySelector('.vp-modal-log-toggle-btn') as HTMLButtonElement;
    this.leftLiveBadge = this.previewModalEl.querySelector('.vp-left-live-badge') as HTMLElement;
    this.rightLiveBadge = this.previewModalEl.querySelector('.vp-right-live-badge') as HTMLElement;
    this.leftDurationVal = this.previewModalEl.querySelector('.vp-left-duration-val') as HTMLElement;
    this.rightDurationVal = this.previewModalEl.querySelector('.vp-right-duration-val') as HTMLElement;

    this.bindEvents();
    this.listenToService();
    this.initEnvironmentObserver();
  }

  private injectStyles(): void {
    const css = `
      #vision-pro-tracking-hud {
        position: fixed;
        top: calc(16px + env(safe-area-inset-top, 0px));
        right: calc(20px + env(safe-area-inset-right, 0px));
        z-index: 8500;
        font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", system-ui, sans-serif;
        user-select: none;
        pointer-events: auto;
        transition: opacity 0.25s ease, transform 0.25s cubic-bezier(0.16, 1, 0.3, 1), visibility 0.25s ease;
      }

      /* 处于白板模式或正在返回白板时，自动隐藏手部追踪 HUD */
      #vision-pro-tracking-hud.hidden,
      #vision-pro-tracking-hud.hidden-by-env,
      body:not(.lab-active) #vision-pro-tracking-hud,
      body.lab-returning #vision-pro-tracking-hud,
      #whiteboard-app-root:not(.hidden-view) ~ #vision-pro-tracking-hud,
      #whiteboard-app-root:not(.hidden-view) ~ * #vision-pro-tracking-hud {
        opacity: 0 !important;
        pointer-events: none !important;
        visibility: hidden !important;
        transform: translateY(-16px) scale(0.92) !important;
      }

      .vp-hud-pill {
        display: flex;
        align-items: center;
        gap: 8px;
        background: rgba(28, 28, 30, 0.82);
        backdrop-filter: blur(28px) saturate(190%);
        border: 1px solid rgba(255, 255, 255, 0.16);
        border-top: 1px solid rgba(255, 255, 255, 0.28);
        border-radius: 980px;
        padding: 5px 10px 5px 12px;
        box-shadow: 0 10px 30px rgba(0, 0, 0, 0.4), 0 2px 8px rgba(0, 0, 0, 0.25);
        color: #f5f5f7;
        font-size: 12px;
        font-weight: 500;
        letter-spacing: -0.1px;
        transition: all 0.24s cubic-bezier(0.16, 1, 0.3, 1);
      }

      .vp-hud-pill:hover {
        background: rgba(38, 38, 42, 0.88);
        border-color: rgba(255, 255, 255, 0.24);
      }

      .vp-pill-status-dot {
        width: 7px;
        height: 7px;
        border-radius: 50%;
        background: #8e8e93;
        transition: background-color 0.2s ease, box-shadow 0.2s ease;
      }

      .vp-pill-status-dot.active {
        background: #30d158;
        box-shadow: 0 0 8px #30d158;
      }

      .vp-pill-status-dot.loading {
        background: #ff9f0a;
        box-shadow: 0 0 8px #ff9f0a;
      }

      .vp-pill-status-dot.error {
        background: #ff453a;
        box-shadow: 0 0 8px #ff453a;
      }

      .vp-pill-icon {
        display: flex;
        align-items: center;
        color: #0a84ff;
      }

      .vp-pill-title {
        white-space: nowrap;
      }

      .vp-pill-btn {
        background: rgba(255, 255, 255, 0.1);
        border: 1px solid rgba(255, 255, 255, 0.12);
        color: #ffffff;
        border-radius: 12px;
        padding: 4px 9px;
        font-size: 11px;
        font-weight: 600;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.16s ease;
      }

      .vp-pill-btn:hover {
        background: rgba(255, 255, 255, 0.2);
        border-color: rgba(255, 255, 255, 0.25);
      }

      .vp-pill-btn:active {
        transform: scale(0.95);
      }

      .vp-pill-toggle-btn.active {
        background: rgba(10, 132, 255, 0.25);
        color: #0a84ff;
        border-color: rgba(10, 132, 255, 0.5);
      }

      /* 画中画摄像头预览浮窗样式 */
      .vp-hud-preview-modal {
        position: absolute;
        top: calc(100% + 10px);
        right: 0;
        width: 324px;
        background: rgba(24, 24, 28, 0.9);
        backdrop-filter: blur(36px) saturate(200%);
        border: 1px solid rgba(255, 255, 255, 0.18);
        border-top: 1px solid rgba(255, 255, 255, 0.3);
        border-radius: 16px;
        overflow: hidden;
        box-shadow: 0 20px 48px rgba(0, 0, 0, 0.55), 0 4px 16px rgba(0, 0, 0, 0.3);
        transition: opacity 0.24s cubic-bezier(0.16, 1, 0.3, 1),
                    transform 0.24s cubic-bezier(0.16, 1, 0.3, 1);
        transform-origin: top right;
      }

      .vp-hud-preview-modal.hidden {
        opacity: 0;
        transform: scale(0.92) translateY(-10px);
        pointer-events: none;
      }

      .vp-modal-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 9px 12px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.08);
      }

      .vp-modal-header-left {
        display: flex;
        align-items: center;
        gap: 6px;
        color: #f5f5f7;
      }

      .vp-modal-title {
        font-size: 11.5px;
        font-weight: 600;
        letter-spacing: -0.1px;
      }

      .vp-offline-tag {
        font-size: 9.5px;
        font-weight: 600;
        padding: 1px 5px;
        border-radius: 4px;
        background: rgba(48, 209, 88, 0.16);
        color: #30d158;
        border: 1px solid rgba(48, 209, 88, 0.28);
      }

      .vp-modal-header-actions {
        display: flex;
        align-items: center;
        gap: 4px;
      }

      .vp-modal-action-btn {
        background: transparent;
        border: none;
        color: rgba(255, 255, 255, 0.65);
        cursor: pointer;
        padding: 4px;
        border-radius: 6px;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: color 0.15s ease, background 0.15s ease, transform 0.1s ease;
      }

      .vp-modal-action-btn:hover {
        color: #ffffff;
        background: rgba(255, 255, 255, 0.14);
      }

      .vp-modal-action-btn:active {
        transform: scale(0.92);
      }

      .vp-modal-action-btn.active {
        color: #0a84ff;
        background: rgba(10, 132, 255, 0.22);
      }

      .vp-modal-action-btn svg.hidden {
        display: none !important;
      }

      .vp-log-badge {
        font-size: 9px;
        font-weight: 700;
        padding: 0 4px;
        min-width: 14px;
        height: 14px;
        line-height: 14px;
        text-align: center;
        border-radius: 7px;
        background: rgba(10, 132, 255, 0.4);
        color: #ffffff;
        margin-left: 3px;
        font-family: -apple-system, BlinkMacSystemFont, "SF Mono", Menlo, monospace;
      }

      .vp-modal-video-wrap {
        position: relative;
        width: 324px;
        height: 240px;
        background: #000000;
        overflow: hidden;
      }

      .vp-modal-canvas {
        width: 100%;
        height: 100%;
        object-fit: cover;
        display: block;
      }

      .vp-dual-indicator {
        position: absolute;
        bottom: 8px;
        left: 8px;
        right: 8px;
        background: rgba(0, 0, 0, 0.72);
        backdrop-filter: blur(10px);
        padding: 6px 10px;
        border-radius: 8px;
        font-size: 10.5px;
        color: #f5f5f7;
        border: 1px solid rgba(255, 255, 255, 0.1);
        display: flex;
        flex-direction: column;
        gap: 4px;
      }

      .vp-ind-row {
        display: flex;
        align-items: center;
        gap: 5px;
      }

      .vp-ind-dot {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        flex-shrink: 0;
      }

      .vp-ind-dot.left {
        background: #ff9f0a;
      }

      .vp-ind-dot.right {
        background: #0a84ff;
      }

      .vp-ind-name {
        color: rgba(255, 255, 255, 0.7);
        font-size: 10px;
      }

      .vp-left-txt, .vp-right-txt {
        font-weight: 600;
        color: #8e8e93;
      }

      .vp-left-txt.active {
        color: #ff9f0a;
      }

      .vp-right-txt.active {
        color: #30d158;
      }

      .vp-left-live-badge, .vp-right-live-badge {
        margin-left: auto;
        font-size: 9.5px;
        font-weight: 700;
        font-family: -apple-system, BlinkMacSystemFont, "SF Mono", Menlo, monospace;
        padding: 1px 5px;
        border-radius: 4px;
        background: rgba(48, 209, 88, 0.2);
        color: #30d158;
        border: 1px solid rgba(48, 209, 88, 0.4);
      }

      .vp-left-live-badge {
        background: rgba(255, 159, 10, 0.2);
        color: #ff9f0a;
        border-color: rgba(255, 159, 10, 0.4);
      }

      .vp-left-live-badge.hidden, .vp-right-live-badge.hidden {
        display: none !important;
      }

      .vp-modal-footer {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 7px 10px;
        background: rgba(255, 255, 255, 0.03);
        border-top: 1px solid rgba(255, 255, 255, 0.06);
        font-size: 10px;
        font-family: -apple-system, BlinkMacSystemFont, "SF Mono", Menlo, monospace;
      }

      .vp-footer-stat {
        display: flex;
        align-items: center;
        gap: 3px;
        color: #f5f5f7;
      }

      .vp-stat-label {
        color: rgba(255, 255, 255, 0.5);
      }

      .vp-left-duration-val.active {
        color: #ff9f0a;
        font-weight: 700;
      }

      .vp-right-duration-val.active {
        color: #30d158;
        font-weight: 700;
      }

      /* 捏合持续时长历史记录列表区域 */
      .vp-pinch-log-section {
        display: flex;
        flex-direction: column;
        background: rgba(18, 18, 22, 0.75);
        border-top: 1px solid rgba(255, 255, 255, 0.08);
        transition: max-height 0.26s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.2s ease;
        overflow: hidden;
      }

      .vp-pinch-log-section.collapsed {
        max-height: 0 !important;
        opacity: 0 !important;
        pointer-events: none !important;
      }

      .vp-pinch-log-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 6px 12px;
        background: rgba(255, 255, 255, 0.02);
        border-bottom: 1px solid rgba(255, 255, 255, 0.05);
        font-size: 11px;
        color: #f5f5f7;
        cursor: pointer;
        user-select: none;
      }

      .vp-pinch-log-title {
        display: flex;
        align-items: center;
        gap: 5px;
        font-weight: 600;
        letter-spacing: -0.1px;
      }

      .vp-pinch-log-count {
        color: rgba(255, 255, 255, 0.5);
        font-size: 10px;
      }

      .vp-pinch-log-actions {
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .vp-pinch-avg-stat {
        font-size: 10px;
        color: rgba(255, 255, 255, 0.55);
        font-family: -apple-system, BlinkMacSystemFont, "SF Mono", Menlo, monospace;
      }

      .vp-pinch-clear-btn {
        background: rgba(255, 255, 255, 0.08);
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 4px;
        color: rgba(255, 255, 255, 0.75);
        font-size: 10px;
        padding: 1px 6px;
        cursor: pointer;
        transition: all 0.15s ease;
      }

      .vp-pinch-clear-btn:hover {
        background: rgba(255, 69, 58, 0.2);
        color: #ff453a;
        border-color: rgba(255, 69, 58, 0.35);
      }

      .vp-pinch-log-list {
        max-height: 125px;
        overflow-y: auto;
        padding: 4px 6px;
        display: flex;
        flex-direction: column;
        gap: 3px;
        scrollbar-width: thin;
        scrollbar-color: rgba(255, 255, 255, 0.15) transparent;
      }

      .vp-pinch-log-list::-webkit-scrollbar {
        width: 4px;
      }

      .vp-pinch-log-list::-webkit-scrollbar-thumb {
        background: rgba(255, 255, 255, 0.15);
        border-radius: 2px;
      }

      .vp-pinch-log-empty {
        text-align: center;
        padding: 14px 10px;
        color: rgba(255, 255, 255, 0.38);
        font-size: 10.5px;
        font-style: italic;
      }

      .vp-pinch-log-item {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 4px 8px;
        border-radius: 6px;
        background: rgba(255, 255, 255, 0.03);
        border: 1px solid rgba(255, 255, 255, 0.04);
        font-size: 10.5px;
        transition: background 0.12s ease;
      }

      .vp-pinch-log-item:hover {
        background: rgba(255, 255, 255, 0.07);
      }

      .vp-log-item-left {
        display: flex;
        align-items: center;
        gap: 5px;
        min-width: 0;
        overflow: hidden;
      }

      .vp-log-time {
        color: rgba(255, 255, 255, 0.4);
        font-size: 9.5px;
        font-family: -apple-system, BlinkMacSystemFont, "SF Mono", Menlo, monospace;
        flex-shrink: 0;
      }

      .vp-log-hand-tag {
        font-size: 9.5px;
        font-weight: 600;
        padding: 0 4px;
        border-radius: 3px;
        flex-shrink: 0;
      }

      .vp-log-hand-tag.left {
        background: rgba(255, 159, 10, 0.18);
        color: #ff9f0a;
        border: 1px solid rgba(255, 159, 10, 0.35);
      }

      .vp-log-hand-tag.right {
        background: rgba(10, 132, 255, 0.18);
        color: #0a84ff;
        border: 1px solid rgba(10, 132, 255, 0.35);
      }

      .vp-log-action-tag {
        font-size: 9.5px;
        color: rgba(255, 255, 255, 0.85);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .vp-log-action-tag.tag-window {
        color: #ffd60a;
      }

      .vp-log-action-tag.tag-rotate {
        color: #ff9f0a;
      }

      .vp-log-action-tag.tag-click {
        color: #30d158;
      }

      .vp-log-action-tag.tag-drag {
        color: #64d2ff;
      }

      .vp-log-item-right {
        flex-shrink: 0;
        margin-left: 6px;
      }

      .vp-log-duration {
        font-family: -apple-system, BlinkMacSystemFont, "SF Mono", Menlo, monospace;
        font-weight: 600;
        font-size: 10px;
        padding: 1px 5px;
        border-radius: 4px;
      }

      .vp-log-duration.quick {
        background: rgba(48, 209, 88, 0.15);
        color: #30d158;
        border: 1px solid rgba(48, 209, 88, 0.3);
      }

      .vp-log-duration.long {
        background: rgba(255, 159, 10, 0.15);
        color: #ff9f0a;
        border: 1px solid rgba(255, 159, 10, 0.3);
      }

      /* ========================================================== */
      /* 全屏摄像头视窗样式 */
      /* ========================================================== */
      .vp-hud-preview-modal.fullscreen {
        position: fixed !important;
        inset: 0 !important;
        top: 0 !important;
        left: 0 !important;
        bottom: 0 !important;
        right: 0 !important;
        width: 100vw !important;
        height: 100vh !important;
        max-width: 100vw !important;
        max-height: 100vh !important;
        border-radius: 0 !important;
        z-index: 999999 !important;
        margin: 0 !important;
        background: rgba(10, 10, 12, 0.96) !important;
        backdrop-filter: none !important;
        display: flex !important;
        flex-direction: column !important;
        transform: none !important;
        border: none !important;
        box-shadow: none !important;
      }

      .vp-hud-preview-modal.fullscreen.hidden {
        display: none !important;
      }

      .vp-hud-preview-modal.fullscreen .vp-modal-header {
        padding: 12px 24px;
        background: rgba(22, 22, 26, 0.75);
        border-bottom: 1px solid rgba(255, 255, 255, 0.12);
        flex-shrink: 0;
      }

      .vp-hud-preview-modal.fullscreen .vp-modal-title {
        font-size: 13.5px;
      }

      .vp-hud-preview-modal.fullscreen .vp-offline-tag {
        font-size: 10.5px;
        padding: 2px 7px;
      }

      .vp-hud-preview-modal.fullscreen .vp-modal-video-wrap {
        flex: 1;
        width: 100% !important;
        height: 100% !important;
        min-height: 0 !important;
        display: flex;
        align-items: center;
        justify-content: center;
        background: #000000;
        position: relative;
        overflow: hidden;
      }

      .vp-hud-preview-modal.fullscreen .vp-modal-canvas {
        max-width: 100%;
        max-height: 100%;
        object-fit: contain;
        display: block;
        margin: auto;
      }

      .vp-hud-preview-modal.fullscreen .vp-dual-indicator {
        position: absolute;
        bottom: 24px;
        left: 50%;
        right: auto;
        transform: translateX(-50%);
        min-width: 380px;
        max-width: 90vw;
        padding: 10px 18px;
        border-radius: 12px;
        font-size: 12px;
        background: rgba(20, 20, 24, 0.85);
        backdrop-filter: blur(24px);
        border: 1px solid rgba(255, 255, 255, 0.16);
        box-shadow: 0 12px 32px rgba(0, 0, 0, 0.6);
        gap: 6px;
      }

      .vp-hud-preview-modal.fullscreen .vp-modal-footer {
        padding: 10px 24px;
        background: rgba(22, 22, 26, 0.75);
        border-top: 1px solid rgba(255, 255, 255, 0.1);
        font-size: 12px;
        flex-shrink: 0;
        justify-content: center;
        gap: 32px;
      }

      .vp-hud-preview-modal.fullscreen .vp-pinch-log-section {
        position: absolute;
        right: 24px;
        top: 64px;
        bottom: 74px;
        width: 360px;
        max-height: none;
        z-index: 10;
        background: rgba(20, 20, 26, 0.88);
        backdrop-filter: blur(36px);
        border: 1px solid rgba(255, 255, 255, 0.16);
        border-radius: 14px;
        box-shadow: 0 16px 40px rgba(0, 0, 0, 0.6);
      }

      .vp-hud-preview-modal.fullscreen .vp-pinch-log-section.collapsed {
        display: none !important;
      }

      .vp-hud-preview-modal.fullscreen .vp-pinch-log-header {
        padding: 10px 16px;
        font-size: 12px;
      }

      .vp-hud-preview-modal.fullscreen .vp-pinch-log-list {
        flex: 1;
        max-height: none;
        padding: 8px 10px;
        gap: 5px;
      }

      .vp-hud-preview-modal.fullscreen .vp-pinch-log-item {
        padding: 6px 10px;
        font-size: 11.5px;
      }

      .vp-hud-preview-modal.fullscreen .vp-log-time {
        font-size: 10.5px;
      }

      .vp-hud-preview-modal.fullscreen .vp-log-hand-tag {
        font-size: 10.5px;
        padding: 1px 6px;
      }

      .vp-hud-preview-modal.fullscreen .vp-log-action-tag {
        font-size: 10.5px;
      }

      .vp-hud-preview-modal.fullscreen .vp-log-duration {
        font-size: 11px;
        padding: 2px 7px;
      }
    `;

    const existing = document.getElementById('vision-pro-hud-style');
    if (existing) {
      existing.textContent = css;
      return;
    }
    const style = document.createElement('style');
    style.id = 'vision-pro-hud-style';
    style.textContent = css;
    document.head.appendChild(style);
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    if (e.key === 'Escape' && this.isFullscreen && this.isPreviewOpen) {
      this.toggleFullscreen(false);
    }
  };

  private onResize = (): void => {
    if (this.isFullscreen && this.isPreviewOpen) {
      this.updateFullscreenCanvasSize();
    }
  };

  private bindEvents(): void {
    const toggleBtn = this.pillEl.querySelector('.vp-pill-toggle-btn') as HTMLButtonElement;
    const camBtn = this.pillEl.querySelector('.vp-pill-cam-btn') as HTMLButtonElement;
    const fsBtn = this.previewModalEl.querySelector('.vp-modal-fullscreen-btn') as HTMLButtonElement;
    const closeBtn = this.previewModalEl.querySelector('.vp-modal-close-btn') as HTMLButtonElement;
    const headerEl = this.previewModalEl.querySelector('.vp-modal-header') as HTMLElement;

    toggleBtn.addEventListener('click', async () => {
      if (this.isEnabled) {
        this.disable();
      } else {
        await this.enable();
      }
    });

    camBtn.addEventListener('click', () => {
      this.togglePreview();
    });

    fsBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleFullscreen();
    });

    // 双击窗口标题栏切换全屏显示（类 macOS 原生窗口行为）
    headerEl.addEventListener('dblclick', (e) => {
      if ((e.target as HTMLElement).closest('button')) return;
      this.toggleFullscreen();
    });

    closeBtn.addEventListener('click', () => {
      if (this.isFullscreen) {
        this.toggleFullscreen(false);
      }
      this.togglePreview(false);
    });

    this.logToggleBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleLogPanel();
    });

    const logHeader = this.previewModalEl.querySelector('.vp-pinch-log-header') as HTMLElement | null;
    logHeader?.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('button')) return;
      this.toggleLogPanel();
    });

    const clearBtn = this.previewModalEl.querySelector('.vp-pinch-clear-btn') as HTMLButtonElement | null;
    clearBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.clearPinchLogs();
    });

    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('resize', this.onResize);
  }

  public async enable(): Promise<void> {
    const toggleBtn = this.pillEl.querySelector('.vp-pill-toggle-btn') as HTMLButtonElement;
    const dot = this.pillEl.querySelector('.vp-pill-status-dot') as HTMLElement;

    try {
      dot.className = 'vp-pill-status-dot loading';
      toggleBtn.textContent = '启动中...';
      await this.service.start();
      this.isEnabled = true;
      toggleBtn.textContent = '关闭';
      toggleBtn.classList.add('active');
      dot.className = 'vp-pill-status-dot active';
    } catch (err) {
      console.error('[HandTrackingHUD] Enable failed:', err);
      dot.className = 'vp-pill-status-dot error';
      toggleBtn.textContent = '重试';
      toggleBtn.classList.remove('active');
      this.isEnabled = false;
    }
  }

  public disable(): void {
    const toggleBtn = this.pillEl.querySelector('.vp-pill-toggle-btn') as HTMLButtonElement;
    const dot = this.pillEl.querySelector('.vp-pill-status-dot') as HTMLElement;

    this.service.stop();
    this.isEnabled = false;
    toggleBtn.textContent = '开启';
    toggleBtn.classList.remove('active');
    dot.className = 'vp-pill-status-dot';
  }

  public togglePreview(forceOpen?: boolean): void {
    this.isPreviewOpen = forceOpen !== undefined ? forceOpen : !this.isPreviewOpen;
    if (this.isPreviewOpen) {
      this.previewModalEl.classList.remove('hidden');
      if (this.isFullscreen) {
        this.updateFullscreenCanvasSize();
      }
    } else {
      if (this.isFullscreen) {
        this.toggleFullscreen(false);
      }
      this.previewModalEl.classList.add('hidden');
    }
  }

  public toggleFullscreen(force?: boolean): void {
    const next = force !== undefined ? force : !this.isFullscreen;
    if (this.isFullscreen === next) return;
    this.isFullscreen = next;

    const fsBtn = this.previewModalEl.querySelector('.vp-modal-fullscreen-btn') as HTMLButtonElement | null;
    const expandIcon = fsBtn?.querySelector('.vp-icon-fullscreen') as HTMLElement | null;
    const exitIcon = fsBtn?.querySelector('.vp-icon-exit-fullscreen') as HTMLElement | null;

    if (this.isFullscreen) {
      if (!this.isPreviewOpen) {
        this.togglePreview(true);
      }
      this.previewModalEl.classList.add('fullscreen');
      fsBtn?.classList.add('active');
      fsBtn?.setAttribute('title', '退出全屏 (Esc)');
      expandIcon?.classList.add('hidden');
      exitIcon?.classList.remove('hidden');

      this.updateFullscreenCanvasSize();
      if (typeof requestAnimationFrame !== 'undefined') {
        requestAnimationFrame(() => this.updateFullscreenCanvasSize());
      }
    } else {
      this.previewModalEl.classList.remove('fullscreen');
      fsBtn?.classList.remove('active');
      fsBtn?.setAttribute('title', '全屏显示镜头');
      expandIcon?.classList.remove('hidden');
      exitIcon?.classList.add('hidden');

      this.previewCanvas.style.width = '';
      this.previewCanvas.style.height = '';
      this.previewCanvas.width = 320;
      this.previewCanvas.height = 240;
    }
  }

  public updateFullscreenCanvasSize(): void {
    if (!this.isFullscreen) return;
    const video = this.service.getVideoElement();
    const vw = video && video.videoWidth > 0 ? video.videoWidth : 1280;
    const vh = video && video.videoHeight > 0 ? video.videoHeight : 720;
    const aspect = vw / vh || 16 / 9;

    const wrap = this.previewModalEl.querySelector('.vp-modal-video-wrap') as HTMLElement | null;
    const maxW = wrap && wrap.clientWidth > 0 ? wrap.clientWidth : window.innerWidth;
    const maxH = wrap && wrap.clientHeight > 0 ? wrap.clientHeight : Math.max(200, window.innerHeight - 88);

    let targetW = maxW;
    let targetH = maxW / aspect;
    if (targetH > maxH) {
      targetH = maxH;
      targetW = maxH * aspect;
    }

    // 摄像头原生仅提供 vw × vh 物理像素。若强制使用超大 HiDPI 画布渲染，
    // 反复放大相同像素不仅无画质收益，反而会阻滞手部追踪渲染管线。
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const backingScale = Math.min(dpr, (vw * 1.5) / targetW);
    this.previewCanvas.width = Math.round(targetW * backingScale);
    this.previewCanvas.height = Math.round(targetH * backingScale);
    this.previewCanvas.style.width = `${Math.round(targetW)}px`;
    this.previewCanvas.style.height = `${Math.round(targetH)}px`;
  }

  private listenToService(): void {
    const dot = this.pillEl.querySelector('.vp-pill-status-dot') as HTMLElement;
    const fpsVal = this.previewModalEl.querySelector('.vp-fps-val') as HTMLElement;
    const latencyVal = this.previewModalEl.querySelector('.vp-latency-val') as HTMLElement;
    const delegateVal = this.previewModalEl.querySelector('.vp-delegate-val') as HTMLElement | null;
    const ratioVal = this.previewModalEl.querySelector('.vp-ratio-val') as HTMLElement | null;
    const leftTxt = this.previewModalEl.querySelector('.vp-left-txt') as HTMLElement;
    const rightTxt = this.previewModalEl.querySelector('.vp-right-txt') as HTMLElement;

    this.service.onStatusChange((telemetry: TrackerTelemetry) => {
      if (telemetry.status === 'running') {
        dot.className = 'vp-pill-status-dot active';
      } else if (telemetry.status === 'loading') {
        dot.className = 'vp-pill-status-dot loading';
      } else if (telemetry.status === 'error') {
        dot.className = 'vp-pill-status-dot error';
      } else {
        dot.className = 'vp-pill-status-dot';
      }

      const fpsStr = `${telemetry.fps} FPS`;
      if (this.cachedFps !== fpsStr) {
        this.cachedFps = fpsStr;
        fpsVal.textContent = fpsStr;
      }

      const latStr = `${telemetry.latencyMs.toFixed(1)} ms`;
      if (this.cachedLatency !== latStr) {
        this.cachedLatency = latStr;
        latencyVal.textContent = latStr;
      }

      if (delegateVal && telemetry.delegate) {
        const delText = telemetry.delegate === 'GPU' ? 'GPU' : telemetry.delegate === 'CPU' ? 'CPU (降级)' : '-';
        if (delegateVal.textContent !== delText) {
          delegateVal.textContent = delText;
          delegateVal.style.color = telemetry.delegate === 'GPU' ? '#30d158' : telemetry.delegate === 'CPU' ? '#ff9f0a' : 'inherit';
        }
      }
    });

    this.service.onFrame((frame: HandGestureFrame) => {
      this.lastFrame = frame;

      // 更新左手交互状态
      if (frame.leftHand) {
        const dur = Math.round(frame.leftHand.pinchDuration);
        if (frame.leftHand.isPinching) {
          const txt = frame.isDualPinching
            ? `双手缩放中 (${dur} ms)`
            : frame.leftHand.isLongPinch
            ? `拖拽视角中 (${dur} ms)`
            : `快速捏合中 (${dur} ms)`;
          if (this.cachedLeftTxt !== txt) {
            this.cachedLeftTxt = txt;
            leftTxt.textContent = txt;
          }
          if (this.cachedLeftClass !== 'vp-left-txt active') {
            this.cachedLeftClass = 'vp-left-txt active';
            leftTxt.className = 'vp-left-txt active';
          }
          const badgeTxt = `${dur} ms`;
          if (this.cachedLeftBadge !== badgeTxt) {
            this.cachedLeftBadge = badgeTxt;
            this.leftLiveBadge.textContent = badgeTxt;
          }
          this.leftLiveBadge.classList.remove('hidden');

          if (this.cachedLeftDur !== badgeTxt) {
            this.cachedLeftDur = badgeTxt;
            this.leftDurationVal.textContent = badgeTxt;
          }
          if (this.cachedLeftDurClass !== 'vp-left-duration-val active') {
            this.cachedLeftDurClass = 'vp-left-duration-val active';
            this.leftDurationVal.className = 'vp-left-duration-val active';
          }
        } else {
          if (this.cachedLeftTxt !== '就绪 (张开)') {
            this.cachedLeftTxt = '就绪 (张开)';
            leftTxt.textContent = '就绪 (张开)';
          }
          if (this.cachedLeftClass !== 'vp-left-txt') {
            this.cachedLeftClass = 'vp-left-txt';
            leftTxt.className = 'vp-left-txt';
          }
          this.leftLiveBadge.classList.add('hidden');
          if (this.cachedLeftDurClass !== 'vp-left-duration-val') {
            this.cachedLeftDurClass = 'vp-left-duration-val';
            this.leftDurationVal.className = 'vp-left-duration-val';
          }
        }

        // 左手捏合结束 -> 写入记录日志
        if (frame.leftHand.justPinchEnded && frame.leftHand.pinchDuration > 0) {
          const finishedDur = Math.round(frame.leftHand.pinchDuration);
          const isQuick = frame.leftHandQuickPinch;
          const action = isQuick ? '快速捏合 (悬浮窗口)' : '持续捏合 (拖拽视角)';
          const tagClass = isQuick ? 'tag-window' : 'tag-rotate';
          this.addPinchRecord('left', '左手', finishedDur, action, tagClass);
          const durStr = `${finishedDur} ms (${isQuick ? '窗口' : '视角'})`;
          this.cachedLeftDur = durStr;
          this.leftDurationVal.textContent = durStr;
        }
      } else {
        if (this.cachedLeftTxt !== '未检测') {
          this.cachedLeftTxt = '未检测';
          if (leftTxt) leftTxt.textContent = '未检测';
        }
        if (this.cachedLeftClass !== 'vp-left-txt') {
          this.cachedLeftClass = 'vp-left-txt';
          if (leftTxt) leftTxt.className = 'vp-left-txt';
        }
        this.leftLiveBadge.classList.add('hidden');
      }

      // 更新右手交互状态
      if (frame.rightHand) {
        if (ratioVal) {
          const ratioTxt = `${Math.round(frame.rightHand.pinchStrength * 100)}%`;
          if (this.cachedRatioTxt !== ratioTxt) {
            this.cachedRatioTxt = ratioTxt;
            ratioVal.textContent = ratioTxt;
          }
        }

        const dur = Math.round(frame.rightHand.pinchDuration);
        if (frame.rightHand.isPinching) {
          const txt = frame.isDualPinching
            ? `双手缩放中 (${dur} ms)`
            : dur >= 350
            ? `长按拖拽中 (${dur} ms)`
            : `点按选择中 (${dur} ms)`;
          if (this.cachedRightTxt !== txt) {
            this.cachedRightTxt = txt;
            if (rightTxt) rightTxt.textContent = txt;
          }
          if (this.cachedRightClass !== 'vp-right-txt active') {
            this.cachedRightClass = 'vp-right-txt active';
            if (rightTxt) rightTxt.className = 'vp-right-txt active';
          }
          const badgeTxt = `${dur} ms`;
          if (this.cachedRightBadge !== badgeTxt) {
            this.cachedRightBadge = badgeTxt;
            this.rightLiveBadge.textContent = badgeTxt;
          }
          this.rightLiveBadge.classList.remove('hidden');

          if (this.cachedRightDur !== badgeTxt) {
            this.cachedRightDur = badgeTxt;
            this.rightDurationVal.textContent = badgeTxt;
          }
          if (this.cachedRightDurClass !== 'vp-right-duration-val active') {
            this.cachedRightDurClass = 'vp-right-duration-val active';
            this.rightDurationVal.className = 'vp-right-duration-val active';
          }
        } else {
          if (this.cachedRightTxt !== '光标瞄准') {
            this.cachedRightTxt = '光标瞄准';
            if (rightTxt) rightTxt.textContent = '光标瞄准';
          }
          if (this.cachedRightClass !== 'vp-right-txt') {
            this.cachedRightClass = 'vp-right-txt';
            if (rightTxt) rightTxt.className = 'vp-right-txt';
          }
          this.rightLiveBadge.classList.add('hidden');
          if (this.cachedRightDurClass !== 'vp-right-duration-val') {
            this.cachedRightDurClass = 'vp-right-duration-val';
            if (this.rightDurationVal) this.rightDurationVal.className = 'vp-right-duration-val';
          }
        }

        // 右手捏合结束 -> 写入记录日志
        if (frame.rightHand.justPinchEnded && frame.rightHand.pinchDuration > 0) {
          const finishedDur = Math.round(frame.rightHand.pinchDuration);
          const isDrag = finishedDur >= 350;
          const action = isDrag ? '长按拖拽 (移动对象)' : '点按选择 (鼠标单击)';
          const tagClass = isDrag ? 'tag-drag' : 'tag-click';
          this.addPinchRecord('right', '右手', finishedDur, action, tagClass);
          const durStr = `${finishedDur} ms (${isDrag ? '拖拽' : '点按'})`;
          this.cachedRightDur = durStr;
          if (this.rightDurationVal) this.rightDurationVal.textContent = durStr;
        }
      } else {
        if (this.cachedRatioTxt !== '0%') {
          this.cachedRatioTxt = '0%';
          if (ratioVal) ratioVal.textContent = '0%';
        }
        if (this.cachedRightTxt !== '未检测') {
          this.cachedRightTxt = '未检测';
          if (rightTxt) rightTxt.textContent = '未检测';
        }
        if (this.cachedRightClass !== 'vp-right-txt') {
          this.cachedRightClass = 'vp-right-txt';
          if (rightTxt) rightTxt.className = 'vp-right-txt';
        }
        this.rightLiveBadge.classList.add('hidden');
      }

      if (this.isPreviewOpen) {
        this.renderPreviewCanvas(frame);
      }
    });
  }

  /**
   * 渲染水平镜像的摄像头画面，并叠加绘制双手骨骼拓扑结构与捏合指示器。
   * 结合前向速度外推算法，使骨骼关键点与实时视频流完美对齐同步，
   * 并通过批量批处理 Canvas2D 绘制调用以实现极致高帧率。
   */
  private renderPreviewCanvas(frame: HandGestureFrame): void {
    const video = this.service.getVideoElement();
    const ctx = this.previewCtx;
    const w = this.previewCanvas.width;
    const h = this.previewCanvas.height;

    ctx.clearRect(0, 0, w, h);

    if (video && video.readyState >= 2) {
      ctx.save();
      ctx.translate(w, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(video, 0, 0, w, h);
      ctx.restore();
    } else {
      ctx.fillStyle = '#1c1c1e';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#8e8e93';
      ctx.font = '12px -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('等待前置摄像头画面...', w / 2, h / 2);
      return;
    }

    const handsToRender: {
      data: SingleHandData;
      boneColor: string;
      jointColor: string;
      pinchLineColor: string;
      label: string;
      handKey: string;
    }[] = [];

    if (frame.leftHand && frame.leftHand.landmarks) {
      handsToRender.push({
        data: frame.leftHand,
        boneColor: 'rgba(255, 255, 255, 0.45)',
        jointColor: '#ffffff',
        pinchLineColor: frame.leftHand.isPinching ? '#ffffff' : 'rgba(255, 255, 255, 0.7)',
        label: '左手',
        handKey: 'left',
      });
    }

    if (frame.rightHand && frame.rightHand.landmarks) {
      handsToRender.push({
        data: frame.rightHand,
        boneColor: 'rgba(255, 255, 255, 0.45)',
        jointColor: '#ffffff',
        pinchLineColor: frame.rightHand.isPinching ? '#ffffff' : 'rgba(255, 255, 255, 0.7)',
        label: '右手',
        handKey: 'right',
      });
    }

    if (handsToRender.length === 0) {
      this.prevHandLandmarks.clear();
      return;
    }

    ctx.save();
    const CONNECTIONS = [
      [0, 1], [1, 2], [2, 3], [3, 4],
      [0, 5], [5, 6], [6, 7], [7, 8],
      [0, 9], [9, 10], [10, 11], [11, 12],
      [0, 13], [13, 14], [14, 15], [15, 16],
      [0, 17], [17, 18], [18, 19], [19, 20],
      [5, 9], [9, 13], [13, 17],
    ];

    const isFs = this.isFullscreen;
    const scale = isFs ? Math.max(1.3, Math.min(3.0, w / 540)) : 1.0;
    const latencyCompensationMs = Math.min(Math.max(this.service.getTelemetry().latencyMs, 10), 50);

    for (const hand of handsToRender) {
      const rawLms = hand.data.landmarks;
      const prev = this.prevHandLandmarks.get(hand.handKey);
      let lms = rawLms;

      // 视觉延迟前向外推补偿：消除关键点相对于实时视频流的管线处理延迟
      if (prev && frame.timestamp > prev.timestamp) {
        const dt = Math.max(frame.timestamp - prev.timestamp, 1);
        const factor = Math.min(latencyCompensationMs / dt, 1.2);
        lms = rawLms.map((p, idx) => {
          const prevP = prev.lms[idx] || p;
          const vx = (p.x - prevP.x) * factor;
          const vy = (p.y - prevP.y) * factor;
          return {
            x: Math.max(0, Math.min(1, p.x + vx)),
            y: Math.max(0, Math.min(1, p.y + vy)),
            z: p.z,
          };
        });
      }
      this.prevHandLandmarks.set(hand.handKey, { lms: rawLms, timestamp: frame.timestamp });

      // 1. 在单一批量路径中绘制手部骨骼连线
      ctx.lineWidth = Math.round(2 * scale);
      ctx.strokeStyle = hand.boneColor;
      ctx.beginPath();
      for (let c = 0; c < CONNECTIONS.length; c++) {
        const [i, j] = CONNECTIONS[c];
        const p1 = lms[i];
        const p2 = lms[j];
        ctx.moveTo((1.0 - p1.x) * w, p1.y * h);
        ctx.lineTo((1.0 - p2.x) * w, p2.y * h);
      }
      ctx.stroke();

      // 2. 绘制拇指 (4) 与食指 (8) 之间的捏合指示虚线
      const thumb = lms[4];
      const index = lms[8];
      const tx = (1.0 - thumb.x) * w;
      const ty = thumb.y * h;
      const ix = (1.0 - index.x) * w;
      const iy = index.y * h;

      ctx.beginPath();
      ctx.lineWidth = Math.round((hand.data.isPinching ? 3.5 : 2) * scale);
      ctx.strokeStyle = hand.pinchLineColor;
      ctx.moveTo(tx, ty);
      ctx.lineTo(ix, iy);
      ctx.stroke();

      // 3. 批量绘制标准关节点（白色外环）
      ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
      ctx.beginPath();
      const rJoint = 2.5 * scale;
      for (let i = 0; i < lms.length; i++) {
        if (i !== 4 && i !== 8) {
          const px = (1.0 - lms[i].x) * w;
          const py = lms[i].y * h;
          ctx.moveTo(px + rJoint, py);
          ctx.arc(px, py, rJoint, 0, 2 * Math.PI);
        }
      }
      ctx.fill();

      // 4. 批量绘制关键指尖节点（大拇指与食指）
      ctx.fillStyle = hand.data.isPinching ? '#30d158' : hand.jointColor;
      ctx.beginPath();
      const rTip = 4.5 * scale;
      const tpx = (1.0 - thumb.x) * w;
      const tpy = thumb.y * h;
      ctx.moveTo(tpx + rTip, tpy);
      ctx.arc(tpx, tpy, rTip, 0, 2 * Math.PI);

      const ipx = (1.0 - index.x) * w;
      const ipy = index.y * h;
      ctx.moveTo(ipx + rTip, ipy);
      ctx.arc(ipx, ipy, rTip, 0, 2 * Math.PI);
      ctx.fill();

      // 5. 绘制中点标记与状态文本标签
      const mx = (1.0 - (thumb.x + index.x) * 0.5) * w;
      const my = (thumb.y + index.y) * 0.5 * h;

      ctx.beginPath();
      ctx.arc(mx, my, (hand.data.isPinching ? 6 : 9) * scale, 0, 2 * Math.PI);
      ctx.fillStyle = hand.data.isPinching ? hand.pinchLineColor : 'rgba(255, 255, 255, 0.2)';
      ctx.fill();
      ctx.lineWidth = 1.5 * scale;
      ctx.strokeStyle = hand.jointColor;
      ctx.stroke();

      // 6. 在手腕上方绘制手势左右手标识
      const wristX = (1.0 - lms[0].x) * w;
      const wristY = lms[0].y * h;
      ctx.fillStyle = hand.jointColor;
      ctx.font = `bold ${Math.round(10 * scale)}px -apple-system, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(hand.label, wristX, Math.min(h - 6 * scale, wristY + 14 * scale));
    }

    ctx.restore();
  }

  public getPinchLogs(): PinchLogEntry[] {
    return [...this.pinchLogs];
  }

  public clearPinchLogs(): void {
    this.pinchLogs = [];
    this.renderLogList();
    this.updateLogStats();
    if (this.leftDurationVal) this.leftDurationVal.textContent = '-';
    if (this.rightDurationVal) this.rightDurationVal.textContent = '-';
  }

  public toggleLogPanel(force?: boolean): void {
    this.isLogPanelOpen = force !== undefined ? force : !this.isLogPanelOpen;
    if (this.isLogPanelOpen) {
      this.logSectionEl.classList.remove('collapsed');
      this.logToggleBtn.classList.add('active');
    } else {
      this.logSectionEl.classList.add('collapsed');
      this.logToggleBtn.classList.remove('active');
    }
  }

  public addPinchRecord(
    hand: 'left' | 'right',
    handLabel: string,
    durationMs: number,
    action: string,
    tagClass: 'tag-window' | 'tag-rotate' | 'tag-click' | 'tag-drag'
  ): void {
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const mins = String(now.getMinutes()).padStart(2, '0');
    const secs = String(now.getSeconds()).padStart(2, '0');
    const msTenth = String(Math.floor(now.getMilliseconds() / 100));
    const timeStr = `${hours}:${mins}:${secs}.${msTenth}`;

    const entry: PinchLogEntry = {
      id: ++this.logIdCounter,
      timeStr,
      hand,
      handLabel,
      durationMs,
      action,
      tagClass,
    };

    this.pinchLogs.unshift(entry);
    if (this.pinchLogs.length > this.maxPinchLogs) {
      this.pinchLogs.pop();
    }

    this.renderLogList();
    this.updateLogStats();
  }

  private renderLogList(): void {
    if (!this.logListEl) return;

    if (this.pinchLogs.length === 0) {
      this.logListEl.innerHTML = '<div class="vp-pinch-log-empty">暂无捏合记录，尝试用双手捏合</div>';
      return;
    }

    const html = this.pinchLogs
      .map((entry) => {
        const isQuick = entry.durationMs <= 450;
        const durClass = isQuick ? 'quick' : 'long';
        const durDisplay =
          entry.durationMs < 1000
            ? `${entry.durationMs} ms`
            : `${(entry.durationMs / 1000).toFixed(2)} s`;

        return `
          <div class="vp-pinch-log-item">
            <div class="vp-log-item-left">
              <span class="vp-log-time">${entry.timeStr}</span>
              <span class="vp-log-hand-tag ${entry.hand}">${entry.handLabel}</span>
              <span class="vp-log-action-tag ${entry.tagClass}">${entry.action}</span>
            </div>
            <div class="vp-log-item-right">
              <span class="vp-log-duration ${durClass}">${durDisplay}</span>
            </div>
          </div>
        `;
      })
      .join('');

    this.logListEl.innerHTML = html;
  }

  private updateLogStats(): void {
    const count = this.pinchLogs.length;
    if (this.logCountBadge) {
      this.logCountBadge.textContent = String(count);
    }
    if (this.logCountHeader) {
      this.logCountHeader.textContent = `(${count})`;
    }
    if (this.logAvgStat) {
      if (count === 0) {
        this.logAvgStat.textContent = '平均: -';
      } else {
        const sum = this.pinchLogs.reduce((acc, cur) => acc + cur.durationMs, 0);
        const avg = Math.round(sum / count);
        this.logAvgStat.textContent = `平均: ${avg} ms`;
      }
    }
  }

  public setVisible(visible: boolean): void {
    if (!this.container) return;
    this.container.classList.toggle('hidden', !visible);
    if (!visible && this.isFullscreen) {
      this.toggleFullscreen(false);
    }
  }

  public getVisible(): boolean {
    return this.container ? !this.container.classList.contains('hidden') : false;
  }

  public getDOMElement(): HTMLElement {
    return this.container;
  }

  private initEnvironmentObserver(): void {
    if (typeof MutationObserver === 'function' && typeof document !== 'undefined' && document.body) {
      this.bodyObserver = new MutationObserver(() => {
        this.syncVisibilityWithEnvironment();
      });
      try {
        if (typeof (document.body as any).nodeType === 'number') {
          this.bodyObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });
        }
      } catch {}
      this.syncVisibilityWithEnvironment();
    }
  }

  public syncVisibilityWithEnvironment(): void {
    if (typeof document === 'undefined' || !document.body || !this.container) return;
    const isLabActive = typeof document.body.classList?.contains === 'function'
      ? document.body.classList.contains('lab-active')
      : true;
    const isLabReturning = typeof document.body.classList?.contains === 'function'
      ? document.body.classList.contains('lab-returning')
      : false;
    const wbRoot = typeof document.getElementById === 'function'
      ? document.getElementById('whiteboard-app-root')
      : null;
    const isWbVisible = wbRoot && typeof wbRoot.classList?.contains === 'function'
      ? !wbRoot.classList.contains('hidden-view')
      : false;

    // 当页面包含白板应用时，若白板可见或处于返回中状态，自动隐藏手部追踪 HUD
    if (wbRoot && (isWbVisible || !isLabActive || isLabReturning)) {
      this.container.classList.add('hidden-by-env');
    } else {
      this.container.classList.remove('hidden-by-env');
    }
  }

  public destroy(): void {
    if (this.bodyObserver) {
      this.bodyObserver.disconnect();
      this.bodyObserver = null;
    }
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('resize', this.onResize);
    if (this.container && this.container.parentNode) {
      this.container.parentNode.removeChild(this.container);
    }
  }
}
