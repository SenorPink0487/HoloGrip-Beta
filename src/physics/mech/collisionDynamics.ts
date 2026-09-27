/**
 * 1D Momentum Conservation & Collision Dynamics on Air Track
 */

import { DEFAULT_PHOTOGATE_WIDTH_M } from './constants.ts';

export type CollisionMode = 'elastic' | 'inelastic';

export interface CollisionConfig {
  m1Kg: number;
  m2Kg: number;
  v1: number; // m/s
  v2: number; // m/s
  mode: CollisionMode;
  shutterWidthM?: number;
}

export interface PhotogateReadout {
  timeBefore1S: number;
  timeBefore2S: number;
  timeAfter1S: number;
  timeAfter2S: number;
}

export interface CollisionTelemetry {
  m1Kg: number;
  m2Kg: number;
  v1Before: number;
  v2Before: number;
  v1After: number;
  v2After: number;
  pBefore: number;
  pAfter: number;
  pRelativeError: number;
  keBefore: number;
  keAfter: number;
  keRetentionRatio: number;
  mode: CollisionMode;
  photogate: PhotogateReadout;
}

export function solveCollisionDynamics(config: CollisionConfig): CollisionTelemetry {
  const m1 = Math.max(0.01, config.m1Kg);
  const m2 = Math.max(0.01, config.m2Kg);
  const v1 = config.v1;
  const v2 = config.v2;
  const mode = config.mode;
  const d = config.shutterWidthM ?? DEFAULT_PHOTOGATE_WIDTH_M;

  const pBefore = m1 * v1 + m2 * v2;
  const keBefore = 0.5 * m1 * v1 * v1 + 0.5 * m2 * v2 * v2;

  let v1After: number;
  let v2After: number;

  if (mode === 'elastic') {
    v1After = ((m1 - m2) * v1 + 2 * m2 * v2) / (m1 + m2);
    v2After = (2 * m1 * v1 + (m2 - m1) * v2) / (m1 + m2);
  } else {
    // Completely inelastic
    const vCommon = (m1 * v1 + m2 * v2) / (m1 + m2);
    v1After = vCommon;
    v2After = vCommon;
  }

  const pAfter = m1 * v1After + m2 * v2After;
  const keAfter = 0.5 * m1 * v1After * v1After + 0.5 * m2 * v2After * v2After;

  const pRelativeError = Math.abs(pBefore) > 1e-9 ? Math.abs((pAfter - pBefore) / pBefore) : 0;
  const keRetentionRatio = keBefore > 1e-9 ? keAfter / keBefore : 1.0;

  const calcGateTime = (v: number) => (Math.abs(v) > 1e-4 ? d / Math.abs(v) : 0);

  const photogate: PhotogateReadout = {
    timeBefore1S: calcGateTime(v1),
    timeBefore2S: calcGateTime(v2),
    timeAfter1S: calcGateTime(v1After),
    timeAfter2S: calcGateTime(v2After),
  };

  return {
    m1Kg: m1,
    m2Kg: m2,
    v1Before: v1,
    v2Before: v2,
    v1After,
    v2After,
    pBefore,
    pAfter,
    pRelativeError,
    keBefore,
    keAfter,
    keRetentionRatio,
    mode,
    photogate,
  };
}
