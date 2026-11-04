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

// Test 3: Right-Hand Rule (Electromagnetic Induction I_ind)
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

  console.log('✓ Test 3 passed: Right-Hand Rule evaluation verified');
}

// Test 4: 3D T-800 ArticulatedHandSkeletonMesh & EmHandRulesExperiment lifecycle
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
  exp.setRuleMode('right-hand-rule');

  const frame = wrapSingleHandFrame(
    'right',
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
      mode: 'right-hand-rule',
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
  assert.strictEqual(telem.mode, 'right-hand-rule');
  assert.strictEqual(telem.isMatched, true);
  assert.strictEqual(telem.status, 'matched');

  exp.dispose({} as any);
  skeleton.dispose();
  console.log('✓ Test 4 passed: 3D T-800 ArticulatedHandSkeletonMesh & EmHandRulesExperiment lifecycle verified\n');
}

// Test 5: Single Conductor Right-Hand Screw Apparatus & Continuous Current Invariant (只要一个导体，始终有电流流过)
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
  console.log('✓ Test 5 passed: Single Conductor Right-Hand Screw Apparatus & Continuous Current verified');
}

// Test 6: Magnetic Field Appears Strictly When Hand is Correct (手摆放正确时，磁场出现)
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
  console.log('✓ Test 6 passed: Magnetic Field Appears Strictly When Hand is Correct verified');
}

// Test 7: The rod toggles the field; either end ferrule reverses current
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
  exp.setRuleMode('right-hand-rule');
  assert.strictEqual(exp.onPointerDown(tap, { object: centralConductor, point: new THREE.Vector3() } as any, {} as any), false,
    'Hidden apparatus must not intercept another rule');
  unrelated.geometry.dispose();
  (unrelated.material as THREE.Material).dispose();

  exp.dispose({} as any);
  console.log('✓ Test 7 passed: 3D direct manipulation verified\n');
}

// Test 8: Raycast drag under translated/scaled parents, release and cancellation.
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
  console.log('✓ Test 8 passed: transformed drag, damped return, cancellation and continuous reversal verified');
}

// Test 9: Right-Hand Rule Apparatus & Directional Vectors Verification (只保留导体棒，删除所有额外器材)
{
  const exp = new EmHandRulesExperiment();
  exp.init({} as any);
  exp.setRuleMode('right-hand-rule');
  exp.update(0.016, 0.1, {} as any);

  const bench = (exp as any).bench;
  const rightRuleGroup = bench.group.getObjectByName('RightHandRuleApparatus') as THREE.Group;
  assert(rightRuleGroup, 'RightHandRuleApparatus must exist in bench');

  // Verify Single Conductor Rod Invariant: only the conductor rod assembly exists
  const rightRodMesh = bench.group.getObjectByName('RightConductorRod');
  assert(rightRodMesh, 'RightConductorRod must exist');

  // Verify all extra apparatus (field lines, rear yoke, front base, B signboards) are deleted
  assert.strictEqual(rightRuleGroup.getObjectByName('StaticMagneticFieldLines'), undefined, 'Must not have StaticMagneticFieldLines');
  assert.strictEqual(rightRuleGroup.getObjectByName('RearYoke'), undefined, 'Must not have RearYoke');
  assert.strictEqual(rightRuleGroup.getObjectByName('FrontBase'), undefined, 'Must not have FrontBase');
  assert.strictEqual(rightRuleGroup.getObjectByName('RightBLabel'), undefined, 'Must not have RightBLabel');
  assert.strictEqual(rightRuleGroup.children.length, 1, 'RightHandRuleApparatus must only contain the conductor rod assembly');
  assert.strictEqual(rightRuleGroup.children[0].name, 'RightConductorRodAssembly', 'Sole child must be RightConductorRodAssembly');

  const motionArrow = bench.rightMotionArrow as THREE.Group;
  const inducedArrow = bench.rightInducedArrow as THREE.Group;
  const motionLabel = bench.rightMotionLabel as THREE.Mesh;
  const inducedLabel = bench.rightInducedLabel as THREE.Mesh;

  assert(motionArrow, 'Must have velocity direction arrow');
  assert(inducedArrow, 'Must have induced current arrow');
  assert(motionLabel, 'Must have velocity label');
  assert(inducedLabel, 'Must have induced current label');

  // Verify Velocity Arrow points along X axis (+X or -X)
  // Initial config: motionPolarity = 1 -> pointing +X
  const vTipInitial = new THREE.Vector3(0, 1, 0).applyQuaternion(motionArrow.quaternion);
  assert(
    vTipInitial.x > 0.95 && Math.abs(vTipInitial.y) < 0.05 && Math.abs(vTipInitial.z) < 0.05,
    `Velocity arrow must point in +X direction! Got (${vTipInitial.x}, ${vTipInitial.y}, ${vTipInitial.z})`
  );

  // Reverse motion polarity: motionPolarity = -1 -> pointing -X
  exp.reverseMotion();
  exp.update(0.016, 0.2, {} as any);
  const vTipReversed = new THREE.Vector3(0, 1, 0).applyQuaternion(motionArrow.quaternion);
  assert(
    vTipReversed.x < -0.95 && Math.abs(vTipReversed.y) < 0.05 && Math.abs(vTipReversed.z) < 0.05,
    `Velocity arrow must point in -X direction! Got (${vTipReversed.x}, ${vTipReversed.y}, ${vTipReversed.z})`
  );

  // Verify Induced Current Arrow points along Y axis (+Y or -Y)
  // Current config: motionPolarity = -1, fieldPolarity = 1 -> indY = (-1) * (1) = -1 (downward -Y)
  const indTipInitial = new THREE.Vector3(0, 1, 0).applyQuaternion(inducedArrow.quaternion);
  assert(
    indTipInitial.y < -0.95,
    `Induced current arrow must point in -Y direction! Got y = ${indTipInitial.y}`
  );
  assert(
    inducedLabel.position.y < 0,
    `Induced current label must be at negative Y when indY < 0! Got y = ${inducedLabel.position.y}`
  );

  // Reverse field polarity: motionPolarity = -1, fieldPolarity = -1 -> indY = (-1) * (-1) = +1 (upward +Y)
  exp.reverseField();
  exp.update(0.016, 0.3, {} as any);
  const indTipUp = new THREE.Vector3(0, 1, 0).applyQuaternion(inducedArrow.quaternion);
  assert(
    indTipUp.y > 0.95,
    `Induced current arrow must point in +Y direction! Got y = ${indTipUp.y}`
  );
  assert(
    inducedLabel.position.y > 0,
    `Induced current label must be at positive Y when indY > 0! Got y = ${inducedLabel.position.y}`
  );

  // Labels must not overlap in X
  assert(
    Math.sign(motionLabel.position.x) !== Math.sign(inducedLabel.position.x),
    'Velocity label and induced current label must be separated on opposite X sides to prevent overlap'
  );

  // Clicking right conductor rod triggers simulated hand match
  const tap = { pointerId: 1, clientX: 500, clientY: 300, button: 0 } as PointerEvent;
  const handled = exp.onPointerDown(tap, { object: rightRodMesh, point: new THREE.Vector3() } as any, {} as any);
  assert.strictEqual(handled, true, 'Clicking RightConductorRod must handle interaction');

  for (let i = 0; i < 20; i++) exp.update(0.016, 0.4 + i * 0.016, {} as any);
  const telem = exp.getTelemetryData();
  assert.strictEqual(telem.isMatched, true, 'Simulated hand must match right-hand rule');
  assert(bench.rightInducedMat.opacity > 0.8, 'Induced current arrow must become bright upon match');

  exp.dispose({} as any);
  console.log('✓ Test 9 passed: Right-Hand Rule Single Conductor Rod & Directional Vectors verified');
}

// Test 10: Strict Directional Verification for Right-Hand Screw Rule (聚焦拇指朝向，反向/横向/前向均不触发，同向顺畅触发)
{
  const configUp: HandRuleConfig = {
    mode: 'right-hand-screw',
    currentPolarity: 1,
    fieldPolarity: 1,
    motionPolarity: 1,
    gestureEnabled: true,
  };

  // 1. 正确姿势：大拇指指向电流 (+Y 向上)，四指握持导线 (Thumbs-up)，精准判别成功
  const thumbUpFrame = wrapSingleHandFrame(
    'right',
    buildMockLandmarks({
      thumbDirWorld: { x: 0, y: 1 },
      fingersDirWorld: { x: -1, y: 0 },
      curled: true,
    })
  );
  const evalUp = evaluateHandRuleFrame(configUp, thumbUpFrame);
  assert.strictEqual(evalUp.isMatched, true, 'Proper thumbs-up pointing along current MUST match right-hand screw rule');
  assert.strictEqual(evalUp.status, 'matched');

  // 1b. 开掌平展/击掌手势（如用户截图3：五指大张开，四指朝上，拇指朝右）：严禁误判触发磁场
  const openPalmFrame = wrapSingleHandFrame(
    'right',
    buildMockLandmarks({
      thumbDirWorld: { x: 1, y: 0.4 },
      fingersDirWorld: { x: 0, y: 1 },
      curled: false,
    })
  );
  const evalOpenPalm = evaluateHandRuleFrame(configUp, openPalmFrame);
  assert.strictEqual(evalOpenPalm.isMatched, false, 'Open palm with fingers pointing up MUST NOT match right-hand screw rule');
  assert(evalOpenPalm.statusLabel.includes('避免全张开手掌'));

  // 1c. 侧向平展手掌（四指完全伸平）：严禁误判
  const flatHandFrame = wrapSingleHandFrame(
    'right',
    buildMockLandmarks({
      thumbDirWorld: { x: 0, y: 1 },
      fingersDirWorld: { x: -1, y: 0 },
      curled: false,
    })
  );
  const evalFlatHand = evaluateHandRuleFrame(configUp, flatHandFrame);
  assert.strictEqual(evalFlatHand.isMatched, false, 'Flat open hand without curl MUST NOT match');

  // 2. 拇指横指 (+X 水平向右 90°)：与电流垂直，严禁触发
  const thumbSideFrame = wrapSingleHandFrame(
    'right',
    buildMockLandmarks({
      thumbDirWorld: { x: 1, y: 0 },
      fingersDirWorld: { x: 0, y: 1 },
      curled: true,
    })
  );
  const evalSide = evaluateHandRuleFrame(configUp, thumbSideFrame);
  assert.strictEqual(evalSide.isMatched, false, 'Horizontal sideways thumb MUST NOT match vertical current');

  // 3. 拇指前指 (+Z 指向摄像头)：深度感知生效，严禁误判为垂直向上对齐
  const forwardThumbFrame = wrapSingleHandFrame(
    'right',
    buildMockLandmarks({
      thumbDirWorld: { x: 0, y: 0.1, z: 1 },
      fingersDirWorld: { x: -1, y: 0 },
      curled: true,
    })
  );
  const evalForward = evaluateHandRuleFrame(configUp, forwardThumbFrame);
  assert.strictEqual(evalForward.isMatched, false, 'Thumb pointing towards camera MUST NOT match vertical wire');

  // 4. 拇指向下 (-Y)：与电流完全反向，严禁触发
  const thumbDownFrame = wrapSingleHandFrame(
    'right',
    buildMockLandmarks({
      thumbDirWorld: { x: 0, y: -1 },
      fingersDirWorld: { x: 1, y: 0 },
      curled: true,
    })
  );
  const evalDown = evaluateHandRuleFrame(configUp, thumbDownFrame);
  assert.strictEqual(evalDown.isMatched, false, 'Inverted thumb pointing opposite to current MUST NOT match');

  // 5. 电流向下 (-Y) 时：拇指向下必须成功匹配，拇指向上严禁匹配
  const configDown: HandRuleConfig = { ...configUp, currentPolarity: -1 };
  assert.strictEqual(evaluateHandRuleFrame(configDown, thumbDownFrame).isMatched, true);
  assert.strictEqual(evaluateHandRuleFrame(configDown, thumbUpFrame).isMatched, false);

  console.log('✓ Test 10 passed: Strict Directional Verification for Right-Hand Screw Rule verified');
}

// Test 11: Single Right Hand in Left Half of Screen (screenX <= 0.45) correctly matches Right-Hand Screw Rule
{
  const { HandGestureService } = await import('../src/vision/HandGestureService.ts');
  const service = new HandGestureService();

  // 用户在屏幕中左侧（未镜像 rawX = 0.60 -> 镜像后 screenX = 0.40 <= 0.45）伸出右手比划定则
  // 模型预测 categoryName: 'Left' (未镜像相机下真实右手)
  const lms = buildMockLandmarks({
    thumbDirWorld: { x: 0, y: 1 },
    fingersDirWorld: { x: -1, y: 0 },
    curled: true,
  });
  // 将关键点整体偏移至屏幕中左侧 (screenX ≈ 0.40)
  for (const p of lms) {
    p.x += 0.10; // 偏移后镜像 screenX = 1 - 0.60 = 0.40
  }

  const frame = service.processMultiHands([lms], [[{ categoryName: 'Left', score: 0.95 }]], 5000);
  assert(frame.hasHand, 'Must detect hand');
  assert(frame.rightHand !== null, 'Right hand at screenX <= 0.45 MUST be recognized as rightHand (not forced to leftHand)');
  assert.strictEqual(frame.leftHand, null, 'Must NOT be falsely assigned to leftHand');

  const evalRes = evaluateHandRuleFrame(
    {
      mode: 'right-hand-screw',
      currentPolarity: 1,
      fieldPolarity: 1,
      motionPolarity: 1,
      gestureEnabled: true,
    },
    frame
  );
  assert.strictEqual(evalRes.isMatched, true, 'Right hand in center-left position MUST successfully match right-hand screw rule');

  console.log('✓ Test 11 passed: Single Right Hand in Left Half of Screen (screenX <= 0.45) matches Right-Hand Screw Rule');
}

// Test 12: Left-Hand Rule (Ampere Force F) Physics Evaluation
{
  const config: HandRuleConfig = {
    mode: 'left-hand-rule',
    currentPolarity: 1, // Current UP (+Y)
    fieldPolarity: 1,   // Field INTO screen (-Z)
    motionPolarity: 1,
    gestureEnabled: true,
  };

  // 1. Wrong hand test: user extends right hand instead of left hand
  const rightHandFrame = wrapSingleHandFrame(
    'right',
    buildMockLandmarks({
      thumbDirWorld: { x: -1, y: 0 },
      fingersDirWorld: { x: 0, y: 1 },
      curled: false,
    })
  );
  const wrongHandEval = evaluateHandRuleFrame(config, rightHandFrame);
  assert.strictEqual(wrongHandEval.status, 'wrong-hand', 'Extending right hand in left-hand rule must trigger wrong-hand');
  assert.strictEqual(wrongHandEval.isMatched, false);
  assert.strictEqual(wrongHandEval.requiredHand, 'left');

  // 2. Correct left hand test:
  // With I = (0, 1, 0), B = (0, 0, -1):
  // F = I x B = (1 * (-1), 0, 0) = (-1, 0, 0) (Ampere force to the left -X)
  const leftMatchFrame = wrapSingleHandFrame(
    'left',
    buildMockLandmarks({
      thumbDirWorld: { x: -1, y: 0 },
      fingersDirWorld: { x: 0, y: 1 },
      curled: false,
    })
  );
  const matchedEval = evaluateHandRuleFrame(config, leftMatchFrame);
  assert.strictEqual(matchedEval.status, 'matched', 'Correct left hand pose must match');
  assert.strictEqual(matchedEval.isMatched, true);
  assert.strictEqual(matchedEval.targetVectorDir.x, -1, 'Ampere force must point in -X direction');

  // 3. Reverse current: currentPolarity = -1 (Current DOWN -Y)
  // F = (-1) * (-1) = +1 (Ampere force to the right +X)
  config.currentPolarity = -1;
  const oppositeEval = evaluateHandRuleFrame(config, leftMatchFrame);
  assert.strictEqual(oppositeEval.isMatched, false, 'Opposite current direction must not match previous hand pose');

  const leftReversedFrame = wrapSingleHandFrame(
    'left',
    buildMockLandmarks({
      thumbDirWorld: { x: 1, y: 0 },
      fingersDirWorld: { x: 0, y: -1 },
      curled: false,
    })
  );
  const matchedReversed = evaluateHandRuleFrame(config, leftReversedFrame);
  assert.strictEqual(matchedReversed.isMatched, true, 'Reversed pose must match when current is reversed');
  assert.strictEqual(matchedReversed.targetVectorDir.x, 1, 'Ampere force must point in +X direction');

  // 4. Reverse field: fieldPolarity = -1 (Field OUT OF screen +Z)
  // F = (-1) * (+1) = -1 (Ampere force back to -X)
  config.fieldPolarity = -1;
  const fieldReversedEval = evaluateHandRuleFrame(config, leftMatchFrame);
  assert.strictEqual(fieldReversedEval.isMatched, true, 'Reversing field must flip force back to -X');
  assert.strictEqual(fieldReversedEval.targetVectorDir.x, -1);

  console.log('✓ Test 12 passed: Left-Hand Rule physics solver & directional evaluation verified');
}

// Test 13: Left-Hand Rule 3D Apparatus, Direct Manipulation & Dynamics on Chrome Rails
{
  const exp = new EmHandRulesExperiment();
  exp.init({} as any);
  exp.setRuleMode('left-hand-rule');
  assert.strictEqual(exp.getRuleMode(), 'left-hand-rule', 'Rule mode must be left-hand-rule');

  const bench = (exp as any).bench;
  const leftRuleGroup = bench.group.getObjectByName('LeftHandRuleApparatus') as THREE.Group;
  assert(leftRuleGroup, 'LeftHandRuleApparatus must exist in bench');
  assert.strictEqual(leftRuleGroup.visible, true, 'LeftHandRuleApparatus must be visible');
  assert.strictEqual((bench as any).screwGroup.visible, false, 'Screw group must be hidden in left-hand-rule');
  assert.strictEqual((bench as any).rightRuleGroup.visible, false, 'Right-hand-rule group must be hidden in left-hand-rule');

  const leftRodMesh = bench.group.getObjectByName('LeftConductorRod');
  assert(leftRodMesh, 'LeftConductorRod must exist');

  const leftCurrentArrow = (bench as any).leftCurrentArrow as THREE.Group;
  const leftForceArrow = (bench as any).leftForceArrow as THREE.Group;
  const leftCurrentLabel = (bench as any).leftCurrentLabel as THREE.Mesh;
  const leftForceLabel = (bench as any).leftForceLabel as THREE.Mesh;

  assert(leftCurrentArrow, 'LeftCurrentArrow must exist');
  assert(leftForceArrow, 'AmpereForceArrow must exist');
  assert(leftCurrentLabel, 'Left current label must exist');
  assert(leftForceLabel, 'Ampere force label must exist');

  // Labels must not overlap in Y
  assert(
    Math.abs(leftCurrentLabel.position.y - leftForceLabel.position.y) > 0.02,
    'Current label and force label must be separated in Y to prevent overlap'
  );

  // Initial config: currentPolarity = 1, fieldPolarity = 1 -> Fx = -1 (-X direction)
  exp.update(0.016, 0.1, {} as any);
  const fTipInitial = new THREE.Vector3(0, 1, 0).applyQuaternion(leftForceArrow.quaternion);
  assert(
    fTipInitial.x < -0.95 && Math.abs(fTipInitial.y) < 0.05,
    `Ampere force arrow must point in -X direction! Got (${fTipInitial.x}, ${fTipInitial.y})`
  );

  // Reverse current: currentPolarity = -1 -> Fx = +1 (+X direction)
  exp.reverseCurrent();
  exp.update(0.016, 0.2, {} as any);
  const fTipReversed = new THREE.Vector3(0, 1, 0).applyQuaternion(leftForceArrow.quaternion);
  assert(
    fTipReversed.x > 0.95 && Math.abs(fTipReversed.y) < 0.05,
    `Ampere force arrow must point in +X direction! Got (${fTipReversed.x}, ${fTipReversed.y})`
  );

  // Clicking LeftConductorRod triggers simulated hand match
  const tap = { pointerId: 1, clientX: 500, clientY: 300, button: 0 } as PointerEvent;
  const handled = exp.onPointerDown(tap, { object: leftRodMesh, point: new THREE.Vector3() } as any, {} as any);
  assert.strictEqual(handled, true, 'Clicking LeftConductorRod must handle interaction');

  for (let i = 0; i < 20; i++) exp.update(0.016, 0.3 + i * 0.016, {} as any);
  const telem = exp.getTelemetryData();
  assert.strictEqual(telem.isMatched, true, 'Simulated hand must match left-hand rule');
  assert.strictEqual(telem.requiredHand, 'left', 'Telemetry must report requiredHand = left');
  assert((bench as any).leftForceMat.emissiveIntensity > 0.9, 'Ampere force arrow must glow brightly upon match');

  // Verify smooth gliding displacement along rails
  assert(
    Math.abs((bench as any).leftRodGroup.position.x) > 0.01,
    'Conductor rod must slide along rails under Ampere force'
  );

  exp.dispose({} as any);
  console.log('✓ Test 13 passed: Left-Hand Rule 3D Apparatus, Direct Manipulation & Dynamics on Chrome Rails verified');
}

// Test 14: Strict Camera Viewpoint Stability Invariant (No jarring camera pose shift on opening)
{
  const exp = new EmHandRulesExperiment();
  assert.strictEqual(
    (exp as any).initialCameraPose,
    undefined,
    'EmHandRulesExperiment must not define initialCameraPose so the camera viewpoint remains stable on module open'
  );
  console.log('✓ Test 14 passed: Camera viewpoint stability verified (zero forced initial camera jump)');
}

// Test 15: Real-Life Hand Pose Invariant (User Report Bug Reproduction & Verification)
// In Right-Hand Screw Rule, an open hand with four fingers pointing straight UP and thumb pointing HORIZONTALLY RIGHT
// MUST NOT match (it was an unphysical false-positive). But in Right-Hand Rule (v = +X, I_ind = +Y), it matches.
{
  const realLms: NormalizedLandmark[] = [];
  for (let i = 0; i < 21; i++) realLms.push({ x: 0.5, y: 0.5, z: 0 });
  realLms[0] = { x: 0.5, y: 0.65, z: 0 }; // Wrist
  realLms[5] = { x: 0.46, y: 0.52, z: 0 }; // Index MCP
  realLms[9] = { x: 0.50, y: 0.50, z: 0 }; // Middle MCP
  realLms[13] = { x: 0.54, y: 0.52, z: 0 }; // Ring MCP
  realLms[17] = { x: 0.58, y: 0.54, z: 0 }; // Pinky MCP

  // Thumb extended horizontally to the right (+X)
  realLms[1] = { x: 0.47, y: 0.60, z: 0 };
  realLms[2] = { x: 0.44, y: 0.58, z: 0 };
  realLms[3] = { x: 0.40, y: 0.58, z: 0 };
  realLms[4] = { x: 0.35, y: 0.58, z: 0 };

  // Four fingers extended vertically straight UP (+Y)
  realLms[6] = { x: 0.46, y: 0.45, z: 0 };
  realLms[7] = { x: 0.46, y: 0.40, z: 0 };
  realLms[8] = { x: 0.46, y: 0.35, z: 0 };
  realLms[10] = { x: 0.50, y: 0.43, z: 0 };
  realLms[11] = { x: 0.50, y: 0.38, z: 0 };
  realLms[12] = { x: 0.50, y: 0.33, z: 0 };
  realLms[14] = { x: 0.54, y: 0.45, z: 0 };
  realLms[15] = { x: 0.54, y: 0.40, z: 0 };
  realLms[16] = { x: 0.54, y: 0.35, z: 0 };
  realLms[18] = { x: 0.58, y: 0.48, z: 0 };
  realLms[19] = { x: 0.58, y: 0.44, z: 0 };
  realLms[20] = { x: 0.58, y: 0.40, z: 0 };

  const userFrame = wrapSingleHandFrame('right', realLms);

  // Case A: Right-Hand Screw Rule (current UP) -> MUST NOT MATCH!
  const screwConfig: HandRuleConfig = {
    mode: 'right-hand-screw',
    currentPolarity: 1,
    fieldPolarity: 1,
    motionPolarity: 1,
    gestureEnabled: true,
  };
  const screwEval = evaluateHandRuleFrame(screwConfig, userFrame);
  assert.strictEqual(
    screwEval.isMatched,
    false,
    'Open palm with four fingers pointing UP and thumb pointing right MUST NOT match Right-Hand Screw Rule'
  );
  assert(
    screwEval.statusLabel.includes('避免全张开手掌') || screwEval.statusLabel.includes('握住导线'),
    `Status label must guide user to grip the wire. Got: ${screwEval.statusLabel}`
  );

  // Case B: Right-Hand Rule (motion +X, field -Z -> induced current +Y) -> MATCHES!
  const rhrConfig: HandRuleConfig = {
    mode: 'right-hand-rule',
    currentPolarity: 1,
    fieldPolarity: 1,
    motionPolarity: 1,
    gestureEnabled: true,
  };
  const rhrEval = evaluateHandRuleFrame(rhrConfig, userFrame);
  assert.strictEqual(
    rhrEval.isMatched,
    true,
    'Open palm with four fingers pointing UP and thumb pointing right MUST match Right-Hand Rule (induction)'
  );

  console.log('✓ Test 15 passed: User hand pose physical distinction (Screw Rule vs Induction Rule) verified');
}

// Test 16: Thumb Orientation Primacy for Screw Rule & 3D Anatomical Chirality Invariant Auto-Correction
{
  const { detectAnatomicalChirality } = await import('../src/physics/em/handRulesSolver.ts');

  // 1. 真实 3D 握拳竖大拇指姿态（指关节在掌面 palmar 侧，大拇指坚决竖直向上）
  // 即使 MediaPipe 2D 分类头单帧误判为 "Left"，3D 标量三重积严格保证判定为解剖学右手
  const rightThumbsUp3D: NormalizedLandmark[] = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.5, z: 0 }));
  rightThumbsUp3D[0] = { x: 0.50, y: 0.60, z: 0 };       // Wrist
  rightThumbsUp3D[9] = { x: 0.50, y: 0.48, z: 0.005 };    // Middle MCP
  rightThumbsUp3D[5] = { x: 0.46, y: 0.50, z: 0 };       // Index MCP
  rightThumbsUp3D[17] = { x: 0.54, y: 0.52, z: 0 };      // Pinky MCP
  // 大拇指竖直向上，指尖延伸至前方掌侧 (-Z in camera, palmar flexion)
  rightThumbsUp3D[2] = { x: 0.46, y: 0.46, z: -0.010 };
  rightThumbsUp3D[3] = { x: 0.46, y: 0.40, z: -0.018 };
  rightThumbsUp3D[4] = { x: 0.46, y: 0.33, z: -0.025 }; // Thumb Tip points UP

  // 四指在掌心侧握拳屈曲
  for (const mcp of [5, 9, 13, 17]) {
    rightThumbsUp3D[mcp + 1] = { x: rightThumbsUp3D[mcp].x, y: 0.48, z: -0.015 };
    rightThumbsUp3D[mcp + 2] = { x: rightThumbsUp3D[mcp].x, y: 0.51, z: -0.020 };
    rightThumbsUp3D[mcp + 3] = { x: rightThumbsUp3D[mcp].x, y: 0.54, z: -0.015 };
  }

  // 验证 3D 解剖学手性：必须精准判定为右手
  const chirality = detectAnatomicalChirality(rightThumbsUp3D);
  assert.strictEqual(chirality, 'right', '3D thumbs-up pose MUST be anatomically recognized as right hand');

  // 2. 模拟前端单帧手性分类器翻转（误传入 leftHand）：
  const frameWithMislabeledHand: HandGestureFrame = {
    hasHand: true,
    timestamp: 1000,
    leftHand: {
      handedness: 'left', // 误标为左手
      confidence: 0.85,
      landmarks: rightThumbsUp3D,
      thumbTip: rightThumbsUp3D[4],
      indexTip: rightThumbsUp3D[8],
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
    },
    rightHand: null,
    leftHandQuickPinch: false,
    leftHandCameraDelta: null,
    landmarks: rightThumbsUp3D,
    thumbTip: rightThumbsUp3D[4],
    indexTip: rightThumbsUp3D[8],
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

  const screwConfig: HandRuleConfig = {
    mode: 'right-hand-screw',
    currentPolarity: 1, // 电流向上 (+Y)
    fieldPolarity: 1,
    motionPolarity: 1,
    gestureEnabled: true,
  };

  // evaluateHandRuleFrame 必须自动纠偏并将右手大拇指朝向电流判定为匹配成功！
  const evalResult = evaluateHandRuleFrame(screwConfig, frameWithMislabeledHand);
  assert.strictEqual(
    evalResult.isMatched,
    true,
    'Thumbs-up pointing along current MUST match right-hand screw rule even if 2D classifier mistagged as left'
  );
  assert.strictEqual(evalResult.status, 'matched');
  assert.strictEqual(evalResult.detectedHand, 'right');
  assert(evalResult.statusLabel.includes('匹配成功'));

  console.log('✓ Test 16 passed: Thumb Orientation Primacy for Screw Rule & 3D Anatomical Chirality Invariant verified');
}

// Test 17: Plain Closed Fist (without extending thumb) MUST NOT trigger Right-Hand Screw Rule
{
  const screwConfig: HandRuleConfig = {
    mode: 'right-hand-screw',
    currentPolarity: 1, // 电流向上 (+Y)
    fieldPolarity: 1,
    motionPolarity: 1,
    gestureEnabled: true,
  };

  // 构造普通闭合握拳手势（四指握拳，大拇指未竖起，扣在食指/中指外侧）：
  const plainFistLms = buildMockLandmarks({
    thumbDirWorld: { x: 0, y: 1 },
    fingersDirWorld: { x: -1, y: 0 },
    curled: true,
  });
  // 将大拇指修改为扣在拳头上的屈曲状态 (IP关节弯曲，指尖未伸展超出拳面)
  plainFistLms[2] = { x: 0.48, y: 0.54, z: 0 };
  plainFistLms[3] = { x: 0.45, y: 0.51, z: 0.015 };
  plainFistLms[4] = { x: 0.43, y: 0.52, z: 0.020 };

  const fistFrame = wrapSingleHandFrame('right', plainFistLms);
  const evalResult = evaluateHandRuleFrame(screwConfig, fistFrame);

  // 严禁普通闭合握拳触发右手螺旋定则，必须引导用户真正竖起大拇指！
  assert.strictEqual(
    evalResult.isMatched,
    false,
    'Plain closed fist without extending thumb MUST NOT match Right-Hand Screw Rule'
  );
  assert.strictEqual(evalResult.status, 'adjusting');
  assert(
    evalResult.statusLabel.includes('竖起大拇指') || evalResult.statusLabel.includes('握拳'),
    `Status label must guide user to extend thumb. Got: ${evalResult.statusLabel}`
  );

  console.log('✓ Test 17 passed: Plain Closed Fist is strictly rejected and requires extending thumb');
}

console.log('========================================================');
console.log('All Electromagnetism Hand Rules Tests Passed (17/17)!');
console.log('========================================================\n');
