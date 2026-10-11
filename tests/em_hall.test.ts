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
  public id: string = '';
  public tagName: string;
  public className: string = '';
  public innerHTML: string = '';
  public textContent: string = '';
  public value: string = '';
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

  removeEventListener(event: string, callback: (e?: any) => void): void {
    if (this.eventListeners[event]) {
      this.eventListeners[event] = this.eventListeners[event].filter(cb => cb !== callback);
    }
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
    if (selector.startsWith('#')) {
      el.id = selector.slice(1);
    }
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
const mockWindowListeners: Record<string, ((e?: any) => void)[]> = {};
(global as any).window = {
  addEventListener: (event: string, callback: (e?: any) => void) => {
    if (!mockWindowListeners[event]) mockWindowListeners[event] = [];
    mockWindowListeners[event].push(callback);
  },
  removeEventListener: (event: string, callback: (e?: any) => void) => {
    if (mockWindowListeners[event]) {
      mockWindowListeners[event] = mockWindowListeners[event].filter(cb => cb !== callback);
    }
  },
  dispatchEvent: (event: { type: string }) => {
    const list = mockWindowListeners[event.type];
    if (list) {
      for (const cb of list) cb(event);
      return true;
    }
    return false;
  },
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
  assert.ok(bench.substrateMesh instanceof THREE.Mesh, 'Hall solid substrate mesh exists');
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
  assert.ok(modal.element.innerHTML.includes('data-exp-id="em-mass-spec"'), 'em-mass-spec exists in deck');

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

// ================= Test 8: ComputeBridge Hall Carrier Simulation & Idle Decay =================
console.log('Test 8: ComputeBridge Hall Carrier Simulation & Idle Decay');
{
  let executedAction = '';
  const mockWorkerPool = {
    execute: async (req: any) => {
      executedAction = req.action;
      return {
        id: req.id,
        action: 'HALL_CARRIER_STEP',
        positions: req.positions,
        baseOffsetsY: req.baseOffsetsY,
        computeTimeMs: 0.045,
      };
    },
  } as any;

  // Import dynamically or create ComputeBridge instance
  const { ComputeBridge } = await import('../src/core/platform/ComputeBridge.ts');
  const bridge = new ComputeBridge(mockWorkerPool);

  const res = await bridge.simulateHallCarriers({
    positions: new Float32Array(54),
    baseOffsetsY: new Float32Array(18),
    baseOffsetsZ: new Float32Array(18),
    thermalPhases: new Float32Array(18),
    particleCount: 18,
    driftDirection: -1,
    speed: 0.1,
    maxDeflectionY: 0.02,
    halfL: 0.1,
    halfH: 0.05,
    waferThickness: 0.02,
    timeNow: 1.0,
    delta: 0.016,
  });

  assert.strictEqual(executedAction, 'HALL_CARRIER_STEP');
  assert.strictEqual(res.positions.length, 54);
  assert.ok(bridge.currentMetrics.avgComputeTimeMs > 0, 'Metrics should record compute time');

  // Verify idle decay: simulate time lapse > 1500ms
  (bridge as any).lastComputeTimestamp = Date.now() - 2000;
  assert.strictEqual(bridge.currentMetrics.avgComputeTimeMs, 0, 'Idle metrics must decay to 0 ms after 1.5s inactivity');

  console.log('✓ Test 8 passed: ComputeBridge carrier simulation and idle metric decay verified');
}

// ================= Test 9: Static Probe Badges and DynamicDrawUsage Verification =================
console.log('Test 9: Static Probe Badges and DynamicDrawUsage Verification');
{
  const particleSys = new HallCarrierParticleSystem({
    waferLength: 0.20,
    waferHeight: 0.08,
    waferThickness: 0.02,
    particleCount: 50,
  });

  // Verify DynamicDrawUsage
  const geo = (particleSys as any).particleGeo as THREE.BufferGeometry;
  const posAttr = geo.getAttribute('position') as THREE.BufferAttribute;
  assert.strictEqual(posAttr.usage, THREE.DynamicDrawUsage, 'Particle position buffer must use DynamicDrawUsage');

  // Verify probe badge textures
  const plusTex = (particleSys as any).plusBadgeTex;
  const minusTex = (particleSys as any).minusBadgeTex;
  assert.ok(plusTex instanceof THREE.CanvasTexture, 'Plus badge texture created');
  assert.ok(minusTex instanceof THREE.CanvasTexture, 'Minus badge texture created');

  // Verify polarity flipping switches textures instead of canvas re-draw
  particleSys.setPhysicsState(10.0, 0.5, -25.0, 'electron');
  const topSprite = (particleSys as any).topProbeSprite as THREE.Sprite;
  assert.strictEqual(topSprite.material.map, plusTex, 'Top probe should be positive');

  particleSys.setPhysicsState(10.0, -0.5, 25.0, 'electron');
  assert.strictEqual(topSprite.material.map, minusTex, 'Top probe should switch to minus texture');

  particleSys.dispose();
  console.log('✓ Test 9 passed: DynamicDrawUsage and zero-overhead badge texture swapping verified');
}

// ================= Test 10: Zero Current & Zero Field Physical Invariants =================
console.log('Test 10: Zero Current & Zero Field Physical Invariants');
{
  const particleSys = new HallCarrierParticleSystem({
    waferLength: 0.32,
    waferHeight: 0.125,
    waferThickness: 0.032,
    particleCount: 50,
  });
  particleSys.setToggles(true, true);

  // 1. Zero current (I = 0) => Speed = 0, no X drift
  particleSys.setPhysicsState(0, 0.5, 0, 'electron');
  const posArray = (particleSys as any).positions as Float32Array;
  const initialX = posArray[0];
  particleSys.update(0.1);
  const afterX = posArray[0];
  assert.strictEqual(afterX, initialX, 'Carriers must not drift along X when current is zero');
  assert.strictEqual((particleSys as any).arrowVelocity.visible, false, 'Velocity vector must be hidden when current is 0');
  assert.strictEqual((particleSys as any).arrowLorentz.visible, false, 'Lorentz force vector must be hidden when current is 0');

  // 2. Zero magnetic field (B = 0) => B arrow & Lorentz arrow hidden
  particleSys.setPhysicsState(10, 0, 0, 'electron');
  assert.strictEqual((particleSys as any).arrowMagField.visible, false, 'B vector must be hidden when B is 0');
  assert.strictEqual((particleSys as any).arrowLorentz.visible, false, 'Lorentz force vector must be hidden when B is 0');
  assert.strictEqual((particleSys as any).arrowHallField.visible, false, 'Hall field vector must be hidden when V_H is 0');

  // 3. Normal operating condition (I = 10, B = 0.5, V_H = -25) => All 4 vectors visible
  particleSys.setPhysicsState(10, 0.5, -25.0, 'electron');
  assert.strictEqual((particleSys as any).arrowVelocity.visible, true, 'Velocity vector visible');
  assert.strictEqual((particleSys as any).arrowMagField.visible, true, 'B vector visible');
  assert.strictEqual((particleSys as any).arrowLorentz.visible, true, 'Lorentz force vector visible');
  assert.strictEqual((particleSys as any).arrowHallField.visible, true, 'Hall field vector visible');

  particleSys.dispose();
  console.log('✓ Test 10 passed: Zero current and zero field physical invariants verified');
}

// ================= Test 11: HallStatusCard Granular Change Detection & Focus Safety =================
console.log('Test 11: HallStatusCard Granular Change Detection & Focus Safety');
{
  const card = new HallStatusCard();
  card.setVisible(true);

  // Initial full sync
  card.updateTelemetry({
    magFieldTesla: 0.5,
    currentMa: 10.0,
    hallVoltageMv: -25.0,
    waferThicknessMm: 0.5,
    carrierType: 'electron',
    materialKey: 'n-gaas',
  });

  const sliderB = (card as any).sliderB as HTMLInputElement;
  const sliderI = (card as any).sliderI as HTMLInputElement;
  assert.strictEqual(sliderB.value, '0.5');
  assert.strictEqual(sliderI.value, '10');

  // Simulate active user focus on sliderB while an external telemetry event fires
  (global as any).document.activeElement = sliderB;
  sliderB.value = '0.72'; // User dragged slider to 0.72

  // Update telemetry with slightly different B from external sync
  card.updateTelemetry({
    magFieldTesla: 0.75,
  });

  // Focused slider must NOT be abruptly overwritten by background sync
  assert.strictEqual(sliderB.value, '0.72', 'Active focused slider must preserve user input position');

  // Clean up focus
  (global as any).document.activeElement = null;

  // Now an external sync should update the slider when not focused
  card.updateTelemetry({
    magFieldTesla: 0.85,
  });
  assert.strictEqual(sliderB.value, '0.85', 'Unfocused slider updates cleanly to new telemetry value');

  console.log('✓ Test 11 passed: HallStatusCard granular change detection and focus safety verified');
}

// ================= Test 12: Dynamic Multi-Charge & B-Only Magnetic Arrow Kinetics =================
console.log('Test 12: Dynamic Multi-Charge & B-Only Magnetic Arrow Kinetics');
{
  const particleSys = new HallCarrierParticleSystem({
    waferLength: 0.32,
    waferHeight: 0.125,
    waferThickness: 0.032,
  });
  particleSys.setToggles(true, true);

  const topSprites = (particleSys as any).topProbeSprites as THREE.Sprite[];
  const bottomSprites = (particleSys as any).bottomProbeSprites as THREE.Sprite[];
  const plusTex = (particleSys as any).plusBadgeTex;
  const minusTex = (particleSys as any).minusBadgeTex;

  // 1. Zero Current or Zero Field -> 0 charges visible
  particleSys.setPhysicsState(0, 0.5, 0, 'electron');
  const visibleTopZeroI = topSprites.filter(s => s.visible).length;
  assert.strictEqual(visibleTopZeroI, 0, 'Zero current must have 0 surface charges');

  particleSys.setPhysicsState(10.0, 0, 0, 'electron');
  const visibleTopZeroB = topSprites.filter(s => s.visible).length;
  assert.strictEqual(visibleTopZeroB, 0, 'Zero B-field must have 0 surface charges');

  // 2. Charges scale with V_H: Low voltage -> fewer charges, High voltage -> more charges
  // Low V_H (~2 mV) -> 1 charge
  particleSys.setPhysicsState(2.0, 0.1, -2.0, 'electron');
  const lowCount = topSprites.filter(s => s.visible).length;
  assert.ok(lowCount >= 1 && lowCount <= 2, `Low V_H should have 1-2 charges, got ${lowCount}`);

  // Medium V_H (~25 mV) -> 7 charges
  particleSys.setPhysicsState(10.0, 0.5, -25.0, 'electron');
  const medCount = topSprites.filter(s => s.visible).length;
  assert.ok(medCount >= 5 && medCount <= 8, `Medium V_H should have 5-8 charges, got ${medCount}`);
  assert.ok(medCount > lowCount, 'Charges must increase with |V_H|');
  assert.strictEqual(topSprites[0].material.map, plusTex, 'V_H < 0 top must be positive');
  assert.strictEqual(bottomSprites[0].material.map, minusTex, 'V_H < 0 bottom must be negative');

  // High V_H (~90 mV) -> 11 charges (raised upper limit)
  particleSys.setPhysicsState(30.0, 1.0, -90.0, 'electron');
  const highCount = topSprites.filter(s => s.visible).length;
  assert.strictEqual(highCount, 11, `High V_H should reach max 11 charges, got ${highCount}`);
  assert.ok(highCount > medCount, 'Charges must reach raised upper limit of 11 with higher |V_H|');

  // Reverse polarity (V_H > 0): Top becomes negative, bottom becomes positive
  particleSys.setPhysicsState(10.0, 0.5, 25.0, 'hole');
  assert.strictEqual(topSprites[0].material.map, minusTex, 'V_H > 0 top must be negative');
  assert.strictEqual(bottomSprites[0].material.map, plusTex, 'V_H > 0 bottom must be positive');

  // 3. "中间平两边弯" (Flat in middle, curved at ends) Kinematics Invariant
  // Verify that particles in middle region (|x| <= 0.38 halfL) have flat horizontal deflection
  particleSys.setPhysicsState(10.0, 0.5, -25.0, 'electron');
  const posArr = (particleSys as any).positions as Float32Array;
  const halfL = (particleSys as any).waferLength * 0.46;
  const phases = (particleSys as any).thermalPhases as Float32Array;
  phases[0] = 0;
  phases[1] = 0;
  phases[2] = 0;
  (particleSys as any).baseOffsetsY[0] = 0;
  (particleSys as any).baseOffsetsY[1] = 0;
  (particleSys as any).baseOffsetsY[2] = 0;

  // Place test particles: 0 at x=0 (middle), 1 at x=0.15*halfL (middle), 2 at x=0.95*halfL (near end)
  posArr[0] = 0;
  posArr[3] = 0.15 * halfL;
  posArr[6] = 0.95 * halfL;
  posArr[1] = 0;
  posArr[4] = 0;
  posArr[7] = 0;

  // Run simulation ticks to reach steady-state streamlines
  for (let t = 0; t < 10; t++) {
    particleSys.update(0.016);
  }

  // Particle 0 (near center) and Particle 1 (inside flat region |x| <= 0.38*halfL) must be flat
  const diffMiddleY = Math.abs(posArr[1] - posArr[4]);
  assert.ok(diffMiddleY < 0.002, `Middle streamline must be completely flat, diff: ${diffMiddleY}`);

  // Prominent deflection verification: central carriers must deflect strongly under nominal B=0.5T, I=10mA
  assert.ok(posArr[1] < -0.020, `Central carrier deflection must be prominent, posArr[1]: ${posArr[1]}`);

  // Particle 2 (at x=0.95*halfL) must be curved (significantly less deflected than middle)
  const diffEndY = Math.abs(posArr[1] - posArr[7]);
  assert.ok(diffEndY > 0.005, `End streamline must be noticeably curved compared to middle, diff: ${diffEndY}`);

  // 3b. Deflection amplitude invariance with Current I vs sensitivity to Magnetic Field B:
  // Carrier deflection amplitude (tanθ_H = μB) depends strictly on B, not on I.
  // First, let system fully relax to steady state under B = 0.2T, I = 5mA
  particleSys.setPhysicsState(5.0, 0.2, -5.0, 'electron');
  posArr[0] = 0;
  posArr[1] = 0;
  for (let t = 0; t < 50; t++) {
    posArr[0] = 0; // maintain center longitudinal position
    particleSys.update(0.016);
  }
  const deflAt5mA = posArr[1];

  // Now change current to I = 25mA at the same B = 0.2T
  particleSys.setPhysicsState(25.0, 0.2, -25.0, 'electron');
  for (let t = 0; t < 50; t++) {
    posArr[0] = 0;
    particleSys.update(0.016);
  }
  const deflAt25mA = posArr[1];
  assert.ok(
    Math.abs(deflAt25mA - deflAt5mA) < 0.002,
    `Carrier deflection amplitude must remain invariant when current changes (5mA: ${deflAt5mA}, 25mA: ${deflAt25mA})`
  );

  // Increasing magnetic field to B = 0.5T must significantly increase deflection amplitude
  particleSys.setPhysicsState(25.0, 0.5, -62.5, 'electron');
  for (let t = 0; t < 50; t++) {
    posArr[0] = 0;
    particleSys.update(0.016);
  }
  const deflAt05T = posArr[1];
  assert.ok(
    deflAt05T < deflAt25mA - 0.003,
    `Carrier deflection amplitude must increase with magnetic field strength B (0.2T: ${deflAt25mA}, 0.5T: ${deflAt05T})`
  );

  particleSys.dispose();

  // 4. Magnetic Flux Arrows: depend SOLELY on B with raised 11 arrow upper limit
  const bench = new HallBenchMesh();
  const arrowMeshes = (bench as any).fluxArrowMeshes as { group: THREE.Group; cone: THREE.Mesh }[];

  // B = 0 -> 0 arrows
  bench.updateTelemetry(0, 10.0, 0, 'n-GaAs', 'electron');
  assert.strictEqual((bench as any).fluxArrowsGroup.visible, false, 'B = 0 must hide arrows');

  // B = 0.1 T -> 1 arrow
  bench.updateTelemetry(0.1, 10.0, -5.0, 'n-GaAs', 'electron');
  let visibleArrows = arrowMeshes.filter(a => a.group.visible).length;
  assert.strictEqual(visibleArrows, 1, 'B = 0.1T should have 1 arrow');

  // B = 0.2 T -> 3 arrows
  bench.updateTelemetry(0.2, 10.0, -10.0, 'n-GaAs', 'electron');
  visibleArrows = arrowMeshes.filter(a => a.group.visible).length;
  assert.strictEqual(visibleArrows, 3, 'B = 0.2T should have 3 arrows');

  // B = 0.5 T -> 7 arrows
  bench.updateTelemetry(0.5, 10.0, -25.0, 'n-GaAs', 'electron');
  visibleArrows = arrowMeshes.filter(a => a.group.visible).length;
  assert.strictEqual(visibleArrows, 7, 'B = 0.5T should have 7 arrows');

  // B = 0.75 T -> 9 arrows
  bench.updateTelemetry(0.75, 10.0, -37.5, 'n-GaAs', 'electron');
  visibleArrows = arrowMeshes.filter(a => a.group.visible).length;
  assert.strictEqual(visibleArrows, 9, 'B = 0.75T should have 9 arrows');

  // B = 0.95 T -> 11 arrows (raised upper limit)
  bench.updateTelemetry(0.95, 10.0, -47.5, 'n-GaAs', 'electron');
  visibleArrows = arrowMeshes.filter(a => a.group.visible).length;
  assert.strictEqual(visibleArrows, 11, 'B = 0.95T should have 11 arrows (raised upper limit)');

  // Crucial test: Changing Current I from 10 mA to 50 mA does NOT change magnetic arrows!
  bench.updateTelemetry(0.95, 50.0, -237.5, 'n-GaAs', 'electron');
  const arrowsAfterIChange = arrowMeshes.filter(a => a.group.visible).length;
  assert.strictEqual(arrowsAfterIChange, 11, 'Changing Current I must NOT alter magnetic field arrows');

  // Changing thickness d does NOT change magnetic arrows!
  bench.updateTelemetry(0.95, 50.0, -475.0, 'n-GaAs', 'electron', 1.25e21, 0.2);
  const arrowsAfterDChange = arrowMeshes.filter(a => a.group.visible).length;
  assert.strictEqual(arrowsAfterDChange, 11, 'Changing thickness d must NOT alter magnetic field arrows');

  // Changing material does NOT change magnetic arrows!
  bench.updateTelemetry(0.95, 50.0, 0.001, 'copper', 'metal');
  const arrowsAfterMatChange = arrowMeshes.filter(a => a.group.visible).length;
  assert.strictEqual(arrowsAfterMatChange, 11, 'Changing material must NOT alter magnetic field arrows');

  // Reversing field polarity: B = -0.5 T -> arrows point opposite direction
  bench.updateTelemetry(-0.5, 10.0, 25.0, 'n-GaAs', 'electron');
  assert.strictEqual(arrowMeshes.filter(a => a.group.visible).length, 7, 'B = -0.5T has 7 arrows');
  assert.ok(arrowMeshes[0].cone.position.z < 0, 'Reversing B must invert arrow cone Z position');

  bench.dispose();
  console.log('✓ Test 12 passed: Dynamic multi-charge scaling (max 11), flat-middle curved-ends kinematics, and B-only magnetic arrow kinetics (max 11) verified');
}

// ================= Test 13: iPad Touch Screen Slider Scrubber & Pointer Lock Invariants =================
console.log('Test 13: iPad Touch Screen Slider Scrubber & Pointer Lock Invariants');
{
  let notifiedB = 0;
  const card = new HallStatusCard({
    onMagFieldChange: (b) => { notifiedB = b; },
  });
  card.setVisible(true);

  const sliderB = (card as any).sliderB as any;
  assert.ok(sliderB, 'Slider B element exists');

  // Initial sync
  card.updateTelemetry({ magFieldTesla: 0.5 });
  assert.strictEqual(sliderB.value, '0.5');

  sliderB.min = '-2.00';
  sliderB.max = '2.00';
  sliderB.step = '0.02';

  // Mock getBoundingClientRect
  sliderB.getBoundingClientRect = () => ({
    left: 100,
    width: 200,
    top: 50,
    height: 40,
    right: 300,
    bottom: 90,
  });

  // 1. Simulate iPad Touch / Pointer Down at 75% across the slider (min -2.0, max 2.0 -> ratio 0.75 -> 1.0 T)
  // clientX = 100 + 200 * 0.75 = 250
  sliderB.dispatchEvent({
    type: 'pointerdown',
    pointerId: 1,
    pointerType: 'touch',
    clientX: 250,
  } as any);

  assert.strictEqual(sliderB.value, '1', 'Touch down at 75% sets value to +1.0T');
  assert.strictEqual(notifiedB, 1, 'Callback notified of touch change');

  // 2. While finger is down on iPad (activeSliders has slider.id), background telemetry fires at 60 FPS
  // In the real bug, activeElement on iPad was NOT the slider, causing telemetry to wipe out user touch!
  card.updateTelemetry({ magFieldTesla: 0.5 });
  assert.strictEqual(sliderB.value, '1', 'Background telemetry must NOT overwrite slider while touch is active');

  // 3. Pointer move on iPad to 25% (clientX = 150 -> ratio 0.25 -> -1.0 T)
  sliderB.dispatchEvent({
    type: 'pointermove',
    pointerId: 1,
    pointerType: 'touch',
    clientX: 150,
  } as any);

  assert.strictEqual(sliderB.value, '-1', 'Touch move scrubs value smoothly to -1.0T');
  assert.strictEqual(notifiedB, -1);

  // 4. Pointer up releases the active lock
  sliderB.dispatchEvent({
    type: 'pointerup',
    pointerId: 1,
    pointerType: 'touch',
  } as any);

  // 5. Subsequent telemetry updates now sync cleanly
  card.updateTelemetry({ magFieldTesla: 1.5 });
  assert.strictEqual(sliderB.value, '1.5', 'After touch release, external telemetry syncs cleanly');

  console.log('✓ Test 13 passed: iPad touch screen slider scrubber & pointer lock invariants verified');
}

// ================= Test 14: Vision Pro Hand Tracking Continuous Pinch Gesture Dragging & HUD Invariants =================
console.log('Test 14: Vision Pro Hand Tracking Continuous Pinch Gesture Dragging & HUD Invariants');
{
  let notifiedB = 0;
  const card = new HallStatusCard({
    onMagFieldChange: (b) => { notifiedB = b; },
  });
  card.setVisible(true);

  const sliderB = (card as any).sliderB as any;
  const drawerEl = (card as any).drawerEl as any;
  const dragHud = (card as any).dragHud as any;
  const hudValText = (card as any).hudValText as any;
  const hudBarFill = (card as any).hudBarFill as any;
  const drawerValB = (card as any).drawerValB as any;
  const tokenValB = (card as any).tokenValB as any;

  assert.ok(sliderB, 'Slider B exists');
  assert.ok(dragHud, 'Drag HUD element exists');
  assert.ok(hudValText, 'HUD value text element exists');

  sliderB.min = '-2.00';
  sliderB.max = '2.00';
  sliderB.step = '0.02';

  sliderB.getBoundingClientRect = () => ({
    left: 100,
    width: 200,
    top: 50,
    height: 40,
    right: 300,
    bottom: 90,
  });

  if (drawerEl) {
    drawerEl.getBoundingClientRect = () => ({
      left: 50,
      width: 500,
      top: 30,
      height: 100,
      right: 550,
      bottom: 130,
    });
  }

  // 1. Hand tracking right hand pinch start (VisionProCursor dispatches pointerdown with buttons: 1, pointerType: 'mouse')
  // Cursor pinches at midpoint clientX = 200 (min -2.0, max 2.0 -> 0.00 T)
  sliderB.dispatchEvent({
    type: 'pointerdown',
    pointerType: 'mouse',
    button: 0,
    buttons: 1,
    clientX: 200,
  } as any);

  assert.ok(sliderB.classList.contains('is-pinching'), 'Slider must gain .is-pinching class on pinch down');
  assert.strictEqual((card as any).activeSliders.has('slider-hall-b'), true, 'Slider must be registered in activeSliders');
  assert.strictEqual(sliderB.value, '0', 'Initial pinch down at 50% sets value to 0.00 T');
  assert.strictEqual(notifiedB, 0, 'Callback notified of pinch down value');
  assert.strictEqual(dragHud.style.display, 'block', 'HUD bubble must become visible during pinch');
  assert.strictEqual(dragHud.style.opacity, '1', 'HUD bubble opacity must be 1 during pinch');
  assert.strictEqual(hudValText.textContent, '+0.00 T', 'HUD value text must show formatted +0.00 T');
  assert.strictEqual(drawerValB.textContent, '+0.00 T', 'Drawer value must update synchronously');
  assert.strictEqual(tokenValB.textContent, '+0.0 T', 'Formula token value must update synchronously');

  // 2. Hand tracking continuous pinch drag: user moves hand right in 3D air space (clientX = 260 -> ratio 0.80 -> +1.20 T)
  // VisionProCursor dispatches pointermove / mousemove with buttons: 1 to window / target
  (global as any).window.dispatchEvent({
    type: 'pointermove',
    clientX: 260,
  } as any);

  assert.strictEqual(sliderB.value, '1.2', 'Continuous pinch drags value smoothly to +1.20 T');
  assert.strictEqual(notifiedB, 1.2, 'Callback receives scrubbed value');
  assert.strictEqual(hudValText.textContent, '+1.20 T', 'HUD updates to +1.20 T');
  assert.strictEqual(drawerValB.textContent, '+1.20 T', 'Drawer text updates to +1.20 T');
  assert.strictEqual(hudBarFill.style.width, '80.0%', 'HUD gauge fill reflects 80%');

  // 3. 60 FPS background physics telemetry update must NOT overwrite the slider while pinched
  card.updateTelemetry({ magFieldTesla: -0.5 });
  assert.strictEqual(sliderB.value, '1.2', 'Background telemetry must be blocked during continuous pinch');

  // 4. User hand drifts left in air (clientX = 120 -> ratio 0.10 -> -1.60 T)
  (global as any).window.dispatchEvent({
    type: 'mousemove',
    clientX: 120,
    buttons: 1,
  } as any);

  assert.strictEqual(sliderB.value, '-1.6', 'Continuous pinch drags value smoothly to -1.60 T');
  assert.strictEqual(notifiedB, -1.6, 'Callback receives -1.60 T');
  assert.strictEqual(hudValText.textContent, '-1.60 T', 'HUD updates to -1.60 T');
  assert.strictEqual(drawerValB.textContent, '-1.60 T', 'Drawer text updates to -1.60 T');
  assert.strictEqual(hudBarFill.style.width, '10.0%', 'HUD gauge fill reflects 10%');

  // 5. User releases pinch (VisionProCursor dispatches pointerup / mouseup to window / target)
  (global as any).window.dispatchEvent({
    type: 'pointerup',
  } as any);

  assert.strictEqual(sliderB.classList.contains('is-pinching'), false, 'Slider must lose .is-pinching on pinch release');
  assert.strictEqual((card as any).activeSliders.has('slider-hall-b'), false, 'activeSliders must release slider lock');
  assert.strictEqual(dragHud.style.display, 'none', 'HUD bubble must hide on pinch release');

  // 6. After release, background telemetry updates sync cleanly again
  card.updateTelemetry({ magFieldTesla: 0.8 });
  assert.strictEqual(sliderB.value, '0.8', 'Telemetry syncs smoothly after pinch release');

  console.log('✓ Test 14 passed: Vision Pro continuous pinch gesture dragging, HUD bubble, and active lock verified');
}

console.log('\n========================================================');
console.log('All Electromagnetism Hall Effect Tests Passed (14/14)!');
console.log('========================================================');

