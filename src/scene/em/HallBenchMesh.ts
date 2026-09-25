import * as THREE from 'three';
import { HallCarrierParticleSystem, type CarrierType } from './HallCarrierParticleSystem.ts';

export interface HallBenchMeshOptions {
  waferLength?: number;
  waferThickness?: number;
  waferWidth?: number;
}

export class HallBenchMesh {
  public group: THREE.Group;
  public particleSystem: HallCarrierParticleSystem;

  // Wafer mesh reference
  public waferMesh: THREE.Mesh;
  private waferMaterial: THREE.MeshPhysicalMaterial;

  // Magnetic field flux line visualizer
  private fluxLinesGroup: THREE.Group;
  private fluxLinesMat: THREE.LineBasicMaterial;

  // Digital instrument panel on front bezel
  private displayCanvas: HTMLCanvasElement;
  private displayCtx: CanvasRenderingContext2D;
  private displayTexture: THREE.CanvasTexture;
  private displayMesh: THREE.Mesh;

  // Status & polarity LEDs
  private ledPositive: THREE.Mesh;
  private ledNegative: THREE.Mesh;
  private ledPosMat: THREE.MeshBasicMaterial;
  private ledNegMat: THREE.MeshBasicMaterial;

  // Pole piece coils & cores
  private upperPoleGroup: THREE.Group;
  private lowerPoleGroup: THREE.Group;

  // Materials pool
  private darkAnodizedMat: THREE.MeshStandardMaterial;
  private satinAluminumMat: THREE.MeshStandardMaterial;
  private brushedSteelMat: THREE.MeshStandardMaterial;
  private copperCoilMat: THREE.MeshStandardMaterial;
  private brassMat: THREE.MeshStandardMaterial;
  private goldTerminalMat: THREE.MeshStandardMaterial;

  // Render throttle cache for OLED
  private lastB = -9999;
  private lastI = -9999;
  private lastVh = -9999;
  private lastMaterial = '';
  private lastCarrier = '';
  private lastDisplayRenderTime = 0;

  private disposables: { dispose: () => void }[] = [];

  constructor(options: HallBenchMeshOptions = {}) {
    this.group = new THREE.Group();
    this.group.name = 'HallBenchMesh';

    this.initMaterials();
    this.buildApparatus(options);
    this.initDisplayPanel();
  }

  private initMaterials(): void {
    // 1. Dark Hard-Anodized Aerospace Aluminum
    this.darkAnodizedMat = new THREE.MeshStandardMaterial({
      color: 0x161a22,
      metalness: 0.85,
      roughness: 0.28,
    });
    this.disposables.push(this.darkAnodizedMat);

    // 2. Satin Clear-Anodized Aluminum
    this.satinAluminumMat = new THREE.MeshStandardMaterial({
      color: 0xe2eaf4,
      metalness: 0.75,
      roughness: 0.25,
    });
    this.disposables.push(this.satinAluminumMat);

    // 3. Mirror-Polished 304 Stainless Steel
    this.brushedSteelMat = new THREE.MeshStandardMaterial({
      color: 0xd8e0e8,
      metalness: 0.92,
      roughness: 0.18,
    });
    this.disposables.push(this.brushedSteelMat);

    // 4. Heavy-duty Electromagnet Copper Coil
    this.copperCoilMat = new THREE.MeshStandardMaterial({
      color: 0xb45309,
      metalness: 0.65,
      roughness: 0.35,
    });
    this.disposables.push(this.copperCoilMat);

    // 5. Brass Micrometer & Adjustment Thumbscrews
    this.brassMat = new THREE.MeshStandardMaterial({
      color: 0xd97706,
      metalness: 0.88,
      roughness: 0.22,
    });
    this.disposables.push(this.brassMat);

    // 6. Gold Plated Terminal Lugs
    this.goldTerminalMat = new THREE.MeshStandardMaterial({
      color: 0xfbbf24,
      metalness: 0.95,
      roughness: 0.15,
    });
    this.disposables.push(this.goldTerminalMat);

    // 7. Translucent Crystal Wafer Physical Material
    this.waferMaterial = new THREE.MeshPhysicalMaterial({
      color: 0x1e293b,
      metalness: 0.15,
      roughness: 0.1,
      transparent: true,
      opacity: 0.45,
      transmission: 0.65,
      ior: 1.52,
      thickness: 0.02,
      depthWrite: false,
    });
    this.disposables.push(this.waferMaterial);
  }

  private buildApparatus(options: HallBenchMeshOptions): void {
    const waferL = options.waferLength ?? 0.12;
    const waferT = options.waferThickness ?? 0.024;
    const waferW = options.waferWidth ?? 0.064;

    // 1. Heavy Precision Base Plate (420mm x 280mm x 22mm)
    const baseGeo = new THREE.BoxGeometry(0.44, 0.022, 0.32);
    const baseMesh = new THREE.Mesh(baseGeo, this.darkAnodizedMat);
    baseMesh.position.set(0, 0.011, 0);
    this.group.add(baseMesh);
    this.disposables.push(baseGeo);

    // Top Chamfer Accent Plate (Brushed Steel Border)
    const plateGeo = new THREE.BoxGeometry(0.424, 0.003, 0.304);
    const plateMesh = new THREE.Mesh(plateGeo, this.satinAluminumMat);
    plateMesh.position.set(0, 0.0235, 0);
    this.group.add(plateMesh);
    this.disposables.push(plateGeo);

    // 4 Damping Leveling Feet
    const footGeo = new THREE.CylinderGeometry(0.018, 0.022, 0.016, 24);
    this.disposables.push(footGeo);
    const footPositions = [
      [-0.19, 0.008, -0.13],
      [0.19, 0.008, -0.13],
      [-0.19, 0.008, 0.13],
      [0.19, 0.008, 0.13],
    ];
    for (const [fx, fy, fz] of footPositions) {
      const foot = new THREE.Mesh(footGeo, this.brassMat);
      foot.position.set(fx, fy, fz);
      this.group.add(foot);
    }

    // 2. Electromagnet Massive C-Yoke / Pole Structures
    this.buildElectromagnetYoke();

    // 3. Central Precision Sample Positioning Stage
    this.buildSampleStage(waferL, waferT, waferW);

    // 4. Carrier Particle System & Glow Strips
    this.particleSystem = new HallCarrierParticleSystem({
      waferLength: waferL,
      waferThickness: waferT,
      waferWidth: waferW,
    });
    // Align particle system at the wafer center
    this.particleSystem.group.position.set(0, 0.145, 0);
    this.group.add(this.particleSystem.group);

    // 5. Magnetic Flux Lines Visualizer in Air Gap
    this.buildFluxLines(waferL * 0.9, waferW * 0.9, 0.052);
  }

  private buildElectromagnetYoke(): void {
    const yokeGroup = new THREE.Group();
    yokeGroup.name = 'ElectromagnetYoke';
    this.group.add(yokeGroup);

    // Back Vertical Column of the U-Yoke
    const backColGeo = new THREE.BoxGeometry(0.068, 0.22, 0.068);
    const backCol = new THREE.Mesh(backColGeo, this.darkAnodizedMat);
    backCol.position.set(0, 0.135, -0.10);
    yokeGroup.add(backCol);
    this.disposables.push(backColGeo);

    // Lower Horizontal Arm extending forward
    const lowerArmGeo = new THREE.BoxGeometry(0.068, 0.054, 0.12);
    const lowerArm = new THREE.Mesh(lowerArmGeo, this.darkAnodizedMat);
    lowerArm.position.set(0, 0.052, -0.04);
    yokeGroup.add(lowerArm);
    this.disposables.push(lowerArmGeo);

    // Upper Horizontal Arm extending forward
    const upperArmGeo = new THREE.BoxGeometry(0.068, 0.054, 0.12);
    const upperArm = new THREE.Mesh(upperArmGeo, this.darkAnodizedMat);
    upperArm.position.set(0, 0.228, -0.04);
    yokeGroup.add(upperArm);
    this.disposables.push(upperArmGeo);

    // Symmetrical Conical Pole Pieces (Upper Pole & Lower Pole)
    // Air gap center is at Y = 0.145
    const airGapCenterY = 0.145;
    const poleGap = 0.044; // Total air gap height (wafer is 0.024 high)

    // Lower Pole Piece (Points Upward to Y = 0.145 - 0.022 = 0.123)
    this.lowerPoleGroup = new THREE.Group();
    const poleCylGeo = new THREE.CylinderGeometry(0.032, 0.034, 0.032, 28);
    const lowerCyl = new THREE.Mesh(poleCylGeo, this.brushedSteelMat);
    lowerCyl.position.set(0, 0.095, 0);
    this.lowerPoleGroup.add(lowerCyl);

    const poleConeGeo = new THREE.ConeGeometry(0.032, 0.016, 28);
    const lowerCone = new THREE.Mesh(poleConeGeo, this.brushedSteelMat);
    lowerCone.position.set(0, 0.117, 0);
    this.lowerPoleGroup.add(lowerCone);
    yokeGroup.add(this.lowerPoleGroup);
    this.disposables.push(poleCylGeo, poleConeGeo);

    // Lower Coil winding around pole
    const coilGeo = new THREE.CylinderGeometry(0.056, 0.056, 0.045, 28);
    const lowerCoil = new THREE.Mesh(coilGeo, this.copperCoilMat);
    lowerCoil.position.set(0, 0.088, 0);
    yokeGroup.add(lowerCoil);

    // Upper Pole Piece (Points Downward from Y = 0.201 to Y = 0.145 + 0.022 = 0.167)
    this.upperPoleGroup = new THREE.Group();
    const upperCyl = new THREE.Mesh(poleCylGeo, this.brushedSteelMat);
    upperCyl.position.set(0, 0.195, 0);
    this.upperPoleGroup.add(upperCyl);

    const upperCone = new THREE.Mesh(poleConeGeo, this.brushedSteelMat);
    upperCone.rotation.x = Math.PI;
    upperCone.position.set(0, 0.173, 0);
    this.upperPoleGroup.add(upperCone);
    yokeGroup.add(this.upperPoleGroup);

    // Upper Coil winding
    const upperCoil = new THREE.Mesh(coilGeo, this.copperCoilMat);
    upperCoil.position.set(0, 0.202, 0);
    yokeGroup.add(upperCoil);
    this.disposables.push(coilGeo);
  }

  private buildSampleStage(waferL: number, waferT: number, waferW: number): void {
    const stageGroup = new THREE.Group();
    stageGroup.name = 'SampleStage';
    this.group.add(stageGroup);

    // Lateral support pillars (clear of the magnetic poles)
    const pillarGeo = new THREE.CylinderGeometry(0.007, 0.007, 0.125, 16);
    this.disposables.push(pillarGeo);

    const leftPillar = new THREE.Mesh(pillarGeo, this.satinAluminumMat);
    leftPillar.position.set(-0.11, 0.086, 0);
    stageGroup.add(leftPillar);

    const rightPillar = new THREE.Mesh(pillarGeo, this.satinAluminumMat);
    rightPillar.position.set(0.11, 0.086, 0);
    stageGroup.add(rightPillar);

    // Wafer Glass/Sapphire Fixture Frame
    const frameGeo = new THREE.BoxGeometry(waferL + 0.016, 0.006, waferW + 0.014);
    const frameMesh = new THREE.Mesh(frameGeo, this.darkAnodizedMat);
    frameMesh.position.set(0, 0.145 - waferT / 2 - 0.0035, 0);
    stageGroup.add(frameMesh);
    this.disposables.push(frameGeo);

    // The Translucent Hall Wafer Slice
    const waferGeo = new THREE.BoxGeometry(waferL, waferT, waferW);
    this.waferMesh = new THREE.Mesh(waferGeo, this.waferMaterial);
    this.waferMesh.position.set(0, 0.145, 0);
    stageGroup.add(this.waferMesh);
    this.disposables.push(waferGeo);

    // 4 Electrode Terminal Contact Blocks
    const endContactGeo = new THREE.BoxGeometry(0.006, waferT * 0.95, waferW * 0.85);
    this.disposables.push(endContactGeo);

    // Current Terminals (Left & Right - along X)
    const leftContact = new THREE.Mesh(endContactGeo, this.goldTerminalMat);
    leftContact.position.set(-waferL / 2 + 0.003, 0.145, 0);
    stageGroup.add(leftContact);

    const rightContact = new THREE.Mesh(endContactGeo, this.goldTerminalMat);
    rightContact.position.set(waferL / 2 - 0.003, 0.145, 0);
    stageGroup.add(rightContact);

    // Hall Voltage Pickup Terminals (Front & Back - along Z)
    const sideContactGeo = new THREE.BoxGeometry(0.024, waferT * 0.95, 0.004);
    this.disposables.push(sideContactGeo);

    const frontContact = new THREE.Mesh(sideContactGeo, this.goldTerminalMat);
    frontContact.position.set(0, 0.145, waferW / 2 - 0.002);
    stageGroup.add(frontContact);

    const backContact = new THREE.Mesh(sideContactGeo, this.goldTerminalMat);
    backContact.position.set(0, 0.145, -waferW / 2 + 0.002);
    stageGroup.add(backContact);

    // Flexible silicone lead wires routing from contacts down to bezel
    this.buildLeadWires(stageGroup, waferL, waferW);
  }

  private buildLeadWires(stage: THREE.Group, waferL: number, waferW: number): void {
    // 4 Curved CatmullRom splines representing color-coded silicone cables:
    // Red (+I): Left contact to left bezel
    // Black (-I): Right contact to right bezel
    // Yellow (+V_H): Front contact to center-left bezel
    // Green (-V_H): Back contact to center-right bezel
    const leads = [
      {
        color: 0xef4444, // Red
        points: [
          new THREE.Vector3(-waferL / 2, 0.145, 0),
          new THREE.Vector3(-0.13, 0.10, 0.04),
          new THREE.Vector3(-0.12, 0.035, 0.11),
        ],
      },
      {
        color: 0x1f2937, // Black
        points: [
          new THREE.Vector3(waferL / 2, 0.145, 0),
          new THREE.Vector3(0.13, 0.10, 0.04),
          new THREE.Vector3(0.12, 0.035, 0.11),
        ],
      },
      {
        color: 0xfacc15, // Yellow
        points: [
          new THREE.Vector3(0, 0.145, waferW / 2),
          new THREE.Vector3(-0.02, 0.09, 0.07),
          new THREE.Vector3(-0.04, 0.035, 0.11),
        ],
      },
      {
        color: 0x10b981, // Green
        points: [
          new THREE.Vector3(0, 0.145, -waferW / 2),
          new THREE.Vector3(0.04, 0.11, -0.05),
          new THREE.Vector3(0.04, 0.035, 0.11),
        ],
      },
    ];

    for (const lead of leads) {
      const curve = new THREE.CatmullRomCurve3(lead.points);
      const tubeGeo = new THREE.TubeGeometry(curve, 20, 0.0016, 8, false);
      const tubeMat = new THREE.MeshStandardMaterial({
        color: lead.color,
        roughness: 0.35,
        metalness: 0.2,
      });
      this.disposables.push(tubeGeo, tubeMat);
      stage.add(new THREE.Mesh(tubeGeo, tubeMat));
    }
  }

  private buildFluxLines(spanX: number, spanZ: number, gapHeight: number): void {
    this.fluxLinesGroup = new THREE.Group();
    this.fluxLinesGroup.name = 'MagneticFluxLines';
    this.group.add(this.fluxLinesGroup);

    this.fluxLinesMat = new THREE.LineBasicMaterial({
      color: 0x06b6d4,
      transparent: true,
      opacity: 0.45,
      blending: THREE.AdditiveBlending,
    });
    this.disposables.push(this.fluxLinesMat);

    const linePoints: THREE.Vector3[] = [];
    const countX = 5;
    const countZ = 4;
    const centerY = 0.145;
    const halfH = gapHeight * 0.48;

    for (let ix = 0; ix < countX; ix++) {
      const u = countX > 1 ? ix / (countX - 1) : 0.5;
      const x = (u * 2 - 1) * (spanX * 0.45);
      for (let iz = 0; iz < countZ; iz++) {
        const v = countZ > 1 ? iz / (countZ - 1) : 0.5;
        const z = (v * 2 - 1) * (spanZ * 0.42);

        linePoints.push(new THREE.Vector3(x, centerY - halfH, z));
        linePoints.push(new THREE.Vector3(x, centerY + halfH, z));
      }
    }

    const fluxGeo = new THREE.BufferGeometry().setFromPoints(linePoints);
    this.disposables.push(fluxGeo);

    const fluxLines = new THREE.LineSegments(fluxGeo, this.fluxLinesMat);
    this.fluxLinesGroup.add(fluxLines);
  }

  private initDisplayPanel(): void {
    const bezelGroup = new THREE.Group();
    bezelGroup.name = 'InstrumentPanel';
    bezelGroup.position.set(0, 0.024, 0.135);
    bezelGroup.rotation.x = -Math.PI / 10; // Angled for natural 45 deg viewing
    this.group.add(bezelGroup);

    // Bezel housing
    const housingGeo = new THREE.BoxGeometry(0.36, 0.046, 0.018);
    const housingMesh = new THREE.Mesh(housingGeo, this.darkAnodizedMat);
    bezelGroup.add(housingMesh);
    this.disposables.push(housingGeo);

    // High resolution Canvas for Dual-Channel Digital Readout
    this.displayCanvas = document.createElement('canvas');
    this.displayCanvas.width = 512;
    this.displayCanvas.height = 128;
    this.displayCtx = this.displayCanvas.getContext('2d')!;

    this.displayTexture = new THREE.CanvasTexture(this.displayCanvas);
    this.displayTexture.colorSpace = THREE.SRGBColorSpace;
    this.disposables.push(this.displayTexture);

    const screenGeo = new THREE.PlaneGeometry(0.34, 0.038);
    const screenMat = new THREE.MeshBasicMaterial({
      map: this.displayTexture,
      toneMapped: false,
    });
    this.displayMesh = new THREE.Mesh(screenGeo, screenMat);
    this.displayMesh.position.set(0, 0, 0.010);
    bezelGroup.add(this.displayMesh);
    this.disposables.push(screenGeo, screenMat);

    // Status Indicator LEDs
    const ledGeo = new THREE.SphereGeometry(0.0028, 12, 12);
    this.disposables.push(ledGeo);

    this.ledPosMat = new THREE.MeshBasicMaterial({ color: 0xef4444 });
    this.ledNegMat = new THREE.MeshBasicMaterial({ color: 0x3b82f6 });
    this.disposables.push(this.ledPosMat, this.ledNegMat);

    this.ledPositive = new THREE.Mesh(ledGeo, this.ledPosMat);
    this.ledPositive.position.set(-0.16, 0.012, 0.012);
    bezelGroup.add(this.ledPositive);

    this.ledNegative = new THREE.Mesh(ledGeo, this.ledNegMat);
    this.ledNegative.position.set(-0.16, -0.012, 0.012);
    bezelGroup.add(this.ledNegative);

    this.renderDisplay(0.5, 10.0, -25.0, 'n-GaAs', 'electron');
  }

  public renderDisplay(
    magFieldTesla: number,
    currentMa: number,
    hallVoltageMv: number,
    materialName: string,
    carrierType: string
  ): void {
    const ctx = this.displayCtx;
    const w = 512;
    const h = 128;

    // Dark OLED brushed background
    ctx.fillStyle = '#060910';
    ctx.fillRect(0, 0, w, h);

    // Center divider line
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(w / 2, 8);
    ctx.lineTo(w / 2, h - 8);
    ctx.stroke();

    // Subtle Apple-style cyan glow border
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.28)';
    ctx.lineWidth = 2;
    ctx.strokeRect(4, 4, w - 8, h - 8);

    // ================= Left Channel: Magnetic Field B =================
    ctx.font = '600 13px -apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif';
    ctx.fillStyle = '#94a3b8';
    ctx.fillText('CHANNEL 1 · 励磁磁场 B', 22, 26);

    const bSign = magFieldTesla >= 0 ? '+' : '';
    const bStr = `${bSign}${magFieldTesla.toFixed(3)} T`;
    ctx.font = '700 32px "SF Mono", Menlo, Consolas, monospace';
    ctx.fillStyle = '#38bdf8'; // Cyan
    ctx.fillText(bStr, 22, 68);

    // Current and polarity subtext
    ctx.font = '500 13px -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif';
    ctx.fillStyle = '#64748b';
    const bPole = magFieldTesla > 0 ? 'N极向上 (B_y > 0)' : magFieldTesla < 0 ? 'S极向上 (B_y < 0)' : '磁场关闭';
    ctx.fillText(`工作电流 I = ${currentMa.toFixed(1)} mA · ${bPole}`, 22, 100);

    // ================= Right Channel: Hall Voltage V_H =================
    ctx.font = '600 13px -apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif';
    ctx.fillStyle = '#94a3b8';
    ctx.fillText('CHANNEL 2 · 霍尔电压 V_H', w / 2 + 22, 26);

    let vStr = '';
    let unitStr = 'mV';
    let vColor = '#facc15'; // Yellow by default

    const absV = Math.abs(hallVoltageMv);
    if (absV < 0.0001) {
      vStr = '0.000 mV';
      vColor = '#64748b';
    } else if (absV < 0.01) {
      // Microvolts range
      const uv = hallVoltageMv * 1000;
      const vSign = uv >= 0 ? '+' : '';
      vStr = `${vSign}${uv.toFixed(2)} µV`;
      unitStr = 'µV';
      vColor = uv >= 0 ? '#34d399' : '#38bdf8';
    } else {
      const vSign = hallVoltageMv >= 0 ? '+' : '';
      vStr = `${vSign}${hallVoltageMv.toFixed(3)} mV`;
      vColor = hallVoltageMv >= 0 ? '#ef4444' : '#38bdf8';
    }

    ctx.font = '700 32px "SF Mono", Menlo, Consolas, monospace';
    ctx.fillStyle = vColor;
    ctx.fillText(vStr, w / 2 + 22, 68);

    // Material and carrier subtext
    ctx.font = '500 13px -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif';
    ctx.fillStyle = '#64748b';
    const cName = carrierType === 'electron' ? '电子 (e⁻, n型)' : carrierType === 'hole' ? '空穴 (h⁺, p型)' : '自由电子 (金属)';
    ctx.fillText(`${materialName} · ${cName}`, w / 2 + 22, 100);

    this.displayTexture.needsUpdate = true;
  }

  public updateTelemetry(
    magFieldTesla: number,
    currentMa: number,
    hallVoltageMv: number,
    materialName: string,
    carrierType: CarrierType
  ): void {
    // 1. Update Carrier Particle System
    this.particleSystem.setPhysicsState(currentMa, magFieldTesla, hallVoltageMv, carrierType);

    // 2. Update Flux lines opacity and color
    const bNorm = Math.min(1.0, Math.abs(magFieldTesla) / 1.5);
    this.fluxLinesMat.opacity = bNorm * 0.65;
    if (magFieldTesla >= 0) {
      this.fluxLinesMat.color.setHex(0x06b6d4); // Cyan
    } else {
      this.fluxLinesMat.color.setHex(0xa855f7); // Purple for inverted
    }

    // 3. Update Indicator LEDs
    if (hallVoltageMv > 0.001) {
      this.ledPosMat.color.setHex(0xef4444); // Bright Red
      this.ledNegMat.color.setHex(0x1e3a8a); // Dim Blue
    } else if (hallVoltageMv < -0.001) {
      this.ledPosMat.color.setHex(0x7f1d1d); // Dim Red
      this.ledNegMat.color.setHex(0x38bdf8); // Bright Cyan
    } else {
      this.ledPosMat.color.setHex(0x374151);
      this.ledNegMat.color.setHex(0x374151);
    }

    // 4. Throttled OLED Screen Refresh
    const now = performance.now();
    const hasChanged =
      Math.abs(this.lastB - magFieldTesla) > 0.001 ||
      Math.abs(this.lastI - currentMa) > 0.05 ||
      Math.abs(this.lastVh - hallVoltageMv) > 0.005 ||
      this.lastMaterial !== materialName ||
      this.lastCarrier !== carrierType;

    if (hasChanged && (now - this.lastDisplayRenderTime > 80)) {
      this.lastB = magFieldTesla;
      this.lastI = currentMa;
      this.lastVh = hallVoltageMv;
      this.lastMaterial = materialName;
      this.lastCarrier = carrierType;
      this.lastDisplayRenderTime = now;
      this.renderDisplay(magFieldTesla, currentMa, hallVoltageMv, materialName, carrierType);
    }
  }

  public setWaferAppearance(materialKey: string): void {
    if (materialKey === 'copper') {
      // Polished metallic copper / rose gold
      this.waferMaterial.color.setHex(0xb45309);
      this.waferMaterial.metalness = 0.85;
      this.waferMaterial.roughness = 0.22;
      this.waferMaterial.opacity = 0.85;
      this.waferMaterial.transmission = 0.1;
    } else if (materialKey === 'p-silicon') {
      // Dark emerald/slate crystalline silicon
      this.waferMaterial.color.setHex(0x064e3b);
      this.waferMaterial.metalness = 0.25;
      this.waferMaterial.roughness = 0.15;
      this.waferMaterial.opacity = 0.55;
      this.waferMaterial.transmission = 0.55;
    } else {
      // n-GaAs: Deep sapphire/obsidian translucent crystal
      this.waferMaterial.color.setHex(0x1e1b4b);
      this.waferMaterial.metalness = 0.2;
      this.waferMaterial.roughness = 0.12;
      this.waferMaterial.opacity = 0.5;
      this.waferMaterial.transmission = 0.6;
    }
    this.waferMaterial.needsUpdate = true;
  }

  public update(delta: number): void {
    this.particleSystem.update(delta);
  }

  public setToggles(showVectors: boolean, showParticles: boolean): void {
    this.particleSystem.setToggles(showVectors, showParticles);
  }

  public dispose(): void {
    this.particleSystem.dispose();
    for (const d of this.disposables) {
      d.dispose();
    }
    this.disposables.length = 0;
  }
}
