import { PlatformBridge } from './PlatformBridge';
import type { WorkerPool } from '../../workers/WorkerPool';
import type {
  NBodyStepResponse,
  WaveStepResponse,
  LorenzStepResponse,
  OpticsFringeRequest,
  OpticsFringeResponse,
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

  constructor(private workerPool: WorkerPool) {
    this.metrics.mode = this.platform.info.isTauri ? 'rust-rayon' : 'web-worker';
  }

  public get currentMetrics(): ComputeMetrics {
    return this.metrics;
  }

  private recordMetrics(ms: number): void {
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
   * Run multi-core optical wavefield & fringe matrix computation across Web Workers
   */
  public async computeOpticsFringe(
    params: Omit<OpticsFringeRequest, 'id' | 'action'>
  ): Promise<OpticsFringeResponse> {
    const res = await this.workerPool.execute<OpticsFringeResponse>({
      action: 'OPTICS_FRINGE_STEP',
      ...params,
    });

    this.recordMetrics(res.computeTimeMs);
    return res;
  }
}
