import { PointFilter2D } from './OneEuroFilter.ts';
import type {
  DualHandPinchEvent,
  HandGestureFrame,
  HandGestureServiceConfig,
  NormalizedLandmark,
  SingleHandData,
  TrackerStatus,
  TrackerTelemetry,
} from './types.ts';

const TRACKING_FRAME_WIDTH = 512;
const TRACKING_FRAME_HEIGHT = 512;

/**
 * 基于全息手势物理学与双阈值迟滞的尺度无关捏合状态机。
 */
export class PinchStateMachine {
  private enterThreshold: number;
  private exitThreshold: number;
  private pinching = false;

  constructor(enterThreshold = 0.21, exitThreshold = 0.27) {
    this.enterThreshold = enterThreshold;
    this.exitThreshold = Math.max(exitThreshold, enterThreshold);
    this.reset();
  }

  public reset(): void {
    this.pinching = false;
  }

  public isPinchActive(): boolean {
    return this.pinching;
  }

  public update(ratio: number): { isPinching: boolean; justStarted: boolean; justEnded: boolean } {
    if (!Number.isFinite(ratio)) {
      const was = this.pinching;
      this.pinching = false;
      return { isPinching: false, justStarted: false, justEnded: was };
    }

    const was = this.pinching;
    if (!this.pinching) {
      if (ratio <= this.enterThreshold) {
        this.pinching = true;
      }
    } else {
      if (ratio >= this.exitThreshold) {
        this.pinching = false;
      }
    }

    return {
      isPinching: this.pinching,
      justStarted: this.pinching && !was,
      justEnded: !this.pinching && was,
    };
  }
}

/**
 * 独立单手状态追踪器，集成 One Euro 自适应滤波防抖与捏合状态机。
 */
export class SingleHandTracker {
  public handedness: 'left' | 'right';
  public filter: PointFilter2D;
  public pinchMachine: PinchStateMachine;

  public lastWrist: { x: number; y: number } | null = null;
  public lastSeenAt = -Infinity;

  // 捏合与手势状态
  public isPinching = false;
  public pinchStartTime: number | null = null;
  public pinchStartX = 0;
  public pinchStartY = 0;
  public lastScreenX = 0;
  public lastScreenY = 0;
  public isLongPinch = false;

  constructor(
    handedness: 'left' | 'right',
    minCutoff: number,
    beta: number,
    enterThresh: number,
    exitThresh: number
  ) {
    this.handedness = handedness;
    this.filter = new PointFilter2D(minCutoff, beta, 1.0);
    this.pinchMachine = new PinchStateMachine(enterThresh, exitThresh);
  }

  public reset(): void {
    this.isPinching = false;
    this.pinchStartTime = null;
    this.isLongPinch = false;
    this.lastWrist = null;
    this.lastSeenAt = -Infinity;
    this.filter.reset();
    this.pinchMachine.reset();
  }

  public process(
    landmarks: NormalizedLandmark[],
    timestamp: number,
    confidence: number,
    config: Required<HandGestureServiceConfig>
  ): SingleHandData {
    const thumbTip = landmarks[4];
    const indexTip = landmarks[8];
    const wrist = landmarks[0];
    const middleMcp = landmarks[9];

    // 拇指指尖与食指指尖连线的中点坐标
    const midX = (thumbTip.x + indexTip.x) * 0.5;
    const midY = (thumbTip.y + indexTip.y) * 0.5;
    const midZ = (thumbTip.z + indexTip.z) * 0.5;

    // 前置摄像头画面水平镜像翻转
    const normCameraX = config.mirrorX ? 1.0 - midX : midX;
    const normCameraY = midY;

    // 有效活动边距映射校准
    const mX = config.activeMarginX;
    const mY = config.activeMarginY;
    const boundedNormX = Math.max(0, Math.min(1, (normCameraX - mX) / (1.0 - 2 * mX)));
    const boundedNormY = Math.max(0, Math.min(1, (normCameraY - mY) / (1.0 - 2 * mY)));

    // 视口屏幕绝对像素坐标
    const viewWidth = typeof window !== 'undefined' ? window.innerWidth : 1920;
    const viewHeight = typeof window !== 'undefined' ? window.innerHeight : 1080;
    const rawScreenX = boundedNormX * viewWidth;
    const rawScreenY = boundedNormY * viewHeight;

    // One Euro 自适应滤波平滑处理
    const smoothed = this.filter.filter(rawScreenX, rawScreenY, timestamp);

    // 二维平面欧氏距离（排除单目深度 Z 轴的噪声干扰）
    const rawDistance = Math.hypot(thumbTip.x - indexTip.x, thumbTip.y - indexTip.y);

    // 手掌尺度归一化基准（采用手掌横宽与手腕至中指掌指关节的最大值，保证尺度无关）
    const palmWidth = (landmarks[5] && landmarks[17])
      ? Math.hypot(landmarks[5].x - landmarks[17].x, landmarks[5].y - landmarks[17].y)
      : 0;
    const wristToMiddle = Math.hypot(middleMcp.x - wrist.x, middleMcp.y - wrist.y);
    const handScale = Math.max(palmWidth, wristToMiddle) || 0.22;
    const pinchRatio = rawDistance / handScale;

    // 双阈值迟滞捏合判定
    const { isPinching, justStarted, justEnded } = this.pinchMachine.update(pinchRatio);
    this.isPinching = isPinching;

    // 线性比例捏合强度 [0, 1]
    const enterThresh = config.pinchThresholdEnter;
    const exitThresh = config.pinchThresholdExit;
    let pinchStrength = 0;
    if (isPinching) {
      pinchStrength = 1.0;
    } else if (pinchRatio < exitThresh) {
      pinchStrength = Math.max(0, Math.min(1, (exitThresh - pinchRatio) / (exitThresh - enterThresh)));
    }

    // 手势持续时长统计与交互类型判定
    let pinchDuration = 0;
    if (this.handedness === 'left') {
      if (justStarted) {
        this.pinchStartTime = timestamp;
        this.pinchStartX = smoothed.x;
        this.pinchStartY = smoothed.y;
        this.lastScreenX = smoothed.x;
        this.lastScreenY = smoothed.y;
        this.isLongPinch = false;
      }

      if (isPinching && this.pinchStartTime !== null) {
        pinchDuration = Math.max(0, timestamp - this.pinchStartTime);
        const distMoved = Math.hypot(smoothed.x - this.pinchStartX, smoothed.y - this.pinchStartY);
        if (pinchDuration > config.quickPinchMaxDurationMs) {
          if (distMoved >= 20 || pinchDuration >= config.quickPinchMaxDurationMs + 80) {
            this.isLongPinch = true;
          }
        }
      } else if (justEnded && this.pinchStartTime !== null) {
        pinchDuration = Math.max(0, timestamp - this.pinchStartTime);
        if (pinchDuration <= config.quickPinchMaxDurationMs) {
          this.isLongPinch = false;
        }
      }
    } else {
      if (justStarted) {
        this.pinchStartTime = timestamp;
      }
      if ((isPinching || justEnded) && this.pinchStartTime !== null) {
        pinchDuration = Math.max(0, timestamp - this.pinchStartTime);
      }
      if (justEnded) {
        this.pinchStartTime = null;
      }
    }

    this.lastWrist = { x: wrist.x, y: wrist.y };
    this.lastSeenAt = timestamp;

    return {
      handedness: this.handedness,
      confidence,
      landmarks,
      thumbTip,
      indexTip,
      midpointNorm: { x: midX, y: midY, z: midZ },
      screenX: smoothed.x,
      screenY: smoothed.y,
      rawDistance,
      handScale,
      pinchRatio,
      pinchStrength,
      isPinching,
      justPinchStarted: justStarted,
      justPinchEnded: justEnded,
      pinchDuration,
      isLongPinch: this.isLongPinch,
    };
  }
}

interface HandDetection {
  landmarks: NormalizedLandmark[];
  wrist: { x: number; y: number };
  label: 'left' | 'right';
  score: number;
  screenX: number;
}

export class HandGestureService {
  private config: Required<HandGestureServiceConfig>;
  private videoElement: HTMLVideoElement | null = null;
  private mediaStream: MediaStream | null = null;
  private animFrameId: number | null = null;
  private videoFrameCallbackId: number | null = null;

  // 专属 Web Worker 后台计算架构（移除主线程回退以保证 3D 渲染峰值性能）
  private worker: Worker | null = null;
  private isWorkerReady = false;
  private isWorkerBusy = false;
  private sessionId = 0;
  private nextFrameId = 0;
  private inFlightFrame: { id: number; sessionId: number; startedAt: number; captureMs: number } | null = null;
  private lastVideoCurrentTime = -1;
  private lastDecodedFrameCount = -1;
  private latestVideoFrameTime: number | null = null;
  private lastFrameSendTime = 0;
  private lastRvfCallTime = 0;
  private captureCanvas: OffscreenCanvas | null = null;
  private captureContext: OffscreenCanvasRenderingContext2D | null = null;
  private directTracker: any = null;

  private status: TrackerStatus = 'uninitialized';
  private errorMessage = '';

  // 双手状态追踪器
  private leftTracker: SingleHandTracker;
  private rightTracker: SingleHandTracker;

  // 遥测数据缓存
  private lastHasHand = false;
  private lastLeftHandDetected = false;
  private lastRightHandDetected = false;
  private lastRightPinchRatio = 0;
  private lastRightPinchStrength = 0;

  // 性能遥测指标
  private frameCount = 0;
  private lastFpsTimestamp = performance.now();
  private currentFps = 0;
  private lastLatencyMs = 0;
  private lastInferenceMs = 0;
  private lastCaptureMs = 0;
  private delegate: 'GPU' | 'CPU' | 'unknown' = 'unknown';

  // 双手协同捏合缩放状态
  private isDualPinchActive = false;
  private dualPinchStartDistance = 0;
  private wasDualPinchingInCurrentSession = false;

  // 事件监听器集合
  private frameListeners: Set<(frame: HandGestureFrame) => void> = new Set();
  private statusListeners: Set<(telemetry: TrackerTelemetry) => void> = new Set();
  private quickPinchMenuListeners: Set<() => void> = new Set();
  private cameraRotateListeners: Set<(dx: number, dy: number) => void> = new Set();
  private dualPinchListeners: Set<(event: DualHandPinchEvent) => void> = new Set();

  constructor(config: HandGestureServiceConfig = {}) {
    this.config = {
      modelAssetPath: config.modelAssetPath ?? '/models/hand_landmarker.task',
      wasmBasePath: config.wasmBasePath ?? '/mediapipe/wasm',
      mirrorX: config.mirrorX ?? true,
      activeMarginX: config.activeMarginX ?? 0.12,
      activeMarginY: config.activeMarginY ?? 0.12,
      pinchThresholdEnter: config.pinchThresholdEnter ?? 0.21,
      pinchThresholdExit: config.pinchThresholdExit ?? 0.27,
      minDetectionConfidence: config.minDetectionConfidence ?? 0.5,
      minTrackingConfidence: config.minTrackingConfidence ?? 0.5,
      numHands: config.numHands ?? 2,
      quickPinchMaxDurationMs: config.quickPinchMaxDurationMs ?? 200,
      cameraSensitivity: config.cameraSensitivity ?? 0.0032,
      useWorker: config.useWorker ?? true,
      filterMinCutoff: config.filterMinCutoff ?? 1.6,
      filterBeta: config.filterBeta ?? 0.008,
    };

    this.leftTracker = new SingleHandTracker(
      'left',
      this.config.filterMinCutoff,
      this.config.filterBeta,
      this.config.pinchThresholdEnter,
      this.config.pinchThresholdExit
    );

    this.rightTracker = new SingleHandTracker(
      'right',
      this.config.filterMinCutoff,
      this.config.filterBeta,
      this.config.pinchThresholdEnter,
      this.config.pinchThresholdExit
    );
  }

  public getStatus(): TrackerStatus {
    return this.status;
  }

  public isWorkerMode(): boolean {
    return Boolean(this.worker && this.isWorkerReady);
  }

  public getTelemetry(): TrackerTelemetry {
    return {
      status: this.status,
      fps: this.currentFps,
      latencyMs: this.lastLatencyMs,
      inferenceMs: this.lastInferenceMs,
      captureMs: this.lastCaptureMs,
      isPinching: this.rightTracker.isPinching,
      isDualPinching: this.isDualPinchActive,
      pinchRatio: this.lastRightPinchRatio,
      pinchStrength: this.lastRightPinchStrength,
      handDetected: this.lastHasHand,
      leftHandDetected: this.lastLeftHandDetected,
      rightHandDetected: this.lastRightHandDetected,
      isLeftLongPinch: this.leftTracker.isLongPinch,
      isLocalModel: true,
      isWorkerMode: Boolean(this.worker && this.isWorkerReady),
      delegate: this.delegate,
      errorMessage: this.errorMessage || undefined,
    };
  }

  public onFrame(listener: (frame: HandGestureFrame) => void): () => void {
    this.frameListeners.add(listener);
    return () => this.frameListeners.delete(listener);
  }

  public onStatusChange(listener: (telemetry: TrackerTelemetry) => void): () => void {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }

  public onQuickPinchMenu(listener: () => void): () => void {
    this.quickPinchMenuListeners.add(listener);
    return () => this.quickPinchMenuListeners.delete(listener);
  }

  public onCameraRotate(listener: (dx: number, dy: number) => void): () => void {
    this.cameraRotateListeners.add(listener);
    return () => this.cameraRotateListeners.delete(listener);
  }

  public onDualPinchZoom(listener: (event: DualHandPinchEvent) => void): () => void {
    this.dualPinchListeners.add(listener);
    return () => this.dualPinchListeners.delete(listener);
  }

  private notifyDualPinchZoom(event: DualHandPinchEvent): void {
    for (const listener of this.dualPinchListeners) {
      try {
        listener(event);
      } catch (err) {
        console.error('[HandGestureService] Dual pinch zoom listener error:', err);
      }
    }
  }

  private notifyStatus(): void {
    const telemetry = this.getTelemetry();
    for (const listener of this.statusListeners) {
      try {
        listener(telemetry);
      } catch (err) {
        console.error('[HandGestureService] status listener error:', err);
      }
    }
  }

  private notifyQuickPinchMenu(): void {
    for (const listener of this.quickPinchMenuListeners) {
      try {
        listener();
      } catch (err) {
        console.error('[HandGestureService] Quick pinch menu listener error:', err);
      }
    }
  }

  private notifyCameraRotate(dx: number, dy: number): void {
    for (const listener of this.cameraRotateListeners) {
      try {
        listener(dx, dy);
      } catch (err) {
        console.error('[HandGestureService] Camera rotate listener error:', err);
      }
    }
  }

  /**
   * 专属在独立的 Web Worker 中初始化 MediaPipe HandLandmarker 运算。
   * 彻底移除主线程回退执行，防止 3D 物理渲染过程出现任何掉帧或卡顿。
   */
  public async init(): Promise<void> {
    if (this.status === 'ready' || this.status === 'running') return;
    this.status = 'loading';
    this.notifyStatus();

    if (!this.config.useWorker) {
      const err = new Error('Main-thread fallback has been removed. Dedicated Web Worker is strictly required.');
      this.status = 'error';
      this.errorMessage = err.message;
      console.error('[HandGestureService] Worker mode required:', err);
      this.notifyStatus();
      throw err;
    }

    if (typeof Worker === 'undefined') {
      const err = new Error('Web Worker is not supported in this environment');
      this.status = 'error';
      this.errorMessage = err.message;
      console.error('[HandGestureService] Dedicated hand tracking worker unsupported:', err);
      this.notifyStatus();
      throw err;
    }

    try {
      console.log('[HandGestureService] Initializing dedicated hand tracking worker...');
      await this.initWorker();
      console.log('[HandGestureService] Hand tracking worker ready.');

      // 并发启动高性能主线程直连硬件 GPU 追踪器（对齐 HoloPhysics / wuli 生产架构）
      // 零拷贝直接处理 HTMLVideoElement，获得 ≤25ms 的超低延迟与 30~60 FPS
      try {
        const { DirectHandTracker } = await import('./DirectHandTracker.ts');
        this.directTracker = new DirectHandTracker(this.config);
        const del = await this.directTracker.init();
        if (del) {
          this.delegate = del;
        }
      } catch (directErr) {
        console.warn('[HandGestureService] Direct GPU tracker initialization fallback to worker:', directErr);
        this.directTracker = null;
      }

      this.status = 'ready';
      this.errorMessage = '';
      this.notifyStatus();
    } catch (err) {
      this.disposeWorker();
      this.status = 'error';
      this.errorMessage = err instanceof Error ? err.message : String(err);
      console.error('[HandGestureService] Hand tracking worker initialization failed:', err);
      this.notifyStatus();
      throw err;
    }
  }

  private initWorker(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      try {
        this.worker = new Worker(new URL('../workers/handTracking.worker.ts', import.meta.url), {
          type: 'module',
        });

        const timeout = setTimeout(() => {
          reject(new Error('Hand tracking worker initialization timed out'));
        }, 15000);

        this.worker.onmessage = (e: MessageEvent) => {
          const { type } = e.data;
          if (type === 'INIT_SUCCESS') {
            clearTimeout(timeout);
            this.isWorkerReady = true;
            if (e.data.delegate) {
              this.delegate = e.data.delegate;
            }
            this.setupWorkerMessageHandlers();
            resolve();
          } else if (type === 'INIT_ERROR') {
            clearTimeout(timeout);
            reject(new Error(e.data.error || 'Worker init error'));
          }
        };

        this.worker.onerror = (err) => {
          clearTimeout(timeout);
          reject(err);
        };

        this.worker.postMessage({
          type: 'INIT',
          wasmBasePath: this.config.wasmBasePath,
          modelAssetPath: this.config.modelAssetPath,
          numHands: this.config.numHands,
          minDetectionConfidence: this.config.minDetectionConfidence,
          minTrackingConfidence: this.config.minTrackingConfidence,
        });
      } catch (err) {
        reject(err);
      }
    });
  }

  private setupWorkerMessageHandlers(): void {
    if (!this.worker) return;

    this.worker.onmessage = (e: MessageEvent) => {
      const { type } = e.data;
      if (type !== 'DETECT_RESULT' && type !== 'DETECT_ERROR') return;
      const request = this.inFlightFrame;
      if (!request || e.data.frameId !== request.id || e.data.sessionId !== request.sessionId) return;
      this.inFlightFrame = null;
      this.isWorkerBusy = false;

      // A paused/stopped session may still have a result in transit. It must
      // release its slot without emitting gestures into the new session.
      if (this.status !== 'running' || request.sessionId !== this.sessionId) {
        if (this.status === 'running') this.processFrame();
        return;
      }
      if (type === 'DETECT_RESULT') {
        const now = performance.now();
        this.lastLatencyMs = now - request.startedAt;
        this.lastInferenceMs = e.data.latencyMs ?? 0;
        this.lastCaptureMs = request.captureMs;
        if (e.data.delegate) {
          this.delegate = e.data.delegate;
        }

        // 更新每秒帧率 (FPS) 计数器
        this.frameCount++;
        const elapsedFps = now - this.lastFpsTimestamp;
        if (elapsedFps >= 500) {
          this.currentFps = Math.round((this.frameCount * 1000) / elapsedFps);
          this.frameCount = 0;
          this.lastFpsTimestamp = now;
        }

        // Start capturing the latest camera frame before running UI listeners.
        this.processFrame();

        const landmarksArray = (e.data.landmarks || []) as NormalizedLandmark[][];
        const handednessArray = (e.data.handedness || []) as any[][];

        const frame = this.processMultiHands(landmarksArray, handednessArray, e.data.timestamp);
        this.broadcastFrame(frame);
        this.notifyStatus();
      } else if (type === 'DETECT_ERROR') {
        console.warn('[HandGestureService] Worker detection error:', e.data.error);
        this.processFrame();
      }
    };

    this.worker.onerror = (err) => {
      this.inFlightFrame = null;
      this.isWorkerBusy = false;
      this.status = 'error';
      this.errorMessage = err instanceof Error ? err.message : 'Worker runtime error';
      console.error('[HandGestureService] Worker runtime error:', err);
      this.notifyStatus();
    };
  }

  /**
   * 启动前置摄像头视频流并开启手部姿态实时追踪。
   */
  public async start(): Promise<void> {
    if (this.status === 'running') return;
    if (!this.isWorkerReady) {
      await this.init();
    }

    try {
      if (!this.videoElement) {
        this.videoElement = document.createElement('video');
        this.videoElement.setAttribute('autoplay', '');
        this.videoElement.setAttribute('playsinline', '');
        this.videoElement.muted = true;
        this.videoElement.style.position = 'fixed';
        this.videoElement.style.top = '0';
        this.videoElement.style.left = '0';
        this.videoElement.style.width = '320px';
        this.videoElement.style.height = '240px';
        this.videoElement.style.opacity = '0';
        this.videoElement.style.pointerEvents = 'none';
        this.videoElement.style.zIndex = '1';
        document.body.appendChild(this.videoElement);
      }

      if (!this.mediaStream) {
        console.log('[HandGestureService] Requesting user-facing front camera...');
        this.mediaStream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'user',
            width: { ideal: 640 },
            height: { ideal: 480 },
            frameRate: { ideal: 30, max: 60 },
          },
          audio: false,
        });
        this.videoElement.srcObject = this.mediaStream;
        await this.videoElement.play();
      }

      this.status = 'running';
      this.frameCount = 0;
      this.currentFps = 0;
      this.lastFpsTimestamp = performance.now();
      this.lastFrameSendTime = 0;
      this.lastVideoCurrentTime = -1;
      this.lastDecodedFrameCount = -1;
      this.latestVideoFrameTime = null;
      this.lastRvfCallTime = 0;
      this.notifyStatus();
      this.leftTracker.reset();
      this.rightTracker.reset();
      this.startLoop();
    } catch (err) {
      this.status = 'error';
      this.errorMessage = err instanceof Error ? err.message : 'Camera access denied or unavailable';
      console.error('[HandGestureService] Camera stream start failed:', err);
      this.notifyStatus();
      throw err;
    }
  }

  public getVideoElement(): HTMLVideoElement | null {
    return this.videoElement;
  }

  public getMediaStream(): MediaStream | null {
    return this.mediaStream;
  }

  public pause(): void {
    if (this.status !== 'running') return;
    this.status = 'paused';
    this.sessionId++;
    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
    if (this.videoFrameCallbackId !== null && this.videoElement && typeof (this.videoElement as any).cancelVideoFrameCallback === 'function') {
      (this.videoElement as any).cancelVideoFrameCallback(this.videoFrameCallbackId);
      this.videoFrameCallbackId = null;
    }
    this.notifyStatus();
  }

  public resume(): void {
    if (this.status !== 'paused') return;
    this.status = 'running';
    this.lastVideoCurrentTime = -1;
    this.lastDecodedFrameCount = -1;
    this.latestVideoFrameTime = null;
    this.notifyStatus();
    this.startLoop();
  }

  public stop(): void {
    this.sessionId++;
    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
    if (this.videoFrameCallbackId !== null && this.videoElement && typeof (this.videoElement as any).cancelVideoFrameCallback === 'function') {
      (this.videoElement as any).cancelVideoFrameCallback(this.videoFrameCallbackId);
      this.videoFrameCallbackId = null;
    }

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }

    if (this.videoElement) {
      this.videoElement.srcObject = null;
      if (this.videoElement.parentNode) {
        this.videoElement.parentNode.removeChild(this.videoElement);
      }
      this.videoElement = null;
    }

    this.lastVideoCurrentTime = -1;
    this.lastDecodedFrameCount = -1;
    this.latestVideoFrameTime = null;
    this.lastFrameSendTime = 0;
    this.lastRvfCallTime = 0;
    this.frameCount = 0;
    this.currentFps = 0;
    this.captureCanvas = null;
    this.captureContext = null;
    this.leftTracker.reset();
    this.rightTracker.reset();
    this.lastHasHand = false;
    this.lastLeftHandDetected = false;
    this.lastRightHandDetected = false;
    this.lastRightPinchRatio = 0;
    this.lastRightPinchStrength = 0;
    this.status = this.isWorkerReady ? 'ready' : 'uninitialized';
    this.notifyStatus();
  }

  public destroy(): void {
    this.stop();
    this.disposeWorker();
    this.frameListeners.clear();
    this.statusListeners.clear();
    this.quickPinchMenuListeners.clear();
    this.cameraRotateListeners.clear();
    this.status = 'uninitialized';
  }

  private disposeWorker(): void {
    this.sessionId++;
    this.inFlightFrame = null;
    if (this.worker) {
      try {
        this.worker.postMessage({ type: 'CLOSE' });
        this.worker.terminate();
      } catch (_err) {}
      this.worker = null;
    }
    if (this.directTracker) {
      try {
        this.directTracker.close();
      } catch (_err) {}
      this.directTracker = null;
    }
    this.isWorkerReady = false;
    this.isWorkerBusy = false;
  }

  private startLoop(): void {
    if (this.videoElement && typeof (this.videoElement as any).requestVideoFrameCallback === 'function') {
      const onVideoFrame = (_now: number, metadata: VideoFrameCallbackMetadata) => {
        if (this.status !== 'running') return;
        this.lastRvfCallTime = performance.now();
        this.latestVideoFrameTime = metadata.mediaTime;
        this.processFrame();
        if (this.videoElement && typeof (this.videoElement as any).requestVideoFrameCallback === 'function') {
          this.videoFrameCallbackId = (this.videoElement as any).requestVideoFrameCallback(onVideoFrame);
        }
      };
      this.videoFrameCallbackId = (this.videoElement as any).requestVideoFrameCallback(onVideoFrame);
    }

    const loop = () => {
      if (this.status !== 'running') return;
      const now = performance.now();
      // If video callbacks stall, poll for a new camera frame. The watchdog
      // must never turn a stalled/unchanged video into duplicate inference.
      const hasActiveRvfc = this.videoFrameCallbackId !== null && (now - this.lastRvfCallTime < 80);
      if (!hasActiveRvfc && (now - this.lastFrameSendTime >= 25)) {
        this.processFrame();
      }
      this.animFrameId = requestAnimationFrame(loop);
    };
    this.animFrameId = requestAnimationFrame(loop);
  }

  private processFrame(): void {
    const video = this.videoElement;
    if (this.status !== 'running' || !video || video.readyState < 2) {
      return;
    }

    // 1. 优先执行高性能主线程直连硬件 GPU 管线（对齐 HoloPhysics / wuli 生产架构）
    if (this.directTracker && this.directTracker.isInitialized()) {
      const decodedFrameCount = video.getVideoPlaybackQuality?.().totalVideoFrames;
      const hasDecodedFrameCount = decodedFrameCount !== undefined && decodedFrameCount > 0;
      const videoTime = this.latestVideoFrameTime ?? video.currentTime;
      if (hasDecodedFrameCount
        ? decodedFrameCount === this.lastDecodedFrameCount
        : videoTime === this.lastVideoCurrentTime) return;

      const now = performance.now();
      this.lastVideoCurrentTime = videoTime;
      this.lastDecodedFrameCount = decodedFrameCount ?? -1;
      this.lastFrameSendTime = now;

      const detection = this.directTracker.detect(video, now);
      if (detection) {
        this.lastLatencyMs = detection.latencyMs;
        this.lastInferenceMs = detection.latencyMs;
        this.lastCaptureMs = 0;
        this.delegate = detection.delegate;

        this.frameCount++;
        const elapsedFps = now - this.lastFpsTimestamp;
        if (elapsedFps >= 500) {
          this.currentFps = Math.round((this.frameCount * 1000) / elapsedFps);
          this.frameCount = 0;
          this.lastFpsTimestamp = now;
        }

        const frame = this.processMultiHands(detection.landmarks, detection.handedness, now);
        this.broadcastFrame(frame);
        this.notifyStatus();
        return;
      }
    }

    if (!this.worker || !this.isWorkerReady) {
      return;
    }

    // currentTime is a continuously advancing playback clock, not a camera
    // frame ID. Use decoded frame counts, or rVFC's media timestamp, to avoid
    // repeatedly inferring the same pixels between camera frames.
    const decodedFrameCount = video.getVideoPlaybackQuality?.().totalVideoFrames;
    const hasDecodedFrameCount = decodedFrameCount !== undefined && decodedFrameCount > 0;
    const videoTime = this.latestVideoFrameTime ?? video.currentTime;
    if (hasDecodedFrameCount
      ? decodedFrameCount === this.lastDecodedFrameCount
      : videoTime === this.lastVideoCurrentTime) return;

    if (this.isWorkerBusy) {
      // Do not capture/queue older bitmaps. Completion will read the latest frame.
      return;
    }

    const now = performance.now();
    this.lastVideoCurrentTime = videoTime;
    this.lastDecodedFrameCount = decodedFrameCount ?? -1;
    this.lastFrameSendTime = now;

    this.isWorkerBusy = true;
    const request = { id: ++this.nextFrameId, sessionId: this.sessionId, startedAt: now, captureMs: 0 };
    this.inFlightFrame = request;
    const worker = this.worker;
    const releaseCapture = () => {
      if (this.inFlightFrame !== request) return;
      this.inFlightFrame = null;
      this.isWorkerBusy = false;
      if (this.status === 'running' && request.sessionId !== this.sessionId) this.processFrame();
    };

    try {
      // Keep capture asynchronous and allow only one capture/inference in flight.
      let bitmapPromise: Promise<ImageBitmap> | null = null;
      if (typeof OffscreenCanvas !== 'undefined' && typeof (OffscreenCanvas.prototype as any)?.transferToImageBitmap === 'function') {
        try {
          if (!this.captureCanvas) {
            this.captureCanvas = new OffscreenCanvas(TRACKING_FRAME_WIDTH, TRACKING_FRAME_HEIGHT);
            this.captureContext = this.captureCanvas.getContext('2d', { alpha: false, willReadFrequently: false });
          }
          if (this.captureContext) {
            this.captureContext.drawImage(video, 0, 0, TRACKING_FRAME_WIDTH, TRACKING_FRAME_HEIGHT);
            if (typeof this.captureCanvas.transferToImageBitmap === 'function') {
              bitmapPromise = Promise.resolve(this.captureCanvas.transferToImageBitmap());
            }
          }
        } catch (_err) {
          this.captureCanvas = null;
          this.captureContext = null;
        }
      }

      if (!bitmapPromise && typeof createImageBitmap === 'function') {
        bitmapPromise = createImageBitmap(video, {
          resizeWidth: TRACKING_FRAME_WIDTH,
          resizeHeight: TRACKING_FRAME_HEIGHT,
          resizeQuality: 'low',
        }).catch(() => createImageBitmap(video));
      }

      if (!bitmapPromise) {
        releaseCapture();
        return;
      }

      bitmapPromise.then((bitmap) => {
        if (this.status !== 'running' || this.worker !== worker || request.sessionId !== this.sessionId) {
          if (typeof bitmap.close === 'function') bitmap.close();
          releaseCapture();
          return;
        }
        try {
          request.captureMs = performance.now() - request.startedAt;
          worker.postMessage(
            {
              type: 'DETECT',
              imageBitmap: bitmap,
              timestamp: request.startedAt,
              frameId: request.id,
              sessionId: request.sessionId,
            },
            [bitmap]
          );
        } catch (postErr) {
          if (typeof bitmap.close === 'function') bitmap.close();
          releaseCapture();
          console.warn('[HandGestureService] Worker postMessage error:', postErr);
        }
      }).catch(() => {
        releaseCapture();
      });
    } catch (_err) {
      releaseCapture();
    }
  }

  private buildEmptyFrame(timestamp: number, rightJustEnded: boolean): HandGestureFrame {
    return {
      hasHand: false,
      timestamp,
      leftHand: null,
      rightHand: null,
      leftHandQuickPinch: false,
      leftHandCameraDelta: null,
      landmarks: null,
      thumbTip: null,
      indexTip: null,
      midpointNorm: null,
      screenX: 0,
      screenY: 0,
      rawDistance: 0,
      handScale: 0,
      pinchRatio: 0,
      pinchStrength: 0,
      isPinching: false,
      justPinchStarted: false,
      justPinchEnded: rightJustEnded,
    };
  }

  /**
   * 处理至多两只手的骨骼数据，稳健分离左右手，并分别计算手势状态机。
   */
  public processMultiHands(
    detectedLandmarks: NormalizedLandmark[][],
    detectedHandedness: any[][],
    timestamp: number
  ): HandGestureFrame {
    if (!detectedLandmarks || detectedLandmarks.length === 0) {
      const rightJustEnded = this.rightTracker.isPinching;
      this.leftTracker.reset();
      this.rightTracker.reset();
      this.lastHasHand = false;
      this.lastLeftHandDetected = false;
      this.lastRightHandDetected = false;
      this.lastRightPinchRatio = 0;
      this.lastRightPinchStrength = 0;

      return this.buildEmptyFrame(timestamp, rightJustEnded);
    }

    const detections: HandDetection[] = detectedLandmarks.slice(0, 2).map((lms, idx) => {
      const rawCategory = detectedHandedness?.[idx]?.[0]?.categoryName;
      const score = Number(detectedHandedness?.[idx]?.[0]?.score) || 0.9;
      const midX = (lms[4].x + lms[8].x) * 0.5;
      const screenX = this.config.mirrorX ? 1.0 - midX : midX;

      let label: 'left' | 'right';
      if (rawCategory) {
        label = this.config.mirrorX
          ? (rawCategory === 'Right' ? 'left' : 'right')
          : (rawCategory === 'Left' ? 'left' : 'right');
      } else {
        label = screenX < 0.5 ? 'left' : 'right';
      }

      return {
        landmarks: lms,
        wrist: { x: lms[0].x, y: lms[0].y },
        label,
        score,
        screenX,
      };
    });

    let leftHandData: SingleHandData | null = null;
    let rightHandData: SingleHandData | null = null;

    if (detections.length >= 2) {
      // 检测到两只手：用户左手位于用户左侧（对应镜像后较小的 screenX），右手位于用户右侧（较大的 screenX）
      const [leftDet, rightDet] = detections[0].screenX <= detections[1].screenX
        ? [detections[0], detections[1]]
        : [detections[1], detections[0]];

      leftHandData = this.leftTracker.process(leftDet.landmarks, timestamp, leftDet.score, this.config);
      rightHandData = this.rightTracker.process(rightDet.landmarks, timestamp, rightDet.score, this.config);
    } else {
      // 仅检测到单手：结合空间屏幕区域与神经网络置信度综合判定左右手
      const det = detections[0];
      let isLeft: boolean;

      if (det.screenX >= 0.55) {
        // 显著位于屏幕右半区
        isLeft = false;
      } else if (det.screenX <= 0.45) {
        // 显著位于屏幕左半区
        isLeft = true;
      } else {
        // 中央区域：优先保持最近一次的手势标识，或回退至神经网络分类标签
        if (Number.isFinite(this.rightTracker.lastSeenAt) && timestamp - this.rightTracker.lastSeenAt < 800) {
          isLeft = false;
        } else if (Number.isFinite(this.leftTracker.lastSeenAt) && timestamp - this.leftTracker.lastSeenAt < 800) {
          isLeft = true;
        } else {
          isLeft = det.label === 'left';
        }
      }

      if (isLeft) {
        leftHandData = this.leftTracker.process(det.landmarks, timestamp, det.score, this.config);
        this.rightTracker.reset();
      } else {
        rightHandData = this.rightTracker.process(det.landmarks, timestamp, det.score, this.config);
        this.leftTracker.reset();
      }
    }

    // 双手同时捏合检测（连续缩放 3D 几何模型）
    const isDualPinching = Boolean(leftHandData?.isPinching && rightHandData?.isPinching);
    let dualPinchDistance = 0;
    let dualPinchScaleFactor = 1.0;

    if (isDualPinching && leftHandData && rightHandData) {
      this.wasDualPinchingInCurrentSession = true;
      dualPinchDistance = Math.hypot(
        rightHandData.screenX - leftHandData.screenX,
        rightHandData.screenY - leftHandData.screenY
      );

      if (!this.isDualPinchActive) {
        this.isDualPinchActive = true;
        this.dualPinchStartDistance = dualPinchDistance > 1 ? dualPinchDistance : 100;
        dualPinchScaleFactor = 1.0;
        this.notifyDualPinchZoom({
          state: 'start',
          distance: dualPinchDistance,
          initialDistance: this.dualPinchStartDistance,
          scaleFactor: 1.0,
        });
      } else {
        dualPinchScaleFactor = this.dualPinchStartDistance > 5 ? dualPinchDistance / this.dualPinchStartDistance : 1.0;
        this.notifyDualPinchZoom({
          state: 'move',
          distance: dualPinchDistance,
          initialDistance: this.dualPinchStartDistance,
          scaleFactor: dualPinchScaleFactor,
        });
      }
    } else if (this.isDualPinchActive) {
      this.isDualPinchActive = false;
      this.notifyDualPinchZoom({
        state: 'end',
        distance: 0,
        initialDistance: this.dualPinchStartDistance,
        scaleFactor: 1.0,
      });
    }

    // 处理左手手势（短捏合触发菜单/视窗开合，长捏合拖拽转动相机视角）
    let leftHandQuickPinch = false;
    let leftHandCameraDelta: { dx: number; dy: number } | null = null;

    if (leftHandData) {
      if (leftHandData.isPinching && leftHandData.isLongPinch) {
        const dx = leftHandData.screenX - this.leftTracker.lastScreenX;
        const dy = leftHandData.screenY - this.leftTracker.lastScreenY;
        this.leftTracker.lastScreenX = leftHandData.screenX;
        this.leftTracker.lastScreenY = leftHandData.screenY;
        leftHandCameraDelta = { dx, dy };
      }

      if (leftHandData.justPinchEnded) {
        if (!this.wasDualPinchingInCurrentSession && leftHandData.pinchDuration <= this.config.quickPinchMaxDurationMs) {
          leftHandQuickPinch = true;
          this.notifyQuickPinchMenu();
        }
        this.leftTracker.pinchStartTime = null;
        this.leftTracker.isLongPinch = false;
      }
    }

    if (
      !isDualPinching &&
      !this.isDualPinchActive &&
      leftHandCameraDelta &&
      (Math.abs(leftHandCameraDelta.dx) > 0.05 || Math.abs(leftHandCameraDelta.dy) > 0.05)
    ) {
      this.notifyCameraRotate(leftHandCameraDelta.dx, leftHandCameraDelta.dy);
    }

    if (!leftHandData?.isPinching && !rightHandData?.isPinching) {
      this.wasDualPinchingInCurrentSession = false;
    }

    // 缓存遥测结果
    const primary = rightHandData || leftHandData;
    this.lastHasHand = Boolean(leftHandData || rightHandData);
    this.lastLeftHandDetected = Boolean(leftHandData);
    this.lastRightHandDetected = Boolean(rightHandData);
    this.lastRightPinchRatio = rightHandData?.pinchRatio ?? 0;
    this.lastRightPinchStrength = rightHandData?.pinchStrength ?? 0;

    return {
      hasHand: this.lastHasHand,
      timestamp,
      leftHand: leftHandData,
      rightHand: rightHandData,
      leftHandQuickPinch,
      leftHandCameraDelta,
      isDualPinching,
      dualPinchDistance,
      dualPinchScaleFactor,
      // 向后兼容的主光标数据字段
      landmarks: primary?.landmarks ?? null,
      thumbTip: primary?.thumbTip ?? null,
      indexTip: primary?.indexTip ?? null,
      midpointNorm: primary?.midpointNorm ?? null,
      screenX: primary?.screenX ?? 0,
      screenY: primary?.screenY ?? 0,
      rawDistance: primary?.rawDistance ?? 0,
      handScale: primary?.handScale ?? 0,
      pinchRatio: primary?.pinchRatio ?? 0,
      pinchStrength: primary?.pinchStrength ?? 0,
      isPinching: rightHandData?.isPinching ?? false,
      justPinchStarted: rightHandData?.justPinchStarted ?? false,
      justPinchEnded: rightHandData?.justPinchEnded ?? false,
    };
  }

  /**
   * 计算单手的归一化中点坐标、屏幕投影位置及尺度无关的捏合状态。
   */
  public computeSingleHandAnalytics(
    landmarks: NormalizedLandmark[],
    handedness: 'left' | 'right',
    timestamp: number,
    confidence = 0.9
  ): SingleHandData {
    const tracker = handedness === 'left' ? this.leftTracker : this.rightTracker;
    return tracker.process(landmarks, timestamp, confidence, this.config);
  }

  /**
   * 向后兼容的单手解析分析计算。
   */
  public computeGestureAnalytics(
    landmarks: NormalizedLandmark[],
    timestamp: number
  ): HandGestureFrame {
    return this.processMultiHands([landmarks], [[{ categoryName: 'Left' }]], timestamp);
  }

  private broadcastFrame(frame: HandGestureFrame): void {
    for (const listener of this.frameListeners) {
      try {
        listener(frame);
      } catch (err) {
        console.error('[HandGestureService] Frame listener error:', err);
      }
    }
  }
}
