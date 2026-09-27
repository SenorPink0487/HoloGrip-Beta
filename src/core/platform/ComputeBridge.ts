import { PlatformBridge } from './PlatformBridge.ts';
import type { WorkerPool } from '../../workers/WorkerPool';
import type {
  NBodyStepResponse,
  WaveStepResponse,
  LorenzStepResponse,
  OpticalDiffractionStepResponse,
  OpticalPolarizationStepResponse,
  OpticalDispersionStepResponse,
  ChemistryStepResponse,
  WorkerDispersionRayData,
  ParticleSimStepResponse,
  StreamTubeStepResponse,
  TextureBakeTaskResponse,
  ChemistryCompositionStepResponse,
  HallCarrierStepResponse,
  MassSpecStepResponse,
  HysteresisStepResponse,
  InductionStepResponse,
} from '../../workers/workerMessages';

export interface ComputeMetrics {
  lastComputeTimeMs: number;
  avgComputeTimeMs: number;
  mode: 'rust-rayon' | 'web-worker' | 'main-thread';
}

export class ComputeBridge {
  private platform = PlatformBridge.getInstance();
  private metrics: ComputeMetrics = {
    lastComputeTimeMs: 0,
    avgComputeTimeMs: 0,
    mode: 'web-worker',
  };
  private computeTimeSamples: number[] = [];
  private lastComputeTimestamp: number = 0;

  private workerPool: WorkerPool;

  constructor(workerPool: WorkerPool) {
    this.workerPool = workerPool;
    this.metrics.mode = this.platform.info.isTauri ? 'rust-rayon' : 'web-worker';
  }

  public get currentMetrics(): ComputeMetrics {
    if (this.lastComputeTimestamp > 0 && Date.now() - this.lastComputeTimestamp > 1500) {
      this.metrics.lastComputeTimeMs = 0;
      this.metrics.avgComputeTimeMs = 0;
      this.computeTimeSamples = [];
    }
    return this.metrics;
  }

  private recordMetrics(ms: number): void {
    this.lastComputeTimestamp = Date.now();
    this.metrics.lastComputeTimeMs = ms;
    this.computeTimeSamples.push(ms);
    if (this.computeTimeSamples.length > 30) {
      this.computeTimeSamples.shift();
    }
    const sum = this.computeTimeSamples.reduce((a, b) => a + b, 0);
    this.metrics.avgComputeTimeMs = sum / this.computeTimeSamples.length;
  }

  /**
   * Run N-Body step across multiple CPU cores
   */
  public async simulateNBody(
    positions: Float32Array,
    velocities: Float32Array,
    masses: Float32Array,
    dt: number,
    g: number,
    softening: number
  ): Promise<{ positions: Float32Array; velocities: Float32Array }> {
    const start = performance.now();

    if (this.platform.info.isTauri) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const res: any = await invoke('simulate_nbody_step', {
          positions: Array.from(positions),
          velocities: Array.from(velocities),
          masses: Array.from(masses),
          dt,
          g,
          softening,
        });

        const duration = performance.now() - start;
        this.recordMetrics(duration);

        return {
          positions: new Float32Array(res.positions),
          velocities: new Float32Array(res.velocities),
        };
      } catch (err) {
        console.warn('[ComputeBridge] Tauri NBody invoke failed, falling back to Web Worker:', err);
      }
    }

    // Web Worker Multi-Core execution
    const res = await this.workerPool.execute<NBodyStepResponse>(
      {
        action: 'NBODY_STEP',
        positions,
        velocities,
        masses,
        dt,
        g,
        softening,
      },
      [positions.buffer, velocities.buffer]
    );

    this.recordMetrics(res.computeTimeMs);
    return {
      positions: res.positions,
      velocities: res.velocities,
    };
  }

  /**
   * Run 2D Wave PDE step across multiple CPU cores
   */
  public async simulateWave(
    heightMap: Float32Array,
    velocityMap: Float32Array,
    width: number,
    height: number,
    c: number,
    damping: number,
    dt: number
  ): Promise<{ heightMap: Float32Array; velocityMap: Float32Array }> {
    const start = performance.now();

    if (this.platform.info.isTauri) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const res: any = await invoke('simulate_wave_step', {
          heightMap: Array.from(heightMap),
          velocityMap: Array.from(velocityMap),
          width,
          height,
          c,
          damping,
          dt,
        });

        const duration = performance.now() - start;
        this.recordMetrics(duration);

        return {
          heightMap: new Float32Array(res),
          velocityMap,
        };
      } catch (err) {
        console.warn('[ComputeBridge] Tauri Wave invoke failed, falling back to Web Worker:', err);
      }
    }

    // Web Worker execution
    const res = await this.workerPool.execute<WaveStepResponse>(
      {
        action: 'WAVE_STEP',
        heightMap,
        velocityMap,
        width,
        height,
        c,
        damping,
        dt,
      },
      [heightMap.buffer, velocityMap.buffer]
    );

    this.recordMetrics(res.computeTimeMs);
    return {
      heightMap: res.heightMap,
      velocityMap: res.velocityMap,
    };
  }

  /**
   * Run Lorenz attractor particle step
   */
  public async simulateLorenz(
    positions: Float32Array,
    sigma: number,
    rho: number,
    beta: number,
    dt: number
  ): Promise<Float32Array> {
    const res = await this.workerPool.execute<LorenzStepResponse>(
      {
        action: 'LORENZ_STEP',
        positions,
        sigma,
        rho,
        beta,
        dt,
      },
      [positions.buffer]
    );

    this.recordMetrics(res.computeTimeMs);
    return res.positions;
  }

  /**
   * Run optical diffraction / interference simulation across multi-core workers
   */
  public async simulateOpticalDiffraction(params: {
    intensityBuffer: Float32Array;
    wavelengthNm: number;
    slitWidthMm: number;
    slitDistanceMm?: number;
    screenDistanceM: number;
    screenSpanMm: number;
    slitCount: number;
    gratingLinesPerMm?: number;
  }): Promise<{ intensityBuffer: Float32Array; computeTimeMs: number }> {
    const res = await this.workerPool.execute<OpticalDiffractionStepResponse>(
      {
        action: 'OPTICAL_DIFFRACTION_STEP',
        intensityBuffer: params.intensityBuffer,
        wavelengthNm: params.wavelengthNm,
        slitWidthMm: params.slitWidthMm,
        slitDistanceMm: params.slitDistanceMm ?? 0.25,
        screenDistanceM: params.screenDistanceM,
        screenSpanMm: params.screenSpanMm,
        slitCount: params.slitCount,
        gratingLinesPerMm: params.gratingLinesPerMm,
      },
      [params.intensityBuffer.buffer]
    );

    this.recordMetrics(res.computeTimeMs);
    return {
      intensityBuffer: res.intensityBuffer,
      computeTimeMs: res.computeTimeMs,
    };
  }

  /**
   * Run 3D polarization vector wave simulation across multi-core workers
   */
  public async simulateOpticalPolarization(params: {
    positions: Float32Array;
    colors: Float32Array;
    polarizerAngleDeg: number;
    analyzerAngleDeg: number;
    hasQuarterWavePlate: boolean;
    wavelengthNm: number;
    startZ: number;
    endZ: number;
    polarizerZ?: number;
    analyzerZ?: number;
    numSamples?: number;
    time: number;
  }): Promise<{ positions: Float32Array; colors: Float32Array; malusIntensity: number; computeTimeMs: number }> {
    const res = await this.workerPool.execute<OpticalPolarizationStepResponse>(
      {
        action: 'OPTICAL_POLARIZATION_STEP',
        positions: params.positions,
        colors: params.colors,
        polarizerAngleDeg: params.polarizerAngleDeg,
        analyzerAngleDeg: params.analyzerAngleDeg,
        hasQuarterWavePlate: params.hasQuarterWavePlate,
        wavelengthNm: params.wavelengthNm,
        startZ: params.startZ,
        endZ: params.endZ,
        polarizerZ: params.polarizerZ ?? -0.15,
        analyzerZ: params.analyzerZ ?? 0.25,
        numSamples: params.numSamples ?? 60,
        time: params.time,
      },
      [params.positions.buffer, params.colors.buffer]
    );

    this.recordMetrics(res.computeTimeMs);
    return {
      positions: res.positions,
      colors: res.colors,
      malusIntensity: res.malusIntensity,
      computeTimeMs: res.computeTimeMs,
    };
  }

  /**
   * Run 3D prism multi-spectral dispersion ray tracing across multi-core workers
   */
  public async simulateOpticalDispersion(params: {
    apexPos: [number, number, number];
    prismRotationY: number;
    baseIndex: number;
    incomingPos: [number, number, number];
    screenZ?: number;
  }): Promise<{ rays: WorkerDispersionRayData[]; computeTimeMs: number }> {
    const res = await this.workerPool.execute<OpticalDispersionStepResponse>({
      action: 'OPTICAL_DISPERSION_STEP',
      apexPos: params.apexPos,
      prismRotationY: params.prismRotationY,
      baseIndex: params.baseIndex,
      incomingPos: params.incomingPos,
      screenZ: params.screenZ,
    });

    this.recordMetrics(res.computeTimeMs);
    return {
      rays: res.rays,
      computeTimeMs: res.computeTimeMs,
    };
  }

  /**
   * Run chemistry thermodynamic dissipation and decay across multi-core workers
   */
  public async simulateChemistryStep(params: {
    temperature: number;
    activeGasRate: number;
    ambientTemp?: number;
    dt: number;
  }): Promise<{ temperature: number; activeGasRate: number; computeTimeMs: number }> {
    const res = await this.workerPool.execute<ChemistryStepResponse>({
      action: 'CHEMISTRY_STEP',
      temperature: params.temperature,
      activeGasRate: params.activeGasRate,
      ambientTemp: params.ambientTemp,
      dt: params.dt,
    });

    this.recordMetrics(res.computeTimeMs);
    return {
      temperature: res.temperature,
      activeGasRate: res.activeGasRate,
      computeTimeMs: res.computeTimeMs,
    };
  }

  /**
   * Simulate reaction particle physics across multi-core workers
   */
  public async simulateParticles(params: {
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
  }): Promise<ParticleSimStepResponse> {
    const res = await this.workerPool.execute<ParticleSimStepResponse>({
      action: 'PARTICLE_SIM_STEP',
      ...params,
    });

    this.recordMetrics(res.computeTimeMs);
    return res;
  }

  /**
   * Generate pour stream 3D tube geometry vertices in worker
   */
  public async generatePourStreamTube(params: {
    startWorld: [number, number, number];
    midWorld: [number, number, number];
    endWorld: [number, number, number];
    tubularSegments: number;
    radialSegments: number;
    radius: number;
    vertexBuffer: Float32Array;
  }): Promise<{ vertexBuffer: Float32Array; computeTimeMs: number }> {
    const res = await this.workerPool.execute<StreamTubeStepResponse>(
      {
        action: 'STREAM_TUBE_STEP',
        ...params,
      },
      [params.vertexBuffer.buffer]
    );

    this.recordMetrics(res.computeTimeMs);
    return {
      vertexBuffer: res.vertexBuffer,
      computeTimeMs: res.computeTimeMs,
    };
  }

  /**
   * Bake FBM procedural texture in worker
   */
  public async bakeTextureAsync(params: {
    task: 'floor_fbm' | 'roughness_fbm' | 'bump_fbm';
    resolution: number;
  }): Promise<{ pixelBuffer: Uint8ClampedArray; computeTimeMs: number }> {
    const res = await this.workerPool.execute<TextureBakeTaskResponse>({
      action: 'TEXTURE_BAKE_TASK',
      ...params,
    });

    this.recordMetrics(res.computeTimeMs);
    return {
      pixelBuffer: res.pixelBuffer,
      computeTimeMs: res.computeTimeMs,
    };
  }

  /**
   * Solve chemistry equilibrium composition in worker
   */
  public async solveChemistryComposition(params: {
    volume: number;
    temperature: number;
    pH: number;
    ions: [string, number][];
    precipitates: [string, { formula: string; name: string; color: number; moles: number }][];
    solids: [string, { formula: string; name: string; moles: number }][];
    recentReaction: any;
  }): Promise<{ composition: any; computeTimeMs: number }> {
    const res = await this.workerPool.execute<ChemistryCompositionStepResponse>({
      action: 'CHEMISTRY_COMPOSITION_STEP',
      ...params,
    });

    this.recordMetrics(res.computeTimeMs);
    return {
      composition: res.composition,
      computeTimeMs: res.computeTimeMs,
    };
  }

  /**
   * Simulate Hall carrier particle drift and Lorentz deflection in worker
   */
  public async simulateHallCarriers(params: {
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
  }): Promise<{ positions: Float32Array; baseOffsetsY: Float32Array; computeTimeMs: number }> {
    const res = await this.workerPool.execute<HallCarrierStepResponse>(
      {
        action: 'HALL_CARRIER_STEP',
        ...params,
      },
      [params.positions.buffer, params.baseOffsetsY.buffer]
    );

    this.recordMetrics(res.computeTimeMs);
    return {
      positions: res.positions,
      baseOffsetsY: res.baseOffsetsY,
      computeTimeMs: res.computeTimeMs,
    };
  }

  /**
   * Run mass spectrometer ion trajectory & spectrum simulation in worker
   */
  public async simulateMassSpec(params: {
    sampleId: string;
    accelVoltage: number;
    analyzerBz: number;
    selectorBz: number;
    plateVoltage: number;
    gapM: number;
    jawOpening: number;
    probeX: number;
    phases: number[];
    dt: number;
  }): Promise<MassSpecStepResponse> {
    const res = await this.workerPool.execute<MassSpecStepResponse>({
      action: 'MASS_SPEC_STEP',
      ...params,
    });

    this.recordMetrics(res.computeTimeMs);
    return res;
  }

  /**
   * Run ferromagnetism hysteresis loop & domain simulation in worker
   */
  public async simulateHysteresis(params: {
    materialId: string;
    H: number;
    B: number;
    direction: 1 | -1;
    major: boolean;
    sawPositive: boolean;
    sawNegative: boolean;
    auto: boolean;
    phase: number;
    probeAxial: number;
    dt: number;
  }): Promise<HysteresisStepResponse> {
    const res = await this.workerPool.execute<HysteresisStepResponse>({
      action: 'HYSTERESIS_STEP',
      ...params,
    });

    this.recordMetrics(res.computeTimeMs);
    return res;
  }

  /**
   * Run electromagnetic induction & Faraday/Lenz dynamics in worker
   */
  public async simulateInduction(params: {
    axial: number;
    velocity: number;
    poleSign: 1 | -1;
    turns: number;
    resistanceOhm: number;
    probeAxial: number;
    driven: boolean;
    scripted: boolean;
    sampleClock: number;
    dt: number;
    fluxHistory: number[];
    emfHistory: number[];
  }): Promise<InductionStepResponse> {
    const res = await this.workerPool.execute<InductionStepResponse>({
      action: 'INDUCTION_STEP',
      ...params,
    });

    this.recordMetrics(res.computeTimeMs);
    return res;
  }
}

