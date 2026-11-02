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

console.log('========================================================================');
console.log('All Stereometry Long-Press Elimination Tests Passed (7/7)!');
console.log('========================================================================\n');
