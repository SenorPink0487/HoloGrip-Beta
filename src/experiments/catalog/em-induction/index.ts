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
import type { ComputeBridge } from '../../../core/platform/ComputeBridge.ts';

const AXIAL_MIN = -0.18;
const AXIAL_MAX = 0.26;
const TURN_PRESETS = [100, 200, 400, 800];

export default class EmInductionExperiment extends BaseExperiment {
  public readonly metadata = metadata;
  public override targetScale = 2.4;
  public override hideCenterEmitter = true;

  private bench!: InductionBenchMesh;
  private interaction!: InductionInteractionManager;
  private computeBridge?: ComputeBridge;
  private isWorkerBusy = false;
  private isDisposed = false;
  private stateVersion = 0;

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

  public init(context: ExperimentContext): void {
    this.rootGroup.position.set(0, 0.10, 1.55);
    this.computeBridge = context?.computeBridge;
    this.bench = new InductionBenchMesh({ computeBridge: this.computeBridge });
    this.rootGroup.add(this.bench.group);
    this.addDisposable(() => this.bench.dispose());
    this.interaction = new InductionInteractionManager({
      bench: this.bench,
      onMagnetY: (y) => this.setAxialFromPointer(y),
      onProbeY: (y) => this.setProbeFromPointer(y),
      onFlipPole: () => this.flipPole(),
      onCycleTurns: () => this.cycleTurns(),
      onStartPass: () => this.startPass(),
    });
    this.refresh(true);
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
    if (this.driven) {
      this.driven = false;
      this.stateVersion++;
    }
  }

  public update(delta: number, _elapsed: number, context: ExperimentContext): void {
    if (this.isDisposed) return;
    const bridge = this.computeBridge ?? context?.computeBridge;
    const dt = Math.min(delta, 0.05);

    if (bridge) {
      if (!this.isWorkerBusy) {
        this.isWorkerBusy = true;
        const currentVersion = this.stateVersion;
        bridge.simulateInduction({
          axial: this.axial,
          velocity: this.velocity,
          poleSign: this.poleSign,
          turns: this.turns,
          resistanceOhm: this.resistanceOhm,
          probeAxial: this.probeAxial,
          driven: this.driven,
          scripted: this.scripted,
          sampleClock: this.sampleClock,
          dt,
          fluxHistory: this.fluxHistory,
          emfHistory: this.emfHistory,
        }).then((res) => {
          this.isWorkerBusy = false;
          if (this.isDisposed || !res) return;

          // 若 Worker 计算期间用户修改了状态，则丢弃过期的计算结果
          if (currentVersion !== this.stateVersion) {
            return;
          }

          if (!this.driven) {
            this.axial = res.axial;
            this.velocity = res.velocity;
            this.scripted = res.scripted;
          }
          this.sampleClock = res.sampleClock;
          this.fluxHistory = res.fluxHistory;
          this.emfHistory = res.emfHistory;
          const reading = res.reading;
          this.bench.sync({
            axial: this.axial,
            poleSign: this.poleSign,
            probeAxial: this.probeAxial,
            turns: this.turns,
            currentAmp: reading.currentAmp,
            magnetField: reading.magnetFieldTesla,
            inducedField: reading.inducedFieldTesla,
          });
          this.cached = {
            axial: this.axial,
            velocity: this.velocity,
            poleSign: this.poleSign,
            turns: this.turns,
            resistanceOhm: this.resistanceOhm,
            probeAxial: this.probeAxial,
            magnetFieldTesla: reading.magnetFieldTesla,
            probeFieldTesla: reading.probeFieldTesla,
            inducedFieldTesla: reading.inducedFieldTesla,
            fluxLinkageWb: reading.fluxLinkageWb,
            fluxSingleWb: reading.fluxSingleWb,
            emfVolt: reading.emfVolt,
            currentAmp: reading.currentAmp,
            caption: res.caption,
            fluxHistory: this.fluxHistory,
            emfHistory: this.emfHistory,
          };
        }).catch(() => {
          this.isWorkerBusy = false;
          if (!this.isDisposed) {
            this.advanceKinematicsMainThread(dt);
          }
        });
      }
    } else {
      this.advanceKinematicsMainThread(dt);
    }
  }

  private advanceKinematicsMainThread(dt: number): void {
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
    this.stateVersion++;
    const next = THREE.MathUtils.clamp(axial, AXIAL_MIN, AXIAL_MAX);
    this.velocity = THREE.MathUtils.clamp((next - this.axial) / 0.05, -2, 2);
    this.axial = next;
    this.scripted = false;
    this.driven = false;
    this.refresh(true);
    this.velocity = 0;
  }

  public setProbe(axial: number): void {
    this.stateVersion++;
    this.probeAxial = THREE.MathUtils.clamp(axial, AXIAL_MIN, AXIAL_MAX);
    this.refresh(false);
  }

  public setTurns(turns: number): void {
    this.stateVersion++;
    this.turns = THREE.MathUtils.clamp(Math.round(turns), 50, 800);
    this.refresh(false);
  }

  public setResistance(ohm: number): void {
    this.stateVersion++;
    this.resistanceOhm = THREE.MathUtils.clamp(ohm, 1, 40);
    this.refresh(false);
  }

  public flipPole(): void {
    this.stateVersion++;
    this.poleSign = this.poleSign > 0 ? -1 : 1;
    this.refresh(false);
  }

  public cycleTurns(): void {
    const index = TURN_PRESETS.findIndex((value) => value >= this.turns);
    const next = TURN_PRESETS[(index + 1) % TURN_PRESETS.length] ?? TURN_PRESETS[0];
    this.setTurns(next);
  }

  public startPass(): void {
    this.stateVersion++;
    this.driven = false;
    this.scripted = true;
    this.velocity = this.axial > 0 ? -0.42 : 0.42;
    this.refresh(false);
  }

  public resetGolden(): void {
    this.stateVersion++;
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
    this.stateVersion++;
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
      currentAmp: reading.currentAmp,
      magnetField: reading.magnetFieldTesla,
      inducedField: reading.inducedFieldTesla,
    });
    this.cached = {
      axial: this.axial,
      velocity: this.velocity,
      poleSign: this.poleSign,
      turns: this.turns,
      resistanceOhm: this.resistanceOhm,
      probeAxial: this.probeAxial,
      magnetFieldTesla: reading.magnetFieldTesla,
      probeFieldTesla: reading.probeFieldTesla,
      inducedFieldTesla: reading.inducedFieldTesla,
      fluxLinkageWb: reading.fluxLinkageWb,
      fluxSingleWb: reading.fluxSingleWb,
      emfVolt: reading.emfVolt,
      currentAmp: reading.currentAmp,
      caption: inductionCaption(input, reading),
      fluxHistory: this.fluxHistory,
      emfHistory: this.emfHistory,
    };
  }
}
