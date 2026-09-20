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
    } else if (w >= 580 && w < 620) {
      r = 1.0;
      g = -(w - 620) / (620 - 580);
      b = 0.0;
    } else if (w >= 620 && w <= 750) {
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

    // Rotated apex A and base corners B, C in XZ plane relative to apexPos
    // Local: A = (0, -h*0.5), B = (-side*0.5, h*0.5), C = (side*0.5, h*0.5)
    const Ax = apexPos.x + (-h * 0.5) * sinT;
    const Az = apexPos.z + (-h * 0.5) * cosT;
    const Bx = apexPos.x + (-side * 0.5) * cosT + (h * 0.5) * sinT;
    const Bz = apexPos.z - (-side * 0.5) * sinT + (h * 0.5) * cosT;

    // Face 1 (AB) outward normal pointing into air
    const N1 = new THREE.Vector3(
      -0.866025 * cosT - 0.5 * sinT,
      0,
      0.866025 * sinT - 0.5 * cosT
    ).normalize();

    // Face 2 (AC) outward normal pointing into air
    const N2 = new THREE.Vector3(
      0.866025 * cosT - 0.5 * sinT,
      0,
      -0.866025 * sinT - 0.5 * cosT
    ).normalize();

    // Ray incident point on Face 1 (AB)
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
      // Enhanced visual dispersion coefficient (0.016) for crisp, clear spectral separation
      const n = OpticalPhysics.getCauchyIndex(spec.wl, baseIndex, 0.016);
      const color = OpticalPhysics.wavelengthToColor(spec.wl);

      // 1. Refract into glass at Face 1
      const r1 = OpticalPhysics.refractRay(inDir, N1, 1.0, n);
      const dirInside = r1.outDirection;

      // 2. Intersect Face 2 plane (passing through A with normal N2)
      const denom = dirInside.dot(N2);
      const tExit = Math.abs(denom) > 1e-5
        ? (new THREE.Vector3(Ax - pEnter.x, 0, Az - pEnter.z).dot(N2)) / denom
        : 0.045;

      const pExit = pEnter.clone().add(dirInside.clone().multiplyScalar(Math.max(0.01, tExit)));
      pExit.y = apexPos.y;

      // 3. Refract out of glass into air at Face 2
      const r2 = OpticalPhysics.refractRay(dirInside, N2, n, 1.0);
      const dirOut = r2.totalInternalReflection ? dirInside : r2.outDirection;

      // 4. Intersect Detector Screen at screenZ
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
