export interface FerroMaterial {
  id: string;
  name: string;
  bsTesla: number;
  hcAmpPerM: number;
  aAmpPerM: number;
  color: number;
}

export const FERRO_MATERIALS: FerroMaterial[] = [
  { id: 'silicon-steel', name: '硅钢片', bsTesla: 1.9, hcAmpPerM: 35, aAmpPerM: 22, color: 0x8ecae6 },
  { id: 'soft-iron', name: '软铁', bsTesla: 1.6, hcAmpPerM: 180, aAmpPerM: 160, color: 0x94a3b8 },
  { id: 'carbon-steel', name: '碳钢', bsTesla: 1.35, hcAmpPerM: 4000, aAmpPerM: 2200, color: 0x57534e },
  { id: 'ferrite', name: '铁氧体', bsTesla: 0.38, hcAmpPerM: 200, aAmpPerM: 240, color: 0x7c2d12 },
];

export const H_MAX = 9000;
export const SOLENOID_TURNS_PER_M = 2400;
export const SEARCH_TURNS = 20;
export const SAMPLE_AREA_M2 = Math.PI * 0.008 * 0.008;
export const B_AXIS_TESLA = 2;

export function materialById(id: string): FerroMaterial {
  return FERRO_MATERIALS.find((m) => m.id === id) ?? FERRO_MATERIALS[0];
}

/** Ascending branch (direction +1) crosses B = 0 at H = +Hc. Descending crosses at H = −Hc. */
export function branchB(H: number, direction: 1 | -1, mat: FerroMaterial): number {
  const shift = direction > 0 ? -mat.hcAmpPerM : mat.hcAmpPerM;
  return mat.bsTesla * Math.tanh((H + shift) / mat.aAmpPerM);
}

export function virginB(H: number, mat: FerroMaterial): number {
  return mat.bsTesla * Math.tanh(H / (mat.aAmpPerM + mat.hcAmpPerM));
}

export function remanence(mat: FerroMaterial): number {
  return branchB(0, -1, mat);
}

export function loopArea(mat: FerroMaterial, hMax = H_MAX, samples = 96): number {
  const step = (2 * hMax) / samples;
  let area = 0;
  let H = -hMax;
  let B = branchB(H, 1, mat);
  for (let i = 0; i < samples; i++) {
    const H1 = H + step;
    const B1 = branchB(H1, 1, mat);
    area += 0.5 * (H + H1) * (B1 - B);
    H = H1;
    B = B1;
  }
  for (let i = 0; i < samples; i++) {
    const H1 = H - step;
    const B1 = branchB(H1, -1, mat);
    area += 0.5 * (H + H1) * (B1 - B);
    H = H1;
    B = B1;
  }
  return area;
}

export function majorLoopPoints(
  mat: FerroMaterial,
  hMax = H_MAX,
  samples = 64,
): Array<{ h: number; b: number }> {
  const pts: Array<{ h: number; b: number }> = [];
  for (let i = 0; i <= samples; i++) {
    const H = -hMax + (2 * hMax * i) / samples;
    pts.push({ h: H, b: branchB(H, 1, mat) });
  }
  for (let i = 1; i <= samples; i++) {
    const H = hMax - (2 * hMax * i) / samples;
    pts.push({ h: H, b: branchB(H, -1, mat) });
  }
  return pts;
}

export function magnetizingCurrent(H: number): number {
  return H / SOLENOID_TURNS_PER_M;
}

export function searchFluxWb(materialB: number): number {
  return SEARCH_TURNS * materialB * SAMPLE_AREA_M2;
}

/** Uniform inside a long solenoid, then a short fringe. `axial` is measured from the sample center. */
export function solenoidSampleField(axial: number, halfLength: number, materialB: number): number {
  if (Math.abs(axial) <= halfLength) return materialB;
  const fringeArg = (Math.abs(axial) - halfLength) / 0.025;
  const fringe = Math.exp(-(fringeArg * fringeArg));
  return materialB * 0.35 * fringe;
}

export function domainSigns(B: number, bs: number, count: number): number[] {
  const frac = Math.min(1, Math.max(0, 0.5 * (1 + B / Math.max(bs, 1e-6))));
  const up = Math.round(frac * count);
  const signs: number[] = [];
  for (let i = 0; i < count; i++) signs.push(i < up ? 1 : -1);
  return signs;
}

export function hysteresisCaption(mat: FerroMaterial, major: boolean, area: number): string {
  if (!major) return '初始磁化曲线。把励磁旋钮来回推过两端饱和，回线才会闭合';
  return `${mat.name}：剩磁 ${remanence(mat).toFixed(2)} T，矫顽力 ${Math.round(mat.hcAmpPerM)} A/m，每周损耗 ${Math.round(area)} J/m³`;
}
