import assert from 'node:assert';
import * as THREE from 'three';
import {
  INDUCTION_GOLDEN,
  coilFrontFlow,
  emfVolt,
  evaluateInduction,
  fluxLinkageWb,
  magnetFieldAt,
} from '../src/physics/em/induction.ts';
import {
  CARTRIDGES,
  MASS_STAGE,
  analyzerRadius,
  curveSide,
  middleIon,
  plateVoltageForIon,
  solveSpectrum,
  trajectoryPoint,
} from '../src/physics/em/massSpec.ts';
import {
  FERRO_MATERIALS,
  H_MAX,
  branchB,
  loopArea,
  remanence,
  virginB,
} from '../src/physics/em/hysteresis.ts';
import { localPointOnBenchFace } from '../src/scene/em/benchDrag.ts';
import { InductionBenchMesh } from '../src/scene/em/InductionBenchMesh.ts';
import { InductionInteractionManager } from '../src/scene/em/InductionInteractionManager.ts';
import EmInductionExperiment from '../src/experiments/catalog/em-induction/index.ts';
import EmMassSpecExperiment from '../src/experiments/catalog/em-mass-spec/index.ts';
import EmHysteresisExperiment from '../src/experiments/catalog/em-hysteresis/index.ts';
import { InductionStatusCard } from '../src/ui/vision/InductionStatusCard.ts';
import { PhysicsDisciplineModal } from '../src/ui/vision/PhysicsDisciplineModal.ts';

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
  private queryCache = new Map<string, MockElement[]>();

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
      clearRect: () => {},
      fillRect: () => {},
      beginPath: () => {},
      moveTo: () => {},
      lineTo: () => {},
      arc: () => {},
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

  querySelector(selector: string): MockElement {
    const cached = this.elementCache.get(selector);
    if (cached) return cached;
    const el = new MockElement(selector.startsWith('#canvas') ? 'canvas' : 'div');
    this.elementCache.set(selector, el);
    return el;
  }

  querySelectorAll(selector: string): MockElement[] {
    const key = `${selector}_${this.innerHTML.length}`;
    const cached = this.queryCache.get(key);
    if (cached) return cached;
    const results: MockElement[] = [];
    if (selector.startsWith('.')) {
      const cls = selector.slice(1);
      const regex = new RegExp(`class="[^"]*\\b${cls}\\b[^"]*"`, 'g');
      let match: RegExpExecArray | null;
      while ((match = regex.exec(this.innerHTML)) !== null) {
        const el = new MockElement('div');
        const snippet = this.innerHTML.slice(Math.max(0, match.index - 80), match.index + 220);
        const expMatch = snippet.match(/data-exp-id="([^"]+)"/);
        if (expMatch) el.setAttribute('data-exp-id', expMatch[1]);
        const planMatch = snippet.match(/data-planned="([^"]+)"/);
        if (planMatch) el.setAttribute('data-planned', planMatch[1]);
        results.push(el);
      }
    }
    this.queryCache.set(key, results);
    return results;
  }

  appendChild(child: unknown): unknown {
    return child;
  }

  classList = {
    add: () => {},
    remove: () => {},
    toggle: () => false,
    contains: () => false,
  };
}

(global as any).document = { createElement: (tag: string) => new MockElement(tag), activeElement: null };
(global as any).window = { innerWidth: 800, innerHeight: 800 };
(global as any).requestAnimationFrame = (fn: () => void) => {
  fn();
  return 1;
};

const ctx = { scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera() } as any;

function cameraOnPlusZ(): THREE.PerspectiveCamera {
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 50);
  camera.position.set(0, 0, 5);
  camera.lookAt(0, 0, 0);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  return camera;
}

console.log('=== Electromagnetism remaining experiments ===\n');

console.log('Test 1: Faraday EMF matches a finite difference, and Lenz opposes dB/dt');
{
  const moving = { ...INDUCTION_GOLDEN, axial: 0.08, velocity: -0.42, poleSign: -1 as const };
  const dx = 1e-5;
  const flux = (axial: number) => fluxLinkageWb({ ...moving, axial });
  const numeric = -((flux(moving.axial + dx) - flux(moving.axial - dx)) / (2 * dx)) * moving.velocity;
  const analytic = emfVolt(moving);
  assert(Math.abs(numeric - analytic) / Math.abs(numeric) < 1e-4, `EMF ${analytic} != ${numeric}`);
  assert.strictEqual(emfVolt({ ...moving, velocity: 0 }), 0);
  assert.strictEqual(emfVolt({ ...moving, axial: 0, velocity: 1 }), 0);

  const before = magnetFieldAt(moving, 0);
  const later = magnetFieldAt({ ...moving, axial: moving.axial + moving.velocity * 0.02 }, 0);
  const reading = evaluateInduction(moving);
  assert(Math.sign(reading.inducedFieldTesla) === -Math.sign(later - before));
  assert(Math.sign(reading.magnetFieldTesla) !== Math.sign(reading.inducedFieldTesla));
  const doubled = evaluateInduction({ ...moving, turns: moving.turns * 2 });
  assert(Math.abs(doubled.emfVolt / reading.emfVolt - 2) < 1e-9);

  const omega = new THREE.Vector3(0, 1, 0);
  const rim = new THREE.Vector3(0, 0, 1);
  const flow = new THREE.Vector3().crossVectors(omega, rim);
  assert(flow.x > 0.9, 'positive current at the near rim flows toward +X');
  assert.strictEqual(coilFrontFlow(1).x, 1);
  assert.strictEqual(coilFrontFlow(-1).x, -1);
  console.log('✓ Test 1 passed');
}

console.log('Test 2: Vertical coil, drag-up raises the magnet, and a pass crosses zero EMF');
{
  const camera = cameraOnPlusZ();
  const bench = new InductionBenchMesh();
  const center = localPointOnBenchFace({ clientX: 400, clientY: 400 }, camera, bench.group, { width: 800, height: 800 });
  const up = localPointOnBenchFace({ clientX: 400, clientY: 220 }, camera, bench.group, { width: 800, height: 800 });
  assert(center && up);
  assert(Math.abs(center.x) < 0.05 && Math.abs(center.y) < 0.05);
  assert(up.y > center.y + 0.2, 'screen-up is local +Y on the bench face');

  let draggedY = 0;
  const manager = new InductionInteractionManager({
    bench,
    onMagnetY: (y) => { draggedY = y; },
    onProbeY: () => {},
    onFlipPole: () => {},
    onCycleTurns: () => {},
    onStartPass: () => {},
  });
  const hit = { object: bench.magnetGroup.children[0] } as THREE.Intersection;
  manager.onPointerDown({ clientX: 400, clientY: 400 } as PointerEvent, hit, { camera } as any);
  manager.onPointerMove({ clientX: 400, clientY: 220 } as PointerEvent, null, { camera } as any);
  assert(draggedY > 0.2);

  bench.sync({
    axial: 0.22, poleSign: -1, probeAxial: 0, turns: 200, currentAmp: 0.04, magnetField: -0.02, inducedField: 0.001,
  });
  bench.flowArrow.updateMatrix();
  const arrow = new THREE.Vector3(0, 1, 0).applyQuaternion(bench.flowArrow.quaternion);
  assert(arrow.x > 0.9, 'flow arrow follows the +X rim current');
  assert(bench.needlePivot.rotation.z > 0);
  assert.strictEqual((bench.bottomCap.material as THREE.MeshStandardMaterial).color.getHex(), 0xef4444);

  const coilBox = new THREE.Box3().setFromObject(bench.coilGroup);
  assert(coilBox.max.x - coilBox.min.x > coilBox.max.y - coilBox.min.y);
  const magnetBox = new THREE.Box3().setFromObject(bench.magnetGroup);
  assert(magnetBox.max.y - magnetBox.min.y > magnetBox.max.x - magnetBox.min.x);

  const exp = new EmInductionExperiment();
  exp.init(ctx);
  const before = exp.getTelemetry().poleSign;
  exp.onPointerDown({ clientX: 10, clientY: 10 } as PointerEvent, { object: (exp as any).bench.magnetGroup } as THREE.Intersection, ctx);
  exp.onPointerUp({ clientX: 10, clientY: 10 } as PointerEvent, ctx);
  assert.notStrictEqual(exp.getTelemetry().poleSign, before);

  exp.resetGolden();
  exp.startPass();
  let maxEmf = 0;
  let nearCenter = 1;
  let crossed = false;
  for (let i = 0; i < 80; i++) {
    exp.update(0.02, i * 0.02, ctx);
    const data = exp.getTelemetry();
    maxEmf = Math.max(maxEmf, Math.abs(data.emfVolt));
    if (Math.abs(data.axial) < 0.02) {
      nearCenter = Math.min(nearCenter, Math.abs(data.emfVolt));
      crossed = true;
    }
  }
  assert(crossed, 'the scripted pass must go through the coil');
  assert(maxEmf > 0.05);
  assert(nearCenter < maxEmf * 0.5, 'EMF is smallest at maximum flux');
  assert.strictEqual(exp.getTelemetry().velocity, 0);
  exp.dispose(ctx);
  bench.dispose();
  console.log('✓ Test 2 passed');
}

console.log('Test 3: Mass spectrometer radii, selector, and Lorentz orbit');
{
  const open = {
    accelVoltage: 2000,
    analyzerBz: -0.15,
    selectorBz: -0.05,
    plateVoltage: 10,
    gapM: 0.015,
    jawOpening: 1,
  };
  const light = solveSpectrum(CARTRIDGES[0], open);
  for (let i = 1; i < light.length; i++) {
    assert(light[i].radiusM > light[i - 1].radiusM, 'heavier ions land farther out');
    assert(light[i].onPlate);
    assert(light[i].hitY > 0, 'Bz < 0 throws positive ions toward +Y');
  }
  const neon = solveSpectrum(CARTRIDGES[1], open);
  assert(neon.every((hit) => !hit.onPlate));
  const stronger = solveSpectrum(CARTRIDGES[1], { ...open, analyzerBz: -0.28 });
  assert(stronger.every((hit) => hit.onPlate));

  const helium = middleIon(CARTRIDGES[0]);
  const tuned = plateVoltageForIon(helium, 2000, 0.015, -0.05);
  const narrow = solveSpectrum(CARTRIDGES[0], { ...open, jawOpening: 0.05, plateVoltage: tuned });
  const he = narrow.find((hit) => hit.ion.id === 'he');
  const carbon = narrow.find((hit) => hit.ion.id === 'c');
  assert(he && he.transmission > 0.95);
  assert(carbon && carbon.transmission < 0.01);

  const flipped = solveSpectrum(CARTRIDGES[0], { ...open, analyzerBz: 0.15 });
  assert(flipped[0].hitY < 0);
  assert.strictEqual(curveSide(-1), 1);

  const hit = light[2];
  const steps = 1200;
  const omega = -(hit.chargeC / hit.massKg) * open.analyzerBz;
  const dt = Math.PI / (Math.abs(omega) * steps);
  let x = 0;
  let y = 0;
  let vx = hit.speed;
  let vy = 0;
  const qOverM = hit.chargeC / hit.massKg;
  const lorentz = new THREE.Vector3(hit.speed, 0, 0).cross(new THREE.Vector3(0, 0, open.analyzerBz)).multiplyScalar(qOverM);
  assert(lorentz.y > 0);
  for (let i = 0; i < steps; i++) {
    const wdt = omega * dt;
    const c = Math.cos(wdt);
    const s = Math.sin(wdt);
    const nvx = c * vx - s * vy;
    const nvy = s * vx + c * vy;
    x += 0.5 * (vx + nvx) * dt;
    y += 0.5 * (vy + nvy) * dt;
    vx = nvx;
    vy = nvy;
  }
  const radius = analyzerRadius(hit.massKg, hit.chargeC, hit.speed, open.analyzerBz);
  const end = trajectoryPoint(radius, Math.PI, 1);
  assert(Math.abs(end.x) < 1e-9 && Math.abs(end.y - 2 * radius) < 1e-9);
  assert(Math.abs(x) < 0.03 * radius, `integrated x ${x}`);
  assert(Math.abs(y - 2 * radius) / (2 * radius) < 0.02, `integrated y ${y} vs ${2 * radius}`);

  const exp = new EmMassSpecExperiment();
  exp.init(ctx);
  assert(exp.getTelemetry().probeRegion === '分析磁铁');
  const x0 = (exp as any).ionVisuals[0].x as number;
  exp.update(0.2, 0.2, ctx);
  assert((exp as any).ionVisuals[0].x !== x0);
  exp.flipAnalyzer();
  assert(exp.getTelemetry().hits[0].hitY < 0);
  exp.setSample('neon');
  assert(exp.getTelemetry().caption.includes('超出'));
  exp.setAnalyzerMagnitude(0.28);
  assert(exp.getTelemetry().hits.every((item: { onPlate: boolean }) => item.onPlate));
  exp.setProbeX(MASS_STAGE.selector0 + 0.02);
  assert.strictEqual(exp.getTelemetry().probeRegion, '速度选择器');
  exp.dispose(ctx);
  console.log('✓ Test 3 passed');
}

console.log('Test 4: Hysteresis loop, probe, and manual sweep');
{
  const silicon = FERRO_MATERIALS[0];
  const carbon = FERRO_MATERIALS[2];
  assert(Math.abs(branchB(silicon.hcAmpPerM, 1, silicon)) < 1e-9);
  assert(remanence(silicon) > 0);
  assert.strictEqual(virginB(0, silicon), 0);
  const siliconArea = loopArea(silicon);
  const carbonArea = loopArea(carbon);
  assert(siliconArea > 0 && carbonArea > siliconArea * 5);

  const exp = new EmHysteresisExperiment();
  exp.init(ctx);
  assert.strictEqual(exp.getTelemetry().B, 0);
  exp.setH(H_MAX);
  exp.setH(-H_MAX);
  exp.setH(H_MAX);
  exp.setH(0);
  const after = exp.getTelemetry();
  assert(after.major);
  assert(after.B > 0.5, 'returning through H = 0 leaves positive remanence');
  const inside = after.probeTesla;
  exp.setProbeY(0.34 + 0.2);
  assert(Math.abs(exp.getTelemetry().probeTesla) < Math.abs(inside) * 0.5);

  exp.resetGolden();
  exp.setMaterial('carbon-steel');
  assert(exp.getTelemetry().area > exp.getTelemetry().remanence);
  assert(exp.getTelemetry().area > siliconArea * 5);
  exp.setAuto(true);
  let maxB = -10;
  let minB = 10;
  for (let i = 0; i < 90; i++) {
    exp.update(0.05, i * 0.05, ctx);
    maxB = Math.max(maxB, exp.getTelemetry().B);
    minB = Math.min(minB, exp.getTelemetry().B);
  }
  assert(maxB > 0.8 && minB < -0.8);

  const rod = new THREE.Box3().setFromObject((exp as any).bench.sampleGroup);
  assert(rod.max.y - rod.min.y > rod.max.x - rod.min.x);
  exp.onPointerDown({ clientX: 4, clientY: 4 } as PointerEvent, { object: (exp as any).bench.sampleGroup } as THREE.Intersection, ctx);
  exp.onPointerUp({ clientX: 4, clientY: 4 } as PointerEvent, ctx);
  assert.notStrictEqual(exp.getTelemetry().materialId, 'carbon-steel');
  exp.dispose(ctx);
  console.log('✓ Test 4 passed');
}

console.log('Test 5: Catalog cards are selectable and the status card sends commands');
{
  let selected = '';
  const modal = new PhysicsDisciplineModal({
    onBackToDisciplines: () => {},
    onSelectExperiment: async (id) => { selected = id; },
  });
  modal.showLevel2('em');
  for (const id of ['em-induction', 'em-mass-spec', 'em-hysteresis']) {
    assert(modal.element.innerHTML.includes(`data-exp-id="${id}"`));
    assert(modal.element.innerHTML.includes(`data-exp-id="${id}" data-planned="false"`));
  }
  const cards = modal.element.querySelectorAll('.optics-card').filter((card) => card.getAttribute('data-exp-id'));
  const click = (id: string) => {
    selected = '';
    cards.find((card) => card.getAttribute('data-exp-id') === id)?.dispatchEvent({ type: 'click' });
    assert.strictEqual(selected, id);
  };
  click('em-induction');
  click('em-mass-spec');
  click('em-hysteresis');

  let command = '';
  const card = new InductionStatusCard((cmd) => { command = cmd.type; });
  card.setVisible(true);
  card.element.querySelector('#ind-reset').dispatchEvent({ type: 'click' });
  assert.strictEqual(command, 'reset');
  console.log('✓ Test 5 passed');
}

console.log('Test 6: Frame budget');
{
  const experiments = [new EmInductionExperiment(), new EmMassSpecExperiment(), new EmHysteresisExperiment()];
  for (const exp of experiments) {
    exp.init(ctx);
    const started = performance.now();
    for (let i = 0; i < 240; i++) exp.update(0.016, i * 0.016, ctx);
    const average = (performance.now() - started) / 240;
    assert(average < 1, `${exp.metadata.id} update ${average.toFixed(3)} ms`);
    const readStarted = performance.now();
    for (let i = 0; i < 500; i++) exp.getTelemetry();
    const read = (performance.now() - readStarted) / 500;
    assert(read < 0.05, `${exp.metadata.id} telemetry ${read.toFixed(4)} ms`);
    exp.dispose(ctx);
  }
  console.log('✓ Test 6 passed');
}

console.log('\nAll remaining electromagnetism tests passed.');
