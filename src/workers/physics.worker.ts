/// <reference lib="webworker" />

import type { WorkerRequest, WorkerResponse } from './workerMessages';

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

    case 'OPTICAL_DIFFRACTION_STEP': {
      const {
        id,
        intensityBuffer,
        wavelengthNm,
        slitWidthMm,
        slitDistanceMm,
        screenDistanceM,
        screenSpanMm,
        slitCount,
        gratingLinesPerMm,
      } = req;

      const n = intensityBuffer.length;
      const lambda = wavelengthNm * 1e-9;
      const a = slitWidthMm * 1e-3;
      const d = slitCount > 1 && gratingLinesPerMm && gratingLinesPerMm > 0
        ? (1e-3 / gratingLinesPerMm)
        : slitDistanceMm * 1e-3;
      const L = Math.max(0.1, screenDistanceM);
      const span = screenSpanMm * 1e-3;

      for (let i = 0; i < n; i++) {
        // Position y from -span/2 to +span/2
        const y = ((i / (n - 1)) - 0.5) * span;
        const sinTheta = y / Math.sqrt(y * y + L * L);

        // Diffraction envelope beta
        const beta = (Math.PI * a * sinTheta) / lambda;
        const sinc = Math.abs(beta) < 1e-7 ? 1.0 : Math.sin(beta) / beta;
        const diffEnvelope = sinc * sinc;

        let intensity = diffEnvelope;

        if (slitCount === 2) {
          // Double slit interference term: cos^2(alpha)
          const alpha = (Math.PI * d * sinTheta) / lambda;
          const interference = Math.cos(alpha) * Math.cos(alpha);
          intensity = diffEnvelope * interference;
        } else if (slitCount > 2) {
          // Grating / Multi-slit interference term
          const N = Math.min(16, slitCount);
          const alpha = (Math.PI * d * sinTheta) / lambda;
          const sinAlpha = Math.sin(alpha);
          let gratingTerm = 1.0;
          if (Math.abs(sinAlpha) < 1e-5) {
            gratingTerm = 1.0;
          } else {
            const sinNAlpha = Math.sin(N * alpha);
            gratingTerm = (sinNAlpha * sinNAlpha) / (N * N * sinAlpha * sinAlpha);
          }
          intensity = diffEnvelope * gratingTerm;
        }

        intensityBuffer[i] = Math.max(0.0, Math.min(1.0, intensity));
      }

      const computeTimeMs = performance.now() - startTime;
      const resp: WorkerResponse = {
        id,
        action: 'OPTICAL_DIFFRACTION_STEP',
        intensityBuffer,
        computeTimeMs,
      };

      ctx.postMessage(resp, [intensityBuffer.buffer]);
      break;
    }
  }
};
