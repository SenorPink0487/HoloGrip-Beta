import * as THREE from 'three';

export class PhaseCalorimeterMesh {
  public group: THREE.Group;

  // 材质与动态渲染组件
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

  // 控制台显示屏刷新缓存与节流机制
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
    // 1. 仪器外壳缎面本色阳极氧化铝材质
    this.satinAluminumMat = new THREE.MeshStandardMaterial({
      color: 0xe2eaf2,
      metalness: 0.78,
      roughness: 0.22,
    });
    this.disposables.push(this.satinAluminumMat);

    // 2. 控制台面板哑光黑色硬质阳极氧化铝材质
    this.darkAnodizedMat = new THREE.MeshStandardMaterial({
      color: 0x1e2430,
      metalness: 0.82,
      roughness: 0.28,
    });
    this.disposables.push(this.darkAnodizedMat);

    // 3. 铁架台立柱与夹头镜面抛光 304 不锈钢材质
    this.stainlessMat = new THREE.MeshStandardMaterial({
      color: 0xf8fafc,
      metalness: 0.94,
      roughness: 0.12,
    });
    this.disposables.push(this.stainlessMat);

    // 4. 精密调节滚花黄铜手拧螺丝材质
    this.brassMat = new THREE.MeshStandardMaterial({
      color: 0xeab308,
      metalness: 0.85,
      roughness: 0.25,
    });
    this.disposables.push(this.brassMat);

    // 5. 加热台表面白色耐热耐腐蚀陶瓷材质
    this.ceramicTopMat = new THREE.MeshStandardMaterial({
      color: 0xf8fafc,
      metalness: 0.10,
      roughness: 0.35,
    });
    this.disposables.push(this.ceramicTopMat);

    // 6. 高温电磁感应加热发热核心材质
    this.heaterCoilMat = new THREE.MeshStandardMaterial({
      color: 0xb91c1c,
      emissive: 0xef4444,
      emissiveIntensity: 0.65,
      roughness: 0.35,
      metalness: 0.75,
    });
    this.disposables.push(this.heaterCoilMat);

    // 7. 高级高硼硅光学物理玻璃材质
    // 采用清漆高光模拟的高性能物理玻璃，避免昂贵的透射全屏复制开销
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

    // 8. 物理微蓝清澈水体材质
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

    // 9. 天然晶莹冰晶材质
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

    // 10. 耐热硅胶夹具防护护套材质
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

    // 青色高亮外框
    ctx.strokeStyle = '#0284c7';
    ctx.lineWidth = 4;
    ctx.strokeRect(3, 3, 506, 154);

    // 顶部状态信息行
    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 22px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('DIGITAL HOTPLATE · PT100 FEEDBACK', 20, 36);

    ctx.fillStyle = isHeating ? '#10b981' : '#64748b';
    ctx.textAlign = 'right';
    ctx.fillText(isHeating ? '● HEATING ON' : '○ STANDBY', 492, 36);

    // 核心温度高亮数字显示
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

    // 底部信息行：功率与相变阶段指示
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
    // 1. 橡胶减震脚垫（4 只大型防震脚垫，悬空台面 12mm）
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

      // 不锈钢水平调平轴套
      const collarGeo = new THREE.CylinderGeometry(0.018, 0.018, 0.003, 20);
      this.disposables.push(collarGeo);
      const collar = new THREE.Mesh(collarGeo, this.stainlessMat);
      collar.position.set(fx, 0.0135, fz);
      footpadGroup.add(collar);
    });
    this.group.add(footpadGroup);

    // =========================================================================
    // 2. 智能恒温加热搅拌仪机身总成
    // =========================================================================
    const chassisGroup = new THREE.Group();
    chassisGroup.position.set(0, 0, 0);

    // 下层铸铝底座机壳主体
    const bodyGeo = new THREE.BoxGeometry(0.34, 0.040, 0.26);
    this.disposables.push(bodyGeo);
    const bodyMesh = new THREE.Mesh(bodyGeo, this.satinAluminumMat);
    bodyMesh.position.set(0, 0.034, 0);
    bodyMesh.castShadow = true;
    bodyMesh.receiveShadow = true;
    chassisGroup.add(bodyMesh);

    // 前置倾斜式仪表控制台区域
    const consoleGeo = new THREE.BoxGeometry(0.34, 0.032, 0.090);
    this.disposables.push(consoleGeo);
    const consoleMesh = new THREE.Mesh(consoleGeo, this.darkAnodizedMat);
    consoleMesh.position.set(0, 0.030, 0.125);
    consoleMesh.rotation.x = Math.PI * 0.12; // 向前倾斜 21 度斜面
    consoleMesh.castShadow = true;
    chassisGroup.add(consoleMesh);

    // 控制台液晶显示屏组件
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

    // 金属滚花温控与功率调节编码器旋钮
    const knobGeo = new THREE.CylinderGeometry(0.016, 0.016, 0.018, 24);
    this.disposables.push(knobGeo);
    const knob = new THREE.Mesh(knobGeo, this.satinAluminumMat);
    knob.rotation.x = Math.PI * 0.62;
    knob.position.set(0.060, 0.032, 0.158);
    chassisGroup.add(knob);

    // 带有红色指示灯的船型电源开关
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

    // 顶部 Ø135mm 白色耐腐蚀陶瓷加热盘
    const plateGeo = new THREE.CylinderGeometry(0.068, 0.068, 0.010, 36);
    this.disposables.push(plateGeo);
    const plateMesh = new THREE.Mesh(plateGeo, this.ceramicTopMat);
    plateMesh.position.set(0, 0.059, -0.015);
    plateMesh.castShadow = true;
    plateMesh.receiveShadow = true;
    chassisGroup.add(plateMesh);

    // 加热盘外围不锈钢防溢流保护边圈
    const rimGeo = new THREE.TorusGeometry(0.069, 0.002, 16, 36);
    this.disposables.push(rimGeo);
    const rimMesh = new THREE.Mesh(rimGeo, this.stainlessMat);
    rimMesh.rotation.x = Math.PI * 0.5;
    rimMesh.position.set(0, 0.064, -0.015);
    chassisGroup.add(rimMesh);

    // 陶瓷板下方的发热电阻丝线圈
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
    // 3. 重型不锈钢铁架台与三指烧瓶夹具
    // =========================================================================
    const standGroup = new THREE.Group();
    const rodX = 0.125;
    const rodZ = -0.090;

    // 机身后部的重型铁架台固定安装座
    const socketGeo = new THREE.CylinderGeometry(0.012, 0.014, 0.024, 20);
    this.disposables.push(socketGeo);
    const socketMesh = new THREE.Mesh(socketGeo, this.stainlessMat);
    socketMesh.position.set(rodX, 0.060, rodZ);
    standGroup.add(socketMesh);

    // 实心 Ø12mm 不锈钢垂直支撑立柱
    const rodGeo = new THREE.CylinderGeometry(0.006, 0.006, 0.320, 24);
    this.disposables.push(rodGeo);
    const rodMesh = new THREE.Mesh(rodGeo, this.stainlessMat);
    rodMesh.position.set(rodX, 0.220, rodZ);
    rodMesh.castShadow = true;
    standGroup.add(rodMesh);

    // 重型铸铁双向十字紧固夹头
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

    // 延伸至烧瓶颈部的水平悬臂夹杆
    const armGeo = new THREE.CylinderGeometry(0.004, 0.004, 0.140, 16);
    this.disposables.push(armGeo);
    const armMesh = new THREE.Mesh(armGeo, this.stainlessMat);
    armMesh.rotation.z = Math.PI * 0.5;
    armMesh.position.set(rodX - 0.070, clampY, -0.015);
    standGroup.add(armMesh);

    // 配备耐热硅胶护套的三指烧瓶夹
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

      // 红色耐热硅胶保护软垫
      const padGeo = new THREE.BoxGeometry(0.006, 0.016, 0.018);
      this.disposables.push(padGeo);
      const pad = new THREE.Mesh(padGeo, this.siliconeSleeveMat);
      pad.position.copy(finger.position);
      pad.rotation.copy(finger.rotation);
      standGroup.add(pad);
    });

    this.group.add(standGroup);

    // =========================================================================
    // 4. 双层高硼硅玻璃量热烧瓶容器
    // =========================================================================
    const vesselGroup = new THREE.Group();
    vesselGroup.position.set(0, 0, -0.015);

    // 带有微展杯口的圆柱形烧杯主体
    const flaskGeo = new THREE.CylinderGeometry(0.050, 0.048, 0.156, 48, 1, true);
    this.disposables.push(flaskGeo);
    const flaskMesh = new THREE.Mesh(flaskGeo, this.glassFlaskMat);
    flaskMesh.position.y = 0.142;
    flaskMesh.castShadow = false;
    flaskMesh.receiveShadow = true;
    flaskMesh.renderOrder = 5;
    vesselGroup.add(flaskMesh);

    // 烧杯平整玻璃底部
    const bottomGeo = new THREE.CylinderGeometry(0.048, 0.048, 0.005, 36);
    this.disposables.push(bottomGeo);
    const bottomMesh = new THREE.Mesh(bottomGeo, this.glassFlaskMat);
    bottomMesh.position.y = 0.0665;
    bottomMesh.renderOrder = 5;
    vesselGroup.add(bottomMesh);

    // 烧杯外翻圆润卷边导流杯口
    const rimBeadGeo = new THREE.TorusGeometry(0.050, 0.0025, 16, 48);
    this.disposables.push(rimBeadGeo);
    const rimBead = new THREE.Mesh(rimBeadGeo, this.glassFlaskMat);
    rimBead.rotation.x = Math.PI * 0.5;
    rimBead.position.y = 0.220;
    rimBead.renderOrder = 5;
    vesselGroup.add(rimBead);

    // 烧杯外壁高温烧结陶瓷容量刻度线
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
    // 5. 热力学液态水体与毛细弯月面
    // =========================================================================
    this.waterGroup = new THREE.Group();
    this.waterGroup.position.set(0, 0, -0.015);

    const waterGeo = new THREE.CylinderGeometry(0.0475, 0.0475, 0.080, 36);
    this.disposables.push(waterGeo);
    this.waterMesh = new THREE.Mesh(waterGeo, this.waterMat);
    this.waterMesh.position.y = 0.069 + 0.040;
    this.waterMesh.renderOrder = 3;
    this.waterGroup.add(this.waterMesh);

    // 液体与玻璃杯壁接触形成的毛细弯月面环
    const meniscusGeo = new THREE.TorusGeometry(0.047, 0.0018, 12, 36);
    this.disposables.push(meniscusGeo);
    this.meniscusMesh = new THREE.Mesh(meniscusGeo, this.waterMat);
    this.meniscusMesh.rotation.x = Math.PI * 0.5;
    this.meniscusMesh.position.y = 0.069 + 0.080;
    this.meniscusMesh.renderOrder = 4;
    this.waterGroup.add(this.meniscusMesh);

    this.group.add(this.waterGroup);

    // =========================================================================
    // 6. 多棱角半透明冰晶晶体几何体
    // =========================================================================
    this.iceGroup = new THREE.Group();
    this.iceGroup.position.set(0, 0, -0.015);

    // 6 块具有随机初始姿态的多面体拟真冰块
    const cubeOffsets = [
      [0.014, 0.125, 0.012],
      [-0.018, 0.120, -0.014],
      [0.016, 0.115, -0.018],
      [-0.012, 0.128, 0.016],
      [0.002, 0.132, -0.004],
      [-0.015, 0.110, 0.008]
    ];

    cubeOffsets.forEach(([cx, cy, cz], idx) => {
      // 用于模拟天然破碎冰块的十二面体与棱角多面体几何体
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
    // 7. 沸腾成核动态微气泡群（100°C 沸腾汽化）
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
    // 8. 热对流过热蒸汽蒸发羽流粒子群
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
    // 9. 顶置浸入式 PT100 精密铂电阻温度探头
    // =========================================================================
    const probeAssembly = new THREE.Group();
    probeAssembly.position.set(0, 0, -0.015);

    // 铁架台立柱上的上层辅助十字夹头
    const upperClampY = 0.270;
    const upperBoss = new THREE.Mesh(bossheadGeo, this.darkAnodizedMat);
    upperBoss.position.set(rodX, upperClampY, rodZ - (-0.015));
    probeAssembly.add(upperBoss);

    // 固定测温探头的水平横臂杆
    const boomGeo = new THREE.CylinderGeometry(0.0035, 0.0035, 0.140, 16);
    this.disposables.push(boomGeo);
    const boomMesh = new THREE.Mesh(boomGeo, this.stainlessMat);
    boomMesh.rotation.z = Math.PI * 0.5;
    boomMesh.position.set(rodX - 0.070, upperClampY, rodZ - (-0.015));
    probeAssembly.add(boomMesh);

    // 探头顶端紧固固定套环
    const probeCollarGeo = new THREE.CylinderGeometry(0.006, 0.006, 0.018, 16);
    this.disposables.push(probeCollarGeo);
    const probeCollar = new THREE.Mesh(probeCollarGeo, this.brassMat);
    probeCollar.position.set(0, upperClampY, 0);
    probeAssembly.add(probeCollar);

    // 伸入液体中心区域的金属测温保护套管
    const needleGeo = new THREE.CylinderGeometry(0.0022, 0.0022, 0.180, 16);
    this.disposables.push(needleGeo);
    this.tempProbeMesh = new THREE.Mesh(needleGeo, this.stainlessMat);
    this.tempProbeMesh.position.set(0, 0.165, 0);
    this.tempProbeMesh.castShadow = true;
    probeAssembly.add(this.tempProbeMesh);

    // 连接至机身端口的螺旋弹簧传感器信号线
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
   * 根据温度与相变组分分数实时更新物理视觉呈现状态
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
    // 1. 发热线圈发光辐射与加热台指示光源
    const heatNorm = THREE.MathUtils.clamp(powerW / 2000, 0, 1);
    this.heaterCoilMat.emissiveIntensity = THREE.MathUtils.lerp(0.3, 1.2, heatNorm);
    this.heaterLight.intensity = THREE.MathUtils.lerp(0.8, 3.6, heatNorm);

    // 更新控制台屏幕数字读数
    this.renderConsole(tempK, powerW, powerW > 0);

    // 2. 冰块融化：几何体积动态缩放并缓慢浮游漂移
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

    // 3. 水体体积液位随液相分数动态调节
    if (waterFraction > 0.01) {
      this.waterGroup.visible = true;
      const h = Math.max(0.008, 0.080 * waterFraction);
      this.waterMesh.scale.y = waterFraction;
      this.waterMesh.position.y = 0.069 + h * 0.5;
      this.meniscusMesh.position.y = 0.069 + h;

      // 溶液颜色随温度变化微妙偏移
      const tempNorm = THREE.MathUtils.clamp((tempK - 273.15) / 100, 0, 1);
      this.waterMat.color.setRGB(
        THREE.MathUtils.lerp(0.20, 0.38, tempNorm),
        THREE.MathUtils.lerp(0.72, 0.85, tempNorm),
        THREE.MathUtils.lerp(0.98, 0.90, tempNorm)
      );
    } else {
      this.waterGroup.visible = false;
    }

    // 4. 沸腾成核气泡动画
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

    // 5. 蒸汽羽流动画更新
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
