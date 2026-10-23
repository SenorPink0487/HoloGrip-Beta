import assert from 'node:assert/strict';
import * as THREE from 'three';
import { LabPointerSession, labPointerNDC, raycastTouchCandidates } from '../src/controls/LabPointerInput.ts';
import { Engine } from '../src/core/Engine.ts';
import { CapacitorInteractionManager } from '../src/scene/em/CapacitorInteractionManager.ts';
import { CarnotInteractionManager } from '../src/scene/thermo/CarnotInteractionManager.ts';
import { ThermoInteractionManager } from '../src/scene/thermo/ThermoInteractionManager.ts';
import { StereometryInteractionManager } from '../src/scene/math/StereometryInteractionManager.ts';
import CompressionIgnitionExperiment from '../src/experiments/catalog/thermo-compression-ignition/index.ts';

class Surface {
  listeners = new Map<string, Function[]>();
  captured = new Set<number>();
  style: any = { setProperty() {} };
  addEventListener(type: string, listener: Function) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }
  emit(type: string, event: any = {}) {
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }
  getBoundingClientRect() { return { left: 50, top: 60, width: 900, height: 600 }; }
  setPointerCapture(id: number) { this.captured.add(id); }
  hasPointerCapture(id: number) { return this.captured.has(id); }
  releasePointerCapture(id: number) { this.captured.delete(id); }
}

const win: any = new Surface();
Object.assign(win, { PointerEvent: class {}, innerWidth: 1200, innerHeight: 900 });
const doc: any = new Surface();
Object.assign(doc, { body: { style: {} }, activeElement: null, pointerLockElement: null, hidden: false });
(globalThis as any).window = win;
(globalThis as any).document = doc;

function pointer(pointerId: number, clientX = 500, clientY = 360, pointerType = 'touch'): PointerEvent {
  return {
    pointerId, pointerType, button: 0, clientX, clientY, movementX: 0, movementY: 0,
    cancelable: true, preventDefault() {}, stopPropagation() {},
  } as PointerEvent;
}

const canvas: any = new Surface();
const camera = new THREE.PerspectiveCamera(60, 1.5, 0.1, 100);
camera.position.z = 3;
camera.updateMatrixWorld(true);

// Picking uses canvas CSS coordinates, independent of the screen size/DPR.
assert.deepEqual(labPointerNDC(pointer(1), canvas).toArray(), [0, 0]);
assert.deepEqual(labPointerNDC(pointer(1, 50, 60), canvas).toArray(), [-1, 1]);

// A static surface under a fingertip must not hide a nearby small control from
// the candidate list. Hidden instruments must never be touch targets.
const root = new THREE.Group();
const chassis = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 0.05));
const control = new THREE.Mesh(new THREE.SphereGeometry(0.012));
control.position.set(0.075, 0, 0.15);
const hidden = new THREE.Group();
hidden.visible = false;
const hiddenMesh = new THREE.Mesh(new THREE.SphereGeometry(0.1));
hidden.add(hiddenMesh);
root.add(chassis, control, hidden);
root.updateMatrixWorld(true);
const raycaster = new THREE.Raycaster();
const candidates = raycastTouchCandidates(raycaster, camera, new THREE.Vector2(), root.children, true,
  canvas.getBoundingClientRect());
assert.equal(candidates[0].object, chassis, 'Exact hits retain priority');
assert(candidates.some(h => h.object === control), 'Nearby knob remains selectable over the static surface');
assert(!candidates.some(h => h.object === hiddenMesh), 'Hidden equipment is excluded');
assert.equal(new Set(candidates.map(h => h.object)).size, candidates.length);
assert(Math.abs(raycaster.ray.direction.x) < 1e-10, 'Picking restores the central drag ray');

// Run the real Engine listeners without allocating a WebGL renderer.
const calls = { down: 0, move: 0, up: 0, cancel: 0, legacyTouch: 0 };
const experiment: any = {
  rootGroup: root,
  onPointerDown: () => { calls.down++; return true; },
  onPointerMove: () => { calls.move++; },
  onPointerUp: () => { calls.up++; },
  onPointerCancel: () => { calls.cancel++; },
  onTouchStart: () => { calls.legacyTouch++; return true; },
};
const engine: any = Object.create(Engine.prototype);
Object.assign(engine, {
  renderer: { domElement: canvas }, camera, raycaster: new THREE.Raycaster(),
  labPointers: new LabPointerSession(), holoStage: { activeExperiment: experiment },
  currentExperimentId: 'thermo-idealgas', currentContext: { camera, renderer: { domElement: canvas } },
  inputManager: { player: { enabled: true, allowPointerLock: false, isLocked: false } },
  crosshair: { setVisible() {} }, visionModal: { visible: false }, hud: {},
  lastPointerRaycastTime: -Infinity, getInteractiveBeakerAt: () => null,
});
engine.initEvents();
assert.equal(canvas.style.touchAction, 'none', 'Only the 3D canvas owns native touch gestures');

canvas.emit('pointerdown', pointer(1));
assert(canvas.captured.has(1));
assert.equal(engine.inputManager.player.enabled, false);
canvas.emit('pointerdown', pointer(2));
win.emit('pointermove', pointer(2, 600));
win.emit('pointerup', pointer(2));
assert.equal(calls.down, 1, 'Second finger cannot re-grab a single-finger instrument');
assert.equal(calls.move, 0);
assert.equal(calls.up, 0, 'Second finger cannot release another finger’s instrument');
assert.equal(engine.isExperimentInteracting, true);
win.emit('pointermove', pointer(1, 1400));
assert.equal(calls.move, 1, 'Captured drag continues outside the canvas');
win.emit('pointerup', pointer(1, 1450));
assert.equal(calls.move, 2, 'Release position is applied even after a throttled final move');
assert.equal(calls.up, 1);
assert.equal(engine.inputManager.player.enabled, true);
assert.equal(engine.inputManager.player.allowPointerLock, false, 'Desk experiments keep a free cursor');
assert.equal(canvas.captured.size, 0);

// Hiding the crosshair must not disable physical hover feedback on instruments.
let crosshairVisible = true;
let physicalHover = 0;
engine.crosshair = { getVisible: () => crosshairVisible,
  setVisible: (v: boolean) => { crosshairVisible = v; },
  setHovered: () => { assert.fail('Desk feedback must not create crosshair labels'); } };
engine.getInteractiveTargetAt = () => null;
engine.lastCrosshairCheck = -Infinity;
experiment.getHoverTarget = () => { physicalHover++; return { id: 'knob', cursor: 'ew-resize' }; };
engine.checkCrosshairIntersection(performance.now());
assert.equal(crosshairVisible, false);
assert.equal(physicalHover, 1);
assert.equal(canvas.style.cursor, 'ew-resize');

// All interruption paths release capture and call cancellation, never a click.
for (const interruption of ['pointercancel', 'lostpointercapture', 'blur', 'visibilitychange']) {
  canvas.emit('pointerdown', pointer(10));
  const previousCancel = calls.cancel;
  if (interruption === 'lostpointercapture') canvas.emit(interruption, pointer(10));
  else if (interruption === 'visibilitychange') {
    doc.hidden = true;
    doc.emit(interruption);
    doc.hidden = false;
  } else win.emit(interruption, pointer(10));
  assert.equal(calls.cancel, previousCancel + 1, interruption);
  assert.equal(engine.isExperimentInteracting, false, interruption);
  assert.equal(canvas.captured.size, 0, interruption);
  assert.equal(engine.inputManager.player.enabled, true, interruption);
}
assert.equal(calls.up, 1, 'Interruptions do not commit a normal release');

// Modern iPadOS must not run the Pointer + Touch + WebKit gesture paths twice.
engine.currentExperimentId = 'math-stereometry';
canvas.emit('pointerdown', pointer(20));
canvas.emit('pointerdown', pointer(21, 600));
canvas.emit('touchstart', { touches: [{}, {}] });
assert.equal(calls.legacyTouch, 0);
win.emit('pointerup', pointer(20));
assert.equal(engine.isExperimentInteracting, true, 'Remaining pinch finger keeps input ownership');
assert.equal(engine.inputManager.player.enabled, false);
win.emit('pointerup', pointer(21, 600));
assert.equal(engine.isExperimentInteracting, false);

// Chemistry shares the same ownership rules; jitter remains a tap while a
// cancelled pour resets the vessel without opening a reagent or analysis page.
let chemistryPages = 0;
let tiltReset = 0;
engine.currentExperimentId = null;
engine.holoStage.activeExperiment = null;
engine.beakerLeft = { restingPosition: new THREE.Vector3(-0.4, 1, 0),
  isInteractive: () => true, setTilt: () => { tiltReset++; } };
engine.beakerRight = { restingPosition: new THREE.Vector3(0.4, 1, 0), isInteractive: () => true };
engine.getInteractiveBeakerAt = () => 'left';
engine.visionModal.open = () => { chemistryPages++; };
engine.hidePourStream = () => {};
engine.hidePourVolumeBadge = () => {};
canvas.emit('pointerdown', pointer(30));
win.emit('pointerup', pointer(31));
assert(engine.beakerDragState, 'Other finger cannot release the beaker');
win.emit('pointerup', pointer(30, 505));
assert.equal(chemistryPages, 1, 'Small fingertip jitter remains a reagent-selection tap');
canvas.emit('pointerdown', pointer(32));
win.emit('pointercancel', pointer(32));
assert.equal(engine.beakerDragState, null);
assert.equal(tiltReset, 1);
assert.equal(chemistryPages, 1, 'Cancellation never opens a chemistry page');

// Actual geometry manager: pinch, lift one finger, then lift the other must not
// accidentally connect an edge point.
let selected = 0;
let scale = 1;
const geometryMesh: any = {
  modelContainer: new THREE.Group(), getScale: () => scale, setScale: (v: number) => { scale = v; },
  setHoveredKeyPoint() {}, clearPreviewWire() {},
  findClosestSnapPoint() { selected++; return null; },
};
const geometry = new StereometryInteractionManager(geometryMesh, {});
const context: any = { camera, renderer: { domElement: canvas } };
geometry.onPointerDown(pointer(1, 450), null, context);
geometry.onPointerDown(pointer(2, 550), null, context);
geometry.onPointerMove(pointer(2, 600), null, context);
assert.equal(scale, 1.5);
geometry.onPointerUp(pointer(2, 600), context);
geometry.onPointerUp(pointer(1, 450), context);
assert.equal(selected, 0, 'Pinch release is never a selection tap');

// A cancelled electrical switch drag must neither cycle nor energize a circuit.
let cycled = 0;
let switched = 0;
let bladeReset = 0;
const switchRoot = new THREE.Group();
const handle = new THREE.Object3D();
switchRoot.add(handle);
const capacitor = new CapacitorInteractionManager({
  bench: { group: switchRoot, switchHandleMesh: handle, cancelBladeDrag: () => { bladeReset++; } } as any,
  onCycleSwitch: () => { cycled++; }, onSetSwitchPosition: () => { switched++; },
});
assert(capacitor.onPointerDown(pointer(1), { object: handle } as any, context));
capacitor.onPointerCancel();
capacitor.onPointerUp(pointer(1), context);
assert.equal(cycled, 0);
assert.equal(switched, 0);
assert.equal(bladeReset, 1);

// Heat-engine levers tolerate fingertip jitter; cancelling never starts a run.
let toggles = 0;
const lever = new THREE.Object3D();
const carnot = new CarnotInteractionManager({
  engine: { leverMesh: lever } as any, onToggleRunning: () => { toggles++; },
  onToggleDirection: () => { toggles++; }, onRotateFlywheel() {},
});
carnot.onPointerDown(pointer(1), { object: lever } as any, context);
carnot.onPointerMove(pointer(1, 505), null, context);
carnot.onPointerUp(pointer(1, 505), context);
assert.equal(toggles, 1, 'Five pixels of finger jitter remains a tap');
carnot.onPointerDown(pointer(1), { object: lever } as any, context);
carnot.onPointerCancel();
carnot.onPointerUp(pointer(1), context);
assert.equal(toggles, 1, 'System cancellation cannot start or reverse a heat engine');

// Re-grabbing a temperature knob continues from its current setting.
let temperature = 0;
const knob = new THREE.Object3D();
const thermo = new ThermoInteractionManager({
  piston: { handleMesh: new THREE.Object3D() } as any, heater: { knobMesh: knob } as any,
  onVolumeChange() {}, onTemperatureChange: value => { temperature = value; },
});
thermo.setStartTemp(550);
thermo.onPointerDown(pointer(1), { object: knob } as any, context);
thermo.onPointerMove(pointer(1, 520), null, context);
assert.equal(temperature, 586, 'Touch adjustment does not jump back to 300 K');
thermo.onPointerUp(pointer(1), context);

// The compression piston must follow absolute touch coordinates even when
// iPadOS reports movementY = 0 and no global camera is installed.
const piston: any = new CompressionIgnitionExperiment();
const pistonHandle = new THREE.Object3D();
pistonHandle.position.y = 0.5;
piston.rootGroup.add(pistonHandle);
piston.rootGroup.updateMatrixWorld(true);
piston.pistonMesh = { handleHitBox: pistonHandle, pistonMovingGroup: pistonHandle, strokeTravelM: 1 };
let stroke = 0;
let ended = false;
piston.solver = { stroke: 0, isDragging: false,
  updateManualDrag(value: number) { stroke = value; }, endManualDrag() { ended = true; } };
assert(piston.onPointerDown(pointer(1), { object: pistonHandle, point: new THREE.Vector3(0, 0.5, 0) }, context));
piston.onPointerMove(pointer(1, 500, 420), null, context);
assert(stroke > 0.5, 'Absolute fingertip motion compresses the piston');
piston.onPointerCancel(pointer(1), context);
assert(ended, 'Interrupted piston releases manual force');

console.log('✓ Lab touch interactions: picking, ownership, capture, interruptions, pinch and physical controls');
