/**
 * 牛顿大炮与第一宇宙速度实验 (Newton's Cannonball & Orbital Mechanics)
 * 物理动力学精度、3D 场景装配、射线交互与性能基准全量自动化测试
 */

import assert from 'node:assert';
import * as THREE from 'three';

// 针对 Node.js 离线测试环境的轻量级 DOM 与 Canvas Mock
class MockElement {
  public tagName: string;
  public className = '';
  public innerHTML = '';
  public style: Record<string, string> = {};
  public attributes: Record<string, string> = {};
  public eventListeners: Record<string, ((e?: any) => void)[]> = {};
  public children: MockElement[] = [];
  public parentElement: MockElement | null = null;
  public width = 1024;
  public height = 512;

  constructor(tagName: string) {
    this.tagName = tagName.toUpperCase();
  }

  setAttribute(name: string, value: string): void {
    this.attributes[name] = value;
  }

  getAttribute(name: string): string | null {
    return this.attributes[name] ?? null;
  }

  removeAttribute(name: string): void {
    delete this.attributes[name];
  }

  appendChild(child: MockElement): void {
    child.parentElement = this;
    this.children.push(child);
  }

  removeChild(child: MockElement): void {
    const idx = this.children.indexOf(child);
    if (idx !== -1) {
      this.children.splice(idx, 1);
      child.parentElement = null;
    }
  }

  addEventListener(event: string, handler: (e?: any) => void): void {
    if (!this.eventListeners[event]) {
      this.eventListeners[event] = [];
    }
    this.eventListeners[event].push(handler);
  }

  removeEventListener(event: string, handler: (e?: any) => void): void {
    if (this.eventListeners[event]) {
      this.eventListeners[event] = this.eventListeners[event].filter((h) => h !== handler);
    }
  }

  getContext(type: string): any {
    if (type === '2d') {
      return {
        fillStyle: '',
        strokeStyle: '',
        lineWidth: 1,
        font: '',
        fillRect: () => {},
        clearRect: () => {},
        beginPath: () => {},
        moveTo: () => {},
        lineTo: () => {},
        arc: () => {},
        fill: () => {},
        stroke: () => {},
        closePath: () => {},
        fillText: () => {},
        strokeRect: () => {},
        createLinearGradient: () => ({
          addColorStop: () => {},
        }),
        createRadialGradient: () => ({
          addColorStop: () => {},
        }),
        drawImage: () => {},
      };
    }
    return null;
  }

  querySelector(selector: string): MockElement | null {
    if (selector.startsWith('#')) {
      const id = selector.slice(1);
      if (this.attributes['id'] === id) return this;
      for (const child of this.children) {
        const found = child.querySelector(selector);
        if (found) return found;
      }
    }
    return new MockElement('div');
  }

  querySelectorAll(_selector: string): MockElement[] {
    return [];
  }
}

if (typeof globalThis.document === 'undefined') {
  const body = new MockElement('body');
  const head = new MockElement('head');
  (globalThis as any).document = {
    body,
    head,
    createElement: (tag: string) => new MockElement(tag),
    getElementById: (_id: string) => null,
  };
}

if (typeof globalThis.window === 'undefined') {
  (globalThis as any).window = {
    innerWidth: 1920,
    innerHeight: 1080,
    addEventListener: () => {},
    removeEventListener: () => {},
    setTimeout: (fn: Function) => {
      fn();
      return 1;
    },
    clearTimeout: () => {},
  };
}

import {
  NewtonCannonDynamicsSolver,
  EARTH_RADIUS_M,
  EARTH_MASS_KG,
  STANDARD_GRAVITATIONAL_PARAMETER,
  CANNON_ALTITUDE_M,
  LAUNCH_RADIUS_M,
} from '../src/physics/mech/newtonCannonDynamics.ts';
import { RealisticEarthMesh } from '../src/scene/mech/RealisticEarthMesh.ts';
import { NewtonCannonBenchMesh } from '../src/scene/mech/NewtonCannonBenchMesh.ts';
import MechNewtonCannonExperiment from '../src/experiments/catalog/mech-newton-cannon/index.ts';
import { metadata } from '../src/experiments/catalog/mech-newton-cannon/meta.ts';

console.log('=== Starting Newton Cannon & Orbital Mechanics Analytical & Integration Tests ===\n');

// -----------------------------------------------------------------------------
// Test 1: 第一与第二宇宙速度理论判据与开普勒轨道理论解算
// -----------------------------------------------------------------------------
console.log('Test 1: Theoretical Cosmic Velocities & Keplerian Orbits');
{
  const solver = new NewtonCannonDynamicsSolver();

  // 1. 验证发射高度处的理论第一宇宙速度 v1 = sqrt(mu / r0)
  const theoreticalV1 = Math.sqrt(STANDARD_GRAVITATIONAL_PARAMETER / LAUNCH_RADIUS_M) / 1000.0;
  assert(
    Math.abs(solver.v1KmS - theoreticalV1) < 1e-4,
    `v1 calculation mismatch: got ${solver.v1KmS}, expected ${theoreticalV1}`
  );
  assert(
    solver.v1KmS > 6.8 && solver.v1KmS < 7.9,
    `v1 out of orbital range: ${solver.v1KmS} km/s`
  );

  // 2. 验证第二宇宙速度 v2 = sqrt(2) * v1
  const theoreticalV2 = Math.sqrt(2.0) * theoreticalV1;
  assert(
    Math.abs(solver.v2KmS - theoreticalV2) < 1e-4,
    `v2 calculation mismatch: got ${solver.v2KmS}, expected ${theoreticalV2}`
  );

  // 3. 验证开普勒轨道理论解析：
  // (a) 低速落体 (v = 4.0 km/s < v1)
  const suborb = solver.calculateKeplerOrbit(4.0);
  assert.strictEqual(suborb.orbitType, 'suborbital');
  assert(
    suborb.perigee < EARTH_RADIUS_M,
    `Suborbital perigee must be below surface: ${suborb.perigee} < ${EARTH_RADIUS_M}`
  );

  // (b) 第一宇宙速度圆轨道 (v = solver.v1KmS)
  const circ = solver.calculateKeplerOrbit(solver.v1KmS);
  assert(circ.eccentricity < 0.01, `Circular orbit eccentricity should be ~0: ${circ.eccentricity}`);
  assert(circ.perigee >= EARTH_RADIUS_M, `Circular orbit perigee must be above surface`);
  assert(
    circ.orbitType === 'circular' || circ.orbitType === 'elliptical',
    `Should be circular/elliptical`
  );

  // (c) 椭圆卫星轨道 (v = 8.8 km/s, v1 < v < v2)
  const ellip = solver.calculateKeplerOrbit(8.8);
  assert.strictEqual(ellip.orbitType, 'elliptical');
  assert(ellip.perigee >= EARTH_RADIUS_M, `Elliptical satellite must not hit ground`);
  assert(ellip.apogee > LAUNCH_RADIUS_M, `Apogee must extend into space`);
  assert(ellip.eccentricity > 0 && ellip.eccentricity < 1.0, `Eccentricity 0 < e < 1`);

  // (d) 超脱逃逸轨道 (v = 11.5 km/s > v2)
  const esc = solver.calculateKeplerOrbit(11.5);
  assert.strictEqual(esc.orbitType, 'hyperbolic');
  assert(esc.eccentricity >= 1.0, `Hyperbolic orbit e >= 1: ${esc.eccentricity}`);
  assert(esc.specificEnergy > 0, `Specific mechanical energy must be positive for escape`);

  console.log(
    `  Theoretical v1: ${solver.v1KmS.toFixed(2)} km/s, v2: ${solver.v2KmS.toFixed(2)} km/s`
  );
  console.log('✓ Test 1 passed: Theoretical Cosmic Velocities & Kepler Orbits rigorous');
}

// -----------------------------------------------------------------------------
// Test 2: 低速抛射物理数值演化：物体必然落回地面 (Suborbital Landed Invariant)
// -----------------------------------------------------------------------------
console.log('\nTest 2: Low-velocity Cannonball Fall onto Earth Surface');
{
  const solver = new NewtonCannonDynamicsSolver({ timeScale: 1.0 });

  // 发射单颗初速 4.2 km/s 的炮弹
  const [p] = solver.launch({
    particleCount: 1,
    minVelocityKmS: 4.2,
    maxVelocityKmS: 4.2,
  });

  assert.strictEqual(p.state, 'flying');

  // 步进仿真直到落地 (理论飞行时间几百秒)
  let steps = 0;
  while (p.state === 'flying' && steps < 2000) {
    solver.update(1.0); // 每步 1.0 秒
    steps++;
  }

  assert.strictEqual(
    p.state,
    'landed',
    `Low-speed particle must land on Earth surface, currently: ${p.state}`
  );
  assert(p.landingPosition !== undefined, 'Landing position must be recorded');
  const landingDist = p.position.length();
  assert(
    Math.abs(landingDist - EARTH_RADIUS_M) < 1.0,
    `Landed position must be on Earth surface: ${landingDist} vs ${EARTH_RADIUS_M}`
  );
  assert(
    p.trail.length > 5,
    `Trajectory history should record descent path: ${p.trail.length} points`
  );

  console.log(`  Low-speed cannonball landed on ground after ${p.flightTime.toFixed(1)}s`);
  console.log('✓ Test 2 passed: Low-velocity cannonball lands safely on Earth surface');
}

// -----------------------------------------------------------------------------
// Test 3: 第一宇宙速度高精数值演化：物体永不落回地面，成为人造地球卫星！
// -----------------------------------------------------------------------------
console.log('\nTest 3: First Cosmic Velocity - Becomes Artificial Earth Satellite');
{
  const solver = new NewtonCannonDynamicsSolver({ timeScale: 60.0 });

  // 发射一颗以第一宇宙速度飞行的炮弹
  const [satellite] = solver.launch({
    particleCount: 1,
    minVelocityKmS: solver.v1KmS + 0.05,
    maxVelocityKmS: solver.v1KmS + 0.05,
  });

  // 模拟演化 6000 仿真秒 (相当于 1.6 个多小时，完成超过一整圈公转)
  const dt = 0.5; // 每帧 0.5 秒 (乘以 60x 演化)
  const totalFrames = 200;
  for (let f = 0; f < totalFrames; f++) {
    solver.update(dt);
  }

  // 核心断言：达到第一宇宙速度后，绝对不能落回地面！
  assert.notStrictEqual(
    satellite.state,
    'landed',
    'Particle with First Cosmic Velocity MUST NOT land on Earth surface!'
  );
  assert(
    satellite.state === 'flying' || satellite.state === 'orbiting',
    `Particle state must be flying/orbiting: ${satellite.state}`
  );
  assert(
    satellite.position.length() >= EARTH_RADIUS_M,
    `Altitude must remain above surface: ${satellite.position.length()} >= ${EARTH_RADIUS_M}`
  );
  assert(
    satellite.totalAngularTravel >= Math.PI,
    `Satellite must have orbited extensively around Earth: ${satellite.totalAngularTravel.toFixed(2)} rad`
  );

  console.log(
    `  Satellite orbital angular travel: ${satellite.totalAngularTravel.toFixed(2)} rad, completed orbits: ${satellite.completedOrbits}`
  );
  console.log('✓ Test 3 passed: Particle successfully orbits Earth as an artificial satellite');
}

// -----------------------------------------------------------------------------
// Test 4: 第二宇宙速度逃逸深空演化测试 (v >= 11.2 km/s)
// -----------------------------------------------------------------------------
console.log('\nTest 4: Second Cosmic Velocity - Deep Space Escape');
{
  const solver = new NewtonCannonDynamicsSolver({ timeScale: 200.0 });

  const [escaper] = solver.launch({
    particleCount: 1,
    minVelocityKmS: 11.5,
    maxVelocityKmS: 11.5,
  });

  // 演化数千秒
  for (let f = 0; f < 300; f++) {
    solver.update(0.5);
  }

  assert(
    escaper.position.length() > LAUNCH_RADIUS_M * 2.0,
    `Escaping particle must fly far into deep space: ${escaper.position.length()} m`
  );
  assert(
    escaper.state === 'flying' || escaper.state === 'escaped',
    `State must remain uncaptured: ${escaper.state}`
  );
  console.log('✓ Test 4 passed: High-speed particle overcomes Earth gravity and escapes');
}

// -----------------------------------------------------------------------------
// Test 5: 粒子群并发发射与速度渐变谱分配
// -----------------------------------------------------------------------------
console.log('\nTest 5: Multi-particle Launch & Spectrum Distribution');
{
  const solver = new NewtonCannonDynamicsSolver();

  const particles = solver.launch({
    particleCount: 10,
    minVelocityKmS: 3.5,
    maxVelocityKmS: 11.2,
  });

  assert.strictEqual(particles.length, 10, 'Must launch exactly 10 particles');
  assert.strictEqual(solver.particles.length, 10, 'Solver must track 10 particles');

  // 验证初速度单调递增并完全覆盖范围
  assert(
    Math.abs(particles[0].v0KmS - 3.5) < 1e-3,
    `First particle v0 should be 3.5: ${particles[0].v0KmS}`
  );
  assert(
    Math.abs(particles[9].v0KmS - 11.2) < 1e-3,
    `Last particle v0 should be 11.2: ${particles[9].v0KmS}`
  );

  for (let i = 1; i < particles.length; i++) {
    assert(
      particles[i].v0KmS > particles[i - 1].v0KmS,
      `Particles must have strictly ascending velocities: ${particles[i].v0KmS} > ${particles[i - 1].v0KmS}`
    );
  }

  // 遥测统计验证
  const telemetry = solver.getTelemetry();
  assert.strictEqual(telemetry.totalParticles, 10);
  assert.strictEqual(telemetry.flyingCount, 10);

  // 清空测试
  solver.clear();
  assert.strictEqual(solver.particles.length, 0);

  console.log('✓ Test 5 passed: Multi-particle launch & spectrum distribution verified');
}

// -----------------------------------------------------------------------------
// Test 6: 逼真地球 3D 模型装配与释放 (RealisticEarthMesh Invariant)
// -----------------------------------------------------------------------------
console.log('\nTest 6: RealisticEarthMesh Assembly & Disposal Invariant');
{
  const earthMesh = new RealisticEarthMesh();

  assert(earthMesh.earthSphere !== undefined, 'Earth core sphere must be instantiated');
  assert(earthMesh.cloudSphere !== undefined, 'Cloud layer sphere must be instantiated');
  assert(earthMesh.atmosphereGlow !== undefined, 'Atmosphere glow must be instantiated');
  assert(earthMesh.cannonStationGroup !== undefined, 'Mountain cannon station must exist');
  assert(earthMesh.cannonBarrelMesh !== undefined, 'Cannon barrel mesh must exist');
  assert(earthMesh.orbitalRingMesh !== undefined, 'Orbital reference ring must exist');

  // 动画步进
  earthMesh.update(0.016);
  earthMesh.triggerMuzzleFlash();
  earthMesh.update(0.016);

  // 安全销毁
  earthMesh.dispose();
  assert.strictEqual(earthMesh.group.children.length, 0, 'Children must be cleanly cleared');

  console.log('✓ Test 6 passed: RealisticEarthMesh creates all layers and disposes cleanly');
}

// -----------------------------------------------------------------------------
// Test 7: 3D 控制台按键与精简精密导轨装配 (NewtonCannonBenchMesh Invariant)
// -----------------------------------------------------------------------------
console.log('\nTest 7: NewtonCannonBenchMesh 3D Command Console & Visuals');
{
  const bench = new NewtonCannonBenchMesh(0.52, EARTH_RADIUS_M);

  assert(bench.launchButtonMesh !== undefined, 'Launch trigger button must exist');
  assert(bench.sliderVMin !== undefined, 'Vmin precision slider must exist');
  assert(bench.sliderVMax !== undefined, 'Vmax precision slider must exist');
  assert(bench.sliderParticleCount !== undefined, 'Particle count precision slider must exist');
  assert(bench.trackVMin !== undefined, 'Vmin track hit mesh must exist');
  assert(bench.trackVMax !== undefined, 'Vmax track hit mesh must exist');
  assert(bench.trackParticleCount !== undefined, 'Particle count track hit mesh must exist');
  assert(bench.vernierSliderMin !== undefined, 'Vmin vernier slider alias must exist');
  assert(bench.vernierSliderMax !== undefined, 'Vmax vernier slider alias must exist');

  // 联动测试
  bench.setSliderPositions(4.5, 12.0);
  bench.setParticleDialAngle(16);

  // 机械按下与更新
  bench.triggerLaunchButtonPress();
  bench.setLaunchButtonHovered(true);
  bench.update(0.016);

  // 控制台参数更新
  bench.updateValues({ particleCount: 8, minVelocityKmS: 3.5, maxVelocityKmS: 11.2 });

  // 安全销毁
  bench.dispose();
  assert.strictEqual(bench.group.children.length, 0, 'Console elements disposed cleanly');

  console.log('✓ Test 7 passed: NewtonCannonBenchMesh 3D console & telemetry verified');
}

// -----------------------------------------------------------------------------
// Test 8: 实验主控类 MechNewtonCannonExperiment 完整生命周期与交互测试
// -----------------------------------------------------------------------------
console.log('\nTest 8: MechNewtonCannonExperiment Full Lifecycle & Interactions');
{
  const exp = new MechNewtonCannonExperiment();
  const mockContext: any = {
    scene: new THREE.Scene(),
    camera: new THREE.PerspectiveCamera(),
    renderer: {} as any,
  };

  exp.init(mockContext);
  assert.strictEqual(exp.metadata.id, 'mech-newton-cannon');
  assert.strictEqual(exp.metadata.category, 'mechanics');

  // 发射测试
  exp.triggerLaunch();
  assert(exp.solver.particles.length > 0, 'Particles must be launched');

  // 增减粒子数与速度调节
  exp.adjustParticleCount(2);
  assert.strictEqual(exp.particleCount, 10);
  exp.adjustMinVelocity(0.5);
  assert(exp.minVelocityKmS >= 4.0);

  // 快捷预设切换
  exp.applyPreset('orbital');
  assert.strictEqual(exp.minVelocityKmS, 7.6);
  assert.strictEqual(exp.maxVelocityKmS, 8.8);

  // 射线悬停与点击模拟
  const raycaster = new THREE.Raycaster();
  // 模拟对发射按钮的检测
  const hoverResult = exp.getHoverTarget(raycaster);
  // (即使无相交对象也应优雅返回 null 或状态)
  assert(hoverResult === null || typeof hoverResult.id === 'string');

  // 步进演化循环
  exp.update(0.016, 1.0, mockContext);

  // 清空与重置
  exp.clearTrails();
  assert.strictEqual(exp.solver.particles.length, 0);

  // 销毁
  exp.dispose(mockContext);
  console.log('✓ Test 8 passed: MechNewtonCannonExperiment lifecycle and interactions verified');
}

// -----------------------------------------------------------------------------
// Test 9: 60+ FPS 万有引力动力学求解性能基准测试
// -----------------------------------------------------------------------------
console.log('\nTest 9: 60+ FPS Performance Benchmark for Gravitational Dynamics');
{
  const solver = new NewtonCannonDynamicsSolver({ timeScale: 120.0 });
  solver.launch({
    particleCount: 24, // 24 颗粒子高负载并发
    minVelocityKmS: 3.5,
    maxVelocityKmS: 12.0,
  });

  const iterations = 500;
  const start = performance.now();
  for (let i = 0; i < iterations; i++) {
    solver.update(0.016);
  }
  const end = performance.now();
  const totalMs = end - start;
  const avgMsPerFrame = totalMs / iterations;
  const equivalentFps = Math.round(1000 / avgMsPerFrame);

  console.log(`  24-particle simulation average step time: ${avgMsPerFrame.toFixed(5)} ms`);
  console.log(`  Equivalent logic frame rate: ${equivalentFps} FPS`);

  assert(
    avgMsPerFrame < 1.0,
    `Step time ${avgMsPerFrame.toFixed(5)}ms exceeded 1.0ms performance budget!`
  );
  console.log('✓ Test 9 passed: High performance gravity solver easily satisfies 60+ FPS');
}

// -----------------------------------------------------------------------------
// Test 10: 核心铁律：严禁出现任何 DOM 悬浮弹窗与 Banner (Strict Zero Popups Invariant)
// -----------------------------------------------------------------------------
console.log('\nTest 10: Strict Zero Floating Popups & Banners Invariant');
{
  // 检查实验实现与场景代码中绝对不包含 DOM 悬浮弹窗相关类名
  const fs = await import('node:fs');
  const expCode = fs.readFileSync(
    'src/experiments/catalog/mech-newton-cannon/index.ts',
    'utf-8'
  );
  const benchCode = fs.readFileSync('src/scene/mech/NewtonCannonBenchMesh.ts', 'utf-8');

  const forbiddenTerms = [
    'guidance-bar',
    'floating-modal',
    'step-card',
    'toast-message',
    'popup-dialog',
    'banner-container',
  ];

  for (const term of forbiddenTerms) {
    assert(
      !expCode.includes(term) && !benchCode.includes(term),
      `Forbidden floating DOM popup/banner class detected: ${term}`
    );
  }

  console.log('✓ Test 10 passed: Strict zero floating popups & banners rule enforced');
}

console.log('\n========================================================');
console.log('All Newton Cannon & Orbital Mechanics Tests Passed (10/10)!');
console.log('========================================================\n');
