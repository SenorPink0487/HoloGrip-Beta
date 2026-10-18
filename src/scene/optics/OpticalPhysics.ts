import * as THREE from 'three';


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
}

