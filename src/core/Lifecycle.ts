import * as THREE from 'three';

/**
 * 资源追踪器，负责管理 Three.js GPU 资源（几何体、材质、纹理、渲染目标），
 * 确保在多个实验之间切换时实现零内存泄漏的完整销毁。
 */
export class ResourceTracker {
  private resources = new Set<THREE.BufferGeometry | THREE.Material | THREE.Texture | THREE.WebGLRenderTarget>();
  private disposables: Array<() => void> = [];

  /**
   * 递归自动追踪对象及其所有子资源。
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

      // 如果是材质，同步追踪其属性上挂载的所有纹理
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
   * 注册自定义清理回调（例如定时器、事件监听器、Worker 任务等）。
   */
  public addDisposable(disposeFn: () => void): void {
    this.disposables.push(disposeFn);
  }

  /**
   * 全面释放所有已注册的 GPU 资源，确保无泄漏。
   */
  public dispose(): void {
    // 1. 执行自定义清理回调
    for (const disposeFn of this.disposables) {
      try {
        disposeFn();
      } catch (err) {
        console.warn('[ResourceTracker] Error running custom disposable:', err);
      }
    }
    this.disposables = [];

    // 2. 释放所有 Three.js GPU 资源
    for (const resource of this.resources) {
      try {
        if (resource instanceof THREE.Material) {
          // 先释放材质上的纹理
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
