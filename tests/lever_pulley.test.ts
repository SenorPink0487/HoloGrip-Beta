import assert from 'node:assert/strict';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { LeverPulleyDynamics, LEVER_MAX_ANGLE, LEVER_HEIGHT, PULLEY_MAX_LIFT, type PulleyMode } from '../src/physics/mech/leverPulleyDynamics.ts';
import Experiment from '../src/experiments/catalog/mech-lever-pulley/index.ts';
import { LEVER_X, PULLEY_X, HANDLE_REST_Y } from '../src/scene/mech/LeverPulleyBenchMesh.ts';
import { STANDARD_GRAVITY } from '../src/physics/mech/constants.ts';

// Detached canvas only: any attempted overlay insertion fails immediately.
const canvasContext = new Proxy({}, { get: (_, key) => key === 'measureText' ? () => ({ width: 0 }) : () => {} });
(globalThis as any).document = {
  pointerLockElement: null,
  createElement(tag: string) {
    assert.equal(tag, 'canvas');
    return { width: 0, height: 0, getContext: () => canvasContext };
  },
};
const near = (a: number, b: number, tolerance = 1e-8) => assert(Math.abs(a - b) < tolerance, `${a} != ${b}`);

const solver = new LeverPulleyDynamics();
for (let i = 0; i < 240; i++) solver.update(1 / 120);
near(solver.angle, 0);
solver.hangWeight(0, -0.15);
solver.hangWeight(1, null);
solver.hangWeight(2, 0.3);
near(solver.moments.net, 0); // 100 g × 15 cm == 50 g × 30 cm
solver.setPivot(0.1);
assert(solver.moments.net > 0, 'pivot change must include the beam self-weight torque');
for (let i = 0; i < 240; i++) solver.update(1 / 120);
assert(solver.angle > 0 && solver.angle <= LEVER_MAX_ANGLE);
assert(!solver.hangWeight(3, 0.3), 'cannot stack two hangers in the same hole');
assert(!solver.hangWeight(3, 0.1), 'bearing occupies the pivot hole');
assert(!solver.hangWeight(3, 0.123), 'only machined holes accept weights');
assert(!solver.hangWeight(3, NaN));
solver.setPivot(NaN); assert(Number.isFinite(solver.pivot));

for (const mode of ['fixed', 'double', 'quad'] as PulleyMode[]) {
  solver.setMode(mode);
  solver.setLoad(0.4);
  const n = mode === 'fixed' ? 1 : mode === 'double' ? 2 : 4;
  solver.pullTo(0.08 * n);
  near(solver.lift, 0.08);
  near(solver.tension * n, 0.4 * STANDARD_GRAVITY);
  near(solver.tension * solver.pullDistance, solver.outputWork);
  solver.pullTo(100); near(solver.lift, PULLEY_MAX_LIFT);
  solver.releasePull(); near(solver.tension, 0);
  solver.update(1 / 60); assert(solver.lift < PULLEY_MAX_LIFT);
  for (let i = 0; i < 120; i++) solver.update(1 / 120);
  near(solver.lift, 0); near(solver.pullDistance, 0);
  solver.pullTo(-1); near(solver.lift, 0);
}

const exp = new Experiment();
const camera = new THREE.PerspectiveCamera(45, 1.6, 0.01, 100);
camera.position.set(0.4, 1.8, 4);
const context: any = {
  camera, scene: new THREE.Scene(), renderer: { domElement: {
    getBoundingClientRect: () => ({ left: 20, top: 30, width: 1280, height: 800 }),
  } },
};
exp.init(context);
exp.rootGroup.position.set(0.1, 0.8, 0.3);
exp.rootGroup.scale.setScalar(1.32);
exp.rootGroup.rotation.y = 0.12;
exp.rootGroup.updateMatrixWorld(true);
camera.lookAt(0, 1.3, 0.3); camera.updateMatrixWorld(true);
const bench = exp.getBench();
const eventAt = (point: THREE.Vector3, pointerId = 1): PointerEvent => {
  const p = exp.rootGroup.localToWorld(point.clone()).project(camera);
  return { clientX: 20 + (p.x + 1) * 640, clientY: 30 + (1 - p.y) * 400, button: 0, pointerId, pointerType: 'mouse' } as PointerEvent;
};
const hitFor = (object: THREE.Object3D): THREE.Intersection => ({ object } as THREE.Intersection);
const weight = bench.weightGroups[0];
const start = eventAt(new THREE.Vector3(LEVER_X - 0.3, LEVER_HEIGHT - 0.023, 0.018));
assert(exp.onPointerDown(start, hitFor(weight), context));
exp.onPointerMove(eventAt(new THREE.Vector3(LEVER_X - 0.2, LEVER_HEIGHT - 0.023, 0.018), 2), null, context);
near(weight.position.x, -0.3); // foreign pointer cannot steal drag
exp.onPointerMove(eventAt(new THREE.Vector3(LEVER_X - 0.2, LEVER_HEIGHT - 0.023, 0.018)), null, context);
exp.onPointerUp(start, context); near(exp.solver.weights[0].slot!, -0.2);

// Cancel restores the previous attachment, while dropping away returns to rack.
const start2 = eventAt(new THREE.Vector3(LEVER_X - 0.2, LEVER_HEIGHT - 0.023, 0.018));
exp.onPointerDown(start2, hitFor(weight), context);
exp.onPointerMove(eventAt(new THREE.Vector3(LEVER_X - 0.2, 0.2, 0.018)), null, context);
exp.onPointerCancel(start2, context); near(exp.solver.weights[0].slot!, -0.2);
exp.onPointerDown(start2, hitFor(weight), context);
exp.onPointerMove(eventAt(new THREE.Vector3(LEVER_X - 0.2, 0.2, 0.018)), null, context);
exp.onPointerUp(start2, context); assert.equal(exp.solver.weights[0].slot, null);

// Pull displacement maps through the scaled/rotated root into SI units.
exp.resetExperiment(); exp.solver.setMode('quad'); bench.sync(exp.solver);
const pullStart = eventAt(new THREE.Vector3(PULLEY_X + 0.155, HANDLE_REST_Y, 0.08));
assert(exp.onPointerDown(pullStart, hitFor(bench.pullHandle), context));
exp.onPointerMove(eventAt(new THREE.Vector3(PULLEY_X + 0.155, HANDLE_REST_Y - 0.32, 0.08)), null, context);
near(exp.solver.lift, 0.08);
exp.onPointerCancel(pullStart, context); assert(!exp.solver.pulling); near(exp.solver.tension, 0);

// Reconstruct rope centreline from its eight-vertex rings: total length must be
// constant in each actual rendered reeving, not just in the solver equation.
const rope = bench.group.getObjectByName('continuous-inextensible-rope') as THREE.Mesh;
function ropeLength(): number {
  const points = rope.geometry.getAttribute('position');
  const count = rope.geometry.drawRange.count / 48 + 1;
  let length = 0;
  let previous: THREE.Vector3 | null = null;
  for (let i = 0; i < count; i++) {
    const point = new THREE.Vector3();
    for (let j = 0; j < 8; j++) point.add(new THREE.Vector3().fromBufferAttribute(points, i * 8 + j));
    point.multiplyScalar(1 / 8);
    if (previous) length += point.distanceTo(previous);
    previous = point;
  }
  return length;
}
for (const mode of ['fixed', 'double', 'quad'] as PulleyMode[]) {
  exp.solver.setMode(mode); bench.sync(exp.solver);
  const initialLength = ropeLength();
  for (const height of [0.025, 0.06, 0.105]) {
    exp.solver.pullTo(height * exp.solver.strands); bench.sync(exp.solver);
    near(ropeLength(), initialLength, 2e-6);
  }
}

const geometry = rope.geometry;
let disposed = 0; geometry.addEventListener('dispose', () => disposed++);
exp.dispose(context); exp.dispose(context);
assert.equal(disposed, 1, 'shared resources dispose only once');
assert.equal(exp.rootGroup.children.length, 0);
const engine = readFileSync(new URL('../src/core/Engine.ts', import.meta.url), 'utf8');
assert.match(engine, /return id === 'math-stereometry' \|\| id === 'mech-lever-pulley'/);
assert.match(engine, /showTransition\(!this\.isLiteLaboratory && id !== 'mech-lever-pulley'/);
const menu = readFileSync(new URL('../src/ui/vision/PhysicsDisciplineModal.ts', import.meta.url), 'utf8');
assert(menu.includes("id: 'mech-lever-pulley'"));
console.log('✓ Lever balance, self-weight, slots, pulley work/rope conservation, pointer ownership, cancel, transformed dragging, menu, and disposal passed.');
