import { PointFilter2D } from './OneEuroFilter.ts';
import type {
  HandGestureFrame,
  HandGestureServiceConfig,
  NormalizedLandmark,
  SingleHandData,
  TrackerStatus,
  TrackerTelemetry,
} from './types.ts';

export class HandGestureService {
  private config: Required<HandGestureServiceConfig>;
  private videoElement: HTMLVideoElement | null = null;
  private mediaStream: MediaStream | null = null;
  private animFrameId: number | null = null;
  private videoFrameCallbackId: number | null = null;

  // Dedicated Web Worker architecture (main-thread fallback removed for peak 60/120 FPS performance)
  private worker: Worker | null = null;
  private isWorkerReady = false;
  private isWorkerBusy = false;
  private lastVideoCurrentTime = -1;

  private status: TrackerStatus = 'uninitialized';
  private errorMessage = '';

  // Dual-hand smoothing filters
  private rightPointFilter = new PointFilter2D(1.0, 0.007, 1.0);
  private leftPointFilter = new PointFilter2D(1.0, 0.007, 1.0);

  // Left hand gesture state machine
  private lastLeftIsPinching = false;
  private leftPinchStartTime: number | null = null;
  private leftPinchStartX = 0;
  private leftPinchStartY = 0;
  private leftLastScreenX = 0;
  private leftLastScreenY = 0;
  private isLeftLongPinch = false;

  // Right hand gesture state machine
  private lastRightIsPinching = false;
  private rightPinchStartTime: number | null = null;

  // Performance telemetry
  private frameCount = 0;
  private lastFpsTimestamp = performance.now();
  private currentFps = 0;
  private lastLatencyMs = 0;

  // Event listeners
  private frameListeners: Set<(frame: HandGestureFrame) => void> = new Set();
  private statusListeners: Set<(telemetry: TrackerTelemetry) => void> = new Set();
  private quickPinchMenuListeners: Set<() => void> = new Set();
  private cameraRotateListeners: Set<(dx: number, dy: number) => void> = new Set();

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
      filterMinCutoff: config.filterMinCutoff ?? 1.2,
      filterBeta: config.filterBeta ?? 0.035,
    };

    this.rightPointFilter = new PointFilter2D(this.config.filterMinCutoff, this.config.filterBeta, 1.0);
    this.leftPointFilter = new PointFilter2D(this.config.filterMinCutoff, this.config.filterBeta, 1.0);
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
      isPinching: this.lastRightIsPinching,
      pinchRatio: 0,
      pinchStrength: 0,
      handDetected: false,
      leftHandDetected: false,
      rightHandDetected: false,
      isLeftLongPinch: this.isLeftLongPinch,
      isLocalModel: true,
      isWorkerMode: Boolean(this.worker && this.isWorkerReady),
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
   * Initializes MediaPipe HandLandmarker exclusively inside dedicated Web Worker.
   * Main-thread fallback has been completely removed to prevent frame drops in 3D physics rendering.
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
      if (type === 'DETECT_RESULT') {
        this.isWorkerBusy = false;
        this.lastLatencyMs = e.data.latencyMs ?? 0;

        // Update FPS counter
        this.frameCount++;
        const now = performance.now();
        const elapsedFps = now - this.lastFpsTimestamp;
        if (elapsedFps >= 1000) {
          this.currentFps = Math.round((this.frameCount * 1000) / elapsedFps);
          this.frameCount = 0;
          this.lastFpsTimestamp = now;
        }

        const landmarksArray = (e.data.landmarks || []) as NormalizedLandmark[][];
        const handednessArray = (e.data.handedness || []) as any[][];

        const frame = this.processMultiHands(landmarksArray, handednessArray, e.data.timestamp);
        this.broadcastFrame(frame);
      } else if (type === 'DETECT_ERROR') {
        this.isWorkerBusy = false;
        console.warn('[HandGestureService] Worker detection error:', e.data.error);
      }
    };

    this.worker.onerror = (err) => {
      this.isWorkerBusy = false;
      this.status = 'error';
      this.errorMessage = err instanceof Error ? err.message : 'Worker runtime error';
      console.error('[HandGestureService] Worker runtime error:', err);
      this.notifyStatus();
    };
  }

  /**
   * Starts front camera stream and begins continuous hand tracking.
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
        this.videoElement.style.display = 'none';
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
      this.notifyStatus();
      this.rightPointFilter.reset();
      this.leftPointFilter.reset();
      this.lastRightIsPinching = false;
      this.lastLeftIsPinching = false;
      this.leftPinchStartTime = null;
      this.isLeftLongPinch = false;
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
    this.notifyStatus();
    this.startLoop();
  }

  public stop(): void {
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

    this.isWorkerBusy = false;
    this.lastVideoCurrentTime = -1;
    this.rightPointFilter.reset();
    this.leftPointFilter.reset();
    this.lastRightIsPinching = false;
    this.lastLeftIsPinching = false;
    this.leftPinchStartTime = null;
    this.isLeftLongPinch = false;
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
    if (this.worker) {
      try {
        this.worker.postMessage({ type: 'CLOSE' });
        this.worker.terminate();
      } catch {}
      this.worker = null;
    }
    this.isWorkerReady = false;
    this.isWorkerBusy = false;
  }

  private startLoop(): void {
    if (this.videoElement && typeof (this.videoElement as any).requestVideoFrameCallback === 'function') {
      const onVideoFrame = () => {
        if (this.status !== 'running') return;
        this.processFrame(true);
        if (this.videoElement && typeof (this.videoElement as any).requestVideoFrameCallback === 'function') {
          this.videoFrameCallbackId = (this.videoElement as any).requestVideoFrameCallback(onVideoFrame);
        }
      };
      this.videoFrameCallbackId = (this.videoElement as any).requestVideoFrameCallback(onVideoFrame);
    } else {
      const loop = () => {
        if (this.status !== 'running') return;
        this.processFrame(false);
        this.animFrameId = requestAnimationFrame(loop);
      };
      this.animFrameId = requestAnimationFrame(loop);
    }
  }

  private processFrame(isRvfCallback = false): void {
    const video = this.videoElement;
    if (!video || video.readyState < 2) {
      return;
    }

    // Skip if the camera hasn't presented a new frame yet (when running in rAF mode)
    if (!isRvfCallback) {
      if (video.currentTime === this.lastVideoCurrentTime) {
        return;
      }
      this.lastVideoCurrentTime = video.currentTime;
    } else {
      this.lastVideoCurrentTime = video.currentTime;
    }

    // Dedicated Web Worker mode: strictly offload inference to worker, main-thread fallback removed
    if (!this.worker || !this.isWorkerReady) {
      return;
    }

    if (this.isWorkerBusy) {
      // Rule 3: Frame Coalescing / LIFO. Worker is busy with in-flight frame, skip to eliminate backlog
      return;
    }

    this.isWorkerBusy = true;
    const tStart = performance.now();
    try {
      const vw = video.videoWidth || 640;
      const vh = video.videoHeight || 480;
      const targetW = 320;
      const targetH = Math.max(160, Math.round(targetW * (vh / vw))) || 240;

      const bitmapPromise = (typeof createImageBitmap === 'function')
        ? createImageBitmap(video, {
            resizeWidth: targetW,
            resizeHeight: targetH,
            resizeQuality: 'low',
          }).catch(() => createImageBitmap(video))
        : Promise.reject(new Error('createImageBitmap not supported'));

      bitmapPromise.then((bitmap) => {
        if (this.status !== 'running' || !this.worker) {
          if (typeof bitmap.close === 'function') bitmap.close();
          this.isWorkerBusy = false;
          return;
        }
        try {
          this.worker.postMessage(
            {
              type: 'DETECT',
              imageBitmap: bitmap,
              timestamp: tStart,
            },
            [bitmap]
          );
        } catch (postErr) {
          if (typeof bitmap.close === 'function') bitmap.close();
          this.isWorkerBusy = false;
          console.warn('[HandGestureService] Worker postMessage error:', postErr);
        }
      }).catch(() => {
        this.isWorkerBusy = false;
      });
    } catch {
      this.isWorkerBusy = false;
    }
  }

  /**
   * Processes up to 2 hands, separates Left vs Right Hand, and calculates gesture state machines.
   */
  public processMultiHands(
    detectedLandmarks: NormalizedLandmark[][],
    detectedHandedness: any[][],
    timestamp: number
  ): HandGestureFrame {
    if (!detectedLandmarks || detectedLandmarks.length === 0) {
      const rightJustEnded = this.lastRightIsPinching;
      this.lastRightIsPinching = false;
      this.lastLeftIsPinching = false;
      this.leftPinchStartTime = null;
      this.rightPinchStartTime = null;
      this.isLeftLongPinch = false;

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

    let leftHandData: SingleHandData | null = null;
    let rightHandData: SingleHandData | null = null;

    if (detectedLandmarks.length >= 2) {
      // Two hands visible
      const handA = detectedLandmarks[0];
      const handB = detectedLandmarks[1];

      // Screen X (mirrored) for each hand midpoint
      const midAx = (handA[4].x + handA[8].x) * 0.5;
      const midBx = (handB[4].x + handB[8].x) * 0.5;
      const screenAx = this.config.mirrorX ? 1.0 - midAx : midAx;
      const screenBx = this.config.mirrorX ? 1.0 - midBx : midBx;

      // In user's view, Left Hand is to user's left (smaller mirrored screenX)
      if (screenAx < screenBx) {
        leftHandData = this.computeSingleHandAnalytics(handA, 'left', timestamp);
        rightHandData = this.computeSingleHandAnalytics(handB, 'right', timestamp);
      } else {
        leftHandData = this.computeSingleHandAnalytics(handB, 'left', timestamp);
        rightHandData = this.computeSingleHandAnalytics(handA, 'right', timestamp);
      }
    } else {
      // Exactly 1 hand visible
      const hand = detectedLandmarks[0];
      const rawCategory = detectedHandedness?.[0]?.[0]?.categoryName;
      const midX = (hand[4].x + hand[8].x) * 0.5;
      const screenX = this.config.mirrorX ? 1.0 - midX : midX;

      // In front-camera mirror mode, MediaPipe 'Right' category corresponds to user's physical Left hand
      const isLeft = rawCategory ? rawCategory === 'Right' : screenX < 0.5;

      if (isLeft) {
        leftHandData = this.computeSingleHandAnalytics(hand, 'left', timestamp);
        if (this.lastRightIsPinching) {
          this.lastRightIsPinching = false;
          this.rightPinchStartTime = null;
        }
      } else {
        rightHandData = this.computeSingleHandAnalytics(hand, 'right', timestamp);
        if (this.lastLeftIsPinching) {
          this.lastLeftIsPinching = false;
          this.leftPinchStartTime = null;
          this.isLeftLongPinch = false;
        }
      }
    }

    // Process Left Hand gestures (Quick Pinch for Menu, Long Pinch for Camera view)
    let leftHandQuickPinch = false;
    let leftHandCameraDelta: { dx: number; dy: number } | null = null;

    if (leftHandData) {
      if (leftHandData.isPinching && leftHandData.isLongPinch) {
        const dx = leftHandData.screenX - this.leftLastScreenX;
        const dy = leftHandData.screenY - this.leftLastScreenY;
        this.leftLastScreenX = leftHandData.screenX;
        this.leftLastScreenY = leftHandData.screenY;
        leftHandCameraDelta = { dx, dy };
      }

      if (leftHandData.justPinchEnded) {
        const duration = leftHandData.pinchDuration;
        // 200毫秒以内全部被判定为快速捏合 (打开/切换悬浮窗口)
        if (duration <= this.config.quickPinchMaxDurationMs) {
          leftHandQuickPinch = true;
          this.notifyQuickPinchMenu();
        }
        this.leftPinchStartTime = null;
        this.isLeftLongPinch = false;
      }
    }

    if (
      leftHandCameraDelta &&
      (Math.abs(leftHandCameraDelta.dx) > 0.05 || Math.abs(leftHandCameraDelta.dy) > 0.05)
    ) {
      this.notifyCameraRotate(leftHandCameraDelta.dx, leftHandCameraDelta.dy);
    }

    // Right Hand drives the primary mouse cursor
    const right = rightHandData;

    return {
      hasHand: Boolean(leftHandData || rightHandData),
      timestamp,
      leftHand: leftHandData,
      rightHand: rightHandData,
      leftHandQuickPinch,
      leftHandCameraDelta,
      // Backward-compatible fields
      landmarks: right?.landmarks ?? null,
      thumbTip: right?.thumbTip ?? null,
      indexTip: right?.indexTip ?? null,
      midpointNorm: right?.midpointNorm ?? null,
      screenX: right?.screenX ?? 0,
      screenY: right?.screenY ?? 0,
      rawDistance: right?.rawDistance ?? 0,
      handScale: right?.handScale ?? 0,
      pinchRatio: right?.pinchRatio ?? 0,
      pinchStrength: right?.pinchStrength ?? 0,
      isPinching: right?.isPinching ?? false,
      justPinchStarted: right?.justPinchStarted ?? false,
      justPinchEnded: right?.justPinchEnded ?? false,
    };
  }

  /**
   * Computes normalized midpoint, screen projection, and scale-invariant pinch state for a single hand.
   */
  public computeSingleHandAnalytics(
    landmarks: NormalizedLandmark[],
    handedness: 'left' | 'right',
    timestamp: number,
    confidence = 0.9
  ): SingleHandData {
    const thumbTip = landmarks[4];
    const indexTip = landmarks[8];
    const wrist = landmarks[0];
    const middleMcp = landmarks[9];

    // Midpoint between thumb tip and index finger tip
    const midX = (thumbTip.x + indexTip.x) * 0.5;
    const midY = (thumbTip.y + indexTip.y) * 0.5;
    const midZ = (thumbTip.z + indexTip.z) * 0.5;

    // Front-camera horizontal mirroring
    const normCameraX = this.config.mirrorX ? 1.0 - midX : midX;
    const normCameraY = midY;

    // Remap with active margins
    const mX = this.config.activeMarginX;
    const mY = this.config.activeMarginY;
    const boundedNormX = Math.max(0, Math.min(1, (normCameraX - mX) / (1.0 - 2 * mX)));
    const boundedNormY = Math.max(0, Math.min(1, (normCameraY - mY) / (1.0 - 2 * mY)));

    // Viewport coordinates
    const viewWidth = typeof window !== 'undefined' ? window.innerWidth : 1920;
    const viewHeight = typeof window !== 'undefined' ? window.innerHeight : 1080;
    const rawScreenX = boundedNormX * viewWidth;
    const rawScreenY = boundedNormY * viewHeight;

    // Apply One Euro smoothing
    const filter = handedness === 'left' ? this.leftPointFilter : this.rightPointFilter;
    const smoothed = filter.filter(rawScreenX, rawScreenY, timestamp);

    // Compute 3D Euclidean distance between thumb tip and index tip
    const dx = thumbTip.x - indexTip.x;
    const dy = thumbTip.y - indexTip.y;
    const dz = (thumbTip.z - indexTip.z) * 0.7;
    const rawDistance = Math.hypot(dx, dy, dz);

    // Scale normalization using palm dimension (wrist to middle MCP)
    const palmDx = middleMcp.x - wrist.x;
    const palmDy = middleMcp.y - wrist.y;
    const palmDz = (middleMcp.z - wrist.z) * 0.7;
    const handScale = Math.hypot(palmDx, palmDy, palmDz) || 0.22;

    const pinchRatio = rawDistance / handScale;

    // Hysteresis
    const prevPinching = handedness === 'left' ? this.lastLeftIsPinching : this.lastRightIsPinching;
    let isPinching = prevPinching;
    if (!isPinching) {
      if (pinchRatio <= this.config.pinchThresholdEnter) {
        isPinching = true;
      }
    } else {
      if (pinchRatio >= this.config.pinchThresholdExit) {
        isPinching = false;
      }
    }

    const justPinchStarted = isPinching && !prevPinching;
    const justPinchEnded = !isPinching && prevPinching;

    if (handedness === 'left') {
      this.lastLeftIsPinching = isPinching;
    } else {
      this.lastRightIsPinching = isPinching;
    }

    const enterThresh = this.config.pinchThresholdEnter;
    const exitThresh = this.config.pinchThresholdExit;
    let pinchStrength = 0;
    if (isPinching) {
      pinchStrength = 1.0;
    } else if (pinchRatio < exitThresh) {
      pinchStrength = Math.max(
        0,
        Math.min(1, (exitThresh - pinchRatio) / (exitThresh - enterThresh))
      );
    }

    let pinchDuration = 0;
    let isLongPinch = false;

    if (handedness === 'left') {
      if (justPinchStarted) {
        this.leftPinchStartTime = timestamp;
        this.leftPinchStartX = smoothed.x;
        this.leftPinchStartY = smoothed.y;
        this.leftLastScreenX = smoothed.x;
        this.leftLastScreenY = smoothed.y;
        this.isLeftLongPinch = false;
      }

      if (isPinching && this.leftPinchStartTime !== null) {
        pinchDuration = Math.max(0, timestamp - this.leftPinchStartTime);
        const distMoved = Math.hypot(smoothed.x - this.leftPinchStartX, smoothed.y - this.leftPinchStartY);
        // Continuous pinch (拖拽视角): 仅在超过快速捏合时间阈值 (> 200ms) 且有手部移动或长按时激活
        if (pinchDuration > this.config.quickPinchMaxDurationMs) {
          if (distMoved >= 20 || pinchDuration >= this.config.quickPinchMaxDurationMs + 80) {
            this.isLeftLongPinch = true;
          }
        }
        isLongPinch = this.isLeftLongPinch;
      } else if (justPinchEnded && this.leftPinchStartTime !== null) {
        pinchDuration = Math.max(0, timestamp - this.leftPinchStartTime);
        // 200毫秒以内松开全部被判定为快速捏合 (非持续长按)
        if (pinchDuration <= this.config.quickPinchMaxDurationMs) {
          this.isLeftLongPinch = false;
        }
        isLongPinch = this.isLeftLongPinch;
      }
    } else {
      if (justPinchStarted) {
        this.rightPinchStartTime = timestamp;
      }

      if ((isPinching || justPinchEnded) && this.rightPinchStartTime !== null) {
        pinchDuration = Math.max(0, timestamp - this.rightPinchStartTime);
      }

      if (justPinchEnded) {
        this.rightPinchStartTime = null;
      }
    }

    return {
      handedness,
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
      justPinchStarted,
      justPinchEnded,
      pinchDuration,
      isLongPinch,
    };
  }

  /**
   * Backward-compatible single-hand analytic computation.
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
