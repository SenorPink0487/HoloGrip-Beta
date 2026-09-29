import * as THREE from 'three';
import { HallCarrierParticleSystem, type CarrierType } from './HallCarrierParticleSystem.ts';
import type { ComputeBridge } from '../../core/platform/ComputeBridge.ts';

export interface HallBenchMeshOptions {
  waferLength?: number;    // Along X (width)
  waferHeight?: number;    // Along Y (height)
  waferThickness?: number; // Along Z (thickness)
  waferWidth?: number;     // Backwards-compatible alias for waferHeight
  computeBridge?: ComputeBridge;
}

export class HallBenchMesh {
  public group: THREE.Group;
  public particleSystem: HallCarrierParticleSystem;

  // Wafer mesh reference for click & hover interaction
  public waferMesh: THREE.Mesh;
  private waferMaterial: THREE.MeshStandardMaterial;

  // Solid Physical Semiconductor Substrate (Non-transparent crystal base)
  public substrateMesh: THREE.Mesh;
  private substrateMaterial: THREE.MeshStandardMaterial;
  private substrateTextures: Record<string, THREE.CanvasTexture> = {};

  // Crystal Chamber
  private chamberGroup: THREE.Group;
  private crystalBoxMesh: THREE.Mesh;
  private crystalMaterial: THREE.MeshStandardMaterial;

  // Magnetic field flux lines (holographic flux streamlines strictly driven by B)
  private fluxArrowsGroup: THREE.Group;
  private fluxArrowMeshes: { group: THREE.Group; shaft: THREE.Mesh; cone: THREE.Mesh; baseY: number; baseZ: number }[] = [];
  private fluxArrowMat: THREE.MeshStandardMaterial;
  private showVectors = true;
  private waferLength = 0.32;
  private waferHeight = 0.125;
  private waferThickness = 0.032;
  private stageY = 0;
  private arrowY = 0;

  // Internal chamber illumination light
  private chamberLight: THREE.PointLight;

  // Ohmic Clamping Blocks (Left & Right)
  private leftClampGroup: THREE.Group;
  private rightClampGroup: THREE.Group;

  // Transverse Hall Voltage Probe Contacts (Top & Bottom Center)
  private topProbeMesh: THREE.Mesh;
  private bottomProbeMesh: THREE.Mesh;

  // Materials
  private titaniumMat: THREE.MeshStandardMaterial;
  private goldMat: THREE.MeshStandardMaterial;

  // State cache
  private lastB = -9999;
  private lastI = -9999;
  private lastVh = -9999;
  private lastMaterial = '';
  private lastCarrierType: CarrierType = 'electron';
  private fluxPulsePhase = 0;

  private disposables: { dispose: () => void }[] = [];

  constructor(options: HallBenchMeshOptions = {}) {
    this.group = new THREE.Group();
    this.group.name = 'HallBenchMesh';

    this.initMaterials();
    this.buildApparatus(options);
  }

  public setComputeBridge(bridge: ComputeBridge): void {
    this.particleSystem.setComputeBridge(bridge);
  }

  private initMaterials(): void {
    // 1. Brushed Aerospace Titanium (Electrodes & Mounts)
    this.titaniumMat = new THREE.MeshStandardMaterial({
      color: 0x242a35,
      metalness: 0.88,
      roughness: 0.22,
    });
    this.disposables.push(this.titaniumMat);

    // 2. High-Purity Polished Gold (Ohmic Shims & Voltage Sensing Probes)
    this.goldMat = new THREE.MeshStandardMaterial({
      color: 0xd4af37,
      metalness: 0.95,
      roughness: 0.15,
    });
    this.disposables.push(this.goldMat);

    // 3. Optical Quartz Specimen Chamber
    // High-performance crystal-clear quartz with ultra-clean transmission without milky haze
    this.crystalMaterial = new THREE.MeshStandardMaterial({
      color: 0x8ec5fc,
      metalness: 0.10,
      roughness: 0.08,
      transparent: true,
      opacity: 0.08,
      depthWrite: false,
    });
    this.disposables.push(this.crystalMaterial);

    // 4. Polished Semiconductor Wafer Front Window
    this.waferMaterial = new THREE.MeshStandardMaterial({
      color: 0x162c42,
      metalness: 0.12,
      roughness: 0.06,
      transparent: true,
      opacity: 0.18,
      depthWrite: false,
    });
    this.disposables.push(this.waferMaterial);

    // 4b. Solid Opaque Semiconductor Crystal Substrate (Non-transparent physical base)
    this.substrateMaterial = new THREE.MeshStandardMaterial({
      color: 0x111c29,
      metalness: 0.82,
      roughness: 0.28,
      transparent: false,
    });
    this.disposables.push(this.substrateMaterial);
    this.initSubstrateTextures();

    // 5. Holographic Magnetic Flux Streamlines Material (Deep Vivid Electric Azure)
    this.fluxArrowMat = new THREE.MeshStandardMaterial({
      color: 0x0066ff,
      emissive: 0x0044cc,
      emissiveIntensity: 0.60,
      roughness: 0.18,
      metalness: 0.35,
      transparent: false,
    });
    this.disposables.push(this.fluxArrowMat);
  }

  private initSubstrateTextures(): void {
    this.substrateTextures['n-gaas'] = this.createSubstrateTexture(
      'n-GaAs (100) SINGLE CRYSTAL WAFER',
      'HIGH-MOBILITY ELECTRON CHANNEL | Nd = 1.25e21 m⁻³',
      '#0e1926',
      '#38bdf8',
      'rgba(56, 189, 248, 0.10)'
    );

    this.substrateTextures['p-silicon'] = this.createSubstrateTexture(
      'p-Si (111) MONOCRYSTALLINE SUBSTRATE',
      'HOLE-DOMINANT TRANSPORT CHANNEL | Na = 2.50e21 m⁻³',
      '#1c130b',
      '#fb923c',
      'rgba(251, 146, 60, 0.10)'
    );

    this.substrateTextures['copper'] = this.createSubstrateTexture(
      'HIGH-PURITY PURPLE COPPER FILM (99.99%)',
      'FERMI SURFACE CONDUCTION BAND | n = 8.49e28 m⁻³',
      '#662916',
      '#fca5a5',
      'rgba(254, 202, 202, 0.12)'
    );

    this.substrateMaterial.map = this.substrateTextures['n-gaas'];
    this.disposables.push(
      this.substrateTextures['n-gaas'],
      this.substrateTextures['p-silicon'],
      this.substrateTextures['copper']
    );
  }

  private createSubstrateTexture(
    title: string,
    subTitle: string,
    baseColor: string,
    accentColor: string,
    gridColor: string
  ): THREE.CanvasTexture {
    const width = 512;
    const height = 256;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');

    if (ctx && typeof ctx.fillRect === 'function') {
      // 1. Base semiconductor crystal fill
      ctx.fillStyle = baseColor;
      ctx.fillRect(0, 0, width, height);

      // 2. Subtle brushed / anisotropic semiconductor crystal gradient
      if (typeof ctx.createLinearGradient === 'function') {
        const grad = ctx.createLinearGradient(0, 0, width, height);
        grad.addColorStop(0.0, 'rgba(255, 255, 255, 0.05)');
        grad.addColorStop(0.3, 'rgba(255, 255, 255, 0.01)');
        grad.addColorStop(0.7, 'rgba(0, 0, 0, 0.15)');
        grad.addColorStop(1.0, 'rgba(0, 0, 0, 0.28)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, width, height);
      }

      // 3. Precision laser-etched semiconductor coordinate grid
      ctx.strokeStyle = gridColor;
      ctx.lineWidth = 1.0;
      const step = 32;
      for (let x = step; x < width; x += step) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }
      for (let y = step; y < height; y += step) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }

      // 4. Center fiducial alignment crosshair [100] / [010]
      const cx = width / 2;
      const cy = height / 2;
      ctx.strokeStyle = accentColor;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(cx - 24, cy);
      ctx.lineTo(cx + 24, cy);
      ctx.moveTo(cx, cy - 24);
      ctx.lineTo(cx, cy + 24);
      ctx.stroke();

      if (typeof ctx.arc === 'function') {
        ctx.beginPath();
        ctx.arc(cx, cy, 14, 0, Math.PI * 2);
        ctx.stroke();
      }

      // 5. Authentic semiconductor wafer markings & technical typography
      if (typeof ctx.fillText === 'function') {
        ctx.fillStyle = accentColor;
        ctx.font = '600 13px -apple-system, BlinkMacSystemFont, "SF Pro Text", monospace';
        ctx.textAlign = 'left';
        ctx.fillText(title, 20, 30);

        ctx.font = '400 11px -apple-system, BlinkMacSystemFont, "SF Pro Text", monospace';
        ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
        ctx.fillText(subTitle, 20, 48);

        // Millimeter scale markings along bottom
        ctx.textAlign = 'center';
        ctx.font = '500 10px monospace';
        ctx.fillText('-4mm', step * 2, height - 12);
        ctx.fillText('-2mm', step * 5, height - 12);
        ctx.fillText('0', cx, height - 12);
        ctx.fillText('+2mm', width - step * 5, height - 12);
        ctx.fillText('+4mm', width - step * 2, height - 12);
      }

      // 6. Perimeter beveled border
      if (typeof ctx.strokeRect === 'function') {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
        ctx.lineWidth = 2.0;
        ctx.strokeRect(1, 1, width - 2, height - 2);
      }
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    return tex;
  }

  private buildApparatus(options: HallBenchMeshOptions): void {
    this.waferLength = options.waferLength ?? 0.32;
    this.waferHeight = options.waferHeight ?? options.waferWidth ?? 0.125;
    this.waferThickness = options.waferThickness ?? 0.032;
    this.stageY = this.waferHeight * 0.5 + 0.015;
    this.arrowY = this.stageY - this.waferHeight * 0.26;

    const waferL = this.waferLength;
    const waferH = this.waferHeight;
    const waferT = this.waferThickness;
    const stageY = this.stageY;

    // 1. Specimen Chamber & Clamping Electrodes
    this.buildSpecimenChamber(waferL, waferH, waferT, stageY);

    // 2. Quantum Carrier Particle System (Luminous wavepacket points)
    this.particleSystem = new HallCarrierParticleSystem({
      waferLength: waferL,
      waferHeight: waferH,
      waferThickness: waferT,
      particleCount: 180,
      computeBridge: options.computeBridge,
    });
    this.particleSystem.group.position.set(0, stageY, 0);
    this.group.add(this.particleSystem.group);

    // 3. Sleek Holographic Magnetic Flux Streamlines (Framing the specimen without blocking view)
    this.buildPiercingFluxArrows(waferL, waferH, waferT, stageY);

    // 4. Subtle internal chamber point light for luminous glow
    this.chamberLight = new THREE.PointLight(0x00f0ff, 0.45, 0.45);
    this.chamberLight.position.set(0, stageY, 0);
    this.group.add(this.chamberLight);
  }

  private buildSpecimenChamber(waferL: number, waferH: number, waferT: number, stageY: number): void {
    this.chamberGroup = new THREE.Group();
    this.chamberGroup.name = 'SpecimenChamber';
    this.group.add(this.chamberGroup);

    const chamberW = waferL + 0.016;
    const chamberH = waferH + 0.012;
    const chamberT = waferT + 0.010;

    // 1. Crystal-clear outer enclosure box
    const crystalGeo = new THREE.BoxGeometry(chamberW, chamberH, chamberT);
    this.disposables.push(crystalGeo);

    this.crystalBoxMesh = new THREE.Mesh(crystalGeo, this.crystalMaterial);
    this.crystalBoxMesh.position.set(0, stageY, 0);
    this.crystalBoxMesh.renderOrder = 2;
    this.chamberGroup.add(this.crystalBoxMesh);

    // Delicate luminescent beveled chamfer lines
    const wireGeo = new THREE.EdgesGeometry(crystalGeo);
    this.disposables.push(wireGeo);
    const wireMat = new THREE.LineBasicMaterial({
      color: 0x00f0ff,
      transparent: true,
      opacity: 0.40,
      blending: THREE.AdditiveBlending,
    });
    this.disposables.push(wireMat);
    const wireMesh = new THREE.LineSegments(wireGeo, wireMat);
    wireMesh.position.set(0, stageY, 0);
    this.chamberGroup.add(wireMesh);

    // 2. Solid Physical Semiconductor Substrate (Opaque crystal backing plate)
    // Seated flush against the back face of the chamber, eliminating transparent glass appearance
    const subT = waferT * 0.35;
    const subZ = -waferT * 0.5 + subT * 0.5;
    const substrateGeo = new THREE.BoxGeometry(waferL * 0.998, waferH * 0.998, subT);
    this.disposables.push(substrateGeo);

    this.substrateMesh = new THREE.Mesh(substrateGeo, this.substrateMaterial);
    this.substrateMesh.name = 'HallSubstrate';
    this.substrateMesh.position.set(0, stageY, subZ);
    this.substrateMesh.renderOrder = 3;
    this.chamberGroup.add(this.substrateMesh);

    // Beveled substrate framing edges for precision crystal appearance
    const subEdgeGeo = new THREE.EdgesGeometry(substrateGeo);
    this.disposables.push(subEdgeGeo);
    const subEdgeMat = new THREE.LineBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.35,
    });
    this.disposables.push(subEdgeMat);
    const subEdgeMesh = new THREE.LineSegments(subEdgeGeo, subEdgeMat);
    subEdgeMesh.position.set(0, stageY, subZ);
    this.chamberGroup.add(subEdgeMesh);

    // 3. Active Conduction Channel & Inspection Crystal (Front Face)
    // Sits flush in front of the solid substrate, filling the remaining thickness
    const frontT = waferT - subT;
    const frontZ = subZ + subT * 0.5 + frontT * 0.5;
    const waferGeo = new THREE.BoxGeometry(waferL, waferH, frontT);
    this.disposables.push(waferGeo);

    this.waferMesh = new THREE.Mesh(waferGeo, this.waferMaterial);
    this.waferMesh.name = 'HallWafer';
    this.waferMesh.position.set(0, stageY, frontZ);
    this.waferMesh.renderOrder = 5;
    this.chamberGroup.add(this.waferMesh);

    // Crisp crystal channel edges
    const waferEdgeGeo = new THREE.EdgesGeometry(waferGeo);
    this.disposables.push(waferEdgeGeo);
    const waferEdgeMat = new THREE.LineBasicMaterial({
      color: 0x00f0ff,
      transparent: true,
      opacity: 0.45,
    });
    this.disposables.push(waferEdgeMat);
    const waferEdgeMesh = new THREE.LineSegments(waferEdgeGeo, waferEdgeMat);
    waferEdgeMesh.position.set(0, stageY, frontZ);
    this.chamberGroup.add(waferEdgeMesh);

    // 3. Precision Ohmic Clamping Terminal Blocks (Left & Right Ends)
    this.buildClampingElectrodes(chamberW, chamberH, chamberT, stageY);

    // 4. Precision Transverse Hall Voltage Sensing Probes (Top & Bottom Center)
    this.buildVoltageProbes(chamberH, stageY);
  }

  private buildClampingElectrodes(chamberW: number, chamberH: number, chamberT: number, stageY: number): void {
    const clampW = 0.016;
    const clampH = chamberH * 1.04;
    const clampT = chamberT * 1.10;

    const clampGeo = new THREE.BoxGeometry(clampW, clampH, clampT);
    const shimGeo = new THREE.BoxGeometry(0.002, clampH * 0.90, clampT * 0.90);
    const screwGeo = new THREE.CylinderGeometry(0.0025, 0.0025, 0.004, 12);
    this.disposables.push(clampGeo, shimGeo, screwGeo);

    const electrodeGroup = new THREE.Group();
    electrodeGroup.name = 'InstrumentPanel'; // Clicking toggles current polarity
    this.chamberGroup.add(electrodeGroup);

    // --- Left Electrode Block (+I terminal) ---
    this.leftClampGroup = new THREE.Group();
    const leftPosX = -chamberW * 0.5 - clampW * 0.5;
    this.leftClampGroup.position.set(leftPosX, stageY, 0);

    const leftBody = new THREE.Mesh(clampGeo, this.titaniumMat);
    this.leftClampGroup.add(leftBody);

    // Gold contact shim
    const leftShim = new THREE.Mesh(shimGeo, this.goldMat);
    leftShim.position.set(clampW * 0.5 + 0.001, 0, 0);
    this.leftClampGroup.add(leftShim);

    // Micro knurled terminal screws
    const leftScrew1 = new THREE.Mesh(screwGeo, this.goldMat);
    leftScrew1.rotation.z = Math.PI / 2;
    leftScrew1.position.set(-clampW * 0.5 - 0.002, clampH * 0.25, 0);
    const leftScrew2 = new THREE.Mesh(screwGeo, this.goldMat);
    leftScrew2.rotation.z = Math.PI / 2;
    leftScrew2.position.set(-clampW * 0.5 - 0.002, -clampH * 0.25, 0);
    this.leftClampGroup.add(leftScrew1, leftScrew2);

    electrodeGroup.add(this.leftClampGroup);

    // --- Right Electrode Block (-I terminal) ---
    this.rightClampGroup = new THREE.Group();
    const rightPosX = chamberW * 0.5 + clampW * 0.5;
    this.rightClampGroup.position.set(rightPosX, stageY, 0);

    const rightBody = new THREE.Mesh(clampGeo, this.titaniumMat);
    this.rightClampGroup.add(rightBody);

    // Gold contact shim
    const rightShim = new THREE.Mesh(shimGeo, this.goldMat);
    rightShim.position.set(-clampW * 0.5 - 0.001, 0, 0);
    this.rightClampGroup.add(rightShim);

    // Micro knurled terminal screws
    const rightScrew1 = new THREE.Mesh(screwGeo, this.goldMat);
    rightScrew1.rotation.z = Math.PI / 2;
    rightScrew1.position.set(clampW * 0.5 + 0.002, clampH * 0.25, 0);
    const rightScrew2 = new THREE.Mesh(screwGeo, this.goldMat);
    rightScrew2.rotation.z = Math.PI / 2;
    rightScrew2.position.set(clampW * 0.5 + 0.002, -clampH * 0.25, 0);
    this.rightClampGroup.add(rightScrew1, rightScrew2);

    electrodeGroup.add(this.rightClampGroup);
  }

  private buildVoltageProbes(chamberH: number, stageY: number): void {
    const probeGeo = new THREE.CylinderGeometry(0.0018, 0.0018, 0.012, 12);
    const tipGeo = new THREE.ConeGeometry(0.0022, 0.004, 12);
    this.disposables.push(probeGeo, tipGeo);

    // Top Hall Voltage Probe (+V_H sensing contact)
    const topProbeGroup = new THREE.Group();
    topProbeGroup.position.set(0, stageY + chamberH * 0.5 + 0.006, 0);

    this.topProbeMesh = new THREE.Mesh(probeGeo, this.goldMat);
    topProbeGroup.add(this.topProbeMesh);
    const topTip = new THREE.Mesh(tipGeo, this.goldMat);
    topTip.rotation.x = Math.PI;
    topTip.position.set(0, -0.007, 0);
    topProbeGroup.add(topTip);
    this.chamberGroup.add(topProbeGroup);

    // Bottom Hall Voltage Probe (-V_H sensing contact)
    const bottomProbeGroup = new THREE.Group();
    bottomProbeGroup.position.set(0, stageY - chamberH * 0.5 - 0.006, 0);

    this.bottomProbeMesh = new THREE.Mesh(probeGeo, this.goldMat);
    bottomProbeGroup.add(this.bottomProbeMesh);
    const bottomTip = new THREE.Mesh(tipGeo, this.goldMat);
    bottomTip.position.set(0, 0.007, 0);
    bottomProbeGroup.add(bottomTip);
    this.chamberGroup.add(bottomProbeGroup);
  }

  private buildPiercingFluxArrows(waferL: number, waferH: number, _waferT: number, stageY: number): void {
    this.fluxArrowsGroup = new THREE.Group();
    this.fluxArrowsGroup.name = 'ElectromagnetYoke'; // Clicking toggles magnetic polarity
    this.group.add(this.fluxArrowsGroup);

    this.arrowY = stageY - waferH * 0.26;
    const maxArrows = 11;
    const shaftRadius = 0.0022; // Sleek volumetric 3D streamline
    const shaftLen = 0.092;
    const coneRadius = 0.0055;  // Aerodynamic arrow tip
    const coneHeight = 0.015;

    const shaftGeo = new THREE.CylinderGeometry(shaftRadius, shaftRadius, shaftLen, 16);
    const coneGeo = new THREE.ConeGeometry(coneRadius, coneHeight, 16);
    this.disposables.push(shaftGeo, coneGeo);

    for (let i = 0; i < maxArrows; i++) {
      const arrowGroup = new THREE.Group();
      arrowGroup.position.set(0, this.arrowY, 0);

      // Slender shaft passing along Z
      const shaft = new THREE.Mesh(shaftGeo, this.fluxArrowMat);
      shaft.rotation.x = Math.PI / 2;
      arrowGroup.add(shaft);

      // Conical arrowhead at +Z end (pointing forward by default)
      const cone = new THREE.Mesh(coneGeo, this.fluxArrowMat);
      cone.rotation.x = Math.PI / 2;
      cone.position.set(0, 0, shaftLen * 0.5 + coneHeight * 0.5);
      arrowGroup.add(cone);

      this.fluxArrowsGroup.add(arrowGroup);
      this.fluxArrowMeshes.push({ group: arrowGroup, shaft, cone, baseY: this.arrowY, baseZ: 0 });
    }

    this.updateFluxArrows(0.5);
  }

  /**
   * Density of magnetic field lines represents magnetic induction B:
   * Higher |B| -> more arrows (higher flux density); B = 0 -> 0 arrows.
   * Strictly depends ONLY on B (unaffected by current I, thickness d, or material).
   */
  private getArrowCountForField(bTesla: number): number {
    const bMag = Math.abs(bTesla);
    if (bMag < 0.02) return 0;
    if (bMag < 0.12) return 1;
    if (bMag < 0.25) return 3;
    if (bMag < 0.45) return 5;
    if (bMag < 0.65) return 7;
    if (bMag < 0.85) return 9;
    return 11;
  }

  private updateFluxArrows(bTesla: number): void {
    const bMag = Math.abs(bTesla);
    const activeCount = this.getArrowCountForField(bTesla);
    const arrowVisible = this.showVectors && activeCount > 0;
    this.fluxArrowsGroup.visible = arrowVisible;

    if (!arrowVisible) {
      for (const item of this.fluxArrowMeshes) {
        item.group.visible = false;
      }
      return;
    }

    const bSign = bTesla >= 0 ? 1 : -1;
    const shaftLen = 0.092 * THREE.MathUtils.clamp(bMag / 0.8, 0.55, 1.15);
    const coneHeight = 0.015;
    const spanX = this.waferLength * 0.74;

    for (let i = 0; i < this.fluxArrowMeshes.length; i++) {
      const item = this.fluxArrowMeshes[i];
      if (i < activeCount) {
        item.group.visible = true;
        const x = activeCount === 1 ? 0 : -spanX * 0.5 + i * (spanX / (activeCount - 1));
        item.group.position.set(x, this.arrowY, 0);

        item.cone.position.set(0, 0, bSign * (shaftLen * 0.5 + coneHeight * 0.5));
        item.cone.rotation.x = (bSign * Math.PI) / 2;
        item.shaft.scale.set(1, THREE.MathUtils.clamp(bMag / 0.8, 0.5, 1.2), 1);
      } else {
        item.group.visible = false;
      }
    }
  }

  public setWaferAppearance(materialKey: string): void {
    if (materialKey === 'n-gaas') {
      this.waferMaterial.color.setHex(0x14344d); // Optical semiconductor blue-crystal tint
      this.waferMaterial.opacity = 0.32;
      this.waferMaterial.metalness = 0.25;
      this.waferMaterial.roughness = 0.10;
      if (this.substrateTextures['n-gaas']) {
        this.substrateMaterial.map = this.substrateTextures['n-gaas'];
        this.substrateMaterial.color.setHex(0x111c29);
        this.substrateMaterial.metalness = 0.82;
        this.substrateMaterial.roughness = 0.28;
        this.substrateMaterial.needsUpdate = true;
      }
      if (this.chamberLight) {
        this.chamberLight.color.setHex(0x00f5ff);
        this.chamberLight.intensity = 0.45;
      }
    } else if (materialKey === 'p-silicon') {
      this.waferMaterial.color.setHex(0x3d2212); // Warm optical semiconductor amber-smoke tint
      this.waferMaterial.opacity = 0.32;
      this.waferMaterial.metalness = 0.25;
      this.waferMaterial.roughness = 0.10;
      if (this.substrateTextures['p-silicon']) {
        this.substrateMaterial.map = this.substrateTextures['p-silicon'];
        this.substrateMaterial.color.setHex(0x211710);
        this.substrateMaterial.metalness = 0.82;
        this.substrateMaterial.roughness = 0.28;
        this.substrateMaterial.needsUpdate = true;
      }
      if (this.chamberLight) {
        this.chamberLight.color.setHex(0xff9500);
        this.chamberLight.intensity = 0.45;
      }
    } else if (materialKey === 'copper') {
      this.waferMaterial.color.setHex(0xb85d38); // Polished metallic rose copper
      this.waferMaterial.opacity = 0.52;
      this.waferMaterial.metalness = 0.85;
      this.waferMaterial.roughness = 0.18;
      if (this.substrateTextures['copper']) {
        this.substrateMaterial.map = this.substrateTextures['copper'];
        this.substrateMaterial.color.setHex(0x662916);
        this.substrateMaterial.metalness = 0.92;
        this.substrateMaterial.roughness = 0.16;
        this.substrateMaterial.needsUpdate = true;
      }
      if (this.chamberLight) {
        this.chamberLight.color.setHex(0x64d2ff);
        this.chamberLight.intensity = 0.35;
      }
    }
  }

  public setToggles(showVectors: boolean, showParticles: boolean): void {
    this.showVectors = showVectors;
    this.particleSystem.setToggles(showVectors, showParticles);
    this.updateFluxArrows(this.lastB);
  }

  public updateTelemetry(
    bTesla: number,
    currentMa: number,
    vhMv: number,
    materialName: string,
    carrierType: CarrierType,
    _nConcentration = 1.25e21,
    _thicknessMm = 0.50
  ): void {
    // 1. Magnetic flux arrows: strictly depend ONLY on B (unaffected by I, d, or material)
    const bChanged = Math.abs(this.lastB - bTesla) > 0.002;
    if (bChanged) {
      this.lastB = bTesla;
      this.updateFluxArrows(bTesla);
    }

    // 2. Carrier particle physics & surface charges: depend on (I, B, V_H, carrierType)
    const isDifferent =
      bChanged ||
      Math.abs(this.lastI - currentMa) > 0.02 ||
      Math.abs(this.lastVh - vhMv) > 0.005 ||
      this.lastMaterial !== materialName ||
      this.lastCarrierType !== carrierType;

    if (isDifferent) {
      this.lastI = currentMa;
      this.lastVh = vhMv;
      this.lastMaterial = materialName;
      this.lastCarrierType = carrierType;

      this.particleSystem.setPhysicsState(currentMa, bTesla, vhMv, carrierType);
    }
  }

  public update(delta: number): void {
    this.particleSystem.update(delta);

    // Subtle magnetic flux pulse animation when field is present (rich azure glow, no blowout)
    if (this.fluxArrowsGroup.visible && Math.abs(this.lastB) > 0.05) {
      this.fluxPulsePhase += delta * 4.0;
      this.fluxArrowMat.emissiveIntensity = 0.50 + Math.sin(this.fluxPulsePhase) * 0.20;
    }
  }

  public dispose(): void {
    this.particleSystem.dispose();
    for (const item of this.disposables) {
      item.dispose();
    }
    this.disposables = [];
  }
}
