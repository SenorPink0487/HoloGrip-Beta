import { BaseExperiment } from '../../base/BaseExperiment.ts';
import type { ExperimentContext } from '../../../core/types.ts';
import { PendulumBenchMesh } from '../../../scene/mech/PendulumBenchMesh.ts';
import {
  solvePendulumDynamics,
  getPendulumAngleAtTime,
  type PendulumTelemetry,
} from '../../../physics/mech/pendulumDynamics.ts';
import { metadata } from './meta.ts';

export default class MechPendulumExperiment extends BaseExperiment {
  public readonly metadata = metadata;
  public override targetScale = 1.8;
  public override hideCenterEmitter = true;

  private bench!: PendulumBenchMesh;
  private isDisposed = false;

  private lineLengthM = 0.80;
  private ballDiameterM = 0.020;
  private initialAngleDeg = 4.0;
  private ballMassKg = 0.030;

  private simTime = 0.0;
  private telemetry!: PendulumTelemetry;

  public init(_context: ExperimentContext): void {
    this.rootGroup.position.set(0, 0.12, 1.55);
    this.bench = new PendulumBenchMesh();
    this.rootGroup.add(this.bench.group);
    this.addDisposable(() => this.bench.dispose());
    this.recalculate();
  }

  public override update(delta: number, _elapsed: number, _context: ExperimentContext): void {
    if (this.isDisposed || !this.telemetry) return;

    this.simTime += delta;
    const { angleRad } = getPendulumAngleAtTime(
      this.simTime,
      this.telemetry.effectiveLengthM,
      this.initialAngleDeg,
      this.telemetry.gravity,
    );

    this.bench.updatePendulum(angleRad, this.telemetry.effectiveLengthM, this.ballDiameterM);
  }

  public override onParameterChange(id: string, value: any, _context: ExperimentContext): void {
    if (id === 'lineLength') this.lineLengthM = value;
    else if (id === 'ballDiameter') this.ballDiameterM = value / 1000.0;
    else if (id === 'initialAngle') this.initialAngleDeg = value;
    else if (id === 'ballMass') this.ballMassKg = value / 1000.0;
    this.recalculate();
  }

  public getTelemetry(): PendulumTelemetry {
    return this.telemetry;
  }

  public override dispose(context: ExperimentContext): void {
    this.isDisposed = true;
    super.dispose(context);
  }

  private recalculate(): void {
    this.telemetry = solvePendulumDynamics({
      lineLengthM: this.lineLengthM,
      ballDiameterM: this.ballDiameterM,
      initialAngleDeg: this.initialAngleDeg,
      ballMassKg: this.ballMassKg,
    });
  }
}
