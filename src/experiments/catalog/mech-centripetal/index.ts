import { BaseExperiment } from '../../base/BaseExperiment.ts';
import type { ExperimentContext } from '../../../core/types.ts';
import { CentripetalBenchMesh } from '../../../scene/mech/CentripetalBenchMesh.ts';
import {
  solveCentripetalDynamics,
  type CentripetalTelemetry,
} from '../../../physics/mech/centripetalDynamics.ts';
import { metadata } from './meta.ts';

export default class MechCentripetalExperiment extends BaseExperiment {
  public readonly metadata = metadata;
  public override targetScale = 1.8;
  public override hideCenterEmitter = true;

  private bench!: CentripetalBenchMesh;
  private isDisposed = false;

  private massKg = 0.100;
  private radiusM = 0.10;
  private angularVelocityRadS = 8.0;

  private currentAngle = 0.0;
  private telemetry!: CentripetalTelemetry;

  public init(_context: ExperimentContext): void {
    this.rootGroup.position.set(0, 0.12, 1.55);
    this.bench = new CentripetalBenchMesh();
    this.rootGroup.add(this.bench.group);
    this.addDisposable(() => this.bench.dispose());
    this.recalculate();
  }

  public override update(delta: number, _elapsed: number, _context: ExperimentContext): void {
    if (this.isDisposed || !this.telemetry) return;

    this.currentAngle += this.telemetry.angularVelocityRadS * delta;
    if (this.currentAngle > Math.PI * 2) {
      this.currentAngle -= Math.PI * 2;
    }

    this.bench.updateCentripetal(
      this.currentAngle,
      this.telemetry.radiusM,
      this.telemetry.centripetalForceN,
      this.telemetry.indicatorScaleMarks,
    );
  }

  public override onParameterChange(id: string, value: any, _context: ExperimentContext): void {
    if (id === 'mass') this.massKg = Number(value) / 1000.0;
    else if (id === 'radius') this.radiusM = Number(value);
    else if (id === 'angularVelocity') this.angularVelocityRadS = Number(value);
    this.recalculate();
  }

  public getTelemetry(): CentripetalTelemetry {
    return this.telemetry;
  }

  public override dispose(context: ExperimentContext): void {
    this.isDisposed = true;
    super.dispose(context);
  }

  private recalculate(): void {
    this.telemetry = solveCentripetalDynamics({
      massKg: this.massKg,
      radiusM: this.radiusM,
      angularVelocityRadS: this.angularVelocityRadS,
    });
  }
}
