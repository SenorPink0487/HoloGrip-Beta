import * as THREE from 'three';


export interface RayRefractionResult {
  refracted: boolean;
  totalInternalReflection: boolean;
  outDirection: THREE.Vector3;
}

export type PrismMaterialType = 'crown' | 'bariumFlint' | 'flint' | 'quartz' | 'diamond';

export interface PrismMaterialSpec {
  id: PrismMaterialType;
  name: string;
  nameEn: string;
  nd: number;
  cauchyA: number;
  cauchyB: number; // um^2
  cauchyC: number; // um^4
  abbeNumber: number;
  tintHex: number;
  emissiveHex: number;
}

export const PRISM_MATERIALS: Record<PrismMaterialType, PrismMaterialSpec> = {
  crown: {
    id: 'crown',
    name: 'K9 / BK7 冕牌光学玻璃',
    nameEn: 'BK7 Crown Glass',
    nd: 1.5168,
    cauchyA: 1.5046,
    cauchyB: 0.00420,
    cauchyC: 0.00001,
    abbeNumber: 64.17,
    tintHex: 0xe0f2fe,
    emissiveHex: 0x0284c7,
  },
  bariumFlint: {
    id: 'bariumFlint',
    name: 'BaF10 钡火石光学玻璃',
    nameEn: 'BaF10 Barium Flint Glass',
    nd: 1.6320,
    cauchyA: 1.6080,
    cauchyB: 0.00820,
    cauchyC: 0.00004,
    abbeNumber: 47.11,
    tintHex: 0xdbeafe,
    emissiveHex: 0x2563eb,
  },
  flint: {
    id: 'flint',
    name: 'ZF7 / SF11 重火石玻璃 (强色散)',
    nameEn: 'SF11 Dense Flint Glass',
    nd: 1.7250,
    cauchyA: 1.6850,
    cauchyB: 0.01380,
    cauchyC: 0.00010,
    abbeNumber: 25.76,
    tintHex: 0xeff6ff,
    emissiveHex: 0x3b82f6,
  },
  quartz: {
    id: 'quartz',
    name: '高纯熔融石英水晶',
    nameEn: 'Fused Silica Quartz',
    nd: 1.4585,
    cauchyA: 1.4480,
    cauchyB: 0.00354,
    cauchyC: 0.00001,
    abbeNumber: 67.82,
    tintHex: 0xf0f9ff,
    emissiveHex: 0x0ea5e9,
  },
  diamond: {
    id: 'diamond',
    name: '高色散光学金刚石晶棱镜 (极强色散)',
    nameEn: 'High-Dispersion Diamond Crystal',
    nd: 1.7780,
    cauchyA: 1.7250,
    cauchyB: 0.01780,
    cauchyC: 0.00014,
    abbeNumber: 21.40,
    tintHex: 0xf5f3ff,
    emissiveHex: 0x6366f1,
  },
};

export interface PrismRayTraceResult {
  wavelengthNm: number;
  refractiveIndex: number;
  incidentAngleDeg: number;
  apexAngleDeg: number;
  refractionAngle1Deg: number;
  internalIncidentAngle2Deg: number;
  criticalAngleDeg: number;
  isTotalInternalReflection: boolean;
  emergenceAngleDeg: number;
  deviationAngleDeg: number;
  minimumDeviationAngleDeg: number;
  minimumDeviationIncidentAngleDeg: number;
  fresnelR1: number;
  fresnelT: number;
}

export interface SpectralBandRay extends PrismRayTraceResult {
  name: string;
  nameEn: string;
  color: THREE.Color;
  hex: number;
  css: string;
}

export interface PrismSpectrumAnalysis {
  material: PrismMaterialSpec;
  incidentAngleDeg: number;
  apexAngleDeg: number;
  bands: SpectralBandRay[];
  redRay: PrismRayTraceResult;
  yellowRay: PrismRayTraceResult;
  violetRay: PrismRayTraceResult;
  angularDispersionDeg: number;
  dispersivePower: number;
  abbeNumber: number;
  hasPartialTIR: boolean;
  hasFullTIR: boolean;
  isNearMinimumDeviation: boolean;
}

export type PolarizationSampleMode =
  | 'malus_free'
  | 'quarter_waveplate'
  | 'half_waveplate'
  | 'calcite_birefringence'
  | 'photoelastic_stress';

export type PolarizationStateType =
  | 'linear'
  | 'circular_right'
  | 'circular_left'
  | 'elliptical_right'
  | 'elliptical_left';

export interface PolarizationAnalysisResult {
  polarizerAngleDeg: number;
  analyzerAngleDeg: number;
  relativeAngleDeg: number;
  sampleMode: PolarizationSampleMode;
  waveplateFastAxisDeg: number;
  phaseRetardationRad: number;
  phaseRetardationDeg: number;
  // 琼斯复振幅分量 (通过中央波片后、进入检偏器 P2 前)
  eyRe: number;
  eyIm: number;
  ezRe: number;
  ezIm: number;
  // 归一化斯托克斯参量 (S0 = 1)
  stokesS0: number;
  stokesS1: number;
  stokesS2: number;
  stokesS3: number;
  // 偏振椭圆几何参量
  ellipticityRatio: number; // b / a in [0, 1] (0=线偏振, 1=圆偏振)
  azimuthAngleDeg: number; // 椭圆长轴或出射线偏振方位角
  polarizationState: PolarizationStateType;
  polarizationStateName: string;
  // 检偏器 P2 透射相对光强 I / I0 与消光比状态
  transmittedIntensity: number; // I / I0 in [0, 1]
  rejectedIntensity: number; // 被检偏器正交阻挡分量 1 - I/I0
  isExtinction: boolean; // 是否处于正交完全消光状态 (I / I0 < 0.005)
  isParallelMax: boolean; // 是否处于平行最大透射状态 (I / I0 > 0.995)
  // 冰洲石方解石晶体双折射 o 光与 e 光分束参量
  calciteORayBeforeAnalyzer: number;
  calciteERayBeforeAnalyzer: number;
  calciteORayTransmitted: number;
  calciteERayTransmitted: number;
  calciteWalkOffAngleDeg: number;
}

export interface BrewsterReflectionResult {
  refractiveIndex: number;
  incidentAngleDeg: number;
  brewsterAngleDeg: number;
  refractedAngleDeg: number;
  reflectanceS: number; // Rs (垂直入射面 s 分量反射率)
  reflectanceP: number; // Rp (平行入射面 p 分量反射率，在布儒斯特角处 Rp = 0)
  degreeOfPolarization: number; // P = (Rs - Rp) / (Rs + Rp)
  isAtBrewsterAngle: boolean;
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
   * 一阶第一类贝塞尔函数 J1(x) 高精度多项式数值逼近（Abramowitz & Stegun 规范）
   * 绝对误差 < 1.3e-7
   */
  public static besselJ1(x: number): number {
    const ax = Math.abs(x);
    if (ax < 1e-7) return 0.5 * x;

    if (ax < 3.75) {
      const y = (x / 3.75) * (x / 3.75);
      const ans = x * (0.5 + y * (-0.56249985 + y * (0.21093573 + y * (-0.03954289 + y * (0.00443319 + y * (-0.00031761 + y * 0.00001109))))));
      return ans;
    } else {
      const y = 3.75 / ax;
      const f1 = 0.79788456 + y * (-0.00000077 + y * (-0.00552740 + y * (0.00009512 + y * (0.00137237 + y * (-0.00072805 + y * 0.00014476)))));
      const theta1 = ax - 2.35619449 + y * (0.04687499 + y * (-0.00020096 + y * (-0.00320246 + y * (0.00018952 + y * (0.00142694 - y * 0.00067672)))));
      const ans = (1.0 / Math.sqrt(ax)) * f1 * Math.cos(theta1);
      return x < 0 ? -ans : ans;
    }
  }

  /**
   * 将激光波长转换为 HEX / RGB 及 CSS 颜色
   */
  public static wavelengthToRGB(wavelengthNm: number): { r: number; g: number; b: number; hex: number; css: string } {
    const c = this.wavelengthToColor(wavelengthNm);
    const rInt = Math.round(c.r * 255);
    const gInt = Math.round(c.g * 255);
    const bInt = Math.round(c.b * 255);
    const hex = (rInt << 16) | (gInt << 8) | bInt;
    const css = `rgb(${rInt}, ${gInt}, ${bInt})`;
    return { r: c.r, g: c.g, b: c.b, hex, css };
  }

  /**
   * 单缝夫琅禾费衍射相对光强分布：
   * I(x) = I_0 * [sin(beta) / beta]^2，其中 beta = (pi * a / lambda) * sin(theta)
   */
  public static calculateSingleSlitIntensity(
    xM: number,
    wavelengthNm: number,
    slitWidthMm: number,
    screenDistM: number
  ): number {
    const lambda = wavelengthNm * 1e-9;
    const a = Math.max(1e-6, slitWidthMm * 1e-3);
    const L = Math.max(0.01, screenDistM);
    const sinTheta = xM / Math.sqrt(xM * xM + L * L);
    const beta = (Math.PI * a / lambda) * sinTheta;

    if (Math.abs(beta) < 1e-6) return 1.0;
    const sinc = Math.sin(beta) / beta;
    return sinc * sinc;
  }

  /**
   * 双缝干涉与单缝衍射综合光强分布：
   * I(x) = I_0 * [sin(beta) / beta]^2 * cos^2(alpha)
   */
  public static calculateDoubleSlitIntensity(
    xM: number,
    wavelengthNm: number,
    slitWidthMm: number,
    slitDistanceMm: number,
    screenDistM: number
  ): number {
    const lambda = wavelengthNm * 1e-9;
    const a = Math.max(1e-6, slitWidthMm * 1e-3);
    const d = Math.max(a, slitDistanceMm * 1e-3);
    const L = Math.max(0.01, screenDistM);
    const sinTheta = xM / Math.sqrt(xM * xM + L * L);

    const beta = (Math.PI * a / lambda) * sinTheta;
    const alpha = (Math.PI * d / lambda) * sinTheta;

    const diffFactor = Math.abs(beta) < 1e-6 ? 1.0 : Math.pow(Math.sin(beta) / beta, 2);
    const cosVal = Math.cos(alpha);
    return diffFactor * cosVal * cosVal;
  }

  /**
   * 圆孔夫琅禾费衍射与艾里斑相对光强分布：
   * I(r) = I_0 * [2 J1(v) / v]^2，其中 v = (pi * D / lambda) * sin(theta)
   */
  public static calculateCircularApertureIntensity(
    rM: number,
    wavelengthNm: number,
    apertureDiameterMm: number,
    screenDistM: number
  ): number {
    const lambda = wavelengthNm * 1e-9;
    const D = Math.max(1e-6, apertureDiameterMm * 1e-3);
    const L = Math.max(0.01, screenDistM);
    const sinTheta = Math.abs(rM) / Math.sqrt(rM * rM + L * L);
    const v = (Math.PI * D / lambda) * sinTheta;

    if (Math.abs(v) < 1e-6) return 1.0;
    const j1 = this.besselJ1(v);
    const airy = (2.0 * j1) / v;
    return airy * airy;
  }

  /**
   * 衍射光栅多缝干涉与单缝调制相对光强分布：
   * I(x) = I_0 * [sin(beta) / beta]^2 * [sin(N * alpha) / (N * sin(alpha))]^2
   */
  public static calculateGratingIntensity(
    xM: number,
    wavelengthNm: number,
    gratingLinesPerMm: number,
    screenDistM: number,
    numSlits = 14
  ): number {
    const lambda = wavelengthNm * 1e-9;
    const density = Math.max(10, gratingLinesPerMm);
    const d = (1.0 / density) * 1e-3;
    const a = d * 0.35; // 单条缝宽约为周期的 35%
    const L = Math.max(0.01, screenDistM);
    const sinTheta = xM / Math.sqrt(xM * xM + L * L);

    const beta = (Math.PI * a / lambda) * sinTheta;
    const alpha = (Math.PI * d / lambda) * sinTheta;

    const diffFactor = Math.abs(beta) < 1e-6 ? 1.0 : Math.pow(Math.sin(beta) / beta, 2);

    const sinAlpha = Math.sin(alpha);
    let gratingFactor = 1.0;
    if (Math.abs(sinAlpha) < 1e-5) {
      gratingFactor = 1.0;
    } else {
      const g = Math.sin(numSlits * alpha) / (numSlits * sinAlpha);
      gratingFactor = g * g;
    }

    return diffFactor * gratingFactor;
  }

  /**
   * 单缝衍射条纹物理尺寸计算：
   * 中央明纹总宽度 Delta x_0 = 2 * lambda * L / a
   * 次级条纹间距 Delta x = lambda * L / a
   */
  public static getSingleSlitFringeWidth(
    wavelengthNm: number,
    slitWidthMm: number,
    screenDistM: number
  ): { centralWidthMm: number; secondarySpacingMm: number } {
    const lambda = wavelengthNm * 1e-9;
    const a = Math.max(1e-6, slitWidthMm * 1e-3);
    const L = Math.max(0.01, screenDistM);

    const spacingM = (lambda * L) / a;
    return {
      centralWidthMm: (2.0 * spacingM) * 1e3,
      secondarySpacingMm: spacingM * 1e3,
    };
  }

  /**
   * 双缝干涉条纹间距计算：
   * Delta y = lambda * L / d
   */
  public static getDoubleSlitFringeSpacing(
    wavelengthNm: number,
    slitDistanceMm: number,
    screenDistM: number
  ): number {
    const lambda = wavelengthNm * 1e-9;
    const d = Math.max(1e-6, slitDistanceMm * 1e-3);
    const L = Math.max(0.01, screenDistM);
    return ((lambda * L) / d) * 1e3; // 单位：mm
  }

  /**
   * 圆孔艾里斑第一暗环半径：
   * r_1 = 1.22 * lambda * L / D
   */
  public static getAiryDiskRadius(
    wavelengthNm: number,
    apertureDiameterMm: number,
    screenDistM: number
  ): number {
    const lambda = wavelengthNm * 1e-9;
    const D = Math.max(1e-6, apertureDiameterMm * 1e-3);
    const L = Math.max(0.01, screenDistM);
    return (1.2196696 * (lambda * L) / D) * 1e3; // 单位：mm
  }

  /**
   * 光栅主极大位置计算：
   * d * sin(theta) = m * lambda
   */
  public static getGratingPeakPositions(
    wavelengthNm: number,
    gratingLinesPerMm: number,
    screenDistM: number,
    maxOrder = 4
  ): { order: number; xMm: number; angleDeg: number }[] {
    const lambda = wavelengthNm * 1e-9;
    const d = (1.0 / Math.max(10, gratingLinesPerMm)) * 1e-3;
    const L = Math.max(0.01, screenDistM);
    const peaks: { order: number; xMm: number; angleDeg: number }[] = [];

    for (let m = -maxOrder; m <= maxOrder; m++) {
      const sinTheta = (m * lambda) / d;
      if (Math.abs(sinTheta) <= 0.999) {
        const theta = Math.asin(sinTheta);
        const xM = L * Math.tan(theta);
        peaks.push({
          order: m,
          xMm: xM * 1e3,
          angleDeg: THREE.MathUtils.radToDeg(theta),
        });
      }
    }
    return peaks;
  }

  /**
   * 理想杨氏双缝纯相干干涉相对光强分布（不含单缝衍射衰减包络）：
   * I(x) = I_0 * cos^2(alpha)，其中 alpha = (pi * d / lambda) * sin(theta)
   */
  public static calculatePureDoubleSlitIntensity(
    xM: number,
    wavelengthNm: number,
    slitDistanceMm: number,
    screenDistM: number
  ): number {
    const lambda = wavelengthNm * 1e-9;
    const d = Math.max(1e-6, slitDistanceMm * 1e-3);
    const L = Math.max(0.01, screenDistM);
    const sinTheta = xM / Math.sqrt(xM * xM + L * L);
    const alpha = (Math.PI * d / lambda) * sinTheta;
    const cosVal = Math.cos(alpha);
    return cosVal * cosVal;
  }

  /**
   * 杨氏双缝空间任意观测点 P(x) 的精确几何光程差与相位差计算：
   * Delta r = r_2 - r_1 = sqrt(L^2 + (x + d/2)^2) - sqrt(L^2 + (x - d/2)^2)
   * Delta phi = (2 * pi / lambda) * Delta r
   */
  public static calculateOpticalPathDifference(
    xM: number,
    wavelengthNm: number,
    slitDistanceMm: number,
    screenDistM: number
  ): {
    r1M: number;
    r2M: number;
    pathDiffM: number;
    pathDiffNm: number;
    phaseDiffRad: number;
    fringeOrder: number;
  } {
    const lambda = Math.max(1e-9, wavelengthNm * 1e-9);
    const d = Math.max(1e-6, slitDistanceMm * 1e-3);
    const L = Math.max(0.01, screenDistM);

    const r1M = Math.sqrt(L * L + Math.pow(xM - d * 0.5, 2));
    const r2M = Math.sqrt(L * L + Math.pow(xM + d * 0.5, 2));
    const pathDiffM = r2M - r1M;
    const pathDiffNm = pathDiffM * 1e9;
    const phaseDiffRad = (2.0 * Math.PI * pathDiffM) / lambda;
    const fringeOrder = pathDiffM / lambda;

    return {
      r1M,
      r2M,
      pathDiffM,
      pathDiffNm,
      phaseDiffRad,
      fringeOrder,
    };
  }

  /**
   * 杨氏双缝干涉各级明纹中心与暗纹位置解析计算：
   * d * sin(theta_k) = k * lambda
   */
  public static getDoubleSlitFringePositions(
    wavelengthNm: number,
    slitDistanceMm: number,
    screenDistM: number,
    maxOrder = 5
  ): { order: number; xMm: number; angleDeg: number; pathDiffNm: number }[] {
    const lambda = wavelengthNm * 1e-9;
    const d = Math.max(1e-6, slitDistanceMm * 1e-3);
    const L = Math.max(0.01, screenDistM);
    const fringes: { order: number; xMm: number; angleDeg: number; pathDiffNm: number }[] = [];

    for (let k = -maxOrder; k <= maxOrder; k++) {
      const sinTheta = (k * lambda) / d;
      if (Math.abs(sinTheta) <= 0.999) {
        const theta = Math.asin(sinTheta);
        const xM = L * Math.tan(theta);
        fringes.push({
          order: k,
          xMm: xM * 1e3,
          angleDeg: THREE.MathUtils.radToDeg(theta),
          pathDiffNm: k * wavelengthNm,
        });
      }
    }
    return fringes;
  }

  /**
   * 复合白光（380nm ~ 750nm 连续光谱）杨氏双缝干涉色度合成：
   * 中央零级明纹（x = 0, Delta r = 0）各波长同相叠加呈纯白亮纹，
   * 两侧高阶明纹因不同波长条纹间距 Delta y = lambda * L / d 差异呈现“内紫外红”彩色光谱干涉条纹。
   */
  public static calculateWhiteLightDoubleSlitRGB(
    xM: number,
    slitWidthMm: number,
    slitDistanceMm: number,
    screenDistM: number,
    modulateEnvelope = true
  ): { r: number; g: number; b: number; intensity: number } {
    // 16 个可见光代表性光谱采样点 (400nm ~ 700nm, 步长 20nm)
    let sumR = 0;
    let sumG = 0;
    let sumB = 0;
    let normR = 0;
    let normG = 0;
    let normB = 0;

    for (let wl = 400; wl <= 700; wl += 20) {
      const c = this.wavelengthToColor(wl);
      const I = modulateEnvelope
        ? this.calculateDoubleSlitIntensity(xM, wl, slitWidthMm, slitDistanceMm, screenDistM)
        : this.calculatePureDoubleSlitIntensity(xM, wl, slitDistanceMm, screenDistM);

      sumR += c.r * I;
      sumG += c.g * I;
      sumB += c.b * I;

      normR += c.r;
      normG += c.g;
      normB += c.b;
    }

    const r = normR > 0 ? Math.min(1.0, sumR / normR) : 0;
    const g = normG > 0 ? Math.min(1.0, sumG / normG) : 0;
    const b = normB > 0 ? Math.min(1.0, sumB / normB) : 0;
    const intensity = Math.max(r, g, b);

    return { r, g, b, intensity };
  }

  /**
   * 三棱镜光学介质柯西色散折射率精确计算：
   * n(lambda) = A + B / lambda^2 + C / lambda^4 (lambda 单位：微米 um)
   */
  public static getPrismRefractiveIndex(
    wavelengthNm: number,
    material: PrismMaterialType = 'flint'
  ): number {
    const spec = PRISM_MATERIALS[material] || PRISM_MATERIALS.flint;
    const lambdaUm = Math.max(0.35, Math.min(0.85, wavelengthNm / 1000.0));
    const l2 = lambdaUm * lambdaUm;
    const l4 = l2 * l2;
    return spec.cauchyA + spec.cauchyB / l2 + spec.cauchyC / l4;
  }

  /**
   * 菲涅尔非偏振光反射率 R 计算 (空气 n1 <-> 介质 n2)
   */
  public static calculateFresnelReflectance(
    thetaIncidentRad: number,
    thetaRefractedRad: number,
    n1: number,
    n2: number
  ): number {
    const cosI = Math.cos(thetaIncidentRad);
    const cosT = Math.cos(thetaRefractedRad);
    const rsNum = n1 * cosI - n2 * cosT;
    const rsDen = Math.max(1e-6, n1 * cosI + n2 * cosT);
    const rpNum = n2 * cosI - n1 * cosT;
    const rpDen = Math.max(1e-6, n2 * cosI + n1 * cosT);
    const Rs = (rsNum / rsDen) * (rsNum / rsDen);
    const Rp = (rpNum / rpDen) * (rpNum / rpDen);
    return Math.max(0, Math.min(1, 0.5 * (Rs + Rp)));
  }

  /**
   * 单波长光线穿过顶角为 alpha 的光学三棱镜双界面折射与全反射解析追踪：
   * 第一界面折射：sin(theta_1) = n(lambda) * sin(theta_2)
   * 棱镜内部几何关系：theta_3 = alpha - theta_2
   * 第二界面折射或全反射：n(lambda) * sin(theta_3) = sin(theta_4)
   * 总偏向角：delta(lambda) = theta_1 + theta_4 - alpha
   */
  public static tracePrismRay(
    wavelengthNm: number,
    incidentAngleDeg: number,
    apexAngleDeg = 60.0,
    material: PrismMaterialType = 'flint'
  ): PrismRayTraceResult {
    const n = this.getPrismRefractiveIndex(wavelengthNm, material);
    const theta1Deg = THREE.MathUtils.clamp(incidentAngleDeg, 5.0, 88.0);
    const alphaDeg = THREE.MathUtils.clamp(apexAngleDeg, 30.0, 75.0);

    const theta1Rad = THREE.MathUtils.degToRad(theta1Deg);
    const alphaRad = THREE.MathUtils.degToRad(alphaRadSafe(alphaDeg));

    // 1. 第一光学界面折射 (Air -> Prism Glass)
    const sinTheta2 = Math.min(0.999999, Math.sin(theta1Rad) / n);
    const theta2Rad = Math.asin(sinTheta2);
    const theta2Deg = THREE.MathUtils.radToDeg(theta2Rad);
    const R1 = this.calculateFresnelReflectance(theta1Rad, theta2Rad, 1.0, n);

    // 2. 第二光学界面内部入射角 theta_3 = alpha - theta_2
    const theta3Rad = alphaRad - theta2Rad;
    const theta3Deg = alphaDeg - theta2Deg;
    const criticalAngleRad = Math.asin(Math.min(1.0, 1.0 / n));
    const criticalAngleDeg = THREE.MathUtils.radToDeg(criticalAngleRad);

    // 最小偏向角条件：theta_2 = theta_3 = alpha / 2
    const sinMinInc = n * Math.sin(alphaRad * 0.5);
    let minDevAngleDeg = 0;
    let minDevIncDeg = 90;
    if (sinMinInc < 1.0) {
      minDevIncDeg = THREE.MathUtils.radToDeg(Math.asin(sinMinInc));
      minDevAngleDeg = 2.0 * minDevIncDeg - alphaDeg;
    } else {
      minDevAngleDeg = 180.0 - alphaDeg;
    }

    // 3. 第二光学界面出射折射或内部全反射 (Prism Glass -> Air)
    const sinTheta4 = n * Math.sin(theta3Rad);
    if (sinTheta4 >= 0.99995) {
      // 发生第二界面全反射 (TIR)：紫端或全光谱截止
      const emergenceDeg = Math.abs(theta3Deg);
      const internalDevDeg = theta1Deg + (180.0 - 2.0 * theta3Deg) - alphaDeg;
      return {
        wavelengthNm,
        refractiveIndex: n,
        incidentAngleDeg: theta1Deg,
        apexAngleDeg: alphaDeg,
        refractionAngle1Deg: theta2Deg,
        internalIncidentAngle2Deg: theta3Deg,
        criticalAngleDeg,
        isTotalInternalReflection: true,
        emergenceAngleDeg: emergenceDeg,
        deviationAngleDeg: internalDevDeg,
        minimumDeviationAngleDeg: minDevAngleDeg,
        minimumDeviationIncidentAngleDeg: minDevIncDeg,
        fresnelR1: R1,
        fresnelT: 0.0,
      };
    }

    const theta4Rad = Math.asin(Math.max(-0.99995, sinTheta4));
    const theta4Deg = THREE.MathUtils.radToDeg(theta4Rad);
    const deviationDeg = theta1Deg + theta4Deg - alphaDeg;
    const R2 = this.calculateFresnelReflectance(Math.abs(theta3Rad), Math.abs(theta4Rad), n, 1.0);
    const totalT = (1.0 - R1) * (1.0 - R2);

    return {
      wavelengthNm,
      refractiveIndex: n,
      incidentAngleDeg: theta1Deg,
      apexAngleDeg: alphaDeg,
      refractionAngle1Deg: theta2Deg,
      internalIncidentAngle2Deg: theta3Deg,
      criticalAngleDeg,
      isTotalInternalReflection: false,
      emergenceAngleDeg: theta4Deg,
      deviationAngleDeg: deviationDeg,
      minimumDeviationAngleDeg: minDevAngleDeg,
      minimumDeviationIncidentAngleDeg: minDevIncDeg,
      fresnelR1: R1,
      fresnelT: totalT,
    };
  }

  /**
   * 复合白光穿过三棱镜的完整七色光谱色散解析计算：
   * 返回红、橙、黄、绿、青、蓝、紫七束代表性特征波长光路、角色散宽度 Delta_delta、阿贝数与全反射截止状态
   */
  public static calculatePrismSpectrum(
    incidentAngleDeg: number,
    apexAngleDeg = 60.0,
    material: PrismMaterialType = 'flint'
  ): PrismSpectrumAnalysis {
    const spec = PRISM_MATERIALS[material] || PRISM_MATERIALS.flint;
    const bandDefs: { wl: number; name: string; nameEn: string }[] = [
      { wl: 670, name: '红光', nameEn: 'Red' },
      { wl: 610, name: '橙光', nameEn: 'Orange' },
      { wl: 580, name: '黄光', nameEn: 'Yellow' },
      { wl: 532, name: '绿光', nameEn: 'Green' },
      { wl: 490, name: '青光', nameEn: 'Cyan' },
      { wl: 450, name: '蓝光', nameEn: 'Blue' },
      { wl: 405, name: '紫光', nameEn: 'Violet' },
    ];

    const bands: SpectralBandRay[] = bandDefs.map((b) => {
      const trace = this.tracePrismRay(b.wl, incidentAngleDeg, apexAngleDeg, material);
      const rgb = this.wavelengthToRGB(b.wl);
      return {
        ...trace,
        name: b.name,
        nameEn: b.nameEn,
        color: new THREE.Color(rgb.r, rgb.g, rgb.b),
        hex: rgb.hex,
        css: rgb.css,
      };
    });

    const redRay = bands[0];
    const yellowRay = this.tracePrismRay(587.6, incidentAngleDeg, apexAngleDeg, material);
    const violetRay = bands[bands.length - 1];

    // 夫琅禾费 F 线 (486.1nm) 与 C 线 (656.3nm) 计算精确色散本领与阿贝数
    const nF = this.getPrismRefractiveIndex(486.1, material);
    const nC = this.getPrismRefractiveIndex(656.3, material);
    const nd = this.getPrismRefractiveIndex(587.6, material);
    const dispersivePower = (nF - nC) / Math.max(1e-5, nd - 1.0);
    const abbeNumber = 1.0 / Math.max(1e-5, dispersivePower);

    // 计算出射光谱的角色散张角 Delta_delta = delta_violet - delta_red
    const refractedBands = bands.filter((b) => !b.isTotalInternalReflection);
    let angularDispersionDeg = 0;
    if (refractedBands.length >= 2) {
      const minDev = refractedBands[0].deviationAngleDeg;
      const maxDev = refractedBands[refractedBands.length - 1].deviationAngleDeg;
      angularDispersionDeg = Math.abs(maxDev - minDev);
    }

    const hasPartialTIR = violetRay.isTotalInternalReflection && !redRay.isTotalInternalReflection;
    const hasFullTIR = redRay.isTotalInternalReflection;
    const isNearMinimumDeviation =
      !yellowRay.isTotalInternalReflection &&
      Math.abs(incidentAngleDeg - yellowRay.minimumDeviationIncidentAngleDeg) < 1.8;

    return {
      material: spec,
      incidentAngleDeg,
      apexAngleDeg,
      bands,
      redRay,
      yellowRay,
      violetRay,
      angularDispersionDeg,
      dispersivePower,
      abbeNumber,
      hasPartialTIR,
      hasFullTIR,
      isNearMinimumDeviation,
    };
  }

  /**
   * 马吕斯定律 (Malus's Law) 理想线偏振透射相对光强计算：
   * I(theta) = I_0 * cos^2(theta_A - theta_P)
   */
  public static calculateMalusLawIntensity(
    polarizerAngleDeg: number,
    analyzerAngleDeg: number,
    incidentIntensity = 1.0
  ): number {
    const deltaRad = THREE.MathUtils.degToRad(analyzerAngleDeg - polarizerAngleDeg);
    const cosVal = Math.cos(deltaRad);
    return Math.max(0.0, incidentIntensity * cosVal * cosVal);
  }

  /**
   * 琼斯矩阵 (Jones Calculus) 与斯托克斯参量 (Stokes Parameters) 偏振态完整解析求解：
   * 覆盖：
   * 1. malus_free: 自由空间马吕斯定律 I = I0 cos^2(theta_A - theta_P)
   * 2. quarter_waveplate: lambda/4 四分之一波片 (Delta_phi = pi/2)，当快轴夹角 45° 时将线偏振光转化为右旋/左旋圆偏振三维螺旋光
   * 3. half_waveplate: lambda/2 二分之一半波片 (Delta_phi = pi)，将线偏振面镜像旋转至 2*theta_WP - theta_P
   * 4. calcite_birefringence: 冰洲石 (CaCO3) 晶体双折射寻常光 (o光) 与非寻常光 (e光) 正交空间分离与互补消光
   * 5. photoelastic_stress: 光弹应力双折射相位延迟与正交/平行偏振场分析
   */
  public static analyzePolarizationState(
    polarizerAngleDeg: number,
    analyzerAngleDeg: number,
    sampleMode: PolarizationSampleMode = 'malus_free',
    waveplateFastAxisDeg = 45.0,
    stressLoadMPa = 45.0,
    wavelengthNm = 532.0
  ): PolarizationAnalysisResult {
    const thetaPRad = THREE.MathUtils.degToRad(polarizerAngleDeg);
    const thetaARad = THREE.MathUtils.degToRad(analyzerAngleDeg);
    const thetaWPRad = THREE.MathUtils.degToRad(waveplateFastAxisDeg);

    // 归一化相对夹角 Delta_theta in [0°, 180°]
    let rawDiff = ((analyzerAngleDeg - polarizerAngleDeg) % 180 + 180) % 180;
    if (rawDiff > 90) rawDiff = 180 - rawDiff;
    const relativeAngleDeg = rawDiff;

    // 相位延迟量 Delta_phi (弧度)
    let phaseRetardationRad = 0.0;
    if (sampleMode === 'quarter_waveplate') {
      phaseRetardationRad = Math.PI * 0.5;
    } else if (sampleMode === 'half_waveplate') {
      phaseRetardationRad = Math.PI;
    } else if (sampleMode === 'photoelastic_stress') {
      // 光弹应力双折射中心特征相位延迟 Delta_phi = 2*pi * C * d * sigma / lambda
      const wlScale = 532.0 / Math.max(380.0, wavelengthNm);
      phaseRetardationRad = (stressLoadMPa / 30.0) * Math.PI * wlScale;
    }

    // 入射线偏振光在波片快轴 (Fast Axis) 与慢轴 (Slow Axis) 上的投影：
    // beta = theta_P - theta_WP
    const betaRad = thetaPRad - thetaWPRad;
    const Ef = Math.cos(betaRad);
    const Es = Math.sin(betaRad);

    // 慢轴滞后相位 Delta_phi: Es_complex = Es * (cos(-Delta_phi) + i * sin(-Delta_phi))
    const cosPhi = Math.cos(phaseRetardationRad);
    const sinPhi = -Math.sin(phaseRetardationRad);

    const cosWP = Math.cos(thetaWPRad);
    const sinWP = Math.sin(thetaWPRad);

    // 转换回实验室 (Y, Z) 横截面正交坐标系：
    // E_y = Ef * cos(theta_WP) - Es_complex * sin(theta_WP)
    // E_z = Ef * sin(theta_WP) + Es_complex * cos(theta_WP)
    const eyRe = Ef * cosWP - Es * cosPhi * sinWP;
    const eyIm = -Es * sinPhi * sinWP;
    const ezRe = Ef * sinWP + Es * cosPhi * cosWP;
    const ezIm = Es * sinPhi * cosWP;

    // 计算归一化斯托克斯参量 (S0, S1, S2, S3)
    const eyMag2 = eyRe * eyRe + eyIm * eyIm;
    const ezMag2 = ezRe * ezRe + ezIm * ezIm;
    const stokesS0 = Math.max(1e-8, eyMag2 + ezMag2);
    const stokesS1 = eyMag2 - ezMag2;
    const stokesS2 = 2.0 * (eyRe * ezRe + eyIm * ezIm);
    const stokesS3 = 2.0 * (eyIm * ezRe - eyRe * ezIm);

    // 偏振椭圆率角 chi = 0.5 * arcsin(S3 / S0)，椭圆率 b/a = |tan(chi)|
    const sin2Chi = THREE.MathUtils.clamp(stokesS3 / stokesS0, -1.0, 1.0);
    const chiRad = 0.5 * Math.asin(sin2Chi);
    const ellipticityRatio = Math.min(1.0, Math.abs(Math.tan(chiRad)));

    // 偏振椭圆长轴方位角 psi = 0.5 * atan2(S2, S1)
    let psiDeg = THREE.MathUtils.radToDeg(0.5 * Math.atan2(stokesS2, stokesS1));
    psiDeg = ((psiDeg % 180) + 180) % 180;

    // 判定偏振态类型
    let polarizationState: PolarizationStateType = 'linear';
    let polarizationStateName = '线偏振光 (Linear)';
    if (sampleMode === 'calcite_birefringence') {
      polarizationState = 'linear';
      polarizationStateName = '双折射正交双线偏振光 (o光 ⊥ e光)';
    } else if (ellipticityRatio < 0.035) {
      polarizationState = 'linear';
      polarizationStateName = '线偏振光 (Linear)';
    } else if (ellipticityRatio > 0.94) {
      if (stokesS3 >= 0) {
        polarizationState = 'circular_right';
        polarizationStateName = '右旋圆偏振光 (RCP 3D螺旋)';
      } else {
        polarizationState = 'circular_left';
        polarizationStateName = '左旋圆偏振光 (LCP 3D螺旋)';
      }
    } else {
      if (stokesS3 >= 0) {
        polarizationState = 'elliptical_right';
        polarizationStateName = '右旋椭圆偏振光 (REP)';
      } else {
        polarizationState = 'elliptical_left';
        polarizationStateName = '左旋椭圆偏振光 (LEP)';
      }
    }

    // 检偏器 P2 透射相对光强 I_trans / I_0 = |E_y * cos(theta_A) + E_z * sin(theta_A)|^2
    const cosA = Math.cos(thetaARad);
    const sinA = Math.sin(thetaARad);
    const eaRe = eyRe * cosA + ezRe * sinA;
    const eaIm = eyIm * cosA + ezIm * sinA;
    let transmittedIntensity = THREE.MathUtils.clamp(eaRe * eaRe + eaIm * eaIm, 0.0, 1.0);

    // 冰洲石 (CaCO3, n_o = 1.6584, n_e = 1.4864) 晶体双折射 o 光与 e 光分束计算：
    // e 光平行于主截面 (theta_WP)，o 光垂直于主截面 (theta_WP + 90°)
    const calciteERayBeforeAnalyzer = Ef * Ef; // cos^2(theta_P - theta_WP)
    const calciteORayBeforeAnalyzer = Es * Es; // sin^2(theta_P - theta_WP)
    const cosA_WP = Math.cos(thetaARad - thetaWPRad);
    const sinA_WP = Math.sin(thetaARad - thetaWPRad);
    const calciteERayTransmitted = calciteERayBeforeAnalyzer * (cosA_WP * cosA_WP);
    const calciteORayTransmitted = calciteORayBeforeAnalyzer * (sinA_WP * sinA_WP);

    if (sampleMode === 'calcite_birefringence') {
      transmittedIntensity = THREE.MathUtils.clamp(
        calciteORayTransmitted + calciteERayTransmitted,
        0.0,
        1.0
      );
    }

    const rejectedIntensity = Math.max(0.0, 1.0 - transmittedIntensity);
    const isExtinction = transmittedIntensity < 0.006;
    const isParallelMax = transmittedIntensity > 0.994;

    return {
      polarizerAngleDeg,
      analyzerAngleDeg,
      relativeAngleDeg,
      sampleMode,
      waveplateFastAxisDeg,
      phaseRetardationRad,
      phaseRetardationDeg: THREE.MathUtils.radToDeg(phaseRetardationRad),
      eyRe,
      eyIm,
      ezRe,
      ezIm,
      stokesS0,
      stokesS1,
      stokesS2,
      stokesS3,
      ellipticityRatio,
      azimuthAngleDeg: psiDeg,
      polarizationState,
      polarizationStateName,
      transmittedIntensity,
      rejectedIntensity,
      isExtinction,
      isParallelMax,
      calciteORayBeforeAnalyzer,
      calciteERayBeforeAnalyzer,
      calciteORayTransmitted,
      calciteERayTransmitted,
      calciteWalkOffAngleDeg: 6.2,
    };
  }

  /**
   * 布儒斯特角定律 (Brewster's Law) 介质界面反射偏振度与菲涅尔 s/p 分量反射率解析计算：
   * tan(theta_B) = n_2 / n_1，在 theta_i = theta_B 时，平行分量反射率 R_p = 0，反射光为 100% 完全 s 线偏振光
   */
  public static calculateBrewsterReflection(
    incidentAngleDeg: number,
    refractiveIndex = 1.5168
  ): BrewsterReflectionResult {
    const n1 = 1.0;
    const n2 = Math.max(1.1, refractiveIndex);
    const brewsterRad = Math.atan2(n2, n1);
    const brewsterAngleDeg = THREE.MathUtils.radToDeg(brewsterRad);

    const thetaIRad = THREE.MathUtils.degToRad(THREE.MathUtils.clamp(incidentAngleDeg, 0.0, 89.0));
    const sinThetaT = Math.min(0.99999, (n1 / n2) * Math.sin(thetaIRad));
    const thetaTRad = Math.asin(sinThetaT);
    const refractedAngleDeg = THREE.MathUtils.radToDeg(thetaTRad);

    const cosI = Math.cos(thetaIRad);
    const cosT = Math.cos(thetaTRad);

    const rs = (n1 * cosI - n2 * cosT) / Math.max(1e-7, n1 * cosI + n2 * cosT);
    const rp = (n2 * cosI - n1 * cosT) / Math.max(1e-7, n2 * cosI + n1 * cosT);

    const reflectanceS = THREE.MathUtils.clamp(rs * rs, 0.0, 1.0);
    const reflectanceP = THREE.MathUtils.clamp(rp * rp, 0.0, 1.0);
    const sumR = reflectanceS + reflectanceP;
    const degreeOfPolarization = sumR > 1e-8 ? (reflectanceS - reflectanceP) / sumR : 0.0;

    return {
      refractiveIndex: n2,
      incidentAngleDeg,
      brewsterAngleDeg,
      refractedAngleDeg,
      reflectanceS,
      reflectanceP,
      degreeOfPolarization,
      isAtBrewsterAngle: Math.abs(incidentAngleDeg - brewsterAngleDeg) < 0.8,
    };
  }

  /**
   * 光弹应力双折射 (Photoelastic Stress Birefringence) 彩色等色线与等倾线 RGB 色度场解析计算：
   * 基于平面应力光学定律 Delta_phi(x, y, lambda) = (2*pi * C * d / lambda) * (sigma_1 - sigma_2)
   * 对可见光谱采样积分，真实还原正交暗场/平行明场下的牛顿色标应力干涉彩虹图谱
   */
  public static calculatePhotoelasticStressRGB(
    normX: number, // [-1, 1] 归一化构件横坐标
    normY: number, // [-1, 1] 归一化构件纵坐标
    stressLoadMPa: number,
    polarizerAngleDeg: number,
    analyzerAngleDeg: number
  ): { r: number; g: number; b: number; fringeOrder: number; insideSpecimen: boolean } {
    // 构件几何包络：带底部半圆应力集中拱孔的精密光弹承压试件
    const rOuter = Math.sqrt(normX * normX + normY * normY);
    const holeDy = normY + 0.35;
    const rHole = Math.sqrt(normX * normX + holeDy * holeDy);
    if (rOuter > 0.88 || rHole < 0.24 || normY < -0.68) {
      return { r: 0, g: 0, b: 0, fringeOrder: 0, insideSpecimen: false };
    }

    // 顶部集中载荷点 (0, 0.85) 的 Flamant 接触应力 + 拱孔周围 Kirsch 应力集中叠加
    const dxTop = normX;
    const dyTop = 0.92 - normY;
    const rTop2 = Math.max(0.035, dxTop * dxTop + dyTop * dyTop);
    const contactStress = (0.42 * dyTop) / rTop2;

    const rHole2 = Math.max(0.055, rHole * rHole);
    const archConcentration = 0.26 / rHole2;

    const bendingStress = 0.35 * Math.abs(normX) * (0.5 + Math.abs(normY));
    const principalStressDiff = (contactStress + archConcentration + bendingStress) * (stressLoadMPa / 45.0);

    // 主应力迹线倾角 alpha(x, y) (决定等倾线 Isoclinics 黑十字条纹)
    const alphaRad = 0.5 * Math.atan2(normX * dyTop, dyTop * dyTop - normX * normX + 0.08 * rHole2);
    const thetaPRad = THREE.MathUtils.degToRad(polarizerAngleDeg);
    const thetaARad = THREE.MathUtils.degToRad(analyzerAngleDeg);

    const cosDiff = Math.cos(thetaARad - thetaPRad);
    const baseTrans = cosDiff * cosDiff;
    const isoclinicTerm = Math.sin(2.0 * (alphaRad - thetaPRad)) * Math.sin(2.0 * (alphaRad - thetaARad));

    // 在 550nm 绿光基准波长下的等色线条纹级次 N = Delta_r / lambda
    const retardationNm = principalStressDiff * 480.0;
    const fringeOrder = retardationNm / 550.0;

    // 7 波长光谱采样合成牛顿干涉色标 (Newton's Color Scale)
    const sampleWavelengths = [420, 465, 510, 550, 590, 630, 670];
    let sumR = 0;
    let sumG = 0;
    let sumB = 0;
    let normR = 0;
    let normG = 0;
    let normB = 0;

    for (const wl of sampleWavelengths) {
      const deltaPhi = (Math.PI * 2.0 * retardationNm) / wl;
      const sinHalf = Math.sin(deltaPhi * 0.5);
      const transWl = THREE.MathUtils.clamp(baseTrans - isoclinicTerm * (sinHalf * sinHalf), 0.0, 1.0);
      const c = this.wavelengthToColor(wl);
      sumR += c.r * transWl;
      sumG += c.g * transWl;
      sumB += c.b * transWl;
      normR += c.r;
      normG += c.g;
      normB += c.b;
    }

    return {
      r: normR > 0 ? Math.min(1.0, sumR / normR) : 0,
      g: normG > 0 ? Math.min(1.0, sumG / normG) : 0,
      b: normB > 0 ? Math.min(1.0, sumB / normB) : 0,
      fringeOrder,
      insideSpecimen: true,
    };
  }
}

function alphaRadSafe(deg: number): number {
  return Math.max(20.0, Math.min(80.0, deg));
}


