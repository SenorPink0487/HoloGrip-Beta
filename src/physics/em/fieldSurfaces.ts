/**
 * 静电场高斯面与等势面。
 *
 * 高斯面：以每个点电荷为球心的闭合球面。球面上电通量只取决于所包围电荷，
 *   Φ_E = Q_enc / ε₀，与半径无关。半径取在最近邻电荷之内，避免相邻曲面相交。
 *
 * 等势面：V(r) = 常量 的等值面，由标量场上的四面体行进提取。
 *   异号电荷系统额外包含 V = 0 的中性面（偶极子的中垂面）。
 */

import {
  electricFieldAt,
  EPSILON0,
  potentialAt,
  type PointCharge,
  type Vector3D,
} from './electrostatic.ts';

export interface GaussianSurface {
  chargeId: string;
  center: Vector3D;
  radius: number;
  enclosedChargeMicroC: number;
  /** Φ_E = Q_enc / ε₀，单位 N·m²/C */
  flux: number;
}

export interface EquipotentialSurface {
  potential: number;
  positions: Float32Array;
  normals: Float32Array;
}

export interface EquipotentialTraceOptions {
  /** 每个方向的采样数上限。实际分辨率还会按场域跨度收束。 */
  resolution?: number;
  softening?: number;
}

const MIXED_SHELL_RADII = [0.26];
const SAME_SIGN_SHELL_RADII = [0.16, 0.3];
const SAMPLE_DIRS: ReadonlyArray<readonly [number, number, number]> = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
];

/** 立方体 8 个角，索引与标准行进立方体一致。 */
const CORNERS: ReadonlyArray<readonly [number, number, number]> = [
  [0, 0, 0],
  [1, 0, 0],
  [1, 1, 0],
  [0, 1, 0],
  [0, 0, 1],
  [1, 0, 1],
  [1, 1, 1],
  [0, 1, 1],
];

/**
 * 沿体对角线 0–6 把立方体切成 6 个四面体。
 * 相邻立方体在公共面上的对角线一致，等值面不会裂开。
 */
const TETS: ReadonlyArray<readonly [number, number, number, number]> = [
  [0, 1, 2, 6],
  [0, 2, 3, 6],
  [0, 3, 7, 6],
  [0, 7, 4, 6],
  [0, 4, 5, 6],
  [0, 5, 1, 6],
];

export function gaussianFlux(chargeMicroC: number): number {
  return (chargeMicroC * 1e-6) / EPSILON0;
}

export function buildGaussianSurfaces(charges: readonly PointCharge[]): GaussianSurface[] {
  const surfaces: GaussianSurface[] = [];

  for (const charge of charges) {
    if (Math.abs(charge.q) < 1e-6) continue;

    let nearest = Infinity;
    for (const other of charges) {
      if (other.id === charge.id) continue;
      const dist = Math.hypot(charge.x - other.x, charge.y - other.y, charge.z - other.z);
      if (dist > 1e-6 && dist < nearest) nearest = dist;
    }

    const preferred = 0.155 + 0.018 * Math.cbrt(Math.abs(charge.q));
    let radius = Number.isFinite(nearest) ? Math.min(preferred, nearest * 0.38) : Math.max(preferred, 0.22);
    radius = Math.max(0.09, radius);

    surfaces.push({
      chargeId: charge.id,
      center: { x: charge.x, y: charge.y, z: charge.z },
      radius,
      enclosedChargeMicroC: charge.q,
      flux: gaussianFlux(charge.q),
    });
  }

  return surfaces;
}

export function traceEquipotentialSurfaces(
  charges: readonly PointCharge[],
  options: EquipotentialTraceOptions = {},
): EquipotentialSurface[] {
  const active = charges.filter((charge) => Math.abs(charge.q) > 1e-6);
  if (active.length === 0) return [];

  const softening = options.softening ?? 0.008;
  const domain = domainFor(active);
  const resolution = resolveResolution(domain, options.resolution ?? 32);
  const levels = chooseLevels(active, domain, softening);
  if (levels.length === 0) return [];

  const { pot, xs, ys, zs, nx, ny, nz } = samplePotentialGrid(active, domain, resolution, softening);
  const buckets: number[][] = levels.map(() => []);
  const cornerVal = new Float64Array(8);
  const cornerPos = new Float32Array(24);

  for (let k = 0; k < nz - 1; k++) {
    for (let j = 0; j < ny - 1; j++) {
      for (let i = 0; i < nx - 1; i++) {
        for (let c = 0; c < 8; c++) {
          const di = CORNERS[c][0];
          const dj = CORNERS[c][1];
          const dk = CORNERS[c][2];
          const ii = i + di;
          const jj = j + dj;
          const kk = k + dk;
          cornerVal[c] = pot[(kk * ny + jj) * nx + ii];
          cornerPos[c * 3] = xs[ii];
          cornerPos[c * 3 + 1] = ys[jj];
          cornerPos[c * 3 + 2] = zs[kk];
        }

        for (let levelIndex = 0; levelIndex < levels.length; levelIndex++) {
          const iso = levels[levelIndex];
          const out = buckets[levelIndex];
          for (let t = 0; t < TETS.length; t++) {
            const tet = TETS[t];
            polygonizeTet(tet[0], tet[1], tet[2], tet[3], iso, cornerVal, cornerPos, out);
          }
        }
      }
    }
  }

  const cell = Math.max(
    (domain.xMax - domain.xMin) / Math.max(1, nx - 1),
    (domain.yMax - domain.yMin) / Math.max(1, ny - 1),
    (domain.zMax - domain.zMin) / Math.max(1, nz - 1),
  );
  const margin = cell * 1.6;
  const surfaces: EquipotentialSurface[] = [];

  for (let levelIndex = 0; levelIndex < levels.length; levelIndex++) {
    const raw = buckets[levelIndex];
    if (raw.length < 24 * 9) continue;
    const positions = Float32Array.from(raw);
    const isZero = Math.abs(levels[levelIndex]) < 1e-6;
    if (!isZero && boundaryFraction(positions, domain, margin) > 0.22) continue;

    surfaces.push({
      potential: levels[levelIndex],
      positions,
      normals: fieldNormals(positions, levels[levelIndex], active, softening),
    });
  }

  surfaces.sort((a, b) => a.potential - b.potential);
  return surfaces;
}

interface Domain {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  zMin: number;
  zMax: number;
}

function domainFor(charges: readonly PointCharge[]): Domain {
  let xMin = Infinity;
  let xMax = -Infinity;
  let yMin = Infinity;
  let yMax = -Infinity;
  let zMin = Infinity;
  let zMax = -Infinity;
  for (const charge of charges) {
    xMin = Math.min(xMin, charge.x);
    xMax = Math.max(xMax, charge.x);
    yMin = Math.min(yMin, charge.y);
    yMax = Math.max(yMax, charge.y);
    zMin = Math.min(zMin, charge.z);
    zMax = Math.max(zMax, charge.z);
  }

  const pad = 0.5;
  return {
    xMin: xMin - pad,
    xMax: xMax + pad,
    yMin: yMin - pad,
    yMax: yMax + pad,
    zMin: Math.min(zMin, 0) - 0.48,
    zMax: Math.max(zMax, 0) + 0.48,
  };
}

function resolveResolution(domain: Domain, requested: number): number {
  const span = Math.max(domain.xMax - domain.xMin, domain.yMax - domain.yMin, domain.zMax - domain.zMin);
  const fit = Math.round(span / 0.05);
  return Math.max(24, Math.min(requested, fit, 32));
}

function chooseLevels(charges: readonly PointCharge[], domain: Domain, softening: number): number[] {
  const mixedSigns = charges.some((charge) => charge.q > 1e-3) && charges.some((charge) => charge.q < -1e-3);
  const radii = mixedSigns ? MIXED_SHELL_RADII : SAME_SIGN_SHELL_RADII;
  const raw: number[] = [];
  for (const charge of charges) {
    for (const radius of radii) {
      const samples: number[] = [];
      for (const dir of SAMPLE_DIRS) {
        const point = {
          x: charge.x + dir[0] * radius,
          y: charge.y + dir[1] * radius,
          z: charge.z + dir[2] * radius,
        };
        if (
          point.x <= domain.xMin || point.x >= domain.xMax ||
          point.y <= domain.yMin || point.y >= domain.yMax ||
          point.z <= domain.zMin || point.z >= domain.zMax
        ) {
          continue;
        }
        let blocked = false;
        for (const other of charges) {
          if (other.id === charge.id) continue;
          const dist = Math.hypot(point.x - other.x, point.y - other.y, point.z - other.z);
          if (dist < 0.08) {
            blocked = true;
            break;
          }
        }
        if (blocked) continue;
        samples.push(potentialAt(point, charges, softening));
      }
      if (samples.length < 3) continue;
      samples.sort((a, b) => a - b);
      raw.push(samples[Math.floor(samples.length / 2)]);
    }
  }

  raw.sort((a, b) => a - b);
  const levels: number[] = [];
  for (const value of raw) {
    if (!Number.isFinite(value) || Math.abs(value) < 1) continue;
    if (levels.some((level) => Math.abs(level - value) / Math.max(Math.abs(level), Math.abs(value), 1) < 0.16)) {
      continue;
    }
    levels.push(value);
  }

  if (mixedSigns) levels.push(0);
  return pickSpread(levels, 3);
}

function pickSpread(levels: number[], maxCount: number): number[] {
  if (levels.length <= maxCount) return [...levels].sort((a, b) => a - b);

  const zero = levels.some((value) => Math.abs(value) <= 1e-6);
  const neg = levels.filter((value) => value < -1).sort((a, b) => a - b);
  const pos = levels.filter((value) => value > 1).sort((a, b) => a - b);
  const slots = maxCount - (zero ? 1 : 0);

  let negCount = Math.min(neg.length, Math.floor(slots / 2));
  let posCount = Math.min(pos.length, slots - negCount);
  if (negCount + posCount < slots) {
    negCount = Math.min(neg.length, slots - posCount);
    posCount = Math.min(pos.length, slots - negCount);
  }

  const sample = (values: number[], count: number): number[] => {
    if (count <= 0 || values.length === 0) return [];
    if (values.length <= count) return values.slice();
    const picked: number[] = [];
    for (let i = 0; i < count; i++) {
      const t = count === 1 ? (values.length - 1) / 2 : (i * (values.length - 1)) / (count - 1);
      picked.push(values[Math.round(t)]);
    }
    return picked;
  };

  const chosen = [...sample(neg, negCount), ...(zero ? [0] : []), ...sample(pos, posCount)];
  return [...new Set(chosen)].sort((a, b) => a - b);
}

function samplePotentialGrid(
  charges: readonly PointCharge[],
  domain: Domain,
  resolution: number,
  softening: number,
): { pot: Float32Array; xs: Float32Array; ys: Float32Array; zs: Float32Array; nx: number; ny: number; nz: number } {
  const nx = resolution;
  const ny = resolution;
  const nz = resolution;
  const xs = axisSamples(domain.xMin, domain.xMax, nx);
  const ys = axisSamples(domain.yMin, domain.yMax, ny);
  const zs = axisSamples(domain.zMin, domain.zMax, nz);
  const pot = new Float32Array(nx * ny * nz);
  const point = { x: 0, y: 0, z: 0 };

  for (let k = 0; k < nz; k++) {
    point.z = zs[k];
    for (let j = 0; j < ny; j++) {
      point.y = ys[j];
      const row = (k * ny + j) * nx;
      for (let i = 0; i < nx; i++) {
        point.x = xs[i];
        pot[row + i] = potentialAt(point, charges, softening);
      }
    }
  }

  return { pot, xs, ys, zs, nx, ny, nz };
}

function axisSamples(min: number, max: number, count: number): Float32Array {
  const out = new Float32Array(count);
  const span = count > 1 ? (max - min) / (count - 1) : 0;
  for (let i = 0; i < count; i++) out[i] = min + span * i;
  return out;
}

function polygonizeTet(
  i0: number,
  i1: number,
  i2: number,
  i3: number,
  iso: number,
  values: Float64Array,
  positions: Float32Array,
  out: number[],
): void {
  const ids = [i0, i1, i2, i3];
  let inside = 0;
  for (let n = 0; n < 4; n++) {
    if (values[ids[n]] >= iso) inside++;
  }
  if (inside === 0 || inside === 4) return;

  if (inside === 1 || inside === 3) {
    const apexIsInside = inside === 1;
    let apex = -1;
    const others: number[] = [];
    for (let n = 0; n < 4; n++) {
      const id = ids[n];
      const onInside = values[id] >= iso;
      if (onInside === apexIsInside && apex < 0) apex = id;
      else others.push(id);
    }
    if (apex < 0 || others.length !== 3) return;
    const tri = [0, 0, 0, 0, 0, 0, 0, 0, 0];
    let cursor = 0;
    for (const other of others) {
      cursor = writeEdgePoint(apex, other, iso, values, positions, tri, cursor);
    }
    pushTriangle(out, tri[0], tri[1], tri[2], tri[3], tri[4], tri[5], tri[6], tri[7], tri[8]);
    return;
  }

  const insideIds: number[] = [];
  const outsideIds: number[] = [];
  for (let n = 0; n < 4; n++) {
    const id = ids[n];
    if (values[id] >= iso) insideIds.push(id);
    else outsideIds.push(id);
  }
  const quad = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  let cursor = 0;
  cursor = writeEdgePoint(insideIds[0], outsideIds[0], iso, values, positions, quad, cursor);
  cursor = writeEdgePoint(insideIds[0], outsideIds[1], iso, values, positions, quad, cursor);
  cursor = writeEdgePoint(insideIds[1], outsideIds[1], iso, values, positions, quad, cursor);
  writeEdgePoint(insideIds[1], outsideIds[0], iso, values, positions, quad, cursor);
  pushTriangle(out, quad[0], quad[1], quad[2], quad[3], quad[4], quad[5], quad[6], quad[7], quad[8]);
  pushTriangle(out, quad[0], quad[1], quad[2], quad[6], quad[7], quad[8], quad[9], quad[10], quad[11]);
}

function writeEdgePoint(
  a: number,
  b: number,
  iso: number,
  values: Float64Array,
  positions: Float32Array,
  target: number[],
  cursor: number,
): number {
  const va = values[a];
  const vb = values[b];
  const denom = vb - va;
  let t = Math.abs(denom) < 1e-18 ? 0.5 : (iso - va) / denom;
  if (t < 0) t = 0;
  else if (t > 1) t = 1;
  const ax = positions[a * 3];
  const ay = positions[a * 3 + 1];
  const az = positions[a * 3 + 2];
  target[cursor] = ax + (positions[b * 3] - ax) * t;
  target[cursor + 1] = ay + (positions[b * 3 + 1] - ay) * t;
  target[cursor + 2] = az + (positions[b * 3 + 2] - az) * t;
  return cursor + 3;
}

function pushTriangle(
  out: number[],
  ax: number, ay: number, az: number,
  bx: number, by: number, bz: number,
  cx: number, cy: number, cz: number,
): void {
  const abx = bx - ax;
  const aby = by - ay;
  const abz = bz - az;
  const acx = cx - ax;
  const acy = cy - ay;
  const acz = cz - az;
  const nx = aby * acz - abz * acy;
  const ny = abz * acx - abx * acz;
  const nz = abx * acy - aby * acx;
  if (nx * nx + ny * ny + nz * nz < 1e-12) return;
  out.push(ax, ay, az, bx, by, bz, cx, cy, cz);
}

function boundaryFraction(positions: Float32Array, domain: Domain, margin: number): number {
  const count = positions.length / 3;
  if (count === 0) return 1;
  let near = 0;
  const x0 = domain.xMin + margin;
  const x1 = domain.xMax - margin;
  const y0 = domain.yMin + margin;
  const y1 = domain.yMax - margin;
  const z0 = domain.zMin + margin;
  const z1 = domain.zMax - margin;
  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i];
    const y = positions[i + 1];
    const z = positions[i + 2];
    if (x <= x0 || x >= x1 || y <= y0 || y >= y1 || z <= z0 || z >= z1) near++;
  }
  return near / count;
}

function fieldNormals(
  positions: Float32Array,
  potential: number,
  charges: readonly PointCharge[],
  softening: number,
): Float32Array {
  const normals = new Float32Array(positions.length);
  const sign = potential < -1 ? -1 : 1;
  const point = { x: 0, y: 0, z: 0 };
  for (let i = 0; i < positions.length; i += 3) {
    point.x = positions[i];
    point.y = positions[i + 1];
    point.z = positions[i + 2];
    const field = electricFieldAt(point, charges, softening);
    const len = Math.hypot(field.x, field.y, field.z);
    if (len < 1e-8) {
      normals[i + 2] = 1;
      continue;
    }
    normals[i] = (sign * field.x) / len;
    normals[i + 1] = (sign * field.y) / len;
    normals[i + 2] = (sign * field.z) / len;
  }
  return normals;
}
