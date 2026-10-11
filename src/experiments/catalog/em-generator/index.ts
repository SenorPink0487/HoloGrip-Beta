import * as THREE from 'three';
import { BaseExperiment } from '../../base/BaseExperiment.ts';
import { GeneratorBenchMesh } from '../../../scene/em/GeneratorBenchMesh.ts';
import { GeneratorInteractionManager } from '../../../scene/em/GeneratorInteractionManager.ts';
import {
  GENERATOR_GOLDEN_SPEC,
  type GeneratorSpec,
  type GeneratorState,
  type GeneratorReading,
  type GeneratorOutputType,
  solveGeneratorEMF,
  stepGeneratorRotor,
} from '../../../physics/em/generator.ts';
import type { GeneratorTelemetry } from '../../../ui/vision/GeneratorStatusCard.ts';
import { metadata } from './meta.ts';
import type { ExperimentContext } from '../../../core/types.ts';

export default class EmGeneratorExperiment extends BaseExperiment {
  public readonly metadata = metadata;
  public override targetScale = 2.4;
  public override hideCenterEmitter = true;

  private bench!: GeneratorBenchMesh;
  private interaction!: GeneratorInteractionManager;

  private spec: GeneratorSpec = { ...GENERATOR_GOLDEN_SPEC };
  private state: GeneratorState = {
    angleRad: 0,
    omegaRadS: 0,
    outputType: 'ac',
    circuitClosed: true,
    bulbConnected: true,
  };

  private driveTorque = 0;
  private sampleClock = 0;
  private emfHistory: number[] = [];
  private cachedTelemetry!: GeneratorTelemetry;
  private lastReading!: GeneratorReading;

  public init(_context: ExperimentContext): void {
    this.rootGroup.position.set(0, 0.10, 1.55);
    this.bench = new GeneratorBenchMesh();
    this.rootGroup.add(this.bench.group);
    this.addDisposable(() => this.bench.dispose());

    this.interaction = new GeneratorInteractionManager({
      bench: this.bench,
      onCrankDrive: (torque) => {
        this.driveTorque = torque;
      },
      onToggleOutputType: (type) => {
        this.setOutputType(type);
      },
      onToggleBulb: () => {
        this.toggleBulb();
      },
    });

    this.lastReading = solveGeneratorEMF(this.state, this.spec);
    this.refresh(true);
  }

  public override dispose(context: ExperimentContext): void {
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
    this.driveTorque = 0;
  }

  public update(delta: number, _elapsed: number, _context: ExperimentContext): void {
    const dt = Math.min(delta, 0.05);

    // 步进旋转动力学
    this.state = stepGeneratorRotor(this.state, this.driveTorque, this.spec, dt);

    // 拖拽力矩在单帧后自然衰减
    this.driveTorque *= 0.85;
    if (Math.abs(this.driveTorque) < 1e-5) this.driveTorque = 0;

    this.sampleClock += dt;
    this.refresh(false);
  }

  public boostSpeed(): void {
    // 快速手摇加速，赋予 18 rad/s 角速度 (~170 RPM)
    this.state.omegaRadS = 18.84;
    this.refresh(true);
  }

  public setOutputType(type: GeneratorOutputType): void {
    this.state.outputType = type;
    this.refresh(false);
  }

  public setMagField(bTesla: number): void {
    this.spec.magFieldTesla = THREE.MathUtils.clamp(bTesla, 0.05, 1.5);
    this.refresh(false);
  }

  public setTurns(turns: number): void {
    this.spec.turns = THREE.MathUtils.clamp(Math.round(turns), 20, 1000);
    this.refresh(false);
  }

  public toggleBulb(): void {
    this.state.bulbConnected = !this.state.bulbConnected;
    this.refresh(false);
  }

  public reset(): void {
    this.state.angleRad = 0;
    this.state.omegaRadS = 0;
    this.state.outputType = 'ac';
    this.state.circuitClosed = true;
    this.state.bulbConnected = true;
    this.spec = { ...GENERATOR_GOLDEN_SPEC };
    this.emfHistory = [];
    this.sampleClock = 0;
    this.refresh(true);
  }

  public getTelemetry(): GeneratorTelemetry {
    if (!this.cachedTelemetry) this.refresh(true);
    return this.cachedTelemetry;
  }

  public override onParameterChange(id: string, value: unknown): void {
    if (id === 'magField') this.setMagField(Number(value));
    else if (id === 'turns') this.setTurns(Number(value));
    else if (id === 'outputType') this.setOutputType(value as GeneratorOutputType);
  }

  private refresh(forceSample: boolean): void {
    this.lastReading = solveGeneratorEMF(this.state, this.spec);
    const reading = this.lastReading;

    if (forceSample || this.sampleClock >= 0.033) {
      this.sampleClock = 0;
      this.emfHistory.push(reading.emfVolt);
      if (this.emfHistory.length > 160) {
        this.emfHistory.shift();
      }
    }

    this.bench.sync({
      angleRad: this.state.angleRad,
      outputType: this.state.outputType,
      currentAmp: reading.currentAmp,
      emfVolt: reading.emfVolt,
      bulbBrightness: reading.bulbBrightness,
      magFieldTesla: this.spec.magFieldTesla,
      turns: this.spec.turns,
    });

    let caption = '发电机静止，请点击“手摇加速”或拖拽手柄';
    if (Math.abs(reading.rpm) > 10) {
      if (this.state.outputType === 'ac') {
        caption = '双滑环输出正弦交流电：检流计左右交替摆动';
      } else {
        caption = '换向器整流输出脉动直流：检流计单向脉动弹跳';
      }
    }

    this.cachedTelemetry = {
      rpm: reading.rpm,
      outputType: this.state.outputType,
      magFieldTesla: this.spec.magFieldTesla,
      turns: this.spec.turns,
      emfVolt: reading.emfVolt,
      currentAmp: reading.currentAmp,
      bulbPowerWatt: reading.bulbPowerWatt,
      bulbBrightness: reading.bulbBrightness,
      circuitClosed: this.state.circuitClosed,
      bulbConnected: this.state.bulbConnected,
      caption,
      emfHistory: this.emfHistory,
      angleRad: this.state.angleRad,
    };
  }
}
