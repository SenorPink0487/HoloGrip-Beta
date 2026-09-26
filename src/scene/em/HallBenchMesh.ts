import * as THREE from 'three';
import { HallCarrierParticleSystem, type CarrierType } from './HallCarrierParticleSystem.ts';

export interface HallBenchMeshOptions {
  waferLength?: number;    // Along X (width)
  waferHeight?: number;    // Along Y (height)
  waferThickness?: number; // Along Z (thickness)
  waferWidth?: number;     // Backwards-compatible alias for waferHeight
}

export class HallBenchMesh {
  public group: THREE.Group;
  public particleSystem: HallCarrierParticleSystem;

  // Wafer mesh reference for click & hover interaction
  public waferMesh: THREE.Mesh;
  private waferMaterial: THREE.MeshPhysicalMaterial;

  // Crystal Chamber
  private chamberGroup: THREE.Group;
  private crystalBoxMesh: THREE.Mesh;
  private crystalMaterial: THREE.MeshPhysicalMaterial;

  // Magnetic field flux lines (5 sleek, slender holographic flux streamlines)
  private fluxArrowsGroup: THREE.Group;
  private fluxArrowMeshes: { group: THREE.Group; shaft: THREE.Mesh; cone: THREE.Mesh; baseY: number; baseZ: number }[] = [];
  private fluxArrowMat: THREE.MeshStandardMaterial;

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

  private disposables: { dispose: () => void }[] = [];

  constructor(options: HallBenchMeshOptions = {}) {
    this.group = new THREE.Group();
    this.group.name = 'HallBenchMesh';

    this.initMaterials();
    this.buildApparatus(options);
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
    // High-performance physical glass: uses forward specular clearcoat lobes instead of
    // transmission framebuffer copies, maintaining 60-120+ FPS with crystal-clear fidelity
    this.crystalMaterial = new THREE.MeshPhysicalMaterial({
      color: 0xf2f8ff,
      metalness: 0.04,
      roughness: 0.02,
      clearcoat: 1.0,
      clearcoatRoughness: 0.02,
      reflectivity: 0.95,
      transparent: true,
      opacity: 0.20,
      depthWrite: false,
    });
    this.disposables.push(this.crystalMaterial);

    // 4. Polished Semiconductor Wafer Specimen
    // High-performance translucent crystal without transmission buffer overhead
    this.waferMaterial = new THREE.MeshPhysicalMaterial({
      color: 0x162232, // Smoky sapphire tint for n-GaAs default
      metalness: 0.12,
      roughness: 0.04,
      clearcoat: 0.95,
      clearcoatRoughness: 0.03,
      reflectivity: 0.90,
      transparent: true,
      opacity: 0.28,
      depthWrite: false,
    });
    this.disposables.push(this.waferMaterial);

    // 5. Holographic Magnetic Flux Streamlines Material (Vivid Electric Cyan)
    this.fluxArrowMat = new THREE.MeshStandardMaterial({
      color: 0x00f0ff,
      emissive: 0x00d2ff,
      emissiveIntensity: 2.4,
      roughness: 0.12,
      metalness: 0.3,
      transparent: true,
      opacity: 0.85,
    });
    this.disposables.push(this.fluxArrowMat);
  }

  private buildApparatus(options: HallBenchMeshOptions): void {
    const waferL = options.waferLength ?? 0.32;
    const waferH = options.waferHeight ?? options.waferWidth ?? 0.125;
    const waferT = options.waferThickness ?? 0.032;
    const stageY = waferH * 0.5 + 0.015;

    // 1. Specimen Chamber & Clamping Electrodes
    this.buildSpecimenChamber(waferL, waferH, waferT, stageY);

    // 2. Quantum Carrier Particle System (Luminous wavepacket points)
    this.particleSystem = new HallCarrierParticleSystem({
      waferLength: waferL,
      waferHeight: waferH,
      waferThickness: waferT,
      particleCount: 180,
    });
    this.particleSystem.group.position.set(0, stageY, 0);
    this.group.add(this.particleSystem.group);

    // 3. Sleek Holographic Magnetic Flux Streamlines (Framing the specimen without blocking view)
    this.buildPiercingFluxArrows(waferL, waferH, waferT, stageY);

    // 4. Subtle internal chamber point light for luminous glow
    this.chamberLight = new THREE.PointLight(0x00f0ff, 1.2, 0.45);
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

    // 2. Inner Semiconductor Wafer (Interactive Target)
    const waferGeo = new THREE.BoxGeometry(waferL, waferH, waferT);
    this.disposables.push(waferGeo);

    this.waferMesh = new THREE.Mesh(waferGeo, this.waferMaterial);
    this.waferMesh.name = 'HallWafer';
    this.waferMesh.position.set(0, stageY, 0);
    this.chamberGroup.add(this.waferMesh);

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

    // 5 sleek, slender holographic flux streamlines
    const arrowCount = 5;
    const spanX = waferL * 0.72;
    const spacing = spanX / (arrowCount - 1);
    const startX = -spanX / 2;

    // Placed slightly lower than center to provide clear sightline to carrier flow
    const arrowY = stageY - waferH * 0.26;

    const shaftRadius = 0.0010; // Sleek hairline streamline
    const shaftLen = 0.088;
    const coneRadius = 0.0034;  // Delicate aerodynamic arrow tip
    const coneHeight = 0.010;

    const shaftGeo = new THREE.CylinderGeometry(shaftRadius, shaftRadius, shaftLen, 12);
    const coneGeo = new THREE.ConeGeometry(coneRadius, coneHeight, 16);
    this.disposables.push(shaftGeo, coneGeo);

    for (let i = 0; i < arrowCount; i++) {
      const x = startX + i * spacing;
      const arrowGroup = new THREE.Group();
      arrowGroup.position.set(x, arrowY, 0);

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
      this.fluxArrowMeshes.push({ group: arrowGroup, shaft, cone, baseY: arrowY, baseZ: 0 });
    }
  }

  public setWaferAppearance(materialKey: string): void {
    if (materialKey === 'n-gaas') {
      this.waferMaterial.color.setHex(0x162232); // Smoky obsidian sapphire
      this.waferMaterial.opacity = 0.28;
      this.waferMaterial.metalness = 0.12;
      this.waferMaterial.roughness = 0.04;
      if (this.chamberLight) this.chamberLight.color.setHex(0x00f0ff);
    } else if (materialKey === 'p-silicon') {
      this.waferMaterial.color.setHex(0x141d2a); // Deep crystalline silicon indigo
      this.waferMaterial.opacity = 0.30;
      this.waferMaterial.metalness = 0.15;
      this.waferMaterial.roughness = 0.04;
      if (this.chamberLight) this.chamberLight.color.setHex(0xff9f0a);
    } else if (materialKey === 'copper') {
      this.waferMaterial.color.setHex(0xc86d48); // Polished metallic rose copper
      this.waferMaterial.opacity = 0.65;
      this.waferMaterial.metalness = 0.85;
      this.waferMaterial.roughness = 0.18;
      if (this.chamberLight) this.chamberLight.color.setHex(0x64d2ff);
    }
  }

  public setToggles(showVectors: boolean, showParticles: boolean): void {
    this.particleSystem.setToggles(showVectors, showParticles);
    this.fluxArrowsGroup.visible = showVectors;
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
    const isDifferent =
      Math.abs(this.lastB - bTesla) > 0.005 ||
      Math.abs(this.lastI - currentMa) > 0.1 ||
      Math.abs(this.lastVh - vhMv) > 0.05 ||
      this.lastMaterial !== materialName ||
      this.lastCarrierType !== carrierType;

    if (isDifferent) {
      this.lastB = bTesla;
      this.lastI = currentMa;
      this.lastVh = vhMv;
      this.lastMaterial = materialName;
      this.lastCarrierType = carrierType;

      // Update Holographic Magnetic Flux Streamlines
      const bSign = bTesla >= 0 ? 1 : -1;
      const bMag = Math.abs(bTesla);
      const arrowVisible = bMag > 0.02;
      this.fluxArrowsGroup.visible = arrowVisible;

      if (arrowVisible) {
        const shaftLen = 0.088 * THREE.MathUtils.clamp(bMag / 1.0, 0.45, 1.15);
        const coneHeight = 0.010;
        for (const item of this.fluxArrowMeshes) {
          item.cone.position.set(0, 0, bSign * (shaftLen * 0.5 + coneHeight * 0.5));
          item.cone.rotation.x = (bSign * Math.PI) / 2;
          item.shaft.scale.set(1, THREE.MathUtils.clamp(bMag / 0.8, 0.5, 1.2), 1);
        }
      }

      this.particleSystem.setPhysicsState(currentMa, bTesla, vhMv, carrierType);
    }
  }

  public update(delta: number): void {
    this.particleSystem.update(delta);

    // Subtle magnetic flux pulse animation when field is present
    if (this.fluxArrowsGroup.visible && Math.abs(this.lastB) > 0.05) {
      const pulse = 1.8 + Math.sin(performance.now() * 0.004) * 0.5;
      this.fluxArrowMat.emissiveIntensity = pulse;
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
