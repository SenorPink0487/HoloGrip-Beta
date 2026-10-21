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
    description: '光的反射与折射、全反射临界角、光的色散、光的偏振、单缝光栅衍射与杨氏双缝干涉高精度3D实验台',
  },
  {
    id: 'thermodynamics',
    name: '热学物理',
    icon: 'thermo',
    description: '理想气体状态方程、分子动理论、卡诺热机循环与热传导精密实验台',
  },
  {
    id: 'physics',
    name: '前沿物理',
    icon: 'physics',
    description: '经典天体力学、非线性动力系统与波动场论空间模拟',
  },
  {
    id: 'electromagnetism',
    name: '电磁学',
    icon: 'physics',
    description: '霍尔效应、载流子动力学与静电场高斯定理精密实验台',
  },
  {
    id: 'mechanics',
    name: '经典力学',
    icon: 'physics',
    description: '伽利略理想斜面实验与惯性定律高精度3D实验台',
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
   * 利用 Vite 的 import.meta.glob 进行自动扫描与动态注册。
   * 将元数据定义与重型 3D 实现完全解耦。
   */
  private scanAndRegisterExperiments(): void {
    try {
      // 同步急加载整个目录中的所有元数据模块（轻量级元数据）
      const metaModules = import.meta.glob<{ metadata?: ExperimentMetadata; default?: ExperimentMetadata }>(
        './catalog/**/meta.ts',
        { eager: true }
      );

      // 懒加载所有实验实现类（按需代码分割）
      const implModules = import.meta.glob<ExperimentModule>(
        './catalog/**/index.ts'
      );

      console.log('[ExperimentRegistry] Scanning metaModules:', Object.keys(metaModules));

      for (const [metaPath, metaModule] of Object.entries(metaModules)) {
        const meta = metaModule.metadata || metaModule.default;
        if (!meta || !meta.id) {
          console.warn(`[ExperimentRegistry] Skipped invalid metadata at: ${metaPath}`);
          continue;
        }

        // 匹配对应的 index.ts 加载器路径
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
    } catch (err) {
      console.warn('[ExperimentRegistry] Dynamic glob scan skipped:', err);
    }

    if (this.registry.size === 0) {
      this.registerFallbackExperiments();
    }
  }

  private registerFallbackExperiments(): void {
    // 目录中所有实验均已清空时，不注册后备实验
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

    // 若实例包含参数定义，则缓存并同步更新注册表元数据中的参数
    if (instance.metadata && instance.metadata.parameters && instance.metadata.parameters.length > 0) {
      entry.metadata.parameters = instance.metadata.parameters;
    }

    return instance;
  }
}
