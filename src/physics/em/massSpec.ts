import { ATOMIC_MASS, ELEMENTARY_CHARGE } from './constants.ts';

/**
 * Analyzer chamber faces the user. Ions enter along +X.
 * Bz < 0 curves a positive ion toward +Y: v × B with v = +X and B = −Z is +Y.
 * A full semicircle lands at (0, 2r) in that frame.
 */
export interface IonDef {
  id: string;
  label: string;
  massU: number;
  chargeNumber: number;
  color: number;
}

export interface Cartridge {
  id: string;
  name: string;
  ions: IonDef[];
}

export interface MassSpecInput {
  accelVoltage: number;
  analyzerBz: number;
  selectorBz: number;
  plateVoltage: number;
  gapM: number;
  jawOpening: number;
}

export interface IonHit {
  ion: IonDef;
  massKg: number;
  chargeC: number;
  speed: number;
  passSpeed: number;
  transmission: number;
  radiusM: number;
  side: 1 | -1;
  hitY: number;
  onPlate: boolean;
  chargeToMass: number;
}

export const MASS_STAGE = {
  sourceX: -0.4,
  selector0: -0.34,
  selector1: -0.16,
  slitX: -0.12,
  entranceX: 0.06,
  entranceY: 0.36,
  plateReach: 0.32,
  analyzer0: 0.04,
  analyzer1: 0.38,
  poleRadiusM: 0.11,
};

export const JAW_BYPASS = 0.92;

export const CARTRIDGES: Cartridge[] = [
  {
    id: 'hydrogen',
    name: '氢氦轻离子',
    ions: [
      { id: 'h', label: '¹H⁺', massU: 1.0078, chargeNumber: 1, color: 0x38bdf8 },
      { id: 'd', label: '²H⁺', massU: 2.0141, chargeNumber: 1, color: 0x22d3ee },
      { id: 'he', label: '⁴He⁺', massU: 4.0026, chargeNumber: 1, color: 0xfacc15 },
      { id: 'c', label: '¹²C⁺', massU: 12, chargeNumber: 1, color: 0xf97316 },
    ],
  },
  {
    id: 'neon',
    name: '氖同位素',
    ions: [
      { id: 'ne20', label: '²⁰Ne⁺', massU: 19.9924, chargeNumber: 1, color: 0x67e8f9 },
      { id: 'ne21', label: '²¹Ne⁺', massU: 20.9938, chargeNumber: 1, color: 0xa78bfa },
      { id: 'ne22', label: '²²Ne⁺', massU: 21.9914, chargeNumber: 1, color: 0xf472b6 },
    ],
  },
  {
    id: 'magnesium',
    name: '镁同位素',
    ions: [
      { id: 'mg24', label: '²⁴Mg⁺', massU: 23.985, chargeNumber: 1, color: 0x34d399 },
      { id: 'mg25', label: '²⁵Mg⁺', massU: 24.986, chargeNumber: 1, color: 0xfbbf24 },
      { id: 'mg26', label: '²⁶Mg⁺', massU: 25.983, chargeNumber: 1, color: 0xfb7185 },
    ],
  },
  {
    id: 'chlorine',
    name: '氯同位素',
    ions: [
      { id: 'cl35', label: '³⁵Cl⁺', massU: 34.969, chargeNumber: 1, color: 0x4ade80 },
      { id: 'cl37', label: '³⁷Cl⁺', massU: 36.966, chargeNumber: 1, color: 0xc084fc },
    ],
  },
];

export function curveSide(analyzerBz: number): 1 | -1 {
  return analyzerBz <= 0 ? 1 : -1;
}

export function acceleratedSpeed(massKg: number, chargeC: number, voltage: number): number {
  if (massKg <= 0 || chargeC === 0 || voltage <= 0) return 0;
  return Math.sqrt((2 * Math.abs(chargeC) * voltage) / massKg);
}

export function selectorPassSpeed(plateVoltage: number, gapM: number, selectorBz: number): number {
  const b = Math.abs(selectorBz);
  if (b < 1e-8 || gapM <= 0) return Number.POSITIVE_INFINITY;
  return Math.abs(plateVoltage) / (gapM * b);
}

export function analyzerRadius(massKg: number, chargeC: number, speed: number, analyzerBz: number): number {
  const b = Math.abs(analyzerBz);
  const q = Math.abs(chargeC);
  if (b < 1e-8 || q < 1e-30) return Number.POSITIVE_INFINITY;
  return (massKg * speed) / (q * b);
}

export function trajectoryPoint(radius: number, theta: number, side: 1 | -1): { x: number; y: number } {
  return {
    x: radius * Math.sin(theta),
    y: side * radius * (1 - Math.cos(theta)),
  };
}

export function arcThetaMax(radius: number, plateReach: number): number {
  if (!Number.isFinite(radius) || radius < 1e-6) return 0;
  if (2 * radius <= plateReach) return Math.PI;
  const cosTheta = 1 - plateReach / radius;
  if (cosTheta <= -1) return Math.PI;
  if (cosTheta >= 1) return 0;
  return Math.acos(cosTheta);
}

export function transmissionOf(speed: number, passSpeed: number, jawOpening: number): number {
  if (jawOpening >= JAW_BYPASS) return 1;
  if (!(passSpeed > 0) || !Number.isFinite(passSpeed) || speed <= 0) return 0;
  const sigma = Math.max(0.01, jawOpening) * 0.22 * passSpeed;
  const z = (speed - passSpeed) / sigma;
  return Math.exp(-0.5 * z * z);
}

export function plateVoltageForIon(
  ion: IonDef,
  accelVoltage: number,
  gapM: number,
  selectorBz: number,
): number {
  const massKg = ion.massU * ATOMIC_MASS;
  const chargeC = ion.chargeNumber * ELEMENTARY_CHARGE;
  const speed = acceleratedSpeed(massKg, chargeC, accelVoltage);
  return Math.abs(speed * selectorBz * gapM);
}

export function middleIon(cartridge: Cartridge): IonDef {
  return cartridge.ions[Math.floor(cartridge.ions.length / 2)] ?? cartridge.ions[0];
}

export function solveIon(ion: IonDef, input: MassSpecInput): IonHit {
  const massKg = ion.massU * ATOMIC_MASS;
  const chargeC = ion.chargeNumber * ELEMENTARY_CHARGE;
  const speed = acceleratedSpeed(massKg, chargeC, input.accelVoltage);
  const passSpeed = selectorPassSpeed(input.plateVoltage, input.gapM, input.selectorBz);
  const transmission = transmissionOf(speed, passSpeed, input.jawOpening);
  const radiusM = analyzerRadius(massKg, chargeC, speed, input.analyzerBz);
  const side = curveSide(input.analyzerBz);
  const hitY = Number.isFinite(radiusM) ? side * 2 * radiusM : Number.POSITIVE_INFINITY;
  const onPlate = transmission > 0.08 && Number.isFinite(hitY) && Math.abs(hitY) <= MASS_STAGE.plateReach;
  return {
    ion,
    massKg,
    chargeC,
    speed,
    passSpeed,
    transmission,
    radiusM,
    side,
    hitY,
    onPlate,
    chargeToMass: chargeC / massKg,
  };
}

export function solveSpectrum(cartridge: Cartridge, input: MassSpecInput): IonHit[] {
  return cartridge.ions.map((ion) => solveIon(ion, input));
}

export function beamField(
  x: number,
  input: Pick<MassSpecInput, 'selectorBz' | 'analyzerBz'>,
): { region: string; tesla: number } {
  if (x >= MASS_STAGE.selector0 && x <= MASS_STAGE.selector1) {
    return { region: '速度选择器', tesla: input.selectorBz };
  }
  if (x >= MASS_STAGE.analyzer0 && x <= MASS_STAGE.analyzer1) {
    return { region: '分析磁铁', tesla: input.analyzerBz };
  }
  return { region: '无场区', tesla: 0 };
}

export function analyzerFluxWb(analyzerBz: number): number {
  return analyzerBz * Math.PI * MASS_STAGE.poleRadiusM * MASS_STAGE.poleRadiusM;
}

/** Faster than the selected speed, the magnetic force wins and the ion drifts toward +Y. */
export function selectorDeflectionSign(speed: number, passSpeed: number): 1 | -1 {
  return speed >= passSpeed ? 1 : -1;
}

export function massSpecCaption(hits: IonHit[], jawOpening: number): string {
  if (jawOpening >= JAW_BYPASS) {
    const on = hits.filter((h) => h.onPlate);
    if (on.length === 0) return '这组离子的轨道半径超出了底板，加大磁场或降低加速电压';
    return '狭缝全开，不同质荷比同时落在底板上';
  }
  const ranked = [...hits].sort((a, b) => b.transmission - a.transmission);
  const best = ranked[0];
  if (!best || best.transmission < 0.08) return '速度选择器把这束离子都挡下了';
  return `窄缝放行 ${best.ion.label}，半径 ${(best.radiusM * 100).toFixed(1)} cm`;
}
