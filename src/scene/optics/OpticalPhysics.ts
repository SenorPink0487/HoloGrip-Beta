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
   * Approximate CIE RGB conversion from wavelength (380nm - 750nm)
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
    } else if (w >= 580 && w < 645) {
      r = 1.0;
      g = -(w - 645) / (645 - 580);
      b = 0.0;
    } else if (w >= 645 && w <= 750) {
      r = 1.0;
      g = 0.0;
      b = 0.0;
    }

    // Intensity falloff near vision limits
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
   * Cauchy's equation for refractive index dispersion in glass:
   * n(lambda) = A + B / lambda^2 (lambda in micrometers)
   */
  public static getCauchyIndex(wavelengthNm: number, baseIndex = 1.52, dispersionStrength = 0.005): number {
    const lambdaUm = wavelengthNm / 1000;
    // Standard reference wavelength is 589.3nm (Sodium D line)
    const refUm = 0.5893;
    const delta = dispersionStrength * (1 / (lambdaUm * lambdaUm) - 1 / (refUm * refUm));
    return Math.max(1.0, baseIndex + delta);
  }

  /**
   * Vector Snell's Law refraction. Returns true if refraction occurs, or false on Total Internal Reflection (TIR).
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
      // Ray is travelling from inside to outside
      n.negate();
      c1 = -v.dot(n);
    }

    const c2Squared = 1.0 - eta * eta * (1.0 - c1 * c1);
    if (c2Squared < 0) {
      // Total internal reflection (TIR)
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
   * Malus's Law calculation for transmitted light intensity through an analyzer:
   * I = I_0 * cos^2(theta2 - theta1)
   */
  public static calculateMalusIntensity(polarizerAngleDeg: number, analyzerAngleDeg: number, initialIntensity = 1.0): number {
    const deltaRad = THREE.MathUtils.degToRad(analyzerAngleDeg - polarizerAngleDeg);
    const cosVal = Math.cos(deltaRad);
    return initialIntensity * cosVal * cosVal;
  }

  /**
   * Double-slit fringe spacing calculation:
   * Delta y = (lambda * L) / d
   */
  public static calculateDoubleSlitFringeSpacing(wavelengthNm: number, slitDistanceMm: number, screenDistanceM: number): number {
    const lambda = wavelengthNm * 1e-9;
    const d = slitDistanceMm * 1e-3;
    const L = screenDistanceM;
    if (d <= 0) return 0;
    return (lambda * L) / d; // In meters
  }

  /**
   * Single-slit first minimum angular half-width:
   * theta_1 = arcsin(lambda / a)
   */
  public static calculateSingleSlitAiryWidth(wavelengthNm: number, slitWidthMm: number, screenDistanceM: number): number {
    const lambda = wavelengthNm * 1e-9;
    const a = slitWidthMm * 1e-3;
    if (a <= 0) return 0;
    const sinTheta = Math.min(1.0, lambda / a);
    return 2.0 * screenDistanceM * Math.tan(Math.asin(sinTheta)); // Full width of central maximum
  }

  /**
   * Multi-spectral dispersion through equilateral 60-degree prism
   */
  public static calculatePrismDispersionRays(
    apexPos: THREE.Vector3,
    prismRotationY: number,
    baseIndex = 1.54,
    incomingPos: THREE.Vector3 = new THREE.Vector3(0, 0, -0.6)
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
    const prismSide = 0.14;
    const inDir = new THREE.Vector3(0, 0, 1);

    for (const spec of spectrumWavelengths) {
      const n = OpticalPhysics.getCauchyIndex(spec.wl, baseIndex, 0.0075);
      const color = OpticalPhysics.wavelengthToColor(spec.wl);

      // Geometry of 60° equilateral prism
      const apexAngle = Math.PI / 3;
      // Angle of incidence with respect to the first prism facet
      const face1Normal = new THREE.Vector3(-Math.sin(prismRotationY + apexAngle * 0.5), 0, Math.cos(prismRotationY + apexAngle * 0.5));
      const r1 = OpticalPhysics.refractRay(inDir, face1Normal, 1.0, n);

      // Path inside prism: length approx ~0.08m
      const pEnter = apexPos.clone().add(new THREE.Vector3(-0.02, 0, -prismSide * 0.25));
      const pExit = pEnter.clone().add(r1.outDirection.clone().multiplyScalar(0.065));

      // Second face normal
      const face2Normal = new THREE.Vector3(Math.sin(prismRotationY - apexAngle * 0.5), 0, Math.cos(prismRotationY - apexAngle * 0.5));
      const r2 = OpticalPhysics.refractRay(r1.outDirection, face2Normal, n, 1.0);

      // Path to screen (approx 0.55m away)
      const pScreen = pExit.clone().add(r2.outDirection.clone().multiplyScalar(0.52));

      rays.push({
        wavelengthNm: spec.wl,
        color,
        refractiveIndex: n,
        deviationAngleRad: inDir.angleTo(r2.outDirection),
        points: [incomingPos.clone(), pEnter, pExit, pScreen],
      });
    }

    return rays;
  }
}
