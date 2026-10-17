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
  private showVelocity = false;
  private currentReleaseSide: 'left' | 'right' = 'left';

  // 3D 场景纯三维交互状态 (支持左右双向自由拖拽调节)
  private is3DDragging: 'left' | 'right' | null = null;
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
    this.resetBall();
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

    if (this.is3DDragging === 'right') {
      const angle = this.solver.rightAngleDeg.toFixed(1);
      const len = this.solver.rightLengthM.toFixed(2);
      const h = this.solver.rightHeightM.toFixed(2);
      return {
        id: 'galileo-direction-handle',
        label: `右侧斜面方向标 (调节手柄) · 倾角: ${angle}° · 坡长: ${len}m · 端高: ${h}m`,
        cursor: 'grabbing',
      };
    }

    if (this.is3DDragging === 'left') {
      const angle = this.solver.leftAngleDeg.toFixed(1);
      const h = this.solver.releaseHeightM.toFixed(2);
      return {
        id: 'galileo-left-handle',
        label: `左侧斜面调节端 · 倾角: ${angle}° · 释放高度: ${h}m`,
        cursor: 'grabbing',
      };
    }

    const hits = raycaster.intersectObjects(this.bench.group.children, true);
    if (hits.length === 0) {
      if (this.lastHoveredTarget) {
        this.bench.setHandleHovered(null);
        this.lastHoveredTarget = null;
      }
      return null;
    }

    for (const hit of hits) {
      let cur: THREE.Object3D | null = hit.object;
      while (cur && cur !== this.bench.group) {
        if (cur.name === 'galileo-direction-handle' || cur.userData?.isDirectionHandle) {
          this.bench.setHandleHovered('right');
          this.lastHoveredTarget = 'galileo-direction-handle';
          const angle = this.solver.rightAngleDeg.toFixed(1);
          const len = this.solver.rightLengthM.toFixed(2);
          return {
            id: 'galileo-direction-handle',
            label: `右上角方向标 (调节手柄) · 倾角: ${angle}° · 坡长: ${len}m (按住拖拽调节)`,
            cursor: 'grab',
          };
        }
        if (cur.name === 'galileo-left-handle' || cur.userData?.isLeftHandle) {
          this.bench.setHandleHovered('left');
          this.lastHoveredTarget = 'galileo-left-handle';
          const angle = this.solver.leftAngleDeg.toFixed(1);
          const h = this.solver.releaseHeightM.toFixed(2);
          return {
            id: 'galileo-left-handle',
            label: `左上角调节端 · 倾角: ${angle}° · 释放高度: ${h}m (按住拖拽调节)`,
            cursor: 'grab',
          };
        }
        if (cur.name === 'galileo-ball' || cur.userData?.isBall) {
          this.bench.setHandleHovered(null);
          this.lastHoveredTarget = 'galileo-ball';
          return {
            id: 'galileo-ball',
            label: '小球 · 点击立即重置回起点重新滑行',
            cursor: 'pointer',
          };
        }
        cur = cur.parent;
      }
    }

    if (this.lastHoveredTarget) {
      this.bench.setHandleHovered(null);
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

    let targetType: 'right_handle' | 'left_handle' | 'ball' | 'none' = 'none';
    let obj: THREE.Object3D | null = hit.object;

    while (obj && obj !== this.bench.group) {
      if (obj.name === 'galileo-direction-handle' || obj.userData?.isDirectionHandle) {
        targetType = 'right_handle';
        break;
      }
      if (obj.name === 'galileo-left-handle' || obj.userData?.isLeftHandle) {
        targetType = 'left_handle';
        break;
      }
      if (obj.name === 'galileo-ball' || obj.userData?.isBall) {
        targetType = 'ball';
        break;
      }
      obj = obj.parent;
    }

    if (targetType === 'right_handle') {
      this.is3DDragging = 'right';
      this.dragPlane.setFromNormalAndCoplanarPoint(
        new THREE.Vector3(0, 0, 1),
        this.rootGroup.position
      );
      return true;
    }

    if (targetType === 'left_handle') {
      this.is3DDragging = 'left';
      this.dragPlane.setFromNormalAndCoplanarPoint(
        new THREE.Vector3(0, 0, 1),
        this.rootGroup.position
      );
      return true;
    }

    if (targetType === 'ball') {
      this.currentReleaseSide = 'left';
      this.resetBall();
      return true;
    }

    return false;
  }

  /**
   * 鼠标/触控指针拖拽移动 (支持左右双向调节)
   */
  public override onPointerMove(
    event: PointerEvent,
    _hit: THREE.Intersection | null,
    context: ExperimentContext
  ): void {
    if (!this.is3DDragging || !context.camera) return;

    const isLocked = typeof document !== 'undefined' && document.pointerLockElement !== null;
    const mouse = isLocked
      ? new THREE.Vector2(0, 0)
      : new THREE.Vector2(
          (event.clientX / window.innerWidth) * 2 - 1,
          -(event.clientY / window.innerHeight) * 2 + 1
        );

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, context.camera);

    this.dragPlane.setFromNormalAndCoplanarPoint(
      new THREE.Vector3(0, 0, 1),
      this.rootGroup.position
    );

    this.bench.setHandleHovered(this.is3DDragging);

    if (raycaster.ray.intersectPlane(this.dragPlane, this.dragPlaneIntersection)) {
      const localPoint = this.rootGroup.worldToLocal(this.dragPlaneIntersection.clone());
      const halfFlat = this.solver.flatLengthM * 0.5;

      if (this.is3DDragging === 'right') {
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
      } else if (this.is3DDragging === 'left') {
        const dx = -halfFlat - localPoint.x;
        const dy = localPoint.y;

        if (dx > 0) {
          let angleRad = Math.atan2(Math.max(0.05, dy), dx);
          let angleDeg = (angleRad * 180.0) / Math.PI;
          angleDeg = Math.max(10.0, Math.min(60.0, angleDeg));

          const lengthM = Math.max(0.25, Math.min(1.20, Math.sqrt(dx * dx + dy * dy)));
          const heightM = Math.max(0.10, Math.min(0.50, lengthM * Math.sin(angleRad)));

          this.applyLeftInclineTransform(angleDeg, lengthM, heightM, false);
          context.setParameter?.('releaseHeight', parseFloat(heightM.toFixed(2)));
        }
      }
    }
  }

  /**
   * 鼠标/触控指针松开
   */
  public override onPointerUp(_event: PointerEvent, _context: ExperimentContext): void {
    if (this.is3DDragging) {
      this.is3DDragging = null;
      this.bench.setHandleHovered(null);
      this.resetBall();
    }
  }

  /**
   * 更新左侧斜面倾角与高度
   */
  public applyLeftInclineTransform(
    angleDeg: number,
    lengthM: number,
    releaseHeightM: number,
    autoReset = false
  ): void {
    this.solver.updateParameters({
      leftAngleDeg: angleDeg,
      releaseHeightM: releaseHeightM,
    });
    this.bench.updateLeftIncline(angleDeg, lengthM);
    this.bench.updateHeightLine(releaseHeightM);

    if (autoReset) {
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
