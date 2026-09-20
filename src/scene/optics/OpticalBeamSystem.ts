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

  // Object pool for 3D interference wavefront ripple rings (zero GC allocations during animation)
  private wavefrontMeshes: THREE.Mesh[] = [];
  private unitWaveArcGeo: THREE.RingGeometry | null = null;
  private waveFrontMat: THREE.MeshBasicMaterial | null = null;

  // Pre-allocated line buffer for 3D polarization vector waves
  private waveVectorLines: THREE.LineSegments | null = null;
  private waveVectorGeo: THREE.BufferGeometry | null = null;
  private waveVectorPositions: Float32Array | null = null;
  private waveVectorColors: Float32Array | null = null;

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
   * Apply multi-spectral dispersion rays computed by Worker (Zero Snell's Math on Main Thread)
   */
  public updateDispersionRaysFromWorker(raysData: Array<{
    wavelengthNm: number;
    colorRgb: [number, number, number];
    points: [number, number, number][];
  }>): void {
    this.clearDispersionRays();
    this.coreBeamMesh.visible = false;
    this.glowBeamMesh.visible = false;

    for (const ray of raysData) {
      const vPoints = ray.points.map((p) => new THREE.Vector3(p[0], p[1], p[2]));
      const curve = new THREE.CatmullRomCurve3(vPoints, false, 'catmullrom', 0.05);
      const tubeGeo = new THREE.TubeGeometry(curve, 24, 0.0022, 8, false);

      const tubeMat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(ray.colorRgb[0], ray.colorRgb[1], ray.colorRgb[2]),
        transparent: true,
        opacity: 0.85,
        blending: THREE.AdditiveBlending,
      });

      const tubeMesh = new THREE.Mesh(tubeGeo, tubeMat);
      this.dispersionGroup.add(tubeMesh);
    }
  }

  /**
   * Apply pre-computed 3D polarization wave vector buffers directly from Multi-Core Worker (Zero CPU Math)
   */
  public applyPolarizationWaveBuffer(positions: Float32Array, colors: Float32Array): void {
    const totalVertices = positions.length / 3;
    if (!this.waveVectorLines || !this.waveVectorGeo || !this.waveVectorPositions || this.waveVectorPositions.length !== positions.length) {
      this.clearWaveVectors();
      this.waveVectorPositions = new Float32Array(positions.length);
      this.waveVectorColors = new Float32Array(colors.length);

      this.waveVectorGeo = new THREE.BufferGeometry();
      this.waveVectorGeo.setAttribute('position', new THREE.BufferAttribute(this.waveVectorPositions, 3));
      this.waveVectorGeo.setAttribute('color', new THREE.BufferAttribute(this.waveVectorColors, 3));

      const lineMat = new THREE.LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.88,
        blending: THREE.AdditiveBlending,
      });

      this.waveVectorLines = new THREE.LineSegments(this.waveVectorGeo, lineMat);
      this.waveVectorGroup.add(this.waveVectorLines);
    }

    this.waveVectorPositions!.set(positions);
    this.waveVectorColors!.set(colors);

    (this.waveVectorGeo!.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (this.waveVectorGeo!.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true;
    this.waveVectorLines!.visible = true;
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
    const { startZ, endZ, polarizerZ = -0.15, polarizerAngleDeg = 0, analyzerZ = 0.25, analyzerAngleDeg = 90, hasQuarterWavePlate = false, time } = params;

    const numSamples = 60;
    const dz = (endZ - startZ) / numSamples;
    const k = (2 * Math.PI) / 0.14; // Spatial wavelength in 3D scene ~ 14cm
    const omega = 4.0;
    const beamY = 0.186; // Optical axis height

    const polAngleRad = THREE.MathUtils.degToRad(polarizerAngleDeg);
    const anaAngleRad = THREE.MathUtils.degToRad(analyzerAngleDeg);

    // Initialize line segments buffer once
    const totalVertices = (numSamples + 1) * 2;
    if (!this.waveVectorPositions || this.waveVectorPositions.length !== totalVertices * 3) {
      this.clearWaveVectors();
      this.waveVectorPositions = new Float32Array(totalVertices * 3);
      this.waveVectorColors = new Float32Array(totalVertices * 3);

      this.waveVectorGeo = new THREE.BufferGeometry();
      this.waveVectorGeo.setAttribute('position', new THREE.BufferAttribute(this.waveVectorPositions, 3));
      this.waveVectorGeo.setAttribute('color', new THREE.BufferAttribute(this.waveVectorColors, 3));

      const lineMat = new THREE.LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.88,
        blending: THREE.AdditiveBlending,
      });

      this.waveVectorLines = new THREE.LineSegments(this.waveVectorGeo, lineMat);
      this.waveVectorGroup.add(this.waveVectorLines);
    }

    const pos = this.waveVectorPositions!;
    const col = this.waveVectorColors!;
    const baseColor = OpticalPhysics.wavelengthToColor(this.wavelengthNm);

    let vIdx = 0;
    let cIdx = 0;

    for (let i = 0; i <= numSamples; i++) {
      const z = startZ + i * dz;
      const phase = k * z - omega * time;

      let ampX = 0;
      let ampY = 0;
      const ampMag = 0.024; // 24mm amplitude

      if (z < polarizerZ) {
        // Unpolarized / initial laser: linear 45° or vertical
        ampX = ampMag * Math.cos(polAngleRad) * Math.cos(phase);
        ampY = ampMag * Math.sin(polAngleRad) * Math.cos(phase);
      } else if (z >= polarizerZ && z < analyzerZ) {
        // Linearly polarized light along polarizer axis
        if (hasQuarterWavePlate) {
          // Circular / elliptical polarization after quarter wave plate!
          ampX = ampMag * Math.cos(polAngleRad) * Math.sin(phase);
          ampY = ampMag * Math.sin(polAngleRad) * Math.cos(phase);
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
      pos[vIdx++] = 0;
      pos[vIdx++] = beamY;
      pos[vIdx++] = z;

      // Vector tip
      pos[vIdx++] = ampX;
      pos[vIdx++] = beamY + ampY;
      pos[vIdx++] = z;

      col[cIdx++] = baseColor.r * 0.4;
      col[cIdx++] = baseColor.g * 0.4;
      col[cIdx++] = baseColor.b * 0.4;

      col[cIdx++] = baseColor.r;
      col[cIdx++] = baseColor.g;
      col[cIdx++] = baseColor.b;
    }

    const posAttr = this.waveVectorGeo!.getAttribute('position') as THREE.BufferAttribute;
    const colAttr = this.waveVectorGeo!.getAttribute('color') as THREE.BufferAttribute;
    posAttr.needsUpdate = true;
    colAttr.needsUpdate = true;
    this.waveVectorLines!.visible = true;
  }

  public clearWaveVectors(): void {
    if (this.waveVectorLines) {
      this.waveVectorLines.visible = false;
    }
  }

  /**
   * Build 3D spatial cylindrical wavefronts for Young's double slit interference
   */
  public updateDoubleSlitWavefronts(slitZ: number, slitSpacingMm: number, time: number): void {
    const d = slitSpacingMm * 1e-3;
    const slitY = 0.186;
    const baseColor = OpticalPhysics.wavelengthToColor(this.wavelengthNm);

    // Lazily initialize 18 pooled wavefront meshes once
    const ringsPerSlit = 9;
    const totalMeshes = ringsPerSlit * 2;

    if (this.wavefrontMeshes.length === 0) {
      this.unitWaveArcGeo = new THREE.RingGeometry(0.98, 1.02, 32, 1, -Math.PI * 0.45, Math.PI * 0.9);
      this.waveFrontMat = new THREE.MeshBasicMaterial({
        color: baseColor,
        transparent: true,
        opacity: 0.35,
        wireframe: true,
        blending: THREE.AdditiveBlending,
      });

      for (let i = 0; i < totalMeshes; i++) {
        const mesh = new THREE.Mesh(this.unitWaveArcGeo, this.waveFrontMat);
        mesh.rotation.x = -Math.PI * 0.5;
        this.wavefrontMeshes.push(mesh);
        this.waveFrontsGroup.add(mesh);
      }
    }

    if (this.waveFrontMat) {
      this.waveFrontMat.color.copy(baseColor);
    }

    const slitPositions = [-d * 0.5, d * 0.5];

    // Propagating wave ripple rings using pooled meshes and scale transform
    let meshIdx = 0;
    for (const sx of slitPositions) {
      for (let r = 0.04; r <= 0.36; r += 0.04) {
        const animR = (r + (time * 0.1) % 0.04);
        const arcMesh = this.wavefrontMeshes[meshIdx++];
        arcMesh.position.set(sx, slitY, slitZ);
        arcMesh.scale.set(animR, animR, animR);
        arcMesh.visible = true;
      }
    }
    this.waveFrontsGroup.visible = true;
  }

  public clearWavefronts(): void {
    this.waveFrontsGroup.visible = false;
    for (const mesh of this.wavefrontMeshes) {
      mesh.visible = false;
    }
  }

  public dispose(): void {
    this.coreBeamMat.dispose();
    this.glowBeamMat.dispose();
    this.clearDispersionRays();
    this.clearWaveVectors();
    if (this.waveVectorLines) {
      this.waveVectorGroup.remove(this.waveVectorLines);
      this.waveVectorGeo?.dispose();
      (this.waveVectorLines.material as THREE.Material).dispose();
      this.waveVectorLines = null;
      this.waveVectorGeo = null;
    }
    this.clearWavefronts();
    for (const mesh of this.wavefrontMeshes) {
      this.waveFrontsGroup.remove(mesh);
    }
    this.wavefrontMeshes = [];
    this.unitWaveArcGeo?.dispose();
    this.unitWaveArcGeo = null;
    this.waveFrontMat?.dispose();
    this.waveFrontMat = null;
  }
}
