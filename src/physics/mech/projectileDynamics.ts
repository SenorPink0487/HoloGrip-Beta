/**
 * 2D Projectile Motion & Mechanical Energy Conservation
 */

import { STANDARD_GRAVITY } from './constants.ts';

export interface ProjectileConfig {
  releaseHeightM: number; // H (m) on ramp
  ballMassKg: number;      // m (kg)
  targetYM: number;        // Vertical drop y (m)
  gravity?: number;        // g (m/s^2)
}

export interface TrajectoryPoint {
  t: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  v: number;
}

export interface ProjectileTelemetry {
  releaseHeightM: number;
  ballMassKg: number;
  v0: number; // Horizontal launch speed (m/s)
  targetYM: number;
  targetXM: number;
  flightTimeS: number;
  finalVy: number;
  finalV: number;
  deltaEp: number; // m g y (J)
  deltaEk: number; // 0.5 m (v^2 - v0^2) (J)
  energyDiscrepancy: number; // |deltaEp - deltaEk| (J)
  gravity: number;
  points: TrajectoryPoint[];
}

export function solveProjectileDynamics(config: ProjectileConfig): ProjectileTelemetry {
  const g = config.gravity ?? STANDARD_GRAVITY;
  const H = Math.max(0.01, config.releaseHeightM);
  const m = Math.max(0.001, config.ballMassKg);
  const yTarget = Math.max(0.01, config.targetYM);

  // Horizontal exit speed from ramp (v0 = sqrt(2 g H))
  const v0 = Math.sqrt(2 * g * H);

  // Time to reach vertical drop yTarget: y = 0.5 * g * t^2 => t = sqrt(2 y / g)
  const flightTimeS = Math.sqrt((2 * yTarget) / g);
  const targetXM = v0 * flightTimeS;
  const finalVy = g * flightTimeS;
  const finalV = Math.sqrt(v0 * v0 + finalVy * finalVy);

  const deltaEp = m * g * yTarget;
  const deltaEk = 0.5 * m * (finalV * finalV - v0 * v0);
  const energyDiscrepancy = Math.abs(deltaEp - deltaEk);

  // Sample points for 3D trajectory curve & strobe dots
  const points: TrajectoryPoint[] = [];
  const numSteps = 40;
  for (let i = 0; i <= numSteps; i++) {
    const t = (i / numSteps) * flightTimeS;
    const x = v0 * t;
    const y = 0.5 * g * t * t;
    const vy = g * t;
    const v = Math.sqrt(v0 * v0 + vy * vy);
    points.push({ t, x, y, vx: v0, vy, v });
  }

  return {
    releaseHeightM: H,
    ballMassKg: m,
    v0,
    targetYM: yTarget,
    targetXM,
    flightTimeS,
    finalVy,
    finalV,
    deltaEp,
    deltaEk,
    energyDiscrepancy,
    gravity: g,
    points,
  };
}
