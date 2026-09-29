/// <reference lib="webworker" />

import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';

let handLandmarker: HandLandmarker | null = null;
let isInitializing = false;
let lastTimestamp = -1;
let activeDelegate: 'GPU' | 'CPU' = 'CPU';
let baseNumHands = 2;
let currentConfiguredNumHands = 2;
let trackedHandsCount = 0;
let consecutiveSingleHandFrames = 0;

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
        // 优先尝试绑定明确 Canvas 的 GPU 代理，失败后回退至 CPU 代理
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

      baseNumHands = numHands ?? 2;
      currentConfiguredNumHands = baseNumHands;
      trackedHandsCount = 0;
      consecutiveSingleHandFrames = 0;

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
      // 动态自适应手势调度（Adaptive Hand Scheduling）：
      // 当持续追踪单手时，每帧运行完整 BlazePalm SSD 手掌检测寻找不存在的第二只手会消耗 40-150ms；
      // 通过动态交替调度 numHands: 1（极速关键点追踪：~5ms）与
      // numHands: 2（周期性第二只手扫描：每 25 帧触发一次），
      // 单手追踪可达到 60-120+ FPS，并在伸出第二只手时保持无感知延迟。
      if (baseNumHands >= 2 && handLandmarker) {
        let desiredNumHands = baseNumHands;
        if (trackedHandsCount === 1) {
          consecutiveSingleHandFrames++;
          if (consecutiveSingleHandFrames >= 25) {
            desiredNumHands = 2;
            consecutiveSingleHandFrames = 0;
          } else {
            desiredNumHands = 1;
          }
        } else {
          consecutiveSingleHandFrames = 0;
        }

        if (desiredNumHands !== currentConfiguredNumHands) {
          try {
            if (typeof (handLandmarker as any).setOptions === 'function') {
              (handLandmarker as any).setOptions({ numHands: desiredNumHands });
              currentConfiguredNumHands = desiredNumHands;
            }
          } catch (_optErr) {}
        }
      }

      // 严格强制单调递增的时间戳，以满足 MediaPipe VIDEO 模式的不变量要求
      const safeTimestamp = Math.max(lastTimestamp + 1, Math.round(timestamp));
      lastTimestamp = safeTimestamp;
      const results = handLandmarker.detectForVideo(imageBitmap, safeTimestamp);
      const latencyMs = performance.now() - tStart;
      trackedHandsCount = results.landmarks ? results.landmarks.length : 0;
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
    trackedHandsCount = 0;
    consecutiveSingleHandFrames = 0;
    currentConfiguredNumHands = baseNumHands;
  }
};

