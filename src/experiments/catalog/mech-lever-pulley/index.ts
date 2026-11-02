import * as THREE from 'three';
import { BaseExperiment } from '../../base/BaseExperiment.ts';
import type { ExperimentContext } from '../../../core/types.ts';
import { labPointerNDC } from '../../../controls/LabPointerInput.ts';
import { LeverPulleyDynamics, LEVER_HEIGHT } from '../../../physics/mech/leverPulleyDynamics.ts';
import { LeverPulleyBenchMesh, type ControlTag } from '../../../scene/mech/LeverPulleyBenchMesh.ts';
import { metadata } from './meta.ts';

interface Drag {
  pointerId: number;
  tag: ControlTag;
  start: THREE.Vector3;
  offset: THREE.Vector3;
  startValue: number;
  originalSlot: number | null;
  snap: number | null;
}

export default class MechLeverPulleyExperiment extends BaseExperiment {
  public readonly metadata = metadata;
  public override targetScale = 1.32;
  public override hideCenterEmitter = true;
  public readonly initialCameraPose = { x: 0, y: 1.60, z: 2.42, yaw: 0, pitch: -0.005 };
  public readonly solver = new LeverPulleyDynamics();
  private bench!: LeverPulleyBenchMesh;
  private drag: Drag | null = null;
  private disposed = false;
  private raycaster = new THREE.Raycaster();
  private plane = new THREE.Plane();
  private point = new THREE.Vector3();
  private normal = new THREE.Vector3();
  private ndc = new THREE.Vector2();

  public init(_context: ExperimentContext): void {
    // The feet land at table height; both front faces point toward operator +Z.
    this.rootGroup.position.set(-0.08, 0.082, 0.60);
    this.bench = new LeverPulleyBenchMesh();
    this.rootGroup.add(this.bench.group);
    this.addDisposable(() => this.bench.dispose());
    this.bench.sync(this.solver);
  }

  public update(delta: number, _elapsed: number, _context: ExperimentContext): void {
    if (this.disposed) return;
    this.solver.update(delta);
    this.bench.sync(this.solver, this.drag?.tag.kind === 'weight' ? this.drag.tag.index : -1);
    // Keep the candidate hole under a held hanger as the beam swings.
    if (this.drag?.tag.kind === 'weight') this.updateSnap();
  }

  public getBench(): LeverPulleyBenchMesh { return this.bench; }

  private localPointer(event: PointerEvent, context: ExperimentContext): THREE.Vector3 | null {
    if (!context.camera) return null;
    this.rootGroup.updateWorldMatrix(true, true);
    this.normal.set(0, 0, 1).transformDirection(this.rootGroup.matrixWorld);
    const z = this.drag?.tag.kind === 'weight' || this.drag?.tag.kind === 'pivot' ? 0.018 : 0.08;
    this.rootGroup.localToWorld(this.point.set(0, 0, z));
    this.plane.setFromNormalAndCoplanarPoint(this.normal, this.point);
    this.raycaster.setFromCamera(labPointerNDC(event, context.renderer?.domElement, this.ndc), context.camera);
    if (!this.raycaster.ray.intersectPlane(this.plane, this.point)) return null;
    return this.rootGroup.worldToLocal(this.point);
  }

  public override onPointerDown(event: PointerEvent, hit: THREE.Intersection | null, context: ExperimentContext): boolean {
    if (this.disposed || this.drag || !hit || event.button !== 0) return false;
    const control = this.bench.controlOf(hit.object);
    if (!control) return false;
    const { tag } = control;
    if (tag.kind === 'reset') { this.resetExperiment(); return true; }
    if (tag.kind === 'mode') {
      this.solver.setMode(this.solver.mode === 'fixed' ? 'double' : this.solver.mode === 'double' ? 'quad' : 'fixed');
      this.bench.sync(this.solver); return true;
    }
    if (tag.kind === 'load') {
      this.solver.setLoad(this.solver.loadKg < 0.15 ? 0.2 : this.solver.loadKg < 0.3 ? 0.4 : 0.1);
      this.bench.sync(this.solver); return true;
    }
    const originalSlot = tag.kind === 'weight' ? this.solver.weights[tag.index!].slot : null;
    this.drag = { pointerId: event.pointerId, tag, start: new THREE.Vector3(), offset: new THREE.Vector3(),
      startValue: tag.kind === 'pivot' ? this.solver.pivot : this.solver.pullDistance, originalSlot, snap: null };
    const pointer = this.localPointer(event, context);
    if (!pointer) { this.drag = null; return false; }
    this.drag.start.copy(pointer);
    if (tag.kind === 'weight') {
      const weight = this.bench.weightGroups[tag.index!];
      this.drag.offset.copy(weight.position).add(this.bench.lever.position).sub(pointer);
      this.solver.hangWeight(tag.index!, null);
      this.updateSnap();
    } else if (tag.kind === 'pull') {
      this.solver.pullTo(this.drag.startValue);
    }
    this.bench.highlight(control.object);
    return true;
  }

  public override onPointerMove(event: PointerEvent, _hit: THREE.Intersection | null, context: ExperimentContext): void {
    if (!this.drag || this.drag.pointerId !== event.pointerId) return;
    const pointer = this.localPointer(event, context);
    if (!pointer) return;
    const { tag, start, startValue } = this.drag;
    if (tag.kind === 'pivot') this.solver.setPivot(startValue + pointer.x - start.x);
    else if (tag.kind === 'pull') this.solver.pullTo(startValue - (pointer.y - start.y));
    else if (tag.kind === 'weight') {
      const weight = this.bench.weightGroups[tag.index!];
      weight.position.copy(pointer).add(this.drag.offset).sub(this.bench.lever.position);
      weight.position.x = THREE.MathUtils.clamp(weight.position.x, -0.55, 0.55);
      weight.position.y = THREE.MathUtils.clamp(weight.position.y, 0.15, 0.85);
      weight.position.z = 0.045;
      this.updateSnap();
    }
    this.bench.sync(this.solver, tag.kind === 'weight' ? tag.index : -1);
  }

  private updateSnap(): void {
    const drag = this.drag;
    if (!drag || drag.tag.kind !== 'weight') return;
    const position = this.bench.weightGroups[drag.tag.index!].position;
    // Invert the rotated beam's attachment-line transform.
    const dx = position.x - this.solver.pivot;
    const dy = position.y - LEVER_HEIGHT;
    const slotX = this.solver.pivot + dx * Math.cos(this.solver.angle) + dy * Math.sin(this.solver.angle);
    const slot = Math.abs(slotX) <= 0.49 ? this.solver.nearestSlot(slotX) : null;
    if (slot === null) drag.snap = null;
    else {
      const anchor = this.bench.leverAnchor(slot, this.solver);
      drag.snap = Math.hypot(position.x - anchor.x, position.y - anchor.y) < 0.055 ? slot : null;
    }
    this.bench.setSnapSlot(drag.snap);
  }

  public override onPointerUp(event: PointerEvent, _context: ExperimentContext): void {
    if (!this.drag || this.drag.pointerId !== event.pointerId) return;
    if (this.drag.tag.kind === 'weight') this.solver.hangWeight(this.drag.tag.index!, this.drag.snap);
    this.finishDrag();
  }

  public override onPointerCancel(event: PointerEvent, _context: ExperimentContext): void {
    if (!this.drag || this.drag.pointerId !== event.pointerId) return;
    if (this.drag.tag.kind === 'weight') this.solver.hangWeight(this.drag.tag.index!, this.drag.originalSlot);
    this.finishDrag();
  }

  private finishDrag(): void {
    if (this.drag?.tag.kind === 'pull') this.solver.releasePull();
    this.drag = null;
    this.bench.setSnapSlot(null);
    this.bench.highlight(null);
    this.bench.sync(this.solver);
  }

  public override getHoverTarget(raycaster: THREE.Raycaster): { id: string; label: string; cursor: string } | null {
    if (this.disposed || !this.bench || this.drag) return null;
    // Pick all faces first so controls cannot be grabbed through solid chassis.
    const hits = raycaster.intersectObject(this.bench.group, true);
    for (const hit of hits) {
      let visible = true;
      for (let obj: THREE.Object3D | null = hit.object; obj; obj = obj.parent) if (!obj.visible) visible = false;
      if (!visible) continue;
      const control = this.bench.controlOf(hit.object);
      this.bench.highlight(control?.object ?? null);
      if (!control) return null;
      const kind = control.tag.kind;
      return { id: `lever-pulley-${kind}-${control.tag.index ?? 0}`, label: '',
        cursor: kind === 'weight' || kind === 'pull' || kind === 'pivot' ? 'grab' : 'pointer' };
    }
    this.bench.highlight(null);
    return null;
  }

  public resetExperiment(): void {
    this.drag = null;
    this.solver.reset();
    this.bench.highlight(null);
    this.bench.setSnapSlot(null);
    this.bench.sync(this.solver);
  }

  public override unmount(_context: ExperimentContext): void {
    if (this.drag?.tag.kind === 'weight') this.solver.hangWeight(this.drag.tag.index!, this.drag.originalSlot);
    if (this.bench) this.finishDrag();
  }

  public override dispose(context: ExperimentContext): void {
    this.disposed = true;
    this.drag = null;
    this.solver.releasePull();
    super.dispose(context);
  }
}
