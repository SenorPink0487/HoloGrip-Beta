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
  private dragAngleOffsetRad = 0;

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
        label: `入射角: ${Math.round(Math.abs(this.apparatus.incidentAngleDeg))}° (${this.apparatus.isAirToWater ? '空气→水' : '水→空气'})`,
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
        if (
          cur.name === 'LaserHandleHit' ||
          cur.userData?.isLaserHandle ||
          cur.name === 'LaserCarriage' ||
          cur.name === 'IncidentBeamHit' ||
          cur.name === 'IncidentLaserBeam' ||
          cur.name === 'IncidentLaserGlow' ||
          cur.name === 'IncidentAngleBadge' ||
          cur.name === 'IncidentAngleArc' ||
          cur.name === 'IncidentAngleFan' ||
          cur.userData?.isIncidentBeam
        ) {
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
  public onPointerDown(event: PointerEvent, hit: THREE.Intersection | null, raycaster?: THREE.Raycaster): boolean {
    if (!hit) return false;

    const normal = new THREE.Vector3(0, 0, 1).transformDirection(this.rootGroup.matrixWorld);
    const centerWorld = new THREE.Vector3(0, this.apparatus.diskCenterY, 0).applyMatrix4(this.rootGroup.matrixWorld);
    this.dragPlane.setFromNormalAndCoplanarPoint(normal, centerWorld);
    const planePoint = raycaster?.ray.intersectPlane(this.dragPlane, this.raycasterPlanePoint);

    let targetIsLaser = false;
    let cur: THREE.Object3D | null = hit.object;

    // 1. 直接命中激光发射器构件、光束、角标或触控碰撞体
    while (cur && cur !== this.apparatus.group) {
      if (
        cur.name === 'LaserHandleHit' ||
        cur.userData?.isLaserHandle ||
        cur.name === 'LaserCarriage' ||
        cur.name === 'IncidentBeamHit' ||
        cur.name === 'IncidentLaserBeam' ||
        cur.name === 'IncidentLaserGlow' ||
        cur.name === 'IncidentAngleBadge' ||
        cur.name === 'IncidentAngleArc' ||
        cur.name === 'IncidentAngleFan' ||
        cur.userData?.isIncidentBeam
      ) {
        targetIsLaser = true;
        break;
      }
      cur = cur.parent;
    }

    // 2. 触控屏高宽容度拾取：当点击落在分度盘底盘、滑轨或发射器附近时智能识别
    if (!targetIsLaser && hit.point) {
      // A THREE.Line hit reports a point on the line, not necessarily under the
      // finger. Use the actual pointer's projection for proximity picking.
      const localPoint = this.rootGroup.worldToLocal((planePoint ?? hit.point).clone());
      const dx = localPoint.x;
      const dy = localPoint.y - this.apparatus.diskCenterY;
      const distFromCenter = Math.hypot(dx, dy);

      // 发射器当前在局部坐标系中的中心点
      const laserAngleRad = this.apparatus.isAirToWater
        ? THREE.MathUtils.degToRad(90 - this.apparatus.incidentAngleDeg)
        : THREE.MathUtils.degToRad(-90 + this.apparatus.incidentAngleDeg);
      const laserX = Math.cos(laserAngleRad) * this.apparatus.railRadius;
      const laserY = Math.sin(laserAngleRad) * this.apparatus.railRadius;
      const distToLaser = Math.hypot(dx - laserX, dy - laserY);

      const isTouch = event.pointerType === 'touch';
      const touchAngleRad = Math.atan2(dy, dx);
      let angleDiff = Math.abs(touchAngleRad - laserAngleRad);
      if (angleDiff > Math.PI) angleDiff = 2 * Math.PI - angleDiff;

      // A. 点击在发射器近周（手指贴边触碰）
      if (distToLaser <= (isTouch ? 0.22 : 0.12)) {
        targetIsLaser = true;
      }
      // B. 点击在外圈刻度/导轨区域，且角度与发射器接近
      else if (distFromCenter >= 0.20 && distFromCenter <= 0.44 && angleDiff <= THREE.MathUtils.degToRad(isTouch ? 45 : 25)) {
        targetIsLaser = true;
      }
    }

    if (targetIsLaser) {
      this.isDraggingLaser = true;
      // Preserve the angular grab offset, including a near-miss touch rescued
      // by a neighbouring ray. Pressing a barrel/beam must never teleport it.
      const startPoint = planePoint ?? hit.point;
      const localPoint = this.rootGroup.worldToLocal(startPoint.clone());
      const pointerAngle = Math.atan2(localPoint.y - this.apparatus.diskCenterY, localPoint.x);
      const emitterAngle = THREE.MathUtils.degToRad(this.apparatus.isAirToWater
        ? 90 - this.apparatus.incidentAngleDeg : -90 + this.apparatus.incidentAngleDeg);
      this.dragAngleOffsetRad = emitterAngle - pointerAngle;

      return true; // 拦截事件，触发 Engine.ts 锁定指针并关闭自由转头
    }

    return false;
  }

  /**
   * 根据前向平面交点更新入射角度及遥测
   */
  private updateAngleFromPlanePoint(worldPoint: THREE.Vector3): void {
    // 转换到 rootGroup 内部局部坐标系
    const localPoint = worldPoint.clone().applyMatrix4(this.rootGroup.matrixWorld.clone().invert());

    // 相对圆盘中心 (0, diskCenterY) 的局部平面夹角
    const dx = localPoint.x;
    const dy = localPoint.y - this.apparatus.diskCenterY;

    // 防止在圆心极近处产生奇异点与角度跳变
    if (Math.hypot(dx, dy) < 0.03) return;

    // 计算极坐标角 (-PI ~ PI)
    const angleRad = Math.atan2(dy, dx) + this.dragAngleOffsetRad;
    const angleDeg = THREE.MathUtils.radToDeg(Math.atan2(Math.sin(angleRad), Math.cos(angleRad)));

    // 根据指针所在的上下半部动态判断入射方向
    // Y > 0: 上半球 (空气 -> 水); Y < 0: 下半球 (水 -> 空气)
    const isInUpperHalf = Math.sin(angleRad) >= 0;
    if (isInUpperHalf !== this.apparatus.isAirToWater) {
      this.apparatus.setIncidentDirection(isInUpperHalf);
      this.callbacks.onDirectionToggle?.(isInUpperHalf);
    }

    // 计算相对于法线的偏角 (0° ~ 85°)
    // 上半部法线为 90°(正上方)，下半部法线为 -90°(正下方)
    let newAngleDeg = 0;
    if (isInUpperHalf) {
      // 上半部：90° 为法线。dx > 0 时 angleDeg 在 (0, 90)，newAngleDeg > 0；dx < 0 时 angleDeg 在 (90, 180)，newAngleDeg < 0
      newAngleDeg = 90 - angleDeg;
    } else {
      // 下半部：-90° 为法线。dx > 0 时 angleDeg 在 (-90, 0)，newAngleDeg > 0；dx < 0 时 angleDeg 在 (-180, -90)，newAngleDeg < 0
      newAngleDeg = angleDeg + 90;
    }

    // 0 点处适当吸附效果 (磁吸感 ±2° 阈值自动吸附至 0°，离开后恢复平滑整数调节)
    if (Math.abs(newAngleDeg) <= 2.0) {
      newAngleDeg = 0;
    } else {
      newAngleDeg = Math.round(newAngleDeg);
    }

    // 限制在 -85° ~ +85° 范围内，防止贴合分界面产生奇点
    newAngleDeg = Math.max(-85, Math.min(85, newAngleDeg));

    this.apparatus.setIncidentAngle(newAngleDeg);
    const telemetry = this.apparatus.updateOpticalPaths();
    this.callbacks.onAngleChange?.(newAngleDeg, telemetry);
  }

  /**
   * 鼠标/触控指针拖拽移动
   */
  public onPointerMove(event: PointerEvent, raycaster: THREE.Raycaster): void {
    if (!this.isDraggingLaser) return;

    const hit = raycaster.ray.intersectPlane(this.dragPlane, this.raycasterPlanePoint);
    if (!hit) return;

    this.updateAngleFromPlanePoint(this.raycasterPlanePoint);
  }

  /**
   * 鼠标/触控指针松开
   */
  public onPointerUp(event: PointerEvent): void {
    this.isDraggingLaser = false;
  }

  /**
   * 触控指针取消或手势中断
   */
  public onPointerCancel(event?: PointerEvent): void {
    this.isDraggingLaser = false;
  }
}
