import * as THREE from 'three';
import type { ConductionBenchMesh } from './ConductionBenchMesh.ts';
import type { ExperimentContext } from '../../core/types.ts';

export interface ConductionInteractionCallbacks {
  bench: ConductionBenchMesh;
  onProbeDrag: (normX: number) => void;
  onCycleMaterial?: () => void;
}

export class ConductionInteractionManager {
  private callbacks: ConductionInteractionCallbacks;
  private isDraggingProbe = false;
  private startClientX = 0;
  private startNormX = 0.5;

  constructor(callbacks: ConductionInteractionCallbacks) {
    this.callbacks = callbacks;
  }

  public getHoverTarget(raycaster: THREE.Raycaster): { id: string; label: string; cursor?: string } | null {
    if (this.isDraggingProbe) {
      return { id: 'conduction_probe', label: '沿轴滑动测温探针', cursor: 'ew-resize' };
    }

    const hits = raycaster.intersectObjects([
      this.callbacks.bench.probeGroup,
      this.callbacks.bench.rodMesh,
    ], true);

    if (hits.length > 0) {
      let obj: THREE.Object3D | null = hits[0].object;
      while (obj) {
        if (obj === this.callbacks.bench.probeGroup || obj.parent === this.callbacks.bench.probeGroup) {
          return { id: 'conduction_probe', label: '高精度红外测温探针（水平拖动滑块测温）', cursor: 'ew-resize' };
        }
        if (obj === this.callbacks.bench.rodMesh) {
          return { id: 'conduction_rod', label: '导热试样金属棒（点击/拖动测定该点温度）', cursor: 'pointer' };
        }
        obj = obj.parent;
      }
    }

    return null;
  }

  public onPointerDown(event: PointerEvent, hit: THREE.Intersection | null, _context: ExperimentContext): boolean {
    if (!hit) {
      this.isDraggingProbe = false;
      return false;
    }

    let obj: THREE.Object3D | null = hit.object;
    while (obj) {
      if (obj === this.callbacks.bench.probeGroup || obj.parent === this.callbacks.bench.probeGroup) {
        this.isDraggingProbe = true;
        this.startClientX = event.clientX;
        this.startNormX = THREE.MathUtils.clamp(
          (this.callbacks.bench.probeGroup.position.x - this.callbacks.bench.rodStartX) / this.callbacks.bench.rodLength,
          0,
          1
        );
        return true;
      }
      if (obj === this.callbacks.bench.rodMesh) {
        // 直接点击金属棒可使探针快速跳转至该位置
        const localPoint = this.callbacks.bench.group.worldToLocal(hit.point.clone());
        const norm = (localPoint.x - this.callbacks.bench.rodStartX) / this.callbacks.bench.rodLength;
        this.callbacks.onProbeDrag(THREE.MathUtils.clamp(norm, 0, 1));
        this.isDraggingProbe = true;
        this.startClientX = event.clientX;
        this.startNormX = THREE.MathUtils.clamp(norm, 0, 1);
        return true;
      }
      obj = obj.parent;
    }

    this.isDraggingProbe = false;
    return false;
  }

  public onPointerMove(event: PointerEvent, _hit: THREE.Intersection | null, _context: ExperimentContext): void {
    if (this.isDraggingProbe) {
      const dx = event.clientX - this.startClientX;
      // 将屏幕像素位移映射到归一化区间
      const sensitivity = 0.0035;
      const newNorm = THREE.MathUtils.clamp(this.startNormX + dx * sensitivity, 0.0, 1.0);
      this.callbacks.onProbeDrag(newNorm);
    }
  }

  public onPointerUp(_event: PointerEvent, _context: ExperimentContext): void {
    this.isDraggingProbe = false;
  }
}
