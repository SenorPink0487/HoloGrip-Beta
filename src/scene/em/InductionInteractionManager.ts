import * as THREE from 'three';
import type { ExperimentContext } from '../../core/types.ts';
import { findInteractable, localPointOnBenchFace } from './benchDrag.ts';
import type { InductionBenchMesh } from './InductionBenchMesh.ts';

const NAMES = ['BarMagnet', 'FieldProbe', 'SearchCoil', 'DriveLever'] as const;

export interface InductionInteractionCallbacks {
  bench: InductionBenchMesh;
  onMagnetY: (y: number) => void;
  onProbeY: (y: number) => void;
  onFlipPole: () => void;
  onCycleTurns: () => void;
  onStartPass: () => void;
}

export class InductionInteractionManager {
  private callbacks: InductionInteractionCallbacks;
  private drag: 'none' | 'magnet' | 'probe' = 'none';
  private pending: string | null = null;
  private moved = false;
  private downX = 0;
  private downY = 0;

  constructor(callbacks: InductionInteractionCallbacks) {
    this.callbacks = callbacks;
  }

  public getHoverTarget(raycaster: THREE.Raycaster): { id: string; label: string; cursor?: string } | null {
    const hits = raycaster.intersectObject(this.callbacks.bench.group, true);
    if (hits.length === 0) return null;
    const name = findInteractable(hits[0].object, this.callbacks.bench.group, NAMES);
    if (name === 'BarMagnet') return { id: 'magnet', label: '条形磁铁（上下拖动穿过线圈，点击翻转 N/S）', cursor: 'grab' };
    if (name === 'FieldProbe') return { id: 'probe', label: '轴向探针（沿线圈轴线拖动，读取该处磁感应强度）', cursor: 'grab' };
    if (name === 'SearchCoil') return { id: 'coil', label: '探测线圈（点击切换匝数）', cursor: 'pointer' };
    if (name === 'DriveLever') return { id: 'drive', label: '释放按钮（点击让磁铁匀速穿过线圈）', cursor: 'pointer' };
    return null;
  }

  public onPointerDown(event: PointerEvent, hit: THREE.Intersection | null, _context: ExperimentContext): boolean {
    if (!hit) {
      this.drag = 'none';
      this.pending = null;
      return false;
    }
    const name = findInteractable(hit.object, this.callbacks.bench.group, NAMES);
    if (!name) return false;
    this.moved = false;
    this.downX = event.clientX;
    this.downY = event.clientY;
    this.pending = name;
    if (name === 'BarMagnet') this.drag = 'magnet';
    else if (name === 'FieldProbe') this.drag = 'probe';
    else this.drag = 'none';
    return true;
  }

  public onPointerMove(event: PointerEvent, _hit: THREE.Intersection | null, context: ExperimentContext): void {
    if (this.drag === 'none' || !context.camera) return;
    if (Math.abs(event.clientX - this.downX) > 3 || Math.abs(event.clientY - this.downY) > 3) {
      this.moved = true;
    }
    const local = localPointOnBenchFace(event, context.camera, this.callbacks.bench.group);
    if (!local) return;
    if (this.drag === 'magnet') this.callbacks.onMagnetY(local.y);
    else this.callbacks.onProbeY(local.y);
  }

  public onPointerUp(_event: PointerEvent, _context: ExperimentContext): void {
    if (!this.moved) {
      if (this.drag === 'magnet' || this.pending === 'BarMagnet') this.callbacks.onFlipPole();
      else if (this.pending === 'SearchCoil') this.callbacks.onCycleTurns();
      else if (this.pending === 'DriveLever') this.callbacks.onStartPass();
    }
    this.drag = 'none';
    this.pending = null;
    this.moved = false;
  }
}
