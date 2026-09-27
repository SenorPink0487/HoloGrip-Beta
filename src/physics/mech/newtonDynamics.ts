/**
 * Newton's 2nd Law Dynamics & Ticker Tape Generator
 * Incline plane + Cart + Hanging Hook system with exact analytical solution.
 */

import { STANDARD_GRAVITY, TICKER_PERIOD_S } from './constants.ts';

export interface NewtonConfig {
  cartMassKg: number; // M (cart mass in kg)
  hookMassKg: number; // m (hanging mass in kg)
  inclineDeg: number; // theta (board angle in degrees)
  frictionMu: number; // mu (dynamic friction coefficient)
  gravity?: number;   // g (m/s^2)
  trackLengthM?: number; // Total length of track (m)
}

export interface TickerDot {
  index: number;
  timeS: number;
  positionM: number;
  intervalM: number; // Distance to previous dot
}

export interface NewtonTelemetry {
  cartMassKg: number;
  hookMassKg: number;
  inclineDeg: number;
  frictionMu: number;
  gravity: number;
  normalForceN: number;
  frictionForceN: number;
  tensionN: number;
  netForceN: number;
  acceleration: number;
  timeToFinishS: number;
  dots: TickerDot[];
  diffAccCalc: number; // Acceleration calculated from ticker tape difference method
}

export function solveNewtonDynamics(config: NewtonConfig): NewtonTelemetry {
  const g = config.gravity ?? STANDARD_GRAVITY;
  const M = Math.max(0.01, config.cartMassKg);
  const m = Math.max(0.001, config.hookMassKg);
  const thetaRad = (config.inclineDeg * Math.PI) / 180.0;
  const mu = Math.max(0, config.frictionMu);
  const trackLength = config.trackLengthM ?? 1.2;

  const normalForceN = M * g * Math.cos(thetaRad);
  const frictionForceN = mu * normalForceN;
  const cartGravityAlongIncline = M * g * Math.sin(thetaRad);
  const hookGravity = m * g;

  // Total driving force along the motion direction
  const rawNetForce = hookGravity + cartGravityAlongIncline - frictionForceN;
  const netForceN = Math.max(0, rawNetForce);
  const totalMass = M + m;

  const acceleration = netForceN > 0 ? netForceN / totalMass : 0;
  const tensionN = acceleration > 0 ? m * (g - acceleration) : hookGravity;

  // Time to complete track
  const timeToFinishS = acceleration > 0 ? Math.sqrt((2 * trackLength) / acceleration) : 999;

  // Generate ticker dots at 50 Hz (T = 0.02s)
  const dots: TickerDot[] = [];
  const maxDots = 50;
  let prevPos = 0;

  for (let i = 0; i <= maxDots; i++) {
    const t = i * TICKER_PERIOD_S;
    if (t > timeToFinishS) break;
    const pos = 0.5 * acceleration * t * t;
    dots.push({
      index: i,
      timeS: t,
      positionM: pos,
      intervalM: pos - prevPos,
    });
    prevPos = pos;
  }

  // 逐差法 (Successive difference method) using 6 adjacent intervals (7 dots: x0 to x6)
  // S1 = x1 - x0, S2 = x2 - x1, S3 = x3 - x2, S4 = x4 - x3, S5 = x5 - x4, S6 = x6 - x5
  // a = [(S4 + S5 + S6) - (S1 + S2 + S3)] / (9 * T^2) = [(x6 - x3) - (x3 - x0)] / (9 * T^2)
  let diffAccCalc = acceleration;
  if (dots.length >= 7) {
    const x = dots.map((d) => d.positionM);
    const T = TICKER_PERIOD_S;
    const sumAfter = x[6] - x[3];
    const sumBefore = x[3] - x[0];
    diffAccCalc = (sumAfter - sumBefore) / (9 * T * T);
  }

  return {
    cartMassKg: M,
    hookMassKg: m,
    inclineDeg: config.inclineDeg,
    frictionMu: mu,
    gravity: g,
    normalForceN,
    frictionForceN,
    tensionN,
    netForceN,
    acceleration,
    timeToFinishS,
    dots,
    diffAccCalc,
  };
}
