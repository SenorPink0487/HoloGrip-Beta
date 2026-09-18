/**
 * OpticsMath.ts
 * Rigorous physical and wave optics computation engine.
 * Pure mathematical functions for wave interference, diffraction, polarization, and refraction.
 * Adheres to classical electrodynamics, wave optics, and Apple HIG precision standards.
 */

export interface ColorRGB {
  r: number;
  g: number;
  b: number;
  hex: number;
  css: string;
}

export class OpticsMath {
  /**
   * Convert light wavelength (380nm - 780nm) to physically accurate sRGB color.
   * Based on CIE 1931 color matching function approximation with smooth edge rolloff.
   */
  public static wavelengthToRGB(wavelengthNm: number): ColorRGB {
    const wl = Math.max(380, Math.min(780, wavelengthNm));
    let r = 0;
    let g = 0;
    let b = 0;

    if (wl >= 380 && wl < 440) {
      r = -(wl - 440) / (440 - 380);
      g = 0.0;
      b = 1.0;
    } else if (wl >= 440 && wl < 490) {
      r = 0.0;
      g = (wl - 440) / (490 - 440);
      b = 1.0;
    } else if (wl >= 490 && wl < 510) {
      r = 0.0;
      g = 1.0;
      b = -(wl - 510) / (510 - 490);
    } else if (wl >= 510 && wl < 580) {
      r = (wl - 510) / (580 - 510);
      g = 1.0;
      b = 0.0;
    } else if (wl >= 580 && wl < 645) {
      r = 1.0;
      g = -(wl - 645) / (645 - 580);
      b = 0.0;
    } else if (wl >= 645 && wl <= 780) {
      r = 1.0;
      g = 0.0;
      b = 0.0;
    }

    // Vision sensitivity rolloff at spectrum limits (380-420nm and 700-780nm)
    let factor = 0.0;
    if (wl >= 380 && wl < 420) {
      factor = 0.3 + 0.7 * (wl - 380) / (420 - 380);
    } else if (wl >= 420 && wl <= 700) {
      factor = 1.0;
    } else if (wl > 700 && wl <= 780) {
      factor = 0.3 + 0.7 * (780 - wl) / (780 - 700);
    }

    const gamma = 0.8;
    const rByte = Math.round(Math.pow(r * factor, gamma) * 255);
    const gByte = Math.round(Math.pow(g * factor, gamma) * 255);
    const bByte = Math.round(Math.pow(b * factor, gamma) * 255);

    const hex = (rByte << 16) | (gByte << 8) | bByte;
    const css = `rgb(${rByte}, ${gByte}, ${bByte})`;

    return {
      r: rByte / 255,
      g: gByte / 255,
      b: bByte / 255,
      hex,
      css,
    };
  }

  /**
   * Snell's Law for refraction: n1 * sin(theta1) = n2 * sin(theta2)
   * Returns refracted angle in radians, or null if total internal reflection occurs.
   */
  public static calculateRefractionAngle(
    theta1Rad: number,
    n1: number,
    n2: number
  ): { theta2Rad: number | null; isTotalInternalReflection: boolean; criticalAngleRad: number | null } {
    const criticalAngleRad = n1 > n2 ? Math.asin(n2 / n1) : null;
    const sinTheta2 = (n1 / n2) * Math.sin(theta1Rad);

    if (Math.abs(sinTheta2) > 1.0) {
      return {
        theta2Rad: null,
        isTotalInternalReflection: true,
        criticalAngleRad,
      };
    }

    return {
      theta2Rad: Math.asin(sinTheta2),
      isTotalInternalReflection: false,
      criticalAngleRad,
    };
  }

  /**
   * Fresnel reflection and transmission power coefficients (unpolarized light).
   * Calculates R (reflectance) and T (transmittance) where R + T = 1.
   */
  public static calculateFresnelCoefficients(
    theta1Rad: number,
    theta2Rad: number | null,
    n1: number,
    n2: number
  ): { R: number; T: number } {
    if (theta2Rad === null) {
      return { R: 1.0, T: 0.0 };
    }

    const cos1 = Math.cos(theta1Rad);
    const cos2 = Math.cos(theta2Rad);

    // Perpendicular (s-polarization)
    const rs = (n1 * cos1 - n2 * cos2) / (n1 * cos1 + n2 * cos2);
    const Rs = rs * rs;

    // Parallel (p-polarization)
    const rp = (n2 * cos1 - n1 * cos2) / (n2 * cos1 + n1 * cos2);
    const Rp = rp * rp;

    const R = Math.min(1.0, Math.max(0.0, (Rs + Rp) * 0.5));
    const T = 1.0 - R;

    return { R, T };
  }

  /**
   * Cauchy's dispersion equation: n(lambda) = A + B / (lambda_um^2)
   * Typical crown glass: A = 1.5046, B = 0.0042 um^2
   */
  public static calculateCauchyRefractiveIndex(
    wavelengthNm: number,
    baseIndex = 1.52
  ): number {
    const lambdaUm = wavelengthNm / 1000.0;
    // Calibrate B so that at 589nm (Sodium D) it matches baseIndex
    const bConst = 0.005;
    const aConst = baseIndex - bConst / (0.589 * 0.589);
    return aConst + bConst / (lambdaUm * lambdaUm);
  }

  /**
   * Double-slit interference with single-slit diffraction envelope modulation:
   * I(x) = I0 * (sin(beta) / beta)^2 * cos^2(alpha)
   * alpha = (pi * d * x) / (lambda * L)  [interference factor]
   * beta  = (pi * a * x) / (lambda * L)  [single-slit diffraction envelope factor]
   */
  public static doubleSlitIntensity(
    x: number,
    lambda: number,
    d: number,
    a: number,
    L: number,
    I0 = 1.0
  ): number {
    const alpha = (Math.PI * d * x) / (lambda * L);
    const beta = (Math.PI * a * x) / (lambda * L);

    // Diffraction factor: sinc^2(beta)
    const sinc = Math.abs(beta) < 1e-6 ? 1.0 : Math.sin(beta) / beta;
    const diffractionFactor = sinc * sinc;

    // Interference factor: cos^2(alpha)
    const cosAlpha = Math.cos(alpha);
    const interferenceFactor = cosAlpha * cosAlpha;

    return I0 * diffractionFactor * interferenceFactor;
  }

  /**
   * Calculate theoretical fringe spacing for double slit: Delta x = (L / d) * lambda
   */
  public static doubleSlitFringeSpacing(lambda: number, d: number, L: number): number {
    if (d <= 0) return 0;
    return (L / d) * lambda;
  }

  /**
   * Check if an interference order k is missing (缺级现象):
   * Occurs when d / a is an integer m, then order k = m, 2m, 3m... corresponds to diffraction zero!
   */
  public static checkMissingOrder(d: number, a: number): { isMissingOrder: boolean; ratio: number } {
    if (a <= 0) return { isMissingOrder: false, ratio: 0 };
    const ratio = d / a;
    const nearestInt = Math.round(ratio);
    const isMissing = Math.abs(ratio - nearestInt) < 0.02 && nearestInt > 1;
    return { isMissingOrder: isMissing, ratio: nearestInt };
  }

  /**
   * Single-slit Fraunhofer diffraction:
   * I(theta) = I0 * (sin(beta) / beta)^2
   * beta = (pi * a * sin(theta)) / lambda
   * For small angles on screen at distance L: sin(theta) ~ x / L
   */
  public static singleSlitIntensity(
    x: number,
    lambda: number,
    a: number,
    L: number,
    I0 = 1.0
  ): number {
    const sinTheta = x / Math.hypot(x, L);
    const beta = (Math.PI * a * sinTheta) / lambda;
    const sinc = Math.abs(beta) < 1e-6 ? 1.0 : Math.sin(beta) / beta;
    return I0 * sinc * sinc;
  }

  /**
   * Circular aperture diffraction (Airy disk intensity):
   * I(r) = I0 * (2 * J1(gamma) / gamma)^2
   * gamma = (pi * D * sin(theta)) / lambda
   */
  public static circularApertureIntensity(
    r: number,
    lambda: number,
    diameter: number,
    L: number,
    I0 = 1.0
  ): number {
    const sinTheta = r / Math.hypot(r, L);
    const gamma = (Math.PI * diameter * sinTheta) / lambda;

    if (Math.abs(gamma) < 1e-6) {
      return I0;
    }

    const j1 = this.besselJ1(gamma);
    const val = (2.0 * j1) / gamma;
    return I0 * val * val;
  }

  /**
   * Diffraction grating intensity:
   * I(x) = I0 * (sin(beta)/beta)^2 * (sin(N*alpha) / sin(alpha))^2 / N^2
   * normalized so principal maxima have intensity I0
   */
  public static gratingIntensity(
    x: number,
    lambda: number,
    gratingPeriodD: number,
    slitWidthA: number,
    L: number,
    slitCountN = 10,
    I0 = 1.0
  ): number {
    const sinTheta = x / Math.hypot(x, L);
    const alpha = (Math.PI * gratingPeriodD * sinTheta) / lambda;
    const beta = (Math.PI * slitWidthA * sinTheta) / lambda;

    // Single slit diffraction factor
    const sincBeta = Math.abs(beta) < 1e-6 ? 1.0 : Math.sin(beta) / beta;
    const singleSlit = sincBeta * sincBeta;

    // Multi-slit interference factor
    let multiSlit = 1.0;
    const sinAlpha = Math.sin(alpha);
    if (Math.abs(sinAlpha) < 1e-5) {
      multiSlit = 1.0; // Principal maximum
    } else {
      const sinNAlpha = Math.sin(slitCountN * alpha);
      const quotient = sinNAlpha / (slitCountN * sinAlpha);
      multiSlit = quotient * quotient;
    }

    return I0 * singleSlit * multiSlit;
  }

  /**
   * Malus's Law for polarization:
   * I = I0 * cos^2(theta)
   */
  public static malusIntensity(thetaRad: number, I0 = 1.0): number {
    const cosTheta = Math.cos(thetaRad);
    return I0 * cosTheta * cosTheta;
  }

  /**
   * First-order Bessel function J1(x) polynomial approximation.
   */
  private static besselJ1(x: number): number {
    const ax = Math.abs(x);
    if (ax < 3.75) {
      const y = (x / 3.75) * (x / 3.75);
      const ans =
        x *
        (0.5 +
          y *
            (-0.56249985 +
              y *
                (0.21093573 +
                  y * (-0.03954289 + y * (0.00443319 - y * 0.00031761)))));
      return ans;
    } else {
      const y = 3.75 / ax;
      const f0 =
        0.79788456 +
        y *
          (-0.00000077 +
            y *
              (-0.0055274 +
                y * (0.00009512 + y * (0.00137237 - y * 0.00072805))));
      const theta0 =
        ax -
        2.35619449 +
        y *
          (0.0441272 +
            y *
              (-0.0000021 +
                y *
                  (-0.0020138 +
                    y * (0.00004724 + y * (0.00076263 - y * 0.00021757)))));
      const ans = (Math.SQRT2 / Math.sqrt(Math.PI * ax)) * f0 * Math.cos(theta0);
      return x < 0.0 ? -ans : ans;
    }
  }
}
