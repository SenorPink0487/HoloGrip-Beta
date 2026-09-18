/// <reference lib="webworker" />

import type { WorkerRequest, WorkerResponse } from './workerMessages';
import { OpticsMath } from '../physics/optics/OpticsMath';

const ctx: DedicatedWorkerGlobalScope = self as any;

ctx.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const req = e.data;
  const startTime = performance.now();

  switch (req.action) {
    case 'NBODY_STEP': {
      const { id, positions, velocities, masses, dt, g, softening } = req;
      const n = masses.length;
      const epsSq = softening * softening;

      // N-Body Gravitational Physics calculation
      for (let i = 0; i < n; i++) {
        const i3 = i * 3;
        const px = positions[i3];
        const py = positions[i3 + 1];
        const pz = positions[i3 + 2];

        let ax = 0;
        let ay = 0;
        let az = 0;

        for (let j = 0; j < n; j++) {
          if (i === j) continue;
          const j3 = j * 3;
          const dx = positions[j3] - px;
          const dy = positions[j3 + 1] - py;
          const dz = positions[j3 + 2] - pz;

          const distSq = dx * dx + dy * dy + dz * dz + epsSq;
          const invDist = 1.0 / Math.sqrt(distSq);
          const invDist3 = invDist * invDist * invDist;
          const force = g * masses[j] * invDist3;

          ax += dx * force;
          ay += dy * force;
          az += dz * force;
        }

        velocities[i3] += ax * dt;
        velocities[i3 + 1] += ay * dt;
        velocities[i3 + 2] += az * dt;
      }

      for (let i = 0; i < n * 3; i++) {
        positions[i] += velocities[i] * dt;
      }

      const computeTimeMs = performance.now() - startTime;
      const resp: WorkerResponse = {
        id,
        action: 'NBODY_STEP',
        positions,
        velocities,
        computeTimeMs,
      };

      ctx.postMessage(resp, [positions.buffer, velocities.buffer]);
      break;
    }

    case 'WAVE_STEP': {
      const { id, heightMap, velocityMap, width, height, c, damping, dt } = req;
      const cSq = c * c;

      // 2D Wave PDE finite-difference solver
      for (let y = 1; y < height - 1; y++) {
        const yUp = (y - 1) * width;
        const yMid = y * width;
        const yDown = (y + 1) * width;

        for (let x = 1; x < width - 1; x++) {
          const idx = yMid + x;
          const laplacian =
            heightMap[idx - 1] +
            heightMap[idx + 1] +
            heightMap[yUp + x] +
            heightMap[yDown + x] -
            4 * heightMap[idx];

          velocityMap[idx] = (velocityMap[idx] + laplacian * cSq * dt) * damping;
        }
      }

      const total = width * height;
      for (let i = 0; i < total; i++) {
        heightMap[i] += velocityMap[i] * dt;
      }

      const computeTimeMs = performance.now() - startTime;
      const resp: WorkerResponse = {
        id,
        action: 'WAVE_STEP',
        heightMap,
        velocityMap,
        computeTimeMs,
      };

      ctx.postMessage(resp, [heightMap.buffer, velocityMap.buffer]);
      break;
    }

    case 'LORENZ_STEP': {
      const { id, positions, sigma, rho, beta, dt } = req;
      const count = positions.length / 3;

      for (let i = 0; i < count; i++) {
        const i3 = i * 3;
        const x = positions[i3];
        const y = positions[i3 + 1];
        const z = positions[i3 + 2];

        // RK2 / Euler step
        const dx = sigma * (y - x);
        const dy = x * (rho - z) - y;
        const dz = x * y - beta * z;

        positions[i3] = x + dx * dt;
        positions[i3 + 1] = y + dy * dt;
        positions[i3 + 2] = z + dz * dt;
      }

      const computeTimeMs = performance.now() - startTime;
      const resp: WorkerResponse = {
        id,
        action: 'LORENZ_STEP',
        positions,
        computeTimeMs,
      };

      ctx.postMessage(resp, [positions.buffer]);
      break;
    }

    case 'OPTICS_FRINGE_STEP': {
      const {
        id,
        width,
        height,
        type,
        wavelengthNm,
        slitDistanceMm,
        slitWidthMm,
        screenDistanceM,
        gratingDensityLinesPerMm,
        polarizerAngleDeg,
        analyzerAngleDeg,
        screenPhysicalWidthM,
        intensity: requestedIntensity,
      } = req;

      const pixels = new Uint8ClampedArray(width * height * 4);
      const color = OpticsMath.wavelengthToRGB(wavelengthNm);
      const baseR = color.r * 255;
      const baseG = color.g * 255;
      const baseB = color.b * 255;

      const screenWidthM = screenPhysicalWidthM || 0.08;
      const L = screenDistanceM || 1.0;
      const lambdaM = wavelengthNm * 1e-9;
      const I0 = requestedIntensity ?? 1.0;

      if (type === 'double_slit') {
        const d = (slitDistanceMm ?? 0.25) * 1e-3;
        const a = (slitWidthMm ?? 0.04) * 1e-3;

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

            pixels[idx] = Math.min(255, 18 + Math.round(baseR * intensity * 1.3));
            pixels[idx + 1] = Math.min(255, 20 + Math.round(baseG * intensity * 1.3));
            pixels[idx + 2] = Math.min(255, 24 + Math.round(baseB * intensity * 1.3));
            pixels[idx + 3] = 255;
          }
        }
      } else if (type === 'single_slit') {
        const a = (slitWidthMm ?? 0.08) * 1e-3;

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

            pixels[idx] = Math.min(255, 18 + Math.round(baseR * intensity * 1.3));
            pixels[idx + 1] = Math.min(255, 20 + Math.round(baseG * intensity * 1.3));
            pixels[idx + 2] = Math.min(255, 24 + Math.round(baseB * intensity * 1.3));
            pixels[idx + 3] = 255;
          }
        }
      } else if (type === 'circular_aperture') {
        const diameter = (slitWidthMm ?? 0.15) * 1e-3;
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
            pixels[idx] = Math.min(255, 18 + Math.round(baseR * intensity * 1.3));
            pixels[idx + 1] = Math.min(255, 20 + Math.round(baseG * intensity * 1.3));
            pixels[idx + 2] = Math.min(255, 24 + Math.round(baseB * intensity * 1.3));
            pixels[idx + 3] = 255;
          }
        }
      } else if (type === 'grating') {
        const density = gratingDensityLinesPerMm ?? 300;
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

            pixels[idx] = Math.min(255, 18 + Math.round(baseR * intensity * 1.4));
            pixels[idx + 1] = Math.min(255, 20 + Math.round(baseG * intensity * 1.4));
            pixels[idx + 2] = Math.min(255, 24 + Math.round(baseB * intensity * 1.4));
            pixels[idx + 3] = 255;
          }
        }
      } else if (type === 'polarization_spot') {
        const p1 = ((polarizerAngleDeg ?? 0) * Math.PI) / 180;
        const p2 = ((analyzerAngleDeg ?? 0) * Math.PI) / 180;
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
            pixels[idx] = Math.min(255, 18 + Math.round(baseR * finalI * 1.4));
            pixels[idx + 1] = Math.min(255, 20 + Math.round(baseG * finalI * 1.4));
            pixels[idx + 2] = Math.min(255, 24 + Math.round(baseB * finalI * 1.4));
            pixels[idx + 3] = 255;
          }
        }
      } else if (type === 'dispersion_spectrum') {
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

            pixels[idx] = Math.min(255, 18 + Math.round(rgb.r * 255 * yProfile * 1.2));
            pixels[idx + 1] = Math.min(255, 20 + Math.round(rgb.g * 255 * yProfile * 1.2));
            pixels[idx + 2] = Math.min(255, 24 + Math.round(rgb.b * 255 * yProfile * 1.2));
            pixels[idx + 3] = 255;
          }
        }
      }

      const computeTimeMs = performance.now() - startTime;
      const resp: WorkerResponse = {
        id,
        action: 'OPTICS_FRINGE_STEP',
        pixels,
        width,
        height,
        computeTimeMs,
      };

      ctx.postMessage(resp, [pixels.buffer]);
      break;
    }
  }
};
