import * as THREE from 'three';

export interface ConductionMeshOptions {
  rodLength?: number;
  rodRadius?: number;
}

export class ConductionBenchMesh {
  public group: THREE.Group;
  public probeGroup: THREE.Group;
  public probeMesh: THREE.Mesh;
  public rodMesh: THREE.Mesh;

  public readonly rodLength = 0.32;
  public readonly rodRadius = 0.012;
  public readonly rodStartX = -0.16;
  public readonly rodEndX = 0.16;
  public readonly railZ = 0.052;

  // Materials & Dynamic Elements
  private satinAluminumMat: THREE.MeshStandardMaterial;
  private darkAnodizedMat: THREE.MeshStandardMaterial;
  private stainlessMat: THREE.MeshStandardMaterial;
  private brushedSteelMat: THREE.MeshStandardMaterial;
  private copperMat: THREE.MeshStandardMaterial;
  private brassMat: THREE.MeshStandardMaterial;
  private ceramicMat: THREE.MeshStandardMaterial;
  private goldShieldMat: THREE.MeshStandardMaterial;
  private opticalGlassMat: THREE.MeshStandardMaterial;

  private heaterHousing: THREE.Group;
  private coolerHousing: THREE.Group;
  private heaterLight: THREE.PointLight;
  private coolerLight: THREE.PointLight;
  private heaterCoilGlowMesh: THREE.Mesh;
  private coolerLedHalo: THREE.Mesh;

  // FLIR Thermal Texture Map for the Rod
  private thermalCanvas: HTMLCanvasElement;
  private thermalCtx: CanvasRenderingContext2D;
  private thermalTexture: THREE.CanvasTexture;
  private rodMaterial: THREE.MeshStandardMaterial;

  // Digital Temperature Readout on Sliding Probe
  private displayCanvas: HTMLCanvasElement;
  private displayCtx: CanvasRenderingContext2D;
  private displayTexture: THREE.CanvasTexture;

  // Laser Pointer Aiming Beam
  private laserDotMesh: THREE.Mesh;

  // Composite rod junction ring
  private junctionCollar: THREE.Mesh;

  private currentNormX = 0.5;
  private disposables: { dispose: () => void }[] = [];

  // OLED Screen Update Caching & Throttling
  private lastRenderTempK = -999;
  private lastRenderNormX = -999;
  private lastRenderGrad = -999999;
  private lastRenderFlux = -999999;
  private lastDisplayRenderTime = 0;

  constructor(options: ConductionMeshOptions = {}) {
    if (options.rodLength) (this as any).rodLength = options.rodLength;
    if (options.rodRadius) (this as any).rodRadius = options.rodRadius;

    this.group = new THREE.Group();
    this.group.name = 'ConductionBenchMesh';
    this.buildApparatus();
  }

  private initMaterials(): void {
    // 1. Natural satin clear-anodized aluminum (航空级阳极化天然铝)
    this.satinAluminumMat = new THREE.MeshStandardMaterial({
      color: 0xe2eaf2,
      metalness: 0.78,
      roughness: 0.22,
    });
    this.disposables.push(this.satinAluminumMat);

    // 2. Black hard-anodized aerospace aluminum (哑光黑阳极氧化铝)
    this.darkAnodizedMat = new THREE.MeshStandardMaterial({
      color: 0x1e2430,
      metalness: 0.82,
      roughness: 0.28,
    });
    this.disposables.push(this.darkAnodizedMat);

    // 3. Mirror-polished 304 stainless steel (高抛光304不锈钢)
    this.stainlessMat = new THREE.MeshStandardMaterial({
      color: 0xf8fafc,
      metalness: 0.94,
      roughness: 0.12,
    });
    this.disposables.push(this.stainlessMat);

    // 4. Fine brushed stainless steel (拉丝不锈钢)
    this.brushedSteelMat = new THREE.MeshStandardMaterial({
      color: 0xcfd8e3,
      metalness: 0.88,
      roughness: 0.30,
    });
    this.disposables.push(this.brushedSteelMat);

    // 5. High-conductivity pure copper (高导热紫铜)
    this.copperMat = new THREE.MeshStandardMaterial({
      color: 0xdf5a1a,
      metalness: 0.92,
      roughness: 0.18,
    });
    this.disposables.push(this.copperMat);

    // 6. Machined optical brass (精密光学黄铜螺母/锁紧钮)
    this.brassMat = new THREE.MeshStandardMaterial({
      color: 0xeab308,
      metalness: 0.85,
      roughness: 0.25,
    });
    this.disposables.push(this.brassMat);

    // 7. Alumina technical ceramic (绝缘耐热精密氧化铝陶瓷)
    this.ceramicMat = new THREE.MeshStandardMaterial({
      color: 0xf1f5f9,
      metalness: 0.10,
      roughness: 0.40,
    });
    this.disposables.push(this.ceramicMat);

    // 8. Gold mirror thermal radiation shield (镀金红外反射热屏蔽板)
    this.goldShieldMat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      metalness: 0.96,
      roughness: 0.10,
    });
    this.disposables.push(this.goldShieldMat);

    // 9. Optical anti-reflective coated sapphire window (红外探针透镜)
    this.opticalGlassMat = new THREE.MeshStandardMaterial({
      color: 0x93c5fd,
      transparent: true,
      opacity: 0.65,
      roughness: 0.12,
      metalness: 0.20,
    });
    this.disposables.push(this.opticalGlassMat);
  }

  private createNameplateTexture(): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 128;
    const ctx = canvas.getContext('2d')!;

    const grad = ctx.createLinearGradient(0, 0, 0, 128);
    grad.addColorStop(0, '#111827');
    grad.addColorStop(0.5, '#1e293b');
    grad.addColorStop(1, '#0f172a');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 4;
    ctx.strokeRect(4, 4, canvas.width - 8, canvas.height - 8);

    ctx.strokeStyle = '#64748b';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(10, 10, canvas.width - 20, canvas.height - 20);

    ctx.fillStyle = '#f8fafc';
    ctx.textAlign = 'left';
    ctx.font = 'bold 24px -apple-system, BlinkMacSystemFont, "SF Pro Display", monospace';
    ctx.fillText('HOLOGRIP · PRECISION FOURIER THERMAL CONDUCTION BENCH', 36, 44);

    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 16px monospace';
    ctx.textAlign = 'right';
    ctx.fillText('q = -k ∇T · 320mm CALIBRATED SPECIMEN', canvas.width - 36, 44);

    // Metric millimeter divisions
    const totalDivs = 64;
    const startX = 40;
    const endX = canvas.width - 40;
    const stepX = (endX - startX) / totalDivs;

    ctx.strokeStyle = '#38bdf8';
    for (let i = 0; i <= totalDivs; i++) {
      const x = startX + i * stepX;
      if (i % 8 === 0) {
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(x, 56);
        ctx.lineTo(x, 90);
        ctx.stroke();

        ctx.fillStyle = '#94a3b8';
        ctx.font = 'bold 15px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(`${i * 5}mm`, x, 112);
      } else if (i % 4 === 0) {
        ctx.lineWidth = 1.6;
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

  private initThermalCanvas(): void {
    this.thermalCanvas = document.createElement('canvas');
    this.thermalCanvas.width = 512;
    this.thermalCanvas.height = 32;
    this.thermalCtx = this.thermalCanvas.getContext('2d')!;

    this.thermalTexture = new THREE.CanvasTexture(this.thermalCanvas);
    this.thermalTexture.colorSpace = THREE.SRGBColorSpace;
    this.thermalTexture.wrapS = THREE.ClampToEdgeWrapping;
    this.thermalTexture.wrapT = THREE.ClampToEdgeWrapping;
    this.disposables.push(this.thermalTexture);

    this.updateThermalGradient([450, 420, 390, 360, 330, 310, 295], 450, 295);
  }

  private initDigitalDisplay(): void {
    this.displayCanvas = document.createElement('canvas');
    this.displayCanvas.width = 512;
    this.displayCanvas.height = 192;
    this.displayCtx = this.displayCanvas.getContext('2d')!;

    this.displayTexture = new THREE.CanvasTexture(this.displayCanvas);
    this.displayTexture.colorSpace = THREE.SRGBColorSpace;
    this.disposables.push(this.displayTexture);

    this.renderDisplay(372.5, 0.5, -484.4, 188916);
  }

  private renderDisplay(
    tempK: number,
    normX: number,
    gradKpm = -480,
    fluxWpm2 = 185000,
    force = false
  ): void {
    const now = performance.now();
    if (!force) {
      const tempDiff = Math.abs(tempK - this.lastRenderTempK);
      const xDiff = Math.abs(normX - this.lastRenderNormX);
      const gradDiff = Math.abs(gradKpm - this.lastRenderGrad);
      if (tempDiff < 0.05 && xDiff < 0.001 && gradDiff < 1.0) {
        return;
      }
      if (now - this.lastDisplayRenderTime < 80) {
        return;
      }
    }

    this.lastRenderTempK = tempK;
    this.lastRenderNormX = normX;
    this.lastRenderGrad = gradKpm;
    this.lastRenderFlux = fluxWpm2;
    this.lastDisplayRenderTime = now;

    const ctx = this.displayCtx;
    ctx.fillStyle = '#050811';
    ctx.fillRect(0, 0, 512, 192);

    // Outer cyber bezel
    ctx.strokeStyle = '#0284c7';
    ctx.lineWidth = 6;
    ctx.strokeRect(3, 3, 506, 186);

    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2;
    ctx.strokeRect(10, 10, 492, 172);

    // Status banner
    ctx.fillStyle = '#0ea5e9';
    ctx.font = 'bold 22px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('● IR PYROMETER PROBE · ACTIVE', 24, 40);

    const xMm = normX * this.rodLength * 1000;
    ctx.fillStyle = '#94a3b8';
    ctx.font = 'bold 22px monospace';
    ctx.textAlign = 'right';
    ctx.fillText(`x = ${xMm.toFixed(1)} mm`, 488, 40);

    // Large main temperature readout
    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 64px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`${tempK.toFixed(1)} K`, 24, 108);

    ctx.fillStyle = '#67e8f9';
    ctx.font = 'bold 36px monospace';
    ctx.textAlign = 'right';
    const tempC = tempK - 273.15;
    ctx.fillText(`${tempC >= 0 ? '+' : ''}${tempC.toFixed(1)} °C`, 488, 104);

    // Divider line
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(24, 126);
    ctx.lineTo(488, 126);
    ctx.stroke();

    // Secondary physics metrics
    ctx.fillStyle = '#a5f3fc';
    ctx.font = 'bold 22px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`∇T: ${gradKpm.toFixed(0)} K/m`, 24, 162);

    ctx.fillStyle = '#f59e0b';
    ctx.textAlign = 'right';
    const fluxKw = (fluxWpm2 / 1000).toFixed(1);
    ctx.fillText(`q: ${fluxKw} kW/m²`, 488, 162);

    this.displayTexture.needsUpdate = true;
  }

  private buildApparatus(): void {
    this.initMaterials();

    // =========================================================================
    // 1. Vibration-Isolation Footpads (4 只大型高避震橡胶脚垫，架空深色桌面 14mm)
    // =========================================================================
    const footpadGroup = new THREE.Group();
    footpadGroup.name = 'BenchRubberFootpads';

    const footMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      roughness: 0.90,
      metalness: 0.08,
    });
    this.disposables.push(footMat);

    const footGeo = new THREE.CylinderGeometry(0.018, 0.022, 0.014, 24);
    this.disposables.push(footGeo);

    const footCoords = [
      [-0.25, -0.09], [0.25, -0.09],
      [-0.25, 0.09], [0.25, 0.09]
    ];
    footCoords.forEach(([fx, fz]) => {
      const foot = new THREE.Mesh(footGeo, footMat);
      foot.position.set(fx, 0.007, fz);
      foot.receiveShadow = true;
      footpadGroup.add(foot);

      // Knurled leveling thumb-wheel collar (不锈钢调平旋钮)
      const wheelGeo = new THREE.CylinderGeometry(0.020, 0.020, 0.004, 24);
      this.disposables.push(wheelGeo);
      const wheel = new THREE.Mesh(wheelGeo, this.stainlessMat);
      wheel.position.set(fx, 0.015, fz);
      footpadGroup.add(wheel);
    });
    this.group.add(footpadGroup);

    // =========================================================================
    // 2. High-Grade Dual-Tier Precision Plinth (锻面银白航空铝双阶厚重基座)
    // =========================================================================
    // Tier 1: Heavy lower foundation block (y = 0.016 to 0.034)
    const lowerPlinthGeo = new THREE.BoxGeometry(0.58, 0.018, 0.22);
    this.disposables.push(lowerPlinthGeo);
    const lowerPlinth = new THREE.Mesh(lowerPlinthGeo, this.satinAluminumMat);
    lowerPlinth.position.y = 0.025;
    lowerPlinth.castShadow = true;
    lowerPlinth.receiveShadow = true;
    this.group.add(lowerPlinth);

    // Beveled perimeter transition rim
    const rimGeo = new THREE.BoxGeometry(0.584, 0.004, 0.224);
    this.disposables.push(rimGeo);
    const rim = new THREE.Mesh(rimGeo, this.stainlessMat);
    rim.position.y = 0.035;
    this.group.add(rim);

    // Tier 2: Machined upper deck plate (y = 0.036 to 0.046)
    const upperDeckGeo = new THREE.BoxGeometry(0.54, 0.010, 0.18);
    this.disposables.push(upperDeckGeo);
    const upperDeck = new THREE.Mesh(upperDeckGeo, this.darkAnodizedMat);
    upperDeck.position.y = 0.041;
    upperDeck.castShadow = true;
    upperDeck.receiveShadow = true;
    this.group.add(upperDeck);

    // Front Laser-Etched Nameplate Plaque (激光蚀刻全息标定铭牌)
    const nameplateTex = this.createNameplateTexture();
    const nameplateMat = new THREE.MeshBasicMaterial({ map: nameplateTex });
    this.disposables.push(nameplateMat);

    const nameplateGeo = new THREE.PlaneGeometry(0.52, 0.016);
    this.disposables.push(nameplateGeo);
    const nameplateMesh = new THREE.Mesh(nameplateGeo, nameplateMat);
    nameplateMesh.position.set(0, 0.025, 0.111);
    this.group.add(nameplateMesh);

    // =========================================================================
    // 3. Genuine 45° Dovetail Optical Bench Rail (45度精密燕尾光学导轨)
    // =========================================================================
    const railShape = new THREE.Shape();
    const rw = 0.028;  // rail width
    const rh = 0.014;  // rail height
    const bevel = 0.005;
    railShape.moveTo(-rw * 0.5 + bevel, 0);
    railShape.lineTo(rw * 0.5 - bevel, 0);
    railShape.lineTo(rw * 0.5, rh);
    railShape.lineTo(-rw * 0.5, rh);
    railShape.closePath();

    const railExtrudeSettings = {
      depth: 0.48,
      bevelEnabled: false,
    };
    const railGeo = new THREE.ExtrudeGeometry(railShape, railExtrudeSettings);
    railGeo.center();
    this.disposables.push(railGeo);

    const railMesh = new THREE.Mesh(railGeo, this.stainlessMat);
    railMesh.rotation.y = Math.PI * 0.5; // along X
    railMesh.position.set(0, 0.052, this.railZ);
    this.group.add(railMesh);

    // Center longitudinal alignment scale groove (中心精密定位刻线槽)
    const grooveGeo = new THREE.BoxGeometry(0.46, 0.001, 0.002);
    this.disposables.push(grooveGeo);
    const groove = new THREE.Mesh(grooveGeo, this.darkAnodizedMat);
    groove.position.set(0, 0.0595, this.railZ);
    this.group.add(groove);

    // =========================================================================
    // 4. High-Temperature Heat Source Furnace (左端恒温电加热炉工业级组件)
    // =========================================================================
    this.heaterHousing = new THREE.Group();
    const hx = this.rodStartX - 0.038;
    this.heaterHousing.position.set(hx, 0.076, 0);

    // Base saddle clamping to rail
    const hSaddleGeo = new THREE.BoxGeometry(0.064, 0.016, 0.090);
    this.disposables.push(hSaddleGeo);
    const hSaddle = new THREE.Mesh(hSaddleGeo, this.satinAluminumMat);
    hSaddle.position.set(0, -0.026, 0);
    this.heaterHousing.add(hSaddle);

    // Knurled brass locking clamp thumbscrew
    const hClampKnobGeo = new THREE.CylinderGeometry(0.008, 0.008, 0.014, 20);
    this.disposables.push(hClampKnobGeo);
    const hClampKnob = new THREE.Mesh(hClampKnobGeo, this.brassMat);
    hClampKnob.rotation.x = Math.PI * 0.5;
    hClampKnob.position.set(0, -0.026, 0.048);
    this.heaterHousing.add(hClampKnob);

    // Main furnace block with horizontal CNC cooling fins
    const hBlockGeo = new THREE.BoxGeometry(0.060, 0.068, 0.068);
    this.disposables.push(hBlockGeo);
    const hBlock = new THREE.Mesh(hBlockGeo, this.darkAnodizedMat);
    hBlock.castShadow = true;
    this.heaterHousing.add(hBlock);

    // 6 horizontal cooling fin slats (6道水平散热槽与鳍片)
    for (let f = -2; f <= 2; f++) {
      const finGeo = new THREE.BoxGeometry(0.064, 0.003, 0.072);
      this.disposables.push(finGeo);
      const fin = new THREE.Mesh(finGeo, this.satinAluminumMat);
      fin.position.y = f * 0.012;
      this.heaterHousing.add(fin);
    }

    // Heavy pure copper clamping chuck (高导热紫铜卡盘，紧固待测棒)
    const hChuckGeo = new THREE.CylinderGeometry(0.022, 0.022, 0.024, 32);
    this.disposables.push(hChuckGeo);
    const hChuck = new THREE.Mesh(hChuckGeo, this.copperMat);
    hChuck.rotation.z = Math.PI * 0.5;
    hChuck.position.set(0.038, 0, 0);
    this.heaterHousing.add(hChuck);

    // Chuck compression screws (4只内六角紧固螺栓)
    const boltGeo = new THREE.CylinderGeometry(0.0025, 0.0025, 0.004, 16);
    this.disposables.push(boltGeo);
    for (let b = 0; b < 4; b++) {
      const ang = (b * Math.PI) / 2 + Math.PI / 4;
      const bolt = new THREE.Mesh(boltGeo, this.stainlessMat);
      bolt.position.set(0.048, Math.sin(ang) * 0.015, Math.cos(ang) * 0.015);
      bolt.rotation.z = Math.PI * 0.5;
      this.heaterHousing.add(bolt);
    }

    // Gold-plated thermal radiation baffle disc (镀金防辐射隔热挡盘)
    const baffleGeo = new THREE.CylinderGeometry(0.032, 0.032, 0.002, 32);
    this.disposables.push(baffleGeo);
    const baffle = new THREE.Mesh(baffleGeo, this.goldShieldMat);
    baffle.rotation.z = Math.PI * 0.5;
    baffle.position.set(0.022, 0, 0);
    this.heaterHousing.add(baffle);

    // Glowing internal heating core ring (可透视电热丝发热核心)
    const glowGeo = new THREE.TorusGeometry(0.016, 0.003, 16, 32);
    const glowMat = new THREE.MeshStandardMaterial({
      color: 0xef4444,
      emissive: 0xff3b30,
      emissiveIntensity: 0.85,
    });
    this.disposables.push(glowGeo, glowMat);
    this.heaterCoilGlowMesh = new THREE.Mesh(glowGeo, glowMat);
    this.heaterCoilGlowMesh.rotation.y = Math.PI * 0.5;
    this.heaterCoilGlowMesh.position.set(0.034, 0, 0);
    this.heaterHousing.add(this.heaterCoilGlowMesh);

    // Rear ceramic terminal posts & braided silicone power cables
    const termGeo = new THREE.CylinderGeometry(0.004, 0.004, 0.014, 16);
    this.disposables.push(termGeo);
    [-0.014, 0.014].forEach((tz, idx) => {
      const term = new THREE.Mesh(termGeo, this.ceramicMat);
      term.position.set(-0.032, 0.018, tz);
      this.heaterHousing.add(term);

      const cap = new THREE.Mesh(boltGeo, idx === 0 ? this.copperMat : this.stainlessMat);
      cap.position.set(-0.032, 0.026, tz);
      this.heaterHousing.add(cap);
    });

    // Dynamic point light
    this.heaterLight = new THREE.PointLight(0xff3b30, 2.5, 0.32);
    this.heaterLight.position.set(0.038, 0, 0);
    this.heaterHousing.add(this.heaterLight);

    this.group.add(this.heaterHousing);

    // =========================================================================
    // 5. Thermoelectric Peltier Cold Sink Station (右端半导体制冷散热冷阱)
    // =========================================================================
    this.coolerHousing = new THREE.Group();
    const cx = this.rodEndX + 0.038;
    this.coolerHousing.position.set(cx, 0.076, 0);

    // Base saddle on dovetail rail
    const cSaddle = new THREE.Mesh(hSaddleGeo, this.satinAluminumMat);
    cSaddle.position.set(0, -0.026, 0);
    this.coolerHousing.add(cSaddle);

    const cClampKnob = new THREE.Mesh(hClampKnobGeo, this.brassMat);
    cClampKnob.rotation.x = Math.PI * 0.5;
    cClampKnob.position.set(0, -0.026, 0.048);
    this.coolerHousing.add(cClampKnob);

    // Aluminum cooling fin stack (10 vertical precision cooling fins, 10道精密垂直散热鳍片)
    const finStackGroup = new THREE.Group();
    for (let k = 0; k < 10; k++) {
      const finX = -0.025 + k * 0.0055;
      const vFinGeo = new THREE.BoxGeometry(0.0012, 0.068, 0.068);
      this.disposables.push(vFinGeo);
      const vFin = new THREE.Mesh(vFinGeo, this.satinAluminumMat);
      vFin.position.set(finX, 0, 0);
      finStackGroup.add(vFin);
    }
    this.coolerHousing.add(finStackGroup);

    // Outer axial cooling fan cowl (40mm 轴流静音散热风扇导风罩与叶片)
    const fanCowlGeo = new THREE.CylinderGeometry(0.028, 0.028, 0.012, 32);
    this.disposables.push(fanCowlGeo);
    const fanCowl = new THREE.Mesh(fanCowlGeo, this.darkAnodizedMat);
    fanCowl.rotation.z = Math.PI * 0.5;
    fanCowl.position.set(0.036, 0, 0);
    fanCowl.castShadow = true;
    this.coolerHousing.add(fanCowl);

    // Fan rotor hub & 7 pitched blades
    const fanHubGeo = new THREE.CylinderGeometry(0.010, 0.010, 0.014, 20);
    this.disposables.push(fanHubGeo);
    const fanHub = new THREE.Mesh(fanHubGeo, this.stainlessMat);
    fanHub.rotation.z = Math.PI * 0.5;
    fanHub.position.set(0.037, 0, 0);
    this.coolerHousing.add(fanHub);

    // Polished nickel-plated copper cold clamping chuck (镀镍冷端夹头)
    const cChuckGeo = new THREE.CylinderGeometry(0.022, 0.022, 0.024, 32);
    this.disposables.push(cChuckGeo);
    const cChuck = new THREE.Mesh(cChuckGeo, this.stainlessMat);
    cChuck.rotation.z = Math.PI * 0.5;
    cChuck.position.set(-0.038, 0, 0);
    this.coolerHousing.add(cChuck);

    // Cold LED Halo status ring
    const coldHaloGeo = new THREE.TorusGeometry(0.024, 0.0025, 16, 32);
    const coldHaloMat = new THREE.MeshStandardMaterial({
      color: 0x0284c7,
      emissive: 0x38bdf8,
      emissiveIntensity: 0.65,
    });
    this.disposables.push(coldHaloGeo, coldHaloMat);
    this.coolerLedHalo = new THREE.Mesh(coldHaloGeo, coldHaloMat);
    this.coolerLedHalo.rotation.y = Math.PI * 0.5;
    this.coolerLedHalo.position.set(-0.026, 0, 0);
    this.coolerHousing.add(this.coolerLedHalo);

    // Peltier ceramic module slab (陶瓷半导体制冷片基底)
    const peltierGeo = new THREE.BoxGeometry(0.004, 0.040, 0.040);
    this.disposables.push(peltierGeo);
    const peltier = new THREE.Mesh(peltierGeo, this.ceramicMat);
    peltier.position.set(-0.028, 0, 0);
    this.coolerHousing.add(peltier);

    // Dynamic cold light
    this.coolerLight = new THREE.PointLight(0x00f5ff, 2.0, 0.32);
    this.coolerLight.position.set(-0.038, 0, 0);
    this.coolerHousing.add(this.coolerLight);

    this.group.add(this.coolerHousing);

    // =========================================================================
    // 6. Specimen Rod (待测金属导热棒与动态 FLIR 伪彩色红外热成像渐变)
    // =========================================================================
    this.initThermalCanvas();

    const rodGeo = new THREE.CylinderGeometry(this.rodRadius, this.rodRadius, this.rodLength, 48);
    this.disposables.push(rodGeo);

    this.rodMaterial = new THREE.MeshStandardMaterial({
      map: this.thermalTexture,
      metalness: 0.75,
      roughness: 0.22,
    });
    this.disposables.push(this.rodMaterial);

    this.rodMesh = new THREE.Mesh(rodGeo, this.rodMaterial);
    this.rodMesh.rotation.z = Math.PI * 0.5; // Horizontal along X
    this.rodMesh.position.set(0, 0.076, 0);
    this.rodMesh.castShadow = true;
    this.group.add(this.rodMesh);

    // Composite rod junction ring (铜-钢复合棒中心冶金结合环)
    const collarGeo = new THREE.CylinderGeometry(this.rodRadius + 0.003, this.rodRadius + 0.003, 0.005, 32);
    this.disposables.push(collarGeo);
    this.junctionCollar = new THREE.Mesh(collarGeo, this.brassMat);
    this.junctionCollar.rotation.z = Math.PI * 0.5;
    this.junctionCollar.position.set(0, 0.076, 0);
    this.junctionCollar.visible = false;
    this.group.add(this.junctionCollar);

    // =========================================================================
    // 7. Precision Micrometer Pyrometer Carriage (激光对焦非接触红外测温滑鞍)
    // =========================================================================
    this.initDigitalDisplay();

    this.probeGroup = new THREE.Group();
    this.probeGroup.position.set(0, 0, 0);

    // Precision Dovetail Saddle Slider (包络燕尾导轨的精密铸造滑鞍)
    const saddleShape = new THREE.Shape();
    const sw = 0.038;
    const sh = 0.018;
    saddleShape.moveTo(-sw * 0.5, 0);
    saddleShape.lineTo(sw * 0.5, 0);
    saddleShape.lineTo(sw * 0.5, sh);
    saddleShape.lineTo(-sw * 0.5, sh);
    saddleShape.closePath();

    const saddleExtrudeSettings = { depth: 0.046, bevelEnabled: false };
    const saddleGeo = new THREE.ExtrudeGeometry(saddleShape, saddleExtrudeSettings);
    saddleGeo.center();
    this.disposables.push(saddleGeo);

    const saddleMesh = new THREE.Mesh(saddleGeo, this.satinAluminumMat);
    saddleMesh.position.set(0, 0.060, this.railZ);
    this.probeGroup.add(saddleMesh);

    // Large knurled brass locking clamp thumbscrew on top
    const lockKnobGeo = new THREE.CylinderGeometry(0.009, 0.009, 0.016, 24);
    this.disposables.push(lockKnobGeo);
    const lockKnob = new THREE.Mesh(lockKnobGeo, this.brassMat);
    lockKnob.position.set(0, 0.076, this.railZ);
    this.probeGroup.add(lockKnob);

    // Vertical stainless steel elevation post (不锈钢立柱)
    const postGeo = new THREE.CylinderGeometry(0.005, 0.005, 0.048, 20);
    this.disposables.push(postGeo);
    const post = new THREE.Mesh(postGeo, this.stainlessMat);
    post.position.set(0, 0.092, this.railZ);
    this.probeGroup.add(post);

    // Horizontal cantilever sensor arm (跨越导轨悬臂支架)
    const armGeo = new THREE.BoxGeometry(0.012, 0.010, this.railZ + 0.012);
    this.disposables.push(armGeo);
    const arm = new THREE.Mesh(armGeo, this.darkAnodizedMat);
    arm.position.set(0, 0.114, this.railZ * 0.5);
    this.probeGroup.add(arm);

    // Cylindrical Optical IR Sensor Barrel (红外光学传感探头镜头)
    const sensorBarrelGeo = new THREE.CylinderGeometry(0.007, 0.006, 0.026, 24);
    this.disposables.push(sensorBarrelGeo);
    this.probeMesh = new THREE.Mesh(sensorBarrelGeo, this.stainlessMat);
    this.probeMesh.position.set(0, 0.100, 0);
    this.probeMesh.castShadow = true;
    this.probeGroup.add(this.probeMesh);

    // Knurled focus adjustment collar on sensor
    const focusCollarGeo = new THREE.CylinderGeometry(0.008, 0.008, 0.006, 24);
    this.disposables.push(focusCollarGeo);
    const focusCollar = new THREE.Mesh(focusCollarGeo, this.brassMat);
    focusCollar.position.set(0, 0.106, 0);
    this.probeGroup.add(focusCollar);

    // Optical front lens element (AR紫膜光学透镜)
    const lensGeo = new THREE.CylinderGeometry(0.005, 0.005, 0.002, 24);
    this.disposables.push(lensGeo);
    const lens = new THREE.Mesh(lensGeo, this.opticalGlassMat);
    lens.position.set(0, 0.088, 0);
    this.probeGroup.add(lens);

    // Coaxial green pointer laser diode emitter (同轴绿色激光对焦指示点)
    const laserDotGeo = new THREE.CylinderGeometry(0.0015, 0.0015, 0.001, 16);
    const laserDotMat = new THREE.MeshBasicMaterial({ color: 0x10b981 });
    this.disposables.push(laserDotGeo, laserDotMat);
    this.laserDotMesh = new THREE.Mesh(laserDotGeo, laserDotMat);
    this.laserDotMesh.position.set(0, 0.076 + this.rodRadius + 0.0005, 0);
    this.probeGroup.add(this.laserDotMesh);

    // Digital OLED Instrument Display Unit (斜面工控级数显表头)
    const displayBoxGroup = new THREE.Group();
    displayBoxGroup.position.set(0, 0.096, this.railZ + 0.038);
    displayBoxGroup.rotation.x = -Math.PI * 0.22; // Angled 40 degrees upward for perfect viewing

    // Box chassis with chamfered bezel
    const boxGeo = new THREE.BoxGeometry(0.068, 0.036, 0.016);
    this.disposables.push(boxGeo);
    const box = new THREE.Mesh(boxGeo, this.darkAnodizedMat);
    displayBoxGroup.add(box);

    const bezelRimGeo = new THREE.BoxGeometry(0.070, 0.038, 0.002);
    this.disposables.push(bezelRimGeo);
    const bezelRim = new THREE.Mesh(bezelRimGeo, this.stainlessMat);
    bezelRim.position.z = 0.008;
    displayBoxGroup.add(bezelRim);

    // High-resolution screen surface (0.3mm proud of bezel face, zero Z-fighting, no screenGlass transmission overhead)
    const screenGeo = new THREE.PlaneGeometry(0.064, 0.032);
    const screenMat = new THREE.MeshBasicMaterial({
      map: this.displayTexture,
      toneMapped: false,
    });
    this.disposables.push(screenGeo, screenMat);
    const screenMesh = new THREE.Mesh(screenGeo, screenMat);
    screenMesh.position.z = 0.0093;
    displayBoxGroup.add(screenMesh);

    this.probeGroup.add(displayBoxGroup);

    // Spiral coiled sensor connection cable (黑色螺旋弹簧传感器引线)
    const coilPts: THREE.Vector3[] = [];
    const numCoilTurns = 6;
    for (let c = 0; c <= 40; c++) {
      const u = c / 40;
      const ang = u * Math.PI * 2 * numCoilTurns;
      const r = 0.0035;
      const zPos = THREE.MathUtils.lerp(0.010, this.railZ + 0.020, u);
      coilPts.push(new THREE.Vector3(Math.cos(ang) * r, 0.106 + Math.sin(ang) * r, zPos));
    }
    const coilCurve = new THREE.CatmullRomCurve3(coilPts);
    const wireGeo = new THREE.TubeGeometry(coilCurve, 32, 0.0012, 8, false);
    const wireMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.6 });
    this.disposables.push(wireGeo, wireMat);
    const wireMesh = new THREE.Mesh(wireGeo, wireMat);
    this.probeGroup.add(wireMesh);

    this.group.add(this.probeGroup);
  }

  /**
   * Updates the FLIR Infrared False-Color Texture mapped along the specimen rod
   */
  public updateThermalGradient(tempPoints: ArrayLike<number>, th: number, tc: number): void {
    const ctx = this.thermalCtx;
    const w = this.thermalCanvas.width;
    const h = this.thermalCanvas.height;

    const grad = ctx.createLinearGradient(0, 0, w, 0);

    const n = tempPoints.length;
    for (let i = 0; i < n; i++) {
      const pos = i / (n - 1);
      const t = tempPoints[i];
      // Normalize to [0, 1] relative to current range
      const norm = THREE.MathUtils.clamp((t - tc) / Math.max(1, th - tc), 0, 1);
      const color = this.temperatureToFLIR(norm);
      grad.addColorStop(pos, color);
    }

    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
    this.thermalTexture.needsUpdate = true;
  }

  /**
   * Classic scientific FLIR / Ironbow false color palette:
   * 0.0 (Cold): Deep Blue/Purple -> Cyan -> Green -> Warm Yellow -> Bright Red/White (1.0 Hot)
   */
  private temperatureToFLIR(norm: number): string {
    if (norm < 0.2) {
      const f = norm / 0.2;
      return `rgb(${Math.round(20 * (1 - f))}, ${Math.round(60 * f)}, ${Math.round(180 + 75 * f)})`;
    } else if (norm < 0.45) {
      const f = (norm - 0.2) / 0.25;
      return `rgb(0, ${Math.round(60 + 195 * f)}, ${Math.round(255 * (1 - f))})`;
    } else if (norm < 0.75) {
      const f = (norm - 0.45) / 0.3;
      return `rgb(${Math.round(255 * f)}, ${Math.round(255 * (1 - 0.2 * f))}, 0)`;
    } else {
      const f = (norm - 0.75) / 0.25;
      return `rgb(255, ${Math.round(204 * (1 - f) + 255 * f)}, ${Math.round(255 * f)})`;
    }
  }

  public setProbePosition(
    normX: number,
    tempK: number,
    gradKpm = -480,
    fluxWpm2 = 185000,
    force = false
  ): void {
    this.currentNormX = THREE.MathUtils.clamp(normX, 0.0, 1.0);
    // Interpolate world position along the rod
    const posX = this.rodStartX + this.currentNormX * this.rodLength;
    this.probeGroup.position.x = posX;
    this.renderDisplay(tempK, this.currentNormX, gradKpm, fluxWpm2, force);
  }

  public setMaterial(material: string): void {
    this.junctionCollar.visible = material === 'composite';
  }

  public setTemperatures(th: number, tc: number): void {
    const heaterGlowMat = this.heaterCoilGlowMesh.material as THREE.MeshStandardMaterial;
    heaterGlowMat.emissiveIntensity = THREE.MathUtils.lerp(0.4, 1.5, (th - 320) / 330);
    this.heaterLight.intensity = THREE.MathUtils.lerp(1.5, 3.8, (th - 320) / 330);

    const coolerHaloMat = this.coolerLedHalo.material as THREE.MeshStandardMaterial;
    coolerHaloMat.emissiveIntensity = THREE.MathUtils.lerp(0.8, 0.3, (tc - 250) / 80);
    this.coolerLight.intensity = THREE.MathUtils.lerp(2.4, 1.2, (tc - 250) / 80);
  }

  public dispose(): void {
    this.disposables.forEach((d) => d.dispose());
    this.disposables = [];
  }
}
