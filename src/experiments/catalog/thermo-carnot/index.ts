import * as THREE from 'three';
import { BaseExperiment } from '../../base/BaseExperiment.ts';
import { CarnotEngineMesh } from '../../../scene/thermo/CarnotEngineMesh.ts';
import { CarnotMolecularSystem } from '../../../scene/thermo/CarnotMolecularSystem.ts';
import { CarnotInteractionManager } from '../../../scene/thermo/CarnotInteractionManager.ts';
import type { CarnotTelemetryData } from '../../../ui/vision/CarnotStatusCard.ts';
import { metadata } from './meta.ts';
import type { ExperimentContext } from '../../../core/types.ts';

export default class ThermoCarnotExperiment extends BaseExperiment {
  public readonly metadata = metadata;
  public override targetScale = 1.95;
  public override hideCenterEmitter = true;

  // 3D Scene Assemblies
  private engine: CarnotEngineMesh;
  private molecularSystem: CarnotMolecularSystem;
  private interactionManager: CarnotInteractionManager;

  // Thermodynamic State Parameters
  private tempHigh = 600;       // K
  private tempLow = 300;        // K
  private compressionRatio = 2.2; // V2 / V1
  private gasMoles = 0.10;      // mol
  private readonly gamma = 1.40;// Diatomic gas heat capacity ratio
  private readonly R_GAS = 8.314;// J/(mol·K)

  // Operating State
  private isRunning = true;
  private isReversed = false;
  private operationMode: 'continuous' | 'step' = 'continuous';
  private showParticles = true;
  private theta = 0;            // Flywheel/Crank angle [0, 2pi)
  private angularVelocity = 4.2;// rad/s
  private speedMultiplier = 1.0;

  // Precomputed Cycle Quantities
  private v1 = 1.50; // L
  private v2 = 3.30; // L
  private v3 = 5.65; // L
  private v4 = 2.57; // L
  private p1 = 332.6; // kPa
  private p2 = 151.2; // kPa
  private p3 = 44.1;  // kPa
  private p4 = 97.0;  // kPa
  private s1 = 1.0;   // J/K
  private s2 = 1.65;  // J/K
  private qHigh = 393.5;// J
  private qLow = 196.7; // J
  private netWork = 196.8;// J
  private efficiency = 50.0;// %

  // Telemetry Cache
  private currentStage: 1 | 2 | 3 | 4 = 1;
  private stageProgress = 0;
  private currentTemp = 600;
  private currentVol = 1.50;
  private currentPress = 332.6;
  private currentEntropy = 1.0;

  public init(_context: ExperimentContext): void {
    // Rest experiment directly on tabletop in front interaction area
    this.rootGroup.position.set(0, -0.056, 0.92);

    // 1. High-precision 3D Kinematic Crank-Flywheel Carnot Heat Engine
    this.engine = this.track(new CarnotEngineMesh());
    this.rootGroup.add(this.engine.group);
    this.addDisposable(() => this.engine.dispose());

    // 2. Microscopic Molecular Gas Simulation inside Quartz Cylinder
    this.molecularSystem = this.track(new CarnotMolecularSystem());
    this.molecularSystem.group.position.copy(this.engine.cylinderCenter);
    this.rootGroup.add(this.molecularSystem.group);
    this.molecularSystem.setVisible(this.showParticles);
    this.addDisposable(() => this.molecularSystem.dispose());

    // 3. 3D Interaction Manager
    this.interactionManager = new CarnotInteractionManager({
      engine: this.engine,
      onToggleRunning: () => this.toggleRunning(),
      onToggleDirection: () => this.toggleDirection(),
      onRotateFlywheel: (deltaTheta) => this.rotateFlywheelManually(deltaTheta),
    });

    this.recalculateCycleMath();
  }

  /**
   * Recalculates all four thermodynamic cycle vertices and invariants
   */
  private recalculateCycleMath(): void {
    // 1. Minimum Volume V1 (at top dead center)
    this.v1 = 1.50;

    // 2. Isothermal Expansion Volume V2
    this.v2 = this.v1 * this.compressionRatio;

    // 3. Adiabatic Expansion to Tc: Th * V2^(gamma-1) = Tc * V3^(gamma-1)
    const tempRatio = this.tempHigh / this.tempLow;
    const volExpansionFactor = Math.pow(tempRatio, 1 / (this.gamma - 1));
    this.v3 = this.v2 * volExpansionFactor;

    // 4. Adiabatic Compression to Th from V4 to V1:
    this.v4 = this.v1 * volExpansionFactor;

    // Pressures at the 4 vertices (P = nRT / V) in kPa (since V is in Liters and R is 8.314 J/mol·K)
    // 1 mol * 8.314 J/(mol K) * K / (10^-3 m^3) = 8.314 kPa·L
    const R_KPA = 8.314;
    this.p1 = (this.gasMoles * R_KPA * this.tempHigh) / this.v1;
    this.p2 = (this.gasMoles * R_KPA * this.tempHigh) / this.v2;
    this.p3 = (this.gasMoles * R_KPA * this.tempLow) / this.v3;
    this.p4 = (this.gasMoles * R_KPA * this.tempLow) / this.v4;

    // Entropy and Heat
    const deltaS = this.gasMoles * this.R_GAS * Math.log(this.v2 / this.v1);
    this.s1 = 1.0;
    this.s2 = this.s1 + deltaS;

    this.qHigh = this.gasMoles * this.R_GAS * this.tempHigh * Math.log(this.v2 / this.v1);
    this.qLow = this.gasMoles * this.R_GAS * this.tempLow * Math.log(this.v2 / this.v1);
    this.netWork = this.qHigh - this.qLow;
    this.efficiency = ((this.tempHigh - this.tempLow) / this.tempHigh) * 100;

    // Dynamic steady-state angular velocity based on net work & temperature gradient
    const baseW = Math.max(1.0, Math.sqrt((this.tempHigh - this.tempLow) / 300) * 4.5);
    this.angularVelocity = baseW;
  }

  public update(delta: number, _elapsed: number, _context: ExperimentContext): void {
    // 1. Advance Flywheel Kinematics
    if (this.isRunning && this.operationMode === 'continuous') {
      const dirSign = this.isReversed ? -1 : 1;
      const dTheta = this.angularVelocity * this.speedMultiplier * delta * dirSign;
      this.theta = (this.theta + dTheta) % (Math.PI * 2);
      if (this.theta < 0) this.theta += Math.PI * 2;
    }

    // 2. Solve 3D Linkage Geometry
    const kin = this.engine.updateKinematics(this.theta);

    // 3. Interpolate Thermodynamic Cycle State from Crank Angle theta
    this.evaluateInstantaneousState();

    // 4. Update Engine VFX, Lights & Thermal Plate Materials
    this.engine.setCycleState(this.currentStage, this.stageProgress, this.currentTemp, this.isReversed);

    // 5. Update Microscopic Molecular Gas Kinetics
    if (this.showParticles) {
      this.molecularSystem.setThermodynamicState(this.currentTemp, kin.pistonHeight);
      this.molecularSystem.update(delta);
    }
  }

  /**
   * Resolves exact (P, V, T, S) from the current cycle angle
   */
  private evaluateInstantaneousState(): void {
    // Full crank circle (2pi) is divided into 4 cycle stages
    // Stage 1 (0 to pi/2): Isothermal Expansion (Th)
    // Stage 2 (pi/2 to pi): Adiabatic Expansion (Th -> Tc)
    // Stage 3 (pi to 3pi/2): Isothermal Compression (Tc)
    // Stage 4 (3pi/2 to 2pi): Adiabatic Compression (Tc -> Th)

    const normAngle = this.theta / (Math.PI * 2); // [0, 1)
    const stageIndex = Math.floor(normAngle * 4); // 0, 1, 2, 3
    this.stageProgress = (normAngle * 4) % 1;
    this.currentStage = (stageIndex + 1) as 1 | 2 | 3 | 4;

    const u = this.stageProgress;
    const R_KPA = 8.314;

    if (this.currentStage === 1) {
      // Isothermal Expansion at Th: V increases from v1 to v2
      this.currentTemp = this.tempHigh;
      this.currentVol = this.v1 + (this.v2 - this.v1) * u;
      this.currentPress = (this.gasMoles * R_KPA * this.tempHigh) / this.currentVol;
      this.currentEntropy = this.s1 + (this.s2 - this.s1) * u;
    } else if (this.currentStage === 2) {
      // Adiabatic Expansion: V increases from v2 to v3, T drops from Th to Tc
      this.currentVol = this.v2 + (this.v3 - this.v2) * u;
      this.currentTemp = this.tempHigh * Math.pow(this.v2 / this.currentVol, this.gamma - 1);
      this.currentPress = (this.gasMoles * R_KPA * this.currentTemp) / this.currentVol;
      this.currentEntropy = this.s2;
    } else if (this.currentStage === 3) {
      // Isothermal Compression at Tc: V decreases from v3 to v4
      this.currentTemp = this.tempLow;
      this.currentVol = this.v3 - (this.v3 - this.v4) * u;
      this.currentPress = (this.gasMoles * R_KPA * this.tempLow) / this.currentVol;
      this.currentEntropy = this.s2 - (this.s2 - this.s1) * u;
    } else {
      // Adiabatic Compression: V decreases from v4 to v1, T rises from Tc to Th
      this.currentVol = this.v4 - (this.v4 - this.v1) * u;
      this.currentTemp = this.tempLow * Math.pow(this.v4 / this.currentVol, this.gamma - 1);
      this.currentPress = (this.gasMoles * R_KPA * this.currentTemp) / this.currentVol;
      this.currentEntropy = this.s1;
    }
  }

  // =========================================================================
  // Telemetry Provider for UI Status Card
  // =========================================================================
  public getCarnotTelemetry(): CarnotTelemetryData {
    const stageNames: Record<number, string> = {
      1: this.isReversed ? '等温放热 (逆向排热)' : '等温膨胀 (吸热做功)',
      2: this.isReversed ? '绝热压缩 (耗功升温)' : '绝热膨胀 (做功降温)',
      3: this.isReversed ? '等温吸热 (逆向深冷)' : '等温压缩 (放热耗功)',
      4: this.isReversed ? '绝热膨胀 (降温归零)' : '绝热压缩 (耗功升温)',
    };

    const freqHz = (this.angularVelocity * this.speedMultiplier) / (Math.PI * 2);
    const rpm = this.isRunning ? Math.round(freqHz * 60) : 0;
    const powerW = this.isRunning ? this.netWork * freqHz : 0;

    return {
      tempHigh: this.tempHigh,
      tempLow: this.tempLow,
      currentTemp: this.currentTemp,
      currentVol: this.currentVol,
      currentPress: this.currentPress,
      currentEntropy: this.currentEntropy,
      efficiency: this.efficiency,
      qHigh: this.qHigh,
      qLow: this.qLow,
      netWork: this.netWork,
      mechPower: powerW,
      flywheelRpm: rpm,
      currentStage: this.currentStage,
      stageName: stageNames[this.currentStage] || '稳态循环',
      stageProgress: this.stageProgress,
      isReversed: this.isReversed,
      isRunning: this.isRunning,
      v1: this.v1,
      v2: this.v2,
      v3: this.v3,
      v4: this.v4,
      p1: this.p1,
      p2: this.p2,
      p3: this.p3,
      p4: this.p4,
      s1: this.s1,
      s2: this.s2,
    };
  }

  // Backwards compatibility fallback if queried generic
  public getThermodynamicTelemetry(): any {
    return this.getCarnotTelemetry();
  }

  // =========================================================================
  // Interactive Control Handlers
  // =========================================================================
  public setTempHigh(tempK: number): void {
    this.tempHigh = Math.max(this.tempLow + 30, tempK);
    this.recalculateCycleMath();
  }

  public setTempLow(tempK: number): void {
    this.tempLow = Math.min(this.tempHigh - 30, tempK);
    this.recalculateCycleMath();
  }

  public toggleRunning(): void {
    this.isRunning = !this.isRunning;
    this.engine.setRunning(this.isRunning);
  }

  public toggleDirection(): void {
    this.isReversed = !this.isReversed;
    this.engine.setDirection(this.isReversed ? 'reverse' : 'forward');
  }

  public stepStage(step: 1 | -1): void {
    this.operationMode = 'step';
    const deltaQuarter = (Math.PI * 0.5) * step;
    this.theta = (this.theta + deltaQuarter) % (Math.PI * 2);
    if (this.theta < 0) this.theta += Math.PI * 2;
    this.engine.updateKinematics(this.theta);
    this.evaluateInstantaneousState();
    this.engine.setCycleState(this.currentStage, this.stageProgress, this.currentTemp, this.isReversed);
  }

  public rotateFlywheelManually(deltaTheta: number): void {
    this.theta = (this.theta + deltaTheta) % (Math.PI * 2);
    if (this.theta < 0) this.theta += Math.PI * 2;
    this.engine.updateKinematics(this.theta);
    this.evaluateInstantaneousState();
    this.engine.setCycleState(this.currentStage, this.stageProgress, this.currentTemp, this.isReversed);
  }

  public applyPreset(preset: 'steam' | 'extreme' | 'stirling' | 'refrig'): void {
    if (preset === 'steam') {
      this.tempHigh = 650;
      this.tempLow = 300;
      this.compressionRatio = 2.2;
      this.isReversed = false;
    } else if (preset === 'extreme') {
      this.tempHigh = 950;
      this.tempLow = 200;
      this.compressionRatio = 2.8;
      this.isReversed = false;
    } else if (preset === 'stirling') {
      this.tempHigh = 360;
      this.tempLow = 290;
      this.compressionRatio = 1.6;
      this.isReversed = false;
    } else if (preset === 'refrig') {
      this.tempHigh = 320;
      this.tempLow = 240;
      this.compressionRatio = 1.8;
      this.isReversed = true;
    }
    this.engine.setDirection(this.isReversed ? 'reverse' : 'forward');
    this.recalculateCycleMath();
  }

  public override onParameterChange(paramId: string, value: any): void {
    if (paramId === 'tempHigh') {
      this.setTempHigh(Number(value));
    } else if (paramId === 'tempLow') {
      this.setTempLow(Number(value));
    } else if (paramId === 'compressionRatio') {
      this.compressionRatio = Number(value);
      this.recalculateCycleMath();
    } else if (paramId === 'gasMoles') {
      this.gasMoles = Number(value);
      this.recalculateCycleMath();
    } else if (paramId === 'cycleDirection') {
      this.isReversed = value === 'reverse';
      this.engine.setDirection(this.isReversed ? 'reverse' : 'forward');
    } else if (paramId === 'operationMode') {
      this.operationMode = value as 'continuous' | 'step';
    } else if (paramId === 'showParticles') {
      this.showParticles = Boolean(value);
      this.molecularSystem.setVisible(this.showParticles);
    }
  }

  // =========================================================================
  // Pointer & Raycast Delegation to CarnotInteractionManager
  // =========================================================================
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
