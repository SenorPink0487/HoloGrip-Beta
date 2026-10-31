import * as THREE from 'three';
import type { PrismMaterialType } from './OpticalPhysics.ts';
import {
  OpticalDispersionBenchMesh,
  type OpticalDispersionTelemetry,
} from './OpticalDispersionBenchMesh.ts';

export interface OpticalDispersionInteractionCallbacks {
  onLampToggle?: (on: boolean) => void;
  onIncidentAngleChange?: (deg: number) => void;
  onMaterialChange?: (material: PrismMaterialType) => void;
  onSlitWidthChange?: (mm: number) => void;
  onScreenDistanceChange?: (meters: number, telemetry: OpticalDispersionTelemetry) => void;
}

export class OpticalDispersionInteractionManager {
  private bench: OpticalDispersionBenchMesh;
  private rootGroup: THREE.Group;
  private callbacks: OpticalDispersionInteractionCallbacks;
  private dragMode: 'none' | 'prism' | 'screen' = 'none';
  private dragPlane = new THREE.Plane();
  private dragStartPointer = new THREE.Vector3();
  private dragStartDistance = 0;
  private dragDirection = new THREE.Vector3();
  private dragStartClientX = 0;
  private dragStartAngle = 0;

  constructor(
    bench: OpticalDispersionBenchMesh,
    rootGroup: THREE.Group,
    callbacks: OpticalDispersionInteractionCallbacks = {},
  ) {
    this.bench = bench;
    this.rootGroup = rootGroup;
    this.callbacks = callbacks;
  }

  public get isDragging(): boolean {
    return this.dragMode !== 'none';
  }

  public getHoverTarget(raycaster: THREE.Raycaster): { id: string; label: string; cursor?: string } | null {
    if (this.dragMode === 'screen') {
      return { id: 'screen_carrier', label: `滑动白屏 · 棱镜至屏 ${(this.bench.screenDistanceM * 1000).toFixed(0)} mm`, cursor: 'grabbing' };
    }
    if (this.dragMode === 'prism') {
      return { id: 'prism_turntable', label: `转动三棱镜 · 入射角 ${this.bench.incidentAngleDeg.toFixed(1)}°`, cursor: 'ew-resize' };
    }

    const hits = raycaster.intersectObjects(this.bench.getInteractiveObjects(), false);
    if (hits.length === 0) return null;

    let cur: THREE.Object3D | null = hits[0].object;
    while (cur && cur !== this.bench.group) {
      const id = cur.userData?.interactiveId as string | undefined;
      if (id === 'lamp_switch') {
        return { id, label: `白光灯 · ${this.bench.lampOn ? '开' : '关'}`, cursor: 'pointer' };
      }
      if (id === 'material_collar') {
        return { id, label: `棱镜材料 · ${this.bench.getTelemetry().materialName}`, cursor: 'pointer' };
      }
      if (id === 'prism_turntable') {
        return { id, label: `拖动三棱镜改变入射角 · ${this.bench.incidentAngleDeg.toFixed(1)}°`, cursor: 'ew-resize' };
      }
      if (id === 'screen_carrier') {
        return { id, label: `拖动白屏 · ${(this.bench.screenDistanceM * 1000).toFixed(0)} mm`, cursor: 'grab' };
      }
      cur = cur.parent;
    }
    return null;
  }

  public onPointerDown(event: PointerEvent, hit: THREE.Intersection | null): boolean {
    if (!hit) return false;
    let cur: THREE.Object3D | null = hit.object;
    let targetId = '';
    while (cur && cur !== this.bench.group) {
      if (cur.userData?.interactiveId) {
        targetId = cur.userData.interactiveId;
        break;
      }
      cur = cur.parent;
    }
    if (!targetId) return false;

    if (targetId === 'lamp_switch') {
      this.bench.setLampOn(!this.bench.lampOn);
      this.callbacks.onLampToggle?.(this.bench.lampOn);
      return true;
    }
    if (targetId === 'material_collar') {
      const next = this.bench.cycleMaterial();
      this.callbacks.onMaterialChange?.(next);
      return true;
    }
    if (targetId === 'prism_turntable') {
      this.dragMode = 'prism';
      this.dragStartClientX = event.clientX ?? 0;
      this.dragStartAngle = this.bench.incidentAngleDeg;
      return true;
    }
    if (targetId === 'screen_carrier') {
      this.dragMode = 'screen';
      this.dragStartDistance = this.bench.screenDistanceM;
      this.dragDirection.copy(this.bench.getProjection().screenNormal);
      const normal = new THREE.Vector3(0, 1, 0).transformDirection(this.rootGroup.matrixWorld);
      this.dragPlane.setFromNormalAndCoplanarPoint(normal, hit.point);
      this.dragStartPointer.copy(hit.point);
      return true;
    }
    return false;
  }

  public onPointerMove(event: PointerEvent, raycaster: THREE.Raycaster): void {
    if (this.dragMode === 'screen') {
      const point = new THREE.Vector3();
      if (!raycaster.ray.intersectPlane(this.dragPlane, point)) return;
      const inverse = new THREE.Matrix4().copy(this.rootGroup.matrixWorld).invert();
      const current = point.clone().applyMatrix4(inverse);
      const start = this.dragStartPointer.clone().applyMatrix4(inverse);
      this.bench.setScreenDistance(this.dragStartDistance + current.sub(start).dot(this.dragDirection));
      this.callbacks.onScreenDistanceChange?.(this.bench.screenDistanceM, this.bench.getTelemetry());
      return;
    }

    const locked = typeof document !== 'undefined' && document.pointerLockElement !== null;
    const clientX = event.clientX ?? 0;
    if (this.dragMode === 'prism') {
      const delta = locked ? (event.movementX ?? 0) * 0.15 : (clientX - this.dragStartClientX) * 0.15;
      const base = locked ? this.bench.incidentAngleDeg : this.dragStartAngle;
      this.bench.setIncidentAngle(base + delta);
      this.callbacks.onIncidentAngleChange?.(this.bench.incidentAngleDeg);
      return;
    }
  }

  public onPointerUp(_event: PointerEvent): void {
    this.dragMode = 'none';
  }
}
