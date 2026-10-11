import assert from 'node:assert';
import * as THREE from 'three';
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
import EmMassSpecExperiment from '../src/experiments/catalog/em-mass-spec/index.ts';
import EmHysteresisExperiment from '../src/experiments/catalog/em-hysteresis/index.ts';
import EmInductionExperiment from '../src/experiments/catalog/em-induction/index.ts';
import EmGeneratorExperiment from '../src/experiments/catalog/em-generator/index.ts';
import { InductionStatusCard } from '../src/ui/vision/InductionStatusCard.ts';
import { GeneratorStatusCard } from '../src/ui/vision/GeneratorStatusCard.ts';
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
  for (const id of ['em-induction', 'em-generator', 'em-mass-spec', 'em-hysteresis']) {
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
  click('em-generator');
  click('em-mass-spec');
  click('em-hysteresis');

  let indCmd = '';
  const indCard = new InductionStatusCard((cmd) => { indCmd = cmd.type; });
  indCard.setVisible(true);
  indCard.element.querySelector('#ind-reset')?.dispatchEvent({ type: 'click' });
  assert.strictEqual(indCmd, 'reset');

  let genCmd = '';
  const genCard = new GeneratorStatusCard((cmd) => { genCmd = cmd.type; });
  genCard.setVisible(true);
  genCard.element.querySelector('#gen-boost')?.dispatchEvent({ type: 'click' });
  assert.strictEqual(genCmd, 'boost');

  console.log('✓ Test 5 passed');
}

console.log('Test 6: Frame budget');
{
  const experiments = [
    new EmInductionExperiment(),
    new EmGeneratorExperiment(),
    new EmMassSpecExperiment(),
    new EmHysteresisExperiment(),
  ];
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
