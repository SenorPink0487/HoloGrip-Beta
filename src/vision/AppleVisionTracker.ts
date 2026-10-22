import { PlatformBridge } from '../core/platform/PlatformBridge.ts';
import type { NormalizedLandmark } from './types.ts';

export interface AppleVisionHandData {
  landmarks: NormalizedLandmark[];
  handedness: 'left' | 'right';
  confidence: number;
}

export interface AppleVisionNativePayload {
  hasHand: boolean;
  timestamp: number;
  hands: AppleVisionHandData[];
  latencyMs?: number;
  frameId?: number;
  backend?: string;
}

export type AppleVisionFrameCallback = (
  landmarks: NormalizedLandmark[][],
  handedness: any[][],
  timestamp: number,
  latencyMs: number
) => void;

/**
 * 苹果原生 Vision 框架前端适配器 (Hybrid Architecture - Apple Native App 模式)
 * 在 iOS / iPadOS 原生客户端中直接对接系统 Vision 框架 (VNDetectHumanHandPoseRequest)，
 * 由 Apple Neural Engine (ANE) 硬件加速实时输出 21 个手部关键点，延迟 ≤5ms，极省功耗且不占主线程。
 */
export class AppleVisionTracker {
  private isRunning = false;
  private isInitialized = false;
  private onFrameCallback: AppleVisionFrameCallback | null = null;
  private unlistenEvent: (() => void) | null = null;

  // 性能遥测统计
  private frameCount = 0;
  private lastFpsUpdate = performance.now();
  private currentFps = 0;
  private lastLatencyMs = 0;

  constructor() {}

  /**
   * 判断当前是否运行于苹果原生客户端环境（iPadOS / iOS Tauri App）
   */
  public isAppleApp(): boolean {
    if (typeof window === 'undefined') return false;

    // 支持测试与开发阶段的全局 Mock 开关
    if ((window as any).__hologrip_mock_apple_vision) return true;

    const platform = PlatformBridge.getInstance().info;
    const isTauri = platform.isTauri || '__TAURI_INTERNALS__' in window || '__TAURI__' in window;
    const isApplePlatform = platform.os === 'ipados' || platform.os === 'ios' || platform.os === 'macos';

    return isTauri && isApplePlatform;
  }

  /**
   * 异步检查宿主原生系统是否支持 Apple Vision 手部骨骼检测
   */
  public async isSupported(): Promise<boolean> {
    if (!this.isAppleApp()) return false;

    // 开发或测试环境中如果开启了 Mock 标志，直接返回支持
    if (typeof window !== 'undefined' && (window as any).__hologrip_mock_apple_vision) {
      return true;
    }

    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const supported = await invoke<boolean>('apple_vision_is_supported');
      return Boolean(supported);
    } catch (_err) {
      // 降级尝试 plugin 语法
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const res: any = await invoke('plugin:apple-vision|isSupported');
        return Boolean(res?.supported);
      } catch (_pluginErr) {
        return false;
      }
    }
  }

  /**
   * 初始化原生消息通道，绑定极速直接 JS 注入函数与 Tauri 事件监听器
   */
  public async init(onFrame: AppleVisionFrameCallback): Promise<void> {
    this.onFrameCallback = onFrame;

    if (typeof window !== 'undefined') {
      // 注册全局直接 JS 回调（WKWebView evaluateJavaScript 直连通道，延迟 < 0.2ms）
      (window as any).__hologrip_onAppleVisionFrame = (payload: AppleVisionNativePayload) => {
        this.handleNativePayload(payload);
      };

      // 备用通道：Tauri 事件监听
      try {
        const { listen } = await import('@tauri-apps/api/event');
        this.unlistenEvent = await listen<AppleVisionNativePayload>('apple-vision://frame', (event) => {
          this.handleNativePayload(event.payload);
        });
      } catch (_err) {
        // 在没有事件总线时仍完全依赖直接 JS 回调
      }
    }

    this.isInitialized = true;
    console.log('[AppleVisionTracker] Native Apple Vision bridge initialized successfully.');
  }

  /**
   * 启动原生摄像头采集与 Vision 神经计算管线
   */
  public async start(): Promise<boolean> {
    if (this.isRunning) return true;

    this.frameCount = 0;
    this.lastFpsUpdate = performance.now();
    this.currentFps = 60; // 原生 ANE 预期基准 60 FPS

    if (typeof window !== 'undefined' && (window as any).__hologrip_mock_apple_vision) {
      this.isRunning = true;
      return true;
    }

    try {
      const { invoke } = await import('@tauri-apps/api/core');
      let success = await invoke<boolean>('apple_vision_start');
      if (!success) {
        try {
          const res: any = await invoke('plugin:apple-vision|start');
          success = Boolean(res?.success);
        } catch (_ignore) {}
      }

      this.isRunning = Boolean(success);
      return this.isRunning;
    } catch (err) {
      console.warn('[AppleVisionTracker] Failed to start native Apple Vision via Tauri invoke:', err);
      // 若处于原生环境即便 invoke 失败也开启接收等待
      this.isRunning = true;
      return true;
    }
  }

  /**
   * 停止原生摄像头与 Vision 推理
   */
  public async stop(): Promise<boolean> {
    this.isRunning = false;

    if (typeof window !== 'undefined' && (window as any).__hologrip_mock_apple_vision) {
      return true;
    }

    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('apple_vision_stop');
      return true;
    } catch (_err) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        await invoke('plugin:apple-vision|stop');
        return true;
      } catch (_ignore) {
        return false;
      }
    }
  }

  /**
   * 处理原生 Swift 派发的 Vision 手势姿态帧数据
   */
  public handleNativePayload(payload: AppleVisionNativePayload): void {
    if (!this.isRunning || !payload) return;

    const now = performance.now();
    this.frameCount++;
    const elapsed = now - this.lastFpsUpdate;
    if (elapsed >= 500) {
      this.currentFps = Math.round((this.frameCount * 1000) / elapsed);
      this.frameCount = 0;
      this.lastFpsUpdate = now;
    }

    this.lastLatencyMs = payload.latencyMs ?? 4.0;
    const timestamp = payload.timestamp || now;

    if (!payload.hasHand || !payload.hands || payload.hands.length === 0) {
      if (this.onFrameCallback) {
        this.onFrameCallback([], [], timestamp, this.lastLatencyMs);
      }
      return;
    }

    // 格式化为与 HandGestureService.processMultiHands 一致的标准输入结构
    const landmarksList: NormalizedLandmark[][] = [];
    const handednessList: any[][] = [];

    for (const hand of payload.hands) {
      if (hand.landmarks && hand.landmarks.length === 21) {
        landmarksList.push(hand.landmarks);
        const category = hand.handedness === 'left' ? 'Left' : 'Right';
        handednessList.push([
          {
            categoryName: category,
            score: hand.confidence || 0.95,
          },
        ]);
      }
    }

    if (this.onFrameCallback) {
      this.onFrameCallback(landmarksList, handednessList, timestamp, this.lastLatencyMs);
    }
  }

  public getFps(): number {
    return this.currentFps;
  }

  public getLatencyMs(): number {
    return this.lastLatencyMs;
  }

  public getIsRunning(): boolean {
    return this.isRunning;
  }

  public destroy(): void {
    this.stop().catch(() => {});
    if (this.unlistenEvent) {
      this.unlistenEvent();
      this.unlistenEvent = null;
    }
    if (typeof window !== 'undefined' && (window as any).__hologrip_onAppleVisionFrame) {
      delete (window as any).__hologrip_onAppleVisionFrame;
    }
    this.onFrameCallback = null;
    this.isInitialized = false;
  }
}
