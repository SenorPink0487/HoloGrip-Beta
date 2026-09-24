import * as THREE from 'three';

export interface CarnotEngineKinematics {
  theta: number;        // Crankshaft / Flywheel angle in radians [0, 2pi)
  pistonHeight: number; // Normalized / absolute piston elevation
  beamAngle: number;    // Rocker beam inclination angle
}

export class CarnotEngineMesh {
  public group: THREE.Group;
  public flywheelGroup: THREE.Group;
  public flywheelMesh: THREE.Mesh;
  public leverMesh: THREE.Mesh;
  public dirSwitchMesh: THREE.Mesh;
  public pistonGroup: THREE.Group;

  // Geometry dimensions
  public readonly cylinderCenter = new THREE.Vector3(-0.14, 0, 0);
  public readonly beamCenter = new THREE.Vector3(0, 0.235, 0);
  public readonly crankCenter = new THREE.Vector3(0.14, 0.08, 0);
  public readonly beamHalfLength = 0.14;
  public readonly crankRadius = 0.032;
  public readonly pitmanRodLength = 0.162;
  public readonly pistonMinY = 0.055;
  public readonly pistonMaxY = 0.155;

  // 3D Assemblies
  private beamGroup: THREE.Group;
  private crankArmMesh: THREE.Mesh;
  private pitmanRodMesh: THREE.Mesh;
  private pistonRodMesh: THREE.Mesh;
  private quartzCylinderMesh: THREE.Mesh;
  private hotBaseMesh: THREE.Mesh;
  private coldBaseMesh: THREE.Mesh;
  private insulatorBaseMesh: THREE.Mesh;
  private heatFluxParticles: THREE.Points;
  private heatFluxPosAttr: THREE.BufferAttribute;

  // Dynamic Materials & Lights
  private hotMat: THREE.MeshStandardMaterial;
  private coldMat: THREE.MeshStandardMaterial;
  private insulatorMat: THREE.MeshStandardMaterial;
  private heatLight: THREE.PointLight;
  private coldLight: THREE.PointLight;
  private fluxMat: THREE.PointsMaterial;

  // State
  private isRunning = true;
  private isReversed = false;
  private currentStage = 1;
  private disposables: { dispose: () => void }[] = [];

  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'CarnotKinematicEngine';
    this.buildApparatus();
  }

  /**
   * Generates a high-contrast scientific laboratory nameplate & calibration scale
   * matching the precision optical bench rail ruler aesthetic.
   */
  private createNameplateTexture(): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 128;
    const ctx = canvas.getContext('2d')!;

    // Satin clear-anodized aluminum base with clean subtle gradient
    const grad = ctx.createLinearGradient(0, 0, 0, 128);
    grad.addColorStop(0, '#f8fafc');
    grad.addColorStop(0.5, '#edf2f7');
    grad.addColorStop(1, '#e2e8f0');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Beveled frame line
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 3;
    ctx.strokeRect(3, 3, canvas.width - 6, canvas.height - 6);

    // Baseline rail line
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(30, 72);
    ctx.lineTo(canvas.width - 30, 72);
    ctx.stroke();

    // Lab title & model designation in crisp dark slate
    ctx.fillStyle = '#0f172a';
    ctx.textAlign = 'left';
    ctx.font = 'bold 24px -apple-system, BlinkMacSystemFont, "SF Pro Display", monospace';
    ctx.fillText('HOLOGRIP · CARNOT HEAT ENGINE MK-II', 36, 44);

    ctx.fillStyle = '#64748b';
    ctx.font = 'bold 15px monospace';
    ctx.textAlign = 'right';
    ctx.fillText('THERMODYNAMIC BENCH · η = 1 - Tc/Th', canvas.width - 36, 44);

    // Metric millimeter graduation ticks along the front baseline
    const totalDivs = 80;
    const startX = 40;
    const endX = canvas.width - 40;
    const stepX = (endX - startX) / totalDivs;

    ctx.strokeStyle = '#0f172a';
    for (let i = 0; i <= totalDivs; i++) {
      const x = startX + i * stepX;
      if (i % 10 === 0) {
        ctx.lineWidth = 2.8;
        ctx.beginPath();
        ctx.moveTo(x, 56);
        ctx.lineTo(x, 92);
        ctx.stroke();

        ctx.fillStyle = '#334155';
        ctx.font = 'bold 16px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(`${i * 2}`, x, 114);
      } else if (i % 5 === 0) {
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.moveTo(x, 62);
        ctx.lineTo(x, 86);
        ctx.stroke();
      } else {
        ctx.lineWidth = 1.0;
        ctx.beginPath();
        ctx.moveTo(x, 66);
        ctx.lineTo(x, 80);
        ctx.stroke();
      }
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    this.disposables.push(tex);
    return tex;
  }

  /**
   * Generates a vertical transparent quartz cylinder graduation scale (1.0L - 5.0L)
   */
  private createCylinderScaleTexture(): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 512;
    const ctx = canvas.getContext('2d')!;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Vertical alignment guide bar
    ctx.strokeStyle = 'rgba(15, 23, 42, 0.45)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(32, 20);
    ctx.lineTo(32, 492);
    ctx.stroke();

    // Volume calibrations from 1.0L (bottom) to 5.0L (top)
    const marks = [
      { vol: 1.0, y: 460 },
      { vol: 2.0, y: 370 },
      { vol: 3.0, y: 275 },
      { vol: 4.0, y: 180 },
      { vol: 5.0, y: 85 },
    ];

    marks.forEach((m) => {
      // Major mark
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(18, m.y);
      ctx.lineTo(48, m.y);
      ctx.stroke();

      // Label
      ctx.fillStyle = '#0f172a';
      ctx.font = 'bold 24px -apple-system, BlinkMacSystemFont, monospace';
      ctx.textAlign = 'left';
      ctx.fillText(`${m.vol.toFixed(1)}L`, 54, m.y + 8);
    });

    // Sub-divisions
    ctx.strokeStyle = 'rgba(15, 23, 42, 0.65)';
    ctx.lineWidth = 1.5;
    for (let i = 0; i < marks.length - 1; i++) {
      const yA = marks[i].y;
      const yB = marks[i + 1].y;
      const yMid = (yA + yB) * 0.5;
      ctx.beginPath();
      ctx.moveTo(24, yMid);
      ctx.lineTo(40, yMid);
      ctx.stroke();
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    this.disposables.push(tex);
    return tex;
  }

  private buildApparatus(): void {
    // =========================================================================
    // Core Material Palette (Aligned with Laboratory Optical Apparatus)
    // =========================================================================

    // 1. Scientific Satin Clear-Anodized Natural Aluminum (银白喷砂航空铝)
    // Matches OpticalBenchRail & RotaryStageMesh - high contrast against dark table!
    const satinAluminumMat = new THREE.MeshStandardMaterial({
      color: 0xe2eaf2,
      metalness: 0.76,
      roughness: 0.24,
      envMapIntensity: 1.2,
    });
    this.disposables.push(satinAluminumMat);

    // 2. Mirror-Polished Stainless Steel / Chrome (高光拉丝镜面不锈钢)
    const stainlessMat = new THREE.MeshStandardMaterial({
      color: 0xf8fafc,
      metalness: 0.94,
      roughness: 0.12,
      envMapIntensity: 1.6,
    });
    this.disposables.push(stainlessMat);

    // 3. Precision Knurled Titanium Accent (质感轻钛灰滚花)
    const titaniumMat = new THREE.MeshStandardMaterial({
      color: 0xc4cfdc,
      metalness: 0.82,
      roughness: 0.22,
    });
    this.disposables.push(titaniumMat);

    // 4. Contrasting Precision Charcoal Fastener Accent (深钛灰沉孔螺栓)
    const darkAccentMat = new THREE.MeshStandardMaterial({
      color: 0x334155,
      metalness: 0.72,
      roughness: 0.28,
    });
    this.disposables.push(darkAccentMat);

    // 5. Heavy Polished Mechanical Brass (高抛光六辐条重型黄铜)
    const brassMat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      metalness: 0.95,
      roughness: 0.15,
      envMapIntensity: 2.0,
    });
    this.disposables.push(brassMat);

    // 6. Polished Bronze Bushing Alloy (青铜耐磨轴承轴套)
    const bronzeMat = new THREE.MeshStandardMaterial({
      color: 0xd97706,
      metalness: 0.90,
      roughness: 0.20,
    });
    this.disposables.push(bronzeMat);

    // =========================================================================
    // 1. Vibration-Isolation Foot Pads (4 只防震支撑脚垫，与桌面形成悬空切分)
    // =========================================================================
    const footGeo = new THREE.CylinderGeometry(0.018, 0.020, 0.008, 24);
    const footMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      roughness: 0.85,
      metalness: 0.12,
    });
    this.disposables.push(footGeo, footMat);

    const footCoords = [
      [-0.24, -0.08],
      [0.24, -0.08],
      [-0.24, 0.08],
      [0.24, 0.08],
    ];
    const footpadGroup = new THREE.Group();
    footpadGroup.name = 'BaseRubberFootpads';
    footCoords.forEach(([fx, fz]) => {
      const foot = new THREE.Mesh(footGeo, footMat);
      foot.position.set(fx, 0.004, fz);
      foot.castShadow = true;
      foot.receiveShadow = true;
      footpadGroup.add(foot);
    });
    this.group.add(footpadGroup);

    // =========================================================================
    // 2. Heavy Laboratory Stand Plinth (光学器材同级 缎面银白氧化铝双阶基座)
    // =========================================================================
    // Main lower plinth block (elevated slightly above table to cast contact shadow)
    const plinthGeo = new THREE.BoxGeometry(0.56, 0.016, 0.22);
    this.disposables.push(plinthGeo);
    const plinthMesh = new THREE.Mesh(plinthGeo, satinAluminumMat);
    plinthMesh.position.y = 0.016;
    plinthMesh.castShadow = true;
    plinthMesh.receiveShadow = true;
    this.group.add(plinthMesh);

    // Polished stainless steel beveled accent chamfer rim
    const chamferGeo = new THREE.BoxGeometry(0.564, 0.003, 0.224);
    this.disposables.push(chamferGeo);
    const chamferMesh = new THREE.Mesh(chamferGeo, stainlessMat);
    chamferMesh.position.y = 0.024;
    chamferMesh.castShadow = true;
    this.group.add(chamferMesh);

    // Beveled upper deck plate with precision dovetail runner groove
    const deckGeo = new THREE.BoxGeometry(0.52, 0.006, 0.19);
    this.disposables.push(deckGeo);
    const deckMesh = new THREE.Mesh(deckGeo, titaniumMat);
    deckMesh.position.y = 0.027;
    deckMesh.castShadow = true;
    deckMesh.receiveShadow = true;
    this.group.add(deckMesh);

    // Central stainless steel longitudinal T-slot runner (matching OpticalBenchRail dovetail)
    const runnerGeo = new THREE.BoxGeometry(0.48, 0.003, 0.016);
    this.disposables.push(runnerGeo);
    const runnerMesh = new THREE.Mesh(runnerGeo, stainlessMat);
    runnerMesh.position.set(0, 0.0305, 0);
    this.group.add(runnerMesh);

    // Front Laboratory Calibration Nameplate Plaque (激光蚀刻光学级铭牌)
    const nameplateTex = this.createNameplateTexture();
    const nameplateMat = new THREE.MeshBasicMaterial({ map: nameplateTex });
    this.disposables.push(nameplateMat);

    const nameplateGeo = new THREE.PlaneGeometry(0.52, 0.014);
    this.disposables.push(nameplateGeo);
    const nameplateMesh = new THREE.Mesh(nameplateGeo, nameplateMat);
    nameplateMesh.position.set(0, 0.016, 0.111);
    this.group.add(nameplateMesh);

    // Corner decorative countersunk stainless hex bolts (四角精密内六角沉孔螺钉)
    const boltGeo = new THREE.CylinderGeometry(0.004, 0.004, 0.002, 6);
    this.disposables.push(boltGeo);
    const boltCoords = [
      [-0.25, -0.09], [0.25, -0.09], [-0.25, 0.09], [0.25, 0.09],
      [-0.23, 0], [0.23, 0]
    ];
    boltCoords.forEach(([bx, bz]) => {
      const bolt = new THREE.Mesh(boltGeo, darkAccentMat);
      bolt.position.set(bx, 0.025, bz);
      this.group.add(bolt);
    });

    // =========================================================================
    // 3. Central Fulcrum Columns (中央双支撑高抛光镀铬立柱)
    // =========================================================================
    [-0.032, 0.032].forEach((zOffset) => {
      // Precision turned stainless steel vertical pillar
      const colGeo = new THREE.CylinderGeometry(0.009, 0.013, 0.20, 24);
      this.disposables.push(colGeo);
      const colMesh = new THREE.Mesh(colGeo, stainlessMat);
      colMesh.position.set(0, 0.130, zOffset);
      colMesh.castShadow = true;
      this.group.add(colMesh);

      // Knurled titanium base pedestal collar
      const collarGeo = new THREE.CylinderGeometry(0.018, 0.022, 0.016, 24);
      this.disposables.push(collarGeo);
      const collarMesh = new THREE.Mesh(collarGeo, satinAluminumMat);
      collarMesh.position.set(0, 0.038, zOffset);
      collarMesh.castShadow = true;
      this.group.add(collarMesh);

      // Top bearing cap with brass bushing
      const capGeo = new THREE.CylinderGeometry(0.016, 0.016, 0.014, 20);
      this.disposables.push(capGeo);
      const capMesh = new THREE.Mesh(capGeo, satinAluminumMat);
      capMesh.position.set(0, 0.231, zOffset);
      this.group.add(capMesh);

      // Brass oil lubrication cup on each column top
      const oilerGeo = new THREE.CylinderGeometry(0.0035, 0.0035, 0.008, 16);
      this.disposables.push(oilerGeo);
      const oiler = new THREE.Mesh(oilerGeo, bronzeMat);
      oiler.position.set(0, 0.242, zOffset);
      this.group.add(oiler);
    });

    // Horizontal arched cross-tie brace between the two central pillars
    const tieGeo = new THREE.CylinderGeometry(0.005, 0.005, 0.064, 16);
    this.disposables.push(tieGeo);
    const tieMesh = new THREE.Mesh(tieGeo, satinAluminumMat);
    tieMesh.rotation.x = Math.PI * 0.5;
    tieMesh.position.set(0, 0.140, 0);
    this.group.add(tieMesh);

    // Fulcrum horizontal bearing pin (mirror stainless)
    const fulcrumPinGeo = new THREE.CylinderGeometry(0.006, 0.006, 0.084, 16);
    this.disposables.push(fulcrumPinGeo);
    const fulcrumPin = new THREE.Mesh(fulcrumPinGeo, stainlessMat);
    fulcrumPin.rotation.x = Math.PI * 0.5;
    fulcrumPin.position.copy(this.beamCenter);
    this.group.add(fulcrumPin);

    // =========================================================================
    // 4. Iconic Walking Rocker Beam (瓦特/卡诺经典桁架摇臂梁 - 航空银白喷砂铝合金)
    // =========================================================================
    this.beamGroup = new THREE.Group();
    this.beamGroup.position.copy(this.beamCenter);

    const beamShape = new THREE.Shape();
    // Diamond-flanged aerodynamic beam profile
    beamShape.moveTo(-this.beamHalfLength, -0.006);
    beamShape.lineTo(-0.02, -0.018);
    beamShape.lineTo(0, -0.022);
    beamShape.lineTo(0.02, -0.018);
    beamShape.lineTo(this.beamHalfLength, -0.006);
    beamShape.lineTo(this.beamHalfLength, 0.006);
    beamShape.lineTo(0.02, 0.018);
    beamShape.lineTo(0, 0.022);
    beamShape.lineTo(-0.02, 0.018);
    beamShape.lineTo(-this.beamHalfLength, 0.006);
    beamShape.closePath();

    const beamExtrudeSettings = {
      depth: 0.016,
      bevelEnabled: true,
      bevelThickness: 0.003,
      bevelSize: 0.003,
      bevelSegments: 3,
    };
    const beamGeo = new THREE.ExtrudeGeometry(beamShape, beamExtrudeSettings);
    beamGeo.center();
    this.disposables.push(beamGeo);

    // Upgraded to satin clear-anodized natural aluminum
    const beamMesh = new THREE.Mesh(beamGeo, satinAluminumMat);
    beamMesh.castShadow = true;
    this.beamGroup.add(beamMesh);

    // Polished bronze end bosses & wristpin collars
    const bossGeo = new THREE.CylinderGeometry(0.012, 0.012, 0.024, 16);
    this.disposables.push(bossGeo);
    const leftBoss = new THREE.Mesh(bossGeo, bronzeMat);
    leftBoss.rotation.x = Math.PI * 0.5;
    leftBoss.position.x = -this.beamHalfLength;
    this.beamGroup.add(leftBoss);

    const rightBoss = new THREE.Mesh(bossGeo, bronzeMat);
    rightBoss.rotation.x = Math.PI * 0.5;
    rightBoss.position.x = this.beamHalfLength;
    this.beamGroup.add(rightBoss);

    this.group.add(this.beamGroup);

    // =========================================================================
    // 5. Optical Quartz Cylinder & Tri-Zone Thermal Reservoir Base (左侧气缸)
    // =========================================================================
    const cylGroup = new THREE.Group();
    cylGroup.position.copy(this.cylinderCenter);

    // Cylinder mounting base flange (satin aluminum with stainless clamp ring)
    const flangeGeo = new THREE.CylinderGeometry(0.068, 0.072, 0.012, 32);
    this.disposables.push(flangeGeo);
    const flangeMesh = new THREE.Mesh(flangeGeo, satinAluminumMat);
    flangeMesh.position.y = 0.036;
    flangeMesh.castShadow = true;
    cylGroup.add(flangeMesh);

    // Tri-Zone Thermal Reservoirs (高温热源、低温冷源、绝热垫)
    this.hotMat = new THREE.MeshStandardMaterial({
      color: 0xef4444,
      emissive: 0xff3b30,
      emissiveIntensity: 0.85,
      metalness: 0.65,
      roughness: 0.35,
    });
    this.coldMat = new THREE.MeshStandardMaterial({
      color: 0x0284c7,
      emissive: 0x007aff,
      emissiveIntensity: 0.2,
      metalness: 0.70,
      roughness: 0.30,
    });
    this.insulatorMat = new THREE.MeshStandardMaterial({
      color: 0xf8fafc,
      emissive: 0x000000,
      emissiveIntensity: 0,
      metalness: 0.08,
      roughness: 0.40,
    });
    this.disposables.push(this.hotMat, this.coldMat, this.insulatorMat);

    const basePlateGeo = new THREE.CylinderGeometry(0.062, 0.062, 0.008, 32);
    this.disposables.push(basePlateGeo);
    this.hotBaseMesh = new THREE.Mesh(basePlateGeo, this.hotMat);
    this.hotBaseMesh.position.y = 0.044;
    cylGroup.add(this.hotBaseMesh);

    // Dynamic Thermal Glow Lights
    this.heatLight = new THREE.PointLight(0xff4500, 2.2, 0.28);
    this.heatLight.position.set(0, 0.052, 0);
    cylGroup.add(this.heatLight);

    this.coldLight = new THREE.PointLight(0x00d8ff, 0.0, 0.28);
    this.coldLight.position.set(0, 0.052, 0);
    cylGroup.add(this.coldLight);

    // Transparent Quartz Cylinder (inner radius 0.052, height 0.165)
    const quartzGeo = new THREE.CylinderGeometry(0.054, 0.054, 0.165, 36, 1, true);
    const quartzMat = new THREE.MeshStandardMaterial({
      color: 0xe0f2fe,
      transparent: true,
      opacity: 0.30,
      roughness: 0.06,
      metalness: 0.08,
      envMapIntensity: 1.8,
      side: THREE.DoubleSide,
    });
    this.disposables.push(quartzGeo, quartzMat);
    this.quartzCylinderMesh = new THREE.Mesh(quartzGeo, quartzMat);
    this.quartzCylinderMesh.position.y = 0.132;
    cylGroup.add(this.quartzCylinderMesh);

    // Vertical volume graduation calibration scale strip on cylinder side
    const cylScaleTex = this.createCylinderScaleTexture();
    const cylScaleMat = new THREE.MeshBasicMaterial({
      map: cylScaleTex,
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
    });
    this.disposables.push(cylScaleMat);
    const cylScaleGeo = new THREE.PlaneGeometry(0.038, 0.155);
    this.disposables.push(cylScaleGeo);
    const cylScaleMesh = new THREE.Mesh(cylScaleGeo, cylScaleMat);
    cylScaleMesh.position.set(0, 0.132, 0.055);
    cylGroup.add(cylScaleMesh);

    // Cylinder top crown collar & guide ring in satin aluminum
    const crownGeo = new THREE.CylinderGeometry(0.060, 0.056, 0.010, 32);
    this.disposables.push(crownGeo);
    const crownMesh = new THREE.Mesh(crownGeo, satinAluminumMat);
    crownMesh.position.y = 0.216;
    crownMesh.castShadow = true;
    cylGroup.add(crownMesh);

    // 4 Stainless Steel Compression Tie-Rods with chrome acorn nuts
    const tieRodGeo = new THREE.CylinderGeometry(0.002, 0.002, 0.180, 16);
    this.disposables.push(tieRodGeo);
    const acornNutGeo = new THREE.CylinderGeometry(0.0035, 0.0035, 0.006, 12);
    this.disposables.push(acornNutGeo);

    for (let r = 0; r < 4; r++) {
      const ang = (r * Math.PI) / 2 + Math.PI / 4;
      const rx = Math.cos(ang) * 0.058;
      const rz = Math.sin(ang) * 0.058;

      const tieRod = new THREE.Mesh(tieRodGeo, stainlessMat);
      tieRod.position.set(rx, 0.126, rz);
      tieRod.castShadow = true;
      cylGroup.add(tieRod);

      const topNut = new THREE.Mesh(acornNutGeo, stainlessMat);
      topNut.position.set(rx, 0.222, rz);
      cylGroup.add(topNut);

      const botNut = new THREE.Mesh(acornNutGeo, stainlessMat);
      botNut.position.set(rx, 0.030, rz);
      cylGroup.add(botNut);
    }

    this.group.add(cylGroup);

    // =========================================================================
    // 6. Piston & Vertical Slider Rod (活塞与十字导杆)
    // =========================================================================
    this.pistonGroup = new THREE.Group();
    this.pistonGroup.position.set(this.cylinderCenter.x, this.pistonMinY, this.cylinderCenter.z);

    // Piston Head in satin titanium with dual viton seal rings
    const pistonHeadGeo = new THREE.CylinderGeometry(0.051, 0.051, 0.016, 32);
    this.disposables.push(pistonHeadGeo);
    const pistonHead = new THREE.Mesh(pistonHeadGeo, titaniumMat);
    pistonHead.position.y = 0;
    pistonHead.castShadow = true;
    this.pistonGroup.add(pistonHead);

    const sealRingGeo = new THREE.CylinderGeometry(0.052, 0.052, 0.003, 32);
    const sealRingMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.6 });
    this.disposables.push(sealRingGeo, sealRingMat);
    const seal1 = new THREE.Mesh(sealRingGeo, sealRingMat);
    seal1.position.y = 0.003;
    const seal2 = new THREE.Mesh(sealRingGeo, sealRingMat);
    seal2.position.y = -0.003;
    this.pistonGroup.add(seal1, seal2);

    // Piston Center Vertical Rod in mirror stainless steel
    const rodGeo = new THREE.CylinderGeometry(0.004, 0.004, 0.130, 16);
    this.disposables.push(rodGeo);
    this.pistonRodMesh = new THREE.Mesh(rodGeo, stainlessMat);
    this.pistonRodMesh.position.y = 0.068;
    this.pistonRodMesh.castShadow = true;
    this.pistonGroup.add(this.pistonRodMesh);

    // Piston Top Fork Joint in polished bronze
    const forkGeo = new THREE.BoxGeometry(0.014, 0.016, 0.014);
    this.disposables.push(forkGeo);
    const forkMesh = new THREE.Mesh(forkGeo, bronzeMat);
    forkMesh.position.y = 0.134;
    this.pistonGroup.add(forkMesh);

    this.group.add(this.pistonGroup);

    // =========================================================================
    // 7. Right Side: Crankshaft, Pillow Blocks & Gleaming Flywheel (右侧动力飞轮)
    // =========================================================================
    // Twin Split-Cap Pillow Block Bearing Pedestals in satin aluminum with brass oil cups
    [-0.034, 0.034].forEach((zOffset) => {
      // Lower bearing pedestal base with mounting flange
      const pedGeo = new THREE.BoxGeometry(0.026, 0.082, 0.020);
      this.disposables.push(pedGeo);
      const pedMesh = new THREE.Mesh(pedGeo, satinAluminumMat);
      pedMesh.position.set(this.crankCenter.x, 0.054, zOffset);
      pedMesh.castShadow = true;
      this.group.add(pedMesh);

      // Flanged base feet with hold-down bolts
      const footGeo = new THREE.BoxGeometry(0.038, 0.008, 0.024);
      this.disposables.push(footGeo);
      const footMesh = new THREE.Mesh(footGeo, satinAluminumMat);
      footMesh.position.set(this.crankCenter.x, 0.030, zOffset);
      this.group.add(footMesh);

      // Semicircular top bearing cap with split line
      const capArchGeo = new THREE.CylinderGeometry(0.015, 0.015, 0.018, 20);
      this.disposables.push(capArchGeo);
      const capArch = new THREE.Mesh(capArchGeo, satinAluminumMat);
      capArch.rotation.x = Math.PI * 0.5;
      capArch.position.set(this.crankCenter.x, this.crankCenter.y + 0.004, zOffset);
      this.group.add(capArch);

      // Top brass grease / lubrication cup
      const cupGeo = new THREE.CylinderGeometry(0.0035, 0.0035, 0.008, 16);
      this.disposables.push(cupGeo);
      const greaseCup = new THREE.Mesh(cupGeo, bronzeMat);
      greaseCup.position.set(this.crankCenter.x, this.crankCenter.y + 0.022, zOffset);
      this.group.add(greaseCup);

      // Bearing bronze cap bushing
      const capBushing = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.004, 16), bronzeMat);
      capBushing.rotation.x = Math.PI * 0.5;
      capBushing.position.set(this.crankCenter.x, this.crankCenter.y, zOffset + (zOffset > 0 ? 0.010 : -0.010));
      this.group.add(capBushing);
    });

    // Horizontal Crankshaft Axle in mirror stainless steel
    const axleGeo = new THREE.CylinderGeometry(0.007, 0.007, 0.12, 16);
    this.disposables.push(axleGeo);
    const axleMesh = new THREE.Mesh(axleGeo, stainlessMat);
    axleMesh.rotation.x = Math.PI * 0.5;
    axleMesh.position.copy(this.crankCenter);
    this.group.add(axleMesh);

    // Crank Arm Assembly in polished bronze
    this.crankArmMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.012, this.crankRadius * 1.3, 0.010),
      bronzeMat
    );
    this.crankArmMesh.position.set(this.crankCenter.x, this.crankCenter.y, 0);
    this.group.add(this.crankArmMesh);

    // Main Pitman Connecting Rod in mirror stainless steel
    const pitmanGeo = new THREE.CylinderGeometry(0.0045, 0.0045, this.pitmanRodLength, 16);
    this.disposables.push(pitmanGeo);
    this.pitmanRodMesh = new THREE.Mesh(pitmanGeo, stainlessMat);
    this.pitmanRodMesh.castShadow = true;
    this.group.add(this.pitmanRodMesh);

    // =========================================================================
    // 8. Polished Brass Spoke Flywheel (高抛光六辐条重型黄铜飞轮)
    // =========================================================================
    this.flywheelGroup = new THREE.Group();
    this.flywheelGroup.position.set(this.crankCenter.x, this.crankCenter.y, 0.055);

    // Flywheel Heavy Outer Rim (厚重外轮辋)
    const rimRadius = 0.088;
    const rimGeo = new THREE.TorusGeometry(rimRadius, 0.009, 20, 48);
    this.disposables.push(rimGeo);
    this.flywheelMesh = new THREE.Mesh(rimGeo, brassMat);
    this.flywheelMesh.castShadow = true;
    this.flywheelGroup.add(this.flywheelMesh);

    // Flywheel Central Hub (中央轮毂)
    const hubGeo = new THREE.CylinderGeometry(0.022, 0.022, 0.018, 24);
    this.disposables.push(hubGeo);
    const hubMesh = new THREE.Mesh(hubGeo, brassMat);
    hubMesh.rotation.x = Math.PI * 0.5;
    this.flywheelGroup.add(hubMesh);

    // 6 Curved Dynamic Spokes (六根优雅弧线轮辐)
    const spokeCount = 6;
    for (let i = 0; i < spokeCount; i++) {
      const angle = (i / spokeCount) * Math.PI * 2;
      const spokeGeo = new THREE.CylinderGeometry(0.003, 0.0045, rimRadius - 0.014, 12);
      this.disposables.push(spokeGeo);
      const spokeMesh = new THREE.Mesh(spokeGeo, brassMat);
      spokeMesh.position.set(
        Math.cos(angle) * (rimRadius * 0.5),
        Math.sin(angle) * (rimRadius * 0.5),
        0
      );
      spokeMesh.rotation.z = angle - Math.PI * 0.5;
      this.flywheelGroup.add(spokeMesh);
    }

    // Counterweight crescent segment on the flywheel
    const weightGeo = new THREE.CylinderGeometry(rimRadius * 0.85, rimRadius * 0.85, 0.010, 24, 1, false, 0, Math.PI * 0.6);
    this.disposables.push(weightGeo);
    const weightMesh = new THREE.Mesh(weightGeo, brassMat);
    weightMesh.rotation.x = Math.PI * 0.5;
    weightMesh.position.z = -0.002;
    this.flywheelGroup.add(weightMesh);

    this.group.add(this.flywheelGroup);

    // =========================================================================
    // 9. Control Levers on Stand Deck (台架物理操作杆)
    // =========================================================================
    // Run / Pause Clutch Lever (启停离合手柄，位于台面右前方)
    const leverStandGeo = new THREE.CylinderGeometry(0.008, 0.010, 0.014, 16);
    this.disposables.push(leverStandGeo);
    const leverStand = new THREE.Mesh(leverStandGeo, satinAluminumMat);
    leverStand.position.set(0.08, 0.034, 0.075);
    this.group.add(leverStand);

    const leverHandleGeo = new THREE.CylinderGeometry(0.003, 0.003, 0.036, 12);
    this.disposables.push(leverHandleGeo);
    this.leverMesh = new THREE.Mesh(leverHandleGeo, bronzeMat);
    this.leverMesh.position.set(0.08, 0.048, 0.075);
    this.leverMesh.rotation.z = -0.3; // Engaged angle
    this.leverMesh.name = 'LeverRunPause';
    this.group.add(this.leverMesh);

    // Direction Reverser Switch Lever (正逆向换向旋钮，位于左前方)
    const dirStandGeo = new THREE.CylinderGeometry(0.008, 0.010, 0.014, 16);
    this.disposables.push(dirStandGeo);
    const dirStand = new THREE.Mesh(dirStandGeo, satinAluminumMat);
    dirStand.position.set(-0.06, 0.034, 0.075);
    this.group.add(dirStand);

    const dirSwitchGeo = new THREE.BoxGeometry(0.016, 0.008, 0.024);
    this.disposables.push(dirSwitchGeo);
    this.dirSwitchMesh = new THREE.Mesh(dirSwitchGeo, bronzeMat);
    this.dirSwitchMesh.position.set(-0.06, 0.043, 0.075);
    this.dirSwitchMesh.name = 'SwitchDirection';
    this.group.add(this.dirSwitchMesh);

    // =========================================================================
    // 10. Directed Heat Flux Photon Arrows VFX (底座吸放热定向光效)
    // =========================================================================
    const fluxParticleCount = 80;
    const fluxPositions = new Float32Array(fluxParticleCount * 3);
    for (let i = 0; i < fluxParticleCount; i++) {
      const ang = Math.random() * Math.PI * 2;
      const rad = Math.sqrt(Math.random()) * 0.046;
      fluxPositions[i * 3 + 0] = Math.cos(ang) * rad;
      fluxPositions[i * 3 + 1] = 0.048 + Math.random() * 0.045;
      fluxPositions[i * 3 + 2] = Math.sin(ang) * rad;
    }
    const fluxGeo = new THREE.BufferGeometry();
    this.heatFluxPosAttr = new THREE.BufferAttribute(fluxPositions, 3);
    fluxGeo.setAttribute('position', this.heatFluxPosAttr);
    this.fluxMat = new THREE.PointsMaterial({
      color: 0xff3b30,
      size: 0.004,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
    });
    this.disposables.push(fluxGeo, this.fluxMat);
    this.heatFluxParticles = new THREE.Points(fluxGeo, this.fluxMat);
    this.heatFluxParticles.position.copy(this.cylinderCenter);
    this.group.add(this.heatFluxParticles);
  }

  /**
   * Updates all kinematic linkages based on crank/flywheel angle theta
   */
  public updateKinematics(theta: number): CarnotEngineKinematics {
    // 1. Rotate Flywheel & Crank Arm
    this.flywheelGroup.rotation.z = theta;
    this.crankArmMesh.rotation.z = theta;

    // Crank pin world position
    const crankPinX = this.crankCenter.x - Math.sin(theta) * this.crankRadius;
    const crankPinY = this.crankCenter.y + Math.cos(theta) * this.crankRadius;

    // 2. Solve Beam Inclination Angle alpha
    const deltaY = (crankPinY - this.crankCenter.y) / this.crankRadius;
    const beamAngle = deltaY * 0.075;
    this.beamGroup.rotation.z = beamAngle;

    // 3. Connect Pitman Rod from Crankpin to Beam Right Tip
    const beamRightTipX = this.beamCenter.x + Math.cos(beamAngle) * this.beamHalfLength;
    const beamRightTipY = this.beamCenter.y - Math.sin(beamAngle) * this.beamHalfLength;

    const rodMidX = (crankPinX + beamRightTipX) * 0.5;
    const rodMidY = (crankPinY + beamRightTipY) * 0.5;
    this.pitmanRodMesh.position.set(rodMidX, rodMidY, 0);
    this.pitmanRodMesh.rotation.z = Math.atan2(beamRightTipX - crankPinX, beamRightTipY - crankPinY);

    // 4. Update Left Tip & Piston Elevation
    const pistonNorm = (Math.cos(theta) + 1.0) * 0.5; // [0, 1]
    const curPistonY = THREE.MathUtils.lerp(this.pistonMinY, this.pistonMaxY, pistonNorm);
    this.pistonGroup.position.y = curPistonY;

    return {
      theta,
      pistonHeight: curPistonY,
      beamAngle,
    };
  }

  /**
   * Update thermodynamic stage styling: Heat Flux VFX, Base Color, Lights
   */
  public setCycleState(
    stage: 1 | 2 | 3 | 4,
    stageProgress: number,
    temp: number,
    isReversed: boolean
  ): void {
    this.currentStage = stage;
    this.isReversed = isReversed;

    if (stage === 1) {
      // Hot reservoir active
      this.hotBaseMesh.material = this.hotMat;
      this.hotMat.emissiveIntensity = 0.85 + Math.sin(stageProgress * Math.PI) * 0.35;
      this.heatLight.intensity = 2.2;
      this.coldLight.intensity = 0.0;
      this.fluxMat.color.setHex(0xff3b30);
      this.fluxMat.opacity = 0.85;
      this.heatFluxParticles.visible = true;
    } else if (stage === 2) {
      // Adiabatic expansion: base becomes insulated ceramic
      this.hotBaseMesh.material = this.insulatorMat;
      this.heatLight.intensity = 0.0;
      this.coldLight.intensity = 0.0;
      this.heatFluxParticles.visible = false;
    } else if (stage === 3) {
      // Cold reservoir active
      this.hotBaseMesh.material = this.coldMat;
      this.coldMat.emissiveIntensity = 0.80 + Math.sin(stageProgress * Math.PI) * 0.30;
      this.heatLight.intensity = 0.0;
      this.coldLight.intensity = 2.0;
      this.fluxMat.color.setHex(0x00d8ff);
      this.fluxMat.opacity = 0.75;
      this.heatFluxParticles.visible = true;
    } else {
      // Adiabatic compression: base insulated
      this.hotBaseMesh.material = this.insulatorMat;
      this.heatLight.intensity = 0.0;
      this.coldLight.intensity = 0.0;
      this.heatFluxParticles.visible = false;
    }

    // Animate directional heat flux particles
    if (this.heatFluxParticles.visible) {
      const pos = this.heatFluxPosAttr.array as Float32Array;
      const count = pos.length / 3;
      const flowDir = isReversed ? (stage === 1 ? -1 : 1) : (stage === 1 ? 1 : -1);

      for (let i = 0; i < count; i++) {
        pos[i * 3 + 1] += 0.0012 * flowDir;
        if (pos[i * 3 + 1] > 0.090) pos[i * 3 + 1] = 0.048;
        if (pos[i * 3 + 1] < 0.048) pos[i * 3 + 1] = 0.090;
      }
      this.heatFluxPosAttr.needsUpdate = true;
    }
  }

  public setRunning(running: boolean): void {
    this.isRunning = running;
    this.leverMesh.rotation.z = running ? -0.3 : 0.3;
  }

  public setDirection(dir: 'forward' | 'reverse'): void {
    this.isReversed = dir === 'reverse';
    this.dirSwitchMesh.rotation.x = this.isReversed ? 0.35 : -0.35;
  }

  public dispose(): void {
    this.disposables.forEach((d) => d.dispose());
    this.disposables = [];
  }
}
