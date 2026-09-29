import * as THREE from 'three';
import { LaserEmitterMesh } from './LaserEmitterMesh.ts';
import { PolarizerMesh } from './PolarizerMesh.ts';
import { RotaryStageMesh } from './RotaryStageMesh.ts';
import { PrismMesh, type PrismGeometryType } from './PrismMesh.ts';
import { SlitApertureMesh, type SlitType } from './SlitApertureMesh.ts';
import { DetectorScreenMesh } from './DetectorScreenMesh.ts';
import { OpticalBenchRail } from './OpticalBenchRail.ts';
import { OpticalBeamSystem } from './OpticalBeamSystem.ts';
import type { ExperimentContext } from '../../core/types.ts';

export interface OpticsInteractionCallbacks {
  rootGroup: THREE.Group;
  rail?: OpticalBenchRail;
  laser?: LaserEmitterMesh;
  laserSaddle?: THREE.Group;
  slitFixture?: SlitApertureMesh;
  slitSaddle?: THREE.Group;
  rotaryStage?: RotaryStageMesh;
  prism?: PrismMesh;
  prismSaddle?: THREE.Group;
  polarizer1?: PolarizerMesh;
  pol1Saddle?: THREE.Group;
  analyzer2?: PolarizerMesh;
  pol2Saddle?: THREE.Group;
  detectorScreen?: DetectorScreenMesh;
  screenSaddle?: THREE.Group;
  beamSystem?: OpticalBeamSystem;

  onSaddleMove?: (saddleName: string, newZ: number) => void;
  onLaserChange?: (isOn: boolean, wavelengthNm: number) => void;
  onPolarizerChange?: (id: 'p1' | 'p2', angleDeg: number, hasWavePlate?: boolean) => void;
  onPrismChange?: (angleDeg: number, prismType?: PrismGeometryType) => void;
  onSlitChange?: (slitType: SlitType, distanceMm: number, widthMm: number, gratingDensity: number) => void;
  onScreenChange?: (screenDistanceM: number, calipersActive: boolean) => void;
  onAnyInteraction?: () => void;
}

export type DragTargetType =
  | 'none'
  | 'laser_saddle'
  | 'slit_saddle'
  | 'prism_saddle'
  | 'pol1_saddle'
  | 'pol2_saddle'
  | 'screen_saddle'
  | 'polarizer1_rotor'
  | 'polarizer2_rotor'
  | 'rotary_stage'
  | 'slit_micrometer';

export interface HoverTargetInfo {
  id: string;
  label: string;
  cursor: string;
}

export class OpticsInteractionManager {
  private bindings: OpticsInteractionCallbacks;

  // 当前拖拽交互状态
  private activeDrag: DragTargetType = 'none';
  private draggedSaddleGroup: THREE.Group | null = null;
  private saddleDragOffset = 0;
  private dragStartPointer = new THREE.Vector2();
  private lastPointer = new THREE.Vector2();
  private hasMovedSignificantly = false;

  // 悬停高亮状态
  private currentHoveredMesh: THREE.Mesh | null = null;
  private currentHoveredObject: THREE.Object3D | null = null;
  private origEmissiveMap = new Map<THREE.Material, { color: THREE.Color; intensity: number }>();

  constructor(bindings: OpticsInteractionCallbacks) {
    this.bindings = bindings;
  }

  public updateBindings(bindings: Partial<OpticsInteractionCallbacks>): void {
    this.bindings = { ...this.bindings, ...bindings };
  }

  /**
   * 射线检测查询指针下方的可交互光学元件
   */
  public getHoverTarget(raycaster: THREE.Raycaster): HoverTargetInfo | null {
    if (this.activeDrag !== 'none') {
      return this.getActiveDragHoverInfo();
    }

    const hits = raycaster.intersectObjects(this.bindings.rootGroup.children, true);
    if (hits.length === 0) {
      this.clearHoverHighlight();
      return null;
    }

    for (const hit of hits) {
      const target = this.resolveInteractiveTarget(hit);
      if (target) {
        this.applyHoverHighlight(target.mesh, target.group);
        return {
          id: target.id,
          label: target.label,
          cursor: target.cursor,
        };
      }
    }

    this.clearHoverHighlight();
    return null;
  }

  private isObjectVisible(obj: THREE.Object3D): boolean {
    let curr: THREE.Object3D | null = obj;
    while (curr) {
      if (curr.visible === false) return false;
      curr = curr.parent;
    }
    return true;
  }

  private resolveInteractiveTarget(hit: THREE.Intersection): {
    id: string;
    label: string;
    cursor: string;
    mesh: THREE.Mesh;
    group: THREE.Object3D;
    actionType: DragTargetType | 'click_only';
  } | null {
    if (!this.isObjectVisible(hit.object)) {
      return null;
    }

    let curr: THREE.Object3D | null = hit.object;

    while (curr && curr !== this.bindings.rootGroup) {
      // 1. 激光电源开关
      if (curr.userData?.isLaserSwitch) {
        const isOn = this.bindings.laser?.isOn ?? true;
        return {
          id: 'laser-switch',
          label: isOn ? '激光电源开关 · 单击关闭激光' : '激光电源开关 · 单击开启激光',
          cursor: 'pointer',
          mesh: hit.object as THREE.Mesh,
          group: curr,
          actionType: 'click_only',
        };
      }

      // 2. 激光镜筒
      if (curr.userData?.isLaserBarrel || curr.userData?.isLaser || (this.bindings.laser && (curr === this.bindings.laser.group || curr === this.bindings.laser.mainBarrel))) {
        const wl = this.bindings.laser?.wavelengthNm ?? 632.8;
        return {
          id: 'laser-barrel',
          label: `半导体激光器 · 点击切换波长 (当前: ${wl.toFixed(1)} nm)`,
          cursor: 'pointer',
          mesh: hit.object as THREE.Mesh,
          group: this.bindings.laser ? this.bindings.laser.group : curr,
          actionType: 'click_only',
        };
      }

      // 3. 1/4 波片
      if (curr.userData?.isWavePlate) {
        const hasPlate = this.bindings.analyzer2?.hasWavePlate ?? false;
        return {
          id: 'analyzer-waveplate',
          label: hasPlate ? '1/4波片 (λ/4) · 点击卸下波片' : '1/4波片 (λ/4) · 点击插入波片',
          cursor: 'pointer',
          mesh: hit.object as THREE.Mesh,
          group: curr,
          actionType: 'click_only',
        };
      }

      // 4. 起偏器 P1 / 检偏器 P2 旋转刻度环
      if (curr.userData?.isPolarizerRotor || curr.userData?.isPolarizer || (this.bindings.polarizer1 && curr === this.bindings.polarizer1.group) || (this.bindings.analyzer2 && curr === this.bindings.analyzer2.group)) {
        const pol = (curr.userData?.polarizer as PolarizerMesh) || (curr === this.bindings.polarizer1?.group ? this.bindings.polarizer1 : this.bindings.analyzer2);
        const isP1 = pol === this.bindings.polarizer1;
        const name = isP1 ? '起偏器 P1' : '检偏器 P2';
        const angle = pol?.angleDeg ?? 0;
        return {
          id: isP1 ? 'polarizer1-rotor' : 'analyzer2-rotor',
          label: `${name} · 拖动旋转透光轴 (θ = ${angle.toFixed(0)}°) · 单击+15°`,
          cursor: 'grab',
          mesh: hit.object as THREE.Mesh,
          group: pol?.rotatableRing ?? curr,
          actionType: isP1 ? 'polarizer1_rotor' : 'polarizer2_rotor',
        };
      }

      // 5. 旋转载物台（棱镜转台）与微分测微分度筒
      if (curr.userData?.isRotaryStageRotor || curr.userData?.isRotaryMicrometer) {
        const angle = this.bindings.rotaryStage?.currentAngleDeg ?? 0;
        return {
          id: 'rotary-stage',
          label: `三棱镜测角台 · 拖动旋转偏折角 (θ = ${angle > 0 ? '+' : ''}${angle.toFixed(1)}°) · 单击+5°`,
          cursor: 'grab',
          mesh: hit.object as THREE.Mesh,
          group: this.bindings.rotaryStage ? this.bindings.rotaryStage.rotorGroup : curr,
          actionType: 'rotary_stage',
        };
      }

      // 6. 光学棱镜玻璃体
      if (curr.userData?.isPrism || (this.bindings.prism && curr === this.bindings.prism.group)) {
        const pType = this.bindings.prism?.prismType === 'equilateral' ? '60°等边棱镜' : '半圆柱透镜';
        return {
          id: 'prism-mesh',
          label: `光学棱镜 (${pType}) · 单击切换形状 / 全反射`,
          cursor: 'pointer',
          mesh: hit.object as THREE.Mesh,
          group: this.bindings.prism ? this.bindings.prism.group : curr,
          actionType: 'click_only',
        };
      }

      // 7. 狭缝微调鼓轮
      if (curr.userData?.isSlitMicrometer) {
        const slit = this.bindings.slitFixture;
        const desc = slit?.slitType === 'double'
          ? `双缝间距 d = ${slit.slitDistanceMm.toFixed(2)} mm`
          : (slit?.slitType === 'single'
              ? `单缝宽度 a = ${slit.slitWidthMm.toFixed(3)} mm`
              : `光栅密度 N = ${slit?.gratingLinesPerMm ?? 300} 条/mm`);
        return {
          id: 'slit-micrometer',
          label: `狭缝微调鼓轮 · 拖动微调 (${desc})`,
          cursor: 'grab',
          mesh: hit.object as THREE.Mesh,
          group: curr,
          actionType: 'slit_micrometer',
        };
      }

      // 8. 狭缝贴片 / 弹簧压片
      if (curr.userData?.isSlitSlide || curr.userData?.isSlitFixture || (this.bindings.slitFixture && curr === this.bindings.slitFixture.group)) {
        const slit = this.bindings.slitFixture;
        const typeName = slit?.slitType === 'double' ? '杨氏双缝' : (slit?.slitType === 'single' ? '精密单缝' : '透射光栅');
        return {
          id: 'slit-slide',
          label: `狭缝贴片 (${typeName}) · 单击切换双缝/单缝/光栅`,
          cursor: 'pointer',
          mesh: hit.object as THREE.Mesh,
          group: this.bindings.slitFixture ? this.bindings.slitFixture.group : curr,
          actionType: 'click_only',
        };
      }

      // 9. 探测观测屏
      if (curr.userData?.isDetectorScreen || (this.bindings.detectorScreen && (curr === this.bindings.detectorScreen.screenMesh || curr === this.bindings.detectorScreen.group))) {
        const screen = this.bindings.detectorScreen;
        const calipActive = screen?.showCalipers ?? false;
        return {
          id: 'detector-screen',
          label: calipActive
            ? '探测观测屏 · 单击关闭微米双游标标尺 · 拖动底座调节屏距'
            : '探测观测屏 · 单击开启微米双游标标尺 · 拖动底座调节屏距',
          cursor: 'pointer',
          mesh: hit.object as THREE.Mesh,
          group: this.bindings.detectorScreen ? this.bindings.detectorScreen.group : curr,
          actionType: 'click_only',
        };
      }

      // 10. 光学滑块鞍座（沿导轨滑动）
      if (curr.userData?.isSaddle || curr === this.bindings.laserSaddle || curr === this.bindings.slitSaddle
          || curr === this.bindings.prismSaddle || curr === this.bindings.pol1Saddle
          || curr === this.bindings.pol2Saddle || curr === this.bindings.screenSaddle) {
        const saddle = (curr.userData?.saddleGroup || curr) as THREE.Group;
        const saddleType = this.getSaddleType(saddle);
        const zCm = ((saddle.position.z + 0.60) * 100).toFixed(1);
        let saddleLabel = `光学滑块 · 沿导轨拖动调节 (刻度: ${zCm} cm)`;

        if (saddle === this.bindings.screenSaddle) {
          const lCm = this.calculateScreenDistance() * 100;
          saddleLabel = `观测屏滑块 · 沿导轨拖动调节屏距 L (L = ${lCm.toFixed(1)} cm)`;
        } else if (saddle === this.bindings.laserSaddle) {
          saddleLabel = `激光器滑块 · 沿导轨拖动 (刻度: ${zCm} cm)`;
        } else if (saddle === this.bindings.slitSaddle) {
          saddleLabel = `狭缝仪滑块 · 沿导轨拖动 (刻度: ${zCm} cm)`;
        }

        return {
          id: `saddle-${saddle.name || 'carrier'}`,
          label: saddleLabel,
          cursor: 'grab',
          mesh: hit.object as THREE.Mesh,
          group: saddle,
          actionType: saddleType,
        };
      }

      curr = curr.parent;
    }

    return null;
  }

  private getSaddleType(saddle: THREE.Group): DragTargetType {
    if (saddle === this.bindings.laserSaddle) return 'laser_saddle';
    if (saddle === this.bindings.slitSaddle) return 'slit_saddle';
    if (saddle === this.bindings.prismSaddle) return 'prism_saddle';
    if (saddle === this.bindings.pol1Saddle) return 'pol1_saddle';
    if (saddle === this.bindings.pol2Saddle) return 'pol2_saddle';
    if (saddle === this.bindings.screenSaddle) return 'screen_saddle';
    return 'screen_saddle';
  }

  /**
   * 指针按下：发起拖拽或触发即时点击响应
   */
  public onPointerDown(
    event: PointerEvent,
    hit: THREE.Intersection | null,
    context?: ExperimentContext
  ): boolean {
    if (!hit) return false;

    const target = this.resolveInteractiveTarget(hit);
    if (!target) return false;

    this.dragStartPointer.set(event.clientX, event.clientY);
    this.lastPointer.set(event.clientX, event.clientY);
    this.hasMovedSignificantly = false;

    // 仅支持直接点击的目标
    if (target.actionType === 'click_only') {
      if (target.id === 'laser-switch') {
        const nextPower = this.bindings.laser?.togglePower() ?? true;
        this.bindings.onLaserChange?.(nextPower, this.bindings.laser?.wavelengthNm ?? 632.8);
        this.bindings.onAnyInteraction?.();
        return true;
      }
      if (target.id === 'laser-barrel') {
        const nextWl = this.bindings.laser?.cycleWavelength() ?? 632.8;
        this.bindings.beamSystem?.updateWavelength(nextWl);
        this.bindings.onLaserChange?.(this.bindings.laser?.isOn ?? true, nextWl);
        context?.setParameter('wavelength', nextWl);
        this.bindings.onAnyInteraction?.();
        return true;
      }
      if (target.id === 'analyzer-waveplate') {
        const hasPlate = this.bindings.analyzer2?.toggleWavePlate() ?? false;
        this.bindings.onPolarizerChange?.('p2', this.bindings.analyzer2?.angleDeg ?? 0, hasPlate);
        this.bindings.onAnyInteraction?.();
        return true;
      }
      if (target.id === 'prism-mesh') {
        const nextType = this.bindings.prism?.toggleType() ?? 'equilateral';
        this.bindings.onPrismChange?.(this.bindings.rotaryStage?.currentAngleDeg ?? 0, nextType);
        context?.setParameter('prismType', nextType);
        this.bindings.onAnyInteraction?.();
        return true;
      }
      if (target.id === 'slit-slide') {
        const nextSlit = this.bindings.slitFixture?.cycleSlitType() ?? 'double';
        this.bindings.onSlitChange?.(
          nextSlit,
          this.bindings.slitFixture?.slitDistanceMm ?? 0.25,
          this.bindings.slitFixture?.slitWidthMm ?? 0.04,
          this.bindings.slitFixture?.gratingLinesPerMm ?? 300
        );
        context?.setParameter('diffractionType', nextSlit);
        this.bindings.onAnyInteraction?.();
        return true;
      }
      if (target.id === 'detector-screen') {
        const active = this.bindings.detectorScreen?.toggleCalipers() ?? false;
        this.bindings.onScreenChange?.(this.calculateScreenDistance(), active);
        this.bindings.onAnyInteraction?.();
        return true;
      }
    }

    // 可拖拽目标
    this.activeDrag = target.actionType as DragTargetType;

    if (this.isSaddleDrag(this.activeDrag)) {
      this.draggedSaddleGroup = target.group as THREE.Group;
      const localZ = this.getRailLocalZFromPointer(event, context);
      if (localZ !== null) {
        this.saddleDragOffset = this.draggedSaddleGroup.position.z - localZ;
      } else {
        this.saddleDragOffset = 0;
      }
    }

    return true;
  }

  /**
   * 指针移动：在拖拽过程中更新位置与旋转角
   */
  public onPointerMove(
    event: PointerEvent,
    hit: THREE.Intersection | null,
    context?: ExperimentContext
  ): boolean {
    if (this.activeDrag === 'none') {
      return false;
    }

    const dist = Math.hypot(event.clientX - this.dragStartPointer.x, event.clientY - this.dragStartPointer.y);
    if (dist > 4) {
      this.hasMovedSignificantly = true;
    }

    const dx = event.clientX - this.lastPointer.x;
    const dy = event.clientY - this.lastPointer.y;
    this.lastPointer.set(event.clientX, event.clientY);

    // 1. 光学滑块沿导轨滑动拖拽
    if (this.isSaddleDrag(this.activeDrag) && this.draggedSaddleGroup) {
      const localZ = this.getRailLocalZFromPointer(event, context);
      if (localZ !== null) {
        const targetZ = localZ + this.saddleDragOffset;
        const clampedZ = this.clampSaddlePosition(this.draggedSaddleGroup, targetZ);
        this.draggedSaddleGroup.position.z = clampedZ;

        this.bindings.onSaddleMove?.(this.draggedSaddleGroup.name, clampedZ);

        if (this.draggedSaddleGroup === this.bindings.screenSaddle) {
          const lDist = this.calculateScreenDistance();
          this.bindings.onScreenChange?.(lDist, this.bindings.detectorScreen?.showCalipers ?? false);
        }

        this.bindings.onAnyInteraction?.();
      }
      return true;
    }

    // 2. 偏振片刻度盘旋转（P1 / P2）
    if (this.activeDrag === 'polarizer1_rotor' && this.bindings.polarizer1) {
      const deltaDeg = dx * 0.75;
      const angle = this.bindings.polarizer1.rotateBy(deltaDeg);
      this.bindings.onPolarizerChange?.('p1', angle, this.bindings.polarizer1.hasWavePlate);
      context?.setParameter('polarizerAngle', angle);
      this.bindings.onAnyInteraction?.();
      return true;
    }

    if (this.activeDrag === 'polarizer2_rotor' && this.bindings.analyzer2) {
      const deltaDeg = dx * 0.75;
      const angle = this.bindings.analyzer2.rotateBy(deltaDeg);
      this.bindings.onPolarizerChange?.('p2', angle, this.bindings.analyzer2.hasWavePlate);
      context?.setParameter('analyzerAngle', angle);
      this.bindings.onAnyInteraction?.();
      return true;
    }

    // 3. 旋转载物台旋转（棱镜转台）
    if (this.activeDrag === 'rotary_stage' && this.bindings.rotaryStage) {
      const deltaDeg = dx * 0.35;
      const angle = this.bindings.rotaryStage.rotateBy(deltaDeg);
      this.bindings.onPrismChange?.(angle, this.bindings.prism?.prismType);
      context?.setParameter('prismAngle', angle);
      this.bindings.onAnyInteraction?.();
      return true;
    }

    // 4. 狭缝微分鼓轮微调
    if (this.activeDrag === 'slit_micrometer' && this.bindings.slitFixture) {
      const delta = -dy * 0.08;
      this.bindings.slitFixture.adjustMicrometer(delta);
      this.bindings.onSlitChange?.(
        this.bindings.slitFixture.slitType,
        this.bindings.slitFixture.slitDistanceMm,
        this.bindings.slitFixture.slitWidthMm,
        this.bindings.slitFixture.gratingLinesPerMm
      );
      if (this.bindings.slitFixture.slitType === 'double') {
        context?.setParameter('slitDistance', this.bindings.slitFixture.slitDistanceMm);
      } else if (this.bindings.slitFixture.slitType === 'single') {
        context?.setParameter('slitWidth', this.bindings.slitFixture.slitWidthMm);
      }
      this.bindings.onAnyInteraction?.();
      return true;
    }

    return false;
  }

  /**
   * 指针抬起：结束拖拽并处理小位移点击回退动作
   */
  public onPointerUp(event: PointerEvent, context?: ExperimentContext): void {
    if (this.activeDrag === 'none') return;

    const drag = this.activeDrag;
    this.activeDrag = 'none';
    this.draggedSaddleGroup = null;

    // 若指针释放时位移极小，则触发步进点击回退动作
    if (!this.hasMovedSignificantly) {
      if (drag === 'polarizer1_rotor' && this.bindings.polarizer1) {
        const next = this.bindings.polarizer1.rotateBy(15);
        this.bindings.onPolarizerChange?.('p1', next, this.bindings.polarizer1.hasWavePlate);
        context?.setParameter('polarizerAngle', next);
        this.bindings.onAnyInteraction?.();
      } else if (drag === 'polarizer2_rotor' && this.bindings.analyzer2) {
        const next = this.bindings.analyzer2.rotateBy(15);
        this.bindings.onPolarizerChange?.('p2', next, this.bindings.analyzer2.hasWavePlate);
        context?.setParameter('analyzerAngle', next);
        this.bindings.onAnyInteraction?.();
      } else if (drag === 'rotary_stage' && this.bindings.rotaryStage) {
        const next = this.bindings.rotaryStage.rotateBy(5);
        this.bindings.onPrismChange?.(next, this.bindings.prism?.prismType);
        context?.setParameter('prismAngle', next);
        this.bindings.onAnyInteraction?.();
      }
    }
  }

  private isSaddleDrag(drag: DragTargetType): boolean {
    return drag === 'laser_saddle' || drag === 'slit_saddle' || drag === 'prism_saddle'
      || drag === 'pol1_saddle' || drag === 'pol2_saddle' || drag === 'screen_saddle';
  }

  /**
   * 根据鼠标指针屏幕坐标计算沿导轨的局部 Z 轴坐标
   */
  private getRailLocalZFromPointer(event: PointerEvent, context?: ExperimentContext): number | null {
    if (!context || !context.camera) return null;

    const root = this.bindings.rootGroup;
    root.updateWorldMatrix(true, false);

    const mouseNDC = new THREE.Vector2(
      (event.clientX / window.innerWidth) * 2 - 1,
      -(event.clientY / window.innerHeight) * 2 + 1
    );

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouseNDC, context.camera);

    const invWorld = root.matrixWorld.clone().invert();
    const localRay = raycaster.ray.clone().applyMatrix4(invWorld);

    // 导轨直线方程：P(s) = (0, 0.052, s)，方向向量 D = (0, 0, 1)
    const P0 = new THREE.Vector3(0, 0.052, 0);
    const D = new THREE.Vector3(0, 0, 1);
    const V = localRay.direction.clone().normalize();
    const O = localRay.origin;
    const w = O.clone().sub(P0);

    const b = V.dot(D);
    const d = V.dot(w);
    const e = D.dot(w);
    const denom = 1.0 - b * b;

    if (denom > 1e-5) {
      const s = (e - b * d) / denom;
      return s;
    }

    // 回退方案：与水平面求交
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.052);
    const pt = new THREE.Vector3();
    if (localRay.intersectPlane(plane, pt)) {
      return pt.z;
    }

    return null;
  }

  /**
   * 限制滑块 Z 坐标范围，防止超出导轨行程或与相邻滑块碰撞
   */
  private clampSaddlePosition(saddle: THREE.Group, targetZ: number): number {
    const minRailZ = -0.58;
    const maxRailZ = 0.58;
    const clearance = 0.088; // 滑块之间的最小安全间距，防止重叠碰撞

    let minBound = minRailZ;
    let maxBound = maxRailZ;

    const isVisibleSaddle = (s?: THREE.Group) => !!(s && s.visible !== false);

    // 针对各滑块角色的专用边界限制约束
    if (saddle === this.bindings.laserSaddle) {
      minBound = -0.58;
      const rightSaddle = [this.bindings.pol1Saddle, this.bindings.slitSaddle, this.bindings.prismSaddle, this.bindings.pol2Saddle, this.bindings.screenSaddle].find(isVisibleSaddle);
      maxBound = Math.min(-0.28, rightSaddle ? rightSaddle.position.z - clearance : -0.28);
    } else if (saddle === this.bindings.pol1Saddle) {
      const leftSaddle = [this.bindings.laserSaddle].find(isVisibleSaddle);
      minBound = (leftSaddle?.position.z ?? -0.52) + clearance;
      const rightSaddle = [this.bindings.slitSaddle, this.bindings.prismSaddle, this.bindings.pol2Saddle, this.bindings.screenSaddle].find(isVisibleSaddle);
      maxBound = (rightSaddle?.position.z ?? 0.48) - clearance;
    } else if (saddle === this.bindings.slitSaddle || saddle === this.bindings.prismSaddle) {
      const leftSaddle = [this.bindings.pol1Saddle, this.bindings.laserSaddle].find(isVisibleSaddle);
      minBound = (leftSaddle?.position.z ?? -0.52) + clearance;
      const rightSaddle = [this.bindings.pol2Saddle, this.bindings.screenSaddle].find(isVisibleSaddle);
      maxBound = (rightSaddle?.position.z ?? 0.48) - clearance;
    } else if (saddle === this.bindings.pol2Saddle) {
      const leftSaddle = [this.bindings.slitSaddle, this.bindings.prismSaddle, this.bindings.pol1Saddle, this.bindings.laserSaddle].find(isVisibleSaddle);
      minBound = (leftSaddle?.position.z ?? -0.52) + clearance;
      const rightSaddle = [this.bindings.screenSaddle].find(isVisibleSaddle);
      maxBound = (rightSaddle?.position.z ?? 0.48) - clearance;
    } else if (saddle === this.bindings.screenSaddle) {
      const leftSaddle = [this.bindings.pol2Saddle, this.bindings.slitSaddle, this.bindings.prismSaddle, this.bindings.pol1Saddle, this.bindings.laserSaddle].find(isVisibleSaddle);
      minBound = (leftSaddle?.position.z ?? 0.0) + clearance;
      maxBound = 0.58;
    }

    return Math.max(minBound, Math.min(maxBound, targetZ));
  }

  /**
   * 计算从光学元件（狭缝/棱镜）至探测观测屏的物理距离 L
   */
  public calculateScreenDistance(): number {
    const screenZ = this.bindings.screenSaddle?.position.z ?? 0.48;
    const elementZ = this.bindings.slitSaddle?.position.z
      ?? this.bindings.prismSaddle?.position.z
      ?? (this.bindings.pol2Saddle?.position.z)
      ?? -0.05;
    return Math.max(0.12, Math.min(0.85, screenZ - elementZ));
  }

  private getActiveDragHoverInfo(): HoverTargetInfo | null {
    if (this.isSaddleDrag(this.activeDrag)) {
      if (this.activeDrag === 'screen_saddle') {
        const lCm = (this.calculateScreenDistance() * 100).toFixed(1);
        return { id: 'drag-screen-saddle', label: `观测屏距 L: ${lCm} cm · 释放完成调节`, cursor: 'grabbing' };
      }
      const zCm = this.draggedSaddleGroup ? ((this.draggedSaddleGroup.position.z + 0.60) * 100).toFixed(1) : '0';
      return { id: 'drag-saddle', label: `滑块刻度: ${zCm} cm · 沿导轨拖动中`, cursor: 'grabbing' };
    }
    if (this.activeDrag === 'polarizer1_rotor') {
      const a = (this.bindings.polarizer1?.angleDeg ?? 0).toFixed(0);
      return { id: 'drag-pol1', label: `起偏器 P1 透光轴: ${a}° · 旋转中`, cursor: 'grabbing' };
    }
    if (this.activeDrag === 'polarizer2_rotor') {
      const a = (this.bindings.analyzer2?.angleDeg ?? 0).toFixed(0);
      return { id: 'drag-pol2', label: `检偏器 P2 透光轴: ${a}° · 旋转中`, cursor: 'grabbing' };
    }
    if (this.activeDrag === 'rotary_stage') {
      const a = (this.bindings.rotaryStage?.currentAngleDeg ?? 0).toFixed(1);
      return { id: 'drag-rotary', label: `棱镜偏角: ${a}° · 旋转中`, cursor: 'grabbing' };
    }
    if (this.activeDrag === 'slit_micrometer') {
      const slit = this.bindings.slitFixture;
      const desc = slit?.slitType === 'double'
        ? `间距 d = ${slit.slitDistanceMm.toFixed(2)} mm`
        : `缝宽 a = ${slit?.slitWidthMm.toFixed(3) ?? '0.04'} mm`;
      return { id: 'drag-micrometer', label: `狭缝鼓轮微调: ${desc}`, cursor: 'grabbing' };
    }
    return null;
  }

  private applyHoverHighlight(mesh: THREE.Mesh, group: THREE.Object3D): void {
    if (this.currentHoveredObject === group) return;
    this.clearHoverHighlight();

    this.currentHoveredObject = group;
    this.currentHoveredMesh = mesh;

    group.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const m = child as THREE.Mesh;
        if (m.material) {
          const mat = m.material as any;
          if (mat.emissive && !this.origEmissiveMap.has(mat)) {
            this.origEmissiveMap.set(mat, {
              color: mat.emissive.clone(),
              intensity: mat.emissiveIntensity ?? 0,
            });
            mat.emissive.setHex(0x0a84ff);
            mat.emissiveIntensity = 0.38;
          }
        }
      }
    });
  }

  private clearHoverHighlight(): void {
    if (!this.currentHoveredObject) return;

    this.origEmissiveMap.forEach((orig, mat: any) => {
      if (mat.emissive) {
        mat.emissive.copy(orig.color);
        mat.emissiveIntensity = orig.intensity;
      }
    });

    this.origEmissiveMap.clear();
    this.currentHoveredObject = null;
    this.currentHoveredMesh = null;
  }

  public dispose(): void {
    this.clearHoverHighlight();
    this.activeDrag = 'none';
    this.draggedSaddleGroup = null;
  }
}
