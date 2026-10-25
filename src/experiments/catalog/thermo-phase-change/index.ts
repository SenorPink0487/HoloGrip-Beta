/**
 * 晶体与非晶体相变与潜热 (Crystalline vs. Amorphous Phase Transition & Latent Heat)
 * 交互式 3D 热力学实验主控模块
 *
 * 【核心设计铁律遵从】：
 * 1. 纯 3D 台面一体式呈现：选择实验后自动关闭悬浮窗，严禁任何 DOM 提示弹窗、顶部步骤向导 Banner 或浮动把手；
 * 2. 纯三维实体直接操控：
 *    - 进入实验时左右酒精灯默认已点燃，即刻启动水浴升温与右侧「多通道温度采集器」大屏 T-t 曲线实时绘制；
 *    - 点击左侧或右侧 3D 酒精灯可独立控制其点火/熄灭；熄灭后对应试管与水浴快速冷却回 0 °C 固态并自动清空重绘下一轮曲线；
 *    - 点击右侧多通道温度采集器上的「通道1 晶体」「通道2 非晶体」实体按键，可独立开关对应通道曲线的显示与隐藏；
 * 3. 纯粹写实宏观物理材质：
 *    - 左管「晶体 (冰晶)」展现固态升温 -> 熔点固液共存潜热吸收（冰晶颗粒逐渐融化缩小下沉、清澈熔液面上升）-> 完全熔化后液态继续升温三阶段；
 *    - 右管「非晶体 (石蜡)」展现由硬变软、连续浑浊软化呈粘稠透明流体并伴随微气泡缓慢上浮的无固定熔点过程。
 */

import * as THREE from 'three';
import { BaseExperiment } from '../../base/BaseExperiment.ts';
import type { ExperimentContext } from '../../../core/types.ts';
import {
  PhaseChangeSolver,
  type PhaseChangeTelemetry,
} from '../../../physics/thermo/phaseChangeSolver.ts';
import {
  PhaseChangeBenchMesh,
  type PhaseChangeInteractRole,
} from '../../../scene/thermo/PhaseChangeBenchMesh.ts';
import { metadata } from './meta.ts';

export default class ThermoPhaseChangeExperiment extends BaseExperiment {
  public readonly metadata = metadata;

  // 近景台面全览比例，使左侧铁架台双路水浴加热装置与右侧多通道温度采集器完整端正居中呈现
  public override targetScale = 2.08;
  public override hideCenterEmitter = true;

  public solver: PhaseChangeSolver;
  public bench!: PhaseChangeBenchMesh;

  private isDisposed = false;
  private cachedTelemetry: PhaseChangeTelemetry | null = null;

  constructor() {
    super();
    this.solver = new PhaseChangeSolver({
      leftLampLit: true,
      rightLampLit: true,
      showChannel1: true,
      showChannel2: true,
    });
  }

  public init(_context: ExperimentContext): void {
    // 安放于全息实验台中央偏前工作区 (Y=0.082 贴合台面, Z=1.18 正对操作者视线)
    this.rootGroup.position.set(0, 0.082, 1.18);

    this.bench = this.track(new PhaseChangeBenchMesh());
    this.rootGroup.add(this.bench.group);
    this.addDisposable(() => this.bench.dispose());

    const telem = this.solver.getTelemetry();
    this.cachedTelemetry = telem;
    this.bench.update(0, telem);
  }

  public update(delta: number, _elapsed: number, _context: ExperimentContext): void {
    if (this.isDisposed) return;

    this.solver.step(delta);
    const telem = this.solver.getTelemetry();
    this.cachedTelemetry = telem;

    if (this.bench) {
      this.bench.update(delta, telem);
    }
  }

  /**
   * 鼠标/触控点击：
   * - 点击左/右酒精灯：独立切换点火与熄灭（熄灭后自动快速冷却复位）；
   * - 点击多通道采集器「通道1 晶体」「通道2 非晶体」实体按键：开关对应通道曲线显示隐藏。
   */
  public override onPointerDown(
    _event: PointerEvent,
    hit: THREE.Intersection | null,
    context: ExperimentContext
  ): boolean {
    if (!hit || this.isDisposed || !this.bench) return false;

    const role = this.resolveInteractRole(hit.object);
    if (!role) return false;

    if (role === 'toggle-left-lamp') {
      const lit = this.solver.toggleLeftLamp();
      context.setParameter?.('leftLampLit', lit);
      this.syncImmediate();
      return true;
    }

    if (role === 'toggle-right-lamp') {
      const lit = this.solver.toggleRightLamp();
      context.setParameter?.('rightLampLit', lit);
      this.syncImmediate();
      return true;
    }

    if (role === 'toggle-channel-1') {
      const vis = this.solver.toggleChannel1Visibility();
      context.setParameter?.('showChannel1', vis);
      this.syncImmediate();
      return true;
    }

    if (role === 'toggle-channel-2') {
      const vis = this.solver.toggleChannel2Visibility();
      context.setParameter?.('showChannel2', vis);
      this.syncImmediate();
      return true;
    }

    return false;
  }

  /**
   * 3D 光标悬停拾取提示
   */
  public override getHoverTarget(
    raycaster: THREE.Raycaster
  ): { id: string; label: string; cursor?: string } | null {
    if (!this.bench || this.isDisposed) return null;

    const hits = raycaster.intersectObjects(
      [
        this.bench.leftAlcoholLampGroup,
        this.bench.rightAlcoholLampGroup,
        this.bench.channel1ButtonGroup,
        this.bench.channel2ButtonGroup,
      ],
      true
    );

    for (const hit of hits) {
      const role = this.resolveInteractRole(hit.object);
      if (!role) continue;

      const telem = this.getTelemetryData();

      if (role === 'toggle-left-lamp') {
        const phaseDesc =
          telem.channel1Phase === 'solid'
            ? '固态升温段'
            : telem.channel1Phase === 'coexistence'
            ? '固液共存·恒温潜热段'
            : '液态升温段';
        return {
          id: 'left-alcohol-lamp',
          label: telem.leftLampLit
            ? `左侧酒精灯（晶体·冰晶 ${telem.channel1TempC.toFixed(1)} °C · ${phaseDesc}）· 点击熄灭并快速冷却复位`
            : `左侧酒精灯（已熄灭 · 当前 ${telem.channel1TempC.toFixed(1)} °C）· 点击点燃开始水浴加热`,
          cursor: 'pointer',
        };
      }

      if (role === 'toggle-right-lamp') {
        const phaseDesc =
          telem.channel2Phase === 'solid'
            ? '硬质固态'
            : telem.channel2Phase === 'softening'
            ? '连续变软粘稠态'
            : '透明液态蜡';
        return {
          id: 'right-alcohol-lamp',
          label: telem.rightLampLit
            ? `右侧酒精灯（非晶体·石蜡 ${telem.channel2TempC.toFixed(1)} °C · ${phaseDesc}）· 点击熄灭并快速冷却复位`
            : `右侧酒精灯（已熄灭 · 当前 ${telem.channel2TempC.toFixed(1)} °C）· 点击点燃开始水浴加热`,
          cursor: 'pointer',
        };
      }

      if (role === 'toggle-channel-1') {
        return {
          id: 'channel-1-btn',
          label: `通道1 晶体按键 · 当前${telem.showChannel1 ? '显示中（点击隐藏红线）' : '已隐藏（点击显示红线）'}`,
          cursor: 'pointer',
        };
      }

      if (role === 'toggle-channel-2') {
        return {
          id: 'channel-2-btn',
          label: `通道2 非晶体按键 · 当前${telem.showChannel2 ? '显示中（点击隐藏蓝线）' : '已隐藏（点击显示蓝线）'}`,
          cursor: 'pointer',
        };
      }
    }

    return null;
  }

  private resolveInteractRole(obj: THREE.Object3D | null): PhaseChangeInteractRole | null {
    let curr: THREE.Object3D | null = obj;
    while (curr && curr !== this.rootGroup) {
      const role = curr.userData?.interactRole as PhaseChangeInteractRole | undefined;
      if (role) return role;
      curr = curr.parent;
    }
    return null;
  }

  private syncImmediate(): void {
    const telem = this.solver.getTelemetry();
    this.cachedTelemetry = telem;
    this.bench?.update(0, telem);
  }

  public override onParameterChange(
    id: string,
    value: unknown,
    _context: ExperimentContext
  ): void {
    if (id === 'leftLampLit' && typeof value === 'boolean') {
      this.solver.setLeftLampLit(value);
      this.syncImmediate();
    } else if (id === 'rightLampLit' && typeof value === 'boolean') {
      this.solver.setRightLampLit(value);
      this.syncImmediate();
    } else if (id === 'showChannel1' && typeof value === 'boolean') {
      this.solver.showChannel1 = value;
      this.syncImmediate();
    } else if (id === 'showChannel2' && typeof value === 'boolean') {
      this.solver.showChannel2 = value;
      this.syncImmediate();
    }
  }

  public getTelemetryData(): PhaseChangeTelemetry {
    if (!this.cachedTelemetry) {
      this.cachedTelemetry = this.solver.getTelemetry();
    }
    return this.cachedTelemetry;
  }

  public override dispose(_context?: ExperimentContext): void {
    this.isDisposed = true;
    super.dispose(_context as ExperimentContext);
  }
}
