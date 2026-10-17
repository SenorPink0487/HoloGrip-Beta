/**
 * 悬挂法测物体重心 (Determination of Center of Gravity by Suspension)
 * 经典力学交互式 3D 实验主控模块
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
  public override targetScale = 1.6;
  public override hideCenterEmitter = true;

  // 3D 装置组件
  private stand!: RetortStandMesh;
  private plate!: SuspensionPlateMesh;
  private solver!: SuspensionDynamicsSolver;
  private isDisposed = false;

  // 交互拖拽状态
  private isDraggingPlate = false;
  private dragPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  private dragPlaneIntersection = new THREE.Vector3();
  private dragOffset = new THREE.Vector3();
  private pointerDownWorldPos = new THREE.Vector3();
  private candidateHoleToSnap: PlateHoleDef | null = null;
  private lastHoveredTarget: string | null = null;

  // 待测板自由未悬挂时的静止参考位置
  private readonly defaultRestPosition = new THREE.Vector3(0.08, 0.22, 0.05);

  // 顶针平衡验证模式
  private isBalanceVerificationActive = false;

  // 提示信息缓存 (供 HUD 和准星显示)
  private currentStatusMessage = '拖动塑料板，使板上的任意小孔套挂在细线挂销上';

  public init(context: ExperimentContext): void {
    // 根节点定位至全息台操作面
    this.rootGroup.position.set(0, 0.12, 1.55);

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

    // 初始将塑料板放置在操作台前方
    this.resetPlateToRestingPosition();
  }

  /**
   * 将塑料板放回初始待机位置
   */
  private resetPlateToRestingPosition(): void {
    this.plate.group.position.copy(this.defaultRestPosition);
    this.plate.group.rotation.set(0, 0, 0);
    this.plate.plateMesh.position.set(0, 0, 0);
    this.plate.plateMesh.rotation.set(0, 0, 0);
    this.solver.detachPlate();
    this.stand.setSnapAuraHighlighted(false);
    this.candidateHoleToSnap = null;
    this.isBalanceVerificationActive = false;
    this.stand.setNeedleStandVisible(false);
    this.updateStatusMessage();
  }

  /**
   * 射线检测悬停目标 (Crosshair 与 HUD 工具提示)
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

    // 射线检测
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
            label: `待测薄板重心 G (Center of Gravity) · 测得坐标: (${telemetry.measuredCenterOfGravity?.x.toFixed(3)}, ${telemetry.measuredCenterOfGravity?.y.toFixed(3)})m · 理论误差: ${err}mm`,
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
              label: `小孔 ${holeLabel} · 当前悬挂枢轴点 (向下拖动塑料板可取下)`,
              cursor: 'grab',
            };
          }

          return {
            id: `hole-${holeId}`,
            label: `待测孔 ${holeLabel} · 点击或拖动塑料板将其悬挂在细线上`,
            cursor: 'grab',
          };
        }

        // 3. 悬停在薄板整体上
        if (cur.name === 'suspension-plate' || cur.userData?.isPlate) {
          this.plate.setHoleHovered(null);
          this.lastHoveredTarget = 'suspension-plate';

          if (this.solver.state === 'swinging') {
            return {
              id: 'suspension-plate',
              label: `塑料板正在以孔 ${this.solver.currentHole?.label} 为支点自由摆动 · 等待稳定中... (向下拖拽可取下)`,
              cursor: 'grab',
            };
          }

          if (this.solver.state === 'stabilized') {
            return {
              id: 'suspension-plate',
              label: `塑料板已静止平衡，红线已绘制 · 请【向下拖动塑料板】将其取下`,
              cursor: 'grab',
            };
          }

          return {
            id: 'suspension-plate',
            label: `待测塑料薄板 · 拖拽移动，使板上的任意孔套挂在细线横销上`,
            cursor: 'grab',
          };
        }

        // 4. 悬停在细线横销上
        if (cur.name === 'suspension-pin' || cur.userData?.isSuspensionPin) {
          return {
            id: 'suspension-pin',
            label: '悬挂细线横销 (Pin) 与铅垂线基准',
            cursor: 'default',
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
    if (!hit || this.isDisposed) return false;

    let targetIsPlateOrHole = false;
    let clickedHole: PlateHoleDef | null = null;
    let obj: THREE.Object3D | null = hit.object;

    while (obj && obj !== this.rootGroup) {
      if (obj.userData?.isHole) {
        targetIsPlateOrHole = true;
        const hId = obj.userData.holeId as string;
        clickedHole = this.solver.plateDef.holes.find((h) => h.id === hId) || null;
        break;
      }
      if (obj.name === 'suspension-plate' || obj.userData?.isPlate) {
        targetIsPlateOrHole = true;
        break;
      }
      obj = obj.parent;
    }

    if (!targetIsPlateOrHole) return false;

    // 启动拖拽
    this.isDraggingPlate = true;

    // 设置拖拽投影平面 (平行于 XY 平面，穿过当前塑料板的 Z 轴)
    this.dragPlane.setFromNormalAndCoplanarPoint(
      new THREE.Vector3(0, 0, 1),
      this.plate.group.position
    );

    // 记录点击位置
    const mouse = this.getNormalizedMouse(event);
    const raycaster = new THREE.Raycaster();
    if (context.camera) {
      raycaster.setFromCamera(mouse, context.camera);
      if (raycaster.ray.intersectPlane(this.dragPlane, this.dragPlaneIntersection)) {
        this.pointerDownWorldPos.copy(this.dragPlaneIntersection);
        this.dragOffset.subVectors(this.plate.group.position, this.dragPlaneIntersection);
      }
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

    // 处理拖拽逻辑
    if (!raycaster.ray.intersectPlane(this.dragPlane, this.dragPlaneIntersection)) {
      return;
    }

    const currentDragWorld = this.dragPlaneIntersection;

    // 1. 如果薄板当前正悬挂在销钉上：
    // 用户需求：“然后再向下拖动塑料板，将塑料板取下”
    if (this.solver.state === 'swinging' || this.solver.state === 'stabilized') {
      const deltaY = currentDragWorld.y - this.pointerDownWorldPos.y;
      // 当向下拖动超过 0.025m 时，触发脱钩取下！
      if (deltaY < -0.025) {
        this.detachPlateFromPin(currentDragWorld);
      }
      return;
    }

    // 2. 自由拖拽薄板状态：
    // 薄板中心跟随光标在 XY 平面平移
    const targetPos = new THREE.Vector3().addVectors(currentDragWorld, this.dragOffset);
    // 限制拖拽活动范围在实验台上空
    targetPos.x = Math.max(-0.45, Math.min(0.45, targetPos.x));
    targetPos.y = Math.max(0.12, Math.min(0.55, targetPos.y));
    this.plate.group.position.copy(targetPos);

    // 实时检测哪个孔与细线横销最近
    this.checkHoleSnapping();
  }

  /**
   * 检查各个小孔与细线横销的吸附距离
   */
  private checkHoleSnapping(): void {
    const pinPos = this.stand.pinWorldPosition; // (0, 0.40, 0.04)
    let closestHole: PlateHoleDef | null = null;
    let minDistance = 0.075; // 7.5cm 内开始吸附提示

    for (const hole of this.solver.plateDef.holes) {
      // 计算该孔在 rootGroup 坐标系下的实时位置
      const holeLocal = new THREE.Vector3(hole.x, hole.y, 0);
      const holeWorld = holeLocal.applyMatrix4(this.plate.plateMesh.matrixWorld);
      const holeInRoot = this.rootGroup.worldToLocal(holeWorld.clone());

      const dist = holeInRoot.distanceTo(pinPos);
      if (dist < minDistance) {
        minDistance = dist;
        closestHole = hole;
      }
    }

    this.candidateHoleToSnap = closestHole;

    if (closestHole) {
      this.stand.setSnapAuraHighlighted(true);
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

    // 如果未处于悬挂状态，且有孔处于吸附范围内，则执行套挂！
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
    const success = this.solver.hangOnHole(holeId, 22);
    if (!success) return;

    // 将板根组移动到挂销处
    const pinPos = this.stand.pinWorldPosition;
    this.plate.group.position.set(pinPos.x, pinPos.y, pinPos.z);

    // 将所选孔对准轴心 (0, 0, 0)
    const hole = this.solver.currentHole!;
    this.plate.plateMesh.position.set(-hole.x, -hole.y, 0);

    // 计算平衡时的静态基准角：使 (hole -> centroid) 向量竖直向下 (-Y)
    const dx = this.solver.centroid.x - hole.x;
    const dy = this.solver.centroid.y - hole.y;
    // 默认局部方向向量与 -Y 的夹角
    const equilibriumAngle = Math.atan2(dx, -dy);
    this.plate.group.rotation.set(0, 0, equilibriumAngle + this.solver.angleRad);

    this.candidateHoleToSnap = null;
    this.stand.setSnapAuraHighlighted(false);
    this.updateStatusMessage();
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

    // 重置 plateMesh 局部偏移为 0，将位移转移到 group
    this.plate.group.position.copy(centerInRoot);
    if (currentWorldPos) {
      this.plate.group.position.y = Math.min(
        this.stand.pinWorldPosition.y - 0.12,
        currentWorldPos.y
      );
    } else {
      this.plate.group.position.y -= 0.08;
    }
    this.plate.plateMesh.position.set(0, 0, 0);

    // 旋转平缓归零
    this.plate.group.rotation.set(0, 0, 0);

    this.updateStatusMessage();
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

    // 1. 更新铁架台与吸附光环动画
    this.stand.update(elapsed);

    // 2. 如果塑料板正处于悬挂状态
    if (this.solver.state === 'swinging' && this.solver.currentHole) {
      const prevState = this.solver.state;
      this.solver.step(delta);

      // 计算平衡时的基准旋转角度
      const hole = this.solver.currentHole;
      const dx = this.solver.centroid.x - hole.x;
      const dy = this.solver.centroid.y - hole.y;
      const equilibriumAngle = Math.atan2(dx, -dy);

      // 实时更新摆动角度
      this.plate.group.rotation.z = equilibriumAngle + this.solver.angleRad;

      // 检测是否刚刚达到稳定
      if (prevState === 'swinging' && (this.solver.state as string) === 'stabilized') {
        this.handleStabilizationVisuals();
      }
    }

    // 3. 更新板的画线展开与重心脉冲动画
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
      // 动态在板表面画出该条鲜艳红线
      this.plate.addMarkedLine(lastLine, lastIndex, true);
    }

    // 如果已记录了两条（或更多）不同孔的铅垂线，则两条线的交点即为重心！
    if (lines.length >= 2) {
      const cg = this.solver.getMeasuredCenterOfGravity();
      if (cg) {
        this.plate.showCenterOfGravityMarker(cg);
      }
    }

    this.updateStatusMessage();
  }

  /**
   * 更新实验阶段提示与遥测
   */
  private updateStatusMessage(): void {
    const linesCount = this.solver.markedLines.length;

    if (this.solver.state === 'swinging') {
      this.currentStatusMessage = `薄板以孔 ${this.solver.currentHole?.label} 自由摆动中，请等待其静止平衡...`;
    } else if (this.solver.state === 'stabilized') {
      if (linesCount === 1) {
        this.currentStatusMessage =
          '已绘制第 1 条红色铅垂基准线！请【向下拖动塑料板】将其取下，再换另一个孔重新悬挂。';
      } else if (linesCount >= 2) {
        this.currentStatusMessage =
          '两条红线的交点即为重心 G！依据二力平衡，所有悬挂铅垂线必穿过重心。实验成功！';
      }
    } else if (this.solver.state === 'detached' || this.solver.state === 'idle') {
      if (linesCount === 0) {
        this.currentStatusMessage = '请拖动塑料板，将板上的任意小孔套挂在细线横销上。';
      } else if (linesCount === 1) {
        const lastHoleLabel = this.solver.markedLines[0].holeLabel;
        this.currentStatusMessage = `已记录孔 ${lastHoleLabel} 的铅垂线。请将【另一个不同的小孔】挂在细线上。`;
      } else {
        this.currentStatusMessage =
          '重心 G 已成功测定！你可以继续挂第 3 个孔验证三线共点，或开启顶针平衡验证。';
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
        // 将板移至水平顶针尖上
        const cg = this.solver.centroid;
        const needlePos = new THREE.Vector3(0.08, 0.20, 0.05);
        this.stand.setNeedleStandVisible(true, needlePos);

        this.solver.detachPlate();
        this.plate.group.position.set(needlePos.x, needlePos.y, needlePos.z);
        // 板中心对准顶针
        this.plate.plateMesh.position.set(-cg.x, -cg.y, 0);
        this.plate.group.rotation.set(0, 0, 0);
      } else {
        this.stand.setNeedleStandVisible(false);
      }
    }
  }

  /**
   * 换算屏幕归一化坐标 (支持 Pointer Lock 与普通鼠标)
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
