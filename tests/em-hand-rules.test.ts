import assert from 'node:assert';

// Lightweight DOM & Canvas mock for Node.js test environment
if (typeof globalThis.document === 'undefined') {
  (globalThis as any).document = {
    head: { appendChild: () => {} },
    body: { appendChild: () => {}, classList: { toggle: () => {}, contains: () => false } },
    getElementById: () => null,
    createElement: (tag: string) => {
      if (tag === 'canvas') {
        return {
          width: 512,
          height: 512,
          getContext: () => ({
            fillStyle: '',
            strokeStyle: '',
            lineWidth: 1,
            font: '',
            textAlign: '',
            textBaseline: '',
            clearRect: () => {},
            fillRect: () => {},
            strokeRect: () => {},
            fillText: () => {},
            beginPath: () => {},
            moveTo: () => {},
            lineTo: () => {},
            arc: () => {},
            stroke: () => {},
            fill: () => {},
          }),
        };
      }
      return {
        tagName: tag.toUpperCase(),
        className: '',
        innerHTML: '',
        style: {},
        classList: {
          add: () => {},
          remove: () => {},
          toggle: () => {},
          contains: () => false,
        },
        setAttribute: () => {},
        getAttribute: () => null,
        addEventListener: () => {},
        querySelector: () => null,
        querySelectorAll: () => [],
      };
    },
  };
}

import {
  computeRuleVectors,
  evaluateHandRuleFrame,
  type HandRuleConfig,
} from '../src/physics/em/handRulesSolver.ts';
import type { HandGestureFrame, NormalizedLandmark, SingleHandData } from '../src/vision/types.ts';
import * as THREE from 'three';
import { ArticulatedHandSkeletonMesh, HAND_BONE_CONNECTIONS } from '../src/scene/em/ArticulatedHandSkeletonMesh.ts';
import EmHandRulesExperiment from '../src/experiments/catalog/em-hand-rules/index.ts';
import { PhysicsDisciplineModal } from '../src/ui/vision/PhysicsDisciplineModal.ts';

function buildMockLandmarks(options: {
  thumbDirWorld: { x: number; y: number; z?: number };
  fingersDirWorld: { x: number; y: number; z?: number };
  curled?: boolean;
}): NormalizedLandmark[] {
  const lms: NormalizedLandmark[] = [];
  for (let i = 0; i < 21; i++) {
    lms.push({ x: 0.5, y: 0.5, z: 0 });
  }

  lms[0] = { x: 0.5, y: 0.58, z: 0 };
  lms[5] = { x: 0.46, y: 0.5, z: 0 };
  lms[9] = { x: 0.5, y: 0.48, z: 0 };
  lms[13] = { x: 0.54, y: 0.5, z: 0 };
  lms[17] = { x: 0.58, y: 0.52, z: 0 };

  const tx = options.thumbDirWorld.x;
  const ty = options.thumbDirWorld.y;
  const tz = options.thumbDirWorld.z ?? 0;
  lms[1] = { x: 0.48, y: 0.54, z: 0 };
  lms[2] = { x: 0.48 - tx * 0.03, y: 0.54 - ty * 0.03, z: -tz * 0.03 };
  lms[3] = { x: 0.48 - tx * 0.07, y: 0.54 - ty * 0.07, z: -tz * 0.07 };
  lms[4] = { x: 0.48 - tx * 0.12, y: 0.54 - ty * 0.12, z: -tz * 0.12 };

  const fx = options.fingersDirWorld.x;
  const fy = options.fingersDirWorld.y;
  const fz = options.fingersDirWorld.z ?? 0;
  const reach = options.curled ? 0.035 : 0.11;

  for (const mcp of [5, 9, 13, 17]) {
    const base = lms[mcp];
    lms[mcp + 1] = { x: base.x - fx * reach * 0.35, y: base.y - fy * reach * 0.35, z: -fz * reach * 0.35 };
    lms[mcp + 2] = { x: base.x - fx * reach * 0.7, y: base.y - fy * reach * 0.7, z: -fz * reach * 0.7 };
    lms[mcp + 3] = { x: base.x - fx * reach, y: base.y - fy * reach, z: -fz * reach };
  }

  return lms;
}

function wrapSingleHandFrame(handedness: 'left' | 'right', landmarks: NormalizedLandmark[]): HandGestureFrame {
  const hand: SingleHandData = {
    handedness,
    confidence: 0.98,
    landmarks,
    thumbTip: landmarks[4],
    indexTip: landmarks[8],
    midpointNorm: { x: 0.5, y: 0.5, z: 0 },
    screenX: 600,
    screenY: 400,
    rawDistance: 0.08,
    handScale: 0.12,
    pinchRatio: 0.66,
    pinchStrength: 0,
    isPinching: false,
    justPinchStarted: false,
    justPinchEnded: false,
    pinchDuration: 0,
    isLongPinch: false,
  };

  return {
    hasHand: true,
    timestamp: 1000,
    leftHand: handedness === 'left' ? hand : null,
    rightHand: handedness === 'right' ? hand : null,
    leftHandQuickPinch: false,
    leftHandCameraDelta: null,
    landmarks,
    thumbTip: landmarks[4],
    indexTip: landmarks[8],
    midpointNorm: { x: 0.5, y: 0.5, z: 0 },
    screenX: 600,
    screenY: 400,
    rawDistance: 0.08,
    handScale: 0.12,
    pinchRatio: 0.66,
    pinchStrength: 0,
    isPinching: false,
    justPinchStarted: false,
    justPinchEnded: false,
  };
}

console.log('=== Starting Electromagnetism Hand Rules & 3D Skeleton Verification ===\n');

// Test 1: Catalog entry in PhysicsDisciplineModal
{
  const emIds = PhysicsDisciplineModal.EM_EXPERIMENTS.map((e) => e.id);
  assert(emIds.includes('em-hand-rules'), 'EM_EXPERIMENTS must include em-hand-rules');
  assert.strictEqual(PhysicsDisciplineModal.EM_EXPERIMENTS.length, 4, 'EM_EXPERIMENTS must have 4 cards');
  console.log('✓ Test 1 passed: em-hand-rules registered in PhysicsDisciplineModal.EM_EXPERIMENTS');
}

// Test 2: Right-Hand Screw Rule (Ampere's Rule)
{
  const config: HandRuleConfig = {
    mode: 'right-hand-screw',
    currentPolarity: 1,
    fieldPolarity: 1,
    motionPolarity: 1,
    gestureEnabled: true,
  };

  const wrongHandFrame = wrapSingleHandFrame(
    'left',
    buildMockLandmarks({
      thumbDirWorld: { x: 0, y: 1 },
      fingersDirWorld: { x: 1, y: 0 },
      curled: true,
    })
  );
  const wrongEval = evaluateHandRuleFrame(config, wrongHandFrame);
  assert.strictEqual(wrongEval.status, 'wrong-hand');
  assert.strictEqual(wrongEval.isMatched, false);

  const rightUpFrame = wrapSingleHandFrame(
    'right',
    buildMockLandmarks({
      thumbDirWorld: { x: 0, y: 1 },
      fingersDirWorld: { x: -1, y: 0 },
      curled: true,
    })
  );
  const matchedEval = evaluateHandRuleFrame(config, rightUpFrame);
  assert.strictEqual(matchedEval.status, 'matched');
  assert.strictEqual(matchedEval.isMatched, true);
  assert.strictEqual(matchedEval.screwCirculationSign, 1);

  config.currentPolarity = -1;
  assert.strictEqual(evaluateHandRuleFrame(config, rightUpFrame).isMatched, false);

  const rightDownFrame = wrapSingleHandFrame(
    'right',
    buildMockLandmarks({
      thumbDirWorld: { x: 0, y: -1 },
      fingersDirWorld: { x: 1, y: 0 },
      curled: true,
    })
  );
  const matchedDown = evaluateHandRuleFrame(config, rightDownFrame);
  assert.strictEqual(matchedDown.isMatched, true);
  assert.strictEqual(matchedDown.screwCirculationSign, -1);

  console.log('✓ Test 2 passed: Right-Hand Screw Rule evaluation verified');
}

// Test 3: Left-Hand Rule (Ampere Force F = I x B)
{
  const config: HandRuleConfig = {
    mode: 'left-hand-rule',
    currentPolarity: 1,
    fieldPolarity: 1,
    motionPolarity: 1,
    gestureEnabled: true,
  };

  const vectors = computeRuleVectors(config);
  assert.strictEqual(vectors.requiredHand, 'left');
  assert.deepStrictEqual(vectors.targetVectorDir, { x: 1, y: 0, z: 0 });

  const leftThumbRightFrame = wrapSingleHandFrame(
    'left',
    buildMockLandmarks({
      thumbDirWorld: { x: 1, y: 0 },
      fingersDirWorld: { x: 0, y: 1 },
      curled: false,
    })
  );
  const evalRight = evaluateHandRuleFrame(config, leftThumbRightFrame);
  assert.strictEqual(evalRight.isMatched, true);
  assert.strictEqual(evalRight.status, 'matched');

  config.fieldPolarity = -1;
  assert.strictEqual(evaluateHandRuleFrame(config, leftThumbRightFrame).isMatched, false);

  const leftThumbLeftFrame = wrapSingleHandFrame(
    'left',
    buildMockLandmarks({
      thumbDirWorld: { x: -1, y: 0 },
      fingersDirWorld: { x: 0, y: 1 },
      curled: false,
    })
  );
  assert.strictEqual(evaluateHandRuleFrame(config, leftThumbLeftFrame).isMatched, true);

  console.log('✓ Test 3 passed: Left-Hand Rule evaluation verified');
}

// Test 4: Right-Hand Rule (Electromagnetic Induction I_ind)
{
  const config: HandRuleConfig = {
    mode: 'right-hand-rule',
    currentPolarity: 1,
    fieldPolarity: 1,
    motionPolarity: 1,
    gestureEnabled: true,
  };

  const rightFingersUpFrame = wrapSingleHandFrame(
    'right',
    buildMockLandmarks({
      thumbDirWorld: { x: 1, y: 0 },
      fingersDirWorld: { x: 0, y: 1 },
      curled: false,
    })
  );
  const evalUp = evaluateHandRuleFrame(config, rightFingersUpFrame);
  assert.strictEqual(evalUp.isMatched, true);
  assert.strictEqual(evalUp.status, 'matched');

  config.motionPolarity = -1;
  assert.strictEqual(evaluateHandRuleFrame(config, rightFingersUpFrame).isMatched, false);

  const rightFingersDownFrame = wrapSingleHandFrame(
    'right',
    buildMockLandmarks({
      thumbDirWorld: { x: -1, y: 0 },
      fingersDirWorld: { x: 0, y: -1 },
      curled: false,
    })
  );
  assert.strictEqual(evaluateHandRuleFrame(config, rightFingersDownFrame).isMatched, true);

  console.log('✓ Test 4 passed: Right-Hand Rule evaluation verified');
}

// Test 5: 3D T-800 ArticulatedHandSkeletonMesh & EmHandRulesExperiment lifecycle
{
  const skeleton = new ArticulatedHandSkeletonMesh();
  assert.strictEqual(HAND_BONE_CONNECTIONS.length, 23);
  assert.strictEqual(skeleton.group.visible, false);

  // Verify T-800 mechanical endoskeleton sub-assemblies (21 clevis hinge / claw-tip joints + 23 hydraulic/armor bones + palm manifold + wrist gimbal + active vector arrow = 47 top-level groups)
  assert.strictEqual(
    skeleton.group.children.length,
    47,
    'T-800 hand skeleton must contain 21 joints, 23 bone assemblies, palm manifold chassis, wrist gimbal assembly, and vector ray'
  );

  const exp = new EmHandRulesExperiment();
  exp.init({} as any);
  exp.setGestureEnabled(true);
  exp.setRuleMode('left-hand-rule');

  const frame = wrapSingleHandFrame(
    'left',
    buildMockLandmarks({
      thumbDirWorld: { x: 1, y: 0 },
      fingersDirWorld: { x: 0, y: 1 },
    })
  );
  exp.onHandGestureFrame(frame);
  exp.update(0.016, 0.1, {} as any);

  // Verify 3D bounding box of the updated skeleton never has oversized/unscaled 1.0m geometries
  const evalSnap = evaluateHandRuleFrame(
    {
      mode: 'left-hand-rule',
      currentPolarity: 1,
      fieldPolarity: 1,
      motionPolarity: 1,
      gestureEnabled: true,
    },
    frame
  );
  skeleton.update(0.016, frame, evalSnap);
  skeleton.group.updateMatrixWorld(true);
  const bbox = new THREE.Box3().setFromObject(skeleton.group);
  const size = new THREE.Vector3();
  bbox.getSize(size);
  assert(
    size.x < 0.35 && size.y < 0.42 && size.z < 0.25,
    `T-800 hand bounding box must be compact (${size.x.toFixed(3)} x ${size.y.toFixed(3)} x ${size.z.toFixed(3)}m)`
  );

  const telem = exp.getTelemetryData();
  assert.strictEqual(telem.mode, 'left-hand-rule');
  assert.strictEqual(telem.isMatched, true);
  assert.strictEqual(telem.status, 'matched');

  exp.dispose({} as any);
  skeleton.dispose();
  console.log('✓ Test 5 passed: 3D T-800 ArticulatedHandSkeletonMesh & EmHandRulesExperiment lifecycle verified\n');
}

console.log('========================================================');
console.log('All Electromagnetism Hand Rules Tests Passed (5/5)!');
console.log('========================================================\n');
