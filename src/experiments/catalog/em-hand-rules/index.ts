import * as THREE from 'three';
import { BaseExperiment } from '../../base/BaseExperiment.ts';
import { HandRulesBenchMesh } from '../../../scene/em/HandRulesBenchMesh.ts';
import {
  evaluateHandRuleFrame,
  buildSyntheticHandLandmarks,
  wrapSyntheticHandFrame,
  type HandRuleConfig,
  type HandRuleEvaluation,
  type HandRuleMode,
  type Polarity,
} from '../../../physics/em/handRulesSolver.ts';
import type { HandRulesTelemetryData } from '../../../ui/vision/HandRulesStatusCard.ts';
import type { HandGestureFrame } from '../../../vision/types.ts';
import type { ExperimentContext } from '../../../core/types.ts';
import { metadata } from './meta.ts';

export default class EmHandRulesExperiment extends BaseExperiment {
  public readonly metadata = metadata;
  public override targetScale = 3.6;
  public override hideCenterEmitter = true;
  public readonly initialCameraPose = { x: 0, y: 2.35, z: 4.2, yaw: 0, pitch: -0.15 };

  private bench!: HandRulesBenchMesh;

  private config: HandRuleConfig = {
    mode: 'right-hand-screw',
    currentPolarity: 1,
    fieldPolarity: 1,
    motionPolarity: 1,
    gestureEnabled: false,
  };

  private latestFrame: HandGestureFrame | null = null;
  private latestEvaluation: HandRuleEvaluation;
  private cachedTelemetry: HandRulesTelemetryData | null = null;
  private telemetryCallback: ((data: HandRulesTelemetryData) => void) | null = null;
  private simulatedHandActive = false;
  private pointerGrab: { id: number; x: number; y: number; moved: boolean } | null = null;
  private readonly dragPlane = new THREE.Plane();
  private readonly dragOffset = new THREE.Vector3();
  private readonly dragPoint = new THREE.Vector3();
  private readonly dragNormal = new THREE.Vector3();
  private readonly pointerNDC = new THREE.Vector2();
  private readonly pointerRay = new THREE.Raycaster();
  private readonly lastShadowPosition = new THREE.Vector3(0, 0.30, 0);
  private shadowAge = 0;

  constructor() {
    super();
    this.latestEvaluation = evaluateHandRuleFrame(this.config, null);
  }

  public init(_context: ExperimentContext): void {
    this.rootGroup.position.set(0, 0.14, 1.55);

    this.bench = this.track(new HandRulesBenchMesh());
    this.rootGroup.add(this.bench.group);
    this.addDisposable(() => this.bench.dispose());

    this.bench.setMode(this.config.mode);
    this.recomputeAndBroadcast();
  }

  public update(delta: number, _elapsed: number, context: ExperimentContext): void {
    this.latestEvaluation = evaluateHandRuleFrame(this.config, this.latestFrame);
    this.bench?.update(delta, this.config, this.latestEvaluation, this.simulatedHandActive ? null : this.latestFrame);
    this.shadowAge += delta;
    const position = this.bench?.floatingConductor.assembly.position;
    if (this.config.mode === 'right-hand-screw' && position && this.shadowAge > 0.05 &&
      position.distanceToSquared(this.lastShadowPosition) > 0.000016 && context.renderer?.shadowMap?.enabled) {
      context.renderer.shadowMap.needsUpdate = true;
      this.lastShadowPosition.copy(position);
      this.shadowAge = 0;
    }
    this.syncTelemetrySnapshot();
  }

  public onHandGestureFrame(frame: HandGestureFrame | null): void {
    if (frame && frame.hasHand) {
      this.simulatedHandActive = false;
      this.latestFrame = frame;
    } else if (!this.simulatedHandActive) {
      this.latestFrame = null;
    }
    this.latestEvaluation = evaluateHandRuleFrame(this.config, this.latestFrame);
    this.syncTelemetrySnapshot();
  }

  public setGestureEnabled(enabled: boolean): void {
    if (this.config.gestureEnabled === enabled) return;
    this.config.gestureEnabled = enabled;
    if (!enabled) {
      this.simulatedHandActive = false;
      this.latestFrame = null;
    }
    this.recomputeAndBroadcast();
  }

  public isGestureEnabled(): boolean {
    return this.config.gestureEnabled;
  }

  public setRuleMode(mode: HandRuleMode): void {
    if (this.config.mode === mode) return;
    this.releaseConductor();
    this.config.mode = mode;
    this.bench?.setMode(mode);
    if (this.simulatedHandActive) {
      this.latestFrame = this.generateSyntheticFrameForCurrentConfig();
    }
    this.recomputeAndBroadcast();
  }

  public getRuleMode(): HandRuleMode {
    return this.config.mode;
  }

  public reverseCurrent(): void {
    this.config.currentPolarity = (this.config.currentPolarity === 1 ? -1 : 1) as Polarity;
    if (this.config.mode !== 'right-hand-screw') this.bench?.resetMotion();
    if (this.simulatedHandActive) {
      this.latestFrame = this.generateSyntheticFrameForCurrentConfig();
    }
    this.recomputeAndBroadcast();
  }

  public reverseField(): void {
    this.config.fieldPolarity = (this.config.fieldPolarity === 1 ? -1 : 1) as Polarity;
    this.bench?.resetMotion();
    if (this.simulatedHandActive) {
      this.latestFrame = this.generateSyntheticFrameForCurrentConfig();
    }
    this.recomputeAndBroadcast();
  }

  public reverseMotion(): void {
    this.config.motionPolarity = (this.config.motionPolarity === 1 ? -1 : 1) as Polarity;
    this.bench?.resetMotion();
    if (this.simulatedHandActive) {
      this.latestFrame = this.generateSyntheticFrameForCurrentConfig();
    }
    this.recomputeAndBroadcast();
  }

  public resetExperiment(): void {
    this.config.currentPolarity = 1;
    this.config.fieldPolarity = 1;
    this.config.motionPolarity = 1;
    this.releaseConductor();
    this.simulatedHandActive = false;
    this.latestFrame = null;
    this.bench?.resetMotion();
    this.recomputeAndBroadcast();
  }

  private generateSyntheticFrameForCurrentConfig(): HandGestureFrame {
    if (this.config.mode === 'right-hand-screw') {
      const isUp = this.config.currentPolarity > 0;
      const lms = buildSyntheticHandLandmarks({
        thumbDirWorld: { x: 0, y: isUp ? 1 : -1 },
        fingersDirWorld: { x: isUp ? -1 : 1, y: 0 },
        curled: true,
      });
      return wrapSyntheticHandFrame('right', lms);
    } else if (this.config.mode === 'left-hand-rule') {
      const fx = this.config.currentPolarity * this.config.fieldPolarity;
      const lms = buildSyntheticHandLandmarks({
        thumbDirWorld: { x: fx > 0 ? 1 : -1, y: 0 },
        fingersDirWorld: { x: 0, y: 1 },
        curled: false,
      });
      return wrapSyntheticHandFrame('left', lms);
    } else {
      const indY = this.config.motionPolarity * this.config.fieldPolarity;
      const lms = buildSyntheticHandLandmarks({
        thumbDirWorld: { x: 1, y: 0 },
        fingersDirWorld: { x: 0, y: indY > 0 ? 1 : -1 },
        curled: false,
      });
      return wrapSyntheticHandFrame('right', lms);
    }
  }

  public override onPointerDown(
    event: PointerEvent,
    hit: THREE.Intersection | null,
    context: ExperimentContext
  ): boolean {
    if (this.config.mode !== 'right-hand-screw' || !hit || this.pointerGrab || (event.button ?? 0) !== 0) return false;
    const conductor = this.bench.floatingConductor;
    const action = conductor.actionFor(hit.object);
    if (action === 'polarity') {
      this.reverseCurrent();
      return true;
    }
    if (action !== 'conductor') return false;
    this.pointerGrab = { id: event.pointerId, x: event.clientX, y: event.clientY, moved: false };
    conductor.setDragging(true);
    if (context.camera) {
      // Plane and pointer are world-space; the grab offset and constraints live
      // in the apparatus frame, including the stage's animated scale/transform.
      context.camera.getWorldDirection(this.dragNormal);
      this.dragPlane.setFromNormalAndCoplanarPoint(this.dragNormal, hit.point);
      const point = conductor.group.worldToLocal(hit.point.clone());
      this.dragOffset.subVectors(conductor.assembly.position, point);
    }
    return true;
  }

  private toggleDesktopField(): void {
    // A tap offers the same reveal as a correct hand pose, without a camera.
    this.simulatedHandActive = !this.simulatedHandActive;
    if (this.simulatedHandActive) {
      this.config.gestureEnabled = true;
      this.latestFrame = this.generateSyntheticFrameForCurrentConfig();
    } else {
      this.latestFrame = null;
    }
    this.recomputeAndBroadcast();
  }

  private projectPointer(event: PointerEvent, context: ExperimentContext): boolean {
    if (!context.camera || !context.renderer) return false;
    const rect = context.renderer.domElement.getBoundingClientRect();
    if (!rect.width || !rect.height) return false;
    this.pointerNDC.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
    this.pointerRay.setFromCamera(this.pointerNDC, context.camera);
    return true;
  }

  public override onPointerMove(event: PointerEvent, _hit: THREE.Intersection | null, context: ExperimentContext): void {
    if (this.config.mode !== 'right-hand-screw' || !this.projectPointer(event, context)) return;
    const conductor = this.bench.floatingConductor;
    if (!this.pointerGrab) {
      const hits = this.pointerRay.intersectObject(conductor.group, true);
      conductor.setHovered(hits.some(hit => conductor.actionFor(hit.object) === 'conductor'));
      return;
    }
    if (event.pointerId !== this.pointerGrab.id) return;
    if (Math.hypot(event.clientX - this.pointerGrab.x, event.clientY - this.pointerGrab.y) > 5) this.pointerGrab.moved = true;
    if (!this.pointerGrab.moved || !this.pointerRay.ray.intersectPlane(this.dragPlane, this.dragPoint)) return;
    conductor.group.worldToLocal(this.dragPoint).add(this.dragOffset);
    conductor.dragTo(this.dragPoint);
  }

  public override onPointerUp(event: PointerEvent, context: ExperimentContext): void {
    if (!this.pointerGrab || this.pointerGrab.id !== event.pointerId) return;
    this.onPointerMove(event, null, context);
    const clicked = !this.pointerGrab.moved;
    this.releaseConductor();
    if (clicked) this.toggleDesktopField();
  }

  public override onPointerCancel(event: PointerEvent, _context: ExperimentContext): void {
    if (this.pointerGrab?.id === event.pointerId) this.releaseConductor();
  }

  public override onViewModeChange(mode: 'whiteboard' | 'laboratory'): void {
    if (mode === 'whiteboard') this.releaseConductor();
  }

  public override getHoverTarget(raycaster: THREE.Raycaster): { id: string; label: string; cursor: string } | null {
    if (this.config.mode !== 'right-hand-screw') return null;
    if (this.pointerGrab) return { id: 'floating-conductor', label: '', cursor: 'grabbing' };
    for (const hit of raycaster.intersectObject(this.bench.floatingConductor.group, true)) {
      const action = this.bench.floatingConductor.actionFor(hit.object);
      if (action) return { id: action, label: '', cursor: action === 'conductor' ? 'grab' : 'pointer' };
    }
    return null;
  }

  private releaseConductor(): void {
    this.pointerGrab = null;
    this.bench?.floatingConductor.setDragging(false);
  }

  private recomputeAndBroadcast(): void {
    this.latestEvaluation = evaluateHandRuleFrame(this.config, this.latestFrame);
    this.syncTelemetrySnapshot();
    if (this.cachedTelemetry) {
      this.telemetryCallback?.(this.cachedTelemetry);
    }
  }

  private syncTelemetrySnapshot(): void {
    const ev = this.latestEvaluation;
    this.cachedTelemetry = {
      mode: this.config.mode,
      currentPolarity: this.config.currentPolarity,
      fieldPolarity: this.config.fieldPolarity,
      motionPolarity: this.config.motionPolarity,
      gestureEnabled: this.config.gestureEnabled,
      requiredHand: ev.requiredHand,
      detectedHand: ev.detectedHand,
      status: ev.status,
      alignmentScore: ev.alignmentScore,
      isMatched: ev.isMatched,
      statusLabel: ev.statusLabel,
    };
  }

  public getTelemetryData(): HandRulesTelemetryData {
    if (!this.cachedTelemetry) {
      this.syncTelemetrySnapshot();
    }
    return this.cachedTelemetry!;
  }

  public onTelemetry(callback: (data: HandRulesTelemetryData) => void): void {
    this.telemetryCallback = callback;
    this.recomputeAndBroadcast();
  }

  public override dispose(context: ExperimentContext): void {
    this.releaseConductor();
    this.telemetryCallback = null;
    this.latestFrame = null;
    super.dispose(context);
  }
}
