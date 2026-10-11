/**
 * 动生发电机物理求解器 (Rotary Generator & Motional EMF)
 *
 * 物理原理：
 * 匀强磁场 \vec{B} 保持恒定，矩形线圈在磁场中以角速度 \omega 旋转。
 * 线圈各边切割磁感线产生动生电动势：
 * \mathcal{E}_{动} = \oint (\vec{v} \times \vec{B}) \cdot \mathrm{d}\vec{l}
 * 穿过线圈平面的磁通量：\Phi(t) = B S \cos(\theta(t))
 * 感应电动势：\mathcal{E}(t) = - N \frac{\mathrm{d}\Phi}{\mathrm{d}t} = N B S \omega \sin(\theta(t))
 *
 * 输出整流机制：
 * 1. 双滑环 (AC): 连续集电环输出正弦交流电 \mathcal{E}_{ac}(t) = N B S \omega \sin(\theta)
 * 2. 换向器 (DC): 换向半环在线圈过中性面时自动翻转连接，输出脉动直流电 \mathcal{E}_{dc}(t) = N B S \omega |\sin(\theta)|
 */

export interface GeneratorSpec {
  turns: number;           // 匝数 N (e.g. 200)
  coilWidthM: number;      // 线圈宽度 w (m, e.g. 0.05)
  coilHeightM: number;     // 线圈高度 h (m, e.g. 0.07)
  magFieldTesla: number;   // 极靴间匀强磁感应强度 B (T, e.g. 0.40)
  coilResistanceOhm: number;// 线圈绕组内阻 (Ω, e.g. 3.5)
  bulbBaseResistanceOhm: number; // 负载灯泡冷态电阻 (Ω, e.g. 15.0)
  meterResistanceOhm: number;    // 检流计内阻 (Ω, e.g. 24.0)
  rotorInertiaKgM2: number;// 转子与手柄转动惯量 J (kg·m^2, e.g. 0.0018)
}

export type GeneratorOutputType = 'ac' | 'dc';

export interface GeneratorState {
  angleRad: number;        // 线圈旋转角位移 θ (rad)
  omegaRadS: number;       // 角速度 ω (rad/s)
  outputType: GeneratorOutputType; // 'ac' 双滑环交流 | 'dc' 换向器脉动直流
  circuitClosed: boolean;  // 闭合回路开关
  bulbConnected: boolean;  // 负载小灯泡接入状态
}

export interface GeneratorReading {
  rpm: number;             // 实时转速 (RPM)
  fluxWb: number;          // 瞬时磁通量 \Phi(t) (Wb)
  emfVolt: number;         // 瞬时动生电动势 \mathcal{E}(t) (V)
  emfPeakVolt: number;     // 峰值电动势 \mathcal{E}_{peak} = NBS\omega (V)
  currentAmp: number;      // 瞬时回路电流 I (A)
  currentUa: number;       // 瞬时回路电流 (µA, 检流计使用)
  bulbPowerWatt: number;   // 灯泡瞬时消耗功率 (W)
  bulbBrightness: number;  // 归一化灯泡发光亮度 [0.0, 1.0]
  lenzTorqueNm: number;    // 楞次电磁感应反力矩 (N·m)
}

export const GENERATOR_GOLDEN_SPEC: GeneratorSpec = {
  turns: 200,
  coilWidthM: 0.05,
  coilHeightM: 0.07,
  magFieldTesla: 0.40,
  coilResistanceOhm: 3.5,
  bulbBaseResistanceOhm: 15.0,
  meterResistanceOhm: 24.0,
  rotorInertiaKgM2: 0.0018,
};

/**
 * 求解发电机瞬时动生电磁参量
 */
export function solveGeneratorEMF(
  state: GeneratorState,
  spec: GeneratorSpec = GENERATOR_GOLDEN_SPEC
): GeneratorReading {
  const areaM2 = spec.coilWidthM * spec.coilHeightM;
  const omega = state.omegaRadS;
  const rpm = (Math.abs(omega) * 60) / (2 * Math.PI);
  const theta = state.angleRad;

  // 瞬时磁通量 \Phi = B * S * cos(θ)
  const fluxWb = spec.magFieldTesla * areaM2 * Math.cos(theta);

  // 峰值动生电动势 \mathcal{E}_{max} = N * B * S * \omega
  const emfPeakVolt = spec.turns * spec.magFieldTesla * areaM2 * Math.abs(omega);

  // 未整流交流瞬时电动势 \mathcal{E}_{ac} = N * B * S * \omega * sin(θ)
  const rawAcEmf = spec.turns * spec.magFieldTesla * areaM2 * omega * Math.sin(theta);

  // 根据滑环/换向器输出
  let emfVolt = 0;
  if (state.outputType === 'ac') {
    emfVolt = rawAcEmf;
  } else {
    // 换向器整流：输出单向脉动波
    emfVolt = Math.abs(rawAcEmf);
  }

  let currentAmp = 0;
  let bulbPowerWatt = 0;
  let bulbBrightness = 0;
  let lenzTorqueNm = 0;

  if (state.circuitClosed) {
    // 计算回路动态总阻抗（灯泡钨丝热敏效应：阻值随发热微增）
    let loadR = spec.meterResistanceOhm;
    if (state.bulbConnected) {
      loadR += spec.bulbBaseResistanceOhm;
    }
    const totalR = Math.max(0.5, spec.coilResistanceOhm + loadR);

    currentAmp = emfVolt / totalR;

    if (state.bulbConnected) {
      bulbPowerWatt = currentAmp * currentAmp * spec.bulbBaseResistanceOhm;
      // 额定功率约 0.25 W，超过时高亮饱和
      const normP = Math.min(1.0, bulbPowerWatt / 0.28);
      bulbBrightness = Math.pow(normP, 0.7); // 视觉感知伽马补偿
    }

    // 楞次定律安培反力矩：\tau_{Lenz} = - m \times B = - (N * I * S) * B * sin(\theta)
    if (Math.abs(omega) > 1e-4) {
      const magMoment = spec.turns * currentAmp * areaM2;
      lenzTorqueNm = -magMoment * spec.magFieldTesla * Math.sin(theta);
    }
  }

  return {
    rpm,
    fluxWb,
    emfVolt,
    emfPeakVolt,
    currentAmp,
    currentUa: currentAmp * 1e6,
    bulbPowerWatt,
    bulbBrightness,
    lenzTorqueNm,
  };
}

/**
 * 步进发电机转子转动动力学
 */
export function stepGeneratorRotor(
  state: GeneratorState,
  driveTorqueNm: number,
  spec: GeneratorSpec = GENERATOR_GOLDEN_SPEC,
  dtSec = 0.016
): GeneratorState {
  const dt = Math.min(0.05, Math.max(0.001, dtSec));

  const reading = solveGeneratorEMF(state, spec);

  // 机械阻尼力矩（轴承阻尼与空气阻力）
  const mechFrictionTorque = -0.00035 * state.omegaRadS - 0.00004 * state.omegaRadS * Math.abs(state.omegaRadS);

  // 电磁反力矩
  const emTorque = reading.lenzTorqueNm;

  // 总力矩
  const netTorque = driveTorqueNm + mechFrictionTorque + emTorque;

  // 角加速度 \alpha = \tau / J
  const alpha = netTorque / spec.rotorInertiaKgM2;

  let newOmega = state.omegaRadS + alpha * dt;

  // 微小速度阈值死区静止
  if (Math.abs(driveTorqueNm) < 1e-6 && Math.abs(newOmega) < 0.05) {
    newOmega = 0;
  }

  let newAngle = (state.angleRad + newOmega * dt) % (Math.PI * 2);
  if (newAngle < 0) newAngle += Math.PI * 2;

  return {
    ...state,
    angleRad: newAngle,
    omegaRadS: newOmega,
  };
}
