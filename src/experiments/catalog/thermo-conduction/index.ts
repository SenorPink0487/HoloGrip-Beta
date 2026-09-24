import * as THREE from 'three';
import { BaseExperiment } from '../../base/BaseExperiment.ts';
import { ConductionBenchMesh } from '../../../scene/thermo/ConductionBenchMesh.ts';
import { ConductionInteractionManager } from '../../../scene/thermo/ConductionInteractionManager.ts';
import type { ConductionTelemetryData } from '../../../ui/vision/ConductionStatusCard.ts';
import { metadata } from './meta.ts';
import type { ExperimentContext } from '../../../core/types.ts';

export default class ThermoConductionExperiment extends BaseExperiment {
  public readonly metadata = metadata;
  public override targetScale = 1.95;
  public override hideCenterEmitter = true;

  // 3D Assemblies
  private bench: ConductionBenchMesh;
  private interactionManager: ConductionInteractionManager;

  // Thermodynamic & Specimen Parameters
  private heatSourceTemp = 450; // K
  private coldSourceTemp = 295; // K
  private material = 'copper';
  private lateralInsulation = true;
  private probePositionNorm = 0.5;

  // 1D Discretization & Solver
  private readonly numPoints = 33;
  private tempGrid: Float32Array;
  private tempGridNext: Float32Array;
  private readonly rodLength = 0.32; // meters
  private readonly rodRadius = 0.012; // meters
  private readonly rodArea: number;

  private timeElapsed = 0;
  private isSteadyState = false;
  private lastThermalGradSync = 0;

  constructor() {
    super();
    this.rodArea = Math.PI * this.rodRadius * this.rodRadius;
    this.tempGrid = new Float32Array(this.numPoints);
    this.tempGridNext = new Float32Array(this.numPoints);
    this.resetTemperatureGrid();
  }

  private resetTemperatureGrid(): void {
    // Initial linear gradient
    for (let i = 0; i < this.numPoints; i++) {
      const u = i / (this.numPoints - 1);
      this.tempGrid[i] = THREE.MathUtils.lerp(this.heatSourceTemp, this.coldSourceTemp, u);
      this.tempGridNext[i] = this.tempGrid[i];
    }
    this.timeElapsed = 0;
    this.isSteadyState = false;
  }

  public init(_context: ExperimentContext): void {
    // Rest experiment directly on table surface in interaction zone
    this.rootGroup.position.set(0, -0.056, 0.92);

    // 1. High-precision 3D Conduction Bench
    this.bench = this.track(new ConductionBenchMesh({
      rodLength: this.rodLength,
      rodRadius: this.rodRadius,
    }));
    this.rootGroup.add(this.bench.group);
    this.addDisposable(() => this.bench.dispose());

    // 2. Interaction Manager for probe sliding & material cycling
    this.interactionManager = new ConductionInteractionManager({
      bench: this.bench,
      onProbeDrag: (normX) => this.setProbePosition(normX),
    });

    this.bench.setTemperatures(this.heatSourceTemp, this.coldSourceTemp);
    this.bench.setMaterial(this.material);
    this.bench.updateThermalGradient(this.tempGrid, this.heatSourceTemp, this.coldSourceTemp);
    this.bench.setProbePosition(this.probePositionNorm, this.getProbeTemp(), -480, 185000, true);
  }

  public update(delta: number, _elapsed: number, _context: ExperimentContext): void {
    const dt = Math.min(delta, 0.033);
    this.timeElapsed += dt;

    // 1. Solve 1D Heat Diffusion PDE
    this.stepHeatDiffusion(dt);

    // 2. Update 3D FLIR false color thermal gradient on the specimen rod
    // Only upload texture when not in steady state (throttled to ~15-20 FPS) or periodically
    const now = performance.now();
    if (!this.isSteadyState || now - this.lastThermalGradSync > 1000) {
      if (now - this.lastThermalGradSync >= 60) {
        this.lastThermalGradSync = now;
        this.bench.updateThermalGradient(
          this.tempGrid,
          this.heatSourceTemp,
          this.coldSourceTemp
        );
      }
    }

    // 3. Update probe digital display with live physical gradient and heat flux
    const probeT = this.getProbeTemp();
    const props = this.getMaterialPropsAt(this.probePositionNorm);
    const dx = this.rodLength / (this.numPoints - 1);
    const idx = Math.round(this.probePositionNorm * (this.numPoints - 1));
    const iLeft = Math.max(0, idx - 1);
    const iRight = Math.min(this.numPoints - 1, idx + 1);
    const localGrad = (this.tempGrid[iRight] - this.tempGrid[iLeft]) / ((iRight - iLeft) * dx);
    const localFlux = -props.k * localGrad;
    this.bench.setProbePosition(this.probePositionNorm, probeT, localGrad, localFlux);
  }

  /**
   * 1D Transient Heat Diffusion Finite Difference Solver
   * \rho c_p \frac{\partial T}{\partial t} = k \frac{\partial^2 T}{\partial x^2} - convective_loss
   */
  private stepHeatDiffusion(dt: number): void {
    const dx = this.rodLength / (this.numPoints - 1);
    const dx2 = dx * dx;

    // Boundary conditions
    this.tempGrid[0] = this.heatSourceTemp;
    this.tempGrid[this.numPoints - 1] = this.coldSourceTemp;

    // Convective cooling factor when insulation is OFF
    const convLossCoeff = this.lateralInsulation ? 0.0 : 0.085; // convective loss
    const ambientT = 295.0;

    // Multi-substep integration for numerical stability
    const subSteps = 6;
    const subDt = (dt * 1.5) / subSteps;

    let maxChange = 0;

    for (let step = 0; step < subSteps; step++) {
      for (let i = 1; i < this.numPoints - 1; i++) {
        const u = i / (this.numPoints - 1);
        const { alpha } = this.getMaterialPropsAt(u);

        // Effective numerical diffusivity with stability capping
        const r = (alpha * subDt) / dx2;
        const boundedR = Math.min(0.45, r);

        const d2T = this.tempGrid[i + 1] - 2 * this.tempGrid[i] + this.tempGrid[i - 1];
        const loss = convLossCoeff * (this.tempGrid[i] - ambientT) * subDt;

        const deltaT = boundedR * d2T - loss;
        this.tempGridNext[i] = this.tempGrid[i] + deltaT;

        const change = Math.abs(deltaT);
        if (change > maxChange) maxChange = change;
      }

      for (let i = 1; i < this.numPoints - 1; i++) {
        this.tempGrid[i] = this.tempGridNext[i];
      }
    }

    this.isSteadyState = maxChange < 0.005;
  }

  private getMaterialPropsAt(normX: number): { k: number; alpha: number; name: string } {
    if (this.material === 'copper') {
      return { k: 390, alpha: 1.13e-4, name: '高纯紫铜 (k = 390 W/m·K)' };
    } else if (this.material === 'aluminum') {
      return { k: 210, alpha: 8.64e-5, name: '硬铝合金 (k = 210 W/m·K)' };
    } else if (this.material === 'steel') {
      return { k: 16, alpha: 4.05e-6, name: '304不锈钢 (k = 16 W/m·K)' };
    } else {
      // Composite: Left half copper, Right half stainless steel
      if (normX <= 0.5) {
        return { k: 390, alpha: 1.13e-4, name: '铜-钢复合棒 (铜区 k = 390)' };
      } else {
        return { k: 16, alpha: 4.05e-6, name: '铜-钢复合棒 (钢区 k = 16)' };
      }
    }
  }

  private getProbeTemp(): number {
    const idxExact = this.probePositionNorm * (this.numPoints - 1);
    const i0 = Math.floor(idxExact);
    const i1 = Math.min(this.numPoints - 1, i0 + 1);
    const frac = idxExact - i0;
    return THREE.MathUtils.lerp(this.tempGrid[i0], this.tempGrid[i1], frac);
  }

  // =========================================================================
  // Telemetry Provider for UI Status Card
  // =========================================================================
  public getConductionTelemetry(): ConductionTelemetryData {
    const props = this.getMaterialPropsAt(this.probePositionNorm);
    const probeT = this.getProbeTemp();

    // Local gradient dT/dx (K/m)
    const dx = this.rodLength / (this.numPoints - 1);
    const idxExact = this.probePositionNorm * (this.numPoints - 1);
    const i0 = Math.max(0, Math.min(this.numPoints - 2, Math.floor(idxExact)));
    const grad = (this.tempGrid[i0 + 1] - this.tempGrid[i0]) / dx;

    // Fourier: q = -k * grad
    const localFlux = -props.k * grad; // W/m^2
    const totalPower = Math.abs(localFlux) * this.rodArea;

    return {
      heatSourceTemp: this.heatSourceTemp,
      coldSourceTemp: this.coldSourceTemp,
      material: this.material,
      materialName: props.name,
      kValue: props.k,
      diffusivity: Math.round(props.alpha * 1e6),
      lateralInsulation: this.lateralInsulation,
      probePositionNorm: this.probePositionNorm,
      probePositionMm: Math.round(this.probePositionNorm * this.rodLength * 1000),
      probeTempK: probeT,
      probeGradient: grad,
      localHeatFlux: localFlux,
      totalHeatFlowW: totalPower,
      timeElapsed: this.timeElapsed,
      isSteadyState: this.isSteadyState,
      tempProfile: Array.from(this.tempGrid),
    };
  }

  public getThermodynamicTelemetry(): any {
    return this.getConductionTelemetry();
  }

  // =========================================================================
  // Interactive Handlers
  // =========================================================================
  public setHeatSourceTemp(tempK: number): void {
    this.heatSourceTemp = Math.max(320, Math.min(650, tempK));
    this.bench.setTemperatures(this.heatSourceTemp, this.coldSourceTemp);
    this.isSteadyState = false;
    this.lastThermalGradSync = 0;
  }

  public setColdSourceTemp(tempK: number): void {
    this.coldSourceTemp = Math.max(250, Math.min(330, tempK));
    this.bench.setTemperatures(this.heatSourceTemp, this.coldSourceTemp);
    this.isSteadyState = false;
    this.lastThermalGradSync = 0;
  }

  public setMaterial(material: string): void {
    this.material = material;
    this.bench.setMaterial(material);
    this.resetTemperatureGrid();
    this.lastThermalGradSync = 0;
  }

  public setLateralInsulation(insulated: boolean): void {
    this.lateralInsulation = insulated;
    this.isSteadyState = false;
    this.lastThermalGradSync = 0;
  }

  public setProbePosition(normX: number): void {
    this.probePositionNorm = THREE.MathUtils.clamp(normX, 0.0, 1.0);
    const probeT = this.getProbeTemp();
    const props = this.getMaterialPropsAt(this.probePositionNorm);
    const dx = this.rodLength / (this.numPoints - 1);
    const idx = Math.round(this.probePositionNorm * (this.numPoints - 1));
    const iLeft = Math.max(0, idx - 1);
    const iRight = Math.min(this.numPoints - 1, idx + 1);
    const localGrad = (this.tempGrid[iRight] - this.tempGrid[iLeft]) / ((iRight - iLeft) * dx);
    const localFlux = -props.k * localGrad;
    this.bench.setProbePosition(this.probePositionNorm, probeT, localGrad, localFlux);
  }

  public resetTransient(): void {
    // Perturb rod back to room temperature to watch transient thermal wave propagate
    for (let i = 1; i < this.numPoints - 1; i++) {
      this.tempGrid[i] = 295.0;
    }
    this.timeElapsed = 0;
    this.isSteadyState = false;
    this.lastThermalGradSync = 0;
  }

  public override onParameterChange(paramId: string, value: any): void {
    if (paramId === 'heatSourceTemp') {
      this.setHeatSourceTemp(Number(value));
    } else if (paramId === 'coldSourceTemp') {
      this.setColdSourceTemp(Number(value));
    } else if (paramId === 'material') {
      this.setMaterial(String(value));
    } else if (paramId === 'lateralInsulation') {
      this.setLateralInsulation(Boolean(value));
    } else if (paramId === 'probePosition') {
      this.setProbePosition(Number(value));
    }
  }

  // Pointer delegation
  public override getHoverTarget(raycaster: THREE.Raycaster): { id: string; label: string; cursor?: string } | null {
    return this.interactionManager?.getHoverTarget(raycaster) ?? null;
  }

  public override onPointerDown(event: PointerEvent, hit: THREE.Intersection | null, context: ExperimentContext): boolean {
    return this.interactionManager?.onPointerDown(event, hit, context) ?? false;
  }

  public override onPointerMove(event: PointerEvent, hit: THREE.Intersection | null, context: ExperimentContext): void {
    this.interactionManager?.onPointerMove(event, hit, context);
  }

  public override onPointerUp(event: PointerEvent, context: ExperimentContext): void {
    this.interactionManager?.onPointerUp(event, context);
  }
}
