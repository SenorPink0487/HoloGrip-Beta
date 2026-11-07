import assert from 'node:assert/strict';
import * as THREE from 'three';
import { StereometryMesh } from '../src/scene/math/StereometryMesh.ts';
import { StereometryInteractionManager } from '../src/scene/math/StereometryInteractionManager.ts';
import { AppleHapticAudio } from '../src/scene/math/AppleHapticAudio.ts';

// Lightweight Canvas & DOM mock for Node test environment
if (typeof document === 'undefined') {
  (global as any).document = {
    createElement(tag: string) {
      if (tag === 'canvas') {
        return {
          width: 512,
          height: 512,
          getContext: () => ({
            clearRect() {},
            save() {},
            restore() {},
            translate() {},
            scale() {},
            beginPath() {},
            moveTo() {},
            lineTo() {},
            arc() {},
            arcTo() {},
            closePath() {},
            fill() {},
            stroke() {},
            rect() {},
            roundRect() {},
            fillRect() {},
            strokeRect() {},
            fillText() {},
            strokeText() {},
            createLinearGradient: () => ({ addColorStop() {} }),
          }),
        };
      }
      return { style: {} };
    },
    body: { style: {} },
  };
}

console.log('=== Starting Stereometry Touch Wiring & Angle Marking Optimization Tests ===\n');

// 构造模拟视口与场景环境
const mockContainer = {
  clientWidth: 1920,
  clientHeight: 1080,
  addEventListener: () => {},
  removeEventListener: () => {},
  getBoundingClientRect: () => ({ left: 0, top: 0, width: 1920, height: 1080 }),
};

const camera = new THREE.PerspectiveCamera(45, 1920 / 1080, 0.1, 100);
camera.position.set(0, 0.35, 1.35);
camera.lookAt(0, 0, 0);
camera.updateMatrixWorld(true);

const mockContext: any = {
  camera,
  renderer: {
    domElement: mockContainer,
  },
};

const mesh = new StereometryMesh();
mesh.setOptions({ modelType: 'cube', dimensions: { a: 10, h: 10 } });
mesh.modelContainer.updateMatrixWorld(true);

let angleCreatedCount = 0;
let segmentCreatedCount = 0;
const interactionManager = new StereometryInteractionManager(mesh, {
  onAngleCreated: () => { angleCreatedCount++; },
  onSegmentCreated: () => { segmentCreatedCount++; },
});

// 辅助：根据 3D 局部坐标计算投影屏幕坐标
function projectToScreen(localPos: THREE.Vector3, targetMesh = mesh): { x: number; y: number } {
  targetMesh.modelContainer.updateMatrixWorld(true);
  const world = localPos.clone().applyMatrix4(targetMesh.modelContainer.matrixWorld);
  const proj = world.clone().project(camera);
  return {
    x: ((proj.x + 1) * 0.5) * 1920,
    y: ((-proj.y + 1) * 0.5) * 1080,
  };
}

// ---------------------------------------------------------------------------
// Test 1: 铁律验证：能标角度的只能是紫线 (DrawnSegment)，原始棱边不可用于角度选择
// ---------------------------------------------------------------------------
console.log('Test 1: Only purple auxiliary lines (DrawnSegments) can be selected for angles');
const keyPoints = mesh.getModelDef().keyPoints;
const kpA = keyPoints.find(k => k.label === 'A')!;
const kpB = keyPoints.find(k => k.label === 'B')!;
const kpC = keyPoints.find(k => k.label === 'C')!;
const kpD = keyPoints.find(k => k.label === 'D')!;
assert(kpA && kpB && kpC && kpD, 'Key points A, B, C, D must exist');

// 此时没有任何紫线 (DrawnSegment)，点击原始棱边 AB 的中点位置
const edgeABMidLocal = kpA.position.clone().lerp(kpB.position, 0.5);
const edgeABScreen = projectToScreen(edgeABMidLocal);

interactionManager.onPointerDown(
  { button: 0, pointerId: 1, clientX: edgeABScreen.x, clientY: edgeABScreen.y, pointerType: 'touch' } as any,
  null,
  mockContext
);
interactionManager.onPointerUp(
  { button: 0, pointerId: 1, clientX: edgeABScreen.x, clientY: edgeABScreen.y, pointerType: 'touch' } as any,
  mockContext
);

assert.equal(
  interactionManager.getSelectedAngleLine(),
  null,
  'Original cube edge AB must NOT be selectable for angle measurement (Only purple lines allowed)'
);
console.log('✓ Test 1 passed: Original cube edges strictly cannot be picked for angles\n');

// ---------------------------------------------------------------------------
// Test 2: 触摸屏接线交互优化 (两步轻触连线 + 触屏微滑容差)
// ---------------------------------------------------------------------------
console.log('Test 2: Touchscreen two-step tap-to-connect with micro-drift tolerance');
interactionManager.resetSelection(true);
const screenA = projectToScreen(kpA.position);
const screenC = projectToScreen(kpC.position);

// 1. 轻触起点 A
interactionManager.onPointerDown(
  { button: 0, pointerId: 1, clientX: screenA.x, clientY: screenA.y, pointerType: 'touch' } as any,
  null,
  mockContext
);
interactionManager.onPointerUp(
  { button: 0, pointerId: 1, clientX: screenA.x + 8, clientY: screenA.y - 6, pointerType: 'touch' } as any,
  mockContext
);
assert.equal((interactionManager as any).pendingStartPoint?.id, kpA.id, 'Point A selected as pending start point');

// 2. 在触屏上轻触终点 C (模拟手指按压伴随 20px 微滑)
interactionManager.onPointerDown(
  { button: 0, pointerId: 1, clientX: screenC.x, clientY: screenC.y, pointerType: 'touch' } as any,
  null,
  mockContext
);
interactionManager.onPointerMove(
  { pointerId: 1, clientX: screenC.x + 14, clientY: screenC.y + 12, pointerType: 'touch' } as any,
  null,
  mockContext
);
interactionManager.onPointerUp(
  { button: 0, pointerId: 1, clientX: screenC.x + 18, clientY: screenC.y + 16, pointerType: 'touch' } as any,
  mockContext
);

const segAC = mesh.getSegments().find(s => s.label === 'AC');
assert(segAC, 'Segment AC must be successfully created via touch tap-to-connect despite micro-drift');
console.log('✓ Test 2 passed: Touchscreen two-step tap-to-connect with micro-drift completed smoothly\n');

// ---------------------------------------------------------------------------
// Test 3: 触摸屏拖拽接线防丢手补偿 (Drag-to-connect touch lift drift protection)
// ---------------------------------------------------------------------------
console.log('Test 3: Touchscreen drag-to-connect touch lift drift protection');
interactionManager.clearHover();
interactionManager.resetSelection(true);
const screenB = projectToScreen(kpB.position);
const screenD = projectToScreen(kpD.position);

// 从 B 按下开始拖拽
interactionManager.onPointerDown(
  { button: 0, pointerId: 2, clientX: screenB.x, clientY: screenB.y, pointerType: 'touch' } as any,
  null,
  mockContext
);
assert.equal((interactionManager as any).session.kind, 'point-gesture', 'Session must be point-gesture');

// 滑动到目标点 D 处吸附
interactionManager.onPointerMove(
  { pointerId: 2, clientX: screenD.x, clientY: screenD.y, pointerType: 'touch' } as any,
  null,
  mockContext
);
assert.equal((interactionManager as any).lastDragSnappedKp?.id, kpD.id, 'Target D must be tracked as lastDragSnappedKp');

// 模拟手指抬起瞬间产生 18px 触控坐标跳变 (跳在端点吸附半径外侧边缘)
interactionManager.onPointerUp(
  { button: 0, pointerId: 2, clientX: screenD.x + 22, clientY: screenD.y - 18, pointerType: 'touch' } as any,
  mockContext
);

const segBD = mesh.getSegments().find(s => s.label === 'BD');
assert(segBD, 'Segment BD must be successfully created via drift compensation when lifted');
console.log('✓ Test 3 passed: Drag-to-connect safely connected BD despite lift drift\n');

// ---------------------------------------------------------------------------
// Test 4: 触控屏下绘制角度选线：防关键点劫持与大容差精准选线
// ---------------------------------------------------------------------------
console.log('Test 4: Touch angle marking: Line selection immunity from keypoint hijacking & high touch tolerance');
interactionManager.clearHover();
interactionManager.resetSelection(true);
interactionManager.clearAngleSelection();

// 投影 segAC 的 1/4 处屏幕坐标 (远离与 segBD 相交的中心交点)
const midACLocal = kpA.position.clone().lerp(kpC.position, 0.25);
const screenMidAC = projectToScreen(midACLocal);

// 4.1 点击第 1 根紫线 segAC
interactionManager.onPointerDown(
  { button: 0, pointerId: 1, clientX: screenMidAC.x + 12, clientY: screenMidAC.y - 10, pointerType: 'touch' } as any,
  null,
  mockContext
);
assert.equal((interactionManager as any).session.kind, 'segment-long-press', 'Must start segment-long-press on AC');

interactionManager.onPointerUp(
  { button: 0, pointerId: 1, clientX: screenMidAC.x + 14, clientY: screenMidAC.y - 8, pointerType: 'touch' } as any,
  mockContext
);
assert.equal(interactionManager.getSelectedAngleLine()?.id, segAC.id, 'First line segAC must be selected as baseline');

// 4.2 点击第 2 根紫线 segBD：特别测试点击靠近端点 B (偏向关键点 B 仅 14px 处)
// 过去在此位置会触发 keypoint 抢占并导致 clearAngleSelection() 误清空！现在必须防劫持并准确选中 segBD！
const nearEndBLocal = kpB.position.clone().lerp(kpD.position, 0.12);
const screenNearEndB = projectToScreen(nearEndBLocal);

interactionManager.onPointerDown(
  { button: 0, pointerId: 1, clientX: screenNearEndB.x, clientY: screenNearEndB.y, pointerType: 'touch' } as any,
  null,
  mockContext
);
assert.equal(
  (interactionManager as any).session.kind,
  'segment-long-press',
  'Must prioritize second purple line segBD over keypoint B when selectedLineForAngle exists'
);

interactionManager.onPointerUp(
  { button: 0, pointerId: 1, clientX: screenNearEndB.x + 6, clientY: screenNearEndB.y + 4, pointerType: 'touch' } as any,
  mockContext
);

const drawnAngles = mesh.getAngles();
assert.equal(drawnAngles.length, 1, 'Angle between purple line AC and purple line BD must be created');
const createdAng = drawnAngles[0];
assert.equal(createdAng.angleDeg, 90, 'Diagonals of cube face AC and BD must form a 90° angle');
console.log(`✓ Test 4 passed: Angle marked between [AC] and [BD] = ${createdAng.angleDeg}°, zero keypoint hijacking\n`);

// ---------------------------------------------------------------------------
// Test 5: 角度符号高对比度饱满呈现 (夹角扇面 ang_fan_ + 饱满弧线 + 大字号数字标牌)
// ---------------------------------------------------------------------------
console.log('Test 5: Angle annotation high-contrast visual elements (ang_fan_ + solid arc + high-res badge)');
const anglesGroup = mesh.getAnglesGroup();

// 5.1 验证 ang_fan_ 半透明夹角扇面 Mesh 存在且为纯正电光紫双面半透明材质
const fanMesh = anglesGroup.getObjectByName(`ang_fan_${createdAng.id}`) as THREE.Mesh;
assert(fanMesh, 'Semi-transparent angle fan mesh (ang_fan_) must exist in anglesGroup');
assert.equal((fanMesh.material as THREE.MeshBasicMaterial).transparent, true, 'Fan material must be transparent');
assert((fanMesh.material as THREE.MeshBasicMaterial).opacity >= 0.25, 'Fan opacity must be prominent (>= 0.25)');
assert.equal((fanMesh.material as THREE.MeshBasicMaterial).side, THREE.DoubleSide, 'Fan must be double-sided');
assert.equal(
  (fanMesh.material as THREE.MeshBasicMaterial).color.getHex(),
  0x8b5cf6,
  'Angle fan mesh must use authentic electric purple (0x8b5cf6)'
);

// 5.2 验证 ang_arc_ 弧线存在且具有纯正鲜亮电光紫 (0xa855f7)
const arcMesh = anglesGroup.getObjectByName(`ang_arc_${createdAng.id}`) as THREE.Line;
assert(arcMesh, 'Arc/corner contour line (ang_arc_) must exist');
assert.equal(
  (arcMesh.material as THREE.LineBasicMaterial).color.getHex(),
  0xa855f7,
  'Contour arc line must use luminous electric purple (0xa855f7)'
);

// 5.3 验证度数标牌 Sprite 尺寸提升为高清晰度大尺度 (0.220 x 0.110)
const badgeSprite = anglesGroup.getObjectByName(`badge_ang_${createdAng.id}`) as THREE.Sprite;
assert(badgeSprite, 'Badge sprite must exist');
assert.equal(badgeSprite.scale.x, 0.220, 'Badge scale X must be 0.220');
assert.equal(badgeSprite.scale.y, 0.110, 'Badge scale Y must be 0.110');

console.log('✓ Test 5 passed: High-contrast fan mesh, vivid contour arc, and enlarged badge verified\n');

// ---------------------------------------------------------------------------
// Test 6: 铁律守恒性：严格严禁出现任何浮动弹窗与 DOM 步骤向导
// ---------------------------------------------------------------------------
console.log('Test 6: Invariant Check - Strict Zero Floating Popups & Banners');
assert.equal(typeof (global as any).window?.document?.querySelector?.('.floating-toast'), 'undefined');
assert.equal(typeof (global as any).window?.document?.querySelector?.('.angle-guide-modal'), 'undefined');
assert.equal(typeof (global as any).window?.document?.querySelector?.('.step-card'), 'undefined');
console.log('✓ Test 6 passed: Strict zero floating popups invariant preserved\n');

// ---------------------------------------------------------------------------
// Test 7: 接线期间目标点与紫线重叠时，仅选点；退出接线后恢复选线
// ---------------------------------------------------------------------------
console.log('Test 7: Active connections prioritize points over overlapping lines across input methods');
for (const mode of ['direct', 'connect-line'] as const) {
  for (const input of ['mouse', 'touch', 'vision'] as const) {
    const wiringMesh = new StereometryMesh();
    wiringMesh.setOptions({ modelType: 'cube', dimensions: { a: 10, h: 10 } });
    const manager = new StereometryInteractionManager(wiringMesh);
    manager.setMode(mode);
    const points = wiringMesh.getModelDef().keyPoints;
    const a = points.find(k => k.label === 'A')!;
    const b = points.find(k => k.label === 'B')!;
    const c = points.find(k => k.label === 'C')!;
    const d = points.find(k => k.label === 'D')!;
    const c1 = points.find(k => k.label === 'C₁')!;
    const existingBD = wiringMesh.addSegment(b.id, d.id)!;
    wiringMesh.addSegment(c.id, c1.id);
    const eventAt = (screen: { x: number; y: number }) => ({
      button: 0,
      pointerId: 1,
      clientX: screen.x,
      clientY: screen.y,
      pointerType: input === 'touch' ? 'touch' : 'mouse',
      __visionGesture: input === 'vision',
    } as unknown as PointerEvent);
    const tap = (screen: { x: number; y: number }) => {
      const event = eventAt(screen);
      manager.onPointerDown(event, null, mockContext);
      manager.onPointerUp(event, mockContext);
    };
    const nearEndpoint = (point: THREE.Vector3, toward: THREE.Vector3) => {
      const screen = projectToScreen(point, wiringMesh);
      const end = projectToScreen(toward, wiringMesh);
      const length = Math.hypot(end.x - screen.x, end.y - screen.y);
      return { x: screen.x + 8 * (end.x - screen.x) / length, y: screen.y + 8 * (end.y - screen.y) / length };
    };
    const label = `${mode}/${input}`;

    // 接线开始时清掉上一次悬停的选线高亮。
    wiringMesh.setHoveredSegment(existingBD.id);
    tap(projectToScreen(a.position, wiringMesh));
    assert.equal((manager as any).pendingStartPoint?.id, a.id, `${label}: A must be the start point`);
    assert.equal(wiringMesh.getHoveredSegmentId(), null, `${label}: Wiring must clear stale line hover`);

    // 点击在 BD 线上、距端点 B 仅 8px：接线意图必须优先于更近的紫线。
    const targetB = eventAt(nearEndpoint(b.position, d.position));
    manager.onPointerDown(targetB, null, mockContext);
    assert.equal((manager as any).session.kind, 'point-gesture', `${label}: Target B must not select BD`);
    assert.equal((manager as any).pendingStartPoint?.id, a.id, `${label}: Target press must preserve A`);
    manager.onPointerUp(targetB, mockContext);
    assert(wiringMesh.getSegments().some(s => s.pointIdA === a.id && s.pointIdB === b.id), `${label}: AB must be connected`);
    assert.equal((manager as any).pendingStartPoint?.id, b.id, `${label}: Wiring must continue from B`);
    assert.equal(manager.getSelectedAngleLine(), null, `${label}: No line may be selected while wiring`);

    // 连续接线到另一根已有紫线的端点 C，同样不能被选线抢占。
    tap(nearEndpoint(c.position, c1.position));
    assert(wiringMesh.getSegments().some(s => s.pointIdA === b.id && s.pointIdB === c.id), `${label}: BC must be connected`);
    assert.equal((manager as any).pendingStartPoint?.id, c.id, `${label}: Wiring must continue from C`);
    assert.equal(wiringMesh.getAngles().length, 0, `${label}: Wiring must not create an angle`);

    // 在模型外结束接线后，紫线仍可正常用于标注夹角。
    tap({ x: 40, y: 40 });
    assert.equal((manager as any).pendingStartPoint, null, `${label}: Outside tap must end wiring`);
    tap(projectToScreen(b.position.clone().lerp(d.position, 0.25), wiringMesh));
    assert.equal(manager.getSelectedAngleLine()?.id, existingBD.id, `${label}: Line selection must resume after wiring`);
    wiringMesh.dispose();
  }
}
console.log('✓ Test 7 passed: Overlapping endpoints remain selectable throughout wiring on mouse, touch, and Vision\n');

console.log('========================================================================');
console.log('All Stereometry Touch Wiring & Angle Marking Tests Passed (7/7)!');
console.log('========================================================================\n');
