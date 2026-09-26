export type WorkerAction =
  | 'INIT'
  | 'NBODY_STEP'
  | 'WAVE_STEP'
  | 'LORENZ_STEP'
  | 'OPTICAL_DIFFRACTION_STEP'
  | 'OPTICAL_POLARIZATION_STEP'
  | 'OPTICAL_DISPERSION_STEP'
  | 'CHEMISTRY_STEP'
  | 'PARTICLE_SIM_STEP'
  | 'STREAM_TUBE_STEP'
  | 'TEXTURE_BAKE_TASK'
  | 'CHEMISTRY_COMPOSITION_STEP'
  | 'HALL_CARRIER_STEP';

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

export interface OpticalPolarizationStepRequest extends BaseWorkerRequest {
  action: 'OPTICAL_POLARIZATION_STEP';
  positions: Float32Array;
  colors: Float32Array;
  polarizerAngleDeg: number;
  analyzerAngleDeg: number;
  hasQuarterWavePlate: boolean;
  wavelengthNm: number;
  startZ: number;
  endZ: number;
  polarizerZ: number;
  analyzerZ: number;
  numSamples: number;
  time: number;
}

export interface WorkerDispersionRayData {
  wavelengthNm: number;
  colorRgb: [number, number, number];
  refractiveIndex: number;
  deviationAngleRad: number;
  points: [number, number, number][];
}

export interface OpticalDispersionStepRequest extends BaseWorkerRequest {
  action: 'OPTICAL_DISPERSION_STEP';
  apexPos: [number, number, number];
  prismRotationY: number;
  baseIndex: number;
  incomingPos: [number, number, number];
  screenZ?: number;
}

export interface ChemistryStepRequest extends BaseWorkerRequest {
  action: 'CHEMISTRY_STEP';
  temperature: number;
  activeGasRate: number;
  ambientTemp?: number;
  dt: number;
}

export interface ParticleSimStepRequest extends BaseWorkerRequest {
  action: 'PARTICLE_SIM_STEP';
  bubblePositions: Float32Array;
  bubbleVelocities: Float32Array;
  bubblePhases: Float32Array;
  gasRate: number;
  precipPositions: Float32Array;
  precipSpeeds: Float32Array;
  isPrecipitating: boolean;
  splashPositions: Float32Array;
  splashVelocities: Float32Array;
  splashLifespans: Float32Array;
  isPouring: boolean;
  sodiumSparkPositions: Float32Array;
  sodiumSparkVelocities: Float32Array;
  sodiumSparkLifespans: Float32Array;
  isSodiumBurning: boolean;
  sodiumAngle: number;
  liquidSurfaceLocalY: number;
  liquidRadius: number;
  maxLiquidHeight: number;
  dt: number;
}

export interface StreamTubeStepRequest extends BaseWorkerRequest {
  action: 'STREAM_TUBE_STEP';
  startWorld: [number, number, number];
  midWorld: [number, number, number];
  endWorld: [number, number, number];
  tubularSegments: number;
  radialSegments: number;
  radius: number;
  vertexBuffer: Float32Array;
}

export interface TextureBakeTaskRequest extends BaseWorkerRequest {
  action: 'TEXTURE_BAKE_TASK';
  task: 'floor_fbm' | 'roughness_fbm' | 'bump_fbm';
  resolution: number;
}

export interface ChemistryCompositionStepRequest extends BaseWorkerRequest {
  action: 'CHEMISTRY_COMPOSITION_STEP';
  volume: number;
  temperature: number;
  pH: number;
  ions: [string, number][];
  precipitates: [string, { formula: string; name: string; color: number; moles: number }][];
  solids: [string, { formula: string; name: string; moles: number }][];
  recentReaction: any;
}

export interface HallCarrierStepRequest extends BaseWorkerRequest {
  action: 'HALL_CARRIER_STEP';
  positions: Float32Array;
  baseOffsetsY: Float32Array;
  baseOffsetsZ: Float32Array;
  thermalPhases: Float32Array;
  particleCount: number;
  driftDirection: number;
  speed: number;
  maxDeflectionY: number;
  halfL: number;
  halfH: number;
  waferThickness: number;
  timeNow: number;
  delta: number;
}

export type WorkerRequest =
  | NBodyStepRequest
  | WaveStepRequest
  | LorenzStepRequest
  | OpticalDiffractionStepRequest
  | OpticalPolarizationStepRequest
  | OpticalDispersionStepRequest
  | ChemistryStepRequest
  | ParticleSimStepRequest
  | StreamTubeStepRequest
  | TextureBakeTaskRequest
  | ChemistryCompositionStepRequest
  | HallCarrierStepRequest;

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

export interface OpticalPolarizationStepResponse {
  id: number;
  action: 'OPTICAL_POLARIZATION_STEP';
  positions: Float32Array;
  colors: Float32Array;
  malusIntensity: number;
  computeTimeMs: number;
}

export interface OpticalDispersionStepResponse {
  id: number;
  action: 'OPTICAL_DISPERSION_STEP';
  rays: WorkerDispersionRayData[];
  computeTimeMs: number;
}

export interface ChemistryStepResponse {
  id: number;
  action: 'CHEMISTRY_STEP';
  temperature: number;
  activeGasRate: number;
  computeTimeMs: number;
}

export interface ParticleSimStepResponse {
  id: number;
  action: 'PARTICLE_SIM_STEP';
  bubblePositions: Float32Array;
  bubbleVelocities: Float32Array;
  bubblePhases: Float32Array;
  precipPositions: Float32Array;
  precipSpeeds: Float32Array;
  splashPositions: Float32Array;
  splashVelocities: Float32Array;
  splashLifespans: Float32Array;
  sodiumSparkPositions: Float32Array;
  sodiumSparkVelocities: Float32Array;
  sodiumSparkLifespans: Float32Array;
  sodiumBallPos: [number, number, number];
  sodiumAngle: number;
  computeTimeMs: number;
}

export interface StreamTubeStepResponse {
  id: number;
  action: 'STREAM_TUBE_STEP';
  vertexBuffer: Float32Array;
  computeTimeMs: number;
}

export interface TextureBakeTaskResponse {
  id: number;
  action: 'TEXTURE_BAKE_TASK';
  task: 'floor_fbm' | 'roughness_fbm' | 'bump_fbm';
  pixelBuffer: Uint8ClampedArray;
  computeTimeMs: number;
}

export interface ChemistryCompositionStepResponse {
  id: number;
  action: 'CHEMISTRY_COMPOSITION_STEP';
  composition: any;
  computeTimeMs: number;
}

export interface HallCarrierStepResponse {
  id: number;
  action: 'HALL_CARRIER_STEP';
  positions: Float32Array;
  baseOffsetsY: Float32Array;
  computeTimeMs: number;
}

export type WorkerResponse =
  | NBodyStepResponse
  | WaveStepResponse
  | LorenzStepResponse
  | OpticalDiffractionStepResponse
  | OpticalPolarizationStepResponse
  | OpticalDispersionStepResponse
  | ChemistryStepResponse
  | ParticleSimStepResponse
  | StreamTubeStepResponse
  | TextureBakeTaskResponse
  | ChemistryCompositionStepResponse
  | HallCarrierStepResponse;
