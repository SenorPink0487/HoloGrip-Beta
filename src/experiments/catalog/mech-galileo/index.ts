import * as THREE from 'three';
import { BaseExperiment } from '../../base/BaseExperiment.ts';
import type { ExperimentContext } from '../../../core/types.ts';
import { GalileoBenchMesh } from '../../../scene/mech/GalileoBenchMesh.ts';
import {
  GalileoDynamicsSolver,
  type GalileoTelemetry,
} from '../../../physics/mech/galileoDynamics.ts';
import { GalileoDirectionWidget } from '../../../ui/GalileoDirectionWidget.ts';
import { metadata } from './meta.ts';

export default class MechGalileoExperiment extends BaseExperiment {
  public readonly metadata = metadata;
  public override targetScale = 1.8;
  public override hideCenterEmitter = true;

  private bench!: GalileoBenchMesh;
  private solver!: GalileoDynamicsSolver;
  private widget: GalileoDirectionWidget | null = null;
  private isDisposed = false;
  private isPlaying = true;
  private allowOscillation = true;
  private showVelocity = true;
  private currentReleaseSide: 'left' | 'right' = 'left';

  // 3D 场景内直接拖拽把手交互状态
  private is3DDragging = false;
  private dragPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  private dragPlaneIntersection = new THREE.Vector3();

  // 遥测缓存
  private telemetry!: GalileoTelemetry;
  private lastApexTriggered = false;

  public init(context: ExperimentContext): void {
    // 将实验根节点放置于实验桌前沿 (Y=0.12, Z=1.55)
    this.rootGroup.position.set(0, 0.12, 1.55);

    // 初始化 3D 台面模型
    this.bench = new GalileoBenchMesh();
    this.rootGroup.add(this.bench.group);
    this.addDisposable(() => this.bench.dispose());

    // 初始化物理动力学求解器
    this.solver = new GalileoDynamicsSolver({
      releaseHeightM: 0.25,
      leftAngleDeg: 35.0,
      flatLengthM: 0.40,
      rightAngleDeg: 30.0,
      rightLengthM: 0.60,
      frictionMu: 0.0,
    });
    this.solver.reset(this.currentReleaseSide);

    // 创建右上角全息方向标交互控件
    this.createWidget();

    this.recalculate();
  }

  private createWidget(): void {
    if (typeof document === 'undefined') return;

    this.widget = new GalileoDirectionWidget(
      {
        onTransformChange: (angleDeg, lengthM) => {
          this.applyRightInclineTransform(angleDeg, lengthM, false);
        },
        onTransformCommit: (angleDeg, lengthM) => {
          // 用户明确要求："改变右侧斜面的长度和高度后，小球自动回复到...初始位置，观察小球的运动状况。"
          this.applyRightInclineTransform(angleDeg, lengthM, true);
        },
        onResetBall: () => {
          this.resetBall();
        },
        onTogglePlay: (playing) => {
          this.isPlaying = playing;
        },
        onSideChange: (side) => {
          this.currentReleaseSide = side;
          this.resetBall();
        },
      },
      document.body
    );

    this.addDisposable(() => {
      this.widget?.destroy();
      this.widget = null;
    });
  }

  /**
   * 应用右侧斜面的新倾角与长度
   * @param autoReset 是否在改变后让小球自动回复到初始位置开始滑行
   */
  public applyRightInclineTransform(angleDeg: number, lengthM: number, autoReset = true): void {
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
      // 限制单帧最大时间步长以保证积分平滑稳定
      const stepDt = Math.min(0.033, Math.max(0.001, delta));
      const state = this.solver.step(stepDt, this.allowOscillation);

      this.bench.setBallState(
        state.x,
        state.y,
        state.velocity,
        state.arcLength,
        this.showVelocity
      );

      // 当小球接近最高点且速度接近 0 时触发等高到达光晕特效
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
      this.solver.updateParameters({ releaseHeightM: value });
      this.bench.updateHeightLine(value);
      this.widget?.setReleaseHeight(value);
      this.resetBall();
    } else if (id === 'rightAngle') {
      const curLen = this.solver.rightLengthM;
      this.widget?.setTransform(value, curLen, true);
    } else if (id === 'rightLength') {
      const curAngle = this.solver.rightAngleDeg;
      this.widget?.setTransform(curAngle, value, true);
    } else if (id === 'frictionMu') {
      this.solver.updateParameters({ frictionMu: value });
    } else if (id === 'showVelocity') {
      this.showVelocity = Boolean(value);
    } else if (id === 'allowOscillation') {
      this.allowOscillation = Boolean(value);
    }
  }

  /**
   * 支持直接在 3D 视图中拖动右侧斜面顶端的发光把手
   */
  public override onPointerDown(
    event: PointerEvent,
    hit: THREE.Intersection | null,
    _context: ExperimentContext
  ): boolean | void {
    if (!hit) return false;

    // 检查是否击中右侧斜面顶端的方向标把手
    let obj: THREE.Object3D | null = hit.object;
    while (obj && obj !== this.rootGroup) {
      if (obj.name === 'galileo-right-handle' || obj.name === 'rightInclineTipHandle') {
        this.is3DDragging = true;
        return true;
      }
      obj = obj.parent;
    }
    return false;
  }

  public override onPointerMove(
    event: PointerEvent,
    _hit: THREE.Intersection | null,
    context: ExperimentContext
  ): void {
    if (!this.is3DDragging || !context.camera) return;

    // 将屏幕坐标反向投射到实验台所在的垂直交互平面上
    const mouse = new THREE.Vector2(
      (event.clientX / window.innerWidth) * 2 - 1,
      -(event.clientY / window.innerHeight) * 2 + 1
    );

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, context.camera);

    // 拖拽平面：过铰链中心 (halfFlat, 0, 0)，法向量垂直于 Z 轴
    this.dragPlane.setFromNormalAndCoplanarPoint(
      new THREE.Vector3(0, 0, 1),
      this.rootGroup.position
    );

    if (raycaster.ray.intersectPlane(this.dragPlane, this.dragPlaneIntersection)) {
      // 转换为局部坐标系
      const localPoint = this.rootGroup.worldToLocal(this.dragPlaneIntersection.clone());
      const halfFlat = this.solver.flatLengthM * 0.5;

      const dx = localPoint.x - halfFlat;
      const dy = localPoint.y;

      if (dx > 0) {
        let angleRad = Math.atan2(Math.max(0, dy), dx);
        let angleDeg = (angleRad * 180.0) / Math.PI;
        angleDeg = Math.max(0, Math.min(60, angleDeg));

        const lengthM = Math.max(0.30, Math.min(1.20, Math.sqrt(dx * dx + dy * dy)));

        this.widget?.setTransform(angleDeg, lengthM, false);
        this.applyRightInclineTransform(angleDeg, lengthM, false);
      }
    }
  }

  public override onPointerUp(_event: PointerEvent, _context: ExperimentContext): void {
    if (this.is3DDragging) {
      this.is3DDragging = false;
      // 拖拽完成后自动重置小球开始运动
      this.resetBall();
    }
  }

  public getTelemetry(): GalileoTelemetry {
    return this.solver.getTelemetry();
  }

  public override dispose(context: ExperimentContext): void {
    this.isDisposed = true;
    this.widget?.destroy();
    this.widget = null;
    super.dispose(context);
  }

  private recalculate(): void {
    this.telemetry = this.solver.getTelemetry();
  }
}
