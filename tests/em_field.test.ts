import assert from 'node:assert';
import * as THREE from 'three';
import {
  COULOMB_K,
  DEFAULT_CHARGE_ELEVATION,
  electricDipoleMoment,
  electricFieldAt,
  evaluateTestCharge,
  FIELD_PRESETS,
  potentialAt,
  sampleVectorGrid,
  totalPotentialEnergy,
  traceFieldLines,
  type PointCharge,
  type TestChargeState,
  type Vector3D,
} from '../src/physics/em/electrostatic.ts';
import { FieldBenchMesh } from '../src/scene/em/FieldBenchMesh.ts';
import EmFieldExperiment from '../src/experiments/catalog/em-field/index.ts';
import { FieldStatusCard, type FieldCommand } from '../src/ui/vision/FieldStatusCard.ts';
import { PhysicsDisciplineModal } from '../src/ui/vision/PhysicsDisciplineModal.ts';

// Lightweight DOM mock for Node.js test runner
class MockElement {
  public tagName: string;
  public className = '';
  public innerHTML = '';
  public textContent = '';
  public value = '';
  public disabled = false;
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
      clearRect: () => {},
      fillRect: () => {},
      strokeRect: () => {},
      beginPath: () => {},
      moveTo: () => {},
      lineTo: () => {},
      arc: () => {},
      stroke: () => {},
      fill: () => {},
      fillText: () => {},
      createRadialGradient: () => ({ addColorStop: () => {} }),
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

(global as any).document = {
  createElement: (tag: string) => new MockElement(tag),
  body: new MockElement('body'),
  activeElement: null,
};
(global as any).window = { innerWidth: 800, innerHeight: 800 };

const testCamera = new THREE.PerspectiveCamera(50, 1, 0.1, 50);
testCamera.position.set(0, 1.38, 4.25);
testCamera.lookAt(0, 1.0, 0.88);
testCamera.updateMatrixWorld(true);

const ctx = {
  scene: new THREE.Scene(),
  camera: testCamera,
} as any;

console.log('=== Starting Electrostatic Field & Superposition Verification ===\n');

// ================= Test 1: Coulomb's Law & Inverse-Square Falloff =================
console.log('Test 1: Coulomb\'s Law & Inverse-Square Falloff (E ∝ 1/r², V ∝ 1/r)');
{
  const qVal = 2.0; // 2 µC
  const charges: PointCharge[] = [{ id: 'q1', x: 0, y: 0, z: 0, q: qVal }];

  const r1 = 0.1; // 0.1 m
  const r2 = 0.2; // 0.2 m

  const f1 = electricFieldAt({ x: r1, y: 0, z: 0 }, charges, 0.0);
  const f2 = electricFieldAt({ x: r2, y: 0, z: 0 }, charges, 0.0);

  // E = k * q / r²
  const expectedE1 = (COULOMB_K * (qVal * 1e-6)) / (r1 * r1);
  const expectedE2 = (COULOMB_K * (qVal * 1e-6)) / (r2 * r2);

  assert.ok(Math.abs(f1.x - expectedE1) / expectedE1 < 0.001, `E(0.1m) matches theory: ${f1.x} vs ${expectedE1}`);
  assert.ok(Math.abs(f2.x - expectedE2) / expectedE2 < 0.001, `E(0.2m) matches theory: ${f2.x} vs ${expectedE2}`);

  // Inverse-square ratio: E(r1) / E(r2) = (r2 / r1)² = 4
  const ratio = f1.x / f2.x;
  assert.ok(Math.abs(ratio - 4.0) < 0.005, `Inverse square law ratio should be 4.0, got ${ratio}`);

  // Potential: V = k * q / r
  const v1 = potentialAt({ x: r1, y: 0, z: 0 }, charges, 0.0);
  const v2 = potentialAt({ x: r2, y: 0, z: 0 }, charges, 0.0);
  const expectedV1 = (COULOMB_K * (qVal * 1e-6)) / r1;
  const expectedV2 = (COULOMB_K * (qVal * 1e-6)) / r2;

  assert.ok(Math.abs(v1 - expectedV1) / expectedV1 < 0.001, `V(0.1m) matches theory: ${v1} vs ${expectedV1}`);
  assert.ok(Math.abs(v2 - expectedV2) / expectedV2 < 0.001, `V(0.2m) matches theory: ${v2} vs ${expectedV2}`);
  assert.ok(Math.abs(v1 / v2 - 2.0) < 0.005, `Potential linear falloff ratio should be 2.0, got ${v1 / v2}`);

  console.log('✓ Test 1 passed: Coulomb\'s law and inverse-square falloff verified');
}

// ================= Test 2: Electrostatic Superposition Principle =================
console.log('Test 2: Electrostatic Superposition Principle for Multiple Charges');
{
  // 1. Two like positive charges: +2 µC at (-0.1, 0) and +2 µC at (+0.1, 0)
  const likeCharges: PointCharge[] = [
    { id: 'q1', x: -0.1, y: 0, z: 0, q: 2.0 },
    { id: 'q2', x: 0.1, y: 0, z: 0, q: 2.0 },
  ];

  // At the midpoint (0, 0, 0), fields cancel out: E = E1 + E2 = 0
  const eMidLike = electricFieldAt({ x: 0, y: 0, z: 0 }, likeCharges, 0.0);
  const magMidLike = Math.hypot(eMidLike.x, eMidLike.y, eMidLike.z);
  assert.ok(magMidLike < 1e-6, `Midpoint between like charges must have null field E=0, got ${magMidLike}`);

  // Potential at midpoint must be double a single charge
  const vMidLike = potentialAt({ x: 0, y: 0, z: 0 }, likeCharges, 0.0);
  const singleV = potentialAt({ x: 0, y: 0, z: 0 }, [likeCharges[0]], 0.0);
  assert.ok(Math.abs(vMidLike - 2 * singleV) < 1e-6, 'Potential superposes additively: V_total = V1 + V2');

  // 2. Electric Dipole: +2 µC at (-0.1, 0) and -2 µC at (+0.1, 0)
  const dipole: PointCharge[] = [
    { id: 'q1', x: -0.1, y: 0, z: 0, q: 2.0 },
    { id: 'q2', x: 0.1, y: 0, z: 0, q: -2.0 },
  ];

  // Potential at midpoint and along perpendicular bisector (x=0) must be identically 0
  const vMidDipole = potentialAt({ x: 0, y: 0, z: 0 }, dipole, 0.0);
  assert.ok(Math.abs(vMidDipole) < 1e-6, `Dipole neutral plane potential must be 0, got ${vMidDipole}`);
  const vYDipole = potentialAt({ x: 0, y: 0.15, z: 0 }, dipole, 0.0);
  assert.ok(Math.abs(vYDipole) < 1e-6, `Dipole bisector potential must be 0, got ${vYDipole}`);

  // Field at midpoint must be twice the single charge field pointing towards +x (from + to -)
  const eMidDipole = electricFieldAt({ x: 0, y: 0, z: 0 }, dipole, 0.0);
  assert.ok(eMidDipole.x > 0, 'Dipole midpoint field must point along +x (from + to -)');
  assert.ok(Math.abs(eMidDipole.y) < 1e-6 && Math.abs(eMidDipole.z) < 1e-6);
  assert.ok(Math.abs(eMidDipole.x - 2 * singleV / 0.1) < 1e-2, 'Dipole midpoint E_x matches 2 * k*q / d²');

  console.log('✓ Test 2 passed: Electrostatic superposition principle verified');
}

// ================= Test 3: Dipole Moment & Far-Field Scaling =================
console.log('Test 3: Electric Dipole Moment & Far-Field 1/r³ Scaling');
{
  const qVal = 2.0; // 2 µC
  const d = 0.2; // 0.2 m distance
  const dipole: PointCharge[] = [
    { id: 'q1', x: -d / 2, y: 0, z: 0, q: qVal },
    { id: 'q2', x: d / 2, y: 0, z: 0, q: -qVal },
  ];

  const p = electricDipoleMoment(dipole);
  // p = q * (-d/2) + (-q) * (d/2) => magnitude q * d
  const expectedP = qVal * d;
  assert.ok(Math.abs(p.magnitude - expectedP) < 1e-5, `Dipole moment magnitude ${p.magnitude} vs ${expectedP}`);

  // Far-field on the perpendicular bisector (x=0, y=r >> d):
  // E_bisector ≈ k * p / r³
  const rFar1 = 2.0; // 2.0 m
  const rFar2 = 4.0; // 4.0 m
  const eFar1 = electricFieldAt({ x: 0, y: rFar1, z: 0 }, dipole, 0.0);
  const eFar2 = electricFieldAt({ x: 0, y: rFar2, z: 0 }, dipole, 0.0);

  const mag1 = Math.hypot(eFar1.x, eFar1.y);
  const mag2 = Math.hypot(eFar2.x, eFar2.y);
  const farRatio = mag1 / mag2;
  // (rFar2 / rFar1)³ = 2³ = 8.0
  assert.ok(Math.abs(farRatio - 8.0) < 0.1, `Far field falloff ratio must be ~8.0, got ${farRatio}`);

  console.log('✓ Test 3 passed: Dipole moment & far-field 1/r³ scaling verified');
}

// ================= Test 4: Electrostatic Potential Energy =================
console.log('Test 4: Electrostatic Potential Energy (U)');
{
  // Opposite charges attract: U < 0 (bound state)
  const unlikeCharges: PointCharge[] = [
    { id: 'q1', x: -0.1, y: 0, z: 0, q: 2.0 },
    { id: 'q2', x: 0.1, y: 0, z: 0, q: -2.0 },
  ];
  const uAttract = totalPotentialEnergy(unlikeCharges);
  assert.ok(uAttract < 0, `Potential energy of opposite charges must be negative, got ${uAttract}`);

  // Theoretical U = (COULOMB_K * 1e-12) * (2.0 * -2.0) / 0.2 ≈ -0.17975 J
  const expectedU = (COULOMB_K * 1e-12 * 2.0 * -2.0) / 0.2;
  assert.ok(Math.abs(uAttract - expectedU) < 1e-5, `U matches analytical formula: ${uAttract} vs ${expectedU}`);

  // Like charges repel: U > 0
  const likeCharges: PointCharge[] = [
    { id: 'q1', x: -0.1, y: 0, z: 0, q: 2.0 },
    { id: 'q2', x: 0.1, y: 0, z: 0, q: 2.0 },
  ];
  const uRepel = totalPotentialEnergy(likeCharges);
  assert.ok(uRepel > 0, `Potential energy of like charges must be positive, got ${uRepel}`);
  assert.ok(Math.abs(uRepel + expectedU) < 1e-5, 'Like charge energy has opposite sign of unlike');

  console.log('✓ Test 4 passed: Electrostatic potential energy verified');
}

// ================= Test 5: RK4 Field Line Numerical Tracing =================
console.log('Test 5: RK4 Field Line Numerical Tracing & Continuity');
{
  const dipole: PointCharge[] = [
    { id: 'q1', x: -0.1, y: 0, z: 0, q: 2.0 },
    { id: 'q2', x: 0.1, y: 0, z: 0, q: -2.0 },
  ];

  const lines = traceFieldLines(dipole, { linesPerUnitCharge: 8, bounds: 0.4 });
  assert.ok(lines.length >= 12, `Must trace at least 12 field lines, got ${lines.length}`);

  // Verify that lines begin near the positive charge
  let capturedByNegative = 0;
  for (const line of lines) {
    const pStart = line.points[0];
    const pEnd = line.points[line.points.length - 1];

    if (line.sourceChargeId === 'q1') {
      const distStart = Math.hypot(pStart.x - dipole[0].x, pStart.y - dipole[0].y);
      assert.ok(distStart < 0.05, `Line must start near positive charge: ${distStart}`);
    }

    // Check if line terminates on negative charge
    const distEndToNeg = Math.hypot(pEnd.x - dipole[1].x, pEnd.y - dipole[1].y);
    if (distEndToNeg < 0.05) {
      capturedByNegative++;
    }
  }

  // In a dipole, a significant fraction of lines should terminate on negative charge
  assert.ok(capturedByNegative > 0, `At least some lines must terminate on negative charge: ${capturedByNegative}`);

  // Test isolated negative charge: lines should come inward from boundary
  const singleNeg: PointCharge[] = [{ id: 'q_neg', x: 0, y: 0, z: 0, q: -2.0 }];
  const negLines = traceFieldLines(singleNeg, { linesPerUnitCharge: 6, bounds: 0.35 });
  assert.ok(negLines.length >= 6, `Isolated negative charge must have inward lines, got ${negLines.length}`);
  for (const line of negLines) {
    const endPoint = line.points[line.points.length - 1];
    const dist = Math.hypot(endPoint.x, endPoint.y);
    assert.ok(dist < 0.04, `Line must terminate at negative charge core, got dist ${dist}`);
  }

  // Vector grid sampling
  const grid = sampleVectorGrid(dipole, 9, 0.3);
  assert.ok(grid.length > 50, `Grid must generate samples, got ${grid.length}`);
  for (const sample of grid) {
    assert.ok(!Number.isNaN(sample.magnitude), 'Sample magnitude must be valid number');
    assert.ok(sample.magnitude >= 0, 'Magnitude must be non-negative');
  }

  console.log('✓ Test 5 passed: RK4 field line tracing and vector grid verified');
}

// ================= Test 6: Dynamic Charge Modification & Presets =================
console.log('Test 6: Dynamic Charge Addition, Drag, Magnitude Scaling, and Deletion');
{
  const exp = new EmFieldExperiment();
  exp.init(ctx);

  // Default dipole preset has 2 charges
  let telem = exp.getTelemetry();
  assert.strictEqual(telem.chargeCount, 2);
  assert.ok(Math.abs(telem.totalChargeMicroC) < 1e-5, 'Dipole net charge must be 0');

  // Add positive charge
  exp.addCharge(3.0, 0.0, 0.1);
  telem = exp.getTelemetry();
  assert.strictEqual(telem.chargeCount, 3);
  assert.ok(Math.abs(telem.totalChargeMicroC - 3.0) < 1e-5, 'Net charge should now be +3 µC');

  // Select and modify magnitude
  assert.ok(telem.selectedChargeId !== null);
  exp.setSelectedChargeMagnitude(5.0);
  telem = exp.getTelemetry();
  assert.strictEqual(telem.selectedChargeValue, 5.0);

  // Move charge
  const targetId = telem.selectedChargeId!;
  exp.moveCharge(targetId, 0.15, 0.15);
  telem = exp.getTelemetry();
  assert.strictEqual(telem.chargeCount, 3);

  // Remove charge
  exp.removeCharge(targetId);
  telem = exp.getTelemetry();
  assert.strictEqual(telem.chargeCount, 2);

  // Switch to Quadrupole preset
  exp.loadPreset('quadrupole');
  telem = exp.getTelemetry();
  assert.strictEqual(telem.chargeCount, 4);
  assert.ok(Math.abs(telem.totalChargeMicroC) < 1e-5, 'Quadrupole net charge must be 0');

  // Pointer drag test via onPointerDown, onPointerMove, onPointerUp
  exp.loadPreset('dipole');
  const q1Before = (exp as any).charges.find((c: any) => c.id === 'q1');
  const origX = q1Before.x;

  // Simulate pointer down directly on q1
  const handledDown = exp.onPointerDown({ clientX: 345, clientY: 352 } as any, null, ctx);
  assert.ok(handledDown, 'Pointer down within reach of charge must be handled');

  // Move pointer to the right
  exp.onPointerMove({ clientX: 420, clientY: 352 } as any, null, ctx);
  const q1After = (exp as any).charges.find((c: any) => c.id === 'q1');
  assert.notStrictEqual(q1After.x, origX, 'Pointer move must update charge x position');

  // Pointer up
  exp.onPointerUp({ clientX: 420, clientY: 352 } as any, ctx);
  assert.strictEqual((exp as any).interaction.dragTarget, null, 'Pointer up must release drag target');

  // Clear all
  exp.clearCharges();
  telem = exp.getTelemetry();
  assert.strictEqual(telem.chargeCount, 0);
  assert.strictEqual(telem.totalChargeMicroC, 0);

  exp.dispose(ctx);
  console.log('✓ Test 6 passed: Interactive experiment charge manipulation and pointer drag verified');
}

// ================= Test 7: 3D Scene Assembly & Lifecycle =================
console.log('Test 7: 3D FieldBenchMesh Assembly, Sync & Disposal');
{
  const bench = new FieldBenchMesh();
  assert.ok(bench.group.children.length >= 4, 'FieldBench must contain platform, groups, and selection ring');
  assert.strictEqual(bench.platform.name, 'FieldPlatform');

  const charges = FIELD_PRESETS.dipole.charges;
  const lines = traceFieldLines(charges, { linesPerUnitCharge: 8 });

  bench.sync({
    charges,
    lines,
    telemetry: {
      chargeCount: 2,
      totalChargeMicroC: 0,
      dipoleMomentMagnitude: 0.48,
      dipoleMomentVector: { x: 0.48, y: 0, z: 0 },
      potentialEnergyJoules: -0.045,
      fieldLineCount: lines.length,
      selectedChargeId: 'q1',
      selectedChargeValue: 2.0,
    },
    selectedChargeId: 'q1',
    showLines: true,
    showFlow: true,
  });

  assert.strictEqual(bench.chargesGroup.children.length, 2, 'Must instantiate 2 charge meshes');
  assert.strictEqual(bench.selectionRing.visible, true, 'Selection ring must be visible when charge selected');

  // Test flow animation
  bench.updateFlow(0.016, lines);

  bench.dispose();
  assert.strictEqual(bench.chargesGroup.children.length, 0, 'Disposal must clean up charges');
  console.log('✓ Test 7 passed: 3D scene assembly, sync, and disposal verified');
}

// ================= Test 8: VisionOS FieldStatusCard UI & Event Binding =================
console.log('Test 8: VisionOS FieldStatusCard UI & Event Binding');
{
  const commands: FieldCommand[] = [];
  const card = new FieldStatusCard((cmd) => commands.push(cmd));
  card.setVisible(true);

  // Verify removed blocks are completely deleted
  assert.strictEqual(card.element.innerHTML.includes('field-seg-bar'), false, 'Presets segmented bar must be removed');
  assert.strictEqual(card.element.innerHTML.includes('field-preset-dipole'), false, 'Preset buttons must be removed');
  assert.strictEqual(card.element.innerHTML.includes('field-toggle-lines'), false, 'Line toggle must be removed');
  assert.strictEqual(card.element.innerHTML.includes('field-density-slider'), false, 'Density slider must be removed');

  // Dispatch add positive charge click
  card.element.querySelector('#field-btn-add-pos').dispatchEvent({ type: 'click' });
  assert.strictEqual(commands[commands.length - 1].type, 'addCharge');
  assert.strictEqual((commands[commands.length - 1] as any).q, 2.0);

  // Dispatch add negative charge click
  card.element.querySelector('#field-btn-add-neg').dispatchEvent({ type: 'click' });
  assert.strictEqual(commands[commands.length - 1].type, 'addCharge');
  assert.strictEqual((commands[commands.length - 1] as any).q, -2.0);

  // Dispatch delete selected click
  card.element.querySelector('#field-btn-del').dispatchEvent({ type: 'click' });
  assert.strictEqual(commands[commands.length - 1].type, 'removeCharge');

  // Dispatch clear click
  card.element.querySelector('#field-btn-clear').dispatchEvent({ type: 'click' });
  assert.strictEqual(commands[commands.length - 1].type, 'clearCharges');

  // Dispatch reset click
  card.element.querySelector('#field-btn-reset').dispatchEvent({ type: 'click' });
  assert.strictEqual(commands[commands.length - 1].type, 'reset');

  // Test telemetry DOM binding
  card.updateTelemetry({
    chargeCount: 2,
    totalChargeMicroC: 1.5,
    dipoleMomentMagnitude: 0.3,
    dipoleMomentVector: { x: 0.3, y: 0, z: 0 },
    potentialEnergyJoules: -0.02,
    fieldLineCount: 24,
    selectedChargeId: 'q1',
    selectedChargeValue: 1.5,
  });

  assert.strictEqual(card.element.querySelector('#field-qnet').textContent, '1.50 µC');
  assert.strictEqual(card.element.querySelector('#field-u').textContent, '-20.00 mJ');
  assert.strictEqual(card.element.querySelector('#field-count').textContent, '电荷总数 N = 2');

  console.log('✓ Test 8 passed: FieldStatusCard UI and event binding verified');
}

// ================= Test 9: Discipline Modal EM Branch Integration =================
console.log('Test 9: Physics Discipline Modal EM Branch Integration');
{
  let selected = '';
  const modal = new PhysicsDisciplineModal({
    onBackToDisciplines: () => {},
    onSelectExperiment: async (id) => { selected = id; },
  });

  modal.showLevel2('em');
  assert.ok(modal.element.innerHTML.includes('data-exp-id="em-field"'), 'em-field card must exist in modal');
  assert.ok(modal.element.innerHTML.includes('静电场探索与电力线叠加'), 'em-field name must be present');

  const cards = modal.element.querySelectorAll('.optics-card').filter((c) => c.getAttribute('data-exp-id'));
  const fieldCardEl = cards.find((c) => c.getAttribute('data-exp-id') === 'em-field');
  assert.ok(fieldCardEl, 'Found em-field card element');
  fieldCardEl?.dispatchEvent({ type: 'click' });
  assert.strictEqual(selected, 'em-field', 'Clicking card must select em-field');

  console.log('✓ Test 9 passed: Discipline modal EM branch integration verified');
}

// ================= Test 10: 60+ FPS Frame Budget Benchmark =================
console.log('Test 10: 60+ FPS Frame Budget Benchmark');
{
  const exp = new EmFieldExperiment();
  exp.init(ctx);

  const iterations = 300;
  const start = performance.now();
  for (let i = 0; i < iterations; i++) {
    exp.update(0.016, i * 0.016, ctx);
  }
  const totalMs = performance.now() - start;
  const avgFrameMs = totalMs / iterations;
  const fpsEquivalent = 1000 / avgFrameMs;

  console.log(`  Measured Average Frame Time: ${avgFrameMs.toFixed(4)} ms`);
  console.log(`  Equivalent Logic Frame Rate:  ${Math.round(fpsEquivalent)} FPS`);

  assert.ok(avgFrameMs < 0.25, `Frame time must be < 0.25ms for 60+ FPS budget, got ${avgFrameMs}ms`);
  assert.ok(fpsEquivalent > 4000, 'Logic execution rate must exceed 4000 FPS');

  exp.dispose(ctx);
  console.log('✓ Test 10 passed: 60+ FPS frame budget verified');
}

// ================= Test 11: 3D Volumetric Field Lines, Arrow Cones, and Clean Floating Charges =================
console.log('Test 11: 3D Volumetric Field Lines, Arrow Cones, and Clean Floating Charges');
{
  // 1. Presets default elevation check
  for (const [key, preset] of Object.entries(FIELD_PRESETS)) {
    for (const c of preset.charges) {
      assert.strictEqual(
        c.z,
        DEFAULT_CHARGE_ELEVATION,
        `Preset ${key} charge ${c.id} must have default elevation ${DEFAULT_CHARGE_ELEVATION}`,
      );
    }
  }

  // 2. 3D Volumetric Field Lines curvature
  const dipole = FIELD_PRESETS.dipole.charges;
  const lines3D = traceFieldLines(dipole, { linesPerUnitCharge: 12 });
  assert.ok(lines3D.length >= 16, `Must produce full 3D canopy lines, got ${lines3D.length}`);

  let hasElevatedPoints = false;
  let hasDepressedPoints = false;
  let minObservedZ = Infinity;
  let maxObservedZ = -Infinity;

  for (const line of lines3D) {
    for (const pt of line.points) {
      if (pt.z < minObservedZ) minObservedZ = pt.z;
      if (pt.z > maxObservedZ) maxObservedZ = pt.z;
      if (pt.z > DEFAULT_CHARGE_ELEVATION + 0.02) hasElevatedPoints = true;
      if (pt.z < DEFAULT_CHARGE_ELEVATION - 0.02) hasDepressedPoints = true;
    }
  }

  assert.ok(hasElevatedPoints, 'Streamlines must arch into 3D volume above charges (+Z)');
  assert.ok(hasDepressedPoints, 'Streamlines must arch symmetrically into depth behind charges (-Z)');
  assert.ok(
    maxObservedZ - minObservedZ > 0.08,
    `Volumetric vertical spread must exceed 0.08m, got ${maxObservedZ - minObservedZ}m`,
  );

  // 3. Clean floating charges and instanced arrow cones in 3D Mesh
  const bench = new FieldBenchMesh();
  bench.sync({
    charges: dipole,
    lines: lines3D,
    telemetry: {
      chargeCount: 2,
      totalChargeMicroC: 0,
      dipoleMomentMagnitude: 0.48,
      dipoleMomentVector: { x: 0.48, y: 0, z: 0 },
      potentialEnergyJoules: -0.045,
      fieldLineCount: lines3D.length,
      selectedChargeId: 'q1',
      selectedChargeValue: 2.0,
    },
    selectedChargeId: 'q1',
    showLines: true,
    showFlow: true,
  });

  const q1Mesh = bench.chargesGroup.getObjectByName('Charge_q1') as THREE.Group;
  assert.ok(q1Mesh, 'Charge_q1 mesh group must exist');

  const head = q1Mesh.getObjectByName('Head') as THREE.Group;
  assert.ok(head, 'Floating Head must exist in charge group');
  assert.strictEqual(head.position.z, DEFAULT_CHARGE_ELEVATION, 'Head must float at default elevation');
  assert.ok(head.getObjectByName('Core'), 'Charge core must exist');
  assert.ok(head.getObjectByName('Halo'), 'Glowing aura halo must exist');
  assert.strictEqual(head.getObjectByName('Sign'), undefined, 'Charge sign badge removed for pure sphere appearance');

  // Verify pure floating charges without clutter
  assert.strictEqual(q1Mesh.getObjectByName('GroundReticle'), undefined, 'No ground reticles cluttering empty space');
  assert.strictEqual(q1Mesh.getObjectByName('Tether'), undefined, 'No tether sticks cluttering empty space');

  // Verify Arrow Cones
  const conesMesh = (bench as any).arrowConesMesh as THREE.InstancedMesh;
  assert.ok(conesMesh, 'Instanced arrow cones mesh must exist');
  assert.ok(conesMesh.count > 0, `Arrow cones count must be > 0, got ${conesMesh.count}`);
  assert.ok(conesMesh.count <= 50, `Arrow cones must be disciplined and uncluttered, got ${conesMesh.count}`);
  assert.strictEqual(conesMesh.visible, true, 'Arrow cones must be visible when lines are visible');

  // Verify field line colors match charge colors
  const likePos = FIELD_PRESETS.likeCharges.charges;
  const likeLines = traceFieldLines(likePos, { linesPerUnitCharge: 6 });
  bench.sync({
    charges: likePos,
    lines: likeLines,
    telemetry: {
      chargeCount: 2,
      totalChargeMicroC: 4,
      dipoleMomentMagnitude: 0,
      dipoleMomentVector: { x: 0, y: 0, z: 0 },
      potentialEnergyJoules: 0.1,
      fieldLineCount: likeLines.length,
      selectedChargeId: 'q1',
      selectedChargeValue: 2.0,
    },
    selectedChargeId: 'q1',
    showLines: true,
  });

  // For like positive charges, color array must have red r=1.0 and blue b < 0.3
  const colArray = (bench as any).lineColArray as Float32Array;
  assert.ok(colArray[0] > 0.95, 'Like positive charges produce red field lines (r > 0.95)');
  assert.ok(colArray[2] < 0.35, 'Like positive charges produce red field lines (b < 0.35)');

  // Breathing animation alters head.position.z
  const initialZ = head.position.z;
  bench.update(1.5);
  assert.notStrictEqual(head.position.z, initialZ, 'Hover breathing animation must vary head position over time');

  bench.dispose();
  console.log('✓ Test 11 passed: 3D volumetric field lines, arrow cones, and clean floating charges verified');
}

// ================= Test 12: Test Charge (Probe q₀) Mechanics, Vector Arrow, Drag Interaction, and HUD Binding =================
console.log('Test 12: Test Charge (Probe q₀) Mechanics, Vector Arrow, Drag Interaction, and HUD Binding');
{
  // 1. Analytical Verification of evaluateTestCharge
  const qVal = 2.0; // 2 µC at origin
  const singleCharge: PointCharge[] = [{ id: 'q_center', x: 0, y: 0, z: 0, q: qVal }];
  const q0 = 0.001; // 0.001 µC = 1 nC
  const r = 0.15; // 0.15 m along +x

  const probe = evaluateTestCharge({ x: r, y: 0, z: 0 }, singleCharge, q0, 0.0);
  assert.ok(probe.visible, 'Probe must be visible');
  assert.strictEqual(probe.q0, q0, 'Probe charge must be 0.001 µC (1 nC)');

  // E = k * q / r²
  const expectedE = (COULOMB_K * (qVal * 1e-6)) / (r * r);
  assert.ok(Math.abs(probe.fieldMagnitude - expectedE) / expectedE < 0.001, `Probe E matches theory: ${probe.fieldMagnitude} vs ${expectedE}`);
  assert.ok(probe.fieldVector.x > 0 && Math.abs(probe.fieldVector.y) < 1e-6, 'Field vector points along +x');

  // F = (q0 * 1e-6) * E
  const expectedF = (q0 * 1e-6) * expectedE;
  assert.ok(Math.abs(probe.forceMagnitude - expectedF) / expectedF < 0.001, `Probe force F = q0 * E matches theory: ${probe.forceMagnitude} vs ${expectedF}`);
  assert.ok(probe.forceVector.x > 0, 'Force on positive test charge points along field (+x)');

  // V = k * q / r
  const expectedV = (COULOMB_K * (qVal * 1e-6)) / r;
  assert.ok(Math.abs(probe.potential - expectedV) / expectedV < 0.001, `Probe V matches theory: ${probe.potential} vs ${expectedV}`);

  // 2. Experiment Test Charge State & Pointer Dragging
  const exp = new EmFieldExperiment();
  exp.init(ctx);

  const initialTelem = exp.getTelemetry();
  assert.ok(initialTelem.testCharge, 'Telemetry must contain testCharge state');
  assert.strictEqual(initialTelem.testCharge?.x, 0.0, 'Initial probe x must be 0.0');
  assert.strictEqual(initialTelem.testCharge?.y, 0.16, 'Initial probe y must be 0.16');

  // Direct moveTestCharge API
  exp.moveTestCharge(0.18, -0.12);
  const movedTelem = exp.getTelemetry();
  assert.strictEqual(movedTelem.testCharge?.x, 0.18, 'Probe x updated after move');
  assert.strictEqual(movedTelem.testCharge?.y, -0.12, 'Probe y updated after move');

  // Pointer dragging on probe: project probe world position to screen space
  const probeGroup = (exp as any).bench.testChargeGroup as THREE.Group;
  const tempVec = new THREE.Vector3();
  probeGroup.getWorldPosition(tempVec);
  tempVec.project(testCamera);
  const probeSx = (tempVec.x * 0.5 + 0.5) * 800;
  const probeSy = (-tempVec.y * 0.5 + 0.5) * 800;

  // Pointer down on probe
  const handledDown = exp.onPointerDown({ clientX: probeSx, clientY: probeSy } as any, null, ctx);
  assert.ok(handledDown, 'Pointer down on test charge probe must be captured');
  assert.strictEqual((exp as any).interaction.dragTarget?.type, 'test_charge', 'Drag target must be test_charge');

  // Pointer move
  exp.onPointerMove({ clientX: probeSx + 40, clientY: probeSy + 30 } as any, null, ctx);
  const dragTelem = exp.getTelemetry();
  assert.notStrictEqual(dragTelem.testCharge?.x, 0.18, 'Probe position must update during pointer move');

  // Pointer up
  exp.onPointerUp({ clientX: probeSx + 40, clientY: probeSy + 30 } as any, ctx);
  assert.strictEqual((exp as any).interaction.dragTarget, null, 'Pointer up releases test charge drag target');

  // Reset probe
  exp.resetTestCharge();
  assert.strictEqual((exp as any).testChargePos.x, 0.0);
  assert.strictEqual((exp as any).testChargePos.y, 0.16);

  // 3. FieldBenchMesh Probe Sub-objects & Vector Arrow
  const bench = new FieldBenchMesh();
  assert.ok(bench.testChargeGroup.getObjectByName('ProbeCore'), 'Probe core must exist');
  assert.ok(bench.testChargeGroup.getObjectByName('ProbeHalo'), 'Probe glowing aura halo must exist');
  assert.ok(bench.testChargeGroup.getObjectByName('ProbeRing'), 'Probe ring must exist');
  assert.ok(bench.testChargeGroup.getObjectByName('ProbeArrowGroup'), 'Probe 3D vector arrow group must exist');

  bench.syncTestCharge(probe);
  assert.strictEqual(bench.testChargeGroup.visible, true, 'Test charge group visible when state provided');
  assert.strictEqual(bench.testChargeGroup.position.x, probe.x);

  bench.syncTestCharge(null);
  assert.strictEqual(bench.testChargeGroup.visible, false, 'Test charge group hidden when state null');

  // 4. FieldStatusCard Test Charge Telemetry DOM Readout
  const card = new FieldStatusCard();
  card.updateTelemetry({
    chargeCount: 1,
    totalChargeMicroC: 2.0,
    dipoleMomentMagnitude: 0,
    dipoleMomentVector: { x: 0, y: 0, z: 0 },
    potentialEnergyJoules: 0,
    fieldLineCount: 16,
    selectedChargeId: null,
    selectedChargeValue: 0,
    testCharge: probe,
  });

  const probeQ = card.element.querySelector('#field-probe-q');
  const probeE = card.element.querySelector('#field-probe-e');
  const probeV = card.element.querySelector('#field-probe-v');
  const probeF = card.element.querySelector('#field-probe-f');

  assert.ok(probeQ.textContent.includes('+1.00 nC'), 'Probe charge displayed on HUD');
  assert.ok(probeE.textContent.includes('kV/m') || probeE.textContent.includes('V/m'), 'Probe E field displayed');
  assert.ok(probeV.textContent.includes('V'), 'Probe potential V displayed');
  assert.ok(probeF.textContent.includes('N'), 'Probe force F displayed');

  // 5. Expanded Bounds & Preset Separation Invariants
  assert.ok(
    Math.abs(FIELD_PRESETS.dipole.charges[1].x - FIELD_PRESETS.dipole.charges[0].x) >= 0.50,
    'Expanded dipole separation must be >= 0.50m across large table',
  );
  assert.ok(
    Math.abs(FIELD_PRESETS.quadrupole.charges[1].x - FIELD_PRESETS.quadrupole.charges[0].x) >= 0.40,
    'Expanded quadrupole separation must be >= 0.40m across large table',
  );

  bench.dispose();
  exp.dispose(ctx);
  console.log('✓ Test 12 passed: Test charge mechanics, vector arrow, drag interaction, and HUD binding verified');
}

// ================= Test 13: Multi-Charge Superposition Complete Field Line Rendering =================
console.log('Test 13: Multi-Charge Superposition Complete Field Line Rendering & No Truncation');
{
  const exp = new EmFieldExperiment();
  exp.init(ctx);

  // Setup multi-charge configuration matching the screenshot:
  // 1 positive charge and 2 negative charges
  exp.clearCharges();
  exp.addCharge(2.0, -0.20, -0.15); // +2 µC coral red charge near bottom
  exp.addCharge(-2.0, -0.15, 0.05); // -2 µC blue charge center-left
  exp.addCharge(-2.0, 0.25, -0.15); // -2 µC blue charge bottom-right
  exp.setDensity(24);

  const telem = exp.getTelemetry();
  assert.strictEqual(telem.chargeCount, 3, 'Must have 3 charges');
  assert.ok(telem.fieldLineCount >= 40, `Must generate abundant field lines, got ${telem.fieldLineCount}`);

  // Calculate total segments across all generated field lines
  const lines = (exp as any).fieldLines;
  let totalLineSegments = 0;
  let hasLinesBelowOldMinY = false;

  for (const line of lines) {
    if (line.points.length >= 2) {
      totalLineSegments += line.points.length - 1;
    }
    for (const pt of line.points) {
      if (pt.y < -0.19) {
        hasLinesBelowOldMinY = true;
      }
    }
  }

  // Verify that lines gracefully extend below -0.19 into the expanded lower stage volume
  assert.ok(hasLinesBelowOldMinY, 'Field lines from lower charges must extend below old -0.19 cutoff without clipping');

  // Verify bench LineSegments2 geometry instance count matches totalLineSegments exactly
  const bench = (exp as any).bench as FieldBenchMesh;
  const lineGeo = (bench as any).lineGeo;
  assert.strictEqual(
    lineGeo.instanceCount,
    totalLineSegments,
    `All ${totalLineSegments} field line segments must be fully rendered into lineGeo (no truncation)`,
  );

  // Verify arrow cones count
  const conesMesh = (bench as any).arrowConesMesh;
  assert.ok(conesMesh.count > 0, 'Arrow cones must be rendered');
  assert.ok(conesMesh.count <= totalLineSegments, 'Arrow cones count must be disciplined');

  // Stress test with 4 charges (quadrupole) and density 28
  exp.loadPreset('quadrupole');
  exp.setDensity(28);
  const quadTelem = exp.getTelemetry();
  assert.strictEqual(quadTelem.chargeCount, 4);
  const quadLines = (exp as any).fieldLines;
  let quadSegments = 0;
  for (const line of quadLines) {
    if (line.points.length >= 2) {
      quadSegments += line.points.length - 1;
    }
  }

  assert.strictEqual(
    (bench as any).lineGeo.instanceCount,
    quadSegments,
    `Stress test: all ${quadSegments} segments must be completely rendered without old segment cap`,
  );

  exp.dispose(ctx);
  console.log('✓ Test 13 passed: Multi-charge superposition field lines fully displayed with no truncation');
}

console.log('\n========================================================');
console.log('All Electrostatic Field Exploration Tests Passed (13/13)!');
console.log('========================================================\n');
