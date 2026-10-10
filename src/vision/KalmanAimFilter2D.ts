/**
 * 恒定加速度卡尔曼预测滤波器（Constant-Acceleration Kalman Aim Filter）。
 * 移植并借鉴自 HoloPhysics 高性能空间手势追踪管线。
 *
 * 核心特性：
 * 1. 前向物理预测（Forward Prediction）：根据当前速度与加速度，向前推算并补偿摄像头采集与模型推理的硬件物理延迟（~20-40ms），实现真正的零延迟跟手感。
 * 2. 惯性巡航外推（Coast Extrapolation）：在偶发网络或系统丢帧时，沿速度向量平滑微幅巡航，彻底消除“走-停-走-停”的阶跃卡顿。
 * 3. 亚像素微抖死区（Dead-Zone Clamping）：手掌悬停静止时自动切断微小抖动，锁定在当前像素，消除屏幕微颤。
 */

export interface KalmanAxis {
  value: number;
  velocity: number;
  acceleration: number;
  pPosition: number;
  pPositionVelocity: number;
  pPositionAcceleration: number;
  pVelocity: number;
  pVelocityAcceleration: number;
  pAcceleration: number;
}

export function createKalmanAxis(value = 0): KalmanAxis {
  return {
    value,
    velocity: 0,
    acceleration: 0,
    pPosition: 0.1,
    pPositionVelocity: 0,
    pPositionAcceleration: 0,
    pVelocity: 1,
    pVelocityAcceleration: 0,
    pAcceleration: 5,
  };
}

export function updateKalmanAxis(
  axis: KalmanAxis,
  measurement: number,
  dt: number,
  processNoise: number,
  measurementNoise: number
): void {
  const predictedValue =
    axis.value + axis.velocity * dt + 0.5 * axis.acceleration * dt * dt;
  const predictedVelocity = axis.velocity + axis.acceleration * dt;
  const predictedAcceleration = axis.acceleration;
  const t2 = dt * dt;
  const t3 = t2 * dt;
  const t4 = t3 * dt;
  const t5 = t4 * dt;

  const pPosition =
    axis.pPosition +
    2 * dt * axis.pPositionVelocity +
    t2 * axis.pPositionAcceleration +
    t2 * axis.pVelocity +
    t3 * axis.pVelocityAcceleration +
    0.25 * t4 * axis.pAcceleration +
    (t5 / 20) * processNoise;
  const pPositionVelocity =
    axis.pPositionVelocity +
    dt * (axis.pVelocity + axis.pPositionAcceleration) +
    1.5 * t2 * axis.pVelocityAcceleration +
    0.5 * t3 * axis.pAcceleration +
    (t4 / 8) * processNoise;
  const pPositionAcceleration =
    axis.pPositionAcceleration +
    dt * axis.pVelocityAcceleration +
    0.5 * t2 * axis.pAcceleration +
    (t3 / 6) * processNoise;
  const pVelocity =
    axis.pVelocity +
    2 * dt * axis.pVelocityAcceleration +
    t2 * axis.pAcceleration +
    (t3 / 3) * processNoise;
  const pVelocityAcceleration =
    axis.pVelocityAcceleration +
    dt * axis.pAcceleration +
    (t2 / 2) * processNoise;
  const pAcceleration = axis.pAcceleration + dt * processNoise;

  const residual = measurement - predictedValue;
  const residualCovariance = pPosition + measurementNoise;
  const positionGain = pPosition / residualCovariance;
  const velocityGain = pPositionVelocity / residualCovariance;
  const accelerationGain = pPositionAcceleration / residualCovariance;

  axis.value = predictedValue + positionGain * residual;
  axis.velocity = predictedVelocity + velocityGain * residual;
  axis.acceleration = predictedAcceleration + accelerationGain * residual;
  axis.pPosition = (1 - positionGain) * pPosition;
  axis.pPositionVelocity = (1 - positionGain) * pPositionVelocity;
  axis.pPositionAcceleration = (1 - positionGain) * pPositionAcceleration;
  axis.pVelocity = pVelocity - velocityGain * pPositionVelocity;
  axis.pVelocityAcceleration =
    pVelocityAcceleration - velocityGain * pPositionAcceleration;
  axis.pAcceleration =
    pAcceleration - accelerationGain * pPositionAcceleration;
}

export interface KalmanAimFilterOptions {
  stationarySpeed?: number;
  deadZone?: number;
  maxVelocity?: number;
  processNoise?: number;
  measurementNoise?: number;
  coastDurationMs?: number;
  maxCoastExtrapolation?: number;
}

export class KalmanAimFilter2D {
  public x: KalmanAxis;
  public y: KalmanAxis;
  public accepted: { x: number; y: number };
  public timestampMs: number | null = null;
  public initialized = false;

  public stationarySpeed: number;
  public deadZone: number;
  public maxVelocity: number;
  public processNoise: number;
  public measurementNoise: number;
  public coastDurationMs: number;
  public maxCoastExtrapolation: number;

  constructor(options: KalmanAimFilterOptions = {}) {
    this.stationarySpeed = options.stationarySpeed ?? 0.12;
    this.deadZone = options.deadZone ?? 0.0018;
    this.maxVelocity = options.maxVelocity ?? 6.0;
    this.processNoise = options.processNoise ?? 5.0;
    this.measurementNoise = options.measurementNoise ?? 0.001;
    this.coastDurationMs = options.coastDurationMs ?? 250;
    this.maxCoastExtrapolation = options.maxCoastExtrapolation ?? 0.35;

    this.x = createKalmanAxis(0);
    this.y = createKalmanAxis(0);
    this.accepted = { x: 0, y: 0 };
    this.reset();
  }

  public reset(
    value: { x: number; y: number } = { x: 0, y: 0 },
    timestampMs?: number
  ): { x: number; y: number } {
    this.x = createKalmanAxis(Number(value?.x) || 0);
    this.y = createKalmanAxis(Number(value?.y) || 0);
    this.accepted = { x: this.x.value, y: this.y.value };
    this.timestampMs = timestampMs ?? null;
    this.initialized =
      Number.isFinite(value?.x) &&
      Number.isFinite(value?.y) &&
      typeof timestampMs === 'number' &&
      Number.isFinite(timestampMs);
    return { x: this.accepted.x, y: this.accepted.y };
  }

  public filter(
    value: { x: number; y: number },
    timestampMs: number,
    confidence = 1.0
  ): { x: number; y: number } {
    if (!Number.isFinite(value?.x) || !Number.isFinite(value?.y)) {
      return { x: this.accepted.x, y: this.accepted.y };
    }
    if (
      !this.initialized ||
      this.timestampMs === null ||
      timestampMs <= this.timestampMs
    ) {
      return this.reset(value, timestampMs);
    }

    const dt = Math.max(
      1 / 240,
      Math.min(0.12, (timestampMs - this.timestampMs) / 1000)
    );
    const speedBeforeUpdate = Math.hypot(this.x.velocity, this.y.velocity);
    const lowSpeedFactor =
      speedBeforeUpdate < 0.15 ? (0.15 - speedBeforeUpdate) / 0.15 : 0;
    const noiseScale =
      speedBeforeUpdate < 0.15
        ? 1 + lowSpeedFactor * 4
        : Math.max(0.5, 1 - (speedBeforeUpdate - 0.15) * 0.3);
    const safeConfidence = Math.max(
      0.1,
      Math.min(1.0, Number(confidence) || 0.5)
    );
    const measurementNoise =
      (this.measurementNoise / safeConfidence) * noiseScale;
    const processNoise = this.processNoise * (1 + speedBeforeUpdate * 4);

    updateKalmanAxis(this.x, value.x, dt, processNoise, measurementNoise);
    updateKalmanAxis(this.y, value.y, dt, processNoise, measurementNoise);
    this.x.velocity = Math.max(
      -this.maxVelocity,
      Math.min(this.maxVelocity, this.x.velocity)
    );
    this.y.velocity = Math.max(
      -this.maxVelocity,
      Math.min(this.maxVelocity, this.y.velocity)
    );

    const estimatedSpeed = Math.hypot(this.x.velocity, this.y.velocity);
    const estimatedDistance = Math.hypot(
      this.x.value - this.accepted.x,
      this.y.value - this.accepted.y
    );
    if (
      estimatedSpeed < this.stationarySpeed &&
      estimatedDistance < this.deadZone
    ) {
      this.x.velocity = 0;
      this.y.velocity = 0;
      this.x.acceleration = 0;
      this.y.acceleration = 0;
    } else {
      this.accepted.x = this.x.value;
      this.accepted.y = this.y.value;
    }
    this.timestampMs = timestampMs;
    return { x: this.accepted.x, y: this.accepted.y };
  }

  public predict(timestampMs: number): { x: number; y: number } {
    if (
      !this.initialized ||
      this.timestampMs === null ||
      timestampMs <= this.timestampMs
    ) {
      return { x: this.accepted.x, y: this.accepted.y };
    }
    const dt = Math.min(
      (timestampMs - this.timestampMs) / 1000,
      this.coastDurationMs / 1000
    );
    const predictedX =
      this.accepted.x +
      this.x.velocity * dt +
      0.5 * this.x.acceleration * dt * dt;
    const predictedY =
      this.accepted.y +
      this.y.velocity * dt +
      0.5 * this.y.acceleration * dt * dt;
    const dx = predictedX - this.accepted.x;
    const dy = predictedY - this.accepted.y;
    const distance = Math.hypot(dx, dy);
    const scale =
      distance > this.maxCoastExtrapolation
        ? this.maxCoastExtrapolation / distance
        : 1.0;
    return {
      x: this.accepted.x + dx * scale,
      y: this.accepted.y + dy * scale,
    };
  }
}
