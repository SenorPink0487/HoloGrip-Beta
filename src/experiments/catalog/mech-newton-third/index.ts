/**
 * 牛顿第三定律：认识作用力与反作用力，探究作用力和反作用力的关系
 * 经典力学交互式 3D 实验主控模块
 *
 * 【核心设计铁律遵从】：
 * 1. 严禁出现任何 DOM 悬浮提示弹窗、向导 Banner 或浮动卡片！
 * 2. 实验全流程依托纯三维物理模型、鼠标自由无锁拖拽、光标手势与物理材质反馈自然完成；
 * 3. 三只弹簧测力计：一只独立垂直悬挂，两只水平精密对扣；
 * 4. 实时动态验证：大小相等、方向相反、共线同生同灭。
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

  // 近景大尺寸特写展示，确保用户看清每个小孔、弹簧螺线与刻度细节
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

  public init(_context: ExperimentContext): void {
    // 根节点定位至台前近景工作台视界 (Y=0.08, Z=1.30)
    this.rootGroup.position.set(0, 0.08, 1.30);

    // 1. 实例化动力学求解器
    this.solver = new NewtonThirdDynamicsSolver();

    // 2. 实例化 3D 实验台构件
    this.bench = new NewtonThirdBenchMesh();
    this.rootGroup.add(this.bench.group);
    this.addDisposable(() => this.bench.dispose());
  }

  /**
   * 物理与视觉主更新循环 (120 FPS 纯物理驱动)
   */
  public update(delta: number, elapsed: number, _context: ExperimentContext): void {
    if (this.isDisposed) return;

    // 1. 动力学求解步进
    this.solver.update(delta, elapsed);

    // 2. 同步更新 3D 机械结构、螺旋弹簧拉伸、两端挂钩扣合与深海蓝遥测屏幕
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

    // 1. 检测是否点击了 3D 预设微动机械按钮
    while (obj && obj !== this.rootGroup) {
      if (obj.userData?.buttonId) {
        const btnId = obj.userData.buttonId as string;
        this.bench.animateButtonPress(btnId);

        const btnDef = this.bench.benchButtons.find((b) => b.id === btnId);
        if (btnDef) {
          if (btnDef.action === 'preset') {
            this.solver.setMode('manual_drag');
            this.solver.setPairTargetForce(btnDef.targetForce ?? 2.5);
          } else if (btnDef.action === 'oscillation') {
            this.solver.setMode('oscillation');
          } else if (btnDef.action === 'reset') {
            this.solver.setMode('manual_drag');
            this.solver.reset();
          }
        }
        return true;
      }

      // 检测是否点击了钩码 (挂载到独立测力计)
      if (obj.userData?.weightMassKg) {
        const mass = obj.userData.weightMassKg;
        if (this.solver.soloState.suspendedWeightKg > 0) {
          this.solver.hangWeightOnSolo(0); // 取下钩码
        } else {
          this.solver.hangWeightOnSolo(mass); // 挂上钩码
        }
        return true;
      }

      // 检测是否按在右侧测力计拉动手柄上
      if (
        obj.name === 'pair-pull-handle-hitbox' ||
        obj.name === 'DynamometerB' ||
        obj.parent?.name === 'DynamometerB'
      ) {
        this.startDraggingPair(event, hit, context);
        return true;
      }

      // 检测是否按在左侧独立测力计的秤钩上
      if (
        obj.name.includes('hook') ||
        obj.name === 'SoloDynamometer' ||
        obj.parent?.name === 'SoloDynamometer'
      ) {
        this.startDraggingSolo(event, hit, context);
        return true;
      }

      obj = obj.parent;
    }

    return false;
  }

  /**
   * 启动右侧双测力计手柄拖拽
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
      const mouse = this.getNormalizedMouse(event);
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(mouse, context.camera);

      if (raycaster.ray.intersectPlane(this.dragPlane, this.dragPlaneIntersection)) {
        const hitLocal = this.rootGroup.worldToLocal(this.dragPlaneIntersection.clone());
        this.dragStartPointerPosLocal.copy(hitLocal);
      }
    }
  }

  /**
   * 启动左侧独立测力计垂直拉拽
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
      const mouse = this.getNormalizedMouse(event);
      const raycaster = new THREE.Raycaster();
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
    const mouse = this.getNormalizedMouse(event);
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, context.camera);

    if (!raycaster.ray.intersectPlane(this.dragPlane, this.dragPlaneIntersection)) {
      return;
    }

    const currentDragLocal = this.rootGroup.worldToLocal(
      this.dragPlaneIntersection.clone()
    );

    // 1. 双测力计水平拖拽
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
      // 若未挂载钩码，松手后平缓回弹归零
      if (this.solver.soloState.suspendedWeightKg <= 0) {
        this.solver.setSoloTargetForce(0, false);
      }
    }
  }

  /**
   * 获取台面工作平面的世界 3D 平面 (以 rootGroup 局部朝向为基准)
   */
  private getBenchWorldPlane(targetPlane: THREE.Plane): THREE.Plane {
    const normal = new THREE.Vector3(0, 0, 1)
      .applyQuaternion(this.rootGroup.quaternion)
      .normalize();
    const point = this.rootGroup.localToWorld(new THREE.Vector3(0, 0, 0.05));
    return targetPlane.setFromNormalAndCoplanarPoint(normal, point);
  }

  /**
   * 屏幕光标悬停拾取提示 (提供原生光标反馈与准星文本)
   */
  public override getHoverTarget(
    raycaster: THREE.Raycaster
  ): { id: string; label: string; cursor?: string } | null {
    const hits = raycaster.intersectObjects(this.rootGroup.children, true);
    if (hits.length === 0) {
      this.bench.handleAuraMesh.scale.set(1, 1, 1);
      return null;
    }

    const hitObj = hits[0].object;

    if (
      hitObj.name === 'pair-pull-handle-hitbox' ||
      hitObj.name === 'DynamometerB' ||
      hitObj.parent?.name === 'DynamometerB'
    ) {
      this.bench.handleAuraMesh.scale.set(1.15, 1.15, 1.15);
      return {
        id: 'dynamometer-b-handle',
        label: '右侧测力计拉动手柄 · 按住向右拖拽',
        cursor: 'grab',
      };
    }

    if (hitObj.userData?.buttonId) {
      const btn = this.bench.benchButtons.find((b) => b.id === hitObj.userData.buttonId);
      return {
        id: hitObj.userData.buttonId,
        label: `微动按键 · 单击触发【${btn?.label || '控制'}】`,
        cursor: 'pointer',
      };
    }

    if (hitObj.userData?.weightMassKg) {
      return {
        id: 'lab-weight',
        label: '标准 1.0 N 钩码 · 单击悬挂于独立测力计',
        cursor: 'pointer',
      };
    }

    if (
      hitObj.name.includes('hook') ||
      hitObj.name === 'SoloDynamometer' ||
      hitObj.parent?.name === 'SoloDynamometer'
    ) {
      return {
        id: 'solo-dynamometer-hook',
        label: '独立测力计秤钩 · 按住向下拖拽体验拉力',
        cursor: 'grab',
      };
    }

    return null;
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
  private getNormalizedMouse(event: PointerEvent): THREE.Vector2 {
    const isLocked =
      typeof document !== 'undefined' && document.pointerLockElement !== null;
    if (isLocked) {
      return new THREE.Vector2(0, 0);
    }
    return new THREE.Vector2(
      (event.clientX / window.innerWidth) * 2 - 1,
      -(event.clientY / window.innerHeight) * 2 + 1
    );
  }

  /**
   * 深度释放 GPU 资源与动画定时器
   */
  public override dispose(context: ExperimentContext): void {
    this.isDisposed = true;
    super.dispose(context);
  }
}
