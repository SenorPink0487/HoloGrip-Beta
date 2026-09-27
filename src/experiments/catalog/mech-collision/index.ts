import { BaseExperiment } from '../../base/BaseExperiment.ts';
import type { ExperimentContext } from '../../../core/types.ts';
import { AirTrackBenchMesh } from '../../../scene/mech/AirTrackBenchMesh.ts';
import {
  solveCollisionDynamics,
  type CollisionTelemetry,
  type CollisionMode,
} from '../../../physics/mech/collisionDynamics.ts';
import { metadata } from './meta.ts';

export default class MechCollisionExperiment extends BaseExperiment {
  public readonly metadata = metadata;
  public override targetScale = 1.8;
  public override hideCenterEmitter = true;

  private bench!: AirTrackBenchMesh;
  private isDisposed = false;

  private m1Kg = 0.150;
  private m2Kg = 0.150;
  private v1 = 0.8;
  private v2 = 0.0;
  private mode: CollisionMode = 'elastic';

  private car1X = -0.45;
  private car2X = 0.0;
  private car1V = 0.8;
  private car2V = 0.0;

  private telemetry!: CollisionTelemetry;

  public init(_context: ExperimentContext): void {
    this.rootGroup.position.set(0, 0.12, 1.55);
    this.bench = new AirTrackBenchMesh();
    this.rootGroup.add(this.bench.group);
    this.addDisposable(() => this.bench.dispose());
    this.recalculate();
    this.resetGliders();
  }

  public override update(delta: number, _elapsed: number, _context: ExperimentContext): void {
    if (this.isDisposed) return;

    this.car1X += this.car1V * delta * 0.5;
    this.car2X += this.car2V * delta * 0.5;

    // Check collision threshold between gliders (distance < 0.14)
    if (this.car1X + 0.14 >= this.car2X && this.car1V > this.car2V) {
      // Trigger collision velocity switch based on analytical model
      this.car1V = this.telemetry.v1After;
      this.car2V = this.telemetry.v2After;
    }

    // Auto reset if gliders reach boundaries
    if (this.car2X > 0.65 || this.car1X < -0.65) {
      this.resetGliders();
    }

    this.bench.setGliderPositions(this.car1X, this.car2X);
  }

  public override onParameterChange(id: string, value: any, _context: ExperimentContext): void {
    if (id === 'mass1') this.m1Kg = value / 1000.0;
    else if (id === 'mass2') this.m2Kg = value / 1000.0;
    else if (id === 'velocity1') this.v1 = value;
    else if (id === 'velocity2') this.v2 = value;
    else if (id === 'collisionMode') this.mode = value as CollisionMode;
    this.recalculate();
    this.resetGliders();
  }

  public resetGliders(): void {
    this.car1X = -0.45;
    this.car2X = 0.0;
    this.car1V = this.v1;
    this.car2V = this.v2;
    this.bench.setGliderPositions(this.car1X, this.car2X);
  }

  public getTelemetry(): CollisionTelemetry {
    return this.telemetry;
  }

  public override dispose(context: ExperimentContext): void {
    this.isDisposed = true;
    super.dispose(context);
  }

  private recalculate(): void {
    this.telemetry = solveCollisionDynamics({
      m1Kg: this.m1Kg,
      m2Kg: this.m2Kg,
      v1: this.v1,
      v2: this.v2,
      mode: this.mode,
    });
  }
}
