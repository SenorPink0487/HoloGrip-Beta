export interface NormalizedLandmark {
  x: number;
  y: number;
  z: number;
  visibility?: number;
}

export interface SingleHandData {
  handedness: 'left' | 'right';
  confidence: number;
  landmarks: NormalizedLandmark[];
  thumbTip: NormalizedLandmark;
  indexTip: NormalizedLandmark;
  /**
   * 交互光标归一化坐标基准点。
   * 以大拇指指尖上方接触面为锚点，彻底消除捏合动作中因食指位移带来的光标跳变与漂移。
   * 保留字段名以实现向后兼容。
   */
  midpointNorm: { x: number; y: number; z: number };
  /** 交互光标锚点（与 midpointNorm 一致，语义更明确） */
  interactionPointNorm?: { x: number; y: number; z: number };
  screenX: number;
  screenY: number;
  rawDistance: number;
  handScale: number;
  pinchRatio: number;
  pinchStrength: number;
  isPinching: boolean;
  justPinchStarted: boolean;
  justPinchEnded: boolean;
  pinchDuration: number;
  isLongPinch: boolean;
}

export interface HandGestureFrame {
  hasHand: boolean;
  timestamp: number;

  // 双手追踪支持
  leftHand: SingleHandData | null;
  rightHand: SingleHandData | null;

  // 左手手势控制
  leftHandQuickPinch: boolean;
  leftHandCameraDelta: { dx: number; dy: number } | null;

  // 双手协同手势（缩放/调整 3D 几何实体）
  isDualPinching?: boolean;
  dualPinchDistance?: number;
  dualPinchScaleFactor?: number;

  // 主交互手/右手兼容字段（驱动 VisionProCursor 光标）
  landmarks: NormalizedLandmark[] | null;
  thumbTip: NormalizedLandmark | null;
  indexTip: NormalizedLandmark | null;
  /** 交互光标归一化坐标基准点（兼容旧字段） */
  midpointNorm: { x: number; y: number; z: number } | null;
  /** 交互光标锚点（置于拇指上方，语义明确） */
  interactionPointNorm?: { x: number; y: number; z: number } | null;
  screenX: number;
  screenY: number;
  rawDistance: number;
  handScale: number;
  pinchRatio: number;
  pinchStrength: number;
  isPinching: boolean;
  justPinchStarted: boolean;
  justPinchEnded: boolean;
}

export interface HandGestureServiceConfig {
  modelAssetPath?: string;
  wasmBasePath?: string;
  mirrorX?: boolean;
  activeMarginX?: number;
  activeMarginY?: number;
  pinchThresholdEnter?: number;
  pinchThresholdExit?: number;
  minDetectionConfidence?: number;
  minTrackingConfidence?: number;
  numHands?: number;
  quickPinchMaxDurationMs?: number;
  cameraSensitivity?: number;
  useWorker?: boolean;
  filterMinCutoff?: number;
  filterBeta?: number;
  /**
   * 光标相对于大拇指指尖向上偏移的比例（相对于 handScale）。
   * 默认 0.08，将交互锚点置于大拇指上方接触面，彻底消除捏合动作中因食指位移带来的光标跳变与漂移。
   */
  cursorOffsetAboveThumbRatio?: number;
}

export interface DualHandPinchEvent {
  state: 'start' | 'move' | 'end';
  distance: number;
  initialDistance: number;
  scaleFactor: number;
}

export type TrackerStatus =
  | 'uninitialized'
  | 'loading'
  | 'ready'
  | 'running'
  | 'paused'
  | 'error';

export interface TrackerTelemetry {
  status: TrackerStatus;
  fps: number;
  /** Capture start to result delivery, including worker transport. */
  latencyMs: number;
  /** Time spent inside MediaPipe in the worker. */
  inferenceMs?: number;
  captureMs?: number;
  isPinching: boolean;
  isDualPinching?: boolean;
  pinchRatio: number;
  pinchStrength: number;
  handDetected: boolean;
  leftHandDetected: boolean;
  rightHandDetected: boolean;
  isLeftLongPinch: boolean;
  isLocalModel: boolean;
  isWorkerMode?: boolean;
  delegate?: 'GPU' | 'CPU' | 'Apple Vision (ANE)' | 'unknown';
  errorMessage?: string;
  backend?: string;
  isAppleVision?: boolean;
}
