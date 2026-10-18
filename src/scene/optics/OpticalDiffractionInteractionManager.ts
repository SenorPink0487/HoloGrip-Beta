import * as THREE from 'three';
import {
  OpticalDiffractionBenchMesh,
  type DiffractionType,
  type OpticalDiffractionTelemetry,
} from './OpticalDiffractionBenchMesh.ts';

export interface OpticalDiffractionInteractionCallbacks {
  onDiffractionTypeChange?: (type: DiffractionType) => void;
  onWavelengthChange?: (wlNm: number) => void;
  onLaserPowerToggle?: (on: boolean) => void;
  onScreenDistanceChange?: (distM: number, telemetry: OpticalDiffractionTelemetry) => void;
  onSlitWidthChange?: (wMm: number) => void;
  onApertureDiameterChange?: (dMm: number) => void;
  onProfileCurveToggle?: (show: boolean) => void;
}

export class OpticalDiffractionInteractionManager {
  private bench: OpticalDiffractionBenchMesh;
  private rootGroup: THREE.Group;
  private callbacks: OpticalDiffractionInteractionCallbacks;

  // 拖拽状态
  private dragMode: 'none' | 'screen' | 'micrometer' = 'none';
  private dragPlane = new THREE.Plane();
  private dragStartScreenX = 0;
  private dragStartPointerPos = new THREE.Vector3();
  private dragStartClientX = 0;
  private dragStartSlitParam = 0;

  constructor(
    bench: OpticalDiffractionBenchMesh,
    rootGroup: THREE.Group,
    callbacks: OpticalDiffractionInteractionCallbacks = {}
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
      const distMm = (this.bench.screenDistanceM * 1000).toFixed(0);
      return {
        id: 'screen_handle',
        label: `滑动观测屏 · 狭缝至屏距 L = ${distMm} mm`,
        cursor: 'grabbing',
      };
    }

    if (this.dragMode === 'micrometer') {
      let lbl = '';
      if (this.bench.diffractionType === 'single') {
        lbl = `调节狭缝宽度: a = ${this.bench.slitWidthMm.toFixed(2)} mm`;
      } else if (this.bench.diffractionType === 'double') {
        lbl = `调节双缝间距: d = ${this.bench.slitDistanceMm.toFixed(2)} mm`;
      } else if (this.bench.diffractionType === 'circular') {
        lbl = `调节圆孔孔径: D = ${this.bench.apertureDiameterMm.toFixed(2)} mm`;
      } else {
        lbl = `光栅刻度密度: ${Math.round(this.bench.gratingLinesPerMm)} lines/mm`;
      }
      return {
        id: 'slit_micrometer',
        label: lbl,
        cursor: 'ew-resize',
      };
    }

    const hits = raycaster.intersectObjects(this.bench.group.children, true);
    if (hits.length === 0) return null;

    for (const hit of hits) {
      let cur: THREE.Object3D | null = hit.object;
      while (cur && cur !== this.bench.group) {
        const id = cur.userData?.interactiveId || cur.name;

        if (id === 'laser_power' || cur.name === 'LaserPowerSwitch') {
          return {
            id: 'laser_power',
            label: `激光电源开关 · 当前[${this.bench.laserPower ? '开启' : '关闭'}] (点击切换)`,
            cursor: 'pointer',
          };
        }

        if (id && id.startsWith('laser_wavelength_')) {
          const wl = cur.userData?.wavelength || 532;
          const colorName = wl === 650 ? '红光 (650nm)' : wl === 532 ? '绿光 (532nm)' : '蓝紫光 (405nm)';
          return {
            id,
            label: `切换激光波长 · ${colorName}`,
            cursor: 'pointer',
          };
        }

        if (id === 'slit_turret' || cur.name === 'SlitTurretWheel') {
          return {
            id: 'slit_turret',
            label: '旋转孔径转盘 (点击切换单缝 / 双缝 / 圆孔 / 衍射光栅)',
            cursor: 'pointer',
          };
        }

        if (id === 'slit_micrometer' || cur.name === 'SlitMicrometerKnob') {
          return {
            id: 'slit_micrometer',
            label: '狭缝测微鼓轮 (左右拖拽微调缝宽或孔径)',
            cursor: 'ew-resize',
          };
        }

        if (
          id === 'screen_handle' ||
          cur.name === 'ScreenHandleTop' ||
          cur.name === 'ScreenCarrierGroup'
        ) {
          const distMm = (this.bench.screenDistanceM * 1000).toFixed(0);
          return {
            id: 'screen_handle',
            label: `观测屏把手 (按住拖拽沿导轨滑动调节屏距 L = ${distMm} mm)`,
            cursor: 'grab',
          };
        }

        if (id === 'screen_surface' || cur.name === 'ScreenSurfaceMesh') {
          return {
            id: 'screen_surface',
            label: '衍射光电投影屏 (点击切换光强波形曲线显示)',
            cursor: 'pointer',
          };
        }

        cur = cur.parent;
      }
    }

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
      if (cur.name === 'SlitTurretWheel') {
        targetId = 'slit_turret';
        targetObject = cur;
        break;
      }
      if (cur.name === 'SlitMicrometerKnob') {
        targetId = 'slit_micrometer';
        targetObject = cur;
        break;
      }
      if (cur.name === 'ScreenHandleTop') {
        targetId = 'screen_handle';
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

    // 2. 激光波长切换
    if (targetId.startsWith('laser_wavelength_')) {
      const wl = targetObject?.userData?.wavelength || 532;
      this.bench.setWavelength(wl);
      this.callbacks.onWavelengthChange?.(wl);
      return true;
    }

    // 3. 孔径转盘旋转切换
    if (targetId === 'slit_turret') {
      this.bench.cycleNextDiffractionType();
      this.callbacks.onDiffractionTypeChange?.(this.bench.diffractionType);
      return true;
    }

    // 4. 屏幕表面点击：切换包络光强图显示
    if (targetId === 'screen_surface') {
      const nextShow = !this.bench.showProfileCurve;
      this.bench.showProfileCurve = nextShow;
      this.bench.updateScreenTexture();
      this.callbacks.onProfileCurveToggle?.(nextShow);
      return true;
    }

    // 5. 拖动测微鼓轮
    if (targetId === 'slit_micrometer') {
      this.dragMode = 'micrometer';
      this.dragStartClientX = event.clientX;
      if (this.bench.diffractionType === 'single') {
        this.dragStartSlitParam = this.bench.slitWidthMm;
      } else if (this.bench.diffractionType === 'double') {
        this.dragStartSlitParam = this.bench.slitDistanceMm;
      } else if (this.bench.diffractionType === 'circular') {
        this.dragStartSlitParam = this.bench.apertureDiameterMm;
      } else {
        this.dragStartSlitParam = this.bench.gratingLinesPerMm;
      }
      return true;
    }

    // 6. 拖动观测屏沿导轨横向滑行 (沿 X 轴)
    if (targetId === 'screen_handle' || targetId === 'screen_surface') {
      this.dragMode = 'screen';
      this.dragStartScreenX = this.bench.getScreenCarrierX();

      // 构建导轨正面拖拽参考平面 (过屏中心，法向量为世界 +Z 轴)
      const normal = new THREE.Vector3(0, 0, 1).transformDirection(this.rootGroup.matrixWorld);
      const centerWorld = new THREE.Vector3(this.dragStartScreenX, this.bench.beamHeightY, 0).applyMatrix4(this.rootGroup.matrixWorld);
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
        // 将平面交点变换回 rootGroup 局部坐标
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
      const deltaX = event.clientX - this.dragStartClientX;

      if (this.bench.diffractionType === 'single') {
        const newW = THREE.MathUtils.clamp(this.dragStartSlitParam + deltaX * 0.0005, 0.02, 0.25);
        this.bench.setSlitWidth(newW);
        this.callbacks.onSlitWidthChange?.(newW);
      } else if (this.bench.diffractionType === 'double') {
        const newD = THREE.MathUtils.clamp(this.dragStartSlitParam + deltaX * 0.001, 0.10, 0.60);
        this.bench.setSlitDistance(newD);
      } else if (this.bench.diffractionType === 'circular') {
        const newDia = THREE.MathUtils.clamp(this.dragStartSlitParam + deltaX * 0.001, 0.10, 0.60);
        this.bench.setApertureDiameter(newDia);
        this.callbacks.onApertureDiameterChange?.(newDia);
      } else if (this.bench.diffractionType === 'grating') {
        const newLines = THREE.MathUtils.clamp(this.dragStartSlitParam + deltaX * 2, 50, 1000);
        this.bench.setGratingDensity(newLines);
      }
      return;
    }
  }

  /**
   * 鼠标/触控指针松开
   */
  public onPointerUp(_event: PointerEvent): void {
    this.dragMode = 'none';
  }
}
