import * as THREE from 'three';
import type { ComputeBridge } from './platform/ComputeBridge';
import type { WorkerPool } from '../workers/WorkerPool';
import type { HologramStage } from './HologramStage';

export type PlatformType = 'web' | 'macos' | 'ipados' | 'ios' | 'windows' | 'android' | 'linux';

export interface PlatformInfo {
  platform: PlatformType;
  isTauri: boolean;
  isMobile: boolean;
  logicalCores: number;
  backendName: string;
  os: string;
  arch: string;
}

export type ParameterType = 'range' | 'boolean' | 'select' | 'color' | 'button';

export interface ParameterOption {
  label: string;
  value: string | number;
}

export interface ParameterDef<T = any> {
  id: string;
  name: string;
  type: ParameterType;
  defaultValue: T;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  options?: ParameterOption[];
  description?: string;
  onChange?: (value: T, context: ExperimentContext) => void;
}

export type ExperimentCategory =
  | 'quantum'
  | 'astrophysics'
  | 'optics'
  | 'fluids'
  | 'chaos'
  | 'electromagnetism'
  | 'physics'
  | 'math'
  | 'chemistry'
  | 'mechanics';

export interface ExperimentMetadata {
  id: string;
  name: string;
  category: ExperimentCategory;
  categoryName: string;
  description: string;
  tags: string[];
  icon: string;
  equation?: string;
  computeIntensity: 'low' | 'medium' | 'high' | 'extreme';
  parameters: ParameterDef[];
}

export interface ExperimentContext {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  stage: HologramStage;
  computeBridge: ComputeBridge;
  workerPool: WorkerPool;
  parameters: Record<string, any>;
  getParameter: <T = any>(id: string) => T;
  setParameter: <T = any>(id: string, value: T) => void;
  css3dScene?: THREE.Scene;
  css3dRenderer?: any;
}

export interface IExperiment {
  readonly metadata: ExperimentMetadata;
  readonly rootGroup: THREE.Group;
  readonly targetScale?: number;
  readonly hideCenterEmitter?: boolean;
  
  /**
   * 异步预加载阶段（加载纹理、GLTF 模型、着色器及 Worker 脚本等）。
   */
  preload?(context: ExperimentContext, onProgress?: (percent: number) => void): Promise<void>;

  /**
   * 初始化几何体与材质、分配 Worker 缓冲区并绑定事件。
   */
  init(context: ExperimentContext): Promise<void> | void;

  /**
   * 挂载至全息实验台时调用。
   */
  mount(context: ExperimentContext): void;

  /**
   * 单帧物理模拟与渲染更新。
   */
  update(delta: number, elapsed: number, context: ExperimentContext): void;

  /**
   * 从全息实验台卸载时调用（在过渡动画或销毁前触发）。
   */
  unmount(context: ExperimentContext): void;

  /**
   * 彻底清理内存：释放几何体、材质、纹理、缓冲区并终止 Worker。
   */
  dispose(context: ExperimentContext): void;

  /**
   * 用户通过 UI 或 API 修改实验参数时调用。
   */
  onParameterChange?(id: string, value: any, context: ExperimentContext): void;

  /**
   * 可选的 3D 场景指针交互钩子。
   */
  onPointerDown?(event: PointerEvent, hit: THREE.Intersection | null, context: ExperimentContext): boolean | void;
  onPointerMove?(event: PointerEvent, hit: THREE.Intersection | null, context: ExperimentContext): void;
  onPointerUp?(event: PointerEvent, context: ExperimentContext): void;
  onPointerCancel?(event: PointerEvent, context: ExperimentContext): void;
  getHoverTarget?(raycaster: THREE.Raycaster): { id: string; label: string; cursor?: string } | null;
  /**
   * 在 3D 实验室视图与 2D 白板视图之间切换时调用。
   */
  onViewModeChange?(mode: 'whiteboard' | 'laboratory'): void;
}

export interface ExperimentModule {
  default: new () => IExperiment;
}

export interface ExperimentRegistryEntry {
  metadata: ExperimentMetadata;
  loader: () => Promise<ExperimentModule>;
}
