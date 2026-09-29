import * as THREE from 'three';
import type { ExperimentContext } from '../../core/types.ts';
import { localPointOnBenchFace } from './benchDrag.ts';
import { DEFAULT_CHARGE_ELEVATION } from '../../physics/em/electrostatic.ts';
import type { FieldBenchMesh } from './FieldBenchMesh.ts';

export interface FieldInteractionCallbacks {
  bench: FieldBenchMesh;
  onSelectCharge: (chargeId: string) => void;
  onDeselect: () => void;
  onMoveCharge: (chargeId: string, x: number, y: number) => void;
  onMoveTestCharge?: (x: number, y: number) => void;
  onAddChargeAt?: (x: number, y: number, q: number) => void;
}

export class FieldInteractionManager {
  private callbacks: FieldInteractionCallbacks;
  private dragTarget: { type: 'charge'; id: string } | { type: 'test_charge' } | null = null;
  private hasMoved = false;
  private lastClickTime = 0;
  private tempVec = new THREE.Vector3();

  constructor(callbacks: FieldInteractionCallbacks) {
    this.callbacks = callbacks;
  }

  private findClosestChargeUnderPointer(
    clientX: number,
    clientY: number,
    camera: THREE.Camera,
  ): { id: string; pixelDist: number } | null {
    const width = typeof window !== 'undefined' ? window.innerWidth : 800;
    const height = typeof window !== 'undefined' ? window.innerHeight : 800;

    let closestId: string | null = null;
    let minPixelDist = Infinity;

    for (const [id, mesh] of this.callbacks.bench.chargeMeshes.entries()) {
      mesh.getWorldPosition(this.tempVec);
      this.tempVec.project(camera);
      // 位于相机后方
      if (this.tempVec.z > 1.0) continue;

      const sx = (this.tempVec.x * 0.5 + 0.5) * width;
      const sy = (-this.tempVec.y * 0.5 + 0.5) * height;
      const dist = Math.hypot(clientX - sx, clientY - sy);

      if (dist < minPixelDist) {
        minPixelDist = dist;
        closestId = id;
      }
    }

    if (closestId) {
      return { id: closestId, pixelDist: minPixelDist };
    }
    return null;
  }

  public getHoverTarget(raycaster: THREE.Raycaster): { id: string; label: string; cursor?: string } | null {
    // 1. 检查试探电荷探针悬停
    if (this.callbacks.bench.testChargeGroup.visible) {
      const probeHits = raycaster.intersectObject(this.callbacks.bench.testChargeGroup, true);
      if (probeHits.length > 0) {
        return {
          id: 'test_charge',
          label: '试探电荷 q₀ (拖拽探测空间各点电场强度 E 与电势 V)',
          cursor: this.dragTarget?.type === 'test_charge' ? 'grabbing' : 'grab',
        };
      }
    }

    // 2. 光线投射检测源电荷网格拾取
    const chargeHits = raycaster.intersectObject(this.callbacks.bench.chargesGroup, true);
    if (chargeHits.length > 0) {
      let obj: THREE.Object3D | null = chargeHits[0].object;
      let chargeId: string | null = null;
      while (obj && obj !== this.callbacks.bench.chargesGroup) {
        if (obj.userData?.chargeId) {
          chargeId = obj.userData.chargeId;
          break;
        }
        obj = obj.parent;
      }
      if (chargeId) {
        return {
          id: chargeId,
          label: '点电荷 (按住鼠标拖拽移动位置)',
          cursor: this.dragTarget?.type === 'charge' ? 'grabbing' : 'grab',
        };
      }
    }

    // 3. 检查实验底座平台悬停
    const platHits = raycaster.intersectObject(this.callbacks.bench.platform, false);
    if (platHits.length > 0) {
      return {
        id: 'platform',
        label: '静电场空间 (双击添加正电荷)',
        cursor: 'default',
      };
    }

    return null;
  }

  public onPointerDown(
    event: PointerEvent,
    _hit: THREE.Intersection | null,
    context: ExperimentContext,
  ): boolean {
    this.hasMoved = false;

    // 1. 高容差屏幕空间试探电荷探针拾取（半径 56px）
    if (context.camera && this.callbacks.bench.testChargeGroup.visible) {
      this.callbacks.bench.testChargeGroup.getWorldPosition(this.tempVec);
      this.tempVec.project(context.camera);
      if (this.tempVec.z <= 1.0) {
        const width = typeof window !== 'undefined' ? window.innerWidth : 800;
        const height = typeof window !== 'undefined' ? window.innerHeight : 800;
        const sx = (this.tempVec.x * 0.5 + 0.5) * width;
        const sy = (-this.tempVec.y * 0.5 + 0.5) * height;
        const dist = Math.hypot(event.clientX - sx, event.clientY - sy);
        if (dist < 56) {
          this.dragTarget = { type: 'test_charge' };
          return true;
        }
      }
    }

    // 2. 高容差屏幕空间源电荷拾取（半径 52px）
    if (context.camera) {
      const closest = this.findClosestChargeUnderPointer(event.clientX, event.clientY, context.camera);
      if (closest && closest.pixelDist < 52) {
        this.dragTarget = { type: 'charge', id: closest.id };
        this.callbacks.onSelectCharge(closest.id);
        return true;
      }
    }

    // 3. 兜底方案：试探电荷直接 3D 光线投射拾取
    if (context.camera && this.callbacks.bench.testChargeGroup.visible) {
      const probeHits = this.intersect(event, context.camera, this.callbacks.bench.testChargeGroup);
      if (probeHits.length > 0) {
        this.dragTarget = { type: 'test_charge' };
        return true;
      }
    }

    // 4. 兜底方案：源电荷直接 3D 光线投射拾取
    if (context.camera) {
      const chargeHits = this.intersect(event, context.camera, this.callbacks.bench.chargesGroup);
      if (chargeHits.length > 0) {
        let obj: THREE.Object3D | null = chargeHits[0].object;
        let chargeId: string | null = null;
        while (obj && obj !== this.callbacks.bench.chargesGroup) {
          if (obj.userData?.chargeId) {
            chargeId = obj.userData.chargeId;
            break;
          }
          obj = obj.parent;
        }

        if (chargeId) {
          this.dragTarget = { type: 'charge', id: chargeId };
          this.callbacks.onSelectCharge(chargeId);
          return true;
        }
      }
    }

    // 5. 背景单击 / 双击处理
    const now = performance.now();
    if (now - this.lastClickTime < 320 && context.camera && this.callbacks.onAddChargeAt) {
      const local = localPointOnBenchFace(event, context.camera, this.callbacks.bench.group);
      if (local) {
        const clampedX = Math.max(-0.80, Math.min(0.80, local.x));
        const clampedY = Math.max(-0.36, Math.min(0.55, local.y));
        this.callbacks.onAddChargeAt(clampedX, clampedY, 2.0);
      }
    } else {
      this.callbacks.onDeselect();
    }
    this.lastClickTime = now;
    this.dragTarget = null;
    return true;
  }

  public onPointerMove(
    event: PointerEvent,
    _hit: THREE.Intersection | null,
    context: ExperimentContext,
  ): void {
    if (!this.dragTarget || !context.camera) return;
    this.hasMoved = true;

    const local = localPointOnBenchFace(
      event,
      context.camera,
      this.callbacks.bench.group,
      undefined,
      DEFAULT_CHARGE_ELEVATION,
    );
    if (!local) return;

    // 平滑移动并限制在实验台上方空中（最小 Y 为 -0.36，距离约 -0.526 的台面保持 13cm 以上）
    const clampedX = Math.max(-0.80, Math.min(0.80, local.x));
    const clampedY = Math.max(-0.36, Math.min(0.55, local.y));

    if (this.dragTarget.type === 'charge') {
      this.callbacks.onMoveCharge(this.dragTarget.id, clampedX, clampedY);
    } else if (this.dragTarget.type === 'test_charge' && this.callbacks.onMoveTestCharge) {
      this.callbacks.onMoveTestCharge(clampedX, clampedY);
    }
  }

  public onPointerUp(_event: PointerEvent, _context: ExperimentContext): void {
    this.dragTarget = null;
    this.hasMoved = false;
  }

  private intersect(
    event: PointerEvent,
    camera: THREE.Camera,
    target: THREE.Object3D,
  ): THREE.Intersection[] {
    const width = typeof window !== 'undefined' ? window.innerWidth : 800;
    const height = typeof window !== 'undefined' ? window.innerHeight : 800;
    const ndc = new THREE.Vector2(
      (event.clientX / width) * 2 - 1,
      -(event.clientY / height) * 2 + 1,
    );
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(ndc, camera);
    return raycaster.intersectObject(target, true);
  }
}
