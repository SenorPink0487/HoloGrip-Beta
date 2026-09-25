import assert from 'node:assert';
import * as THREE from 'three';

const createMockElement = (): any => ({
  tagName: 'CANVAS',
  width: 64,
  height: 64,
  style: {},
  appendChild: (child: any) => child,
  addEventListener: () => {},
  removeEventListener: () => {},
  classList: { add: () => {}, remove: () => {}, toggle: () => {}, contains: () => false },
  getContext: () => ({
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    font: '',
    textAlign: '',
    textBaseline: '',
    fillRect: () => {},
    clearRect: () => {},
    fillText: () => {},
    beginPath: () => {},
    moveTo: () => {},
    lineTo: () => {},
    stroke: () => {},
    fill: () => {},
    arc: () => {},
    save: () => {},
    restore: () => {},
    createRadialGradient: () => ({ addColorStop: () => {} }),
    createLinearGradient: () => ({ addColorStop: () => {} }),
  }),
});

if (typeof globalThis.document === 'undefined') {
  (globalThis as any).document = { createElement: () => createMockElement() };
}
if (typeof globalThis.window === 'undefined') {
  (globalThis as any).window = { innerWidth: 1280, innerHeight: 800, devicePixelRatio: 1, addEventListener: () => {} };
}

import { BeakerMesh } from '../src/scene/BeakerMesh.ts';
import { ReactionEffects } from '../src/scene/ReactionEffects.ts';
import { ChemistryEngine } from '../src/chemistry/ChemistryEngine.ts';

console.log('=== Reaction effect visuals ===\n');

function surfaceY(beaker: BeakerMesh): number {
  return 0.009 + beaker.maxLiquidHeight * beaker.getLiquidLevel();
}

function liveBubbles(fx: ReactionEffects): { x: number; y: number; z: number; scale: number }[] {
  const mesh = fx['bubbleMesh'] as THREE.InstancedMesh;
  const data = mesh.instanceMatrix.array as Float32Array;
  const found: { x: number; y: number; z: number; scale: number }[] = [];
  for (let i = 0; i < mesh.count; i++) {
    const o = i * 16;
    const scale = data[o];
    const y = data[o + 13];
    if (scale > 0.002 && y > -1) {
      found.push({ x: data[o + 12], y, z: data[o + 14], scale });
    }
  }
  return found;
}

function pair(beaker?: BeakerMesh): { beaker: BeakerMesh; fx: ReactionEffects } {
  const mesh = beaker ?? new BeakerMesh();
  return { beaker: mesh, fx: new ReactionEffects(mesh) };
}

// 1. Magnesium + acid releases a hydrogen packet inside the liquid, above the liquid mesh.
{
  console.log('Test 1: H2 packets rise inside the beaker');
  const engine = new ChemistryEngine();
  engine.addReagent('Mg', 1);
  engine.addReagent('HCl', 40);
  assert.strictEqual(engine.state.gasType, 'H2');
  assert(engine.state.activeGasRate > 0.5, 'engine should be evolving gas');

  const { beaker, fx } = pair();
  assert(fx['bubbleMesh'].renderOrder > beaker['liquidMesh'].renderOrder, 'bubbles must draw after the liquid so the solution does not bury them');

  fx.update(0.05, engine.state);
  const bubbles = liveBubbles(fx);
  const yMax = surfaceY(beaker) - 0.012;
  const rising = bubbles.filter((b) => b.y < yMax);
  assert(fx['bubbleMesh'].visible, 'bubble mesh should be visible while hydrogen is evolving');
  assert(rising.length >= 6, `expected a hydrogen packet, got ${rising.length}`);
  const radius = beaker.getLiquidRadius();
  for (const b of rising) {
    assert(b.y > 0.005 && b.y < surfaceY(beaker), `bubble y ${b.y} left the liquid`);
    assert(Math.hypot(b.x, b.z) <= radius + 0.002, 'bubble left the beaker');
    assert(b.scale < 0.011, `hydrogen bubble too large: ${b.scale}`);
  }
  let clustered = false;
  for (let i = 0; i < rising.length && !clustered; i++) {
    for (let j = i + 1; j < rising.length; j++) {
      const dx = rising[i].x - rising[j].x;
      const dz = rising[i].z - rising[j].z;
      if (dx * dx + dz * dz < 0.04 * 0.04) clustered = true;
    }
  }
  assert(clustered, 'hydrogen should leave the metal as a packet, not as isolated bubbles');

  let sawRipple = false;
  for (let i = 0; i < 24; i++) {
    fx.update(0.05, engine.state);
    if ((fx['ripples'] as { mesh: THREE.Mesh }[]).some((r) => r.mesh.visible)) sawRipple = true;
  }
  assert(sawRipple, 'bubbles should burst into rings on the liquid surface');
  assert((fx['mistParticles'] as THREE.Points).visible, 'hydrogen should throw a mist above the liquid');

  beaker.update(0.05);
  assert(Math.abs(beaker['liquidTopDisc'].rotation.z) > 0.004, 'fizz should rock the meniscus');
  assert(beaker['glassMaterial'].emissiveIntensity > 0.15, 'exotherm should warm the glass');
  console.log('✓ Test 1 passed\n');
}

// 2. Carbon dioxide packets are the large slow bubbles.
{
  console.log('Test 2: CO2 packets are larger than hydrogen');
  const engine = new ChemistryEngine();
  engine.addReagent('Na2CO3', 25);
  engine.addReagent('HCl', 30);
  assert.strictEqual(engine.state.gasType, 'CO2');

  const { beaker, fx } = pair();
  fx.update(0.05, engine.state);
  const bubbles = liveBubbles(fx).filter((b) => b.y > 0 && b.y < surfaceY(beaker) + 0.01);
  assert(bubbles.length >= 3, `expected a carbon dioxide packet, got ${bubbles.length}`);
  for (const b of bubbles) {
    assert(b.scale > 0.011, `carbon dioxide bubble too small: ${b.scale}`);
  }
  console.log('✓ Test 2 passed\n');
}

// 3. Inert copper produces no bubbles. Precipitation, color, and reset do.
{
  console.log('Test 3: quiet reactions stay quiet; precipitates, color, and reset still play');
  const quiet = new ChemistryEngine();
  quiet.addReagent('HCl', 25);
  quiet.addReagent('Cu', 1);
  assert.strictEqual(quiet.state.gasType, null);
  const quietFx = pair().fx;
  quietFx.update(0.05, quiet.state);
  assert.strictEqual(quietFx['bubbleMesh'].visible, false, 'copper in acid must not fizz');

  const precipEngine = new ChemistryEngine();
  precipEngine.addReagent('CuSO4', 20);
  const { fx } = pair();
  fx.update(0.016, precipEngine.state);
  precipEngine.addReagent('NaOH', 25);
  assert(precipEngine.state.precipitates.has('Cu(OH)2'), 'expected copper hydroxide');
  fx.update(0.05, precipEngine.state);
  assert.strictEqual(fx['precipParticles'].visible, true, 'precipitate flakes should fall');
  assert((fx['precipCloud'] as THREE.Mesh).visible, 'precipitate should bloom as a cloud');
  precipEngine.state.liquidColor.setHex(0xff1493);
  fx.update(0.05, precipEngine.state);
  assert((fx['colorBloom'] as THREE.Mesh).visible, 'a strong color change should flash through the liquid');

  fx.reset();
  assert.strictEqual(fx['isPouring'], false);
  assert.strictEqual(fx['bubbleMesh'].visible, false);
  assert.strictEqual(fx['precipParticles'].visible, false);
  assert.strictEqual(fx['colorBloom'].visible, false);
  assert.strictEqual(fx['heatGlowLight'].visible, false);
  console.log('✓ Test 3 passed\n');
}

// 4. Bubbles finish their rise after gas production stops.
{
  console.log('Test 4: bubbles clear after the gas dies');
  const engine = new ChemistryEngine();
  engine.addReagent('Mg', 1);
  engine.addReagent('HCl', 40);
  const { fx } = pair();
  fx.update(0.05, engine.state);
  assert.strictEqual(fx['bubbleMesh'].visible, true);

  engine.state.activeGasRate = 0;
  engine.state.gasType = null;
  engine.state.activeEffects = [];
  for (let i = 0; i < 60; i++) fx.update(0.05, engine.state);
  assert.strictEqual(fx['bubbleMesh'].visible, false, 'bubbles should leave once gas production stops');
  console.log('✓ Test 4 passed\n');
}

console.log('All reaction effect visual checks passed.');
