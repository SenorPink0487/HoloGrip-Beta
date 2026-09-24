import assert from 'node:assert';
import * as THREE from 'three';
import { Laboratory } from '../src/scene/Laboratory.ts';

const createMockElement = (tag = 'div'): any => ({
  tagName: tag.toUpperCase(),
  width: 2048,
  height: 1280,
  style: {},
  appendChild: (child: any) => child,
  addEventListener: () => {},
  getContext: (type: string) => type === '2d' ? {
    fillStyle: '', strokeStyle: '', lineWidth: 1, font: '', textAlign: '', textBaseline: '',
    fillRect: () => {}, strokeRect: () => {}, clearRect: () => {}, fillText: () => {},
    beginPath: () => {}, moveTo: () => {}, lineTo: () => {}, stroke: () => {}, fill: () => {},
    arc: () => {}, save: () => {}, restore: () => {}, translate: () => {}, rotate: () => {},
    quadraticCurveTo: () => {}, bezierCurveTo: () => {}, drawImage: () => {},
    createRadialGradient: () => ({ addColorStop: () => {} }),
    createLinearGradient: () => ({ addColorStop: () => {} }),
    getImageData: () => ({ data: new Uint8ClampedArray(512 * 512 * 4) }),
    createImageData: (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) }),
    putImageData: () => {},
  } : null,
});

if (typeof globalThis.window === 'undefined') {
  (globalThis as any).window = { addEventListener: () => {}, innerWidth: 1920, innerHeight: 1080, devicePixelRatio: 1 };
}
if (typeof globalThis.document === 'undefined') {
  (globalThis as any).document = { createElement: (tag: string) => createMockElement(tag), body: createMockElement('body') };
}

console.log('=== Reference Laboratory Aesthetic Verification ===\n');
const lab = new Laboratory();
assert.ok(lab.group instanceof THREE.Group);
assert.strictEqual(lab.roomRadius, 8.2);
assert.strictEqual(lab.roomHeight, 4.4);

for (const name of [
  'wallWhite', 'wallTrim', 'wallSeamDark', 'aluminumTrim', 'coveLight',
  'hairlineLightSlot', 'glassBackglow', 'nicheInterior', 'nicheWarmLight',
  'ceilingWhite', 'ceilingTrim', 'ceilingGroove',
]) {
  assert.ok(lab.materials[name], 'Missing architectural material: ' + name);
}

const walls = lab.group.getObjectByName('reference-walls');
assert.ok(walls instanceof THREE.Group, 'Reference wall group must exist');
assert.ok(walls.getObjectByName('central-observation-window-frame'), 'Central rounded observation window must exist');
assert.ok(walls.getObjectByName('central-observation-window-glass'), 'Observation glass must exist');
assert.ok(walls.getObjectByName('side-niche-frame-left'), 'Left recessed niche must exist');
assert.ok(walls.getObjectByName('side-niche-frame-right'), 'Right recessed niche must exist');
assert.ok(walls.getObjectByName('side-niche-warm-shelf-left'), 'Left warm shelf must exist');
assert.ok(walls.getObjectByName('side-niche-warm-shelf-right'), 'Right warm shelf must exist');
assert.ok(walls.getObjectByName('upper-cyan-light-slot'), 'Upper cyan datum light must exist');

const ceiling = lab.group.getObjectByName('reference-ceiling');
assert.ok(ceiling instanceof THREE.Group, 'Reference ceiling group must exist');
assert.ok(ceiling.children.some(child => child instanceof THREE.Mesh && child.geometry instanceof THREE.CircleGeometry), 'Central circular skylight must exist');

const floor = lab.group.children.find(child => child instanceof THREE.Mesh) as THREE.Mesh;
assert.ok(floor?.geometry instanceof THREE.CircleGeometry, 'Floor must be circular');
assert.ok(floor.getObjectByName('reference-floor-seams'), 'Floor construction seams must exist');

let wallTransmission = false;
walls.traverse(child => {
  if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshPhysicalMaterial && child.material.transmission > 0) {
    wallTransmission = true;
  }
});
assert.strictEqual(wallTransmission, true, 'Observation window should use physical glass transmission');

assert.doesNotThrow(() => {
  lab.update(0.016, 0);
  lab.update(0.016, 1);
});

console.log('✓ Reference laboratory geometry, materials, lighting slots and lifecycle verified');
