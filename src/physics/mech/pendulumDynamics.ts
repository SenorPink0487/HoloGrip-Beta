/**
 * 单摆简谐运动与重力加速度测量动力学
 */

import { STANDARD_GRAVITY } from './constants.ts';

export interface PendulumConfig {
  lineLengthM: number;    // 摆线长度 (m)
  ballDiameterM: number;  // 摆球直径 (m)
  initialAngleDeg: number;// 初始释放摆角 (度)
  ballMassKg: number;     // 摆球质量 (kg)
  oscillationCount?: number; // 全振动次数 (如 30 次)
  gravity?: number;       // 重力加速度 g (m/s^2)
}

export interface PendulumTelemetry {
  lineLengthM: number;
  ballDiameterM: number;
  effectiveLengthM: number; // 等效摆长 L = lineLength + diameter / 2
  initialAngleDeg: number;
  ballMassKg: number;
  gravity: number;
  periodS: number;          // 单摆周期 T = 2 * pi * sqrt(L / g)
  periodSquaredS2: number;  // 周期平方 T^2
  oscillationCount: number;
  totalTimeS: number;       // 总时间 t = N * T
  maxVelocityMs: number;    // 最低点最大线速度 v_max
  maxTensionN: number;      // 悬线最大拉力 T_tension = m*g + m*v^2 / L
  calculatedGravity: number;// 反算重力加速度 g = 4 * pi^2 * L / T^2
}

export function solvePendulumDynamics(config: PendulumConfig): PendulumTelemetry {
  const g = config.gravity ?? STANDARD_GRAVITY;
  const lineLength = Math.max(0.1, config.lineLengthM);
  const diameter = Math.max(0.005, config.ballDiameterM);
  const effectiveLength = lineLength + diameter / 2.0;
  const theta0Rad = (Math.max(0.1, config.initialAngleDeg) * Math.PI) / 180.0;
  const m = Math.max(0.001, config.ballMassKg);
  const N = config.oscillationCount ?? 30;

  // 小角度单摆周期 (小角度近似)
  const omega = Math.sqrt(g / effectiveLength);
  const periodS = (2 * Math.PI) / omega;
  const periodSquaredS2 = periodS * periodS;
  const totalTimeS = N * periodS;

  // 最低点处的最大线速度: v = omega * L * theta0
  const maxVelocityMs = omega * effectiveLength * theta0Rad;
  const maxTensionN = m * g + (m * maxVelocityMs * maxVelocityMs) / effectiveLength;

  // 根据单摆周期公式反算重力加速度
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
