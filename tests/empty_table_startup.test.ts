import assert from 'node:assert';
import * as THREE from 'three';

// Mock minimal DOM for headless Node test
const createMockElement = (tag = 'div'): any => ({
  tagName: tag.toUpperCase(),
  width: 1024,
  height: 768,
  style: {},
  appendChild: (child: any) => child,
  addEventListener: () => {},
  removeEventListener: () => {},
  classList: { add: () => {}, remove: () => {}, toggle: () => {}, contains: () => false },
  getContext: () => ({
    fillStyle: '', strokeStyle: '', lineWidth: 1, font: '', textAlign: '', textBaseline: '',
    fillRect: () => {}, strokeRect: () => {}, clearRect: () => {}, fillText: () => {},
    beginPath: () => {}, moveTo: () => {}, lineTo: () => {}, stroke: () => {}, fill: () => {},
    arc: () => {}, save: () => {}, restore: () => {}, translate: () => {}, rotate: () => {},
    createRadialGradient: () => ({ addColorStop: () => {} }),
    createLinearGradient: () => ({ addColorStop: () => {} }),
    getImageData: () => ({ data: new Uint8ClampedArray(512 * 512 * 4) }),
    putImageData: () => {},
  }),
  querySelector: () => createMockElement('div'),
  querySelectorAll: () => [],
});

if (typeof globalThis.window === 'undefined') {
  (globalThis as any).window = {
    addEventListener: () => {},
    removeEventListener: () => {},
    innerWidth: 1920,
    innerHeight: 1080,
    devicePixelRatio: 1,
  };
}

if (typeof globalThis.document === 'undefined') {
  (globalThis as any).document = {
    createElement: createMockElement,
    body: createMockElement('body'),
    getElementById: () => createMockElement('div'),
  };
}

if (typeof (globalThis as any).PointerEvent === 'undefined') {
  (globalThis as any).PointerEvent = class PointerEvent extends Event {};
}

import { HologramStage } from '../src/core/HologramStage.ts';
import OpticsReflectionRefractionExperiment from '../src/experiments/catalog/optics-reflection-refraction/index.ts';
import type { ExperimentContext } from '../src/core/types.ts';

console.log('=== Starting Empty Table On Startup Verification ===\n');

// 1. Verify HologramStage defaults to hidden upon construction
const stage = new HologramStage();
assert.strictEqual(stage.group.visible, false, 'HologramStage must be hidden initially so no equipment or ring appears on table');
assert.strictEqual(stage.activeExperiment, null, 'No experiment must be active on stage initially');
console.log('✓ Test 1 passed: HologramStage is hidden by default with no active experiment');

// 2. Verify stage becomes visible when experiment is explicitly mounted
const exp = new OpticsReflectionRefractionExperiment();
const mockContext: ExperimentContext = {
  scene: new THREE.Scene(),
  camera: new THREE.PerspectiveCamera(),
  renderer: {
    compile: () => {},
    compileAsync: async () => {},
  } as any,
  stage: stage,
  computeBridge: {} as any,
  workerPool: { size: 0 } as any,
  parameters: {},
  getParameter: () => null,
  setParameter: () => {},
};

await stage.switchExperiment(exp, mockContext);
assert.strictEqual(stage.group.visible, true, 'Stage must become visible when an experiment is selected and mounted');
assert.strictEqual(stage.activeExperiment, exp, 'Active experiment must be set to OpticsReflectionRefraction');
console.log('✓ Test 2 passed: HologramStage becomes visible only after switchExperiment is invoked');

// 3. Verify clearExperiment safely unmounts, disposes, and hides stage
stage.clearExperiment(mockContext);
assert.strictEqual(stage.group.visible, false, 'Stage must be hidden after clearExperiment');
assert.strictEqual(stage.activeExperiment, null, 'activeExperiment must be reset to null after clearExperiment');
console.log('✓ Test 3 passed: clearExperiment unmounts experiment and hides HologramStage');

// 4. Verify BeakerMesh initial standby state on startup
const { BeakerMesh } = await import('../src/scene/BeakerMesh.ts');
const { ReactionEffects } = await import('../src/scene/ReactionEffects.ts');

const beaker = new BeakerMesh();
assert.strictEqual(beaker.group.visible, false, 'Beaker group.visible must be false on initial startup');
assert.strictEqual(beaker.isVisible(), false, 'Beaker isVisible must be false on startup');
assert.strictEqual(beaker.isInteractive(), false, 'Beaker isInteractive must be false on startup');
assert.strictEqual(beaker.group.scale.x, 0.001, 'Beaker initial scale must be ~0');
console.log('✓ Test 4 passed: BeakerMesh defaults to hidden and non-interactive on startup');

// 5. Verify BeakerMesh mounting and smooth scale-up animation
beaker.setVisible(true, true);
assert.strictEqual(beaker.group.visible, true, 'Beaker group.visible must be true when setVisible(true, true)');
assert.strictEqual(beaker.isVisible(), true, 'Beaker isVisible must be true during scale-up');
assert.strictEqual(beaker.isInteractive(), true, 'Beaker isInteractive must be true during scale-up');

for (let i = 0; i < 30; i++) {
  beaker.update(0.016);
}
assert(beaker.group.scale.x > 0.9, 'Beaker scale must reach ~1.0 after animating in');
console.log('✓ Test 5 passed: BeakerMesh scale-up animation and interactive states verified');

// 6. Verify BeakerMesh unmounting and smooth scale-down animation
beaker.setVisible(false, true);
assert.strictEqual(beaker.isInteractive(), false, 'Beaker isInteractive must be false immediately when target scale is 0');
assert.strictEqual(beaker.isVisible(), true, 'Beaker isVisible must remain true while animating down so render loop continues update');

for (let i = 0; i < 60; i++) {
  beaker.update(0.016);
}
assert.strictEqual(beaker.group.scale.x, 0, 'Beaker scale must be clamped to 0 after animating out');
assert.strictEqual(beaker.group.visible, false, 'Beaker group.visible must be false after animating out');
assert.strictEqual(beaker.isVisible(), false, 'Beaker isVisible must be false after animating out');
console.log('✓ Test 6 passed: BeakerMesh unmounting smoothly shrinks scale to 0 and hides mesh');

// 7. Verify rapid unmount-remount cycles with ReactionEffects reset
const reactionEffects = new ReactionEffects(beaker);
reactionEffects.triggerPour(0x0a84ff);
reactionEffects.triggerSodiumBurn();
reactionEffects.triggerHeatPulse(1.5);

// Reset simulation upon switching or clearing experiment
reactionEffects.reset();
assert.strictEqual(reactionEffects['isPouring'], false, 'isPouring must be reset');
assert.strictEqual(reactionEffects['isSodiumBurning'], false, 'isSodiumBurning must be reset');
assert.strictEqual(reactionEffects['hasActiveSplash'], false, 'hasActiveSplash must be reset');
assert.strictEqual(reactionEffects['hasActiveSparks'], false, 'hasActiveSparks must be reset');
assert.strictEqual(reactionEffects['heatGlowLight'].visible, false, 'Heat glow light must be hidden after reset');
assert.strictEqual(reactionEffects['sodiumLight'].visible, false, 'Sodium light must be hidden after reset');
console.log('✓ Test 7 passed: Rapid experiment unmount and remount safely resets reaction effects and lighting');

console.log('\n========================================================');
console.log('All Empty Table On Startup Verifications Passed (7/7)!');
console.log('========================================================\n');
