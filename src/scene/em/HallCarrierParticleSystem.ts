import * as THREE from 'three';

export interface HallCarrierOptions {
  waferLength?: number;   // Along X
  waferThickness?: number; // Along Y
  waferWidth?: number;     // Along Z
  particleCount?: number;
}

export type CarrierType = 'electron' | 'hole' | 'metal';

export class HallCarrierParticleSystem {
  public group: THREE.Group;
  private instancedMesh: THREE.InstancedMesh;
  private readonly particleCount: number;

  // Wafer physical dimensions in local space
  public readonly waferLength: number;
  public readonly waferThickness: number;
  public readonly waferWidth: number;

  // Particle positions & velocities
  private positions: Float32Array;
  private velocities: Float32Array;
  private baseOffsetsZ: Float32Array; // Equilibrium transverse offsets
  private matrixArray: Float32Array;
  private dummyObj = new THREE.Object3D();

  // Glow meshes for the two transverse edges (+Z front edge, -Z back edge)
  private frontGlowMesh: THREE.Mesh;
  private backGlowMesh: THREE.Mesh;
  private frontGlowMat: THREE.MeshBasicMaterial;
  private backGlowMat: THREE.MeshBasicMaterial;

  // Vector helper group
  private vectorGroup: THREE.Group;
  private arrowVelocity: THREE.ArrowHelper;
  private arrowMagField: THREE.ArrowHelper;
  private arrowLorentz: THREE.ArrowHelper;
  private arrowHallField: THREE.ArrowHelper;

  // Carrier state
  private carrierType: CarrierType = 'electron';
  private currentDirection = 1; // +1 = conventional current towards +X, -1 = towards -X
  private magFieldStrength = 0.5; // Tesla (-1.5 to +1.5)
  private currentMa = 10.0; // mA
  private hallVoltageMv = -25.0; // mV
  private showVectors = true;
  private showParticles = true;

  private sphereMat: THREE.MeshStandardMaterial;
  private disposables: { dispose: () => void }[] = [];

  constructor(options: HallCarrierOptions = {}) {
    this.waferLength = options.waferLength ?? 0.12;
    this.waferThickness = options.waferThickness ?? 0.024;
    this.waferWidth = options.waferWidth ?? 0.064;
    this.particleCount = options.particleCount ?? 320;

    this.group = new THREE.Group();
    this.group.name = 'HallCarrierParticleSystem';

    this.positions = new Float32Array(this.particleCount * 3);
    this.velocities = new Float32Array(this.particleCount * 3);
    this.baseOffsetsZ = new Float32Array(this.particleCount);

    this.build();
    this.initParticles();
  }

  private build(): void {
    // 1. Instanced sphere for carrier particles
    const sphereGeo = new THREE.SphereGeometry(0.0016, 8, 8);
    this.sphereMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x0284c7,
      emissiveIntensity: 0.85,
      roughness: 0.2,
      metalness: 0.7,
    });
    this.disposables.push(sphereGeo, this.sphereMat);

    this.instancedMesh = new THREE.InstancedMesh(sphereGeo, this.sphereMat, this.particleCount);
    this.instancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.matrixArray = this.instancedMesh.instanceMatrix.array as Float32Array;
    this.group.add(this.instancedMesh);

    // 2. Transverse side glow strips on +Z and -Z faces to show accumulated potential
    const glowGeo = new THREE.PlaneGeometry(this.waferLength * 0.98, this.waferThickness * 0.9);
    this.disposables.push(glowGeo);

    this.frontGlowMat = new THREE.MeshBasicMaterial({
      color: 0x3b82f6,
      transparent: true,
      opacity: 0.35,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.backGlowMat = new THREE.MeshBasicMaterial({
      color: 0xef4444,
      transparent: true,
      opacity: 0.35,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.disposables.push(this.frontGlowMat, this.backGlowMat);

    this.frontGlowMesh = new THREE.Mesh(glowGeo, this.frontGlowMat);
    this.frontGlowMesh.position.set(0, 0, this.waferWidth / 2 + 0.0006);
    this.group.add(this.frontGlowMesh);

    this.backGlowMesh = new THREE.Mesh(glowGeo, this.backGlowMat);
    this.backGlowMesh.position.set(0, 0, -this.waferWidth / 2 - 0.0006);
    this.group.add(this.backGlowMesh);

    // 3. 3D Vector indicators
    this.vectorGroup = new THREE.Group();
    this.vectorGroup.name = 'HallVectorIndicators';
    this.group.add(this.vectorGroup);

    // Velocity vector v (Yellow)
    this.arrowVelocity = new THREE.ArrowHelper(
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(0, this.waferThickness / 2 + 0.015, 0),
      0.035,
      0xfacc15,
      0.010,
      0.006
    );

    // Magnetic Field B (Cyan - Vertical)
    this.arrowMagField = new THREE.ArrowHelper(
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(0, -this.waferThickness / 2 - 0.015, 0),
      0.045,
      0x06b6d4,
      0.012,
      0.007
    );

    // Lorentz force F_L (Emerald Green - Transverse)
    this.arrowLorentz = new THREE.ArrowHelper(
      new THREE.Vector3(0, 0, 1),
      new THREE.Vector3(0, this.waferThickness / 2 + 0.015, 0),
      0.032,
      0x10b981,
      0.010,
      0.006
    );

    // Hall electric field E_H (Neon Pink - Transverse opposite)
    this.arrowHallField = new THREE.ArrowHelper(
      new THREE.Vector3(0, 0, -1),
      new THREE.Vector3(0, this.waferThickness / 2 + 0.024, 0),
      0.032,
      0xec4899,
      0.010,
      0.006
    );

    this.vectorGroup.add(this.arrowVelocity);
    this.vectorGroup.add(this.arrowMagField);
    this.vectorGroup.add(this.arrowLorentz);
    this.vectorGroup.add(this.arrowHallField);
  }

  public initParticles(): void {
    const halfL = this.waferLength * 0.46;
    const halfT = this.waferThickness * 0.38;
    const halfW = this.waferWidth * 0.42;

    for (let i = 0; i < this.particleCount; i++) {
      const idx = i * 3;
      this.positions[idx + 0] = (Math.random() * 2 - 1) * halfL;
      this.positions[idx + 1] = (Math.random() * 2 - 1) * halfT;
      this.positions[idx + 2] = (Math.random() * 2 - 1) * halfW;

      // Base equilibrium transverse coordinate
      this.baseOffsetsZ[i] = this.positions[idx + 2];

      // Random jitter velocity
      this.velocities[idx + 0] = 0;
      this.velocities[idx + 1] = (Math.random() - 0.5) * 0.002;
      this.velocities[idx + 2] = (Math.random() - 0.5) * 0.002;

      this.dummyObj.position.set(this.positions[idx], this.positions[idx + 1], this.positions[idx + 2]);
      this.dummyObj.scale.set(1, 1, 1);
      this.dummyObj.updateMatrix();
      this.instancedMesh.setMatrixAt(i, this.dummyObj.matrix);
    }
    this.instancedMesh.instanceMatrix.needsUpdate = true;
  }

  public setCarrierType(type: CarrierType): void {
    this.carrierType = type;
    if (type === 'electron') {
      // Fluorescent cyan-blue
      this.sphereMat.color.setHex(0x38bdf8);
      this.sphereMat.emissive.setHex(0x0284c7);
      this.sphereMat.emissiveIntensity = 0.85;
    } else if (type === 'hole') {
      // Radiant amber-orange
      this.sphereMat.color.setHex(0xfb923c);
      this.sphereMat.emissive.setHex(0xea580c);
      this.sphereMat.emissiveIntensity = 0.95;
    } else {
      // High-density metallic gold/silver
      this.sphereMat.color.setHex(0xf59e0b);
      this.sphereMat.emissive.setHex(0xb45309);
      this.sphereMat.emissiveIntensity = 0.55;
    }
    this.sphereMat.needsUpdate = true;
  }

  public setPhysicsState(
    currentMa: number,
    magFieldTesla: number,
    hallVoltageMv: number,
    carrierType: CarrierType
  ): void {
    this.currentMa = currentMa;
    this.magFieldStrength = magFieldTesla;
    this.hallVoltageMv = hallVoltageMv;
    this.carrierType = carrierType;
    this.currentDirection = currentMa >= 0 ? 1 : -1;

    // Update Side Potential Glow Strips
    // Front face is at +Z. If hallVoltageMv > 0, +Z is higher potential (red/orange)
    // If hallVoltageMv < 0, +Z is lower potential (blue/cyan)
    const absVolt = Math.abs(hallVoltageMv);
    const glowIntensity = Math.min(1.0, 0.15 + (absVolt / 60.0) * 0.7);

    if (absVolt < 0.001) {
      this.frontGlowMat.opacity = 0.05;
      this.backGlowMat.opacity = 0.05;
    } else if (hallVoltageMv > 0) {
      // +Z is Positive, -Z is Negative
      this.frontGlowMat.color.setHex(0xef4444); // Red (+)
      this.backGlowMat.color.setHex(0x3b82f6);  // Blue (-)
      this.frontGlowMat.opacity = glowIntensity;
      this.backGlowMat.opacity = glowIntensity;
    } else {
      // +Z is Negative, -Z is Positive
      this.frontGlowMat.color.setHex(0x3b82f6); // Blue (-)
      this.backGlowMat.color.setHex(0xef4444);  // Red (+)
      this.frontGlowMat.opacity = glowIntensity;
      this.backGlowMat.opacity = glowIntensity;
    }

    this.updateVectorArrows();
  }

  private updateVectorArrows(): void {
    if (!this.showVectors) {
      this.vectorGroup.visible = false;
      return;
    }
    this.vectorGroup.visible = true;

    // 1. Drift Velocity v
    // Electrons move opposite to conventional current; holes move along current
    const vDirX = this.carrierType === 'electron'
      ? (this.currentMa >= 0 ? -1 : 1)
      : (this.currentMa >= 0 ? 1 : -1);

    const speedNorm = Math.min(1.0, Math.abs(this.currentMa) / 20.0);
    const vLen = 0.015 + speedNorm * 0.035;
    this.arrowVelocity.setDirection(new THREE.Vector3(vDirX, 0, 0));
    this.arrowVelocity.setLength(vLen, vLen * 0.3, vLen * 0.2);
    this.arrowVelocity.visible = Math.abs(this.currentMa) > 0.1;

    // 2. Magnetic Field B (Vertical)
    const bDirY = this.magFieldStrength >= 0 ? 1 : -1;
    const bNorm = Math.min(1.0, Math.abs(this.magFieldStrength) / 1.5);
    const bLen = 0.018 + bNorm * 0.04;
    this.arrowMagField.setDirection(new THREE.Vector3(0, bDirY, 0));
    this.arrowMagField.setLength(bLen, bLen * 0.28, bLen * 0.18);
    this.arrowMagField.visible = Math.abs(this.magFieldStrength) > 0.02;

    // 3. Lorentz Force F_L = q(v x B)
    // v x B = (vDirX * i) x (bDirY * j) = (vDirX * bDirY) * k (along Z)
    // For electrons: q < 0 => F_L is along - (vDirX * bDirY) * k
    // If current > 0 (vDirX = -1) and B > 0 (bDirY = 1):
    // (-1) * (1) = -1. (-e) * (-1) = +e (deflects towards +Z)!
    let flDirZ = 1;
    if (this.carrierType === 'electron') {
      flDirZ = -(vDirX * bDirY);
    } else {
      flDirZ = (vDirX * bDirY);
    }

    const flNorm = speedNorm * bNorm;
    const flLen = 0.015 + flNorm * 0.035;
    this.arrowLorentz.setDirection(new THREE.Vector3(0, 0, flDirZ));
    this.arrowLorentz.setLength(flLen, flLen * 0.3, flLen * 0.2);
    this.arrowLorentz.visible = flNorm > 0.01;

    // 4. Hall Electric Field E_H points from positive side to negative side
    // In equilibrium, q E_H balances F_L, so E_H points opposite to F_L for q > 0, same for q < 0
    // Direction is opposite to Lorentz deflection accumulation
    const ehDirZ = this.hallVoltageMv >= 0 ? -1 : 1;
    const ehNorm = Math.min(1.0, Math.abs(this.hallVoltageMv) / 50.0);
    const ehLen = 0.015 + ehNorm * 0.035;
    this.arrowHallField.setDirection(new THREE.Vector3(0, 0, ehDirZ));
    this.arrowHallField.setLength(ehLen, ehLen * 0.3, ehLen * 0.2);
    this.arrowHallField.visible = ehNorm > 0.01;
  }

  public update(delta: number): void {
    if (!this.showParticles) {
      this.instancedMesh.visible = false;
      return;
    }
    this.instancedMesh.visible = true;

    const halfL = this.waferLength * 0.46;
    const halfT = this.waferThickness * 0.38;
    const halfW = this.waferWidth * 0.42;

    // Compute drift velocity for visualization
    const dirX = this.carrierType === 'electron'
      ? (this.currentMa >= 0 ? -1 : 1)
      : (this.currentMa >= 0 ? 1 : -1);

    const baseDriftSpeed = (this.currentMa / 20.0) * 0.045 * dirX;
    const metalScale = this.carrierType === 'metal' ? 0.3 : 1.0;
    const driftStep = baseDriftSpeed * delta * metalScale;

    // Transverse deflection offset from Lorentz force
    const bFactor = this.magFieldStrength;
    const iFactor = this.currentMa / 20.0;
    // Normalized deflection bias (-1 to +1)
    let deflBias = 0;
    if (this.carrierType === 'electron') {
      deflBias = (iFactor * bFactor) * 0.45;
    } else {
      deflBias = (iFactor * bFactor) * 0.45;
    }

    const maxDeflZ = halfW * 0.65;
    const targetDeflZ = THREE.MathUtils.clamp(deflBias * maxDeflZ, -maxDeflZ, maxDeflZ);

    for (let i = 0; i < this.particleCount; i++) {
      const idx = i * 3;

      // 1. Longitudinal drift
      this.positions[idx + 0] += driftStep;

      // Wrap around longitudinal boundaries
      if (this.positions[idx + 0] > halfL) {
        this.positions[idx + 0] = -halfL + (this.positions[idx + 0] - halfL);
      } else if (this.positions[idx + 0] < -halfL) {
        this.positions[idx + 0] = halfL + (this.positions[idx + 0] + halfL);
      }

      // 2. Transverse Lorentz deflection towards accumulated side
      const currentZ = this.positions[idx + 2];
      const baseZ = this.baseOffsetsZ[i];
      // Slight smooth pull towards deflection side for carriers near edge
      const pull = targetDeflZ * 0.55;
      const targetZ = THREE.MathUtils.clamp(baseZ + pull, -halfW, halfW);
      this.positions[idx + 2] += (targetZ - currentZ) * Math.min(1.0, delta * 3.5);

      // 3. Jitter in Y for thermal motion
      this.positions[idx + 1] += (Math.random() - 0.5) * 0.00015;
      this.positions[idx + 1] = THREE.MathUtils.clamp(this.positions[idx + 1], -halfT, halfT);

      // Update instance matrix
      this.dummyObj.position.set(
        this.positions[idx + 0],
        this.positions[idx + 1],
        this.positions[idx + 2]
      );
      this.dummyObj.updateMatrix();
      this.instancedMesh.setMatrixAt(i, this.dummyObj.matrix);
    }

    this.instancedMesh.instanceMatrix.needsUpdate = true;
  }

  public setToggles(showVectors: boolean, showParticles: boolean): void {
    this.showVectors = showVectors;
    this.showParticles = showParticles;
    this.vectorGroup.visible = showVectors;
    this.instancedMesh.visible = showParticles;
  }

  public dispose(): void {
    for (const d of this.disposables) {
      d.dispose();
    }
    this.disposables.length = 0;
  }
}
