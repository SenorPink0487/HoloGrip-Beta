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
  midpointNorm: { x: number; y: number; z: number };
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

  // Two-hand tracking support
  leftHand: SingleHandData | null;
  rightHand: SingleHandData | null;

  // Left hand gestures
  leftHandQuickPinch: boolean;
  leftHandCameraDelta: { dx: number; dy: number } | null;

  // Dual-hand gestures (zoom/scale 3D geometry)
  isDualPinching?: boolean;
  dualPinchDistance?: number;
  dualPinchScaleFactor?: number;

  // Primary / Right Hand compatibility fields (drives VisionProCursor)
  landmarks: NormalizedLandmark[] | null;
  thumbTip: NormalizedLandmark | null;
  indexTip: NormalizedLandmark | null;
  midpointNorm: { x: number; y: number; z: number } | null;
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
  latencyMs: number;
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
  delegate?: 'GPU' | 'CPU' | 'unknown';
  errorMessage?: string;
}
