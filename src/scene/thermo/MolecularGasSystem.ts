import * as THREE from 'three';

export interface VelocityHistogramData {
  bins: number[];
  binWidth: number;
  maxSpeed: number;
  vRmsTheoretical: number;
  vMostProbable: number;
  vMeanTheoretical: number;
}

export class MolecularGasSystem {
  public group: THREE.Group;
  private instancedMesh: THREE.InstancedMesh;
  private readonly particleCount = 400;
  private readonly particleRadius = 0.0036;

  // Particle simulation state
  private positions: Float32Array;
  private velocities: Float32Array;
  private speeds: Float32Array;
  private matrixArray: Float32Array;
  private scratchColor = new THREE.Color();

  // Cylindrical container dimensions
  private readonly cylinderRadius = 0.076; // Inner boundary radius
  private readonly bottomY = 0.023;        // Cylinder bottom plate top face
  private currentPistonY = 0.15;            // Dynamic piston bottom face

  // Thermal physics parameters
  private currentTempK = 300;
  private currentMolarMassKg = 0.028; // N2 = 0.028 kg/mol
  private readonly R_GAS = 8.314;     // Universal gas constant J/(mol·K)

  // Simulation time-step scaling factor
  private readonly timeScale = 0.00045;

  private disposables: { dispose: () => void }[] = [];

  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'MolecularGasSystem';

    this.positions = new Float32Array(this.particleCount * 3);
    this.velocities = new Float32Array(this.particleCount * 3);
    this.speeds = new Float32Array(this.particleCount);

    this.build();
    this.initializeParticles();
  }

  private build(): void {
    const sphereGeo = new THREE.SphereGeometry(this.particleRadius, 12, 12);
    const sphereMat = new THREE.MeshStandardMaterial({
      roughness: 0.2,
      metalness: 0.6,
      envMapIntensity: 1.0,
    });
    this.disposables.push(sphereGeo, sphereMat);

    this.instancedMesh = new THREE.InstancedMesh(sphereGeo, sphereMat, this.particleCount);
    this.instancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    if (this.instancedMesh.instanceColor) {
      this.instancedMesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    }
    this.group.add(this.instancedMesh);
  }

  /**
   * Samples 3D Gaussian velocity distribution for each molecular axis,
   * yielding an exact physical Maxwell-Boltzmann speed distribution.
   */
  private sampleGaussian(): number {
    let u = 0, v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  }

  public initializeParticles(): void {
    const sigma = Math.sqrt((this.R_GAS * this.currentTempK) / this.currentMolarMassKg);
    this.matrixArray = this.instancedMesh.instanceMatrix.array as Float32Array;

    for (let i = 0; i < this.particleCount; i++) {
      const idx = i * 3;
      const mIdx = i * 16;

      // 1. Uniform random position inside cylinder
      const r = Math.sqrt(Math.random()) * (this.cylinderRadius - this.particleRadius);
      const theta = Math.random() * Math.PI * 2;
      this.positions[idx] = Math.cos(theta) * r;
      this.positions[idx + 1] = this.bottomY + Math.random() * (this.currentPistonY - this.bottomY);
      this.positions[idx + 2] = Math.sin(theta) * r;

      // 2. Maxwellian 3D velocity components
      const vx = this.sampleGaussian() * sigma;
      const vy = this.sampleGaussian() * sigma;
      const vz = this.sampleGaussian() * sigma;

      this.velocities[idx] = vx;
      this.velocities[idx + 1] = vy;
      this.velocities[idx + 2] = vz;

      const speed = Math.sqrt(vx * vx + vy * vy + vz * vz);
      this.speeds[i] = speed;

      // Identity 4x4 matrix with translation
      this.matrixArray[mIdx + 0] = 1;
      this.matrixArray[mIdx + 5] = 1;
      this.matrixArray[mIdx + 10] = 1;
      this.matrixArray[mIdx + 15] = 1;
      this.matrixArray[mIdx + 12] = this.positions[idx];
      this.matrixArray[mIdx + 13] = this.positions[idx + 1];
      this.matrixArray[mIdx + 14] = this.positions[idx + 2];
    }

    this.updateColors();
    this.instancedMesh.instanceMatrix.needsUpdate = true;
  }

  /**
   * Rescales existing velocities smoothly when temperature or gas molecular mass changes,
   * maintaining Maxwell-Boltzmann thermodynamic equilibrium.
   */
  public updateThermodynamicState(tempK: number, molarMassKg: number, pistonY: number): void {
    const oldSigma = Math.sqrt((this.R_GAS * this.currentTempK) / this.currentMolarMassKg);
    this.currentTempK = Math.max(100, Math.min(800, tempK));
    this.currentMolarMassKg = Math.max(0.004, molarMassKg);
    this.currentPistonY = pistonY;

    const newSigma = Math.sqrt((this.R_GAS * this.currentTempK) / this.currentMolarMassKg);
    const ratio = newSigma / oldSigma;

    for (let i = 0; i < this.particleCount; i++) {
      const idx = i * 3;
      this.velocities[idx] *= ratio;
      this.velocities[idx + 1] *= ratio;
      this.velocities[idx + 2] *= ratio;
      this.speeds[i] = Math.hypot(this.velocities[idx], this.velocities[idx + 1], this.velocities[idx + 2]);
    }
    this.updateColors();
  }

  public update(delta: number, pistonY: number): void {
    this.currentPistonY = pistonY;
    const dt = Math.min(0.033, delta) * this.timeScale;
    const rBoundary = this.cylinderRadius - this.particleRadius;
    const yTop = this.currentPistonY - this.particleRadius;
    const yBottom = this.bottomY + this.particleRadius;
    const mArr = this.matrixArray;

    for (let i = 0; i < this.particleCount; i++) {
      const idx = i * 3;
      const mIdx = i * 16;

      let x = this.positions[idx] + this.velocities[idx] * dt;
      let y = this.positions[idx + 1] + this.velocities[idx + 1] * dt;
      let z = this.positions[idx + 2] + this.velocities[idx + 2] * dt;

      // 1. Cylindrical radial boundary reflection
      const r = Math.hypot(x, z);
      if (r > rBoundary) {
        const nx = x / r;
        const nz = z / r;
        const vDotN = this.velocities[idx] * nx + this.velocities[idx + 2] * nz;
        if (vDotN > 0) {
          this.velocities[idx] -= 2 * vDotN * nx;
          this.velocities[idx + 2] -= 2 * vDotN * nz;
        }
        x = nx * rBoundary;
        z = nz * rBoundary;
      }

      // 2. Top piston face collision
      if (y > yTop) {
        y = yTop;
        if (this.velocities[idx + 1] > 0) {
          this.velocities[idx + 1] = -this.velocities[idx + 1];
        }
      }

      // 3. Bottom plate collision
      if (y < yBottom) {
        y = yBottom;
        if (this.velocities[idx + 1] < 0) {
          this.velocities[idx + 1] = -this.velocities[idx + 1];
        }
      }

      this.positions[idx] = x;
      this.positions[idx + 1] = y;
      this.positions[idx + 2] = z;

      mArr[mIdx + 12] = x;
      mArr[mIdx + 13] = y;
      mArr[mIdx + 14] = z;
    }

    this.instancedMesh.instanceMatrix.needsUpdate = true;
  }

  private updateColors(): void {
    // Color mapping by speed ratio v / v_rms:
    // v < 0.6 v_rms: deep cyan / ice blue
    // 0.6 <= v < 1.2 v_rms: emerald green / lime
    // 1.2 <= v < 1.8 v_rms: amber yellow / orange
    // v >= 1.8 v_rms: hot crimson red
    const vRms = Math.sqrt((3 * this.R_GAS * this.currentTempK) / this.currentMolarMassKg);

    for (let i = 0; i < this.particleCount; i++) {
      const ratio = this.speeds[i] / (vRms || 1);
      if (ratio < 0.6) {
        this.scratchColor.setRGB(0.0, 0.75, 1.0); // Cyan
      } else if (ratio < 1.1) {
        this.scratchColor.setRGB(0.2, 0.88, 0.4); // Green
      } else if (ratio < 1.6) {
        this.scratchColor.setRGB(1.0, 0.72, 0.0); // Gold
      } else {
        this.scratchColor.setRGB(1.0, 0.22, 0.2); // Hot red
      }
      this.instancedMesh.setColorAt(i, this.scratchColor);
    }
    if (this.instancedMesh.instanceColor) {
      this.instancedMesh.instanceColor.needsUpdate = true;
    }
  }

  /**
   * Generates dynamic velocity distribution histogram data along with theoretical
   * Maxwell-Boltzmann curve values for the floating analytics board.
   */
  public getHistogramData(binCount = 20): VelocityHistogramData {
    const vRms = Math.sqrt((3 * this.R_GAS * this.currentTempK) / this.currentMolarMassKg);
    const vMostProbable = Math.sqrt((2 * this.R_GAS * this.currentTempK) / this.currentMolarMassKg);
    const vMean = Math.sqrt((8 * this.R_GAS * this.currentTempK) / (Math.PI * this.currentMolarMassKg));

    const maxSpeed = vRms * 2.8;
    const binWidth = maxSpeed / binCount;
    const invBinWidth = binWidth > 0 ? 1.0 / binWidth : 0;
    const bins = new Array<number>(binCount).fill(0);
    const speeds = this.speeds;
    const count = this.particleCount;

    for (let i = 0; i < count; i++) {
      const b = (speeds[i] * invBinWidth) | 0;
      if (b >= 0 && b < binCount) {
        bins[b]++;
      }
    }

    return {
      bins,
      binWidth,
      maxSpeed,
      vRmsTheoretical: vRms,
      vMostProbable,
      vMeanTheoretical: vMean,
    };
  }

  public dispose(): void {
    for (const item of this.disposables) {
      item.dispose();
    }
    this.disposables = [];
  }
}
