import { PointFilter2D } from './OneEuroFilter.ts';
import type {
  HandGestureFrame,
  HandGestureServiceConfig,
  NormalizedLandmark,
  SingleHandData,
  TrackerStatus,
  TrackerTelemetry,
} from './types.ts';

const TRACKING_FRAME_WIDTH = 320;
const TRACKING_FRAME_HEIGHT = 240;

/**
 * Scale-invariant hysteresis pinch state machine based on HoloPhysics handPoseMath.
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

interface HandTrack {
  label: 'left' | 'right';
  lastWrist: { x: number; y: number } | null;
  lastSeenAt: number;
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

  // Dedicated Web Worker architecture (main-thread fallback removed for peak 60/120 FPS performance)
  private worker: Worker | null = null;
  private isWorkerReady = false;
  private isWorkerBusy = false;
  private lastVideoCurrentTime = -1;
  private captureCanvas: OffscreenCanvas | null = null;
  private captureContext: OffscreenCanvasRenderingContext2D | null = null;

  private status: TrackerStatus = 'uninitialized';
  private errorMessage = '';

  // Dual-hand smoothing filters
  private rightPointFilter = new PointFilter2D(1.0, 0.007, 1.0);
  private leftPointFilter = new PointFilter2D(1.0, 0.007, 1.0);

  // Temporal track continuity (HoloPhysics assignHandTracks)
  private leftTrack: HandTrack = { label: 'left', lastWrist: null, lastSeenAt: -Infinity };
  private rightTrack: HandTrack = { label: 'right', lastWrist: null, lastSeenAt: -Infinity };

  // Pinch state machines
  private leftPinchStateMachine = new PinchStateMachine(0.21, 0.27);
  private rightPinchStateMachine = new PinchStateMachine(0.21, 0.27);

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

  // Telemetry caching
  private lastHasHand = false;
  private lastLeftHandDetected = false;
  private lastRightHandDetected = false;
  private lastRightPinchRatio = 0;
  private lastRightPinchStrength = 0;

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
      filterBeta: config.filterBeta ?? 0.25,
    };

    this.rightPointFilter = new PointFilter2D(this.config.filterMinCutoff, this.config.filterBeta, 1.0);
    this.leftPointFilter = new PointFilter2D(this.config.filterMinCutoff, this.config.filterBeta, 1.0);
    this.leftPinchStateMachine = new PinchStateMachine(this.config.pinchThresholdEnter, this.config.pinchThresholdExit);
    this.rightPinchStateMachine = new PinchStateMachine(this.config.pinchThresholdEnter, this.config.pinchThresholdExit);
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
      pinchRatio: this.lastRightPinchRatio,
      pinchStrength: this.lastRightPinchStrength,
      handDetected: this.lastHasHand,
      leftHandDetected: this.lastLeftHandDetected,
      rightHandDetected: this.lastRightHandDetected,
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
        this.notifyStatus();

        // Zero-idle frame pipeline: if video has advanced, immediately process next frame without waiting for next rVFC tick
        if (this.status === 'running' && this.videoElement && this.videoElement.readyState >= 2) {
          if (this.videoElement.currentTime !== this.lastVideoCurrentTime) {
            this.processFrame(false);
          }
        }
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
        this.videoElement.style.position = 'fixed';
        this.videoElement.style.top = '0';
        this.videoElement.style.left = '0';
        this.videoElement.style.width = '1px';
        this.videoElement.style.height = '1px';
        this.videoElement.style.opacity = '0.001';
        this.videoElement.style.pointerEvents = 'none';
        this.videoElement.style.zIndex = '-99999';
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
      this.resetLeftHandState();
      this.resetRightHandState();
      this.leftTrack.lastWrist = null;
      this.leftTrack.lastSeenAt = -Infinity;
      this.rightTrack.lastWrist = null;
      this.rightTrack.lastSeenAt = -Infinity;
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
    this.captureCanvas = null;
    this.captureContext = null;
    this.rightPointFilter.reset();
    this.leftPointFilter.reset();
    this.resetLeftHandState();
    this.resetRightHandState();
    this.leftTrack.lastWrist = null;
    this.leftTrack.lastSeenAt = -Infinity;
    this.rightTrack.lastWrist = null;
    this.rightTrack.lastSeenAt = -Infinity;
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
    if (this.worker) {
      try {
        this.worker.postMessage({ type: 'CLOSE' });
        this.worker.terminate();
      } catch (_err) {}
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

    // Dedicated Web Worker mode: strictly offload inference to worker, main-thread fallback removed
    if (!this.worker || !this.isWorkerReady) {
      return;
    }

    if (this.isWorkerBusy) {
      // Rule 3: Frame Coalescing / LIFO. Worker is busy with in-flight frame, skip to eliminate backlog
      return;
    }

    // Record only frames accepted for processing. A camera callback may arrive
    // while the worker is busy; that latest frame must remain available when
    // the worker completes instead of being marked as already processed.
    if (!isRvfCallback && video.currentTime === this.lastVideoCurrentTime) {
      return;
    }
    this.lastVideoCurrentTime = video.currentTime;

    this.isWorkerBusy = true;
    const tStart = performance.now();
    try {
      let bitmapPromise: Promise<ImageBitmap> | null = null;
      if (typeof OffscreenCanvas !== 'undefined') {
        try {
          if (!this.captureCanvas) {
            this.captureCanvas = new OffscreenCanvas(TRACKING_FRAME_WIDTH, TRACKING_FRAME_HEIGHT);
            this.captureContext = this.captureCanvas.getContext('2d', { alpha: false });
          }
          if (this.captureContext && typeof this.captureCanvas.transferToImageBitmap === 'function') {
            this.captureContext.drawImage(video, 0, 0, TRACKING_FRAME_WIDTH, TRACKING_FRAME_HEIGHT);
            bitmapPromise = Promise.resolve(this.captureCanvas.transferToImageBitmap());
          }
        } catch (_err) {
          this.captureCanvas = null;
          this.captureContext = null;
        }
      }
      if (!bitmapPromise) {
        bitmapPromise = typeof createImageBitmap === 'function'
          ? createImageBitmap(video, {
            resizeWidth: TRACKING_FRAME_WIDTH,
            resizeHeight: TRACKING_FRAME_HEIGHT,
            resizeQuality: 'low',
          }).catch(() => createImageBitmap(video))
          : Promise.reject(new Error('createImageBitmap not supported'));
      }

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
    } catch (err) {
      this.isWorkerBusy = false;
    }
  }

  private resetLeftHandState(): void {
    this.lastLeftIsPinching = false;
    this.leftPinchStateMachine.reset();
    this.leftPinchStartTime = null;
    this.isLeftLongPinch = false;
  }

  private resetRightHandState(): void {
    this.lastRightIsPinching = false;
    this.rightPinchStateMachine.reset();
    this.rightPinchStartTime = null;
  }

  private trackDetectionCost(
    track: HandTrack,
    det: HandDetection,
    nowMs: number
  ): number {
    const score = Math.max(0, Math.min(1, det.score));
    const labelMismatch = det.label !== track.label;
    const recentlySeen = Number.isFinite(track.lastSeenAt) && nowMs - track.lastSeenAt <= 350;
    const continuity = recentlySeen && track.lastWrist
      ? Math.hypot(det.wrist.x - track.lastWrist.x, det.wrist.y - track.lastWrist.y)
      : 0.35;
    return continuity + (labelMismatch ? 0.4 * score : -0.08 * score);
  }

  private getHandScreenX(hand: NormalizedLandmark[]): number {
    const midX = (hand[4].x + hand[8].x) * 0.5;
    return this.config.mirrorX ? 1.0 - midX : midX;
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
      this.resetLeftHandState();
      this.resetRightHandState();
      this.lastHasHand = false;
      this.lastLeftHandDetected = false;
      this.lastRightHandDetected = false;
      this.lastRightPinchRatio = 0;
      this.lastRightPinchStrength = 0;

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
      const det0 = detections[0];
      const det1 = detections[1];

      // Cost matrix between persistent tracks and incoming detections (HoloPhysics assignHandTracks)
      const directCost = this.trackDetectionCost(this.leftTrack, det0, timestamp)
        + this.trackDetectionCost(this.rightTrack, det1, timestamp);
      const crossedCost = this.trackDetectionCost(this.leftTrack, det1, timestamp)
        + this.trackDetectionCost(this.rightTrack, det0, timestamp);

      let leftDet: HandDetection;
      let rightDet: HandDetection;

      if (Math.abs(directCost - crossedCost) < 0.05 || det0.label === det1.label) {
        // Tie-breaker or label collision: strictly order by screen space (left hand has smaller screenX)
        if (det0.screenX <= det1.screenX) {
          leftDet = det0;
          rightDet = det1;
        } else {
          leftDet = det1;
          rightDet = det0;
        }
      } else if (directCost <= crossedCost) {
        leftDet = det0;
        rightDet = det1;
      } else {
        leftDet = det1;
        rightDet = det0;
      }

      // Update persistent tracks
      this.leftTrack.lastWrist = leftDet.wrist;
      this.leftTrack.lastSeenAt = timestamp;
      this.rightTrack.lastWrist = rightDet.wrist;
      this.rightTrack.lastSeenAt = timestamp;

      leftHandData = this.computeSingleHandAnalytics(leftDet.landmarks, 'left', timestamp, leftDet.score);
      rightHandData = this.computeSingleHandAnalytics(rightDet.landmarks, 'right', timestamp, rightDet.score);
    } else {
      // Exactly 1 detection
      const det = detections[0];
      const costLeft = this.trackDetectionCost(this.leftTrack, det, timestamp);
      const costRight = this.trackDetectionCost(this.rightTrack, det, timestamp);

      if (costLeft < costRight) {
        this.leftTrack.lastWrist = det.wrist;
        this.leftTrack.lastSeenAt = timestamp;
        leftHandData = this.computeSingleHandAnalytics(det.landmarks, 'left', timestamp, det.score);
        this.resetRightHandState();
      } else {
        this.rightTrack.lastWrist = det.wrist;
        this.rightTrack.lastSeenAt = timestamp;
        rightHandData = this.computeSingleHandAnalytics(det.landmarks, 'right', timestamp, det.score);
        this.resetLeftHandState();
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

    // Cache telemetry values
    this.lastHasHand = Boolean(leftHandData || rightHandData);
    this.lastLeftHandDetected = Boolean(leftHandData);
    this.lastRightHandDetected = Boolean(rightHandData);
    this.lastRightPinchRatio = right?.pinchRatio ?? 0;
    this.lastRightPinchStrength = right?.pinchStrength ?? 0;

    return {
      hasHand: Boolean(leftHandData || rightHandData),
      timestamp,
      leftHand: leftHandData,
      rightHand: rightHandData,
      leftHandQuickPinch,
      leftHandCameraDelta,
      // Backward-compatible fields
      landmarks: right?.landmarks ?? leftHandData?.landmarks ?? null,
      thumbTip: right?.thumbTip ?? leftHandData?.thumbTip ?? null,
      indexTip: right?.indexTip ?? leftHandData?.indexTip ?? null,
      midpointNorm: right?.midpointNorm ?? leftHandData?.midpointNorm ?? null,
      screenX: right?.screenX ?? leftHandData?.screenX ?? 0,
      screenY: right?.screenY ?? leftHandData?.screenY ?? 0,
      rawDistance: right?.rawDistance ?? leftHandData?.rawDistance ?? 0,
      handScale: right?.handScale ?? leftHandData?.handScale ?? 0,
      pinchRatio: right?.pinchRatio ?? leftHandData?.pinchRatio ?? 0,
      pinchStrength: right?.pinchStrength ?? leftHandData?.pinchStrength ?? 0,
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

    // 2D image-plane distance excluding noisy monocular Z (following HoloPhysics handPoseMath)
    const rawDistance = Math.hypot(thumbTip.x - indexTip.x, thumbTip.y - indexTip.y);

    // Scale normalization using stable maximum of palm width and wrist-to-middle MCP
    const palmWidth = (landmarks[5] && landmarks[17])
      ? Math.hypot(landmarks[5].x - landmarks[17].x, landmarks[5].y - landmarks[17].y)
      : 0;
    const wristToMiddle = Math.hypot(middleMcp.x - wrist.x, middleMcp.y - wrist.y);
    const handScale = Math.max(palmWidth, wristToMiddle) || 0.22;

    const pinchRatio = rawDistance / handScale;

    // State machine update (HoloPhysics PinchStateMachine)
    const stateMachine = handedness === 'left' ? this.leftPinchStateMachine : this.rightPinchStateMachine;
    const { isPinching, justStarted: justPinchStarted, justEnded: justPinchEnded } = stateMachine.update(pinchRatio);

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
        if (pinchDuration > this.config.quickPinchMaxDurationMs) {
          if (distMoved >= 20 || pinchDuration >= this.config.quickPinchMaxDurationMs + 80) {
            this.isLeftLongPinch = true;
          }
        }
        isLongPinch = this.isLeftLongPinch;
      } else if (justPinchEnded && this.leftPinchStartTime !== null) {
        pinchDuration = Math.max(0, timestamp - this.leftPinchStartTime);
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
