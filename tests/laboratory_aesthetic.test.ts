import assert from 'node:assert';
import * as THREE from 'three';
import { Laboratory } from '../src/scene/Laboratory.ts';
import { HoloTable, HOLO_TABLE_RADIUS, HOLO_TABLE_TOP_Y } from '../src/scene/HoloTable.ts';

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
    roundRect: () => {}, measureText: () => ({ width: 12 }),
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

console.log('=== Circular gallery laboratory ===\n');
const lab = new Laboratory();
assert.ok(lab.group instanceof THREE.Group);
assert.strictEqual(lab.roomRadius, 8.2);
assert.strictEqual(lab.roomHeight, 4.4);

for (const name of ['plaster', 'brass', 'floorBorder', 'oculus', 'cove']) {
  assert.ok(lab.materials[name], 'Missing architectural material: ' + name);
}

const shell = lab.group.getObjectByName('reference-shell');
assert.ok(shell instanceof THREE.Mesh, 'Continuous circular shell must exist');
assert.ok(shell.geometry instanceof THREE.LatheGeometry, 'Shell must be one revolved surface');

const floor = lab.group.getObjectByName('reference-floor');
assert.ok(floor instanceof THREE.Mesh && floor.geometry instanceof THREE.CircleGeometry, 'Floor must be circular');
assert.ok(lab.group.getObjectByName('reference-floor-border'), 'Stone floor border must exist');

const ceiling = lab.group.getObjectByName('reference-ceiling');
assert.ok(ceiling instanceof THREE.Group, 'Ceiling fittings must exist');
assert.ok(ceiling.getObjectByName('central-skylight'), 'Central oculus must exist');
assert.ok(ceiling.getObjectByName('oculus-bezel'), 'Brass oculus bezel must exist');
assert.ok(ceiling.getObjectByName('perimeter-cove'), 'Perimeter cove light must exist');
assert.ok(lab.group.getObjectByName('plaster-skirting'), 'Plaster skirting must exist');

for (const retired of [
  'central-observation-window',
  'side-niche-left',
  'side-niche-right',
  'upper-cyan-light-slot',
  'vertical-cyan-light-left',
  'right-entry-door',
  'skylight-cross',
  'ceiling-facets',
]) {
  assert.equal(lab.group.getObjectByName(retired), undefined, retired + ' must be gone');
}

let wallTransmission = false;
lab.group.traverse(child => {
  if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshPhysicalMaterial) {
    if (child.material.transmission > 0) wallTransmission = true;
  }
});
assert.strictEqual(wallTransmission, false, 'Gallery must not use transmission');

const table = new HoloTable();
const top = table.group.getObjectByName('reference-white-tabletop');
assert.ok(top instanceof THREE.Mesh && top.geometry instanceof THREE.LatheGeometry, 'Tabletop must be a revolved stone disc');
assert.ok(table.group.getObjectByName('table-pedestal') instanceof THREE.Mesh, 'Pedestal must be one piece');
assert.ok(table.group.getObjectByName('table-brass-inlay'), 'Brass inlay must exist');
assert.ok(HOLO_TABLE_RADIUS < 2.2 && HOLO_TABLE_RADIUS > 1.5, 'Table must read as a table, not a platform');
assert.strictEqual(HOLO_TABLE_TOP_Y, 0.99);

table.group.traverse(child => {
  if (!(child instanceof THREE.Mesh)) return;
  const mats = Array.isArray(child.material) ? child.material : [child.material];
  for (const mat of mats) {
    if (!(mat instanceof THREE.MeshStandardMaterial)) continue;
    const c = mat.color;
    const lum = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
    assert.ok(lum > 0.28, `${child.name || 'mesh'} is too dark (${lum.toFixed(2)})`);
    assert.ok((mat as THREE.MeshPhysicalMaterial).transmission === undefined || (mat as THREE.MeshPhysicalMaterial).transmission === 0);
  }
});

assert.doesNotThrow(() => {
  lab.update(0.016, 0);
  lab.update(0.016, 1);
  table.update(0.016);
});

console.log('✓ Circular shell, oculus, and center table verified');
