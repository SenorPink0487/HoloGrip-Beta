import { MU0 } from './constants.ts';

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
