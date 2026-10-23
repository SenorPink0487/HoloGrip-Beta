/**
 * 空气压缩引火仪 (Fire Syringe / Adiabatic Air Compression Igniter)
 * 交互式 3D 热力学实验主控模块
 *
 * 【核心设计守则遵从】：
 * 1. 严禁任何 DOM 悬浮提示弹窗、顶部步骤向导 Banner 或额外面板；
 * 2. 选择实验后自动关闭悬浮窗，桌面仅呈现纯粹的高精细度 3D 引火仪本体；
 * 3. 支持自由拖拽 T 形手柄（快压绝热升温引火、慢压散热不燃，上拉回顶自动排烟复原新火绒）与单击一键冲击下压；
 * 4. 全阶段细腻动效：气缸内空气分子压缩加密与冷暖渐变、绝热冲击波环、火绒爆燃闪光、三层摇曳火焰、暗红余烬、袅袅青烟与高压气垫微回弹。
 */

import * as THREE from 'three';
import { BaseExperiment } from '../../base/BaseExperiment.ts';
import type { ExperimentContext } from '../../../core/types.ts';
import { labPointerNDC } from '../../../controls/LabPointerInput.ts';
import {
  FireSyringeSolver,
  type FireSyringeTelemetry,
} from '../../../physics/thermo/fireSyringeSolver.ts';
import { FireSyringeBenchMesh } from '../../../scene/thermo/FireSyringeBenchMesh.ts';
import { metadata } from './meta.ts';

export default class ThermoFireSyringeExperiment extends BaseExperiment {
  public readonly metadata = metadata;

  // 近景特写比例，确保透明气缸、双密封圈活塞、正前方拱形燃烧室观察窗与内部火绒清晰呈现
  public override targetScale = 2.45;
  public override hideCenterEmitter = true;

  public solver: FireSyringeSolver;
  public bench!: FireSyringeBenchMesh;

  private isDisposed = false;
  private cachedTelemetry: FireSyringeTelemetry | null = null;

  // 3D T 形手柄拖拽交互状态
  private isDraggingHandle = false;
  private dragPlane = new THREE.Plane();
  private dragIntersection = new THREE.Vector3();
  private dragStartLocalY = 0;
  private dragStartStroke = 0;
  private maxDragDeltaY = 0;
  private pointerDownTimeMs = 0;
  private lastDragMoveTimeMs = 0;
  private internalRaycaster = new THREE.Raycaster();

  constructor() {
    super();
    this.solver = new FireSyringeSolver();
  }

  public init(_context: ExperimentContext): void {
    // 安放于全息实验台中央偏前近景工作区 (Y=0.082 贴合台面, Z=1.28 正对操作者视线)
    this.rootGroup.position.set(0, 0.082, 1.28);

    this.bench = this.track(new FireSyringeBenchMesh());
    this.rootGroup.add(this.bench.group);
    this.addDisposable(() => this.bench.dispose());

    const telem = this.solver.getTelemetry();
    this.cachedTelemetry = telem;
    this.bench.update(0, telem);
  }

  public update(delta: number, _elapsed: number, _context: ExperimentContext): void {
    if (this.isDisposed) return;

    // 1. 若未处于手动拖拽中，步进求解器（处理快速冲击、慢压对比、高压气垫回弹、牛顿冷却与火焰/余烬/青烟演化）
    if (!this.isDraggingHandle) {
      this.solver.step(delta);
    } else {
      // 拖拽停顿期间同样允许热量散失与燃烧状态机更新
      const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
      if (now - this.lastDragMoveTimeMs > 32) {
        this.solver.dragToStroke(this.solver.stroke, delta);
      }
    }

    // 2. 获取实时遥测并驱动 3D 动效
    const telem = this.solver.getTelemetry();
    this.cachedTelemetry = telem;

    if (this.bench) {
      this.bench.update(delta, telem);
    }
  }

  /**
   * 鼠标/触控按下：检测是否按住顶部 T 形手柄、活塞杆或底部燃烧室火绒
   */
  public override onPointerDown(
    event: PointerEvent,
    hit: THREE.Intersection | null,
    context: ExperimentContext
  ): boolean {
    if (!hit || this.isDisposed || !this.bench) return false;

    const targetType = this.resolveHitTarget(hit.object);
    if (!targetType) return false;

    // 点击底部燃烧室观察窗/火绒：若火绒已燃尽或活塞在下方，触发上提排烟并换上洁白新火绒
    if (targetType === 'tinder') {
      if (this.solver.tinderState !== 'fresh' || this.solver.stroke > 0.2) {
        this.solver.triggerPullUpReset();
      } else {
        this.solver.triggerQuickSlam();
      }
      return true;
    }

    // 按住 T 形手柄或活塞杆：启动自由垂直拖拽（同时记录时间戳以识别短按单击）
    this.isDraggingHandle = true;
    this.dragStartStroke = this.solver.stroke;
    this.maxDragDeltaY = 0;
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    this.pointerDownTimeMs = now;
    this.lastDragMoveTimeMs = now;

    this.solver.beginDrag();
    this.bench.setHandleHovered(true, true);

    if (context.camera) {
      this.getWorkPlane(this.dragPlane);
      const mouse = labPointerNDC(event, context.renderer?.domElement);
      this.internalRaycaster.setFromCamera(mouse, context.camera);
      if (this.internalRaycaster.ray.intersectPlane(this.dragPlane, this.dragIntersection)) {
        const localPt = this.rootGroup.worldToLocal(this.dragIntersection.clone());
        this.dragStartLocalY = localPt.y;
      }
    }

    return true;
  }

  /**
   * 鼠标/触控拖拽：实时带动 T 形手柄与活塞上下运动，并根据下压速度实时计算绝热升温或导热散失
   */
  public override onPointerMove(
    event: PointerEvent,
    _hit: THREE.Intersection | null,
    context: ExperimentContext
  ): void {
    if (!this.isDraggingHandle || !context.camera || !this.bench) return;

    this.getWorkPlane(this.dragPlane);
    const mouse = labPointerNDC(event, context.renderer?.domElement);
    this.internalRaycaster.setFromCamera(mouse, context.camera);

    if (!this.internalRaycaster.ray.intersectPlane(this.dragPlane, this.dragIntersection)) {
      return;
    }

    const currentLocal = this.rootGroup.worldToLocal(this.dragIntersection.clone());
    const deltaY = currentLocal.y - this.dragStartLocalY;
    this.maxDragDeltaY = Math.max(this.maxDragDeltaY, Math.abs(deltaY));

    // 活塞总机械行程距离 (0.236 - 0.106 = 0.130m)
    const fullStrokeTravel =
      FireSyringeBenchMesh.PISTON_TOP_Y - FireSyringeBenchMesh.PISTON_BOTTOM_Y;
    // 向下拖动 (deltaY < 0) 对应行程 stroke 增大
    const targetStroke = THREE.MathUtils.clamp(
      this.dragStartStroke - deltaY / fullStrokeTravel,
      0,
      0.965
    );

    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const dt = Math.max(0.004, Math.min(0.06, (now - this.lastDragMoveTimeMs) / 1000));
    this.lastDragMoveTimeMs = now;

    this.solver.dragToStroke(targetStroke, dt);
    const telem = this.solver.getTelemetry();
    this.cachedTelemetry = telem;
    this.bench.update(dt, telem);
  }

  /**
   * 鼠标/触控抬起：
   * - 若为短按单击（无明显拖拽位移），根据当前状态执行「一键快速猛压引火」或「上提复位换新火绒」；
   * - 若为拖拽释放，触发高压气垫微回弹。
   */
  public override onPointerUp(_event: PointerEvent, _context: ExperimentContext): void {
    if (!this.isDraggingHandle) return;
    this.isDraggingHandle = false;
    this.bench?.setHandleHovered(false, false);

    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const pressDuration = now - this.pointerDownTimeMs;

    if (this.maxDragDeltaY < 0.008 && pressDuration < 320) {
      // 单击手柄快捷触发：若已在下方或火绒已碳化，先平滑上提复原；若在顶部待命，则直接高速冲击下压引火！
      if (this.solver.stroke > 0.35 || this.solver.tinderState !== 'fresh') {
        this.solver.triggerPullUpReset();
      } else {
        this.solver.triggerQuickSlam();
      }
      return;
    }

    this.solver.endDrag();
  }

  public override onPointerCancel(): void {
    if (this.isDraggingHandle) {
      this.isDraggingHandle = false;
      this.solver.endDrag();
    }
    this.bench?.setHandleHovered(false, false);
  }

  /**
   * 光标悬停拾取提示
   */
  public override getHoverTarget(
    raycaster: THREE.Raycaster
  ): { id: string; label: string; cursor?: string } | null {
    if (!this.bench || this.isDisposed) return null;

    if (this.isDraggingHandle) {
      const telem = this.getTelemetryData();
      return {
        id: 't-handle',
        label: `T形手柄 · 缸内温度 ${telem.temperatureC.toFixed(0)} °C · 压强 ${telem.pressureMPa.toFixed(2)} MPa`,
        cursor: 'grabbing',
      };
    }

    const hits = raycaster.intersectObjects(
      [this.bench.pistonAssemblyGroup, this.bench.combustionChamberGroup],
      true
    );

    for (const hit of hits) {
      const target = this.resolveHitTarget(hit.object);
      if (target === 'handle') {
        this.bench.setHandleHovered(true, false);
        const telem = this.getTelemetryData();
        if (telem.tinderState !== 'fresh' || telem.stroke > 0.4) {
          return {
            id: 't-handle',
            label: `T形手柄 · 向上拖拽提拉（或单击）排烟并恢复洁白新火绒`,
            cursor: 'grab',
          };
        }
        return {
          id: 't-handle',
          label: `T形手柄 · 快速向下拖拽（或单击）猛压活塞使空气绝热升温引燃火绒`,
          cursor: 'grab',
        };
      }
      if (target === 'tinder') {
        this.bench.setHandleHovered(false, false);
        const telem = this.getTelemetryData();
        const stateText =
          telem.tinderState === 'fresh'
            ? `待燃洁白火绒（燃点 ${this.solver.ignitionTempC.toFixed(0)} °C）`
            : telem.tinderState === 'igniting'
            ? '正在剧烈燃烧发光！'
            : '已碳化余烬 · 点击或上提手柄更换新火绒';
        return {
          id: 'combustion-tinder',
          label: `燃烧室引火棉 · ${stateText}`,
          cursor: 'pointer',
        };
      }
    }

    this.bench.setHandleHovered(false, false);
    return null;
  }

  private resolveHitTarget(obj: THREE.Object3D | null): 'handle' | 'tinder' | null {
    let curr: THREE.Object3D | null = obj;
    while (curr && curr !== this.rootGroup) {
      if (
        curr === this.bench.handleGroup ||
        curr === this.bench.pistonAssemblyGroup ||
        curr.name === 'THandleCollider' ||
        curr.name === 'PistonRodMesh' ||
        curr.name === 'PistonHeadMesh' ||
        curr.userData?.isTHandle
      ) {
        return 'handle';
      }
      if (curr === this.bench.tinderGroup || curr.userData?.isTinder) {
        return 'tinder';
      }
      curr = curr.parent;
    }
    return null;
  }

  private getWorkPlane(targetPlane: THREE.Plane): THREE.Plane {
    const normal = new THREE.Vector3(0, 0, 1)
      .applyQuaternion(this.rootGroup.quaternion)
      .normalize();
    const point = this.rootGroup.localToWorld(new THREE.Vector3(0, 0.25, 0));
    return targetPlane.setFromNormalAndCoplanarPoint(normal, point);
  }

  // ================= 外部与参数抽屉控制接口 =================
  public triggerQuickSlam(): void {
    this.solver.triggerQuickSlam();
    this.cachedTelemetry = this.solver.getTelemetry();
  }

  public triggerSlowPress(): void {
    this.solver.triggerSlowPress();
    this.cachedTelemetry = this.solver.getTelemetry();
  }

  public resetExperiment(): void {
    this.solver.reset();
    const telem = this.solver.getTelemetry();
    this.cachedTelemetry = telem;
    this.bench?.update(0, telem);
  }

  public getTelemetryData(): FireSyringeTelemetry {
    if (!this.cachedTelemetry) {
      this.cachedTelemetry = this.solver.getTelemetry();
    }
    return this.cachedTelemetry;
  }

  public override onParameterChange(
    id: string,
    value: any,
    _context: ExperimentContext
  ): void {
    if (id === 'quickSlam') {
      this.triggerQuickSlam();
    } else if (id === 'slowPress') {
      this.triggerSlowPress();
    } else if (id === 'ignitionTempC') {
      this.solver.ignitionTempC = Number(value);
    } else if (id === 'resetExperiment') {
      this.resetExperiment();
    }
  }

  public override dispose(context: ExperimentContext): void {
    this.isDisposed = true;
    this.isDraggingHandle = false;
    super.dispose(context);
  }
}
