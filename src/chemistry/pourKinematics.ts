/**
 * 烧杯倾倒运动学与液体自由液面几何解算。
 *
 * 烧杯组件仅绕 Z 轴发生倾斜：rotation.z = θ（右手坐标系，Y轴向上）。
 * 当 θ < 0 时，局部 +X 下降，左侧烧杯越过杯口向右侧倾倒。
 * 旋转矩阵 R_z(θ) 将局部 +X 映射至 (cos θ, sin θ, 0)。
 * 自由液面在世界坐标系中为恒定 Y 的水平面，在烧杯局部坐标系中斜率为 dy/dx = -tan θ。
 */

export const POUR_TILT = (78 * Math.PI) / 180;
export const POUR_GRAVITY = 34;
export const POUR_EXIT_SPEED = 1.65;
export const POUR_LIP_CLEARANCE = 0.072;
export const POUR_STREAM_APPROACH = 3;
export const POUR_STREAM_FALL_STEPS = 18;
export const POUR_STREAM_RINGS = POUR_STREAM_APPROACH + POUR_STREAM_FALL_STEPS;
export const POUR_STREAM_RADIAL = 12;

export interface LiquidPlane {
  spilling: boolean;
  /** 自由液面在烧杯局部坐标系下的斜率 dy/dx（单位：米）。 */
  slope: number;
  /** 自由液面在 x = 0 处的局部 Y 坐标（即使该点无液体亦表示所在平面位置）。 */
  yAtZero: number;
  /** 倒液侧内壁的局部 X 坐标。 */
  xLip: number;
  yLip: number;
  yBottom: number;
  yRim: number;
  radius: number;
  /** 倾倒杯口上方的等效垂直液柱高度（单位：米）。液面低于杯沿时为 0。 */
  overflow: number;
}

export interface StreamSample {
  x: number;
  y: number;
  z: number;
  halfWidth: number;
  halfThick: number;
}

interface Vec3 {
  x: number;
  y: number;
  z: number;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function hypot3(x: number, y: number, z: number): number {
  return Math.hypot(x, y, z);
}

function normalize(v: Vec3): Vec3 {
  const len = hypot3(v.x, v.y, v.z) || 1;
  return { x: v.x / len, y: v.y / len, z: v.z / len };
}

/** 计算以 y(x) = yLip + slope * (x - xLip) 为上表面、被烧杯内壁与底部截断的液体体积。 */
function volumeForLip(yLip: number, slope: number, xLip: number, radius: number, yBottom: number): number {
  const steps = 64;
  const dx = (2 * radius) / steps;
  let volume = 0;
  for (let i = 0; i < steps; i++) {
    const x = -radius + (i + 0.5) * dx;
    const halfChord = Math.sqrt(Math.max(0, radius * radius - x * x));
    const y = yLip + slope * (x - xLip);
    const depth = Math.max(0, y - yBottom);
    volume += depth * 2 * halfChord * dx;
  }
  return volume;
}

export function solveLiquidPlane(
  tiltZ: number,
  fillHeight: number,
  radius: number,
  yBottom: number,
  yRim: number,
): LiquidPlane {
  const h0 = Math.max(0, fillHeight);
  const targetVol = Math.PI * radius * radius * h0;
  const tilt = clamp(tiltZ, -1.4, 1.4);
  const area = Math.PI * radius * radius;

  if (Math.abs(tilt) < 1e-4 || radius < 1e-4) {
    const y = yBottom + h0;
    return {
      spilling: false,
      slope: 0,
      yAtZero: y,
      xLip: radius,
      yLip: y,
      yBottom,
      yRim,
      radius,
      overflow: 0,
    };
  }

  const slope = -Math.tan(tilt);
  const xLip = tilt < 0 ? radius : -radius;
  const cap = volumeForLip(yRim, slope, xLip, radius, yBottom);
  const spilling = h0 > 0.003 && targetVol > cap + 1e-8;

  let yLip: number;
  if (spilling) {
    yLip = yRim;
  } else {
    let lo = yBottom;
    let hi = yRim;
    for (let i = 0; i < 28; i++) {
      const mid = (lo + hi) * 0.5;
      if (volumeForLip(mid, slope, xLip, radius, yBottom) < targetVol) lo = mid;
      else hi = mid;
    }
    yLip = (lo + hi) * 0.5;
  }

  return {
    spilling,
    slope,
    yAtZero: yLip - slope * xLip,
    xLip,
    yLip,
    yBottom,
    yRim,
    radius,
    overflow: spilling ? Math.max(0, (targetVol - cap) / area) : 0,
  };
}

/** 自由液面与倒液侧内壁相交的点；接近杯口时向外扩张至杯沿半径。 */
export function lipContactLocal(plane: LiquidPlane, rimRadius: number): Vec3 {
  const sign = plane.xLip >= 0 ? 1 : -1;
  const yWall = plane.yAtZero + plane.slope * sign * plane.radius;
  const y = clamp(yWall, plane.yBottom, plane.yRim);
  const closeness = clamp((y - (plane.yRim - 0.025)) / 0.025, 0, 1);
  const r = plane.radius + (rimRadius - plane.radius) * closeness;
  return { x: sign * r, y, z: 0 };
}

/** 自由液面上距离倒液侧杯壁向内退让数厘米的参考点。 */
export function lipInsetLocal(plane: LiquidPlane): Vec3 {
  const sign = plane.xLip >= 0 ? 1 : -1;
  const inset = Math.min(0.022, plane.radius * 0.28);
  let x = sign * plane.radius - sign * inset;
  let y = plane.yAtZero + plane.slope * x;
  if (y <= plane.yBottom + 0.004) {
    x = sign * plane.radius * 0.78;
    y = plane.yAtZero + plane.slope * x;
  }
  return { x, y: clamp(y, plane.yBottom, plane.yRim), z: 0 };
}

export interface LiquidGeometry {
  positions: Float32Array;
  indices: Uint32Array;
}

function angleDelta(a: number, b: number): number {
  return Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
}

function angleInSweep(phi: number, start: number, end: number): boolean {
  const sweep = end - start;
  let d = phi - start;
  d %= Math.PI * 2;
  if (d < 0) d += Math.PI * 2;
  return d <= sweep + 1e-3;
}

function flaredTop(plane: LiquidPlane, phi: number, rimRadius: number): Vec3 {
  const c = Math.cos(phi);
  const s = Math.sin(phi);
  const y0 = clamp(plane.yAtZero + plane.slope * c * plane.radius, plane.yBottom, plane.yRim);
  const lipPhi = plane.xLip >= 0 ? 0 : Math.PI;
  const align = Math.max(0, 1 - angleDelta(phi, lipPhi) / 0.55);
  const closeness = clamp((y0 - (plane.yRim - 0.025)) / 0.025, 0, 1);
  const r = plane.radius + (rimRadius - plane.radius) * align * closeness;
  return { x: c * r, y: y0, z: s * r };
}

function snapLipAngle(angles: number[], lipPhi: number, start: number, end: number): void {
  if (!angleInSweep(lipPhi, start, end)) return;
  let best = -1;
  let bestD = Infinity;
  for (let i = 1; i < angles.length - 1; i++) {
    const d = angleDelta(angles[i], lipPhi);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  if (best >= 0 && bestD < 0.35) angles[best] = lipPhi;
}

export function buildTiltedLiquidGeometry(plane: LiquidPlane, segments: number, rimRadius: number): LiquidGeometry {
  const positions: number[] = [];
  const indices: number[] = [];
  const add = (x: number, y: number, z: number): number => {
    const index = positions.length / 3;
    positions.push(x, y, z);
    return index;
  };

  const yMin = plane.yAtZero - Math.abs(plane.slope) * plane.radius;
  const yMax = plane.yAtZero + Math.abs(plane.slope) * plane.radius;
  const full = yMin >= plane.yBottom - 1e-5 && yMax <= plane.yRim + 1e-4 && yMax > plane.yBottom + 1e-4;

  const pushSides = (bottom: number[], top: number[], closed: boolean) => {
    const n = bottom.length;
    const last = closed ? n : n - 1;
    for (let i = 0; i < last; i++) {
      const j = closed ? (i + 1) % n : i + 1;
      const b0 = bottom[i];
      const b1 = bottom[j];
      const t0 = top[i];
      const t1 = top[j];
      const y0 = positions[t0 * 3 + 1];
      const y1 = positions[t1 * 3 + 1];
      if (y0 - plane.yBottom < 1e-4 && y1 - plane.yBottom < 1e-4) continue;
      // 从圆柱体外侧看为逆时针方向。沿 +X 增加方位角朝向 +Z。
      indices.push(b0, t0, b1, b1, t0, t1);
    }
  };

  if (full) {
    const n = Math.max(24, segments);
    const bottom: number[] = [];
    const top: number[] = [];
    let cx = 0;
    let cy = 0;
    let cz = 0;
    for (let i = 0; i < n; i++) {
      const phi = (i / n) * Math.PI * 2;
      const c = Math.cos(phi);
      const s = Math.sin(phi);
      bottom.push(add(c * plane.radius, plane.yBottom, s * plane.radius));
      const p = flaredTop(plane, phi, rimRadius);
      top.push(add(p.x, p.y, p.z));
      cx += p.x;
      cy += p.y;
      cz += p.z;
    }
    cx /= n;
    cy /= n;
    cz /= n;
    const bc = add(0, plane.yBottom, 0);
    const tc = add(cx, cy, cz);
    pushSides(bottom, top, true);
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      // 方位角增加朝向 +Z。中心 -> 下一个 -> 当前顶点朝向局部上方。
      indices.push(tc, top[j], top[i]);
      indices.push(bc, bottom[i], bottom[j]);
    }
  } else if (Math.abs(plane.slope) > 1e-5 && yMax > plane.yBottom + 1e-4) {
    const xCut = clamp((plane.yBottom - plane.yAtZero) / plane.slope, -plane.radius, plane.radius);
    const zCut = Math.sqrt(Math.max(0, plane.radius * plane.radius - xCut * xCut));
    const phiPos = Math.atan2(zCut, xCut);
    const phiNeg = Math.atan2(-zCut, xCut);
    let start: number;
    let end: number;
    if (plane.slope >= 0) {
      start = Math.min(phiPos, phiNeg);
      end = Math.max(phiPos, phiNeg);
    } else {
      start = Math.max(phiPos, phiNeg);
      end = Math.min(phiPos, phiNeg) + Math.PI * 2;
    }
    const sweep = Math.max(1e-3, end - start);
    const count = Math.max(8, Math.round(segments * sweep / (Math.PI * 2)));
    const angles: number[] = [];
    for (let i = 0; i <= count; i++) angles.push(start + sweep * (i / count));
    const lipPhi = plane.xLip >= 0 ? 0 : Math.PI;
    snapLipAngle(angles, lipPhi, start, end);

    const bottom: number[] = [];
    const top: number[] = [];
    for (let i = 0; i < angles.length; i++) {
      const phi = angles[i];
      const c = Math.cos(phi);
      const s = Math.sin(phi);
      bottom.push(add(c * plane.radius, plane.yBottom, s * plane.radius));
      const p = flaredTop(plane, phi, rimRadius);
      top.push(add(p.x, p.y, p.z));
    }
    let cx = 0;
    let cy = 0;
    let cz = 0;
    for (let i = 0; i < top.length; i++) {
      cx += positions[top[i] * 3];
      cy += positions[top[i] * 3 + 1];
      cz += positions[top[i] * 3 + 2];
    }
    const inv = 1 / top.length;
    cx *= inv;
    cy *= inv;
    cz *= inv;
    const bc = add(cx, plane.yBottom, cz);
    const tc = add(cx, cy, cz);
    pushSides(bottom, top, false);
    for (let i = 0; i < top.length - 1; i++) {
      indices.push(tc, top[i + 1], top[i]);
      indices.push(bc, bottom[i], bottom[i + 1]);
    }
  } else {
    add(0, plane.yBottom, 0);
  }

  return {
    positions: new Float32Array(positions),
    indices: new Uint32Array(indices),
  };
}

/** 经纯 Z 轴旋转后倒液侧杯壁的世界方向矢量。父级旋转由调用方叠加。 */
export function lipOutwardFromTilt(tiltZ: number, direction: 'left' | 'right'): Vec3 {
  const sign = direction === 'right' ? 1 : -1;
  const c = Math.cos(tiltZ);
  const s = Math.sin(tiltZ);
  return normalize({ x: sign * c, y: sign * s, z: 0 });
}

function flightTime(drop: number, outwardY: number, speed: number, gravity: number): number | null {
  if (!(drop > 0.012) || !(speed > 0) || !(gravity > 0)) return null;
  const a = 0.5 * gravity;
  const b = -speed * outwardY;
  const c = -drop;
  const disc = b * b - 4 * a * c;
  if (disc <= 0) return null;
  const t = (-b + Math.sqrt(disc)) / (2 * a);
  return t > 0.005 ? t : null;
}

function landingOffset(outward: Vec3, drop: number, speed: number, gravity: number): Vec3 | null {
  const t = flightTime(drop, outward.y, speed, gravity);
  if (t === null) return null;
  return {
    x: speed * outward.x * t,
    y: -drop,
    z: speed * outward.z * t,
  };
}

/**
 * 计算外杯口的目标位置，使得沿杯口外侧法线方向喷射的抛体流
 * 能够准确落入目标烧杯液面中央。
 */
export function lipGoalForPour(args: {
  outward: Vec3;
  mouth: Vec3;
  surfaceY: number;
  clearance: number;
  exitSpeed: number;
  gravity: number;
}): Vec3 {
  const lipY = args.mouth.y + args.clearance;
  const drop = lipY - args.surfaceY;
  const offset = landingOffset(args.outward, drop, args.exitSpeed, args.gravity);
  if (!offset) {
    return { x: args.mouth.x, y: lipY, z: args.mouth.z };
  }
  return {
    x: args.mouth.x - offset.x,
    y: lipY,
    z: args.mouth.z - offset.z,
  };
}

function solveAimedLaunch(
  drop: number,
  hLen: number,
  slope: number,
  gravity: number,
): { launch: Vec3; speed: number; time: number } | null {
  let used = slope;
  if (!(drop > Math.abs(used) * hLen + 0.008)) {
    used = -0.72 * drop / Math.max(hLen, 0.02);
  }
  const horiz = 1;
  const L = Math.hypot(horiz, used);
  const launchH = horiz / L;
  const launchY = used / L;
  const rhs = drop + launchY * hLen * L;
  if (rhs <= 0.004) return null;
  const time = Math.sqrt((2 * rhs) / gravity);
  const speed = (hLen * L) / time;
  if (!(speed > 0.08 && speed < 8 && time > 0.01)) return null;
  return {
    launch: { x: launchH, y: launchY, z: 0 },
    speed,
    time,
  };
}

export function composePourStream(args: {
  approach: Vec3[];
  outward: Vec3;
  surfaceY: number;
  targetX: number;
  targetZ: number;
  targetRadius: number;
  gravity: number;
  exitSpeed: number;
  phase: number;
}): StreamSample[] | null {
  if (args.approach.length < 2) return null;
  const origin = args.approach[args.approach.length - 1];
  const drop = origin.y - args.surfaceY;
  if (!(drop > 0.02)) return null;

  let launch = normalize(args.outward);
  if (launch.y > -0.25) {
    launch = normalize({ x: launch.x, y: Math.min(launch.y, -0.45), z: launch.z });
  }

  let speed = args.exitSpeed;
  let impact = landingOffset(launch, drop, speed, args.gravity);
  if (!impact) return null;
  let hitX = origin.x + impact.x;
  let hitZ = origin.z + impact.z;
  const miss = Math.hypot(hitX - args.targetX, hitZ - args.targetZ);
  if (miss > args.targetRadius * 0.72) {
    const hx = args.targetX - origin.x;
    const hz = args.targetZ - origin.z;
    const hLen = Math.hypot(hx, hz);
    if (hLen < 0.004) return null;
    const slope = launch.y / Math.max(0.15, Math.hypot(launch.x, launch.z));
    const solved = solveAimedLaunch(drop, hLen, slope, args.gravity);
    if (!solved) return null;
    const ux = hx / hLen;
    const uz = hz / hLen;
    launch = normalize({
      x: ux * solved.launch.x,
      y: solved.launch.y,
      z: uz * solved.launch.x,
    });
    speed = solved.speed;
    impact = landingOffset(launch, drop, speed, args.gravity);
    if (!impact) return null;
    hitX = origin.x + impact.x;
    hitZ = origin.z + impact.z;
    if (Math.hypot(hitX - args.targetX, hitZ - args.targetZ) > args.targetRadius * 0.85) return null;
  }

  const time = flightTime(drop, launch.y, speed, args.gravity);
  if (time === null) return null;

  const lipHalfWidth = 0.026;
  const lipHalfThick = 0.0044;
  const lipArea = Math.PI * lipHalfWidth * lipHalfThick;
  const approachRadii: Array<[number, number]> = [
    [0.014, 0.0052],
    [0.021, 0.0046],
    [lipHalfWidth, lipHalfThick],
  ];

  const samples: StreamSample[] = [];
  for (let i = 0; i < args.approach.length; i++) {
    const p = args.approach[i];
    const radii = approachRadii[Math.min(i, approachRadii.length - 1)];
    samples.push({ x: p.x, y: p.y, z: p.z, halfWidth: radii[0], halfThick: radii[1] });
  }

  const speedAt = (t: number) => hypot3(launch.x * speed, launch.y * speed - args.gravity * t, launch.z * speed);

  for (let i = 1; i <= POUR_STREAM_FALL_STEPS; i++) {
    const u = i / POUR_STREAM_FALL_STEPS;
    const t = time * u;
    const x = origin.x + launch.x * speed * t;
    const y = origin.y + launch.y * speed * t - 0.5 * args.gravity * t * t;
    const z = origin.z + launch.z * speed * t;
    const v = Math.max(speed, speedAt(t));
    const neck = Math.min(1, Math.max(0, (u - 0.08) / 0.55));
    const area = lipArea * (speed / (speed + (v - speed) * neck));
    const aspect = 5.4 + (1.08 - 5.4) * neck;
    let halfWidth = Math.sqrt((area / Math.PI) * aspect);
    let halfThick = Math.sqrt((area / Math.PI) / aspect);
    if (u > 0.42) {
      const travel = args.phase * 22 - u * 34;
      const pinch = (u - 0.42) / 0.58;
      const wave = 1 + 0.32 * Math.sin(travel) * pinch;
      halfWidth = Math.max(0.0018, halfWidth * wave);
      halfThick = Math.max(0.0016, halfThick * wave);
    }
    samples.push({ x, y, z, halfWidth, halfThick });
  }

  if (samples.length !== POUR_STREAM_RINGS) return null;
  return samples;
}

export function ellipticTubeIndices(rings: number, radial: number): Uint32Array {
  const indices: number[] = [];
  for (let j = 1; j <= rings - 1; j++) {
    for (let i = 1; i <= radial; i++) {
      const a = (radial + 1) * (j - 1) + (i - 1);
      const b = (radial + 1) * j + (i - 1);
      const c = (radial + 1) * j + i;
      const d = (radial + 1) * (j - 1) + i;
      indices.push(a, d, b, b, d, c);
    }
  }
  return new Uint32Array(indices);
}

/** 构建椭圆管道几何体。管径截面宽度跟随水平副法线，厚度跟随表面法线。 */
export function writeEllipticTube(samples: StreamSample[], radial: number, out: Float32Array): void {
  let prevB = { x: 0, y: 0, z: 1 };
  for (let i = 0; i < samples.length; i++) {
    const p = samples[i];
    const prev = samples[Math.max(0, i - 1)];
    const next = samples[Math.min(samples.length - 1, i + 1)];
    let tx = next.x - prev.x;
    let ty = next.y - prev.y;
    let tz = next.z - prev.z;
    let tl = hypot3(tx, ty, tz);
    if (tl < 1e-8) {
      tx = 0;
      ty = -1;
      tz = 0;
      tl = 1;
    }
    tx /= tl;
    ty /= tl;
    tz /= tl;

    let bx = -tz;
    let by = 0;
    let bz = tx;
    let bl = Math.hypot(bx, bz);
    if (bl < 1e-4) {
      bx = prevB.x;
      by = prevB.y;
      bz = prevB.z;
      bl = hypot3(bx, by, bz) || 1;
    }
    bx /= bl;
    by /= bl;
    bz /= bl;
    if (bx * prevB.x + by * prevB.y + bz * prevB.z < 0) {
      bx = -bx;
      by = -by;
      bz = -bz;
    }
    prevB = { x: bx, y: by, z: bz };

    let nx = by * tz - bz * ty;
    let ny = bz * tx - bx * tz;
    let nz = bx * ty - by * tx;
    const nl = hypot3(nx, ny, nz) || 1;
    nx /= nl;
    ny /= nl;
    nz /= nl;

    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const o = (i * (radial + 1) + j) * 3;
      out[o] = p.x + ca * nx * p.halfThick + sa * bx * p.halfWidth;
      out[o + 1] = p.y + ca * ny * p.halfThick + sa * by * p.halfWidth;
      out[o + 2] = p.z + ca * nz * p.halfThick + sa * bz * p.halfWidth;
    }
  }
}
