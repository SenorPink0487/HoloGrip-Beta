import * as THREE from 'three';
import { BaseExperiment } from '../../base/BaseExperiment.ts';
import { HysteresisBenchMesh, SAMPLE_CENTER_Y, SAMPLE_HALF } from '../../../scene/em/HysteresisBenchMesh.ts';
import { HysteresisInteractionManager } from '../../../scene/em/HysteresisInteractionManager.ts';
import {
  FERRO_MATERIALS,
  H_MAX,
  branchB,
  domainSigns,
  hysteresisCaption,
  loopArea,
  magnetizingCurrent,
  majorLoopPoints,
  materialById,
  remanence,
  searchFluxWb,
  solenoidSampleField,
  virginB,
} from '../../../physics/em/hysteresis.ts';
import type { HysteresisTelemetry } from '../../../ui/vision/HysteresisStatusCard.ts';
import { metadata } from './meta.ts';
import type { ExperimentContext } from '../../../core/types.ts';
import type { ComputeBridge } from '../../../core/platform/ComputeBridge.ts';

export default class EmHysteresisExperiment extends BaseExperiment {
  public readonly metadata = metadata;
  public override targetScale = 2.4;
  public override hideCenterEmitter = true;

  private bench!: HysteresisBenchMesh;
  private interaction!: HysteresisInteractionManager;
  private computeBridge?: ComputeBridge;
  private isWorkerBusy = false;
  private isDisposed = false;
  private stateVersion = 0;

  private materialId = 'silicon-steel';
  private H = 0;
  private B = 0;
  private direction: 1 | -1 = 1;
  private major = false;
  private sawPositive = false;
  private sawNegative = false;
  private auto = false;
  private phase = 0;
  private probeAxial = 0;
  private loop = majorLoopPoints(materialById('silicon-steel'));
  private cached!: HysteresisTelemetry;

  public init(context: ExperimentContext): void {
    this.rootGroup.position.set(0, 0.10, 1.55);
    this.computeBridge = context?.computeBridge;
    this.bench = new HysteresisBenchMesh({ computeBridge: this.computeBridge });
    this.rootGroup.add(this.bench.group);
    this.addDisposable(() => this.bench.dispose());
    this.interaction = new HysteresisInteractionManager({
      bench: this.bench,
      onCycleMaterial: () => this.cycleMaterial(),
      onFieldDrag: (delta) => this.addH(delta),
      onToggleSweep: () => this.setAuto(!this.auto),
      onProbeY: (y) => this.setProbeY(y),
    });
    this.publish();
  }

  public override dispose(context: ExperimentContext): void {
    this.isDisposed = true;
    this.stateVersion++;
    super.dispose(context);
  }

  public override getHoverTarget(raycaster: THREE.Raycaster) {
    return this.interaction?.getHoverTarget(raycaster) ?? null;
  }

  public override onPointerDown(event: PointerEvent, hit: THREE.Intersection | null, context: ExperimentContext): boolean {
    return this.interaction?.onPointerDown(event, hit, context) ?? false;
  }

  public override onPointerMove(event: PointerEvent, hit: THREE.Intersection | null, context: ExperimentContext): void {
    this.interaction?.onPointerMove(event, hit, context);
  }

  public override onPointerUp(event: PointerEvent, context: ExperimentContext): void {
    this.interaction?.onPointerUp(event, context);
  }

  public update(delta: number, _elapsed: number, context: ExperimentContext): void {
    if (this.isDisposed) return;
    const bridge = this.computeBridge ?? context?.computeBridge;
    const dt = Math.min(delta, 0.05);

    if (bridge) {
      if (!this.isWorkerBusy) {
        this.isWorkerBusy = true;
        const currentVersion = this.stateVersion;
        bridge.simulateHysteresis({
          materialId: this.materialId,
          H: this.H,
          B: this.B,
          direction: this.direction,
          major: this.major,
          sawPositive: this.sawPositive,
          sawNegative: this.sawNegative,
          auto: this.auto,
          phase: this.phase,
          probeAxial: this.probeAxial,
          dt,
        }).then((res) => {
          this.isWorkerBusy = false;
          if (this.isDisposed || !res) return;

          // Discard results if user modified the state while worker computation was in flight
          if (currentVersion !== this.stateVersion) {
            return;
          }

          this.phase = res.phase;
          this.H = res.H;
          this.B = res.B;
          this.direction = res.direction;
          this.major = res.major;
          this.sawPositive = res.sawPositive;
          this.sawNegative = res.sawNegative;
          const mat = this.material();
          this.cached = {
            materialId: mat.id,
            materialName: mat.name,
            H: this.H,
            B: this.B,
            currentAmp: res.currentAmp,
            probeTesla: res.probeTesla,
            fluxWb: res.fluxWb,
            area: res.area,
            remanence: res.remanence,
            coercivity: mat.hcAmpPerM,
            major: this.major,
            auto: this.auto,
            caption: res.caption,
            loop: res.loop?.length ? res.loop : this.loop,
          };
          this.bench?.sync({
            materialColor: mat.color,
            H: this.H,
            B: this.B,
            domainSigns: res.domainSigns,
            probeAxial: this.probeAxial,
            auto: this.auto,
            loop: res.loop?.length ? res.loop : this.loop,
            loopKey: mat.id,
          });
        }).catch(() => {
          this.isWorkerBusy = false;
          if (!this.isDisposed) {
            this.advanceAutoMainThread(dt);
          }
        });
      }
    } else {
      this.advanceAutoMainThread(dt);
    }
  }

  private advanceAutoMainThread(dt: number): void {
    if (!this.auto) return;
    this.phase += dt * 1.35;
    this.applyH(H_MAX * Math.sin(this.phase), true);
  }

  public setMaterial(id: string): void {
    this.stateVersion++;
    this.materialId = materialById(id).id;
    this.loop = majorLoopPoints(this.material());
    this.recomputeB();
    this.publish();
  }

  public cycleMaterial(): void {
    this.stateVersion++;
    const index = FERRO_MATERIALS.findIndex((item) => item.id === this.materialId);
    this.setMaterial(FERRO_MATERIALS[(index + 1) % FERRO_MATERIALS.length].id);
  }

  public setH(value: number): void {
    this.applyH(value, false);
  }

  public addH(delta: number): void {
    this.applyH(this.H + delta, false);
  }

  public setAuto(on: boolean): void {
    this.stateVersion++;
    this.auto = on;
    if (on) {
      this.major = true;
      this.phase = Math.asin(THREE.MathUtils.clamp(this.H / H_MAX, -1, 1));
      this.recomputeB();
      this.publish();
    }
  }

  public setProbeY(y: number): void {
    this.stateVersion++;
    this.probeAxial = THREE.MathUtils.clamp(y - SAMPLE_CENTER_Y, -0.22, 0.22);
    this.publish();
  }

  public resetGolden(): void {
    this.stateVersion++;
    this.materialId = 'silicon-steel';
    this.H = 0;
    this.B = 0;
    this.direction = 1;
    this.major = false;
    this.sawPositive = false;
    this.sawNegative = false;
    this.auto = false;
    this.phase = 0;
    this.probeAxial = 0;
    this.loop = majorLoopPoints(this.material());
    this.publish();
  }

  public getTelemetry(): HysteresisTelemetry {
    if (!this.cached) this.publish();
    return this.cached;
  }

  public override onParameterChange(id: string, value: unknown): void {
    if (id === 'material') this.setMaterial(String(value));
    else if (id === 'fieldH') this.setH(Number(value));
    else if (id === 'autoSweep') this.setAuto(Boolean(value));
  }

  private material() {
    return materialById(this.materialId);
  }

  private applyH(value: number, keepAuto: boolean): void {
    this.stateVersion++;
    const next = THREE.MathUtils.clamp(value, -H_MAX, H_MAX);
    const delta = next - this.H;
    if (Math.abs(delta) > 1e-3) {
      this.direction = delta > 0 ? 1 : -1;
      if (next > 0.86 * H_MAX) this.sawPositive = true;
      if (next < -0.86 * H_MAX) this.sawNegative = true;
      if (this.sawPositive && this.sawNegative) this.major = true;
    }
    this.H = next;
    if (!keepAuto) this.auto = false;
    this.recomputeB();
    this.publish();
  }

  private recomputeB(): void {
    const mat = this.material();
    this.B = this.major ? branchB(this.H, this.direction, mat) : virginB(this.H, mat);
  }

  private publish(): void {
    const mat = this.material();
    const area = loopArea(mat);
    this.cached = {
      materialId: mat.id,
      materialName: mat.name,
      H: this.H,
      B: this.B,
      currentAmp: magnetizingCurrent(this.H),
      probeTesla: solenoidSampleField(this.probeAxial, SAMPLE_HALF, this.B),
      fluxWb: searchFluxWb(this.B),
      area,
      remanence: remanence(mat),
      coercivity: mat.hcAmpPerM,
      major: this.major,
      auto: this.auto,
      caption: hysteresisCaption(mat, this.major, area),
      loop: this.loop,
    };
    this.bench?.sync({
      materialColor: mat.color,
      H: this.H,
      B: this.B,
      domainSigns: domainSigns(this.B, mat.bsTesla, 12),
      probeAxial: this.probeAxial,
      auto: this.auto,
      loop: this.loop,
      loopKey: mat.id,
    });
  }
}
