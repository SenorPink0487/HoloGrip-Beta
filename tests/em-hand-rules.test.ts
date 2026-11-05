import assert from 'node:assert';
import { readFileSync } from 'node:fs';

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
  buildSyntheticHandLandmarks as buildMockLandmarks,
  evaluateHandRuleFrame,
  extractHandKinematics,
  type HandRuleConfig,
} from '../src/physics/em/handRulesSolver.ts';
import type { HandGestureFrame, NormalizedLandmark, SingleHandData } from '../src/vision/types.ts';
import * as THREE from 'three';
import { ArticulatedHandSkeletonMesh, HAND_BONE_CONNECTIONS } from '../src/scene/em/ArticulatedHandSkeletonMesh.ts';
import EmHandRulesExperiment from '../src/experiments/catalog/em-hand-rules/index.ts';
import { PhysicsDisciplineModal } from '../src/ui/vision/PhysicsDisciplineModal.ts';

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

  const leftUpFrame = wrapSingleHandFrame(
    'left',
    buildMockLandmarks({
      handedness: 'left',
      thumbDirWorld: { x: 0, y: 1 },
      fingersDirWorld: { x: 1, y: 0 },
      curled: true,
    })
  );
  const leftEval = evaluateHandRuleFrame(config, leftUpFrame);
  assert.strictEqual(leftEval.status, 'wrong-hand');
  assert.strictEqual(leftEval.isMatched, false, 'An aligned left thumb must not trigger the right-hand screw rule');

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

  // Step 1: Without hand or with an opposite thumb, magnetic field is hidden (opacity = 0)
  exp.update(0.016, 0.1, {} as any);
  assert.strictEqual(magFieldGroup.visible, false, 'Magnetic field must be invisible when no hand is present');
  assert(magMat.opacity <= 0.01, `Opacity must be near 0, got ${magMat.opacity}`);

  // Provide a downward thumb while the current points up
  const wrongDirectionFrame = wrapSingleHandFrame(
    'left',
    buildMockLandmarks({
      handedness: 'left',
      thumbDirWorld: { x: 0, y: -1 },
      fingersDirWorld: { x: 1, y: 0 },
      curled: true,
    })
  );
  exp.onHandGestureFrame(wrongDirectionFrame);
  for (let i = 0; i < 20; i++) {
    exp.update(0.016, 0.1 + i * 0.016, {} as any);
  }
  assert.strictEqual(magFieldGroup.visible, false, 'Magnetic field must remain hidden with an opposite thumb');
  assert(magMat.opacity <= 0.01, 'Opacity must remain near 0 with an opposite thumb');

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

// Test 9: Right-Hand Rule Apparatus, Known Magnetic Field & Directional Vectors Verification
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

  // Keep the single conductor apparatus and display the shared uniform field around it.
  assert.strictEqual(rightRuleGroup.getObjectByName('StaticMagneticFieldLines'), undefined, 'Must not have StaticMagneticFieldLines');
  assert.strictEqual(rightRuleGroup.getObjectByName('RearYoke'), undefined, 'Must not have RearYoke');
  assert.strictEqual(rightRuleGroup.getObjectByName('FrontBase'), undefined, 'Must not have FrontBase');
  const fieldIndicators = bench.group.getObjectByName('UniformMagneticFieldIndicators');
  assert(fieldIndicators?.visible, 'Right-hand rule must display the known magnetic field before a hand matches');
  assert(fieldIndicators.getObjectByName('UniformMagneticFieldLabel'), 'The known field must have a B label');
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
  assert(evalOpenPalm.statusLabel.includes('大拇指'));

  // 1c. 四指完全伸平不影响触发，只检查拇指是否向上
  const flatHandFrame = wrapSingleHandFrame(
    'right',
    buildMockLandmarks({
      thumbDirWorld: { x: 0, y: 1 },
      fingersDirWorld: { x: -1, y: 0 },
      curled: false,
    })
  );
  const evalFlatHand = evaluateHandRuleFrame(configUp, flatHandFrame);
  assert.strictEqual(evalFlatHand.isMatched, true, 'Straight fingers must not block an upward thumb');

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
  // Tasks 模型对未镜像相机中的真实右手直接输出 Right
  const lms = buildMockLandmarks({
    thumbDirWorld: { x: 0, y: 1 },
    fingersDirWorld: { x: -1, y: 0 },
    curled: true,
  });
  // 将关键点整体偏移至屏幕中左侧 (screenX ≈ 0.40)
  for (const p of lms) {
    p.x += 0.10; // 偏移后镜像 screenX = 1 - 0.60 = 0.40
  }

  const frame = service.processMultiHands([lms], [[{ categoryName: 'Right', score: 0.95 }]], 5000);
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
      handedness: 'left',
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
      handedness: 'left',
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
  assert.strictEqual(fieldReversedEval.isMatched, false, 'An unchanged palm and current direction must fail after reversing both field and current');
  const fieldReversedPose = wrapSingleHandFrame('left', buildMockLandmarks({
    handedness: 'left', thumbDirWorld: { x: -1, y: 0 }, fingersDirWorld: { x: 0, y: -1 },
  }));
  assert.strictEqual(evaluateHandRuleFrame(config, fieldReversedPose).isMatched, true, 'Current and palm must also follow the reversed known quantities');
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
  assert.strictEqual(leftForceArrow.visible, false, 'Ampere force arrow must be hidden initially when no hand gesture is matching');
  assert.strictEqual(leftForceLabel.visible, false, 'Ampere force label must be hidden initially when no hand gesture is matching');
  assert((bench as any).leftForceMat.opacity <= 0.01, 'Ampere force opacity must be near 0 initially');

  const fTipInitial = new THREE.Vector3(0, 1, 0).applyQuaternion(leftForceArrow.quaternion);
  assert(
    fTipInitial.x < -0.95 && Math.abs(fTipInitial.y) < 0.05,
    `Ampere force arrow must point in -X direction! Got (${fTipInitial.x}, ${fTipInitial.y})`
  );

  // Reverse current: currentPolarity = -1 -> Fx = +1 (+X direction)
  exp.reverseCurrent();
  exp.update(0.016, 0.2, {} as any);
  assert.strictEqual(leftForceArrow.visible, false, 'Ampere force arrow remains hidden after reversing current before hand match');
  const fTipReversed = new THREE.Vector3(0, 1, 0).applyQuaternion(leftForceArrow.quaternion);
  assert(
    fTipReversed.x > 0.95 && Math.abs(fTipReversed.y) < 0.05,
    `Ampere force arrow must point in +X direction! Got (${fTipReversed.x}, ${fTipReversed.y})`
  );

  // Wrong gesture test: user extends right hand instead of left hand
  exp.setGestureEnabled(true);
  const wrongHandFrame = wrapSingleHandFrame(
    'right',
    buildMockLandmarks({
      thumbDirWorld: { x: -1, y: 0 },
      fingersDirWorld: { x: 0, y: 1 },
      curled: false,
    })
  );
  exp.onHandGestureFrame(wrongHandFrame);
  for (let i = 0; i < 15; i++) exp.update(0.016, 0.2 + i * 0.016, {} as any);
  assert.strictEqual(leftForceArrow.visible, false, 'Ampere force must remain hidden when wrong hand (right) is used');

  // Correct gesture test: proper left hand with I, B alignment
  // currentPolarity = -1, fieldPolarity = 1 -> targetVectorDir.x = +1
  const correctLeftHandFrame = wrapSingleHandFrame(
    'left',
    buildMockLandmarks({
      handedness: 'left',
      thumbDirWorld: { x: 1, y: 0 },
      fingersDirWorld: { x: 0, y: -1 },
      curled: false,
    })
  );
  exp.onHandGestureFrame(correctLeftHandFrame);
  for (let i = 0; i < 30; i++) exp.update(0.016, 0.5 + i * 0.016, {} as any);
  assert.strictEqual(exp.getTelemetryData().isMatched, true, 'Left hand must match left hand rule');
  assert.strictEqual(leftForceArrow.visible, true, 'Ampere force arrow must become visible when hand gesture is placed correctly');
  assert.strictEqual(leftForceLabel.visible, true, 'Ampere force label must become visible when hand gesture is placed correctly');
  assert((bench as any).leftForceMat.opacity > 0.85, 'Ampere force opacity must become high upon match');

  // Hand removed: Ampere force direction disappears
  exp.onHandGestureFrame(null);
  for (let i = 0; i < 40; i++) exp.update(0.016, 1.0 + i * 0.016, {} as any);
  assert.strictEqual(leftForceArrow.visible, false, 'Ampere force arrow must disappear when hand is removed');
  assert.strictEqual(leftForceLabel.visible, false, 'Ampere force label must disappear when hand is removed');

  // Clicking LeftConductorRod triggers simulated hand match (desktop tap interaction)
  const tap = { pointerId: 1, clientX: 500, clientY: 300, button: 0 } as PointerEvent;
  const handled = exp.onPointerDown(tap, { object: leftRodMesh, point: new THREE.Vector3() } as any, {} as any);
  assert.strictEqual(handled, true, 'Clicking LeftConductorRod must handle interaction');

  for (let i = 0; i < 20; i++) exp.update(0.016, 1.8 + i * 0.016, {} as any);
  const telem = exp.getTelemetryData();
  assert.strictEqual(telem.isMatched, true, 'Simulated hand must match left-hand rule');
  assert.strictEqual(telem.requiredHand, 'left', 'Telemetry must report requiredHand = left');
  assert.strictEqual(leftForceArrow.visible, true, 'Ampere force arrow must appear upon simulated match');
  assert.strictEqual(leftForceLabel.visible, true, 'Ampere force label must appear upon simulated match');
  assert((bench as any).leftForceMat.emissiveIntensity > 0.9, 'Ampere force arrow must glow brightly upon match');

  // Verify smooth gliding displacement along rails
  assert(
    Math.abs((bench as any).leftRodGroup.position.x) > 0.01,
    'Conductor rod must slide along rails under Ampere force'
  );

  // Verify dynamic flowing 2D magnetic field symbols invariants (no 3D arrows)
  const symbols = (bench as any).uniformFieldSymbols as any[];
  assert(symbols && symbols.length === 12, 'Must contain 12 standard 2D magnetic field symbols in wings');
  assert.strictEqual(symbols[0].mat.map, (bench as any).texFieldIn, 'Field map must be inward ⊗ when bz < 0');
  const initialPhase = (bench as any).uniformFieldFlowPhase;
  for (let i = 0; i < 10; i++) exp.update(0.016, 2.5 + i * 0.016, {} as any);
  assert((bench as any).uniformFieldFlowPhase > initialPhase, 'Magnetic field flow phase must continuously advance');

  // Verify dynamic flowing photon streamline packets (24 packets across 12 channels)
  const packets = (bench as any).uniformFieldPackets as any[];
  assert(packets && packets.length === 24, 'Must contain 24 dynamic flowing streamline photon packets');
  const initialPhotonPhase = (bench as any).uniformFieldPhotonPhase;
  for (let i = 0; i < 10; i++) exp.update(0.016, 2.6 + i * 0.016, {} as any);
  assert((bench as any).uniformFieldPhotonPhase > initialPhotonPhase, 'Streamline photon phase must continuously advance');

  // Verify field direction reversal switches 2D symbols to outward ⊙
  exp.reverseField();
  exp.update(0.016, 2.7, {} as any);
  assert.strictEqual(symbols[0].mat.map, (bench as any).texFieldOut, 'Field map must switch to outward ⊙ when reversed');

  // Verify no extra clutter (no rails, no posts, no shoes)
  assert.strictEqual(bench.group.getObjectByName('LeftConductorRail'), undefined, 'Must not have extra guide rails');
  assert.strictEqual(bench.group.getObjectByName('ConductorShoe'), undefined, 'Must not have extra contact shoes');

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
    screwEval.statusLabel.includes('大拇指'),
    `Status label must guide the thumb direction. Got: ${screwEval.statusLabel}`
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

// Test 16: The solver must preserve the tracker handedness, regardless of estimated finger depth.
{

  const rightThumbsUp3D = screwGripFixture();
  const screwConfig: HandRuleConfig = {
    mode: 'right-hand-screw', currentPolarity: 1, fieldPolarity: 1, motionPolarity: 1, gestureEnabled: true,
  };
  for (const depthSign of [-1, 1]) {
    const points = rightThumbsUp3D.map(point => ({ ...point, z: point.z * depthSign }));
    const leftEval = evaluateHandRuleFrame(screwConfig, wrapSingleHandFrame('left', points));
    assert.strictEqual(leftEval.isMatched, false, 'Finger-depth estimates must never let a tracked left hand trigger');
    assert.strictEqual(leftEval.status, 'wrong-hand');
    assert.strictEqual(leftEval.detectedHand, 'left');
    const rightEval = evaluateHandRuleFrame(screwConfig, wrapSingleHandFrame('right', points));
    assert.strictEqual(rightEval.isMatched, true, 'Four-finger depth does not participate in thumb-only matching');
    assert.strictEqual(rightEval.detectedHand, 'right');
  }
  console.log('✓ Test 16 passed: Left hands are rejected while right-hand pose checks use only thumb direction');
}

// Test 17: A fist with a sideways thumb must still fail on thumb direction alone
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
    evalResult.statusLabel.includes('大拇指'),
    `Status label must guide user to extend thumb. Got: ${evalResult.statusLabel}`
  );

  console.log('✓ Test 17 passed: A sideways thumb is rejected without consulting fist shape');
}

// Independent measured-style open palm: thumb +X, fingers +Y, palm outward +Z.
// This fixture intentionally does not use the production demonstration generator.
function openPalmFixture(): NormalizedLandmark[] {
  const points: NormalizedLandmark[] = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.5, z: 0 }));
  points[0] = { x: 0.50, y: 0.65, z: 0 };
  points[1] = { x: 0.47, y: 0.60, z: 0 };
  points[2] = { x: 0.44, y: 0.58, z: 0 };
  points[3] = { x: 0.40, y: 0.58, z: 0 };
  points[4] = { x: 0.35, y: 0.58, z: 0 };
  const baseX = [0.46, 0.50, 0.54, 0.58];
  for (const [index, mcp] of [5, 9, 13, 17].entries()) {
    for (let joint = 0; joint < 4; joint++) {
      points[mcp + joint] = { x: baseX[index], y: 0.52 - joint * 0.045, z: 0 };
    }
  }
  return points;
}

// Independent camera-space right grip, mapped into the mirrored view; thumb points +Y.
function screwGripFixture(): NormalizedLandmark[] {
  const world: THREE.Vector3[] = Array.from({ length: 21 }, () => new THREE.Vector3());
  world[0].set(0, -0.05, 0);
  world[1].set(0.03, -0.01, 0);
  world[2].set(0.01, 0.01, 0);
  world[3].set(0.01, 0.055, 0);
  world[4].set(0.01, 0.105, 0);
  for (const [index, mcp] of [5, 9, 13, 17].entries()) {
    world[mcp].set(-0.08, 0.06 - index * 0.04, 0);
    world[mcp + 1].copy(world[mcp]).add(new THREE.Vector3(-0.05, 0, 0));
    world[mcp + 2].copy(world[mcp + 1]).add(new THREE.Vector3(0, 0, -0.035));
    world[mcp + 3].copy(world[mcp + 2]).add(new THREE.Vector3(0.035, 0, 0));
  }
  return world.map(point => ({ x: 0.5 - point.x, y: 0.5 - point.y, z: -point.z }));
}

const physicalConfig: HandRuleConfig = {
  mode: 'right-hand-rule', currentPolarity: 1, fieldPolarity: 1, motionPolarity: 1, gestureEnabled: true,
};
const signs = [-1, 1] as const;

// Test 18: Exhaust all polarity combinations against analytic force/emf and palm directions.
{
  for (const field of signs) {
    for (const motion of signs) {
      const config = { ...physicalConfig, fieldPolarity: field, motionPolarity: motion };
      const points = openPalmFixture().map(p => ({
        x: 0.5 + (p.x - 0.5) * motion,
        y: 0.5 + (p.y - 0.5) * motion * field,
        z: p.z * field,
      }));
      const ev = evaluateHandRuleFrame(config, wrapSingleHandFrame('right', points));
      assert.strictEqual(ev.isMatched, true, `v=${motion}, Bz=${-field}: correct right palm must match`);
      assert.strictEqual(ev.targetVectorDir.y, motion * field, 'Positive-charge direction must equal v × B');
      assert.strictEqual(evaluateHandRuleFrame({ ...config, fieldPolarity: -field as 1 | -1 },
        wrapSingleHandFrame('right', points)).isMatched, false, 'Reversing only B invalidates the unchanged pose');
    }
    for (const current of signs) {
      const config = { ...physicalConfig, mode: 'left-hand-rule' as const, currentPolarity: current, fieldPolarity: field };
      const points = openPalmFixture().map(p => ({
        x: 0.5 - (p.x - 0.5) * current * field,
        y: 0.5 + (p.y - 0.5) * current,
        z: p.z * field,
      }));
      const ev = evaluateHandRuleFrame(config, wrapSingleHandFrame('left', points));
      assert.strictEqual(ev.isMatched, true, `I=${current}, Bz=${-field}: correct left palm must match`);
      assert.strictEqual(ev.targetVectorDir.x, -current * field, 'Ampere force must equal Iℓ × B');
    }
  }
  console.log('✓ Test 18 passed: All field, motion and current polarity combinations satisfy the cross products');
}

// Test 19: No individual alignment can compensate for another incorrect physical constraint.
{
  const evaluate = (points: NormalizedLandmark[]) =>
    evaluateHandRuleFrame(physicalConfig, wrapSingleHandFrame('right', points));
  for (const direction of [{ x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: 1 }, { x: -1, y: 0, z: 0 }]) {
    const points = openPalmFixture();
    points[3] = { x: points[2].x - direction.x * 0.04, y: points[2].y - direction.y * 0.04, z: -direction.z * 0.04 };
    points[4] = { x: points[2].x - direction.x * 0.09, y: points[2].y - direction.y * 0.09, z: -direction.z * 0.09 };
    assert.strictEqual(evaluate(points).isMatched, false, 'Correct fingers with wrong/parallel thumb must fail');
  }
  const backOfHand = openPalmFixture();
  for (const mcp of [5, 9, 13, 17]) {
    for (let joint = 0; joint < 4; joint++) backOfHand[mcp + joint].x = 1 - backOfHand[mcp + joint].x;
  }
  const backEval = evaluate(backOfHand);
  assert.strictEqual(backEval.isMatched, false, 'Magnetic field entering the back of the hand must fail');
  assert(backEval.statusLabel.includes('掌心'));

  for (const mcp of [5, 9, 13, 17]) {
    const wrongFinger = openPalmFixture();
    for (let joint = 1; joint < 4; joint++) wrongFinger[mcp + joint].y = wrongFinger[mcp].y + joint * 0.045;
    assert.strictEqual(evaluate(wrongFinger).isMatched, false, 'Every finger must point along the induced positive-charge direction');
  }
  const bentThumb = openPalmFixture();
  bentThumb[3].y -= 0.07;
  assert.strictEqual(evaluate(bentThumb).isMatched, false, 'A bent thumb cannot pass on direction alone');

  const spreadFingers = openPalmFixture();
  for (const [index, mcp] of [5, 9, 13, 17].entries()) {
    const angle = (index < 2 ? -30 : 30) * Math.PI / 180;
    for (let joint = 1; joint < 4; joint++) {
      spreadFingers[mcp + joint].x = spreadFingers[mcp].x + Math.sin(angle) * joint * 0.045;
      spreadFingers[mcp + joint].y = spreadFingers[mcp].y - Math.cos(angle) * joint * 0.045;
    }
  }
  assert.strictEqual(evaluate(spreadFingers).isMatched, false, 'Widely splayed fingers must fail even when each roughly points upward');

  const wrongLeftFingers = openPalmFixture().map(p => ({ ...p, x: 1 - p.x }));
  for (const mcp of [5, 9, 13, 17]) {
    for (let joint = 1; joint < 4; joint++) wrongLeftFingers[mcp + joint].y = wrongLeftFingers[mcp].y + joint * 0.045;
  }
  assert.strictEqual(evaluateHandRuleFrame({ ...physicalConfig, mode: 'left-hand-rule' },
    wrapSingleHandFrame('left', wrongLeftFingers)).isMatched, false, 'Left thumb along F is insufficient when fingers oppose I');

  const screwConfig = { ...physicalConfig, mode: 'right-hand-screw' as const };
  for (const mcp of [5, 9, 13, 17]) {
    const partialGrip = buildMockLandmarks({ thumbDirWorld: { x: 0, y: 1 }, fingersDirWorld: { x: -1, y: 0 }, curled: true });
    for (let joint = 1; joint < 4; joint++) {
      partialGrip[mcp + joint] = { ...partialGrip[mcp], x: partialGrip[mcp].x + joint * 0.04 };
    }
    assert.strictEqual(evaluateHandRuleFrame(screwConfig, wrapSingleHandFrame('right', partialGrip)).isMatched, true,
      'Other fingers must not block a correctly oriented thumb');
  }
  console.log('✓ Test 19 passed: Open-hand rule constraints remain strict while screw matching ignores other fingers');
}

// Test 20: Malformed, degenerate and low-confidence frames fail closed without NaN scores.
{
  const invalidPoses = [
    openPalmFixture().slice(0, 20),
    Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.5, z: 0 })),
    Array(21),
  ];
  for (const axis of ['x', 'y', 'z'] as const) {
    for (const value of [NaN, Infinity, -Infinity]) {
      const points = openPalmFixture(); points[4][axis] = value; invalidPoses.push(points);
    }
  }
  const noThumbBone = openPalmFixture(); noThumbBone[4] = { ...noThumbBone[3] }; invalidPoses.push(noThumbBone);
  const collapsedPalm = openPalmFixture(); collapsedPalm[17] = { ...collapsedPalm[5] }; invalidPoses.push(collapsedPalm);
  for (const points of invalidPoses) {
    const ev = evaluateHandRuleFrame(physicalConfig, wrapSingleHandFrame('right', points));
    assert.strictEqual(ev.isMatched, false); assert.strictEqual(ev.status, 'idle');
    assert(Number.isFinite(ev.alignmentScore) && ev.alignmentScore === 0);
  }
  for (const confidence of [0.2, 0.79, NaN, Infinity]) {
    const frame = wrapSingleHandFrame('right', openPalmFixture()); frame.rightHand!.confidence = confidence;
    assert.strictEqual(evaluateHandRuleFrame(physicalConfig, frame).isMatched, false);
  }
  assert.strictEqual(evaluateHandRuleFrame({ ...physicalConfig, gestureEnabled: false },
    wrapSingleHandFrame('right', openPalmFixture())).status, 'idle');
  assert.strictEqual(evaluateHandRuleFrame(physicalConfig, null).isMatched, false);
  console.log('✓ Test 20 passed: Missing joints, collapsed geometry, non-finite coordinates and low confidence fail safely');
}

// Test 21: Position/scale invariance, small-angle tolerance and shared hand selection for rendering.
{
  for (const scale of [0.2, 0.5, 1, 2]) {
    const moved = openPalmFixture().map(p => ({ x: 0.6 + (p.x - 0.5) * scale, y: 0.6 + (p.y - 0.5) * scale, z: 0.03 + p.z * scale }));
    assert.strictEqual(evaluateHandRuleFrame(physicalConfig, wrapSingleHandFrame('right', moved)).isMatched, true);
  }
  for (const degrees of [15, 55]) {
    const angle = degrees * Math.PI / 180;
    const rotated = openPalmFixture().map(p => ({
      x: 0.5 + (p.x - 0.5) * Math.cos(angle) - (p.y - 0.5) * Math.sin(angle),
      y: 0.5 + (p.x - 0.5) * Math.sin(angle) + (p.y - 0.5) * Math.cos(angle), z: p.z,
    }));
    assert.strictEqual(evaluateHandRuleFrame(physicalConfig, wrapSingleHandFrame('right', rotated)).isMatched, degrees === 15);
  }
  const grip = buildMockLandmarks({ thumbDirWorld: { x: 0, y: 1 }, fingersDirWorld: { x: -1, y: 0 }, curled: true });
  const screwConfig = { ...physicalConfig, mode: 'right-hand-screw' as const };
  const leftGrip = grip.map(p => ({ ...p, x: 1 - p.x }));
  assert.strictEqual(evaluateHandRuleFrame(screwConfig, wrapSingleHandFrame('left', leftGrip)).status, 'wrong-hand',
    'An aligned left thumb is ineligible for the right-hand screw rule');
  const twoHands = wrapSingleHandFrame('left', leftGrip);
  twoHands.rightHand = wrapSingleHandFrame('right', grip).rightHand;
  assert.strictEqual(evaluateHandRuleFrame(screwConfig, twoHands).isMatched, true, 'Select the required hand when both are visible');
  // A valid hand stored in the other slot must be used for both evaluation and rendering.
  twoHands.leftHand = { ...twoHands.rightHand!, handedness: 'right' };
  twoHands.rightHand = { ...twoHands.rightHand!, landmarks: Array(21) };
  const corrected = evaluateHandRuleFrame(screwConfig, twoHands);
  assert.strictEqual(corrected.isMatched, true);
  assert.strictEqual(corrected.sourceHand, 'leftHand');
  const skeleton = new ArticulatedHandSkeletonMesh(); skeleton.update(0.016, twoHands, corrected);
  assert.strictEqual(skeleton.group.visible, true);
  assert.strictEqual((skeleton as any).currentHandedness, 'right');
  for (const point of (skeleton as any).currentPoints as THREE.Vector3[]) {
    assert([point.x, point.y, point.z].every(Number.isFinite), 'Rejected landmarks must never reach the rendered skeleton');
  }
  skeleton.dispose();
  const normal = extractHandKinematics(openPalmFixture(), 'right').palmNormal;
  assert(normal.z > 0.99, 'The outward normal of a right palm facing the operator is +Z');
  console.log('✓ Test 21 passed: Scale, translation, angular tolerance, handedness and two-hand selection verified');
}

// Test 22: Desktop demonstrations must satisfy the same full physical constraints after every reversal.
{
  const exp = new EmHandRulesExperiment(); exp.init({} as any); exp.setDesktopDemonstration(true);
  for (const mode of ['right-hand-screw', 'left-hand-rule', 'right-hand-rule'] as const) {
    exp.setRuleMode(mode);
    for (let step = 0; step < 4; step++) {
      exp.reverseCurrent(); exp.reverseField();
      if (step % 2 === 0) exp.reverseMotion();
      exp.update(0.016, step * 0.016, {} as any);
      assert.strictEqual(exp.getTelemetryData().isMatched, true, `${mode}: desktop pose obeys the same solver after reversal`);
    }
  }
  exp.setDesktopDemonstration(false);
  assert.strictEqual(exp.getTelemetryData().isMatched, false, 'Removing the pose releases the physical reveal');
  exp.dispose({} as any);
  console.log('✓ Test 22 passed: All desktop modes remain valid under polarity reversal');
}

// Test 23: Replay the entire model-result → tracking → solver chain for both hands on both screen sides.
{
  const { HandGestureService } = await import('../src/vision/HandGestureService.ts');
  const config = { ...physicalConfig, mode: 'right-hand-screw' as const };
  for (const mirrorX of [true, false]) {
    const service = new HandGestureService({ mirrorX });
    let timestamp = 5000;
    for (const offsetX of [-0.2, 0.2]) {
      for (const handedness of ['left', 'right'] as const) {
        const pose = buildMockLandmarks({ handedness,
          thumbDirWorld: { x: 0, y: 1 }, fingersDirWorld: { x: -1, y: 0 }, curled: true,
        }).map(point => ({ ...point, x: point.x + offsetX }));
        const frame = service.processMultiHands([pose],
          [[{ categoryName: handedness === 'right' ? 'Right' : 'Left', score: 0.99 }]], timestamp);
        const ev = evaluateHandRuleFrame(config, frame);
        assert.strictEqual(ev.detectedHand, handedness, 'Solver and tracking preview must agree on the same hand');
        assert.strictEqual(ev.isMatched, handedness === 'right', 'Only a right-hand thumb may activate the screw rule');
        timestamp += 40;
      }
    }
    const grip = buildMockLandmarks({ thumbDirWorld: { x: 0, y: 1 }, fingersDirWorld: { x: -1, y: 0 }, curled: true });
    service.processMultiHands([grip], [[{ categoryName: 'Right', score: 0.99 }]], timestamp);
    const uncertain = service.processMultiHands([grip], [[{ categoryName: 'Left', score: 0.55 }]], timestamp + 40);
    assert(uncertain.rightHand, 'An uncertain single frame may preserve the cursor track');
    assert.strictEqual(evaluateHandRuleFrame(config, uncertain).isMatched, true,
      'Hand-classification confidence must not block a reliable thumb direction');
  }
  console.log('✓ Test 23 passed: Thumb direction stays simple while the pipeline rejects Left on either screen side');
}

// Test 24: Only the MCP-to-tip direction participates in the screw rule, with a 25-degree cone.
{
  const config = { ...physicalConfig, mode: 'right-hand-screw' as const };
  const evaluate = (points: NormalizedLandmark[]) => evaluateHandRuleFrame(config, wrapSingleHandFrame('right', points));
  const validGrip = screwGripFixture();
  assert.strictEqual(evaluate(validGrip).isMatched, true);
  for (const axis of [new THREE.Vector3(0, 0, 1), new THREE.Vector3(1, 0, 0)]) {
    for (const degrees of [10, 19, 24, 24.9, 25.1, 26, 35, 45, 90]) {
      for (const sign of [-1, 1]) {
        const rotated = validGrip.map(point => {
          const world = new THREE.Vector3(0.5 - point.x, 0.5 - point.y, -point.z)
            .applyAxisAngle(axis, sign * degrees * Math.PI / 180);
          return { x: 0.5 - world.x, y: 0.5 - world.y, z: -world.z };
        });
        assert.strictEqual(evaluate(rotated).isMatched, degrees < 25,
          `A ${sign * degrees}° slanted thumb in either the image or depth plane must obey the 25° direction limit`);
      }
    }
  }
  for (const degrees of [0, 90, 180, 270]) {
    const aroundWire = validGrip.map(point => {
      const world = new THREE.Vector3(0.5 - point.x, 0.5 - point.y, -point.z)
        .applyAxisAngle(new THREE.Vector3(0, 1, 0), degrees * Math.PI / 180);
      return { x: 0.5 - world.x, y: 0.5 - world.y, z: -world.z };
    });
    assert.strictEqual(evaluate(aroundWire).isMatched, true, 'A correct grip can face any direction around the vertical conductor');
  }
  // Palm facing forward, fingers hook downward: the flexion axis is horizontal, even with a vertical thumb.
  const hooked = openPalmFixture();
  hooked[3] = { x: hooked[2].x, y: hooked[2].y - 0.04, z: 0 };
  hooked[4] = { x: hooked[2].x, y: hooked[2].y - 0.09, z: 0 };
  for (const mcp of [5, 9, 13, 17]) {
    hooked[mcp + 1] = { ...hooked[mcp], y: hooked[mcp].y - 0.05 };
    hooked[mcp + 2] = { ...hooked[mcp + 1], z: -0.035 };
    hooked[mcp + 3] = { ...hooked[mcp + 2], y: hooked[mcp + 2].y + 0.035 };
  }
  assert.strictEqual(evaluate(hooked).isMatched, true, 'An upward thumb works even when the other fingers hook about a different axis');
  for (const mcp of [5, 9, 13, 17]) {
    const reversedFinger = structuredClone(validGrip);
    for (let joint = 1; joint < 4; joint++) reversedFinger[mcp + joint].z *= -1;
    assert.strictEqual(evaluate(reversedFinger).isMatched, true, 'Individual finger curls do not affect the thumb direction');
  }
  const misleadingAverage = structuredClone(validGrip);
  misleadingAverage[3].x += 0.025; // opposite lateral deviations can cancel in a weighted average
  assert.strictEqual(evaluate(misleadingAverage).isMatched, true, 'Intermediate thumb joint noise must not block an aligned MCP-to-tip direction');
  const partial = Array(21) as NormalizedLandmark[];
  partial[2] = { x: 0.5, y: 0.6, z: 0 };
  partial[4] = { x: 0.5, y: 0.45, z: 0 };
  const partialFrame = wrapSingleHandFrame('right', partial);
  partialFrame.rightHand!.confidence = 0.1;
  const partialEval = evaluateHandRuleFrame(config, partialFrame);
  assert.strictEqual(partialEval.isMatched, true, 'A visible thumb must work without any other fingers or hand-classification confidence');
  const skeleton = new ArticulatedHandSkeletonMesh();
  skeleton.update(0.016, partialFrame, partialEval);
  assert.strictEqual(skeleton.group.visible, false, 'An incomplete skeleton stays hidden without blocking the thumb result');
  skeleton.dispose();
  for (const index of [2, 4]) {
    for (const value of [undefined, { x: NaN, y: 0.5, z: 0 }, { x: 0.5, y: Infinity, z: 0 }]) {
      const invalid = [...partial]; invalid[index] = value as NormalizedLandmark;
      assert.strictEqual(evaluate(invalid).status, 'idle', 'Missing or non-finite thumb endpoints must fail safely');
    }
  }
  const zeroThumb = [...partial]; zeroThumb[4] = { ...zeroThumb[2] };
  assert.strictEqual(evaluate(zeroThumb).status, 'idle', 'A zero-length thumb must not acquire a default upward direction');
  const bothHands = wrapSingleHandFrame('left', validGrip);
  bothHands.rightHand = wrapSingleHandFrame('right', buildMockLandmarks({
    thumbDirWorld: { x: 1, y: 0 }, fingersDirWorld: { x: 0, y: 1 },
  })).rightHand;
  const bothEval = evaluateHandRuleFrame(config, bothHands);
  assert.strictEqual(bothEval.sourceHand, 'rightHand', 'An aligned left thumb cannot substitute for the right hand');
  assert.strictEqual(bothEval.isMatched, false, 'A sideways right thumb must fail even when the left thumb is aligned');
  console.log('✓ Test 24 passed: Right-hand thumb direction, 25° cone, partial landmarks and rendering safety verified');
}

// Test 25: Real bundled-model output remains usable without four-finger or per-bone constraints.
{
  const fixture = JSON.parse(readFileSync(new URL('./fixtures/em_right_thumbs_up.json', import.meta.url), 'utf8'));
  const points: NormalizedLandmark[] = fixture.landmarks;
  const kin = extractHandKinematics(points, 'right');
  const rotation = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(kin.thumbDir.x, kin.thumbDir.y, kin.thumbDir.z), new THREE.Vector3(0, 1, 0));
  const aligned = points.map(point => {
    const world = new THREE.Vector3(0.5 - point.x, 0.5 - point.y, -point.z).applyQuaternion(rotation);
    return { x: 0.5 - world.x, y: 0.5 - world.y, z: -world.z };
  });
  const { HandGestureService } = await import('../src/vision/HandGestureService.ts');
  const service = new HandGestureService();
  const frame = service.processMultiHands([aligned], [[{ categoryName: fixture.handedness, score: fixture.confidence }]], 1000);
  const config = { ...physicalConfig, mode: 'right-hand-screw' as const };
  assert.strictEqual(frame.rightHand?.handedness, 'right', 'The real model Right label must survive the preview mirror');
  assert.strictEqual(evaluateHandRuleFrame(config, frame).isMatched, true, 'A real right grip aligned to the current must match');
  for (const degrees of [35, 45]) {
    const tilted = aligned.map(point => {
      const world = new THREE.Vector3(0.5 - point.x, 0.5 - point.y, -point.z)
        .applyAxisAngle(new THREE.Vector3(0, 0, 1), degrees * Math.PI / 180);
      return { x: 0.5 - world.x, y: 0.5 - world.y, z: -world.z };
    });
    const badFrame = service.processMultiHands([tilted], [[{ categoryName: 'Right', score: fixture.confidence }]], 1100 + degrees);
    assert.strictEqual(evaluateHandRuleFrame(config, badFrame).isMatched, false, 'Slanting a real captured grip must not trigger the field');
  }
  console.log('✓ Test 25 passed: Real HandLandmarker sample works with thumb direction alone and still rejects sideways tilts');
}

// Test 26: An upward left thumb never reveals the field, including immediately after a valid right hand.
{
  const config = { ...physicalConfig, mode: 'right-hand-screw' as const };
  const rightPose = buildMockLandmarks({ thumbDirWorld: { x: 0, y: 1 }, fingersDirWorld: { x: -1, y: 0 }, curled: false });
  const rightFrame = wrapSingleHandFrame('right', rightPose);
  const leftFrame = wrapSingleHandFrame('left', rightPose);
  for (const currentPolarity of [1, -1] as const) {
    const pose = buildMockLandmarks({ thumbDirWorld: { x: 0, y: currentPolarity }, fingersDirWorld: { x: -1, y: 0 } });
    const ev = evaluateHandRuleFrame({ ...config, currentPolarity }, wrapSingleHandFrame('left', pose));
    assert.strictEqual(ev.status, 'wrong-hand');
    assert.strictEqual(ev.isMatched, false);
    assert.strictEqual(ev.alignmentScore, 0, 'Left-hand alignment must not contribute any match score');
  }
  const exp = new EmHandRulesExperiment(); exp.init({} as any); exp.setGestureEnabled(true);
  const field = (exp as any).bench.floatingConductor;
  exp.onHandGestureFrame(leftFrame); exp.update(0.016, 0, {} as any);
  assert.strictEqual(field.fieldGroup.visible, false, 'A left thumb cannot reveal the field from idle');
  exp.onHandGestureFrame(rightFrame);
  for (let step = 0; step < 30; step++) exp.update(0.016, step * 0.016, {} as any);
  assert.strictEqual(exp.getTelemetryData().isMatched, true, 'An open right hand with an aligned thumb must still work');
  assert.strictEqual(field.fieldGroup.visible, true);
  exp.onHandGestureFrame(leftFrame); exp.update(0.016, 0.5, {} as any);
  assert.strictEqual(exp.getTelemetryData().status, 'wrong-hand');
  assert.strictEqual(field.fieldGroup.visible, false, 'Switching to a left hand must hide the prior right-hand reveal immediately');
  assert.strictEqual(field.fieldMaterial.opacity, 0);
  exp.onHandGestureFrame(rightFrame);
  for (let step = 0; step < 30; step++) exp.update(0.016, 0.6 + step * 0.016, {} as any);
  assert.strictEqual(exp.getTelemetryData().isMatched, true, 'Returning the right hand restores the same simple thumb match');
  assert.strictEqual(field.fieldGroup.visible, true);
  exp.dispose({} as any);
  console.log('✓ Test 26 passed: Left-thumb rejection in both polarities, immediate visual cancellation and right-hand recovery verified');
}

// Test 27: Left-hand force direction and rod motion are revealed together only after a correct gesture.
{
  for (const current of [-1, 1] as const) {
    for (const field of [-1, 1] as const) {
      const exp = new EmHandRulesExperiment(); exp.init({} as any);
      exp.setRuleMode('left-hand-rule'); exp.setGestureEnabled(true);
      if (current < 0) exp.reverseCurrent();
      if (field < 0) exp.reverseField();
      const bench = (exp as any).bench;
      const rod = bench.leftRodGroup as THREE.Group;
      const arrow = bench.leftForceArrow as THREE.Group;
      const label = bench.leftForceLabel as THREE.Mesh;
      const forceX = -current * field;
      const pose = buildMockLandmarks({ handedness: 'left',
        thumbDirWorld: { x: forceX, y: 0 }, fingersDirWorld: { x: 0, y: current },
      });
      const correctFrame = wrapSingleHandFrame('left', pose);
      const wrongFrame = wrapSingleHandFrame('right', pose);
      for (let step = 0; step < 60; step++) exp.update(0.016, step * 0.016, {} as any);
      assert.strictEqual(rod.position.x, 0, 'The rod must stay at rest until a correct gesture is present');
      assert.strictEqual(arrow.visible, false); assert.strictEqual(label.visible, false);
      exp.onHandGestureFrame(wrongFrame);
      for (let step = 0; step < 30; step++) exp.update(0.016, 1 + step * 0.016, {} as any);
      assert.strictEqual(rod.position.x, 0, 'The wrong hand must not start the rod');
      assert.strictEqual(arrow.visible, false);

      exp.onHandGestureFrame(correctFrame); exp.update(0.016, 1.5, {} as any);
      const firstX = rod.position.x;
      assert(firstX * forceX > 0 && Math.abs(firstX) < 0.001, 'Start smoothly from rest in the Ampere-force direction without teleporting');
      assert.strictEqual(arrow.visible, true); assert.strictEqual(label.visible, true);
      const arrowDirection = new THREE.Vector3(0, 1, 0).applyQuaternion(arrow.quaternion);
      assert(arrowDirection.x * forceX > 0.99, 'The displayed force and initial acceleration must agree');
      exp.update(0.016, 1.516, {} as any);
      assert((rod.position.x - firstX) * forceX > Math.abs(firstX), 'Equal time intervals must show increasing displacement as the rod accelerates');
      for (let step = 0; step < 20; step++) exp.update(0.016, 1.532 + step * 0.016, {} as any);

      const stoppedX = rod.position.x;
      exp.onHandGestureFrame(null); exp.update(0.016, 2, {} as any);
      assert.strictEqual(rod.position.x, stoppedX, 'Removing the hand pauses the rod in place');
      assert.strictEqual(arrow.visible, false); assert.strictEqual(label.visible, false);
      exp.onHandGestureFrame(wrongFrame);
      for (let step = 0; step < 30; step++) exp.update(0.016, 2.1 + step * 0.016, {} as any);
      assert.strictEqual(rod.position.x, stoppedX, 'The paused rod must not move or reset while the gesture is incorrect');
      assert.strictEqual(arrow.visible, false);
      exp.onHandGestureFrame(correctFrame); exp.update(0.016, 2.6, {} as any);
      const resumedX = rod.position.x;
      assert((resumedX - stoppedX) * forceX > 0 && Math.abs(resumedX - stoppedX) < 0.005, 'Correcting the gesture resumes continuously from the paused position');

      let previousX = resumedX;
      let cycleCount = 0;
      let farthestX = 0;
      for (let step = 0; step < 360; step++) {
        exp.update(0.016, 2.7 + step * 0.016, {} as any);
        const displacement = (rod.position.x - previousX) * forceX;
        if (displacement < -1e-7) {
          cycleCount++;
          assert(previousX * forceX > 0.29 && rod.position.x * forceX < 0.001,
            'The only reverse displacement is an immediate endpoint-to-start reset');
        }
        farthestX = Math.max(farthestX, rod.position.x * forceX);
        assert(Math.abs(rod.position.x) <= 0.300001, 'The repeating demonstration must stay within its extended travel');
        assert(rod.position.x * forceX >= -1e-8, 'Every stroke travels in the force direction');
        assert(bench.leftRodVelocity * forceX >= 0, 'The rod must never acquire a return velocity');
        assert.strictEqual(arrow.visible, true, 'A continuously correct gesture keeps the force direction visible during every cycle');
        previousX = rod.position.x;
      }
      assert(cycleCount >= 3, 'Holding the correct pose must repeat full strokes');
      assert(farthestX > 0.29, 'Travel must extend well past the old 0.12m endpoint');

      const pausedX = rod.position.x;
      exp.onHandGestureFrame(null);
      for (let step = 0; step < 30; step++) exp.update(0.016, 10 + step * 0.016, {} as any);
      assert.strictEqual(rod.position.x, pausedX, 'Removing the hand pauses the cycle exactly in place');
      assert.strictEqual(arrow.visible, false);
      exp.onHandGestureFrame(correctFrame); exp.update(0.016, 10.5, {} as any);
      assert((rod.position.x - pausedX) * forceX > 0, 'A corrected pose resumes motion in the force direction');
      previousX = rod.position.x;
      exp.setGestureEnabled(false); exp.update(0.016, 7, {} as any);
      assert.strictEqual(rod.position.x, previousX, 'Disabling gestures also pauses motion');
      assert.strictEqual(arrow.visible, false); assert.strictEqual(label.visible, false);
      exp.resetExperiment(); exp.update(0.016, 7.1, {} as any);
      assert.strictEqual(rod.position.x, 0, 'Reset returns to rest without automatic movement');
      assert.strictEqual(arrow.visible, false);
      exp.dispose({} as any);
    }
  }
  console.log('✓ Test 27 passed: Extended one-way strokes, endpoint resets, gesture pause/resume and all force polarities verified');
}

// Test 28: Real open-hand model samples must work with naturally oblique thumbs and mildly spread fingers.
{
  const fixture = JSON.parse(readFileSync(new URL('./fixtures/em_left_open_palms.json', import.meta.url), 'utf8'));
  const config: HandRuleConfig = { ...physicalConfig, mode: 'left-hand-rule' };
  const { HandGestureService } = await import('../src/vision/HandGestureService.ts');
  for (const hand of fixture.hands) {
    const raw: NormalizedLandmark[] = hand.landmarks;
    const initial = extractHandKinematics(raw, 'left');
    const fingerRotation = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(initial.fourFingersDir.x, initial.fourFingersDir.y, initial.fourFingersDir.z), new THREE.Vector3(0, 1, 0));
    let vectors = raw.map(point => new THREE.Vector3(0.5 - point.x, 0.5 - point.y, -point.z).applyQuaternion(fingerRotation));
    const toLandmarks = (): NormalizedLandmark[] => vectors.map(v => ({ x: 0.5 - v.x, y: 0.5 - v.y, z: -v.z }));
    const facing = extractHandKinematics(toLandmarks(), 'left').palmNormal;
    const faceRotation = -Math.atan2(facing.x, facing.z);
    vectors = vectors.map(v => v.applyAxisAngle(new THREE.Vector3(0, 1, 0), faceRotation));
    const canonical = toLandmarks();
    const kin = extractHandKinematics(canonical, 'left');
    assert(kin.thumbDir.y > 0.8 && -kin.thumbDir.x < 0.8,
      'This real natural thumb is oblique enough to fail the previous horizontal-tip test');

    for (const current of signs) {
      for (const field of signs) {
        const pose = canonical.map(point => ({
          x: 0.5 + (point.x - 0.5) * current * field,
          y: 0.5 + (point.y - 0.5) * current,
          z: point.z * field,
        }));
        const service = new HandGestureService();
        const frame = service.processMultiHands([pose], [[{ categoryName: 'Left', score: hand.confidence }]], 1000);
        const localConfig = { ...config, currentPolarity: current, fieldPolarity: field };
        const ev = evaluateHandRuleFrame(localConfig, frame);
        assert.strictEqual(ev.isMatched, true, `Real left palm must express I=${current}, Bz=${-field} despite an oblique thumb`);
        assert.strictEqual(ev.targetVectorDir.x, -current * field);
        const exp = new EmHandRulesExperiment(); exp.init({} as any); exp.setRuleMode('left-hand-rule');
        exp.setGestureEnabled(true); if (current < 0) exp.reverseCurrent(); if (field < 0) exp.reverseField();
        exp.onHandGestureFrame(frame);
        for (let step = 0; step < 20; step++) exp.update(0.016, step * 0.016, {} as any);
        const bench = (exp as any).bench;
        assert(bench.leftRodGroup.position.x * ev.targetVectorDir.x > 0, 'The real recognized palm must actually move the rod');
        assert.strictEqual(bench.leftForceArrow.visible, true);
        exp.dispose({} as any);
        assert.strictEqual(evaluateHandRuleFrame({ ...localConfig, fieldPolarity: -field as 1 | -1 }, frame).isMatched, false,
          'Flipping B still requires turning the palm');
        assert.strictEqual(evaluateHandRuleFrame({ ...localConfig, currentPolarity: -current as 1 | -1 }, frame).isMatched, false,
          'Flipping I still requires reversing the four fingers');
        assert.strictEqual(evaluateHandRuleFrame(localConfig, wrapSingleHandFrame('right', pose)).status, 'wrong-hand');
      }
    }
    const moderateSpread = structuredClone(canonical);
    for (const [index, mcp] of [5, 9, 13, 17].entries()) {
      const direction = new THREE.Vector3(index === 0 ? -0.4 : index === 3 ? 0.4 : 0, 1, 0).normalize();
      for (let joint = 1; joint < 4; joint++) {
        moderateSpread[mcp + joint] = { x: moderateSpread[mcp].x - direction.x * joint * 0.05,
          y: moderateSpread[mcp].y - direction.y * joint * 0.05, z: moderateSpread[mcp].z };
      }
    }
    assert.strictEqual(evaluateHandRuleFrame(config, wrapSingleHandFrame('left', moderateSpread)).isMatched, true,
      'Natural finger spread must not block a correct current direction');
    const foldedThumb = structuredClone(canonical);
    foldedThumb[4] = { ...foldedThumb[9] };
    assert.strictEqual(evaluateHandRuleFrame(config, wrapSingleHandFrame('left', foldedThumb)).isMatched, false,
      'A thumb folded into the palm still fails');
    const fist = buildMockLandmarks({ handedness: 'left', thumbDirWorld: { x: -1, y: 0 },
      fingersDirWorld: { x: 0, y: 1 }, curled: true });
    assert.strictEqual(evaluateHandRuleFrame(config, wrapSingleHandFrame('left', fist)).isMatched, false);
    const uncertain = wrapSingleHandFrame('left', canonical); uncertain.leftHand!.confidence = 0.65;
    assert.strictEqual(evaluateHandRuleFrame(config, uncertain).isMatched, true,
      'A tracked natural left palm must not require an extra 0.8 classification threshold');
    uncertain.leftHand!.confidence = 0.3;
    assert.strictEqual(evaluateHandRuleFrame(config, uncertain).isMatched, false);
  }
  console.log('✓ Test 28 passed: Real left-palm model samples, natural thumb abduction, finger spread, force motion and invalid-pose rejection verified');
}

// Test 29: Cutting motion stays aligned with v throughout repeated extended strokes at different frame rates.
{
  for (const direction of [-1, 1] as const) {
    for (const dt of [1 / 30, 1 / 60, 1 / 120]) {
      const exp = new EmHandRulesExperiment(); exp.init({} as any); exp.setRuleMode('right-hand-rule');
      if (direction < 0) exp.reverseMotion();
      const bench = (exp as any).bench;
      let previousX = -direction * 0.24;
      let resets = 0;
      let minX = Infinity;
      let maxX = -Infinity;
      for (let step = 0; step < Math.round(12.1 / dt); step++) {
        exp.update(dt, step * dt, {} as any);
        const x = bench.rightRodGroup.position.x;
        const displacement = (x - previousX) * direction;
        if (displacement < 0) {
          resets++;
          assert(previousX * direction > 0.23 && x * direction < -0.23,
            'Only an immediate endpoint reset may move against v');
        } else {
          assert(Math.abs(displacement - 0.12 * dt) < 1e-10, 'Every visible step moves uniformly along v');
        }
        const arrow = new THREE.Vector3(0, 1, 0).applyQuaternion(bench.rightMotionArrow.quaternion);
        assert(arrow.x * direction > 0.99, 'Velocity arrow agrees with every cutting stroke');
        minX = Math.min(minX, x); maxX = Math.max(maxX, x);
        previousX = x;
      }
      assert(resets >= 3, 'Cutting motion repeats without a reverse stroke');
      assert(maxX - minX > 0.47, 'Cutting travel doubles the old 0.24m range');
      exp.resetExperiment();
      assert.strictEqual(bench.rightCutPhase, 0);
      assert.strictEqual(bench.rightRodGroup.position.x, -0.24, 'Reset restores the initial stroke position');
      exp.dispose({} as any);
    }
  }
  console.log('✓ Test 29 passed: One-way cutting, extended travel, arrow direction and frame-rate independence verified');
}

// Test 30: Induced current appears only after a correct right-hand pose, while cutting motion continues.
{
  for (const field of signs) {
    for (const motion of signs) {
      const exp = new EmHandRulesExperiment(); exp.init({} as any); exp.setRuleMode('right-hand-rule');
      exp.setGestureEnabled(true);
      if (field < 0) exp.reverseField();
      if (motion < 0) exp.reverseMotion();
      const bench = (exp as any).bench;
      const currentObjects = [bench.rightInducedArrow, bench.rightInducedLabel,
        bench.rightCurrent.carriers, bench.rightCurrent.trails,
        bench.rightCurrent.group.getObjectByName('InlaidCurrentFlow')];
      const assertCurrent = (visible: boolean, reason: string) => {
        for (const object of currentObjects) {
          assert.strictEqual(object.visible, visible, `${reason}: ${object.name || object.type}`);
        }
      };
      assertCurrent(false, 'Current starts hidden before the first update');
      const beforeX = bench.rightRodGroup.position.x;
      exp.update(1 / 60, 0, {} as any);
      assertCurrent(false, 'No hand must not reveal current');
      assert.notStrictEqual(bench.rightRodGroup.position.x, beforeX, 'Known cutting motion continues without current being revealed');

      const points = openPalmFixture().map(p => ({
        x: 0.5 + (p.x - 0.5) * motion,
        y: 0.5 + (p.y - 0.5) * motion * field,
        z: p.z * field,
      }));
      const correct = wrapSingleHandFrame('right', points);
      exp.onHandGestureFrame(wrapSingleHandFrame('left', points)); exp.update(1 / 60, 0, {} as any);
      assertCurrent(false, 'A left hand must not reveal the induced current');
      exp.onHandGestureFrame(correct); exp.update(1 / 60, 0, {} as any);
      assert.strictEqual(exp.getTelemetryData().isMatched, true);
      assertCurrent(true, 'A correct right-hand pose reveals the arrow, label and all flowing charges together');
      assert.strictEqual(bench.rightCurrent.flowMaterial.uniforms.direction.value, field * motion);

      exp.reverseField();
      assertCurrent(false, 'Changing field hides the previous answer immediately');
      exp.update(1 / 60, 0, {} as any);
      assertCurrent(false, 'A pose inconsistent with the new field must not reveal current');
      exp.reverseField(); exp.update(1 / 60, 0, {} as any);
      assertCurrent(true, 'Correcting the field restores the matching current direction');
      exp.onHandGestureFrame(null); exp.update(1 / 60, 0, {} as any);
      assertCurrent(false, 'Losing the hand hides current on the next frame');
      exp.onHandGestureFrame(correct); exp.update(1 / 60, 0, {} as any);
      assertCurrent(true, 'Restoring the correct pose reveals current again');
      exp.setRuleMode('left-hand-rule'); exp.setRuleMode('right-hand-rule');
      assertCurrent(false, 'Switching modes never flashes a stale current before evaluation');
      exp.update(1 / 60, 0, {} as any); assertCurrent(true, 'The correct pose can reveal current after returning');
      exp.setGestureEnabled(false); exp.update(1 / 60, 0, {} as any);
      assertCurrent(false, 'Disabling tracking hides current');
      exp.setGestureEnabled(true); exp.onHandGestureFrame(correct); exp.update(1 / 60, 0, {} as any);
      assertCurrent(true, 'Tracking can resume normally');
      exp.resetExperiment(); assertCurrent(false, 'Reset clears all current visuals immediately');
      exp.dispose({} as any);
    }
  }
  console.log('✓ Test 30 passed: Gesture-gated induced current, all polarities, hand loss, mode changes, tracking disable and reset verified');
}

// Test 31: The known magnetic field stays visible during induction, independently of gesture-gated current.
{
  const exp = new EmHandRulesExperiment(); exp.init({} as any);
  const bench = (exp as any).bench;
  const field = bench.group.getObjectByName('UniformMagneticFieldIndicators') as THREE.Group;
  assert(field, 'The apparatus must contain the shared uniform magnetic field');
  assert.strictEqual(field.visible, false, 'The uniform field stays hidden in screw-rule mode');
  exp.setRuleMode('right-hand-rule');
  assert.strictEqual(field.visible, true, 'Induction displays its known field immediately');
  assert.strictEqual(bench.leftRuleGroup.visible, false, 'Displaying the field must not expose left-rule apparatus');
  assert.strictEqual(field.getObjectByName('UniformMagneticFieldLabel')?.visible, true, 'The field includes its B label');
  exp.update(0.016, 0, {} as any);
  assert.strictEqual(bench.rightInducedArrow.visible, false, 'The field does not reveal the unknown current without a matching pose');

  for (const polarity of [1, -1] as const) {
    if (polarity < 0) exp.reverseField();
    exp.update(0.016, 0, {} as any);
    const symbols = bench.uniformFieldSymbols as any[];
    assert.strictEqual(symbols.length, 12);
    for (const symbol of symbols) {
      assert.strictEqual(symbol.mat.map, polarity > 0 ? bench.texFieldIn : bench.texFieldOut,
        'B into the screen uses ⊗; B out of the screen uses ⊙');
      assert(symbol.mat.opacity > 0.6, 'Known field symbols remain legible without a tracked hand');
    }
    assert(Math.min(...symbols.map(s => s.group.position.x)) <= -0.24 &&
      Math.max(...symbols.map(s => s.group.position.x)) >= 0.24, 'The field spans the extended cutting stroke');
    const packets = bench.uniformFieldPackets as any[];
    const previousZ = packets.map(p => p.orbMesh.position.z);
    exp.update(0.01, 0, {} as any);
    let movingPackets = 0;
    packets.forEach((packet, index) => {
      const dz = packet.orbMesh.position.z - previousZ[index];
      if (Math.abs(dz) < 0.02) {
        assert(dz * polarity < 0, 'Flowing field markers follow the actual B direction after reversal');
        movingPackets++;
      }
    });
    assert(movingPackets >= 20, 'The known field visibly flows without a correct hand gesture');
    const beforeMotionFlip = symbols[0].mat.map;
    exp.reverseMotion(); exp.update(0.016, 0, {} as any);
    assert.strictEqual(symbols[0].mat.map, beforeMotionFlip, 'Reversing v must not reverse B');
    assert.strictEqual(field.visible, true);
    assert.strictEqual(bench.rightInducedArrow.visible, false);
  }
  exp.resetExperiment(); exp.update(0.016, 0, {} as any);
  assert.strictEqual(field.visible, true, 'Reset keeps the known field visible in induction mode');
  assert.strictEqual(bench.uniformFieldSymbols[0].mat.map, bench.texFieldIn, 'Reset restores inward B');
  exp.setRuleMode('left-hand-rule'); exp.update(0.016, 0, {} as any);
  assert.strictEqual(field.visible, true, 'Left-hand rule retains the same field representation');
  exp.setRuleMode('right-hand-screw');
  assert.strictEqual(field.visible, false, 'Returning to screw-rule mode hides the uniform field and its label together');
  exp.dispose({} as any);
  console.log('✓ Test 31 passed: Known field visibility, inward/outward symbols, flow direction, stroke coverage and mode isolation verified');
}

console.log('========================================================');
console.log('All Electromagnetism Hand Rules Tests Passed (31/31)!');
console.log('========================================================\n');
