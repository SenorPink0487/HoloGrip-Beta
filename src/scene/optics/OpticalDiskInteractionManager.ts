import * as THREE from 'three';
import { OpticalDiskApparatusMesh, type OpticalTelemetry } from './OpticalDiskApparatusMesh.ts';

export interface OpticalDiskInteractionCallbacks {
  onAngleChange?: (angleDeg: number, telemetry: OpticalTelemetry) => void;
  onDirectionToggle?: (isAirToWater: boolean) => void;
}

export class OpticalDiskInteractionManager {
  private apparatus: OpticalDiskApparatusMesh;
  private rootGroup: THREE.Group;
  private callbacks: OpticalDiskInteractionCallbacks;

  private isDraggingLaser = false;
  private isHovered = false;
  private dragPlane = new THREE.Plane();
  private raycasterPlanePoint = new THREE.Vector3();

  constructor(
    apparatus: OpticalDiskApparatusMesh,
    rootGroup: THREE.Group,
    callbacks: OpticalDiskInteractionCallbacks = {}
  ) {
    this.apparatus = apparatus;
    this.rootGroup = rootGroup;
    this.callbacks = callbacks;
  }

  public get isDragging(): boolean {
    return this.isDraggingLaser;
  }

  /**
   * 射线检测悬停目标 (供 Engine.ts 的十字准星与 HUD 工具提示使用)
   */
  public getHoverTarget(raycaster: THREE.Raycaster): { id: string; label: string; cursor?: string } | null {
    if (this.isDraggingLaser) {
      return {
        id: 'laser_handle',
        label: `入射角: ${Math.abs(this.apparatus.incidentAngleDeg).toFixed(1)}° (${this.apparatus.isAirToWater ? '空气→水' : '水→空气'})`,
        cursor: 'grabbing',
      };
    }

    const hits = raycaster.intersectObjects(this.apparatus.group.children, true);
    if (hits.length === 0) {
      this.isHovered = false;
      return null;
    }

    for (const hit of hits) {
      let cur: THREE.Object3D | null = hit.object;
      while (cur && cur !== this.apparatus.group) {
        if (cur.name === 'LaserHandleHit' || cur.userData?.isLaserHandle || cur.name === 'LaserCarriage') {
          this.isHovered = true;
          return {
            id: 'laser_handle',
            label: '激光发射器 (按住拖拽旋转调节入射角)',
            cursor: 'grab',
          };
        }
        cur = cur.parent;
      }
    }

    this.isHovered = false;
    return null;
  }

  /**
   * 鼠标/触控指针按下
   */
  public onPointerDown(event: PointerEvent, hit: THREE.Intersection | null): boolean {
    if (!hit) return false;

    let targetIsLaser = false;
    let cur: THREE.Object3D | null = hit.object;
    while (cur && cur !== this.apparatus.group) {
      if (cur.name === 'LaserHandleHit' || cur.userData?.isLaserHandle || cur.name === 'LaserCarriage') {
        targetIsLaser = true;
        break;
      }
      cur = cur.parent;
    }

    if (targetIsLaser) {
      this.isDraggingLaser = true;
      // 设置圆盘所在的前向平面 (法向量为 rootGroup 旋转后的世界前向 +Z 轴)
      const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(this.rootGroup.quaternion);
      const centerWorld = new THREE.Vector3(0, this.apparatus.diskCenterY, 0).applyMatrix4(this.rootGroup.matrixWorld);
      this.dragPlane.setFromNormalAndCoplanarPoint(normal, centerWorld);
      return true; // 拦截事件，触发 Engine.ts 锁定指针并关闭自由转头
    }

    return false;
  }

  /**
   * 鼠标/触控指针拖拽移动
   */
  public onPointerMove(event: PointerEvent, raycaster: THREE.Raycaster): void {
    if (!this.isDraggingLaser) return;

    const hit = raycaster.ray.intersectPlane(this.dragPlane, this.raycasterPlanePoint);
    if (!hit) return;

    // 转换到 rootGroup 内部局部坐标系
    const localPoint = this.raycasterPlanePoint.clone().applyMatrix4(this.rootGroup.matrixWorld.clone().invert());

    // 相对圆盘中心 (0, diskCenterY) 的局部平面夹角
    const dx = localPoint.x;
    const dy = localPoint.y - this.apparatus.diskCenterY;

    // 计算极坐标角 (-PI ~ PI)
    const angleRad = Math.atan2(dy, dx);
    const angleDeg = THREE.MathUtils.radToDeg(angleRad);

    // 根据指针所在的上下半部动态判断入射方向
    // Y > 0: 上半球 (空气 -> 水); Y < 0: 下半球 (水 -> 空气)
    const isInUpperHalf = dy >= 0;
    if (isInUpperHalf !== this.apparatus.isAirToWater) {
      this.apparatus.setIncidentDirection(isInUpperHalf);
      this.callbacks.onDirectionToggle?.(isInUpperHalf);
    }

    // 计算相对于法线的偏角 (0° ~ 85°)
    // 上半部法线为 90°(正上方)，下半部法线为 -90°(正下方)
    let newAngleDeg = 0;
    if (isInUpperHalf) {
      // 90° 为法线。dx < 0 为左侧入射(正角)，dx > 0 为右侧入射(负角)
      newAngleDeg = 90 - angleDeg;
    } else {
      // -90° 为法线。
      newAngleDeg = -90 - angleDeg;
      if (newAngleDeg < -180) newAngleDeg += 360;
    }

    // 限制在 -85° ~ +85° 范围内，防止贴合分界面产生奇点
    newAngleDeg = Math.max(-85.0, Math.min(85.0, newAngleDeg));

    this.apparatus.setIncidentAngle(newAngleDeg);
    const telemetry = this.apparatus.updateOpticalPaths();
    this.callbacks.onAngleChange?.(newAngleDeg, telemetry);
  }

  /**
   * 鼠标/触控指针松开
   */
  public onPointerUp(event: PointerEvent): void {
    this.isDraggingLaser = false;
  }
}
