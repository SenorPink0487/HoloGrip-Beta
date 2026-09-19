export type WorkerAction =
  | 'INIT'
  | 'NBODY_STEP'
  | 'WAVE_STEP'
  | 'LORENZ_STEP'
  | 'OPTICAL_DIFFRACTION_STEP';

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

export interface OpticalDiffractionStepRequest extends BaseWorkerRequest {
  action: 'OPTICAL_DIFFRACTION_STEP';
  intensityBuffer: Float32Array;
  wavelengthNm: number;
  slitWidthMm: number;
  slitDistanceMm: number;
  screenDistanceM: number;
  screenSpanMm: number;
  slitCount: number;
  gratingLinesPerMm?: number;
}

export type WorkerRequest =
  | NBodyStepRequest
  | WaveStepRequest
  | LorenzStepRequest
  | OpticalDiffractionStepRequest;

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

export interface OpticalDiffractionStepResponse {
  id: number;
  action: 'OPTICAL_DIFFRACTION_STEP';
  intensityBuffer: Float32Array;
  computeTimeMs: number;
}

export type WorkerResponse =
  | NBodyStepResponse
  | WaveStepResponse
  | LorenzStepResponse
  | OpticalDiffractionStepResponse;
