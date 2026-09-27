import * as THREE from 'three';
import type { ExperimentContext } from '../../core/types.ts';
import { findInteractable, localPointOnBenchFace } from './benchDrag.ts';
import type { MassSpecBenchMesh } from './MassSpecBenchMesh.ts';

const NAMES = ['IonSource', 'SlitJaws', 'AnalyzerMagnet', 'AccelKnob', 'SelectorKnob', 'FieldProbe'] as const;

export interface MassSpecInteractionCallbacks {
  bench: MassSpecBenchMesh;
  onCycleSample: () => void;
  onJaw: (opening: number) => void;
  onAnalyzerDrag: (deltaY: number) => void;
  onFlipAnalyzer: () => void;
  onAccelDrag: (deltaY: number) => void;
  onPlateDrag: (deltaY: number) => void;
  onProbeX: (x: number) => void;
}

export class MassSpecInteractionManager {
  private callbacks: MassSpecInteractionCallbacks;
  private drag: 'none' | 'jaw' | 'magnet' | 'accel' | 'plate' | 'probe' = 'none';
  private pending: string | null = null;
  private moved = false;
  private lastY = 0;
  private startJaw = 1;

  constructor(callbacks: MassSpecInteractionCallbacks) {
    this.callbacks = callbacks;
  }

  public getHoverTarget(raycaster: THREE.Raycaster): { id: string; label: string; cursor?: string } | null {
    const hits = raycaster.intersectObject(this.callbacks.bench.group, true);
    if (hits.length === 0) return null;
    const name = findInteractable(hits[0].object, this.callbacks.bench.group, NAMES);
    if (name === 'IonSource') return { id: 'source', label: '离子源（点击更换样品：氢氦 / 氖 / 镁 / 氯）', cursor: 'pointer' };
    if (name === 'SlitJaws') return { id: 'jaws', label: '速度选择狭缝（上下拖动，收窄后只放行一种速度）', cursor: 'ns-resize' };
    if (name === 'AnalyzerMagnet') return { id: 'magnet', label: '分析磁铁（上下拖动改变磁场强弱，点击翻转极性）', cursor: 'grab' };
    if (name === 'AccelKnob') return { id: 'accel', label: '加速电压旋钮（上下拖动）', cursor: 'ns-resize' };
    if (name === 'SelectorKnob') return { id: 'selector', label: '速度选择器电压（上下拖动，决定哪一种离子通过）', cursor: 'ns-resize' };
    if (name === 'FieldProbe') return { id: 'probe', label: '磁场探针（沿束线拖动，读选择器或分析磁铁里的 B）', cursor: 'grab' };
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
    this.startJaw = this.callbacks.bench.jawGroup.userData.jawOpening ?? 1;
    if (name === 'SlitJaws') this.drag = 'jaw';
    else if (name === 'AnalyzerMagnet') this.drag = 'magnet';
    else if (name === 'AccelKnob') this.drag = 'accel';
    else if (name === 'SelectorKnob') this.drag = 'plate';
    else if (name === 'FieldProbe') this.drag = 'probe';
    else this.drag = 'none';
    return true;
  }

  public onPointerMove(event: PointerEvent, _hit: THREE.Intersection | null, context: ExperimentContext): void {
    if (this.drag === 'none') return;
    const dy = event.clientY - this.lastY;
    if (Math.abs(dy) > 2) this.moved = true;
    if (this.drag === 'accel') this.callbacks.onAccelDrag(-dy * 8);
    else if (this.drag === 'plate') this.callbacks.onPlateDrag(-dy * 2);
    else if (this.drag === 'magnet') this.callbacks.onAnalyzerDrag(-dy * 0.002);
    else if (this.drag === 'jaw') {
      this.callbacks.onJaw(this.startJaw + (this.lastY - event.clientY) * 0.004);
    } else if (this.drag === 'probe' && context.camera) {
      const local = localPointOnBenchFace(event, context.camera, this.callbacks.bench.group);
      if (local) this.callbacks.onProbeX(local.x);
    }
    if (this.drag !== 'jaw') this.lastY = event.clientY;
  }

  public onPointerUp(_event: PointerEvent, _context: ExperimentContext): void {
    if (!this.moved) {
      if (this.pending === 'IonSource') this.callbacks.onCycleSample();
      else if (this.pending === 'AnalyzerMagnet') this.callbacks.onFlipAnalyzer();
    }
    this.drag = 'none';
    this.pending = null;
    this.moved = false;
  }
}
