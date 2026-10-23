import * as THREE from 'three';
import {
  OpticalDoubleSlitBenchMesh,
  type LightSourceMode,
  type OpticalDoubleSlitTelemetry,
} from './OpticalDoubleSlitBenchMesh.ts';

export interface OpticalDoubleSlitInteractionCallbacks {
  onLightSourceModeChange?: (mode: LightSourceMode) => void;
  onWavelengthChange?: (wlNm: number) => void;
  onLaserPowerToggle?: (on: boolean) => void;
  onScreenDistanceChange?: (distM: number, telemetry: OpticalDoubleSlitTelemetry) => void;
  onSlitDistanceChange?: (dMm: number) => void;
  onSlitWidthChange?: (aMm: number) => void;
}

export class OpticalDoubleSlitInteractionManager {
  private bench: OpticalDoubleSlitBenchMesh;
  private rootGroup: THREE.Group;
  private callbacks: OpticalDoubleSlitInteractionCallbacks;

  // 拖拽状态
  private dragMode: 'none' | 'screen' | 'micrometer' = 'none';
  private dragPlane = new THREE.Plane();
  private dragStartScreenX = 0;
  private dragStartPointerPos = new THREE.Vector3();
  private dragStartClientX = 0;
  private dragStartSlitDistance = 0;

  // 交互引导提示生命周期状态 (未接触前呈现悬浮提示与 3D 光晕环，交互后彻底消失)
  private hasInteractedWithMicrometer = false;
  private hasInteractedWithTurret = false;

  constructor(
    bench: OpticalDoubleSlitBenchMesh,
    rootGroup: THREE.Group,
    callbacks: OpticalDoubleSlitInteractionCallbacks = {}
  ) {
    this.bench = bench;
    this.rootGroup = rootGroup;
    this.callbacks = callbacks;
  }

  public get isDragging(): boolean {
    return this.dragMode !== 'none';
  }

  /**
   * 射线检测悬停目标 (供 Engine.ts 准星 / 鼠标光标与原生 HUD 提示)
   */
  public getHoverTarget(raycaster: THREE.Raycaster): { id: string; label: string; cursor?: string } | null {
    if (this.dragMode === 'screen') {
      this.bench.setKnobHovered(null, false);
      const distMm = (this.bench.screenDistanceM * 1000).toFixed(0);
      const spacingMm = this.bench.getFringeSpacingMm().toFixed(2);
      return {
        id: 'screen_handle',
        label: `滑动干涉观测屏 · 双缝至屏距 L = ${distMm} mm (条纹间距 Δy = ${spacingMm} mm)`,
        cursor: 'grabbing',
      };
    }

    if (this.dragMode === 'micrometer') {
      this.bench.setKnobHovered(null, false);
      return {
        id: 'slit_micrometer',
        label: this.hasInteractedWithMicrometer
          ? ''
          : `精密测微杨氏双缝仪 · 双缝间距 d = ${this.bench.slitDistanceMm.toFixed(2)} mm`,
        cursor: 'ew-resize',
      };
    }

    const targets = typeof (this.bench as any).getInteractiveObjects === 'function'
      ? (this.bench as any).getInteractiveObjects()
      : this.bench.group.children;
    const hits = raycaster.intersectObjects(targets, true);
    if (hits.length === 0) {
      this.bench.setKnobHovered(null, false);
      return null;
    }

    for (const hit of hits) {
      let cur: THREE.Object3D | null = hit.object;
      while (cur && cur !== this.bench.group) {
        const id = cur.userData?.interactiveId || cur.name;

        if (id === 'laser_power' || cur.name === 'LaserPowerSwitch') {
          this.bench.setKnobHovered(null, false);
          return {
            id: 'laser_power',
            label: `激光电源开关 · 当前[${this.bench.laserPower ? '开启' : '关闭'}] (点击切换)`,
            cursor: 'pointer',
          };
        }

        if (id === 'laser_white_light' || cur.name === 'LaserWhiteLightButton') {
          this.bench.setKnobHovered(null, false);
          const isWhite = this.bench.lightSourceMode === 'white';
          return {
            id: 'laser_white_light',
            label: `复合白光相干模式 · 当前[${isWhite ? '白光彩色干涉' : '单色激光'}] (点击切换)`,
            cursor: 'pointer',
          };
        }

        if (id && id.startsWith('laser_wavelength_')) {
          this.bench.setKnobHovered(null, false);
          const wl = cur.userData?.wavelength || 532;
          const colorName = wl === 650 ? '红光 (650nm)' : wl === 532 ? '绿光 (532nm)' : '蓝紫光 (405nm)';
          return {
            id,
            label: `切换相干激光波长 · ${colorName}`,
            cursor: 'pointer',
          };
        }

        if (id === 'slit_turret' || cur.name === 'SlitTurretWheel') {
          if (!this.hasInteractedWithTurret) {
            this.bench.setKnobHovered('slit_turret', true);
            return {
              id: 'slit_turret',
              label: `精密四档双缝转换轮 · 当前[d = ${this.bench.slitDistanceMm.toFixed(2)} mm] (点击切换标准双缝间距档位)`,
              cursor: 'pointer',
            };
          } else {
            this.bench.setKnobHovered('slit_turret', false);
            return {
              id: 'slit_turret',
              label: '',
              cursor: 'pointer',
            };
          }
        }

        if (
          id === 'slit_micrometer' ||
          cur.name === 'SlitMicrometerKnob' ||
          cur.name === 'SlitLeftJaw' ||
          cur.name === 'SlitRightJaw' ||
          cur.name === 'DoubleSlitCenterBridge' ||
          cur.name === 'MicrometerThimbleGroup' ||
          cur.name === 'AdjustableDoubleSlitStage'
        ) {
          if (!this.hasInteractedWithMicrometer) {
            this.bench.setKnobHovered('slit_micrometer', true);
            return {
              id: 'slit_micrometer',
              label: `精密测微可调双缝仪 (按住左右拖拽微调双缝间距 d = ${this.bench.slitDistanceMm.toFixed(2)} mm)`,
              cursor: 'ew-resize',
            };
          } else {
            this.bench.setKnobHovered('slit_micrometer', false);
            return {
              id: 'slit_micrometer',
              label: '',
              cursor: 'ew-resize',
            };
          }
        }

        if (
          id === 'screen_handle' ||
          cur.name === 'ScreenCarrierGroup' ||
          cur.name === 'ScreenBoardMesh'
        ) {
          this.bench.setKnobHovered(null, false);
          const distMm = (this.bench.screenDistanceM * 1000).toFixed(0);
          return {
            id: 'screen_handle',
            label: `干涉观测屏滑座 (按住拖拽沿导轨滑动调节屏距 L = ${distMm} mm)`,
            cursor: 'grab',
          };
        }

        if (id === 'screen_surface' || cur.name === 'ScreenSurfaceMesh') {
          this.bench.setKnobHovered(null, false);
          const distMm = (this.bench.screenDistanceM * 1000).toFixed(0);
          const spacingMm = this.bench.getFringeSpacingMm().toFixed(2);
          return {
            id: 'screen_surface',
            label: `杨氏双缝干涉条纹 · Δy = ${spacingMm} mm (拖拽滑动调节屏距 L = ${distMm} mm)`,
            cursor: 'grab',
          };
        }

        cur = cur.parent;
      }
    }

    this.bench.setKnobHovered(null, false);
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

    while (cur && cur !== this.bench.group) {
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
      if (cur.name === 'LaserWhiteLightButton') {
        targetId = 'laser_white_light';
        targetObject = cur;
        break;
      }
      if (
        cur.name === 'SlitMicrometerKnob' ||
        cur.name === 'SlitLeftJaw' ||
        cur.name === 'SlitRightJaw' ||
        cur.name === 'DoubleSlitCenterBridge' ||
        cur.name === 'MicrometerThimbleGroup'
      ) {
        targetId = 'slit_micrometer';
        targetObject = cur;
        break;
      }
      if (cur.name === 'SlitTurretWheel') {
        targetId = 'slit_turret';
        targetObject = cur;
        break;
      }
      cur = cur.parent;
    }

    if (!targetId) return false;

    // 1. 激光电源开关
    if (targetId === 'laser_power') {
      const nextPower = !this.bench.laserPower;
      this.bench.setLaserPower(nextPower);
      this.callbacks.onLaserPowerToggle?.(nextPower);
      return true;
    }

    // 2. 复合白光干涉模式切换
    if (targetId === 'laser_white_light') {
      this.bench.toggleWhiteLightMode();
      this.callbacks.onLightSourceModeChange?.(this.bench.lightSourceMode);
      return true;
    }

    // 3. 单色激光波长切换
    if (targetId.startsWith('laser_wavelength_')) {
      const wl = targetObject?.userData?.wavelength || 532;
      this.bench.setWavelength(wl);
      this.callbacks.onLightSourceModeChange?.('monochromatic');
      this.callbacks.onWavelengthChange?.(wl);
      return true;
    }

    // 4. 双缝四档校准转盘点击
    if (targetId === 'slit_turret') {
      this.hasInteractedWithTurret = true;
      this.bench.hideTurretHint();
      this.bench.cycleNextSlitPreset();
      this.callbacks.onSlitDistanceChange?.(this.bench.slitDistanceMm);
      return true;
    }

    // 5. 拖动双缝测微鼓轮 (连续微调双缝间距 d)
    if (targetId === 'slit_micrometer') {
      this.hasInteractedWithMicrometer = true;
      this.bench.hideMicrometerHint();
      this.dragMode = 'micrometer';
      this.dragStartClientX = event.clientX ?? 0;
      this.dragStartSlitDistance = this.bench.slitDistanceMm;
      return true;
    }

    // 6. 拖动观测屏沿导轨横向滑行 (沿 X 轴调节屏距 L)
    if (targetId === 'screen_handle' || targetId === 'screen_surface') {
      this.dragMode = 'screen';
      this.dragStartScreenX = this.bench.getScreenCarrierX();

      const normal = new THREE.Vector3(0, 0, 1).transformDirection(this.rootGroup.matrixWorld);
      const centerWorld = new THREE.Vector3(this.dragStartScreenX, this.bench.beamHeightY, 0).applyMatrix4(
        this.rootGroup.matrixWorld
      );
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
    if (this.dragMode === 'screen') {
      const planeIntersection = new THREE.Vector3();
      if (raycaster.ray.intersectPlane(this.dragPlane, planeIntersection)) {
        const invMatrix = new THREE.Matrix4().copy(this.rootGroup.matrixWorld).invert();
        const localCurrent = planeIntersection.clone().applyMatrix4(invMatrix);
        const localStart = this.dragStartPointerPos.clone().applyMatrix4(invMatrix);

        const deltaX = localCurrent.x - localStart.x;
        const newX = this.dragStartScreenX + deltaX;

        this.bench.setScreenCarrierX(newX);
        this.callbacks.onScreenDistanceChange?.(this.bench.screenDistanceM, this.bench.getTelemetry());
      }
      return;
    }

    if (this.dragMode === 'micrometer') {
      const isLocked = typeof document !== 'undefined' && document.pointerLockElement !== null;
      const clientX = event.clientX ?? 0;
      const delta = isLocked
        ? (event.movementX ?? 0) * 0.0010
        : (clientX - this.dragStartClientX) * 0.0010;

      const baseVal = isLocked ? this.bench.slitDistanceMm : this.dragStartSlitDistance;
      const newD = THREE.MathUtils.clamp(baseVal + delta, 0.12, 0.60);

      this.bench.setSlitDistance(newD);
      this.callbacks.onSlitDistanceChange?.(newD);
      return;
    }
  }

  /**
   * 鼠标/触控指针松开
   */
  public onPointerUp(_event: PointerEvent): void {
    this.dragMode = 'none';
    this.bench.setKnobHovered(null, false);
  }
}
