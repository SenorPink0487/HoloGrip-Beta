import * as THREE from 'three';
import {
  OpticalDispersionApparatusMesh,
  type DispersionSourceMode,
  type OpticalDispersionTelemetry,
} from './OpticalDispersionApparatusMesh.ts';
import type { PrismMaterialType } from './OpticalPhysics.ts';

export interface OpticalDispersionInteractionCallbacks {
  onSourceModeChange?: (mode: DispersionSourceMode) => void;
  onWavelengthChange?: (wlNm: number) => void;
  onLaserPowerToggle?: (on: boolean) => void;
  onPrismMaterialChange?: (material: PrismMaterialType) => void;
  onIncidentAngleChange?: (angleDeg: number, telemetry: OpticalDispersionTelemetry) => void;
  onRecombinationToggle?: (enabled: boolean) => void;
  onScreenDistanceChange?: (distM: number, telemetry: OpticalDispersionTelemetry) => void;
}

export class OpticalDispersionInteractionManager {
  private apparatus: OpticalDispersionApparatusMesh;
  private rootGroup: THREE.Group;
  private callbacks: OpticalDispersionInteractionCallbacks;

  // 拖拽状态
  private dragMode: 'none' | 'screen' | 'micrometer' | 'collimator' | 'turret' = 'none';
  private dragPlane = new THREE.Plane();
  private dragStartScreenX = 0;
  private dragStartPointerPos = new THREE.Vector3();
  private dragStartClientX = 0;
  private dragStartClientY = 0;
  private dragStartIncidentAngle = 58.0;
  private dragStartTurretAngle = 0;
  private hasDragMoved = false;

  // 交互引导提示生命周期状态 (首次交互前呈现悬浮提示与 3D 光晕环，交互后彻底隐藏，符合严格极简规范)
  private hasInteractedWithMicrometer = false;
  private hasInteractedWithTurret = false;
  private hasInteractedWithRecombination = false;

  constructor(
    apparatus: OpticalDispersionApparatusMesh,
    rootGroup: THREE.Group,
    callbacks: OpticalDispersionInteractionCallbacks = {}
  ) {
    this.apparatus = apparatus;
    this.rootGroup = rootGroup;
    this.callbacks = callbacks;
  }

  public get isDragging(): boolean {
    return this.dragMode !== 'none';
  }

  /**
   * 射线检测悬停目标 (供 Engine.ts 自由鼠标光标与原生 HUD 提示)
   */
  public getHoverTarget(raycaster: THREE.Raycaster): { id: string; label: string; cursor?: string } | null {
    if (this.dragMode === 'screen') {
      this.apparatus.setKnobHovered(null, false);
      const distMm = (this.apparatus.screenDistanceM * 1000).toFixed(0);
      const telem = this.apparatus.getTelemetry();
      return {
        id: 'screen_handle',
        label: `滑动全景彩虹光谱屏 · 棱镜至屏距 L = ${distMm} mm (角色散 Δδ = ${telem.angularDispersionDeg.toFixed(2)}°)`,
        cursor: 'grabbing',
      };
    }

    if (this.dragMode === 'collimator' || this.dragMode === 'micrometer') {
      this.apparatus.setKnobHovered(null, false);
      return {
        id: 'collimator_arm',
        label: this.hasInteractedWithMicrometer
          ? ''
          : `精密测角三棱镜台 · 入射角 θ₁ = ${this.apparatus.incidentAngleDeg.toFixed(1)}°`,
        cursor: 'grab',
      };
    }

    if (this.dragMode === 'turret') {
      this.apparatus.setKnobHovered('prism_material_turret', true);
      const telem = this.apparatus.getTelemetry();
      return {
        id: 'prism_material_turret',
        label: this.hasInteractedWithTurret
          ? ''
          : `旋转材质转换轮 · 当前[${telem.prismMaterialName}]`,
        cursor: 'grabbing',
      };
    }

    const targets = typeof (this.apparatus as any).getInteractiveObjects === 'function'
      ? (this.apparatus as any).getInteractiveObjects()
      : this.apparatus.group.children;
    const hits = raycaster.intersectObjects(targets, true);
    if (hits.length === 0) {
      this.apparatus.setKnobHovered(null, false);
      return null;
    }

    for (const hit of hits) {
      let cur: THREE.Object3D | null = hit.object;
      while (cur && cur !== this.apparatus.group) {
        const id = cur.userData?.interactiveId || cur.name;

        if (id === 'laser_power' || cur.name === 'LaserPowerSwitch') {
          this.apparatus.setKnobHovered(null, false);
          return {
            id: 'laser_power',
            label: `平行光源电源开关 · 当前[${this.apparatus.laserPower ? '开启' : '关闭'}] (点击切换)`,
            cursor: 'pointer',
          };
        }

        if (id === 'source_white' || cur.name === 'SourceWhiteButton') {
          this.apparatus.setKnobHovered(null, false);
          return {
            id: 'source_white',
            label: `复合太阳白光连续光谱模式 (380nm ~ 750nm 七色彩虹色散)`,
            cursor: 'pointer',
          };
        }

        if (id === 'source_spectral_lines' || cur.name === 'SourceSpectralLinesButton') {
          this.apparatus.setKnobHovered(null, false);
          return {
            id: 'source_spectral_lines',
            label: `汞-氦原子特征发射光谱灯模式 (分立明线光谱色散)`,
            cursor: 'pointer',
          };
        }

        if (id && id.startsWith('laser_wavelength_')) {
          this.apparatus.setKnobHovered(null, false);
          const wl = cur.userData?.wavelength || 532;
          const colorName = wl === 650 ? '红光 (650nm)' : wl === 532 ? '绿光 (532nm)' : '紫光 (405nm)';
          return {
            id,
            label: `切换单色激光检验 · ${colorName} (单色光仅发生折射偏折、不再色散)`,
            cursor: 'pointer',
          };
        }

        if (
          id === 'prism_material_turret' ||
          cur.name === 'MaterialTurretWheel' ||
          cur.name.startsWith('MaterialGem_')
        ) {
          if (!this.hasInteractedWithTurret) {
            this.apparatus.setKnobHovered('prism_material_turret', true);
            const telem = this.apparatus.getTelemetry();
            return {
              id: 'prism_material_turret',
              label: `五档光学玻璃材质转换轮 · 当前[${telem.prismMaterialName}] (点击色标宝石或转轮切换三棱镜介质)`,
              cursor: 'pointer',
            };
          } else {
            this.apparatus.setKnobHovered('prism_material_turret', false);
            return {
              id: 'prism_material_turret',
              label: '',
              cursor: 'pointer',
            };
          }
        }

        if (
          id === 'recombination_toggle' ||
          cur.name === 'RecombinationToggleKnob' ||
          cur.name === 'RecombinationCrystalPrismMesh' ||
          cur.name === 'RecombinationPivotArm'
        ) {
          if (!this.hasInteractedWithRecombination) {
            this.apparatus.setKnobHovered('recombination_toggle', true);
            const stateStr = this.apparatus.enableRecombinationPrism ? '已切入·双棱镜复合白光' : '已抬起·单棱镜七色色散';
            return {
              id: 'recombination_toggle',
              label: `牛顿第二倒置复合三棱镜机构 · 当前[${stateStr}] (点击旋钮切入或移出光路)`,
              cursor: 'pointer',
            };
          } else {
            this.apparatus.setKnobHovered('recombination_toggle', false);
            return {
              id: 'recombination_toggle',
              label: '',
              cursor: 'pointer',
            };
          }
        }

        if (
          id === 'prism_micrometer' ||
          cur.name === 'PrismMicrometerKnob' ||
          cur.name === 'PrimaryCrystalPrismMesh' ||
          cur.name === 'PrismBottomPlateMesh' ||
          cur.name === 'PrismMicrometerGroup'
        ) {
          if (!this.hasInteractedWithMicrometer) {
            this.apparatus.setKnobHovered('prism_micrometer', true);
            return {
              id: 'prism_micrometer',
              label: `精密测角鼓轮与三棱镜工作台 (按住左右拖拽调节入射角 θ₁ = ${this.apparatus.incidentAngleDeg.toFixed(1)}°)`,
              cursor: 'ew-resize',
            };
          } else {
            this.apparatus.setKnobHovered('prism_micrometer', false);
            return {
              id: 'prism_micrometer',
              label: '',
              cursor: 'ew-resize',
            };
          }
        }

        if (id === 'collimator_arm' || cur.name === 'CollimatorArmGroup') {
          this.apparatus.setKnobHovered(null, false);
          return {
            id: 'collimator_arm',
            label: `平行白光狭缝准直管 (沿测角圆环拖拽旋转调节入射角 θ₁ = ${this.apparatus.incidentAngleDeg.toFixed(1)}°)`,
            cursor: 'grab',
          };
        }

        if (
          id === 'screen_handle' ||
          cur.name === 'ScreenCarrierGroup' ||
          cur.name === 'ScreenBoardMesh'
        ) {
          this.apparatus.setKnobHovered(null, false);
          const distMm = (this.apparatus.screenDistanceM * 1000).toFixed(0);
          return {
            id: 'screen_handle',
            label: `全景光谱接收屏滑座 (按住沿导轨拖拽调节屏距 L = ${distMm} mm)`,
            cursor: 'grab',
          };
        }

        if (id === 'screen_surface' || cur.name === 'ScreenSurfaceMesh') {
          this.apparatus.setKnobHovered(null, false);
          const telem = this.apparatus.getTelemetry();
          return {
            id: 'screen_surface',
            label: `色散彩虹光谱屏 · 角色散宽度 Δδ = ${telem.angularDispersionDeg.toFixed(2)}° (拖拽调节屏距 L)`,
            cursor: 'grab',
          };
        }

        cur = cur.parent;
      }
    }

    this.apparatus.setKnobHovered(null, false);
    return null;
  }

  /**
   * 鼠标/触控指针按下
   */
  public onPointerDown(event: PointerEvent, hit: THREE.Intersection | null): boolean {
    if (!hit) return false;

    let cur: THREE.Object3D | null = hit.object;
    let targetId = '';
    let targetObject: THREE.Object3D | null = null;

    while (cur && cur !== this.apparatus.group) {
      if (cur.userData?.interactiveId) {
        targetId = cur.userData.interactiveId;
        targetObject = cur;
        break;
      }
      if (cur.name === 'LaserPowerSwitch') {
        targetId = 'laser_power';
        targetObject = cur;
        break;
      }
      if (cur.name === 'SourceWhiteButton') {
        targetId = 'source_white';
        targetObject = cur;
        break;
      }
      if (cur.name === 'SourceSpectralLinesButton') {
        targetId = 'source_spectral_lines';
        targetObject = cur;
        break;
      }
      if (cur.name === 'MaterialTurretWheel' || cur.name.startsWith('MaterialGem_')) {
        targetId = 'prism_material_turret';
        targetObject = cur;
        break;
      }
      if (
        cur.name === 'RecombinationToggleKnob' ||
        cur.name === 'RecombinationCrystalPrismMesh' ||
        cur.name === 'RecombinationPivotArm'
      ) {
        targetId = 'recombination_toggle';
        targetObject = cur;
        break;
      }
      if (
        cur.name === 'PrismMicrometerKnob' ||
        cur.name === 'PrimaryCrystalPrismMesh' ||
        cur.name === 'PrismBottomPlateMesh' ||
        cur.name === 'PrismMicrometerGroup'
      ) {
        targetId = 'prism_micrometer';
        targetObject = cur;
        break;
      }
      if (cur.name === 'CollimatorArmGroup') {
        targetId = 'collimator_arm';
        targetObject = cur;
        break;
      }
      cur = cur.parent;
    }

    if (!targetId) return false;

    // 1. 光源电源开关
    if (targetId === 'laser_power') {
      const nextPower = !this.apparatus.laserPower;
      this.apparatus.setLaserPower(nextPower);
      this.callbacks.onLaserPowerToggle?.(nextPower);
      return true;
    }

    // 2. 复合白光连续光谱模式
    if (targetId === 'source_white') {
      this.apparatus.setSourceMode('white');
      this.callbacks.onSourceModeChange?.('white');
      return true;
    }

    // 3. 汞氦原子特征发射谱线模式
    if (targetId === 'source_spectral_lines') {
      this.apparatus.setSourceMode('spectral_lines');
      this.callbacks.onSourceModeChange?.('spectral_lines');
      return true;
    }

    // 4. 单色激光波长切换
    if (targetId.startsWith('laser_wavelength_')) {
      const wl = targetObject?.userData?.wavelength || 532;
      this.apparatus.setWavelength(wl);
      this.callbacks.onSourceModeChange?.('monochromatic');
      this.callbacks.onWavelengthChange?.(wl);
      return true;
    }

    // 5. 五档光学玻璃材质转换轮点击/拖拽旋转
    if (targetId === 'prism_material_turret') {
      this.hasInteractedWithTurret = true;
      this.apparatus.hideTurretHint();

      const gemIdx = targetObject?.userData?.gemIndex;
      if (typeof gemIdx === 'number' && gemIdx >= 0 && gemIdx < 5) {
        const nextMat = this.apparatus.setPrismMaterialIndex(gemIdx);
        this.callbacks.onPrismMaterialChange?.(nextMat);
      } else {
        const nextMat = this.apparatus.cycleNextPrismMaterial();
        this.callbacks.onPrismMaterialChange?.(nextMat);
      }

      this.dragMode = 'turret';
      this.hasDragMoved = false;
      this.dragStartClientX = event.clientX ?? 0;
      this.dragStartClientY = event.clientY ?? 0;
      this.dragStartTurretAngle = this.apparatus.currentTurretAngle;

      const normal = new THREE.Vector3(0, 0, 1).transformDirection(this.rootGroup.matrixWorld);
      const turretCenter = this.apparatus.getTurretCenterLocal();
      const turretCenterWorld = new THREE.Vector3(turretCenter.x, turretCenter.y, 0).applyMatrix4(
        this.rootGroup.matrixWorld
      );
      this.dragPlane.setFromNormalAndCoplanarPoint(normal, turretCenterWorld);
      this.dragStartPointerPos.copy(hit.point);
      return true;
    }

    // 6. 牛顿第二倒置复合三棱镜切入/移出点击
    if (targetId === 'recombination_toggle') {
      this.hasInteractedWithRecombination = true;
      this.apparatus.hideRecombinationHint();
      const nextEnabled = this.apparatus.toggleRecombinationPrism();
      this.callbacks.onRecombinationToggle?.(nextEnabled);
      return true;
    }

    // 7. 拖动三棱镜测角鼓轮或平行光管转臂 (连续调节入射角 θ1)
    if (targetId === 'prism_micrometer' || targetId === 'collimator_arm') {
      this.hasInteractedWithMicrometer = true;
      this.apparatus.hideMicrometerHint();
      this.dragMode = targetId === 'collimator_arm' ? 'collimator' : 'micrometer';
      this.hasDragMoved = false;
      this.dragStartClientX = event.clientX ?? 0;
      this.dragStartClientY = event.clientY ?? 0;
      this.dragStartIncidentAngle = this.apparatus.incidentAngleDeg;

      // 建立 Z=0 前向平面 (与 rootGroup 世界姿态同步)
      const normal = new THREE.Vector3(0, 0, 1).transformDirection(this.rootGroup.matrixWorld);
      const p1 = this.apparatus.getIncidentPointP1();
      const p1World = new THREE.Vector3(p1.x, p1.y, 0).applyMatrix4(this.rootGroup.matrixWorld);
      this.dragPlane.setFromNormalAndCoplanarPoint(normal, p1World);
      this.dragStartPointerPos.copy(hit.point);

      return true;
    }

    // 8. 拖动全景彩虹光谱屏滑座沿导轨移动 (调节屏距 L)
    if (targetId === 'screen_handle' || targetId === 'screen_surface') {
      this.dragMode = 'screen';
      this.hasDragMoved = false;
      this.dragStartScreenX = this.apparatus.getScreenCarrierX();

      const normal = new THREE.Vector3(0, 0, 1).transformDirection(this.rootGroup.matrixWorld);
      const centerWorld = new THREE.Vector3(
        this.dragStartScreenX,
        this.apparatus.prismCenterY,
        0
      ).applyMatrix4(this.rootGroup.matrixWorld);
      this.dragPlane.setFromNormalAndCoplanarPoint(normal, centerWorld);

      this.dragStartPointerPos.copy(hit.point);
      return true;
    }

    return false;
  }

  /**
   * 鼠标/触控指针移动
   */
  public onPointerMove(event: PointerEvent, raycaster: THREE.Raycaster): void {
    if (this.dragMode === 'none') return;
    this.hasDragMoved = true;

    // A. 准直管转臂沿 360° 激光测角圆环平滑圆周旋转
    if (this.dragMode === 'collimator') {
      const intersectPoint = new THREE.Vector3();
      if (raycaster && raycaster.ray && raycaster.ray.intersectPlane(this.dragPlane, intersectPoint)) {
        const invWorld = this.rootGroup.matrixWorld.clone().invert();
        const localPoint = intersectPoint.clone().applyMatrix4(invWorld);
        const p1 = this.apparatus.getIncidentPointP1();

        // 准直光从外部射向入射点 P1，光线方向为 (p1.x - localPoint.x, p1.y - localPoint.y)
        const dx = p1.x - localPoint.x;
        const dy = p1.y - localPoint.y;

        if (Math.hypot(dx, dy) > 0.02) {
          const psiIncRad = Math.atan2(dy, dx);
          const halfAlpha = THREE.MathUtils.degToRad(this.apparatus.apexAngleDeg * 0.5);
          const theta1Rad = psiIncRad + halfAlpha;
          const nextAngle = THREE.MathUtils.clamp(
            THREE.MathUtils.radToDeg(theta1Rad),
            25.0,
            80.0
          );
          this.apparatus.setIncidentAngle(nextAngle);
          this.callbacks.onIncidentAngleChange?.(
            this.apparatus.incidentAngleDeg,
            this.apparatus.getTelemetry()
          );
          return;
        }
      }

      // 备用屏幕像素拖拽
      const dx = (event.clientX ?? this.dragStartClientX) - this.dragStartClientX;
      const dy = (event.clientY ?? this.dragStartClientY) - this.dragStartClientY;
      const deltaAngle = (dx - dy * 0.6) * 0.14;
      const nextAngle = THREE.MathUtils.clamp(
        this.dragStartIncidentAngle + deltaAngle,
        25.0,
        80.0
      );
      this.apparatus.setIncidentAngle(nextAngle);
      this.callbacks.onIncidentAngleChange?.(
        this.apparatus.incidentAngleDeg,
        this.apparatus.getTelemetry()
      );
      return;
    }

    // B. 测微鼓轮旋转与微调
    if (this.dragMode === 'micrometer') {
      const clientX = event.clientX ?? this.dragStartClientX;
      const clientY = event.clientY ?? this.dragStartClientY;
      const dx = clientX - this.dragStartClientX;
      const dy = clientY - this.dragStartClientY;

      // 优先响应鼠标/指针像素横向或纵向拖拽
      if (Math.abs(dx) > 0 || Math.abs(dy) > 0) {
        const deltaAngle = (dx - dy * 0.6) * 0.14;
        const nextAngle = THREE.MathUtils.clamp(
          this.dragStartIncidentAngle + deltaAngle,
          25.0,
          80.0
        );
        this.apparatus.setIncidentAngle(nextAngle);
        this.callbacks.onIncidentAngleChange?.(
          this.apparatus.incidentAngleDeg,
          this.apparatus.getTelemetry()
        );
        return;
      }

      const intersectPoint = new THREE.Vector3();
      if (raycaster && raycaster.ray && raycaster.ray.intersectPlane(this.dragPlane, intersectPoint)) {
        const invWorld = this.rootGroup.matrixWorld.clone().invert();
        const localPoint = intersectPoint.clone().applyMatrix4(invWorld);
        const localStart = this.dragStartPointerPos.clone().applyMatrix4(invWorld);

        const deltaX = localPoint.x - localStart.x;
        const deltaY = localPoint.y - localStart.y;
        const deltaAngle = deltaX * 160.0 + deltaY * 100.0;
        const nextAngle = THREE.MathUtils.clamp(
          this.dragStartIncidentAngle + deltaAngle,
          25.0,
          80.0
        );
        this.apparatus.setIncidentAngle(nextAngle);
        this.callbacks.onIncidentAngleChange?.(
          this.apparatus.incidentAngleDeg,
          this.apparatus.getTelemetry()
        );
      }
      return;
    }

    // C. 材质五档转换轮拖拽旋转
    if (this.dragMode === 'turret') {
      const intersectPoint = new THREE.Vector3();
      if (raycaster && raycaster.ray && raycaster.ray.intersectPlane(this.dragPlane, intersectPoint)) {
        const invWorld = this.rootGroup.matrixWorld.clone().invert();
        const localPoint = intersectPoint.clone().applyMatrix4(invWorld);
        const localStart = this.dragStartPointerPos.clone().applyMatrix4(invWorld);
        const turretCenter = this.apparatus.getTurretCenterLocal();

        const curAngle = Math.atan2(localPoint.y - turretCenter.y, localPoint.x - turretCenter.x);
        const startAngle = Math.atan2(localStart.y - turretCenter.y, localStart.x - turretCenter.x);
        const deltaRot = curAngle - startAngle;

        this.apparatus.targetTurretAngle = this.dragStartTurretAngle + deltaRot;
      }
      return;
    }

    // D. 全景光谱屏沿导轨滑移
    if (this.dragMode === 'screen') {
      const intersectPoint = new THREE.Vector3();
      if (raycaster && raycaster.ray && raycaster.ray.intersectPlane(this.dragPlane, intersectPoint)) {
        const invWorld = this.rootGroup.matrixWorld.clone().invert();
        const localNow = intersectPoint.clone().applyMatrix4(invWorld);
        const localStart = this.dragStartPointerPos.clone().applyMatrix4(invWorld);
        const deltaX = localNow.x - localStart.x;

        this.apparatus.setScreenCarrierX(this.dragStartScreenX + deltaX);
        this.callbacks.onScreenDistanceChange?.(
          this.apparatus.screenDistanceM,
          this.apparatus.getTelemetry()
        );
      }
    }
  }

  /**
   * 鼠标/触控指针抬起
   */
  public onPointerUp(_event: PointerEvent): void {
    if (this.dragMode === 'turret' && this.hasDragMoved) {
      // 拖拽停止时自动吸附至最近的材质档位
      const step = (Math.PI * 2) / 5;
      let rawIdx = Math.round(this.apparatus.targetTurretAngle / step) % 5;
      if (rawIdx < 0) rawIdx += 5;
      const nextMat = this.apparatus.setPrismMaterialIndex(rawIdx);
      this.callbacks.onPrismMaterialChange?.(nextMat);
    }

    this.dragMode = 'none';
    this.hasDragMoved = false;
  }

  public onPointerCancel(_event?: PointerEvent): void {
    this.dragMode = 'none';
    this.hasDragMoved = false;
  }
}
