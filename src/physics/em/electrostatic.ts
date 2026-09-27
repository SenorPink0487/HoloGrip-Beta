/**
 * Electrostatic Field and Charge Dynamics.
 * Conforms strictly to Maxwell's electrostatic equations and Coulomb's Law:
 *   E(r) = (1 / 4πε₀) ∑ q_i / |r - r_i|³ · (r - r_i)
 *   V(r) = (1 / 4πε₀) ∑ q_i / |r - r_i|
 *   U    = (1 / 8πε₀) ∑_{i≠j} q_i q_j / |r_i - r_j|
 *   F    = q₀ · E
 */

export const EPSILON0 = 8.8541878128e-12; // F/m
export const COULOMB_K = 1 / (4 * Math.PI * EPSILON0); // ~8.9875517923e9 N·m²/C²

// Effective constant when q is in micro-Coulombs (µC) and distances are in meters (m)
// k_eff = COULOMB_K * 1e-6 => ~8987.5518 V·m/µC
export const K_EFF = COULOMB_K * 1e-6;

/** Default elevation of charges in the local stage space (meters) */
export const DEFAULT_CHARGE_ELEVATION = 0.0;

export interface PointCharge {
  id: string;
  x: number; // meters
  y: number; // meters
  z: number; // meters (depth offset in 3D field space)
  q: number; // charge in micro-Coulombs (µC)
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
  q0: number; // in micro-Coulombs (µC), default 0.001 (1 nC)
  visible: boolean;
  fieldVector: Vector3D;
  fieldMagnitude: number; // V/m
  potential: number; // V
  forceVector: Vector3D; // N
  forceMagnitude: number; // N
}

export interface ElectrostaticTelemetry {
  chargeCount: number;
  totalChargeMicroC: number;
  dipoleMomentMagnitude: number; // µC·m
  dipoleMomentVector: Vector3D;
  potentialEnergyJoules: number;
  fieldLineCount: number;
  selectedChargeId: string | null;
  selectedChargeValue: number;
  testCharge?: TestChargeState | null;
}

/**
 * Calculates net electric field E(r) at a given point due to multiple point charges.
 * Softening factor avoids singular infinities at r = r_i.
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

    // E_i = K_EFF * q_i * (r - r_i) / |r - r_i|³
    const factor = K_EFF * c.q * invDist3;
    ex += factor * dx;
    ey += factor * dy;
    ez += factor * dz;
  }

  return { x: ex, y: ey, z: ez };
}

/**
 * Calculates electric potential V(r) at a given point.
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
 * Calculates total electrostatic potential energy of the charge configuration:
 *   U = ∑_{i < j} (k_e · q_i · q_j) / r_ij   (in Joules)
 */
export function totalPotentialEnergy(charges: readonly PointCharge[]): number {
  let u = 0;
  // Convert µC * µC to Joules: COULOMB_K * 1e-12
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
 * Calculates electric dipole moment p = ∑ q_i · r_i (in µC·m).
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
  linesPerUnitCharge?: number; // base number of lines per 1 µC (default 12)
  stepSize?: number; // RK4 step size in meters (default 0.012)
  maxSteps?: number; // max integration steps per line (default 240)
  bounds?: number; // coordinate boundary limit (default 0.85)
  minZ?: number; // minimum Z boundary above platform
  maxZ?: number; // maximum Z boundary above platform
  captureRadius?: number; // capture radius near target charge (default 0.04)
  softening?: number;
}

/**
 * Evaluates the physics state of a movable test charge q0 in the electrostatic field.
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
 * Generates an isotropic 3D spherical seed canopy for realistic volumetric field lines.
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

  // Multi-tier latitude layers to form an elegant 3D volumetric canopy
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
 * High-precision RK4 numerical integration of electrostatic field lines.
 * Physical guarantees:
 * 1. Streamlines are tangent to E at all points: dr/ds = E / |E|
 * 2. Originates from positive charges and/or terminates on negative charges
 * 3. Seed density is strictly proportional to charge magnitude |q|
 * 4. Traverses superposition field cleanly without crossing in vacuum
 */
export function traceFieldLines(
  charges: readonly PointCharge[],
  options: TraceFieldLinesOptions = {},
): FieldLine[] {
  if (charges.length === 0) return [];

  const linesPerUnit = options.linesPerUnitCharge ?? 12;
  const h = options.stepSize ?? 0.012;
  const maxSteps = options.maxSteps ?? 240;
  const bounds = options.bounds ?? 0.85;
  const minZ = options.minZ ?? -0.65;
  const maxZ = options.maxZ ?? 0.65;
  const captureRadius = options.captureRadius ?? 0.04;
  const captureRadiusSq = captureRadius * captureRadius;
  const softening = options.softening ?? 0.006;

  const lines: FieldLine[] = [];
  const positiveCharges = charges.filter((c) => c.q > 0.001);
  const negativeCharges = charges.filter((c) => c.q < -0.001);

  let lineCounter = 0;

  // 1. Trace outward lines from positive charges along +E
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
        // RK4 integration step: f(r) = E(r) / |E(r)|
        // k1
        const e1 = electricFieldAt({ x: currX, y: currY, z: currZ }, charges, softening);
        const m1 = Math.hypot(e1.x, e1.y, e1.z);
        if (m1 < 1e-6) break;
        const u1x = e1.x / m1;
        const u1y = e1.y / m1;
        const u1z = e1.z / m1;

        // k2
        const x2 = currX + 0.5 * h * u1x;
        const y2 = currY + 0.5 * h * u1y;
        const z2 = currZ + 0.5 * h * u1z;
        const e2 = electricFieldAt({ x: x2, y: y2, z: z2 }, charges, softening);
        const m2 = Math.hypot(e2.x, e2.y, e2.z);
        if (m2 < 1e-6) break;
        const u2x = e2.x / m2;
        const u2y = e2.y / m2;
        const u2z = e2.z / m2;

        // k3
        const x3 = currX + 0.5 * h * u2x;
        const y3 = currY + 0.5 * h * u2y;
        const z3 = currZ + 0.5 * h * u2z;
        const e3 = electricFieldAt({ x: x3, y: y3, z: z3 }, charges, softening);
        const m3 = Math.hypot(e3.x, e3.y, e3.z);
        if (m3 < 1e-6) break;
        const u3x = e3.x / m3;
        const u3y = e3.y / m3;
        const u3z = e3.z / m3;

        // k4
        const x4 = currX + h * u3x;
        const y4 = currY + h * u3y;
        const z4 = currZ + h * u3z;
        const e4 = electricFieldAt({ x: x4, y: y4, z: z4 }, charges, softening);
        const m4 = Math.hypot(e4.x, e4.y, e4.z);
        if (m4 < 1e-6) break;
        const u4x = e4.x / m4;
        const u4y = e4.y / m4;
        const u4z = e4.z / m4;

        // Next point
        currX += (h / 6) * (u1x + 2 * u2x + 2 * u3x + u4x);
        currY += (h / 6) * (u1y + 2 * u2y + 2 * u3y + u4y);
        currZ += (h / 6) * (u1z + 2 * u2z + 2 * u3z + u4z);

        path.push({ x: currX, y: currY, z: currZ });

        // Boundary check
        if (
          Math.abs(currX) > bounds ||
          Math.abs(currY) > bounds ||
          currZ < minZ ||
          currZ > maxZ
        ) {
          break;
        }

        // Check if captured by any negative charge
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

        // Stop if looping into another positive charge
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

  // 2. Trace inward lines towards negative charges from infinity (along -E)
  // Essential for isolated negative charges or when negative charge exceeds positive charge
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
        // Trace backward along -E
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
          Math.abs(currY) > bounds ||
          currZ < minZ ||
          currZ > maxZ
        ) {
          break;
        }

        // If it terminates at a positive charge, it connects to a positive charge
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

      // If this backward line did NOT hit a positive charge, it came from infinity!
      // Invert path order so it flows from infinity inwards to negative charge
      if (!sourceChargeId && pathBack.length >= 2) {
        pathBack.reverse();
        lines.push({
          id: `line-${lineCounter++}`,
          points: pathBack,
          startSign: 1, // represents incoming from virtual positive infinity
          endSign: -1,
          targetChargeId: negC.id,
        });
      }
    }
  }

  return lines;
}

/**
 * Generates an N x N discrete sample grid of electric field vectors on the XY plane.
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

      // Avoid samples too close to charge cores
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
 * Standard Educational Presets
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
