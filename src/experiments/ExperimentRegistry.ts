import type {
  ExperimentMetadata,
  ExperimentRegistryEntry,
  IExperiment,
  ExperimentCategory,
  ExperimentModule,
} from '../core/types.ts';

export interface CategoryInfo {
  id: ExperimentCategory;
  name: string;
  icon: string;
  description: string;
}

export const CATEGORIES: CategoryInfo[] = [
  {
    id: 'quantum',
    name: '量子物理学',
    icon: '⚛️',
    description: '波包演化、双缝干涉、态叠加与薛定谔波动方程模拟',
  },
  {
    id: 'astrophysics',
    name: '天体物理与引力',
    icon: '🪐',
    description: '三体混沌轨道、N体万有引力与多核多粒子吸积模拟',
  },
  {
    id: 'chaos',
    name: '非线性混沌力学',
    icon: '🦋',
    description: '洛伦兹奇怪吸引子、相空间极限环与蝴蝶效应敏感性',
  },
  {
    id: 'optics',
    name: '光学与光子学',
    icon: '🎯',
    description: '激光夫琅禾费衍射、艾里斑图样与波动干涉条纹',
  },
];

import { metadata as quantumMeta } from './catalog/quantum/quantum-wave/meta.ts';
import { metadata as nbodyMeta } from './catalog/astrophysics/nbody-gravity/meta.ts';
import { metadata as lorenzMeta } from './catalog/chaos/lorenz-attractor/meta.ts';
import { metadata as opticsMeta } from './catalog/optics/laser-diffraction/meta.ts';

export class ExperimentRegistry {
  private static instance: ExperimentRegistry;
  private registry = new Map<string, ExperimentRegistryEntry>();

  private constructor() {
    this.scanAndRegisterExperiments();
  }

  public static getInstance(): ExperimentRegistry {
    if (!ExperimentRegistry.instance) {
      ExperimentRegistry.instance = new ExperimentRegistry();
    }
    return ExperimentRegistry.instance;
  }

  /**
   * Automated scan & dynamic registration using Vite's import.meta.glob.
   * Completely decouples metadata definitions from heavy 3D implementations.
   */
  private scanAndRegisterExperiments(): void {
    try {
      if (typeof (import.meta as any).glob === 'function') {
        // Eagerly scan all metadata modules across the catalog (lightweight metadata)
        const metaModules = import.meta.glob<{ metadata?: ExperimentMetadata; default?: ExperimentMetadata }>(
          './catalog/**/meta.ts',
          { eager: true }
        );

        // Lazily scan all experiment implementation classes (code-split on demand)
        const implModules = import.meta.glob<ExperimentModule>(
          './catalog/**/index.ts'
        );

        for (const [metaPath, metaModule] of Object.entries(metaModules)) {
          const meta = metaModule.metadata || metaModule.default;
          if (!meta || !meta.id) {
            console.warn(`[ExperimentRegistry] Skipped invalid metadata at: ${metaPath}`);
            continue;
          }

          // Match corresponding index.ts loader path
          const indexPath = metaPath.replace(/meta\.ts$/, 'index.ts');
          const loader = implModules[indexPath];

          if (!loader) {
            console.warn(`[ExperimentRegistry] No matching index.ts implementation found for ${metaPath}`);
            continue;
          }

          this.register({
            metadata: meta,
            loader: loader,
          });
        }
      }
    } catch (err) {
      console.warn('[ExperimentRegistry] Dynamic glob scan skipped:', err);
    }

    if (this.registry.size === 0) {
      this.registerFallbackExperiments();
    }
  }

  private registerFallbackExperiments(): void {
    this.register({
      metadata: quantumMeta,
      loader: () => import('./catalog/quantum/quantum-wave/index.ts') as Promise<ExperimentModule>,
    });
    this.register({
      metadata: nbodyMeta,
      loader: () => import('./catalog/astrophysics/nbody-gravity/index.ts') as Promise<ExperimentModule>,
    });
    this.register({
      metadata: lorenzMeta,
      loader: () => import('./catalog/chaos/lorenz-attractor/index.ts') as Promise<ExperimentModule>,
    });
    this.register({
      metadata: opticsMeta,
      loader: () => import('./catalog/optics/laser-diffraction/index.ts') as Promise<ExperimentModule>,
    });
  }

  public register(entry: ExperimentRegistryEntry): void {
    this.registry.set(entry.metadata.id, entry);
  }

  public getAll(): ExperimentMetadata[] {
    return Array.from(this.registry.values()).map((e) => e.metadata);
  }

  public getByCategory(category: ExperimentCategory): ExperimentMetadata[] {
    return this.getAll().filter((m) => m.category === category);
  }

  public search(keyword: string): ExperimentMetadata[] {
    const q = keyword.trim().toLowerCase();
    if (!q) return this.getAll();

    return this.getAll().filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        m.description.toLowerCase().includes(q) ||
        m.tags.some((t) => t.toLowerCase().includes(q)) ||
        (m.equation && m.equation.toLowerCase().includes(q))
    );
  }

  public async loadExperiment(id: string): Promise<IExperiment> {
    const entry = this.registry.get(id);
    if (!entry) {
      throw new Error(`Experiment not found: ${id}`);
    }

    const module = await entry.loader();
    const ExpClass = module.default;
    const instance = new ExpClass();

    // Cache updated parameters from instance metadata if empty
    if (instance.metadata && instance.metadata.parameters && instance.metadata.parameters.length > 0) {
      entry.metadata.parameters = instance.metadata.parameters;
    }

    return instance;
  }
}
