import assert from 'node:assert';
import * as THREE from 'three';
import { Laboratory } from '../src/scene/Laboratory.ts';
import { LAB_CEILING } from '../src/scene/LaboratoryCeiling.ts';
import { LAB_WALLS } from '../src/scene/LaboratoryWalls.ts';
import { LAB_ENTRY_REST } from '../src/controls/labEntry.ts';

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
  'hairlineLightSlot', 'nicheInterior', 'nicheWarmLight',
  'ceilingWhite', 'ceilingTrim', 'ceilingGroove',
  'quadrantDiffuser', 'haloRingLight', 'mullionDark', 'mullionGroove', 'downlightLens', 'floorInlay',
]) {
  assert.ok(lab.materials[name], 'Missing architectural material: ' + name);
}

const walls = lab.group.getObjectByName('reference-walls');
assert.ok(walls instanceof THREE.Group, 'Reference wall group must exist');
assert.strictEqual(walls.getObjectByName('central-observation-window'), undefined, 'Wall observation window has been removed');
assert.ok(walls.getObjectByName('side-niche-frame-left'), 'Left recessed niche must exist');
assert.ok(walls.getObjectByName('side-niche-frame-right'), 'Right recessed niche must exist');
assert.ok(walls.getObjectByName('side-niche-warm-shelf-left'), 'Left warm shelf must exist');
assert.ok(walls.getObjectByName('side-niche-warm-shelf-right'), 'Right warm shelf must exist');
assert.ok(walls.getObjectByName('upper-cyan-light-slot'), 'Upper cyan datum light must exist');
assert.strictEqual(walls.getObjectByName('vertical-cyan-light-left'), undefined, 'Reference wall has no vertical cyan accent');
assert.strictEqual(walls.getObjectByName('vertical-cyan-light-right'), undefined, 'Reference wall has no vertical cyan accent');
assert.ok(walls.getObjectByName('right-entry-door'), 'Right solid entry must exist');
assert.strictEqual(walls.getObjectByName('right-entry-door-glass'), undefined, 'Door observation window has been filled with a solid panel');
assert.ok(walls.getObjectByName('right-entry-door-leaf'), 'Solid door leaf must exist');

// The reference wall piers must stand physically proud of the infill on both rows.
const wallSkin = walls.getObjectByName('reference-wall-panels');
assert.ok(wallSkin instanceof THREE.Group);
walls.updateMatrixWorld(true);
const wallRay = new THREE.Raycaster();
for (const height of [1.2, 3.3]) {
  for (let i = 0; i < LAB_WALLS.bays; i++) {
    const bayAngle = i / LAB_WALLS.bays * Math.PI * 2;
    const pierAngle = bayAngle + Math.PI / LAB_WALLS.bays;
    wallRay.set(new THREE.Vector3(0, height, 0), new THREE.Vector3(Math.sin(bayAngle), 0, -Math.cos(bayAngle)));
    const infill = wallRay.intersectObject(wallSkin, true)[0];
    assert.strictEqual(infill.object.name, 'wall-infill-faces');
    assert.ok(infill.face!.normal.dot(wallRay.ray.direction) < -0.99, 'Panel skin must face into the room');
    wallRay.set(new THREE.Vector3(0, height, 0), new THREE.Vector3(Math.sin(pierAngle), 0, -Math.cos(pierAngle)));
    const pier = wallRay.intersectObject(wallSkin, true)[0];
    assert.strictEqual(pier.object.name, 'wall-raised-faces');
    assert.ok(infill.distance - pier.distance > 0.10 && infill.distance - pier.distance < 0.12,
      'Piers must project approximately 11 cm ahead of the broad wall panels');
  }
}
wallRay.set(new THREE.Vector3(0, LAB_WALLS.horizontalJointY, 0), new THREE.Vector3(0, 0, -1));
assert.strictEqual(wallRay.intersectObject(wallSkin, true).length, 0, 'Upper/lower panel joint must be a real recessed gap');
assert.ok(wallRay.intersectObject(walls.getObjectByName('reference-shell')!)[0], 'Backing must close the room behind panel joints');

// The curved infill must not swallow the sides of the flat door, and the former
// observation aperture must now hit the opaque leaf rather than glazing or backing.
walls.updateMatrixWorld(true);
const solidDoor = walls.getObjectByName('right-entry-door')!;
for (const [x, y] of [[-0.69, 0], [0.69, 0], [0.02, 0.08]]) {
  const target = new THREE.Vector3(x, y, 0.04).applyMatrix4(solidDoor.matrixWorld);
  const eye = new THREE.Vector3(0, target.y, 0);
  wallRay.set(eye, target.sub(eye).normalize());
  const hit = wallRay.intersectObjects([wallSkin, solidDoor], true)[0];
  assert.strictEqual(hit.object.name, 'right-entry-door-leaf', 'Door leaf must remain visible across the actual wall opening');
}

const ceiling = lab.group.getObjectByName('reference-ceiling');
assert.ok(ceiling instanceof THREE.Group, 'Reference ceiling group must exist');
assert.ok(ceiling.getObjectByName('central-skylight') instanceof THREE.Mesh, 'Opaque central ceiling disc must exist');
assert.ok(ceiling.getObjectByName('central-skylight'), 'Named oculus must exist');
assert.ok(ceiling.getObjectByName('skylight-cross'), 'Oculus cross mullion must exist');
assert.ok(ceiling.getObjectByName('ceiling-facets'), 'Faceted ceiling coffers must exist');

// 1:1 复刻天花板新特征校验
const diffusers = ceiling.getObjectByName('main-quadrant-diffusers');
assert.ok(diffusers instanceof THREE.Group, 'Main quadrant diffusers group must exist');
assert.strictEqual(diffusers.children.length, 5, 'Reference light ring has five sectors separated by silver bridges');
diffusers.children.forEach((child, index) => {
  assert.ok(child instanceof THREE.Mesh, `Quadrant diffuser ${index} must be a Mesh`);
  assert.ok(child.geometry instanceof THREE.ExtrudeGeometry, `Diffuser ${index} must have thickness and beveled edges`);
});

const cross = ceiling.getObjectByName('skylight-cross');
assert.ok(cross instanceof THREE.Group, 'Skylight cross mullions group must exist');
assert.strictEqual(cross.children.length, 5, 'Reference ceiling has five radial bridges');

const halo = ceiling.getObjectByName('perimeter-halo-ring');
assert.ok(halo instanceof THREE.Mesh, 'Perimeter continuous thin halo light ring must exist');
assert.ok(halo.geometry instanceof THREE.LatheGeometry, 'Perimeter halo must have a closed rolled profile');

const downlights = ceiling.getObjectByName('ceiling-downlights');
assert.ok(downlights instanceof THREE.Group, 'Ceiling downlights group must exist');
assert.strictEqual(downlights.children.length, 12, 'Perimeter has twelve recessed circular downlights');

// Upward rays catch reversed ceiling faces and gaps that would expose the scene background.
ceiling.updateMatrixWorld(true);
const ceilingRay = new THREE.Raycaster();
for (const radius of [0, 3.66, 4.3, 5.5, 5.925, 6.4, 7.3, 7.33, 7.7, 8.19]) {
  for (let i = 0; i < 24; i++) {
    const angle = (i + 0.25) / 24 * Math.PI * 2;
    ceilingRay.set(new THREE.Vector3(Math.sin(angle) * radius, 2, Math.cos(angle) * radius), new THREE.Vector3(0, 1, 0));
    const hit = ceilingRay.intersectObject(ceiling, true)[0];
    assert.ok(hit, `Ceiling must close above the room at radius ${radius}, angle ${angle}`);
    assert.ok(hit.point.y >= 3.89 && hit.point.y < 4.51, 'Visible ceiling must remain above wall height');
  }
}
const centerPanel = ceiling.getObjectByName('central-skylight') as THREE.Mesh;
assert.ok(centerPanel.material instanceof THREE.MeshStandardMaterial);
assert.strictEqual(centerPanel.material.transparent, false, 'Reference central disc is opaque, not a skylight');
ceilingRay.set(new THREE.Vector3(0.2, 2, 0), new THREE.Vector3(0, 1, 0));
const centerHit = ceilingRay.intersectObject(centerPanel)[0];
assert.ok(centerHit.face && centerHit.face.normal.y < -0.99, 'Central disc must face down into the room');

// A groove must expose the recessed silver face, rather than a continuous collar
// hiding it or a raised bar sitting in front of it.
for (const angle of LAB_CEILING.bridgeAngles) {
  ceilingRay.set(new THREE.Vector3(Math.sin(angle) * 4.3, 2, -Math.cos(angle) * 4.3), new THREE.Vector3(0, 1, 0));
  const bridgeHit = ceilingRay.intersectObject(ceiling, true)[0];
  assert.strictEqual(bridgeHit.object.name, 'recessed-bridge-face', 'Radial groove must reveal its silver bridge face');
  const adjacentAngle = angle + 0.07;
  ceilingRay.set(new THREE.Vector3(Math.sin(adjacentAngle) * 4.3, 2, -Math.cos(adjacentAngle) * 4.3), new THREE.Vector3(0, 1, 0));
  const panelHit = ceilingRay.intersectObject(ceiling, true)[0];
  assert.strictEqual(panelHit.object.name, 'inner-ceiling-ring');
  assert.ok(bridgeHit.point.y - panelHit.point.y > 0.02, 'Bridge must recess upward at least 2 cm behind adjacent panels');
}
ceilingRay.set(new THREE.Vector3(0, 2, 5.5), new THREE.Vector3(0, 1, 0));
const bridgeLightSection = ceilingRay.intersectObject(ceiling, true)[0];
ceilingRay.set(new THREE.Vector3(0.4, 2, 5.5), new THREE.Vector3(0, 1, 0));
const diffuserHit = ceilingRay.intersectObject(ceiling, true)[0];
assert.ok(diffuserHit.object.name.startsWith('diffuser-sector-'));
assert.ok(diffuserHit.point.y > bridgeLightSection.point.y + 0.02, 'Diffuser must sit farther into the light well than the silver bridge');

// Side views must hit the shadowed groove-wall finish. Losing extrusion groups
// during the collar merge used to turn these camera-facing walls into white stripes.
const sideViewEye = new THREE.Vector3(0, 1.38, 7.6);
for (const x of [-4.6, 4.6]) {
  const grooveWall = new THREE.Vector3(x, 4.33, -0.158);
  ceilingRay.set(sideViewEye, grooveWall.sub(sideViewEye).normalize());
  const wallHit = ceilingRay.intersectObject(ceiling, true)[0];
  assert.strictEqual(wallHit.object.name, 'inner-ceiling-ring');
  const wallMaterials = (wallHit.object as THREE.Mesh).material;
  assert.ok(Array.isArray(wallMaterials), 'Collar must retain separate panel and groove-wall materials');
  assert.strictEqual(wallMaterials[wallHit.face!.materialIndex], lab.materials.ceilingRecessWall);
  assert.notStrictEqual(wallMaterials[wallHit.face!.materialIndex], lab.materials.ceilingWhite);
}

// At the real experiment camera the lens must remain a visible broad surface,
// accounting for occlusion by the recessed frame, not only its top-down width.
const benchCamera = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 100);
benchCamera.position.set(LAB_ENTRY_REST.x, LAB_ENTRY_REST.y, LAB_ENTRY_REST.z);
benchCamera.rotation.order = 'YXZ';
benchCamera.rotation.x = LAB_ENTRY_REST.pitch;
benchCamera.updateMatrixWorld(true);
const lensEndpoints: number[] = [];
for (const radius of [LAB_CEILING.lightInnerRadius + 0.04, LAB_CEILING.lightOuterRadius - 0.04]) {
  ceilingRay.set(new THREE.Vector3(0, 2, -radius), new THREE.Vector3(0, 1, 0));
  lensEndpoints.push(ceilingRay.intersectObject(ceiling, true)[0].point.clone().project(benchCamera).y);
}
const visibleLens: number[] = [];
for (let i = 0; i < 40; i++) {
  const y = THREE.MathUtils.lerp(lensEndpoints[0], lensEndpoints[1], i / 39);
  ceilingRay.setFromCamera(new THREE.Vector2(0, y), benchCamera);
  const hit = ceilingRay.intersectObject(ceiling, true)[0];
  if (hit?.object.name.startsWith('diffuser-sector-')) visibleLens.push(y);
}
assert.ok(visibleLens.length > 1);
assert.ok(Math.max(...visibleLens) - Math.min(...visibleLens) > 0.045,
  'Main lens must occupy over 2.25% of the normal experiment viewport height');

// The wall-wash emitter sits behind the ceiling return rather than drawing a
// second exposed horizontal light line across the experiment viewport.
lab.group.updateMatrixWorld(true);
const concealedEmitter = walls.getObjectByName('upper-cyan-light-slot') as THREE.Mesh;
const emitterRadius = (concealedEmitter.geometry as THREE.CylinderGeometry).parameters.radiusTop;
ceilingRay.set(benchCamera.position, new THREE.Vector3(0, concealedEmitter.position.y, -emitterRadius).sub(benchCamera.position).normalize());
const opaqueHit = ceilingRay.intersectObject(lab.group, true).find(hit => {
  const material = (hit.object as THREE.Mesh).material;
  const faceMaterial = Array.isArray(material) ? material[hit.face!.materialIndex] : material;
  return !faceMaterial.transparent;
});
assert.ok(opaqueHit);
assert.notStrictEqual(opaqueHit.object, concealedEmitter, 'Wall-wash LED must be concealed from the bench eye');

const floor = lab.group.children.find(child => child instanceof THREE.Mesh) as THREE.Mesh;
assert.ok(floor?.geometry instanceof THREE.CircleGeometry, 'Floor must be circular');
assert.ok(floor.getObjectByName('reference-floor-seams'), 'Floor construction seams must exist');

// 1:1 复刻镜面地坪与深色导轨嵌条校验
assert.ok(floor.material instanceof THREE.MeshPhysicalMaterial, 'Floor must use MeshPhysicalMaterial');
const floorMat = floor.material as THREE.MeshPhysicalMaterial;
assert.strictEqual(floorMat.clearcoat, 1.0, 'Floor clearcoat must be 1.0 for glossy liquid finish');
assert.ok(floorMat.roughness <= 0.15, 'Floor roughness must be <= 0.15 for mirror reflection');

const inlayRing = floor.getObjectByName('floor-inlay-ring');
assert.ok(inlayRing instanceof THREE.Mesh, 'Floor dark circular inlay ring must exist');
assert.ok(inlayRing.geometry instanceof THREE.RingGeometry, 'Floor inlay must use RingGeometry');

let wallClearcoatGlass = false;
let wallTransmission = false;
walls.traverse(child => {
  if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshPhysicalMaterial) {
    if (child.material.clearcoat > 0 && child.material.transparent) {
      wallClearcoatGlass = true;
    }
    if (child.material.transmission > 0) {
      wallTransmission = true;
    }
  }
});
assert.strictEqual(wallClearcoatGlass, false, 'Wall glazing must not reappear after the observation windows are removed');
assert.strictEqual(wallTransmission, false, 'Observation window must NOT use transmission to avoid offscreen render passes');

assert.doesNotThrow(() => {
  lab.update(0.016, 0);
  lab.update(0.016, 1);
});

console.log('✓ Reference laboratory geometry, materials, lighting slots and lifecycle verified');
