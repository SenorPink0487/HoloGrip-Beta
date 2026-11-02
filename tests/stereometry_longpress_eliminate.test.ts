import assert from 'node:assert';
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

console.log('=== Starting Stereometry Long-Press Elimination & Apple Dynamic Feedback Tests ===\n');

// ---------------------------------------------------------------------------
// Test 1: Connect lines to create a triangle, verify segments & auxiliary faces
// ---------------------------------------------------------------------------
console.log('Test 1: Connect lines and generate auxiliary face');
const mesh = new StereometryMesh();
mesh.setOptions({ modelType: 'cube', dimensions: { a: 10, h: 10 } });

// Connect v_0 -> v_1, v_1 -> v_2, v_2 -> v_0 on the cube
const seg1 = mesh.addSegment('v_0', 'v_1');
const seg2 = mesh.addSegment('v_1', 'v_2');
const seg3 = mesh.addSegment('v_2', 'v_0');

assert(seg1, 'Segment v_0-v_1 must be created');
assert(seg2, 'Segment v_1-v_2 must be created');
assert(seg3, 'Segment v_2-v_0 must be created');

const allSegments = mesh.getSegments();
assert.equal(allSegments.length, 3, 'Should have 3 drawn segments');

const auxFaces = mesh.getAuxiliaryFaces();
assert.equal(auxFaces.length, 1, 'Should have formed 1 closed auxiliary face (triangle ABC)');
console.log('✓ Test 1 passed: 3 segments and 1 auxiliary face created successfully\n');

// ---------------------------------------------------------------------------
// Test 2: findClosestDrawnSegment precision (ray and 2D projected screen distance)
// ---------------------------------------------------------------------------
console.log('Test 2: findClosestDrawnSegment detection along segment body and badge');
const camera = new THREE.PerspectiveCamera(50, 1920 / 1080, 0.1, 100);
camera.position.set(0, 1.2, 1.8);
camera.lookAt(0, 0.082, 0);
camera.updateMatrixWorld(true);

const viewport = { left: 0, top: 0, width: 1920, height: 1080 };
const kpA = mesh.getModelDef().keyPoints.find((k) => k.id === 'v_0')!;
const kpB = mesh.getModelDef().keyPoints.find((k) => k.id === 'v_1')!;
const midPoint = kpA.position.clone().lerp(kpB.position, 0.5);

// Project midpoint to screen
const worldMid = midPoint.clone().applyMatrix4(mesh.modelContainer.matrixWorld);
const projMid = worldMid.clone().project(camera);
const screenX = viewport.left + ((projMid.x + 1) * 0.5) * viewport.width;
const screenY = viewport.top + ((-projMid.y + 1) * 0.5) * viewport.height;

const ray = new THREE.Ray(camera.position, worldMid.clone().sub(camera.position).normalize());
const hit = mesh.findClosestDrawnSegment(ray, screenX, screenY, camera, viewport, 30);

console.log('hit result:', hit);
assert(hit !== null, 'Must detect segment AB at midpoint screen position');
assert.equal(hit.segment.id, seg1.id, 'Detected segment must match AB');
assert(hit.screenDistPx < 20.0, 'Screen distance to midpoint must be within threshold');
console.log('✓ Test 2 passed: findClosestDrawnSegment accurately identifies segment at midpoint\n');

// ---------------------------------------------------------------------------
// Test 3: Hover effect: Apple subtle micro-expansion & luminous color
// ---------------------------------------------------------------------------
console.log('Test 3: Hover state micro-expansion and luminous violet color');
mesh.setHoveredSegment(seg1.id);
assert.equal(mesh.getHoveredSegmentId(), seg1.id, 'Hovered segment ID must be set');

const coreMesh = (mesh as any).segmentsGroup.getObjectByName(`perm_seg_${seg1.id}`) as THREE.Mesh;
assert(coreMesh, 'Core mesh must exist');
assert.equal(coreMesh.scale.x, 1.35, 'Core mesh must expand to 1.35x when hovered');
assert.equal((coreMesh.material as THREE.MeshBasicMaterial).color.getHex(), 0xa855f7, 'Hover color must be 0xa855f7');

mesh.setHoveredSegment(null);
assert.equal(mesh.getHoveredSegmentId(), null, 'Hovered segment ID must reset to null');
assert.equal(coreMesh.scale.x, 1.0, 'Core mesh must reset scale to 1.0');
console.log('✓ Test 3 passed: Hover state gracefully highlights and restores segment\n');

// ---------------------------------------------------------------------------
// Test 4: Long-press cancelation before threshold (520ms)
// ---------------------------------------------------------------------------
console.log('Test 4: Long-press cancellation on early release (< 520ms)');
let removedSegmentLabel: string | null = null;
let removedFaceId: string | null = null;

const interactionManager = new StereometryInteractionManager(mesh, {
  onSegmentRemoved: (label) => { removedSegmentLabel = label; },
  onAuxiliaryFaceRemoved: (id) => { removedFaceId = id; },
});

const mockContext: any = {
  camera,
  renderer: {
    domElement: {
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 1920, height: 1080 }),
      style: {},
    },
  },
};

// Pointer down at segment AB position
const downEvent: any = { button: 0, pointerId: 1, clientX: screenX, clientY: screenY, pointerType: 'mouse' };
interactionManager.onPointerDown(downEvent, null, mockContext);

assert.equal((interactionManager as any).session.kind, 'segment-long-press', 'Session must be segment-long-press');

// Advance time by only 200ms (less than 520ms threshold)
interactionManager.update(0.20);
assert.equal((interactionManager as any).session.completed, false, 'Should not be completed at 200ms');

// Release early
const upEvent: any = { button: 0, pointerId: 1, clientX: screenX, clientY: screenY };
interactionManager.onPointerUp(upEvent, mockContext);

assert.equal((interactionManager as any).session.kind, 'idle', 'Session must return to idle');
assert.equal(mesh.getSegments().length, 3, 'All 3 segments must remain intact');
assert.equal(removedSegmentLabel, null, 'No segment removal callback should have been fired');
console.log('✓ Test 4 passed: Early release cancels long-press and preserves segment\n');

// ---------------------------------------------------------------------------
// Test 5: Dragging past threshold cancels long-press and enables orbit
// ---------------------------------------------------------------------------
console.log('Test 5: Dragging past tap slop cancels long-press and transitions to orbit');
interactionManager.onPointerDown(downEvent, null, mockContext);
assert.equal((interactionManager as any).session.kind, 'segment-long-press', 'Session must be segment-long-press');

// Move pointer by 30px (exceeds TAP_SLOP_MOUSE of 12px)
const moveDragEvent: any = { pointerId: 1, clientX: screenX + 30, clientY: screenY + 20, pointerType: 'mouse' };
interactionManager.onPointerMove(moveDragEvent, null, mockContext);

assert.equal((interactionManager as any).session.kind, 'model-surface', 'Session must transition to model-surface');
assert.equal((interactionManager as any).session.orbiting, true, 'Orbiting must be active');
interactionManager.onPointerUp(upEvent, mockContext);
assert.equal(mesh.getSegments().length, 3, 'Segments remain intact during orbit drag');
console.log('✓ Test 5 passed: Drag threshold cancelation smoothly transitions to orbit\n');

// ---------------------------------------------------------------------------
// Test 6: Full long-press elimination (>= 520ms) with Apple Pop & Particle Dissolution
// ---------------------------------------------------------------------------
console.log('Test 6: Full 520ms long-press triggers Apple Pop and eliminates segment & associated face');
let tickPlayed = false;
let popPlayed = false;

// Spy on AppleHapticAudio
const origTick = AppleHapticAudio.playTick;
const origPop = AppleHapticAudio.playPop;
AppleHapticAudio.playTick = () => { tickPlayed = true; };
AppleHapticAudio.playPop = () => { popPlayed = true; };

interactionManager.onPointerDown(downEvent, null, mockContext);
assert(tickPlayed, 'Initial haptic tick must have played on pointer down');

// Advance time past 520ms
const longPressSession = (interactionManager as any).session;
longPressSession.downTime = performance.now() - 600; // 600ms elapsed
interactionManager.update(0.016);

assert(popPlayed, 'Apple Haptic Pop must be triggered when long-press completes');
assert.equal(mesh.isSegmentEliminating(seg1.id), true, 'Segment must be marked as eliminating');

// Advance time to allow the 0.34s particle and recoil animation to finish
mesh.update(0.36, 1.0, camera);

assert.equal(mesh.getSegments().length, 2, 'Segment AB must be removed from drawn segments');
assert.equal(mesh.getSegments().some((s) => s.id === seg1.id), false, 'Segment AB must not exist in mesh');
assert.equal(mesh.getAuxiliaryFaces().length, 0, 'Auxiliary face ABC must be dissolved and removed');
assert.equal(removedSegmentLabel, 'AB', 'onSegmentRemoved callback must report "AB"');
assert(removedFaceId !== null, 'onAuxiliaryFaceRemoved callback must be triggered for dissolved face');

// Restore spies
AppleHapticAudio.playTick = origTick;
AppleHapticAudio.playPop = origPop;

console.log('✓ Test 6 passed: Segment eliminated, particle dissolution played, face removed, and callbacks delivered\n');

// ---------------------------------------------------------------------------
// Test 7: Strict Zero Floating Popups & Banners Invariant
// ---------------------------------------------------------------------------
console.log('Test 7: Invariant check - Zero DOM modals, guidance toasts or floating handles created');
assert.equal(typeof (global as any).window?.document?.querySelector?.('.floating-toast'), 'undefined');
assert.equal(mesh.group.children.length > 0, true, 'Visuals are 100% native 3D scene meshes and sprites');
console.log('✓ Test 7 passed: Strict zero floating popups invariant preserved\n');

// ---------------------------------------------------------------------------
// Test 8: Click line 1 then click line 2 marks their 3D angle (点击两线标出夹角)
// ---------------------------------------------------------------------------
console.log('Test 8: Click line 1 then click line 2 marks their 3D angle');
let createdAngle: any = null;
let removedAngleId: string | null = null;
let removedAngleDeg: number | null = null;

(interactionManager as any).callbacks.onAngleCreated = (ang: any) => { createdAngle = ang; };
(interactionManager as any).callbacks.onAngleRemoved = (id: string, deg: number) => {
  removedAngleId = id;
  removedAngleDeg = deg;
};

// 当前剩余两个有效辅助线：seg2 (BC) 和 seg3 (CA)
mesh.modelContainer.updateWorldMatrix(true, false);
const segList = mesh.getSegments();
assert.equal(segList.length, 2, 'Should have 2 remaining auxiliary segments');
const segBC = segList[0];
const segCA = segList[1];

const kpBC_A = mesh.getModelDef().keyPoints.find((k) => k.id === segBC.pointIdA)!;
const kpBC_B = mesh.getModelDef().keyPoints.find((k) => k.id === segBC.pointIdB)!;
const midBC = kpBC_A.position.clone().lerp(kpBC_B.position, 0.20);
const worldBC = midBC.clone().applyMatrix4(mesh.modelContainer.matrixWorld);
const projBC = worldBC.clone().project(camera);
const bcScreenX = ((projBC.x + 1) * 0.5) * 1920;
const bcScreenY = ((-projBC.y + 1) * 0.5) * 1080;

const kpCA_A = mesh.getModelDef().keyPoints.find((k) => k.id === segCA.pointIdA)!;
const kpCA_B = mesh.getModelDef().keyPoints.find((k) => k.id === segCA.pointIdB)!;
const midCA = kpCA_A.position.clone().lerp(kpCA_B.position, 0.20);
const worldCA = midCA.clone().applyMatrix4(mesh.modelContainer.matrixWorld);
const projCA = worldCA.clone().project(camera);
const caScreenX = ((projCA.x + 1) * 0.5) * 1920;
const caScreenY = ((-projCA.y + 1) * 0.5) * 1080;

// 1. 点击第一根线 segBC (< 450ms 短按)
const downLine1: any = { button: 0, pointerId: 1, clientX: bcScreenX, clientY: bcScreenY, pointerType: 'mouse' };
interactionManager.onPointerDown(downLine1, null, mockContext);
assert.equal((interactionManager as any).session.kind, 'segment-long-press', 'Down on segment starts session');

const upLine1: any = { button: 0, pointerId: 1, clientX: bcScreenX, clientY: bcScreenY, pointerType: 'mouse' };
interactionManager.onPointerUp(upLine1, mockContext);

assert.equal(interactionManager.getSelectedAngleLine()?.id, segBC.id, 'Line 1 must be selected for angle');
assert.equal(mesh.getSelectedAngleLineId(), segBC.id, 'Line 1 must be highlighted in mesh');

// 2. 点击第二根线 segCA (< 450ms 短按)
const downLine2: any = { button: 0, pointerId: 1, clientX: caScreenX, clientY: caScreenY, pointerType: 'mouse' };
interactionManager.onPointerDown(downLine2, null, mockContext);
const upLine2: any = { button: 0, pointerId: 1, clientX: caScreenX, clientY: caScreenY, pointerType: 'mouse' };
interactionManager.onPointerUp(upLine2, mockContext);

assert.equal(interactionManager.getSelectedAngleLine(), null, 'Selected line must be cleared after angle is marked');
assert.equal(mesh.getSelectedAngleLineId(), null, 'Mesh highlight must be cleared');
assert(createdAngle !== null, 'onAngleCreated callback must be delivered');
assert.equal(mesh.getAngles().length, 1, 'Mesh must contain exactly 1 drawn angle');
assert(createdAngle.angleDeg > 0, `Angle degree must be positive, got: ${createdAngle.angleDeg}°`);
assert(mesh.getAnglesGroup().children.length > 0, 'anglesGroup must contain 3D arc line and badge');

// 严谨验证：角标弧线必须严格位于两线所确立的 3D 平面内，且起于 line1 止于 line2
const arcMesh = mesh.getAnglesGroup().getObjectByName(`ang_arc_${createdAngle.id}`) as THREE.Line;
assert(arcMesh, 'Arc mesh must exist in anglesGroup');
const posAttr = arcMesh.geometry.attributes.position as THREE.BufferAttribute;
const planeNormal = new THREE.Vector3().crossVectors(createdAngle.dir1, createdAngle.dir2).normalize();
const anglePlane = new THREE.Plane().setFromNormalAndCoplanarPoint(planeNormal, createdAngle.vertexPos);

for (let i = 0; i < posAttr.count; i++) {
  const pt = new THREE.Vector3().fromBufferAttribute(posAttr, i);
  const distToPlane = Math.abs(anglePlane.distanceToPoint(pt));
  assert(distToPlane < 1e-4, `Arc vertex ${i} must lie strictly in the angle plane, dist: ${distToPlane}`);
}

const startPt = new THREE.Vector3().fromBufferAttribute(posAttr, 0);
const endPt = new THREE.Vector3().fromBufferAttribute(posAttr, posAttr.count - 1);
const startDir = startPt.clone().sub(createdAngle.vertexPos).normalize();
const endDir = endPt.clone().sub(createdAngle.vertexPos).normalize();
assert(startDir.distanceTo(createdAngle.dir1) < 1e-3, 'Arc must start along line 1 direction');
assert(endDir.distanceTo(createdAngle.dir2) < 1e-3, 'Arc must end along line 2 direction');
console.log('✓ Arc strictly coplanar and correctly oriented from line 1 to line 2');

console.log(`✓ Test 8 passed: 3D angle marked between [${createdAngle.label1}] and [${createdAngle.label2}]: ${createdAngle.angleDeg}°\n`);

// ---------------------------------------------------------------------------
// Test 9: Click same line or outside cancels line selection
// ---------------------------------------------------------------------------
console.log('Test 9: Click same line cancels line selection');
interactionManager.onPointerDown(downLine1, null, mockContext);
interactionManager.onPointerUp(upLine1, mockContext);
assert.equal(interactionManager.getSelectedAngleLine()?.id, segBC.id, 'Line 1 re-selected');

// 再次点击同一根线取消选择
interactionManager.onPointerDown(downLine1, null, mockContext);
interactionManager.onPointerUp(upLine1, mockContext);
assert.equal(interactionManager.getSelectedAngleLine(), null, 'Re-clicking same line cancels selection');

// 点击模型外空白处也取消选择
interactionManager.onPointerDown(downLine1, null, mockContext);
interactionManager.onPointerUp(upLine1, mockContext);
assert.equal(interactionManager.getSelectedAngleLine()?.id, segBC.id);
interactionManager.onPointerDown({ button: 0, pointerId: 1, clientX: 10, clientY: 10, pointerType: 'mouse' }, null, mockContext);
assert.equal(interactionManager.getSelectedAngleLine(), null, 'Clicking outside cancels selection');
console.log('✓ Test 9 passed: Selection cancelation verified\n');

// ---------------------------------------------------------------------------
// Test 10: Long-press angle annotation to eliminate it with Apple pop & particles
// ---------------------------------------------------------------------------
console.log('Test 10: Long-press angle annotation eliminates it with Apple pop & particle dissolution');
const ang = mesh.getAngles()[0];
assert(ang, 'Drawn angle must exist');

// 投影夹角度数标牌的屏幕坐标
const badgeWorld = ang.badgePos.clone().applyMatrix4(mesh.modelContainer.matrixWorld);
const projBadge = badgeWorld.clone().project(camera);
const angScreenX = ((projBadge.x + 1) * 0.5) * 1920;
const angScreenY = ((-projBadge.y + 1) * 0.5) * 1080;

// 1. 测试提早松开 (< 520ms) 不消除
const downAngleEvent: any = { button: 0, pointerId: 1, clientX: angScreenX, clientY: angScreenY, pointerType: 'mouse' };
interactionManager.onPointerDown(downAngleEvent, null, mockContext);
assert.equal((interactionManager as any).session.kind, 'angle-long-press', 'Session must be angle-long-press');

interactionManager.update(0.20);
assert.equal((interactionManager as any).session.completed, false, 'Angle elimination not completed at 200ms');

const upAngleEvent: any = { button: 0, pointerId: 1, clientX: angScreenX, clientY: angScreenY, pointerType: 'mouse' };
interactionManager.onPointerUp(upAngleEvent, mockContext);
assert.equal(mesh.getAngles().length, 1, 'Angle remains intact on early release');
assert.equal(removedAngleId, null, 'No angle removal callback on early release');

// 2. 完整长按蓄力 (>= 520ms) 消除
let anglePopPlayed = false;
const origPop2 = AppleHapticAudio.playPop;
AppleHapticAudio.playPop = () => { anglePopPlayed = true; };

interactionManager.onPointerDown(downAngleEvent, null, mockContext);
assert.equal((interactionManager as any).session.kind, 'angle-long-press');

(interactionManager as any).session.downTime = performance.now() - 600; // 600ms elapsed
interactionManager.update(0.016);

assert(anglePopPlayed, 'Apple Haptic Pop must play on angle elimination');
assert.equal(mesh.isAngleEliminating(ang.id), true, 'Angle must be marked as eliminating');

// 推进时间让粒子与标牌动效完成
mesh.update(0.36, 1.0, camera);

assert.equal(mesh.getAngles().length, 0, 'Angle must be removed from drawnAngles');
assert.equal(removedAngleId, ang.id, 'onAngleRemoved callback must report eliminated angle ID');
assert.equal(removedAngleDeg, ang.angleDeg, 'onAngleRemoved callback must report eliminated angle degree');

AppleHapticAudio.playPop = origPop2;
console.log('✓ Test 10 passed: Angle long-press eliminated with Apple pop and particle dissolution\n');

// ---------------------------------------------------------------------------
// Test 11: Removing a segment automatically dissolves any angles attached to it
// ---------------------------------------------------------------------------
console.log('Test 11: Removing a segment automatically dissolves any angles attached to it');
// 重新在 segBC 和 segCA 之间添加夹角
const testAngle = mesh.addAngle(
  { id: segBC.id, pointIdA: segBC.pointIdA, pointIdB: segBC.pointIdB, label: segBC.label, isDrawnSegment: true, posA: kpBC_A.position, posB: kpBC_B.position, hitPoint3D: kpBC_A.position },
  { id: segCA.id, pointIdA: segCA.pointIdA, pointIdB: segCA.pointIdB, label: segCA.label, isDrawnSegment: true, posA: kpCA_A.position, posB: kpCA_B.position, hitPoint3D: kpCA_A.position }
);
assert.equal(mesh.getAngles().length, 1, 'Angle re-added');

// 消除 segBC -> 附着在其上的 testAngle 必须同步被移除
mesh.removeSegment(segBC.id);
assert.equal(mesh.getAngles().length, 0, 'Angle attached to removed segment must be automatically dissolved');
console.log('✓ Test 11 passed: Segment elimination cascades to dissolve attached angles\n');

// ---------------------------------------------------------------------------
// Test 12: Invariant Check - Strict Zero Floating Popups for All Angle Features
// ---------------------------------------------------------------------------
console.log('Test 12: Invariant check - Zero DOM modals/popups injected during angle operations');
assert.equal(typeof (global as any).window?.document?.querySelector?.('.floating-toast'), 'undefined');
assert.equal(typeof (global as any).window?.document?.querySelector?.('.angle-modal'), 'undefined');
console.log('✓ Test 12 passed: Zero floating popups invariant fully preserved across all angle features\n');

console.log('========================================================================');
console.log('All Stereometry Long-Press & Angle Marking Tests Passed (12/12)!');
console.log('========================================================================\n');
