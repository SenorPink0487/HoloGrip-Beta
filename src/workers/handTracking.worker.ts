/// <reference lib="webworker" />

import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';

let handLandmarker: HandLandmarker | null = null;
let isInitializing = false;
let lastTimestamp = -1;
let activeDelegate: 'GPU' | 'CPU' = 'CPU';

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

// Instantiate shared worker OffscreenCanvas for WebGL GPU context initialization
const defaultWorkerCanvas =
  typeof OffscreenCanvas !== 'undefined'
    ? (new OffscreenCanvas(320, 240) as any)
    : null;

if (defaultWorkerCanvas) {
  defaultWorkerCanvas.style = {};
  defaultWorkerCanvas.clientWidth = defaultWorkerCanvas.width;
  defaultWorkerCanvas.clientHeight = defaultWorkerCanvas.height;
  defaultWorkerCanvas.clientLeft = 0;
  defaultWorkerCanvas.clientTop = 0;
  defaultWorkerCanvas.tagName = 'CANVAS';
  defaultWorkerCanvas.nodeName = 'CANVAS';
  defaultWorkerCanvas.getBoundingClientRect = () => ({
    left: 0,
    top: 0,
    width: defaultWorkerCanvas.width,
    height: defaultWorkerCanvas.height,
    right: defaultWorkerCanvas.width,
    bottom: defaultWorkerCanvas.height,
    x: 0,
    y: 0,
  });
  defaultWorkerCanvas.addEventListener = () => {};
  defaultWorkerCanvas.removeEventListener = () => {};
  defaultWorkerCanvas.dispatchEvent = () => true;

  // Bypass Emscripten Safari getContext wrap check in workers
  if (typeof defaultWorkerCanvas.getContext === 'function') {
    defaultWorkerCanvas.getContextSafariWebGL2Fixed = defaultWorkerCanvas.getContext.bind(defaultWorkerCanvas);
  }
}

// Polyfill HTMLCanvasElement and WebGLRenderingContext in worker global scope
if (typeof (self as any).HTMLCanvasElement === 'undefined' && typeof OffscreenCanvas !== 'undefined') {
  (self as any).HTMLCanvasElement = OffscreenCanvas;
}

if (typeof (self as any).WebGLRenderingContext === 'undefined') {
  if (typeof WebGL2RenderingContext !== 'undefined') {
    (self as any).WebGLRenderingContext = WebGL2RenderingContext;
  }
}

// Initialize Emscripten Module object with pre-bound worker canvas
if (typeof (self as any).Module === 'undefined') {
  (self as any).Module = {};
}
if (defaultWorkerCanvas) {
  (self as any).Module.canvas = defaultWorkerCanvas;
  (self as any).Module.canvasWebGpu = defaultWorkerCanvas;
}

// Polyfill document and element selectors for Emscripten target resolution
if (typeof (self as any).document === 'undefined' || !(self as any).document.getElementById) {
  (self as any).document = {
    createElement: (tag: string) => {
      if (tag === 'canvas') {
        return defaultWorkerCanvas || (typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(320, 240) : {});
      }
      return {};
    },
    getElementById: (_id: string) => defaultWorkerCanvas,
    querySelector: (_sel: string) => defaultWorkerCanvas,
    querySelectorAll: (_sel: string) => (defaultWorkerCanvas ? [defaultWorkerCanvas] : []),
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
      ctx.postMessage({ type: 'INIT_SUCCESS', delegate: activeDelegate });
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
      delegate: requestedDelegate,
    } = e.data;

    try {
      console.log('[HandTrackingWorker] Loading local MediaPipe Vision WASM from:', wasmBasePath);
      // Explicitly pass useModule: true so MediaPipe loads ES module vision_wasm_module_internal.js
      const vision = await FilesetResolver.forVisionTasks(wasmBasePath, true);

      console.log('[HandTrackingWorker] Initializing HandLandmarker model from:', modelAssetPath);

      if (requestedDelegate === 'CPU') {
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
        activeDelegate = 'CPU';
        console.log(`[HandTrackingWorker] HandLandmarker initialized with CPU delegate (numHands: ${numHands})`);
      } else {
        // Attempt GPU delegate with explicit canvas binding first, fallback to CPU delegate
        try {
          const gpuOptions: any = {
            baseOptions: {
              modelAssetPath,
              delegate: 'GPU',
            },
            runningMode: 'VIDEO',
            numHands: numHands ?? 2,
            minHandDetectionConfidence: minDetectionConfidence ?? 0.5,
            minHandPresenceConfidence: minDetectionConfidence ?? 0.5,
            minTrackingConfidence: minTrackingConfidence ?? 0.5,
          };
          if (defaultWorkerCanvas) {
            gpuOptions.canvas = defaultWorkerCanvas;
          }

          handLandmarker = await HandLandmarker.createFromOptions(vision, gpuOptions);
          activeDelegate = 'GPU';
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
          activeDelegate = 'CPU';
          console.log(`[HandTrackingWorker] HandLandmarker initialized with CPU delegate (numHands: ${numHands})`);
        }
      }

      isInitializing = false;
      ctx.postMessage({
        type: 'INIT_SUCCESS',
        delegate: activeDelegate,
      });
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
        delegate: activeDelegate,
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

