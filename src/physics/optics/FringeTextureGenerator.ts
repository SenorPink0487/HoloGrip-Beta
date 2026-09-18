import * as THREE from 'three';
import { OpticsMath } from './OpticsMath';
import type { ComputeBridge } from '../../core/platform/ComputeBridge';

export type FringePatternType =
  | 'double_slit'
  | 'single_slit'
  | 'circular_aperture'
  | 'grating'
  | 'polarization_spot'
  | 'dispersion_spectrum';

export interface FringeGeneratorParams {
  type: FringePatternType;
  wavelengthNm: number;
  slitDistanceMm?: number; // d in mm
  slitWidthMm?: number; // a in mm
  screenDistanceM?: number; // L in meters
  gratingDensityLinesPerMm?: number; // N
  polarizerAngleDeg?: number;
  analyzerAngleDeg?: number;
  screenPhysicalWidthM?: number; // width represented by texture
  intensity?: number;
}

export class FringeTextureGenerator {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  public texture: THREE.CanvasTexture;

  public readonly width = 1024;
  public readonly height = 256;

  // Multi-thread Worker state & Coalescing Frame Scheduler
  private isComputing = false;
  private pendingParams: FringeGeneratorParams | null = null;

  constructor(private computeBridge?: ComputeBridge | null) {
    if (typeof document !== 'undefined') {
      this.canvas = document.createElement('canvas');
      this.canvas.width = this.width;
      this.canvas.height = this.height;
      this.ctx = this.canvas.getContext('2d', { willReadFrequently: true })!;
    } else {
      // Fallback for headless environments
      this.canvas = {} as any;
      this.ctx = {} as any;
    }

    if (this.canvas.width) {
      this.texture = new THREE.CanvasTexture(this.canvas);
      this.texture.colorSpace = THREE.SRGBColorSpace;
      this.texture.minFilter = THREE.LinearFilter;
      this.texture.magFilter = THREE.LinearFilter;
      this.texture.generateMipmaps = false;
    }
  }

  public setComputeBridge(bridge: ComputeBridge): void {
    this.computeBridge = bridge;
  }

  /**
   * Render fringe pattern.
   * If ComputeBridge is connected, offloads heavy transcendental math to multi-core Web Worker pool.
   * Employs a frame coalescing queue to prevent backlog during rapid 120Hz slider scrubbing.
   */
  public render(params: FringeGeneratorParams): void {
    if (this.computeBridge) {
      if (this.isComputing) {
        // Coalesce: keep only the newest frame parameters, discard stale intermediate frames
        this.pendingParams = params;
        return;
      }
      this.isComputing = true;
      this.dispatchWorkerCompute(params);
    } else {
      // Isomorphic fallback: synchronous calculation for unit tests or environments without workers
      this.renderSync(params);
    }
  }

  private async dispatchWorkerCompute(params: FringeGeneratorParams): Promise<void> {
    if (!this.computeBridge) return;

    try {
      const res = await this.computeBridge.computeOpticsFringe({
        width: this.width,
        height: this.height,
        type: params.type,
        wavelengthNm: params.wavelengthNm,
        slitDistanceMm: params.slitDistanceMm,
        slitWidthMm: params.slitWidthMm,
        screenDistanceM: params.screenDistanceM,
        gratingDensityLinesPerMm: params.gratingDensityLinesPerMm,
        polarizerAngleDeg: params.polarizerAngleDeg,
        analyzerAngleDeg: params.analyzerAngleDeg,
        screenPhysicalWidthM: params.screenPhysicalWidthM,
        intensity: params.intensity,
      });

      if (this.ctx && res.pixels) {
        const imgData = new ImageData(res.pixels as any, this.width, this.height);
        this.ctx.putImageData(imgData, 0, 0);
        this.drawMillimeterTicks();

        if (this.texture) {
          this.texture.needsUpdate = true;
        }
      }
    } catch (err) {
      console.warn('[FringeTextureGenerator] Worker computation error, falling back to sync:', err);
      this.renderSync(params);
    } finally {
      this.isComputing = false;
      if (this.pendingParams) {
        const next = this.pendingParams;
        this.pendingParams = null;
        this.isComputing = true;
        this.dispatchWorkerCompute(next);
      }
    }
  }

  /**
   * Synchronous fallback calculation (Isomorphic execution)
   */
  public renderSync(params: FringeGeneratorParams): void {
    if (!this.ctx) return;

    const { width, height } = this;
    const ctx = this.ctx;

    ctx.fillStyle = '#111317';
    ctx.fillRect(0, 0, width, height);

    const imgData = ctx.getImageData(0, 0, width, height);
    const data = imgData.data;

    const wl = params.wavelengthNm;
    const color = OpticsMath.wavelengthToRGB(wl);
    const baseR = color.r * 255;
    const baseG = color.g * 255;
    const baseB = color.b * 255;

    const screenWidthM = params.screenPhysicalWidthM || 0.08;
    const L = params.screenDistanceM || 1.0;
    const lambdaM = wl * 1e-9;
    const I0 = params.intensity ?? 1.0;

    if (params.type === 'double_slit') {
      const d = (params.slitDistanceMm ?? 0.25) * 1e-3;
      const a = (params.slitWidthMm ?? 0.04) * 1e-3;

      const rowIntensity = new Float32Array(width);
      for (let x = 0; x < width; x++) {
        const xCoord = ((x - width / 2) / width) * screenWidthM;
        rowIntensity[x] = OpticsMath.doubleSlitIntensity(xCoord, lambdaM, d, a, L, I0);
      }

      const halfH = height / 2;
      const beamHeightSigma = height * 0.22;

      for (let y = 0; y < height; y++) {
        const dy = y - halfH;
        const yProfile = Math.exp(-(dy * dy) / (2 * beamHeightSigma * beamHeightSigma));
        const rowOffset = y * width * 4;

        for (let x = 0; x < width; x++) {
          const intensity = Math.min(1.0, rowIntensity[x] * yProfile);
          const idx = rowOffset + x * 4;

          data[idx] = Math.min(255, 18 + Math.round(baseR * intensity * 1.3));
          data[idx + 1] = Math.min(255, 20 + Math.round(baseG * intensity * 1.3));
          data[idx + 2] = Math.min(255, 24 + Math.round(baseB * intensity * 1.3));
          data[idx + 3] = 255;
        }
      }
    } else if (params.type === 'single_slit') {
      const a = (params.slitWidthMm ?? 0.08) * 1e-3;

      const rowIntensity = new Float32Array(width);
      for (let x = 0; x < width; x++) {
        const xCoord = ((x - width / 2) / width) * screenWidthM;
        rowIntensity[x] = OpticsMath.singleSlitIntensity(xCoord, lambdaM, a, L, I0);
      }

      const halfH = height / 2;
      const beamHeightSigma = height * 0.24;

      for (let y = 0; y < height; y++) {
        const dy = y - halfH;
        const yProfile = Math.exp(-(dy * dy) / (2 * beamHeightSigma * beamHeightSigma));
        const rowOffset = y * width * 4;

        for (let x = 0; x < width; x++) {
          const intensity = Math.min(1.0, rowIntensity[x] * yProfile);
          const idx = rowOffset + x * 4;

          data[idx] = Math.min(255, 18 + Math.round(baseR * intensity * 1.3));
          data[idx + 1] = Math.min(255, 20 + Math.round(baseG * intensity * 1.3));
          data[idx + 2] = Math.min(255, 24 + Math.round(baseB * intensity * 1.3));
          data[idx + 3] = 255;
        }
      }
    } else if (params.type === 'circular_aperture') {
      const diameter = (params.slitWidthMm ?? 0.15) * 1e-3;
      const halfW = width / 2;
      const halfH = height / 2;

      for (let y = 0; y < height; y++) {
        const yCoord = ((y - halfH) / height) * (screenWidthM * (height / width));
        const rowOffset = y * width * 4;

        for (let x = 0; x < width; x++) {
          const xCoord = ((x - halfW) / width) * screenWidthM;
          const r = Math.hypot(xCoord, yCoord);
          const intensity = Math.min(1.0, OpticsMath.circularApertureIntensity(r, lambdaM, diameter, L, I0));

          const idx = rowOffset + x * 4;
          data[idx] = Math.min(255, 18 + Math.round(baseR * intensity * 1.3));
          data[idx + 1] = Math.min(255, 20 + Math.round(baseG * intensity * 1.3));
          data[idx + 2] = Math.min(255, 24 + Math.round(baseB * intensity * 1.3));
          data[idx + 3] = 255;
        }
      }
    } else if (params.type === 'grating') {
      const density = params.gratingDensityLinesPerMm ?? 300;
      const gratingPeriod = (1.0 / density) * 1e-3;
      const a = gratingPeriod * 0.25;

      const rowIntensity = new Float32Array(width);
      for (let x = 0; x < width; x++) {
        const xCoord = ((x - width / 2) / width) * screenWidthM;
        rowIntensity[x] = OpticsMath.gratingIntensity(xCoord, lambdaM, gratingPeriod, a, L, 12, I0);
      }

      const halfH = height / 2;
      const beamHeightSigma = height * 0.22;

      for (let y = 0; y < height; y++) {
        const dy = y - halfH;
        const yProfile = Math.exp(-(dy * dy) / (2 * beamHeightSigma * beamHeightSigma));
        const rowOffset = y * width * 4;

        for (let x = 0; x < width; x++) {
          const intensity = Math.min(1.0, rowIntensity[x] * yProfile);
          const idx = rowOffset + x * 4;

          data[idx] = Math.min(255, 18 + Math.round(baseR * intensity * 1.4));
          data[idx + 1] = Math.min(255, 20 + Math.round(baseG * intensity * 1.4));
          data[idx + 2] = Math.min(255, 24 + Math.round(baseB * intensity * 1.4));
          data[idx + 3] = 255;
        }
      }
    } else if (params.type === 'polarization_spot') {
      const p1 = ((params.polarizerAngleDeg ?? 0) * Math.PI) / 180;
      const p2 = ((params.analyzerAngleDeg ?? 0) * Math.PI) / 180;
      const theta = Math.abs(p1 - p2);
      const intensity = OpticsMath.malusIntensity(theta, I0);

      const halfW = width / 2;
      const halfH = height / 2;
      const spotRadius = width * 0.045;

      for (let y = 0; y < height; y++) {
        const dy = y - halfH;
        const rowOffset = y * width * 4;

        for (let x = 0; x < width; x++) {
          const dx = x - halfW;
          const distSq = dx * dx + dy * dy;
          const spotProfile = Math.exp(-distSq / (2 * spotRadius * spotRadius));
          const finalI = intensity * spotProfile;

          const idx = rowOffset + x * 4;
          data[idx] = Math.min(255, 18 + Math.round(baseR * finalI * 1.4));
          data[idx + 1] = Math.min(255, 20 + Math.round(baseG * finalI * 1.4));
          data[idx + 2] = Math.min(255, 24 + Math.round(baseB * finalI * 1.4));
          data[idx + 3] = 255;
        }
      }
    } else if (params.type === 'dispersion_spectrum') {
      const halfH = height / 2;
      const bandHeightSigma = height * 0.22;

      for (let x = 0; x < width; x++) {
        const t = x / width;
        const currentWl = 720 - t * (720 - 400);
        const rgb = OpticsMath.wavelengthToRGB(currentWl);

        for (let y = 0; y < height; y++) {
          const dy = y - halfH;
          const yProfile = Math.exp(-(dy * dy) / (2 * bandHeightSigma * bandHeightSigma));
          const idx = (y * width + x) * 4;

          data[idx] = Math.min(255, 18 + Math.round(rgb.r * 255 * yProfile * 1.2));
          data[idx + 1] = Math.min(255, 20 + Math.round(rgb.g * 255 * yProfile * 1.2));
          data[idx + 2] = Math.min(255, 24 + Math.round(rgb.b * 255 * yProfile * 1.2));
          data[idx + 3] = 255;
        }
      }
    }

    ctx.putImageData(imgData, 0, 0);
    this.drawMillimeterTicks();

    if (this.texture) {
      this.texture.needsUpdate = true;
    }
  }

  private drawMillimeterTicks(): void {
    if (!this.ctx) return;
    const { width, height } = this;
    const ctx = this.ctx;

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.lineWidth = 1;

    ctx.beginPath();
    ctx.moveTo(width / 2, 0);
    ctx.lineTo(width / 2, height);
    ctx.moveTo(0, height / 2);
    ctx.lineTo(width, height / 2);
    ctx.stroke();

    const mmStepPx = width / 80;
    ctx.beginPath();
    for (let i = 0; i <= 80; i++) {
      const px = i * mmStepPx;
      const tickH = i % 10 === 0 ? 12 : i % 5 === 0 ? 8 : 4;
      ctx.moveTo(px, 0);
      ctx.lineTo(px, tickH);
      ctx.moveTo(px, height);
      ctx.lineTo(px, height - tickH);
    }
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
    ctx.stroke();
  }

  public dispose(): void {
    this.texture?.dispose();
    this.pendingParams = null;
    this.isComputing = false;
  }
}
