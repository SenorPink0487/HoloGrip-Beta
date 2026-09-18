export type WorkerAction =
  | 'INIT'
  | 'NBODY_STEP'
  | 'WAVE_STEP'
  | 'LORENZ_STEP'
  | 'OPTICS_FRINGE_STEP';

export interface BaseWorkerRequest {
  id: number;
  action: WorkerAction;
}

export interface NBodyStepRequest extends BaseWorkerRequest {
  action: 'NBODY_STEP';
  positions: Float32Array;
  velocities: Float32Array;
  masses: Float32Array;
  dt: number;
  g: number;
  softening: number;
}

export interface WaveStepRequest extends BaseWorkerRequest {
  action: 'WAVE_STEP';
  heightMap: Float32Array;
  velocityMap: Float32Array;
  width: number;
  height: number;
  c: number;
  damping: number;
  dt: number;
}

export interface LorenzStepRequest extends BaseWorkerRequest {
  action: 'LORENZ_STEP';
  positions: Float32Array;
  sigma: number;
  rho: number;
  beta: number;
  dt: number;
}

export interface OpticsFringeRequest extends BaseWorkerRequest {
  action: 'OPTICS_FRINGE_STEP';
  width: number;
  height: number;
  type: 'double_slit' | 'single_slit' | 'circular_aperture' | 'grating' | 'polarization_spot' | 'dispersion_spectrum';
  wavelengthNm: number;
  slitDistanceMm?: number;
  slitWidthMm?: number;
  screenDistanceM?: number;
  gratingDensityLinesPerMm?: number;
  polarizerAngleDeg?: number;
  analyzerAngleDeg?: number;
  screenPhysicalWidthM?: number;
  intensity?: number;
}

export type WorkerRequest =
  | NBodyStepRequest
  | WaveStepRequest
  | LorenzStepRequest
  | OpticsFringeRequest;

export type DistributiveOmit<T, K extends keyof any> = T extends any ? Omit<T, K> : never;

export interface NBodyStepResponse {
  id: number;
  action: 'NBODY_STEP';
  positions: Float32Array;
  velocities: Float32Array;
  computeTimeMs: number;
}

export interface WaveStepResponse {
  id: number;
  action: 'WAVE_STEP';
  heightMap: Float32Array;
  velocityMap: Float32Array;
  computeTimeMs: number;
}

export interface LorenzStepResponse {
  id: number;
  action: 'LORENZ_STEP';
  positions: Float32Array;
  computeTimeMs: number;
}

export interface OpticsFringeResponse {
  id: number;
  action: 'OPTICS_FRINGE_STEP';
  pixels: Uint8ClampedArray;
  width: number;
  height: number;
  computeTimeMs: number;
}

export type WorkerResponse =
  | NBodyStepResponse
  | WaveStepResponse
  | LorenzStepResponse
  | OpticsFringeResponse;
