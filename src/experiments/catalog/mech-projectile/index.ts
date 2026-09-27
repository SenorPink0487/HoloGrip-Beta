import { BaseExperiment } from '../../base/BaseExperiment.ts';
import type { ExperimentContext } from '../../../core/types.ts';
import { ProjectileBenchMesh } from '../../../scene/mech/ProjectileBenchMesh.ts';
import {
  solveProjectileDynamics,
  type ProjectileTelemetry,
} from '../../../physics/mech/projectileDynamics.ts';
import { metadata } from './meta.ts';

export default class MechProjectileExperiment extends BaseExperiment {
  public readonly metadata = metadata;
  public override targetScale = 1.8;
  public override hideCenterEmitter = true;

  private bench!: ProjectileBenchMesh;
  private isDisposed = false;

  private releaseHeightM = 0.25;
  private targetYM = 0.40;
  private ballMassKg = 0.030;
  private gravity = 9.80;

  private animProgress = 0.0;
  private telemetry!: ProjectileTelemetry;

  public init(_context: ExperimentContext): void {
    this.rootGroup.position.set(0, 0.12, 1.55);
    this.bench = new ProjectileBenchMesh();
    this.rootGroup.add(this.bench.group);
    this.addDisposable(() => this.bench.dispose());
    this.recalculate();
  }

  public override update(delta: number, _elapsed: number, _context: ExperimentContext): void {
    if (this.isDisposed || !this.telemetry) return;

    this.animProgress += (delta * 0.8) / Math.max(0.1, this.telemetry.flightTimeS);
    if (this.animProgress > 1.0) {
      this.animProgress = 0.0;
    }

    const t = this.animProgress * this.telemetry.flightTimeS;
    const curX = this.telemetry.v0 * t;
    const curY = 0.5 * this.gravity * t * t;
    this.bench.setBallPosition(curX, curY);
  }

  public override onParameterChange(id: string, value: any, _context: ExperimentContext): void {
    if (id === 'releaseHeight') this.releaseHeightM = value;
    else if (id === 'targetY') this.targetYM = value;
    else if (id === 'ballMass') this.ballMassKg = value / 1000.0;
    else if (id === 'gravity') this.gravity = Number(value);
    this.recalculate();
  }

  public getTelemetry(): ProjectileTelemetry {
    return this.telemetry;
  }

  public override dispose(context: ExperimentContext): void {
    this.isDisposed = true;
    super.dispose(context);
  }

  private recalculate(): void {
    this.telemetry = solveProjectileDynamics({
      releaseHeightM: this.releaseHeightM,
      ballMassKg: this.ballMassKg,
      targetYM: this.targetYM,
      gravity: this.gravity,
    });
    this.bench.setLandingPlate(this.telemetry.targetXM, this.telemetry.targetYM);
    this.bench.updateTrajectory(this.telemetry.points);
  }
}
