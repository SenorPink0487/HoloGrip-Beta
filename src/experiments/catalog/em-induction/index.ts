import * as THREE from 'three';
import { BaseExperiment } from '../../base/BaseExperiment.ts';
import { COIL_AXIS_Y, InductionBenchMesh } from '../../../scene/em/InductionBenchMesh.ts';
import { InductionInteractionManager } from '../../../scene/em/InductionInteractionManager.ts';
import {
  INDUCTION_GOLDEN,
  evaluateInduction,
  inductionCaption,
  type InductionInput,
} from '../../../physics/em/induction.ts';
import type { InductionTelemetry } from '../../../ui/vision/InductionStatusCard.ts';
import { metadata } from './meta.ts';
import type { ExperimentContext } from '../../../core/types.ts';

const AXIAL_MIN = -0.18;
const AXIAL_MAX = 0.26;
const TURN_PRESETS = [100, 200, 400, 800];

export default class EmInductionExperiment extends BaseExperiment {
  public readonly metadata = metadata;
  public override targetScale = 2.4;
  public override hideCenterEmitter = true;

  private bench!: InductionBenchMesh;
  private interaction!: InductionInteractionManager;

  private axial = INDUCTION_GOLDEN.axial;
  private velocity = 0;
  private poleSign: 1 | -1 = INDUCTION_GOLDEN.poleSign;
  private turns = INDUCTION_GOLDEN.turns;
  private resistanceOhm = INDUCTION_GOLDEN.resistanceOhm;
  private probeAxial = 0;
  private driven = false;
  private scripted = false;
  private lastDragMs = 0;
  private sampleClock = 0;
  private fluxHistory: number[] = [];
  private emfHistory: number[] = [];
  private cached!: InductionTelemetry;

  public init(_context: ExperimentContext): void {
    this.rootGroup.position.set(0, 0.10, 1.55);
    this.bench = new InductionBenchMesh();
    this.rootGroup.add(this.bench.group);
    this.addDisposable(() => this.bench.dispose());

    this.interaction = new InductionInteractionManager({
      bench: this.bench,
      onMagnetY: (y) => this.setAxialFromPointer(y),
      onProbeY: (y) => this.setProbeFromPointer(y),
      onFlipPole: () => this.flipPole(),
      onCycleTurns: () => this.cycleTurns(),
      onStartPass: () => this.startPass(),
      onToggleSwitch: (closed) => {
        this.bench.setSwitchClosed(closed);
        this.refresh(false);
      },
    });

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
    if (this.driven) {
      this.driven = false;
    }
  }

  public update(delta: number, _elapsed: number, _context: ExperimentContext): void {
    const dt = Math.min(delta, 0.05);
    this.advanceKinematics(dt);
  }

  private advanceKinematics(dt: number): void {
    if (!this.driven) {
      if (this.scripted) {
        this.axial += this.velocity * dt;
        if ((this.velocity < 0 && this.axial <= AXIAL_MIN) || (this.velocity > 0 && this.axial >= AXIAL_MAX)) {
          this.axial = THREE.MathUtils.clamp(this.axial, AXIAL_MIN, AXIAL_MAX);
          this.velocity = 0;
          this.scripted = false;
        }
      } else {
        this.velocity *= Math.exp(-2.8 * dt);
        if (Math.abs(this.velocity) < 0.008) this.velocity = 0;
        this.axial += this.velocity * dt;
        if (this.axial <= AXIAL_MIN || this.axial >= AXIAL_MAX) {
          this.axial = THREE.MathUtils.clamp(this.axial, AXIAL_MIN, AXIAL_MAX);
          this.velocity = 0;
        }
      }
    }
    this.sampleClock += dt;
    this.refresh(false);
  }

  public setAxial(axial: number): void {
    const next = THREE.MathUtils.clamp(axial, AXIAL_MIN, AXIAL_MAX);
    this.velocity = THREE.MathUtils.clamp((next - this.axial) / 0.05, -2, 2);
    this.axial = next;
    this.scripted = false;
    this.driven = false;
    this.refresh(true);
    this.velocity = 0;
  }

  public setProbe(axial: number): void {
    this.probeAxial = THREE.MathUtils.clamp(axial, AXIAL_MIN, AXIAL_MAX);
    this.refresh(false);
  }

  public setTurns(turns: number): void {
    this.turns = THREE.MathUtils.clamp(Math.round(turns), 50, 800);
    this.refresh(false);
  }

  public setResistance(ohm: number): void {
    this.resistanceOhm = THREE.MathUtils.clamp(ohm, 1, 40);
    this.refresh(false);
  }

  public flipPole(): void {
    this.poleSign = this.poleSign > 0 ? -1 : 1;
    this.refresh(false);
  }

  public cycleTurns(): void {
    const index = TURN_PRESETS.findIndex((value) => value >= this.turns);
    const next = TURN_PRESETS[(index + 1) % TURN_PRESETS.length] ?? TURN_PRESETS[0];
    this.setTurns(next);
  }

  public startPass(): void {
    this.driven = false;
    this.scripted = true;
    this.velocity = this.axial > 0 ? -0.42 : 0.42;
    this.refresh(false);
  }

  public resetGolden(): void {
    this.axial = INDUCTION_GOLDEN.axial;
    this.velocity = 0;
    this.poleSign = INDUCTION_GOLDEN.poleSign;
    this.turns = INDUCTION_GOLDEN.turns;
    this.resistanceOhm = INDUCTION_GOLDEN.resistanceOhm;
    this.probeAxial = 0;
    this.driven = false;
    this.scripted = false;
    this.fluxHistory = [];
    this.emfHistory = [];
    this.sampleClock = 0;
    this.bench.setSwitchClosed(true);
    this.refresh(true);
  }

  public getTelemetry(): InductionTelemetry {
    if (!this.cached) this.refresh(true);
    return this.cached;
  }

  public override onParameterChange(id: string, value: unknown): void {
    if (id === 'axial') this.setAxial(Number(value));
    else if (id === 'turns') this.setTurns(Number(value));
    else if (id === 'resistance') this.setResistance(Number(value));
    else if (id === 'probe') this.setProbe(Number(value));
  }

  private setAxialFromPointer(y: number): void {
    const next = THREE.MathUtils.clamp(y - COIL_AXIS_Y, AXIAL_MIN, AXIAL_MAX);
    const now = performance.now();
    const dt = (now - this.lastDragMs) / 1000;
    if (this.lastDragMs > 0 && dt > 0.001 && dt < 0.25) {
      this.velocity = THREE.MathUtils.clamp((next - this.axial) / dt, -2, 2);
    }
    this.lastDragMs = now;
    this.axial = next;
    this.driven = true;
    this.scripted = false;
    this.refresh(false);
  }

  private setProbeFromPointer(y: number): void {
    this.setProbe(y - COIL_AXIS_Y);
  }

  private input(): InductionInput {
    return {
      ...INDUCTION_GOLDEN,
      axial: this.axial,
      velocity: this.velocity,
      poleSign: this.poleSign,
      turns: this.turns,
      resistanceOhm: this.resistanceOhm,
      probeAxial: this.probeAxial,
    };
  }

  private refresh(forceSample: boolean): void {
    const input = this.input();
    const reading = evaluateInduction(input);

    // 闸刀开关断路时，回路电流与感应磁场为 0
    const isCircuitOpen = this.bench.isSwitchOpen();
    const effectiveCurrent = isCircuitOpen ? 0 : reading.currentAmp;
    const effectiveInducedField = isCircuitOpen ? 0 : reading.inducedFieldTesla;

    if (forceSample || this.sampleClock >= 0.05) {
      this.sampleClock = 0;
      this.fluxHistory.push(reading.fluxLinkageWb);
      this.emfHistory.push(reading.emfVolt);
      if (this.fluxHistory.length > 160) {
        this.fluxHistory.shift();
        this.emfHistory.shift();
      }
    }

    this.bench.sync({
      axial: this.axial,
      poleSign: this.poleSign,
      probeAxial: this.probeAxial,
      turns: this.turns,
      currentAmp: effectiveCurrent,
      magnetField: reading.magnetFieldTesla,
      inducedField: effectiveInducedField,
    });

    let caption = inductionCaption(input, reading);
    if (isCircuitOpen) {
      caption = '闸刀开关断开：虽有感应电动势，但回路无感应电流';
    }

    this.cached = {
      axial: this.axial,
      velocity: this.velocity,
      poleSign: this.poleSign,
      turns: this.turns,
      resistanceOhm: this.resistanceOhm,
      probeAxial: this.probeAxial,
      magnetFieldTesla: reading.magnetFieldTesla,
      probeFieldTesla: reading.probeFieldTesla,
      inducedFieldTesla: effectiveInducedField,
      fluxLinkageWb: reading.fluxLinkageWb,
      fluxSingleWb: reading.fluxSingleWb,
      emfVolt: reading.emfVolt,
      currentAmp: effectiveCurrent,
      caption,
      fluxHistory: this.fluxHistory,
      emfHistory: this.emfHistory,
    };
  }
}
