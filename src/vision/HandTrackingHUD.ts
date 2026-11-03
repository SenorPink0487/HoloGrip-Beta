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
  private logCountBadge: HTMLElement | null = null;
  private logCountHeader!: HTMLElement;
  private logAvgStat!: HTMLElement;
  private logToggleBtn: HTMLButtonElement | null = null;
  private leftDurationVal!: HTMLElement;
  private rightDurationVal!: HTMLElement;

  // DOM 状态缓存，彻底杜绝强制同步重排
  private cachedLeftDur = '';
  private cachedLeftDurClass = '';
  private cachedRightDur = '';
  private cachedRightDurClass = '';
  private cachedRatioTxt = '';
  private cachedFps = '';
  private cachedLatency = '';
  private cachedBackendTag = '';
  private isStarting = false;
  // 双缓冲异步帧解码：front 引用 (readyNativePreviewImage) 始终保持上一帧已完全解码的就绪位图，
  // 后台新 Image 完成 decode() 后再原子替换，彻底消除重设同一 img.src 导致的黑帧高频闪烁
  private readyNativePreviewImage: HTMLImageElement | null = null;
  private decodingNativeImageSrc = '';
  private queuedNativeImageSrc = '';
  private lastDecodedNativeImageSrc = '';
  private prevHandLandmarks: Map<string, { lms: NormalizedLandmark[]; timestamp: number }> = new Map();
  private targetHandLandmarks: Map<string, NormalizedLandmark[]> = new Map();
  private smoothedHandLandmarks: Map<string, NormalizedLandmark[]> = new Map();
  private smoothedPinchRadius: Map<string, number> = new Map();
  private previewAnimFrameId: number | null = null;
  private lastPreviewRenderAt = 0;
  private isDestroyed = false;
  private bodyObserver: MutationObserver | null = null;
  private pillResizeObserver: ResizeObserver | null = null;

  constructor(serviceOrParent?: any, maybeParent?: HTMLElement) {
    const isEl = (typeof HTMLElement !== 'undefined' && serviceOrParent instanceof HTMLElement) ||
      (serviceOrParent && typeof serviceOrParent === 'object' && 'appendChild' in serviceOrParent && !('onFrame' in serviceOrParent));
    const parent = (isEl ? serviceOrParent : maybeParent) || (typeof document !== 'undefined' ? document.body : ({} as any));
    this.service = isEl || !serviceOrParent ? new HandGestureService() : serviceOrParent;
    this.injectStyles();

    this.container = document.createElement('div');
    this.container.id = 'vision-pro-tracking-hud';

    // 1. 右上角悬浮状态胶囊（匹配右下角 visionOS 极简高透流体毛玻璃质感）
    this.pillEl = document.createElement('div');
    this.pillEl.className = 'vp-hud-pill';
    this.pillEl.innerHTML = `
      <div class="vp-pill-status-dot"></div>
      <span class="vp-pill-title">手势交互</span>
      <div class="vp-pill-divider"></div>
      <button class="vp-pill-btn vp-pill-cam-btn" type="button" aria-label="显示摄像头画面" title="显示摄像头画面">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path>
          <circle cx="12" cy="13" r="4"></circle>
        </svg>
      </button>
      <button class="vp-pill-btn vp-pill-toggle-btn" type="button" aria-label="开启或关闭手势识别" title="开启/关闭手势识别">开启</button>
    `;

    // 2. 画中画摄像头预览浮窗
    this.previewModalEl = document.createElement('div');
    this.previewModalEl.className = 'vp-hud-preview-modal hidden';
    this.previewModalEl.innerHTML = `
      <div class="vp-modal-header">
        <div class="vp-modal-header-left">
          <div class="vp-header-icon-wrap">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path>
              <circle cx="12" cy="13" r="4"></circle>
            </svg>
          </div>
          <span class="vp-modal-title">双手手势跟踪</span>
        </div>
        <div class="vp-modal-header-actions">
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
        <canvas class="vp-modal-canvas" width="380" height="240"></canvas>
      </div>
      <div class="vp-modal-footer">
        <div class="vp-pinch-monitor-grid">
          <div class="vp-pinch-monitor-card left">
            <div class="vp-card-label">
              <span class="vp-card-dot left"></span>
              <span>左手捏合</span>
            </div>
            <div class="vp-card-val-wrap">
              <span class="vp-left-duration-val">-</span>
            </div>
          </div>
          <div class="vp-pinch-monitor-card right">
            <div class="vp-card-label">
              <span class="vp-card-dot right"></span>
              <span>右手捏合</span>
            </div>
            <div class="vp-card-val-wrap">
              <span class="vp-right-duration-val">-</span>
            </div>
          </div>
        </div>
        <div class="vp-pipeline-telemetry">
          <div class="vp-telem-item">
            <span class="vp-telem-label">帧率</span>
            <span class="vp-fps-val">0 FPS</span>
          </div>
          <div class="vp-telem-divider"></div>
          <div class="vp-telem-item">
            <span class="vp-telem-label">延迟</span>
            <span class="vp-latency-val">0 ms</span>
          </div>
          <div class="vp-telem-divider"></div>
          <div class="vp-telem-item">
            <span class="vp-telem-label">加速</span>
            <span class="vp-delegate-val">GPU</span>
          </div>
        </div>
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
    this.logCountBadge = this.previewModalEl.querySelector('.vp-log-badge') as HTMLElement | null;
    this.logCountHeader = this.previewModalEl.querySelector('.vp-pinch-log-count') as HTMLElement;
    this.logAvgStat = this.previewModalEl.querySelector('.vp-pinch-avg-stat') as HTMLElement;
    this.logToggleBtn = this.previewModalEl.querySelector('.vp-modal-log-toggle-btn') as HTMLButtonElement | null;
    this.leftDurationVal = this.previewModalEl.querySelector('.vp-left-duration-val') as HTMLElement;
    this.rightDurationVal = this.previewModalEl.querySelector('.vp-right-duration-val') as HTMLElement;

    this.bindEvents();
    this.listenToService();
    this.initEnvironmentObserver();

    if (typeof window !== 'undefined' && typeof ResizeObserver !== 'undefined') {
      try {
        this.pillResizeObserver = new ResizeObserver((entries) => {
          for (const entry of entries) {
            const w = Math.round(entry.borderBoxSize?.[0]?.inlineSize || this.pillEl.offsetWidth || 0);
            if (w > 0) {
              document.documentElement.style.setProperty('--vp-hud-pill-width', `${w}px`);
            }
          }
        });
        this.pillResizeObserver.observe(this.pillEl);
      } catch (_) {
        // Fallback safely in mock/test environments
      }
    }
  }

  private injectStyles(): void {
    const css = `
      #vision-pro-tracking-hud {
        position: fixed;
        top: calc(16px + env(safe-area-inset-top, 0px));
        right: calc(18px + env(safe-area-inset-right, 0px));
        z-index: 8500;
        font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif !important;
        user-select: none;
        -webkit-user-select: none;
        pointer-events: auto;
        opacity: 1;
        transition: opacity 0.35s cubic-bezier(0.16, 1, 0.3, 1),
                    transform 0.38s cubic-bezier(0.16, 1, 0.3, 1),
                    visibility 0.25s ease;
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
        transform: translateY(-12px) scale(0.94) !important;
      }

      .vp-hud-pill {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        height: 44px;
        border-radius: 22px;
        padding: 0 7px 0 14px;
        box-sizing: border-box;
        background: rgba(255, 255, 255, 0.76);
        border: 0.5px solid rgba(255, 255, 255, 0.85);
        box-shadow: 0 4px 18px rgba(0, 0, 0, 0.06),
                    0 1px 2px rgba(0, 0, 0, 0.04),
                    inset 0 1px 1px rgba(255, 255, 255, 0.95);
        backdrop-filter: blur(28px) saturate(180%);
        -webkit-backdrop-filter: blur(28px) saturate(180%);
        color: #1d1d1f;
        font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif !important;
        cursor: default;
        transition: opacity 0.28s cubic-bezier(0.16, 1, 0.3, 1),
                    transform 0.28s cubic-bezier(0.16, 1, 0.3, 1),
                    background 0.2s ease,
                    border-color 0.2s ease,
                    box-shadow 0.2s ease,
                    color 0.2s ease;
        will-change: transform, opacity;
      }

      .vp-hud-pill:hover {
        background: rgba(255, 255, 255, 0.88);
        border-color: rgba(255, 255, 255, 0.95);
        box-shadow: 0 6px 22px rgba(0, 0, 0, 0.08),
                    0 2px 4px rgba(0, 0, 0, 0.03),
                    inset 0 1px 1px #ffffff;
        color: #1d1d1f;
        transform: translateY(-0.5px);
      }

      .vp-hud-pill:active {
        transform: scale(0.985);
      }

      .vp-pill-status-dot {
        width: 7px;
        height: 7px;
        border-radius: 50%;
        background: #8e8e93;
        box-shadow: 0 0 0 1.5px rgba(142, 142, 147, 0.25);
        flex-shrink: 0;
        transition: background-color 0.25s ease, box-shadow 0.25s ease, transform 0.25s ease;
      }

      .vp-pill-status-dot.active {
        background: #34c759;
        box-shadow: 0 0 0 2px rgba(52, 199, 89, 0.25), 0 0 10px rgba(52, 199, 89, 0.65);
        transform: scale(1.08);
        animation: vp-halo-breathe 2.4s ease-in-out infinite;
      }

      @keyframes vp-halo-breathe {
        0%, 100% {
          box-shadow: 0 0 0 2px rgba(52, 199, 89, 0.25), 0 0 8px rgba(52, 199, 89, 0.55);
        }
        50% {
          box-shadow: 0 0 0 3px rgba(52, 199, 89, 0.35), 0 0 12px rgba(52, 199, 89, 0.85);
        }
      }

      .vp-pill-status-dot.loading {
        background: #ff9f0a;
        box-shadow: 0 0 0 2px rgba(255, 159, 10, 0.25), 0 0 10px rgba(255, 159, 10, 0.65);
        animation: vp-pulse-loading 1.2s ease-in-out infinite;
      }

      @keyframes vp-pulse-loading {
        0%, 100% { opacity: 0.65; transform: scale(0.92); }
        50% { opacity: 1; transform: scale(1.15); }
      }

      .vp-pill-status-dot.error {
        background: #ff3b30;
        box-shadow: 0 0 0 2px rgba(255, 59, 48, 0.25), 0 0 10px rgba(255, 59, 48, 0.65);
      }

      .vp-pill-title {
        font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", "PingFang SC", sans-serif !important;
        font-size: 13px;
        font-weight: 550;
        letter-spacing: -0.15px;
        line-height: 1;
        white-space: nowrap;
        color: #1d1d1f;
      }

      .vp-pill-divider {
        width: 0.5px;
        height: 16px;
        background: rgba(0, 0, 0, 0.08);
        pointer-events: none;
        flex-shrink: 0;
        margin: 0 1px;
      }

      .vp-pill-btn {
        background: rgba(0, 0, 0, 0.04);
        border: 0.5px solid rgba(0, 0, 0, 0.06);
        color: #1d1d1f;
        height: 28px;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        outline: none;
        padding: 0;
        touch-action: manipulation;
        user-select: none;
        -webkit-user-select: none;
        -webkit-tap-highlight-color: transparent;
        transition: background 0.18s ease, color 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease, transform 0.12s cubic-bezier(0.16, 1, 0.3, 1);
      }

      .vp-pill-btn:hover {
        background: rgba(0, 0, 0, 0.08);
        border-color: rgba(0, 0, 0, 0.1);
        color: #000000;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
      }

      .vp-pill-btn:active {
        transform: scale(0.94);
      }

      .vp-pill-cam-btn {
        width: 28px;
        height: 28px;
        border-radius: 14px;
        color: #48484a;
      }

      .vp-pill-cam-btn svg {
        flex-shrink: 0;
        color: currentColor;
        stroke: currentColor;
        transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1);
      }

      .vp-pill-cam-btn:hover svg {
        transform: scale(1.08);
      }

      .vp-pill-cam-btn.active,
      .vp-pill-cam-btn.is-open {
        background: rgba(0, 122, 255, 0.12);
        border-color: rgba(0, 122, 255, 0.28);
        color: #0071e3;
        box-shadow: 0 0 10px rgba(0, 122, 255, 0.2);
      }

      .vp-pill-cam-btn.active svg,
      .vp-pill-cam-btn.is-open svg {
        color: #0071e3;
      }

      .vp-pill-toggle-btn {
        padding: 0 12px;
        border-radius: 14px;
        font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", "PingFang SC", sans-serif !important;
        font-size: 12px;
        font-weight: 550;
        letter-spacing: -0.1px;
        color: #1d1d1f;
      }

      .vp-pill-toggle-btn:hover {
        transform: translateY(-0.5px);
      }

      .vp-pill-toggle-btn.active {
        background: rgba(52, 199, 89, 0.16);
        color: #15803d;
        border-color: rgba(52, 199, 89, 0.35);
        box-shadow: 0 1px 3px rgba(52, 199, 89, 0.15);
      }

      .vp-pill-toggle-btn.active:hover {
        background: rgba(52, 199, 89, 0.24);
        color: #15803d;
      }

      /* 响应式：iPad / 大屏适配，与右下角 touch-controls 严格对齐 */
      @media (pointer: coarse) and (min-width: 768px) {
        #vision-pro-tracking-hud {
          top: calc(24px + env(safe-area-inset-top, 0px));
          right: calc(40px + env(safe-area-inset-right, 0px));
        }
        .vp-hud-pill {
          height: 46px;
          border-radius: 23px;
          padding: 0 8px 0 16px;
          gap: 9px;
        }
        .vp-pill-title {
          font-size: 13.5px;
        }
        .vp-pill-divider {
          height: 18px;
          margin: 0 2px;
        }
        .vp-pill-btn {
          height: 30px;
        }
        .vp-pill-cam-btn {
          width: 30px;
          height: 30px;
          border-radius: 15px;
        }
        .vp-pill-toggle-btn {
          padding: 0 13px;
          border-radius: 15px;
          font-size: 12.5px;
        }
      }

      @media (max-width: 768px) {
        #vision-pro-tracking-hud {
          top: calc(14px + env(safe-area-inset-top, 0px));
          right: calc(16px + env(safe-area-inset-right, 0px));
        }
        .vp-hud-pill {
          height: 40px;
          border-radius: 20px;
          padding: 0 6px 0 11px;
          gap: 6px;
        }
        .vp-pill-title {
          font-size: 12px;
        }
        .vp-pill-cam-btn {
          width: 26px;
          height: 26px;
          border-radius: 13px;
        }
        .vp-pill-toggle-btn {
          height: 26px;
          padding: 0 10px;
          border-radius: 13px;
          font-size: 11.5px;
        }
      }

      /* 画中画摄像头预览浮窗样式 */
      .vp-hud-preview-modal {
        position: absolute;
        top: calc(100% + 12px);
        right: 0;
        width: 380px;
        max-width: calc(100vw - 32px);
        background: radial-gradient(135% 120% at 50% 0%, rgba(20, 26, 38, 0.96) 0%, rgba(10, 14, 22, 0.98) 100%);
        backdrop-filter: blur(40px) saturate(190%);
        -webkit-backdrop-filter: blur(40px) saturate(190%);
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-top: 1px solid rgba(255, 255, 255, 0.28);
        border-radius: 18px;
        overflow: hidden;
        box-shadow: 0 24px 56px rgba(0, 0, 0, 0.62),
                    0 4px 18px rgba(0, 0, 0, 0.35),
                    inset 0 1px 1px rgba(255, 255, 255, 0.2);
        transition: opacity 0.28s cubic-bezier(0.16, 1, 0.3, 1),
                    transform 0.28s cubic-bezier(0.16, 1, 0.3, 1);
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
        padding: 10px 14px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.08);
        background: rgba(255, 255, 255, 0.02);
      }

      .vp-modal-header-left {
        display: flex;
        align-items: center;
        gap: 8px;
        color: #f5f5f7;
        min-width: 0;
      }

      .vp-header-icon-wrap {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 24px;
        height: 24px;
        border-radius: 6px;
        background: rgba(255, 255, 255, 0.06);
        border: 0.5px solid rgba(255, 255, 255, 0.12);
        color: #64d2ff;
        flex-shrink: 0;
      }

      .vp-modal-title {
        font-size: 13px;
        font-weight: 600;
        letter-spacing: -0.2px;
        color: #ffffff;
        white-space: nowrap;
      }

      .vp-offline-tag {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        font-size: 10px;
        font-weight: 500;
        padding: 2px 7px;
        border-radius: 999px;
        background: rgba(48, 209, 88, 0.12);
        color: #30d158;
        border: 0.5px solid rgba(48, 209, 88, 0.32);
        box-shadow: 0 0 10px rgba(48, 209, 88, 0.12);
        white-space: nowrap;
        flex-shrink: 0;
      }

      .vp-tag-dot {
        width: 5px;
        height: 5px;
        border-radius: 50%;
        background: #30d158;
        box-shadow: 0 0 6px #30d158;
        display: inline-block;
      }

      .vp-modal-header-actions {
        display: flex;
        align-items: center;
        gap: 6px;
        flex-shrink: 0;
      }

      .vp-modal-action-btn {
        background: rgba(255, 255, 255, 0.06);
        border: 0.5px solid rgba(255, 255, 255, 0.14);
        color: rgba(255, 255, 255, 0.72);
        cursor: pointer;
        width: 28px;
        height: 28px;
        padding: 0;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        touch-action: manipulation;
        transition: color 0.15s ease, background 0.15s ease, border-color 0.15s ease, transform 0.1s ease;
      }

      .vp-modal-action-btn:hover {
        color: #ffffff;
        background: rgba(255, 255, 255, 0.15);
        border-color: rgba(255, 255, 255, 0.28);
      }

      .vp-modal-action-btn:active {
        transform: scale(0.92);
      }

      .vp-modal-action-btn.active {
        color: #64d2ff;
        background: rgba(10, 132, 255, 0.22);
        border-color: rgba(10, 132, 255, 0.45);
        box-shadow: 0 0 10px rgba(10, 132, 255, 0.25);
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
        background: rgba(10, 132, 255, 0.5);
        color: #ffffff;
        margin-left: 2px;
        font-family: -apple-system, BlinkMacSystemFont, "SF Mono", Menlo, monospace;
      }

      .vp-modal-video-wrap {
        position: relative;
        width: 100%;
        height: 240px;
        background: #000000;
        overflow: hidden;
      }

      .vp-modal-canvas {
        width: 100%;
        height: 100%;
        object-fit: cover;
        display: block;
        transform: translateZ(0);
        -webkit-transform: translateZ(0);
        backface-visibility: hidden;
        -webkit-backface-visibility: hidden;
      }

      /* 底部状态区域：双卡片 + 遥测底栏 */
      .vp-modal-footer {
        display: flex;
        flex-direction: column;
        gap: 8px;
        padding: 10px 12px;
        background: rgba(14, 18, 28, 0.92);
        border-top: 1px solid rgba(255, 255, 255, 0.08);
      }

      .vp-pinch-monitor-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 8px;
      }

      .vp-pinch-monitor-card {
        background: rgba(255, 255, 255, 0.035);
        border: 0.5px solid rgba(255, 255, 255, 0.08);
        border-radius: 8px;
        padding: 7px 10px;
        display: flex;
        flex-direction: column;
        gap: 3px;
        transition: border-color 0.2s ease, background 0.2s ease;
      }

      .vp-card-label {
        display: flex;
        align-items: center;
        gap: 5px;
        font-size: 10px;
        color: rgba(255, 255, 255, 0.5);
        font-weight: 500;
        white-space: nowrap;
      }

      .vp-card-dot {
        width: 5px;
        height: 5px;
        border-radius: 50%;
        flex-shrink: 0;
      }

      .vp-card-dot.left {
        background: #ff9f0a;
      }

      .vp-card-dot.right {
        background: #0a84ff;
      }

      .vp-card-val-wrap {
        display: flex;
        align-items: center;
        min-height: 18px;
      }

      .vp-left-duration-val, .vp-right-duration-val {
        font-family: -apple-system, BlinkMacSystemFont, "SF Mono", Menlo, monospace;
        font-size: 11.5px;
        font-weight: 600;
        color: rgba(255, 255, 255, 0.65);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .vp-left-duration-val.active {
        color: #ff9f0a;
        font-weight: 700;
        text-shadow: 0 0 8px rgba(255, 159, 10, 0.4);
      }

      .vp-right-duration-val.active {
        color: #30d158;
        font-weight: 700;
        text-shadow: 0 0 8px rgba(48, 209, 88, 0.4);
      }

      .vp-pipeline-telemetry {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 5px 10px;
        background: rgba(255, 255, 255, 0.025);
        border-radius: 6px;
        border: 0.5px solid rgba(255, 255, 255, 0.05);
        font-size: 10px;
        font-family: -apple-system, BlinkMacSystemFont, "SF Mono", Menlo, monospace;
      }

      .vp-telem-item {
        display: flex;
        align-items: center;
        gap: 5px;
        white-space: nowrap;
      }

      .vp-telem-label {
        color: rgba(255, 255, 255, 0.45);
      }

      .vp-fps-val, .vp-latency-val, .vp-delegate-val {
        color: #f5f5f7;
        font-weight: 500;
      }

      .vp-delegate-val {
        color: #30d158;
      }

      .vp-telem-divider {
        width: 1px;
        height: 10px;
        background: rgba(255, 255, 255, 0.1);
      }

      /* 捏合时长历史记录列表区域 */
      .vp-pinch-log-section {
        display: flex;
        flex-direction: column;
        background: rgba(12, 16, 24, 0.95);
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
        padding: 8px 12px;
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
        gap: 6px;
        font-weight: 600;
        letter-spacing: -0.1px;
        color: #ffffff;
      }

      .vp-pinch-log-count {
        color: rgba(255, 255, 255, 0.45);
        font-size: 10px;
      }

      .vp-pinch-log-actions {
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .vp-pinch-avg-stat {
        font-size: 9.5px;
        color: rgba(255, 255, 255, 0.6);
        font-family: -apple-system, BlinkMacSystemFont, "SF Mono", Menlo, monospace;
        background: rgba(255, 255, 255, 0.05);
        padding: 1.5px 6px;
        border-radius: 4px;
        border: 0.5px solid rgba(255, 255, 255, 0.08);
      }

      .vp-pinch-clear-btn {
        background: rgba(255, 255, 255, 0.06);
        border: 0.5px solid rgba(255, 255, 255, 0.12);
        border-radius: 4px;
        color: rgba(255, 255, 255, 0.7);
        font-size: 10px;
        padding: 2px 7px;
        cursor: pointer;
        transition: all 0.15s ease;
      }

      .vp-pinch-clear-btn:hover {
        background: rgba(255, 69, 58, 0.18);
        color: #ff453a;
        border-color: rgba(255, 69, 58, 0.4);
      }

      .vp-pinch-log-list {
        max-height: 135px;
        overflow-y: auto;
        padding: 6px 8px;
        display: flex;
        flex-direction: column;
        gap: 4px;
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
        padding: 16px 10px;
        color: rgba(255, 255, 255, 0.35);
        font-size: 10.5px;
        font-style: italic;
      }

      .vp-pinch-log-item {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 5px 9px;
        border-radius: 7px;
        background: rgba(255, 255, 255, 0.03);
        border: 0.5px solid rgba(255, 255, 255, 0.05);
        font-size: 10.5px;
        transition: background 0.12s ease;
      }

      .vp-pinch-log-item:hover {
        background: rgba(255, 255, 255, 0.07);
      }

      .vp-log-item-left {
        display: flex;
        align-items: center;
        gap: 6px;
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
        padding: 1px 5px;
        border-radius: 4px;
        flex-shrink: 0;
      }

      .vp-log-hand-tag.left {
        background: rgba(255, 159, 10, 0.15);
        color: #ff9f0a;
        border: 0.5px solid rgba(255, 159, 10, 0.35);
      }

      .vp-log-hand-tag.right {
        background: rgba(10, 132, 255, 0.15);
        color: #0a84ff;
        border: 0.5px solid rgba(10, 132, 255, 0.35);
      }

      .vp-log-action-tag {
        font-size: 10px;
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
        padding: 1.5px 6px;
        border-radius: 4px;
        white-space: nowrap;
      }

      .vp-log-duration.quick {
        background: rgba(48, 209, 88, 0.12);
        color: #30d158;
        border: 0.5px solid rgba(48, 209, 88, 0.3);
      }

      .vp-log-duration.long {
        background: rgba(255, 159, 10, 0.12);
        color: #ff9f0a;
        border: 0.5px solid rgba(255, 159, 10, 0.3);
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
        background: rgba(8, 12, 20, 0.96) !important;
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

      .vp-hud-preview-modal.fullscreen .vp-modal-footer {
        padding: 12px 32px;
        background: rgba(18, 22, 30, 0.85);
        border-top: 1px solid rgba(255, 255, 255, 0.1);
        display: flex;
        flex-direction: row;
        align-items: center;
        justify-content: space-between;
        gap: 32px;
        flex-shrink: 0;
      }

      .vp-hud-preview-modal.fullscreen .vp-pinch-monitor-grid {
        display: flex;
        gap: 16px;
      }

      .vp-hud-preview-modal.fullscreen .vp-pinch-monitor-card {
        padding: 8px 16px;
        min-width: 160px;
      }

      .vp-hud-preview-modal.fullscreen .vp-pipeline-telemetry {
        padding: 8px 16px;
        gap: 16px;
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
    const pillTitle = this.pillEl.querySelector('.vp-pill-title') as HTMLElement | null;
    const pillDot = this.pillEl.querySelector('.vp-pill-status-dot') as HTMLElement | null;
    const fsBtn = this.previewModalEl.querySelector('.vp-modal-fullscreen-btn') as HTMLButtonElement;
    const closeBtn = this.previewModalEl.querySelector('.vp-modal-close-btn') as HTMLButtonElement;
    const headerEl = this.previewModalEl.querySelector('.vp-modal-header') as HTMLElement;

    // 阻止触摸事件穿透至 3D 场景视角旋转层，确保 iPad 上点击胶囊区域 100% 灵敏响应
    this.pillEl.addEventListener('touchstart', (e) => {
      e.stopPropagation();
    });
    this.previewModalEl.addEventListener('touchstart', (e) => {
      e.stopPropagation();
    });

    let lastToggleTouchAt = 0;
    const handleToggleAction = async () => {
      if (this.isStarting) return;
      if (this.isEnabled) {
        this.disable();
      } else {
        await this.enable();
      }
    };

    toggleBtn.addEventListener('touchend', (e) => {
      e.preventDefault();
      e.stopPropagation();
      lastToggleTouchAt = Date.now();
      void handleToggleAction();
    });

    toggleBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (Date.now() - lastToggleTouchAt < 450) return;
      void handleToggleAction();
    });

    // 允许点击胶囊左侧“手势交互”文本或状态指示圆点直接切换手势开关（扩大 iPad 触控热区）
    const bindPillLabelTap = (el: HTMLElement | null) => {
      if (!el) return;
      el.style.cursor = 'pointer';
      el.addEventListener('touchend', (e) => {
        e.preventDefault();
        e.stopPropagation();
        lastToggleTouchAt = Date.now();
        void handleToggleAction();
      });
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        if (Date.now() - lastToggleTouchAt < 450) return;
        void handleToggleAction();
      });
    };
    bindPillLabelTap(pillTitle);
    bindPillLabelTap(pillDot);

    let lastCamTouchAt = 0;
    camBtn.addEventListener('touchend', (e) => {
      e.preventDefault();
      e.stopPropagation();
      lastCamTouchAt = Date.now();
      this.togglePreview();
    });

    camBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (Date.now() - lastCamTouchAt < 450) return;
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

    this.logToggleBtn?.addEventListener('click', (e) => {
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
    if (this.isStarting) return;
    const toggleBtn = this.pillEl.querySelector('.vp-pill-toggle-btn') as HTMLButtonElement;
    const dot = this.pillEl.querySelector('.vp-pill-status-dot') as HTMLElement;

    this.isStarting = true;
    try {
      dot.className = 'vp-pill-status-dot loading';
      toggleBtn.textContent = '启动中...';
      await this.service.start();
      this.isEnabled = true;
      toggleBtn.textContent = '关闭';
      toggleBtn.classList.add('active');
      dot.className = 'vp-pill-status-dot active';
      this.pillEl.classList.add('is-active');
      if (this.isPreviewOpen) {
        this.startPreviewRenderLoop();
      }
    } catch (err) {
      console.error('[HandTrackingHUD] Enable failed:', err);
      dot.className = 'vp-pill-status-dot error';
      this.pillEl.classList.remove('is-active');
      toggleBtn.textContent = '重试';
      toggleBtn.classList.remove('active');
      this.isEnabled = false;
    } finally {
      this.isStarting = false;
    }
  }

  public disable(): void {
    const toggleBtn = this.pillEl.querySelector('.vp-pill-toggle-btn') as HTMLButtonElement;
    const dot = this.pillEl.querySelector('.vp-pill-status-dot') as HTMLElement;

    this.stopPreviewRenderLoop();
    this.resetNativePreviewBuffer();
    this.service.stop();
    this.isEnabled = false;
    toggleBtn.textContent = '开启';
    toggleBtn.classList.remove('active');
    dot.className = 'vp-pill-status-dot';
    this.pillEl.classList.remove('is-active');
  }

  private resetNativePreviewBuffer(): void {
    this.readyNativePreviewImage = null;
    this.decodingNativeImageSrc = '';
    this.queuedNativeImageSrc = '';
    this.lastDecodedNativeImageSrc = '';
  }

  /**
   * 后台双缓冲异步解码原生 JPEG 帧：绝不直接覆盖正在屏幕上渲染的 HTMLImageElement.src，
   * 仅在新 Image 离屏解码 100% 完成后原子交换 readyNativePreviewImage，彻底消除 20~30Hz 闪烁。
   */
  private scheduleNativePreviewDecode(src: string): void {
    if (!src || this.isDestroyed) return;
    if (src === this.lastDecodedNativeImageSrc || src === this.decodingNativeImageSrc) {
      return;
    }
    if (this.decodingNativeImageSrc !== '') {
      // 合并中间帧，仅保留最新到达的一帧，零队列积压
      this.queuedNativeImageSrc = src;
      return;
    }
    if (typeof Image === 'undefined') return;

    this.decodingNativeImageSrc = src;
    const stagingImg = new Image();
    stagingImg.decoding = 'async';

    let settled = false;
    const finalize = (ok: boolean) => {
      if (settled) return;
      settled = true;

      if (ok && !this.isDestroyed && stagingImg.naturalWidth > 0) {
        this.readyNativePreviewImage = stagingImg;
        this.lastDecodedNativeImageSrc = src;
      }
      this.decodingNativeImageSrc = '';

      if (
        !this.isDestroyed &&
        this.queuedNativeImageSrc &&
        this.queuedNativeImageSrc !== this.lastDecodedNativeImageSrc
      ) {
        const nextSrc = this.queuedNativeImageSrc;
        this.queuedNativeImageSrc = '';
        this.scheduleNativePreviewDecode(nextSrc);
      } else {
        this.queuedNativeImageSrc = '';
      }
    };

    const onLoaded = () => {
      if (settled) return;
      if (typeof stagingImg.decode === 'function') {
        stagingImg.decode().then(
          () => finalize(true),
          () => finalize(stagingImg.naturalWidth > 0)
        );
      } else {
        finalize(true);
      }
    };

    stagingImg.onload = onLoaded;
    stagingImg.onerror = () => finalize(false);
    stagingImg.src = src;

    if (stagingImg.complete && stagingImg.naturalWidth > 0) {
      onLoaded();
    }
  }

  public togglePreview(forceOpen?: boolean): void {
    this.isPreviewOpen = forceOpen !== undefined ? forceOpen : !this.isPreviewOpen;
    const camBtn = this.pillEl.querySelector('.vp-pill-cam-btn') as HTMLButtonElement | null;
    if (this.isPreviewOpen) {
      camBtn?.classList.add('active', 'is-open');
      this.previewModalEl.classList.remove('hidden');
      const latestImg = this.service.getLastFrameImage();
      if (latestImg) {
        this.scheduleNativePreviewDecode(latestImg);
      }
      if (this.isFullscreen) {
        this.updateFullscreenCanvasSize();
      }
      this.startPreviewRenderLoop();
    } else {
      camBtn?.classList.remove('active', 'is-open');
      this.stopPreviewRenderLoop();
      if (this.isFullscreen) {
        this.toggleFullscreen(false);
      }
      this.previewModalEl.classList.add('hidden');
    }
  }

  private startPreviewRenderLoop(): void {
    if (this.previewAnimFrameId !== null || typeof requestAnimationFrame !== 'function') return;
    this.lastPreviewRenderAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const loop = () => {
      if (this.isDestroyed || !this.isPreviewOpen) {
        this.previewAnimFrameId = null;
        return;
      }
      const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
      const dtSec = Math.max(0.001, Math.min(0.05, (now - this.lastPreviewRenderAt) / 1000));
      this.lastPreviewRenderAt = now;
      if (this.lastFrame || this.service.getLastFrameImage()) {
        this.renderPreviewCanvas(this.lastFrame, dtSec);
      }
      this.previewAnimFrameId = requestAnimationFrame(loop);
    };
    this.previewAnimFrameId = requestAnimationFrame(loop);
  }

  private stopPreviewRenderLoop(): void {
    if (this.previewAnimFrameId !== null && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(this.previewAnimFrameId);
    }
    this.previewAnimFrameId = null;
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
      this.previewCanvas.width = 380;
      this.previewCanvas.height = 240;
    }
  }

  public updateFullscreenCanvasSize(): void {
    if (!this.isFullscreen) return;
    const video = this.service.getVideoElement();
    const nativeImg = this.readyNativePreviewImage;
    const vw =
      video && video.videoWidth > 0
        ? video.videoWidth
        : nativeImg && nativeImg.naturalWidth > 0
          ? nativeImg.naturalWidth * 2
          : 1280;
    const vh =
      video && video.videoHeight > 0
        ? video.videoHeight
        : nativeImg && nativeImg.naturalHeight > 0
          ? nativeImg.naturalHeight * 2
          : 720;
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
    const toggleBtn = this.pillEl.querySelector('.vp-pill-toggle-btn') as HTMLButtonElement | null;
    const fpsVal = this.previewModalEl.querySelector('.vp-fps-val') as HTMLElement;
    const latencyVal = this.previewModalEl.querySelector('.vp-latency-val') as HTMLElement;
    const delegateVal = this.previewModalEl.querySelector('.vp-delegate-val') as HTMLElement | null;
    const offlineTag = this.previewModalEl.querySelector('.vp-offline-tag') as HTMLElement | null;
    const ratioVal = this.previewModalEl.querySelector('.vp-ratio-val') as HTMLElement | null;

    this.service.onStatusChange((telemetry: TrackerTelemetry) => {
      if (telemetry.status === 'running') {
        dot.className = 'vp-pill-status-dot active';
        this.isEnabled = true;
        this.pillEl.classList.add('is-active');
        if (toggleBtn) {
          toggleBtn.textContent = '关闭';
          toggleBtn.classList.add('active');
        }
      } else if (telemetry.status === 'loading') {
        dot.className = 'vp-pill-status-dot loading';
      } else if (telemetry.status === 'error') {
        dot.className = 'vp-pill-status-dot error';
        this.isEnabled = false;
        this.pillEl.classList.remove('is-active');
        if (toggleBtn) {
          toggleBtn.textContent = '重试';
          toggleBtn.classList.remove('active');
        }
      } else {
        dot.className = 'vp-pill-status-dot';
        if (!this.isStarting) {
          this.isEnabled = false;
          this.pillEl.classList.remove('is-active');
          if (toggleBtn) {
            toggleBtn.textContent = '开启';
            toggleBtn.classList.remove('active');
          }
        }
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

      const isAppleVision = Boolean(telemetry.isAppleVision || telemetry.delegate === 'Apple Vision (ANE)');
      if (offlineTag) {
        const tagKey = isAppleVision ? 'apple-vision' : 'mediapipe';
        if (this.cachedBackendTag !== tagKey) {
          this.cachedBackendTag = tagKey;
          offlineTag.innerHTML = isAppleVision
            ? '<span class="vp-tag-dot"></span>Apple Vision ANE'
            : '<span class="vp-tag-dot"></span>离线 MediaPipe';
        }
      }

      if (delegateVal && telemetry.delegate) {
        const delText = isAppleVision
          ? 'ANE'
          : telemetry.delegate === 'GPU'
            ? 'GPU'
            : telemetry.delegate === 'CPU'
              ? 'CPU (降级)'
              : '-';
        if (delegateVal.textContent !== delText) {
          delegateVal.textContent = delText;
          delegateVal.style.color =
            isAppleVision || telemetry.delegate === 'GPU'
              ? '#30d158'
              : telemetry.delegate === 'CPU'
                ? '#ff9f0a'
                : 'inherit';
        }
      }
    });

    this.service.onFrame((frame: HandGestureFrame) => {
      this.lastFrame = frame;

      // 更新左手交互状态
      if (frame.leftHand) {
        const dur = Math.round(frame.leftHand.pinchDuration);
        if (frame.leftHand.isPinching) {
          const badgeTxt = `${dur} ms`;
          if (this.cachedLeftDur !== badgeTxt) {
            this.cachedLeftDur = badgeTxt;
            this.leftDurationVal.textContent = badgeTxt;
          }
          if (this.cachedLeftDurClass !== 'vp-left-duration-val active') {
            this.cachedLeftDurClass = 'vp-left-duration-val active';
            this.leftDurationVal.className = 'vp-left-duration-val active';
          }
        } else {
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
          const badgeTxt = `${dur} ms`;
          if (this.cachedRightDur !== badgeTxt) {
            this.cachedRightDur = badgeTxt;
            this.rightDurationVal.textContent = badgeTxt;
          }
          if (this.cachedRightDurClass !== 'vp-right-duration-val active') {
            this.cachedRightDurClass = 'vp-right-duration-val active';
            this.rightDurationVal.className = 'vp-right-duration-val active';
          }
        } else {
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
      }

      if (this.isPreviewOpen) {
        const latestImg = this.service.getLastFrameImage();
        if (latestImg) {
          this.scheduleNativePreviewDecode(latestImg);
        }
        this.startPreviewRenderLoop();
        if (this.previewAnimFrameId === null) {
          this.renderPreviewCanvas(frame, 0);
        }
      }
    });
  }

  /**
   * 渲染水平镜像的摄像头画面，并叠加绘制双手骨骼拓扑结构与捏合指示器。
   * 结合前向速度外推算法与 60 FPS 指数阻尼平滑插值（Lerp），使 20 FPS 的骨骼关键点
   * 在 60 FPS 画布上呈现丝滑跟手效果，并通过批量批处理 Canvas2D 绘制调用实现极致高帧率。
   */
  private renderPreviewCanvas(frame: HandGestureFrame | null, dtSec = 0): void {
    const video = this.service.getVideoElement();
    const nativeFrameSrc = this.service.getLastFrameImage();
    const ctx = this.previewCtx;
    const w = this.previewCanvas.width;
    const h = this.previewCanvas.height;

    if (nativeFrameSrc) {
      this.scheduleNativePreviewDecode(nativeFrameSrc);
    }

    // 注意：此处严禁预先调用 clearRect 将画布清空为透明通道！
    // 每个分支均全屏不透明覆盖绘制 (0, 0, w, h)，避免 WebKit 合成器与毛玻璃背景层发生半透明闪动。
    if (video && video.readyState >= 2) {
      ctx.save();
      ctx.translate(w, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(video, 0, 0, w, h);
      ctx.restore();
    } else if (this.readyNativePreviewImage && this.readyNativePreviewImage.naturalWidth > 0) {
      ctx.save();
      ctx.translate(w, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(this.readyNativePreviewImage, 0, 0, w, h);
      ctx.restore();
    } else {
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#64748b';
      ctx.font = '11px -apple-system, sans-serif';
      ctx.textAlign = 'center';
      const isAppleVision = this.service.getTelemetry().isAppleVision;
      if (isAppleVision) {
        ctx.fillText('Apple Vision ANE 原生神经加速', w / 2, h / 2);
      } else {
        ctx.fillText('等待前置摄像头画面...', w / 2, h / 2);
        return;
      }
    }

    if (!frame) return;

    const handsToRender: {
      data: SingleHandData;
      label: string;
      handKey: string;
      accentDotColor: string;
    }[] = [];

    if (frame.leftHand && frame.leftHand.landmarks && frame.leftHand.landmarks.length >= 21) {
      handsToRender.push({
        data: frame.leftHand,
        label: '左手',
        handKey: 'left',
        accentDotColor: '#ff9f0a', // Apple systemOrange
      });
    } else {
      this.prevHandLandmarks.delete('left');
      this.targetHandLandmarks.delete('left');
      this.smoothedHandLandmarks.delete('left');
      this.smoothedPinchRadius.delete('left');
    }

    if (frame.rightHand && frame.rightHand.landmarks && frame.rightHand.landmarks.length >= 21) {
      handsToRender.push({
        data: frame.rightHand,
        label: '右手',
        handKey: 'right',
        accentDotColor: '#30d158', // Apple systemGreen
      });
    } else {
      this.prevHandLandmarks.delete('right');
      this.targetHandLandmarks.delete('right');
      this.smoothedHandLandmarks.delete('right');
      this.smoothedPinchRadius.delete('right');
    }

    // 兜底保障：当单手未分离到 leftHand/rightHand，但 frame.landmarks 包含有效骨骼关键点时
    if (handsToRender.length === 0 && frame.landmarks && frame.landmarks.length >= 21) {
      handsToRender.push({
        data: {
          landmarks: frame.landmarks,
          isPinching: frame.isPinching,
          interactionPointNorm: frame.interactionPointNorm ?? frame.midpointNorm ?? undefined,
        } as any,
        label: '右手',
        handKey: 'primary',
        accentDotColor: '#30d158',
      });
    }

    if (handsToRender.length === 0) {
      this.prevHandLandmarks.clear();
      this.targetHandLandmarks.clear();
      this.smoothedHandLandmarks.clear();
      this.smoothedPinchRadius.clear();
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
    const isAppleVision = Boolean(
      typeof this.service.isAppleVision === 'function'
        ? this.service.isAppleVision()
        : this.service.getTelemetry?.()?.isAppleVision
    );
    const latencyCompensationMs = isAppleVision
      ? Math.min(Math.max(this.service.getTelemetry?.()?.latencyMs ?? 4, 2), 10)
      : Math.min(Math.max(this.service.getTelemetry?.()?.latencyMs ?? 15, 10), 50);

    const isValidHudPoint = (p: NormalizedLandmark | undefined | null): boolean => {
      if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) return false;
      // 适度放宽视口边界容差至 [-0.25, 1.25]，防止手掌贴近镜头时边缘手腕与指尖被误过滤
      if (p.x < -0.25 || p.x > 1.25 || p.y < -0.25 || p.y > 1.25) return false;
      if ((p.x === 0 && p.y === 0) || (p.x === 1 && p.y === 0)) return false;
      if (p.x === -1 && p.y === -1) return false;
      return true;
    };

    for (const hand of handsToRender) {
      const rawLms = hand.data.landmarks;
      if (!rawLms || rawLms.length < 21) continue;
      const prev = this.prevHandLandmarks.get(hand.handKey);
      let targetLms = this.targetHandLandmarks.get(hand.handKey) ?? rawLms;

      // 视觉延迟前向外推补偿：严禁将无效负坐标 (-1, -1) 钳制到 (0, 0) 右上角！
      if (!prev || frame.timestamp > prev.timestamp) {
        if (prev && frame.timestamp > prev.timestamp) {
          const dt = Math.max(frame.timestamp - prev.timestamp, 1);
          const maxFactor = isAppleVision ? 0.35 : 1.2;
          const factor = Math.min(latencyCompensationMs / dt, maxFactor);
          targetLms = rawLms.map((p, idx) => {
            if (!isValidHudPoint(p)) {
              return { x: -1, y: -1, z: 0, visibility: 0 };
            }
            const prevP = prev.lms[idx];
            if (!isValidHudPoint(prevP)) {
              return { x: p.x, y: p.y, z: p.z, visibility: p.visibility };
            }
            const vx = (p.x - prevP.x) * factor;
            const vy = (p.y - prevP.y) * factor;
            return {
              x: Math.max(-0.2, Math.min(1.2, p.x + vx)),
              y: Math.max(-0.2, Math.min(1.2, p.y + vy)),
              z: p.z,
              visibility: p.visibility,
            };
          });
        } else {
          targetLms = rawLms.map((p) =>
            isValidHudPoint(p)
              ? { x: p.x, y: p.y, z: p.z, visibility: p.visibility }
              : { x: -1, y: -1, z: 0, visibility: 0 }
          );
        }
        this.prevHandLandmarks.set(hand.handKey, { lms: rawLms, timestamp: frame.timestamp });
        this.targetHandLandmarks.set(hand.handKey, targetLms);
      }

      // 60 FPS 恒定时间步长指数阻尼平滑（Lerp）：将 20 FPS 骨骼关键点平滑过渡至 60 FPS
      const prevSmoothed = this.smoothedHandLandmarks.get(hand.handKey);
      let lms: NormalizedLandmark[];
      if (prevSmoothed && prevSmoothed.length === targetLms.length && dtSec > 0) {
        const lerpAlpha = 1 - Math.exp(-32 * dtSec);
        lms = prevSmoothed.map((cur, idx) => {
          const tgt = targetLms[idx];
          if (!isValidHudPoint(tgt)) {
            return { x: -1, y: -1, z: 0, visibility: 0 };
          }
          if (!isValidHudPoint(cur)) {
            return { x: tgt.x, y: tgt.y, z: tgt.z, visibility: tgt.visibility };
          }
          return {
            x: cur.x + (tgt.x - cur.x) * lerpAlpha,
            y: cur.y + (tgt.y - cur.y) * lerpAlpha,
            z: cur.z + (tgt.z - cur.z) * lerpAlpha,
            visibility: tgt.visibility,
          };
        });
      } else {
        lms = targetLms.map((p) =>
          isValidHudPoint(p)
            ? { x: p.x, y: p.y, z: p.z, visibility: p.visibility }
            : { x: -1, y: -1, z: 0, visibility: 0 }
        );
      }
      this.smoothedHandLandmarks.set(hand.handKey, lms);

      // 1. 经典 Apple Vision 极简素雅珍珠白骨骼连线（柔和暗影景深 + 纯净透亮珍珠白核心）
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      // 1.1 柔和暗影底层（在强光与复杂背景下提供自然的光学景深反差）
      ctx.lineWidth = Math.round(3.2 * scale);
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.36)';
      ctx.beginPath();
      for (let c = 0; c < CONNECTIONS.length; c++) {
        const [i, j] = CONNECTIONS[c];
        const p1 = lms[i];
        const p2 = lms[j];
        if (!isValidHudPoint(p1) || !isValidHudPoint(p2)) continue;
        if (Math.hypot(p1.x - p2.x, p1.y - p2.y) > 0.85) continue;
        const x1 = Math.max(0, Math.min(w, (1.0 - p1.x) * w));
        const y1 = Math.max(0, Math.min(h, p1.y * h));
        const x2 = Math.max(0, Math.min(w, (1.0 - p2.x) * w));
        const y2 = Math.max(0, Math.min(h, p2.y * h));
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
      }
      ctx.stroke();

      // 1.2 苹果原生素雅半透珍珠白核心骨骼线
      ctx.lineWidth = Math.round(1.8 * scale);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.88)';
      ctx.beginPath();
      for (let c = 0; c < CONNECTIONS.length; c++) {
        const [i, j] = CONNECTIONS[c];
        const p1 = lms[i];
        const p2 = lms[j];
        if (!isValidHudPoint(p1) || !isValidHudPoint(p2)) continue;
        if (Math.hypot(p1.x - p2.x, p1.y - p2.y) > 0.85) continue;
        const x1 = Math.max(0, Math.min(w, (1.0 - p1.x) * w));
        const y1 = Math.max(0, Math.min(h, p1.y * h));
        const x2 = Math.max(0, Math.min(w, (1.0 - p2.x) * w));
        const y2 = Math.max(0, Math.min(h, p2.y * h));
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
      }
      ctx.stroke();

      // 2. 绘制拇指 (4) 与食指 (8) 之间的动态捏合指示（苹果 visionOS 标准反馈）
      const thumb = lms[4];
      const index = lms[8];
      if (isValidHudPoint(thumb) && isValidHudPoint(index)) {
        const tx = Math.max(0, Math.min(w, (1.0 - thumb.x) * w));
        const ty = Math.max(0, Math.min(h, thumb.y * h));
        const ix = Math.max(0, Math.min(w, (1.0 - index.x) * w));
        const iy = Math.max(0, Math.min(h, index.y * h));

        if (hand.data.isPinching) {
          // 捏合态：苹果系统绿 (#30d158) 光晕与核心激光线
          ctx.beginPath();
          ctx.lineWidth = Math.round(4.0 * scale);
          ctx.strokeStyle = 'rgba(48, 209, 88, 0.38)';
          ctx.moveTo(tx, ty);
          ctx.lineTo(ix, iy);
          ctx.stroke();

          ctx.beginPath();
          ctx.lineWidth = Math.round(2.2 * scale);
          ctx.strokeStyle = '#30d158';
          ctx.moveTo(tx, ty);
          ctx.lineTo(ix, iy);
          ctx.stroke();
        } else {
          // 未捏合态：优雅半透明微白导线
          ctx.beginPath();
          ctx.lineWidth = Math.round(2.6 * scale);
          ctx.strokeStyle = 'rgba(0, 0, 0, 0.28)';
          ctx.moveTo(tx, ty);
          ctx.lineTo(ix, iy);
          ctx.stroke();

          ctx.beginPath();
          ctx.lineWidth = Math.round(1.4 * scale);
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
          ctx.moveTo(tx, ty);
          ctx.lineTo(ix, iy);
          ctx.stroke();
        }
      }

      // 3. 批量绘制标准关节点（苹果 visionOS 珍珠光感微盘）
      const rJointDepth = 3.2 * scale;
      const rJointFrosted = 2.4 * scale;
      const rJointCore = 1.5 * scale;

      // 3.1 柔和暗影层
      ctx.fillStyle = 'rgba(0, 0, 0, 0.32)';
      ctx.beginPath();
      for (let i = 0; i < lms.length; i++) {
        if (i !== 4 && i !== 8 && isValidHudPoint(lms[i])) {
          const px = Math.max(0, Math.min(w, (1.0 - lms[i].x) * w));
          const py = Math.max(0, Math.min(h, lms[i].y * h));
          ctx.moveTo(px + rJointDepth, py);
          ctx.arc(px, py, rJointDepth, 0, 2 * Math.PI);
        }
      }
      ctx.fill();

      // 3.2 毛玻璃半透光圈
      ctx.fillStyle = 'rgba(255, 255, 255, 0.38)';
      ctx.beginPath();
      for (let i = 0; i < lms.length; i++) {
        if (i !== 4 && i !== 8 && isValidHudPoint(lms[i])) {
          const px = Math.max(0, Math.min(w, (1.0 - lms[i].x) * w));
          const py = Math.max(0, Math.min(h, lms[i].y * h));
          ctx.moveTo(px + rJointFrosted, py);
          ctx.arc(px, py, rJointFrosted, 0, 2 * Math.PI);
        }
      }
      ctx.fill();

      // 3.3 纯白高光微核
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      for (let i = 0; i < lms.length; i++) {
        if (i !== 4 && i !== 8 && isValidHudPoint(lms[i])) {
          const px = Math.max(0, Math.min(w, (1.0 - lms[i].x) * w));
          const py = Math.max(0, Math.min(h, lms[i].y * h));
          ctx.moveTo(px + rJointCore, py);
          ctx.arc(px, py, rJointCore, 0, 2 * Math.PI);
        }
      }
      ctx.fill();

      // 4. 批量绘制关键指尖交互末端（拇指与食指）
      if (isValidHudPoint(thumb) && isValidHudPoint(index)) {
        const tpx = Math.max(0, Math.min(w, (1.0 - thumb.x) * w));
        const tpy = Math.max(0, Math.min(h, thumb.y * h));
        const ipx = Math.max(0, Math.min(w, (1.0 - index.x) * w));
        const ipy = Math.max(0, Math.min(h, index.y * h));

        if (hand.data.isPinching) {
          // 捏合激活：Apple 系统绿视觉反馈
          const rTipHalo = 5.4 * scale;
          const rTipCore = 3.6 * scale;
          const rTipSpecular = 1.4 * scale;

          ctx.fillStyle = 'rgba(48, 209, 88, 0.42)';
          ctx.beginPath();
          ctx.moveTo(tpx + rTipHalo, tpy);
          ctx.arc(tpx, tpy, rTipHalo, 0, 2 * Math.PI);
          ctx.moveTo(ipx + rTipHalo, ipy);
          ctx.arc(ipx, ipy, rTipHalo, 0, 2 * Math.PI);
          ctx.fill();

          ctx.fillStyle = '#30d158';
          ctx.beginPath();
          ctx.moveTo(tpx + rTipCore, tpy);
          ctx.arc(tpx, tpy, rTipCore, 0, 2 * Math.PI);
          ctx.moveTo(ipx + rTipCore, ipy);
          ctx.arc(ipx, ipy, rTipCore, 0, 2 * Math.PI);
          ctx.fill();

          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.moveTo(tpx + rTipSpecular, tpy);
          ctx.arc(tpx, tpy, rTipSpecular, 0, 2 * Math.PI);
          ctx.moveTo(ipx + rTipSpecular, ipy);
          ctx.arc(ipx, ipy, rTipSpecular, 0, 2 * Math.PI);
          ctx.fill();
        } else {
          // 悬停就绪：素雅透亮珍珠圆盘
          const rTipDepth = 4.4 * scale;
          const rTipFrosted = 3.4 * scale;
          const rTipCore = 2.0 * scale;

          ctx.fillStyle = 'rgba(0, 0, 0, 0.32)';
          ctx.beginPath();
          ctx.moveTo(tpx + rTipDepth, tpy);
          ctx.arc(tpx, tpy, rTipDepth, 0, 2 * Math.PI);
          ctx.moveTo(ipx + rTipDepth, ipy);
          ctx.arc(ipx, ipy, rTipDepth, 0, 2 * Math.PI);
          ctx.fill();

          ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
          ctx.beginPath();
          ctx.moveTo(tpx + rTipFrosted, tpy);
          ctx.arc(tpx, tpy, rTipFrosted, 0, 2 * Math.PI);
          ctx.moveTo(ipx + rTipFrosted, ipy);
          ctx.arc(ipx, ipy, rTipFrosted, 0, 2 * Math.PI);
          ctx.fill();

          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.moveTo(tpx + rTipCore, tpy);
          ctx.arc(tpx, tpy, rTipCore, 0, 2 * Math.PI);
          ctx.moveTo(ipx + rTipCore, ipy);
          ctx.arc(ipx, ipy, rTipCore, 0, 2 * Math.PI);
          ctx.fill();
        }
      }

      // 5. 苹果 visionOS 极简毛玻璃药丸徽标（手腕基准点，SF Pro 字体）
      const wrist = lms[0];
      const middleMcp = lms[9];
      const anchor = isValidHudPoint(wrist) ? wrist : isValidHudPoint(middleMcp) ? middleMcp : null;
      if (anchor) {
        const lx = Math.max(28 * scale, Math.min(w - 28 * scale, (1.0 - anchor.x) * w));
        const ly = Math.max(16 * scale, Math.min(h - 10 * scale, anchor.y * h + 18 * scale));

        ctx.save();
        ctx.font = `500 ${Math.round(10 * scale)}px -apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif`;
        const textW = ctx.measureText(hand.label).width;
        const dotR = 2.2 * scale;
        const dotGap = 5 * scale;
        const padX = 8 * scale;
        const padY = 3.5 * scale;
        const contentW = dotR * 2 + dotGap + textW;
        const badgeW = contentW + padX * 2;
        const badgeH = 15 * scale + padY * 2;
        const badgeX = lx - badgeW / 2;
        const badgeY = ly - badgeH / 2;

        // 苹果极薄深色材质底衬（Apple dark materials capsule）
        ctx.fillStyle = 'rgba(28, 28, 30, 0.72)';
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
        ctx.lineWidth = 0.5 * scale;
        ctx.beginPath();
        if (typeof (ctx as any).roundRect === 'function') {
          (ctx as any).roundRect(badgeX, badgeY, badgeW, badgeH, 7 * scale);
        } else {
          ctx.rect(badgeX, badgeY, badgeW, badgeH);
        }
        ctx.fill();
        ctx.stroke();

        // 状态指示圆点
        const dotX = badgeX + padX + dotR;
        const dotY = ly;
        ctx.fillStyle = hand.data.isPinching ? '#30d158' : hand.accentDotColor;
        ctx.beginPath();
        ctx.arc(dotX, dotY, dotR, 0, 2 * Math.PI);
        ctx.fill();

        // 标签文字（SF Pro Text 纯净柔白）
        ctx.fillStyle = '#f5f5f7';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(hand.label, dotX + dotR + dotGap, ly);
        ctx.restore();
      }
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
    if (this.logSectionEl) {
      if (this.isLogPanelOpen) {
        this.logSectionEl.classList.remove('collapsed');
      } else {
        this.logSectionEl.classList.add('collapsed');
      }
    }
    if (this.logToggleBtn) {
      if (this.isLogPanelOpen) {
        this.logToggleBtn.classList.add('active');
      } else {
        this.logToggleBtn.classList.remove('active');
      }
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
    this.isDestroyed = true;
    this.stopPreviewRenderLoop();
    this.resetNativePreviewBuffer();
    if (this.pillResizeObserver) {
      this.pillResizeObserver.disconnect();
      this.pillResizeObserver = null;
    }
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
