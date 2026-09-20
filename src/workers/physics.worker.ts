/// <reference lib="webworker" />

import type { WorkerRequest, WorkerResponse, WorkerDispersionRayData } from './workerMessages';

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

    case 'OPTICAL_POLARIZATION_STEP': {
      const {
        id,
        positions,
        colors,
        polarizerAngleDeg,
        analyzerAngleDeg,
        hasQuarterWavePlate,
        wavelengthNm,
        startZ,
        endZ,
        polarizerZ,
        analyzerZ,
        numSamples,
        time,
      } = req;

      const dz = (endZ - startZ) / numSamples;
      const k = (2 * Math.PI) / 0.14; // Spatial wavelength in 3D ~ 14cm
      const omega = 4.0;
      const beamY = 0.186; // Optical axis height

      const polAngleRad = (polarizerAngleDeg * Math.PI) / 180;
      const anaAngleRad = (analyzerAngleDeg * Math.PI) / 180;

      const deltaAngle = anaAngleRad - polAngleRad;
      const cosDelta = Math.cos(deltaAngle);
      const malusIntensity = cosDelta * cosDelta;

      const [r, g, b] = wavelengthToRgb(wavelengthNm);

      let vIdx = 0;
      let cIdx = 0;

      for (let i = 0; i <= numSamples; i++) {
        const z = startZ + i * dz;
        const phase = k * z - omega * time;

        let ampX = 0;
        let ampY = 0;
        const ampMag = 0.024; // 24mm amplitude

        if (z < polarizerZ) {
          ampX = ampMag * Math.cos(polAngleRad) * Math.cos(phase);
          ampY = ampMag * Math.sin(polAngleRad) * Math.cos(phase);
        } else if (z >= polarizerZ && z < analyzerZ) {
          if (hasQuarterWavePlate) {
            ampX = ampMag * Math.cos(polAngleRad) * Math.sin(phase);
            ampY = ampMag * Math.sin(polAngleRad) * Math.cos(phase);
          } else {
            ampX = ampMag * Math.cos(polAngleRad) * Math.cos(phase);
            ampY = ampMag * Math.sin(polAngleRad) * Math.cos(phase);
          }
        } else {
          const transAmp = ampMag * cosDelta;
          ampX = transAmp * Math.cos(anaAngleRad) * Math.cos(phase);
          ampY = transAmp * Math.sin(anaAngleRad) * Math.cos(phase);
        }

        // Origin on beam axis
        positions[vIdx++] = 0;
        positions[vIdx++] = beamY;
        positions[vIdx++] = z;

        // Vector tip
        positions[vIdx++] = ampX;
        positions[vIdx++] = beamY + ampY;
        positions[vIdx++] = z;

        colors[cIdx++] = r * 0.4;
        colors[cIdx++] = g * 0.4;
        colors[cIdx++] = b * 0.4;

        colors[cIdx++] = r;
        colors[cIdx++] = g;
        colors[cIdx++] = b;
      }

      const computeTimeMs = performance.now() - startTime;
      const resp: WorkerResponse = {
        id,
        action: 'OPTICAL_POLARIZATION_STEP',
        positions,
        colors,
        malusIntensity,
        computeTimeMs,
      };

      ctx.postMessage(resp, [positions.buffer, colors.buffer]);
      break;
    }

    case 'OPTICAL_DISPERSION_STEP': {
      const { id, apexPos, prismRotationY, baseIndex, incomingPos } = req;

      const spectrumWavelengths = [
        { wl: 680, name: 'Red' },
        { wl: 610, name: 'Orange' },
        { wl: 575, name: 'Yellow' },
        { wl: 530, name: 'Green' },
        { wl: 480, name: 'Cyan' },
        { wl: 440, name: 'Blue' },
        { wl: 405, name: 'Violet' },
      ];

      const rays: WorkerDispersionRayData[] = [];
      const prismSide = 0.14;
      const inDirX = 0, inDirY = 0, inDirZ = 1;

      for (const spec of spectrumWavelengths) {
        const lambdaUm = spec.wl / 1000;
        const refUm = 0.5893;
        const delta = 0.0075 * (1 / (lambdaUm * lambdaUm) - 1 / (refUm * refUm));
        const n = Math.max(1.0, baseIndex + delta);
        const rgb = wavelengthToRgb(spec.wl);

        // Geometry of 60° equilateral prism
        const apexAngle = Math.PI / 3;
        const f1Angle = prismRotationY + apexAngle * 0.5;
        const face1Nx = -Math.sin(f1Angle), face1Ny = 0, face1Nz = Math.cos(f1Angle);

        const r1 = refractRay3D(inDirX, inDirY, inDirZ, face1Nx, face1Ny, face1Nz, 1.0, n);

        const pEnter: [number, number, number] = [
          apexPos[0] - 0.02,
          apexPos[1],
          apexPos[2] - prismSide * 0.25,
        ];
        const pExit: [number, number, number] = [
          pEnter[0] + r1.outX * 0.065,
          pEnter[1] + r1.outY * 0.065,
          pEnter[2] + r1.outZ * 0.065,
        ];

        const f2Angle = prismRotationY - apexAngle * 0.5;
        const face2Nx = Math.sin(f2Angle), face2Ny = 0, face2Nz = Math.cos(f2Angle);

        const r2 = refractRay3D(r1.outX, r1.outY, r1.outZ, face2Nx, face2Ny, face2Nz, n, 1.0);

        const pScreen: [number, number, number] = [
          pExit[0] + r2.outX * 0.52,
          pExit[1] + r2.outY * 0.52,
          pExit[2] + r2.outZ * 0.52,
        ];

        // Deviation angle
        const dotProd = Math.max(-1, Math.min(1, inDirZ * r2.outZ + inDirX * r2.outX + inDirY * r2.outY));
        const deviationAngleRad = Math.acos(dotProd);

        rays.push({
          wavelengthNm: spec.wl,
          colorRgb: rgb,
          refractiveIndex: n,
          deviationAngleRad,
          points: [
            incomingPos,
            pEnter,
            pExit,
            pScreen,
          ],
        });
      }

      const computeTimeMs = performance.now() - startTime;
      const resp: WorkerResponse = {
        id,
        action: 'OPTICAL_DISPERSION_STEP',
        rays,
        computeTimeMs,
      };

      ctx.postMessage(resp);
      break;
    }

    case 'CHEMISTRY_STEP': {
      const { id, temperature, activeGasRate, ambientTemp = 20.0, dt } = req;

      // Newton's law of cooling towards ambient room temp
      const coolingRate = 0.04;
      const newTemp = temperature > ambientTemp
        ? Math.max(ambientTemp, temperature - (temperature - ambientTemp) * coolingRate * dt)
        : temperature < ambientTemp
        ? Math.min(ambientTemp, temperature + (ambientTemp - temperature) * coolingRate * dt)
        : temperature;

      // Gas evolution decay
      const newGasRate = Math.max(0, activeGasRate - dt * 0.15);

      const computeTimeMs = performance.now() - startTime;
      const resp: WorkerResponse = {
        id,
        action: 'CHEMISTRY_STEP',
        temperature: newTemp,
        activeGasRate: newGasRate,
        computeTimeMs,
      };

      ctx.postMessage(resp);
      break;
    }

    case 'PARTICLE_SIM_STEP': {
      const {
        id,
        bubblePositions,
        bubbleVelocities,
        bubblePhases,
        gasRate,
        precipPositions,
        precipSpeeds,
        isPrecipitating,
        splashPositions,
        splashVelocities,
        splashLifespans,
        isPouring,
        sodiumSparkPositions,
        sodiumSparkVelocities,
        sodiumSparkLifespans,
        isSodiumBurning,
        sodiumAngle,
        liquidSurfaceLocalY,
        liquidRadius,
        dt,
      } = req;

      // 1. Gas Bubbles
      if (gasRate > 0.05) {
        const bubbleCount = bubbleVelocities.length;
        const rMax = liquidRadius * 0.85;
        for (let i = 0; i < bubbleCount; i++) {
          const i3 = i * 3;
          bubblePositions[i3 + 1] += bubbleVelocities[i] * dt * (0.8 + gasRate * 0.8);
          bubblePhases[i] += dt * 5.0;
          bubblePositions[i3] += Math.sin(bubblePhases[i]) * 0.0008;
          bubblePositions[i3 + 2] += Math.cos(bubblePhases[i]) * 0.0008;

          if (bubblePositions[i3 + 1] >= liquidSurfaceLocalY) {
            const r = Math.sqrt(Math.random()) * rMax;
            const angle = Math.random() * Math.PI * 2;
            bubblePositions[i3] = Math.cos(angle) * r;
            bubblePositions[i3 + 1] = 0.012;
            bubblePositions[i3 + 2] = Math.sin(angle) * r;
            bubbleVelocities[i] = 0.08 + Math.random() * 0.14;
            bubblePhases[i] = Math.random() * Math.PI * 2;
          }
        }
      }

      // 2. Precipitate
      if (isPrecipitating) {
        const precipCount = precipSpeeds.length;
        for (let i = 0; i < precipCount; i++) {
          const i3 = i * 3;
          precipPositions[i3 + 1] -= precipSpeeds[i] * dt;
          precipPositions[i3] += (Math.random() - 0.5) * 0.0012;
          precipPositions[i3 + 2] += (Math.random() - 0.5) * 0.0012;

          if (precipPositions[i3 + 1] <= 0.012) {
            precipPositions[i3 + 1] = 0.011;
          }
        }
      }

      // 3. Splash
      const splashCount = splashLifespans.length;
      if (isPouring) {
        for (let i = 0; i < splashCount; i++) {
          if (splashLifespans[i] <= 0 && Math.random() < 0.4) {
            splashLifespans[i] = 0.3 + Math.random() * 0.2;
            const i3 = i * 3;
            splashPositions[i3] = 0.015 + (Math.random() - 0.5) * 0.015;
            splashPositions[i3 + 1] = liquidSurfaceLocalY + 0.002;
            splashPositions[i3 + 2] = 0.015 + (Math.random() - 0.5) * 0.015;

            const angle = Math.random() * Math.PI * 2;
            const spd = 0.06 + Math.random() * 0.08;
            splashVelocities[i3] = Math.cos(angle) * spd;
            splashVelocities[i3 + 1] = 0.08 + Math.random() * 0.08;
            splashVelocities[i3 + 2] = Math.sin(angle) * spd;
          }
        }
      }

      for (let i = 0; i < splashCount; i++) {
        const i3 = i * 3;
        if (splashLifespans[i] > 0) {
          splashLifespans[i] -= dt;
          splashPositions[i3] += splashVelocities[i3] * dt;
          splashPositions[i3 + 1] += splashVelocities[i3 + 1] * dt;
          splashVelocities[i3 + 1] -= 9.8 * 0.05 * dt;
          splashPositions[i3 + 2] += splashVelocities[i3 + 2] * dt;
        } else {
          splashPositions[i3 + 1] = -10;
        }
      }

      // 4. Sodium Sparks & Ball Position
      let ballX = 0;
      let ballY = liquidSurfaceLocalY + 0.006;
      let ballZ = 0;
      let newSodiumAngle = sodiumAngle;
      const sparkCount = sodiumSparkLifespans.length;

      if (isSodiumBurning) {
        newSodiumAngle += dt * 6.5;
        const orbitR = liquidRadius * 0.65;
        ballX = Math.cos(newSodiumAngle) * orbitR;
        ballZ = Math.sin(newSodiumAngle * 1.3) * orbitR;

        for (let i = 0; i < sparkCount; i++) {
          if (sodiumSparkLifespans[i] <= 0 && Math.random() < 0.6) {
            sodiumSparkLifespans[i] = 0.25 + Math.random() * 0.25;
            const i3 = i * 3;
            sodiumSparkPositions[i3] = ballX;
            sodiumSparkPositions[i3 + 1] = ballY;
            sodiumSparkPositions[i3 + 2] = ballZ;

            const theta = Math.random() * Math.PI * 2;
            const phi = Math.random() * Math.PI * 0.5;
            const spd = 0.15 + Math.random() * 0.25;

            sodiumSparkVelocities[i3] = Math.sin(phi) * Math.cos(theta) * spd;
            sodiumSparkVelocities[i3 + 1] = Math.cos(phi) * spd;
            sodiumSparkVelocities[i3 + 2] = Math.sin(phi) * Math.sin(theta) * spd;
          }
        }
      }

      for (let i = 0; i < sparkCount; i++) {
        const i3 = i * 3;
        if (sodiumSparkLifespans[i] > 0) {
          sodiumSparkLifespans[i] -= dt;
          sodiumSparkPositions[i3] += sodiumSparkVelocities[i3] * dt;
          sodiumSparkPositions[i3 + 1] += sodiumSparkVelocities[i3 + 1] * dt;
          sodiumSparkVelocities[i3 + 1] -= 9.8 * 0.08 * dt;
          sodiumSparkPositions[i3 + 2] += sodiumSparkVelocities[i3 + 2] * dt;
        } else {
          sodiumSparkPositions[i3 + 1] = -10;
        }
      }

      const computeTimeMs = performance.now() - startTime;
      const resp: WorkerResponse = {
        id,
        action: 'PARTICLE_SIM_STEP',
        bubblePositions,
        bubbleVelocities,
        bubblePhases,
        precipPositions,
        precipSpeeds,
        splashPositions,
        splashVelocities,
        splashLifespans,
        sodiumSparkPositions,
        sodiumSparkVelocities,
        sodiumSparkLifespans,
        sodiumBallPos: [ballX, ballY, ballZ],
        sodiumAngle: newSodiumAngle,
        computeTimeMs,
      };

      ctx.postMessage(resp, [
        bubblePositions.buffer,
        bubbleVelocities.buffer,
        bubblePhases.buffer,
        precipPositions.buffer,
        precipSpeeds.buffer,
        splashPositions.buffer,
        splashVelocities.buffer,
        splashLifespans.buffer,
        sodiumSparkPositions.buffer,
        sodiumSparkVelocities.buffer,
        sodiumSparkLifespans.buffer,
      ]);
      break;
    }

    case 'STREAM_TUBE_STEP': {
      const { id, startWorld, midWorld, endWorld, tubularSegments, radialSegments, radius, vertexBuffer } = req;

      const p0 = startWorld;
      const p1 = midWorld;
      const p2 = endWorld;

      let prevNormal = [0, 1, 0];

      for (let i = 0; i <= tubularSegments; i++) {
        const t = i / tubularSegments;
        const omt = 1 - t;

        // Quadratic Bezier interpolation
        const cx = omt * omt * p0[0] + 2 * omt * t * p1[0] + t * t * p2[0];
        const cy = omt * omt * p0[1] + 2 * omt * t * p1[1] + t * t * p2[1];
        const cz = omt * omt * p0[2] + 2 * omt * t * p1[2] + t * t * p2[2];

        // Tangent
        const tx = 2 * omt * (p1[0] - p0[0]) + 2 * t * (p2[0] - p1[0]);
        const ty = 2 * omt * (p1[1] - p0[1]) + 2 * t * (p2[1] - p1[1]);
        const tz = 2 * omt * (p1[2] - p0[2]) + 2 * t * (p2[2] - p1[2]);
        const tLen = Math.hypot(tx, ty, tz) || 1;
        const normTx = tx / tLen;
        const normTy = ty / tLen;
        const normTz = tz / tLen;

        // Frenet-Serret normal
        let nx = prevNormal[0];
        let ny = prevNormal[1];
        let nz = prevNormal[2];
        const dot = nx * normTx + ny * normTy + nz * normTz;
        nx -= dot * normTx;
        ny -= dot * normTy;
        nz -= dot * normTz;
        let nLen = Math.hypot(nx, ny, nz);
        if (nLen < 1e-4) {
          nx = Math.abs(normTx) > 0.9 ? 0 : 1;
          ny = Math.abs(normTy) > 0.9 ? 0 : 1;
          nz = 0;
          const dot2 = nx * normTx + ny * normTy + nz * normTz;
          nx -= dot2 * normTx;
          ny -= dot2 * normTy;
          nz -= dot2 * normTz;
          nLen = Math.hypot(nx, ny, nz) || 1;
        }
        nx /= nLen;
        ny /= nLen;
        nz /= nLen;
        prevNormal = [nx, ny, nz];

        // Binormal
        const bx = normTy * nz - normTz * ny;
        const by = normTz * nx - normTx * nz;
        const bz = normTx * ny - normTy * nx;

        for (let j = 0; j <= radialSegments; j++) {
          const vAngle = (j / radialSegments) * Math.PI * 2;
          const sinA = Math.sin(vAngle);
          const cosA = Math.cos(vAngle);

          const vx = cx + radius * (cosA * nx + sinA * bx);
          const vy = cy + radius * (cosA * ny + sinA * by);
          const vz = cz + radius * (cosA * nz + sinA * bz);

          const vIdx = (i * (radialSegments + 1) + j) * 3;
          vertexBuffer[vIdx] = vx;
          vertexBuffer[vIdx + 1] = vy;
          vertexBuffer[vIdx + 2] = vz;
        }
      }

      const computeTimeMs = performance.now() - startTime;
      const resp: WorkerResponse = {
        id,
        action: 'STREAM_TUBE_STEP',
        vertexBuffer,
        computeTimeMs,
      };

      ctx.postMessage(resp, [vertexBuffer.buffer]);
      break;
    }

    case 'TEXTURE_BAKE_TASK': {
      const { id, task, resolution } = req;
      const pixelBuffer = bakeProceduralTextureWorker(task, resolution);
      const computeTimeMs = performance.now() - startTime;

      const resp: WorkerResponse = {
        id,
        action: 'TEXTURE_BAKE_TASK',
        task,
        pixelBuffer,
        computeTimeMs,
      };

      ctx.postMessage(resp, [pixelBuffer.buffer]);
      break;
    }

    case 'CHEMISTRY_COMPOSITION_STEP': {
      const { id, volume, temperature, pH, ions, precipitates, solids, recentReaction } = req;
      const composition = solveCompositionWorker(volume, temperature, pH, ions, precipitates, solids, recentReaction);
      const computeTimeMs = performance.now() - startTime;

      const resp: WorkerResponse = {
        id,
        action: 'CHEMISTRY_COMPOSITION_STEP',
        composition,
        computeTimeMs,
      };

      ctx.postMessage(resp);
      break;
    }
  }
};

function wavelengthToRgb(w: number): [number, number, number] {
  let r = 0;
  let g = 0;
  let b = 0;

  if (w >= 380 && w < 440) {
    r = -(w - 440) / (440 - 380);
    g = 0.0;
    b = 1.0;
  } else if (w >= 440 && w < 490) {
    r = 0.0;
    g = (w - 440) / (490 - 440);
    b = 1.0;
  } else if (w >= 490 && w < 510) {
    r = 0.0;
    g = 1.0;
    b = -(w - 510) / (510 - 490);
  } else if (w >= 510 && w < 580) {
    r = (w - 510) / (580 - 510);
    g = 1.0;
    b = 0.0;
  } else if (w >= 580 && w < 645) {
    r = 1.0;
    g = -(w - 645) / (645 - 580);
    b = 0.0;
  } else if (w >= 645 && w <= 750) {
    r = 1.0;
    g = 0.0;
    b = 0.0;
  }

  let factor = 0.0;
  if (w >= 380 && w < 420) {
    factor = 0.3 + 0.7 * (w - 380) / (420 - 380);
  } else if (w >= 420 && w < 701) {
    factor = 1.0;
  } else if (w >= 701 && w <= 750) {
    factor = 0.3 + 0.7 * (750 - w) / (750 - 700);
  }

  return [
    Math.max(0, Math.min(1, r * factor)),
    Math.max(0, Math.min(1, g * factor)),
    Math.max(0, Math.min(1, b * factor)),
  ];
}

function refractRay3D(
  vX: number, vY: number, vZ: number,
  nX: number, nY: number, nZ: number,
  n1: number, n2: number
): { refracted: boolean; outX: number; outY: number; outZ: number } {
  const vLen = Math.hypot(vX, vY, vZ) || 1;
  let vx = vX / vLen;
  let vy = vY / vLen;
  let vz = vZ / vLen;

  const nLen = Math.hypot(nX, nY, nZ) || 1;
  let nx = nX / nLen;
  let ny = nY / nLen;
  let nz = nZ / nLen;

  const eta = n1 / n2;
  let c1 = -(vx * nx + vy * ny + vz * nz);
  if (c1 < 0) {
    nx = -nx;
    ny = -ny;
    nz = -nz;
    c1 = -(vx * nx + vy * ny + vz * nz);
  }

  const c2Sq = 1.0 - eta * eta * (1.0 - c1 * c1);
  if (c2Sq < 0) {
    // Total internal reflection: v - 2 * (v . n) * n
    const dot = vx * nx + vy * ny + vz * nz;
    return {
      refracted: false,
      outX: vx - 2 * dot * nx,
      outY: vy - 2 * dot * ny,
      outZ: vz - 2 * dot * nz,
    };
  }

  const c2 = Math.sqrt(c2Sq);
  const factor = eta * c1 - c2;
  const rx = eta * vx + factor * nx;
  const ry = eta * vy + factor * ny;
  const rz = eta * vz + factor * nz;
  const rLen = Math.hypot(rx, ry, rz) || 1;

  return {
    refracted: true,
    outX: rx / rLen,
    outY: ry / rLen,
    outZ: rz / rLen,
  };
}

function generateNoiseGridWorker(w: number, h: number, seed: number): Float32Array {
  const grid = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const n = Math.sin(x * 12.9898 + y * 78.233 + seed * 37.719) * 43758.5453123;
      grid[y * w + x] = n - Math.floor(n);
    }
  }
  return grid;
}

function sampleNoiseWorker(grid: Float32Array, gw: number, gh: number, u: number, v: number): number {
  const x = ((u % 1 + 1) % 1) * (gw - 1);
  const y = ((v % 1 + 1) % 1) * (gh - 1);
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(gw - 1, x0 + 1);
  const y1 = Math.min(gh - 1, y0 + 1);
  const fx = x - x0;
  const fy = y - y0;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const v00 = grid[y0 * gw + x0];
  const v10 = grid[y0 * gw + x1];
  const v01 = grid[y1 * gw + x0];
  const v11 = grid[y1 * gw + x1];
  const top = v00 + sx * (v10 - v00);
  const bottom = v01 + sx * (v11 - v01);
  return top + sy * (bottom - top);
}

function bakeProceduralTextureWorker(task: 'floor_fbm' | 'roughness_fbm' | 'bump_fbm', resolution: number): Uint8ClampedArray {
  const pixelBuffer = new Uint8ClampedArray(resolution * resolution * 4);

  if (task === 'floor_fbm') {
    const g1 = generateNoiseGridWorker(16, 16, 1.41);
    const g2 = generateNoiseGridWorker(32, 32, 2.71);
    const g3 = generateNoiseGridWorker(64, 64, 3.14);
    const g4 = generateNoiseGridWorker(128, 128, 5.89);

    for (let py = 0; py < resolution; py++) {
      const v = py / resolution;
      for (let px = 0; px < resolution; px++) {
        const u = px / resolution;
        const n1 = sampleNoiseWorker(g1, 16, 16, u * 2, v * 2);
        const n2 = sampleNoiseWorker(g2, 32, 32, u * 4, v * 4);
        const n3 = sampleNoiseWorker(g3, 64, 64, u * 8, v * 8);
        const n4 = sampleNoiseWorker(g4, 128, 128, u * 16, v * 16);

        const fbm = 0.50 * n1 + 0.28 * n2 + 0.15 * n3 + 0.07 * n4;
        const idx = (py * resolution + px) * 4;

        let r: number, g: number, b: number;
        if (fbm < 0.5) {
          const t = (0.5 - fbm) / 0.5;
          r = 146 - t * 30;
          g = 158 - t * 28;
          b = 169 - t * 25;
        } else {
          const t = (fbm - 0.5) / 0.5;
          r = 146 + t * 32;
          g = 158 + t * 30;
          b = 169 + t * 30;
        }

        pixelBuffer[idx] = Math.round(r);
        pixelBuffer[idx + 1] = Math.round(g);
        pixelBuffer[idx + 2] = Math.round(b);
        pixelBuffer[idx + 3] = 255;
      }
    }
  } else if (task === 'roughness_fbm') {
    const g1 = generateNoiseGridWorker(16, 16, 8.11);
    const g2 = generateNoiseGridWorker(32, 32, 4.33);

    for (let py = 0; py < resolution; py++) {
      const v = py / resolution;
      for (let px = 0; px < resolution; px++) {
        const u = px / resolution;
        const n = 0.65 * sampleNoiseWorker(g1, 16, 16, u * 2, v * 2) + 0.35 * sampleNoiseWorker(g2, 32, 32, u * 4, v * 4);
        const val = Math.round(43 + n * 26);
        const idx = (py * resolution + px) * 4;
        pixelBuffer[idx] = val;
        pixelBuffer[idx + 1] = val;
        pixelBuffer[idx + 2] = val;
        pixelBuffer[idx + 3] = 255;
      }
    }
  } else if (task === 'bump_fbm') {
    const g = generateNoiseGridWorker(64, 64, 9.42);

    for (let py = 0; py < resolution; py++) {
      const v = py / resolution;
      for (let px = 0; px < resolution; px++) {
        const u = px / resolution;
        const n = sampleNoiseWorker(g, 64, 64, u * 8, v * 8);
        const val = Math.round(120 + n * 16);
        const idx = (py * resolution + px) * 4;
        pixelBuffer[idx] = val;
        pixelBuffer[idx + 1] = val;
        pixelBuffer[idx + 2] = val;
        pixelBuffer[idx + 3] = 255;
      }
    }
  }

  return pixelBuffer;
}

const WORKER_ION_META: Record<string, { formula: string; name: string; molarMass: number; color: string }> = {
  'H+': { formula: 'H⁺', name: '氢离子', molarMass: 1.008, color: '#ff453a' },
  'OH-': { formula: 'OH⁻', name: '氢氧根离子', molarMass: 17.008, color: '#30d158' },
  'Na+': { formula: 'Na⁺', name: '钠离子', molarMass: 22.990, color: '#5ac8fa' },
  'Cl-': { formula: 'Cl⁻', name: '氯离子', molarMass: 35.453, color: '#64d2ff' },
  'Cu2+': { formula: 'Cu²⁺', name: '铜离子', molarMass: 63.546, color: '#0a84ff' },
  'SO4_2-': { formula: 'SO₄²⁻', name: '硫酸根离子', molarMass: 96.06, color: '#ffd60a' },
  'Ba2+': { formula: 'Ba²⁺', name: '钡离子', molarMass: 137.33, color: '#bf5af2' },
  'Fe3+': { formula: 'Fe³⁺', name: '铁离子', molarMass: 55.845, color: '#ff9f0a' },
  'Fe2+': { formula: 'Fe²⁺', name: '亚铁离子', molarMass: 55.845, color: '#34c759' },
  'NO3-': { formula: 'NO₃⁻', name: '硝酸根离子', molarMass: 62.005, color: '#ff375f' },
  'CO3_2-': { formula: 'CO₃²⁻', name: '碳酸根离子', molarMass: 60.009, color: '#ffb74d' },
  'K+': { formula: 'K⁺', name: '钾离子', molarMass: 39.098, color: '#af52de' },
  'Ca2+': { formula: 'Ca²⁺', name: '钙离子', molarMass: 40.078, color: '#e5e5ea' },
  'Al3+': { formula: 'Al³⁺', name: '铝离子', molarMass: 26.982, color: '#81d4fa' },
  'Ag+': { formula: 'Ag⁺', name: '银离子', molarMass: 107.87, color: '#cfd8dc' },
  'I-': { formula: 'I⁻', name: '碘离子', molarMass: 126.90, color: '#9c27b0' },
  'MnO4-': { formula: 'MnO₄⁻', name: '高锰酸根离子', molarMass: 118.94, color: '#7b1fa2' },
  'H2O2': { formula: 'H₂O₂', name: '过氧化氢分子', molarMass: 34.015, color: '#80deea' },
};

const WORKER_SOLID_META: Record<string, { formula: string; name: string; molarMass: number; color: string }> = {
  'Mg': { formula: 'Mg', name: '镁金属单质', molarMass: 24.305, color: '#b0bec5' },
  'Zn': { formula: 'Zn', name: '锌金属单质', molarMass: 65.38, color: '#78909c' },
  'Fe': { formula: 'Fe', name: '铁金属单质', molarMass: 55.845, color: '#546e7a' },
  'Cu': { formula: 'Cu', name: '紫铜单质', molarMass: 63.546, color: '#b87333' },
  'Al': { formula: 'Al', name: '金属铝', molarMass: 26.982, color: '#90a4ae' },
};

const WORKER_PRECIP_META: Record<string, { formula: string; name: string; molarMass: number; color: string }> = {
  'BaSO4': { formula: 'BaSO₄↓', name: '硫酸钡沉淀', molarMass: 233.39, color: '#ffffff' },
  'AgCl': { formula: 'AgCl↓', name: '氯化银凝乳状沉淀', molarMass: 143.32, color: '#f8fafc' },
  'Cu(OH)2': { formula: 'Cu(OH)₂↓', name: '氢氧化铜蓝色沉淀', molarMass: 97.56, color: '#0288d1' },
  'Fe(OH)3': { formula: 'Fe(OH)₃↓', name: '氢氧化铁红褐色沉淀', molarMass: 106.87, color: '#d84315' },
  'Fe(OH)2': { formula: 'Fe(OH)₂↓', name: '氢氧化亚铁絮状沉淀', molarMass: 89.86, color: '#558b2f' },
  'CaCO3': { formula: 'CaCO₃↓', name: '碳酸钙白色浑浊沉淀', molarMass: 100.09, color: '#f5f5f5' },
  'Al(OH)3': { formula: 'Al(OH)₃↓', name: '氢氧化铝凝胶沉淀', molarMass: 78.00, color: '#eceff1' },
};

function solveCompositionWorker(
  volume: number,
  temperature: number,
  pH: number,
  ions: [string, number][],
  precipitates: [string, { formula: string; name: string; color: number; moles: number }][],
  solids: [string, { formula: string; name: string; moles: number }][],
  recentReaction: any
): any {
  const components: any[] = [];
  const volLiters = Math.max(0.001, volume / 1000.0);

  // 1. Solvated Ions
  for (const [ionName, moles] of ions) {
    if (moles > 1e-6) {
      if ((ionName === 'H+' || ionName === 'OH-') && Math.abs(pH - 7.0) < 0.1 && moles < 5e-6) {
        continue;
      }
      const meta = WORKER_ION_META[ionName] || {
        formula: ionName,
        name: `${ionName}离子`,
        molarMass: 50.0,
        color: '#0a84ff',
      };
      components.push({
        id: `ion_${ionName}`,
        formula: meta.formula,
        name: meta.name,
        category: 'ion',
        categoryLabel: '可溶离子',
        moles: moles,
        millimoles: moles * 1000,
        molarMass: meta.molarMass,
        massGrams: moles * meta.molarMass,
        concentration: moles / volLiters,
        color: meta.color,
        percentage: 0,
      });
    }
  }

  // 2. Precipitates
  for (const [key, p] of precipitates) {
    if (p.moles > 1e-6) {
      const meta = WORKER_PRECIP_META[key] || {
        formula: p.formula,
        name: p.name,
        molarMass: 100.0,
        color: '#ffffff',
      };
      components.push({
        id: `precip_${key}`,
        formula: meta.formula,
        name: meta.name,
        category: 'precipitate',
        categoryLabel: '难溶沉淀',
        moles: p.moles,
        millimoles: p.moles * 1000,
        molarMass: meta.molarMass,
        massGrams: p.moles * meta.molarMass,
        color: meta.color,
        percentage: 0,
      });
    }
  }

  // 3. Solid Metals
  for (const [key, s] of solids) {
    if (s.moles > 1e-6) {
      const meta = WORKER_SOLID_META[key] || {
        formula: s.formula,
        name: s.name,
        molarMass: 50.0,
        color: '#90a4ae',
      };
      components.push({
        id: `solid_${key}`,
        formula: meta.formula,
        name: meta.name,
        category: 'solid',
        categoryLabel: '金属固相',
        moles: s.moles,
        millimoles: s.moles * 1000,
        molarMass: meta.molarMass,
        massGrams: s.moles * meta.molarMass,
        color: meta.color,
        percentage: 0,
      });
    }
  }

  let totalSoluteMoles = 0;
  let totalSoluteMassGrams = 0;
  for (const c of components) {
    totalSoluteMoles += c.moles;
    totalSoluteMassGrams += c.massGrams;
  }

  if (totalSoluteMoles > 0) {
    for (const c of components) {
      c.percentage = (c.moles / totalSoluteMoles) * 100;
    }
    components.sort((a, b) => b.percentage - a.percentage);

    let sumPct = 0;
    for (const c of components) {
      c.percentage = Math.round(c.percentage * 10) / 10;
      sumPct += c.percentage;
    }
    if (components.length > 0 && Math.abs(sumPct - 100.0) > 0.01) {
      components[0].percentage = Math.round((components[0].percentage + (100.0 - sumPct)) * 10) / 10;
    }
  }

  const waterVolumeMl = volume;
  const waterMoles = (waterVolumeMl * 1.0) / 18.015;
  const waterMassGrams = waterVolumeMl * 1.0;

  return {
    totalVolumeMl: volume,
    waterVolumeMl,
    waterMoles,
    waterMassGrams,
    temperature,
    pH,
    totalSoluteMoles,
    totalSoluteMassGrams,
    components,
    recentReaction,
  };
}

