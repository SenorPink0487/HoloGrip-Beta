import * as THREE from 'three';

export class CarnotMolecularSystem {
  public group: THREE.Group;
  private instancedMesh: THREE.InstancedMesh;
  private readonly particleCount = 260;
  private readonly particleRadius = 0.0028;

  // Particle positions & velocities
  private positions: Float32Array;
  private velocities: Float32Array;
  private matrixArray: Float32Array;
  private scratchColor = new THREE.Color();

  // Cylindrical container boundaries
  private readonly cylinderRadius = 0.048; // Inner radius
  private readonly bottomY = 0.038;        // Floor
  private currentPistonY = 0.100;           // Piston head lower face

  // Thermodynamic parameters
  private currentTempK = 600;
  private targetTempK = 600;
  private lastColorTempK = -999;
  private readonly molarMassKg = 0.028; // Air/N2
  private readonly R_GAS = 8.314;
  private readonly timeScale = 0.00035;

  private disposables: { dispose: () => void }[] = [];

  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'CarnotMolecularSystem';

    this.positions = new Float32Array(this.particleCount * 3);
    this.velocities = new Float32Array(this.particleCount * 3);

    this.build();
    this.initializeParticles();
  }

  private build(): void {
    const sphereGeo = new THREE.SphereGeometry(this.particleRadius, 10, 10);
    const sphereMat = new THREE.MeshStandardMaterial({
      roughness: 0.25,
      metalness: 0.65,
      envMapIntensity: 1.2,
    });
    this.disposables.push(sphereGeo, sphereMat);

    this.instancedMesh = new THREE.InstancedMesh(sphereGeo, sphereMat, this.particleCount);
    this.instancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.matrixArray = this.instancedMesh.instanceMatrix.array as Float32Array;
    this.group.add(this.instancedMesh);
  }

  private sampleGaussian(): number {
    let u = 0, v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  }

  public initializeParticles(): void {
    const sigma = Math.sqrt((this.R_GAS * this.currentTempK) / this.molarMassKg);

    for (let i = 0; i < this.particleCount; i++) {
      const idx = i * 3;
      const mIdx = i * 16;

      const r = Math.sqrt(Math.random()) * (this.cylinderRadius - this.particleRadius);
      const theta = Math.random() * Math.PI * 2;
      this.positions[idx] = Math.cos(theta) * r;
      this.positions[idx + 1] = this.bottomY + Math.random() * Math.max(0.015, this.currentPistonY - this.bottomY);
      this.positions[idx + 2] = Math.sin(theta) * r;

      this.velocities[idx] = this.sampleGaussian() * sigma;
      this.velocities[idx + 1] = this.sampleGaussian() * sigma;
      this.velocities[idx + 2] = this.sampleGaussian() * sigma;

      // Identity matrix with position
      this.matrixArray[mIdx + 0] = 1; this.matrixArray[mIdx + 1] = 0; this.matrixArray[mIdx + 2] = 0; this.matrixArray[mIdx + 3] = 0;
      this.matrixArray[mIdx + 4] = 0; this.matrixArray[mIdx + 5] = 1; this.matrixArray[mIdx + 6] = 0; this.matrixArray[mIdx + 7] = 0;
      this.matrixArray[mIdx + 8] = 0; this.matrixArray[mIdx + 9] = 0; this.matrixArray[mIdx + 10] = 1; this.matrixArray[mIdx + 11] = 0;
      this.matrixArray[mIdx + 12] = this.positions[idx];
      this.matrixArray[mIdx + 13] = this.positions[idx + 1];
      this.matrixArray[mIdx + 14] = this.positions[idx + 2];
      this.matrixArray[mIdx + 15] = 1;
    }

    this.updateColors();
    this.instancedMesh.instanceMatrix.needsUpdate = true;
  }

  public setThermodynamicState(tempK: number, pistonY: number): void {
    this.targetTempK = tempK;
    this.currentPistonY = Math.max(this.bottomY + 0.015, pistonY);

    // Smoothly adjust temperature towards instantaneous cycle temperature
    this.currentTempK += (this.targetTempK - this.currentTempK) * 0.15;
    if (Math.abs(this.currentTempK - this.lastColorTempK) >= 2.0) {
      this.updateColors();
    }
  }

  private updateColors(force = false): void {
    if (!force && Math.abs(this.currentTempK - this.lastColorTempK) < 2.0) return;
    this.lastColorTempK = this.currentTempK;

    // Temperature to color gradient:
    // 200K -> Ice Cyan (#38bdf8)
    // 400K -> Warm Yellow (#facc15)
    // 700K+ -> Glowing Red/Orange (#ef4444)
    const norm = THREE.MathUtils.clamp((this.currentTempK - 200) / 600, 0, 1);

    if (norm < 0.5) {
      const t = norm * 2.0;
      this.scratchColor.setRGB(
        THREE.MathUtils.lerp(0.2, 0.98, t),
        THREE.MathUtils.lerp(0.74, 0.80, t),
        THREE.MathUtils.lerp(0.97, 0.08, t)
      );
    } else {
      const t = (norm - 0.5) * 2.0;
      this.scratchColor.setRGB(
        THREE.MathUtils.lerp(0.98, 0.95, t),
        THREE.MathUtils.lerp(0.80, 0.20, t),
        THREE.MathUtils.lerp(0.08, 0.15, t)
      );
    }

    for (let i = 0; i < this.particleCount; i++) {
      this.instancedMesh.setColorAt(i, this.scratchColor);
    }
    if (this.instancedMesh.instanceColor) {
      this.instancedMesh.instanceColor.needsUpdate = true;
    }
  }

  public update(delta: number): void {
    if (!this.group.visible) return;

    const dt = Math.min(delta, 0.033) * this.timeScale;
    const targetSigma = Math.sqrt((this.R_GAS * this.currentTempK) / this.molarMassKg);
    const speedAdjust = 1.0 + (targetSigma / 500 - 1.0) * 0.05;

    const rMax = this.cylinderRadius - this.particleRadius;
    const yMin = this.bottomY + this.particleRadius;
    const yMax = this.currentPistonY - this.particleRadius;

    for (let i = 0; i < this.particleCount; i++) {
      const idx = i * 3;
      const mIdx = i * 16;

      let vx = this.velocities[idx] * speedAdjust;
      let vy = this.velocities[idx + 1] * speedAdjust;
      let vz = this.velocities[idx + 2] * speedAdjust;

      let px = this.positions[idx] + vx * dt;
      let py = this.positions[idx + 1] + vy * dt;
      let pz = this.positions[idx + 2] + vz * dt;

      // Bottom wall collision
      if (py < yMin) {
        py = yMin;
        vy = Math.abs(vy);
      }
      // Top moving piston collision
      if (py > yMax) {
        py = yMax;
        vy = -Math.abs(vy);
      }
      // Radial cylindrical wall collision
      const rSq = px * px + pz * pz;
      if (rSq > rMax * rMax) {
        const r = Math.sqrt(rSq);
        const nx = px / r;
        const nz = pz / r;
        const dot = vx * nx + vz * nz;
        vx -= 2 * dot * nx;
        vz -= 2 * dot * nz;
        px = nx * rMax;
        pz = nz * rMax;
      }

      this.positions[idx] = px;
      this.positions[idx + 1] = py;
      this.positions[idx + 2] = pz;
      this.velocities[idx] = vx;
      this.velocities[idx + 1] = vy;
      this.velocities[idx + 2] = vz;

      this.matrixArray[mIdx + 12] = px;
      this.matrixArray[mIdx + 13] = py;
      this.matrixArray[mIdx + 14] = pz;
    }

    this.instancedMesh.instanceMatrix.needsUpdate = true;
  }

  public setVisible(show: boolean): void {
    this.group.visible = show;
  }

  public dispose(): void {
    this.disposables.forEach((d) => d.dispose());
    this.disposables = [];
  }
}
