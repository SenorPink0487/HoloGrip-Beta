import { BaseExperiment } from '../../base/BaseExperiment.ts';
import { HandRulesBenchMesh } from '../../../scene/em/HandRulesBenchMesh.ts';
import {
  evaluateHandRuleFrame,
  type HandRuleConfig,
  type HandRuleEvaluation,
  type HandRuleMode,
  type Polarity,
} from '../../../physics/em/handRulesSolver.ts';
import type { HandRulesTelemetryData } from '../../../ui/vision/HandRulesStatusCard.ts';
import type { HandGestureFrame } from '../../../vision/types.ts';
import type { ExperimentContext } from '../../../core/types.ts';
import { metadata } from './meta.ts';

export default class EmHandRulesExperiment extends BaseExperiment {
  public readonly metadata = metadata;
  public override targetScale = 3.6;
  public override hideCenterEmitter = true;

  private bench!: HandRulesBenchMesh;

  private config: HandRuleConfig = {
    mode: 'right-hand-screw',
    currentPolarity: 1,
    fieldPolarity: 1,
    motionPolarity: 1,
    gestureEnabled: false,
  };

  private latestFrame: HandGestureFrame | null = null;
  private latestEvaluation: HandRuleEvaluation;
  private cachedTelemetry: HandRulesTelemetryData | null = null;
  private telemetryCallback: ((data: HandRulesTelemetryData) => void) | null = null;

  constructor() {
    super();
    this.latestEvaluation = evaluateHandRuleFrame(this.config, null);
  }

  public init(_context: ExperimentContext): void {
    this.rootGroup.position.set(0, 0.14, 1.55);

    this.bench = this.track(new HandRulesBenchMesh());
    this.rootGroup.add(this.bench.group);
    this.addDisposable(() => this.bench.dispose());

    this.bench.setMode(this.config.mode);
    this.recomputeAndBroadcast();
  }

  public update(delta: number, _elapsed: number, _context: ExperimentContext): void {
    this.latestEvaluation = evaluateHandRuleFrame(this.config, this.latestFrame);
    this.bench?.update(delta, this.config, this.latestEvaluation, this.latestFrame);
    this.syncTelemetrySnapshot();
  }

  public onHandGestureFrame(frame: HandGestureFrame | null): void {
    this.latestFrame = frame;
    this.latestEvaluation = evaluateHandRuleFrame(this.config, this.latestFrame);
    this.syncTelemetrySnapshot();
  }

  public setGestureEnabled(enabled: boolean): void {
    if (this.config.gestureEnabled === enabled) return;
    this.config.gestureEnabled = enabled;
    if (!enabled) {
      this.latestFrame = null;
    }
    this.recomputeAndBroadcast();
  }

  public isGestureEnabled(): boolean {
    return this.config.gestureEnabled;
  }

  public setRuleMode(mode: HandRuleMode): void {
    if (this.config.mode === mode) return;
    this.config.mode = mode;
    this.bench?.setMode(mode);
    this.recomputeAndBroadcast();
  }

  public getRuleMode(): HandRuleMode {
    return this.config.mode;
  }

  public reverseCurrent(): void {
    this.config.currentPolarity = (this.config.currentPolarity === 1 ? -1 : 1) as Polarity;
    this.bench?.resetMotion();
    this.recomputeAndBroadcast();
  }

  public reverseField(): void {
    this.config.fieldPolarity = (this.config.fieldPolarity === 1 ? -1 : 1) as Polarity;
    this.bench?.resetMotion();
    this.recomputeAndBroadcast();
  }

  public reverseMotion(): void {
    this.config.motionPolarity = (this.config.motionPolarity === 1 ? -1 : 1) as Polarity;
    this.bench?.resetMotion();
    this.recomputeAndBroadcast();
  }

  public resetExperiment(): void {
    this.config.currentPolarity = 1;
    this.config.fieldPolarity = 1;
    this.config.motionPolarity = 1;
    this.bench?.resetMotion();
    this.recomputeAndBroadcast();
  }

  private recomputeAndBroadcast(): void {
    this.latestEvaluation = evaluateHandRuleFrame(this.config, this.latestFrame);
    this.syncTelemetrySnapshot();
    if (this.cachedTelemetry) {
      this.telemetryCallback?.(this.cachedTelemetry);
    }
  }

  private syncTelemetrySnapshot(): void {
    const ev = this.latestEvaluation;
    this.cachedTelemetry = {
      mode: this.config.mode,
      currentPolarity: this.config.currentPolarity,
      fieldPolarity: this.config.fieldPolarity,
      motionPolarity: this.config.motionPolarity,
      gestureEnabled: this.config.gestureEnabled,
      requiredHand: ev.requiredHand,
      detectedHand: ev.detectedHand,
      status: ev.status,
      alignmentScore: ev.alignmentScore,
      isMatched: ev.isMatched,
      statusLabel: ev.statusLabel,
    };
  }

  public getTelemetryData(): HandRulesTelemetryData {
    if (!this.cachedTelemetry) {
      this.syncTelemetrySnapshot();
    }
    return this.cachedTelemetry!;
  }

  public onTelemetry(callback: (data: HandRulesTelemetryData) => void): void {
    this.telemetryCallback = callback;
    this.recomputeAndBroadcast();
  }

  public override dispose(context: ExperimentContext): void {
    this.telemetryCallback = null;
    this.latestFrame = null;
    super.dispose(context);
  }
}
