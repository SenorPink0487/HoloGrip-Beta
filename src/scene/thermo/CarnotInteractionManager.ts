import * as THREE from 'three';
import type { CarnotEngineMesh } from './CarnotEngineMesh.ts';
import type { ExperimentContext } from '../../core/types.ts';

export interface CarnotInteractionCallbacks {
  engine: CarnotEngineMesh;
  onToggleRunning: () => void;
  onToggleDirection: () => void;
  onRotateFlywheel: (deltaTheta: number) => void;
}

export type CarnotDragTarget = 'none' | 'flywheel' | 'lever' | 'dir_switch';

export class CarnotInteractionManager {
  private callbacks: CarnotInteractionCallbacks;
  private dragTarget: CarnotDragTarget = 'none';

  private startClientY = 0;
  private startClientX = 0;
  private hasMoved = false;

  constructor(callbacks: CarnotInteractionCallbacks) {
    this.callbacks = callbacks;
  }

  public getHoverTarget(raycaster: THREE.Raycaster): { id: string; label: string; cursor?: string } | null {
    if (this.dragTarget === 'flywheel') {
      return { id: 'flywheel', label: '拖拽旋转黄铜飞轮推进冲程', cursor: 'grab' };
    }

    const interactiveObjects = [
      this.callbacks.engine.flywheelMesh,
      this.callbacks.engine.leverMesh,
      this.callbacks.engine.dirSwitchMesh,
    ];

    const hits = raycaster.intersectObjects(interactiveObjects, true);
    if (hits.length > 0) {
      let obj: THREE.Object3D | null = hits[0].object;
      while (obj) {
        if (obj === this.callbacks.engine.flywheelMesh || obj === this.callbacks.engine.flywheelGroup) {
          return { id: 'flywheel', label: '黄铜动力飞轮（拖拽推进冲程 / 点击启停）', cursor: 'pointer' };
        }
        if (obj === this.callbacks.engine.leverMesh || obj.name === 'LeverRunPause') {
          return { id: 'lever', label: '热机离合启停拉杆（点击切换 运行/暂停）', cursor: 'pointer' };
        }
        if (obj === this.callbacks.engine.dirSwitchMesh || obj.name === 'SwitchDirection') {
          return { id: 'dir_switch', label: '循环方向换向开关（点击切换 正向热机/逆向制冷）', cursor: 'pointer' };
        }
        obj = obj.parent;
      }
    }

    return null;
  }

  public onPointerDown(event: PointerEvent, hit: THREE.Intersection | null, _context: ExperimentContext): boolean {
    if (!hit) {
      this.dragTarget = 'none';
      return false;
    }

    this.startClientX = event.clientX;
    this.startClientY = event.clientY;
    this.hasMoved = false;

    let obj: THREE.Object3D | null = hit.object;
    while (obj) {
      if (obj === this.callbacks.engine.flywheelMesh || obj === this.callbacks.engine.flywheelGroup) {
        this.dragTarget = 'flywheel';
        return true;
      }
      if (obj === this.callbacks.engine.leverMesh || obj.name === 'LeverRunPause') {
        this.dragTarget = 'lever';
        return true;
      }
      if (obj === this.callbacks.engine.dirSwitchMesh || obj.name === 'SwitchDirection') {
        this.dragTarget = 'dir_switch';
        return true;
      }
      obj = obj.parent;
    }

    this.dragTarget = 'none';
    return false;
  }

  public onPointerMove(event: PointerEvent, _hit: THREE.Intersection | null, _context: ExperimentContext): void {
    const dx = event.clientX - this.startClientX;
    const dy = event.clientY - this.startClientY;

    const tapSlop = event.pointerType === 'touch' ? 10 : 3;
    if (Math.abs(dx) > tapSlop || Math.abs(dy) > tapSlop) {
      this.hasMoved = true;
    }

    if (this.dragTarget === 'flywheel') {
      // 水平或垂直拖拽均可旋转飞轮角度
      const deltaTheta = (dx - dy) * 0.015;
      this.callbacks.onRotateFlywheel(deltaTheta);
      this.startClientX = event.clientX;
      this.startClientY = event.clientY;
    }
  }

  public onPointerCancel(): void {
    this.dragTarget = 'none';
    this.hasMoved = false;
  }

  public onPointerUp(_event: PointerEvent, _context: ExperimentContext): void {
    if (!this.hasMoved) {
      // 处理点击事件
      if (this.dragTarget === 'flywheel' || this.dragTarget === 'lever') {
        this.callbacks.onToggleRunning();
      } else if (this.dragTarget === 'dir_switch') {
        this.callbacks.onToggleDirection();
      }
    }

    this.dragTarget = 'none';
    this.hasMoved = false;
  }
}
