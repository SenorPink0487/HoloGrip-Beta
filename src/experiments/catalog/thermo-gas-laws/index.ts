/**
 * 气体实验三定律 (Three Experimental Gas Laws: Boyle's, Charles's & Gay-Lussac's Laws)
 * 交互式 3D 热力学实验主控模块
 *
 * 【核心设计铁律遵从】：
 * 1. 纯 3D 台面一体式呈现：选择实验后自动关闭悬浮窗，严禁任何 DOM 悬浮提示弹窗、顶部步骤向导 Banner 或浮动把手；
 * 2. 纯三维实体直接操控（纯手动 3D 拖拽操控，不设自动扫描）：
 *    - 玻意耳定律（等温过程，锁定 T₀ = 300 K）：活塞锁销松开，上下手动拖拽左侧气缸顶部 3D T 形活塞手柄改变体积 V，
 *      实时观测波登压力表指针、缸内气体分子数密度与右侧大屏 p-V 等温双曲线及 pV = C₁ 不变量；
 *    - 查理定律（等容过程，黄铜插销物理锁死 V₀ = 35 mL）：拖拽底座正前方黄铜滚花温控旋钮改变温度 T，
 *      实时观测气体分子热运动速率、水浴冷暖光效与右侧大屏 p-T 正比例直线（含 0 K 绝对零度外推线）及 p/T = C₂ 不变量；
 *    - 盖-吕萨克定律（等压过程，维持 p₀ = 101.3 kPa）：活塞锁销松开，拖拽底座黄铜温控旋钮改变温度 T，
 *      气体受热膨胀或遇冷收缩驱动 3D 活塞实时升降，右侧大屏同步绘制 V-T 正比例外推直线及 V/T = C₃ 不变量；
 * 3. 模式切换：支持点击右侧 3D 终端底部三枚实体按键（「玻意耳 · 等温」「查理 · 等容」「盖-吕萨克 · 等压」）
 *    或直接点击气缸上横梁的「黄铜定容锁止插销」切换定律模式。
 */

import * as THREE from 'three';
import { BaseExperiment } from '../../base/BaseExperiment.ts';
import type { ExperimentContext } from '../../../core/types.ts';
import { labPointerNDC } from '../../../controls/LabPointerInput.ts';
import {
  GasLawsSolver,
  type GasLawMode,
  type GasLawsTelemetry,
} from '../../../physics/thermo/gasLawsSolver.ts';
import {
  GasLawsBenchMesh,
  type GasLawsInteractRole,
} from '../../../scene/thermo/GasLawsBenchMesh.ts';
import { metadata } from './meta.ts';

export default class ThermoGasLawsExperiment extends BaseExperiment {
  public readonly metadata = metadata;

  // 近景台面全览比例，使左侧恒温夹套气缸与右侧三维数据采集终端居中端正呈现
  public override targetScale = 2.12;
  public override hideCenterEmitter = true;

  public solver: GasLawsSolver;
  public bench!: GasLawsBenchMesh;

  private isDisposed = false;
  private cachedTelemetry: GasLawsTelemetry | null = null;

  // 3D 手动拖拽状态（支持活塞手柄垂直拖拽与底座温控旋钮拖拽）
  private activeDragRole: 'drag-piston-handle' | 'drag-temp-knob' | null = null;
  private dragPlane = new THREE.Plane();
  private dragIntersection = new THREE.Vector3();
  private dragStartLocal = new THREE.Vector3();
  private dragStartClientX = 0;
  private dragStartClientY = 0;
  private dragStartNorm = 0;
  private internalRaycaster = new THREE.Raycaster();

  constructor() {
    super();
    this.solver = new GasLawsSolver({ mode: 'boyle' });
  }

  public init(_context: ExperimentContext): void {
    // 安放于全息实验台中央偏前近景工作区 (Y=0.082 贴合台面, Z=1.18 正对操作者视线)
    this.rootGroup.position.set(0, 0.082, 1.18);

    this.bench = this.track(new GasLawsBenchMesh());
    this.rootGroup.add(this.bench.group);
    this.addDisposable(() => this.bench.dispose());

    const telem = this.solver.getTelemetry();
    this.cachedTelemetry = telem;
    this.bench.update(0, telem);
  }

  public update(delta: number, _elapsed: number, _context: ExperimentContext): void {
    if (this.isDisposed) return;

    this.solver.step(delta);
    const telem = this.solver.getTelemetry();
    this.cachedTelemetry = telem;

    if (this.bench) {
      this.bench.update(delta, telem);
    }
  }

  /**
   * 鼠标/触控按下：
   * - 点击右侧 3D 终端三枚模式实体按键或气缸黄铜锁止销：切换定律模式；
   * - 按住 T 形活塞手柄（等温模式下）：启动活塞垂直拖拽改变体积 V；
   * - 按住底座黄铜温控旋钮（等容/等压模式下）：启动温控旋钮拖拽改变温度 T。
   */
  public override onPointerDown(
    event: PointerEvent,
    hit: THREE.Intersection | null,
    context: ExperimentContext
  ): boolean {
    if (!hit || this.isDisposed || !this.bench) return false;

    const role = this.resolveInteractRole(hit.object);
    if (!role) return false;

    if (role === 'mode-boyle') {
      this.solver.setMode('boyle');
      context.setParameter?.('mode', 'boyle');
      this.syncImmediate();
      return true;
    }

    if (role === 'mode-charles') {
      this.solver.setMode('charles');
      context.setParameter?.('mode', 'charles');
      this.syncImmediate();
      return true;
    }

    if (role === 'mode-gay-lussac') {
      this.solver.setMode('gay-lussac');
      context.setParameter?.('mode', 'gay-lussac');
      this.syncImmediate();
      return true;
    }

    if (role === 'toggle-lock-pin') {
      const nextMode = this.solver.togglePistonLockPin();
      context.setParameter?.('mode', nextMode);
      this.syncImmediate();
      return true;
    }

    if (role === 'drag-piston-handle') {
      // 仅在玻意耳定律（等温过程）下允许直接手推拉活塞改变体积 V
      if (this.solver.mode !== 'boyle') {
        return false;
      }
      this.activeDragRole = 'drag-piston-handle';
      const telem = this.solver.getTelemetry();
      this.dragStartNorm = telem.pistonNormalized;
      this.dragStartClientX = event.clientX ?? 0;
      this.dragStartClientY = event.clientY ?? 0;
      this.captureStartLocalPoint(event, context);
      return true;
    }

    if (role === 'drag-temp-knob') {
      // 仅在查理定律（等容）与盖-吕萨克定律（等压）下允许拖拽底座温控旋钮改变温度 T
      if (this.solver.mode === 'boyle') {
        return false;
      }
      this.activeDragRole = 'drag-temp-knob';
      const telem = this.solver.getTelemetry();
      this.dragStartNorm = telem.tempNormalized;
      this.dragStartClientX = event.clientX ?? 0;
      this.dragStartClientY = event.clientY ?? 0;
      this.captureStartLocalPoint(event, context);
      return true;
    }

    return false;
  }

  /**
   * 鼠标/触控拖拽：
   * - 拖拽活塞 T 形手柄：上下平移实时映射为气体体积 V ∈ [18, 60] mL；
   * - 拖拽底座黄铜温控旋钮：左右/上下滑动实时映射为热力学温度 T。
   */
  public override onPointerMove(
    event: PointerEvent,
    _hit: THREE.Intersection | null,
    context: ExperimentContext
  ): void {
    if (!this.activeDragRole || this.isDisposed || !this.bench) return;

    let deltaNorm = 0;
    const has3DPlane = this.computeLocalDragDelta(event, context);

    if (this.activeDragRole === 'drag-piston-handle') {
      if (has3DPlane) {
        const fullTravel = this.bench.pistonMaxHeightY - this.bench.pistonMinHeightY;
        deltaNorm = (this.dragIntersection.y - this.dragStartLocal.y) / Math.max(0.04, fullTravel);
      } else {
        const dyPixels = (this.dragStartClientY - (event.clientY ?? 0));
        deltaNorm = dyPixels / 180;
      }

      const targetNorm = Math.max(0, Math.min(1, this.dragStartNorm + deltaNorm));
      if (this.solver.setPistonNormalized(targetNorm)) {
        context.setParameter?.('volumeML', this.solver.volumeML);
        this.syncImmediate();
      }
      return;
    }

    if (this.activeDragRole === 'drag-temp-knob') {
      if (has3DPlane) {
        const dx = this.dragIntersection.x - this.dragStartLocal.x;
        const dy = this.dragIntersection.y - this.dragStartLocal.y;
        deltaNorm = (dx + dy * 0.8) / 0.14;
      } else {
        const dxPixels = (event.clientX ?? 0) - this.dragStartClientX;
        const dyPixels = this.dragStartClientY - (event.clientY ?? 0);
        deltaNorm = (dxPixels + dyPixels * 0.6) / 180;
      }

      const targetNorm = Math.max(0, Math.min(1, this.dragStartNorm + deltaNorm));
      if (this.solver.setTemperatureNormalized(targetNorm)) {
        context.setParameter?.('temperatureK', this.solver.temperatureK);
        this.syncImmediate();
      }
    }
  }

  public override onPointerUp(_event: PointerEvent, _context: ExperimentContext): void {
    this.activeDragRole = null;
  }

  public override onPointerCancel(): void {
    this.activeDragRole = null;
  }

  public override onParameterChange(key: string, value: unknown): void {
    if (key === 'mode' && typeof value === 'string') {
      if (value === 'boyle' || value === 'charles' || value === 'gay-lussac') {
        this.solver.setMode(value as GasLawMode);
        this.syncImmediate();
      }
    } else if (key === 'volumeML' && typeof value === 'number') {
      this.solver.setVolumeML(value);
      this.syncImmediate();
    } else if (key === 'temperatureK' && typeof value === 'number') {
      this.solver.setTemperatureK(value);
      this.syncImmediate();
    }
  }

  public reset(): void {
    this.activeDragRole = null;
    this.solver.reset();
    this.syncImmediate();
  }

  /**
   * 自由鼠标悬停反馈（驱动手型/抓取光标）
   */
  public onHover(hit: THREE.Intersection | null): boolean {
    if (this.activeDragRole) return true;
    if (!hit || this.isDisposed || !this.bench) return false;
    const role = this.resolveInteractRole(hit.object);
    if (!role) return false;
    if (role === 'drag-piston-handle' && this.solver.mode !== 'boyle') {
      return false;
    }
    if (role === 'drag-temp-knob' && this.solver.mode === 'boyle') {
      return false;
    }
    return true;
  }

  /**
   * 3D 悬停交互语义提示
   */
  public override getHoverTarget(
    raycaster: THREE.Raycaster
  ): { id: string; label: string; cursor?: string } | null {
    if (!this.bench || this.isDisposed) return null;
    const telem = this.getTelemetryData();

    if (this.activeDragRole === 'drag-piston-handle') {
      return {
        id: 'drag-piston-handle',
        label: `活塞手柄 · V = ${telem.volumeML.toFixed(1)} mL · p = ${telem.pressureKPa.toFixed(1)} kPa`,
        cursor: 'grabbing',
      };
    }

    if (this.activeDragRole === 'drag-temp-knob') {
      return {
        id: 'drag-temp-knob',
        label: `恒温水浴温控旋钮 · T = ${telem.temperatureK.toFixed(0)} K (${telem.temperatureC.toFixed(0)} °C)`,
        cursor: 'grabbing',
      };
    }

    const hits = raycaster.intersectObjects([this.bench.group], true);
    for (const hit of hits) {
      const role = this.resolveInteractRole(hit.object);
      if (!role) continue;

      if (role === 'drag-piston-handle') {
        if (telem.mode === 'boyle') {
          return {
            id: role,
            label: `活塞 T 形手柄 · 上下拖拽改变气体体积 V（当前 ${telem.volumeML.toFixed(1)} mL）`,
            cursor: 'grab',
          };
        }
        return {
          id: role,
          label:
            telem.mode === 'charles'
              ? '活塞已被黄铜定容插销锁死（V₀ = 35.0 mL），请拖拽底座温控旋钮或点击插销解锁'
              : '等压模式下活塞随温度自由浮动，请拖拽底座黄铜温控旋钮调节温度 T',
          cursor: 'not-allowed',
        };
      }

      if (role === 'drag-temp-knob') {
        if (telem.mode !== 'boyle') {
          return {
            id: role,
            label: `黄铜温控旋钮 · 左右/上下拖拽调节水浴温度 T（当前 ${telem.temperatureK.toFixed(0)} K）`,
            cursor: 'grab',
          };
        }
        return {
          id: role,
          label: '玻意耳等温模式下水浴恒定锁定 T₀ = 300 K，请切换至查理或盖-吕萨克定律调温',
          cursor: 'not-allowed',
        };
      }

      if (role === 'toggle-lock-pin') {
        return {
          id: role,
          label: telem.pistonLocked
            ? '黄铜定容锁止销（已锁死）· 点击拔出插销切换至玻意耳等温模式'
            : '黄铜定容锁止销（未锁止）· 点击插入锁死活塞切换至查理等容模式',
          cursor: 'pointer',
        };
      }

      if (role === 'mode-boyle') {
        return {
          id: role,
          label: '切换至：玻意耳定律（等温过程 T = 300 K · pV = C₁）',
          cursor: 'pointer',
        };
      }

      if (role === 'mode-charles') {
        return {
          id: role,
          label: '切换至：查理定律（等容过程 V = 35 mL · p/T = C₂）',
          cursor: 'pointer',
        };
      }

      if (role === 'mode-gay-lussac') {
        return {
          id: role,
          label: '切换至：盖-吕萨克定律（等压过程 p = 101.3 kPa · V/T = C₃）',
          cursor: 'pointer',
        };
      }
    }

    return null;
  }

  public getTelemetryData(): GasLawsTelemetry {
    if (!this.cachedTelemetry) {
      this.cachedTelemetry = this.solver.getTelemetry();
    }
    return this.cachedTelemetry;
  }

  private syncImmediate(): void {
    const telem = this.solver.getTelemetry();
    this.cachedTelemetry = telem;
    this.bench?.update(0, telem);
  }

  private captureStartLocalPoint(event: PointerEvent, context: ExperimentContext): void {
    if (!context.camera) return;
    this.setupWorkPlane();
    const mouse = labPointerNDC(event, context.renderer?.domElement);
    this.internalRaycaster.setFromCamera(mouse, context.camera);
    const worldPt = new THREE.Vector3();
    if (this.internalRaycaster.ray.intersectPlane(this.dragPlane, worldPt)) {
      this.dragStartLocal.copy(this.rootGroup.worldToLocal(worldPt));
    }
  }

  private computeLocalDragDelta(event: PointerEvent, context: ExperimentContext): boolean {
    if (!context.camera) return false;
    this.setupWorkPlane();
    const mouse = labPointerNDC(event, context.renderer?.domElement);
    this.internalRaycaster.setFromCamera(mouse, context.camera);
    const worldPt = new THREE.Vector3();
    if (!this.internalRaycaster.ray.intersectPlane(this.dragPlane, worldPt)) {
      return false;
    }
    this.dragIntersection.copy(this.rootGroup.worldToLocal(worldPt));
    return true;
  }

  private setupWorkPlane(): void {
    const worldPos = new THREE.Vector3();
    this.rootGroup.getWorldPosition(worldPos);
    this.dragPlane.setFromNormalAndCoplanarPoint(new THREE.Vector3(0, 0, 1), worldPos);
  }

  private resolveInteractRole(obj: THREE.Object3D | null): GasLawsInteractRole | null {
    let curr: THREE.Object3D | null = obj;
    while (curr) {
      const role = curr.userData?.interactRole as GasLawsInteractRole | undefined;
      if (role) return role;
      if (curr === this.rootGroup) break;
      curr = curr.parent;
    }
    return null;
  }

  public override dispose(_context?: ExperimentContext): void {
    this.isDisposed = true;
    super.dispose(_context as ExperimentContext);
  }
}
