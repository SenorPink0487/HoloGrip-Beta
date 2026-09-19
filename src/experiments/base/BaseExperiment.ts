import * as THREE from 'three';
import type { IExperiment, ExperimentMetadata, ExperimentContext, ParameterDef } from '../../core/types.ts';
import { ResourceTracker } from '../../core/Lifecycle.ts';

export abstract class BaseExperiment implements IExperiment {
  public abstract readonly metadata: ExperimentMetadata;
  public readonly rootGroup: THREE.Group;
  protected tracker = new ResourceTracker();

  constructor() {
    this.rootGroup = new THREE.Group();
  }

  /**
   * Helper to automatically track geometry, material, texture or mesh for zero-leak cleanup.
   */
  protected track<T>(resource: T): T {
    return this.tracker.track(resource);
  }

  /**
   * Helper to register cleanup callbacks (timers, worker streams).
   */
  protected addDisposable(fn: () => void): void {
    this.tracker.addDisposable(fn);
  }

  public async preload?(context: ExperimentContext, onProgress?: (percent: number) => void): Promise<void>;

  public abstract init(context: ExperimentContext): Promise<void> | void;

  public mount(context: ExperimentContext): void {
    // Override in subclass if mounting logic needed
  }

  public abstract update(delta: number, elapsed: number, context: ExperimentContext): void;

  public unmount(context: ExperimentContext): void {
    // Override in subclass if unmounting logic needed
  }

  /**
   * Deep disposal of all GPU geometries, materials, textures and callbacks.
   */
  public dispose(context: ExperimentContext): void {
    // Remove all children from rootGroup
    while (this.rootGroup.children.length > 0) {
      const child = this.rootGroup.children[0];
      this.rootGroup.remove(child);
    }

    // Perform deep GPU resource disposal
    this.tracker.dispose();
  }

  public onParameterChange?(id: string, value: any, context: ExperimentContext): void;
  public onPointerDown?(event: PointerEvent, hit: THREE.Intersection | null, context: ExperimentContext): boolean | void;
  public onPointerMove?(event: PointerEvent, hit: THREE.Intersection | null, context: ExperimentContext): void;
  public onPointerUp?(event: PointerEvent, context: ExperimentContext): void;
}
