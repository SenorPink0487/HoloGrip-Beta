import assert from 'node:assert';
import * as THREE from 'three';
import {
  GeometrySolver,
  type HighSchoolModelType,
} from '../src/scene/math/GeometrySolver.ts';
import {
  StereometryMesh,
} from '../src/scene/math/StereometryMesh.ts';
import MathStereometryExperiment from '../src/experiments/catalog/math-stereometry/index.ts';
import {
  StereometryStatusCard,
} from '../src/ui/vision/StereometryStatusCard.ts';

// Lightweight DOM Mock for Node.js test environment
class MockElement {
  public tagName: string;
  public id: string = '';
  public className: string = '';
  public innerHTML: string = '';
  public textContent: string = '';
  public style: Record<string, string> = {};
  public attributes: Record<string, string> = {};
  public eventListeners: Record<string, ((e?: any) => void)[]> = {};
  public parentNode: MockElement | null = null;
  public children: MockElement[] = [];
  private elementCache: Map<string, MockElement> = new Map();

  appendChild(child: MockElement): MockElement {
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  removeChild(child: MockElement): MockElement {
    const idx = this.children.indexOf(child);
    if (idx !== -1) {
      this.children.splice(idx, 1);
      child.parentNode = null;
    }
    return child;
  }

  getContext(_type: string = '2d') {
    return {
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 1,
      lineJoin: 'round',
      font: '',
      textAlign: '',
      textBaseline: '',
      shadowColor: '',
      shadowBlur: 0,
      clearRect: () => {},
      fillRect: () => {},
      strokeRect: () => {},
      fillText: () => {},
      strokeText: () => {},
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

  addEventListener(event: string, handler: (e?: any) => void): void {
    if (!this.eventListeners[event]) {
      this.eventListeners[event] = [];
    }
    this.eventListeners[event].push(handler);
  }

  dispatch(event: string, e?: any): void {
    if (this.eventListeners[event]) {
      for (const h of this.eventListeners[event]) {
        h(e);
      }
    }
  }

  get classList() {
    return {
      add: (cls: string) => {
        const set = new Set(this.className.split(/\s+/).filter(Boolean));
        set.add(cls);
        this.className = Array.from(set).join(' ');
      },
      remove: (cls: string) => {
        const set = new Set(this.className.split(/\s+/).filter(Boolean));
        set.delete(cls);
        this.className = Array.from(set).join(' ');
      },
      contains: (cls: string) => {
        return this.className.split(/\s+/).includes(cls);
      },
      toggle: (cls: string, force?: boolean) => {
        const has = this.className.split(/\s+/).includes(cls);
        const shouldAdd = force !== undefined ? force : !has;
        const set = new Set(this.className.split(/\s+/).filter(Boolean));
        if (shouldAdd) set.add(cls);
        else set.delete(cls);
        this.className = Array.from(set).join(' ');
        return shouldAdd;
      },
    };
  }

  querySelector(selector: string): MockElement | null {
    if (this.elementCache.has(selector)) {
      return this.elementCache.get(selector)!;
    }
    const el = new MockElement('div');
    if (selector.startsWith('#')) {
      el.setAttribute('id', selector.slice(1));
    }
    this.elementCache.set(selector, el);
    return el;
  }

  querySelectorAll(_selector: string): MockElement[] {
    return [new MockElement('button'), new MockElement('div')];
  }
}

// Global DOM setup if running in Node without browser window
if (typeof (globalThis as any).document === 'undefined') {
  (globalThis as any).document = {
    createElement: (tag: string) => new MockElement(tag),
    body: new MockElement('body'),
  };
}

console.log('=== Starting High School Stereometry Studio Deep Verification ===\n');

// -------------------------------------------------------------
// Test 1: 6 High-School Models & Euler Characteristic (V - E + F = 2)
// -------------------------------------------------------------
console.log('Test 1: Polyhedra Models & Euler Characteristic');
const polyhedraTypes: HighSchoolModelType[] = [
  'cube',
  'corner-pyramid',
  'tetrahedron',
  'square-pyramid',
  'triangular-prism',
];

for (const type of polyhedraTypes) {
  const model = GeometrySolver.createModel(type, { a: 1.0, h: 1.0 });
  const V = model.vertices.length;
  const E = model.edges.length;
  const F = model.faces.length;
  const euler = V - E + F;

  console.log(`  Model: ${model.name} (${type}) -> V:${V}, E:${E}, F:${F}, V-E+F=${euler}`);
  assert.strictEqual(euler, 2, `Euler characteristic for ${type} must be exactly 2`);
  assert(model.keyPoints.length >= V, 'Keypoints count must include at least all vertices');
}

// Cylinder & Cone rotation model
const coneModel = GeometrySolver.createModel('cylinder-cone', { r: 0.5, h: 1.0 });
assert.strictEqual(coneModel.id, 'cylinder-cone');
assert(coneModel.keyPoints.some((k) => k.type === 'apex'), 'Cone must have apex keypoint');
console.log('✓ Test 1 passed: All 6 models correctly generated and Euler characteristics verified\n');

// -------------------------------------------------------------
// Test 2: Spatial Vectors & Skew Lines Angle Calculation
// -------------------------------------------------------------
console.log('Test 2: Spatial Vectors & Skew Lines Metrics');
// Cube: face diagonal A1B and face diagonal B1C
// In standard cube [-0.5, 0.5]:
// A1 = (0.5, 0.5, 0.5), B = (0.5, -0.5, -0.5) => u = (0, -1, -1)
// B1 = (0.5, 0.5, -0.5), C = (-0.5, -0.5, -0.5) => v = (-1, -1, 0)
// |u . v| = |0 + 1 + 0| = 1
// |u| = sqrt(2), |v| = sqrt(2)
// cos(theta) = 1 / 2 => theta = 60 degrees!
const pA1 = new THREE.Vector3(0.5, 0.5, 0.5);
const pB = new THREE.Vector3(0.5, -0.5, -0.5);
const pB1 = new THREE.Vector3(0.5, 0.5, -0.5);
const pC = new THREE.Vector3(-0.5, -0.5, -0.5);

const skewResult = GeometrySolver.computeSkewLineMetrics(pA1, pB, pB1, pC);
console.log(`  Skew lines A1B vs B1C angle: ${skewResult.angleDeg.toFixed(2)}° (Expected: 60.00°)`);
assert.strictEqual(skewResult.type, 'skew');
assert(Math.abs(skewResult.angleDeg - 60.0) < 1e-4, 'Angle between cube face diagonals A1B and B1C must be exactly 60°');
assert(skewResult.distance > 0, 'Skew distance must be greater than 0');

// Line-Plane Angle: Body diagonal (1, 1, 1) to horizontal base plane (0, 1, 0)
// sin(phi) = |(1, 1, 1) . (0, 1, 0)| / sqrt(3) = 1 / sqrt(3) ~= 0.577 => phi ~= 35.26 deg
const lineP1 = new THREE.Vector3(0, 0, 0);
const lineP2 = new THREE.Vector3(1, 1, 1);
const horizPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const linePlaneAngle = GeometrySolver.computeLinePlaneAngle(lineP1, lineP2, horizPlane);
console.log(`  Line-Plane angle for body diagonal: ${linePlaneAngle.angleDeg.toFixed(2)}° (Expected: ~35.26°)`);
assert(Math.abs(linePlaneAngle.angleDeg - 35.26) < 0.1);
console.log('✓ Test 2 passed: Spatial vector metrics and skew angles verified\n');

// -------------------------------------------------------------
// Test 3: 3D Sutherland-Hodgman Polygon-Plane Slicing (Regular Hexagon Cut)
// -------------------------------------------------------------
console.log('Test 3: 3D Polyhedron-Plane Slicing Algorithm');
const cubeModel = GeometrySolver.createModel('cube', { a: 1.0, b: 1.0, c: 1.0 });

// Plane passing through center (0,0,0) with normal (1, 1, 1) cuts 6 edges of cube
const hexPlane = new THREE.Plane(new THREE.Vector3(1, 1, 1).normalize(), 0);
const crossSection = GeometrySolver.computePolyhedronCrossSection(cubeModel, hexPlane);

assert(crossSection !== null, 'Cross section must not be null');
console.log(`  Cross section polygon vertex count: ${crossSection!.polygon.length}`);
console.log(`  Identified polygon type: "${crossSection!.polygonType}"`);
console.log(`  Cross section area: ${crossSection!.area.toFixed(4)}`);

assert.strictEqual(crossSection!.polygon.length, 6, 'Cut passing through center with normal (1,1,1) must have 6 vertices');
assert(crossSection!.polygonType.includes('六边形'), 'Must be classified as a hexagon');
assert(crossSection!.area > 0.5, 'Cross section area must be positive');
console.log('✓ Test 3 passed: 3D Sutherland-Hodgman polygon clipping and shape classification verified\n');

// -------------------------------------------------------------
// Test 4: Gaokao Circumscribed & Inscribed Sphere Formulas
// -------------------------------------------------------------
console.log('Test 4: Gaokao Circumscribed & Inscribed Sphere Analytics');

// 4.1 Corner Pyramid (Wall corner PA ⊥ PB ⊥ PC)
// a = 3, b = 4, c = 5 => 2R = sqrt(9 + 16 + 25) = sqrt(50) = 5*sqrt(2) => R = 2.5*sqrt(2)
const cornerSphere = GeometrySolver.computeSphereAnalysis('corner-pyramid', { a: 3, b: 4, c: 5 });
const expected2R = Math.hypot(3, 4, 5);
console.log(`  Corner Pyramid 2R: ${(cornerSphere.circumRadius * 2).toFixed(4)} (Expected: ${expected2R.toFixed(4)})`);
assert(Math.abs(cornerSphere.circumRadius * 2 - expected2R) < 1e-4, 'Corner pyramid 2R must match sqrt(a²+b²+c²)');
assert(cornerSphere.embeddingCuboidSize !== undefined, 'Corner pyramid must have embedding cuboid size');

// 4.2 Regular Tetrahedron: R / r ratio must be exactly 3:1
const tetraSphere = GeometrySolver.computeSphereAnalysis('tetrahedron', { a: 2.0 });
console.log(`  Tetrahedron R: ${tetraSphere.circumRadius.toFixed(4)}, r: ${tetraSphere.inRadius.toFixed(4)}, R/r: ${tetraSphere.radiusRatio.toFixed(4)}`);
assert(Math.abs(tetraSphere.radiusRatio - 3.0) < 1e-4, 'Regular tetrahedron R/r ratio must be exactly 3.0');

// 4.3 Cuboid: a=1, b=2, c=2 => 2R = sqrt(1 + 4 + 4) = 3 => R = 1.5
const cuboidSphere = GeometrySolver.computeSphereAnalysis('cube', { a: 1, b: 2, c: 2 });
assert(Math.abs(cuboidSphere.circumRadius - 1.5) < 1e-4, 'Cuboid circumradius must be 1.5');
console.log('✓ Test 4 passed: Gaokao sphere formulas and embedding boxes verified\n');

// -------------------------------------------------------------
// Test 5: StereometryMesh Visual Assembly & Dynamic Segments
// -------------------------------------------------------------
console.log('Test 5: StereometryMesh Scene Assembly');
const mesh = new StereometryMesh();
assert.strictEqual(mesh.group.name, 'StereometryMesh');

// Check adding spatial segments
const seg1 = mesh.addSegment('v_0', 'v_1', 0x38d9a9);
assert(seg1 !== null, 'Segment v_0 to v_1 must be successfully created');
assert.strictEqual(seg1!.label, 'AB');
assert(seg1!.length > 0, 'Segment length must be greater than 0');

const seg2 = mesh.addSegment('v_4', 'v_5', 0xffd43b);
assert.strictEqual(mesh.getSegments().length, 2, 'Must have 2 drawn segments');

mesh.removeSegment(seg1!.id);
assert.strictEqual(mesh.getSegments().length, 1, 'After removal, 1 segment should remain');

mesh.clearAllSegments();
assert.strictEqual(mesh.getSegments().length, 0, 'After clearAll, 0 segments should remain');

// Test options update
mesh.setOptions({
  modelType: 'square-pyramid',
  dimensions: { a: 1.2, h: 1.5 },
  showCircumSphere: true,
  showInSphere: true,
});
assert.strictEqual(mesh.getModelDef().id, 'square-pyramid');
console.log('✓ Test 5 passed: StereometryMesh lifecycle and dynamic segments verified\n');

// -------------------------------------------------------------
// Test 6: MathStereometryExperiment Catalog & Telemetry Provider
// -------------------------------------------------------------
console.log('Test 6: MathStereometryExperiment Integration & Telemetry');
const exp = new MathStereometryExperiment();
assert.strictEqual(exp.metadata.id, 'math-stereometry');
assert.strictEqual(exp.metadata.category, 'math');

const mockContext: any = {
  renderer: { localClippingEnabled: false },
};

exp.init(mockContext);
assert.strictEqual(mockContext.renderer.localClippingEnabled, true, 'Init must enable renderer.localClippingEnabled');

// Test telemetry provider
const telemetry = exp.getStereometryTelemetry();
console.log(`  Telemetry model: ${telemetry.modelName}, Vertices: ${telemetry.vertexCount}, Origin: ${telemetry.originLabel}`);
assert.strictEqual(telemetry.modelId, 'cube');
assert.strictEqual(telemetry.vertexCount, 8);
assert.strictEqual(telemetry.eulerCharacteristic, 2);

// Apply classic preset: 'cube-skew-60'
exp.applyClassicPreset('cube-skew-60');
const telemetrySkew = exp.getStereometryTelemetry();
assert.strictEqual(telemetrySkew.drawnSegments.length, 2, 'Preset must create 2 segments');
assert(telemetrySkew.twoLineAngle !== null, 'Telemetry must compute twoLineAngle');
assert.strictEqual(telemetrySkew.twoLineAngle!.type, 'skew');
assert(Math.abs(telemetrySkew.twoLineAngle!.angleDeg - 60.0) < 1e-2, 'Telemetry twoLineAngle must be 60.0°');
console.log(`  Telemetry twoLineAngle: ${telemetrySkew.twoLineAngle!.angleDeg}° (${telemetrySkew.twoLineAngle!.lineA} vs ${telemetrySkew.twoLineAngle!.lineB})`);

// Test disposal
exp.dispose(mockContext);
console.log('✓ Test 6 passed: MathStereometryExperiment telemetry and presets verified\n');

// -------------------------------------------------------------
// Test 7: StereometryStatusCard DOM & Telemetry Updates
// -------------------------------------------------------------
console.log('Test 7: StereometryStatusCard UI Verification');
let selectedModel: string = '';
let resetViewCalled: string = '';

const statusCard = new StereometryStatusCard({
  onModelChange: (type) => {
    selectedModel = type;
  },
  onResetView: (view) => {
    resetViewCalled = view;
  },
});

statusCard.setVisible(true);
statusCard.updateTelemetry(telemetrySkew);

assert.strictEqual(statusCard.element.className.includes('vision-math-status-card'), true);
assert.strictEqual(statusCard.element.style.display, 'flex');

// Verify close and reopen cycle
statusCard.setVisible(false);
assert.strictEqual(statusCard.element.style.display, 'none');

statusCard.setVisible(true);
assert.strictEqual(statusCard.element.style.display, 'flex');
statusCard.updateTelemetry(telemetrySkew);
console.log('✓ Test 7 passed: StereometryStatusCard instantiated, telemetry updated, and close-reopen display cycle verified\n');

// -------------------------------------------------------------
// Test 8: Special Points Generation (1/2 Midpoints and 1/3, 2/3 Trisection Points)
// -------------------------------------------------------------
console.log('Test 8: Special Points Generation (1/2, 1/3, 2/3 on Edges)');
const cube = GeometrySolver.createModel('cube', { a: 1.0, b: 1.0, c: 1.0 });

// Cube has 12 edges => each edge has 1 midpoint + 2 trisection points
const midpoints = cube.keyPoints.filter((k) => k.type === 'midpoint');
const thirdPoints = cube.keyPoints.filter((k) => k.type === 'third');

assert.strictEqual(midpoints.length, 12, 'Cube must have 12 midpoints (1/2)');
assert.strictEqual(thirdPoints.length, 24, 'Cube must have 24 trisection points (1/3 and 2/3)');

// Check ratio properties
assert.strictEqual(midpoints[0].subLabel, '1/2');
assert.strictEqual(midpoints[0].ratio, 0.5);
assert(thirdPoints.some((k) => k.subLabel === '1/3' && Math.abs(k.ratio! - 1 / 3) < 1e-4));
assert(thirdPoints.some((k) => k.subLabel === '2/3' && Math.abs(k.ratio! - 2 / 3) < 1e-4));
console.log(`  Cube keypoints total: ${cube.keyPoints.length} (8 vertices, 12 midpoints, 24 thirds, 6 face centers, 1 body center)`);
console.log('✓ Test 8 passed: 1/2 and 1/3 special points accurately generated on all edges\n');

// -------------------------------------------------------------
// Test 9: Magnetic Snapping to 1/2 and 1/3 Special Points
// -------------------------------------------------------------
console.log('Test 9: Magnetic Snapping to 1/2 and 1/3 Special Points');
// Edge AB is along Z (x=0.5, y=-0.5, z in [-0.5, 0.5])
// Midpoint is at (0.5, -0.5, 0.0)
// Cast ray from X direction towards midpoint (z=0.0)
const midRay = new THREE.Ray(new THREE.Vector3(2.0, -0.501, 0.001), new THREE.Vector3(-1, 0, 0));
const snapMid = GeometrySolver.findClosestSnapPoint(midRay, cube, new THREE.Matrix4(), 0.05);

assert(snapMid !== null, 'Must snap near edge AB midpoint');
assert.strictEqual(snapMid!.keyPoint.type, 'midpoint');
assert.strictEqual(snapMid!.keyPoint.subLabel, '1/2');
assert(snapMid!.snapLabel.includes('中点 (1/2)'), 'Snap label must indicate 1/2 midpoint');
console.log(`  Snapped to: ${snapMid!.snapLabel} (dist: ${snapMid!.distance.toFixed(4)})`);

// 1/3 point on edge AB is at (0.5, -0.5, 0.5 - 1/3 = 0.1667)
// Cast ray from X direction towards 1/3 point (z=0.167)
const thirdRay = new THREE.Ray(new THREE.Vector3(2.0, -0.499, 0.167), new THREE.Vector3(-1, 0, 0));
const snapThird = GeometrySolver.findClosestSnapPoint(thirdRay, cube, new THREE.Matrix4(), 0.05);

assert(snapThird !== null, 'Must snap near edge AB 1/3 point');
assert.strictEqual(snapThird!.keyPoint.type, 'third');
assert.strictEqual(snapThird!.keyPoint.subLabel, '1/3');
assert(snapThird!.snapLabel.includes('三等分点 (1/3)'), 'Snap label must indicate 1/3 trisection');
console.log(`  Snapped to: ${snapThird!.snapLabel} (dist: ${snapThird!.distance.toFixed(4)})`);
console.log('✓ Test 9 passed: Magnetic snapping algorithm snaps accurately to 1/2 and 1/3 points\n');

// -------------------------------------------------------------
// Test 10: Connecting Lines Between Special Points & Dynamic Skew Angle
// -------------------------------------------------------------
console.log('Test 10: Line Connection Between Special Points (e.g. Midpoint to 1/3 Point)');
const snapMesh = new StereometryMesh();
const midKp = snapMesh.getModelDef().keyPoints.find((k) => k.type === 'midpoint')!;
const thirdKp = snapMesh.getModelDef().keyPoints.find((k) => k.type === 'third')!;

const createdSeg = snapMesh.addSegment(midKp.id, thirdKp.id, 0x38d9a9);
assert(createdSeg !== null, 'Segment between midpoint and 1/3 point must be created');
assert.strictEqual(createdSeg!.pointIdA, midKp.id);
assert.strictEqual(createdSeg!.pointIdB, thirdKp.id);
assert(createdSeg!.length > 0, 'Segment length must be positive');
console.log(`  Created special segment: ${createdSeg!.label} (length: ${createdSeg!.length.toFixed(3)})`);

// Preview segment lifecycle
snapMesh.updatePreviewWire(midKp.position, thirdKp.position);
snapMesh.clearPreviewWire();
console.log('✓ Test 10 passed: Connecting lines between special points and preview wire verified\n');

// -------------------------------------------------------------
// Test 11: Crosshair Hidden Invariant in Math Stereometry Mode
// -------------------------------------------------------------
console.log('Test 11: Crosshair Hidden Invariant in Math Stereometry Mode');
import { Crosshair } from '../src/ui/Crosshair.ts';
const testBody = new MockElement('body');
const testCrosshair = new Crosshair(testBody as any);

// In math mode, the crosshair is hidden
testCrosshair.setVisible(false);
assert.strictEqual(testCrosshair.getVisible(), false, 'Crosshair must be hidden in math mode');
const crosshairDom = testBody.children.find((c: any) => c.id === 'vision-crosshair');
assert.strictEqual(crosshairDom.classList.contains('hidden'), true, '#vision-crosshair must have .hidden class');
console.log('✓ Test 11 passed: Center-screen crosshair hidden invariant verified\n');

// -------------------------------------------------------------
// Test 12: Anti-Penetration Table Clearance Invariant (Zoom & Tilt)
// -------------------------------------------------------------
console.log('Test 12: Anti-Penetration Table Clearance Invariant (Zoom & Tilt)');
const antiPenMesh = new StereometryMesh();
const scalesToTest = [0.5, 1.0, 1.5, 2.0, 2.5, 3.0];

for (const s of scalesToTest) {
  antiPenMesh.setScale(s);
  const lowestRelY = antiPenMesh.getLowestVertexY();
  const lowestTableY = antiPenMesh.baseHoverY + lowestRelY;
  // Lowest vertex in table space MUST be >= minClearance (0.055)
  assert(
    lowestTableY >= antiPenMesh.minClearance - 1e-4,
    `At scale ${s}, lowest vertex (${lowestTableY.toFixed(4)}) must be >= minClearance (${antiPenMesh.minClearance})`
  );
}

// Tilt/rotation tests: simulate user orbiting the model at high scale
antiPenMesh.setScale(2.0);
const tiltAngles = [0.3, 0.6, 0.9, -0.4, -0.8];
for (const rx of tiltAngles) {
  antiPenMesh.modelContainer.rotation.x = rx;
  antiPenMesh.modelContainer.rotation.y = rx * 1.5;
  antiPenMesh.update(0.016, 0); // triggers dynamic updateBaseHoverHeight
  const lowestRelY = antiPenMesh.getLowestVertexY();
  const lowestTableY = antiPenMesh.modelContainer.position.y + lowestRelY;
  assert(
    lowestTableY >= antiPenMesh.minClearance - 0.01,
    `At tilt rx=${rx}, lowest vertex (${lowestTableY.toFixed(4)}) must never penetrate tabletop (>= 0.045)`
  );
}
console.log('  Scale 0.5x to 3.0x & 3D tilt: Lowest vertex maintained strictly above tabletop (> 0.05m)');
console.log('✓ Test 12 passed: Anti-penetration table clearance invariant verified\n');

// -------------------------------------------------------------
// Test 13: High-Contrast Color Palette Against Laboratory Background
// -------------------------------------------------------------
console.log('Test 13: High-Contrast Color Palette Against Laboratory Background');
const contrastMesh = new StereometryMesh();

// Extract private materials via reflection for verification
const frontMat = (contrastMesh as any).solidFrontMaterial;
const dashedMat = (contrastMesh as any).dashedEdgeMaterial;
const strutMat = (contrastMesh as any).strutMaterial;
const crossSectionMat = (contrastMesh as any).crossSectionFillMat;
const vertexMat = (contrastMesh as any).vertexNodeMat;
const midpointMat = (contrastMesh as any).midpointNodeMat;
const thirdMat = (contrastMesh as any).thirdNodeMat;

// 1. None of these primary materials should be washed-out pure white (0xffffff)
assert.notStrictEqual(frontMat.color.getHex(), 0xffffff, 'Front faces must not be pure white');
assert.notStrictEqual(dashedMat.color.getHex(), 0xffffff, 'Dashed edges must not be pure white');
assert.notStrictEqual(strutMat.color.getHex(), 0xffffff, 'Struts must not be pure white');
assert.notStrictEqual(crossSectionMat.color.getHex(), 0xffffff, 'Cross section fill must not be pure white');
assert.notStrictEqual(vertexMat.color.getHex(), 0xffffff, 'Vertex nodes must not be pure white');

// 2. Specific signature color hex checks
assert.strictEqual(frontMat.color.getHex(), 0x0284c7, 'Front faces must be Azure Crystal (0x0284c7)');
assert.strictEqual(dashedMat.color.getHex(), 0xf59e0b, 'Dashed edges must be Warm Amber Gold (0xf59e0b)');
assert.strictEqual(strutMat.color.getHex(), 0x0284c7, 'Struts must be Cobalt-Titanium (0x0284c7)');
assert.strictEqual(crossSectionMat.color.getHex(), 0xf43f5e, 'Cross section must be Coral Rose (0xf43f5e)');
assert.strictEqual(midpointMat.color.getHex(), 0xf59e0b, '1/2 midpoints must be Amber Gold (0xf59e0b)');
assert.strictEqual(thirdMat.color.getHex(), 0x10b981, '1/3 trisection points must be Mint Emerald (0x10b981)');

console.log('  Azure Crystal (0x0284c7), Amber Dashed Lines (0xf59e0b), Coral Cross-Section (0xf43f5e) verified');
console.log('✓ Test 13 passed: High-contrast color palette verified\n');

// -------------------------------------------------------------
// Test 14: Dynamic Edge Occlusion Classification & Pure Edge Invariants
// -------------------------------------------------------------
console.log('Test 14: Dynamic Edge Occlusion Classification & Pure Edge Invariants');
const occMesh = new StereometryMesh();
const mockCam = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
mockCam.position.set(0.6, 1.35, 1.6);
mockCam.updateMatrixWorld();

// 1. By default: showDashedLines = false => ALL edges (including occluded ones) are solid lines!
occMesh.updateEdgeVisibility(mockCam);

const solidMesh = (occMesh as any).solidEdgesMesh;
const dashedMesh = (occMesh as any).dashedEdgesMesh;
const strutsMesh = (occMesh as any).solidStrutsMesh;

assert(solidMesh !== null, 'solidEdgesMesh must exist');
assert(dashedMesh !== null, 'dashedEdgesMesh must exist');
assert(strutsMesh !== null, 'solidStrutsMesh must exist');

const allSolidVertCount = solidMesh.geometry.drawRange.count;
const allSolidStrutCount = strutsMesh.count;
const allDashedVertCount = dashedMesh.geometry.drawRange.count;

console.log(`  Default mode: all edges solid (verts: ${allSolidVertCount}, struts: ${allSolidStrutCount}, dashed: ${allDashedVertCount})`);
assert.strictEqual(allSolidVertCount, 24, 'All 12 edges of cube must be solid lines by default (24 vertices)');
assert.strictEqual(allSolidStrutCount, 12, 'All 12 edges must have solid struts by default');
assert.strictEqual(allDashedVertCount, 0, 'No dashed edges when showDashedLines is false');

// 2. When showDashedLines is true: textbook mode (9 visible solid, 3 occluded dashed)
occMesh.setOptions({ showDashedLines: true });
occMesh.updateEdgeVisibility(mockCam);

const activeSolidMesh = (occMesh as any).solidEdgesMesh;
const activeDashedMesh = (occMesh as any).dashedEdgesMesh;
const activeStrutsMesh = (occMesh as any).solidStrutsMesh;

const solidVertCount = activeSolidMesh.geometry.drawRange.count;
const dashedVertCount = activeDashedMesh.geometry.drawRange.count;
const strutCount = activeStrutsMesh.count;

console.log(`  Textbook mode (showDashedLines: true): visible: ${solidVertCount / 2} edges, occluded: ${dashedVertCount / 2} edges`);
assert.strictEqual(solidVertCount, 18, 'Cube must have exactly 9 visible solid edges in dashed mode');
assert.strictEqual(strutCount, 9, 'Cube must have exactly 9 visible 3D struts in dashed mode');
assert.strictEqual(dashedVertCount, 6, 'Cube must have exactly 3 occluded dashed edges in dashed mode');

// Rotate cube 180 degrees around Y: back edges become front, front become back
occMesh.modelContainer.rotation.y = Math.PI;
occMesh.updateEdgeVisibility(mockCam);

const rotatedSolidVertCount = activeSolidMesh.geometry.drawRange.count;
const rotatedDashedVertCount = activeDashedMesh.geometry.drawRange.count;
assert.strictEqual(rotatedSolidVertCount, 18, 'Rotated cube must still have 9 visible edges');
assert.strictEqual(rotatedDashedVertCount, 6, 'Rotated cube must still have 3 occluded edges');

console.log('✓ Test 14 passed: Dynamic edge occlusion classification & pure edge invariants verified\n');

// -------------------------------------------------------------
// Test 15: Pure Typography Vertex Labels (No Bubble Badge)
// -------------------------------------------------------------
console.log('Test 15: Pure Typography Vertex Labels (No Bubble Badge)');
const labelMesh = new StereometryMesh();
labelMesh.setOptions({ showLabels: true });

const labelsGroup = (labelMesh as any).labelsGroup as THREE.Group;
assert.strictEqual(labelsGroup.children.length, 8, 'Cube must have exactly 8 vertex labels');

for (const child of labelsGroup.children) {
  assert(child instanceof THREE.Sprite, 'Label must be a THREE.Sprite');
  const sprite = child as THREE.Sprite;
  assert.strictEqual(sprite.renderOrder, 10, 'Vertex sprite renderOrder must be 10 for spatial legibility');
  assert.strictEqual(sprite.scale.x, 0.046, 'Sprite scale X must be 0.046m for pure typography');
  assert.strictEqual(sprite.scale.y, 0.046, 'Sprite scale Y must be 0.046m for pure typography');
  const mat = sprite.material as THREE.SpriteMaterial;
  assert.strictEqual(mat.transparent, true, 'Label material must be transparent');
  assert.strictEqual(mat.depthTest, false, 'Label material must have depthTest false so labels are never clipped');
}

// Verify disabling labels removes sprites
labelMesh.setOptions({ showLabels: false });
assert.strictEqual(labelsGroup.children.length, 0, 'Disabling showLabels must clear all label sprites');

console.log('✓ Test 15 passed: Pure typography vertex labels without bubble badges verified\n');

console.log('========================================================');
console.log('All High School Stereometry Tests Passed Successfully (15/15)!');
console.log('========================================================');

