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

// Test 6: Single Conductor Right-Hand Screw Apparatus & Continuous Current Invariant (只要一个导体，始终有电流流过)
{
  const exp = new EmHandRulesExperiment();
  exp.init({} as any);
  exp.setRuleMode('right-hand-screw');

  // Verify there is only one central conductor and no side gantry pillars
  const bench = (exp as any).bench;
  const screwGroup = bench.group.getObjectByName('RightHandScrewApparatus');
  assert(screwGroup, 'RightHandScrewApparatus must exist in bench');

  const centralConductor = screwGroup.getObjectByName('ScrewCentralConductor');
  assert(centralConductor, 'Must have ScrewCentralConductor');

  // Ensure old multi-conductor gantry pillars are removed
  const leftPillar = screwGroup.getObjectByName('LeftPillar');
  const rightPillar = screwGroup.getObjectByName('RightPillar');
  const topYoke = screwGroup.getObjectByName('TopYoke');
  assert.strictEqual(leftPillar, undefined, 'Must not have leftPillar');
  assert.strictEqual(rightPillar, undefined, 'Must not have rightPillar');
  assert.strictEqual(topYoke, undefined, 'Must not have topYoke');

  // Verify continuous current flow invariant: even without hand gesture or with idle hand, current flows continuously
  const currentArrow = bench.floatingConductor.currentArrow;
  assert(currentArrow, 'Current direction arrow must exist');
  assert.strictEqual(currentArrow.rotation.z, 0, 'Current arrow points up (+Y) when currentPolarity = 1');

  // No support or control hardware may remain beneath the suspended rod.
  assert.strictEqual(screwGroup.getObjectByName('ConductorInstrumentPlinth'), undefined);
  assert.strictEqual(screwGroup.getObjectByName('ContactlessInductionSeat'), undefined);
  assert.strictEqual(screwGroup.getObjectByName('ScrewPolarityDial'), undefined);
  assert.deepStrictEqual(screwGroup.children.map((child: THREE.Object3D) => child.name), ['FloatingConductorAssembly']);

  // Current markers stream axially even without a hand or a revealed B field.
  const current = bench.floatingConductor.currentCarriers as THREE.InstancedMesh;
  const initial = new THREE.Matrix4();
  const updated = new THREE.Matrix4();
  current.getMatrixAt(1, initial);
  for (let step = 0; step < 10; step++) exp.update(0.016, step * 0.016, {} as any);
  current.getMatrixAt(1, updated);
  assert(updated.elements[13] > initial.elements[13], 'Positive current must stream upward continuously');
  assert(Math.abs(updated.elements[12] - initial.elements[12]) < 1e-7 && Math.abs(updated.elements[14] - initial.elements[14]) < 1e-7,
    'Current must travel along the rod, rather than orbiting around it');

  // Reverse current polarity
  exp.reverseCurrent();
  exp.update(0.016, 0.2, {} as any);
  assert.strictEqual(currentArrow.rotation.z, Math.PI, 'Current arrow points down (-Y) when currentPolarity = -1');
  current.getMatrixAt(1, initial);
  assert(initial.elements[13] < updated.elements[13], 'Reversing I immediately reverses axial flow');
  assert(Math.abs(initial.elements[13] - updated.elements[13]) < 0.002, 'Reversal must not reset or teleport current packets');
  assert.strictEqual(bench.floatingConductor.currentFlowMaterial.uniforms.direction.value, -1, 'Surface flow and 3D markers must agree');

  exp.dispose({} as any);
  console.log('✓ Test 6 passed: Single Conductor Right-Hand Screw Apparatus & Continuous Current verified');
}

// Test 7: Magnetic Field Appears Strictly When Hand is Correct (手摆放正确时，磁场出现)
{
  const exp = new EmHandRulesExperiment();
  exp.init({} as any);
  exp.setRuleMode('right-hand-screw');
  exp.setGestureEnabled(true);

  const bench = (exp as any).bench;
  const magFieldGroup = bench.floatingConductor.fieldGroup as THREE.Group;
  const magMat = bench.floatingConductor.fieldMaterial as THREE.MeshStandardMaterial;

  // Step 1: Without hand or with wrong hand, magnetic field is hidden (opacity = 0)
  exp.update(0.016, 0.1, {} as any);
  assert.strictEqual(magFieldGroup.visible, false, 'Magnetic field must be invisible when no hand is present');
  assert(magMat.opacity <= 0.01, `Opacity must be near 0, got ${magMat.opacity}`);

  // Provide wrong hand (left hand)
  const wrongHandFrame = wrapSingleHandFrame(
    'left',
    buildMockLandmarks({
      thumbDirWorld: { x: 0, y: 1 },
      fingersDirWorld: { x: 1, y: 0 },
      curled: true,
    })
  );
  exp.onHandGestureFrame(wrongHandFrame);
  for (let i = 0; i < 20; i++) {
    exp.update(0.016, 0.1 + i * 0.016, {} as any);
  }
  assert.strictEqual(magFieldGroup.visible, false, 'Magnetic field must remain hidden with wrong hand');
  assert(magMat.opacity <= 0.01, 'Opacity must remain near 0 with wrong hand');

  // Step 2: Hand placed correctly (Right hand, thumb pointing UP with current, fingers curled)
  const correctRightHandFrame = wrapSingleHandFrame(
    'right',
    buildMockLandmarks({
      thumbDirWorld: { x: 0, y: 1 },
      fingersDirWorld: { x: -1, y: 0 },
      curled: true,
    })
  );
  exp.onHandGestureFrame(correctRightHandFrame);

  // Update frames: magnetic field must appear and expand
  for (let i = 0; i < 30; i++) {
    exp.update(0.016, 0.5 + i * 0.016, {} as any);
  }
  assert.strictEqual(magFieldGroup.visible, true, 'Magnetic field must appear when hand is placed correctly');
  assert(magMat.opacity > 0.85, `Magnetic field opacity must be high (>0.85), got ${magMat.opacity}`);
  assert((bench as any).floatingConductor.fieldRevealProgress > 0.85, 'Magnetic field reveal scale must expand outward');

  // Step 3: When hand is removed, magnetic field disappears
  exp.onHandGestureFrame(null);
  for (let i = 0; i < 40; i++) {
    exp.update(0.016, 1.0 + i * 0.016, {} as any);
  }
  assert.strictEqual(magFieldGroup.visible, false, 'Magnetic field must disappear after hand is removed');
  assert(magMat.opacity <= 0.01, 'Opacity must decay back to near 0');

  exp.dispose({} as any);
  console.log('✓ Test 7 passed: Magnetic Field Appears Strictly When Hand is Correct verified');
}

// Test 8: The rod toggles the field; either end ferrule reverses current
{
  const exp = new EmHandRulesExperiment();
  exp.init({} as any);
  exp.setRuleMode('right-hand-screw');

  const bench = (exp as any).bench;
  const centralConductor = bench.group.getObjectByName('ScrewCentralConductor');
  assert(centralConductor, 'Conductor must exist');

  // A completed tap toggles the desktop demonstration; dragging must not.
  const tap = { pointerId: 1, clientX: 600, clientY: 400, button: 0 } as PointerEvent;
  const handledConductor = exp.onPointerDown(
    tap,
    { object: centralConductor, point: new THREE.Vector3(0, 0.30, 0) } as any,
    {} as any
  );
  assert.strictEqual(handledConductor, true, 'Clicking conductor must handle interaction');
  exp.onPointerUp(tap, {} as any);

  // Update frames: simulated hand must trigger matched state and reveal magnetic field
  for (let i = 0; i < 30; i++) {
    exp.update(0.016, i * 0.016, {} as any);
  }
  const telem = exp.getTelemetryData();
  assert.strictEqual(telem.isMatched, true, 'Simulated hand must match right-hand screw rule');
  assert.strictEqual((bench.floatingConductor.fieldGroup as THREE.Group).visible, true, 'Field must appear with simulated hand');

  // Both end caps replace the deleted pedestal's polarity selector.
  for (const [name, expected] of [['ConductorUpperFerrule', -1], ['ConductorLowerFerrule', 1]] as const) {
    const cap = bench.group.getObjectByName(name);
    assert(cap, 'Machined end ferrule must exist');
    const handled = exp.onPointerDown(tap, { object: cap, point: new THREE.Vector3(0, 0.43, 0) } as any, {} as any);
    assert.strictEqual(handled, true, 'End cap must reverse current without initiating a drag');
    assert.strictEqual(exp.getTelemetryData().currentPolarity, expected);
  }
  const unrelated = new THREE.Mesh(new THREE.SphereGeometry(0.01));
  assert.strictEqual(exp.onPointerDown(tap, { object: unrelated, point: new THREE.Vector3(0, 0, 0) } as any, {} as any), false,
    'A low world-space hit outside this apparatus must not change polarity');
  exp.resetExperiment();
  assert.strictEqual(exp.getTelemetryData().isMatched, false, 'Reset clears the desktop hand as well as the field');
  exp.setRuleMode('left-hand-rule');
  assert.strictEqual(exp.onPointerDown(tap, { object: centralConductor, point: new THREE.Vector3() } as any, {} as any), false,
    'Hidden apparatus must not intercept another rule');
  unrelated.geometry.dispose();
  (unrelated.material as THREE.Material).dispose();

  exp.dispose({} as any);
  console.log('✓ Test 8 passed: 3D direct manipulation verified\n');
}

// Test 9: Raycast drag under translated/scaled parents, release and cancellation.
{
  const exp = new EmHandRulesExperiment();
  exp.init({} as any);
  const bench = (exp as any).bench;
  const apparatus = bench.floatingConductor;
  // Match the stage's real non-unit transform and test an offset viewport.
  const stage = new THREE.Group();
  stage.position.set(0.2, 0.908, -0.3);
  stage.rotation.y = 0.12;
  stage.add(exp.rootGroup);
  exp.rootGroup.scale.setScalar(3.6);
  stage.updateMatrixWorld(true);
  const camera = new THREE.PerspectiveCamera(45, 1.6, 0.01, 100);
  const center = apparatus.assembly.getWorldPosition(new THREE.Vector3());
  camera.position.copy(center).add(new THREE.Vector3(0.25, 0.25, 3.2));
  camera.lookAt(center);
  camera.updateMatrixWorld(true);
  const rect = { left: 80, top: 40, width: 1000, height: 625 };
  const context = { camera, renderer: { domElement: { getBoundingClientRect: () => rect } } } as any;
  const screen = center.clone().project(camera);
  const down = {
    pointerId: 4, button: 0,
    clientX: rect.left + (screen.x + 1) * rect.width / 2,
    clientY: rect.top + (1 - screen.y) * rect.height / 2,
  } as PointerEvent;
  const hit = { object: bench.group.getObjectByName('ScrewCentralConductor'), point: center } as any;
  assert.strictEqual(exp.onPointerDown(down, hit, context), true);
  const move = { ...down, clientX: down.clientX + 70, clientY: down.clientY - 35 } as PointerEvent;
  exp.onPointerMove(move, null, context);
  for (let i = 0; i < 45; i++) exp.update(1 / 60, i / 60, context);
  assert(apparatus.assembly.position.x > 0.05 && apparatus.assembly.position.x <= 0.101, 'Drag follows pointer in local coordinates and stays in its workspace');
  assert(apparatus.assembly.position.y > 0.32, 'Vertical drag raises the suspended rod');
  assert.strictEqual(exp.getTelemetryData().isMatched, false, 'Dragging must not silently activate a hand demonstration');
  exp.onPointerUp(move, context);
  for (let i = 0; i < 120; i++) exp.update(1 / 60, i / 60, context);
  assert(Math.abs(apparatus.assembly.position.x) < 0.0001, 'Released rod settles back at its suspension point');
  assert(Math.abs(apparatus.assembly.position.y - 0.30) < 0.003, 'Released rod keeps a restrained idle float');
  assert.strictEqual(exp.getTelemetryData().isMatched, false, 'A drag release is not a tap');

  exp.onPointerDown(down, hit, context);
  exp.onPointerCancel(down, context);
  exp.onPointerUp(down, context);
  assert.strictEqual(exp.getTelemetryData().isMatched, false, 'Pointer cancellation must not become a tap');
  exp.onPointerDown(down, hit, context);
  exp.onViewModeChange('whiteboard');
  exp.onPointerUp(down, context);
  assert.strictEqual(exp.getTelemetryData().isMatched, false, 'Switching view cancels any in-progress grab');

  // Electrical and magnetic flow reverse together without collapsing the field.
  exp.onPointerDown(down, hit, context);
  exp.onPointerUp(down, context);
  for (let i = 0; i < 60; i++) exp.update(1 / 60, i / 60, context);
  assert.strictEqual(apparatus.fieldGroup.visible, true);
  exp.reverseCurrent();
  exp.update(1 / 60, 1, context);
  assert(apparatus.fieldMaterial.opacity > 0.9, 'Reversal retains an already revealed field');
  for (let i = 0; i < 90; i++) exp.update(1 / 60, i / 60, context);
  assert(apparatus.circulationSpeed < -0.85, 'B circulation reverses with I');
  assert(apparatus.assembly.position.y - 0.155 > 0.08, 'Rod remains freely suspended above the table');
  exp.dispose(context);
  console.log('✓ Test 9 passed: transformed drag, damped return, cancellation and continuous reversal verified');
}

console.log('========================================================');
console.log('All Electromagnetism Hand Rules Tests Passed (9/9)!');
console.log('========================================================\n');
