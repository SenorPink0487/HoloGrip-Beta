import assert from 'node:assert';
import * as THREE from 'three';
import {
  computeBarMagnetFieldBz,
  computeInductionFlux,
  computeInductionFluxGradient,
  solveInductionEMF,
  stepMeterMovement,
  stepMagnetMotion,
  INDUCTION_GOLDEN,
  evaluateInduction,
  inductionCaption,
} from '../src/physics/em/induction.ts';
import { InductionBenchMesh, COIL_AXIS_Y } from '../src/scene/em/InductionBenchMesh.ts';
import { InductionInteractionManager } from '../src/scene/em/InductionInteractionManager.ts';
import { InductionStatusCard } from '../src/ui/vision/InductionStatusCard.ts';
import EmInductionExperiment from '../src/experiments/catalog/em-induction/index.ts';

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

console.log('=== Starting Electromagnetic Induction & Lenz\'s Law Verification ===\n');

// ---------------- Test 1: 条形磁铁磁偶极场与截面磁通量计算 ----------------
console.log('Test 1: Bar magnet dipole field & flux integration precision');
{
  const bCenter = computeBarMagnetFieldBz(0, 1.4, 0.12, 0.012);
  const bNear = computeBarMagnetFieldBz(0.08, 1.4, 0.12, 0.012);
  const bFar = computeBarMagnetFieldBz(0.35, 1.4, 0.12, 0.012);

  assert.ok(Math.abs(bCenter) > 0.01, 'Center field should be strong');
  assert.ok(Math.abs(bNear) > Math.abs(bFar), 'Near field must be significantly larger than far field');

  const magnet = { dipoleMoment: 1.4, poleOrientation: 1 as const, massKg: 0.085, lengthM: 0.12 };
  const solenoid = { turns: 600, radiusM: 0.024, lengthM: 0.12, resistanceOhm: 6.0 };

  const fluxAtZero = computeInductionFlux(0, magnet, solenoid);
  const fluxAtTop = computeInductionFlux(0.20, magnet, solenoid);
  assert.ok(Math.abs(fluxAtZero) > Math.abs(fluxAtTop), 'Flux at center must be greater than flux far away');

  // 翻转极性 S 极朝下，磁通量符号严格相反
  const magnetS = { ...magnet, poleOrientation: -1 as const };
  const fluxS = computeInductionFlux(0, magnetS, solenoid);
  assert.strictEqual(fluxS, -fluxAtZero, 'Flipping pole orientation must invert magnetic flux sign');

  console.log('✓ Test 1 passed: Bar magnet field and flux calculations verified');
}

// ---------------- Test 2: 法拉第定律与楞次定律方向分析 ----------------
console.log('Test 2: Faraday\'s Law & Lenz\'s Law directional opposition');
{
  const magnet = { dipoleMoment: 1.4, poleOrientation: 1 as const, massKg: 0.085, lengthM: 0.12 };
  const solenoid = { turns: 600, radiusM: 0.024, lengthM: 0.12, resistanceOhm: 6.0 };
  const circuitClosed = { switchClosed: true, meterResistanceOhm: 24.0 };
  const circuitOpen = { switchClosed: false, meterResistanceOhm: 24.0 };

  // 1. 磁铁静止 (v_z = 0)：电动势必须恒等于 0
  const staticResult = solveInductionEMF(0.08, 0, magnet, solenoid, circuitClosed);
  assert.strictEqual(staticResult.dPhiDt, 0, 'Static magnet: dPhi/dt must be zero');
  assert.strictEqual(staticResult.emfVolts, 0, 'Static magnet: EMF must be zero');
  assert.strictEqual(staticResult.currentAmps, 0, 'Static magnet: Current must be zero');

  // 2. 向下插入 (v_z = -0.5 m/s, z = 0.10 m 接近线圈)：穿入磁通增加，楞次阻力必须向上制动 (fLenz > 0)
  const insertResult = solveInductionEMF(0.10, -0.5, magnet, solenoid, circuitClosed);
  assert.ok(Math.abs(insertResult.emfVolts) > 0.01, 'Moving magnet must generate EMF');
  assert.ok(insertResult.lenzOpposingForceN > 0, 'Lenz damping must oppose downwards insertion motion');

  // 3. 向上抽出 (v_z = +0.5 m/s, z = 0.10 m)：楞次阻力必须向下制动 (fLenz < 0)
  const extractResult = solveInductionEMF(0.10, 0.5, magnet, solenoid, circuitClosed);
  assert.ok(extractResult.lenzOpposingForceN < 0, 'Lenz damping must oppose upwards extraction motion');

  // 4. 铜闸刀开关断路：有电动势，但电流与楞次安培力必须为 0
  const openResult = solveInductionEMF(0.10, -0.5, magnet, solenoid, circuitOpen);
  assert.ok(Math.abs(openResult.emfVolts) > 0.01, 'Open circuit still produces induced EMF');
  assert.strictEqual(openResult.currentAmps, 0, 'Open circuit current must be zero');
  assert.strictEqual(openResult.lenzOpposingForceN, 0, 'Open circuit Lenz force must be zero');

  console.log('✓ Test 2 passed: Faraday & Lenz invariants verified');
}

// ---------------- Test 3: 检流计动圈二阶阻尼与限位动力学 ----------------
console.log('Test 3: Galvanometer movement 2nd-order dynamics & peg stops');
{
  let state = { angle: 0, velocity: 0, currentUa: 0 };
  const targetCurrentUa = 150; // 半偏量程 (+0.50)

  // 运行阻尼振荡积分步
  for (let i = 0; i < 40; i++) {
    state = stepMeterMovement(state, targetCurrentUa, 0.016, 300);
  }

  // 指针应收敛稳定在目标角度附近 0.5 左右
  assert.ok(Math.abs(state.angle - 0.5) < 0.08, `Needle must stabilize near target angle, got: ${state.angle}`);

  // 过载电流限位测试 (+600 µA，超过满量程 +300 µA)
  let overScale = { angle: 0, velocity: 0, currentUa: 0 };
  for (let i = 0; i < 80; i++) {
    overScale = stepMeterMovement(overScale, 600, 0.016, 300);
  }
  assert.ok(overScale.angle <= 1.15, `Mechanical peg must limit needle angle, got: ${overScale.angle}`);

  console.log('✓ Test 3 passed: Galvanometer damping dynamics verified');
}

// ---------------- Test 4: 3D 实验台 InductionBenchMesh 装配与生命周期 ----------------
console.log('Test 4: 3D InductionBenchMesh assembly & lifecycle');
{
  const bench = new InductionBenchMesh();
  assert.ok(bench.group, 'Bench group exists');
  assert.ok(bench.galvanometer, 'Galvanometer exists');
  assert.strictEqual(COIL_AXIS_Y, 0.108, 'COIL_AXIS_Y constant must be 0.108');

  // 同步状态更新
  bench.sync({
    axial: 0.15,
    poleSign: 1,
    currentAmp: 0.00015,
    magnetField: 0.04,
    inducedField: -0.001,
  });

  assert.ok(bench.getMagnetHeight() > 0.15, 'Magnet position must update');
  assert.strictEqual(bench.getMagnetPolarity(), 1, 'Magnet polarity must be 1');

  // 闸刀开关开闭
  bench.setSwitchClosed(false);
  assert.strictEqual(bench.isSwitchOpen(), true, 'Switch must be open');
  bench.setSwitchClosed(true);
  assert.strictEqual(bench.isSwitchOpen(), false, 'Switch must be closed');

  bench.dispose();
  console.log('✓ Test 4 passed: InductionBenchMesh assembly & lifecycle verified');
}

// ---------------- Test 5: 交互管理器与实验类集成 ----------------
console.log('Test 5: InductionInteractionManager & EmInductionExperiment');
{
  const exp = new EmInductionExperiment();
  exp.init(mockCtx);

  const t0 = exp.getTelemetry();
  assert.strictEqual(t0.turns, 200);
  assert.strictEqual(t0.resistanceOhm, 8);
  assert.ok(t0.caption.length > 0);

  // 参数变更
  exp.setTurns(400);
  assert.strictEqual(exp.getTelemetry().turns, 400);

  exp.flipPole();
  assert.strictEqual(exp.getTelemetry().poleSign, 1);

  // 匀速穿过穿梭过程
  exp.startPass();
  let maxEmf = 0;
  for (let i = 0; i < 60; i++) {
    exp.update(0.016, i * 0.016, mockCtx);
    maxEmf = Math.max(maxEmf, Math.abs(exp.getTelemetry().emfVolt));
  }
  assert.ok(maxEmf > 0.001, 'Pass through coil must produce noticeable EMF');

  // 复位
  exp.resetGolden();
  assert.strictEqual(exp.getTelemetry().turns, INDUCTION_GOLDEN.turns);
  assert.strictEqual(exp.getTelemetry().poleSign, INDUCTION_GOLDEN.poleSign);

  exp.dispose(mockCtx);
  console.log('✓ Test 5 passed: EmInductionExperiment lifecycle verified');
}

console.log('\n========================================================');
console.log('All Electromagnetic Induction Tests Passed Successfully (5/5)!');
console.log('========================================================\n');
