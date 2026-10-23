/**
 * 卡诺热机 (Carnot Heat Engine) 交互式 3D 热力学实验主控模块
 *
 * 【核心铁律遵从】：
 * 1. 严禁任何 DOM 悬浮提示弹窗、顶部步骤向导 Banner 或浮动卡片；
 * 2. 纯三维实体建模与直接操控：飞轮按物理效率自动连续运转，鼠标直接拖拽左右冷热源阀门手轮调节 Th 与 Tc；
 * 3. P-V 动态坐标图与四个热力学过程指示面板直接内嵌于铝合金重型底座正前方 (+Z) 斜切仪表盘，上方视野完全通透；
 * 4. 自由光标模式：无需锁定视角，光标手势（grab/grabbing）与手轮光环自然联动。
 */

import * as THREE from 'three';
import { BaseExperiment } from '../../base/BaseExperiment.ts';
import type { ExperimentContext } from '../../../core/types.ts';
import { labPointerNDC } from '../../../controls/LabPointerInput.ts';
import {
  CarnotEngineSolver,
  type CarnotTelemetry,
} from '../../../physics/thermo/carnotCycle.ts';
import { CarnotEngineBenchMesh } from '../../../scene/thermo/CarnotEngineBenchMesh.ts';
import { metadata } from './meta.ts';

export default class ThermoCarnotExperiment extends BaseExperiment {
  public readonly metadata = metadata;

  // 台面近景全览比例，确保冷热源、气缸活塞、压力表、飞轮与底座前方双联仪表板清晰呈现
  public override targetScale = 2.45;
  public override hideCenterEmitter = true;

  public solver: CarnotEngineSolver;
  public bench!: CarnotEngineBenchMesh;

  private isDisposed = false;
  private cachedTelemetry: CarnotTelemetry | null = null;

  // 3D 阀门手轮拖拽交互状态
  private activeValveDrag: 'hot' | 'cold' | null = null;
  private dragPlane = new THREE.Plane();
  private dragIntersection = new THREE.Vector3();
  private dragStartLocal = new THREE.Vector3();
  private dragStartTempC = 0;
  private lastDragDeltaX = 0;

  constructor() {
    super();
    this.solver = new CarnotEngineSolver({
      hotTempC: 80.0,
      coldTempC: 20.0,
      speedMultiplier: 1.0,
    });
  }

  public init(_context: ExperimentContext): void {
    // 安放于全息实验台中央偏前近景工作区 (Y=0.082 贴合台面, Z=1.18 正对操作者)
    this.rootGroup.position.set(0, 0.082, 1.18);

    this.bench = this.track(
      new CarnotEngineBenchMesh({
        hotTempC: this.solver.hotTempC,
        coldTempC: this.solver.coldTempC,
      })
    );
    this.rootGroup.add(this.bench.group);
    this.addDisposable(() => this.bench.dispose());

    // 初始同步一次遥测与 3D 仪表板
    const telem = this.solver.getTelemetry();
    this.cachedTelemetry = telem;
    this.bench.update(0, telem, this.solver.getPVCurves());
  }

  public update(delta: number, _elapsed: number, _context: ExperimentContext): void {
    if (this.isDisposed) return;

    // 1. 自动连续推进卡诺热机循环求解
    this.solver.step(delta);

    // 2. 获取实时热力学遥测状态
    const telem = this.solver.getTelemetry();
    this.cachedTelemetry = telem;

    // 3. 同步更新 3D 曲柄连杆活塞、压力表指针、气体分子冷暖运动、管道热流脉冲与底座 P-V 屏
    if (this.bench) {
      this.bench.update(delta, telem, this.solver.getPVCurves());
    }
  }

  /**
   * 鼠标/触控按下：检测是否按住左侧高温红手轮或右侧低温蓝手轮
   */
  public override onPointerDown(
    event: PointerEvent,
    hit: THREE.Intersection | null,
    context: ExperimentContext
  ): boolean {
    if (!hit || this.isDisposed || !this.bench) return false;

    const valveTarget = this.resolveValveTarget(hit.object);
    if (!valveTarget) return false;

    this.activeValveDrag = valveTarget;
    this.dragStartTempC =
      valveTarget === 'hot' ? this.solver.hotTempC : this.solver.coldTempC;
    this.lastDragDeltaX = 0;
    this.bench.setHoveredValve(valveTarget);

    if (context.camera) {
      this.getWorkPlane(this.dragPlane);
      const mouse = labPointerNDC(event, context.renderer?.domElement);
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(mouse, context.camera);
      if (raycaster.ray.intersectPlane(this.dragPlane, this.dragIntersection)) {
        const localPt = this.rootGroup.worldToLocal(this.dragIntersection.clone());
        this.dragStartLocal.copy(localPt);
      }
    }

    return true;
  }

  /**
   * 鼠标/触控拖拽：实时旋转 3D 阀门手轮并连续调节高温热源 Th 或低温冷源 Tc
   */
  public override onPointerMove(
    event: PointerEvent,
    _hit: THREE.Intersection | null,
    context: ExperimentContext
  ): void {
    if (!this.activeValveDrag || !context.camera || !this.bench) return;

    this.getWorkPlane(this.dragPlane);
    const mouse = labPointerNDC(event, context.renderer?.domElement);
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, context.camera);

    if (!raycaster.ray.intersectPlane(this.dragPlane, this.dragIntersection)) {
      return;
    }

    const currentLocal = this.rootGroup.worldToLocal(this.dragIntersection.clone());
    const deltaX = currentLocal.x - this.dragStartLocal.x;
    const deltaY = currentLocal.y - this.dragStartLocal.y;
    const combinedDelta = deltaX + deltaY * 0.65;

    const stepDelta = combinedDelta - this.lastDragDeltaX;
    this.lastDragDeltaX = combinedDelta;

    if (this.activeValveDrag === 'hot') {
      // 水平拖拽 0.20m 对应调节 100 °C
      const targetHotC = this.dragStartTempC + combinedDelta * 450;
      this.setHotTempC(targetHotC);
      context.setParameter?.('hotTempC', this.solver.hotTempC);
      this.bench.rotateValveVisual('hot', -stepDelta * 18);
    } else if (this.activeValveDrag === 'cold') {
      // 水平拖拽 0.20m 对应调节 40 °C
      const targetColdC = this.dragStartTempC + combinedDelta * 200;
      this.setColdTempC(targetColdC);
      context.setParameter?.('coldTempC', this.solver.coldTempC);
      this.bench.rotateValveVisual('cold', -stepDelta * 18);
    }
  }

  public override onPointerUp(_event: PointerEvent, _context: ExperimentContext): void {
    this.activeValveDrag = null;
  }

  public override onPointerCancel(): void {
    this.activeValveDrag = null;
    this.bench?.setHoveredValve(null);
  }

  /**
   * 光标悬停拾取提示
   */
  public override getHoverTarget(
    raycaster: THREE.Raycaster
  ): { id: string; label: string; cursor?: string } | null {
    if (!this.bench || this.isDisposed) return null;

    const hits = raycaster.intersectObjects(this.rootGroup.children, true);
    for (const hit of hits) {
      const target = this.resolveValveTarget(hit.object);
      if (target === 'hot') {
        this.bench.setHoveredValve('hot');
        return {
          id: 'hot-valve',
          label: `高温热源调节阀 · 按住拖拽调节 Th (当前 ${this.solver.hotTempC.toFixed(1)} °C)`,
          cursor: this.activeValveDrag ? 'grabbing' : 'grab',
        };
      }
      if (target === 'cold') {
        this.bench.setHoveredValve('cold');
        return {
          id: 'cold-valve',
          label: `低温冷源调节阀 · 按住拖拽调节 Tc (当前 ${this.solver.coldTempC.toFixed(1)} °C)`,
          cursor: this.activeValveDrag ? 'grabbing' : 'grab',
        };
      }
    }

    if (!this.activeValveDrag) {
      this.bench.setHoveredValve(null);
    }
    return null;
  }

  private resolveValveTarget(obj: THREE.Object3D | null): 'hot' | 'cold' | null {
    let curr: THREE.Object3D | null = obj;
    while (curr && curr !== this.rootGroup) {
      if (
        curr === this.bench.hotValveHandleGroup ||
        curr.name === 'HotValveHandle' ||
        curr.name === 'HotValveCollider'
      ) {
        return 'hot';
      }
      if (
        curr === this.bench.coldValveHandleGroup ||
        curr.name === 'ColdValveHandle' ||
        curr.name === 'ColdValveCollider'
      ) {
        return 'cold';
      }
      curr = curr.parent;
    }
    return null;
  }

  private getWorkPlane(targetPlane: THREE.Plane): THREE.Plane {
    const normal = new THREE.Vector3(0, 0, 1)
      .applyQuaternion(this.rootGroup.quaternion)
      .normalize();
    const point = this.rootGroup.localToWorld(new THREE.Vector3(0, 0.34, 0));
    return targetPlane.setFromNormalAndCoplanarPoint(normal, point);
  }

  // ================= 外部与抽屉参数控制接口 =================
  public setHotTempC(tempC: number): void {
    this.solver.setHotTempC(tempC);
    const telem = this.solver.getTelemetry();
    this.cachedTelemetry = telem;
  }

  public setColdTempC(tempC: number): void {
    this.solver.setColdTempC(tempC);
    const telem = this.solver.getTelemetry();
    this.cachedTelemetry = telem;
  }

  public setSpeedMultiplier(mult: number): void {
    this.solver.setSpeedMultiplier(mult);
  }

  public resetExperiment(): void {
    this.solver.reset();
    const telem = this.solver.getTelemetry();
    this.cachedTelemetry = telem;
    this.bench?.update(0, telem, this.solver.getPVCurves());
  }

  public getTelemetryData(): CarnotTelemetry {
    if (!this.cachedTelemetry) {
      this.cachedTelemetry = this.solver.getTelemetry();
    }
    return this.cachedTelemetry;
  }

  public getPVCurves() {
    return this.solver.getPVCurves();
  }

  public override onParameterChange(
    id: string,
    value: any,
    _context: ExperimentContext
  ): void {
    if (id === 'hotTempC') {
      this.setHotTempC(Number(value));
    } else if (id === 'coldTempC') {
      this.setColdTempC(Number(value));
    } else if (id === 'speedMultiplier') {
      this.setSpeedMultiplier(Number(value));
    } else if (id === 'resetExperiment') {
      this.resetExperiment();
    }
  }

  public override dispose(context: ExperimentContext): void {
    this.isDisposed = true;
    this.activeValveDrag = null;
    super.dispose(context);
  }
}
