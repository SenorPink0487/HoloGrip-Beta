import * as THREE from 'three';
import { OpticalPhysics, type DispersionRay } from './OpticalPhysics.ts';

export interface BeamSegment {
  start: THREE.Vector3;
  end: THREE.Vector3;
  intensity?: number;
}

// 模块级预分配暂存对象，消除逐帧垃圾回收（GC）开销
const _UP_VEC = new THREE.Vector3(0, 1, 0);
const _DIR_VEC = new THREE.Vector3();
const _MID_VEC = new THREE.Vector3();
const _QUAT = new THREE.Quaternion();
const _WHITE_COLOR = new THREE.Color(0xffffff);
const _P_START = new THREE.Vector3();
const _P_END = new THREE.Vector3();

export class OpticalBeamSystem {
  public readonly group = new THREE.Group();

  // 多段激光光束支持（激光器 -> 元件1 -> 元件2 -> 观测屏）
  private maxSegments = 4;
  private segmentCores: THREE.Mesh[] = [];
  private segmentGlows: THREE.Mesh[] = [];
  private segmentHalos: THREE.Mesh[] = [];
  private segmentCoreMats: THREE.MeshBasicMaterial[] = [];
  private segmentGlowMats: THREE.MeshBasicMaterial[] = [];
  private segmentHaloMats: THREE.MeshBasicMaterial[] = [];

  // 保持向后兼容的第 0 光段直接引用
  public coreBeamMesh: THREE.Mesh;
  public glowBeamMesh: THREE.Mesh;
  public coreBeamMat: THREE.MeshBasicMaterial;
  public glowBeamMat: THREE.MeshBasicMaterial;

  private dispersionGroup = new THREE.Group();
  private waveVectorGroup = new THREE.Group();
  private waveFrontsGroup = new THREE.Group();
  private diffractionFanGroup = new THREE.Group();
  private gratingOrdersGroup = new THREE.Group();

  // 预分配的 3D 相干波前圆弧线段缓冲区（杨氏双缝与单缝衍射）
  private wavefrontLines: THREE.LineSegments | null = null;
  private wavefrontGeo: THREE.BufferGeometry | null = null;
  private wavefrontPositions: Float32Array | null = null;
  private wavefrontColors: Float32Array | null = null;
  private wavefrontMat: THREE.LineBasicMaterial | null = null;

  // 衍射光强包络扇形网格
  private diffractionFanMesh: THREE.Mesh | null = null;
  private diffractionFanGeo: THREE.BufferGeometry | null = null;
  private diffractionFanMat: THREE.MeshBasicMaterial | null = null;
  private lastFanZStart = -999;
  private lastFanZEnd = -999;
  private lastFanHalfWidth = -999;
  private cachedWorkerDispersionRays: DispersionRay[] = [];

  // 光栅各分立级次衍射光束
  private gratingOrderMeshes: THREE.Mesh[] = [];
  private gratingOrderMats: THREE.MeshBasicMaterial[] = [];

  // 预分配的 3D 偏振矢量波线段缓冲区
  private waveVectorLines: THREE.LineSegments | null = null;
  private waveVectorGeo: THREE.BufferGeometry | null = null;
  private waveVectorPositions: Float32Array | null = null;
  private waveVectorColors: Float32Array | null = null;

  // 七色色散光谱光线配置（红、橙、黄、绿、青、蓝、紫）
  public readonly spectrumConfigs = [
    { wl: 680, hex: 0xff2222 }, // 红光
    { wl: 610, hex: 0xff7700 }, // 橙光
    { wl: 575, hex: 0xffdd00 }, // 黄光
    { wl: 530, hex: 0x00ff44 }, // 绿光
    { wl: 480, hex: 0x00d4ff }, // 青光
    { wl: 440, hex: 0x2255ff }, // 蓝光
    { wl: 405, hex: 0x8822ff }, // 紫光
  ];

  // 预分配色散光线网格：[光线索引 0..6][光段索引 0..1]
  // 光段 0：棱镜内部（入射点 pEnter -> 出射点 pExit）
  // 光段 1：棱镜出射至屏幕（出射点 pExit -> 屏落点 pScreen）
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
    this.dispersionGroup.visible = false;
    this.waveVectorGroup.visible = false;
    this.waveFrontsGroup.visible = false;
    this.diffractionFanGroup.visible = false;
    this.gratingOrdersGroup.visible = false;
    this.updateWavelength(wavelength);
  }

  private initDispersionMeshes(): void {
    const coreRadius = 0.0007; // 直径 1.4mm 的清晰中心光纤
    const glowRadius = 0.0022; // 直径 4.4mm 的饱和光谱辉光

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
    const coreRadius = 0.0009; // 直径 1.8mm 的高亮激光纤芯
    const glowRadius = 0.0035; // 直径 7.0mm 的内层体积散射光晕
    const haloRadius = 0.0080; // 直径 16.0mm 的外层环境漫射光圈

    const coreGeo = new THREE.CylinderGeometry(coreRadius, coreRadius, 1.0, 16);
    const glowGeo = new THREE.CylinderGeometry(glowRadius, glowRadius, 1.0, 16);
    const haloGeo = new THREE.CylinderGeometry(haloRadius, haloRadius, 1.0, 16);

    for (let i = 0; i < this.maxSegments; i++) {
      // 1. 高亮度激光纤芯（加法混合，近纯白芯层）
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

      // 2. 饱和体积散射辉光
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

      // 3. 环境漫射光晕
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
    // 芯层混合高亮度白色
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
   * 渲染穿过棱镜的多光谱彩虹色散光束（零分配 / 预分配对象池）
   */
  public updateDispersionRays(rays: DispersionRay[]): void {
    // 若存在光线，渲染从入射点到棱镜表面的入射光束
    if (rays.length > 0 && rays[0].points.length >= 2 && this.intensity > 0.001) {
      const pIn = rays[0].points[0];
      const pEnter = rays[0].points[1];
      this.updateSegmentedBeam([{ start: pIn, end: pEnter, intensity: this.intensity }]);
      this.dispersionGroup.visible = true;
    } else {
      this.dispersionGroup.visible = false;
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

          // 1. 棱镜内部光段（pEnter -> pExit）
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

          // 2. 棱镜出射至屏幕光段（pExit -> pScreen）
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
    this.dispersionGroup.visible = false;
  }

  /**
   * 应用 Worker 计算的多光谱色散光线数据（零分配桥接）
   */
  public updateDispersionRaysFromWorker(raysData: Array<{
    wavelengthNm: number;
    colorRgb: [number, number, number];
    points: [number, number, number][];
  }>): void {
    while (this.cachedWorkerDispersionRays.length < raysData.length) {
      this.cachedWorkerDispersionRays.push({
        wavelengthNm: 550,
        color: new THREE.Color(),
        refractiveIndex: 1.54,
        deviationAngleRad: 0,
        points: [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()],
      });
    }

    for (let i = 0; i < raysData.length; i++) {
      const src = raysData[i];
      const target = this.cachedWorkerDispersionRays[i];
      target.wavelengthNm = src.wavelengthNm;
      target.color.setRGB(src.colorRgb[0], src.colorRgb[1], src.colorRgb[2]);
      while (target.points.length < src.points.length) {
        target.points.push(new THREE.Vector3());
      }
      target.points.length = src.points.length;
      for (let p = 0; p < src.points.length; p++) {
        target.points[p].set(src.points[p][0], src.points[p][1], src.points[p][2]);
      }
    }
    this.cachedWorkerDispersionRays.length = raysData.length;
    this.updateDispersionRays(this.cachedWorkerDispersionRays);
  }

  /**
   * 直接应用多核 Worker 预计算的 3D 偏振波矢量缓冲区
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
      const posAttr = new THREE.BufferAttribute(this.waveVectorPositions, 3);
      posAttr.setUsage(THREE.DynamicDrawUsage);
      this.waveVectorGeo.setAttribute('position', posAttr);

      const colAttr = new THREE.BufferAttribute(this.waveVectorColors, 3);
      colAttr.setUsage(THREE.DynamicDrawUsage);
      this.waveVectorGeo.setAttribute('color', colAttr);

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

    // 1. 复制场强矢量
    this.waveVectorPositions!.set(positions, 0);
    this.waveVectorColors!.set(colors, 0);

    // 2. 在矢量箭头端点之间连接连续空间波动曲线
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
    const isVis = this.intensity > 0.001;
    this.waveVectorLines!.visible = isVis;
    this.waveVectorGroup.visible = isVis;
  }

  /**
   * 构建带有连续波动包络的 3D 空间振荡电场矢量波
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
      const posAttr = new THREE.BufferAttribute(this.waveVectorPositions, 3);
      posAttr.setUsage(THREE.DynamicDrawUsage);
      this.waveVectorGeo.setAttribute('position', posAttr);

      const colAttr = new THREE.BufferAttribute(this.waveVectorColors, 3);
      colAttr.setUsage(THREE.DynamicDrawUsage);
      this.waveVectorGeo.setAttribute('color', colAttr);

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

    // 直接从已写入缓冲区连接相邻端点（零内存分配）
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
    const isVis = this.intensity > 0.001;
    this.waveVectorLines!.visible = isVis;
    this.waveVectorGroup.visible = isVis;
  }

  public clearWaveVectors(): void {
    if (this.waveVectorLines) {
      this.waveVectorLines.visible = false;
    }
    this.waveVectorGroup.visible = false;
  }

  /**
   * 构建杨氏双缝干涉的 3D 空间相干柱面波前。
   * 光波沿光轴（+Z 方向）从双缝向观测屏传播。
   * 加法混合在波峰相交处自然产生相长干涉亮纹。
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
      const posAttr = new THREE.BufferAttribute(this.wavefrontPositions, 3);
      posAttr.setUsage(THREE.DynamicDrawUsage);
      this.wavefrontGeo.setAttribute('position', posAttr);

      const colAttr = new THREE.BufferAttribute(this.wavefrontColors, 3);
      colAttr.setUsage(THREE.DynamicDrawUsage);
      this.wavefrontGeo.setAttribute('color', colAttr);

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

    // 视觉双缝间距（清晰展现两个相干点光源）
    const dVis = Math.max(0.012, Math.min(0.024, slitSpacingMm * 0.06));
    const slitPositions = [-dVis * 0.5, dVis * 0.5];

    const rMin = 0.02;
    const rMax = Math.max(0.08, screenZ - slitZ - 0.01);
    const rSpan = rMax - rMin;
    const ringSpacing = rSpan / numRingsPerSlit;
    const waveSpeed = 0.16; // 16 cm/s 波纹传播速度

    const thetaMax = 0.65; // 沿 X 方向向 +Z 展开约 37 度的弧度角
    const slitEmitterZ = slitZ + 0.008;

    for (const sx of slitPositions) {
      for (let ring = 0; ring < numRingsPerSlit; ring++) {
        // 连续平滑向外传播
        const r = rMin + ((ring * ringSpacing + time * waveSpeed) % rSpan);

        // 双缝附近平滑淡入，屏幕附近平滑淡出
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

          // 线段起点
          pos[vIdx++] = xA;
          pos[vIdx++] = beamY;
          pos[vIdx++] = zA;

          col[cIdx++] = cr;
          col[cIdx++] = cg;
          col[cIdx++] = cb;

          // 线段终点
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
   * 构建单缝衍射的 3D 空间柱面波前
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
      const posAttr = new THREE.BufferAttribute(this.wavefrontPositions, 3);
      posAttr.setUsage(THREE.DynamicDrawUsage);
      this.wavefrontGeo.setAttribute('position', posAttr);

      const colAttr = new THREE.BufferAttribute(this.wavefrontColors, 3);
      colAttr.setUsage(THREE.DynamicDrawUsage);
      this.wavefrontGeo.setAttribute('color', colAttr);

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
   * 连接光阑孔径与屏上干涉条纹轮廓的衍射光体积包络扇面
   */
  public updateDiffractionFan(slitZ: number, screenZ: number, halfWidth: number, intensity = 1.0): void {
    const beamY = 0.186;
    const startZ = slitZ + 0.008;
    const endZ = screenZ - 0.006;
    const baseColor = OpticalPhysics.wavelengthToColor(this.wavelengthNm);
    const halfHeight = 0.010; // 20mm 垂直狭缝高度

    if (!this.diffractionFanMesh) {
      const geo = new THREE.BufferGeometry();
      const positions = new Float32Array([
        // 水平中心扇面
        0, beamY, startZ,
        -halfWidth, beamY, endZ,
        halfWidth, beamY, endZ,

        // 顶部斜面
        0, beamY + halfHeight * 0.4, startZ,
        -halfWidth * 0.85, beamY + halfHeight, endZ,
        halfWidth * 0.85, beamY + halfHeight, endZ,

        // 底部斜面
        0, beamY - halfHeight * 0.4, startZ,
        halfWidth * 0.85, beamY - halfHeight, endZ,
        -halfWidth * 0.85, beamY - halfHeight, endZ,

        // 左侧翼面
        0, beamY + halfHeight * 0.4, startZ,
        0, beamY - halfHeight * 0.4, startZ,
        -halfWidth, beamY, endZ,

        // 右侧翼面
        0, beamY + halfHeight * 0.4, startZ,
        halfWidth, beamY, endZ,
        0, beamY - halfHeight * 0.4, startZ,
      ]);
      const posAttr = new THREE.BufferAttribute(positions, 3);
      posAttr.setUsage(THREE.DynamicDrawUsage);
      geo.setAttribute('position', posAttr);
      this.diffractionFanGeo = geo;
      this.lastFanZStart = startZ;
      this.lastFanZEnd = endZ;
      this.lastFanHalfWidth = halfWidth;

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
      const isFanGeometryDifferent =
        Math.abs(this.lastFanZStart - startZ) > 1e-4 ||
        Math.abs(this.lastFanZEnd - endZ) > 1e-4 ||
        Math.abs(this.lastFanHalfWidth - halfWidth) > 1e-4;

      if (isFanGeometryDifferent) {
        this.lastFanZStart = startZ;
        this.lastFanZEnd = endZ;
        this.lastFanHalfWidth = halfWidth;

        const pos = (this.diffractionFanGeo!.getAttribute('position') as THREE.BufferAttribute).array as Float32Array;
        // 中心扇面
        pos[0] = 0; pos[1] = beamY; pos[2] = startZ;
        pos[3] = -halfWidth; pos[4] = beamY; pos[5] = endZ;
        pos[6] = halfWidth; pos[7] = beamY; pos[8] = endZ;

        // 顶部斜面
        pos[9] = 0; pos[10] = beamY + halfHeight * 0.4; pos[11] = startZ;
        pos[12] = -halfWidth * 0.85; pos[13] = beamY + halfHeight; pos[14] = endZ;
        pos[15] = halfWidth * 0.85; pos[16] = beamY + halfHeight; pos[17] = endZ;

        // 底部斜面
        pos[18] = 0; pos[19] = beamY - halfHeight * 0.4; pos[20] = startZ;
        pos[21] = halfWidth * 0.85; pos[22] = beamY - halfHeight; pos[23] = endZ;
        pos[24] = -halfWidth * 0.85; pos[25] = beamY - halfHeight; pos[26] = endZ;

        // 左侧翼面
        pos[27] = 0; pos[28] = beamY + halfHeight * 0.4; pos[29] = startZ;
        pos[30] = 0; pos[31] = beamY - halfHeight * 0.4; pos[32] = startZ;
        pos[33] = -halfWidth; pos[34] = beamY; pos[35] = endZ;

        // 右侧翼面
        pos[36] = 0; pos[37] = beamY + halfHeight * 0.4; pos[38] = startZ;
        pos[39] = halfWidth; pos[40] = beamY; pos[41] = endZ;
        pos[42] = 0; pos[43] = beamY - halfHeight * 0.4; pos[44] = startZ;

        this.diffractionFanGeo!.getAttribute('position').needsUpdate = true;
      }
      this.diffractionFanMat!.color.copy(baseColor);
    }

    const effIntensity = this.intensity * intensity;
    this.diffractionFanMat!.opacity = effIntensity * 0.16;
    const isFanVis = effIntensity > 0.001;
    this.diffractionFanMesh.visible = isFanVis;
    this.diffractionFanGroup.visible = isFanVis;
  }

  public clearDiffractionFan(): void {
    if (this.diffractionFanMesh) {
      this.diffractionFanMesh.visible = false;
    }
    this.diffractionFanGroup.visible = false;
  }

  /**
   * 衍射光栅的分立级次衍射光线（m = 0, ±1, ±2）
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
    this.gratingOrdersGroup.visible = this.intensity * intensity > 0.001;
  }

  public clearGratingOrders(): void {
    for (const mesh of this.gratingOrderMeshes) {
      mesh.visible = false;
    }
    this.gratingOrdersGroup.visible = false;
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
