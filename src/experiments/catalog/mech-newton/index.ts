import { BaseExperiment } from '../../base/BaseExperiment.ts';
import type { ExperimentContext } from '../../../core/types.ts';
import { NewtonBenchMesh } from '../../../scene/mech/NewtonBenchMesh.ts';
import { solveNewtonDynamics, type NewtonTelemetry } from '../../../physics/mech/newtonDynamics.ts';
import { metadata } from './meta.ts';

export default class MechNewtonExperiment extends BaseExperiment {
  public readonly metadata = metadata;
  public override targetScale = 1.8;
  public override hideCenterEmitter = true;

  private bench!: NewtonBenchMesh;
  private isDisposed = false;
  private currentDist = 0.15;
  private cartMassKg = 0.200;
  private hookMassKg = 0.020;
  private inclineDeg = 0.0;
  private frictionMu = 0.02;
  private showForces = true;
  private telemetry!: NewtonTelemetry;

  public init(_context: ExperimentContext): void {
    this.rootGroup.position.set(0, 0.12, 1.55);
    this.bench = new NewtonBenchMesh();
    this.rootGroup.add(this.bench.group);
    this.addDisposable(() => this.bench.dispose());
    this.recalculate();
  }

  public override update(delta: number, _elapsed: number, _context: ExperimentContext): void {
    if (this.isDisposed) return;
    if (this.telemetry && this.telemetry.acceleration > 0) {
      this.currentDist += this.telemetry.acceleration * delta * 0.4;
      if (this.currentDist > 1.05) {
        this.currentDist = 0.15; // 循环回到导轨起点
      }
      this.bench.setCartPosition(this.currentDist);
    }
  }

  public override onParameterChange(id: string, value: any, _context: ExperimentContext): void {
    if (id === 'cartMass') this.cartMassKg = value / 1000.0;
    else if (id === 'hookMass') this.hookMassKg = value / 1000.0;
    else if (id === 'boardAngle') {
      this.inclineDeg = value;
      this.bench.setBoardAngle(value);
    } else if (id === 'frictionMu') {
      this.frictionMu = value;
    } else if (id === 'showForces') {
      this.showForces = value;
    }
    this.recalculate();
  }

  public getTelemetry(): NewtonTelemetry {
    return this.telemetry;
  }

  public resetCart(): void {
    this.currentDist = 0.15;
    this.bench.setCartPosition(this.currentDist);
  }

  public override dispose(context: ExperimentContext): void {
    this.isDisposed = true;
    super.dispose(context);
  }

  private recalculate(): void {
    this.telemetry = solveNewtonDynamics({
      cartMassKg: this.cartMassKg,
      hookMassKg: this.hookMassKg,
      inclineDeg: this.inclineDeg,
      frictionMu: this.frictionMu,
    });
    this.bench.updateForces(
      this.telemetry.normalForceN,
      this.telemetry.tensionN,
      this.telemetry.frictionForceN,
      this.telemetry.cartMassKg * this.telemetry.gravity,
      this.showForces,
    );
    this.bench.renderTickerDots(this.telemetry.dots.map((d) => d.positionM));
  }
}
