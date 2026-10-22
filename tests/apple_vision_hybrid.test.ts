import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// 导入待测组件
import { AppleVisionTracker } from '../src/vision/AppleVisionTracker.ts';
import { HandGestureService } from '../src/vision/HandGestureService.ts';
import type { HandGestureFrame, NormalizedLandmark } from '../src/vision/types.ts';

console.log('=== Starting Apple Vision Hybrid Architecture Tests ===\n');

// Test 1: Native Swift & Rust Native Files Integrity
{
  console.log('Test 1: Native Swift & Rust Native Files Integrity');
  const swiftManagerPath = path.join(rootDir, 'src-tauri/native_ios/AppleVisionHandManager.swift');
  const swiftPluginPath = path.join(rootDir, 'src-tauri/native_ios/AppleVisionPlugin.swift');
  const rustBridgePath = path.join(rootDir, 'src-tauri/src/apple_vision.rs');
  const packagePath = path.join(rootDir, 'src-tauri/native_ios/Package.swift');

  assert(fs.existsSync(swiftManagerPath), 'AppleVisionHandManager.swift must exist');
  assert(fs.existsSync(swiftPluginPath), 'AppleVisionPlugin.swift must exist');
  assert(fs.existsSync(rustBridgePath), 'apple_vision.rs must exist');
  assert(fs.existsSync(packagePath), 'Native Swift package must exist in the repository');

  const swiftCode = fs.readFileSync(swiftManagerPath, 'utf-8');
  assert(swiftCode.includes('VNDetectHumanHandPoseRequest'), 'Must use VNDetectHumanHandPoseRequest');
  assert(swiftCode.includes('maximumHandCount = 2'), 'Must configure maximumHandCount = 2 for dual hand tracking');
  assert(swiftCode.includes('AVCaptureSession'), 'Must manage native AVCaptureSession');
  assert(swiftCode.includes('window.__hologrip_onAppleVisionFrame'), 'Must dispatch via direct JS evaluateJavaScript');
  assert(swiftCode.includes('thumbTip') && swiftCode.includes('indexTip'), 'Must extract thumb and index joints');
  assert(swiftCode.includes('currentInterfaceVideoOrientation'), 'Must dynamically sync videoOrientation with UI');
  assert(!swiftCode.includes('points.append(["x": 0.5, "y": 0.5'), 'Must NEVER snap missing joints to (0.5, 0.5)');
  assert(swiftCode.includes('smoothLandmarks'), 'Must provide temporal smoothing for bone stability');
  assert(swiftCode.includes('encodePixelBufferToJpegBase64'), 'Must encode video preview frames for HUD');

  const nativePackage = fs.readFileSync(packagePath, 'utf-8');
  assert(nativePackage.includes('.linkedFramework("AVFoundation")'), 'Native package must link AVFoundation');
  assert(nativePackage.includes('.linkedFramework("Vision")'), 'Native package must link Vision');

  const rustCode = fs.readFileSync(rustBridgePath, 'utf-8');
  assert(rustCode.includes('apple_vision_is_supported'), 'Rust module must export apple_vision_is_supported command');
  assert(rustCode.includes('apple_vision_start'), 'Rust module must export apple_vision_start command');
  assert(rustCode.includes('apple_vision_stop'), 'Rust module must export apple_vision_stop command');

  console.log('✓ Test 1 passed: Native Swift package and Rust FFI files verified\n');
}

// Test 2: AppleVisionTracker Environment Detection & Mock Support
await (async () => {
  console.log('Test 2: AppleVisionTracker Environment Detection & Mock Support');
  const tracker = new AppleVisionTracker();

  // 默认在 Node.js 测试环境下，未注入 window 时 isAppleApp 应返回 false
  assert.strictEqual(tracker.isAppleApp(), false);
  const supportedDefault = await tracker.isSupported();
  assert.strictEqual(supportedDefault, false);

  // 开启 Mock 标志测试
  (globalThis as any).window = globalThis;
  (globalThis as any).__hologrip_mock_apple_vision = true;

  assert.strictEqual(tracker.isAppleApp(), true);
  const supportedMock = await tracker.isSupported();
  assert.strictEqual(supportedMock, true);

  console.log('✓ Test 2 passed: AppleVisionTracker environment detection verified\n');
})();

// Test 3: AppleVisionTracker Native Frame Parsing & Coordinate Transformation
await (async () => {
  console.log('Test 3: AppleVisionTracker Native Frame Parsing & Coordinate Transformation');
  const tracker = new AppleVisionTracker();

  let capturedLandmarks: NormalizedLandmark[][] = [];
  let capturedHandedness: any[][] = [];
  let capturedTimestamp = 0;
  let capturedLatency = 0;

  await tracker.init((lms, hands, ts, lat) => {
    capturedLandmarks = lms;
    capturedHandedness = hands;
    capturedTimestamp = ts;
    capturedLatency = lat;
  });

  await tracker.start();
  assert.strictEqual(tracker.getIsRunning(), true);

  // 模拟 Swift 派发的原生 21 关节数据
  const dummy21Landmarks: NormalizedLandmark[] = Array.from({ length: 21 }, (_, i) => ({
    x: 0.3 + i * 0.01,
    y: 0.4 + i * 0.01,
    z: 0.0,
    visibility: 0.99,
  }));

  const mockNativePayload = {
    hasHand: true,
    timestamp: 1700000000000,
    latencyMs: 3.8,
    frameId: 101,
    hands: [
      {
        landmarks: dummy21Landmarks,
        handedness: 'right' as const,
        confidence: 0.96,
      },
    ],
  };

  tracker.handleNativePayload(mockNativePayload);

  assert.strictEqual(capturedLandmarks.length, 1);
  assert.strictEqual(capturedLandmarks[0].length, 21);
  assert.strictEqual(capturedHandedness.length, 1);
  assert.strictEqual(capturedHandedness[0][0].categoryName, 'Right');
  assert.strictEqual(capturedHandedness[0][0].score, 0.96);
  assert.strictEqual(capturedLatency, 3.8);

  tracker.destroy();
  assert.strictEqual(tracker.getIsRunning(), false);

  console.log('✓ Test 3 passed: Native payload parsing and callback delivery verified\n');
})();

// Test 4: HandGestureService Hybrid Architecture Auto-Selection
await (async () => {
  console.log('Test 4: HandGestureService Hybrid Architecture Auto-Selection');

  // 当在 Apple Native 模式下初始化时，应自动激活 Apple Vision 架构
  (globalThis as any).__hologrip_mock_apple_vision = true;

  const service = new HandGestureService({
    mirrorX: true,
  });

  await service.init();
  assert.strictEqual(service.isAppleVision(), true, 'Must identify as Apple Vision active');
  assert.strictEqual(service.isWorkerMode(), false, 'Worker mode must be false when Apple Vision is active');
  assert.strictEqual(service.getStatus(), 'ready');

  const telemetryReady = service.getTelemetry();
  assert.strictEqual(telemetryReady.delegate, 'Apple Vision (ANE)');
  assert.strictEqual(telemetryReady.isAppleVision, true);
  assert.strictEqual(telemetryReady.backend, 'Apple Vision Framework (ANE Native)');

  // 启动手势追踪
  let receivedFrame: HandGestureFrame | null = null;
  service.onFrame((frame) => {
    receivedFrame = frame;
  });

  await service.start();
  assert.strictEqual(service.getStatus(), 'running');

  // 模拟从 Swift 注入一帧双手数据（左手 + 右手捏合）
  const left21: NormalizedLandmark[] = Array.from({ length: 21 }, () => ({ x: 0.2, y: 0.5, z: 0 }));
  const right21: NormalizedLandmark[] = Array.from({ length: 21 }, () => ({ x: 0.8, y: 0.5, z: 0 }));
  // 模拟右手拇指食指贴近产生捏合
  right21[4] = { x: 0.80, y: 0.50, z: 0 };
  right21[8] = { x: 0.81, y: 0.51, z: 0 };
  right21[0] = { x: 0.80, y: 0.70, z: 0 };
  right21[9] = { x: 0.80, y: 0.40, z: 0 };

  const tracker = service.getAppleVisionTracker();
  tracker.handleNativePayload({
    hasHand: true,
    timestamp: performance.now(),
    latencyMs: 4.2,
    hands: [
      { landmarks: left21, handedness: 'left', confidence: 0.98 },
      { landmarks: right21, handedness: 'right', confidence: 0.97 },
    ],
  });

  assert(receivedFrame !== null, 'Frame must be broadcast to listeners');
  assert.strictEqual(receivedFrame!.hasHand, true);
  assert(receivedFrame!.leftHand !== null, 'Left hand must be resolved');
  assert(receivedFrame!.rightHand !== null, 'Right hand must be resolved');

  // 测试暂停与恢复
  service.pause();
  assert.strictEqual(service.getStatus(), 'paused');
  service.resume();
  assert.strictEqual(service.getStatus(), 'running');

  // 停止与销毁
  service.stop();
  assert.strictEqual(service.getStatus(), 'ready');
  service.destroy();
  assert.strictEqual(service.getStatus(), 'uninitialized');

  // 清除 Mock 标志
  delete (globalThis as any).__hologrip_mock_apple_vision;

  console.log('✓ Test 4 passed: Hybrid mode selection, frame dispatch, and lifecycle verified\n');
})();

// Test 5: Fallback to MediaPipe Web Worker in Standard Browser Mode
await (async () => {
  console.log('Test 5: Fallback to MediaPipe Web Worker in Standard Browser Mode');
  // 确保没有 Apple Mock
  delete (globalThis as any).__hologrip_mock_apple_vision;

  const browserService = new HandGestureService();
  assert.strictEqual(browserService.isAppleVision(), false, 'Standard browser must not activate Apple Vision');
  assert.strictEqual((browserService as any).appleVisionTracker.isAppleApp(), false);

  console.log('✓ Test 5 passed: Non-Apple / Browser environments cleanly fallback to Web Worker\n');
})();

// Test 6: Right Hand Anatomical Mapping Invariance (Anti-Inversion Protection)
await (async () => {
  console.log('Test 6: Right Hand Anatomical Mapping Invariance (Anti-Inversion Protection)');
  (globalThis as any).__hologrip_mock_apple_vision = true;

  const service = new HandGestureService({ mirrorX: true });
  await service.init();
  assert.strictEqual(service.isAppleVision(), true);

  let capturedFrame: HandGestureFrame | null = null;
  service.onFrame((f) => {
    capturedFrame = f;
  });
  await service.start();

  // 模拟用户举起右手（Swift 发送 handedness='right', x 在相机中心偏左 0.4）
  const rightHandPoints: NormalizedLandmark[] = Array.from({ length: 21 }, () => ({ x: 0.4, y: 0.5, z: 0 }));
  rightHandPoints[0] = { x: 0.4, y: 0.7, z: 0 };
  rightHandPoints[4] = { x: 0.41, y: 0.40, z: 0 };
  rightHandPoints[8] = { x: 0.42, y: 0.40, z: 0 };
  rightHandPoints[9] = { x: 0.40, y: 0.45, z: 0 };

  const tracker = service.getAppleVisionTracker();
  tracker.handleNativePayload({
    hasHand: true,
    timestamp: performance.now(),
    latencyMs: 3.5,
    hands: [{ landmarks: rightHandPoints, handedness: 'right', confidence: 0.98 }],
    frameImage: 'data:image/jpeg;base64,mockdata',
  });

  assert(capturedFrame !== null, 'Frame must be delivered');
  assert(capturedFrame!.rightHand !== null, 'Anatomical Right Hand must be recognized as Right Hand, NEVER inverted to Left!');
  assert.strictEqual(capturedFrame!.leftHand, null, 'Left Hand must remain null when only Right Hand is present');
  assert.strictEqual(service.getLastFrameImage(), 'data:image/jpeg;base64,mockdata', 'Frame image must be cached');

  service.destroy();
  delete (globalThis as any).__hologrip_mock_apple_vision;
  console.log('✓ Test 6 passed: Right Hand anatomical mapping & camera preview image verified\n');
})();

console.log('========================================================');
console.log('All Apple Vision Hybrid Architecture Tests Passed Successfully (6/6)!');
console.log('========================================================\n');
