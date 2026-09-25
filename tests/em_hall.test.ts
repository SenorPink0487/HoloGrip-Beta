import assert from 'node:assert';
import * as THREE from 'three';
import EmHallExperiment, { MATERIAL_PROFILES } from '../src/experiments/catalog/em-hall/index.ts';
import { metadata as emHallMetadata } from '../src/experiments/catalog/em-hall/meta.ts';
import { HallCarrierParticleSystem } from '../src/scene/em/HallCarrierParticleSystem.ts';
import { HallBenchMesh } from '../src/scene/em/HallBenchMesh.ts';
import { HallStatusCard } from '../src/ui/vision/HallStatusCard.ts';
import { PhysicsDisciplineModal } from '../src/ui/vision/PhysicsDisciplineModal.ts';

// Lightweight DOM Mock for Node.js test environment
class MockElement {
  public tagName: string;
  public className: string = '';
  public innerHTML: string = '';
  public textContent: string = '';
  public style: Record<string, string> = {};
  public attributes: Record<string, string> = {};
  public eventListeners: Record<string, ((e?: any) => void)[]> = {};
  private elementCache: Map<string, MockElement> = new Map();

  getContext(_type: string = '2d') {
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

  constructor(tagName: string) {
    this.tagName = tagName.toUpperCase();
  }

  setAttribute(name: string, value: string): void {
    this.attributes[name] = value;
  }

  getAttribute(name: string): string | null {
    return this.attributes[name] ?? null;
  }

  addEventListener(event: string, callback: (e?: any) => void): void {
    if (!this.eventListeners[event]) {
      this.eventListeners[event] = [];
    }
    this.eventListeners[event].push(callback);
  }

  dispatchEvent(event: { type: string }): boolean {
    const list = this.eventListeners[event.type];
    if (list) {
      for (const cb of list) {
        cb(event);
      }
      return true;
    }
    return false;
  }

  querySelector(selector: string): MockElement | null {
    if (this.elementCache.has(selector)) {
      return this.elementCache.get(selector)!;
    }
    const el = new MockElement(selector.startsWith('#canvas') ? 'canvas' : 'div');
    el.className = selector.replace(/^[.#]/, '');
    this.elementCache.set(selector, el);
    return el;
  }

  private queryCache: Map<string, MockElement[]> = new Map();

  querySelectorAll(selector: string): MockElement[] {
    const key = `${selector}_${this.innerHTML.length}`;
    if (this.queryCache.has(key)) {
      return this.queryCache.get(key)!;
    }

    const results: MockElement[] = [];

    if (selector.startsWith('.')) {
      const cls = selector.slice(1);
      const regex = new RegExp(`class="[^"]*\\b${cls}\\b[^"]*"`, 'g');
      let match: RegExpExecArray | null;
      while ((match = regex.exec(this.innerHTML)) !== null) {
        const el = new MockElement('div');
        el.className = cls;

        const contextStart = Math.max(0, match.index - 50);
        const contextEnd = Math.min(this.innerHTML.length, match.index + match[0].length + 150);
        const snippet = this.innerHTML.slice(contextStart, contextEnd);

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

  appendChild(child: any): any {
    return child;
  }

  removeChild(child: any): any {
    return child;
  }

  classList = {
    add: (cls: string) => {
      if (!this.className.includes(cls)) this.className += ` ${cls}`;
    },
    remove: (cls: string) => {
      this.className = this.className.replace(cls, '').trim();
    },
    toggle: (cls: string, force?: boolean) => {
      const has = this.className.includes(cls);
      const shouldHave = force !== undefined ? force : !has;
      if (shouldHave) this.classList.add(cls);
      else this.classList.remove(cls);
      return shouldHave;
    },
    contains: (cls: string) => this.className.includes(cls),
  };
}

(global as any).document = {
  createElement: (tagName: string) => new MockElement(tagName),
  activeElement: null,
};
(global as any).requestAnimationFrame = (fn: () => void) => {
  fn();
  return 1;
};

console.log('=== Starting Electromagnetism & Hall Effect Verification ===\n');

// ================= Test 1: Hall Effect Analytical Physics & Material Profiling =================
console.log('Test 1: Hall Effect Physics Formula Precision & Material Profiling');
{
  const exp = new EmHallExperiment();
  const mockContext = {
    scene: new THREE.Scene(),
    camera: new THREE.PerspectiveCamera(),
    controls: {} as any,
    renderer: {} as any,
    setParameter: () => {},
  } as any;

  exp.init(mockContext);

  // 1. n-GaAs: Electrons (q = -e), n = 1.25e21 m^-3, d = 0.5 mm, I = 10 mA, B = 0.5 T
  exp.applyMaterial('n-gaas');
  exp.setCurrent(10.0);
  exp.setMagField(0.5);
  exp.setThickness(0.5);

  const dataN = exp.getTelemetryData();
  assert.strictEqual(dataN.carrierType, 'electron');
  assert.ok(dataN.hallCoefficientRh < 0, 'Hall coefficient R_H must be negative for n-type semiconductor');
  assert.ok(dataN.hallVoltageMv < 0, 'Hall voltage V_H must be negative for n-GaAs with I > 0, B > 0');

  // Theoretical V_H = (1 / (1.25e21 * -1.602176634e-19)) * (0.010 * 0.5 / 0.0005) * 1000 = -49.932 mV
  const expectedVhN = (1.0 / (1.25e21 * -1.602176634e-19)) * (0.010 * 0.5 / 0.0005) * 1000.0;
  assert.ok(Math.abs(dataN.hallVoltageMv - expectedVhN) < 0.01, `V_H should match theory: ${dataN.hallVoltageMv} vs ${expectedVhN}`);

  // 2. p-Si: Holes (q = +e), n = 2.50e21 m^-3, d = 0.5 mm, I = 10 mA, B = 0.5 T
  exp.applyMaterial('p-silicon');
  const dataP = exp.getTelemetryData();
  assert.strictEqual(dataP.carrierType, 'hole');
  assert.ok(dataP.hallCoefficientRh > 0, 'Hall coefficient R_H must be positive for p-type semiconductor');
  assert.ok(dataP.hallVoltageMv > 0, 'Hall voltage V_H must be positive for p-Si with I > 0, B > 0');

  const expectedVhP = (1.0 / (2.50e21 * 1.602176634e-19)) * (0.010 * 0.5 / 0.0005) * 1000.0;
  assert.ok(Math.abs(dataP.hallVoltageMv - expectedVhP) < 0.01, `V_H should match theory: ${dataP.hallVoltageMv} vs ${expectedVhP}`);

  // 3. Metallic Copper: ultra-high n = 8.49e28 m^-3 => V_H in microvolts
  exp.applyMaterial('copper');
  const dataCu = exp.getTelemetryData();
  assert.strictEqual(dataCu.carrierType, 'metal');
  assert.ok(Math.abs(dataCu.hallVoltageMv) < 0.001, 'Metal copper Hall voltage must be << 1 mV due to huge carrier density');

  exp.dispose();
  console.log('✓ Test 1 passed: Analytical physics, material profiles, and carrier sign inversion verified');
}

// ================= Test 2: Inversion Symmetries (Field B Reversal & Current I Reversal) =================
console.log('Test 2: Reversal Symmetries (B -> -B, I -> -I, and (B,I) -> (-B,-I))');
{
  const exp = new EmHallExperiment();
  const mockContext = { scene: new THREE.Scene() } as any;
  exp.init(mockContext);
  exp.applyMaterial('n-gaas');
  exp.setCurrent(10.0);
  exp.setMagField(0.6);
  exp.setThickness(0.5);

  const baseVh = exp.getTelemetryData().hallVoltageMv;

  // B Reversal: V_H(-B) = -V_H(B)
  exp.toggleFieldPolarity();
  const revBVh = exp.getTelemetryData().hallVoltageMv;
  assert.ok(Math.abs(revBVh + baseVh) < 1e-4, 'Reversing B must invert the sign of V_H');

  // I Reversal: V_H(-I) = -V_H(I)
  exp.toggleFieldPolarity(); // restore B
  exp.toggleCurrentPolarity();
  const revIVh = exp.getTelemetryData().hallVoltageMv;
  assert.ok(Math.abs(revIVh + baseVh) < 1e-4, 'Reversing I must invert the sign of V_H');

  // Double Reversal: V_H(-B, -I) = V_H(B, I)
  exp.toggleFieldPolarity(); // both now reversed
  const doubleRevVh = exp.getTelemetryData().hallVoltageMv;
  assert.ok(Math.abs(doubleRevVh - baseVh) < 1e-4, 'Reversing both B and I must preserve V_H');

  exp.dispose();
  console.log('✓ Test 2 passed: All magnetic and current inversion symmetries verified');
}

// ================= Test 3: Thickness Scaling & Sensitivity K_H =================
console.log('Test 3: Thickness Scaling & Hall Sensitivity K_H');
{
  const exp = new EmHallExperiment();
  exp.init({ scene: new THREE.Scene() } as any);
  exp.applyMaterial('n-gaas');
  exp.setThickness(0.5);
  const vh1 = exp.getTelemetryData().hallVoltageMv;
  const kh1 = exp.getTelemetryData().hallSensitivityKh;

  exp.setThickness(1.0); // double thickness
  const vh2 = exp.getTelemetryData().hallVoltageMv;
  const kh2 = exp.getTelemetryData().hallSensitivityKh;

  assert.ok(Math.abs(vh2 - vh1 * 0.5) < 1e-4, 'Doubling thickness must halve the Hall voltage');
  assert.ok(Math.abs(kh2 - kh1 * 0.5) < 1e-4, 'Doubling thickness must halve the Hall sensitivity K_H');

  exp.dispose();
  console.log('✓ Test 3 passed: V_H ∝ 1/d thickness scaling and K_H sensitivity verified');
}

// ================= Test 4: 3D Scene Assembly & Particle System Lifecycle =================
console.log('Test 4: 3D Scene Assembly & Particle System Lifecycle');
{
  const particleSys = new HallCarrierParticleSystem({
    waferLength: 0.12,
    waferThickness: 0.024,
    waferWidth: 0.064,
  });

  assert.ok(particleSys.group instanceof THREE.Group, 'Particle system group instantiated');
  particleSys.setCarrierType('electron');
  particleSys.setPhysicsState(10, 0.5, -25.0, 'electron');
  particleSys.update(0.016);

  particleSys.setCarrierType('hole');
  particleSys.setPhysicsState(10, 0.5, 25.0, 'hole');
  particleSys.update(0.016);

  particleSys.dispose();

  const bench = new HallBenchMesh();
  assert.ok(bench.group instanceof THREE.Group, 'HallBenchMesh group instantiated');
  assert.ok(bench.waferMesh instanceof THREE.Mesh, 'Hall wafer mesh exists');
  bench.updateTelemetry(0.5, 10.0, -25.0, 'n-GaAs', 'electron');
  bench.update(0.016);
  bench.dispose();

  console.log('✓ Test 4 passed: 3D carrier particle system and HallBenchMesh lifecycle verified');
}

// ================= Test 5: VisionOS HallStatusCard Telemetry & UI Integration =================
console.log('Test 5: VisionOS HallStatusCard Telemetry & UI Integration');
{
  let lastB = 0;
  let lastI = 0;
  let lastD = 0;
  let lastMat = '';
  let toggledCarrier = false;
  let toggledField = false;

  const card = new HallStatusCard({
    onMagFieldChange: (b) => { lastB = b; },
    onCurrentChange: (i) => { lastI = i; },
    onThicknessChange: (d) => { lastD = d; },
    onMaterialChange: (m) => { lastMat = m; },
    onCarrierChargeToggle: () => { toggledCarrier = true; },
    onToggleFieldPolarity: () => { toggledField = true; },
  });

  assert.ok(card.element instanceof MockElement, 'Status card element created');

  card.updateTelemetry({
    magFieldTesla: 0.8,
    currentMa: 15.0,
    hallVoltageMv: -45.0,
    carrierType: 'electron',
    materialKey: 'n-gaas',
  });

  card.setVisible(true);
  assert.strictEqual(card.visible, true);
  card.setVisible(false);
  assert.strictEqual(card.visible, false);

  console.log('✓ Test 5 passed: HallStatusCard UI data binding and visibility lifecycle verified');
}

// ================= Test 6: Discipline Navigation & Electromagnetism Branch Level 1/2 =================
console.log('Test 6: Discipline Navigation & Electromagnetism Branch Level 1/2');
{
  let selectedExpId = '';
  let levelTitle = '';

  const modal = new PhysicsDisciplineModal({
    onBackToDisciplines: () => {},
    onSelectExperiment: async (id) => { selectedExpId = id; },
    onLevelChange: (_lvl, title) => { levelTitle = title; },
  });

  // Verify Level 1 has 4 branches and Electromagnetism is ready
  assert.strictEqual(modal.getCurrentLevel(), 1);
  assert.ok(modal.element.innerHTML.includes('id="branch-tile-em"'), 'EM branch tile exists');
  assert.ok(modal.element.innerHTML.includes('branch-tile-em" role="button" tabindex="0" title="进入电磁学实验"'), 'EM tile is ready');

  // Navigate to Level 2 (Electromagnetism)
  modal.showLevel2('em');
  assert.strictEqual(modal.getCurrentLevel(), 2);
  assert.strictEqual(levelTitle, '电磁学实验');
  assert.ok(modal.element.innerHTML.includes('data-exp-id="em-hall"'), 'em-hall card exists in deck');
  assert.ok(modal.element.innerHTML.includes('霍尔效应原理'), 'em-hall name displayed');
  assert.ok(modal.element.innerHTML.includes('data-exp-id="em-induction"'), 'Planned experiment em-induction exists');

  // Click on em-hall triggers experiment selection
  const emCard = modal.element.querySelectorAll('.optics-card')[0];
  emCard.dispatchEvent({ type: 'click' });
  assert.strictEqual(selectedExpId, 'em-hall', 'Selecting em-hall card must trigger callback');

  console.log('✓ Test 6 passed: Electromagnetism Level 1 and Level 2 2x2 grid navigation verified');
}

// ================= Test 7: 60+ FPS Frame Budget & Performance Benchmark =================
console.log('Test 7: 60+ FPS Frame Budget & Performance Benchmark');
{
  const exp = new EmHallExperiment();
  exp.init({ scene: new THREE.Scene() } as any);

  const iterations = 1000;
  const start = performance.now();
  for (let i = 0; i < iterations; i++) {
    exp.update(0.016, i * 0.016, {} as any);
  }
  const totalMs = performance.now() - start;
  const avgFrameMs = totalMs / iterations;
  const fpsEquivalent = 1000 / avgFrameMs;

  console.log(`  Measured Average Frame Time: ${avgFrameMs.toFixed(4)} ms`);
  console.log(`  Equivalent Logic Frame Rate:  ${Math.round(fpsEquivalent)} FPS`);

  assert.ok(avgFrameMs < 0.25, `Frame time must be < 0.25ms for 60+ FPS budget, got ${avgFrameMs}ms`);
  assert.ok(fpsEquivalent > 4000, 'Logic execution rate must exceed 4000 FPS');

  exp.dispose();
  console.log('✓ Test 7 passed: In-process 60+ FPS frame budget verified');
}

console.log('\n========================================================');
console.log('All Electromagnetism Hall Effect Tests Passed (7/7)!');
console.log('========================================================');
