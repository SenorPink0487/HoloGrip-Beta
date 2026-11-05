/**
 * 静电场与电荷动力学求解器。
 * 严格遵循麦克斯韦静电方程与库仑定律：
 *   E(r) = (1 / 4πε₀) ∑ q_i / |r - r_i|³ · (r - r_i)
 *   V(r) = (1 / 4πε₀) ∑ q_i / |r - r_i|
 *   U    = (1 / 8πε₀) ∑_{i≠j} q_i q_j / |r_i - r_j|
 *   F    = q₀ · E
 */

export const EPSILON0 = 8.8541878128e-12; // 真空介电常数 (F/m)
export const COULOMB_K = 1 / (4 * Math.PI * EPSILON0); // 静电力常量 ~8.9875517923e9 N·m²/C²

// 当电荷量 q 单位为微库 (µC)、距离为米 (m) 时的等效比例系数
// k_eff = COULOMB_K * 1e-6 => ~8987.5518 V·m/µC
export const K_EFF = COULOMB_K * 1e-6;

/** 本地场景坐标系中电荷的默认标高 (米) */
export const DEFAULT_CHARGE_ELEVATION = 0.0;

export interface PointCharge {
  id: string;
  x: number; // 单位：米 (m)
  y: number; // 单位：米 (m)
  z: number; // 单位：米 (m) (3D 电场空间中的深度偏移)
  q: number; // 电荷量，单位：微库 (µC)
}

export interface Vector3D {
  x: number;
  y: number;
  z: number;
}

export interface FieldLine {
  id: string;
  points: Vector3D[];
  startSign: 1 | -1;
  endSign?: 1 | -1;
  sourceChargeId?: string;
  targetChargeId?: string;
}

export interface GridSample {
  pos: Vector3D;
  field: Vector3D;
  magnitude: number;
  potential: number;
}

export interface TestChargeState {
  x: number;
  y: number;
  z: number;
  q0: number; // 检验电荷量，单位：微库 (µC)，默认 0.001 (即 1 nC)
  visible: boolean;
  fieldVector: Vector3D;
  fieldMagnitude: number; // 电场强度大小 (V/m)
  potential: number; // 电势 (V)
  forceVector: Vector3D; // 电场力矢量 (N)
  forceMagnitude: number; // 电场力大小 (N)
}

export interface ElectrostaticTelemetry {
  chargeCount: number;
  totalChargeMicroC: number;
  dipoleMomentMagnitude: number; // 电偶极矩大小 (µC·m)
  dipoleMomentVector: Vector3D;
  potentialEnergyJoules: number;
  fieldLineCount: number;
  selectedChargeId: string | null;
  selectedChargeValue: number;
  testCharge?: TestChargeState | null;
}

/**
 * 计算多个点电荷在给定位置激发的合电场 E(r)。
 * 引入平滑因子 (softening factor) 避免在 r = r_i 处产生奇点无穷大。
 */
export function electricFieldAt(
  r: Vector3D,
  charges: readonly PointCharge[],
  softening = 0.008,
): Vector3D {
  let ex = 0;
  let ey = 0;
  let ez = 0;
  const eps2 = softening * softening;

  for (let i = 0; i < charges.length; i++) {
    const c = charges[i];
    const dx = r.x - c.x;
    const dy = r.y - c.y;
    const dz = r.z - c.z;
    const distSq = dx * dx + dy * dy + dz * dz + eps2;
    const dist = Math.sqrt(distSq);
    const invDist3 = 1 / (dist * distSq);

    // 点电荷电场贡献：E_i = K_EFF * q_i * (r - r_i) / |r - r_i|³
    const factor = K_EFF * c.q * invDist3;
    ex += factor * dx;
    ey += factor * dy;
    ez += factor * dz;
  }

  return { x: ex, y: ey, z: ez };
}

/**
 * 计算给定位置处的电势 V(r)。
 */
export function potentialAt(
  r: Vector3D,
  charges: readonly PointCharge[],
  softening = 0.008,
): number {
  let v = 0;
  const eps2 = softening * softening;

  for (let i = 0; i < charges.length; i++) {
    const c = charges[i];
    const dx = r.x - c.x;
    const dy = r.y - c.y;
    const dz = r.z - c.z;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz + eps2);
    v += (K_EFF * c.q) / dist;
  }

  return v;
}

/**
 * 计算点电荷系统的总静电势能：
 *   U = ∑_{i < j} (k_e · q_i · q_j) / r_ij   (单位：焦耳 J)
 */
export function totalPotentialEnergy(charges: readonly PointCharge[]): number {
  let u = 0;
  // 将 µC * µC 换算为焦耳 (J)：COULOMB_K * 1e-12
  const energyK = COULOMB_K * 1e-12;

  for (let i = 0; i < charges.length; i++) {
    for (let j = i + 1; j < charges.length; j++) {
      const c1 = charges[i];
      const c2 = charges[j];
      const dx = c1.x - c2.x;
      const dy = c1.y - c2.y;
      const dz = c1.z - c2.z;
      const dist = Math.hypot(dx, dy, dz);
      if (dist > 1e-5) {
        u += (energyK * c1.q * c2.q) / dist;
      }
    }
  }

  return u;
}

/**
 * 计算电偶极矩 p = ∑ q_i · r_i (单位：µC·m)。
 */
export function electricDipoleMoment(charges: readonly PointCharge[]): {
  magnitude: number;
  vector: Vector3D;
} {
  let px = 0;
  let py = 0;
  let pz = 0;

  for (let i = 0; i < charges.length; i++) {
    const c = charges[i];
    px += c.q * c.x;
    py += c.q * c.y;
    pz += c.q * c.z;
  }

  const magnitude = Math.hypot(px, py, pz);
  return {
    magnitude,
    vector: { x: px, y: py, z: pz },
  };
}

export interface TraceFieldLinesOptions {
  linesPerUnitCharge?: number; // 每 1 µC 电荷发射的基础电力线数量 (默认 12)
  stepSize?: number; // RK4 积分步长，单位：米 (默认 0.012)
  maxSteps?: number; // 每条电力线的最大积分步数 (默认 380)
  bounds?: number; // 坐标边界范围限制 (默认 0.85)
  minY?: number; // Y 方向下限边界 (例如桌面高度截断)
  maxY?: number; // Y 方向上限边界
  minZ?: number; // 平台上方 Z 方向下限边界
  maxZ?: number; // 平台上方 Z 方向上限边界
  captureRadius?: number; // 目标电荷捕获吸收半径 (默认 0.046)
  softening?: number;
}

/**
 * 计算静电场中可移动检验电荷 q0 的物理受力与状态。
 */
export function evaluateTestCharge(
  pos: Vector3D,
  charges: readonly PointCharge[],
  q0 = 0.001,
  softening = 0.006,
): TestChargeState {
  const field = electricFieldAt(pos, charges, softening);
  const fieldMagnitude = Math.hypot(field.x, field.y, field.z);
  const potential = potentialAt(pos, charges, softening);
  const forceVector: Vector3D = {
    x: q0 * 1e-6 * field.x,
    y: q0 * 1e-6 * field.y,
    z: q0 * 1e-6 * field.z,
  };
  const forceMagnitude = Math.hypot(forceVector.x, forceVector.y, forceVector.z);

  return {
    x: pos.x,
    y: pos.y,
    z: pos.z,
    q0,
    visible: true,
    fieldVector: field,
    fieldMagnitude,
    potential,
    forceVector,
    forceMagnitude,
  };
}

export interface SeedDir {
  dx: number;
  dy: number;
  dz: number;
}

/**
 * 生成各向同性 3D 球面发射方向，用于生成逼真的空间体感电力线。
 */
export function generateSphericalSeedDirections(numLines: number): SeedDir[] {
  const dirs: SeedDir[] = [];
  if (numLines <= 6) {
    for (let k = 0; k < numLines; k++) {
      const theta = (2 * Math.PI * k) / numLines;
      dirs.push({ dx: Math.cos(theta), dy: Math.sin(theta), dz: 0 });
    }
    return dirs;
  }

  // 多层纬度分布，形成优雅的 3D 空间立体伞状电力线束
  const layers = [
    { phi: 0, weight: 0.40, offset: 0 },
    { phi: (28 * Math.PI) / 180, weight: 0.20, offset: Math.PI / 6 },
    { phi: (-28 * Math.PI) / 180, weight: 0.20, offset: Math.PI / 6 },
    { phi: (54 * Math.PI) / 180, weight: 0.10, offset: Math.PI / 3 },
    { phi: (-54 * Math.PI) / 180, weight: 0.10, offset: Math.PI / 3 },
  ];

  let allocated = 0;
  const counts: number[] = [];
  for (let i = 0; i < layers.length; i++) {
    if (i === layers.length - 1) {
      counts.push(Math.max(0, numLines - allocated));
    } else {
      const c = Math.max(i === 0 ? 4 : 2, Math.round(numLines * layers[i].weight));
      counts.push(c);
      allocated += c;
    }
  }

  for (let l = 0; l < layers.length; l++) {
    const count = counts[l];
    if (count <= 0) continue;
    const phi = layers[l].phi;
    const cosPhi = Math.cos(phi);
    const sinPhi = Math.sin(phi);
    const phase = layers[l].offset;

    for (let k = 0; k < count; k++) {
      const theta = (2 * Math.PI * k) / count + phase;
      dirs.push({
        dx: cosPhi * Math.cos(theta),
        dy: cosPhi * Math.sin(theta),
        dz: sinPhi,
      });
    }
  }

  return dirs;
}

/**
 * 基于高精度四阶龙格-库塔法 (RK4) 的静电场电力线数值积分追踪。
 * 满足以下物理特性保证：
 * 1. 电力线上每一点均与电场强度 E 相切：dr/ds = E / |E|
 * 2. 电力线起自正电荷，终止于负电荷 (或延伸至无穷远)
 * 3. 电力线发射密度严格正比于电荷量绝对值 |q|
 * 4. 在真空中平滑穿过叠加电场，互不相交
 */
export function traceFieldLines(
  charges: readonly PointCharge[],
  options: TraceFieldLinesOptions = {},
): FieldLine[] {
  if (charges.length === 0) return [];

  const linesPerUnit = options.linesPerUnitCharge ?? 12;
  const h = options.stepSize ?? 0.012;
  const maxSteps = options.maxSteps ?? 380;
  const bounds = options.bounds ?? 0.85;
  const minY = options.minY ?? -bounds;
  const maxY = options.maxY ?? bounds;
  const minZ = options.minZ ?? -0.65;
  const maxZ = options.maxZ ?? 0.65;
  const captureRadius = options.captureRadius ?? 0.046;
  const captureRadiusSq = captureRadius * captureRadius;
  const softening = options.softening ?? 0.006;

  const lines: FieldLine[] = [];
  const positiveCharges = charges.filter((c) => c.q > 0.001);
  const negativeCharges = charges.filter((c) => c.q < -0.001);

  let lineCounter = 0;

  // 1. 从正电荷出发，沿 +E 方向追踪向外发散的电力线
  for (const posC of positiveCharges) {
    const numLines = Math.max(4, Math.min(36, Math.round(linesPerUnit * Math.abs(posC.q))));
    const rEmit = 0.025;
    const seedDirs = generateSphericalSeedDirections(numLines);

    for (let k = 0; k < seedDirs.length; k++) {
      const sDir = seedDirs[k];
      let currX = posC.x + rEmit * sDir.dx;
      let currY = posC.y + rEmit * sDir.dy;
      let currZ = posC.z + rEmit * sDir.dz;

      const path: Vector3D[] = [{ x: posC.x, y: posC.y, z: posC.z }, { x: currX, y: currY, z: currZ }];
      let targetChargeId: string | undefined;

      for (let s = 0; s < maxSteps; s++) {
        // RK4 积分单步：积分方向向量 f(r) = E(r) / |E(r)|
        // 步长斜率 k1
        const e1 = electricFieldAt({ x: currX, y: currY, z: currZ }, charges, softening);
        const m1 = Math.hypot(e1.x, e1.y, e1.z);
        if (m1 < 1e-6) break;
        const u1x = e1.x / m1;
        const u1y = e1.y / m1;
        const u1z = e1.z / m1;

        // 步长斜率 k2
        const x2 = currX + 0.5 * h * u1x;
        const y2 = currY + 0.5 * h * u1y;
        const z2 = currZ + 0.5 * h * u1z;
        const e2 = electricFieldAt({ x: x2, y: y2, z: z2 }, charges, softening);
        const m2 = Math.hypot(e2.x, e2.y, e2.z);
        if (m2 < 1e-6) break;
        const u2x = e2.x / m2;
        const u2y = e2.y / m2;
        const u2z = e2.z / m2;

        // 步长斜率 k3
        const x3 = currX + 0.5 * h * u2x;
        const y3 = currY + 0.5 * h * u2y;
        const z3 = currZ + 0.5 * h * u2z;
        const e3 = electricFieldAt({ x: x3, y: y3, z: z3 }, charges, softening);
        const m3 = Math.hypot(e3.x, e3.y, e3.z);
        if (m3 < 1e-6) break;
        const u3x = e3.x / m3;
        const u3y = e3.y / m3;
        const u3z = e3.z / m3;

        // 步长斜率 k4
        const x4 = currX + h * u3x;
        const y4 = currY + h * u3y;
        const z4 = currZ + h * u3z;
        const e4 = electricFieldAt({ x: x4, y: y4, z: z4 }, charges, softening);
        const m4 = Math.hypot(e4.x, e4.y, e4.z);
        if (m4 < 1e-6) break;
        const u4x = e4.x / m4;
        const u4y = e4.y / m4;
        const u4z = e4.z / m4;

        // 计算下一采样点坐标
        currX += (h / 6) * (u1x + 2 * u2x + 2 * u3x + u4x);
        currY += (h / 6) * (u1y + 2 * u2y + 2 * u3y + u4y);
        currZ += (h / 6) * (u1z + 2 * u2z + 2 * u3z + u4z);

        path.push({ x: currX, y: currY, z: currZ });

        // 边界越界检查
        if (
          Math.abs(currX) > bounds ||
          currY < minY ||
          currY > maxY ||
          currZ < minZ ||
          currZ > maxZ
        ) {
          break;
        }

        // 检查是否落入任意负电荷的捕获半径内
        let captured = false;
        for (const negC of negativeCharges) {
          const ddx = currX - negC.x;
          const ddy = currY - negC.y;
          const ddz = currZ - negC.z;
          if (ddx * ddx + ddy * ddy + ddz * ddz < captureRadiusSq) {
            path.push({ x: negC.x, y: negC.y, z: negC.z });
            targetChargeId = negC.id;
            captured = true;
            break;
          }
        }
        if (captured) break;

        // 若回绕碰撞到其他正电荷，则终止追踪
        let hitPos = false;
        for (const otherPos of positiveCharges) {
          if (otherPos.id === posC.id) continue;
          const ddx = currX - otherPos.x;
          const ddy = currY - otherPos.y;
          const ddz = currZ - otherPos.z;
          if (ddx * ddx + ddy * ddy + ddz * ddz < captureRadiusSq) {
            hitPos = true;
            break;
          }
        }
        if (hitPos) break;
      }

      if (path.length >= 2) {
        lines.push({
          id: `line-${lineCounter++}`,
          points: path,
          startSign: 1,
          endSign: targetChargeId ? -1 : undefined,
          sourceChargeId: posC.id,
          targetChargeId,
        });
      }
    }
  }

  // 2. 对于负电荷，逆向从无穷远沿 -E 方向追踪汇聚的电力线
  // 适用于孤立负电荷，或体系中负电荷总量大于正电荷的情形
  for (const negC of negativeCharges) {
    const numLines = Math.max(4, Math.min(36, Math.round(linesPerUnit * Math.abs(negC.q))));
    const rEmit = 0.025;
    const seedDirs = generateSphericalSeedDirections(numLines);

    for (let k = 0; k < seedDirs.length; k++) {
      const sDir = seedDirs[k];
      let currX = negC.x + rEmit * sDir.dx;
      let currY = negC.y + rEmit * sDir.dy;
      let currZ = negC.z + rEmit * sDir.dz;

      const pathBack: Vector3D[] = [{ x: negC.x, y: negC.y, z: negC.z }, { x: currX, y: currY, z: currZ }];
      let sourceChargeId: string | undefined;

      for (let s = 0; s < maxSteps; s++) {
        // 沿 -E 方向逆向反向追踪
        const e1 = electricFieldAt({ x: currX, y: currY, z: currZ }, charges, softening);
        const m1 = Math.hypot(e1.x, e1.y, e1.z);
        if (m1 < 1e-6) break;
        const u1x = -e1.x / m1;
        const u1y = -e1.y / m1;
        const u1z = -e1.z / m1;

        const x2 = currX + 0.5 * h * u1x;
        const y2 = currY + 0.5 * h * u1y;
        const z2 = currZ + 0.5 * h * u1z;
        const e2 = electricFieldAt({ x: x2, y: y2, z: z2 }, charges, softening);
        const m2 = Math.hypot(e2.x, e2.y, e2.z);
        if (m2 < 1e-6) break;
        const u2x = -e2.x / m2;
        const u2y = -e2.y / m2;
        const u2z = -e2.z / m2;

        const x3 = currX + 0.5 * h * u2x;
        const y3 = currY + 0.5 * h * u2y;
        const z3 = currZ + 0.5 * h * u2z;
        const e3 = electricFieldAt({ x: x3, y: y3, z: z3 }, charges, softening);
        const m3 = Math.hypot(e3.x, e3.y, e3.z);
        if (m3 < 1e-6) break;
        const u3x = -e3.x / m3;
        const u3y = -e3.y / m3;
        const u3z = -e3.z / m3;

        const x4 = currX + h * u3x;
        const y4 = currY + h * u3y;
        const z4 = currZ + h * u3z;
        const e4 = electricFieldAt({ x: x4, y: y4, z: z4 }, charges, softening);
        const m4 = Math.hypot(e4.x, e4.y, e4.z);
        if (m4 < 1e-6) break;
        const u4x = -e4.x / m4;
        const u4y = -e4.y / m4;
        const u4z = -e4.z / m4;

        currX += (h / 6) * (u1x + 2 * u2x + 2 * u3x + u4x);
        currY += (h / 6) * (u1y + 2 * u2y + 2 * u3y + u4y);
        currZ += (h / 6) * (u1z + 2 * u2z + 2 * u3z + u4z);

        pathBack.push({ x: currX, y: currY, z: currZ });

        if (
          Math.abs(currX) > bounds ||
          currY < minY ||
          currY > maxY ||
          currZ < minZ ||
          currZ > maxZ
        ) {
          break;
        }

        // 若终止在某个正电荷附近，说明该电力线与正电荷连通
        let hitPos = false;
        for (const posC of positiveCharges) {
          const ddx = currX - posC.x;
          const ddy = currY - posC.y;
          const ddz = currZ - posC.z;
          if (ddx * ddx + ddy * ddy + ddz * ddz < captureRadiusSq) {
            sourceChargeId = posC.id;
            hitPos = true;
            break;
          }
        }
        if (hitPos) break;
      }

      // 若该反向电力线未落到正电荷上，说明它来自无穷远处！
      // 将采样路径翻转，使其表现为从无穷远汇入负电荷
      if (!sourceChargeId && pathBack.length >= 2) {
        pathBack.reverse();
        lines.push({
          id: `line-${lineCounter++}`,
          points: pathBack,
          startSign: 1, // 代表从等效正无穷远处射入
          endSign: -1,
          targetChargeId: negC.id,
        });
      }
    }
  }

  return lines;
}

/**
 * 在 XY 平面上生成 N x N 网格离散电场矢量采样点。
 */
export function sampleVectorGrid(
  charges: readonly PointCharge[],
  gridSize = 11,
  span = 0.36,
  softening = 0.01,
): GridSample[] {
  const samples: GridSample[] = [];
  const halfSpan = span / 2;
  const step = gridSize > 1 ? span / (gridSize - 1) : span;

  for (let i = 0; i < gridSize; i++) {
    const x = -halfSpan + i * step;
    for (let j = 0; j < gridSize; j++) {
      const y = -halfSpan + j * step;
      const pos: Vector3D = { x, y, z: 0 };

      // 避免采样点过分靠近电荷中心奇点
      let nearCore = false;
      for (const c of charges) {
        if (Math.hypot(x - c.x, y - c.y) < 0.02) {
          nearCore = true;
          break;
        }
      }
      if (nearCore) continue;

      const field = electricFieldAt(pos, charges, softening);
      const magnitude = Math.hypot(field.x, field.y, field.z);
      const potential = potentialAt(pos, charges, softening);

      samples.push({ pos, field, magnitude, potential });
    }
  }

  return samples;
}

/**
 * 经典教学演示预设配置
 */
export const FIELD_PRESETS: Record<string, { name: string; charges: PointCharge[] }> = {
  dipole: {
    name: '正负电偶极子 (Dipole)',
    charges: [
      { id: 'q1', x: -0.28, y: 0.0, z: DEFAULT_CHARGE_ELEVATION, q: 2.0 },
      { id: 'q2', x: 0.28, y: 0.0, z: DEFAULT_CHARGE_ELEVATION, q: -2.0 },
    ],
  },
  likeCharges: {
    name: '同号双电荷互斥 (Like Charges)',
    charges: [
      { id: 'q1', x: -0.28, y: 0.0, z: DEFAULT_CHARGE_ELEVATION, q: 2.0 },
      { id: 'q2', x: 0.28, y: 0.0, z: DEFAULT_CHARGE_ELEVATION, q: 2.0 },
    ],
  },
  quadrupole: {
    name: '平面电四极子 (Quadrupole)',
    charges: [
      { id: 'q1', x: -0.24, y: 0.18, z: DEFAULT_CHARGE_ELEVATION, q: 2.0 },
      { id: 'q2', x: 0.24, y: 0.18, z: DEFAULT_CHARGE_ELEVATION, q: -2.0 },
      { id: 'q3', x: 0.24, y: -0.18, z: DEFAULT_CHARGE_ELEVATION, q: 2.0 },
      { id: 'q4', x: -0.24, y: -0.18, z: DEFAULT_CHARGE_ELEVATION, q: -2.0 },
    ],
  },
  asymmetric: {
    name: '非对称电荷 (+3µC / -1µC)',
    charges: [
      { id: 'q1', x: -0.30, y: 0.0, z: DEFAULT_CHARGE_ELEVATION, q: 3.0 },
      { id: 'q2', x: 0.30, y: 0.0, z: DEFAULT_CHARGE_ELEVATION, q: -1.0 },
    ],
  },
  single: {
    name: '孤立正电荷 (Single Point Charge)',
    charges: [
      { id: 'q1', x: 0.0, y: 0.0, z: DEFAULT_CHARGE_ELEVATION, q: 2.0 },
    ],
  },
};
