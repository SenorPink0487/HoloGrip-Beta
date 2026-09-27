/**
 * Simple Pendulum Harmonic Motion & Gravitational Acceleration Measurement
 */

import { STANDARD_GRAVITY } from './constants.ts';

export interface PendulumConfig {
  lineLengthM: number;    // Suspension string length (m)
  ballDiameterM: number;  // Bob diameter (m)
  initialAngleDeg: number;// Initial release angle (deg)
  ballMassKg: number;     // Bob mass (kg)
  oscillationCount?: number; // e.g. 30 oscillations
  gravity?: number;       // g (m/s^2)
}

export interface PendulumTelemetry {
  lineLengthM: number;
  ballDiameterM: number;
  effectiveLengthM: number; // L = lineLength + diameter / 2
  initialAngleDeg: number;
  ballMassKg: number;
  gravity: number;
  periodS: number;          // T = 2 pi sqrt(L / g)
  periodSquaredS2: number;  // T^2
  oscillationCount: number;
  totalTimeS: number;       // N * T
  maxVelocityMs: number;    // v_max at lowest point
  maxTensionN: number;      // T_tension = mg + m v^2 / L
  calculatedGravity: number;// 4 pi^2 L / T^2
}

export function solvePendulumDynamics(config: PendulumConfig): PendulumTelemetry {
  const g = config.gravity ?? STANDARD_GRAVITY;
  const lineLength = Math.max(0.1, config.lineLengthM);
  const diameter = Math.max(0.005, config.ballDiameterM);
  const effectiveLength = lineLength + diameter / 2.0;
  const theta0Rad = (Math.max(0.1, config.initialAngleDeg) * Math.PI) / 180.0;
  const m = Math.max(0.001, config.ballMassKg);
  const N = config.oscillationCount ?? 30;

  // Small-angle period
  const omega = Math.sqrt(g / effectiveLength);
  const periodS = (2 * Math.PI) / omega;
  const periodSquaredS2 = periodS * periodS;
  const totalTimeS = N * periodS;

  // Maximum velocity at lowest point: v = omega * L * theta0
  const maxVelocityMs = omega * effectiveLength * theta0Rad;
  const maxTensionN = m * g + (m * maxVelocityMs * maxVelocityMs) / effectiveLength;

  // Gravity calculation from formula
  const calculatedGravity = (4 * Math.PI * Math.PI * effectiveLength) / periodSquaredS2;

  return {
    lineLengthM: lineLength,
    ballDiameterM: diameter,
    effectiveLengthM: effectiveLength,
    initialAngleDeg: config.initialAngleDeg,
    ballMassKg: m,
    gravity: g,
    periodS,
    periodSquaredS2,
    oscillationCount: N,
    totalTimeS,
    maxVelocityMs,
    maxTensionN,
    calculatedGravity,
  };
}

export function getPendulumAngleAtTime(
  t: number,
  effectiveLengthM: number,
  initialAngleDeg: number,
  gravity: number = STANDARD_GRAVITY,
): { angleDeg: number; angleRad: number; angularVelocity: number } {
  const omega = Math.sqrt(gravity / effectiveLengthM);
  const theta0Rad = (initialAngleDeg * Math.PI) / 180.0;
  const angleRad = theta0Rad * Math.cos(omega * t);
  const angularVelocity = -theta0Rad * omega * Math.sin(omega * t);
  return {
    angleDeg: (angleRad * 180.0) / Math.PI,
    angleRad,
    angularVelocity,
  };
}
