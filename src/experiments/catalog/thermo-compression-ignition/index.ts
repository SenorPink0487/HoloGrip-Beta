/**
 * 气体绝热压缩点火实验 (空气压缩引火仪)
 * 经典热学交互式 3D 实验主控模块
 *
 * 【核心设计铁律遵从】：
 * 1. 严格零 DOM 弹窗/浮动向导：场景内无任何 DOM 提示、横幅或卡片，纯粹三维台面视界；
 * 2. 纯三维物理与手势操控：光标直接抓握 T 型加力手柄向下迅速猛压，做功转化为内能；
 * 3. 真实热力学绝热与散热动力学：快速猛压剧烈爆燃 vs 缓慢等温下压不燃烧；
 * 4. 高保真三维模型：依据实物图片严密复刻加重底座、厚壁耐压石英气缸、刻度线、滚花压盖、镜面活塞杆、O型密封圈与白絮硝化棉。
 */

import * as THREE from 'three';
import { BaseExperiment } from '../../base/BaseExperiment.ts';
import type { ExperimentContext } from '../../../core/types.ts';
import { FirePistonMesh } from '../../../scene/thermo/FirePistonMesh.ts';
import {
  CompressionIgnitionDynamicsSolver,
  type IgnitionMode,
} from '../../../physics/thermo/compressionIgnitionDynamics.ts';
import { metadata } from './meta.ts';

export default class ThermoCompressionIgnitionExperiment extends BaseExperiment {
  public readonly metadata = metadata;

  // 近景特写，确保操作者清晰看清气缸内部棉絮、O型圈行程、刻度标线与爆燃火花
  public override targetScale = 2.45;
  public override hideCenterEmitter = true;

  // 3D 装置与物理求解器
  private pistonMesh!: FirePistonMesh;
  private solver!: CompressionIgnitionDynamicsSolver;
  private isDisposed = false;

  // 拖拽交互状态
  private isDragging = false;
  private dragPlane = new THREE.Plane();
  private dragPlaneIntersection = new THREE.Vector3();
  private dragStartPointerPosLocal = new THREE.Vector3();
  private dragStartStroke = 0;
  private lastDragTimestamp = 0;

  public init(_context: ExperimentContext): void {
    // 根节点定位至台前近景工作台视界 (Y=0.04, Z=1.15)，端正正对用户视线 (+Z)
    this.rootGroup.position.set(0, 0.04, 1.15);

    // 1. 实例化热力学动力学求解器
    this.solver = new CompressionIgnitionDynamicsSolver();

    // 2. 实例化 3D 引火仪高精装配体
    this.pistonMesh = new FirePistonMesh();
    this.rootGroup.add(this.pistonMesh.group);
    this.addDisposable(() => this.pistonMesh.dispose());
  }

  /**
   * 物理与视觉主更新循环
   */
  public update(delta: number, _elapsed: number, _context: ExperimentContext): void {
    if (this.isDisposed) return;

    // 1. 动力学方程步进积分
    this.solver.update(delta);

    // 2. 刷新 3D 视觉构件位置、棉絮状态与爆燃火花光效
    const telemetry = this.solver.getTelemetry();
    this.pistonMesh.updateVisualState(telemetry, delta);
  }

  /**
   * 鼠标/触控指针按下 (Pointer Down)
   */
  public override onPointerDown(
    event: PointerEvent,
    hit: THREE.Intersection | null,
    _context: ExperimentContext
  ): boolean | void {
    if (!hit || this.isDisposed) return false;

    // 检测是否点击在 T 型加力手柄、推杆或其活动后代节点上
    let obj: THREE.Object3D | null = hit.object;
    let isHitPiston = false;

    while (obj && obj !== this.rootGroup) {
      if (
        obj === this.pistonMesh.handleHitBox ||
        obj === this.pistonMesh.pistonMovingGroup ||
        this.isDescendantOf(obj, this.pistonMesh.pistonMovingGroup)
      ) {
        isHitPiston = true;
        break;
      }
      obj = obj.parent;
    }

    if (isHitPiston) {
      this.startDragging(event, hit);
      return true;
    }

    return false;
  }

  /**
   * 启动活塞向下拖拽
   */
  private startDragging(event: PointerEvent, hit: THREE.Intersection): void {
    this.isDragging = true;
    this.dragStartStroke = this.solver.stroke;
    this.lastDragTimestamp = performance.now();

    // 构建垂直正对相机的拖拽平面 (法线朝向 +Z)
    const worldHandlePos = new THREE.Vector3();
    this.pistonMesh.handleHitBox.getWorldPosition(worldHandlePos);
    this.dragPlane.setFromNormalAndCoplanarPoint(new THREE.Vector3(0, 0, 1), worldHandlePos);

    // 计算鼠标光标投射在拖拽面上的初始局部位置
    this.dragStartPointerPosLocal.copy(hit.point);
    this.rootGroup.worldToLocal(this.dragStartPointerPosLocal);

    this.solver.isDragging = true;
    document.body.style.cursor = 'grabbing';
  }

  /**
   * 鼠标指针滑动 (Pointer Move)
   */
  public override onPointerMove(
    event: PointerEvent,
    _hit: THREE.Intersection | null,
    _context: ExperimentContext
  ): void {
    if (!this.isDragging || this.isDisposed) return;

    // 获取当前相机光线投射至拖拽平面的交点
    const camera = (this as any).contextCamera || (window as any).__THREE_CAMERA__;
    if (!camera) {
      // 备用：基于屏幕像素位移粗略换算
      const now = performance.now();
      const dt = Math.max(0.001, (now - this.lastDragTimestamp) / 1000);
      this.lastDragTimestamp = now;

      const screenDeltaY = event.movementY || 0;
      const strokeDelta = screenDeltaY * 0.0055;
      this.solver.updateManualDrag(this.solver.stroke + strokeDelta, dt);
      return;
    }

    const mouseNDC = new THREE.Vector2(
      (event.clientX / window.innerWidth) * 2 - 1,
      -(event.clientY / window.innerHeight) * 2 + 1
    );

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouseNDC, camera);

    if (raycaster.ray.intersectPlane(this.dragPlane, this.dragPlaneIntersection)) {
      const now = performance.now();
      const dt = Math.max(0.001, (now - this.lastDragTimestamp) / 1000);
      this.lastDragTimestamp = now;

      // 转换为 rootGroup 局部坐标
      const localCurrent = this.dragPlaneIntersection.clone();
      this.rootGroup.worldToLocal(localCurrent);

      // 计算 Y 轴局部相对位移 (向下拖拽 dy < 0 对应 stroke 增大)
      const dy = localCurrent.y - this.dragStartPointerPosLocal.y;
      const travelM = this.pistonMesh.strokeTravelM;
      const strokeChange = -dy / travelM;

      const newStroke = Math.max(0.0, Math.min(1.0, this.dragStartStroke + strokeChange));
      this.solver.updateManualDrag(newStroke, dt);
    }
  }

  /**
   * 鼠标指针释放 (Pointer Up)
   */
  public override onPointerUp(_event: PointerEvent, _context: ExperimentContext): void {
    if (this.isDragging) {
      this.isDragging = false;
      this.solver.endManualDrag();
      document.body.style.cursor = 'default';
    }
  }

  /**
   * 鼠标指针悬停提示 (3D 语义光标悬停)
   */
  public override getHoverTarget(
    raycaster: THREE.Raycaster
  ): { id: string; label: string; cursor?: string } | null {
    if (this.isDisposed || this.isDragging) return null;

    const hits = raycaster.intersectObjects(this.rootGroup.children, true);
    if (hits.length === 0) return null;

    let obj: THREE.Object3D | null = hits[0].object;
    while (obj && obj !== this.rootGroup) {
      if (
        obj === this.pistonMesh.handleHitBox ||
        obj === this.pistonMesh.pistonMovingGroup ||
        this.isDescendantOf(obj, this.pistonMesh.pistonMovingGroup)
      ) {
        return {
          id: 'piston-handle',
          label: 'T型加力手柄 (鼠标按住迅速向下猛拽，做功点燃硝化棉)',
          cursor: 'grab',
        };
      }
      if (obj.name === 'FirePistonMesh' || obj === this.pistonMesh.staticGroup) {
        return {
          id: 'fire-piston-cylinder',
          label: '耐压石英气缸 (硝化棉燃点 165℃ · γ=1.40)',
        };
      }
      obj = obj.parent;
    }

    return null;
  }

  /**
   * 响应侧边参数抽屉属性调节
   */
  public override onParameterChange(id: string, value: any, _context: ExperimentContext): void {
    if (this.isDisposed) return;

    if (id === 'pistonStroke') {
      this.solver.stroke = Number(value);
    } else if (id === 'operationMode') {
      this.solver.setMode(value as IgnitionMode);
    } else if (id === 'reboundEnabled') {
      this.solver.reboundEnabled = value === 'enabled';
    } else if (id === 'cottonState') {
      if (value === 'ready') {
        this.solver.reloadCotton();
      } else {
        this.solver.cottonState = 'burnt';
      }
    } else if (id === 'resetExperiment') {
      this.solver.reset();
    }
  }

  /**
   * 判断节点后代关系辅助函数
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
   * 彻底销毁释放 GPU 资源
   */
  public override dispose(context: ExperimentContext): void {
    this.isDisposed = true;
    this.isDragging = false;
    document.body.style.cursor = 'default';
    super.dispose(context);
  }
}
