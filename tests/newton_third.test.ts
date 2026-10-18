import assert from 'node:assert';
import * as THREE from 'three';

// Lightweight DOM mock for Node.js test environment
class MockCanvasContext {
  public fillStyle: any = '';
  public strokeStyle: any = '';
  public lineWidth: number = 1;
  public font: string = '';
  public textAlign: string = '';
  public textBaseline: string = '';
  private dash: number[] = [];

  fillRect() {}
  strokeRect() {}
  clearRect() {}
  beginPath() {}
  moveTo() {}
  lineTo() {}
  stroke() {}
  fill() {}
  arc() {}
  roundRect() {}
  fillText() {}
  setLineDash(d: number[]) { this.dash = d; }
  getLineDash() { return this.dash; }
  createLinearGradient() {
    return {
      addColorStop() {},
    };
  }
}

class MockElement {
  public tagName: string;
  public width: number = 512;
  public height: number = 2048;

  constructor(tagName: string) {
    this.tagName = tagName.toUpperCase();
  }

  getContext(type: string) {
    if (type === '2d') {
      return new MockCanvasContext();
    }
    return null;
  }
}

if (typeof document === 'undefined') {
  (global as any).document = {
    createElement(tag: string) {
      return new MockElement(tag);
    },
  };
  (global as any).window = {
    innerWidth: 1920,
    innerHeight: 1080,
  };
}

import { metadata } from '../src/experiments/catalog/mech-newton-third/meta.ts';
import {
  NewtonThirdDynamicsSolver,
} from '../src/physics/mech/newtonThirdDynamics.ts';
import { SpringDynamometerMesh } from '../src/scene/mech/SpringDynamometerMesh.ts';
import { NewtonThirdBenchMesh } from '../src/scene/mech/NewtonThirdBenchMesh.ts';
import MechNewtonThirdExperiment from '../src/experiments/catalog/mech-newton-third/index.ts';

console.log('=== Starting Newton Third Law (Action & Reaction) Tests ===\n');

// -----------------------------------------------------------------------------
// Test 1: Experiment Metadata and Specification Invariants
// -----------------------------------------------------------------------------
console.log('Test 1: Experiment Metadata Invariants');
assert.strictEqual(metadata.id, 'mech-newton-third', 'ID must be mech-newton-third');
assert.strictEqual(metadata.category, 'mechanics', 'Category must be mechanics');
assert(metadata.name.includes('牛顿第三定律'), 'Name must include 牛顿第三定律');
assert(metadata.equation?.includes('\\vec{F}'), 'Equation must express vector Newton third law');
assert(metadata.parameters.some((p) => p.id === 'pairPullForce'), 'Must have pairPullForce parameter');
assert(metadata.parameters.some((p) => p.id === 'mode'), 'Must have mode parameter');
assert(metadata.parameters.some((p) => p.id === 'soloForce'), 'Must have soloForce parameter');
assert(metadata.parameters.some((p) => p.id === 'hangWeight'), 'Must have hangWeight parameter');
assert(metadata.parameters.some((p) => p.id === 'resetExperiment'), 'Must have resetExperiment parameter');
console.log('✓ Test 1 passed: Metadata and parameter definitions verified\n');

// -----------------------------------------------------------------------------
// Test 2: Newton's Third Law Physics Invariants (F_A ≡ F_B)
// -----------------------------------------------------------------------------
console.log('Test 2: Dynamics Solver - Action and Reaction Invariant Guarantee');
const solver = new NewtonThirdDynamicsSolver();

// 静态拉力测试
for (const testForce of [0.5, 1.25, 2.5, 3.8, 5.0]) {
  solver.setPairTargetForce(testForce, true);
  solver.update(0.016, 1.0);

  assert.strictEqual(
    solver.pairState.forceA_N,
    solver.pairState.forceB_N,
    `Dynamometer A (${solver.pairState.forceA_N}N) must be strictly equal to Dynamometer B (${solver.pairState.forceB_N}N)`
  );
  assert(
    solver.pairState.deltaForceN < 1e-6,
    `Difference |F_A - F_B| must be 0 (got ${solver.pairState.deltaForceN})`
  );
  assert(
    Math.abs(solver.pairState.forceN - testForce) < 0.05,
    `Force should reach target force ${testForce}`
  );
}
console.log('✓ Test 2 passed: Static action and reaction forces strictly equal in magnitude\n');

// -----------------------------------------------------------------------------
// Test 3: Dynamic Simultaneous Variation Invariant (同生同灭、同增同减)
// -----------------------------------------------------------------------------
console.log('Test 3: Dynamic Simultaneous Variation Invariant (同生同灭、同增同减)');
solver.setMode('oscillation');

// 模拟连续 100 帧物理振荡
for (let frame = 0; frame < 100; frame++) {
  solver.update(0.016, frame * 0.016);
  assert.strictEqual(
    solver.pairState.forceA_N,
    solver.pairState.forceB_N,
    `At frame ${frame}: F_A (${solver.pairState.forceA_N}) !== F_B (${solver.pairState.forceB_N})`
  );
  assert(
    solver.pairState.forceA_N >= 0 && solver.pairState.forceA_N <= 5.0,
    `Force should stay within scale range [0, 5.0]`
  );
}
assert(solver.history.length > 10, 'Oscilloscope history buffer should record data points');
console.log('✓ Test 3 passed: Dynamic oscillation keeps F_A ≡ F_B simultaneously at every frame\n');

// -----------------------------------------------------------------------------
// Test 4: Standalone Spring Dynamometer Physics & Hooke\'s Law
// -----------------------------------------------------------------------------
console.log('Test 4: Standalone Dynamometer Hooke\'s Law & Weights');
solver.reset();
assert.strictEqual(solver.soloState.forceN, 0, 'Solo force starts at 0');

solver.setSoloTargetForce(3.0, true);
solver.update(0.016, 0.5);
assert(Math.abs(solver.soloState.forceN - 3.0) < 0.05, 'Solo force updates to 3.0N');
const expectedDisp = 3.0 / solver.springStiffnessK;
assert(
  Math.abs(solver.soloState.displacementM - expectedDisp) < 0.005,
  'Displacement must follow Hooke\'s Law Delta x = F / k'
);

// 挂钩码验证
solver.hangWeightOnSolo(0.102); // 102g * 9.80 = ~1.0N
for (let i = 0; i < 20; i++) solver.update(0.016, 1.0 + i * 0.016);
assert(Math.abs(solver.soloState.forceN - 1.0) < 0.1, '102g weight produces ~1.0N gravity force');
console.log('✓ Test 4 passed: Standalone dynamometer Hooke\'s law and weight hanging verified\n');

// -----------------------------------------------------------------------------
// Test 5: 3D Bench Structure and Three Spring Dynamometers Assembly
// -----------------------------------------------------------------------------
console.log('Test 5: 3D Bench Structure and Three Dynamometers Assembly');
const bench = new NewtonThirdBenchMesh();

assert(bench.soloDynamometer instanceof SpringDynamometerMesh, 'Must have solo dynamometer');
assert(bench.dynamometerA instanceof SpringDynamometerMesh, 'Must have dynamometer A');
assert(bench.dynamometerB instanceof SpringDynamometerMesh, 'Must have dynamometer B');
assert(bench.benchButtons.length === 5, 'Must have 5 bench pushbuttons');
assert(bench.weightMeshes.length === 2, 'Must have 2 laboratory slotted weights');

// 验证两只对扣测力计的初始朝向与布局
assert.strictEqual(bench.dynamometerA.group.rotation.z, -Math.PI / 2, 'Dynamometer A faces right');
assert.strictEqual(bench.dynamometerB.group.rotation.z, Math.PI / 2, 'Dynamometer B faces left');

// 视觉更新验证
bench.updateVisualState(1.5, 2.5, solver.history);
assert(bench.dynamometerA.getForce() === 2.5, 'Dynamometer A reading is 2.5N');
assert(bench.dynamometerB.getForce() === 2.5, 'Dynamometer B reading is 2.5N');
assert(bench.soloDynamometer.getForce() === 1.5, 'Solo dynamometer reading is 1.5N');

bench.dispose();
console.log('✓ Test 5 passed: 3D bench structure, 3 dynamometers and visual update verified\n');

// -----------------------------------------------------------------------------
// Test 6: Experiment Lifecycle & Zero DOM Floating Invariant
// -----------------------------------------------------------------------------
console.log('Test 6: Experiment Lifecycle & Invariants');
const exp = new MechNewtonThirdExperiment();
const mockContext: any = {
  camera: new THREE.PerspectiveCamera(),
  scene: new THREE.Scene(),
};
exp.init(mockContext);

assert(exp.rootGroup.children.length > 0, 'Experiment rootGroup must contain 3D bench');
assert.strictEqual(exp.hideCenterEmitter, true, 'Center emitter hidden for clean desk display');
assert(exp.targetScale > 2.0, 'Close-up target scale for crisp readability');

// 测试光标悬停检测
const raycaster = new THREE.Raycaster();
const hoverResult = exp.getHoverTarget(raycaster);
// 初始未悬停应返回 null 或具体对象
assert(hoverResult === null || typeof hoverResult.id === 'string', 'Hover target API contracts valid');

exp.dispose(mockContext);
console.log('✓ Test 6 passed: Experiment lifecycle, scale, and clean desk invariants verified\n');

console.log('========================================================');
console.log('All Newton Third Law Tests Passed Successfully (6/6)!');
console.log('========================================================\n');
