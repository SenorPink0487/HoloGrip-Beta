/**
 * 焦耳热功当量与做功等效实验 (Joule's Mechanical & Electrical Equivalent of Heat)
 * 热学物理交互式 3D 实验主控模块
 *
 * 【核心设计铁律遵从】：
 * 1. 严格零 DOM 弹窗/浮动向导：场景内绝无任何 DOM 悬浮提示、Banner 或浮动按钮卡片；
 * 2. 纯三维实体直接交互：
 *    - 光标直接抓握左右双侧开槽黄铜砝码组上下提拉或松手释放下落；
 *    - 光标抓握顶部手摇曲柄旋转绞盘提升重锤或手动搅拌叶轮生热；
 *    - 点击顶部棘轮离合拨杆释放重锤重力下落；
 *    - 点击量热器顶盖左前侧定子阻流片锁销，对比“啮合强湍流剪切 vs 抽离空转涡流”；
 *    - 点击右前侧 3D 刀闸开关通断康铜螺旋电热丝，拖拽 48 齿滚花旋钮连续调节电流 I；
 *    - 点击左前侧四通旋塞阀切换纯水、煤油、甘油与水银四种工作介质。
 */

import * as THREE from 'three';
import { BaseExperiment } from '../../base/BaseExperiment.ts';
import type { ExperimentContext } from '../../../core/types.ts';
import { JouleApparatusMesh } from '../../../scene/thermo/JouleApparatusMesh.ts';
import {
  JouleDynamicsSolver,
  type JouleFluidType,
  type JouleInsulationMode,
  type JouleOperationMode,
  type JouleTelemetry,
} from '../../../physics/thermo/jouleDynamics.ts';
import { metadata } from './meta.ts';

type ActiveInteractionType =
  | 'none'
  | 'weight_drag'
  | 'crank_drag'
  | 'rheostat_drag'
  | 'clutch_tap'
  | 'baffle_tap'
  | 'switch_tap'
  | 'fluid_tap';

export default class ThermoJouleExperiment extends BaseExperiment {
  public readonly metadata = metadata;

  // 近景黄金比例缩放，使双塔滑轮、剖面量热器、温度计与深海蓝宝石遥测屏尽收眼底
  public override targetScale = 2.15;
  public override hideCenterEmitter = true;

  public apparatusMesh!: JouleApparatusMesh;
  public solver!: JouleDynamicsSolver;
  private isDisposed = false;

  // 指针与触控交互状态机
  private activeInteraction: ActiveInteractionType = 'none';
  private downClientX = 0;
  private downClientY = 0;
  private maxDragDistPx = 0;
  private dragStartHeightM = 1.2;
  private dragStartCurrentAmp = 3.5;
  private lastPointerX = 0;
  private lastDragTimestamp = 0;
  private dragPlane = new THREE.Plane();
  private dragPlaneHit = new THREE.Vector3();
  private dragStartLocalPos = new THREE.Vector3();

  public init(_context: ExperimentContext): void {
    // 根节点定位至实验台正前方近景工作位，端正朝向 +Z 操作者视线
    this.rootGroup.position.set(0, 0.04, 1.08);

    // 1. 初始化焦耳热力学与机械/电热动力学求解器
    this.solver = new JouleDynamicsSolver();

    // 2. 构建高精细度三维焦耳实验仪装配体
    this.apparatusMesh = new JouleApparatusMesh();
    this.rootGroup.add(this.apparatusMesh.group);
    this.addDisposable(() => this.apparatusMesh.dispose());

    // 初始同步一次视觉状态
    this.apparatusMesh.updateVisualState(this.solver.getTelemetry(), 0.016);
  }

  /**
   * 物理求解与三维视觉主更新循环
   */
  public update(delta: number, _elapsed: number, _context: ExperimentContext): void {
    if (this.isDisposed) return;

    this.solver.update(delta);
    const telemetry = this.solver.getTelemetry();
    this.apparatusMesh.updateVisualState(telemetry, delta);
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

    const target = this.classifyHitObject(hit.object);
    if (target === 'none') return false;

    this.activeInteraction = target;
    this.downClientX = event.clientX;
    this.downClientY = event.clientY;
    this.lastPointerX = event.clientX;
    this.maxDragDistPx = 0;
    this.lastDragTimestamp = typeof performance !== 'undefined' ? performance.now() : Date.now();

    if (target === 'weight_drag') {
      this.dragStartHeightM = this.solver.weightHeightM;
      this.apparatusMesh.setWeightHighlight(true);

      const worldPos = new THREE.Vector3();
      hit.object.getWorldPosition(worldPos);
      this.dragPlane.setFromNormalAndCoplanarPoint(new THREE.Vector3(0, 0, 1), worldPos);
      this.dragStartLocalPos.copy(hit.point);
      this.rootGroup.worldToLocal(this.dragStartLocalPos);
      if (typeof document !== 'undefined' && document.body) {
        document.body.style.cursor = 'grabbing';
      }
      return true;
    }

    if (target === 'crank_drag') {
      if (typeof document !== 'undefined' && document.body) {
        document.body.style.cursor = 'grabbing';
      }
      return true;
    }

    if (target === 'rheostat_drag') {
      this.dragStartCurrentAmp = this.solver.currentAmp;
      if (typeof document !== 'undefined' && document.body) {
        document.body.style.cursor = 'ew-resize';
      }
      return true;
    }

    // 其余为点击切换型控件 (clutch_tap, baffle_tap, switch_tap, fluid_tap)
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
    if (this.activeInteraction === 'none' || this.isDisposed) return;

    const dist = Math.hypot(event.clientX - this.downClientX, event.clientY - this.downClientY);
    if (dist > this.maxDragDistPx) {
      this.maxDragDistPx = dist;
    }

    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const dt = Math.max(0.001, (now - this.lastDragTimestamp) / 1000);
    this.lastDragTimestamp = now;

    if (this.activeInteraction === 'weight_drag') {
      const camera = context?.camera;
      if (camera) {
        const rect = context.renderer?.domElement?.getBoundingClientRect();
        const width = rect?.width || (typeof window !== 'undefined' ? window.innerWidth : 1920);
        const height = rect?.height || (typeof window !== 'undefined' ? window.innerHeight : 1080);
        const ndc = new THREE.Vector2(
          ((event.clientX - (rect?.left ?? 0)) / width) * 2 - 1,
          -((event.clientY - (rect?.top ?? 0)) / height) * 2 + 1
        );

        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(ndc, camera);
        if (raycaster.ray.intersectPlane(this.dragPlane, this.dragPlaneHit)) {
          const localCur = this.dragPlaneHit.clone();
          this.rootGroup.worldToLocal(localCur);
          const dy = localCur.y - this.dragStartLocalPos.y;
          const dhMeters =
            (dy / Math.max(0.01, this.apparatusMesh.weightTravelM)) *
            JouleDynamicsSolver.MAX_HEIGHT_M;
          const nextH = Math.max(
            0.0,
            Math.min(JouleDynamicsSolver.MAX_HEIGHT_M, this.dragStartHeightM + dhMeters)
          );
          this.solver.updateManualWeightDrag(nextH, dt);
          context?.setParameter?.('weightHeightM', Number(nextH.toFixed(2)));
          return;
        }
      }

      // 兼容无相机环境下的屏幕坐标回退计算
      const dyPx = this.downClientY - event.clientY;
      const nextH = Math.max(
        0.0,
        Math.min(JouleDynamicsSolver.MAX_HEIGHT_M, this.dragStartHeightM + dyPx * 0.006)
      );
      this.solver.updateManualWeightDrag(nextH, dt);
      context?.setParameter?.('weightHeightM', Number(nextH.toFixed(2)));
      return;
    }

    if (this.activeInteraction === 'crank_drag') {
      const dxPx = event.clientX - this.lastPointerX;
      this.lastPointerX = event.clientX;
      if (Math.abs(dxPx) > 0.2) {
        this.solver.updateManualCrank(dxPx * 0.045, dt);
        context?.setParameter?.('weightHeightM', Number(this.solver.weightHeightM.toFixed(2)));
      }
      return;
    }

    if (this.activeInteraction === 'rheostat_drag') {
      const dxTotal = event.clientX - this.downClientX;
      const dyTotal = this.downClientY - event.clientY;
      const deltaAmp = (dxTotal + dyTotal * 0.5) * 0.025;
      const nextAmp = Math.max(0.5, Math.min(6.0, this.dragStartCurrentAmp + deltaAmp));
      this.solver.currentAmp = Number(nextAmp.toFixed(1));
      context?.setParameter?.('currentAmp', this.solver.currentAmp);
      return;
    }
  }

  /**
   * 鼠标/触控指针释放 (Pointer Up)
   */
  public override onPointerUp(_event: PointerEvent, context: ExperimentContext): void {
    if (this.activeInteraction === 'none' || this.isDisposed) return;

    const currentAction = this.activeInteraction;
    const wasTap = this.maxDragDistPx < 14;
    this.activeInteraction = 'none';

    if (typeof document !== 'undefined' && document.body) {
      document.body.style.cursor = 'default';
    }

    if (currentAction === 'weight_drag') {
      this.apparatusMesh.setWeightHighlight(false);
      if (wasTap && !this.solver.isManualDraggingWeight) {
        this.solver.releaseClutchDrop();
      } else {
        this.solver.endManualWeightDrag(true);
      }
      return;
    }

    if (currentAction === 'crank_drag') {
      this.solver.endManualCrank();
      if (wasTap) {
        this.solver.releaseClutchDrop();
      }
      return;
    }

    if (currentAction === 'rheostat_drag') {
      return;
    }

    // 轻触型 3D 机械控件：仅在手指抖动阈值内触发切换
    if (wasTap) {
      if (currentAction === 'clutch_tap') {
        this.solver.releaseClutchDrop();
      } else if (currentAction === 'baffle_tap') {
        const engaged = this.solver.toggleBaffles();
        context?.setParameter?.('bafflesEngaged', engaged ? 'engaged' : 'disengaged');
      } else if (currentAction === 'switch_tap') {
        const active = this.solver.toggleHeater();
        context?.setParameter?.('heaterActive', active ? 'on' : 'off');
      } else if (currentAction === 'fluid_tap') {
        const nextFluid = this.solver.cycleFluidType();
        context?.setParameter?.('fluidType', nextFluid);
      }
    }
  }

  /**
   * 系统中断/触控取消保护 (Pointer Cancel)：释放拖拽且绝不误触发开关
   */
  public override onPointerCancel(_event: PointerEvent, _context: ExperimentContext): void {
    this.activeInteraction = 'none';
    this.maxDragDistPx = Infinity;
    this.apparatusMesh?.setWeightHighlight(false);
    this.solver?.endManualWeightDrag(false);
    this.solver?.endManualCrank();
    if (typeof document !== 'undefined' && document.body) {
      document.body.style.cursor = 'default';
    }
  }

  /**
   * 3D 物理部件悬停语义光标与提示
   */
  public override getHoverTarget(
    raycaster: THREE.Raycaster
  ): { id: string; label: string; cursor?: string } | null {
    if (this.isDisposed || this.activeInteraction !== 'none') return null;

    const hits = raycaster.intersectObjects(this.rootGroup.children, true);
    if (hits.length === 0) return null;

    for (const hit of hits) {
      const kind = this.classifyHitObject(hit.object);
      if (kind === 'weight_drag') {
        return {
          id: 'joule-weights',
          label: '配重黄铜砝码组 2m (按住上下拖拽升降，或单击释放下落做功 W=2mgh)',
          cursor: 'grab',
        };
      }
      if (kind === 'crank_drag') {
        return {
          id: 'joule-crank',
          label: '顶部手摇绞盘曲柄 (左右拖拽手动摇动叶轮搅水做功 / 提升重锤)',
          cursor: 'grab',
        };
      }
      if (kind === 'clutch_tap') {
        return {
          id: 'joule-clutch',
          label: '棘轮离合器释放拨杆 (单击松开锁扣，释放双侧重锤下落驱动叶轮)',
          cursor: 'pointer',
        };
      }
      if (kind === 'baffle_tap') {
        return {
          id: 'joule-baffle',
          label: '定子阻流隔板锁销 (单击切换阻流片啮合/抽离，对比强湍流剪切与旋涡空转)',
          cursor: 'pointer',
        };
      }
      if (kind === 'switch_tap') {
        return {
          id: 'joule-elec-switch',
          label: '焦耳电热回路刀闸开关 (单击闭合/断开康铜螺旋电热丝 W=I²Rt)',
          cursor: 'pointer',
        };
      }
      if (kind === 'rheostat_drag') {
        return {
          id: 'joule-rheostat',
          label: '48齿滚花变阻器旋钮 (左右拖拽连续调节加热电流 I = 0.5A ~ 6.0A)',
          cursor: 'ew-resize',
        };
      }
      if (kind === 'fluid_tap') {
        return {
          id: 'joule-fluid-valve',
          label: '工作液体四通旋塞阀 (单击依次切换 纯水 / 煤油 / 甘油 / 水银)',
          cursor: 'pointer',
        };
      }
    }

    return {
      id: 'joule-calorimeter',
      label: '焦耳双层真空绝热量热器 (J = 4.186 J/cal · ΔU = W_mech + W_elec + Q)',
      cursor: 'default',
    };
  }

  /**
   * 响应参数抽屉属性变更
   */
  public override onParameterChange(id: string, value: any, _context: ExperimentContext): void {
    if (this.isDisposed || !this.solver) return;

    if (id === 'operationMode') {
      this.solver.setOperationMode(value as JouleOperationMode);
    } else if (id === 'fluidType') {
      this.solver.setFluidType(value as JouleFluidType);
    } else if (id === 'weightMassKg') {
      this.solver.weightMassKg = Math.max(1.0, Math.min(10.0, Number(value)));
    } else if (id === 'weightHeightM') {
      this.solver.weightHeightM = Math.max(
        0.0,
        Math.min(JouleDynamicsSolver.MAX_HEIGHT_M, Number(value))
      );
    } else if (id === 'bafflesEngaged') {
      this.solver.bafflesEngaged = value === 'engaged' || value === true;
    } else if (id === 'heaterActive') {
      this.solver.heaterActive = value === 'on' || value === true;
    } else if (id === 'currentAmp') {
      this.solver.currentAmp = Math.max(0.5, Math.min(6.0, Number(value)));
    } else if (id === 'insulationMode') {
      this.solver.insulationMode = value as JouleInsulationMode;
    } else if (id === 'releaseDrop') {
      this.solver.releaseClutchDrop();
    } else if (id === 'resetExperiment') {
      this.solver.reset();
    }
  }

  /**
   * 导出焦耳热功当量实时遥测快照，供 VisionOS 空间悬浮视窗状态卡读取
   */
  public getJouleTelemetry(): JouleTelemetry {
    return this.solver.getTelemetry();
  }

  public setWeightMass(massKg: number): void {
    if (!this.solver) return;
    this.solver.weightMassKg = Math.max(1.0, Math.min(10.0, Number(massKg)));
  }

  public setCurrentAmp(amp: number): void {
    if (!this.solver) return;
    this.solver.currentAmp = Math.max(0.5, Math.min(6.0, Number(amp)));
  }

  public setOperationMode(mode: JouleOperationMode): void {
    this.solver?.setOperationMode(mode);
  }

  public setFluidType(fluid: JouleFluidType): void {
    this.solver?.setFluidType(fluid);
  }

  public releaseDrop(): void {
    this.solver?.releaseClutchDrop();
  }

  public toggleHeater(): boolean {
    return this.solver ? this.solver.toggleHeater() : false;
  }

  public toggleBaffles(): boolean {
    return this.solver ? this.solver.toggleBaffles() : true;
  }

  public resetExperiment(): void {
    this.solver?.reset();
  }

  /**
   * 识别被射线命中的 3D 构件所属交互类型
   */
  private classifyHitObject(obj: THREE.Object3D | null): ActiveInteractionType {
    let curr: THREE.Object3D | null = obj;
    while (curr && curr !== this.rootGroup) {
      if (
        curr === this.apparatusMesh.leftWeightHitBox ||
        curr === this.apparatusMesh.rightWeightHitBox ||
        curr === this.apparatusMesh.leftWeightGroup ||
        curr === this.apparatusMesh.rightWeightGroup
      ) {
        return 'weight_drag';
      }
      if (
        curr === this.apparatusMesh.crankHitBox ||
        curr === this.apparatusMesh.crankRotorGroup
      ) {
        return 'crank_drag';
      }
      if (
        curr === this.apparatusMesh.clutchLeverHitBox ||
        curr === this.apparatusMesh.clutchLeverGroup
      ) {
        return 'clutch_tap';
      }
      if (curr === this.apparatusMesh.baffleToggleHitBox) {
        return 'baffle_tap';
      }
      if (
        curr === this.apparatusMesh.elecSwitchHitBox ||
        curr === this.apparatusMesh.knifeSwitchBladeGroup
      ) {
        return 'switch_tap';
      }
      if (
        curr === this.apparatusMesh.rheostatHitBox ||
        curr === this.apparatusMesh.rheostatKnobGroup
      ) {
        return 'rheostat_drag';
      }
      if (
        curr === this.apparatusMesh.fluidValveHitBox ||
        curr === this.apparatusMesh.fluidValveHandleGroup
      ) {
        return 'fluid_tap';
      }
      curr = curr.parent;
    }
    return 'none';
  }

  /**
   * 彻底销毁释放 GPU 资源
   */
  public override dispose(context: ExperimentContext): void {
    this.isDisposed = true;
    this.activeInteraction = 'none';
    if (typeof document !== 'undefined' && document.body) {
      document.body.style.cursor = 'default';
    }
    super.dispose(context);
  }
}
