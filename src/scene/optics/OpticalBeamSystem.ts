import * as THREE from 'three';
import { OpticalPhysics, type DispersionRay } from './OpticalPhysics.ts';

export interface BeamSegment {
  start: THREE.Vector3;
  end: THREE.Vector3;
  intensity?: number;
}

// Module-level pre-allocated scratch objects to eliminate per-frame GC allocations
const _UP_VEC = new THREE.Vector3(0, 1, 0);
const _DIR_VEC = new THREE.Vector3();
const _MID_VEC = new THREE.Vector3();
const _QUAT = new THREE.Quaternion();
const _WHITE_COLOR = new THREE.Color(0xffffff);
const _P_START = new THREE.Vector3();
const _P_END = new THREE.Vector3();

export class OpticalBeamSystem {
  public readonly group = new THREE.Group();

  // Multi-segment laser beam support (laser -> opt1 -> opt2 -> screen)
  private maxSegments = 4;
  private segmentCores: THREE.Mesh[] = [];
  private segmentGlows: THREE.Mesh[] = [];
  private segmentHalos: THREE.Mesh[] = [];
  private segmentCoreMats: THREE.MeshBasicMaterial[] = [];
  private segmentGlowMats: THREE.MeshBasicMaterial[] = [];
  private segmentHaloMats: THREE.MeshBasicMaterial[] = [];

  // Backward-compatible direct references to segment 0
  public coreBeamMesh: THREE.Mesh;
  public glowBeamMesh: THREE.Mesh;
  public coreBeamMat: THREE.MeshBasicMaterial;
  public glowBeamMat: THREE.MeshBasicMaterial;

  private dispersionGroup = new THREE.Group();
  private waveVectorGroup = new THREE.Group();
  private waveFrontsGroup = new THREE.Group();
  private diffractionFanGroup = new THREE.Group();
  private gratingOrdersGroup = new THREE.Group();

  // Pre-allocated line buffer for 3D coherent wavefront arcs (Young's double slit & single slit)
  private wavefrontLines: THREE.LineSegments | null = null;
  private wavefrontGeo: THREE.BufferGeometry | null = null;
  private wavefrontPositions: Float32Array | null = null;
  private wavefrontColors: Float32Array | null = null;
  private wavefrontMat: THREE.LineBasicMaterial | null = null;

  // Diffraction light envelope fan mesh
  private diffractionFanMesh: THREE.Mesh | null = null;
  private diffractionFanGeo: THREE.BufferGeometry | null = null;
  private diffractionFanMat: THREE.MeshBasicMaterial | null = null;

  // Grating discrete orders beams
  private gratingOrderMeshes: THREE.Mesh[] = [];
  private gratingOrderMats: THREE.MeshBasicMaterial[] = [];

  // Pre-allocated line buffer for 3D polarization vector waves
  private waveVectorLines: THREE.LineSegments | null = null;
  private waveVectorGeo: THREE.BufferGeometry | null = null;
  private waveVectorPositions: Float32Array | null = null;
  private waveVectorColors: Float32Array | null = null;

  // 7-color spectral dispersion ray configs (Red, Orange, Yellow, Green, Cyan, Blue, Violet)
  public readonly spectrumConfigs = [
    { wl: 680, hex: 0xff2222 }, // Red
    { wl: 610, hex: 0xff7700 }, // Orange
    { wl: 575, hex: 0xffdd00 }, // Yellow
    { wl: 530, hex: 0x00ff44 }, // Green
    { wl: 480, hex: 0x00d4ff }, // Cyan
    { wl: 440, hex: 0x2255ff }, // Blue
    { wl: 405, hex: 0x8822ff }, // Violet
  ];

  // Pre-allocated dispersion ray meshes: [rayIdx 0..6][segmentIdx 0..1]
  // Segment 0: inside prism (pEnter -> pExit)
  // Segment 1: prism to screen (pExit -> pScreen)
  private dispersionCores: THREE.Mesh[][] = [];
  private dispersionGlows: THREE.Mesh[][] = [];
  private dispersionCoreMats: THREE.MeshBasicMaterial[][] = [];
  private dispersionGlowMats: THREE.MeshBasicMaterial[][] = [];
  private dispersionCoreGeo: THREE.CylinderGeometry | null = null;
  private dispersionGlowGeo: THREE.CylinderGeometry | null = null;
  public isWhiteLight = false;

  public wavelengthNm = 632.8;
  public intensity = 1.0;

  constructor(wavelength = 632.8) {
    this.wavelengthNm = wavelength;
    this.group.name = 'OpticalBeamSystem';
    this.group.raycast = () => {};
    this.dispersionGroup.raycast = () => {};
    this.waveVectorGroup.raycast = () => {};
    this.waveFrontsGroup.raycast = () => {};
    this.diffractionFanGroup.raycast = () => {};
    this.gratingOrdersGroup.raycast = () => {};

    this.initBeamSegments();
    this.initDispersionMeshes();
    this.group.add(this.dispersionGroup);
    this.group.add(this.waveVectorGroup);
    this.group.add(this.waveFrontsGroup);
    this.group.add(this.diffractionFanGroup);
    this.group.add(this.gratingOrdersGroup);
    this.updateWavelength(wavelength);
  }

  private initDispersionMeshes(): void {
    const coreRadius = 0.0007; // 1.4mm diameter crisp core filament
    const glowRadius = 0.0022; // 4.4mm diameter saturated spectral glow

    this.dispersionCoreGeo = new THREE.CylinderGeometry(coreRadius, coreRadius, 1.0, 10);
    this.dispersionGlowGeo = new THREE.CylinderGeometry(glowRadius, glowRadius, 1.0, 10);

    for (let i = 0; i < this.spectrumConfigs.length; i++) {
      const cfg = this.spectrumConfigs[i];
      const baseCol = new THREE.Color(cfg.hex);
      const coreCol = baseCol.clone().lerp(new THREE.Color(0xffffff), 0.65);

      const rayCores: THREE.Mesh[] = [];
      const rayGlows: THREE.Mesh[] = [];
      const rayCoreMats: THREE.MeshBasicMaterial[] = [];
      const rayGlowMats: THREE.MeshBasicMaterial[] = [];

      for (let s = 0; s < 2; s++) {
        const coreMat = new THREE.MeshBasicMaterial({
          color: coreCol,
          transparent: true,
          opacity: 0.95,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        });
        const coreMesh = new THREE.Mesh(this.dispersionCoreGeo, coreMat);
        coreMesh.visible = false;
        coreMesh.raycast = () => {};
        this.dispersionGroup.add(coreMesh);
        rayCores.push(coreMesh);
        rayCoreMats.push(coreMat);

        const glowMat = new THREE.MeshBasicMaterial({
          color: baseCol,
          transparent: true,
          opacity: 0.65,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        });
        const glowMesh = new THREE.Mesh(this.dispersionGlowGeo, glowMat);
        glowMesh.visible = false;
        glowMesh.raycast = () => {};
        this.dispersionGroup.add(glowMesh);
        rayGlows.push(glowMesh);
        rayGlowMats.push(glowMat);
      }

      this.dispersionCores.push(rayCores);
      this.dispersionGlows.push(rayGlows);
      this.dispersionCoreMats.push(rayCoreMats);
      this.dispersionGlowMats.push(rayGlowMats);
    }
  }

  private initBeamSegments(): void {
    const coreRadius = 0.0009; // 1.8mm diameter intense laser core
    const glowRadius = 0.0035; // 7.0mm diameter inner volumetric glow
    const haloRadius = 0.0080; // 16.0mm diameter soft outer beam haze

    const coreGeo = new THREE.CylinderGeometry(coreRadius, coreRadius, 1.0, 16);
    const glowGeo = new THREE.CylinderGeometry(glowRadius, glowRadius, 1.0, 16);
    const haloGeo = new THREE.CylinderGeometry(haloRadius, haloRadius, 1.0, 16);

    for (let i = 0; i < this.maxSegments; i++) {
      // 1. High brightness laser filament core (additive, near-white core blend)
      const coreMat = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.95,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const coreMesh = new THREE.Mesh(coreGeo, coreMat);
      coreMesh.visible = false;
      coreMesh.raycast = () => {};
      this.group.add(coreMesh);
      this.segmentCores.push(coreMesh);
      this.segmentCoreMats.push(coreMat);

      // 2. Saturated volumetric scattering glow
      const glowMat = new THREE.MeshBasicMaterial({
        color: 0xff1e1e,
        transparent: true,
        opacity: 0.55,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const glowMesh = new THREE.Mesh(glowGeo, glowMat);
      glowMesh.visible = false;
      glowMesh.raycast = () => {};
      this.group.add(glowMesh);
      this.segmentGlows.push(glowMesh);
      this.segmentGlowMats.push(glowMat);

      // 3. Ambient atmospheric halo
      const haloMat = new THREE.MeshBasicMaterial({
        color: 0xff1e1e,
        transparent: true,
        opacity: 0.18,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const haloMesh = new THREE.Mesh(haloGeo, haloMat);
      haloMesh.visible = false;
      haloMesh.raycast = () => {};
      this.group.add(haloMesh);
      this.segmentHalos.push(haloMesh);
      this.segmentHaloMats.push(haloMat);
    }

    this.coreBeamMesh = this.segmentCores[0];
    this.glowBeamMesh = this.segmentGlows[0];
    this.coreBeamMat = this.segmentCoreMats[0];
    this.glowBeamMat = this.segmentGlowMats[0];
  }

  public updateSegmentedBeam(segments: BeamSegment[]): void {
    for (let i = 0; i < this.maxSegments; i++) {
      const core = this.segmentCores[i];
      const glow = this.segmentGlows[i];
      const halo = this.segmentHalos[i];
      const coreMat = this.segmentCoreMats[i];
      const glowMat = this.segmentGlowMats[i];
      const haloMat = this.segmentHaloMats[i];

      if (i < segments.length && this.intensity > 0.001) {
        const seg = segments[i];
        const segIntensity = seg.intensity ?? 1.0;
        const effectiveIntensity = this.intensity * segIntensity;

        if (effectiveIntensity < 0.001) {
          core.visible = false;
          glow.visible = false;
          halo.visible = false;
          continue;
        }

        _DIR_VEC.subVectors(seg.end, seg.start);
        const len = _DIR_VEC.length();
        if (len < 1e-4) {
          core.visible = false;
          glow.visible = false;
          halo.visible = false;
          continue;
        }

        _MID_VEC.addVectors(seg.start, seg.end).multiplyScalar(0.5);
        _DIR_VEC.multiplyScalar(1 / len);
        _QUAT.setFromUnitVectors(_UP_VEC, _DIR_VEC);

        core.position.copy(_MID_VEC);
        core.scale.set(1, len, 1);
        core.quaternion.copy(_QUAT);

        glow.position.copy(_MID_VEC);
        glow.scale.set(1, len, 1);
        glow.quaternion.copy(_QUAT);

        halo.position.copy(_MID_VEC);
        halo.scale.set(1, len, 1);
        halo.quaternion.copy(_QUAT);

        coreMat.opacity = effectiveIntensity * 0.95;
        glowMat.opacity = effectiveIntensity * 0.55;
        haloMat.opacity = effectiveIntensity * 0.18;

        core.visible = true;
        glow.visible = true;
        halo.visible = true;
      } else {
        core.visible = false;
        glow.visible = false;
        halo.visible = false;
      }
    }
  }

  public updateStraightBeam(start: THREE.Vector3, end: THREE.Vector3): void {
    this.updateSegmentedBeam([{ start, end, intensity: 1.0 }]);
  }

  public updateWavelength(wavelengthNm: number): void {
    this.wavelengthNm = wavelengthNm;
    const color = OpticalPhysics.wavelengthToColor(wavelengthNm);
    // Core has high-luminance white mix
    const coreColor = color.clone().lerp(new THREE.Color(1, 1, 1), 0.70);

    for (let i = 0; i < this.maxSegments; i++) {
      this.segmentCoreMats[i].color.copy(coreColor);
      this.segmentGlowMats[i].color.copy(color);
      this.segmentHaloMats[i].color.copy(color);
    }
    if (this.diffractionFanMat) {
      this.diffractionFanMat.color.copy(color);
    }
    for (const mat of this.gratingOrderMats) {
      mat.color.copy(color);
    }
  }

  public setWhiteLight(white: boolean): void {
    this.isWhiteLight = white;
    if (white) {
      for (let i = 0; i < this.maxSegments; i++) {
        this.segmentCoreMats[i].color.copy(_WHITE_COLOR);
        this.segmentGlowMats[i].color.copy(_WHITE_COLOR);
        this.segmentHaloMats[i].color.copy(_WHITE_COLOR);
      }
    } else {
      this.updateWavelength(this.wavelengthNm);
    }
  }

  public setIntensity(intensity: number): void {
    this.intensity = Math.max(0, Math.min(1, intensity));
    const effective = this.intensity > 0.001;
    if (!effective) {
      for (let i = 0; i < this.maxSegments; i++) {
        this.segmentCores[i].visible = false;
        this.segmentGlows[i].visible = false;
        this.segmentHalos[i].visible = false;
      }
      this.clearDispersionRays();
    }
  }

  /**
   * Render multi-spectral rainbow dispersion beams through prism (Zero-allocation / Pre-allocated pool)
   */
  public updateDispersionRays(rays: DispersionRay[]): void {
    // If rays exist, render incoming beam to the entrance point on prism face
    if (rays.length > 0 && rays[0].points.length >= 2 && this.intensity > 0.001) {
      const pIn = rays[0].points[0];
      const pEnter = rays[0].points[1];
      this.updateSegmentedBeam([{ start: pIn, end: pEnter, intensity: this.intensity }]);
    } else {
      for (let i = 0; i < this.maxSegments; i++) {
        this.segmentCores[i].visible = false;
        this.segmentGlows[i].visible = false;
        this.segmentHalos[i].visible = false;
      }
    }

    for (let i = 0; i < this.spectrumConfigs.length; i++) {
      const coreInside = this.dispersionCores[i]?.[0];
      const glowInside = this.dispersionGlows[i]?.[0];
      const coreOut = this.dispersionCores[i]?.[1];
      const glowOut = this.dispersionGlows[i]?.[1];

      if (i < rays.length && this.intensity > 0.001) {
        const ray = rays[i];
        if (ray.points.length >= 4) {
          const pEnter = ray.points[1];
          const pExit = ray.points[2];
          const pScreen = ray.points[3];

          // 1. Segment inside prism (pEnter -> pExit)
          _DIR_VEC.subVectors(pExit, pEnter);
          const len1 = _DIR_VEC.length();
          if (len1 > 1e-4) {
            _MID_VEC.addVectors(pEnter, pExit).multiplyScalar(0.5);
            _DIR_VEC.multiplyScalar(1 / len1);
            _QUAT.setFromUnitVectors(_UP_VEC, _DIR_VEC);

            if (coreInside) {
              coreInside.position.copy(_MID_VEC);
              coreInside.scale.set(1, len1, 1);
              coreInside.quaternion.copy(_QUAT);
              coreInside.visible = true;
            }
            if (glowInside) {
              glowInside.position.copy(_MID_VEC);
              glowInside.scale.set(1, len1, 1);
              glowInside.quaternion.copy(_QUAT);
              glowInside.visible = true;
            }
          }

          // 2. Segment outside prism to screen (pExit -> pScreen)
          _DIR_VEC.subVectors(pScreen, pExit);
          const len2 = _DIR_VEC.length();
          if (len2 > 1e-4) {
            _MID_VEC.addVectors(pExit, pScreen).multiplyScalar(0.5);
            _DIR_VEC.multiplyScalar(1 / len2);
            _QUAT.setFromUnitVectors(_UP_VEC, _DIR_VEC);

            if (coreOut) {
              coreOut.position.copy(_MID_VEC);
              coreOut.scale.set(1, len2, 1);
              coreOut.quaternion.copy(_QUAT);
              coreOut.visible = true;
            }
            if (glowOut) {
              glowOut.position.copy(_MID_VEC);
              glowOut.scale.set(1, len2, 1);
              glowOut.quaternion.copy(_QUAT);
              glowOut.visible = true;
            }
          }
        }
      } else {
        if (coreInside) coreInside.visible = false;
        if (glowInside) glowInside.visible = false;
        if (coreOut) coreOut.visible = false;
        if (glowOut) glowOut.visible = false;
      }
    }
  }

  public clearDispersionRays(): void {
    for (const segs of this.dispersionCores) {
      for (const m of segs) m.visible = false;
    }
    for (const segs of this.dispersionGlows) {
      for (const m of segs) m.visible = false;
    }
  }

  /**
   * Apply multi-spectral dispersion rays computed by Worker (Zero-allocation bridge)
   */
  public updateDispersionRaysFromWorker(raysData: Array<{
    wavelengthNm: number;
    colorRgb: [number, number, number];
    points: [number, number, number][];
  }>): void {
    const formattedRays: DispersionRay[] = raysData.map((r) => ({
      wavelengthNm: r.wavelengthNm,
      color: new THREE.Color(r.colorRgb[0], r.colorRgb[1], r.colorRgb[2]),
      refractiveIndex: 1.54,
      deviationAngleRad: 0,
      points: r.points.map((p) => new THREE.Vector3(p[0], p[1], p[2])),
    }));
    this.updateDispersionRays(formattedRays);
  }

  /**
   * Apply pre-computed 3D polarization wave vector buffers directly from Multi-Core Worker
   */
  public applyPolarizationWaveBuffer(positions: Float32Array, colors: Float32Array): void {
    const numVectors = Math.floor(positions.length / 6);
    const numCurveSegments = numVectors > 1 ? numVectors - 1 : 0;
    const totalVertices = numVectors * 2 + numCurveSegments * 2;
    const totalFloats = totalVertices * 3;

    if (!this.waveVectorLines || !this.waveVectorGeo || !this.waveVectorPositions || this.waveVectorPositions.length !== totalFloats) {
      this.clearWaveVectors();
      this.waveVectorPositions = new Float32Array(totalFloats);
      this.waveVectorColors = new Float32Array(totalFloats);

      this.waveVectorGeo = new THREE.BufferGeometry();
      this.waveVectorGeo.setAttribute('position', new THREE.BufferAttribute(this.waveVectorPositions, 3));
      this.waveVectorGeo.setAttribute('color', new THREE.BufferAttribute(this.waveVectorColors, 3));

      const lineMat = new THREE.LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.90,
        blending: THREE.AdditiveBlending,
      });

      this.waveVectorLines = new THREE.LineSegments(this.waveVectorGeo, lineMat);
      this.waveVectorLines.raycast = () => {};
      this.waveVectorGroup.add(this.waveVectorLines);
    }

    // 1. Copy field vectors
    this.waveVectorPositions!.set(positions, 0);
    this.waveVectorColors!.set(colors, 0);

    // 2. Connect continuous spatial wave curve between vector tips
    let vIdx = positions.length;
    let cIdx = colors.length;
    for (let i = 0; i < numCurveSegments; i++) {
      const tip1 = i * 6 + 3;
      const tip2 = (i + 1) * 6 + 3;

      this.waveVectorPositions![vIdx++] = positions[tip1];
      this.waveVectorPositions![vIdx++] = positions[tip1 + 1];
      this.waveVectorPositions![vIdx++] = positions[tip1 + 2];

      this.waveVectorPositions![vIdx++] = positions[tip2];
      this.waveVectorPositions![vIdx++] = positions[tip2 + 1];
      this.waveVectorPositions![vIdx++] = positions[tip2 + 2];

      const r = colors[tip1];
      const g = colors[tip1 + 1];
      const b = colors[tip1 + 2];

      this.waveVectorColors![cIdx++] = r * 1.2;
      this.waveVectorColors![cIdx++] = g * 1.2;
      this.waveVectorColors![cIdx++] = b * 1.2;

      this.waveVectorColors![cIdx++] = r * 1.2;
      this.waveVectorColors![cIdx++] = g * 1.2;
      this.waveVectorColors![cIdx++] = b * 1.2;
    }

    (this.waveVectorGeo!.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (this.waveVectorGeo!.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true;
    this.waveVectorLines!.visible = this.intensity > 0.001;
  }

  /**
   * Build 3D spatial oscillating Electric Field vector waves with continuous wave envelope
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
    const k = (2 * Math.PI) / 0.14;
    const omega = 4.0;
    const beamY = 0.186;

    const polAngleRad = THREE.MathUtils.degToRad(polarizerAngleDeg);
    const anaAngleRad = THREE.MathUtils.degToRad(analyzerAngleDeg);

    const totalVertices = (numSamples + 1) * 2 + numSamples * 2;
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
        opacity: 0.90,
        blending: THREE.AdditiveBlending,
      });

      this.waveVectorLines = new THREE.LineSegments(this.waveVectorGeo, lineMat);
      this.waveVectorLines.raycast = () => {};
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
      const ampMag = 0.024;

      if (z < polarizerZ) {
        ampX = ampMag * Math.cos(polAngleRad) * Math.cos(phase);
        ampY = ampMag * Math.sin(polAngleRad) * Math.cos(phase);
      } else if (z >= polarizerZ && z < analyzerZ) {
        if (hasQuarterWavePlate) {
          ampX = ampMag * Math.cos(polAngleRad) * Math.sin(phase);
          ampY = ampMag * Math.sin(polAngleRad) * Math.cos(phase);
        } else {
          ampX = ampMag * Math.cos(polAngleRad) * Math.cos(phase);
          ampY = ampMag * Math.sin(polAngleRad) * Math.cos(phase);
        }
      } else {
        const deltaAngle = anaAngleRad - polAngleRad;
        const malusFactor = Math.cos(deltaAngle);
        const transAmp = ampMag * malusFactor;

        ampX = transAmp * Math.cos(anaAngleRad) * Math.cos(phase);
        ampY = transAmp * Math.sin(anaAngleRad) * Math.cos(phase);
      }

      const tipX = ampX;
      const tipY = beamY + ampY;

      pos[vIdx++] = 0;
      pos[vIdx++] = beamY;
      pos[vIdx++] = z;

      pos[vIdx++] = tipX;
      pos[vIdx++] = tipY;
      pos[vIdx++] = z;

      col[cIdx++] = baseColor.r * 0.35;
      col[cIdx++] = baseColor.g * 0.35;
      col[cIdx++] = baseColor.b * 0.35;

      col[cIdx++] = baseColor.r;
      col[cIdx++] = baseColor.g;
      col[cIdx++] = baseColor.b;
    }

    // Connect adjacent tips directly from written buffer (Zero allocations!)
    const tipStride = 6;
    for (let i = 0; i < numSamples; i++) {
      const tip1Idx = i * tipStride + 3;
      const tip2Idx = (i + 1) * tipStride + 3;

      pos[vIdx++] = pos[tip1Idx];
      pos[vIdx++] = pos[tip1Idx + 1];
      pos[vIdx++] = pos[tip1Idx + 2];

      pos[vIdx++] = pos[tip2Idx];
      pos[vIdx++] = pos[tip2Idx + 1];
      pos[vIdx++] = pos[tip2Idx + 2];

      col[cIdx++] = baseColor.r * 1.2;
      col[cIdx++] = baseColor.g * 1.2;
      col[cIdx++] = baseColor.b * 1.2;

      col[cIdx++] = baseColor.r * 1.2;
      col[cIdx++] = baseColor.g * 1.2;
      col[cIdx++] = baseColor.b * 1.2;
    }

    const posAttr = this.waveVectorGeo!.getAttribute('position') as THREE.BufferAttribute;
    const colAttr = this.waveVectorGeo!.getAttribute('color') as THREE.BufferAttribute;
    posAttr.needsUpdate = true;
    colAttr.needsUpdate = true;
    this.waveVectorLines!.visible = this.intensity > 0.001;
  }

  public clearWaveVectors(): void {
    if (this.waveVectorLines) {
      this.waveVectorLines.visible = false;
    }
  }

  /**
   * Build 3D spatial coherent cylindrical wavefronts for Young's double slit interference.
   * Waves propagate along the optical axis (+Z direction) from the slits towards the screen.
   * Additive blending naturally yields bright constructive interference fringes where wave crests intersect!
   */
  public updateDoubleSlitWavefronts(
    slitZ: number,
    slitSpacingMm: number,
    time: number,
    screenZ = 0.48
  ): void {
    const beamY = 0.186;
    const baseColor = OpticalPhysics.wavelengthToColor(this.wavelengthNm);

    const numRingsPerSlit = 10;
    const segmentsPerArc = 28;
    const totalLines = numRingsPerSlit * 2 * segmentsPerArc;
    const totalVertices = totalLines * 2;

    if (!this.wavefrontPositions || this.wavefrontPositions.length !== totalVertices * 3) {
      this.clearWavefronts();
      this.wavefrontPositions = new Float32Array(totalVertices * 3);
      this.wavefrontColors = new Float32Array(totalVertices * 3);

      this.wavefrontGeo = new THREE.BufferGeometry();
      this.wavefrontGeo.setAttribute('position', new THREE.BufferAttribute(this.wavefrontPositions, 3));
      this.wavefrontGeo.setAttribute('color', new THREE.BufferAttribute(this.wavefrontColors, 3));

      this.wavefrontMat = new THREE.LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.85,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });

      this.wavefrontLines = new THREE.LineSegments(this.wavefrontGeo, this.wavefrontMat);
      this.wavefrontLines.raycast = () => {};
      this.waveFrontsGroup.add(this.wavefrontLines);
    }

    const pos = this.wavefrontPositions!;
    const col = this.wavefrontColors!;
    let vIdx = 0;
    let cIdx = 0;

    // Visual slit separation (clear separation between two coherent point sources)
    const dVis = Math.max(0.012, Math.min(0.024, slitSpacingMm * 0.06));
    const slitPositions = [-dVis * 0.5, dVis * 0.5];

    const rMin = 0.02;
    const rMax = Math.max(0.08, screenZ - slitZ - 0.01);
    const rSpan = rMax - rMin;
    const ringSpacing = rSpan / numRingsPerSlit;
    const waveSpeed = 0.16; // 16 cm/s ripple propagation speed

    const thetaMax = 0.65; // ~37° arc spread in X towards +Z
    const slitEmitterZ = slitZ + 0.008;

    for (const sx of slitPositions) {
      for (let ring = 0; ring < numRingsPerSlit; ring++) {
        // Continuous smooth outward propagation
        const r = rMin + ((ring * ringSpacing + time * waveSpeed) % rSpan);

        // Smooth fade-in near slits and fade-out near screen
        const normDist = (r - rMin) / rSpan;
        const fade = Math.sin(Math.PI * normDist);
        const alpha = Math.max(0.05, fade * 0.75);

        const cr = baseColor.r * alpha;
        const cg = baseColor.g * alpha;
        const cb = baseColor.b * alpha;

        for (let s = 0; s < segmentsPerArc; s++) {
          const tA = -thetaMax + (2 * thetaMax * s) / segmentsPerArc;
          const tB = -thetaMax + (2 * thetaMax * (s + 1)) / segmentsPerArc;

          const xA = sx + r * Math.sin(tA);
          const zA = slitEmitterZ + r * Math.cos(tA);

          const xB = sx + r * Math.sin(tB);
          const zB = slitEmitterZ + r * Math.cos(tB);

          // Segment start
          pos[vIdx++] = xA;
          pos[vIdx++] = beamY;
          pos[vIdx++] = zA;

          col[cIdx++] = cr;
          col[cIdx++] = cg;
          col[cIdx++] = cb;

          // Segment end
          pos[vIdx++] = xB;
          pos[vIdx++] = beamY;
          pos[vIdx++] = zB;

          col[cIdx++] = cr;
          col[cIdx++] = cg;
          col[cIdx++] = cb;
        }
      }
    }

    (this.wavefrontGeo!.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (this.wavefrontGeo!.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true;
    this.wavefrontLines!.visible = this.intensity > 0.001;
    this.waveFrontsGroup.visible = this.intensity > 0.001;
  }

  /**
   * Build 3D spatial cylindrical wavefronts for single slit diffraction
   */
  public updateSingleSlitWavefronts(
    slitZ: number,
    _slitWidthMm: number,
    time: number,
    screenZ = 0.48
  ): void {
    const beamY = 0.186;
    const baseColor = OpticalPhysics.wavelengthToColor(this.wavelengthNm);

    const numRings = 12;
    const segmentsPerArc = 32;
    const totalLines = numRings * segmentsPerArc;
    const totalVertices = totalLines * 2;

    if (!this.wavefrontPositions || this.wavefrontPositions.length !== totalVertices * 3) {
      this.clearWavefronts();
      this.wavefrontPositions = new Float32Array(totalVertices * 3);
      this.wavefrontColors = new Float32Array(totalVertices * 3);

      this.wavefrontGeo = new THREE.BufferGeometry();
      this.wavefrontGeo.setAttribute('position', new THREE.BufferAttribute(this.wavefrontPositions, 3));
      this.wavefrontGeo.setAttribute('color', new THREE.BufferAttribute(this.wavefrontColors, 3));

      this.wavefrontMat = new THREE.LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.85,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });

      this.wavefrontLines = new THREE.LineSegments(this.wavefrontGeo, this.wavefrontMat);
      this.wavefrontLines.raycast = () => {};
      this.waveFrontsGroup.add(this.wavefrontLines);
    }

    const pos = this.wavefrontPositions!;
    const col = this.wavefrontColors!;
    let vIdx = 0;
    let cIdx = 0;

    const rMin = 0.02;
    const rMax = Math.max(0.08, screenZ - slitZ - 0.01);
    const rSpan = rMax - rMin;
    const ringSpacing = rSpan / numRings;
    const waveSpeed = 0.16;

    const thetaMax = 0.60;
    const slitEmitterZ = slitZ + 0.008;

    for (let ring = 0; ring < numRings; ring++) {
      const r = rMin + ((ring * ringSpacing + time * waveSpeed) % rSpan);
      const normDist = (r - rMin) / rSpan;
      const fade = Math.sin(Math.PI * normDist);
      const alpha = Math.max(0.05, fade * 0.70);

      const cr = baseColor.r * alpha;
      const cg = baseColor.g * alpha;
      const cb = baseColor.b * alpha;

      for (let s = 0; s < segmentsPerArc; s++) {
        const tA = -thetaMax + (2 * thetaMax * s) / segmentsPerArc;
        const tB = -thetaMax + (2 * thetaMax * (s + 1)) / segmentsPerArc;

        const xA = r * Math.sin(tA);
        const zA = slitEmitterZ + r * Math.cos(tA);

        const xB = r * Math.sin(tB);
        const zB = slitEmitterZ + r * Math.cos(tB);

        pos[vIdx++] = xA;
        pos[vIdx++] = beamY;
        pos[vIdx++] = zA;

        col[cIdx++] = cr;
        col[cIdx++] = cg;
        col[cIdx++] = cb;

        pos[vIdx++] = xB;
        pos[vIdx++] = beamY;
        pos[vIdx++] = zB;

        col[cIdx++] = cr;
        col[cIdx++] = cg;
        col[cIdx++] = cb;
      }
    }

    (this.wavefrontGeo!.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (this.wavefrontGeo!.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true;
    this.wavefrontLines!.visible = this.intensity > 0.001;
    this.waveFrontsGroup.visible = this.intensity > 0.001;
  }

  public clearWavefronts(): void {
    if (this.wavefrontLines) {
      this.wavefrontLines.visible = false;
    }
    this.waveFrontsGroup.visible = false;
  }

  /**
   * Diffracted light volumetric envelope fan connecting aperture to screen fringe envelope
   */
  public updateDiffractionFan(slitZ: number, screenZ: number, halfWidth: number, intensity = 1.0): void {
    const beamY = 0.186;
    const startZ = slitZ + 0.008;
    const endZ = screenZ - 0.006;
    const baseColor = OpticalPhysics.wavelengthToColor(this.wavelengthNm);
    const halfHeight = 0.010; // 20mm vertical slit height

    if (!this.diffractionFanMesh) {
      const geo = new THREE.BufferGeometry();
      const positions = new Float32Array([
        // Horizontal mid fan
        0, beamY, startZ,
        -halfWidth, beamY, endZ,
        halfWidth, beamY, endZ,

        // Top slope
        0, beamY + halfHeight * 0.4, startZ,
        -halfWidth * 0.85, beamY + halfHeight, endZ,
        halfWidth * 0.85, beamY + halfHeight, endZ,

        // Bottom slope
        0, beamY - halfHeight * 0.4, startZ,
        halfWidth * 0.85, beamY - halfHeight, endZ,
        -halfWidth * 0.85, beamY - halfHeight, endZ,

        // Left wing
        0, beamY + halfHeight * 0.4, startZ,
        0, beamY - halfHeight * 0.4, startZ,
        -halfWidth, beamY, endZ,

        // Right wing
        0, beamY + halfHeight * 0.4, startZ,
        halfWidth, beamY, endZ,
        0, beamY - halfHeight * 0.4, startZ,
      ]);
      geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      this.diffractionFanGeo = geo;

      this.diffractionFanMat = new THREE.MeshBasicMaterial({
        color: baseColor,
        transparent: true,
        opacity: 0.16,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        depthWrite: false,
      });

      this.diffractionFanMesh = new THREE.Mesh(geo, this.diffractionFanMat);
      this.diffractionFanMesh.raycast = () => {};
      this.diffractionFanGroup.add(this.diffractionFanMesh);
    } else {
      const pos = (this.diffractionFanGeo!.getAttribute('position') as THREE.BufferAttribute).array as Float32Array;
      // Mid fan
      pos[0] = 0; pos[1] = beamY; pos[2] = startZ;
      pos[3] = -halfWidth; pos[4] = beamY; pos[5] = endZ;
      pos[6] = halfWidth; pos[7] = beamY; pos[8] = endZ;

      // Top slope
      pos[9] = 0; pos[10] = beamY + halfHeight * 0.4; pos[11] = startZ;
      pos[12] = -halfWidth * 0.85; pos[13] = beamY + halfHeight; pos[14] = endZ;
      pos[15] = halfWidth * 0.85; pos[16] = beamY + halfHeight; pos[17] = endZ;

      // Bottom slope
      pos[18] = 0; pos[19] = beamY - halfHeight * 0.4; pos[20] = startZ;
      pos[21] = halfWidth * 0.85; pos[22] = beamY - halfHeight; pos[23] = endZ;
      pos[24] = -halfWidth * 0.85; pos[25] = beamY - halfHeight; pos[26] = endZ;

      // Left wing
      pos[27] = 0; pos[28] = beamY + halfHeight * 0.4; pos[29] = startZ;
      pos[30] = 0; pos[31] = beamY - halfHeight * 0.4; pos[32] = startZ;
      pos[33] = -halfWidth; pos[34] = beamY; pos[35] = endZ;

      // Right wing
      pos[36] = 0; pos[37] = beamY + halfHeight * 0.4; pos[38] = startZ;
      pos[39] = halfWidth; pos[40] = beamY; pos[41] = endZ;
      pos[42] = 0; pos[43] = beamY - halfHeight * 0.4; pos[44] = startZ;

      this.diffractionFanGeo!.getAttribute('position').needsUpdate = true;
      this.diffractionFanMat!.color.copy(baseColor);
    }

    const effIntensity = this.intensity * intensity;
    this.diffractionFanMat!.opacity = effIntensity * 0.16;
    this.diffractionFanMesh.visible = effIntensity > 0.001;
  }

  public clearDiffractionFan(): void {
    if (this.diffractionFanMesh) {
      this.diffractionFanMesh.visible = false;
    }
  }

  /**
   * Discrete diffraction order rays (m = 0, ±1, ±2) for diffraction grating
   */
  public updateGratingOrders(
    slitZ: number,
    screenZ: number,
    gratingLinesPerMm: number,
    intensity = 1.0
  ): void {
    const beamY = 0.186;
    const startZ = slitZ + 0.008;
    const endZ = screenZ - 0.006;
    const L = endZ - startZ;
    const baseColor = OpticalPhysics.wavelengthToColor(this.wavelengthNm);
    const lambda = this.wavelengthNm * 1e-9;
    const d = 1 / (gratingLinesPerMm * 1e3);

    const orders = [0, 1, -1, 2, -2];

    while (this.gratingOrderMeshes.length < orders.length) {
      const geo = new THREE.CylinderGeometry(0.0011, 0.0011, 1.0, 12);
      const mat = new THREE.MeshBasicMaterial({
        color: baseColor,
        transparent: true,
        opacity: 0.75,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.raycast = () => {};
      this.gratingOrderMeshes.push(mesh);
      this.gratingOrderMats.push(mat);
      this.gratingOrdersGroup.add(mesh);
    }

    let meshIdx = 0;
    for (const m of orders) {
      const mesh = this.gratingOrderMeshes[meshIdx];
      const mat = this.gratingOrderMats[meshIdx++];

      const sinTheta = (m * lambda) / d;
      if (Math.abs(sinTheta) > 0.85 || this.intensity < 0.001) {
        mesh.visible = false;
        continue;
      }

      const tanTheta = Math.tan(Math.asin(sinTheta));
      const endX = L * tanTheta;

      _P_START.set(0, beamY, startZ);
      _P_END.set(endX, beamY, endZ);

      _DIR_VEC.subVectors(_P_END, _P_START);
      const len = _DIR_VEC.length();
      _MID_VEC.addVectors(_P_START, _P_END).multiplyScalar(0.5);

      mesh.position.copy(_MID_VEC);
      mesh.scale.set(1, len, 1);
      mesh.quaternion.setFromUnitVectors(_UP_VEC, _DIR_VEC.normalize());

      const orderFalloff = m === 0 ? 1.0 : (Math.abs(m) === 1 ? 0.75 : 0.45);
      mat.color.copy(baseColor);
      mat.opacity = this.intensity * intensity * 0.75 * orderFalloff;
      mesh.visible = true;
    }
  }

  public clearGratingOrders(): void {
    for (const mesh of this.gratingOrderMeshes) {
      mesh.visible = false;
    }
  }

  public dispose(): void {
    for (const mat of this.segmentCoreMats) mat.dispose();
    for (const mat of this.segmentGlowMats) mat.dispose();
    for (const mat of this.segmentHaloMats) mat.dispose();
    this.clearDispersionRays();
    this.dispersionCoreGeo?.dispose();
    this.dispersionGlowGeo?.dispose();
    for (const row of this.dispersionCoreMats) {
      for (const m of row) m.dispose();
    }
    for (const row of this.dispersionGlowMats) {
      for (const m of row) m.dispose();
    }
    this.clearWaveVectors();
    if (this.waveVectorLines) {
      this.waveVectorGroup.remove(this.waveVectorLines);
      this.waveVectorGeo?.dispose();
      (this.waveVectorLines.material as THREE.Material).dispose();
      this.waveVectorLines = null;
      this.waveVectorGeo = null;
    }
    this.clearWavefronts();
    if (this.wavefrontLines) {
      this.waveFrontsGroup.remove(this.wavefrontLines);
      this.wavefrontGeo?.dispose();
      this.wavefrontMat?.dispose();
      this.wavefrontLines = null;
      this.wavefrontGeo = null;
      this.wavefrontMat = null;
    }
    this.clearDiffractionFan();
    if (this.diffractionFanMesh) {
      this.diffractionFanGroup.remove(this.diffractionFanMesh);
      this.diffractionFanGeo?.dispose();
      this.diffractionFanMat?.dispose();
      this.diffractionFanMesh = null;
      this.diffractionFanGeo = null;
      this.diffractionFanMat = null;
    }
    this.clearGratingOrders();
    for (const mesh of this.gratingOrderMeshes) {
      this.gratingOrdersGroup.remove(mesh);
      mesh.geometry.dispose();
    }
    for (const mat of this.gratingOrderMats) {
      mat.dispose();
    }
    this.gratingOrderMeshes = [];
    this.gratingOrderMats = [];
  }
}
