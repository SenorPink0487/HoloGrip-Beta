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
  frameImage?: string;
}

export type AppleVisionFrameCallback = (
  landmarks: NormalizedLandmark[][],
  handedness: any[][],
  timestamp: number,
  latencyMs: number,
  frameImage?: string
) => void;

const PARENT_JOINT_INDICES: readonly number[] = [
  0,  // 0: wrist
  0,  // 1: thumbCMC
  1,  // 2: thumbMP
  2,  // 3: thumbIP
  3,  // 4: thumbTip
  0,  // 5: indexMCP
  5,  // 6: indexPIP
  6,  // 7: indexDIP
  7,  // 8: indexTip
  0,  // 9: middleMCP
  9,  // 10: middlePIP
  10, // 11: middleDIP
  11, // 12: middleTip
  0,  // 13: ringMCP
  13, // 14: ringPIP
  14, // 15: ringDIP
  15, // 16: ringTip
  0,  // 17: littleMCP
  17, // 18: littlePIP
  18, // 19: littleDIP
  19, // 20: littleTip
];

/**
 * 苹果原生 Vision 框架前端适配器 (Hybrid Architecture - Apple Native App 模式)
 * 在 iOS / iPadOS 原生客户端中直接对接系统 Vision 框架 (VNDetectHumanHandPoseRequest)，
 * 由 Apple Neural Engine (ANE) 硬件加速实时输出 21 个手部关键点，延迟 <=5ms，极省功耗且不占主线程。
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
  private lastFrameImage: string | null = null;
  private prevSanitizedHands: Map<string, { landmarks: NormalizedLandmark[]; timestamp: number }> = new Map();

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
    if (!isTauri) return false;

    const ua = typeof navigator !== 'undefined' ? navigator.userAgent || '' : '';
    const maxTouchPoints = typeof navigator !== 'undefined' ? navigator.maxTouchPoints || 0 : 0;
    const isAppleUA = /iPad|iPhone|iPod|Macintosh/i.test(ua) || maxTouchPoints > 1;
    const isApplePlatform =
      platform.os === 'ipados' ||
      platform.os === 'ios' ||
      platform.os === 'macos' ||
      isAppleUA;

    return isApplePlatform;
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
      console.warn('[AppleVisionTracker] Failed to start native Apple Vision via Tauri command, trying plugin fallback:', err);
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const res: any = await invoke('plugin:apple-vision|start');
        this.isRunning = Boolean(res?.success);
        return this.isRunning;
      } catch (pluginErr) {
        console.error('[AppleVisionTracker] Native Apple Vision failed to start:', pluginErr);
        this.isRunning = false;
        return false;
      }
    }
  }

  /**
   * 停止原生摄像头与 Vision 推理
   */
  public async stop(): Promise<boolean> {
    this.isRunning = false;
    this.lastFrameImage = null;
    this.prevSanitizedHands.clear();

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
    if (payload.frameImage) {
      this.lastFrameImage = payload.frameImage;
    }

    if (!payload.hasHand || !payload.hands || payload.hands.length === 0) {
      if (this.onFrameCallback) {
        this.onFrameCallback([], [], timestamp, this.lastLatencyMs, payload.frameImage);
      }
      return;
    }

    // 格式化为与 HandGestureService.processMultiHands 一致的标准输入结构，
    // 并在前端层执行二次手腕几何重建与越界点清洗，确保即便旧版原生二进制发送了 (-1, -1) 也不会引发右上角飞线或误捏合
    const landmarksList: NormalizedLandmark[][] = [];
    const handednessList: any[][] = [];

    for (let idx = 0; idx < payload.hands.length; idx++) {
      const hand = payload.hands[idx];
      if (hand.landmarks && hand.landmarks.length === 21) {
        const handKey = `${hand.handedness || 'right'}_${idx}`;
        const sanitized = this.sanitizeAndRepairLandmarks(hand.landmarks, handKey, timestamp);
        if (!sanitized) continue;

        landmarksList.push(sanitized);
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
      this.onFrameCallback(landmarksList, handednessList, timestamp, this.lastLatencyMs, payload.frameImage);
    }
  }

  /**
   * 清洗并拓扑重建 21 个手部关键点：
   * 1. 拦截原生未识别哨兵值 (-1, -1) 与角落低置信度噪点 (0, 0) / (1, 0)
   * 2. 当手腕 (索引 0) 因处于画面下边缘缺失时，利用掌指关节 (MCP) 与近端指间关节 (PIP) 反向重建生理手腕位置
   * 3. 正向修复子关节并对异常跨屏长骨进行生理长度钳制
   */
  public sanitizeAndRepairLandmarks(
    raw: NormalizedLandmark[],
    handKey: string,
    timestamp: number
  ): NormalizedLandmark[] | null {
    if (!raw || raw.length !== 21) return null;

    const isValidRawJoint = (p: NormalizedLandmark | undefined): boolean => {
      if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) return false;
      if (p.x < 0.0 || p.x > 1.0 || p.y < 0.0 || p.y > 1.0) return false;
      if (p.visibility !== undefined && p.visibility <= 0.0) return false;
      const isCornerSpike =
        (p.x <= 0.002 || p.x >= 0.998) &&
        (p.y <= 0.002 || p.y >= 0.998) &&
        (p.visibility === undefined || p.visibility < 0.45);
      if (isCornerSpike) return false;
      return true;
    };

    const validFlags: boolean[] = new Array(21);
    const validIndices: number[] = [];
    const points: NormalizedLandmark[] = new Array(21);

    for (let i = 0; i < 21; i++) {
      const p = raw[i];
      const valid = isValidRawJoint(p);
      validFlags[i] = valid;
      if (valid) {
        validIndices.push(i);
        points[i] = {
          x: p.x,
          y: p.y,
          z: Number.isFinite(p.z) ? p.z : 0,
          visibility: p.visibility,
        };
      } else {
        points[i] = { x: -1, y: -1, z: 0, visibility: 0 };
      }
    }

    if (validIndices.length < 4) {
      return null;
    }

    const prevRecord = this.prevSanitizedHands.get(handKey);
    const recentPrev =
      prevRecord && timestamp >= prevRecord.timestamp && timestamp - prevRecord.timestamp <= 250
        ? prevRecord.landmarks
        : null;

    // 1. 优先修复根节点手腕 (索引 0)
    if (!validFlags[0]) {
      const mcpValid = [5, 9, 13, 17].filter((idx) => validFlags[idx]);
      const pipValid = [6, 10, 14, 18].filter((idx) => validFlags[idx]);

      let wristX = 0.5;
      let wristY = 0.85;

      if (mcpValid.length > 0) {
        const mcpX = mcpValid.reduce((acc, idx) => acc + points[idx].x, 0) / mcpValid.length;
        const mcpY = mcpValid.reduce((acc, idx) => acc + points[idx].y, 0) / mcpValid.length;

        if (pipValid.length > 0) {
          const pipX = pipValid.reduce((acc, idx) => acc + points[idx].x, 0) / pipValid.length;
          const pipY = pipValid.reduce((acc, idx) => acc + points[idx].y, 0) / pipValid.length;
          const vx = mcpX - pipX;
          const vy = mcpY - pipY;
          const vLen = Math.hypot(vx, vy);
          if (vLen > 1e-4) {
            const palmSpan = Math.min(0.18, Math.max(0.06, vLen * 1.45));
            wristX = mcpX + (vx / vLen) * palmSpan;
            wristY = mcpY + (vy / vLen) * palmSpan;
          } else {
            wristX = mcpX;
            wristY = mcpY + 0.12;
          }
        } else {
          wristX = mcpX;
          wristY = mcpY + 0.12;
        }
      } else {
        wristX = validIndices.reduce((acc, idx) => acc + points[idx].x, 0) / validIndices.length;
        wristY = validIndices.reduce((acc, idx) => acc + points[idx].y, 0) / validIndices.length + 0.08;
      }

      points[0] = {
        x: Math.min(0.98, Math.max(0.02, wristX)),
        y: Math.min(0.98, Math.max(0.02, wristY)),
        z: 0,
        visibility: 0.16,
      };
      validFlags[0] = true;
    }

    // 2. 自顶向下修复子关节 (1..20)
    for (let i = 1; i < 21; i++) {
      if (!validFlags[i]) {
        const parentIdx = PARENT_JOINT_INDICES[i];
        const parent = points[parentIdx];
        let rx = parent.x;
        let ry = parent.y;

        if (recentPrev && recentPrev[i] && recentPrev[parentIdx]) {
          const dx = recentPrev[i].x - recentPrev[parentIdx].x;
          const dy = recentPrev[i].y - recentPrev[parentIdx].y;
          if (Math.hypot(dx, dy) <= 0.14) {
            rx = parent.x + dx;
            ry = parent.y + dy;
          }
        } else if (i % 4 !== 0 && i + 1 < 21 && validFlags[i + 1]) {
          rx = (parent.x + points[i + 1].x) * 0.5;
          ry = (parent.y + points[i + 1].y) * 0.5;
        }

        points[i] = {
          x: Math.min(0.99, Math.max(0.01, rx)),
          y: Math.min(0.99, Math.max(0.01, ry)),
          z: parent.z,
          visibility: 0.12,
        };
        validFlags[i] = true;
      }
    }

    // 3. 生理骨长离群点钳制，彻底杜绝任何单关节跨屏飞线
    for (let i = 1; i < 21; i++) {
      const parentIdx = PARENT_JOINT_INDICES[i];
      const parent = points[parentIdx];
      const cur = points[i];
      const maxBoneLen = parentIdx === 0 ? 0.38 : 0.24;
      const dx = cur.x - parent.x;
      const dy = cur.y - parent.y;
      const dist = Math.hypot(dx, dy);
      if (dist > maxBoneLen && dist > 1e-5) {
        const ratio = maxBoneLen / dist;
        points[i] = {
          x: Math.min(0.99, Math.max(0.01, parent.x + dx * ratio)),
          y: Math.min(0.99, Math.max(0.01, parent.y + dy * ratio)),
          z: cur.z,
          visibility: cur.visibility,
        };
      }
    }

    this.prevSanitizedHands.set(handKey, { landmarks: points, timestamp });
    return points;
  }

  public getLastFrameImage(): string | null {
    return this.lastFrameImage;
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
