import * as THREE from 'three';
import type { ExperimentContext } from '../../core/types.ts';
import { findInteractable, localPointOnBenchFace } from './benchDrag.ts';
import type { HysteresisBenchMesh } from './HysteresisBenchMesh.ts';

const NAMES = ['FerroSample', 'FieldKnob', 'SweepSwitch', 'FieldProbe'] as const;

export interface HysteresisInteractionCallbacks {
  bench: HysteresisBenchMesh;
  onCycleMaterial: () => void;
  onFieldDrag: (deltaY: number) => void;
  onToggleSweep: () => void;
  onProbeY: (y: number) => void;
}

export class HysteresisInteractionManager {
  private callbacks: HysteresisInteractionCallbacks;
  private drag: 'none' | 'knob' | 'probe' = 'none';
  private pending: string | null = null;
  private moved = false;
  private lastY = 0;

  constructor(callbacks: HysteresisInteractionCallbacks) {
    this.callbacks = callbacks;
  }

  public getHoverTarget(raycaster: THREE.Raycaster): { id: string; label: string; cursor?: string } | null {
    const hits = raycaster.intersectObject(this.callbacks.bench.group, true);
    if (hits.length === 0) return null;
    const name = findInteractable(hits[0].object, this.callbacks.bench.group, NAMES);
    if (name === 'FerroSample') return { id: 'sample', label: '铁磁试样（点击更换：硅钢 / 软铁 / 碳钢 / 铁氧体）', cursor: 'pointer' };
    if (name === 'FieldKnob') return { id: 'knob', label: '励磁旋钮（上下拖动改变磁场强度 H，来回扫出磁滞回线）', cursor: 'ns-resize' };
    if (name === 'SweepSwitch') return { id: 'sweep', label: '自动扫描开关（点击让 H 周期性变化）', cursor: 'pointer' };
    if (name === 'FieldProbe') return { id: 'probe', label: '搜索线圈探针（沿试样拖动：螺线管内 B 均匀，管外迅速衰减）', cursor: 'grab' };
    return null;
  }

  public onPointerDown(event: PointerEvent, hit: THREE.Intersection | null, _context: ExperimentContext): boolean {
    if (!hit) {
      this.drag = 'none';
      return false;
    }
    const name = findInteractable(hit.object, this.callbacks.bench.group, NAMES);
    if (!name) return false;
    this.moved = false;
    this.lastY = event.clientY;
    this.pending = name;
    if (name === 'FieldKnob') this.drag = 'knob';
    else if (name === 'FieldProbe') this.drag = 'probe';
    else this.drag = 'none';
    return true;
  }

  public onPointerMove(event: PointerEvent, _hit: THREE.Intersection | null, context: ExperimentContext): void {
    if (this.drag === 'none') return;
    const dy = event.clientY - this.lastY;
    if (Math.abs(dy) > 2) this.moved = true;
    if (this.drag === 'knob') {
      this.callbacks.onFieldDrag(-dy * 45);
      this.lastY = event.clientY;
    } else if (this.drag === 'probe' && context.camera) {
      const local = localPointOnBenchFace(event, context.camera, this.callbacks.bench.group);
      if (local) this.callbacks.onProbeY(local.y);
    }
  }

  public onPointerUp(_event: PointerEvent, _context: ExperimentContext): void {
    if (!this.moved) {
      if (this.pending === 'FerroSample') this.callbacks.onCycleMaterial();
      else if (this.pending === 'SweepSwitch') this.callbacks.onToggleSweep();
    }
    this.drag = 'none';
    this.pending = null;
    this.moved = false;
  }
}
