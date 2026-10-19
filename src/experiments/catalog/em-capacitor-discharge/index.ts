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
  public override targetScale = 3.0;
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
      voltageSupply: 3.0,
      capacitanceMicroFarad: 1000.0,
      dischargeResistance: 1000.0,
      chargeResistance: 1000.0,
    });
  }

  public init(context: ExperimentContext): void {
    // 将实验器材直接放置于全息实验台桌面上 (y = 0.082 与桌面绝对贴合)
    this.rootGroup.position.set(0, 0.082, 1.48);

    // 1. 3D 器材装配
    this.bench = this.track(new CapacitorDischargeBenchMesh({
      voltageSupply: this.model.voltageSupply,
      capacitanceUf: this.model.capacitanceMicroFarad,
      resistanceOhm: this.model.dischargeResistance,
      showLabels: false,
    }));
    this.rootGroup.add(this.bench.group);
    this.addDisposable(() => this.bench.dispose());

    // 2. 交互管理器：支持直接点击与 3D 拖拽变阻器滑块、单刀双掷闸刀开关
    this.interactionManager = new CapacitorInteractionManager({
      bench: this.bench,
      onSetSwitchPosition: (pos) => this.setSwitchPosition(pos),
      onCycleSwitch: () => this.cycleSwitchPosition(),
      onAdjustVoltage: () => this.cycleVoltagePreset(),
      onAdjustResistance: () => this.cycleResistancePreset(),
      onSetResistance: (rOhm) => this.setResistance(rOhm),
      onAdjustCapacitance: () => this.cycleCapacitancePreset(),
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

  public override onPointerMove(event: PointerEvent, hit: THREE.Intersection | null, context: ExperimentContext): void {
    this.interactionManager?.onPointerMove(event, hit, context);
  }

  public override onPointerUp(event: PointerEvent, context: ExperimentContext): void {
    this.interactionManager?.onPointerUp(event, context);
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
   * 循环调节电源电压预设：3.0V (双节串联) -> 4.5V (三节串联) -> 6.0V (四节串联) -> 3.0V (双节串联)
   */
  public cycleVoltagePreset(): void {
    const cur = this.model.voltageSupply;
    let next = 3.0;
    if (cur < 3.5) next = 4.5;
    else if (cur < 5.0) next = 6.0;
    else next = 3.0;
    this.setVoltage(next);
  }

  public cycleResistancePreset(): void {
    const cur = this.model.dischargeResistance;
    let next = 1000.0;
    if (cur < 800) next = 1000.0;
    else if (cur < 1500) next = 2000.0;
    else next = 500.0;
    this.setResistance(next);
  }

  public cycleCapacitancePreset(): void {
    const cur = this.model.capacitanceMicroFarad;
    let next = 1000.0;
    if (cur < 800) next = 1000.0;
    else if (cur < 1500) next = 2200.0;
    else next = 470.0;
    this.setCapacitance(next);
  }

  public setVoltage(volts: number): void {
    this.model.setVoltageSupply(volts);
    this.syncTelemetry();
  }

  public setCapacitance(cMicroFarad: number): void {
    this.model.setCapacitance(cMicroFarad);
    this.bench?.setCapacitance(cMicroFarad);
    this.syncTelemetry();
  }

  public setResistance(rOhm: number): void {
    this.model.setDischargeResistance(rOhm);
    this.bench?.setResistance(rOhm);
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
