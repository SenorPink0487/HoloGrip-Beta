/// <reference lib="webworker" />

import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';

let handLandmarker: HandLandmarker | null = null;
let isInitializing = false;
let lastTimestamp = -1;

const ctx: DedicatedWorkerGlobalScope = self as any;

// Polyfill window in worker to enable MediaPipe GPU/WebGL routines without crashing
if (typeof (self as any).window === 'undefined') {
  (self as any).window = self;
}

// Polyfill importScripts in ES module worker to prevent MediaPipe $h from attempting document.createElement
if (typeof (self as any).importScripts !== 'function') {
  (self as any).importScripts = () => {
    throw new TypeError('Module worker does not support importScripts');
  };
}

// Polyfill minimal document / OffscreenCanvas in worker to safeguard MediaPipe canvas fallback routines
if (typeof (self as any).document === 'undefined') {
  (self as any).document = {
    createElement: (tag: string) => {
      if (tag === 'canvas' && typeof OffscreenCanvas !== 'undefined') {
        const offscreen = new OffscreenCanvas(256, 256) as any;
        offscreen.style = {};
        offscreen.getBoundingClientRect = () => ({
          left: 0,
          top: 0,
          width: offscreen.width,
          height: offscreen.height,
          right: offscreen.width,
          bottom: offscreen.height,
          x: 0,
          y: 0,
        });
        offscreen.clientWidth = offscreen.width;
        offscreen.clientHeight = offscreen.height;
        offscreen.clientLeft = 0;
        offscreen.clientTop = 0;
        offscreen.addEventListener = () => {};
        offscreen.removeEventListener = () => {};
        offscreen.dispatchEvent = () => true;
        return offscreen;
      }
      return {};
    },
    body: {
      appendChild: () => {},
      removeChild: () => {},
    },
  };
}

ctx.onmessage = async (e: MessageEvent) => {
  const { type } = e.data;

  if (type === 'INIT') {
    if (handLandmarker) {
      ctx.postMessage({ type: 'INIT_SUCCESS' });
      return;
    }
    if (isInitializing) return;
    isInitializing = true;

    const {
      wasmBasePath,
      modelAssetPath,
      numHands,
      minDetectionConfidence,
      minTrackingConfidence,
    } = e.data;

    try {
      console.log('[HandTrackingWorker] Loading local MediaPipe Vision WASM from:', wasmBasePath);
      // Explicitly pass useModule: true so MediaPipe loads ES module vision_wasm_module_internal.js
      const vision = await FilesetResolver.forVisionTasks(wasmBasePath, true);

      console.log('[HandTrackingWorker] Initializing HandLandmarker model from:', modelAssetPath);

      // Attempt GPU delegate first, fallback to CPU delegate
      try {
        handLandmarker = await HandLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath,
            delegate: 'GPU',
          },
          runningMode: 'VIDEO',
          numHands: numHands ?? 2,
          minHandDetectionConfidence: minDetectionConfidence ?? 0.5,
          minHandPresenceConfidence: minDetectionConfidence ?? 0.5,
          minTrackingConfidence: minTrackingConfidence ?? 0.5,
        });
        console.log(`[HandTrackingWorker] HandLandmarker initialized with GPU delegate (numHands: ${numHands})`);
      } catch (gpuErr) {
        console.warn('[HandTrackingWorker] GPU delegate failed in worker, falling back to CPU delegate:', gpuErr);
        handLandmarker = await HandLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath,
            delegate: 'CPU',
          },
          runningMode: 'VIDEO',
          numHands: numHands ?? 2,
          minHandDetectionConfidence: minDetectionConfidence ?? 0.5,
          minHandPresenceConfidence: minDetectionConfidence ?? 0.5,
          minTrackingConfidence: minTrackingConfidence ?? 0.5,
        });
        console.log(`[HandTrackingWorker] HandLandmarker initialized with CPU delegate (numHands: ${numHands})`);
      }

      isInitializing = false;
      ctx.postMessage({ type: 'INIT_SUCCESS' });
    } catch (err: any) {
      isInitializing = false;
      console.error('[HandTrackingWorker] Failed to initialize MediaPipe HandLandmarker in worker:', err);
      ctx.postMessage({
        type: 'INIT_ERROR',
        error: err instanceof Error ? err.message : String(err),
      });
    }
  } else if (type === 'DETECT') {
    const { imageBitmap, timestamp } = e.data;

    if (!handLandmarker) {
      if (imageBitmap && typeof imageBitmap.close === 'function') {
        imageBitmap.close();
      }
      return;
    }

    const tStart = performance.now();

    try {
      // Enforce strictly monotonic timestamp to adhere to MediaPipe VIDEO mode invariants
      const safeTimestamp = Math.max(lastTimestamp + 1, Math.round(timestamp));
      lastTimestamp = safeTimestamp;
      const results = handLandmarker.detectForVideo(imageBitmap, safeTimestamp);
      const latencyMs = performance.now() - tStart;
      if (imageBitmap && typeof imageBitmap.close === 'function') {
        imageBitmap.close();
      }

      ctx.postMessage({
        type: 'DETECT_RESULT',
        landmarks: results.landmarks || [],
        handedness: results.handedness || [],
        timestamp: safeTimestamp,
        latencyMs,
      });
    } catch (err: any) {
      if (imageBitmap && typeof imageBitmap.close === 'function') {
        imageBitmap.close();
      }
      ctx.postMessage({
        type: 'DETECT_ERROR',
        error: err instanceof Error ? err.message : String(err),
        timestamp,
      });
    }
  } else if (type === 'CLOSE') {
    if (handLandmarker) {
      handLandmarker.close();
      handLandmarker = null;
    }
    isInitializing = false;
  }
};
