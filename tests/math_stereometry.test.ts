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
  public className: string = '';
  public innerHTML: string = '';
  public textContent: string = '';
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

console.log('========================================================');
console.log('All High School Stereometry Tests Passed Successfully (7/7)!');
console.log('========================================================');
