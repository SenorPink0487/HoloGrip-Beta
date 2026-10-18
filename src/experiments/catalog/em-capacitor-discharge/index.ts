import * as THREE from 'three';
import { BaseExperiment } from '../../base/BaseExperiment.ts';
import { CapacitorDischargeBenchMesh } from '../../../scene/em/CapacitorDischargeBenchMesh.ts';
import { CapacitorInteractionManager } from '../../../scene/em/CapacitorInteractionManager.ts';
import {
  CapacitorDischargeModel,
  type SwitchPosition,
  type CapacitorTelemetry,
  type WaveformSample,
} from '../../../physics/em/capacitorDischarge.ts';
import { metadata } from './meta.ts';
import type { ExperimentContext } from '../../../core/types.ts';

export default class EmCapacitorDischargeExperiment extends BaseExperiment {
  public readonly metadata = metadata;
  public override targetScale = 3.6;
  public override hideCenterEmitter = true;

  // 物理求解引擎
  public model: CapacitorDischargeModel;

  // 3D 装配组件
  public bench!: CapacitorDischargeBenchMesh;
  public interactionManager!: CapacitorInteractionManager;

  // 缓存与遥测回调
  private cachedTelemetry: CapacitorTelemetry | null = null;
  private telemetryCallback: ((data: CapacitorTelemetry) => void) | null = null;

  constructor() {
    super();
    this.model = new CapacitorDischargeModel({
      voltageSupply: 6.0,
      capacitanceMicroFarad: 1000.0,
      dischargeResistance: 1000.0,
      chargeResistance: 1000.0,
    });
  }

  public init(context: ExperimentContext): void {
    // 将实验台放置于操作者视线前方正中央
    this.rootGroup.position.set(0, 0.16, 1.55);

    // 1. 3D 器材装配
    this.bench = this.track(new CapacitorDischargeBenchMesh({
      voltageSupply: this.model.voltageSupply,
      capacitanceUf: this.model.capacitanceMicroFarad,
      resistanceOhm: this.model.dischargeResistance,
      showLabels: false,
    }));
    this.rootGroup.add(this.bench.group);
    this.addDisposable(() => this.bench.dispose());

    // 2. 交互管理器：支持直接点击 3D 闸刀开关、接线端与台面示波器小屏幕
    this.interactionManager = new CapacitorInteractionManager({
      bench: this.bench,
      onSetSwitchPosition: (pos) => this.setSwitchPosition(pos),
      onCycleSwitch: () => this.cycleSwitchPosition(),
      onAdjustVoltage: () => this.cycleVoltagePreset(),
      onClearSamples: () => this.clearSamples(),
    });

    // 初始化遥测并推入示波器
    this.syncTelemetry();
  }

  public override mount(context: ExperimentContext): void {
    super.mount?.(context);
  }

  public override unmount(context: ExperimentContext): void {
    super.unmount?.(context);
  }

  public override getHoverTarget(raycaster: THREE.Raycaster) {
    return this.interactionManager?.getHoverTarget(raycaster) ?? null;
  }

  public override onPointerDown(event: PointerEvent, hit: THREE.Intersection | null, context: ExperimentContext): boolean {
    return this.interactionManager?.onPointerDown(event, hit, context) ?? false;
  }

  public update(delta: number, _elapsed: number, _context: ExperimentContext): void {
    // 1. 毫秒级电路瞬态物理推演
    this.model.step(delta);

    // 2. 遥测状态同步
    const telemetry = this.model.getTelemetry();
    this.cachedTelemetry = telemetry;

    // 3. 3D 器材动画推进（闸刀平滑摆动、电流粒子流、电表数显、光晕、台面数字示波器波形）
    if (this.bench) {
      this.bench.update(delta, telemetry, this.model.getSamples());
    }

    // 4. 触发外部监听器
    if (this.telemetryCallback) {
      this.telemetryCallback(telemetry);
    }
  }

  // ================= 实验控制 API =================
  /**
   * 切换单刀双掷开关位置
   * @param pos 'charge' (电源侧-充电) | 'neutral' (中立断开) | 'discharge' (放电侧-放电)
   */
  public setSwitchPosition(pos: SwitchPosition): void {
    this.model.setSwitchPosition(pos);
    this.bench?.setSwitchPosition(pos);
    this.syncTelemetry();
  }

  /**
   * 循环切换开关档位：充电 -> 断开 -> 放电 -> 断开 -> 充电
   */
  public cycleSwitchPosition(): void {
    const cur = this.model.switchPosition;
    let next: SwitchPosition = 'charge';
    if (cur === 'charge') next = 'neutral';
    else if (cur === 'neutral') next = 'discharge';
    else if (cur === 'discharge') next = 'charge';
    this.setSwitchPosition(next);
  }

  /**
   * 循环调节电源电压预设：5V -> 10V -> 15V -> 5V
   */
  public cycleVoltagePreset(): void {
    const cur = this.model.voltageSupply;
    let next = 10.0;
    if (cur < 7.0) next = 10.0;
    else if (cur < 12.0) next = 15.0;
    else next = 5.0;
    this.setVoltage(next);
  }

  public setVoltage(volts: number): void {
    this.model.setVoltageSupply(volts);
    this.syncTelemetry();
  }

  public setCapacitance(cMicroFarad: number): void {
    this.model.setCapacitance(cMicroFarad);
    this.syncTelemetry();
  }

  public setResistance(rOhm: number): void {
    this.model.setDischargeResistance(rOhm);
    this.syncTelemetry();
  }

  public setShowLabels(show: boolean): void {
    this.bench?.setLabelsVisible(show);
  }

  public clearSamples(): void {
    this.model.clearSamples();
    this.syncTelemetry();
  }

  public resetExperiment(): void {
    this.model.resetExperiment();
    this.bench?.setSwitchPosition('neutral', true);
    this.syncTelemetry();
  }

  public openWaveformWindow(): void {
    // 桌面示波器为原生内建 3D 实体呈现
  }

  public getTelemetryData(): CapacitorTelemetry {
    if (!this.cachedTelemetry) {
      this.cachedTelemetry = this.model.getTelemetry();
    }
    return this.cachedTelemetry;
  }

  public getSamples(): readonly WaveformSample[] {
    return this.model.getSamples();
  }

  public onTelemetry(cb: (data: CapacitorTelemetry) => void): void {
    this.telemetryCallback = cb;
  }

  private syncTelemetry(): void {
    const telem = this.model.getTelemetry();
    this.cachedTelemetry = telem;
    this.bench?.renderOscilloscopeDisplay(telem, this.model.getSamples());
  }

  public override dispose(context: ExperimentContext): void {
    super.dispose(context);
  }
}
