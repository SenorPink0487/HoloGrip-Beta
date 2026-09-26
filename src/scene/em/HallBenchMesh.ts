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

  // Magnetic field flux arrows (row of 7 prominent piercing 3D arrows)
  private fluxArrowsGroup: THREE.Group;
  private fluxArrowMeshes: { group: THREE.Group; shaft: THREE.Mesh; cone: THREE.Mesh }[] = [];
  private fluxArrowMat: THREE.MeshStandardMaterial;

  // Internal chamber illumination light
  private chamberLight: THREE.PointLight;

  // Ohmic Clamping Blocks (Left & Right)
  private leftClamp: THREE.Mesh;
  private rightClamp: THREE.Mesh;

  // Materials
  private titaniumMat: THREE.MeshStandardMaterial;

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
    // 1. Dark Brushed Aerospace Titanium (Side Electrodes)
    this.titaniumMat = new THREE.MeshStandardMaterial({
      color: 0x222630,
      metalness: 0.90,
      roughness: 0.22,
    });
    this.disposables.push(this.titaniumMat);

    // 2. Crystal-Clear Optical Quartz Chamber (Ultra-high transparency)
    this.crystalMaterial = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      metalness: 0.0,
      roughness: 0.02,
      transparent: true,
      opacity: 0.16,
      transmission: 0.96,
      ior: 1.50,
      thickness: 0.032,
      clearcoat: 1.0,
      clearcoatRoughness: 0.02,
      depthWrite: false,
    });
    this.disposables.push(this.crystalMaterial);

    // 3. Translucent Semiconductor Wafer (Lightly tinted, highly transparent so particles shine through)
    this.waferMaterial = new THREE.MeshPhysicalMaterial({
      color: 0x1a2634, // Soft smoky sapphire tint (n-GaAs default)
      metalness: 0.10,
      roughness: 0.04,
      transparent: true,
      opacity: 0.22,
      transmission: 0.85,
      ior: 1.55,
      thickness: 0.024,
      clearcoat: 0.90,
      clearcoatRoughness: 0.03,
      depthWrite: false,
    });
    this.disposables.push(this.waferMaterial);

    // 4. Luminous Magnetic Flux Arrow Material (Vivid Electric Cyan)
    this.fluxArrowMat = new THREE.MeshStandardMaterial({
      color: 0x00f0ff,
      emissive: 0x00d2ff,
      emissiveIntensity: 2.8,
      roughness: 0.15,
      metalness: 0.4,
      transparent: true,
      opacity: 0.95,
    });
    this.disposables.push(this.fluxArrowMat);
  }

  private buildApparatus(options: HallBenchMeshOptions): void {
    const waferL = options.waferLength ?? 0.32;
    const waferH = options.waferHeight ?? options.waferWidth ?? 0.125;
    const waferT = options.waferThickness ?? 0.032;
    const stageY = waferH * 0.5 + 0.015;

    // 1. Crystal Specimen Chamber & Left/Right Electrode Plates
    this.buildSpecimenChamber(waferL, waferH, waferT, stageY);

    // 2. Carrier Particle System (Luminous green/amber particles & bold charge badges)
    this.particleSystem = new HallCarrierParticleSystem({
      waferLength: waferL,
      waferHeight: waferH,
      waferThickness: waferT,
      particleCount: 140,
    });
    this.particleSystem.group.position.set(0, stageY, 0);
    this.group.add(this.particleSystem.group);

    // 3. 7 Prominent, Bold 3D Magnetic Flux Arrows piercing through the slab
    this.buildPiercingFluxArrows(waferL, waferH, waferT, stageY);

    // 4. Subtle internal chamber point light for luminous glow
    this.chamberLight = new THREE.PointLight(0x00ff88, 1.2, 0.45);
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

    // Glowing edge lines for high-tech beveled glass outlines
    const wireGeo = new THREE.EdgesGeometry(crystalGeo);
    this.disposables.push(wireGeo);
    const wireMat = new THREE.LineBasicMaterial({
      color: 0x00f0ff,
      transparent: true,
      opacity: 0.65,
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

    // 3. Precision Ohmic Clamping Terminal Blocks (Left & Right Ends only)
    this.buildClampingElectrodes(chamberW, chamberH, chamberT, stageY);
  }

  private buildClampingElectrodes(chamberW: number, chamberH: number, chamberT: number, stageY: number): void {
    const clampW = 0.016;
    const clampH = chamberH * 1.02;
    const clampT = chamberT * 1.08;

    const clampGeo = new THREE.BoxGeometry(clampW, clampH, clampT);
    this.disposables.push(clampGeo);

    const electrodeGroup = new THREE.Group();
    electrodeGroup.name = 'InstrumentPanel'; // Allows click interaction to toggle current polarity
    this.chamberGroup.add(electrodeGroup);

    // Left Electrode Plate (+I end)
    this.leftClamp = new THREE.Mesh(clampGeo, this.titaniumMat);
    this.leftClamp.position.set(-chamberW * 0.5 - clampW * 0.5, stageY, 0);
    electrodeGroup.add(this.leftClamp);

    // Right Electrode Plate (-I end)
    this.rightClamp = new THREE.Mesh(clampGeo, this.titaniumMat);
    this.rightClamp.position.set(chamberW * 0.5 + clampW * 0.5, stageY, 0);
    electrodeGroup.add(this.rightClamp);
  }

  private buildPiercingFluxArrows(waferL: number, waferH: number, _waferT: number, stageY: number): void {
    this.fluxArrowsGroup = new THREE.Group();
    this.fluxArrowsGroup.name = 'ElectromagnetYoke';
    this.group.add(this.fluxArrowsGroup);

    // 7 bold, prominent piercing arrows pointing forward out of the slab
    const arrowCount = 7;
    const spanX = waferL * 0.80;
    const spacing = spanX / (arrowCount - 1);
    const startX = -spanX / 2;
    // Lower section of the slab matching reference image
    const arrowY = stageY - waferH * 0.22;

    const shaftRadius = 0.0035; // 2x thicker
    const shaftLen = 0.088;
    const coneRadius = 0.011;   // 2x wider
    const coneHeight = 0.024;

    const shaftGeo = new THREE.CylinderGeometry(shaftRadius, shaftRadius, shaftLen, 16);
    const coneGeo = new THREE.ConeGeometry(coneRadius, coneHeight, 20);
    this.disposables.push(shaftGeo, coneGeo);

    for (let i = 0; i < arrowCount; i++) {
      const x = startX + i * spacing;
      const arrowGroup = new THREE.Group();
      arrowGroup.position.set(x, arrowY, 0);

      // Shaft passing along Z
      const shaft = new THREE.Mesh(shaftGeo, this.fluxArrowMat);
      shaft.rotation.x = Math.PI / 2;
      arrowGroup.add(shaft);

      // Conical arrowhead at +Z end (pointing forward by default)
      const cone = new THREE.Mesh(coneGeo, this.fluxArrowMat);
      cone.rotation.x = Math.PI / 2;
      cone.position.set(0, 0, shaftLen * 0.5 + coneHeight * 0.5);
      arrowGroup.add(cone);

      this.fluxArrowsGroup.add(arrowGroup);
      this.fluxArrowMeshes.push({ group: arrowGroup, shaft, cone });
    }
  }

  public setWaferAppearance(materialKey: string): void {
    if (materialKey === 'n-gaas') {
      this.waferMaterial.color.setHex(0x1a2634); // Smoky sapphire tint
      this.waferMaterial.opacity = 0.22;
      this.waferMaterial.transmission = 0.85;
      if (this.chamberLight) this.chamberLight.color.setHex(0x00ff88);
    } else if (materialKey === 'p-silicon') {
      this.waferMaterial.color.setHex(0x142030); // Soft cyan navy tint
      this.waferMaterial.opacity = 0.25;
      this.waferMaterial.transmission = 0.85;
      if (this.chamberLight) this.chamberLight.color.setHex(0xffaa00);
    } else if (materialKey === 'copper') {
      this.waferMaterial.color.setHex(0xb86538); // Copper sheen
      this.waferMaterial.opacity = 0.50;
      this.waferMaterial.transmission = 0.55;
      if (this.chamberLight) this.chamberLight.color.setHex(0x00f0ff);
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

      // Update Piercing 3D Magnetic Flux Arrows
      const bSign = bTesla >= 0 ? 1 : -1;
      const bMag = Math.abs(bTesla);
      const arrowVisible = bMag > 0.02;
      this.fluxArrowsGroup.visible = arrowVisible;

      if (arrowVisible) {
        const shaftLen = 0.088 * THREE.MathUtils.clamp(bMag / 1.0, 0.4, 1.2);
        const coneHeight = 0.024;
        for (const item of this.fluxArrowMeshes) {
          // Point cone along +Z (towards viewer) if B > 0, or along -Z if B < 0
          item.cone.position.set(0, 0, bSign * (shaftLen * 0.5 + coneHeight * 0.5));
          item.cone.rotation.x = (bSign * Math.PI) / 2;
          item.shaft.scale.set(1, THREE.MathUtils.clamp(bMag / 0.8, 0.5, 1.2), 1);
        }
      }
    }

    this.particleSystem.setPhysicsState(currentMa, bTesla, vhMv, carrierType);
  }

  public update(delta: number): void {
    this.particleSystem.update(delta);
  }

  public dispose(): void {
    this.particleSystem.dispose();
    for (const item of this.disposables) {
      item.dispose();
    }
    this.disposables = [];
  }
}
