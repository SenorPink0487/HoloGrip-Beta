/**
 * 固体热传导与傅里叶定律 (Solid Heat Conduction & Fourier's Law)
 * 交互式 3D 热力学实验主控模块
 *
 * 【核心铁律遵从】：
 * 1. 严禁任何 DOM 悬浮提示弹窗、顶部步骤向导 Banner 或浮动把手；
 * 2. 纯三维实体直接操控：
 *    - 点击左侧红色船型电源开关启停加热；
 *    - 点击或上下拖拽左侧加热控制器数显面板（及 ▲▼ 按键）连续调节热端温度 T_H (60~150 °C)；
 *    - 点击或上下拖拽右侧恒温水浴箱数显面板（及 ▲▼ 按键）连续调节冷端水温 T_C (5~40 °C)；
 *    - 点击中间待测导热圆棒（或导轨前侧试件铭牌）循环切换 4 种金属材质（黄铜、紫铜、铝合金、不锈钢），带 3D 换棒机械抬升动画；
 * 3. 全套 3D 物理动效：导热棒冷暖热成像渐变 + 内部声子/电子热流粒子波、左侧电加热炉内部发热丝红热辐射、右侧透明水冷盘管与双路蓝色硅胶管内的微气泡循环流动；
 * 4. 空间视窗状态卡片：在悬浮空间视窗中实时绘制 T(x) 沿棒温度分布曲线、T1~T5 五探头读数与傅里叶定律核心量 (k, |dT/dx|, q)。
 */

import * as THREE from 'three';
import { BaseExperiment } from '../../base/BaseExperiment.ts';
import type { ExperimentContext } from '../../../core/types.ts';
import { labPointerNDC } from '../../../controls/LabPointerInput.ts';
import {
  DEFAULT_FOURIER_COLD_TEMP_C,
  DEFAULT_FOURIER_HOT_TEMP_C,
  FourierConductionSolver,
  type FourierConductionTelemetry,
  type FourierRodMaterialId,
} from '../../../physics/thermo/fourierConductionSolver.ts';
import { FourierConductionBenchMesh } from '../../../scene/thermo/FourierConductionBenchMesh.ts';
import { metadata } from './meta.ts';

type FourierInteractRole =
  | 'heater-power-toggle'
  | 'hot-temp-panel'
  | 'hot-temp-up'
  | 'hot-temp-down'
  | 'cold-temp-panel'
  | 'cold-temp-up'
  | 'cold-temp-down'
  | 'cycle-rod-material';

export default class ThermoFourierExperiment extends BaseExperiment {
  public readonly metadata = metadata;

  // 近景台面全览比例，使左加热器、中五探头导热棒、右透明水冷腔与恒温水浴箱完整端正呈现
  public override targetScale = 2.05;
  public override hideCenterEmitter = true;

  public solver: FourierConductionSolver;
  public bench!: FourierConductionBenchMesh;

  private isDisposed = false;
  private cachedTelemetry: FourierConductionTelemetry | null = null;

  // 面板上下拖拽调温状态
  private activePanelDrag: 'hot' | 'cold' | null = null;
  private dragPlane = new THREE.Plane();
  private dragIntersection = new THREE.Vector3();
  private dragStartLocalY = 0;
  private dragStartTempC = 0;
  private maxDragDeltaY = 0;
  private internalRaycaster = new THREE.Raycaster();

  constructor() {
    super();
    this.solver = new FourierConductionSolver({
      materialId: 'brass',
      hotTempC: DEFAULT_FOURIER_HOT_TEMP_C,
      coldTempC: DEFAULT_FOURIER_COLD_TEMP_C,
      heaterOn: true,
      startInSteadyState: false,
    });
  }

  public init(_context: ExperimentContext): void {
    // 安放于全息实验台中央偏前工作区 (Y=0.082 贴合台面, Z=1.18 正对操作者视线)
    this.rootGroup.position.set(0, 0.082, 1.18);

    this.bench = this.track(
      new FourierConductionBenchMesh({
        materialId: this.solver.materialId,
        hotTempC: this.solver.hotTempC,
        coldTempC: this.solver.coldTempC,
      })
    );
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
   * 鼠标/触控按下：处理电源开关、▲▼按键、左/右数显面板拖拽及导热棒点击换材
   */
  public override onPointerDown(
    event: PointerEvent,
    hit: THREE.Intersection | null,
    context: ExperimentContext
  ): boolean {
    if (!hit || this.isDisposed || !this.bench) return false;

    const role = this.resolveInteractRole(hit.object);
    if (!role) return false;

    if (role === 'heater-power-toggle') {
      this.solver.toggleHeater();
      this.syncImmediate(context);
      return true;
    }

    if (role === 'hot-temp-up') {
      this.setHotTempC(this.solver.hotTempC + 5.0);
      context.setParameter?.('hotTempC', this.solver.hotTempC);
      return true;
    }

    if (role === 'hot-temp-down') {
      this.setHotTempC(this.solver.hotTempC - 5.0);
      context.setParameter?.('hotTempC', this.solver.hotTempC);
      return true;
    }

    if (role === 'cold-temp-up') {
      this.setColdTempC(this.solver.coldTempC + 2.0);
      context.setParameter?.('coldTempC', this.solver.coldTempC);
      return true;
    }

    if (role === 'cold-temp-down') {
      this.setColdTempC(this.solver.coldTempC - 2.0);
      context.setParameter?.('coldTempC', this.solver.coldTempC);
      return true;
    }

    if (role === 'cycle-rod-material') {
      const nextMat = this.solver.cycleMaterial();
      context.setParameter?.('materialId', nextMat);
      this.syncImmediate(context);
      return true;
    }

    if (role === 'hot-temp-panel' || role === 'cold-temp-panel') {
      this.activePanelDrag = role === 'hot-temp-panel' ? 'hot' : 'cold';
      this.dragStartTempC =
        this.activePanelDrag === 'hot' ? this.solver.hotTempC : this.solver.coldTempC;
      this.maxDragDeltaY = 0;

      if (context.camera) {
        this.getWorkPlane(this.dragPlane);
        const mouse = labPointerNDC(event, context.renderer?.domElement);
        this.internalRaycaster.setFromCamera(mouse, context.camera);
        if (this.internalRaycaster.ray.intersectPlane(this.dragPlane, this.dragIntersection)) {
          const localPt = this.rootGroup.worldToLocal(this.dragIntersection.clone());
          this.dragStartLocalY = localPt.y;
        }
      }
      return true;
    }

    return false;
  }

  /**
   * 鼠标/触控拖拽：上下滑动左/右数显面板连续调节热端温度 T_H 或冷端水温 T_C
   */
  public override onPointerMove(
    event: PointerEvent,
    _hit: THREE.Intersection | null,
    context: ExperimentContext
  ): void {
    if (!this.activePanelDrag || !context.camera || !this.bench) return;

    this.getWorkPlane(this.dragPlane);
    const mouse = labPointerNDC(event, context.renderer?.domElement);
    this.internalRaycaster.setFromCamera(mouse, context.camera);

    if (!this.internalRaycaster.ray.intersectPlane(this.dragPlane, this.dragIntersection)) {
      return;
    }

    const currentLocal = this.rootGroup.worldToLocal(this.dragIntersection.clone());
    const deltaY = currentLocal.y - this.dragStartLocalY;
    this.maxDragDeltaY = Math.max(this.maxDragDeltaY, Math.abs(deltaY));

    if (this.activePanelDrag === 'hot') {
      const targetHot = this.dragStartTempC + deltaY * 320;
      this.setHotTempC(targetHot);
      context.setParameter?.('hotTempC', this.solver.hotTempC);
    } else {
      const targetCold = this.dragStartTempC + deltaY * 140;
      this.setColdTempC(targetCold);
      context.setParameter?.('coldTempC', this.solver.coldTempC);
    }
  }

  public override onPointerUp(_event: PointerEvent, _context: ExperimentContext): void {
    if (!this.activePanelDrag) return;
    this.activePanelDrag = null;
  }

  public override onPointerCancel(): void {
    this.activePanelDrag = null;
  }

  /**
   * 3D 悬停拾取提示
   */
  public override getHoverTarget(
    raycaster: THREE.Raycaster
  ): { id: string; label: string; cursor?: string } | null {
    if (!this.bench || this.isDisposed) return null;

    if (this.activePanelDrag) {
      const telem = this.getTelemetryData();
      if (this.activePanelDrag === 'hot') {
        return {
          id: 'hot-temp-panel',
          label: `恒温加热控制器 · 热端设定 T_h = ${telem.hotTempC.toFixed(1)} °C`,
          cursor: 'ns-resize',
        };
      }
      return {
        id: 'cold-temp-panel',
        label: `恒温循环水浴 · 冷端设定 T_c = ${telem.coldTempC.toFixed(1)} °C`,
        cursor: 'ns-resize',
      };
    }

    const hits = raycaster.intersectObjects(
      [
        this.bench.heaterControllerGroup,
        this.bench.testRodAssemblyGroup,
        this.bench.waterBathGroup,
      ],
      true
    );

    for (const hit of hits) {
      const role = this.resolveInteractRole(hit.object);
      if (!role) continue;

      const telem = this.getTelemetryData();

      if (role === 'heater-power-toggle') {
        return {
          id: 'heater-power-toggle',
          label: `加热电源总开关 · 当前${telem.heaterOn ? '已开启 (点击关闭)' : '已关闭 (点击开启加热)'}`,
          cursor: 'pointer',
        };
      }

      if (role === 'hot-temp-panel' || role === 'hot-temp-up' || role === 'hot-temp-down') {
        return {
          id: 'hot-temp-panel',
          label: `恒温加热控制器 (T_h = ${telem.hotTempC.toFixed(1)} °C) · 上下拖拽面板或点击 ▲▼ 调节热端温度`,
          cursor: role === 'hot-temp-panel' ? 'ns-resize' : 'pointer',
        };
      }

      if (role === 'cold-temp-panel' || role === 'cold-temp-up' || role === 'cold-temp-down') {
        return {
          id: 'cold-temp-panel',
          label: `恒温循环水浴 (T_c = ${telem.coldTempC.toFixed(1)} °C) · 上下拖拽面板或点击 ▲▼ 调节冷却水温`,
          cursor: role === 'cold-temp-panel' ? 'ns-resize' : 'pointer',
        };
      }

      if (role === 'cycle-rod-material') {
        return {
          id: 'test-rod-material',
          label: `待测导热棒：${telem.material.name} (k = ${telem.material.thermalConductivity} W/m·K) · 点击切换金属试件`,
          cursor: 'pointer',
        };
      }
    }

    return null;
  }

  private resolveInteractRole(obj: THREE.Object3D | null): FourierInteractRole | null {
    let curr: THREE.Object3D | null = obj;
    while (curr && curr !== this.rootGroup) {
      const role = curr.userData?.interactRole as FourierInteractRole | undefined;
      if (role) return role;
      curr = curr.parent;
    }
    return null;
  }

  private getWorkPlane(targetPlane: THREE.Plane): THREE.Plane {
    const normal = new THREE.Vector3(0, 0, 1)
      .applyQuaternion(this.rootGroup.quaternion)
      .normalize();
    const point = this.rootGroup.localToWorld(new THREE.Vector3(0, 0.14, 0));
    return targetPlane.setFromNormalAndCoplanarPoint(normal, point);
  }

  private syncImmediate(_context?: ExperimentContext): void {
    const telem = this.solver.getTelemetry();
    this.cachedTelemetry = telem;
    this.bench?.update(0, telem);
  }

  public setHotTempC(tempC: number): void {
    this.solver.setHotTempC(tempC);
    this.syncImmediate();
  }

  public setColdTempC(tempC: number): void {
    this.solver.setColdTempC(tempC);
    this.syncImmediate();
  }

  public setMaterial(materialId: FourierRodMaterialId): void {
    this.solver.setMaterial(materialId, true);
    this.syncImmediate();
  }

  public resetExperiment(): void {
    this.solver.setHotTempC(DEFAULT_FOURIER_HOT_TEMP_C);
    this.solver.setColdTempC(DEFAULT_FOURIER_COLD_TEMP_C);
    this.solver.setHeaterOn(true);
    this.solver.resetTransientWave();
    this.syncImmediate();
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
    } else if (id === 'materialId') {
      this.setMaterial(value as FourierRodMaterialId);
    } else if (id === 'resetExperiment' && value) {
      this.resetExperiment();
    }
  }

  public getTelemetryData(): FourierConductionTelemetry {
    if (!this.cachedTelemetry) {
      this.cachedTelemetry = this.solver.getTelemetry();
    }
    return this.cachedTelemetry;
  }

  public override dispose(context: ExperimentContext): void {
    this.isDisposed = true;
    this.activePanelDrag = null;
    super.dispose(context);
  }
}
