import * as THREE from 'three';

export class PhaseCalorimeterMesh {
  public group: THREE.Group;

  // Materials & Dynamic Elements
  private satinAluminumMat: THREE.MeshStandardMaterial;
  private darkAnodizedMat: THREE.MeshStandardMaterial;
  private stainlessMat: THREE.MeshStandardMaterial;
  private brassMat: THREE.MeshStandardMaterial;
  private ceramicTopMat: THREE.MeshStandardMaterial;
  private heaterCoilMat: THREE.MeshStandardMaterial;
  private glassFlaskMat: THREE.MeshPhysicalMaterial;
  private waterMat: THREE.MeshPhysicalMaterial;
  private iceMat: THREE.MeshPhysicalMaterial;
  private siliconeSleeveMat: THREE.MeshStandardMaterial;

  private heaterLight: THREE.PointLight;
  private powerRockerLed: THREE.Mesh;
  private consoleScreenMesh: THREE.Mesh;
  private consoleCanvas: HTMLCanvasElement;
  private consoleCtx: CanvasRenderingContext2D;
  private consoleTexture: THREE.CanvasTexture;

  // 3D Objects
  private iceGroup: THREE.Group;
  private iceCubes: THREE.Mesh[] = [];
  private waterGroup: THREE.Group;
  private waterMesh: THREE.Mesh;
  private meniscusMesh: THREE.Mesh;

  private bubbleParticles: THREE.Points;
  private bubblePositions: Float32Array;
  private steamParticles: THREE.Points;
  private steamPositions: Float32Array;
  private steamMat: THREE.PointsMaterial;

  private tempProbeMesh: THREE.Mesh;

  private disposables: { dispose: () => void }[] = [];

  // Console Screen Caching & Throttling
  private lastConsoleTempK = -999;
  private lastConsolePowerW = -999;
  private lastConsoleHeating = false;
  private lastConsoleRenderTime = 0;

  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'PhaseCalorimeterMesh';
    this.buildApparatus();
  }

  private initMaterials(): void {
    // 1. Satin clear-anodized aluminum for lab equipment housing
    this.satinAluminumMat = new THREE.MeshStandardMaterial({
      color: 0xe2eaf2,
      metalness: 0.78,
      roughness: 0.22,
    });
    this.disposables.push(this.satinAluminumMat);

    // 2. Black hard-anodized console faceplate
    this.darkAnodizedMat = new THREE.MeshStandardMaterial({
      color: 0x1e2430,
      metalness: 0.82,
      roughness: 0.28,
    });
    this.disposables.push(this.darkAnodizedMat);

    // 3. Mirror-polished 304 stainless steel for retort rods and clamps
    this.stainlessMat = new THREE.MeshStandardMaterial({
      color: 0xf8fafc,
      metalness: 0.94,
      roughness: 0.12,
    });
    this.disposables.push(this.stainlessMat);

    // 4. Knurled brass adjustment screws
    this.brassMat = new THREE.MeshStandardMaterial({
      color: 0xeab308,
      metalness: 0.85,
      roughness: 0.25,
    });
    this.disposables.push(this.brassMat);

    // 5. White ceramic hotplate top plate
    this.ceramicTopMat = new THREE.MeshStandardMaterial({
      color: 0xf8fafc,
      metalness: 0.10,
      roughness: 0.35,
    });
    this.disposables.push(this.ceramicTopMat);

    // 6. High-temp induction heating core
    this.heaterCoilMat = new THREE.MeshStandardMaterial({
      color: 0xb91c1c,
      emissive: 0xef4444,
      emissiveIntensity: 0.65,
      roughness: 0.35,
      metalness: 0.75,
    });
    this.disposables.push(this.heaterCoilMat);

    // 7. High-grade Borosilicate laboratory glass (高硼硅光学物理玻璃)
    // High-performance physical glass using clearcoat specular highlights without transmission copies
    this.glassFlaskMat = new THREE.MeshPhysicalMaterial({
      color: 0xf0f8ff,
      roughness: 0.04,
      metalness: 0.05,
      clearcoat: 1.0,
      clearcoatRoughness: 0.04,
      reflectivity: 0.92,
      transparent: true,
      opacity: 0.28,
      side: THREE.FrontSide,
      depthWrite: false,
    });
    this.disposables.push(this.glassFlaskMat);

    // 8. Physical liquid water (物理微蓝清澈水体)
    this.waterMat = new THREE.MeshPhysicalMaterial({
      color: 0x38bdf8,
      roughness: 0.06,
      metalness: 0.02,
      reflectivity: 0.88,
      transparent: true,
      opacity: 0.72,
      side: THREE.FrontSide,
      depthWrite: false,
    });
    this.disposables.push(this.waterMat);

    // 9. Crystalline frosty ice (天然冰晶晶莹材质)
    this.iceMat = new THREE.MeshPhysicalMaterial({
      color: 0xe0f2fe,
      roughness: 0.18,
      metalness: 0.06,
      reflectivity: 0.90,
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
      depthWrite: true,
    });
    this.disposables.push(this.iceMat);

    // 10. Red silicone clamp protective sleeves (耐热硅胶护套)
    this.siliconeSleeveMat = new THREE.MeshStandardMaterial({
      color: 0xdc2626,
      roughness: 0.75,
      metalness: 0.05,
    });
    this.disposables.push(this.siliconeSleeveMat);
  }

  private initConsoleDisplay(): void {
    this.consoleCanvas = document.createElement('canvas');
    this.consoleCanvas.width = 512;
    this.consoleCanvas.height = 160;
    this.consoleCtx = this.consoleCanvas.getContext('2d')!;

    this.consoleTexture = new THREE.CanvasTexture(this.consoleCanvas);
    this.consoleTexture.colorSpace = THREE.SRGBColorSpace;
    this.disposables.push(this.consoleTexture);

    this.renderConsole(273.15, 800, false);
  }

  private renderConsole(tempK: number, powerW: number, isHeating: boolean, force = false): void {
    const now = performance.now();
    if (!force) {
      const tempDiff = Math.abs(tempK - this.lastConsoleTempK);
      const powerDiff = Math.abs(powerW - this.lastConsolePowerW);
      const heatDiff = isHeating !== this.lastConsoleHeating;
      if (tempDiff < 0.1 && powerDiff < 1 && !heatDiff) {
        return;
      }
      if (now - this.lastConsoleRenderTime < 100) {
        return;
      }
    }

    this.lastConsoleTempK = tempK;
    this.lastConsolePowerW = powerW;
    this.lastConsoleHeating = isHeating;
    this.lastConsoleRenderTime = now;

    const ctx = this.consoleCtx;
    ctx.fillStyle = '#090d16';
    ctx.fillRect(0, 0, 512, 160);

    // Cyan frame
    ctx.strokeStyle = '#0284c7';
    ctx.lineWidth = 4;
    ctx.strokeRect(3, 3, 506, 154);

    // Top status line
    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 22px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('DIGITAL HOTPLATE · PT100 FEEDBACK', 20, 36);

    ctx.fillStyle = isHeating ? '#10b981' : '#64748b';
    ctx.textAlign = 'right';
    ctx.fillText(isHeating ? '● HEATING ON' : '○ STANDBY', 492, 36);

    // Temperature display
    const tempC = tempK - 273.15;
    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 56px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`${tempC.toFixed(1)} °C`, 20, 102);

    ctx.fillStyle = '#94a3b8';
    ctx.font = 'bold 30px monospace';
    ctx.textAlign = 'right';
    ctx.fillText(`${tempK.toFixed(1)} K`, 492, 98);

    // Divider
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(20, 118);
    ctx.lineTo(492, 118);
    ctx.stroke();

    // Bottom line: Power and stage indicator
    ctx.fillStyle = '#f59e0b';
    ctx.font = 'bold 22px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`POWER: ${Math.round(powerW)} W`, 20, 146);

    ctx.fillStyle = '#38bdf8';
    ctx.textAlign = 'right';
    ctx.fillText('CALORIMETRY ENGINE V2', 492, 146);

    this.consoleTexture.needsUpdate = true;
  }

  private buildApparatus(): void {
    this.initMaterials();
    this.initConsoleDisplay();

    // =========================================================================
    // 1. Rubber Vibration Isolation Footpads (4 只大型高避震橡胶脚垫，架空深色桌面 12mm)
    // =========================================================================
    const footpadGroup = new THREE.Group();
    footpadGroup.name = 'CalorimeterRubberFootpads';

    const footMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.90, metalness: 0.08 });
    this.disposables.push(footMat);
    const footGeo = new THREE.CylinderGeometry(0.016, 0.018, 0.012, 24);
    this.disposables.push(footGeo);

    const footCoords = [
      [-0.14, -0.10], [0.14, -0.10],
      [-0.14, 0.10], [0.14, 0.10]
    ];
    footCoords.forEach(([fx, fz]) => {
      const foot = new THREE.Mesh(footGeo, footMat);
      foot.position.set(fx, 0.006, fz);
      foot.receiveShadow = true;
      footpadGroup.add(foot);

      // Stainless leveling collar
      const collarGeo = new THREE.CylinderGeometry(0.018, 0.018, 0.003, 20);
      this.disposables.push(collarGeo);
      const collar = new THREE.Mesh(collarGeo, this.stainlessMat);
      collar.position.set(fx, 0.0135, fz);
      footpadGroup.add(collar);
    });
    this.group.add(footpadGroup);

    // =========================================================================
    // 2. Precision Laboratory Magnetic Hotplate Chassis (微电脑智能恒温加热搅拌仪机身)
    // =========================================================================
    const chassisGroup = new THREE.Group();
    chassisGroup.position.set(0, 0, 0);

    // Lower cast aluminum chassis body (y = 0.014 to 0.054)
    const bodyGeo = new THREE.BoxGeometry(0.34, 0.040, 0.26);
    this.disposables.push(bodyGeo);
    const bodyMesh = new THREE.Mesh(bodyGeo, this.satinAluminumMat);
    bodyMesh.position.set(0, 0.034, 0);
    bodyMesh.castShadow = true;
    bodyMesh.receiveShadow = true;
    chassisGroup.add(bodyMesh);

    // Forward slanted front console section (前置斜面仪表控制台)
    const consoleGeo = new THREE.BoxGeometry(0.34, 0.032, 0.090);
    this.disposables.push(consoleGeo);
    const consoleMesh = new THREE.Mesh(consoleGeo, this.darkAnodizedMat);
    consoleMesh.position.set(0, 0.030, 0.125);
    consoleMesh.rotation.x = Math.PI * 0.12; // 21 degrees forward slant
    consoleMesh.castShadow = true;
    chassisGroup.add(consoleMesh);

    // Console Screen Display
    const screenGeo = new THREE.PlaneGeometry(0.120, 0.038);
    const screenMat = new THREE.MeshBasicMaterial({
      map: this.consoleTexture,
      toneMapped: false,
    });
    this.disposables.push(screenGeo, screenMat);
    this.consoleScreenMesh = new THREE.Mesh(screenGeo, screenMat);
    this.consoleScreenMesh.position.set(-0.060, 0.034, 0.158);
    this.consoleScreenMesh.rotation.x = -Math.PI * 0.38;
    chassisGroup.add(this.consoleScreenMesh);

    // Knurled Encoder Knob (金属滚花温控/功率编码器旋钮)
    const knobGeo = new THREE.CylinderGeometry(0.016, 0.016, 0.018, 24);
    this.disposables.push(knobGeo);
    const knob = new THREE.Mesh(knobGeo, this.satinAluminumMat);
    knob.rotation.x = Math.PI * 0.62;
    knob.position.set(0.060, 0.032, 0.158);
    chassisGroup.add(knob);

    // Rocker Power Switch with red indicator light
    const switchGeo = new THREE.BoxGeometry(0.016, 0.024, 0.008);
    const switchMat = new THREE.MeshStandardMaterial({
      color: 0xdc2626,
      emissive: 0xef4444,
      emissiveIntensity: 0.8,
    });
    this.disposables.push(switchGeo, switchMat);
    this.powerRockerLed = new THREE.Mesh(switchGeo, switchMat);
    this.powerRockerLed.rotation.x = Math.PI * 0.62;
    this.powerRockerLed.position.set(0.120, 0.032, 0.158);
    chassisGroup.add(this.powerRockerLed);

    // Top Ceramic Heating Surface Plate (Ø135mm 白色耐腐蚀陶瓷发热盘)
    const plateGeo = new THREE.CylinderGeometry(0.068, 0.068, 0.010, 36);
    this.disposables.push(plateGeo);
    const plateMesh = new THREE.Mesh(plateGeo, this.ceramicTopMat);
    plateMesh.position.set(0, 0.059, -0.015);
    plateMesh.castShadow = true;
    plateMesh.receiveShadow = true;
    chassisGroup.add(plateMesh);

    // Stainless overflow rim ring around hotplate
    const rimGeo = new THREE.TorusGeometry(0.069, 0.002, 16, 36);
    this.disposables.push(rimGeo);
    const rimMesh = new THREE.Mesh(rimGeo, this.stainlessMat);
    rimMesh.rotation.x = Math.PI * 0.5;
    rimMesh.position.set(0, 0.064, -0.015);
    chassisGroup.add(rimMesh);

    // Heating Element Coil under ceramic plate (透热微光核心)
    const coilGeo = new THREE.CylinderGeometry(0.058, 0.058, 0.003, 32);
    this.disposables.push(coilGeo);
    const coilMesh = new THREE.Mesh(coilGeo, this.heaterCoilMat);
    coilMesh.position.set(0, 0.055, -0.015);
    chassisGroup.add(coilMesh);

    this.heaterLight = new THREE.PointLight(0xff3b30, 2.2, 0.28);
    this.heaterLight.position.set(0, 0.075, -0.015);
    chassisGroup.add(this.heaterLight);

    this.group.add(chassisGroup);

    // =========================================================================
    // 3. Heavy Laboratory Retort Stand & 3-Finger Flask Clamp (工业级不锈钢铁架台与烧瓶夹)
    // =========================================================================
    const standGroup = new THREE.Group();
    const rodX = 0.125;
    const rodZ = -0.090;

    // Heavy rear stand mounting socket on chassis
    const socketGeo = new THREE.CylinderGeometry(0.012, 0.014, 0.024, 20);
    this.disposables.push(socketGeo);
    const socketMesh = new THREE.Mesh(socketGeo, this.stainlessMat);
    socketMesh.position.set(rodX, 0.060, rodZ);
    standGroup.add(socketMesh);

    // Solid Ø12mm stainless vertical retort rod (抛光不锈钢铁架台立柱)
    const rodGeo = new THREE.CylinderGeometry(0.006, 0.006, 0.320, 24);
    this.disposables.push(rodGeo);
    const rodMesh = new THREE.Mesh(rodGeo, this.stainlessMat);
    rodMesh.position.set(rodX, 0.220, rodZ);
    rodMesh.castShadow = true;
    standGroup.add(rodMesh);

    // Heavy-duty cast iron double bosshead clamp (十字万向固定夹)
    const clampY = 0.210;
    const bossheadGeo = new THREE.BoxGeometry(0.022, 0.024, 0.024);
    this.disposables.push(bossheadGeo);
    const bossheadMesh = new THREE.Mesh(bossheadGeo, this.darkAnodizedMat);
    bossheadMesh.position.set(rodX, clampY, rodZ);
    standGroup.add(bossheadMesh);

    // Brass T-screws on bosshead (黄铜T型调节螺栓)
    const tScrewGeo = new THREE.CylinderGeometry(0.003, 0.003, 0.016, 16);
    this.disposables.push(tScrewGeo);
    const tScrew1 = new THREE.Mesh(tScrewGeo, this.brassMat);
    tScrew1.rotation.z = Math.PI * 0.5;
    tScrew1.position.set(rodX + 0.015, clampY, rodZ);
    standGroup.add(tScrew1);

    // Extension horizontal clamp rod reaching to beaker neck
    const armGeo = new THREE.CylinderGeometry(0.004, 0.004, 0.140, 16);
    this.disposables.push(armGeo);
    const armMesh = new THREE.Mesh(armGeo, this.stainlessMat);
    armMesh.rotation.z = Math.PI * 0.5;
    armMesh.position.set(rodX - 0.070, clampY, -0.015);
    standGroup.add(armMesh);

    // 3-Finger Flask Clamp with silicone pads (三指耐热硅胶护套烧瓶夹)
    const clampCenter = new THREE.Vector3(0, clampY, -0.015);
    const fingerAngles = [-Math.PI * 0.35, Math.PI * 0.35, Math.PI];
    fingerAngles.forEach((ang) => {
      const fingerGeo = new THREE.BoxGeometry(0.004, 0.014, 0.026);
      this.disposables.push(fingerGeo);
      const finger = new THREE.Mesh(fingerGeo, this.stainlessMat);
      finger.position.set(
        clampCenter.x + Math.cos(ang) * 0.052,
        clampCenter.y,
        clampCenter.z + Math.sin(ang) * 0.052
      );
      finger.rotation.y = -ang + Math.PI * 0.5;
      standGroup.add(finger);

      // Red protective silicone sleeve pad
      const padGeo = new THREE.BoxGeometry(0.006, 0.016, 0.018);
      this.disposables.push(padGeo);
      const pad = new THREE.Mesh(padGeo, this.siliconeSleeveMat);
      pad.position.copy(finger.position);
      pad.rotation.copy(finger.rotation);
      standGroup.add(pad);
    });

    this.group.add(standGroup);

    // =========================================================================
    // 4. Double-Walled High-Borosilicate Glass Calorimeter Vessel (高硼硅玻璃量热烧瓶)
    // =========================================================================
    const vesselGroup = new THREE.Group();
    vesselGroup.position.set(0, 0, -0.015);

    // Main Cylindrical Beaker Body with flared top (y = 0.064 to 0.220, height 0.156)
    const flaskGeo = new THREE.CylinderGeometry(0.050, 0.048, 0.156, 48, 1, true);
    this.disposables.push(flaskGeo);
    const flaskMesh = new THREE.Mesh(flaskGeo, this.glassFlaskMat);
    flaskMesh.position.y = 0.142;
    flaskMesh.castShadow = false;
    flaskMesh.receiveShadow = true;
    flaskMesh.renderOrder = 5;
    vesselGroup.add(flaskMesh);

    // Beaker flat bottom glass plate
    const bottomGeo = new THREE.CylinderGeometry(0.048, 0.048, 0.005, 36);
    this.disposables.push(bottomGeo);
    const bottomMesh = new THREE.Mesh(bottomGeo, this.glassFlaskMat);
    bottomMesh.position.y = 0.0665;
    bottomMesh.renderOrder = 5;
    vesselGroup.add(bottomMesh);

    // Flared pouring spout lip rim (烧杯外翻圆润卷边杯口)
    const rimBeadGeo = new THREE.TorusGeometry(0.050, 0.0025, 16, 48);
    this.disposables.push(rimBeadGeo);
    const rimBead = new THREE.Mesh(rimBeadGeo, this.glassFlaskMat);
    rimBead.rotation.x = Math.PI * 0.5;
    rimBead.position.y = 0.220;
    rimBead.renderOrder = 5;
    vesselGroup.add(rimBead);

    // Ceramic baked graduation scale marks on beaker wall
    const scaleCanvas = document.createElement('canvas');
    scaleCanvas.width = 128;
    scaleCanvas.height = 512;
    const sCtx = scaleCanvas.getContext('2d')!;
    sCtx.fillStyle = '#ffffff';
    sCtx.textAlign = 'left';
    sCtx.font = 'bold 24px monospace';

    for (let ml = 50; ml <= 250; ml += 50) {
      const yNorm = (ml - 50) / 200; // 0 to 1
      const yPx = 460 - yNorm * 380;
      sCtx.fillRect(10, yPx, 40, 4);
      sCtx.fillText(`${ml} ml`, 58, yPx + 8);
    }
    const scaleTex = new THREE.CanvasTexture(scaleCanvas);
    scaleTex.colorSpace = THREE.SRGBColorSpace;
    this.disposables.push(scaleTex);

    const markGeo = new THREE.PlaneGeometry(0.032, 0.128);
    const markMat = new THREE.MeshBasicMaterial({ map: scaleTex, transparent: true, opacity: 0.85 });
    this.disposables.push(markGeo, markMat);
    const markMesh = new THREE.Mesh(markGeo, markMat);
    markMesh.position.set(0, 0.142, 0.0505);
    markMesh.renderOrder = 6;
    vesselGroup.add(markMesh);

    this.group.add(vesselGroup);

    // =========================================================================
    // 5. Thermodynamic Liquid Water & Meniscus (水体与杯壁润湿弯月面)
    // =========================================================================
    this.waterGroup = new THREE.Group();
    this.waterGroup.position.set(0, 0, -0.015);

    const waterGeo = new THREE.CylinderGeometry(0.0475, 0.0475, 0.080, 36);
    this.disposables.push(waterGeo);
    this.waterMesh = new THREE.Mesh(waterGeo, this.waterMat);
    this.waterMesh.position.y = 0.069 + 0.040;
    this.waterMesh.renderOrder = 3;
    this.waterGroup.add(this.waterMesh);

    // Meniscus ring where liquid meets the glass wall (毛细润湿弯月面)
    const meniscusGeo = new THREE.TorusGeometry(0.047, 0.0018, 12, 36);
    this.disposables.push(meniscusGeo);
    this.meniscusMesh = new THREE.Mesh(meniscusGeo, this.waterMat);
    this.meniscusMesh.rotation.x = Math.PI * 0.5;
    this.meniscusMesh.position.y = 0.069 + 0.080;
    this.meniscusMesh.renderOrder = 4;
    this.waterGroup.add(this.meniscusMesh);

    this.group.add(this.waterGroup);

    // =========================================================================
    // 6. Faceted Translucent Ice Crystals (多棱角晶体冰晶几何体)
    // =========================================================================
    this.iceGroup = new THREE.Group();
    this.iceGroup.position.set(0, 0, -0.015);

    // 6 realistic polyhedral ice cubes with randomized orientations
    const cubeOffsets = [
      [0.014, 0.125, 0.012],
      [-0.018, 0.120, -0.014],
      [0.016, 0.115, -0.018],
      [-0.012, 0.128, 0.016],
      [0.002, 0.132, -0.004],
      [-0.015, 0.110, 0.008]
    ];

    cubeOffsets.forEach(([cx, cy, cz], idx) => {
      // Dodecahedron / Faceted crystal geometry for realistic broken natural ice
      const crystalGeo = new THREE.DodecahedronGeometry(0.012, 0);
      this.disposables.push(crystalGeo);
      const crystal = new THREE.Mesh(crystalGeo, this.iceMat);
      crystal.position.set(cx, cy, cz);
      crystal.rotation.set(idx * 1.1, idx * 0.7, idx * 1.5);
      crystal.renderOrder = 2;
      this.iceCubes.push(crystal);
      this.iceGroup.add(crystal);
    });

    this.group.add(this.iceGroup);

    // =========================================================================
    // 7. Boiling Nucleation Micro-Bubbles (100°C 沸腾动态微气泡群)
    // =========================================================================
    const bubbleCount = 48;
    this.bubblePositions = new Float32Array(bubbleCount * 3);
    for (let b = 0; b < bubbleCount; b++) {
      const ang = Math.random() * Math.PI * 2;
      const rad = Math.sqrt(Math.random()) * 0.040;
      this.bubblePositions[b * 3 + 0] = Math.cos(ang) * rad;
      this.bubblePositions[b * 3 + 1] = 0.070 + Math.random() * 0.075;
      this.bubblePositions[b * 3 + 2] = -0.015 + Math.sin(ang) * rad;
    }

    const bubbleGeo = new THREE.BufferGeometry();
    bubbleGeo.setAttribute('position', new THREE.BufferAttribute(this.bubblePositions, 3));
    this.disposables.push(bubbleGeo);

    const bubbleMat = new THREE.PointsMaterial({
      color: 0xe0f2fe,
      size: 0.0045,
      transparent: true,
      opacity: 0.0,
      blending: THREE.AdditiveBlending,
    });
    this.disposables.push(bubbleMat);
    this.bubbleParticles = new THREE.Points(bubbleGeo, bubbleMat);
    this.group.add(this.bubbleParticles);

    // =========================================================================
    // 8. Convective Steam Vapor Plume (热对流过热蒸汽羽流)
    // =========================================================================
    const steamCount = 80;
    this.steamPositions = new Float32Array(steamCount * 3);
    for (let s = 0; s < steamCount; s++) {
      this.steamPositions[s * 3 + 0] = (Math.random() - 0.5) * 0.035;
      this.steamPositions[s * 3 + 1] = 0.225 + Math.random() * 0.120;
      this.steamPositions[s * 3 + 2] = -0.015 + (Math.random() - 0.5) * 0.035;
    }

    const steamGeo = new THREE.BufferGeometry();
    steamGeo.setAttribute('position', new THREE.BufferAttribute(this.steamPositions, 3));
    this.disposables.push(steamGeo);

    this.steamMat = new THREE.PointsMaterial({
      color: 0xf1f5f9,
      size: 0.009,
      transparent: true,
      opacity: 0.0,
      blending: THREE.AdditiveBlending,
    });
    this.disposables.push(this.steamMat);
    this.steamParticles = new THREE.Points(steamGeo, this.steamMat);
    this.group.add(this.steamParticles);

    // =========================================================================
    // 9. Precision PT100 Immersion Temperature Probe (顶置浸入式精密铂电阻温度探头)
    // =========================================================================
    const probeAssembly = new THREE.Group();
    probeAssembly.position.set(0, 0, -0.015);

    // Secondary upper bosshead clamp on retort rod
    const upperClampY = 0.270;
    const upperBoss = new THREE.Mesh(bossheadGeo, this.darkAnodizedMat);
    upperBoss.position.set(rodX, upperClampY, rodZ - (-0.015));
    probeAssembly.add(upperBoss);

    // Horizontal boom rod holding sensor
    const boomGeo = new THREE.CylinderGeometry(0.0035, 0.0035, 0.140, 16);
    this.disposables.push(boomGeo);
    const boomMesh = new THREE.Mesh(boomGeo, this.stainlessMat);
    boomMesh.rotation.z = Math.PI * 0.5;
    boomMesh.position.set(rodX - 0.070, upperClampY, rodZ - (-0.015));
    probeAssembly.add(boomMesh);

    // Sensor probe head collar
    const probeCollarGeo = new THREE.CylinderGeometry(0.006, 0.006, 0.018, 16);
    this.disposables.push(probeCollarGeo);
    const probeCollar = new THREE.Mesh(probeCollarGeo, this.brassMat);
    probeCollar.position.set(0, upperClampY, 0);
    probeAssembly.add(probeCollar);

    // Immersion probe sheath dipping into the liquid center
    const needleGeo = new THREE.CylinderGeometry(0.0022, 0.0022, 0.180, 16);
    this.disposables.push(needleGeo);
    this.tempProbeMesh = new THREE.Mesh(needleGeo, this.stainlessMat);
    this.tempProbeMesh.position.set(0, 0.165, 0);
    this.tempProbeMesh.castShadow = true;
    probeAssembly.add(this.tempProbeMesh);

    // Coiled sensor cable leading to chassis port
    const cablePts: THREE.Vector3[] = [];
    for (let i = 0; i <= 30; i++) {
      const u = i / 30;
      const ang = u * Math.PI * 2 * 5;
      const r = 0.004;
      const px = THREE.MathUtils.lerp(0.010, rodX + 0.010, u);
      const py = THREE.MathUtils.lerp(upperClampY, 0.050, u);
      cablePts.push(new THREE.Vector3(px + Math.cos(ang) * r, py, rodZ - (-0.015) + Math.sin(ang) * r));
    }
    const cableCurve = new THREE.CatmullRomCurve3(cablePts);
    const cableGeo = new THREE.TubeGeometry(cableCurve, 32, 0.0014, 8, false);
    const cableMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.6 });
    this.disposables.push(cableGeo, cableMat);
    const cableMesh = new THREE.Mesh(cableGeo, cableMat);
    probeAssembly.add(cableMesh);

    this.group.add(probeAssembly);
  }

  /**
   * Updates physical visual states based on temperature and phase fractions
   */
  public setPhaseState(
    tempK: number,
    iceFraction: number,
    waterFraction: number,
    vaporFraction: number,
    isBoiling: boolean,
    powerW: number,
    delta: number
  ): void {
    // 1. Heater coil emission glow & hotplate lights
    const heatNorm = THREE.MathUtils.clamp(powerW / 2000, 0, 1);
    this.heaterCoilMat.emissiveIntensity = THREE.MathUtils.lerp(0.3, 1.2, heatNorm);
    this.heaterLight.intensity = THREE.MathUtils.lerp(0.8, 3.6, heatNorm);

    // Update Console Readout
    this.renderConsole(tempK, powerW, powerW > 0);

    // 2. Ice cubes shrink scale & slowly drift as ice melts
    if (iceFraction > 0.01) {
      this.iceGroup.visible = true;
      const s = Math.cbrt(iceFraction);
      this.iceCubes.forEach((cube, i) => {
        cube.scale.set(s, s, s);
        cube.rotation.y += delta * (0.2 + i * 0.1);
      });
    } else {
      this.iceGroup.visible = false;
    }

    // 3. Water volume height adjusts according to liquid fraction
    if (waterFraction > 0.01) {
      this.waterGroup.visible = true;
      const h = Math.max(0.008, 0.080 * waterFraction);
      this.waterMesh.scale.y = waterFraction;
      this.waterMesh.position.y = 0.069 + h * 0.5;
      this.meniscusMesh.position.y = 0.069 + h;

      // Color shifts with temperature
      const tempNorm = THREE.MathUtils.clamp((tempK - 273.15) / 100, 0, 1);
      this.waterMat.color.setRGB(
        THREE.MathUtils.lerp(0.20, 0.38, tempNorm),
        THREE.MathUtils.lerp(0.72, 0.85, tempNorm),
        THREE.MathUtils.lerp(0.98, 0.90, tempNorm)
      );
    } else {
      this.waterGroup.visible = false;
    }

    // 4. Boiling Bubbles Animation
    const bubbleMat = this.bubbleParticles.material as THREE.PointsMaterial;
    if (isBoiling) {
      bubbleMat.opacity = 0.85;
      const count = this.bubblePositions.length / 3;
      for (let i = 0; i < count; i++) {
        this.bubblePositions[i * 3 + 1] += (0.05 + (i % 5) * 0.015) * delta * 5;
        this.bubblePositions[i * 3 + 0] += Math.sin(this.bubblePositions[i * 3 + 1] * 40) * 0.0004;
        if (this.bubblePositions[i * 3 + 1] > 0.145) {
          this.bubblePositions[i * 3 + 1] = 0.072;
        }
      }
      this.bubbleParticles.geometry.attributes.position.needsUpdate = true;
    } else {
      bubbleMat.opacity = 0.0;
    }

    // 5. Steam Plume Animation
    if (isBoiling || vaporFraction > 0.01) {
      this.steamMat.opacity = Math.min(0.85, 0.25 + vaporFraction * 0.6);
      const count = this.steamPositions.length / 3;
      for (let i = 0; i < count; i++) {
        this.steamPositions[i * 3 + 1] += 0.07 * delta * 5;
        this.steamPositions[i * 3 + 0] += (Math.random() - 0.5) * 0.004;
        this.steamPositions[i * 3 + 2] += (Math.random() - 0.5) * 0.004;
        if (this.steamPositions[i * 3 + 1] > 0.35) {
          this.steamPositions[i * 3 + 1] = 0.222;
          this.steamPositions[i * 3 + 0] = (Math.random() - 0.5) * 0.02;
          this.steamPositions[i * 3 + 2] = -0.015 + (Math.random() - 0.5) * 0.02;
        }
      }
      this.steamParticles.geometry.attributes.position.needsUpdate = true;
    } else {
      this.steamMat.opacity = 0.0;
    }
  }

  public dispose(): void {
    this.disposables.forEach((d) => d.dispose());
    this.disposables = [];
  }
}
