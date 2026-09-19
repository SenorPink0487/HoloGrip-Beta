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
  };
}

if (typeof (globalThis as any).PointerEvent === 'undefined') {
  (globalThis as any).PointerEvent = class PointerEvent extends Event {};
}

import { HologramStage } from '../src/core/HologramStage.ts';
import OpticsLabExperiment from '../src/experiments/catalog/optics-lab/index.ts';
import { DetectorScreenMesh } from '../src/scene/optics/DetectorScreenMesh.ts';
import { OpticalBenchRail } from '../src/scene/optics/OpticalBenchRail.ts';
import type { ExperimentContext } from '../src/core/types.ts';

console.log('=== Verifying 3D Optics Equipment Display & Elevation ===\n');

// 1. Stage elevation on tabletop
const stage = new HologramStage();
assert.strictEqual(stage.group.position.y, 0.908, 'HologramStage must be positioned directly atop HoloTable aperture (y = 0.908)');
console.log('✓ Check 1 passed: HologramStage rests at table surface elevation 0.908m');

// 2. Detector Screen double-side rendering
const screen = new DetectorScreenMesh();
const screenMesh = screen.group.children.find((c: any) => c instanceof THREE.Mesh && c.geometry instanceof THREE.PlaneGeometry) as THREE.Mesh;
assert(screenMesh, 'Screen mesh must exist in DetectorScreenMesh');
assert.strictEqual((screenMesh.material as THREE.MeshBasicMaterial).side, THREE.DoubleSide, 'Detector screen must be DoubleSide for 360 observation');
assert(screenMesh.position.z < 0, 'Screen surface must face laser arrival side (z < 0)');
console.log('✓ Check 2 passed: Detector screen uses DoubleSide material facing beam directly');

// 3. OpticsLab mounting and orientation
const exp = new OpticsLabExperiment();
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

assert.strictEqual(stage.group.visible, true, 'Stage must be explicitly visible upon experiment switch');
assert.strictEqual(exp.rootGroup.position.y, 0.063, 'rootGroup elevation must offset rail feet to rest at table surface y = 0');
assert.strictEqual(exp.rootGroup.rotation.y, Math.PI * 0.5, 'rootGroup must be rotated 90deg to stretch horizontally across the table');
assert(exp.rootGroup.children.length >= 2, 'rootGroup must contain rail and optical beam system');

console.log('✓ Check 3 passed: OpticsLab mounted with table elevation 0.063 and horizontal cross-table rotation');

// 4. Update scaling animation
stage.update(0.1, 0.1, mockContext);
assert(exp.rootGroup.scale.x > 0.01, 'Transition scaling animation must increase scale towards 1.0');
stage.update(1.0, 1.1, mockContext);
assert.strictEqual(exp.rootGroup.scale.x, 1.0, 'Scale must reach full 1.0');

console.log('✓ Check 4 passed: Hologram stage smoothly scales experiment to 1.0');

// Clean up
stage.update(0.016, 2.0, mockContext);
exp.dispose(mockContext);
screen.dispose();

console.log('\n=============================================================');
console.log('All 3D Optics Equipment Display Verifications Passed (4/4)!');
console.log('=============================================================\n');
