import { MU0 } from './constants.ts';

/**
 * 法拉第感生电动势与楞次定律物理求解器 (Induced EMF & Lenz's Law)
 * 
 * 物理原理：
 * 导体回路保持静止，空间磁场随时间发生变化，从而在线圈周围激发出感生电场 \vec{E}_{ind}：
 * \oint \vec{E}_{ind} \cdot \mathrm{d}\vec{l} = - \frac{\mathrm{d}\Phi}{\mathrm{d}t}
 * 感生电动势：\mathcal{E}_{感} = - N \frac{\mathrm{d}\Phi}{\mathrm{d}t}
 * 楞次定律：感应电流的磁场总要阻碍引起感应电流的磁通量的变化（增反减同）。
 */

/**
 * 轴向坐标即为线圈中心轴。在实验台上该轴为 +Y 方向：
 * 正轴向位置表示磁铁在线圈上方。
 * 磁极符号 poleSign 为正表示磁矩朝向 +Y（N 极在上方）。
 * 正电流产生沿 +Y 方向的磁场 B。在线圈近边缘处（+Z），
 * 该电流流向 +X 方向——即矢量积 ω × r（其中 ω 沿 +Y，r 沿 +Z）。
 */
export interface InductionInput {
  axial: number;
  velocity: number;
  poleSign: 1 | -1;
  turns: number;
  areaM2: number;
  sigmaM: number;
  bPeakTesla: number;
  resistanceOhm: number;
  coilHalfLengthM: number;
  probeAxial: number;
}

export interface InductionReading {
  magnetFieldTesla: number;
  probeFieldTesla: number;
  inducedFieldTesla: number;
  fluxSingleWb: number;
  fluxLinkageWb: number;
  emfVolt: number;
  currentAmp: number;
  /** 当线圈近边缘电流流向 +X 时取 +1。 */
  frontFlowX: number;
}

export const INDUCTION_GOLDEN: InductionInput = {
  axial: 0.22,
  velocity: 0,
  poleSign: -1,
  turns: 200,
  areaM2: Math.PI * 0.04 * 0.04,
  sigmaM: 0.065,
  bPeakTesla: 0.08,
  resistanceOhm: 8,
  coilHalfLengthM: 0.02,
  probeAxial: 0,
};

export function gaussian(x: number, sigma: number): number {
  const s2 = sigma * sigma;
  return Math.exp(-(x * x) / s2);
}

/** 磁铁在线圈轴上某位置 `axialStation` 处产生的轴向磁场。 */
export function magnetFieldAt(input: InductionInput, axialStation: number): number {
  return input.poleSign * input.bPeakTesla * gaussian(axialStation - input.axial, input.sigmaM);
}

export function fluxLinkageWb(input: InductionInput): number {
  return input.turns * magnetFieldAt(input, 0) * input.areaM2;
}

export function emfVolt(input: InductionInput): number {
  const x = input.axial;
  const s2 = input.sigmaM * input.sigmaM;
  const g = gaussian(x, input.sigmaM);
  const dBdx = input.poleSign * input.bPeakTesla * g * ((-2 * x) / s2);
  const dFluxDx = input.turns * input.areaM2 * dBdx;
  const emf = -dFluxDx * input.velocity;
  return emf === 0 ? 0 : emf;
}

export function inducedSolenoidField(turns: number, coilHalfLengthM: number, currentAmp: number): number {
  const length = Math.max(1e-4, coilHalfLengthM * 2);
  return MU0 * (turns / length) * currentAmp;
}

export function coilFrontFlow(currentAmp: number): { x: number; y: number; z: number } {
  const s = currentAmp === 0 ? 0 : Math.sign(currentAmp);
  return { x: s, y: 0, z: 0 };
}

export function evaluateInduction(input: InductionInput): InductionReading {
  const magnet = magnetFieldAt(input, 0);
  const linkage = input.turns * magnet * input.areaM2;
  const emf = emfVolt(input);
  const current = emf / Math.max(1e-6, input.resistanceOhm);
  const induced = inducedSolenoidField(input.turns, input.coilHalfLengthM, current);
  const magnetAtProbe = magnetFieldAt(input, input.probeAxial);
  const inducedAtProbe = Math.abs(input.probeAxial) <= input.coilHalfLengthM ? induced : 0;
  return {
    magnetFieldTesla: magnet,
    probeFieldTesla: magnetAtProbe + inducedAtProbe,
    inducedFieldTesla: induced,
    fluxSingleWb: magnet * input.areaM2,
    fluxLinkageWb: linkage,
    emfVolt: emf,
    currentAmp: current,
    frontFlowX: coilFrontFlow(current).x,
  };
}

export function inductionCaption(input: InductionInput, reading: InductionReading): string {
  if (Math.abs(input.velocity) < 0.01 && Math.abs(reading.emfVolt) < 1e-4) {
    return '磁铁静止，磁通不变，感应电动势为零';
  }
  if (Math.abs(input.axial) < 0.012 && Math.abs(input.velocity) > 0.05) {
    return '正经过线圈中心：磁通最大，电动势过零';
  }
  const opposed =
    reading.inducedFieldTesla === 0 ||
    Math.sign(reading.inducedFieldTesla) !== Math.sign(reading.magnetFieldTesla);
  if (opposed && Math.abs(reading.emfVolt) > 1e-4) {
    return '楞次定律：感应电流的磁场阻碍磁通的变化';
  }
  return '法拉第电磁感应：电动势等于磁通链的变化率';
}

// ================= 扩展高精度物理与动力学规范 =================

export interface SolenoidSpec {
  turns: number;           // 匝数 N (e.g. 600)
  radiusM: number;         // 线圈内半径 R (m, e.g. 0.024)
  lengthM: number;         // 线圈高度 L (m, e.g. 0.12)
  resistanceOhm: number;   // 绕组内阻 (Ω, e.g. 6.0)
}

export interface BarMagnetSpec {
  dipoleMoment: number;    // 磁矩 m (A·m^2, e.g. 1.4)
  poleOrientation: 1 | -1; // 1: N极朝下, -1: S极朝下
  massKg: number;          // 磁铁质量 (kg, e.g. 0.085)
  lengthM: number;         // 磁铁长度 (m, e.g. 0.12)
}

export interface InductionCircuitState {
  switchClosed: boolean;   // 闸刀开关状态 (true: 闭合, false: 断开)
  meterResistanceOhm: number;// 检流计内阻 + 导线 (Ω, e.g. 24.0)
}

export interface MeterMovementState {
  angle: number;           // 归一化角偏转 (-1.0 到 +1.0 对应 -300 到 +300 µA)
  velocity: number;        // 指针角速度
  currentUa: number;       // 瞬时测量读数 (µA)
}

export interface MagnetMotionState {
  z: number;              // 距线圈中心的相对高度 (m)
  vz: number;             // 垂向速度 (m/s)
  mode: 'manual' | 'drop' | 'spring';
  springAnchorZ: number;  // 弹簧悬挂原点
  springK: number;        // 弹簧劲度系数 N/m
}

/**
 * 计算条形磁铁轴向距离 z 处的等效磁场 B_z (Tesla)
 */
export function computeBarMagnetFieldBz(
  z: number,
  dipoleMoment: number,
  lengthM = 0.12,
  radiusM = 0.012
): number {
  const halfL = lengthM * 0.5;
  const mu0 = 4 * Math.PI * 1e-7;
  const volume = Math.PI * radiusM * radiusM * lengthM;
  const mu0M = (mu0 * dipoleMoment) / Math.max(1e-9, volume);

  const d1 = z + halfL;
  const d2 = z - halfL;
  const term1 = d1 / Math.sqrt(d1 * d1 + radiusM * radiusM);
  const term2 = d2 / Math.sqrt(d2 * d2 + radiusM * radiusM);

  return (mu0M * 0.5) * (term1 - term2);
}

/**
 * 计算穿过螺线管截面的平均磁通量 \Phi(z) (Weber)
 */
export function computeInductionFlux(
  zRel: number,
  magnet: BarMagnetSpec,
  solenoid: SolenoidSpec
): number {
  const numSlices = 9;
  const halfH = solenoid.lengthM * 0.5;
  const step = solenoid.lengthM / (numSlices - 1);
  const coilArea = Math.PI * solenoid.radiusM * solenoid.radiusM;

  let totalB = 0;
  for (let i = 0; i < numSlices; i++) {
    const sliceZ = -halfH + i * step;
    const dist = zRel - sliceZ;
    const bz = computeBarMagnetFieldBz(dist, magnet.dipoleMoment, magnet.lengthM, solenoid.radiusM * 0.65);
    totalB += bz;
  }
  const avgB = totalB / numSlices;
  return magnet.poleOrientation * avgB * coilArea;
}

/**
 * 计算磁通量空间梯度 \frac{\partial \Phi}{\partial z}
 */
export function computeInductionFluxGradient(
  zRel: number,
  magnet: BarMagnetSpec,
  solenoid: SolenoidSpec,
  deltaZ = 0.001
): number {
  const p1 = computeInductionFlux(zRel + deltaZ, magnet, solenoid);
  const p2 = computeInductionFlux(zRel - deltaZ, magnet, solenoid);
  return (p1 - p2) / (2 * deltaZ);
}

/**
 * 求解感生电动势与感应电流
 */
export function solveInductionEMF(
  zRel: number,
  velocityZ: number,
  magnet: BarMagnetSpec,
  solenoid: SolenoidSpec,
  circuit: InductionCircuitState
): {
  fluxWb: number;
  dPhiDt: number;
  emfVolts: number;
  currentAmps: number;
  currentUa: number;
  lenzOpposingForceN: number;
  inducedDirection: 1 | 0 | -1; // 1: 产生向上感应磁场, -1: 产生向下感应磁场, 0: 无
} {
  const fluxWb = computeInductionFlux(zRel, magnet, solenoid);
  const dPhiDz = computeInductionFluxGradient(zRel, magnet, solenoid);

  // 链式法则：dPhi/dt = (dPhi/dz) * v_z
  const dPhiDt = Math.abs(velocityZ) < 1e-12 ? 0 : dPhiDz * velocityZ;

  // 法拉第定律：\mathcal{E}_{感} = - N \frac{\mathrm{d}\Phi}{\mathrm{d}t}
  const emfVolts = Math.abs(dPhiDt) < 1e-12 ? 0 : -solenoid.turns * dPhiDt;

  let currentAmps = 0;
  let lenzForceN = 0;

  if (circuit.switchClosed) {
    const totalR = solenoid.resistanceOhm + circuit.meterResistanceOhm;
    currentAmps = emfVolts / Math.max(0.1, totalR);

    // 楞次电磁阻尼力：制动方向与运动速度严格相反
    if (Math.abs(velocityZ) > 1e-5) {
      lenzForceN = -Math.sign(velocityZ) * Math.min(0.6, Math.abs(currentAmps * solenoid.turns * dPhiDz));
    }
  }

  const currentUa = currentAmps * 1e6;

  // 楞次定律感应磁场方向判定：
  // 若穿入磁通增加 (dPhiDt > 0)，感应磁场反向抵消 (1)；若减小 (dPhiDt < 0)，感应磁场同向补充 (-1)
  let inducedDirection: 1 | 0 | -1 = 0;
  if (Math.abs(dPhiDt) > 1e-8 && circuit.switchClosed) {
    inducedDirection = dPhiDt > 0 ? 1 : -1;
  }

  return {
    fluxWb,
    dPhiDt,
    emfVolts,
    currentAmps,
    currentUa,
    lenzOpposingForceN: lenzForceN,
    inducedDirection,
  };
}

/**
 * 检流计二阶动圈动力学积分器
 */
export function stepMeterMovement(
  state: MeterMovementState,
  targetCurrentUa: number,
  dtSec: number,
  fullScaleUa = 300
): MeterMovementState {
  const dt = Math.min(0.05, Math.max(0.001, dtSec));
  const targetAngle = Math.max(-1.1, Math.min(1.1, targetCurrentUa / fullScaleUa));

  // 固有频率 24 rad/s，欠阻尼比 0.72 提供真实指针轻微回弹抖动
  const omegaN = 24.0;
  const zeta = 0.72;

  const diff = targetAngle - state.angle;
  const accel = omegaN * omegaN * diff - 2.0 * zeta * omegaN * state.velocity;

  let newV = state.velocity + accel * dt;
  let newAngle = state.angle + newV * dt;

  // 仪表机械碰销限位
  if (Math.abs(newAngle) > 1.12) {
    newAngle = Math.sign(newAngle) * 1.12;
    newV = -newV * 0.15;
  }

  return {
    angle: newAngle,
    velocity: newV,
    currentUa: newAngle * fullScaleUa,
  };
}

/**
 * 推进磁铁运动状态 (自由下落与弹簧振荡)
 */
export function stepMagnetMotion(
  motion: MagnetMotionState,
  magnet: BarMagnetSpec,
  solenoid: SolenoidSpec,
  circuit: InductionCircuitState,
  dtSec: number
): MagnetMotionState {
  if (motion.mode === 'manual') return motion;

  const dt = Math.min(0.033, Math.max(0.001, dtSec));
  const g = 9.8;
  const m = magnet.massKg;

  const induction = solveInductionEMF(motion.z, motion.vz, magnet, solenoid, circuit);
  const fLenz = induction.lenzOpposingForceN;

  let netForce = 0;
  if (motion.mode === 'drop') {
    // 自由下落穿过线圈：重力 - 空气阻力 + 楞次电磁阻尼制动
    const fAir = -0.06 * motion.vz * Math.abs(motion.vz);
    netForce = -m * g + fAir + fLenz;
  } else if (motion.mode === 'spring') {
    // 弹簧悬挂振荡：胡克回复力 + 机械阻尼 + 楞次阻尼制动
    const ext = motion.z - motion.springAnchorZ;
    const fSpring = -motion.springK * ext;
    const fAir = -0.18 * motion.vz;
    netForce = fSpring + fAir + fLenz - m * g * 0.15;
  }

  const accel = netForce / m;
  let newV = motion.vz + accel * dt;
  let newZ = motion.z + newV * dt;

  // 自由落体循环重置以提供持续探究体验
  if (motion.mode === 'drop' && newZ < -0.32) {
    newZ = 0.28;
    newV = 0;
  }

  return {
    ...motion,
    z: newZ,
    vz: newV,
  };
}
