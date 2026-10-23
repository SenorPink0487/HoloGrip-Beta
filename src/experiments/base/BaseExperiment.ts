import * as THREE from 'three';
import type { IExperiment, ExperimentMetadata, ExperimentContext, ParameterDef } from '../../core/types.ts';
import { ResourceTracker } from '../../core/Lifecycle.ts';

export abstract class BaseExperiment implements IExperiment {
  public abstract readonly metadata: ExperimentMetadata;
  public readonly rootGroup: THREE.Group;
  public targetScale = 1.0;
  public hideCenterEmitter = false;
  protected tracker = new ResourceTracker();

  constructor() {
    this.rootGroup = new THREE.Group();
  }

  /**
   * 自动追踪几何体、材质、纹理或网格，以实现无泄漏的安全释放。
   */
  protected track<T>(resource: T): T {
    return this.tracker.track(resource);
  }

  /**
   * 注册清理回调函数（如定时器、Worker 数据流等）。
   */
  protected addDisposable(fn: () => void): void {
    this.tracker.addDisposable(fn);
  }

  public async preload?(context: ExperimentContext, onProgress?: (percent: number) => void): Promise<void>;

  public abstract init(context: ExperimentContext): Promise<void> | void;

  public mount(context: ExperimentContext): void {
    // 若子类需要挂载逻辑可在此重写
  }

  public abstract update(delta: number, elapsed: number, context: ExperimentContext): void;

  public unmount(context: ExperimentContext): void {
    // 若子类需要卸载逻辑可在此重写
  }

  /**
   * 深度释放所有 GPU 几何体、材质、纹理以及清理回调。
   */
  public dispose(context: ExperimentContext): void {
    // 从 rootGroup 中移除所有子节点
    while (this.rootGroup.children.length > 0) {
      const child = this.rootGroup.children[0];
      this.rootGroup.remove(child);
    }

    // 执行 GPU 资源的深度销毁
    this.tracker.dispose();
  }

  public onParameterChange?(id: string, value: any, context: ExperimentContext): void;
  public onPointerDown?(event: PointerEvent, hit: THREE.Intersection | null, context: ExperimentContext): boolean | void;
  public onPointerMove?(event: PointerEvent, hit: THREE.Intersection | null, context: ExperimentContext): void;
  public onPointerUp?(event: PointerEvent, context: ExperimentContext): void;
  public onPointerCancel(event: PointerEvent, context: ExperimentContext): void {
    this.onPointerUp?.(event, context);
  }
  public getHoverTarget?(raycaster: THREE.Raycaster): { id: string; label: string; cursor?: string } | null;
  public onViewModeChange?(mode: 'whiteboard' | 'laboratory'): void;
}
