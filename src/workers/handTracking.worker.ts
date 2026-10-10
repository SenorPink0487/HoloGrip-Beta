/// <reference lib="webworker" />

import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';
import { HandTrackingPipeline } from '../vision/HandTrackingPipeline.ts';

let handLandmarker: HandTrackingPipeline | null = null;
let isInitializing = false;
let lastTimestamp = -1;
let activeDelegate: 'GPU' | 'CPU' = 'CPU';

const ctx: DedicatedWorkerGlobalScope = self as any;

// 在 Worker 中垫片 window 对象，确保 MediaPipe GPU/WebGL 逻辑正常运行
if (typeof (self as any).window === 'undefined') {
  (self as any).window = self;
}

// 在 ES Module Worker 中垫片 importScripts，避免 MediaPipe 内部尝试调用 document.createElement
if (typeof (self as any).importScripts !== 'function') {
  (self as any).importScripts = () => {
    throw new TypeError('Module worker does not support importScripts');
  };
}

// 实例化 Worker 共享的 OffscreenCanvas，用于初始化 WebGL GPU 上下文
const defaultWorkerCanvas =
  typeof OffscreenCanvas !== 'undefined'
    ? (new OffscreenCanvas(256, 192) as any)
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

  // 绕过 Worker 中 Emscripten Safari getContext 包装检查
  if (typeof defaultWorkerCanvas.getContext === 'function') {
    defaultWorkerCanvas.getContextSafariWebGL2Fixed = defaultWorkerCanvas.getContext.bind(defaultWorkerCanvas);
  }
}

// 绕过 Worker 中所有 OffscreenCanvas 实例的 Emscripten Safari getContext 包装检查
if (typeof OffscreenCanvas !== 'undefined' && OffscreenCanvas.prototype) {
  if (typeof (OffscreenCanvas.prototype as any).getContextSafariWebGL2Fixed === 'undefined') {
    (OffscreenCanvas.prototype as any).getContextSafariWebGL2Fixed = OffscreenCanvas.prototype.getContext;
  }
}

// 保持 ModuleFactory 引用，防止 MediaPipe 重新初始化时将其清空
let _preservedModuleFactory: any = undefined;
Object.defineProperty(self, 'ModuleFactory', {
  get: () => _preservedModuleFactory,
  set: (val: any) => {
    if (val) {
      _preservedModuleFactory = val;
    }
  },
  configurable: true,
  enumerable: true,
});

// 在 Worker 全局作用域中垫片 HTMLCanvasElement 与 WebGLRenderingContext
if (typeof (self as any).HTMLCanvasElement === 'undefined' && typeof OffscreenCanvas !== 'undefined') {
  (self as any).HTMLCanvasElement = OffscreenCanvas;
}

if (typeof (self as any).WebGLRenderingContext === 'undefined') {
  // 使用独立的虚拟类，使 Emscripten 的 fixedGetContext 校验中：
  // ((ver == "webgl") == (gl instanceof WebGLRenderingContext)) ? gl : null
  // 对 WebGL2RenderingContext 实例计算为 false
  (self as any).WebGLRenderingContext = class WebGLRenderingContext {};
}

// 使用预绑定的 Worker Canvas 初始化 Emscripten Module 对象
if (typeof (self as any).Module === 'undefined') {
  (self as any).Module = {};
}
if (defaultWorkerCanvas) {
  (self as any).Module.canvas = defaultWorkerCanvas;
  (self as any).Module.canvasWebGpu = defaultWorkerCanvas;
}

// 为 Emscripten 目标解析垫片 document 及元素选择器
if (typeof (self as any).document === 'undefined' || !(self as any).document.getElementById) {
  (self as any).document = {
    createElement: (tag: string) => {
      if (tag === 'canvas') {
        return defaultWorkerCanvas || (typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(256, 192) : {});
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
      // 显式传入 useModule: true，使 MediaPipe 正确加载 ES Module 版本的 vision_wasm_module_internal.js
      const vision = await FilesetResolver.forVisionTasks(wasmBasePath, true);

      console.log('[HandTrackingWorker] Initializing HandLandmarker model from:', modelAssetPath);

      const createPipeline = async (delegate: 'GPU' | 'CPU') => {
        const createDetector = (hands: number, canvas: OffscreenCanvas | null) => {
          const gpuOptions = {
            baseOptions: { modelAssetPath, delegate },
            runningMode: 'VIDEO' as const,
            numHands: hands,
            minHandDetectionConfidence: minDetectionConfidence ?? 0.5,
            minHandPresenceConfidence: minDetectionConfidence ?? 0.5,
            minTrackingConfidence: minTrackingConfidence ?? 0.5,
            ...(delegate === 'GPU' && canvas ? { canvas } : {}),
          };
          return HandLandmarker.createFromOptions(vision, gpuOptions);
        };

        // Fixed graphs preserve their own ROI history and GPU programs. Never
        // change numHands in the inference loop: it recompiles the entire graph.
        const single = await createDetector(1, defaultWorkerCanvas);
        try {
          const dual = (numHands ?? 2) >= 2
            ? await createDetector(2, typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(256, 192) : null)
            : null;
          return new HandTrackingPipeline(single, dual);
        } catch (err) {
          single.close();
          throw err;
        }
      };

      if (requestedDelegate === 'CPU') {
        handLandmarker = await createPipeline('CPU');
        activeDelegate = 'CPU';
      } else {
        try {
          handLandmarker = await createPipeline('GPU');
          activeDelegate = 'GPU';
        } catch (gpuErr) {
          console.warn('[HandTrackingWorker] GPU initialization failed, using CPU:', gpuErr);
          handLandmarker = await createPipeline('CPU');
          activeDelegate = 'CPU';
        }
      }
      lastTimestamp = -1;

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
    const { imageBitmap, timestamp, frameId, sessionId } = e.data;

    if (!handLandmarker) {
      if (imageBitmap && typeof imageBitmap.close === 'function') {
        imageBitmap.close();
      }
      ctx.postMessage({ type: 'DETECT_ERROR', error: 'Tracker is not initialized', timestamp, frameId, sessionId });
      return;
    }

    const tStart = performance.now();

    try {
      // 严格强制单调递增的时间戳，以满足 MediaPipe VIDEO 模式的不变量要求
      const safeTimestamp = Math.max(lastTimestamp + 1, Math.round(timestamp));
      lastTimestamp = safeTimestamp;
      const results = handLandmarker.detectForVideo(imageBitmap, safeTimestamp);
      const latencyMs = performance.now() - tStart;
      if (imageBitmap && typeof imageBitmap.close === 'function') {
        imageBitmap.close();
      }

      ctx.postMessage({
        type: 'DETECT_RESULT',
        frameId,
        sessionId,
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
        frameId,
        sessionId,
        error: err instanceof Error ? `${err.message}\n${err.stack}` : String(err),
        timestamp,
      });
    }
  } else if (type === 'CLOSE') {
    if (handLandmarker) {
      handLandmarker.close();
      handLandmarker = null;
    }
    isInitializing = false;
    lastTimestamp = -1;
  }
};

