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
  | 'thermodynamics'
  | 'physics'
  | 'math'
  | 'chemistry';

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
}

export interface IExperiment {
  readonly metadata: ExperimentMetadata;
  readonly rootGroup: THREE.Group;
  
  /**
   * Asynchronous preload phase (load textures, GLTF models, shaders, worker scripts).
   */
  preload?(context: ExperimentContext, onProgress?: (percent: number) => void): Promise<void>;

  /**
   * Setup geometries, materials, allocate worker buffers and bind events.
   */
  init(context: ExperimentContext): Promise<void> | void;

  /**
   * Called when mounted to the HoloTable stage.
   */
  mount(context: ExperimentContext): void;

  /**
   * Single frame simulation and render update.
   */
  update(delta: number, elapsed: number, context: ExperimentContext): void;

  /**
   * Called when unmounted from the HoloTable stage (before transition or disposal).
   */
  unmount(context: ExperimentContext): void;

  /**
   * Complete memory cleanup: dispose geometries, materials, textures, buffers, cancel workers.
   */
  dispose(context: ExperimentContext): void;

  /**
   * Called when a parameter is altered by the user via UI or API.
   */
  onParameterChange?(id: string, value: any, context: ExperimentContext): void;

  /**
   * Optional 3D scene pointer interaction hooks.
   */
  onPointerDown?(event: PointerEvent, hit: THREE.Intersection | null, context: ExperimentContext): boolean | void;
  onPointerMove?(event: PointerEvent, hit: THREE.Intersection | null, context: ExperimentContext): void;
  onPointerUp?(event: PointerEvent, context: ExperimentContext): void;
}

export interface ExperimentModule {
  default: new () => IExperiment;
}

export interface ExperimentRegistryEntry {
  metadata: ExperimentMetadata;
  loader: () => Promise<ExperimentModule>;
}
