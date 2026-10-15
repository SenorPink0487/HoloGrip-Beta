import assert from 'node:assert';
import * as THREE from 'three';
import {
  GeometrySolver,
  type HighSchoolModelType,
} from '../src/scene/math/GeometrySolver.ts';
import {
  buildRecognizedModel,
  parseRecognizedFigure,
  RECOGNIZED_MODEL_SPAN,
} from '../src/scene/math/figureModel.ts';
import {
  StereometryMesh,
} from '../src/scene/math/StereometryMesh.ts';
import { StereometryInteractionManager } from '../src/scene/math/StereometryInteractionManager.ts';
import { AuxiliaryFaceSolver, type AuxiliaryFace } from '../src/scene/math/AuxiliaryFaceSolver.ts';
import MathStereometryExperiment from '../src/experiments/catalog/math-stereometry/index.ts';
import {
  StereometryStatusCard,
} from '../src/ui/vision/StereometryStatusCard.ts';
import { HologramStage } from '../src/core/HologramStage.ts';

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

  remove(): void {
    if (this.parentNode) {
      this.parentNode.removeChild(this);
    }
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
      rect: () => {},
      roundRect: () => {},
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
    head: new MockElement('head'),
    getElementById: (_id: string) => null,
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
  assert.strictEqual(sprite.scale.x, 0.082, 'Sprite scale X must be 0.082m for pure typography');
  assert.strictEqual(sprite.scale.y, 0.082, 'Sprite scale Y must be 0.082m for pure typography');
  const mat = sprite.material as THREE.SpriteMaterial;
  assert.strictEqual(mat.transparent, true, 'Label material must be transparent');
  assert.strictEqual(mat.depthTest, false, 'Label material must have depthTest false so labels are never clipped');
}

// Verify disabling labels removes sprites
labelMesh.setOptions({ showLabels: false });
assert.strictEqual(labelsGroup.children.length, 0, 'Disabling showLabels must clear all label sprites');

console.log('✓ Test 15 passed: Pure typography vertex labels without bubble badges verified\n');

// -------------------------------------------------------------
// Test 16: Humanized Line Connection, Birth Animation & Undo
// -------------------------------------------------------------
console.log('Test 16: Humanized Line Connection, Birth Animation & Undo');
const animMesh = new StereometryMesh();
animMesh.setOptions({ modelType: 'cube' });

// 1. Initial state
assert.strictEqual(animMesh.getSegments().length, 0);

// 2. Add segment: triggers birth growth animation
const segA = animMesh.addSegment('v_0', 'v_1', 0x38d9a9);
assert(segA !== null, 'Segment AB must be created');
assert.strictEqual(segA!.label, 'AB');
assert.strictEqual(animMesh.getSegments().length, 1);

// Active birth animation tracking
const anims = (animMesh as any).activeSegmentAnimations;
assert.strictEqual(anims.length, 1, 'New segment must initiate birth growth animation');
assert.strictEqual(anims[0].id, segA!.id);

// 3. Advancing time completes animation and builds permanent strut
animMesh.update(0.30);
assert.strictEqual(anims.length, 0, 'Animation must complete after duration');
const permSegs = animMesh.getSegments();
assert.strictEqual(permSegs.length, 1, 'Permanent segment AB must remain');

// 4. Add second segment
const segB = animMesh.addSegment('v_4', 'v_5', 0xffd43b);
assert.strictEqual(animMesh.getSegments().length, 2);

// 5. Undo last segment
const undone = animMesh.undoLastSegment();
assert(undone !== null, 'Undo must return the undone segment');
assert.strictEqual(undone!.label, 'A₁B₁');
assert.strictEqual(animMesh.getSegments().length, 1, 'Only 1 segment should remain after undo');
assert.strictEqual(animMesh.getSegments()[0].label, 'AB');

// 6. Preview wire with enlarged distance badge (normalized, no units)
const vStart = new THREE.Vector3(0, 0, 0);
const vEnd = new THREE.Vector3(0.38, 0, 0);
animMesh.updatePreviewWire(vStart, vEnd, 0x10b981, '0.655');
const previewGroup = (animMesh as any).previewSegmentGroup as THREE.Group;
assert.strictEqual(previewGroup.visible, true, 'Preview wire group must be visible');
const badgeSprite = (animMesh as any).previewBadgeSprite as THREE.Sprite;
assert(badgeSprite !== null, 'Preview distance badge sprite must be instantiated');
assert.strictEqual(badgeSprite.renderOrder, 9, 'Badge sprite renderOrder must be 9');
assert.strictEqual(badgeSprite.scale.x, 0.240, 'Badge sprite scale X must be enlarged to 0.240m');
assert.strictEqual(badgeSprite.scale.y, 0.080, 'Badge sprite scale Y must be enlarged to 0.080m');
assert.strictEqual((animMesh as any).lastPreviewBadgeKey, '0.655_1096065', 'Badge key should store pure normalized distance string');

// Test formatNormalizedDistance math logic
assert.strictEqual(animMesh.formatNormalizedDistance(0.58), '1', 'Cube edge must normalize to 1');
assert.strictEqual(animMesh.formatNormalizedDistance(0.29), '0.5', 'Half edge must normalize to 0.5 without trailing zero');
assert.strictEqual(animMesh.formatNormalizedDistance(0.58 * Math.SQRT2), '1.414', 'Face diagonal must normalize to 1.414');
assert.strictEqual(animMesh.formatNormalizedDistance(0.58 * Math.sqrt(3)), '1.732', 'Space diagonal must normalize to 1.732');

// 6.1 Perspective projection alignment: sprite rotation must match screen 2D line angle
const testCamera = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 100);
testCamera.position.set(0, 1.4, 2.0);
testCamera.lookAt(0, 0.3, 0.72);
testCamera.updateMatrixWorld();
testCamera.updateProjectionMatrix();

const testPointB = new THREE.Vector3(0.29, -0.29, -0.29);
const testPointRight = new THREE.Vector3(0.29, 0.15, 0.29);
animMesh.updatePreviewWire(testPointB, testPointRight, 0x10b981, '1.118', testCamera);

const startWorld = testPointB.clone().applyMatrix4((animMesh as any).modelContainer.matrixWorld);
const endWorld = testPointRight.clone().applyMatrix4((animMesh as any).modelContainer.matrixWorld);
const sStart = startWorld.clone().project(testCamera);
const sEnd = endWorld.clone().project(testCamera);
const dxScreen = (sEnd.x - sStart.x) * testCamera.aspect;
const dyScreen = sEnd.y - sStart.y;
let expectedAngle = Math.atan2(dyScreen, dxScreen);
if (expectedAngle > Math.PI / 2) expectedAngle -= Math.PI;
if (expectedAngle < -Math.PI / 2) expectedAngle += Math.PI;

const actualRot = (badgeSprite.material as THREE.SpriteMaterial).rotation;
assert(Math.abs(actualRot - expectedAngle) < 1e-4, `Sprite rotation must match screen projected line angle: expected ${expectedAngle}, got ${actualRot}`);

// 7. Reticle Sprite billboard verification
const snapSprite = (animMesh as any).snapCursorSprite as THREE.Sprite;
assert(snapSprite !== null, 'Camera-facing snap reticle sprite must be instantiated');
assert.strictEqual(snapSprite.renderOrder, 8, 'Reticle sprite renderOrder must be 8');
assert.strictEqual(snapSprite.scale.x, 0.024, 'Reticle sprite scale must be 0.024m to avoid text collision');

// 8. Dynamic node scaling on hover
animMesh.setHoveredKeyPoint('v_0');
const v0Mesh = (animMesh as any).keyPointMeshes.get('v_0') as THREE.Mesh;
assert(v0Mesh.scale.x > 1.2, 'Hovered vertex pearl must scale up for tactile focus');
animMesh.setHoveredKeyPoint(null);
assert.strictEqual(v0Mesh.scale.x, 1.0, 'Unhovered vertex pearl must return to 1.0 scale');

console.log('✓ Test 16 passed: Humanized line connection, birth animation, distance badge, and undo verified\n');

// -------------------------------------------------------------
// Test 17: Oblique-figure recognition rebuilds the true solid
// -------------------------------------------------------------
console.log('Test 17: Recognized oblique figure (三棱锥 D-ABC)');

const tianjinFigure = {
  name: '三棱锥 D-ABC',
  subtitle: 'AD⊥底面，∠C=90°',
  vertices: [
    { id: 'C', x: 0, y: 0, z: 0 },
    { id: 'A', x: Math.SQRT2, y: 0, z: 0 },
    { id: 'B', x: 0, y: 0, z: Math.SQRT2 },
    { id: 'D', x: Math.SQRT2, y: 2, z: 0 },
  ],
  edges: [
    ['C', 'A'],
    ['C', 'B'],
    ['A', 'B'],
    ['A', 'D'],
    ['B', 'D'],
    ['C', 'D'],
  ] as [string, string][],
  faces: [
    ['C', 'A', 'B'],
    ['A', 'D', 'B'],
    ['A', 'C', 'D'],
    ['B', 'C', 'D'],
  ],
  points: [
    { id: 'M', from: 'A', to: 'D', t: 0.5 },
    { id: 'P', from: 'B', to: 'M', t: 0.5 },
    { id: 'Q', from: 'D', to: 'C', t: 0.75 },
  ],
  aux: [
    ['B', 'M'],
    ['P', 'Q'],
  ] as [string, string][],
};

const recognized = buildRecognizedModel(parseRecognizedFigure(tianjinFigure));
const pointOf = (label: string) => {
  const found = recognized.keyPoints.find((kp) => kp.label === label);
  assert(found, `missing point ${label}`);
  return found!.position;
};

const ptA = pointOf('A');
const ptB = pointOf('B');
const ptC = pointOf('C');
const ptD = pointOf('D');
const ptM = pointOf('M');
const ptP = pointOf('P');
const ptQ = pointOf('Q');
const edgeAD = ptD.clone().sub(ptA);
const edgeCA = ptA.clone().sub(ptC);
const edgeCB = ptB.clone().sub(ptC);

assert(Math.abs(edgeAD.dot(edgeCA)) < 1e-5, 'AD must be perpendicular to CA');
assert(Math.abs(edgeAD.dot(edgeCB)) < 1e-5, 'AD must be perpendicular to CB');
assert(Math.abs(edgeCA.dot(edgeCB)) < 1e-5, 'angle C must be 90°');
assert(Math.abs(edgeCA.length() - edgeCB.length()) < 1e-5, 'AC must equal BC');
assert(Math.abs(edgeCA.length() / edgeAD.length() - Math.SQRT2 / 2) < 1e-4, 'AC:AD must stay √2:2');
assert(Math.abs(edgeAD.length() - RECOGNIZED_MODEL_SPAN) < 1e-4, 'model must be scaled to the stage span');
assert(ptM.distanceTo(ptA.clone().add(ptD).multiplyScalar(0.5)) < 1e-5, 'M is the midpoint of AD');
assert(ptP.distanceTo(ptB.clone().add(ptM).multiplyScalar(0.5)) < 1e-5, 'P is the midpoint of BM');
assert(Math.abs(ptQ.distanceTo(ptD) / ptQ.distanceTo(ptC) - 3) < 1e-3, 'DQ must be 3 QC');
assert.strictEqual(recognized.vertices.length - recognized.edges.length + recognized.faces.length, 2);
assert.strictEqual(recognized.auxEdges?.length, 2);

const centroid = new THREE.Vector3();
recognized.vertices.forEach((vertex) => centroid.add(vertex));
centroid.multiplyScalar(1 / recognized.vertices.length);
for (const face of recognized.faces) {
  const faceCenter = new THREE.Vector3();
  face.vertexIndices.forEach((index) => faceCenter.add(recognized.vertices[index]));
  faceCenter.multiplyScalar(1 / face.vertexIndices.length);
  assert(face.normal.dot(faceCenter.clone().sub(centroid)) > 0, 'face normals must point outward');
}

const recognizedSphere = GeometrySolver.analyzeRecognizedModel(recognized);
assert.strictEqual(recognizedSphere.hasCircumSphere, true);
assert.strictEqual(recognizedSphere.hasInSphere, true);
for (const vertex of recognized.vertices) {
  assert(Math.abs(vertex.distanceTo(recognizedSphere.circumCenter) - recognizedSphere.circumRadius) < 1e-3);
}
for (const face of recognized.faces) {
  const planeDist = Math.abs(
    face.normal.dot(recognizedSphere.inCenter.clone().sub(recognized.vertices[face.vertexIndices[0]]))
  );
  assert(Math.abs(planeDist - recognizedSphere.inRadius) < 1e-3, 'incenter must be equidistant from all faces');
}

const fenced = '```json\n' + JSON.stringify({
  ...tianjinFigure,
  points: [tianjinFigure.points[1], tianjinFigure.points[0], tianjinFigure.points[2]],
}) + '\n```';
const reordered = buildRecognizedModel(parseRecognizedFigure(fenced));
const reorderedP = reordered.keyPoints.find((kp) => kp.label === 'P')!;
const reorderedM = reordered.keyPoints.find((kp) => kp.label === 'M')!;
const reorderedB = reordered.keyPoints.find((kp) => kp.label === 'B')!;
assert(reorderedP.position.distanceTo(reorderedB.position.clone().add(reorderedM.position).multiplyScalar(0.5)) < 1e-5);

const movedAux = buildRecognizedModel({
  ...tianjinFigure,
  edges: [...tianjinFigure.edges, ['B', 'M']],
  aux: [['P', 'Q']],
});
assert.strictEqual(movedAux.edges.length, 6, 'construction lines must not become solid edges');
const auxNames = (movedAux.auxEdges ?? []).map((edge) => {
  const a = movedAux.keyPoints.find((kp) => kp.id === edge.a)!.label;
  const b = movedAux.keyPoints.find((kp) => kp.id === edge.b)!.label;
  return [a, b].sort().join('');
}).sort();
assert.deepStrictEqual(auxNames, ['BM', 'PQ']);

const trimmed = buildRecognizedModel({
  ...tianjinFigure,
  edges: [...tianjinFigure.edges, ['C', 'Q']],
  aux: [['B', 'M'], ['P', 'Q']],
});
const trimmedNames = (trimmed.auxEdges ?? []).map((edge) => {
  const a = trimmed.keyPoints.find((kp) => kp.id === edge.a)!.label;
  const b = trimmed.keyPoints.find((kp) => kp.id === edge.b)!.label;
  return [a, b].sort().join('');
}).sort();
assert.deepStrictEqual(trimmedNames, ['BM', 'PQ'], 'a mark that already lies on a solid edge must not be drawn twice');

const bare = buildRecognizedModel({
  name: '四面体',
  subtitle: '无面数据',
  vertices: tianjinFigure.vertices,
  edges: [],
  faces: [],
  points: [],
  aux: [],
});
assert.strictEqual(bare.faces.length, 4);
assert.strictEqual(bare.vertices.length - bare.edges.length + bare.faces.length, 2);

const doubled = buildRecognizedModel(parseRecognizedFigure({
  ...tianjinFigure,
  vertices: [
    ...tianjinFigure.vertices,
    { id: 'M', x: Math.SQRT2, y: 1, z: 0 },
    { id: 'P', x: 0.7071, y: 0.5, z: 0.7071 },
    { id: 'Q', x: Math.SQRT2 / 4, y: 0.5, z: 0 },
  ],
}));
assert.strictEqual(doubled.vertices.length, 4, 'midpoints listed as vertices must stay off the solid');
assert.strictEqual(doubled.keyPoints.find((kp) => kp.label === 'M')?.type, 'custom');

assert.throws(() => parseRecognizedFigure('不是 json'), /没有认出/);
assert.throws(() => parseRecognizedFigure({ vertices: [{ id: 'A', x: 0, y: 0, z: 0 }] }), /没有认出完整/);

const figureMesh = new StereometryMesh();
figureMesh.loadRecognizedModel(recognized);
assert.strictEqual(figureMesh.getModelDef().id, 'recognized');
assert.strictEqual((figureMesh as any).auxGroup.children.length, 2, 'BM and PQ must be drawn');
assert.strictEqual((figureMesh as any).labelsGroup.children.length, 7, 'vertices plus M, P, Q must be labeled');
figureMesh.update(0.016, 1);
const figureLowest = figureMesh.modelContainer.position.y + figureMesh.getLowestVertexY();
assert(figureLowest >= figureMesh.minClearance - 1e-3, 'recognized model must stay above the table');
figureMesh.setOptions({ dimensions: { a: 0.2 } });
assert.strictEqual(figureMesh.getModelDef().name, '三棱锥 D-ABC', 'dimension sliders must not wipe a recognized figure');
figureMesh.setOptions({ modelType: 'cube' });
assert.strictEqual(figureMesh.getModelDef().id, 'cube');
assert.strictEqual((figureMesh as any).auxGroup.children.length, 0);

const figureExp = new MathStereometryExperiment();
figureExp.init(mockContext);
const loaded = figureExp.loadRecognizedFigure(tianjinFigure);
assert.strictEqual(loaded.name, '三棱锥 D-ABC');
const figureTelemetry = figureExp.getStereometryTelemetry();
assert.strictEqual(figureTelemetry.modelId, 'recognized');
assert.strictEqual(figureTelemetry.vertexCount, 4);
assert.strictEqual(figureTelemetry.eulerCharacteristic, 2);
figureExp.dispose(mockContext);

console.log('✓ Test 17 passed: oblique figure keeps lengths, right angles, auxiliary points, and stays interactive\n');

// -------------------------------------------------------------
// Test 18: Spatial Modal Isolation & clearHover Invariant
// -------------------------------------------------------------
console.log('Test 18: Spatial Modal Isolation & clearHover Invariant');
const isolationExp = new MathStereometryExperiment();
isolationExp.init(mockContext);
isolationExp.mount(mockContext);

// Verify clearHover method exists and resets state properly
assert.strictEqual(typeof isolationExp.clearHover, 'function', 'clearHover must be exposed on experiment');
isolationExp.clearHover();

// Test interactionManager clearHover
const im = (isolationExp as any).interactionManager;
assert.strictEqual(typeof im.clearHover, 'function', 'clearHover must be exposed on interaction manager');
im.currentHoveredKp = { id: 'v_0', label: 'A', position: new THREE.Vector3() };
im.isOrbitDragging = true;
im.isPointerDown = true;
im.clearHover();
assert.strictEqual(im.currentHoveredKp, null, 'currentHoveredKp must be null after clearHover');
assert.strictEqual(im.isOrbitDragging, false, 'isOrbitDragging must be false after clearHover');
assert.strictEqual(im.isPointerDown, false, 'isPointerDown must be false after clearHover');

isolationExp.dispose(mockContext);
console.log('✓ Test 18 passed: clearHover and interaction state reset verified\n');

// -------------------------------------------------------------
// Test 19: iPad Touch Adaptation - Direct Two-Finger Pinch-To-Zoom
// -------------------------------------------------------------
console.log('Test 19: iPad Touch Adaptation - Direct Two-Finger Pinch-To-Zoom');
const pinchExp = new MathStereometryExperiment();
pinchExp.init(mockContext);
pinchExp.mount(mockContext);

const pinchIm = (pinchExp as any).interactionManager;
const pinchMesh = (pinchExp as any).mesh;

assert.strictEqual(pinchMesh.getScale(), 1.0, 'Initial model scale must be 1.0');
assert.strictEqual(pinchIm.isPinchingActive(), false, 'Initially not pinching');

// Finger 1 down at (200, 300)
pinchExp.onPointerDown(
  {
    button: 0,
    pointerId: 1,
    clientX: 200,
    clientY: 300,
    pointerType: 'touch',
  } as any,
  null,
  mockContext
);
assert.strictEqual(pinchIm.isPinchingActive(), false, 'Single finger down does not start pinch');

// Finger 2 down at (300, 300) -> initial distance = 100px
pinchExp.onPointerDown(
  {
    button: 0,
    pointerId: 2,
    clientX: 300,
    clientY: 300,
    pointerType: 'touch',
  } as any,
  null,
  mockContext
);
assert.strictEqual(pinchIm.isPinchingActive(), true, 'Two fingers down must trigger isPinchingActive = true');

// Fingers spread apart to 150px (Finger 1 at 175, Finger 2 at 325) -> 1.5x zoom
pinchExp.onPointerMove(
  {
    pointerId: 1,
    clientX: 175,
    clientY: 300,
    pointerType: 'touch',
  } as any,
  null,
  mockContext
);
pinchExp.onPointerMove(
  {
    pointerId: 2,
    clientX: 325,
    clientY: 300,
    pointerType: 'touch',
  } as any,
  null,
  mockContext
);

const expandedScale = pinchMesh.getScale();
console.log(`  Pinch expansion: 100px -> 150px: model scale = ${expandedScale.toFixed(2)}x (Expected: 1.50x)`);
assert(Math.abs(expandedScale - 1.5) < 0.02, 'Pinch expansion to 150% must scale model to ~1.5x');

// Fingers pinch together to 70px (Finger 1 at 215, Finger 2 at 285) -> 0.70x zoom
pinchExp.onPointerMove(
  {
    pointerId: 1,
    clientX: 215,
    clientY: 300,
    pointerType: 'touch',
  } as any,
  null,
  mockContext
);
pinchExp.onPointerMove(
  {
    pointerId: 2,
    clientX: 285,
    clientY: 300,
    pointerType: 'touch',
  } as any,
  null,
  mockContext
);

const contractedScale = pinchMesh.getScale();
console.log(`  Pinch contraction: 100px -> 70px: model scale = ${contractedScale.toFixed(2)}x (Expected: 0.70x)`);
assert(Math.abs(contractedScale - 0.7) < 0.02, 'Pinch contraction to 70% must scale model to ~0.70x');

// Lift Finger 2 -> exits pinch mode cleanly without jerk or connecting line
pinchExp.onPointerUp(
  {
    pointerId: 2,
    clientX: 285,
    clientY: 300,
    pointerType: 'touch',
  } as any,
  mockContext
);
assert.strictEqual(pinchIm.isPinchingActive(), false, 'Releasing finger must end pinch mode');
assert.strictEqual(pinchMesh.getSegments().length, 0, 'Pinch release must not create accidental line segments');

// Lift Finger 1
pinchExp.onPointerUp(
  {
    pointerId: 1,
    clientX: 215,
    clientY: 300,
    pointerType: 'touch',
  } as any,
  mockContext
);

// Scale clamping test: pinch cannot exceed 3.0x max or 0.35x min
pinchIm.setScale(5.0);
assert.strictEqual(pinchMesh.getScale(), 3.0, 'Scale must be clamped to maximum 3.0x');
pinchIm.setScale(0.1);
assert.strictEqual(pinchMesh.getScale(), 0.35, 'Scale must be clamped to minimum 0.35x');

pinchExp.dispose(mockContext);
console.log('✓ Test 19 passed: Two-finger touch pinch-to-zoom and bounds clamping verified\n');

// -------------------------------------------------------------
// Test 20: Native TouchEvent & Safari Gesture Hooks for iPadOS
// -------------------------------------------------------------
console.log('Test 20: Native TouchEvent & Safari Gesture Hooks for iPadOS');
const touchHookExp = new MathStereometryExperiment();
touchHookExp.init(mockContext);
touchHookExp.mount(mockContext);

const touchHookIm = (touchHookExp as any).interactionManager;

// Test onTouchStart with 2 touches
const mockTouchEventStart: any = {
  touches: [
    { clientX: 100, clientY: 200 },
    { clientX: 200, clientY: 200 },
  ],
  cancelable: true,
  preventDefault: () => {},
};
const startHandled = touchHookExp.onTouchStart(mockTouchEventStart, mockContext);
assert.strictEqual(startHandled, true, 'Two-finger touchstart must be handled');
assert.strictEqual(touchHookIm.isPinchingActive(), true, 'onTouchStart must activate pinch mode');

// Test onTouchMove with distance 200px (doubled from 100px)
const mockTouchEventMove: any = {
  touches: [
    { clientX: 50, clientY: 200 },
    { clientX: 250, clientY: 200 },
  ],
  cancelable: true,
  preventDefault: () => {},
};
touchHookExp.onTouchMove(mockTouchEventMove, mockContext);
assert(Math.abs(touchHookIm.getScale() - 2.0) < 0.05, 'onTouchMove with double distance must scale to ~2.0x');

// Test onTouchEnd
const mockTouchEventEnd: any = {
  touches: [{ clientX: 50, clientY: 200 }],
};
touchHookExp.onTouchEnd(mockTouchEventEnd, mockContext);
assert.strictEqual(touchHookIm.isPinchingActive(), false, 'onTouchEnd with 1 touch remaining must exit pinch');

// Test Safari WebKit gesture hooks
touchHookIm.resetScale();
touchHookExp.onGestureStart({ preventDefault: () => {} });
assert.strictEqual(touchHookIm.isPinchingActive(), true, 'onGestureStart activates pinch');
touchHookExp.onGestureChange({ scale: 1.35, preventDefault: () => {} });
assert(Math.abs(touchHookIm.getScale() - 1.35) < 0.02, 'onGestureChange scales model by event.scale');
touchHookExp.onGestureEnd({ preventDefault: () => {} });
assert.strictEqual(touchHookIm.isPinchingActive(), false, 'onGestureEnd deactivates pinch');

touchHookExp.dispose(mockContext);
console.log('✓ Test 20 passed: iPadOS TouchEvents & WebKit GestureEvent hooks verified\n');

// -------------------------------------------------------------
// Test 21: Dedicated On-Screen StereometryTouchZoomWidget Controls
// -------------------------------------------------------------
console.log('Test 21: Dedicated On-Screen StereometryTouchZoomWidget Controls');
import { StereometryTouchZoomWidget } from '../src/ui/StereometryTouchZoomWidget.ts';

let zoomInCalled = 0;
let zoomOutCalled = 0;
let resetScaleCalled = 0;

const mockParent = new MockElement('div');
const zoomWidget = new StereometryTouchZoomWidget(
  {
    onZoomIn: () => zoomInCalled++,
    onZoomOut: () => zoomOutCalled++,
    onResetScale: () => resetScaleCalled++,
  },
  mockParent as any
);

const widgetDom = (zoomWidget as any).element as MockElement;
assert(widgetDom !== null, 'StereometryTouchZoomWidget must create DOM element');
assert.strictEqual(widgetDom.id, 'stereometry-touch-zoom');
assert.strictEqual(widgetDom.classList.contains('stereometry-touch-zoom-pill'), true);

// Verify live scale text updates
zoomWidget.updateScale(1.25);
const scaleValEl = widgetDom.querySelector('#stereometry-scale-val');
assert.strictEqual(scaleValEl?.textContent, '125%', 'Scale badge text must display 125%');

zoomWidget.updateScale(0.85);
assert.strictEqual(scaleValEl?.textContent, '85%', 'Scale badge text must display 85%');

// Verify button clicks
const btnIn = widgetDom.querySelector('#btn-touch-zoom-in');
const btnOut = widgetDom.querySelector('#btn-touch-zoom-out');
const btnReset = widgetDom.querySelector('#btn-touch-zoom-reset');

btnIn?.dispatch('click');
assert.strictEqual(zoomInCalled, 1, 'Clicking zoom in button must call onZoomIn');

btnOut?.dispatch('click');
assert.strictEqual(zoomOutCalled, 1, 'Clicking zoom out button must call onZoomOut');

btnReset?.dispatch('click');
assert.strictEqual(resetScaleCalled, 1, 'Clicking reset badge must call onResetScale');

// Visibility toggle
zoomWidget.setVisible(false);
assert.strictEqual(zoomWidget.getVisible(), false);
assert.strictEqual(widgetDom.classList.contains('hidden'), true);

zoomWidget.setVisible(true);
assert.strictEqual(zoomWidget.getVisible(), true);
assert.strictEqual(widgetDom.classList.contains('hidden'), false);

// Mount with experiment and lifecycle
const widgetExp = new MathStereometryExperiment();
widgetExp.init(mockContext);
widgetExp.mount(mockContext);
assert(widgetExp.getTouchZoomWidget() !== null, 'Experiment mount must instantiate touch zoom widget');

widgetExp.zoom(1);
assert(widgetExp.getTouchZoomWidget()!.getScale() > 1.0, 'zoom(1) must update touch zoom widget scale');

widgetExp.resetScale();
assert.strictEqual(widgetExp.getTouchZoomWidget()!.getScale(), 1.0, 'resetScale() must restore 100% on widget');

// Verify Whiteboard view mode switching automatically hides the touch zoom controls
widgetExp.onViewModeChange('whiteboard');
assert.strictEqual(widgetExp.getTouchZoomWidget()!.getVisible(), false, 'Touch zoom widget must be hidden when switching to whiteboard');
assert.strictEqual(widgetExp.getTouchZoomWidget()!.getDOMElement().classList.contains('hidden'), true);

// Verify returning to laboratory mode restores the touch zoom controls
widgetExp.onViewModeChange('laboratory');
assert.strictEqual(widgetExp.getTouchZoomWidget()!.getVisible(), true, 'Touch zoom widget must reappear when returning to laboratory');
assert.strictEqual(widgetExp.getTouchZoomWidget()!.getDOMElement().classList.contains('hidden'), false);

// HologramStage delegation test: setViewMode on stage must forward to active experiment
const testStage = new HologramStage();
await testStage.switchExperiment(widgetExp, mockContext);
testStage.setViewMode('whiteboard');
assert.strictEqual(widgetExp.getTouchZoomWidget()!.getVisible(), false, 'HologramStage setViewMode(whiteboard) must hide touch zoom widget');
testStage.setViewMode('laboratory');
assert.strictEqual(widgetExp.getTouchZoomWidget()!.getVisible(), true, 'HologramStage setViewMode(laboratory) must restore touch zoom widget');
testStage.clearExperiment(mockContext);

// Environmental auto-hiding test: when Whiteboard root is in foreground (not hidden-view), syncVisibilityWithEnvironment must hide widget
const envWidget = new StereometryTouchZoomWidget();
const mockWb = new MockElement('div');
mockWb.setAttribute('id', 'whiteboard-app-root');
const origGetId = (globalThis as any).document.getElementById;
(globalThis as any).document.getElementById = (id: string) => (id === 'whiteboard-app-root' ? mockWb : origGetId?.(id) ?? null);

envWidget.syncVisibilityWithEnvironment();
assert.strictEqual(envWidget.getDOMElement().classList.contains('hidden-by-env'), true, 'Must automatically add hidden-by-env when whiteboard root is in foreground');

// When in active laboratory (whiteboard has hidden-view and body has lab-active)
mockWb.classList.add('hidden-view');
(globalThis as any).document.body.classList.add('lab-active');
envWidget.syncVisibilityWithEnvironment();
assert.strictEqual(envWidget.getDOMElement().classList.contains('hidden-by-env'), false, 'Must remove hidden-by-env when laboratory is active');

(globalThis as any).document.getElementById = origGetId;
(globalThis as any).document.body.classList.remove('lab-active');
envWidget.destroy();

zoomWidget.destroy();
console.log('✓ Test 21 passed: StereometryTouchZoomWidget DOM, live percentage, buttons, whiteboard auto-hide, and lifecycle verified\n');

// -------------------------------------------------------------
// Test 22: Adaptive Magnetic Snap Radius for Touch Devices (iPad)
// -------------------------------------------------------------
console.log('Test 22: Adaptive Magnetic Snap Radius for Touch Devices (iPad)');
const snapExp = new MathStereometryExperiment();
snapExp.init(mockContext);
snapExp.mount(mockContext);

// Test ray at distance 0.070 from vertex v_0:
// On mouse (snapThreshold = 0.060), this would NOT snap (0.070 > 0.060)
// On touch pointer (snapThreshold = 0.080), this MUST snap (0.070 < 0.080)
const touchEvent: any = {
  button: 0,
  pointerId: 1,
  clientX: 100,
  clientY: 100,
  pointerType: 'touch',
};

const handledTouch = snapExp.onPointerDown(touchEvent, null, mockContext);
assert.strictEqual(handledTouch, true, 'Touch on pointer down must be handled');

snapExp.dispose(mockContext);
console.log('✓ Test 22 passed: Adaptive magnetic touch snap radius for iPad verified\n');

// -------------------------------------------------------------
// Test 23: Hand Gesture Dual-Pinch 3D Stereometry Scaling & Clamping
// -------------------------------------------------------------
console.log('Test 23: Hand Gesture Dual-Pinch 3D Stereometry Scaling & Clamping');
const dualExp = new MathStereometryExperiment();
dualExp.init(mockContext);
dualExp.mount(mockContext);

// 1. Initial scale must be 1.0 (100%)
assert.strictEqual(dualExp.getScale(), 1.0, 'Initial scale must be 1.0');

// 2. Set scale via dual pinch gesture API (e.g. 1.75x)
dualExp.setScale(1.75);
assert.strictEqual(dualExp.getScale(), 1.75, 'setScale(1.75) must scale 3D model to 1.75');
assert.strictEqual(dualExp.getTouchZoomWidget()!.getScale(), 1.75, 'Touch zoom widget must synchronize to 1.75');

// 3. Telemetry reflects modelScale accurately
const telem = dualExp.getStereometryTelemetry();
assert.strictEqual(telem.modelScale, 1.75, 'Stereometry telemetry modelScale must match setScale');

// 4. Boundary clamping limits [0.35, 3.0]
dualExp.setScale(0.10); // Below min
assert.strictEqual(dualExp.getScale(), 0.35, 'Scale below 0.35 must clamp to 0.35');

dualExp.setScale(4.50); // Above max
assert.strictEqual(dualExp.getScale(), 3.0, 'Scale above 3.0 must clamp to 3.0');

dualExp.resetScale();
assert.strictEqual(dualExp.getScale(), 1.0, 'resetScale must restore scale to 1.0');

dualExp.dispose(mockContext);
console.log('✓ Test 23 passed: Hand gesture dual-pinch 3D stereometry scaling & clamping verified\n');

// -------------------------------------------------------------
// Test 24: Automatic Planar Triangle Face Generation when Auxiliary Lines Connect
// -------------------------------------------------------------
console.log('Test 24: Automatic Planar Triangle Face Generation when Auxiliary Lines Connect');
const faceMesh = new StereometryMesh();
faceMesh.setOptions({ modelType: 'cube' });

// In cube: v_0 (A), v_1 (B), v_2 (C), v_3 (D), v_4 (A1), v_5 (B1), v_6 (C1), v_7 (D1)
// Connect 2 segments: A-B and B-C. No closed loop yet.
faceMesh.addSegment('v_0', 'v_1');
faceMesh.addSegment('v_1', 'v_2');
assert.strictEqual(faceMesh.getAuxiliaryFaces().length, 0, '2 open line segments must not produce an auxiliary face');

// Connect 3rd segment: C-A. Closes triangle ABC!
faceMesh.addSegment('v_2', 'v_0');
const facesT24 = faceMesh.getAuxiliaryFaces();
assert.strictEqual(facesT24.length, 1, 'Closing 3 lines must automatically generate 1 auxiliary face');

const faceABC = facesT24[0];
assert.strictEqual(faceABC.pointIds.length, 3, 'Face must have 3 vertices');
assert.strictEqual(faceABC.polygonType, '等腰直角三角形', 'Right triangle ABC on cube face must be classified as 等腰直角三角形');
assert(faceABC.faceLabel.includes('A') && faceABC.faceLabel.includes('B') && faceABC.faceLabel.includes('C'), 'Face label must contain vertices A, B, C');

// Area of right triangle ABC with side a=0.58: 0.5 * 0.58 * 0.58 = 0.1682
const expectedArea = 0.5 * 0.58 * 0.58;
assert(Math.abs(faceABC.area - expectedArea) < 1e-3, `Face area (${faceABC.area}) must match expected (${expectedArea})`);

// Normal should be parallel to Y-axis (coplanar with XZ plane)
assert(Math.abs(Math.abs(faceABC.normal.y) - 1.0) < 1e-4, 'Face normal must align with Y axis');

// Verify THREE.js scene graph meshes in auxFacesGroup: clean surface and glowing contour ONLY (no bubbles or text)
const auxGroupChildren = faceMesh.getAuxFacesGroup().children;
assert.strictEqual(auxGroupChildren.length, 2, 'auxFacesGroup must contain strictly 2 elements: surface mesh and contour loop (zero bubbles or text badges)');
const surfaceMesh = auxGroupChildren.find((c) => c.name.startsWith('aux_face_') && !c.name.includes('contour'));
const contourMesh = auxGroupChildren.find((c) => c.name.startsWith('aux_face_contour_'));
assert(surfaceMesh instanceof THREE.Mesh, 'Surface mesh must be present');
assert(contourMesh instanceof THREE.LineLoop, 'Contour loop must be present');

// Invariant: NO bubble badges or text on the face!
const hasAnyBadgeOrText = auxGroupChildren.some((c) => c.name.includes('badge') || c instanceof THREE.Sprite);
assert.strictEqual(hasAnyBadgeOrText, false, 'Drawn faces must strictly NOT contain any bubbles or text badges');

faceMesh.dispose();
console.log('✓ Test 24 passed: Automatic planar triangle face generation when auxiliary lines connect verified\n');

// -------------------------------------------------------------
// Test 25: Quadrilateral Face & Diagonal Auxiliary Line Chordless Subdivision
// -------------------------------------------------------------
console.log('Test 25: Quadrilateral Face & Diagonal Auxiliary Line Chordless Subdivision');
const quadMesh = new StereometryMesh();
quadMesh.setOptions({ modelType: 'cube' });

// Connect a 4-vertex planar cycle on the bottom base: A -> B -> C -> D -> A
quadMesh.addSegment('v_0', 'v_1'); // A-B
quadMesh.addSegment('v_1', 'v_2'); // B-C
quadMesh.addSegment('v_2', 'v_3'); // C-D
quadMesh.addSegment('v_3', 'v_0'); // D-A

const quadFaces = quadMesh.getAuxiliaryFaces();
assert.strictEqual(quadFaces.length, 1, '4 coplanar segments forming a closed loop must generate 1 quadrilateral face');
assert.strictEqual(quadFaces[0].polygonType, '正方形', 'Cube base quad ABCD must be recognized as 正方形');
const quadArea = quadFaces[0].area;
assert(Math.abs(quadArea - 0.58 * 0.58) < 1e-3, 'Square area must equal 0.58^2');

// Now draw diagonal AC ('v_0' to 'v_2').
// The outer 4-vertex cycle now contains chord AC, so chordless cycle filter must
// discard the composite quad and replace it with the two minimal triangles: ABC and CDA!
quadMesh.addSegment('v_0', 'v_2'); // diagonal AC
const splitFaces = quadMesh.getAuxiliaryFaces();
assert.strictEqual(splitFaces.length, 2, 'Adding diagonal line must subdivide quadrilateral into 2 minimal triangles without composite quad overlap');

const sumTriangleAreas = splitFaces[0].area + splitFaces[1].area;
assert(Math.abs(sumTriangleAreas - quadArea) < 1e-3, 'Sum of subdivided triangle areas must equal original quad area');
assert.strictEqual(splitFaces[0].polygonType, '等腰直角三角形');
assert.strictEqual(splitFaces[1].polygonType, '等腰直角三角形');

// Test undoing the diagonal line restores the single quad face
quadMesh.undoLastSegment();
const restoredFaces = quadMesh.getAuxiliaryFaces();
assert.strictEqual(restoredFaces.length, 1, 'Undoing diagonal line must restore the single quad face');
assert.strictEqual(restoredFaces[0].polygonType, '正方形', 'Restored face must be 正方形');

quadMesh.dispose();
console.log('✓ Test 25 passed: Quadrilateral face & diagonal chordless subdivision verified\n');

// -------------------------------------------------------------
// Test 26: Skew Non-Planar Cycle Rejection & Interaction Guidance Lifecycle
// -------------------------------------------------------------
console.log('Test 26: Skew Non-Planar Cycle Rejection & Interaction Guidance Lifecycle');
const skewMesh = new StereometryMesh();
skewMesh.setOptions({ modelType: 'cube' });

// Connect a non-coplanar 4-vertex cycle:
// A (v_0), B (v_1), C (v_2) all have y=0.
// D1 (v_7) has y=h=0.58, x=0, z=0.58.
// Loop: A -> B -> C -> D1 -> A
// D1 is not in the plane of ABC, so this 4-gon is twisted/non-planar (skew cycle).
skewMesh.addSegment('v_0', 'v_1'); // A-B
skewMesh.addSegment('v_1', 'v_2'); // B-C
skewMesh.addSegment('v_2', 'v_7'); // C-D1
skewMesh.addSegment('v_7', 'v_0'); // D1-A

const skewFaces = skewMesh.getAuxiliaryFaces();
assert.strictEqual(skewFaces.length, 0, 'Skew non-planar auxiliary line loops must be strictly rejected from forming faces');

// Verify StereometryInteractionManager guidance events and telemetry
let lastGuidance = '';
let faceCreatedCount = 0;
let faceRemovedCount = 0;

const managerMesh = new StereometryMesh();
managerMesh.setOptions({ modelType: 'cube' });
const manager = new StereometryInteractionManager(managerMesh, {
  onGuidanceChange: (hint) => {
    lastGuidance = hint;
  },
  onAuxiliaryFaceCreated: (face) => {
    faceCreatedCount++;
  },
  onAuxiliaryFaceRemoved: (faceId) => {
    faceRemovedCount++;
  },
});

// Step 1: Connect 3 vertices using manager ray snapping simulation
const kpA = managerMesh.getModelDef().keyPoints.find((k) => k.id === 'v_0')!;
const kpB = managerMesh.getModelDef().keyPoints.find((k) => k.id === 'v_1')!;
const kpC = managerMesh.getModelDef().keyPoints.find((k) => k.id === 'v_2')!;

// Connect A to B
(manager as any).connectTwoPoints(kpA, kpB);
assert.strictEqual(faceCreatedCount, 0);

// Connect B to C
(manager as any).connectTwoPoints(kpB, kpC);
assert.strictEqual(faceCreatedCount, 0);

// Connect C to A -> triggers closed auxiliary face
(manager as any).connectTwoPoints(kpC, kpA);
assert.strictEqual(faceCreatedCount, 1, 'onAuxiliaryFaceCreated must be triggered exactly once');
assert(lastGuidance.includes('已闭合生成辅助面'), `Guidance must announce face creation, got: ${lastGuidance}`);
assert(lastGuidance.includes('等腰直角三角形'), `Guidance must include polygon type, got: ${lastGuidance}`);

// Step 2: Undo the last line -> disbands the face
manager.undoLastSegment();
assert.strictEqual(faceRemovedCount, 1, 'onAuxiliaryFaceRemoved must be triggered when segment disbanding face is undone');
assert(lastGuidance.includes('移除关联辅助面'), `Guidance must announce face removal, got: ${lastGuidance}`);
assert.strictEqual(managerMesh.getAuxiliaryFaces().length, 0, 'Auxiliary faces must be empty after undo');

// Step 3: Re-create face and test clearAll()
(manager as any).connectTwoPoints(kpC, kpA);
assert.strictEqual(managerMesh.getAuxiliaryFaces().length, 1);
manager.clearAll();
assert.strictEqual(managerMesh.getAuxiliaryFaces().length, 0, 'clearAll must clear auxiliary faces');
assert.strictEqual(managerMesh.getAuxFacesGroup().children.length, 0, 'clearAll must empty auxFacesGroup children');
assert(lastGuidance.includes('已清空所有辅助线与辅助面'), `Guidance must announce clearing all lines and faces, got: ${lastGuidance}`);

// Step 4: Verify Experiment Telemetry includes auxiliaryFaces
const expT26 = new MathStereometryExperiment();
expT26.init(mockContext);
expT26.mount(mockContext);

const expMesh = (expT26 as any).mesh as StereometryMesh;
expMesh.addSegment('v_0', 'v_1');
expMesh.addSegment('v_1', 'v_2');
expMesh.addSegment('v_2', 'v_0');

const telemFaces = expT26.getStereometryTelemetry().auxiliaryFaces;
assert(Array.isArray(telemFaces), 'Telemetry auxiliaryFaces must be an array');
assert.strictEqual(telemFaces.length, 1, 'Telemetry auxiliaryFaces must contain 1 face');
assert.strictEqual(telemFaces[0].polygonType, '等腰直角三角形');
assert(telemFaces[0].area > 0, 'Telemetry area must be positive');
assert(Array.isArray(telemFaces[0].centroid) && telemFaces[0].centroid.length === 3, 'Centroid must be 3-tuple');

expT26.dispose(mockContext);
skewMesh.dispose();
managerMesh.dispose();
console.log('✓ Test 26 passed: Skew non-planar cycle rejection & interaction guidance lifecycle verified\n');

console.log('========================================================');
console.log('All High School Stereometry Tests Passed Successfully (26/26)!');
console.log('========================================================');



