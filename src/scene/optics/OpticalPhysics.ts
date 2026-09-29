import * as THREE from 'three';

export interface DispersionRay {
  wavelengthNm: number;
  color: THREE.Color;
  refractiveIndex: number;
  deviationAngleRad: number;
  points: THREE.Vector3[];
}

export interface RayRefractionResult {
  refracted: boolean;
  totalInternalReflection: boolean;
  outDirection: THREE.Vector3;
}

export class OpticalPhysics {
  /**
   * 根据波长（380nm - 750nm）近似计算 CIE RGB 颜色
   */
  public static wavelengthToColor(wavelengthNm: number): THREE.Color {
    let r = 0;
    let g = 0;
    let b = 0;
    const w = wavelengthNm;

    if (w >= 380 && w < 440) {
      r = -(w - 440) / (440 - 380);
      g = 0.0;
      b = 1.0;
    } else if (w >= 440 && w < 490) {
      r = 0.0;
      g = (w - 440) / (490 - 440);
      b = 1.0;
    } else if (w >= 490 && w < 510) {
      r = 0.0;
      g = 1.0;
      b = -(w - 510) / (510 - 490);
    } else if (w >= 510 && w < 580) {
      r = (w - 510) / (580 - 510);
      g = 1.0;
      b = 0.0;
    } else if (w >= 580 && w < 620) {
      r = 1.0;
      g = -(w - 620) / (620 - 580);
      b = 0.0;
    } else if (w >= 620 && w <= 750) {
      r = 1.0;
      g = 0.0;
      b = 0.0;
    }

    // 靠近人眼视觉极限处的光强衰减
    let factor = 0.0;
    if (w >= 380 && w < 420) {
      factor = 0.3 + 0.7 * (w - 380) / (420 - 380);
    } else if (w >= 420 && w < 701) {
      factor = 1.0;
    } else if (w >= 701 && w <= 750) {
      factor = 0.3 + 0.7 * (750 - w) / (750 - 700);
    }

    return new THREE.Color(
      Math.max(0, Math.min(1, r * factor)),
      Math.max(0, Math.min(1, g * factor)),
      Math.max(0, Math.min(1, b * factor))
    );
  }

  /**
   * 玻璃色散折射率的柯西公式：
   * n(lambda) = A + B / lambda^2（lambda 单位为微米）
   */
  public static getCauchyIndex(wavelengthNm: number, baseIndex = 1.52, dispersionStrength = 0.005): number {
    const lambdaUm = wavelengthNm / 1000;
    // 标准参考波长为 589.3nm（钠黄光 D 双线）
    const refUm = 0.5893;
    const delta = dispersionStrength * (1 / (lambdaUm * lambdaUm) - 1 / (refUm * refUm));
    return Math.max(1.0, baseIndex + delta);
  }

  /**
   * 矢量形式斯涅尔定律折射计算。发生折射返回 true，发生全反射（TIR）返回 false。
   */
  public static refractRay(
    incidentDir: THREE.Vector3,
    normal: THREE.Vector3,
    n1: number,
    n2: number
  ): RayRefractionResult {
    const v = incidentDir.clone().normalize();
    let n = normal.clone().normalize();
    let eta = n1 / n2;

    let c1 = -v.dot(n);
    if (c1 < 0) {
      // 光线正从介质内部穿向外部
      n.negate();
      c1 = -v.dot(n);
    }

    const c2Squared = 1.0 - eta * eta * (1.0 - c1 * c1);
    if (c2Squared < 0) {
      // 发生全反射（TIR）
      const reflected = v.clone().reflect(n);
      return {
        refracted: false,
        totalInternalReflection: true,
        outDirection: reflected,
      };
    }

    const c2 = Math.sqrt(c2Squared);
    const refracted = v.multiplyScalar(eta).add(n.multiplyScalar(eta * c1 - c2)).normalize();

    return {
      refracted: true,
      totalInternalReflection: false,
      outDirection: refracted,
    };
  }

  /**
   * 马吕斯定律计算透射光强（经检偏器后）：
   * I = I_0 * cos^2(theta2 - theta1)
   */
  public static calculateMalusIntensity(polarizerAngleDeg: number, analyzerAngleDeg: number, initialIntensity = 1.0): number {
    const deltaRad = THREE.MathUtils.degToRad(analyzerAngleDeg - polarizerAngleDeg);
    const cosVal = Math.cos(deltaRad);
    return initialIntensity * cosVal * cosVal;
  }

  /**
   * 双缝干涉条纹间距计算：
   * Delta y = (lambda * L) / d
   */
  public static calculateDoubleSlitFringeSpacing(wavelengthNm: number, slitDistanceMm: number, screenDistanceM: number): number {
    const lambda = wavelengthNm * 1e-9;
    const d = slitDistanceMm * 1e-3;
    const L = screenDistanceM;
    if (d <= 0) return 0;
    return (lambda * L) / d; // 单位：米
  }

  /**
   * 单缝衍射第一极小角半角宽度：
   * theta_1 = arcsin(lambda / a)
   */
  public static calculateSingleSlitAiryWidth(wavelengthNm: number, slitWidthMm: number, screenDistanceM: number): number {
    const lambda = wavelengthNm * 1e-9;
    const a = slitWidthMm * 1e-3;
    if (a <= 0) return 0;
    const sinTheta = Math.min(1.0, lambda / a);
    return 2.0 * screenDistanceM * Math.tan(Math.asin(sinTheta)); // 中央明纹总宽度
  }

  /**
   * 60 度等边三棱镜的多光谱色散计算
   */
  public static calculatePrismDispersionRays(
    apexPos: THREE.Vector3,
    prismRotationY: number,
    baseIndex = 1.54,
    incomingPos: THREE.Vector3 = new THREE.Vector3(0, 0, -0.6),
    screenZ = 0.48
  ): DispersionRay[] {
    const spectrumWavelengths = [
      { wl: 680, name: 'Red' },
      { wl: 610, name: 'Orange' },
      { wl: 575, name: 'Yellow' },
      { wl: 530, name: 'Green' },
      { wl: 480, name: 'Cyan' },
      { wl: 440, name: 'Blue' },
      { wl: 405, name: 'Violet' },
    ];

    const rays: DispersionRay[] = [];
    const side = 0.075;
    const h = side * Math.sin(Math.PI / 3);
    const theta = prismRotationY;
    const cosT = Math.cos(theta);
    const sinT = Math.sin(theta);

    // 相对 apexPos 在 XZ 平面旋转后的顶角 A 及底角 B、C
    // 局部坐标：A = (0, -h*0.5), B = (-side*0.5, h*0.5), C = (side*0.5, h*0.5)
    const Ax = apexPos.x + (-h * 0.5) * sinT;
    const Az = apexPos.z + (-h * 0.5) * cosT;
    const Bx = apexPos.x + (-side * 0.5) * cosT + (h * 0.5) * sinT;
    const Bz = apexPos.z - (-side * 0.5) * sinT + (h * 0.5) * cosT;

    // 界面 1（AB）指向空气的外法向量
    const N1 = new THREE.Vector3(
      -0.866025 * cosT - 0.5 * sinT,
      0,
      0.866025 * sinT - 0.5 * cosT
    ).normalize();

    // 界面 2（AC）指向空气的外法向量
    const N2 = new THREE.Vector3(
      0.866025 * cosT - 0.5 * sinT,
      0,
      -0.866025 * sinT - 0.5 * cosT
    ).normalize();

    // 光线在界面 1（AB）上的入射点
    let u = (incomingPos.x - Ax) / (Bx - Ax || 1e-5);
    if (u < 0.1 || u > 0.9) {
      u = 0.45;
    }
    const pEnter = new THREE.Vector3(
      Ax + u * (Bx - Ax),
      apexPos.y,
      Az + u * (Bz - Az)
    );

    const inDir = new THREE.Vector3().subVectors(pEnter, incomingPos).normalize();
    if (inDir.lengthSq() < 1e-4) inDir.set(0, 0, 1);

    for (const spec of spectrumWavelengths) {
      // 增强视觉色散系数（0.016），呈现清晰分明的各色光谱分离
      const n = OpticalPhysics.getCauchyIndex(spec.wl, baseIndex, 0.016);
      const color = OpticalPhysics.wavelengthToColor(spec.wl);

      // 1. 在界面 1 折射进入玻璃
      const r1 = OpticalPhysics.refractRay(inDir, N1, 1.0, n);
      const dirInside = r1.outDirection;

      // 2. 与界面 2 所在平面求交（过点 A，法向量为 N2）
      const denom = dirInside.dot(N2);
      const tExit = Math.abs(denom) > 1e-5
        ? (new THREE.Vector3(Ax - pEnter.x, 0, Az - pEnter.z).dot(N2)) / denom
        : 0.045;

      const pExit = pEnter.clone().add(dirInside.clone().multiplyScalar(Math.max(0.01, tExit)));
      pExit.y = apexPos.y;

      // 3. 在界面 2 从玻璃折射出射至空气
      const r2 = OpticalPhysics.refractRay(dirInside, N2, n, 1.0);
      const dirOut = r2.totalInternalReflection ? dirInside : r2.outDirection;

      // 4. 与位于 screenZ 处的观测屏求交
      const distZ = screenZ - pExit.z;
      const tScreen = dirOut.z > 1e-4 ? distZ / dirOut.z : 0.45;
      const pScreen = pExit.clone().add(dirOut.clone().multiplyScalar(Math.max(0.05, tScreen)));
      pScreen.z = screenZ;
      pScreen.y = apexPos.y;

      rays.push({
        wavelengthNm: spec.wl,
        color,
        refractiveIndex: n,
        deviationAngleRad: inDir.angleTo(dirOut),
        points: [incomingPos.clone(), pEnter.clone(), pExit, pScreen],
      });
    }

    return rays;
  }
}
