import * as THREE from 'three';
import { OpticalPhysics, type DispersionRay } from './OpticalPhysics.ts';

export class OpticalBeamSystem {
  public readonly group = new THREE.Group();

  private coreBeamMesh: THREE.Mesh;
  private glowBeamMesh: THREE.Mesh;
  private coreBeamMat: THREE.MeshBasicMaterial;
  private glowBeamMat: THREE.MeshBasicMaterial;

  private dispersionGroup = new THREE.Group();
  private waveVectorGroup = new THREE.Group();
  private waveFrontsGroup = new THREE.Group();

  public wavelengthNm = 632.8;
  public intensity = 1.0;

  constructor(wavelength = 632.8) {
    this.wavelengthNm = wavelength;
    this.group.name = 'OpticalBeamSystem';
    this.initStraightBeam();
    this.group.add(this.dispersionGroup);
    this.group.add(this.waveVectorGroup);
    this.group.add(this.waveFrontsGroup);
    this.updateWavelength(wavelength);
  }

  private initStraightBeam(): void {
    // 1. High brightness central core laser beam
    const coreGeo = new THREE.CylinderGeometry(0.0018, 0.0018, 1.0, 16);
    this.coreBeamMat = new THREE.MeshBasicMaterial({
      color: 0xff3b30,
      transparent: true,
      opacity: 0.95,
    });
    this.coreBeamMesh = new THREE.Mesh(coreGeo, this.coreBeamMat);
    this.coreBeamMesh.rotation.x = Math.PI * 0.5;
    this.group.add(this.coreBeamMesh);

    // 2. Volumetric scattering glow shroud
    const glowGeo = new THREE.CylinderGeometry(0.0065, 0.0065, 1.0, 16);
    this.glowBeamMat = new THREE.MeshBasicMaterial({
      color: 0xff3b30,
      transparent: true,
      opacity: 0.35,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.glowBeamMesh = new THREE.Mesh(glowGeo, this.glowBeamMat);
    this.glowBeamMesh.rotation.x = Math.PI * 0.5;
    this.group.add(this.glowBeamMesh);
  }

  public updateStraightBeam(start: THREE.Vector3, end: THREE.Vector3): void {
    const dir = new THREE.Vector3().subVectors(end, start);
    const len = dir.length();
    if (len < 1e-4) return;

    const mid = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);

    this.coreBeamMesh.position.copy(mid);
    this.coreBeamMesh.scale.set(1, len, 1);
    this.coreBeamMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());

    this.glowBeamMesh.position.copy(mid);
    this.glowBeamMesh.scale.set(1, len, 1);
    this.glowBeamMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());

    this.coreBeamMesh.visible = this.intensity > 0.001;
    this.glowBeamMesh.visible = this.intensity > 0.001;
  }

  public updateWavelength(wavelengthNm: number): void {
    this.wavelengthNm = wavelengthNm;
    const color = OpticalPhysics.wavelengthToColor(wavelengthNm);
    this.coreBeamMat.color.copy(color);
    this.glowBeamMat.color.copy(color);
  }

  public setIntensity(intensity: number): void {
    this.intensity = Math.max(0, Math.min(1, intensity));
    this.coreBeamMat.opacity = this.intensity * 0.95;
    this.glowBeamMat.opacity = this.intensity * 0.42;
    this.coreBeamMesh.visible = this.intensity > 0.001;
    this.glowBeamMesh.visible = this.intensity > 0.001;
  }

  /**
   * Render multi-spectral rainbow dispersion beams through prism
   */
  public updateDispersionRays(rays: DispersionRay[]): void {
    // Clear previous dispersion meshes
    while (this.dispersionGroup.children.length > 0) {
      const child = this.dispersionGroup.children[0] as THREE.Mesh;
      this.dispersionGroup.remove(child);
      if (child.geometry) child.geometry.dispose();
      if (child.material) (child.material as THREE.Material).dispose();
    }

    // Hide straight beam when dispersion is active
    this.coreBeamMesh.visible = false;
    this.glowBeamMesh.visible = false;

    for (const ray of rays) {
      if (ray.points.length < 2) continue;

      const curve = new THREE.CatmullRomCurve3(ray.points, false, 'catmullrom', 0.1);
      const tubeGeo = new THREE.TubeGeometry(curve, 24, 0.0022, 8, false);

      const tubeMat = new THREE.MeshBasicMaterial({
        color: ray.color,
        transparent: true,
        opacity: 0.85,
        blending: THREE.AdditiveBlending,
      });

      const tubeMesh = new THREE.Mesh(tubeGeo, tubeMat);
      this.dispersionGroup.add(tubeMesh);
    }
  }

  public clearDispersionRays(): void {
    while (this.dispersionGroup.children.length > 0) {
      const child = this.dispersionGroup.children[0] as THREE.Mesh;
      this.dispersionGroup.remove(child);
      if (child.geometry) child.geometry.dispose();
      if (child.material) (child.material as THREE.Material).dispose();
    }
    this.coreBeamMesh.visible = true;
    this.glowBeamMesh.visible = true;
  }

  /**
   * Build 3D spatial oscillating Electric Field vector waves (矢量偏振波列)
   */
  public updatePolarizationWave(params: {
    startZ: number;
    endZ: number;
    polarizerZ?: number;
    polarizerAngleDeg?: number;
    analyzerZ?: number;
    analyzerAngleDeg?: number;
    hasQuarterWavePlate?: boolean;
    time: number;
  }): void {
    while (this.waveVectorGroup.children.length > 0) {
      const child = this.waveVectorGroup.children[0] as THREE.Mesh;
      this.waveVectorGroup.remove(child);
      if (child.geometry) child.geometry.dispose();
      if (child.material) (child.material as THREE.Material).dispose();
    }

    const { startZ, endZ, polarizerZ = -0.15, polarizerAngleDeg = 0, analyzerZ = 0.25, analyzerAngleDeg = 90, hasQuarterWavePlate = false, time } = params;

    const numSamples = 60;
    const dz = (endZ - startZ) / numSamples;
    const k = (2 * Math.PI) / 0.14; // Spatial wavelength in 3D scene ~ 14cm
    const omega = 4.0;
    const beamY = 0.186; // Optical axis height

    const polAngleRad = THREE.MathUtils.degToRad(polarizerAngleDeg);
    const anaAngleRad = THREE.MathUtils.degToRad(analyzerAngleDeg);

    const positions: number[] = [];
    const colors: number[] = [];
    const baseColor = OpticalPhysics.wavelengthToColor(this.wavelengthNm);

    for (let i = 0; i <= numSamples; i++) {
      const z = startZ + i * dz;
      const phase = k * z - omega * time;

      let ampX = 0;
      let ampY = 0;
      let ampMag = 0.024; // 24mm amplitude

      if (z < polarizerZ) {
        // Unpolarized / initial laser: linear 45° or vertical
        ampX = ampMag * Math.cos(polAngleRad) * Math.cos(phase);
        ampY = ampMag * Math.sin(polAngleRad) * Math.cos(phase);
      } else if (z >= polarizerZ && z < analyzerZ) {
        // Linearly polarized light along polarizer axis
        if (hasQuarterWavePlate) {
          // Circular / elliptical polarization after quarter wave plate!
          ampX = ampMag * Math.cos(polAngleRad) * Math.cos(phase);
          ampY = ampMag * Math.sin(polAngleRad) * Math.sin(phase);
        } else {
          ampX = ampMag * Math.cos(polAngleRad) * Math.cos(phase);
          ampY = ampMag * Math.sin(polAngleRad) * Math.cos(phase);
        }
      } else {
        // After analyzer: Malus law attenuation
        const deltaAngle = anaAngleRad - polAngleRad;
        const malusFactor = Math.cos(deltaAngle);
        const transAmp = ampMag * malusFactor;

        ampX = transAmp * Math.cos(anaAngleRad) * Math.cos(phase);
        ampY = transAmp * Math.sin(anaAngleRad) * Math.cos(phase);
      }

      // Origin on beam axis
      positions.push(0, beamY, z);
      // Vector tip
      positions.push(ampX, beamY + ampY, z);

      colors.push(baseColor.r * 0.4, baseColor.g * 0.4, baseColor.b * 0.4);
      colors.push(baseColor.r, baseColor.g, baseColor.b);
    }

    const lineGeo = new THREE.BufferGeometry();
    lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    lineGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

    const lineMat = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.88,
      blending: THREE.AdditiveBlending,
    });

    const lines = new THREE.LineSegments(lineGeo, lineMat);
    this.waveVectorGroup.add(lines);
  }

  public clearWaveVectors(): void {
    while (this.waveVectorGroup.children.length > 0) {
      const child = this.waveVectorGroup.children[0] as THREE.Mesh;
      this.waveVectorGroup.remove(child);
      if (child.geometry) child.geometry.dispose();
      if (child.material) (child.material as THREE.Material).dispose();
    }
  }

  /**
   * Build 3D spatial cylindrical wavefronts for Young's double slit interference
   */
  public updateDoubleSlitWavefronts(slitZ: number, slitSpacingMm: number, time: number): void {
    while (this.waveFrontsGroup.children.length > 0) {
      const child = this.waveFrontsGroup.children[0] as THREE.Mesh;
      this.waveFrontsGroup.remove(child);
      if (child.geometry) child.geometry.dispose();
      if (child.material) (child.material as THREE.Material).dispose();
    }

    const d = slitSpacingMm * 1e-3;
    const slitY = 0.186;
    const baseColor = OpticalPhysics.wavelengthToColor(this.wavelengthNm);

    const waveMat = new THREE.MeshBasicMaterial({
      color: baseColor,
      transparent: true,
      opacity: 0.35,
      wireframe: true,
      blending: THREE.AdditiveBlending,
    });

    const slitPositions = [-d * 0.5, d * 0.5];

    // Propagating wave ripple rings
    for (const sx of slitPositions) {
      for (let r = 0.04; r <= 0.36; r += 0.04) {
        const animR = (r + (time * 0.1) % 0.04);
        const arcGeo = new THREE.RingGeometry(animR - 0.001, animR + 0.001, 32, 1, -Math.PI * 0.45, Math.PI * 0.9);
        const arcMesh = new THREE.Mesh(arcGeo, waveMat);
        arcMesh.rotation.x = -Math.PI * 0.5;
        arcMesh.position.set(sx, slitY, slitZ);
        this.waveFrontsGroup.add(arcMesh);
      }
    }
  }

  public clearWavefronts(): void {
    while (this.waveFrontsGroup.children.length > 0) {
      const child = this.waveFrontsGroup.children[0] as THREE.Mesh;
      this.waveFrontsGroup.remove(child);
      if (child.geometry) child.geometry.dispose();
      if (child.material) (child.material as THREE.Material).dispose();
    }
  }

  public dispose(): void {
    this.coreBeamMat.dispose();
    this.glowBeamMat.dispose();
    this.clearDispersionRays();
    this.clearWaveVectors();
    this.clearWavefronts();
  }
}
