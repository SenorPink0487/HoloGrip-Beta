import * as THREE from 'three';
import type { HallBenchMesh } from './HallBenchMesh.ts';
import type { ExperimentContext } from '../../core/types.ts';

export interface HallInteractionCallbacks {
  bench: HallBenchMesh;
  onCycleMaterial?: () => void;
  onToggleFieldPolarity?: () => void;
  onToggleCurrentPolarity?: () => void;
}

export class HallInteractionManager {
  private callbacks: HallInteractionCallbacks;

  constructor(callbacks: HallInteractionCallbacks) {
    this.callbacks = callbacks;
  }

  public getHoverTarget(raycaster: THREE.Raycaster): { id: string; label: string; cursor?: string } | null {
    const targets = typeof this.callbacks.bench.getInteractiveObjects === 'function'
      ? this.callbacks.bench.getInteractiveObjects()
      : [this.callbacks.bench.group];
    const hits = raycaster.intersectObjects(targets, true);

    if (hits.length > 0) {
      let obj: THREE.Object3D | null = hits[0].object;
      while (obj && obj !== this.callbacks.bench.group) {
        if (obj === this.callbacks.bench.waferMesh || obj === this.callbacks.bench.substrateMesh) {
          return {
            id: 'hall_wafer',
            label: '霍尔试样薄片（点击切换材质：n型GaAs / p型硅 / 金属铜）',
            cursor: 'pointer',
          };
        }
        if (obj.name === 'ElectromagnetYoke') {
          return {
            id: 'hall_magnet',
            label: '精简垂直双极靴（点击快速反转磁场极性 N ↔ S）',
            cursor: 'pointer',
          };
        }
        if (obj.name === 'InstrumentPanel') {
          return {
            id: 'hall_panel',
            label: '一体化数字毫伏表与电流端（点击切换工作电流流向 ±I）',
            cursor: 'pointer',
          };
        }
        obj = obj.parent;
      }
    }

    return null;
  }

  public onPointerDown(_event: PointerEvent, hit: THREE.Intersection | null, _context: ExperimentContext): boolean {
    if (!hit) return false;

    let obj: THREE.Object3D | null = hit.object;
    while (obj && obj !== this.callbacks.bench.group) {
      if (obj === this.callbacks.bench.waferMesh || obj === this.callbacks.bench.substrateMesh) {
        this.callbacks.onCycleMaterial?.();
        return true;
      }
      if (obj.name === 'ElectromagnetYoke') {
        this.callbacks.onToggleFieldPolarity?.();
        return true;
      }
      if (obj.name === 'InstrumentPanel') {
        this.callbacks.onToggleCurrentPolarity?.();
        return true;
      }
      obj = obj.parent;
    }

    return false;
  }

  public onPointerMove(_event: PointerEvent, _hit: THREE.Intersection | null, _context: ExperimentContext): void {}

  public onPointerUp(_event: PointerEvent, _context: ExperimentContext): void {}
}
