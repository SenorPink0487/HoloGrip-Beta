import * as THREE from 'three';

/**
 * ResourceTracker manages Three.js GPU resources (geometries, materials, textures, render targets)
 * and guarantees zero-leak teardown when switching between dozens of experiments.
 */
export class ResourceTracker {
  private resources = new Set<THREE.BufferGeometry | THREE.Material | THREE.Texture | THREE.WebGLRenderTarget>();
  private disposables: Array<() => void> = [];

  /**
   * Automatically track an object and all its sub-resources recursively.
   */
  public track<T>(resource: T): T {
    if (!resource) return resource;

    if (Array.isArray(resource)) {
      resource.forEach((res) => this.track(res));
      return resource;
    }

    if ((resource as any) instanceof THREE.Object3D) {
      (resource as any as THREE.Object3D).traverse((child: any) => {
        if (child.geometry) {
          this.track(child.geometry);
        }
        if (child.material) {
          this.track(child.material);
        }
      });
      return resource;
    }

    if (
      resource instanceof THREE.BufferGeometry ||
      resource instanceof THREE.Material ||
      resource instanceof THREE.Texture ||
      resource instanceof THREE.WebGLRenderTarget
    ) {
      this.resources.add(resource);

      // If it's a material, also track all textures attached to standard properties
      if (resource instanceof THREE.Material) {
        for (const value of Object.values(resource)) {
          if (value instanceof THREE.Texture) {
            this.track(value);
          }
        }
      }
    }

    return resource;
  }

  /**
   * Register custom cleanup callbacks (e.g. interval timers, event listeners, worker tasks)
   */
  public addDisposable(disposeFn: () => void): void {
    this.disposables.push(disposeFn);
  }

  /**
   * Perform comprehensive, leak-free disposal of all registered GPU resources.
   */
  public dispose(): void {
    // 1. Run custom disposables
    for (const disposeFn of this.disposables) {
      try {
        disposeFn();
      } catch (err) {
        console.warn('[ResourceTracker] Error running custom disposable:', err);
      }
    }
    this.disposables = [];

    // 2. Dispose all Three.js GPU resources
    for (const resource of this.resources) {
      try {
        if (resource instanceof THREE.Material) {
          // Dispose textures on material first
          for (const value of Object.values(resource)) {
            if (value instanceof THREE.Texture) {
              value.dispose();
            }
          }
          resource.dispose();
        } else if (typeof (resource as any).dispose === 'function') {
          (resource as any).dispose();
        }
      } catch (err) {
        console.warn('[ResourceTracker] Error disposing resource:', err);
      }
    }

    this.resources.clear();
  }

  public get resourceCount(): number {
    return this.resources.size;
  }
}
