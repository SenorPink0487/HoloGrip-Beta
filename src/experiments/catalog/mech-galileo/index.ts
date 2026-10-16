import * as THREE from 'three';
import { BaseExperiment } from '../../base/BaseExperiment.ts';
import type { ExperimentContext } from '../../../core/types.ts';
import { GalileoBenchMesh } from '../../../scene/mech/GalileoBenchMesh.ts';
import {
  GalileoDynamicsSolver,
  type GalileoTelemetry,
} from '../../../physics/mech/galileoDynamics.ts';
import { metadata } from './meta.ts';

export default class MechGalileoExperiment extends BaseExperiment {
  public readonly metadata = metadata;
  public override targetScale = 1.8;
  public override hideCenterEmitter = true;

  private bench!: GalileoBenchMesh;
  private solver!: GalileoDynamicsSolver;
  private isDisposed = false;
  private isPlaying = true;
  private allowOscillation = true;
  private showVelocity = true;
  private currentReleaseSide: 'left' | 'right' = 'left';

  // 3D 场景纯三维交互状态 (与光学实验一致，无任何 2D 悬浮窗口)
  private is3DDragging = false;
  private dragPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  private dragPlaneIntersection = new THREE.Vector3();
  private lastHoveredTarget: string | null = null;

  // 遥测缓存
  private telemetry!: GalileoTelemetry;
  private lastApexTriggered = false;

  public init(context: ExperimentContext): void {
    // 将实验根节点放置于实验台操作区域 (Y=0.12, Z=1.55)
    this.rootGroup.position.set(0, 0.12, 1.55);

    // 实例化 3D 实验台模型
    this.bench = new GalileoBenchMesh();
    this.rootGroup.add(this.bench.group);
    this.addDisposable(() => this.bench.dispose());

    // 实例化物理动力学求解器
    this.solver = new GalileoDynamicsSolver({
      releaseHeightM: 0.25,
      leftAngleDeg: 35.0,
      flatLengthM: 0.40,
      rightAngleDeg: 30.0,
      rightLengthM: 0.60,
      frictionMu: 0.0,
    });
    this.solver.reset(this.currentReleaseSide);

    this.recalculate();
  }

  /**
   * 射线检测悬停目标（供 Crosshair 准星与 HUD 工具提示使用）
   */
  public override getHoverTarget(raycaster: THREE.Raycaster): {
    id: string;
    label: string;
    cursor?: string;
  } | null {
    if (this.isDisposed) return null;

    if (this.is3DDragging) {
      const angle = this.solver.rightAngleDeg.toFixed(1);
      const len = this.solver.rightLengthM.toFixed(2);
      const h = this.solver.rightHeightM.toFixed(2);
      return {
        id: 'galileo-direction-handle',
        label: `右侧斜面方向标 · 倾角: ${angle}° · 坡长: ${len}m · 端高: ${h}m`,
        cursor: 'grabbing',
      };
    }

    const hits = raycaster.intersectObjects(this.bench.group.children, true);
    if (hits.length === 0) {
      if (this.lastHoveredTarget) {
        this.bench.setHandleHovered(false);
        this.lastHoveredTarget = null;
      }
      return null;
    }

    for (const hit of hits) {
      let cur: THREE.Object3D | null = hit.object;
      while (cur && cur !== this.bench.group) {
        if (cur.name === 'galileo-direction-handle' || cur.userData?.isDirectionHandle) {
          this.bench.setHandleHovered(true);
          this.lastHoveredTarget = 'galileo-direction-handle';
          const angle = this.solver.rightAngleDeg.toFixed(1);
          const len = this.solver.rightLengthM.toFixed(2);
          return {
            id: 'galileo-direction-handle',
            label: `右上角方向标 · 倾角: ${angle}° · 坡长: ${len}m (按住拖拽调节)`,
            cursor: 'grab',
          };
        }
        if (cur.name === 'galileo-ball' || cur.userData?.isBall) {
          this.bench.setHandleHovered(false);
          this.lastHoveredTarget = 'galileo-ball';
          return {
            id: 'galileo-ball',
            label: '小球 · 点击立即重置回起点重新滑行',
            cursor: 'pointer',
          };
        }
        if (cur.name === 'galileo-left-gate' || cur.userData?.isLeftGate) {
          this.bench.setHandleHovered(false);
          this.lastHoveredTarget = 'galileo-left-gate';
          return {
            id: 'galileo-left-gate',
            label: '左侧释放端 · 点击从此释放小球',
            cursor: 'pointer',
          };
        }
        cur = cur.parent;
      }
    }

    if (this.lastHoveredTarget) {
      this.bench.setHandleHovered(false);
      this.lastHoveredTarget = null;
    }
    return null;
  }

  /**
   * 鼠标/触控指针按下
   */
  public override onPointerDown(
    event: PointerEvent,
    hit: THREE.Intersection | null,
    context: ExperimentContext
  ): boolean | void {
    if (!hit) return false;

    let targetType: 'direction_handle' | 'ball' | 'left_gate' | 'none' = 'none';
    let obj: THREE.Object3D | null = hit.object;

    while (obj && obj !== this.bench.group) {
      if (obj.name === 'galileo-direction-handle' || obj.userData?.isDirectionHandle) {
        targetType = 'direction_handle';
        break;
      }
      if (obj.name === 'galileo-ball' || obj.userData?.isBall) {
        targetType = 'ball';
        break;
      }
      if (obj.name === 'galileo-left-gate' || obj.userData?.isLeftGate) {
        targetType = 'left_gate';
        break;
      }
      obj = obj.parent;
    }

    if (targetType === 'direction_handle') {
      this.is3DDragging = true;
      // 设置垂直拖拽平面 (法向量指向 Z 轴，过实验台中心)
      this.dragPlane.setFromNormalAndCoplanarPoint(
        new THREE.Vector3(0, 0, 1),
        this.rootGroup.position
      );
      return true; // 拦截事件，触发 Engine.ts 锁定指针拖拽
    }

    if (targetType === 'ball' || targetType === 'left_gate') {
      this.currentReleaseSide = 'left';
      this.resetBall();
      return true;
    }

    return false;
  }

  /**
   * 鼠标/触控指针拖拽移动
   */
  public override onPointerMove(
    event: PointerEvent,
    _hit: THREE.Intersection | null,
    context: ExperimentContext
  ): void {
    if (!this.is3DDragging || !context.camera) return;

    const mouse = new THREE.Vector2(
      (event.clientX / window.innerWidth) * 2 - 1,
      -(event.clientY / window.innerHeight) * 2 + 1
    );

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, context.camera);

    this.dragPlane.setFromNormalAndCoplanarPoint(
      new THREE.Vector3(0, 0, 1),
      this.rootGroup.position
    );

    if (raycaster.ray.intersectPlane(this.dragPlane, this.dragPlaneIntersection)) {
      // 转换至 rootGroup 局部坐标系
      const localPoint = this.rootGroup.worldToLocal(this.dragPlaneIntersection.clone());
      const halfFlat = this.solver.flatLengthM * 0.5;

      const dx = localPoint.x - halfFlat;
      const dy = localPoint.y;

      if (dx > 0) {
        let angleRad = Math.atan2(Math.max(0, dy), dx);
        let angleDeg = (angleRad * 180.0) / Math.PI;
        angleDeg = Math.max(0.0, Math.min(60.0, angleDeg));

        const lengthM = Math.max(0.30, Math.min(1.20, Math.sqrt(dx * dx + dy * dy)));

        this.applyRightInclineTransform(angleDeg, lengthM, false);
        context.setParameter?.('rightAngle', parseFloat(angleDeg.toFixed(1)));
        context.setParameter?.('rightLength', parseFloat(lengthM.toFixed(2)));
      }
    }
  }

  /**
   * 鼠标/触控指针松开
   */
  public override onPointerUp(_event: PointerEvent, _context: ExperimentContext): void {
    if (this.is3DDragging) {
      this.is3DDragging = false;
      this.bench.setHandleHovered(false);

      // 用户要求：“拖动右上角的方向标，改变右侧斜面的长度和高度后，小球自动回复到初始位置，观察小球的运动状况。”
      this.resetBall();
    }
  }

  /**
   * 更新右侧斜面倾角与坡长
   */
  public applyRightInclineTransform(angleDeg: number, lengthM: number, autoReset = false): void {
    this.solver.updateParameters({
      rightAngleDeg: angleDeg,
      rightLengthM: lengthM,
    });
    this.bench.updateRightIncline(angleDeg, lengthM);

    if (autoReset) {
      this.resetBall();
    }
  }

  public resetBall(): void {
    this.solver.reset(this.currentReleaseSide);
    this.lastApexTriggered = false;
    const state = this.solver.getState();
    this.bench.setBallState(
      state.x,
      state.y,
      state.velocity,
      state.arcLength,
      this.showVelocity
    );
  }

  public override update(delta: number, _elapsed: number, _context: ExperimentContext): void {
    if (this.isDisposed) return;

    this.bench.updateAnimation(delta);

    if (this.isPlaying) {
      const stepDt = Math.min(0.033, Math.max(0.001, delta));
      const state = this.solver.step(stepDt, this.allowOscillation);

      this.bench.setBallState(
        state.x,
        state.y,
        state.velocity,
        state.arcLength,
        this.showVelocity
      );

      // 到达顶点时触发等高光晕动效
      if (
        state.zone === 'right_incline' &&
        Math.abs(state.speed) < 0.12 &&
        state.y >= this.solver.releaseHeightM * 0.95 &&
        !this.lastApexTriggered
      ) {
        this.bench.triggerApexBeacon(state.x, state.y);
        this.lastApexTriggered = true;
      } else if (state.speed > 0.3) {
        this.lastApexTriggered = false;
      }
    }
  }

  public override onParameterChange(id: string, value: any, _context: ExperimentContext): void {
    if (id === 'releaseHeight') {
      this.solver.updateParameters({ releaseHeightM: Number(value) });
      this.bench.updateHeightLine(Number(value));
      this.resetBall();
    } else if (id === 'rightAngle') {
      const curLen = this.solver.rightLengthM;
      this.applyRightInclineTransform(Number(value), curLen, true);
    } else if (id === 'rightLength') {
      const curAngle = this.solver.rightAngleDeg;
      this.applyRightInclineTransform(curAngle, Number(value), true);
    } else if (id === 'frictionMu') {
      this.solver.updateParameters({ frictionMu: Number(value) });
    } else if (id === 'showVelocity') {
      this.showVelocity = Boolean(value);
    } else if (id === 'allowOscillation') {
      this.allowOscillation = Boolean(value);
    }
  }

  public getTelemetry(): GalileoTelemetry {
    return this.solver.getTelemetry();
  }

  public override dispose(context: ExperimentContext): void {
    this.isDisposed = true;
    super.dispose(context);
  }

  private recalculate(): void {
    this.telemetry = this.solver.getTelemetry();
  }
}
