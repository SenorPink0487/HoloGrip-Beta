import assert from 'node:assert';
import * as THREE from 'three';

// Lightweight Canvas & DOM mock for Node.js test environment
class MockCanvasContext {
  public fillStyle: any = '';
  public strokeStyle: any = '';
  public lineWidth: number = 1;
  public font: string = '';
  public textAlign: string = '';
  public textBaseline: string = '';
  public shadowBlur: number = 0;
  public shadowColor: string = '';

  fillRect() {}
  strokeRect() {}
  clearRect() {}
  beginPath() {}
  moveTo() {}
  lineTo() {}
  stroke() {}
  fill() {}
  arc() {}
  fillText() {}
  save() {}
  restore() {}
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
    body: {
      style: {
        cursor: 'default',
      },
    },
  };
  (global as any).window = {
    innerWidth: 1920,
    innerHeight: 1080,
  };
}

import { metadata } from '../src/experiments/catalog/thermo-compression-ignition/meta.ts';
import {
  CompressionIgnitionDynamicsSolver,
} from '../src/physics/thermo/compressionIgnitionDynamics.ts';
import { FirePistonMesh } from '../src/scene/thermo/FirePistonMesh.ts';
import ThermoCompressionIgnitionExperiment from '../src/experiments/catalog/thermo-compression-ignition/index.ts';

console.log('=== Starting Thermo Compression Ignition (Fire Piston) Tests ===\n');

// -----------------------------------------------------------------------------
// Test 1: Experiment Metadata and Specification Invariants
// -----------------------------------------------------------------------------
console.log('Test 1: Experiment Metadata Invariants');
assert.strictEqual(metadata.id, 'thermo-compression-ignition', 'ID must be thermo-compression-ignition');
assert.strictEqual(metadata.category, 'thermodynamics', 'Category must be thermodynamics');
assert(metadata.name.includes('压缩') && metadata.name.includes('点火'), 'Name must include 压缩 and 点火');
assert(metadata.equation?.includes('\\Delta U = W + Q'), 'Equation must express first law of thermodynamics');
assert(metadata.parameters.some((p) => p.id === 'pistonStroke'), 'Must have pistonStroke parameter');
assert(metadata.parameters.some((p) => p.id === 'operationMode'), 'Must have operationMode parameter');
assert(metadata.parameters.some((p) => p.id === 'cottonState'), 'Must have cottonState parameter');
assert(metadata.parameters.some((p) => p.id === 'reboundEnabled'), 'Must have reboundEnabled parameter');
assert(metadata.parameters.some((p) => p.id === 'resetExperiment'), 'Must have resetExperiment parameter');
console.log('✓ Test 1 passed: Metadata and parameter definitions verified\n');

// -----------------------------------------------------------------------------
// Test 2: Thermodynamics & Adiabatic Compression Physics
// -----------------------------------------------------------------------------
console.log('Test 2: Dynamics Solver - Adiabatic Compression & Ignition Criteria');
const solver = new CompressionIgnitionDynamicsSolver();

// 初始状态验证
assert.strictEqual(solver.stroke, 0.0, 'Initial stroke must be 0');
assert.strictEqual(solver.cottonState, 'ready', 'Initial cotton state must be ready');
let t0 = solver.getTelemetry();
assert.strictEqual(t0.volumeML, 50.0, 'Initial volume must be 50.0 mL');
assert.strictEqual(t0.pressureAtm, 1.0, 'Initial pressure must be 1.0 atm');
assert.strictEqual(Math.round(t0.temperatureC), 20, 'Initial temperature must be approx 20 ℃');

// 2a: 缓慢下压测试 (缓慢等温冲程：热量充分散失，棉花不燃烧)
console.log('  Testing slow isothermal stroke (cooling dominates, no combustion)...');
solver.triggerSlowStroke();
// 模拟步进 1.2 秒 (下压中途)
for (let i = 0; i < 60; i++) {
  solver.update(0.02);
}
let tSlow = solver.getTelemetry();
assert(tSlow.stroke > 0.4, 'Slow stroke should advance');
assert(tSlow.temperatureC < 165.0, `Temperature (${tSlow.temperatureC.toFixed(1)}℃) must not reach ignition threshold during slow stroke`);
assert.strictEqual(tSlow.cottonState, 'ready', 'Cotton must remain intact during slow stroke');

// 等待缓慢冲程完全完成
for (let i = 0; i < 150; i++) {
  solver.update(0.02);
}
assert.strictEqual(solver.cottonState, 'ready', 'Cotton must still be ready after full slow stroke');

// 2b: 快速绝热猛压冲程测试 (迅速向下拖动，外界做功内能急剧增大，突破165℃瞬间爆燃)
console.log('  Testing rapid adiabatic stroke (fast compression ignites cotton)...');
solver.reset();
solver.triggerRapidStroke();

let ignited = false;
let maxTemp = 0;
let maxFlame = 0;

for (let i = 0; i < 80; i++) {
  solver.update(0.01);
  const t = solver.getTelemetry();
  if (t.temperatureC > maxTemp) maxTemp = t.temperatureC;
  if (t.flameIntensity > maxFlame) maxFlame = t.flameIntensity;
  if (t.cottonState === 'igniting') ignited = true;
}

assert(ignited, 'Rapid downward stroke must trigger ignition of nitrocellulose');
assert(maxTemp >= 165.0, `Maximum temperature reached (${maxTemp.toFixed(1)}℃) must exceed 165℃ ignition point`);
assert(maxFlame > 0.5, 'Flame intensity must flare during deflagration');

// 继续步进直到爆燃完成
for (let i = 0; i < 50; i++) {
  solver.update(0.02);
}
assert.strictEqual(solver.cottonState, 'burnt', 'Cotton must be in burnt state after combustion completes');

// 2c: 重新装填硝化棉
console.log('  Testing cotton reload and reset...');
solver.reloadCotton();
assert.strictEqual(solver.cottonState, 'ready', 'Reloading must return cotton to ready state');

// 2d: 手动直接拖拽速度测定
console.log('  Testing manual direct dragging...');
solver.reset();
solver.updateManualDrag(0.3, 0.016);
assert.strictEqual(solver.isDragging, true, 'isDragging flag must be active');
assert(solver.stroke > 0.25, 'Stroke must follow target');
solver.endManualDrag();
assert.strictEqual(solver.isDragging, false, 'isDragging flag must be inactive');

console.log('✓ Test 2 passed: Adiabatic compression and ignition physics verified\n');

// -----------------------------------------------------------------------------
// Test 3: 3D High-Fidelity Apparatus Mesh Craftsmanship
// -----------------------------------------------------------------------------
console.log('Test 3: FirePistonMesh Structure and Visual Hierarchy');
const bench = new FirePistonMesh();

assert(bench.group instanceof THREE.Group, 'Main group must be THREE.Group');
assert(bench.staticGroup.children.length > 0, 'Static group must contain base and cylinder components');
assert(bench.pistonMovingGroup.children.length > 0, 'Moving assembly must contain rod, head, O-ring, and handle');
assert(bench.fxGroup.children.length > 0, 'FX group must contain fire light, fireball, and sparks');
assert(bench.handleHitBox instanceof THREE.Mesh, 'Must have handle hit box for mouse picking');

// 测试更新视觉状态与不同棉花阶段
bench.updateVisualState(solver.getTelemetry(), 0.016);
solver.triggerRapidStroke();
for (let i = 0; i < 15; i++) {
  solver.update(0.01);
  bench.updateVisualState(solver.getTelemetry(), 0.01);
}

bench.dispose();
console.log('✓ Test 3 passed: 3D Fire Piston Mesh components and lifecycle verified\n');

// -----------------------------------------------------------------------------
// Test 4: Experiment Lifecycle and Interaction Integration
// -----------------------------------------------------------------------------
console.log('Test 4: Experiment Lifecycle and Raycast Handlers');
const exp = new ThermoCompressionIgnitionExperiment();
const mockContext: any = {
  setParameter: () => {},
  getParameter: () => {},
  css3dScene: new THREE.Scene(),
  css3dRenderer: {},
};

exp.init(mockContext);
assert.strictEqual(exp.targetScale, 2.45, 'targetScale must be 2.45 for close-up view');
assert.strictEqual(exp.hideCenterEmitter, true, 'hideCenterEmitter must be true');

// 运行多个更新循环
exp.update(0.016, 1.0, mockContext);
exp.update(0.016, 1.016, mockContext);

// 测试参数变更
exp.onParameterChange('operationMode', 'rapid_stroke', mockContext);
exp.update(0.02, 1.036, mockContext);
exp.onParameterChange('cottonState', 'ready', mockContext);
exp.onParameterChange('reboundEnabled', 'enabled', mockContext);
exp.onParameterChange('resetExperiment', true, mockContext);

// 测试 Raycaster 悬停提示
const raycaster = new THREE.Raycaster();
raycaster.camera = new THREE.PerspectiveCamera();
const target = exp.getHoverTarget(raycaster);
// (在无相交时返回 null)
assert(target === null || typeof target.label === 'string');

// 销毁释放
exp.dispose(mockContext);
console.log('✓ Test 4 passed: Experiment lifecycle and handlers verified\n');

console.log('=== All Thermo Compression Ignition Tests Passed Successfully! ===\n');
