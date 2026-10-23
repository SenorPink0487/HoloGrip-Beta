import { labPointerNDC } from '../../../controls/LabPointerInput.ts';
/**
 * 牛顿第三定律：认识作用力与反作用力，探究作用力和反作用力的关系
 * 经典力学交互式 3D 实验主控模块
 *
 * 【核心设计铁律遵从】：
 * 1. 严格零 DOM 弹窗/浮动向导：严禁注入任何 DOM 悬浮提示弹窗、向导 Banner 或浮动卡片；
 * 2. 纯三维物理建模：场景中仅有 3 只高精细度透明圆筒弹簧测力计（1只独立垂直，2只水平对扣互拉）；
 * 3. 自由光标桌面交互：鼠标自由无锁拖拽，光标手势（grab/grabbing）与原生 3D 物理材质反馈自然联动；
 * 4. 实时动态验证：大小严格恒等 (F_A ≡ F_B)、方向相反、共线同生同灭同增同减。
 */

import * as THREE from 'three';
import { BaseExperiment } from '../../base/BaseExperiment.ts';
import type { ExperimentContext } from '../../../core/types.ts';
import { NewtonThirdBenchMesh } from '../../../scene/mech/NewtonThirdBenchMesh.ts';
import {
  NewtonThirdDynamicsSolver,
  type NewtonThirdMode,
} from '../../../physics/mech/newtonThirdDynamics.ts';
import { metadata } from './meta.ts';

export default class MechNewtonThirdExperiment extends BaseExperiment {
  public readonly metadata = metadata;

  // 近景特写展示，确保用户看清每个刻度分度、弹簧螺线与红盘游标细节
  public override targetScale = 2.25;
  public override hideCenterEmitter = true;

  // 3D 装置与物理求解器
  private bench!: NewtonThirdBenchMesh;
  private solver!: NewtonThirdDynamicsSolver;
  private isDisposed = false;

  // 交互拖拽状态
  private isDraggingPair = false;
  private isDraggingSolo = false;
  private dragPlane = new THREE.Plane();
  private dragPlaneIntersection = new THREE.Vector3();
  private dragStartPointerPosLocal = new THREE.Vector3();
  private dragStartForce = 0;

  // 当前悬停高亮测力计
  private currentHoveredDynamometer: 'solo' | 'A' | 'B' | null = null;
  private internalRaycaster = new THREE.Raycaster();

  public init(_context: ExperimentContext): void {
    // 根节点定位至台前近景工作台视界 (Y=0.08, Z=1.30)
    this.rootGroup.position.set(0, 0.08, 1.30);

    // 1. 实例化动力学求解器
    this.solver = new NewtonThirdDynamicsSolver();

    // 2. 实例化 3D 测力计装配体 (严格仅有 3 只弹簧测力计)
    this.bench = new NewtonThirdBenchMesh();
    this.rootGroup.add(this.bench.group);
    this.addDisposable(() => this.bench.dispose());
  }

  /**
   * 物理与视觉主更新循环 (纯物理驱动)
   */
  public update(delta: number, elapsed: number, _context: ExperimentContext): void {
    if (this.isDisposed) return;

    // 1. 动力学求解步进
    this.solver.update(delta, elapsed);

    // 2. 同步更新 3D 测力计螺旋弹簧拉伸、两端挂钩扣合连动
    this.bench.updateVisualState(
      this.solver.soloState.forceN,
      this.solver.pairState.forceN,
      this.solver.history
    );
  }

  /**
   * 鼠标/触控指针按下 (Pointer Down)
   */
  public override onPointerDown(
    event: PointerEvent,
    hit: THREE.Intersection | null,
    context: ExperimentContext
  ): boolean | void {
    if (!hit || this.isDisposed) return false;

    let obj: THREE.Object3D | null = hit.object;

    while (obj && obj !== this.rootGroup) {
      // 1. 检测是否点击在互拉测力计 B 或其挂钩/手柄上
      if (
        obj.name === 'DynamometerB' ||
        obj.name.startsWith('DynamometerB') ||
        obj === this.bench.dynamometerB.group ||
        this.isDescendantOf(obj, this.bench.dynamometerB.group)
      ) {
        this.startDraggingPair(event, hit, context);
        return true;
      }

      // 2. 检测是否点击在互拉测力计 A 上
      if (
        obj.name === 'DynamometerA' ||
        obj.name.startsWith('DynamometerA') ||
        obj === this.bench.dynamometerA.group ||
        this.isDescendantOf(obj, this.bench.dynamometerA.group)
      ) {
        this.startDraggingPair(event, hit, context);
        return true;
      }

      // 3. 检测是否点击在左侧独立测力计上
      if (
        obj.name === 'SoloDynamometer' ||
        obj.name.startsWith('SoloDynamometer') ||
        obj === this.bench.soloDynamometer.group ||
        this.isDescendantOf(obj, this.bench.soloDynamometer.group)
      ) {
        this.startDraggingSolo(event, hit, context);
        return true;
      }

      obj = obj.parent;
    }

    return false;
  }

  /**
   * 判断节点是否为特定父节点的后代
   */
  private isDescendantOf(child: THREE.Object3D, parent: THREE.Object3D): boolean {
    let curr: THREE.Object3D | null = child;
    while (curr) {
      if (curr === parent) return true;
      curr = curr.parent;
    }
    return false;
  }

  /**
   * 启动双测力计水平互拉拖拽
   */
  private startDraggingPair(
    event: PointerEvent,
    _hit: THREE.Intersection,
    context: ExperimentContext
  ): void {
    this.isDraggingPair = true;
    this.solver.pairState.isDraggingRight = true;
    this.solver.setMode('manual_drag');
    this.dragStartForce = this.solver.pairState.forceN;

    if (context.camera) {
      this.getBenchWorldPlane(this.dragPlane);
      const mouse = this.getNormalizedMouse(event, context);
      const raycaster = this.internalRaycaster;
      raycaster.setFromCamera(mouse, context.camera);

      if (raycaster.ray.intersectPlane(this.dragPlane, this.dragPlaneIntersection)) {
        const hitLocal = this.rootGroup.worldToLocal(this.dragPlaneIntersection.clone());
        this.dragStartPointerPosLocal.copy(hitLocal);
      }
    }
  }

  /**
   * 启动左侧独立测力计垂直下拖
   */
  private startDraggingSolo(
    event: PointerEvent,
    _hit: THREE.Intersection,
    context: ExperimentContext
  ): void {
    this.isDraggingSolo = true;
    this.solver.soloState.isHandDragging = true;
    this.dragStartForce = this.solver.soloState.forceN;

    if (context.camera) {
      this.getBenchWorldPlane(this.dragPlane);
      const mouse = this.getNormalizedMouse(event, context);
      const raycaster = this.internalRaycaster;
      raycaster.setFromCamera(mouse, context.camera);

      if (raycaster.ray.intersectPlane(this.dragPlane, this.dragPlaneIntersection)) {
        const hitLocal = this.rootGroup.worldToLocal(this.dragPlaneIntersection.clone());
        this.dragStartPointerPosLocal.copy(hitLocal);
      }
    }
  }

  /**
   * 指针移动 (Pointer Move) - 极速精准 3D 平面映射
   */
  public override onPointerMove(
    event: PointerEvent,
    _hit: THREE.Intersection | null,
    context: ExperimentContext
  ): void {
    if (!context.camera) return;
    if (!this.isDraggingPair && !this.isDraggingSolo) return;

    this.getBenchWorldPlane(this.dragPlane);
    const mouse = this.getNormalizedMouse(event, context);
    const raycaster = this.internalRaycaster;
    raycaster.setFromCamera(mouse, context.camera);

    if (!raycaster.ray.intersectPlane(this.dragPlane, this.dragPlaneIntersection)) {
      return;
    }

    const currentDragLocal = this.rootGroup.worldToLocal(
      this.dragPlaneIntersection.clone()
    );

    // 1. 双测力计水平互拉拖拽
    if (this.isDraggingPair) {
      const deltaX = currentDragLocal.x - this.dragStartPointerPosLocal.x;
      // 水平位移每移动 0.035m 增加 1.0 N 拉力
      const forceDelta = deltaX / 0.035;
      const targetForce = Math.max(0, Math.min(5.0, this.dragStartForce + forceDelta));
      this.solver.setPairTargetForce(targetForce, true);
      return;
    }

    // 2. 独立测力计向下垂直拖拽
    if (this.isDraggingSolo) {
      const deltaY = currentDragLocal.y - this.dragStartPointerPosLocal.y;
      // 向下位移 (deltaY < 0) 增加拉力
      const forceDelta = -deltaY / 0.032;
      const targetForce = Math.max(0, Math.min(5.0, this.dragStartForce + forceDelta));
      this.solver.setSoloTargetForce(targetForce, true);
    }
  }

  /**
   * 指针释放 (Pointer Up)
   */
  public override onPointerUp(_event: PointerEvent, _context: ExperimentContext): void {
    if (this.isDraggingPair) {
      this.isDraggingPair = false;
      this.solver.pairState.isDraggingRight = false;
      // 物理真实手感：松手后由于弹簧收缩，平缓回弹归零
      this.solver.setPairTargetForce(0, false);
    }

    if (this.isDraggingSolo) {
      this.isDraggingSolo = false;
      this.solver.soloState.isHandDragging = false;
      // 若无持续外力，松手后平缓回弹归零
      if (this.solver.soloState.suspendedWeightKg <= 0) {
        this.solver.setSoloTargetForce(0, false);
      }
    }
  }

  /**
   * 获取台面工作平面的世界 3D 平面
   */
  private getBenchWorldPlane(targetPlane: THREE.Plane): THREE.Plane {
    const normal = new THREE.Vector3(0, 0, 1)
      .applyQuaternion(this.rootGroup.quaternion)
      .normalize();
    const point = this.rootGroup.localToWorld(new THREE.Vector3(0, 0.22, 0.0));
    return targetPlane.setFromNormalAndCoplanarPoint(normal, point);
  }

  /**
   * 屏幕光标悬停拾取提示 (提供原生光标反馈与准星文本)
   */
  public override getHoverTarget(
    raycaster: THREE.Raycaster
  ): { id: string; label: string; cursor?: string } | null {
    const targets = [this.bench.dynamometerB.group, this.bench.dynamometerA.group, this.bench.soloDynamometer.group];
    const hits = raycaster.intersectObjects(targets, true);
    if (hits.length === 0) {
      this.clearHoverHighlight();
      return null;
    }

    const hitObj = hits[0].object;

    // 检测是否悬停在互拉测力计 B 上
    if (this.isDescendantOf(hitObj, this.bench.dynamometerB.group)) {
      this.setHoverHighlight('B');
      return {
        id: 'dynamometer-b',
        label: '互拉测力计 B · 按住向右拖拽',
        cursor: 'grab',
      };
    }

    // 检测是否悬停在互拉测力计 A 上
    if (this.isDescendantOf(hitObj, this.bench.dynamometerA.group)) {
      this.setHoverHighlight('A');
      return {
        id: 'dynamometer-a',
        label: '互拉测力计 A · 与测力计 B 挂钩互扣',
        cursor: 'grab',
      };
    }

    // 检测是否悬停在独立测力计上
    if (this.isDescendantOf(hitObj, this.bench.soloDynamometer.group)) {
      this.setHoverHighlight('solo');
      return {
        id: 'dynamometer-solo',
        label: '独立测力计 · 按住向下拖拽体验拉力',
        cursor: 'grab',
      };
    }

    this.clearHoverHighlight();
    return null;
  }

  /**
   * 设置高亮反馈
   */
  private setHoverHighlight(target: 'solo' | 'A' | 'B'): void {
    if (this.currentHoveredDynamometer === target) return;
    this.clearHoverHighlight();
    this.currentHoveredDynamometer = target;
    if (target === 'solo') this.bench.soloDynamometer.setHighlighted(true);
    if (target === 'A') this.bench.dynamometerA.setHighlighted(true);
    if (target === 'B') this.bench.dynamometerB.setHighlighted(true);
  }

  /**
   * 清除高亮
   */
  private clearHoverHighlight(): void {
    if (!this.currentHoveredDynamometer) return;
    if (this.currentHoveredDynamometer === 'solo') this.bench.soloDynamometer.setHighlighted(false);
    if (this.currentHoveredDynamometer === 'A') this.bench.dynamometerA.setHighlighted(false);
    if (this.currentHoveredDynamometer === 'B') this.bench.dynamometerB.setHighlighted(false);
    this.currentHoveredDynamometer = null;
  }

  /**
   * 侧边抽屉参数变更响应
   */
  public override onParameterChange(
    id: string,
    value: any,
    _context: ExperimentContext
  ): void {
    if (id === 'pairPullForce') {
      this.solver.setMode('manual_drag');
      this.solver.setPairTargetForce(Number(value) || 0);
    } else if (id === 'mode') {
      this.solver.setMode(value as NewtonThirdMode);
    } else if (id === 'soloForce') {
      this.solver.setSoloTargetForce(Number(value) || 0);
    } else if (id === 'hangWeight') {
      if (value === '1n') {
        this.solver.hangWeightOnSolo(0.102);
      } else if (value === '2n') {
        this.solver.hangWeightOnSolo(0.204);
      } else {
        this.solver.hangWeightOnSolo(0);
      }
    } else if (id === 'resetExperiment') {
      this.solver.reset();
    }
  }

  /**
   * 归一化鼠标坐标换算 (支持指针未锁定与锁定环境)
   */
  private getNormalizedMouse(event: PointerEvent, context?: ExperimentContext): THREE.Vector2 {
    return labPointerNDC(event, context?.renderer?.domElement);
  }

  /**
   * 深度释放 GPU 资源
   */
  public override dispose(context: ExperimentContext): void {
    this.isDisposed = true;
    this.clearHoverHighlight();
    super.dispose(context);
  }
}
