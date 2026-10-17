/**
 * 悬挂法测物体重心 (Determination of Center of Gravity by Suspension)
 * 经典力学交互式 3D 实验主控模块
 *
 * 【核心设计守则】：
 * 严禁出现任何 DOM 悬浮提示弹窗、步骤向导 Banner 或浮动卡片！
 * 实验全流程依托纯三维物理模型、直接鼠标/触控拖拽、光标手势与物理材质反馈自然完成。
 */

import * as THREE from 'three';
import { BaseExperiment } from '../../base/BaseExperiment.ts';
import type { ExperimentContext } from '../../../core/types.ts';
import { RetortStandMesh } from '../../../scene/mech/RetortStandMesh.ts';
import { SuspensionPlateMesh } from '../../../scene/mech/SuspensionPlateMesh.ts';
import {
  SuspensionDynamicsSolver,
  type PlateHoleDef,
  type Line2D,
} from '../../../physics/mech/suspensionDynamics.ts';
import { metadata } from './meta.ts';

export default class MechCenterOfGravityExperiment extends BaseExperiment {
  public readonly metadata = metadata;
  // 近景大尺寸特写展示，确保用户看清每个小孔与实验细节
  public override targetScale = 2.35;
  public override hideCenterEmitter = true;

  // 3D 装置组件
  private stand!: RetortStandMesh;
  private plate!: SuspensionPlateMesh;
  private solver!: SuspensionDynamicsSolver;
  private isDisposed = false;

  // 交互拖拽状态
  private isDraggingPlate = false;
  private dragPlane = new THREE.Plane();
  private dragPlaneIntersection = new THREE.Vector3();
  private dragOffsetLocal = new THREE.Vector3();
  private dragStartPointerPosLocal = new THREE.Vector3();
  private candidateHoleToSnap: PlateHoleDef | null = null;
  private lastHoveredTarget: string | null = null;

  // 待测板未悬挂时的平稳静置参考位置 (位于铁架台右侧的实验台面上)
  private readonly defaultRestPosition = new THREE.Vector3(0.16, 0.08, 0.04);

  // 动画平滑过渡 (一键点击悬挂 / 脱钩)
  private isTransitionAnimating = false;
  private animStartTime = 0;
  private animDuration = 0.42;
  private animStartPos = new THREE.Vector3();
  private animTargetPos = new THREE.Vector3();
  private animStartRotZ = 0;
  private animTargetRotZ = 0;
  private animCallback: (() => void) | null = null;

  // 顶针平衡验证模式
  private isBalanceVerificationActive = false;

  public init(context: ExperimentContext): void {
    // 根节点定位至台前近景工作台区域 (Y=0.08, Z=1.35)
    this.rootGroup.position.set(0, 0.08, 1.35);

    // 1. 实例化动力学求解器 (默认不规则多边形薄板)
    this.solver = new SuspensionDynamicsSolver('irregular');

    // 2. 实例化铁架台与悬挂装置
    this.stand = new RetortStandMesh();
    this.rootGroup.add(this.stand.group);
    this.addDisposable(() => this.stand.dispose());

    // 3. 实例化待测塑料薄板模型
    this.plate = new SuspensionPlateMesh(this.solver.plateDef);
    this.rootGroup.add(this.plate.group);
    this.addDisposable(() => this.plate.dispose());

    // 4. 将塑料板端正放回初始台面位置
    this.resetPlateToRestingPosition();
  }

  /**
   * 将塑料板放回初始待机位置
   */
  private resetPlateToRestingPosition(): void {
    this.isTransitionAnimating = false;
    this.plate.group.position.copy(this.defaultRestPosition);
    this.plate.group.rotation.set(0, 0, 0);
    this.plate.plateMesh.position.set(0, 0, 0);
    this.plate.plateMesh.rotation.set(0, 0, 0);
    this.solver.detachPlate();
    this.stand.setSnapAuraHighlighted(false);
    this.candidateHoleToSnap = null;
    this.isBalanceVerificationActive = false;
    this.stand.setNeedleStandVisible(false);
  }

  /**
   * 射线检测悬停目标 (准星或鼠标指针悬停提示)
   */
  public override getHoverTarget(raycaster: THREE.Raycaster): {
    id: string;
    label: string;
    cursor?: string;
  } | null {
    if (this.isDisposed) return null;

    if (this.isDraggingPlate) {
      if (this.solver.state === 'swinging' || this.solver.state === 'stabilized') {
        return {
          id: 'plate-dragging-detach',
          label: '向下拖拽塑料板即可从细线挂销上取下',
          cursor: 'grabbing',
        };
      }
      return {
        id: 'plate-dragging',
        label: this.candidateHoleToSnap
          ? `小孔 ${this.candidateHoleToSnap.label} 已对准细线 · 松手即可悬挂`
          : '拖拽塑料板 · 靠近细线横销以悬挂小孔',
        cursor: 'grabbing',
      };
    }

    const hits = raycaster.intersectObjects(this.rootGroup.children, true);
    if (hits.length === 0) {
      if (this.lastHoveredTarget) {
        this.plate.setHoleHovered(null);
        this.lastHoveredTarget = null;
      }
      return null;
    }

    for (const hit of hits) {
      let cur: THREE.Object3D | null = hit.object;
      while (cur && cur !== this.rootGroup) {
        // 1. 悬停在重心 G 标靶上
        if (cur.name === 'center-of-gravity-marker' || cur.userData?.isCogMarker) {
          const telemetry = this.solver.getTelemetry();
          const err = telemetry.errorMm !== null ? telemetry.errorMm.toFixed(2) : '0.00';
          return {
            id: 'cog-marker',
            label: `薄板重心 G · 测得坐标: (${telemetry.measuredCenterOfGravity?.x.toFixed(3)}, ${telemetry.measuredCenterOfGravity?.y.toFixed(3)})m · 理论误差: ${err}mm`,
            cursor: 'pointer',
          };
        }

        // 2. 悬停在薄板的小孔上
        if (cur.userData?.isHole) {
          const holeId = cur.userData.holeId as string;
          const holeLabel = cur.userData.holeLabel as string;
          this.plate.setHoleHovered(holeId);
          this.lastHoveredTarget = `hole-${holeId}`;

          if (this.solver.currentHole?.id === holeId) {
            return {
              id: `hole-${holeId}`,
              label: `小孔 ${holeLabel} · 当前正挂在细线上 (向下拖动塑料板可取下)`,
              cursor: 'grab',
            };
          }

          return {
            id: `hole-${holeId}`,
            label: `待测孔 ${holeLabel} · 点击直接悬挂 / 或拖动套在细线上`,
            cursor: 'pointer',
          };
        }

        // 3. 悬停在薄板整体上
        if (cur.name === 'suspension-plate' || cur.userData?.isPlate) {
          this.plate.setHoleHovered(null);
          this.lastHoveredTarget = 'suspension-plate';

          if (this.solver.state === 'swinging') {
            return {
              id: 'suspension-plate',
              label: `塑料板正在以孔 ${this.solver.currentHole?.label} 自由摆动 · 等待稳定中... (向下拖拽可取下)`,
              cursor: 'grab',
            };
          }

          if (this.solver.state === 'stabilized') {
            return {
              id: 'suspension-plate',
              label: `塑料板已静止平衡，红线已绘制 · 请向下拖动塑料板将其取下`,
              cursor: 'grab',
            };
          }

          return {
            id: 'suspension-plate',
            label: `待测塑料薄板 · 拖拽移动，或直接点击孔位套挂在细线上`,
            cursor: 'grab',
          };
        }

        cur = cur.parent;
      }
    }

    return null;
  }

  /**
   * 鼠标/触控指针按下 (Pointer Down)
   */
  public override onPointerDown(
    event: PointerEvent,
    hit: THREE.Intersection | null,
    context: ExperimentContext
  ): boolean | void {
    if (!hit || this.isDisposed || this.isTransitionAnimating) return false;

    let clickedHole: PlateHoleDef | null = null;
    let targetIsPlate = false;
    let obj: THREE.Object3D | null = hit.object;

    while (obj && obj !== this.rootGroup) {
      if (obj.userData?.isHole) {
        const hId = obj.userData.holeId as string;
        clickedHole = this.solver.plateDef.holes.find((h) => h.id === hId) || null;
        targetIsPlate = true;
        break;
      }
      if (obj.name === 'suspension-plate' || obj.userData?.isPlate) {
        targetIsPlate = true;
        break;
      }
      obj = obj.parent;
    }

    if (!targetIsPlate) return false;

    // 1. 若薄板处于未悬挂状态且直接点击了某个小孔：触发一键平滑飞升悬挂动画
    if (
      (this.solver.state === 'idle' || this.solver.state === 'detached') &&
      clickedHole
    ) {
      this.animateHangPlateOnHole(clickedHole.id);
      return true;
    }

    // 2. 启动 3D 平滑拖拽
    this.isDraggingPlate = true;

    // 投影平面：法线始终正对相机视线，过击中点的世界坐标
    if (context.camera) {
      const camDir = new THREE.Vector3();
      context.camera.getWorldDirection(camDir);
      this.dragPlane.setFromNormalAndCoplanarPoint(camDir.negate(), hit.point);

      // 计算击中点在 rootGroup 局部坐标系中的位置
      const hitLocal = this.rootGroup.worldToLocal(hit.point.clone());
      this.dragStartPointerPosLocal.copy(hitLocal);
      // 记录相对塑料板根节点的局部偏移
      this.dragOffsetLocal.subVectors(this.plate.group.position, hitLocal);
    }

    return true;
  }

  /**
   * 鼠标/触控指针移动 (Pointer Move)
   */
  public override onPointerMove(
    event: PointerEvent,
    _hit: THREE.Intersection | null,
    context: ExperimentContext
  ): void {
    if (!context.camera) return;

    const mouse = this.getNormalizedMouse(event);
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, context.camera);

    // 未拖拽状态下检测悬停目标
    if (!this.isDraggingPlate) {
      this.getHoverTarget(raycaster);
      return;
    }

    // 拖拽处理
    if (!raycaster.ray.intersectPlane(this.dragPlane, this.dragPlaneIntersection)) {
      return;
    }

    // 转换至 rootGroup 局部坐标系
    const currentDragLocal = this.rootGroup.worldToLocal(
      this.dragPlaneIntersection.clone()
    );

    // 1. 如果薄板正悬挂在销钉上：
    // 用户需求：“然后再向下拖动塑料板，将塑料板取下”
    if (this.solver.state === 'swinging' || this.solver.state === 'stabilized') {
      const deltaY = currentDragLocal.y - this.dragStartPointerPosLocal.y;
      // 只要向下拖动超过 0.015m，立即脱钩取下！
      if (deltaY < -0.015) {
        this.detachPlateFromPin(currentDragLocal);
      }
      return;
    }

    // 2. 自由拖拽薄板：
    const targetPos = new THREE.Vector3().addVectors(
      currentDragLocal,
      this.dragOffsetLocal
    );

    // 安全视界约束：牢固限定在操作台可视空间内，绝不乱飞！
    targetPos.x = Math.max(-0.35, Math.min(0.35, targetPos.x));
    targetPos.y = Math.max(0.04, Math.min(0.48, targetPos.y));
    targetPos.z = 0.04;
    this.plate.group.position.copy(targetPos);

    // 实时检测哪个孔与细线横销最近
    this.checkHoleSnapping();
  }

  /**
   * 检查各个小孔与细线横销的吸附距离
   */
  private checkHoleSnapping(): void {
    const pinPos = this.stand.pinLocalPosition; // (0, 0.38, 0.04)
    let closestHole: PlateHoleDef | null = null;
    let minDistance = 0.11; // 11cm 内开启磁吸吸附指引

    for (const hole of this.solver.plateDef.holes) {
      const holeLocal = new THREE.Vector3(hole.x, hole.y, 0);
      const holeInRoot = holeLocal
        .applyMatrix4(this.plate.plateMesh.matrix)
        .applyMatrix4(this.plate.group.matrix);

      const dist = holeInRoot.distanceTo(pinPos);
      if (dist < minDistance) {
        minDistance = dist;
        closestHole = hole;
      }
    }

    this.candidateHoleToSnap = closestHole;

    if (closestHole) {
      const holeLocal = new THREE.Vector3(closestHole.x, closestHole.y, 0)
        .applyMatrix4(this.plate.plateMesh.matrix)
        .applyMatrix4(this.plate.group.matrix);
      this.stand.setSnapAuraHighlighted(true, holeLocal);
      this.plate.setHoleHovered(closestHole.id);
    } else {
      this.stand.setSnapAuraHighlighted(false);
      this.plate.setHoleHovered(null);
    }
  }

  /**
   * 鼠标/触控指针抬起 (Pointer Up)
   */
  public override onPointerUp(_event: PointerEvent, _context: ExperimentContext): void {
    if (!this.isDraggingPlate) return;
    this.isDraggingPlate = false;

    // 如果处于自由拖拽状态，且有孔处于吸附范围内，则执行套挂！
    if (
      this.solver.state !== 'swinging' &&
      this.solver.state !== 'stabilized' &&
      this.candidateHoleToSnap
    ) {
      this.hangPlateOnHole(this.candidateHoleToSnap.id);
    }

    this.stand.setSnapAuraHighlighted(false);
    this.plate.setHoleHovered(null);
  }

  /**
   * 将塑料板指定孔套挂在细线横销上
   */
  public hangPlateOnHole(holeId: string): void {
    const success = this.solver.hangOnHole(holeId, 20);
    if (!success) return;

    const pinPos = this.stand.pinLocalPosition;
    this.plate.group.position.set(pinPos.x, pinPos.y, pinPos.z);

    const hole = this.solver.currentHole!;
    this.plate.plateMesh.position.set(-hole.x, -hole.y, 0);

    const dx = this.solver.centroid.x - hole.x;
    const dy = this.solver.centroid.y - hole.y;
    const equilibriumAngle = Math.atan2(dx, -dy);
    this.plate.group.rotation.set(0, 0, equilibriumAngle + this.solver.angleRad);

    this.candidateHoleToSnap = null;
    this.stand.setSnapAuraHighlighted(false);
  }

  /**
   * 平滑补间动画套挂指定孔 (供一键点击小孔交互使用)
   */
  public animateHangPlateOnHole(holeId: string): void {
    const hole = this.solver.plateDef.holes.find((h) => h.id === holeId);
    if (!hole) return;

    this.isTransitionAnimating = true;
    this.animStartTime = performance.now();
    this.animDuration = 0.40;

    this.animStartPos.copy(this.plate.group.position);
    this.animStartRotZ = this.plate.group.rotation.z;

    const pinPos = this.stand.pinLocalPosition;
    this.animTargetPos.copy(pinPos);

    const dx = this.solver.centroid.x - hole.x;
    const dy = this.solver.centroid.y - hole.y;
    this.animTargetRotZ = Math.atan2(dx, -dy) + 0.35; // 带有初始微倾角度

    this.animCallback = () => {
      this.hangPlateOnHole(holeId);
    };
  }

  /**
   * 向下拖动将塑料板从挂销上取下
   */
  public detachPlateFromPin(currentWorldPos?: THREE.Vector3): void {
    this.solver.detachPlate();

    // 保持当前板的世界位置，但解除孔位固定
    const currentPlateCenter = new THREE.Vector3();
    this.plate.plateMesh.getWorldPosition(currentPlateCenter);
    const centerInRoot = this.rootGroup.worldToLocal(currentPlateCenter);

    this.plate.group.position.copy(centerInRoot);
    if (currentWorldPos) {
      this.plate.group.position.y = Math.min(
        this.stand.pinLocalPosition.y - 0.10,
        currentWorldPos.y
      );
    } else {
      this.plate.group.position.y = this.defaultRestPosition.y;
      this.plate.group.position.x = this.defaultRestPosition.x;
    }
    this.plate.plateMesh.position.set(0, 0, 0);
    this.plate.group.rotation.set(0, 0, 0);
  }

  /**
   * 立即跳过物理摆动直接稳定
   */
  public stabilizeNow(): void {
    if (this.solver.state === 'swinging') {
      this.solver.stabilizeImmediately();
      this.handleStabilizationVisuals();
    }
  }

  /**
   * 实验更新主循环
   */
  public update(delta: number, elapsed: number, context: ExperimentContext): void {
    if (this.isDisposed) return;

    // 1. 更新过渡动画 (平滑飞入悬挂)
    if (this.isTransitionAnimating) {
      const now = performance.now();
      const progress = Math.min(1.0, (now - this.animStartTime) / (this.animDuration * 1000));
      const ease = 1 - Math.pow(1 - progress, 3);
      this.plate.group.position.lerpVectors(this.animStartPos, this.animTargetPos, ease);
      this.plate.group.rotation.z = THREE.MathUtils.lerp(this.animStartRotZ, this.animTargetRotZ, ease);

      if (progress >= 1.0) {
        this.isTransitionAnimating = false;
        if (this.animCallback) {
          const cb = this.animCallback;
          this.animCallback = null;
          cb();
        }
      }
      return;
    }

    // 2. 更新铁架台
    this.stand.update(elapsed);

    // 3. 如果塑料板正处于悬挂摆动状态
    if (this.solver.state === 'swinging' && this.solver.currentHole) {
      const prevState = this.solver.state;
      this.solver.step(delta);

      const hole = this.solver.currentHole;
      const dx = this.solver.centroid.x - hole.x;
      const dy = this.solver.centroid.y - hole.y;
      const equilibriumAngle = Math.atan2(dx, -dy);

      this.plate.group.rotation.z = equilibriumAngle + this.solver.angleRad;

      if (prevState === 'swinging' && (this.solver.state as string) === 'stabilized') {
        this.handleStabilizationVisuals();
      }
    }

    // 4. 更新板的画线展开与重心脉冲动画
    this.plate.update(delta, elapsed);
  }

  /**
   * 当塑料板稳定平衡时：在板表面绘制红色铅垂线，并在两线相交时显现重心！
   */
  private handleStabilizationVisuals(): void {
    const lines = this.solver.markedLines;
    const lastIndex = lines.length - 1;
    if (lastIndex >= 0) {
      const lastLine = lines[lastIndex];
      this.plate.addMarkedLine(lastLine, lastIndex, true);
    }

    if (lines.length >= 2) {
      const cg = this.solver.getMeasuredCenterOfGravity();
      if (cg) {
        this.plate.showCenterOfGravityMarker(cg);
      }
    }
  }

  /**
   * 响应参数配置修改
   */
  public override onParameterChange(
    id: string,
    value: any,
    _context: ExperimentContext
  ): void {
    if (id === 'shape') {
      this.solver.setPlateShape(value as string);
      this.plate.rebuildPlate(this.solver.plateDef);
      this.resetPlateToRestingPosition();
    } else if (id === 'damping') {
      this.solver.damping = Number(value);
    } else if (id === 'stabilizeImmediately') {
      this.stabilizeNow();
    } else if (id === 'resetExperiment') {
      this.solver.resetAll();
      this.plate.clearDrawnLines();
      this.plate.clearCogMarker();
      this.resetPlateToRestingPosition();
    } else if (id === 'verifyBalance') {
      this.isBalanceVerificationActive = Boolean(value);
      if (this.isBalanceVerificationActive) {
        const cg = this.solver.centroid;
        const needlePos = new THREE.Vector3(0.12, 0.19, 0.04);
        this.stand.setNeedleStandVisible(true, needlePos);

        this.solver.detachPlate();
        this.plate.group.position.set(needlePos.x, needlePos.y, needlePos.z);
        this.plate.plateMesh.position.set(-cg.x, -cg.y, 0);
        this.plate.group.rotation.set(0, 0, 0);
      } else {
        this.stand.setNeedleStandVisible(false);
      }
    }
  }

  /**
   * 换算屏幕归一化坐标 (支持指针锁定与普通鼠标)
   */
  private getNormalizedMouse(event: PointerEvent): THREE.Vector2 {
    const isLocked = typeof document !== 'undefined' && document.pointerLockElement !== null;
    if (isLocked) {
      return new THREE.Vector2(0, 0);
    }
    return new THREE.Vector2(
      (event.clientX / window.innerWidth) * 2 - 1,
      -(event.clientY / window.innerHeight) * 2 + 1
    );
  }

  /**
   * 深度销毁与资源释放
   */
  public override dispose(context: ExperimentContext): void {
    this.isDisposed = true;
    super.dispose(context);
  }
}
