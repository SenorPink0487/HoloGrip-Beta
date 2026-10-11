import * as THREE from 'three';
import type { InductionBenchMesh } from './InductionBenchMesh.ts';
import type { ExperimentContext } from '../../core/types.ts';

export interface InductionInteractionCallbacks {
  bench: InductionBenchMesh;
  onMagnetMove?: (y: number, vy: number) => void;
  onMagnetRelease?: () => void;
  onToggleSwitch?: (closed: boolean) => void;
  onFlipMagnet?: () => void;
  onMagnetY?: (y: number) => void;
  onProbeY?: (y: number) => void;
  onFlipPole?: () => void;
  onCycleTurns?: () => void;
  onStartPass?: () => void;
}

export class InductionInteractionManager {
  private bench: InductionBenchMesh;
  private callbacks: InductionInteractionCallbacks;

  private isDraggingMagnet = false;
  private lastDragY = 0;
  private lastDragTime = 0;
  private magnetVelocityY = 0;

  private raycaster = new THREE.Raycaster();
  private ndc = new THREE.Vector2();
  private dragPlane = new THREE.Plane();
  private planeHitPoint = new THREE.Vector3();

  constructor(callbacks: InductionInteractionCallbacks) {
    this.bench = callbacks.bench;
    this.callbacks = callbacks;
  }

  public getHoverTarget(raycaster: THREE.Raycaster): { id: string; label: string; cursor?: string } | null {
    const hits = raycaster.intersectObjects(this.bench.group.children, true);
    if (hits.length === 0) return null;

    for (const hit of hits) {
      let obj: THREE.Object3D | null = hit.object;
      while (obj && obj !== this.bench.group) {
        if (obj === this.bench.barMagnetGroup) {
          return { id: 'bar-magnet', label: '条形磁铁 (上下拖拽插拔 / 点击翻转极性)', cursor: 'ns-resize' };
        }
        if (obj === this.bench.knifeSwitchGroup || obj === this.bench.switchBladeGroup) {
          return { id: 'knife-switch', label: '铜闸刀开关 (点击开闭电路)', cursor: 'pointer' };
        }
        if (obj === this.bench.galvanometer.group) {
          return { id: 'galvanometer', label: '微安级演示检流计 (满量程 ±300 µA)', cursor: 'default' };
        }
        obj = obj.parent;
      }
    }
    return null;
  }

  public onPointerDown(
    _event: PointerEvent,
    hit: THREE.Intersection | null,
    context: ExperimentContext
  ): boolean {
    if (!context?.camera) return false;

    this.lastDragTime = performance.now();

    // 1. 抓取磁铁
    if (this.isHitGroup(hit, this.bench.barMagnetGroup)) {
      this.isDraggingMagnet = true;
      this.lastDragY = this.bench.getMagnetHeight();
      this.setupVerticalDragPlane(context.camera, this.bench.barMagnetGroup.position);
      return true;
    }

    // 2. 闸刀开关点击
    if (this.isHitGroup(hit, this.bench.knifeSwitchGroup) || this.isHitGroup(hit, this.bench.switchBladeGroup)) {
      const nextClosed = this.bench.isSwitchOpen();
      this.bench.setSwitchClosed(nextClosed);
      this.callbacks.onToggleSwitch?.(nextClosed);
      return true;
    }

    return false;
  }

  public onPointerMove(
    event: PointerEvent,
    _hit?: THREE.Intersection | null,
    context?: ExperimentContext
  ): void {
    if (!this.isDraggingMagnet || !context?.camera) return;

    const now = performance.now();
    const dt = Math.max(0.001, (now - this.lastDragTime) / 1000.0);
    this.lastDragTime = now;

    const width = typeof window !== 'undefined' ? window.innerWidth : 1;
    const height = typeof window !== 'undefined' ? window.innerHeight : 1;
    this.ndc.set((event.clientX / width) * 2 - 1, -(event.clientY / height) * 2 + 1);
    this.raycaster.setFromCamera(this.ndc, context.camera);

    if (this.raycaster.ray.intersectPlane(this.dragPlane, this.planeHitPoint)) {
      const targetWorldY = this.planeHitPoint.y;
      const currentY = targetWorldY - this.bench.group.position.y;
      const clampedY = Math.max(-0.06, Math.min(0.36, currentY));

      const dy = clampedY - this.lastDragY;
      this.magnetVelocityY = dy / dt;
      this.lastDragY = clampedY;

      this.bench.setMagnetHeight(clampedY);
      this.callbacks.onMagnetMove?.(clampedY, this.magnetVelocityY);
      this.callbacks.onMagnetY?.(clampedY);
    }
  }

  public onPointerUp(_event?: PointerEvent, _context?: ExperimentContext): void {
    if (this.isDraggingMagnet) {
      this.isDraggingMagnet = false;
      this.callbacks.onMagnetRelease?.();
    }
  }

  private setupVerticalDragPlane(camera: THREE.Camera, centerPos: THREE.Vector3): void {
    const normal = new THREE.Vector3();
    camera.getWorldDirection(normal);
    normal.y = 0;
    normal.normalize();
    normal.negate();

    const worldCenter = centerPos.clone().applyMatrix4(this.bench.group.matrixWorld);
    this.dragPlane.setFromNormalAndCoplanarPoint(normal, worldCenter);
  }

  private isHitGroup(hit: THREE.Intersection | null, group: THREE.Object3D): boolean {
    if (!hit) return false;
    let obj: THREE.Object3D | null = hit.object;
    while (obj) {
      if (obj === group) return true;
      obj = obj.parent;
    }
    return false;
  }
}
