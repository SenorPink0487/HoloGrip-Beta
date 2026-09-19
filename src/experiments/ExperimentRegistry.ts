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
    id: 'optics',
    name: '光学物理',
    icon: 'optics',
    description: '几何传播、杨氏双缝干涉、光栅衍射与偏振态高精度3D实验台',
  },
  {
    id: 'physics',
    name: '前沿物理',
    icon: 'physics',
    description: '经典天体力学、非线性动力系统与波动场论空间模拟',
  },
  {
    id: 'math',
    name: '空间数学',
    icon: 'math',
    description: '微分流形、四维几何与高维拓扑动力系统',
  },
];

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
    // No fallback experiments registered when all catalog experiments are cleared
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
