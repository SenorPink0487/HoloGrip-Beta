import assert from 'node:assert';
import * as THREE from 'three';
import {
  solveGeneratorEMF,
  stepGeneratorRotor,
  GENERATOR_GOLDEN_SPEC,
  type GeneratorState,
} from '../src/physics/em/generator.ts';
import { GeneratorBenchMesh } from '../src/scene/em/GeneratorBenchMesh.ts';
import { GeneratorInteractionManager } from '../src/scene/em/GeneratorInteractionManager.ts';
import { GeneratorStatusCard } from '../src/ui/vision/GeneratorStatusCard.ts';
import EmGeneratorExperiment from '../src/experiments/catalog/em-generator/index.ts';

class MockElement {
  public tagName: string;
  public className = '';
  public innerHTML = '';
  public textContent = '';
  public value = '';
  public style: Record<string, string> = {};
  public attributes: Record<string, string> = {};
  public eventListeners: Record<string, Array<(event?: any) => void>> = {};
  private elementCache = new Map<string, MockElement>();

  constructor(tagName: string) {
    this.tagName = tagName.toUpperCase();
  }

  getContext(_type = '2d') {
    return {
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 1,
      font: '',
      textAlign: '',
      textBaseline: '',
      shadowColor: '',
      shadowBlur: 0,
      clearRect: () => {},
      fillRect: () => {},
      strokeRect: () => {},
      fillText: () => {},
      beginPath: () => {},
      moveTo: () => {},
      lineTo: () => {},
      arc: () => {},
      arcTo: () => {},
      closePath: () => {},
      stroke: () => {},
      fill: () => {},
    };
  }

  setAttribute(name: string, value: string): void {
    this.attributes[name] = value;
  }

  getAttribute(name: string): string | null {
    return this.attributes[name] ?? null;
  }

  addEventListener(event: string, callback: (event?: any) => void): void {
    (this.eventListeners[event] ??= []).push(callback);
  }

  dispatchEvent(event: { type: string }): boolean {
    for (const callback of this.eventListeners[event.type] ?? []) callback(event);
    return true;
  }

  querySelector(selector: string): MockElement | null {
    const cached = this.elementCache.get(selector);
    if (cached) return cached;
    const el = new MockElement(selector.startsWith('#canvas') ? 'canvas' : 'div');
    this.elementCache.set(selector, el);
    return el;
  }

  querySelectorAll(selector: string): MockElement[] {
    return [this.querySelector(selector) ?? new MockElement('div')];
  }

  classList = {
    add: () => {},
    remove: () => {},
    toggle: () => false,
    contains: () => false,
  };
}

(global as any).document = {
  createElement: (tag: string) => new MockElement(tag),
  activeElement: null,
};
(global as any).window = { innerWidth: 1024, innerHeight: 768 };
(global as any).requestAnimationFrame = (fn: () => void) => {
  fn();
  return 1;
};

const mockCtx = {
  scene: new THREE.Scene(),
  camera: new THREE.PerspectiveCamera(50, 1, 0.1, 50),
} as any;

console.log('=== Starting Rotary Generator & Motional EMF Verification ===\n');

// ---------------- Test 1: 动生电动势计算与 AC/DC 输出波形 ----------------
console.log('Test 1: Motional EMF analytical precision & AC vs DC commutator rectification');
{
  const omega = 10 * Math.PI; // 300 RPM (~31.4 rad/s)
  const spec = { ...GENERATOR_GOLDEN_SPEC };

  // 1. 中性面 (θ = 0)：线圈平面垂直于磁场，磁通最大，但动生电动势为零
  const stateNeutral: GeneratorState = {
    angleRad: 0,
    omegaRadS: omega,
    outputType: 'ac',
    circuitClosed: true,
    bulbConnected: true,
  };
  const resNeutral = solveGeneratorEMF(stateNeutral, spec);
  assert.strictEqual(resNeutral.emfVolt, 0, 'At neutral plane (θ=0), EMF must be zero');
  assert.ok(Math.abs(resNeutral.fluxWb) > 0.001, 'At neutral plane (θ=0), magnetic flux is maximal');

  // 2. 切割磁感线最大位置 (θ = π/2)：磁通过零，动生电动势达到峰值
  const statePeak: GeneratorState = { ...stateNeutral, angleRad: Math.PI * 0.5 };
  const resPeak = solveGeneratorEMF(statePeak, spec);
  assert.ok(resPeak.emfVolt > 0.5, 'At θ=π/2, EMF reaches positive peak');
  assert.strictEqual(resPeak.emfVolt, resPeak.emfPeakVolt, 'At θ=π/2, EMF equals peak EMF');

  // 3. AC 模式 vs DC 换向器模式在 θ = 3π/2 处的对称性与整流
  const stateOppositeAC: GeneratorState = { ...stateNeutral, angleRad: Math.PI * 1.5, outputType: 'ac' };
  const resOppositeAC = solveGeneratorEMF(stateOppositeAC, spec);
  assert.ok(resOppositeAC.emfVolt < -0.5, 'AC mode at θ=3π/2 must produce negative EMF');

  const stateOppositeDC: GeneratorState = { ...stateNeutral, angleRad: Math.PI * 1.5, outputType: 'dc' };
  const resOppositeDC = solveGeneratorEMF(stateOppositeDC, spec);
  assert.ok(resOppositeDC.emfVolt > 0.5, 'DC commutator mode at θ=3π/2 must rectify to positive EMF');
  assert.strictEqual(resOppositeDC.emfVolt, Math.abs(resOppositeAC.emfVolt), 'DC EMF must equal absolute value of AC EMF');

  console.log('✓ Test 1 passed: Motional EMF & AC/DC commutation verified');
}

// ---------------- Test 2: 转子旋转动力学、惯性与电磁反力矩 ----------------
console.log('Test 2: Rotor inertia dynamics & Lenz opposing back-torque');
{
  const spec = { ...GENERATOR_GOLDEN_SPEC };
  let stateOpen: GeneratorState = {
    angleRad: 0,
    omegaRadS: 20.0,
    outputType: 'ac',
    circuitClosed: false, // 开路：无感应电流反力矩
    bulbConnected: false,
  };

  let stateClosed: GeneratorState = {
    angleRad: 0,
    omegaRadS: 20.0,
    outputType: 'ac',
    circuitClosed: true,  // 闭路：带载有安培反力矩
    bulbConnected: true,
  };

  // 推进 60 步模拟
  for (let i = 0; i < 60; i++) {
    stateOpen = stepGeneratorRotor(stateOpen, 0, spec, 0.016);
    stateClosed = stepGeneratorRotor(stateClosed, 0, spec, 0.016);
  }

  // 闭路带载时的转速衰减必须明显快于开路自由旋转 (楞次反力矩制动)
  assert.ok(stateClosed.omegaRadS < stateOpen.omegaRadS, 'Closed circuit rotor must slow down faster due to Lenz back-torque');

  console.log('✓ Test 2 passed: Rotor dynamics & back-torque verified');
}

// ---------------- Test 3: 负载小灯泡功率与发光响应 ----------------
console.log('Test 3: Bulb load power & incandescent brightness mapping');
{
  const spec = { ...GENERATOR_GOLDEN_SPEC };

  // 静止状态 (ω = 0)
  const readingStop = solveGeneratorEMF({
    angleRad: Math.PI * 0.5,
    omegaRadS: 0,
    outputType: 'ac',
    circuitClosed: true,
    bulbConnected: true,
  }, spec);
  assert.strictEqual(readingStop.bulbPowerWatt, 0, 'Stopped generator: bulb power must be 0');
  assert.strictEqual(readingStop.bulbBrightness, 0, 'Stopped generator: bulb brightness must be 0');

  // 高速手摇 (ω = 25 rad/s)
  const readingFast = solveGeneratorEMF({
    angleRad: Math.PI * 0.5,
    omegaRadS: 25.0,
    outputType: 'ac',
    circuitClosed: true,
    bulbConnected: true,
  }, spec);
  assert.ok(readingFast.bulbPowerWatt > 0.05, 'Fast rotation: bulb power must be significant');
  assert.ok(readingFast.bulbBrightness > 0.3, 'Fast rotation: bulb brightness must be prominent');

  console.log('✓ Test 3 passed: Bulb load power & illumination verified');
}

// ---------------- Test 4: 3D 实验台 GeneratorBenchMesh 装配与光滑弯管 ----------------
console.log('Test 4: 3D GeneratorBenchMesh assembly & smooth tube crank invariants');
{
  const bench = new GeneratorBenchMesh();
  assert.ok(bench.group, 'Generator bench group exists');
  assert.ok(bench.galvanometer, 'Galvanometer G exists');
  assert.ok(bench.bulbLight, 'Bulb light point source exists');
  assert.ok(bench.crankGripMesh, 'Crank grip mesh exists');

  // 验证模式切换与电刷对齐
  bench.setOutputType('dc');
  assert.strictEqual(bench.getOutputType(), 'dc');
  assert.strictEqual(bench.slipRingsGroup.visible, false);
  assert.strictEqual(bench.commutatorGroup.visible, true);

  bench.setOutputType('ac');
  assert.strictEqual(bench.getOutputType(), 'ac');
  assert.strictEqual(bench.slipRingsGroup.visible, true);
  assert.strictEqual(bench.commutatorGroup.visible, false);

  // 状态同步
  bench.sync({
    angleRad: 1.25,
    outputType: 'ac',
    currentAmp: 0.002,
    emfVolt: 1.2,
    bulbBrightness: 0.8,
  });

  assert.strictEqual(bench.rotorShaftGroup.rotation.z, 1.25);
  assert.ok(bench.bulbLight.intensity > 1.0, 'Bulb light must illuminate when brightness is high');

  bench.dispose();
  console.log('✓ Test 4 passed: GeneratorBenchMesh assembly & tube invariants verified');
}

// ---------------- Test 5: 交互管理与实验生命周期 ----------------
console.log('Test 5: GeneratorInteractionManager & EmGeneratorExperiment lifecycle');
{
  const exp = new EmGeneratorExperiment();
  exp.init(mockCtx);

  const t0 = exp.getTelemetry();
  assert.strictEqual(t0.rpm, 0, 'Initial state: rotor is stationary');
  assert.strictEqual(t0.outputType, 'ac', 'Default output: AC slip rings');

  // 手摇加速
  exp.boostSpeed();
  const tBoost = exp.getTelemetry();
  assert.ok(tBoost.rpm > 100, `Boost must increase RPM, got: ${tBoost.rpm}`);

  // 运行数帧仿真
  for (let i = 0; i < 30; i++) {
    exp.update(0.016, i * 0.016, mockCtx);
  }
  const tAfter = exp.getTelemetry();
  assert.ok(tAfter.emfHistory.length > 5, 'EMF history samples must accumulate for scope');

  // 切换为 DC 换向器模式
  exp.setOutputType('dc');
  assert.strictEqual(exp.getTelemetry().outputType, 'dc');

  // 复位
  exp.reset();
  assert.strictEqual(exp.getTelemetry().rpm, 0);
  assert.strictEqual(exp.getTelemetry().outputType, 'ac');

  exp.dispose(mockCtx);
  console.log('✓ Test 5 passed: EmGeneratorExperiment lifecycle verified');
}

console.log('\n========================================================');
console.log('All Rotary Generator Tests Passed Successfully (5/5)!');
console.log('========================================================\n');
