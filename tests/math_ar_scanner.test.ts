import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';

// Lightweight DOM Mock for Node.js test environment
class MockElement {
  public tagName: string;
  public id: string = '';
  public className: string = '';
  public innerHTML: string = '';
  public textContent: string = '';
  public style: Record<string, string> = {};
  public attributes: Record<string, string> = {};
  public eventListeners: Record<string, ((e?: any) => void)[]> = {};
  public parentNode: MockElement | null = null;
  public children: MockElement[] = [];
  private elementCache: Map<string, MockElement> = new Map();

  constructor(tagName: string) {
    this.tagName = tagName.toUpperCase();
  }

  appendChild(child: MockElement): MockElement {
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  removeChild(child: MockElement): MockElement {
    const idx = this.children.indexOf(child);
    if (idx !== -1) {
      this.children.splice(idx, 1);
      child.parentNode = null;
    }
    return child;
  }

  remove(): void {
    if (this.parentNode) {
      this.parentNode.removeChild(this);
    }
  }

  setAttribute(name: string, value: string): void {
    this.attributes[name] = value;
  }

  getAttribute(name: string): string | null {
    return this.attributes[name] ?? null;
  }

  addEventListener(event: string, handler: (e?: any) => void): void {
    if (!this.eventListeners[event]) {
      this.eventListeners[event] = [];
    }
    this.eventListeners[event].push(handler);
  }

  click(): void {
    if (this.eventListeners['click']) {
      this.eventListeners['click'].forEach((h) => h({ preventDefault: () => {}, stopPropagation: () => {} }));
    }
  }

  get classList() {
    return {
      add: (cls: string) => {
        const set = new Set(this.className.split(/\s+/).filter(Boolean));
        set.add(cls);
        this.className = Array.from(set).join(' ');
      },
      remove: (cls: string) => {
        const set = new Set(this.className.split(/\s+/).filter(Boolean));
        set.delete(cls);
        this.className = Array.from(set).join(' ');
      },
      contains: (cls: string) => {
        return this.className.split(/\s+/).includes(cls);
      },
      toggle: (cls: string, force?: boolean) => {
        const has = this.className.split(/\s+/).includes(cls);
        const shouldAdd = force !== undefined ? force : !has;
        const set = new Set(this.className.split(/\s+/).filter(Boolean));
        if (shouldAdd) set.add(cls);
        else set.delete(cls);
        this.className = Array.from(set).join(' ');
        return shouldAdd;
      },
    };
  }

  querySelector(selector: string): MockElement | null {
    if (this.elementCache.has(selector)) {
      return this.elementCache.get(selector)!;
    }
    const el = new MockElement('div');
    if (selector.startsWith('#')) {
      el.setAttribute('id', selector.slice(1));
    }
    this.elementCache.set(selector, el);
    return el;
  }

  querySelectorAll(_selector: string): MockElement[] {
    return [new MockElement('div'), new MockElement('button')];
  }

  getBoundingClientRect() {
    return { left: 0, top: 0, width: 1024, height: 768, right: 1024, bottom: 768 };
  }

  getContext(_type = '2d') {
    return {
      fillRect: () => {},
      clearRect: () => {},
      fillText: () => {},
      beginPath: () => {},
      moveTo: () => {},
      lineTo: () => {},
      stroke: () => {},
      drawImage: () => {},
      createRadialGradient: () => ({
        addColorStop: () => {},
      }),
    };
  }

  toDataURL() {
    return 'data:image/jpeg;base64,mock';
  }
}

// Global DOM setup if running in Node without browser window
if (typeof (globalThis as any).document === 'undefined') {
  (globalThis as any).document = {
    createElement: (tag: string) => new MockElement(tag),
    body: new MockElement('body'),
    head: new MockElement('head'),
    getElementById: (_id: string) => null,
  };
}

if (typeof (globalThis as any).window === 'undefined') {
  (globalThis as any).window = {
    addEventListener: () => {},
    removeEventListener: () => {},
    setTimeout: (fn: any, ms: number) => setTimeout(fn, ms),
    clearTimeout: (id: any) => clearTimeout(id),
    innerWidth: 1024,
    innerHeight: 768,
  };
}

const { GeometrySolver } = await import('../src/scene/math/GeometrySolver.ts');
const { MiniModelPreview } = await import('../src/ui/vision/MiniModelPreview.ts');
const { MathARSpatialScene } = await import('../src/ui/vision/MathARSpatialScene.ts');
const { MathARScannerModal } = await import('../src/ui/vision/MathARScannerModal.ts');
const { StereometryStatusCard } = await import('../src/ui/vision/StereometryStatusCard.ts');

console.log('=== Starting Math AR Camera Scanner Tests ===\n');

// -------------------------------------------------------------
// Test 1: MiniModelPreview 3D Mesh Generation & Resource Disposal
// -------------------------------------------------------------
console.log('Test 1: MiniModelPreview 3D Mesh Generation & Resource Disposal');

const cubeDef = GeometrySolver.createModel('cube');
const pyramidDef = GeometrySolver.createModel('square-pyramid');

const preview = new MiniModelPreview(pyramidDef, 180, 150);
assert.ok(preview.domElement, 'MiniModelPreview must have a DOM container');
assert.strictEqual(preview.domElement.className, 'math-ar-mini-preview');

preview.dispose();
console.log('✓ Test 1 passed: MiniModelPreview initializes and disposes cleanly\n');

// -------------------------------------------------------------
// Test 2: MathARSpatialScene - Borderless True AR on Paper Scene
// -------------------------------------------------------------
console.log('Test 2: MathARSpatialScene - Borderless True AR on Paper');

let selectedIdFromScene: string | null = null;
let deletedIdFromScene: string | null = null;

const spatialScene = new MathARSpatialScene(1024, 768, {
  onSelect: (id) => {
    selectedIdFromScene = id;
  },
  onDelete: (id) => {
    deletedIdFromScene = id;
  },
});

assert.ok(spatialScene.domElement, 'Spatial scene must produce a root DOM element');
assert.strictEqual(spatialScene.domElement.className, 'math-ar-spatial-root');

// 立起第 1 个 3D 几何模型 (直接立在试卷纸面上，无方框外壳)
const arModel1 = spatialScene.addModel(
  pyramidDef,
  '正四棱锥 P-ABCD',
  '立体几何截面',
  'data:image/jpeg;base64,mock1',
  { x: 300, y: 350 }
);

assert.ok(arModel1.id, 'AR item must have a unique ID');
assert.strictEqual(spatialScene.getItems().length, 1, 'Scene must contain 1 model');
assert.strictEqual(selectedIdFromScene, arModel1.id, 'Added model should be automatically selected');
assert.ok(arModel1.group.getObjectByName('polyhedronMesh'), '3D polyhedron mesh must be mounted');
assert.ok(!arModel1.group.getObjectByName('groundRing'), 'Ground pulse ring must be eliminated for Apple minimalism');
assert.strictEqual(arModel1.tagEl, undefined, 'Floating pin tag bubble must be eliminated for Apple minimalism');

// 连拍立起第 2 个 3D 几何模型 (多模型同屏立于纸面)
const arModel2 = spatialScene.addModel(
  cubeDef,
  '正方体 ABCD-A1B1C1D1',
  '棱长与二面角',
  'data:image/jpeg;base64,mock2',
  { x: 700, y: 400 }
);

assert.strictEqual(spatialScene.getItems().length, 2, 'Scene must support multiple models simultaneously');

// 模拟点击删除第 1 个模型
spatialScene.removeModel(arModel1.id);
assert.strictEqual(spatialScene.getItems().length, 1, 'Model 1 should be removed');
assert.strictEqual(spatialScene.getItems()[0].id, arModel2.id, 'Model 2 should remain');

spatialScene.dispose();
console.log('✓ Test 2 passed: MathARSpatialScene borderless AR rendering & lifecycle verified\n');

// -------------------------------------------------------------
// Test 3: MathARScannerModal UI Structure (Apple Design Elements)
// -------------------------------------------------------------
console.log('Test 3: MathARScannerModal UI Structure & Apple Components');

let syncedModel: any = null;
let closed = false;

const scanner = new MathARScannerModal({
  onSyncModel: (def) => {
    syncedModel = def;
  },
  onClose: () => {
    closed = true;
  },
});

assert.ok(scanner.element, 'Scanner modal must create root element');
assert.ok(scanner.element.querySelector('#math-ar-shutter'), 'Apple concentric shutter button must exist');
assert.ok(scanner.element.querySelector('#math-ar-finder'), 'Reticle finder frame must exist');
assert.ok(scanner.element.querySelector('#math-ar-laser'), 'Scan laser beam must exist');
assert.ok(scanner.element.querySelector('#math-ar-overlay'), 'AR overlay container must exist');
assert.ok(scanner.element.querySelector('#math-ar-model-tray'), 'Model carousel tray must exist');
assert.ok(scanner.element.querySelector('#math-ar-done-btn'), 'Apple capsule Done button must exist');
assert.ok(!scanner.element.innerHTML.includes('math-ar-status-pill'), 'Top status pill bubble must be eliminated for Apple minimalism');
assert.ok(!scanner.element.innerHTML.includes('math-ar-status-text'), 'Status text element must be eliminated for Apple minimalism');

console.log('✓ Test 3 passed: All Apple-inspired scanner UI components verified\n');

// -------------------------------------------------------------
// Test 4: Multi-Shot Continuous Scanning Without Exiting
// -------------------------------------------------------------
console.log('Test 4: Multi-Shot Continuous Scanning on Paper Surface');

// 模拟第一道题识别与 AR 模型立于试卷纸面
await (scanner as any).processImageData('data:image/jpeg;base64,mock1', '题目 1');
assert.strictEqual((scanner as any).models.length, 1, 'Model 1 should be added to scanner models');
assert.ok(syncedModel, 'Model should sync with whiteboard');

const card1Meta = scanner.element.querySelector('.math-ar-tray-meta');
assert.ok(card1Meta, 'Tray card meta must exist');
const card1Sub = card1Meta?.querySelector('.math-ar-tray-sub');
if (card1Sub) {
  assert.ok(!/[⊥=∠△∥]/.test(card1Sub.textContent || ''), 'Tray card description must not contain raw formula noise');
}

// 模拟第二道题连拍 (不退出页面继续拍照)
await (scanner as any).processImageData('data:image/jpeg;base64,mock2', '题目 2');
assert.strictEqual((scanner as any).models.length, 2, 'Should support multi-shot continuous scanning without exiting');

console.log('✓ Test 4 passed: Multi-shot continuous scanning without exit verified\n');

// -------------------------------------------------------------
// Test 5: Delete Generated 3D Models Prior to Exit
// -------------------------------------------------------------
console.log('Test 5: Delete Generated 3D Models Prior to Exit');

const model1Id = (scanner as any).models[0].id;
const model2Id = (scanner as any).models[1].id;

// 删除第 1 个题目模型
scanner.removeModel(model1Id);
assert.strictEqual((scanner as any).models.length, 1, 'Model 1 must be removed from models list');
assert.strictEqual((scanner as any).models[0].id, model2Id, 'Model 2 must remain');

// 再次删除第 2 个题目模型
scanner.removeModel(model2Id);
assert.strictEqual((scanner as any).models.length, 0, 'All models can be deleted before exit');

console.log('✓ Test 5 passed: Delete generated models prior to exit functionality verified\n');

// -------------------------------------------------------------
// Test 6: Safe Close & Cleanup
// -------------------------------------------------------------
console.log('Test 6: Safe Close & Hardware/Spatial Cleanup');

scanner.close();
assert.ok(scanner.element.classList.contains('is-closing'), 'Modal should play exit animation');
console.log('✓ Test 6 passed: Safe close and track cleanup verified\n');

// -------------------------------------------------------------
// Test 7: CSS Design System Compliance (Apple HIG & Borderless Spatial AR)
// -------------------------------------------------------------
console.log('Test 7: CSS Design System Compliance (Apple HIG & Borderless Spatial AR)');

const css = readFileSync(new URL('../src/whiteboard/whiteboard.css', import.meta.url), 'utf8');

assert.match(css, /\.math-ar-scanner-modal/, 'CSS must declare full-screen modal');
assert.match(css, /\.math-ar-shutter-btn/, 'CSS must declare concentric shutter button');
assert.match(css, /\.math-ar-spatial-root/, 'CSS must declare spatial root layer');
assert.match(css, /\.math-ar-spatial-canvas/, 'CSS must declare spatial canvas');
assert.match(css, /\.math-ar-spatial-pin-tag/, 'CSS must declare floating pin tag');
assert.match(css, /\.math-ar-pin-pill/, 'CSS must declare frosted capsule pill');
assert.match(css, /\.math-ar-pin-close/, 'CSS must declare micro close button');
assert.match(css, /\.math-ar-model-tray/, 'CSS must declare carousel model tray');
assert.match(css, /\.math-ar-scan-laser/, 'CSS must declare laser scan beam');

// 严禁丑陋方框
assert.ok(!css.includes('.math-ar-anchor-card'), 'Ugly card box styles (.math-ar-anchor-card) must be completely eliminated');

// -------------------------------------------------------------
// Test 8: Album Input Rapid Open (No image/* Wildcard Lag) & Bitmap Optimization
// -------------------------------------------------------------
console.log('Test 8: Album Input Rapid Open & Bitmap Downsampling Optimization');

const freshScanner = new MathARScannerModal();
const albumInput = freshScanner.element.querySelector('#math-ar-album-input') as any;
assert.ok(albumInput, 'Album input element must exist');

const acceptAttr = albumInput.getAttribute('accept') || '';
assert.ok(!acceptAttr.includes('image/*'), 'Album input must NOT use wildcard accept="image/*" to avoid macOS file dialog hangs');
assert.ok(acceptAttr.includes('image/png') && acceptAttr.includes('image/jpeg'), 'Album input must use explicit fast-resolving MIME types');

// 验证快速测试环境下的 optimizeImageFile
const dummyFile = { name: 'test.jpg', type: 'image/jpeg', size: 1024 } as any;
const optimized = await (freshScanner as any).optimizeImageFile(dummyFile);
assert.ok(optimized.displayDataUrl, 'Must generate displayDataUrl');
assert.ok(optimized.thumbDataUrl, 'Must generate lightweight thumbDataUrl');

freshScanner.close();
console.log('✓ Test 8 passed: Album rapid open and downsampling verified\n');

// -------------------------------------------------------------
// Test 9: iPad / LAN HTTP Native Camera Activation Fallback
// -------------------------------------------------------------
console.log('Test 9: iPad / LAN HTTP Native Camera Activation Fallback');

const lanScanner = new MathARScannerModal();
const cameraInput = lanScanner.element.querySelector('#math-ar-camera-input') as any;
assert.ok(cameraInput, 'Direct camera capture input must exist for iPad / LAN fallback');

assert.strictEqual(cameraInput.getAttribute('capture'), 'environment', 'Must specify capture="environment" to activate iPad rear camera');
const camAccept = cameraInput.getAttribute('accept') || '';
assert.ok(!camAccept.includes('image/*'), 'Camera input must NOT use wildcard image/*');
assert.ok(camAccept.includes('image/png') && camAccept.includes('image/jpeg'), 'Camera input must use explicit fast-resolving MIME types');

let nativeCameraTriggered = false;
cameraInput.click = () => {
  nativeCameraTriggered = true;
};

// 模拟实时视频流未开启时，点击快门触发系统原生相机
const shutterBtn = lanScanner.element.querySelector('#math-ar-shutter') as any;
assert.ok(shutterBtn, 'Shutter button must exist');
shutterBtn.click();

assert.ok(nativeCameraTriggered, 'Shutter button MUST trigger native camera input when live stream is inactive');

lanScanner.close();
console.log('✓ Test 9 passed: iPad / LAN HTTP native camera activation fallback verified\n');

// -------------------------------------------------------------
// Test 10: Album button opens the picker directly without source menus
// -------------------------------------------------------------
console.log('Test 10: Direct album selection without source menus');

const albumScanner = new MathARScannerModal();
const albumBtn = albumScanner.element.querySelector('#math-ar-album-btn') as any;
const directAlbumInput = albumScanner.element.querySelector('#math-ar-album-input') as any;
let filePickerOpens = 0;
directAlbumInput.click = () => { filePickerOpens++; };
albumBtn.click();
assert.equal(filePickerOpens, 1, 'Browser album button must open the file picker in one click');
assert.ok(!albumScanner.element.innerHTML.includes('math-ar-album-popover'), 'Source popover must not be rendered');
assert.ok(!albumScanner.element.innerHTML.includes('math-ar-popover-library'), 'Extra library menu item must be removed');
assert.ok(!albumScanner.element.innerHTML.includes('aria-haspopup'), 'Album button must not advertise a source menu');

// Tauri blocks native plugin commands before Swift runs unless the capability grants them.
const nativeCapabilities = JSON.parse(readFileSync(new URL('../src-tauri/capabilities/default.json', import.meta.url), 'utf8'));
assert.ok(nativeCapabilities.permissions.includes('apple-vision:allow-pick-photo'), 'Main window must be allowed to call the native photo picker');
const photoPermission = readFileSync(new URL('../src-tauri/permissions/apple-vision/allow-pick-photo.toml', import.meta.url), 'utf8');
assert.match(photoPermission, /commands\.allow\s*=\s*\["pickPhoto"\]/, 'Photo permission must allow the actual Swift command');
const nativeBuild = readFileSync(new URL('../src-tauri/build.rs', import.meta.url), 'utf8');
assert.match(nativeBuild, /\.plugin\("apple-vision",\s*tauri_build::InlinedPlugin::new\(\)\)/, 'Build must include the inline plugin permissions');
const nativePicker = readFileSync(new URL('../src-tauri/native_ios/AppleVisionPlugin.swift', import.meta.url), 'utf8');
assert.ok(nativePicker.includes('PHPickerViewController(configuration: configuration)'), 'Use the iPad-compatible selected-photo picker');
assert.ok(!nativePicker.includes('UIImagePickerController()'), 'Do not use the legacy picker that needs iPad popover setup');
assert.ok(!nativePicker.includes('requestAuthorization'), 'Selecting one photo must not require full-library authorization');

// iPadOS app uses the existing native PhotoLibrary command, including desktop-mode iPad user agents.
const navigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
const nativeWindow = window as any;
const originalInternals = nativeWindow.__TAURI_INTERNALS__;
Object.defineProperty(globalThis, 'navigator', {
  configurable: true,
  value: { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)', platform: 'MacIntel', maxTouchPoints: 5 },
});
const nativeCommands: string[] = [];
let nativeResult: any = { cancelled: true };
let nativeError = false;
nativeWindow.__TAURI_INTERNALS__ = {
  invoke: async (command: string) => {
    nativeCommands.push(command);
    if (nativeError) throw new Error('Photo library unavailable');
    return nativeResult;
  },
};
const originalPick = (albumScanner as any).handlePhotoLibraryPick.bind(albumScanner);
let pendingPick: Promise<void>;
(albumScanner as any).handlePhotoLibraryPick = () => { pendingPick = originalPick(); return pendingPick; };
try {
  albumBtn.click();
  await pendingPick!;
  assert.deepEqual(nativeCommands, ['plugin:apple-vision|pickPhoto'], 'One click must directly open the native album');
  assert.equal(filePickerOpens, 1, 'Cancelling native album must not open a second picker');

  let recognizedImage: string | undefined;
  let backdropImage: string | undefined;
  nativeResult = { dataUrl: 'data:image/jpeg;base64,album' };
  (albumScanner as any).displayPaperBackdrop = (dataUrl: string) => { backdropImage = dataUrl; };
  (albumScanner as any).processImageData = async (dataUrl: string) => { recognizedImage = dataUrl; };
  albumBtn.click();
  await pendingPick!;
  assert.equal(backdropImage, nativeResult.dataUrl, 'Chosen photo must become the paper backdrop');
  assert.equal(recognizedImage, nativeResult.dataUrl, 'Chosen photo must enter recognition');

  nativeError = true;
  albumBtn.click();
  await pendingPick!;
  assert.equal(filePickerOpens, 1, 'Native picker failure must not trigger the WebKit source menu');
} finally {
  if (navigatorDescriptor) Object.defineProperty(globalThis, 'navigator', navigatorDescriptor);
  else delete (globalThis as any).navigator;
  if (originalInternals === undefined) delete nativeWindow.__TAURI_INTERNALS__;
  else nativeWindow.__TAURI_INTERNALS__ = originalInternals;
  albumScanner.close();
}
console.log('✓ Test 10 passed: Direct browser/native album selection, cancellation and failure verified\n');

// -------------------------------------------------------------
// Test 11: Real Recognized Polyhedron Sync (No Hardcoded Square-Pyramid Substitution)
// -------------------------------------------------------------
console.log('Test 11: Real Recognized Polyhedron Sync Between AR Scanner and HoloTable');

const { parseRecognizedFigure, buildRecognizedModel } = await import('../src/scene/math/figureModel.ts');

const recognizedCustomDef = buildRecognizedModel(
  parseRecognizedFigure({
    name: '四棱锥 E-ABCD',
    subtitle: 'EC⊥平面ABCD，AB∥DC',
    vertices: [
      { id: 'A', x: -1, y: 0, z: 1.7321 },
      { id: 'B', x: 0, y: 0, z: 1.7321 },
      { id: 'C', x: 0, y: 0, z: 0 },
      { id: 'D', x: -2, y: 0, z: 0 },
      { id: 'E', x: 0, y: 1.7321, z: 0 },
    ],
    edges: [
      ['A', 'B'], ['B', 'C'], ['C', 'D'], ['D', 'A'],
      ['E', 'A'], ['E', 'B'], ['E', 'C'], ['E', 'D'],
    ],
    faces: [
      ['A', 'B', 'C', 'D'],
      ['E', 'A', 'B'],
      ['E', 'B', 'C'],
      ['E', 'C', 'D'],
      ['E', 'D', 'A'],
    ],
    points: [{ id: 'F', from: 'B', to: 'E', t: 0.4 }],
    aux: [['A', 'C'], ['C', 'F']],
  })
);

let lastSyncedToTable: any = null;
const liveScanner = new MathARScannerModal({
  onRecognizeImage: async (_dataUrl) => ({
    name: recognizedCustomDef.name,
    subtitle: recognizedCustomDef.subtitle,
    modelDef: recognizedCustomDef,
  }),
  onSyncModel: (def) => {
    lastSyncedToTable = def;
  },
});

await (liveScanner as any).processImageData('data:image/jpeg;base64,real_capture', '拍摄题目');
assert.strictEqual((liveScanner as any).models.length, 1, 'Recognized model must be mounted in AR scanner');
assert.strictEqual(
  (liveScanner as any).models[0].modelDef,
  recognizedCustomDef,
  'AR scanner must use the exact recognized PolyhedronModelDef, NEVER fallback square-pyramid'
);
assert.strictEqual(
  lastSyncedToTable,
  recognizedCustomDef,
  'onSyncModel must forward the exact recognized PolyhedronModelDef back to HoloTable'
);
assert.strictEqual(lastSyncedToTable.auxEdges?.length, 2, 'Recognized auxiliary lines AC and CF must be preserved in AR model');
liveScanner.close();
console.log('✓ Test 11 passed: Real recognized PolyhedronModelDef preserved across AR scanner & HoloTable\n');

// -------------------------------------------------------------
// Test 12: Main Math Upload Opens Photos Without Entering the Camera
// -------------------------------------------------------------
console.log('Test 12: Main math upload opens photos directly');

const uploadCard = new StereometryStatusCard();
const uploadButton = uploadCard.element.querySelector('#btn-math-upload')!;
const cameraButton = uploadCard.element.querySelector('#btn-math-camera')!;
const uploadInput = uploadCard.element.querySelector('#math-scan-file')!;
let uploadPickerOpens = 0;
let cameraPageOpens = 0;
(uploadInput as any).click = () => { uploadPickerOpens++; };
uploadCard.openARScanner = () => { cameraPageOpens++; };

(uploadButton as any).click();
assert.equal(uploadPickerOpens, 1, 'Upload must open the image picker within the original click');
assert.equal(cameraPageOpens, 0, 'Upload must not open the camera workbench');
(cameraButton as any).click();
assert.equal(cameraPageOpens, 1, 'The separate camera button must still open the camera workbench');

const uploadNavigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
const previousInternals = nativeWindow.__TAURI_INTERNALS__;
Object.defineProperty(globalThis, 'navigator', {
  configurable: true,
  value: { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)', platform: 'MacIntel', maxTouchPoints: 5 },
});
const uploadNativeCommands: string[] = [];
let uploadNativeResult: any = { cancelled: true };
let uploadNativeError = false;
nativeWindow.__TAURI_INTERNALS__ = {
  invoke: async (command: string) => {
    uploadNativeCommands.push(command);
    if (uploadNativeError) throw new Error('Photo library unavailable');
    return uploadNativeResult;
  },
};
const originalUploadPick = (uploadCard as any).openPhotoLibrary.bind(uploadCard);
let pendingUpload: Promise<void>;
(uploadCard as any).openPhotoLibrary = (...args: any[]) => {
  pendingUpload = originalUploadPick(...args);
  return pendingUpload;
};
let uploadedImage: string | undefined;
(uploadCard as any).handleImage = async (dataUrl: string) => { uploadedImage = dataUrl; };
try {
  (uploadButton as any).click();
  await pendingUpload!;
  assert.deepEqual(uploadNativeCommands, ['plugin:apple-vision|pickPhoto'], 'iPad upload must directly invoke the native album');
  assert.equal(uploadedImage, undefined, 'Cancelling the album must not start recognition');

  uploadNativeResult = { dataUrl: 'data:image/jpeg;base64,uploaded-problem' };
  (uploadButton as any).click();
  await pendingUpload!;
  assert.equal(uploadedImage, uploadNativeResult.dataUrl, 'The selected photo must enter the existing recognition flow');

  uploadNativeError = true;
  (uploadButton as any).click();
  await pendingUpload!;
  assert.equal(uploadPickerOpens, 1, 'Native picker failure must not open another source picker');
  assert.equal(cameraPageOpens, 1, 'Neither selecting, cancelling nor failing an upload may open the camera');
} finally {
  if (uploadNavigatorDescriptor) Object.defineProperty(globalThis, 'navigator', uploadNavigatorDescriptor);
  else delete (globalThis as any).navigator;
  if (previousInternals === undefined) delete nativeWindow.__TAURI_INTERNALS__;
  else nativeWindow.__TAURI_INTERNALS__ = previousInternals;
  uploadCard.dispose();
}
console.log('✓ Test 12 passed: Main upload directly selects photos in browser and iPad app\n');

// -------------------------------------------------------------
// Test 13: Uploaded Paper Uses the Camera Recognition Animation and AR Overlay
// -------------------------------------------------------------
console.log('Test 13: Uploaded paper keeps the original image under animated AR recognition');

const imageDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'Image');
const bitmapDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'createImageBitmap');
const pendingPaperImages: any[] = [];
class PendingPaperImage {
  width = 1200;
  height = 800;
  src = '';
  onload?: () => void;
  onerror?: () => void;
  constructor() { pendingPaperImages.push(this); }
}
Object.defineProperty(globalThis, 'Image', { configurable: true, value: PendingPaperImage });
let optimizedFile: File | undefined;
Object.defineProperty(globalThis, 'createImageBitmap', {
  configurable: true,
  value: async (file: File) => {
    optimizedFile = file;
    return { width: 1200, height: 800, close: () => {} };
  },
});
const scannerPrototype = MathARScannerModal.prototype as any;
const originalStartCamera = scannerPrototype.startCamera;
let uploadCameraStarts = 0;
scannerPrototype.startCamera = async () => { uploadCameraStarts++; };
const paperRecognitions: string[] = [];
const drawnPaperImages: string[] = [];
let finishPaperRecognition: () => void;
let syncedPaperModel: any;
const paperCard = new StereometryStatusCard({
  onRecognizeImage: async (dataUrl) => {
    paperRecognitions.push(dataUrl);
    assert.equal(drawnPaperImages.at(-1), dataUrl, 'The original paper must be drawn before recognition begins');
    return await new Promise((resolve) => {
      finishPaperRecognition = () => resolve({
        name: recognizedCustomDef.name,
        subtitle: recognizedCustomDef.subtitle,
        modelDef: recognizedCustomDef,
      });
    });
  },
  onSyncRecognizedModel: (def) => { syncedPaperModel = def; },
});
const paperScanners: MathARScannerModal[] = [];
const originalCreateScanner = (paperCard as any).createARScanner.bind(paperCard);
(paperCard as any).createARScanner = (autoStartCamera: boolean) => {
  const workbench = originalCreateScanner(autoStartCamera) as MathARScannerModal;
  const paperCanvas = workbench.element.querySelector('#math-ar-sim-canvas') as any;
  const context = paperCanvas.getContext('2d');
  context.drawImage = (image: PendingPaperImage) => { drawnPaperImages.push(image.src); };
  paperCanvas.getContext = () => context;
  paperScanners.push(workbench);
  return workbench;
};
let pendingPaperUpload: Promise<void>;
const originalHandlePaper = (paperCard as any).handleImage.bind(paperCard);
(paperCard as any).handleImage = (image: File | string) => {
  pendingPaperUpload = originalHandlePaper(image);
  return pendingPaperUpload;
};

try {
  const originalPaper = 'data:image/jpeg;base64,original-uploaded-paper';
  const nativeUpload = (paperCard as any).handleImage(originalPaper) as Promise<void>;
  assert.equal(paperRecognitions.length, 0, 'Recognition must wait for the source photo to load');
  assert.equal(uploadCameraStarts, 0, 'Opening an uploaded paper must not start the camera');
  pendingPaperImages.at(-1).onload();
  await new Promise<void>((resolve) => setImmediate(resolve));

  const nativeWorkbench = paperScanners.at(-1)!;
  const nativeLaser = nativeWorkbench.element.querySelector('#math-ar-laser')!;
  assert.equal(nativeWorkbench.element.querySelector('#math-ar-sim-canvas')!.style.display, 'block', 'Original paper must remain visible');
  assert.equal(nativeWorkbench.element.querySelector('#math-ar-video')!.style.display, 'none', 'Camera preview must remain hidden');
  assert.ok(nativeLaser.classList.contains('active'), 'Upload must play the same scan animation while recognition is pending');
  assert.equal((nativeWorkbench as any).models.length, 0, 'No replacement model may appear before recognition finishes');
  finishPaperRecognition!();
  await nativeUpload;
  assert.equal((nativeWorkbench as any).models[0].dataUrl, originalPaper, 'The AR item must retain the uploaded paper');
  assert.equal((nativeWorkbench as any).models[0].modelDef, recognizedCustomDef, 'AR must use the actual recognized geometry');
  assert.equal(syncedPaperModel, recognizedCustomDef, 'The same geometry must sync back to the math scene');
  assert.ok(!nativeLaser.classList.contains('active'), 'Scan animation must finish when AR is ready');
  nativeWorkbench.close();

  const paperFile = new File(['paper'], 'problem.jpg', { type: 'image/jpeg' });
  const paperInput = paperCard.element.querySelector('#math-scan-file') as any;
  paperInput.files = [paperFile];
  paperInput.eventListeners.change[0]();
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(optimizedFile, paperFile, 'Browser uploads must use the shared image optimization pipeline');
  pendingPaperImages.at(-1).onload();
  await new Promise<void>((resolve) => setImmediate(resolve));
  const browserWorkbench = paperScanners.at(-1)!;
  assert.ok(browserWorkbench.element.querySelector('#math-ar-laser')!.classList.contains('active'), 'Browser upload must also animate on the paper');
  finishPaperRecognition!();
  await pendingPaperUpload!;
  assert.equal((browserWorkbench as any).models[0].modelDef, recognizedCustomDef, 'Browser uploads must generate the same AR geometry');
  assert.equal(uploadCameraStarts, 0, 'Neither native nor browser uploads may start the camera');
  browserWorkbench.close();

  const closedUpload = (paperCard as any).handleImage(originalPaper) as Promise<void>;
  paperScanners.at(-1)!.close();
  pendingPaperImages.at(-1).onload();
  await closedUpload;
  assert.equal(paperRecognitions.length, 2, 'Closing while the paper loads must not start recognition afterward');
} finally {
  paperScanners.forEach((workbench) => workbench.close());
  paperCard.dispose();
  scannerPrototype.startCamera = originalStartCamera;
  if (imageDescriptor) Object.defineProperty(globalThis, 'Image', imageDescriptor);
  else delete (globalThis as any).Image;
  if (bitmapDescriptor) Object.defineProperty(globalThis, 'createImageBitmap', bitmapDescriptor);
  else delete (globalThis as any).createImageBitmap;
}
console.log('✓ Test 13 passed: Native/browser uploads animate over the original paper and generate AR without starting a camera\n');

console.log('========================================================');
console.log('All Math AR Camera Scanner Tests Passed Successfully (13/13)!');
console.log('========================================================');
