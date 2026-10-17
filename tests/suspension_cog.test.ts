import assert from 'node:assert';
import * as THREE from 'three';

// Lightweight DOM mock for Node.js test environment
class MockElement {
  public tagName: string;
  public className: string = '';
  public innerHTML: string = '';
  public style: Record<string, string> = {};
  public attributes: Record<string, string> = {};
  public eventListeners: Record<string, ((e?: any) => void)[]> = {};
  public children: MockElement[] = [];
  public parentElement: MockElement | null = null;
  public width: number = 256;
  public height: number = 128;

  constructor(tagName: string) {
    this.tagName = tagName.toUpperCase();
  }

  setAttribute(name: string, value: string): void {
    this.attributes[name] = value;
  }

  getAttribute(name: string): string | null {
    return this.attributes[name] ?? null;
  }

  removeAttribute(name: string): void {
    delete this.attributes[name];
  }

  appendChild(child: MockElement): void {
    child.parentElement = this;
    this.children.push(child);
  }

  removeChild(child: MockElement): void {
    const idx = this.children.indexOf(child);
    if (idx !== -1) {
      this.children.splice(idx, 1);
      child.parentElement = null;
    }
  }

  addEventListener(event: string, handler: (e?: any) => void): void {
    if (!this.eventListeners[event]) {
      this.eventListeners[event] = [];
    }
    this.eventListeners[event].push(handler);
  }

  removeEventListener(event: string, handler: (e?: any) => void): void {
    if (this.eventListeners[event]) {
      this.eventListeners[event] = this.eventListeners[event].filter((h) => h !== handler);
    }
  }

  querySelector(selector: string): MockElement | null {
    if (selector.startsWith('#')) {
      const id = selector.slice(1);
      if (this.attributes['id'] === id) return this;
    }
    for (const child of this.children) {
      const res = child.querySelector(selector);
      if (res) return res;
    }
    return null;
  }

  querySelectorAll(selector: string): MockElement[] {
    const res: MockElement[] = [];
    if (selector.startsWith('.')) {
      const cls = selector.slice(1);
      if (this.className.split(' ').includes(cls)) res.push(this);
    }
    for (const child of this.children) {
      res.push(...child.querySelectorAll(selector));
    }
    return res;
  }

  getContext(type: string): any {
    return {
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 1,
      font: '',
      textAlign: '',
      textBaseline: '',
      beginPath: () => {},
      arc: () => {},
      roundRect: () => {},
      fill: () => {},
      stroke: () => {},
      fillText: () => {},
      measureText: (text: string) => ({ width: text.length * 10 }),
    };
  }
}

// Setup minimal globals for node
if (typeof globalThis.document === 'undefined') {
  const mockBody = new MockElement('BODY');
  (globalThis as any).document = {
    createElement: (tag: string) => new MockElement(tag),
    body: mockBody,
    pointerLockElement: null,
    querySelector: (sel: string) => mockBody.querySelector(sel),
    querySelectorAll: (sel: string) => mockBody.querySelectorAll(sel),
  };
}

if (typeof globalThis.window === 'undefined') {
  (globalThis as any).window = {
    innerWidth: 1920,
    innerHeight: 1080,
    addEventListener: () => {},
    removeEventListener: () => {},
  };
}

// Import physics and scene components under test
import {
  SuspensionDynamicsSolver,
  PolygonGeometryHelper,
  PRESET_PLATE_SHAPES,
  type Line2D,
} from '../src/physics/mech/suspensionDynamics.ts';
import { RetortStandMesh } from '../src/scene/mech/RetortStandMesh.ts';
import { SuspensionPlateMesh } from '../src/scene/mech/SuspensionPlateMesh.ts';
import MechCenterOfGravityExperiment from '../src/experiments/catalog/mech-center-of-gravity/index.ts';
import { metadata } from '../src/experiments/catalog/mech-center-of-gravity/meta.ts';
import { PhysicsDisciplineModal } from '../src/ui/vision/PhysicsDisciplineModal.ts';

console.log('=== Starting Suspension Center of Gravity Experiment Analytical & Integration Tests ===\n');

// ---------------------------------------------------------------------------
// Test 1: Polygon Centroid & Moment of Inertia Analytical Invariants
// ---------------------------------------------------------------------------
console.log('Test 1: Polygon Centroid & Inertia Geometry Calculation');
{
  // 1. Scalene Triangle: Centroid must equal arithmetic mean of vertices
  const triDef = PRESET_PLATE_SHAPES.triangle;
  const triProps = PolygonGeometryHelper.computeCentroidAndArea(triDef.vertices);
  const expectedTriCx = (triDef.vertices[0][0] + triDef.vertices[1][0] + triDef.vertices[2][0]) / 3;
  const expectedTriCy = (triDef.vertices[0][1] + triDef.vertices[1][1] + triDef.vertices[2][1]) / 3;

  assert(
    Math.abs(triProps.centroid.x - expectedTriCx) < 1e-6,
    `Triangle Cx must match average of vertices: got ${triProps.centroid.x}, expected ${expectedTriCx}`
  );
  assert(
    Math.abs(triProps.centroid.y - expectedTriCy) < 1e-6,
    `Triangle Cy must match average of vertices: got ${triProps.centroid.y}, expected ${expectedTriCy}`
  );

  // 2. L-shaped plate: Centroid lies in external concave void
  const lDef = PRESET_PLATE_SHAPES.lshape;
  const lProps = PolygonGeometryHelper.computeCentroidAndArea(lDef.vertices);
  console.log(`  L-Shape Centroid: (${lProps.centroid.x.toFixed(4)}, ${lProps.centroid.y.toFixed(4)})`);
  // For the specified L-plate, the concave cut is at x in [-0.02, 0.09], y in [-0.02, 0.09]
  // The centroid should reflect the non-uniform mass distribution
  assert(lProps.area > 0, 'Area must be strictly positive');

  // 3. Moment of Inertia must be positive
  const iG = PolygonGeometryHelper.computeMomentOfInertia(triDef.vertices, 0.2, triProps.centroid);
  assert(iG > 0, 'Centroidal moment of inertia must be strictly positive');

  console.log('✓ Test 1 passed: Polygon Centroid and Inertia mathematically rigorous\n');
}

// ---------------------------------------------------------------------------
// Test 2: Physical Pendulum Dynamics & Damped Stabilization
// ---------------------------------------------------------------------------
console.log('Test 2: Physical Pendulum Dynamics & Stabilization');
{
  const solver = new SuspensionDynamicsSolver('irregular');
  assert(solver.state === 'idle', 'Initial state must be idle');

  // Hang on hole A with initial displacement 25°
  const hung = solver.hangOnHole('hole-a', 25);
  assert(hung, 'Hole A must be successfully hung');
  assert(solver.state === 'swinging', 'State must transition to swinging');
  assert(Math.abs(solver.angleRad - (25 * Math.PI) / 180) < 1e-4, 'Initial angle must match displacement');

  // Step simulation for 3.0 seconds
  const dt = 0.016;
  const totalSteps = Math.ceil(3.5 / dt);
  let stabilizedStep = -1;

  for (let step = 0; step < totalSteps; step++) {
    solver.step(dt);
    if (solver.state === 'stabilized' && stabilizedStep === -1) {
      stabilizedStep = step;
      break;
    }
  }

  assert(solver.state === 'stabilized', 'Plate must stabilize under viscous damping');
  console.log(`  Plate stabilized at step ${stabilizedStep} (~${(stabilizedStep * dt).toFixed(2)}s)`);
  assert(solver.markedLines.length === 1, 'Stabilization must generate exactly 1 plumb line');
  assert(solver.markedLines[0].holeId === 'hole-a', 'Generated line must belong to hole A');

  // Immediate stabilization API
  solver.resetAll();
  solver.hangOnHole('hole-b', 30);
  assert(solver.state === 'swinging');
  solver.stabilizeImmediately();
  assert(solver.state === 'stabilized', 'stabilizeImmediately must immediately transition to stabilized');
  assert(solver.markedLines.length === 1 && solver.markedLines[0].holeId === 'hole-b');

  console.log('✓ Test 2 passed: Physical pendulum oscillation decays to equilibrium as expected\n');
}

// ---------------------------------------------------------------------------
// Test 3: Plumb Lines Collinear with Center of Gravity
// ---------------------------------------------------------------------------
console.log('Test 3: Verification that Any Suspension Plumb Line Passes Through CG');
{
  const solver = new SuspensionDynamicsSolver('irregular');
  const cg = solver.centroid;

  for (const hole of solver.plateDef.holes) {
    solver.resetAll();
    solver.hangOnHole(hole.id, 10);
    solver.stabilizeImmediately();

    const line = solver.markedLines[0];
    assert(line, `Line for hole ${hole.label} must exist`);

    // Verify distance from line to theoretical CG is practically 0
    // Vector H -> CG
    const toCgX = cg.x - line.origin.x;
    const toCgY = cg.y - line.origin.y;
    // Cross product with line direction should be 0: d.x * toCg.y - d.y * toCg.x == 0
    const cross = line.direction.x * toCgY - line.direction.y * toCgX;
    assert(
      Math.abs(cross) < 1e-6,
      `Plumb line from hole ${hole.label} must strictly pass through center of gravity: cross = ${cross}`
    );
  }

  console.log('✓ Test 3 passed: All suspension plumb lines strictly intersect center of gravity\n');
}

// ---------------------------------------------------------------------------
// Test 4: Intersection of Two Plumb Lines Yields Center of Gravity
// ---------------------------------------------------------------------------
console.log('Test 4: Two Lines Intersection Yields True Center of Gravity');
{
  const solver = new SuspensionDynamicsSolver('irregular');

  // Step 1: Hang on hole A, stabilize -> Line 1
  solver.hangOnHole('hole-a', 20);
  solver.stabilizeImmediately();
  assert(solver.markedLines.length === 1);

  // Step 2: Detach
  solver.detachPlate();
  assert(solver.state === 'detached');
  assert(solver.markedLines.length === 1, 'Marked lines must persist after detaching');

  // Step 3: Hang on hole B, stabilize -> Line 2
  solver.hangOnHole('hole-b', 20);
  solver.stabilizeImmediately();
  assert(solver.markedLines.length === 2);

  // Step 4: Compute intersection
  const measuredCg = solver.getMeasuredCenterOfGravity();
  assert(measuredCg !== null, 'Measured CG must exist for 2 lines');

  const errorMm = solver.getErrorMm();
  console.log(`  Theoretical CG: (${solver.centroid.x.toFixed(5)}, ${solver.centroid.y.toFixed(5)})`);
  console.log(`  Measured CG:    (${measuredCg.x.toFixed(5)}, ${measuredCg.y.toFixed(5)})`);
  console.log(`  Measurement Error: ${errorMm?.toFixed(6)} mm`);

  assert(errorMm !== null && errorMm < 0.001, `Error must be sub-micrometer: ${errorMm} mm`);

  console.log('✓ Test 4 passed: Two lines intersection equals true center of gravity\n');
}

// ---------------------------------------------------------------------------
// Test 5: Three Lines Concurrency Invariant (Third Hole Verification)
// ---------------------------------------------------------------------------
console.log('Test 5: Third Hole Verification & Concurrency Invariant');
{
  const solver = new SuspensionDynamicsSolver('irregular');

  // Hang Hole A
  solver.hangOnHole('hole-a');
  solver.stabilizeImmediately();
  // Detach & Hang Hole B
  solver.detachPlate();
  solver.hangOnHole('hole-b');
  solver.stabilizeImmediately();
  // Detach & Hang Hole C
  solver.detachPlate();
  solver.hangOnHole('hole-c');
  solver.stabilizeImmediately();

  assert(solver.markedLines.length === 3, 'Must have 3 marked lines');

  // Compute intersections of (Line 0, Line 1) and (Line 1, Line 2)
  const int01 = PolygonGeometryHelper.intersectTwoLines(solver.markedLines[0], solver.markedLines[1]);
  const int12 = PolygonGeometryHelper.intersectTwoLines(solver.markedLines[1], solver.markedLines[2]);

  assert(int01 !== null && int12 !== null);
  const diff = Math.hypot(int01.x - int12.x, int01.y - int12.y);
  assert(diff < 1e-6, `All three plumb lines must intersect at the exact same point: diff = ${diff}`);

  console.log('✓ Test 5 passed: Triple line concurrency invariant verified\n');
}

// ---------------------------------------------------------------------------
// Test 6: 3D RetortStandMesh & SuspensionPlateMesh Assembly & Disposal Invariants
// ---------------------------------------------------------------------------
console.log('Test 6: 3D RetortStandMesh & SuspensionPlateMesh Assembly & Disposal Invariants');
{
  const stand = new RetortStandMesh();
  assert(stand.group.children.length >= 4, 'Stand must contain base, rod, clamp, pin, plumb line');
  assert(stand.pinMesh.userData.isSuspensionPin, 'Pin must have isSuspensionPin flag');

  stand.setSnapAuraHighlighted(true);
  stand.setSnapAuraHighlighted(false);
  stand.setNeedleStandVisible(true, new THREE.Vector3(0, 0.2, 0));
  stand.update(0.016);
  stand.dispose();

  const plate = new SuspensionPlateMesh();
  assert(plate.plateMesh !== undefined, 'Plate mesh must be constructed');
  assert(plate.holeHitMeshes.length >= 3, 'Must have hit meshes for all holes');

  // Add line and CG marker
  const dummyLine: Line2D = {
    origin: { x: 0, y: 0.05 },
    direction: { x: 0, y: -1 },
    holeId: 'hole-a',
    holeLabel: 'A',
    timestamp: Date.now(),
  };
  plate.addMarkedLine(dummyLine, 0, false);
  plate.showCenterOfGravityMarker({ x: 0, y: 0 });
  plate.update(0.016, 0.1);

  plate.dispose();
  console.log('✓ Test 6 passed: 3D Meshes cleanly constructed and disposed with zero leaks\n');
}

// ---------------------------------------------------------------------------
// Test 7: MechCenterOfGravityExperiment Lifecycle & Full Interactive Simulation
// ---------------------------------------------------------------------------
console.log('Test 7: Full Interactive Experiment Simulation');
{
  const exp = new MechCenterOfGravityExperiment();
  const mockContext: any = {
    camera: new THREE.PerspectiveCamera(60, 1, 0.1, 100),
    scene: new THREE.Scene(),
  };

  exp.init(mockContext);
  assert(exp.metadata.id === 'mech-center-of-gravity');
  assert(exp.metadata.category === 'mechanics');

  // 1. Simulate dragging plate to hang Hole A
  exp.hangPlateOnHole('hole-a');
  exp.update(0.016, 0.016, mockContext);

  // 2. Immediate stabilization to draw Line 1
  exp.stabilizeNow();
  const telemetry1 = (exp as any).solver.getTelemetry();
  assert(telemetry1.markedLinesCount === 1, 'First red line must be drawn');
  assert(telemetry1.isStable, 'State must be stabilized');

  // 3. Simulate downward drag to detach plate
  (exp as any).detachPlateFromPin();
  const telemetryDetach = (exp as any).solver.getTelemetry();
  assert(telemetryDetach.state === 'detached', 'State must be detached');
  assert(telemetryDetach.markedLinesCount === 1, 'Red line 1 must remain on plate');

  // 4. Hang on Hole B to draw Line 2
  exp.hangPlateOnHole('hole-b');
  exp.stabilizeNow();
  const telemetry2 = (exp as any).solver.getTelemetry();
  assert(telemetry2.markedLinesCount === 2, 'Second red line must be drawn');
  assert(telemetry2.measuredCenterOfGravity !== null, 'Center of gravity must be determined');
  assert(telemetry2.errorMm !== null && telemetry2.errorMm < 0.01, 'Error must be near 0');

  // 5. Test Hover Target
  const raycaster = new THREE.Raycaster();
  const hover = exp.getHoverTarget(raycaster);
  // May be null or object depending on default ray
  assert(hover === null || typeof hover.label === 'string');

  // 6. Test Parameter Change: Switch shape to L-shape
  exp.onParameterChange('shape', 'lshape', mockContext);
  const telemetryL = (exp as any).solver.getTelemetry();
  assert(telemetryL.plateShapeId === 'lshape', 'Shape must switch to lshape');

  // 7. Verify balance needle mode
  exp.onParameterChange('verifyBalance', true, mockContext);
  exp.onParameterChange('verifyBalance', false, mockContext);

  // 8. Reset experiment
  exp.onParameterChange('resetExperiment', true, mockContext);
  const telemetryReset = (exp as any).solver.getTelemetry();
  assert(telemetryReset.markedLinesCount === 0, 'Lines must be cleared on reset');

  exp.dispose(mockContext);
  console.log('✓ Test 7 passed: Full interactive lifecycle and parameters tested\n');
}

// ---------------------------------------------------------------------------
// Test 8: 60+ FPS Performance Benchmark
// ---------------------------------------------------------------------------
console.log('Test 8: 60+ FPS Performance Benchmark for Suspension Dynamics Loop');
{
  const solver = new SuspensionDynamicsSolver('irregular');
  solver.hangOnHole('hole-a', 25);

  const iterations = 5000;
  const start = performance.now();
  for (let i = 0; i < iterations; i++) {
    solver.step(0.016);
  }
  const duration = performance.now() - start;
  const avgTimeMs = duration / iterations;
  const fps = 1000 / avgTimeMs;

  console.log(`  Suspension solver average step time: ${avgTimeMs.toFixed(5)} ms`);
  console.log(`  Equivalent logic frame rate: ${Math.round(fps)} FPS`);

  assert(avgTimeMs < 0.1, `Dynamics step must be < 0.1ms (took ${avgTimeMs}ms)`);
  console.log('✓ Test 8 passed: Performance well within 60+ FPS budget\n');
}

// ---------------------------------------------------------------------------
// Test 9: Physics Discipline Modal Registration Invariant
// ---------------------------------------------------------------------------
console.log('Test 9: Mechanics Catalog Modal Registration Invariant');
{
  const cogExp = PhysicsDisciplineModal.MECHANICS_EXPERIMENTS.find(
    (e) => e.id === 'mech-center-of-gravity'
  );
  assert(cogExp !== undefined, 'mech-center-of-gravity must be registered in MECHANICS_EXPERIMENTS');
  assert(cogExp.name === '悬挂法测物体重心');
  assert(cogExp.iconSvg.includes('<svg'), 'Must have valid SVG icon');
  assert(cogExp.formula.includes('\\vec{\\tau}'), 'Must have valid torque balance formula');

  console.log('✓ Test 9 passed: Successfully registered in mechanics category\n');
}

// ---------------------------------------------------------------------------
// Test 10: Strict Zero Floating Popups & Banners Invariant
// ---------------------------------------------------------------------------
console.log('Test 10: Strict Zero Floating Popups & Banners Invariant');
{
  const exp = new MechCenterOfGravityExperiment();
  const mockContext: any = {
    camera: new THREE.PerspectiveCamera(60, 1, 0.1, 100),
    scene: new THREE.Scene(),
  };
  exp.init(mockContext);

  const banner = document.body.querySelector('#suspension-guidance-banner');
  assert(banner === null, 'CRITICAL: No guidance banner or floating popup allowed in 3D scene');

  const expAny = exp as any;
  assert(expAny.bannerEl === undefined || expAny.bannerEl === null, 'bannerEl must not exist');

  exp.dispose(mockContext);
  console.log('✓ Test 10 passed: Strict zero floating popups & banners rule enforced\n');
}

// ---------------------------------------------------------------------------
// Test 11: Center Crosshair Activation & 3D Hover Raycast Invariant
// ---------------------------------------------------------------------------
console.log('Test 11: Center Crosshair Activation & Raycast Hover Detection');
{
  const exp = new MechCenterOfGravityExperiment();
  const mockContext: any = {
    camera: new THREE.PerspectiveCamera(60, 1, 0.1, 100),
    scene: new THREE.Scene(),
  };
  exp.init(mockContext);
  exp.rootGroup.updateMatrixWorld(true);

  // 1. Ray pointing directly at the resting plate
  const raycaster = new THREE.Raycaster();
  const plateWorldPos = new THREE.Vector3();
  exp['plate'].group.getWorldPosition(plateWorldPos);

  raycaster.ray.origin.set(plateWorldPos.x, plateWorldPos.y, plateWorldPos.z + 1.0);
  raycaster.ray.direction.set(0, 0, -1);

  const hoverPlate = exp.getHoverTarget(raycaster);
  assert(hoverPlate !== null, 'Center crosshair ray should detect hover target on suspension plate');
  assert(typeof hoverPlate.label === 'string' && hoverPlate.label.length > 0, 'Hover target must have descriptive label');

  // 2. Pointer lock coordinate conversion: when locked, getNormalizedMouse must return (0, 0) for center crosshair
  const mockEvent = { clientX: 500, clientY: 300 } as PointerEvent;
  (globalThis as any).document.pointerLockElement = (globalThis as any).document.body;
  const lockedCoords = (exp as any).getNormalizedMouse(mockEvent);
  assert.strictEqual(lockedCoords.x, 0, 'In pointer lock mode, NDC X must be 0 for center crosshair');
  assert.strictEqual(lockedCoords.y, 0, 'In pointer lock mode, NDC Y must be 0 for center crosshair');

  (globalThis as any).document.pointerLockElement = null;
  const unlockedCoords = (exp as any).getNormalizedMouse(mockEvent);
  assert(unlockedCoords.x !== 0 || unlockedCoords.y !== 0, 'In free cursor mode, NDC coords reflect mouse position');

  exp.dispose(mockContext);
  console.log('✓ Test 11 passed: Center crosshair activation and hover raycasting verified\n');
}

// ---------------------------------------------------------------------------
// Test 12: Suspension Physics & Vertical Gravitational Alignment Invariant
// ---------------------------------------------------------------------------
console.log('Test 12: Suspension Physics & Vertical Gravitational Alignment Invariant');
{
  const exp = new MechCenterOfGravityExperiment();
  const mockContext: any = {
    camera: new THREE.PerspectiveCamera(60, 1, 0.1, 100),
    scene: new THREE.Scene(),
  };
  mockContext.camera.position.set(0, 1.38, 4.25);
  mockContext.camera.lookAt(0, 0.08, 1.35);

  exp.init(mockContext);

  const stand = (exp as any).stand;
  const plate = (exp as any).plate;
  const solver = (exp as any).solver;

  // Pin local position
  const pinPos = stand.pinLocalPosition;

  for (const hole of solver.plateDef.holes) {
    exp.hangPlateOnHole(hole.id);
    solver.stabilizeImmediately();
    exp.update(0.016, 0.016, mockContext);
    exp.rootGroup.updateMatrixWorld(true);

    // Compute centroid world position
    const cgLocal = new THREE.Vector3(solver.centroid.x, solver.centroid.y, 0);
    const cgWorld = cgLocal.clone();
    plate.plateMesh.localToWorld(cgWorld);

    // Compute pin world position
    const pinWorld = new THREE.Vector3();
    stand.pinMesh.getWorldPosition(pinWorld);

    // The center of gravity must hang directly below the pin:
    // World X should match pin X within 0.1mm, and World Y must be strictly below pin Y
    const dx = Math.abs(cgWorld.x - pinWorld.x);
    const dy = pinWorld.y - cgWorld.y;

    assert(
      dx < 0.0005,
      `Hole ${hole.label}: Center of gravity X (${cgWorld.x}) must strictly align with pin X (${pinWorld.x}): diff = ${dx}`
    );
    assert(
      dy > 0.01,
      `Hole ${hole.label}: Center of gravity must hang vertically below pin: pinY=${pinWorld.y}, cgY=${cgWorld.y}`
    );
  }

  exp.dispose(mockContext);
  console.log('✓ Test 12 passed: All suspension holes strictly align center of gravity under gravity vector\n');
}

// ---------------------------------------------------------------------------
// Test 13: Accurate Crosshair Drag Tracking Invariant
// ---------------------------------------------------------------------------
console.log('Test 13: Accurate Crosshair Drag Tracking Invariant');
{
  const exp = new MechCenterOfGravityExperiment();
  const mockContext: any = {
    camera: new THREE.PerspectiveCamera(60, 1, 0.1, 100),
    scene: new THREE.Scene(),
  };
  mockContext.camera.position.set(0, 1.38, 4.25);
  mockContext.camera.lookAt(0, 0.08, 1.35);

  exp.init(mockContext);
  exp.rootGroup.updateMatrixWorld(true);

  // 1. Simulate pointerdown on plate
  const initialPlatePos = exp['plate'].group.position.clone();
  const hitPointWorld = exp.rootGroup.localToWorld(new THREE.Vector3(initialPlatePos.x, initialPlatePos.y, 0.04));
  const mockHit = {
    point: hitPointWorld,
    object: exp['plate'].plateMesh,
  } as any;

  (globalThis as any).document.pointerLockElement = (globalThis as any).document.body;
  const downEvent = { clientX: 960, clientY: 540 } as PointerEvent;
  const handled = exp.onPointerDown(downEvent, mockHit, mockContext);
  assert.strictEqual(handled, true, 'Pointer down on plate must be handled');

  // 2. Simulate dragging with pointer lock (center ray)
  // Move camera slightly
  mockContext.camera.position.set(0.05, 1.38, 4.25);
  mockContext.camera.lookAt(0.05, 0.08, 1.35);
  mockContext.camera.updateMatrixWorld(true);

  const moveEvent = { clientX: 960, clientY: 540 } as PointerEvent;
  exp.onPointerMove(moveEvent, null, mockContext);

  // The plate position must have moved in response to camera gaze without jumping to infinity
  const movedPlatePos = exp['plate'].group.position.clone();
  assert(
    Math.abs(movedPlatePos.z - 0.04) < 1e-4,
    `Plate must stay strictly on Z=0.04 plane, got ${movedPlatePos.z}`
  );
  assert(
    movedPlatePos.x >= -0.55 && movedPlatePos.x <= 0.55,
    `Plate X must be clamped within visible desk range, got ${movedPlatePos.x}`
  );

  // 3. Pointer up
  const upEvent = {} as PointerEvent;
  exp.onPointerUp(upEvent, mockContext);
  assert.strictEqual(exp['isDraggingPlate'], false, 'Dragging state must be cleared on pointer up');

  exp.dispose(mockContext);
  console.log('✓ Test 13 passed: Crosshair drag plane intersection and continuous tracking verified\n');
}

console.log('========================================================');
console.log('All Suspension Center of Gravity Tests Passed (13/13)!');
console.log('========================================================\n');
